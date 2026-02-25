// electron/import_ocr/orchestrator.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own import/OCR session and job stores (main-process authority).
// - Register import/OCR IPC contracts and job orchestration.
// - Coordinate OCR lifecycle notifications for the main-process interaction gate.

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, dialog } = require('electron');
const Log = require('../log');
const settingsState = require('../settings');
const { validateRegistry } = require('./platform/profile_registry');
const { validateSidecarRuntime } = require('./platform/resolve_sidecar');
const { buildAvailableUiLanguages } = require('./language_policy');
const { runPhaseAExtraction } = require('./extract_phase_a');
const { runOcrPipeline } = require('./ocr_pipeline');
const { terminateWithEscalation } = require('./platform/process_control');

const log = Log.get('import-ocr-orchestrator');
log.debug('Import/OCR orchestrator starting...');

const MAX_REPEAT_COUNT = 9999;
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

const FILE_FILTERS = Object.freeze([
  { name: 'Supported files', extensions: ['txt', 'docx', 'pdf', 'png', 'jpg', 'jpeg', 'webp'] },
  { name: 'Text', extensions: ['txt'] },
  { name: 'Word', extensions: ['docx'] },
  { name: 'PDF', extensions: ['pdf'] },
  { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
]);

// =============================================================================
// State
// =============================================================================
let resolveWindows = () => ({});
let textStateApi = null;
let idSeq = 0;
let profileRegistryStatus = {
  ok: true,
  errors: [],
  profileCount: 0,
};
let sidecarRuntimeStatus = {
  ok: false,
  code: 'OCR_RUNTIME_NOT_VALIDATED',
  message: 'OCR sidecar runtime not validated yet.',
};
let guardIpcByInteractionGate = null;
let validateOcrStartPreconditionsFn = null;
let onOcrExecutionStateChange = null;

const sessions = new Map();
const jobs = new Map();
let activeJobId = '';

// =============================================================================
// Helpers
// =============================================================================
function makeId(prefix) {
  idSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${idSeq.toString(36)}`;
}

function fail(code, message, extra = {}) {
  return Object.assign({ ok: false, code, message }, extra);
}

function isAliveWindow(win) {
  return !!(win && !win.isDestroyed());
}

function resolveMainWindow() {
  const windows = resolveWindows() || {};
  return isAliveWindow(windows.mainWin) ? windows.mainWin : null;
}

function safeSend(win, channel, payload) {
  if (!isAliveWindow(win)) return;
  try {
    win.webContents.send(channel, payload);
  } catch (err) {
    log.warnOnce(
      `import_ocr_orchestrator.safeSend.${channel}`,
      `webContents.send('${channel}') failed (ignored):`,
      err
    );
  }
}

function isMainWindowSender(event) {
  try {
    const mainWin = resolveMainWindow();
    const senderWin = event && event.sender
      ? BrowserWindow.fromWebContents(event.sender)
      : null;
    return !!(mainWin && senderWin && senderWin === mainWin);
  } catch {
    return false;
  }
}

function emitImportProgress(job, partial = {}) {
  const payload = Object.assign({
    jobId: job.jobId,
    kind: 'progress',
    stage: job.stage || 'queued',
    pageDone: 0,
    pageTotal: 0,
    heartbeatTs: Date.now(),
  }, partial || {});
  safeSend(resolveMainWindow(), 'import-progress', payload);
}

function startHeartbeat(job, progressRef = null) {
  const timer = setInterval(() => {
    const pageDone = progressRef && Number.isFinite(progressRef.pageDone)
      ? Math.max(0, Math.floor(progressRef.pageDone))
      : 0;
    const pageTotal = progressRef && Number.isFinite(progressRef.pageTotal)
      ? Math.max(0, Math.floor(progressRef.pageTotal))
      : 0;
    emitImportProgress(job, {
      kind: 'tick',
      stage: job.stage || 'running',
      pageDone,
      pageTotal,
      heartbeatTs: Date.now(),
    });
  }, 1000);
  if (typeof timer.unref === 'function') timer.unref();
  return timer;
}

function emitImportFinished(job, result) {
  const payload = {
    jobId: job.jobId,
    ok: !!(result && result.ok),
    code: result && result.code ? String(result.code) : undefined,
    summary: (result && result.summary && typeof result.summary === 'object')
      ? result.summary
      : {},
  };
  safeSend(resolveMainWindow(), 'import-finished', payload);
}

function maybeBlockedByInteractionGate(event, channel, opts = {}) {
  if (typeof guardIpcByInteractionGate !== 'function') return null;
  return guardIpcByInteractionGate(event, Object.assign({ channel }, opts));
}

function emitOcrExecutionStateChange(running, reason = '') {
  if (typeof onOcrExecutionStateChange !== 'function') return;
  try {
    onOcrExecutionStateChange({
      running: !!running,
      reason: running ? String(reason || 'OCR_RUNNING') : '',
    });
  } catch (err) {
    log.error('onOcrExecutionStateChange callback failed:', err);
  }
}

function normalizePath(rawPath) {
  try {
    return path.resolve(String(rawPath || ''));
  } catch {
    return '';
  }
}

function normalizeExistingDirPath(rawPath) {
  const normalized = normalizePath(rawPath);
  if (!normalized) return '';
  try {
    const st = fs.statSync(normalized);
    if (!st.isDirectory()) return '';
    return normalized;
  } catch {
    return '';
  }
}

function getOsPathSafely(key) {
  try {
    if (!app || typeof app.getPath !== 'function') return '';
    return normalizeExistingDirPath(app.getPath(key));
  } catch {
    return '';
  }
}

function resolveImportDialogDefaultPath() {
  try {
    const settings = settingsState.getSettings();
    const stored = settings && typeof settings.last_import_dir === 'string'
      ? settings.last_import_dir.trim()
      : '';
    const validStored = normalizeExistingDirPath(stored);
    if (validStored) return validStored;
  } catch (err) {
    log.warnOnce(
      'import_ocr_orchestrator.resolveImportDialogDefaultPath.settingsRead',
      'Unable to read settings for import default path (using OS fallback).',
      err
    );
  }

  const documentsDir = getOsPathSafely('documents');
  if (documentsDir) return documentsDir;
  return getOsPathSafely('home');
}

function persistLastImportDir(filePath) {
  const dirPath = normalizeExistingDirPath(path.dirname(String(filePath || '')));
  if (!dirPath) return;

  try {
    const settings = settingsState.getSettings();
    if (!settings || typeof settings !== 'object') return;
    if (settings.last_import_dir === dirPath) return;
    settings.last_import_dir = dirPath;
    settingsState.saveSettings(settings);
  } catch (err) {
    log.warnOnce(
      'import_ocr_orchestrator.persistLastImportDir',
      'Failed to persist last import directory (ignored).',
      err
    );
  }
}

function listInstalledTessdataLanguages(tessdataPath) {
  const dirPath = String(tessdataPath || '').trim();
  if (!dirPath) return [];
  try {
    const st = fs.statSync(dirPath);
    if (!st.isDirectory()) return [];
  } catch {
    return [];
  }
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const codes = [];
    entries.forEach((entry) => {
      if (!entry || !entry.isFile()) return;
      const name = String(entry.name || '').trim().toLowerCase();
      if (!name.endsWith('.traineddata')) return;
      const code = name.slice(0, -'.traineddata'.length).trim();
      if (!code) return;
      codes.push(code);
    });
    return Array.from(new Set(codes));
  } catch {
    return [];
  }
}

function getFileKindByExtension(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.txt') return 'txt';
  if (ext === '.docx') return 'docx';
  if (ext === '.pdf') return 'pdf';
  if (IMAGE_EXTS.has(ext)) return 'image';
  return '';
}

function routeForKind(kind) {
  if (kind === 'txt' || kind === 'docx') return 'phase_a_extract';
  if (kind === 'pdf') return 'phase_a_pdf_probe';
  if (kind === 'image') return 'ocr_image';
  return '';
}

function readFileHeader(filePath, byteCount = 16) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.alloc(byteCount);
    const bytesRead = fs.readSync(fd, header, 0, byteCount, 0);
    return header.slice(0, bytesRead);
  } finally {
    try {
      fs.closeSync(fd);
    } catch {
      // no-op
    }
  }
}

function looksLikePdf(header) {
  return header.length >= 5 && header.subarray(0, 5).toString('ascii') === '%PDF-';
}

function looksLikeDocxZip(header) {
  if (header.length < 4) return false;
  const b0 = header[0];
  const b1 = header[1];
  const b2 = header[2];
  const b3 = header[3];
  return b0 === 0x50 && b1 === 0x4B && (
    (b2 === 0x03 && b3 === 0x04) ||
    (b2 === 0x05 && b3 === 0x06) ||
    (b2 === 0x07 && b3 === 0x08)
  );
}

function looksLikePng(header) {
  if (header.length < 8) return false;
  const pngSig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
  return pngSig.every((value, idx) => header[idx] === value);
}

function looksLikeJpeg(header) {
  return header.length >= 2 && header[0] === 0xFF && header[1] === 0xD8;
}

function looksLikeWebp(header) {
  if (header.length < 12) return false;
  return (
    header.subarray(0, 4).toString('ascii') === 'RIFF' &&
    header.subarray(8, 12).toString('ascii') === 'WEBP'
  );
}

function isSignatureCompatible(kind, header) {
  if (!header || !header.length) return true;
  if (kind === 'txt') return true;
  if (kind === 'docx') return looksLikeDocxZip(header);
  if (kind === 'pdf') return looksLikePdf(header);
  if (kind === 'image') {
    return looksLikePng(header) || looksLikeJpeg(header) || looksLikeWebp(header);
  }
  return false;
}

function ensureMainSender(event, channel) {
  if (isMainWindowSender(event)) return null;
  log.warnOnce(
    `import_ocr_orchestrator.${channel}.unauthorized`,
    `${channel} unauthorized (ignored).`
  );
  return fail('UNAUTHORIZED', 'unauthorized');
}

function ensureProfileRegistryReady() {
  profileRegistryStatus = validateRegistry();
  if (!profileRegistryStatus.ok) {
    log.error('OCR platform profile registry invalid:', profileRegistryStatus.errors);
  }
  return profileRegistryStatus;
}

function refreshSidecarRuntimeStatus() {
  sidecarRuntimeStatus = validateSidecarRuntime();
  return sidecarRuntimeStatus;
}

function ensureOcrRuntimeReady() {
  const runtime = refreshSidecarRuntimeStatus();
  if (!runtime.ok) {
    return fail(
      runtime.code || 'OCR_BINARY_MISSING',
      runtime.message || 'OCR sidecar runtime is unavailable.',
      runtime
    );
  }
  return {
    ok: true,
    profileKey: runtime.profileKey,
    source: runtime.source,
    sidecarBaseDir: runtime.sidecarBaseDir,
    tessdataPath: runtime.tessdataPath,
    requiredLanguages: Array.isArray(runtime.requiredLanguages) ? runtime.requiredLanguages : [],
  };
}

function getOcrLanguageCapabilities() {
  const registryReady = ensureProfileRegistryReady();
  if (!registryReady.ok) {
    return fail(
      'OCR_PLATFORM_PROFILE_INVALID',
      'OCR platform profile registry is invalid.',
      { errors: registryReady.errors.slice(0, 10) }
    );
  }

  const runtimeReady = ensureOcrRuntimeReady();
  if (!runtimeReady.ok) return runtimeReady;

  const installedTesseractLanguages = listInstalledTessdataLanguages(runtimeReady.tessdataPath);
  const availableUiLanguages = buildAvailableUiLanguages(installedTesseractLanguages);
  if (!availableUiLanguages.length) {
    return fail('OCR_LANG_UNAVAILABLE', 'No supported OCR language data is installed.', {
      profileKey: runtimeReady.profileKey,
      installedTesseractLanguages,
    });
  }

  return {
    ok: true,
    profileKey: runtimeReady.profileKey,
    source: runtimeReady.source,
    sidecarBaseDir: runtimeReady.sidecarBaseDir,
    tessdataPath: runtimeReady.tessdataPath,
    installedTesseractLanguages,
    availableUiLanguages,
  };
}

function validateSelectedFile(filePath) {
  const normalized = normalizePath(filePath);
  if (!normalized) {
    return fail('IMPORT_INVALID_PATH', 'Selected file path is invalid.');
  }

  let stats = null;
  try {
    stats = fs.statSync(normalized);
  } catch (err) {
    return fail('IMPORT_READ_FAILED', 'Unable to access selected file.', { error: String(err) });
  }
  if (!stats.isFile()) {
    return fail('IMPORT_INVALID_PATH', 'Selected path is not a file.');
  }

  try {
    fs.accessSync(normalized, fs.constants.R_OK);
  } catch (err) {
    return fail('IMPORT_READ_FAILED', 'Selected file is not readable.', { error: String(err) });
  }

  const kind = getFileKindByExtension(normalized);
  if (!kind) {
    return fail('IMPORT_UNSUPPORTED_FORMAT', 'Unsupported file extension.');
  }

  let header = Buffer.alloc(0);
  try {
    header = readFileHeader(normalized, 16);
  } catch (err) {
    return fail('IMPORT_READ_FAILED', 'Unable to read selected file header.', { error: String(err) });
  }
  if (!isSignatureCompatible(kind, header)) {
    return fail('IMPORT_SIGNATURE_MISMATCH', 'Selected file content does not match its extension.');
  }

  return {
    ok: true,
    filePath: normalized,
    filename: path.basename(normalized),
    kind,
    route: routeForKind(kind),
  };
}

function createSession({ filePath, filename, kind, route }) {
  const sessionId = makeId('import_session');
  const session = {
    sessionId,
    filePath,
    filename,
    kind,
    route,
    status: 'selected',
    createdAt: Date.now(),
    extractedText: '',
    summary: null,
  };
  sessions.set(sessionId, session);
  return session;
}

function createJob(session, options = {}) {
  const jobId = makeId('import_job');
  const forcePdfOcr = !!(
    session
    && session.kind === 'pdf'
    && options
    && options.forcePdfOcr === true
  );
  const resolvedRoute = forcePdfOcr ? 'ocr_pdf_scanned' : String(session.route || '');
  const isOcrRoute = resolvedRoute.startsWith('ocr_');
  const job = {
    jobId,
    sessionId: session.sessionId,
    kind: isOcrRoute ? 'ocr' : 'extract',
    route: resolvedRoute,
    status: 'queued',
    stage: 'queued',
    createdAt: Date.now(),
    startedAt: 0,
    finishedAt: 0,
    cancelRequested: false,
    activeChild: null,
    options: options || {},
  };
  jobs.set(jobId, job);
  return job;
}

function buildSummary(session, elapsedMs, extractResult = {}) {
  const baseSummary = extractResult.summary && typeof extractResult.summary === 'object'
    ? extractResult.summary
    : {};

  const extractedChars = session.extractedText ? session.extractedText.length : 0;
  return {
    kind: session.kind,
    filename: session.filename,
    pagesProcessed: Number.isFinite(baseSummary.pagesProcessed) ? baseSummary.pagesProcessed : 0,
    pagesTotal: Number.isFinite(baseSummary.pagesTotal) ? baseSummary.pagesTotal : 0,
    extractedChars,
    elapsedMs: Math.max(0, Math.floor(Number(elapsedMs) || 0)),
    warnings: Array.isArray(baseSummary.warnings) ? baseSummary.warnings : [],
  };
}

function normalizeApplyMode(raw) {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (value === 'append') return 'append';
  return 'overwrite';
}

function clampRepeatCount(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  return Math.min(MAX_REPEAT_COUNT, Math.max(1, Math.floor(n)));
}

function buildRepeatedAppendText(current, clip, repeatCount) {
  const currentText = String(current || '');
  const clipText = String(clip || '');
  const parts = [currentText];
  const clipLength = clipText.length;
  const clipEndsWithNewline = clipLength > 0 && (clipText.endsWith('\n') || clipText.endsWith('\r'));
  let hasContent = currentText.length > 0;
  let endsWithNewline = hasContent && (currentText.endsWith('\n') || currentText.endsWith('\r'));

  for (let i = 0; i < repeatCount; i += 1) {
    if (hasContent) {
      parts.push(endsWithNewline ? '\n' : '\n\n');
      endsWithNewline = true;
    }
    if (clipLength > 0) {
      parts.push(clipText);
      hasContent = true;
      endsWithNewline = clipEndsWithNewline;
    }
  }
  return parts.join('');
}

function applySessionText(session, { mode, repeatCount }) {
  if (!textStateApi || typeof textStateApi.applyCurrentText !== 'function' || typeof textStateApi.getCurrentText !== 'function') {
    return fail('IMPORT_APPLY_UNAVAILABLE', 'Current-text apply bridge is unavailable.');
  }

  const extracted = String(session.extractedText || '');
  const applyMode = normalizeApplyMode(mode);
  const repeats = clampRepeatCount(repeatCount);

  let nextText = '';
  let action = 'overwrite';

  if (applyMode === 'overwrite') {
    nextText = extracted;
    if (repeats > 1) {
      nextText = buildRepeatedAppendText(nextText, extracted, repeats - 1);
    }
    action = 'overwrite';
  } else {
    const current = String(textStateApi.getCurrentText() || '');
    nextText = buildRepeatedAppendText(current, extracted, repeats);
    action = 'append_newline';
  }

  const res = textStateApi.applyCurrentText(nextText, {
    source: 'main-window',
    action,
  });

  return {
    ok: !!(res && res.ok),
    truncated: !!(res && res.truncated),
    length: res && typeof res.length === 'number' ? res.length : nextText.length,
  };
}

async function runJob(job) {
  const session = sessions.get(job.sessionId);
  if (!session) {
    return fail('IMPORT_SESSION_NOT_FOUND', 'Session not found.');
  }

  const startedAt = Date.now();
  const isOcrJob = job.kind === 'ocr';
  job.status = 'running';
  job.stage = isOcrJob ? 'queued' : 'extracting';
  job.startedAt = startedAt;
  session.status = 'running';
  const progressState = {
    pageDone: 0,
    pageTotal: 0,
  };
  emitImportProgress(job, { stage: job.stage, pageDone: 0, pageTotal: 0 });
  let heartbeatTimer = null;

  try {
    let extractRes = null;
    if (isOcrJob) {
      emitOcrExecutionStateChange(true, 'OCR_RUNNING');
      activeJobId = job.jobId;
      heartbeatTimer = startHeartbeat(job, progressState);
      extractRes = await runOcrPipeline(session, Object.assign({}, job.options || {}, {
        onChildProcess: (child) => {
          job.activeChild = child || null;
        },
        isCancelRequested: () => !!job.cancelRequested,
        onProgress: (progress) => {
          const p = progress && typeof progress === 'object' ? progress : {};
          if (typeof p.stage === 'string' && p.stage.trim()) {
            job.stage = p.stage.trim().toLowerCase();
          }
          if (Number.isFinite(Number(p.pageDone))) {
            progressState.pageDone = Math.max(0, Math.floor(Number(p.pageDone)));
          }
          if (Number.isFinite(Number(p.pageTotal))) {
            progressState.pageTotal = Math.max(0, Math.floor(Number(p.pageTotal)));
          }
          emitImportProgress(job, {
            stage: job.stage || 'running',
            pageDone: progressState.pageDone,
            pageTotal: progressState.pageTotal,
          });
        },
      }));
    } else {
      extractRes = await runPhaseAExtraction(session, job.options || {});
    }

    if (!extractRes || extractRes.ok !== true) {
      const errRes = extractRes || fail('IMPORT_EXEC_FAILED', 'Import execution failed.');
      const isCanceled = String(errRes.code || '') === 'OCR_CANCELED';
      const errSummary = (errRes.summary && typeof errRes.summary === 'object')
        ? errRes.summary
        : {};
      session.status = isCanceled ? 'canceled' : 'failed';
      job.status = isCanceled ? 'canceled' : 'failed';
      job.stage = isCanceled ? 'canceled' : 'failed';
      job.finishedAt = Date.now();

      emitImportFinished(job, {
        ok: false,
        code: errRes.code || (isCanceled ? 'OCR_CANCELED' : 'IMPORT_EXEC_FAILED'),
        summary: {
          kind: session.kind,
          filename: session.filename,
          pagesProcessed: Number.isFinite(errSummary.pagesProcessed)
            ? errSummary.pagesProcessed
            : (isOcrJob ? progressState.pageDone : 0),
          pagesTotal: Number.isFinite(errSummary.pagesTotal)
            ? errSummary.pagesTotal
            : (isOcrJob ? progressState.pageTotal : 0),
          extractedChars: Number.isFinite(errSummary.extractedChars) ? errSummary.extractedChars : 0,
          elapsedMs: Math.max(0, job.finishedAt - startedAt),
          warnings: Array.isArray(errSummary.warnings) ? errSummary.warnings : [],
        },
      });
      return errRes;
    }

    if (session.route === 'phase_a_pdf_probe' && !String(extractRes.text || '').trim()) {
      session.status = 'failed';
      job.status = 'failed';
      job.stage = 'failed';
      job.finishedAt = Date.now();
      const noTextRes = fail(
        'IMPORT_PDF_NO_TEXT_LAYER',
        'PDF has no selectable text; OCR path is required.',
        {
          summary: {
            kind: session.kind,
            filename: session.filename,
            pagesProcessed: Number.isFinite(extractRes.summary && extractRes.summary.pagesProcessed)
              ? extractRes.summary.pagesProcessed
              : 0,
            pagesTotal: Number.isFinite(extractRes.summary && extractRes.summary.pagesTotal)
              ? extractRes.summary.pagesTotal
              : 0,
            extractedChars: 0,
            elapsedMs: Math.max(0, job.finishedAt - startedAt),
            warnings: [],
          },
        }
      );
      emitImportFinished(job, {
        ok: false,
        code: noTextRes.code,
        summary: noTextRes.summary,
      });
      return noTextRes;
    }

    session.extractedText = String(extractRes.text || '');
    session.summary = buildSummary(session, Date.now() - startedAt, extractRes);
    session.status = 'completed';
    job.status = 'completed';
    job.stage = 'completed';
    job.finishedAt = Date.now();
    emitImportProgress(job, {
      stage: 'completed',
      pageDone: Number.isFinite(session.summary && session.summary.pagesProcessed)
        ? session.summary.pagesProcessed
        : (isOcrJob ? 1 : 0),
      pageTotal: Number.isFinite(session.summary && session.summary.pagesTotal)
        ? session.summary.pagesTotal
        : (isOcrJob ? 1 : 0),
    });
    emitImportFinished(job, { ok: true, summary: session.summary });
    return { ok: true };
  } catch (err) {
    const code = 'IMPORT_EXEC_FAILED';
    session.status = 'failed';
    job.status = 'failed';
    job.stage = 'failed';
    job.finishedAt = Date.now();
    log.error('Import/OCR job failed:', err);
    emitImportFinished(job, {
      ok: false,
      code,
      summary: {
        kind: session.kind,
        filename: session.filename,
        extractedChars: 0,
        elapsedMs: Math.max(0, job.finishedAt - startedAt),
      },
    });
    return fail(code, 'Import execution failed.', { error: String(err) });
  } finally {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    job.activeChild = null;
    if (activeJobId === job.jobId) {
      activeJobId = '';
    }
    if (isOcrJob) {
      emitOcrExecutionStateChange(false, '');
    }
  }
}

// =============================================================================
// IPC registration
// =============================================================================
function registerIpc(ipcMain, {
  getWindows,
  textState,
  guardIpcByInteractionGate: interactionGuard,
  validateOcrStartPreconditions,
  onOcrExecutionStateChange: onOcrExecutionStateChangeCb,
} = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[import_ocr/orchestrator] registerIpc requires ipcMain');
  }

  if (typeof getWindows === 'function') {
    resolveWindows = getWindows;
  }
  if (textState && typeof textState === 'object') {
    textStateApi = textState;
  }
  guardIpcByInteractionGate = typeof interactionGuard === 'function'
    ? interactionGuard
    : null;
  validateOcrStartPreconditionsFn = typeof validateOcrStartPreconditions === 'function'
    ? validateOcrStartPreconditions
    : null;
  onOcrExecutionStateChange = typeof onOcrExecutionStateChangeCb === 'function'
    ? onOcrExecutionStateChangeCb
    : null;

  ensureProfileRegistryReady();
  const runtimeSnapshot = refreshSidecarRuntimeStatus();
  if (runtimeSnapshot.ok) {
    log.info(
      `OCR sidecar runtime ready (${runtimeSnapshot.profileKey}, ${runtimeSnapshot.source}):`,
      runtimeSnapshot.sidecarBaseDir
    );
  } else {
    log.warn(
      'OCR sidecar runtime unavailable at startup:',
      runtimeSnapshot.code || 'OCR_BINARY_MISSING',
      runtimeSnapshot.message || ''
    );
  }

  ipcMain.handle('import-get-ocr-languages', async (event) => {
    const unauthorized = ensureMainSender(event, 'import-get-ocr-languages');
    if (unauthorized) return unauthorized;

    const blocked = maybeBlockedByInteractionGate(event, 'import-get-ocr-languages', { mainWindowOnly: true });
    if (blocked) return blocked;

    const caps = getOcrLanguageCapabilities();
    if (!caps.ok) return caps;
    return {
      ok: true,
      availableUiLanguages: caps.availableUiLanguages,
      installedTesseractLanguages: caps.installedTesseractLanguages,
      profileKey: caps.profileKey,
    };
  });

  ipcMain.handle('import-select-file', async (event) => {
    const unauthorized = ensureMainSender(event, 'import-select-file');
    if (unauthorized) return unauthorized;

    const blocked = maybeBlockedByInteractionGate(event, 'import-select-file', { mainWindowOnly: true });
    if (blocked) return blocked;

    const owner = resolveMainWindow();
    const defaultPath = resolveImportDialogDefaultPath();
    const picker = await dialog.showOpenDialog(owner, {
      filters: FILE_FILTERS,
      properties: ['openFile'],
      defaultPath: defaultPath || undefined,
    });
    if (!picker || picker.canceled || !picker.filePaths || !picker.filePaths.length) {
      return fail('CANCELLED', 'File selection canceled.');
    }

    const selected = validateSelectedFile(picker.filePaths[0]);
    if (!selected.ok) return selected;
    persistLastImportDir(selected.filePath);

    if (selected.kind === 'image') {
      const registryReady = ensureProfileRegistryReady();
      if (!registryReady.ok) {
        return fail(
          'OCR_PLATFORM_PROFILE_INVALID',
          'OCR platform profile registry is invalid.',
          { errors: registryReady.errors.slice(0, 10) }
        );
      }
      const runtimeReady = ensureOcrRuntimeReady();
      if (!runtimeReady.ok) return runtimeReady;
    }

    const session = createSession(selected);
    return {
      ok: true,
      sessionId: session.sessionId,
      kind: session.kind,
      filename: session.filename,
      route: session.route,
      pageCountHint: null,
    };
  });

  ipcMain.handle('import-run', async (event, payload) => {
    const unauthorized = ensureMainSender(event, 'import-run');
    if (unauthorized) return unauthorized;

    const blocked = maybeBlockedByInteractionGate(event, 'import-run', { mainWindowOnly: true });
    if (blocked) return blocked;

    const p = payload && typeof payload === 'object' ? payload : {};
    const sessionId = typeof p.sessionId === 'string' ? p.sessionId.trim() : '';
    if (!sessionId) {
      return fail('IMPORT_INVALID_PAYLOAD', 'Missing sessionId.');
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return fail('IMPORT_SESSION_NOT_FOUND', 'Session not found.');
    }

    if (session.status === 'running') {
      return fail('IMPORT_BUSY', 'Session already running.');
    }

    const runOptions = (p.options && typeof p.options === 'object') ? p.options : {};
    const wantsOcr = String(session.route || '').startsWith('ocr_')
      || (session.kind === 'pdf' && runOptions.forcePdfOcr === true);
    if (wantsOcr) {
      if (typeof validateOcrStartPreconditionsFn === 'function') {
        const preconditions = validateOcrStartPreconditionsFn();
        const preconditionsOk = !!(preconditions && preconditions.ok === true);
        if (!preconditionsOk) {
          const reasons = Array.isArray(preconditions && preconditions.reasons)
            ? preconditions.reasons.map((item) => String(item || '').trim()).filter(Boolean)
            : [];
          const openSecondaryWindows = Array.isArray(preconditions && preconditions.openSecondaryWindows)
            ? preconditions.openSecondaryWindows.map((item) => String(item || '').trim()).filter(Boolean)
            : [];
          return fail(
            'OCR_PRECONDITION_FAILED',
            'Cannot start OCR while secondary windows are open or stopwatch is running.',
            {
              reasons,
              openSecondaryWindows,
              stopwatchRunning: !!(preconditions && preconditions.stopwatchRunning),
            }
          );
        }
      }
      const registryReady = ensureProfileRegistryReady();
      if (!registryReady.ok) {
        return fail(
          'OCR_PLATFORM_PROFILE_INVALID',
          'OCR platform profile registry is invalid.',
          { errors: registryReady.errors.slice(0, 10) }
        );
      }
      const runtimeReady = ensureOcrRuntimeReady();
      if (!runtimeReady.ok) return runtimeReady;
    }

    const job = createJob(session, runOptions);
    runJob(job).catch((err) => {
      log.error('Unhandled import job error:', err);
    });

    return {
      ok: true,
      jobId: job.jobId,
    };
  });

  ipcMain.handle('import-cancel', async (event) => {
    const unauthorized = ensureMainSender(event, 'import-cancel');
    if (unauthorized) return unauthorized;

    if (!activeJobId || !jobs.has(activeJobId)) {
      return fail('OCR_NOT_RUNNING', 'No active OCR job.');
    }

    const job = jobs.get(activeJobId);
    if (!job || job.kind !== 'ocr') {
      return fail('OCR_NOT_RUNNING', 'No active OCR job.');
    }

    job.cancelRequested = true;

    const child = job.activeChild;
    if (!child) {
      return { ok: true, code: 'OCR_CANCEL_PENDING' };
    }

    const cancelRes = await terminateWithEscalation(child, {
      gracefulWaitMs: 2000,
      forceWaitMs: 5000,
    });
    if (!cancelRes.ok) {
      return fail(
        cancelRes.code || 'OCR_CANCEL_KILL_TIMEOUT',
        cancelRes.message || 'Unable to cancel OCR process.',
        cancelRes
      );
    }

    return { ok: true, code: 'OCR_CANCELED' };
  });

  ipcMain.handle('import-apply', async (event, payload) => {
    const unauthorized = ensureMainSender(event, 'import-apply');
    if (unauthorized) return unauthorized;

    const blocked = maybeBlockedByInteractionGate(event, 'import-apply', { mainWindowOnly: true });
    if (blocked) return blocked;

    const p = payload && typeof payload === 'object' ? payload : {};
    const sessionId = typeof p.sessionId === 'string' ? p.sessionId.trim() : '';
    if (!sessionId) {
      return fail('IMPORT_INVALID_PAYLOAD', 'Missing sessionId.');
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return fail('IMPORT_SESSION_NOT_FOUND', 'Session not found.');
    }
    if (session.status !== 'completed') {
      return fail('IMPORT_NOT_READY_TO_APPLY', 'Session is not ready to apply.');
    }

    const applyRes = applySessionText(session, {
      mode: p.mode,
      repeatCount: p.repeatCount,
    });
    if (!applyRes.ok) return applyRes;

    sessions.delete(sessionId);
    return {
      ok: true,
      truncated: !!applyRes.truncated,
      length: applyRes.length,
    };
  });

  ipcMain.handle('import-discard', async (event, payload) => {
    const unauthorized = ensureMainSender(event, 'import-discard');
    if (unauthorized) return unauthorized;

    const blocked = maybeBlockedByInteractionGate(event, 'import-discard', { mainWindowOnly: true });
    if (blocked) return blocked;

    const p = payload && typeof payload === 'object' ? payload : {};
    const sessionId = typeof p.sessionId === 'string' ? p.sessionId.trim() : '';
    if (!sessionId) {
      return fail('IMPORT_INVALID_PAYLOAD', 'Missing sessionId.');
    }
    if (!sessions.has(sessionId)) {
      return fail('IMPORT_SESSION_NOT_FOUND', 'Session not found.');
    }

    sessions.delete(sessionId);
    return { ok: true };
  });
}

module.exports = {
  registerIpc,
};
