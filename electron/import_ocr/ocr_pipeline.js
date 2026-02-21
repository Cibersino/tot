// electron/import_ocr/ocr_pipeline.js
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { resolveSidecarPaths } = require('./platform/resolve_sidecar');
const {
  mapUiLanguageToTesseract,
  getRequiredTesseractCodes,
} = require('./language_policy');
const {
  terminateWithEscalation,
} = require('./platform/process_control');

function fail(code, message, extra = {}) {
  return Object.assign({ ok: false, code, message }, extra);
}

function clampInt(raw, min, max, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function ensurePathExists(targetPath) {
  try {
    return fs.existsSync(targetPath);
  } catch {
    return false;
  }
}

function resolveAndValidateOcrLanguage(rawLang, tessdataPath) {
  const requested = String(rawLang || '').trim();
  const tesseractLang = mapUiLanguageToTesseract(requested);
  if (!tesseractLang) {
    return fail('OCR_LANG_UNSUPPORTED', 'Requested OCR language is not supported.', {
      language: requested,
    });
  }

  const requiredCodes = getRequiredTesseractCodes(tesseractLang);
  const missingCodes = requiredCodes.filter((code) => {
    const trainedDataPath = path.join(tessdataPath, `${code}.traineddata`);
    return !ensurePathExists(trainedDataPath);
  });
  if (missingCodes.length > 0) {
    return fail('OCR_LANG_UNAVAILABLE', 'Requested OCR language data is not installed.', {
      language: requested,
      tesseractLang,
      missingCodes,
    });
  }

  return {
    ok: true,
    tesseractLang,
  };
}

function readProcessStreams(child, maxStdoutChars = 2_000_000, maxStderrChars = 200_000) {
  return new Promise((resolve) => {
    let stdoutText = '';
    let stderrText = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;

    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        if (stdoutTruncated) return;
        const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
        const remaining = maxStdoutChars - stdoutText.length;
        if (remaining <= 0) {
          stdoutTruncated = true;
          return;
        }
        if (text.length > remaining) {
          stdoutText += text.slice(0, remaining);
          stdoutTruncated = true;
          return;
        }
        stdoutText += text;
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        if (stderrTruncated) return;
        const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
        const remaining = maxStderrChars - stderrText.length;
        if (remaining <= 0) {
          stderrTruncated = true;
          return;
        }
        if (text.length > remaining) {
          stderrText += text.slice(0, remaining);
          stderrTruncated = true;
          return;
        }
        stderrText += text;
      });
    }

    child.once('close', (code, signal) => {
      resolve({
        code: Number.isFinite(code) ? code : null,
        signal: signal || null,
        stdout: stdoutText,
        stderr: stderrText,
        stdoutTruncated,
        stderrTruncated,
      });
    });
  });
}

function safeInvoke(cb, ...args) {
  if (typeof cb !== 'function') return;
  try {
    cb(...args);
  } catch {
    // no-op
  }
}

function normalizeMultiline(text) {
  return String(text || '').replace(/\r\n?/g, '\n').trim();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function removeDirIfExists(dirPath) {
  if (!dirPath) return;
  if (!ensurePathExists(dirPath)) return;
  try {
    if (typeof fs.rmSync === 'function') {
      fs.rmSync(dirPath, { recursive: true, force: true });
      return;
    }
    fs.rmdirSync(dirPath, { recursive: true });
  } catch {
    // no-op
  }
}

function removeFileIfExists(filePath) {
  if (!filePath) return;
  try {
    if (!ensurePathExists(filePath)) return;
    fs.unlinkSync(filePath);
  } catch {
    // no-op
  }
}

function createJobTempDir(prefix = 'tot-ocr-') {
  const baseDir = path.join(os.tmpdir(), prefix);
  ensureDir(baseDir);
  return fs.mkdtempSync(path.join(baseDir, 'job-'));
}

function toPdfJsFactoryPath(dirPath) {
  const raw = String(dirPath || '').trim();
  if (!raw) return '';
  const normalized = raw.replace(/\\/g, '/');
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function resolvePdfJsStandardFontsDir() {
  try {
    const packageJsonPath = require.resolve('pdfjs-dist/package.json');
    const packageDir = path.dirname(packageJsonPath);
    const fontsDir = path.join(packageDir, 'standard_fonts');
    if (fs.existsSync(fontsDir)) return toPdfJsFactoryPath(fontsDir);
  } catch {
    // no-op
  }
  return '';
}

async function loadPdfJs() {
  try {
    // pdfjs-dist v5+ ships ESM bundles.
    return await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch {
    try {
      // Backward compatibility for older pdfjs-dist versions.
      return require('pdfjs-dist/legacy/build/pdf.js');
    } catch {
      return null;
    }
  }
}

async function preflightPdfPageCount(pdfPath) {
  const pdfjs = await loadPdfJs();
  const getDocument = pdfjs && typeof pdfjs.getDocument === 'function'
    ? pdfjs.getDocument
    : (pdfjs && pdfjs.default && typeof pdfjs.default.getDocument === 'function'
      ? pdfjs.default.getDocument
      : null);
  if (!getDocument) {
    return fail('IMPORT_DEP_MISSING_PDFJS', 'PDF extraction dependency is not installed.');
  }

  let loadingTask = null;
  try {
    const buffer = fs.readFileSync(pdfPath);
    const standardFontDataUrl = resolvePdfJsStandardFontsDir();
    loadingTask = getDocument({
      data: new Uint8Array(buffer),
      disableWorker: true,
      useSystemFonts: true,
      ...(standardFontDataUrl ? { standardFontDataUrl } : {}),
    });
    const doc = await loadingTask.promise;
    const pageTotal = Number.isFinite(doc && doc.numPages)
      ? Math.max(0, Math.floor(doc.numPages))
      : 0;
    if (pageTotal <= 0) {
      return fail('OCR_RASTER_FAILED', 'PDF preflight found no pages.');
    }
    return { ok: true, pageTotal };
  } catch (err) {
    return fail('OCR_RASTER_FAILED', 'PDF preflight failed.', {
      error: String(err),
    });
  } finally {
    try {
      if (loadingTask && typeof loadingTask.destroy === 'function') {
        loadingTask.destroy();
      }
    } catch {
      // no-op
    }
  }
}

async function runProcessWithTimeout({
  executablePath,
  args,
  timeoutMs,
  onChildProcess,
  isCancelRequested,
  maxStdoutChars = 2_000_000,
  maxStderrChars = 200_000,
}) {
  let child = null;
  let spawnError = null;
  let timedOut = false;
  let timeoutHandle = null;

  try {
    child = spawn(executablePath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    spawnError = err;
  }

  if (!child || spawnError) {
    return fail('OCR_EXEC_FAILED', 'Failed to launch external process.', {
      error: String(spawnError || ''),
      path: executablePath,
      args,
    });
  }

  safeInvoke(onChildProcess, child);

  child.once('error', (err) => {
    spawnError = err;
  });

  if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timeoutHandle = setTimeout(async () => {
      timedOut = true;
      await terminateWithEscalation(child, {
        gracefulWaitMs: 2000,
        forceWaitMs: 5000,
      });
    }, timeoutMs);
    if (typeof timeoutHandle.unref === 'function') timeoutHandle.unref();
  }

  const processRes = await readProcessStreams(child, maxStdoutChars, maxStderrChars);
  if (timeoutHandle) clearTimeout(timeoutHandle);

  if (spawnError) {
    return fail('OCR_EXEC_FAILED', 'External process failed.', {
      error: String(spawnError),
      stderr: processRes.stderr || '',
      path: executablePath,
      args,
    });
  }

  if (timedOut) {
    return fail('OCR_TIMEOUT_PAGE', 'OCR timed out for page/image.', {
      stderr: processRes.stderr || '',
    });
  }

  if (typeof isCancelRequested === 'function' && isCancelRequested()) {
    return fail('OCR_CANCELED', 'OCR canceled by user.');
  }

  if (processRes.code !== 0) {
    return fail('OCR_EXEC_FAILED', 'External process exited with error.', {
      exitCode: processRes.code,
      signal: processRes.signal || '',
      stderr: processRes.stderr || '',
      path: executablePath,
      args,
    });
  }

  return {
    ok: true,
    stdout: processRes.stdout || '',
    stderr: processRes.stderr || '',
    stdoutTruncated: !!processRes.stdoutTruncated,
    stderrTruncated: !!processRes.stderrTruncated,
  };
}

function resolveTesseractArgs({ inputPath, tesseractLang, tessdataPath }) {
  return [
    inputPath,
    'stdout',
    '-l',
    tesseractLang,
    '--tessdata-dir',
    tessdataPath,
    '--psm',
    '3',
  ];
}

function isPdfInput(session) {
  const route = String((session && session.route) || '').trim().toLowerCase();
  if (route === 'ocr_pdf_scanned') return true;
  const ext = path.extname(String((session && session.filePath) || '')).toLowerCase();
  return ext === '.pdf';
}

async function runImageOcr(session, sidecar, options = {}) {
  const imagePath = session && typeof session.filePath === 'string' ? session.filePath : '';
  if (!imagePath || !ensurePathExists(imagePath)) {
    return fail('OCR_EXEC_FAILED', 'OCR input image is missing.');
  }

  const timeoutPerPageSec = clampInt(options.timeoutPerPageSec, 30, 600, 90);
  const timeoutMs = timeoutPerPageSec * 1000;
  const requestedLang = options.ocrLanguage || options.ocrLang || options.languageTag || options.lang || '';
  const langRes = resolveAndValidateOcrLanguage(requestedLang, sidecar.tessdataPath);
  if (!langRes.ok) return langRes;
  const { tesseractLang } = langRes;

  safeInvoke(options.onStage, 'ocr');
  safeInvoke(options.onProgress, {
    stage: 'ocr',
    pageDone: 0,
    pageTotal: 1,
  });

  const processRes = await runProcessWithTimeout({
    executablePath: sidecar.tesseractPath,
    args: resolveTesseractArgs({
      inputPath: imagePath,
      tesseractLang,
      tessdataPath: sidecar.tessdataPath,
    }),
    timeoutMs,
    onChildProcess: options.onChildProcess,
    isCancelRequested: options.isCancelRequested,
  });
  if (!processRes.ok) {
    if (processRes.code === 'OCR_TIMEOUT_PAGE') {
      return fail('OCR_TIMEOUT_PAGE', 'OCR timed out for page/image.', {
        timeoutPerPageSec,
        stderr: processRes.stderr || '',
      });
    }
    return processRes;
  }

  const text = normalizeMultiline(processRes.stdout);
  if (!text) {
    return fail('OCR_EMPTY_RESULT', 'OCR completed but produced no text.');
  }

  safeInvoke(options.onProgress, {
    stage: 'ocr',
    pageDone: 1,
    pageTotal: 1,
  });
  safeInvoke(options.onStage, 'finalizing');

  const warnings = [];
  if (processRes.stdoutTruncated) warnings.push('OCR stdout truncated in-memory.');
  if (processRes.stderrTruncated) warnings.push('OCR stderr truncated in-memory.');

  return {
    ok: true,
    text,
    summary: {
      pagesProcessed: 1,
      pagesTotal: 1,
      extractedChars: text.length,
      warnings,
    },
  };
}

async function runPdfRasterOcr(session, sidecar, options = {}) {
  const pdfPath = session && typeof session.filePath === 'string' ? session.filePath : '';
  if (!pdfPath || !ensurePathExists(pdfPath)) {
    return fail('OCR_EXEC_FAILED', 'OCR input PDF is missing.');
  }
  if (!ensurePathExists(sidecar.pdftoppmPath)) {
    return fail('OCR_BINARY_MISSING', 'PDF rasterizer sidecar binary not found.', {
      binary: 'pdftoppm',
      path: sidecar.pdftoppmPath,
      profileKey: sidecar.profileKey,
    });
  }

  const dpi = clampInt(options.dpi, 150, 600, 300);
  const timeoutPerPageSec = clampInt(options.timeoutPerPageSec, 30, 600, 90);
  const timeoutPerPageMs = timeoutPerPageSec * 1000;
  const rasterTimeoutPerPageSec = clampInt(
    options.rasterTimeoutPerPageSec,
    30,
    900,
    Math.max(45, Math.floor(timeoutPerPageSec * 0.8))
  );
  const rasterTimeoutPerPageMs = rasterTimeoutPerPageSec * 1000;
  const stallTimeoutSec = clampInt(
    options.stallTimeoutSec,
    60,
    1800,
    Math.max(120, timeoutPerPageSec * 2)
  );
  const stallTimeoutMs = stallTimeoutSec * 1000;
  const requestedLang = options.ocrLanguage || options.ocrLang || options.languageTag || options.lang || '';
  const langRes = resolveAndValidateOcrLanguage(requestedLang, sidecar.tessdataPath);
  if (!langRes.ok) return langRes;
  const { tesseractLang } = langRes;

  const tempDir = createJobTempDir('tot-ocr-pdf-');
  const warnings = [];
  const startedAt = Date.now();
  let activeChild = null;
  let pageDone = 0;
  let pageTotal = 0;
  let stage = 'queued';
  let stageStartedAt = startedAt;
  let currentPage = 0;
  let lastProgressAt = startedAt;
  let stallWatchdogHandle = null;
  let stallTimedOut = false;
  let stallMeta = null;

  try {
    if (typeof options.isCancelRequested === 'function' && options.isCancelRequested()) {
      return fail('OCR_CANCELED', 'OCR canceled by user.');
    }

    function emitProgress(nextStage, {
      nextPageDone,
      nextPageTotal,
      nextCurrentPage,
      resetStageClock = false,
    } = {}) {
      const normalizedStage = String(nextStage || stage || 'running').trim().toLowerCase() || 'running';
      const nowTs = Date.now();
      const stageChanged = normalizedStage !== stage;
      if (stageChanged || resetStageClock) {
        stageStartedAt = nowTs;
      }
      stage = normalizedStage;

      if (Number.isFinite(nextPageDone)) {
        pageDone = Math.max(0, Math.floor(nextPageDone));
      }
      if (Number.isFinite(nextPageTotal)) {
        pageTotal = Math.max(0, Math.floor(nextPageTotal));
      }
      if (Number.isFinite(nextCurrentPage)) {
        currentPage = Math.max(0, Math.floor(nextCurrentPage));
      }

      lastProgressAt = nowTs;
      safeInvoke(options.onStage, stage);
      const payload = {
        stage,
        pageDone,
        pageTotal,
        phaseElapsedMs: Math.max(0, nowTs - stageStartedAt),
        jobElapsedMs: Math.max(0, nowTs - startedAt),
      };
      if (currentPage > 0) payload.currentPage = currentPage;
      safeInvoke(options.onProgress, payload);
    }

    stallWatchdogHandle = setInterval(async () => {
      if (stallTimedOut) return;
      const nowTs = Date.now();
      const stalledForMs = nowTs - lastProgressAt;
      if (stalledForMs < stallTimeoutMs) return;

      stallTimedOut = true;
      stallMeta = {
        stage,
        pageNumber: currentPage > 0 ? currentPage : undefined,
        pageDone,
        pageTotal,
        stallTimeoutSec,
        stalledForMs,
      };

      if (activeChild) {
        await terminateWithEscalation(activeChild, {
          gracefulWaitMs: 2000,
          forceWaitMs: 5000,
        });
      }
    }, 1000);
    if (typeof stallWatchdogHandle.unref === 'function') stallWatchdogHandle.unref();

    emitProgress('preflight', {
      nextPageDone: 0,
      nextPageTotal: 0,
      nextCurrentPage: 0,
      resetStageClock: true,
    });

    const preflightRes = await preflightPdfPageCount(pdfPath);
    if (!preflightRes.ok) return preflightRes;
    pageTotal = preflightRes.pageTotal;
    if (stallTimedOut) {
      return fail('OCR_TIMEOUT_JOB', 'OCR job stalled with no progress.', Object.assign({}, stallMeta || {}, {
        timeoutMs: stallTimeoutMs,
      }));
    }

    emitProgress('preflight', {
      nextPageDone: 0,
      nextPageTotal: pageTotal,
      nextCurrentPage: 0,
    });

    const pageTexts = [];
    for (let pageNumber = 1; pageNumber <= pageTotal; pageNumber += 1) {
      if (stallTimedOut) {
        return fail('OCR_TIMEOUT_JOB', 'OCR job stalled with no progress.', Object.assign({}, stallMeta || {}, {
          timeoutMs: stallTimeoutMs,
        }));
      }
      if (typeof options.isCancelRequested === 'function' && options.isCancelRequested()) {
        return fail('OCR_CANCELED', 'OCR canceled by user.', {
          pageDone,
          pageTotal,
          pageNumber,
        });
      }

      const pageBase = path.join(tempDir, `page-${String(pageNumber).padStart(6, '0')}`);
      const pageImagePath = `${pageBase}.png`;
      removeFileIfExists(pageImagePath);

      emitProgress('rasterizing', {
        nextPageDone: pageDone,
        nextPageTotal: pageTotal,
        nextCurrentPage: pageNumber,
        resetStageClock: true,
      });

      const rasterRes = await runProcessWithTimeout({
        executablePath: sidecar.pdftoppmPath,
        args: [
          '-f',
          String(pageNumber),
          '-l',
          String(pageNumber),
          '-singlefile',
          '-r',
          String(dpi),
          '-png',
          pdfPath,
          pageBase,
        ],
        timeoutMs: rasterTimeoutPerPageMs,
        onChildProcess: (child) => {
          activeChild = child;
          safeInvoke(options.onChildProcess, child);
        },
        isCancelRequested: options.isCancelRequested,
        maxStdoutChars: 200_000,
        maxStderrChars: 500_000,
      });
      activeChild = null;
      if (!rasterRes.ok) {
        if (stallTimedOut) {
          return fail('OCR_TIMEOUT_JOB', 'OCR job stalled with no progress.', Object.assign({}, stallMeta || {}, {
            timeoutMs: stallTimeoutMs,
            stderr: rasterRes.stderr || '',
          }));
        }
        if (rasterRes.code === 'OCR_TIMEOUT_PAGE') {
          return fail('OCR_TIMEOUT_PAGE', 'OCR timed out for page/image.', {
            stage: 'rasterizing',
            timeoutPerPageSec: rasterTimeoutPerPageSec,
            pageNumber,
            pageDone,
            pageTotal,
            stderr: rasterRes.stderr || '',
          });
        }
        if (rasterRes.code === 'OCR_CANCELED') {
          return fail('OCR_CANCELED', 'OCR canceled by user.', {
            pageDone,
            pageTotal,
            pageNumber,
          });
        }
        return fail('OCR_RASTER_FAILED', 'PDF rasterization failed.', {
          stage: 'rasterizing',
          pageNumber,
          pageDone,
          pageTotal,
          stderr: rasterRes.stderr || '',
          error: rasterRes.error || '',
        });
      }
      if (rasterRes.stderrTruncated) warnings.push(`pdftoppm stderr truncated for page ${pageNumber}.`);
      if (!ensurePathExists(pageImagePath)) {
        return fail('OCR_RASTER_FAILED', 'PDF rasterization produced no page image.', {
          stage: 'rasterizing',
          pageNumber,
          pageDone,
          pageTotal,
          imagePath: pageImagePath,
        });
      }

      emitProgress('ocr', {
        nextPageDone: pageDone,
        nextPageTotal: pageTotal,
        nextCurrentPage: pageNumber,
        resetStageClock: true,
      });

      const pageRes = await runProcessWithTimeout({
        executablePath: sidecar.tesseractPath,
        args: resolveTesseractArgs({
          inputPath: pageImagePath,
          tesseractLang,
          tessdataPath: sidecar.tessdataPath,
        }),
        timeoutMs: timeoutPerPageMs,
        onChildProcess: (child) => {
          activeChild = child;
          safeInvoke(options.onChildProcess, child);
        },
        isCancelRequested: options.isCancelRequested,
      });
      activeChild = null;

      if (!pageRes.ok) {
        removeFileIfExists(pageImagePath);
        if (stallTimedOut) {
          return fail('OCR_TIMEOUT_JOB', 'OCR job stalled with no progress.', Object.assign({}, stallMeta || {}, {
            timeoutMs: stallTimeoutMs,
            stderr: pageRes.stderr || '',
          }));
        }
        if (pageRes.code === 'OCR_TIMEOUT_PAGE') {
          return fail('OCR_TIMEOUT_PAGE', 'OCR timed out for page/image.', {
            stage: 'ocr',
            timeoutPerPageSec,
            pageNumber,
            pageDone,
            pageTotal,
            stderr: pageRes.stderr || '',
          });
        }
        if (pageRes.code === 'OCR_CANCELED') {
          return fail('OCR_CANCELED', 'OCR canceled by user.', {
            pageDone,
            pageTotal,
            pageNumber,
          });
        }
        return fail('OCR_EXEC_FAILED', 'OCR process exited with error.', {
          stage: 'ocr',
          pageNumber,
          pageDone,
          pageTotal,
          stderr: pageRes.stderr || '',
          error: pageRes.error || '',
        });
      }

      if (pageRes.stdoutTruncated) warnings.push(`OCR stdout truncated for page ${pageNumber}.`);
      if (pageRes.stderrTruncated) warnings.push(`OCR stderr truncated for page ${pageNumber}.`);

      const pageText = normalizeMultiline(pageRes.stdout);
      if (pageText) {
        pageTexts.push(pageText);
      } else {
        warnings.push(`No OCR text detected for page ${pageNumber}.`);
      }
      removeFileIfExists(pageImagePath);

      emitProgress('ocr', {
        nextPageDone: pageNumber,
        nextPageTotal: pageTotal,
        nextCurrentPage: pageNumber,
      });
    }

    if (stallTimedOut) {
      return fail('OCR_TIMEOUT_JOB', 'OCR job stalled with no progress.', Object.assign({}, stallMeta || {}, {
        timeoutMs: stallTimeoutMs,
      }));
    }

    const text = normalizeMultiline(pageTexts.join('\n\n'));
    if (!text) {
      return fail('OCR_EMPTY_RESULT', 'OCR completed but produced no text.', {
        pageDone,
        pageTotal,
      });
    }

    emitProgress('finalizing', {
      nextPageDone: pageTotal,
      nextPageTotal: pageTotal,
      nextCurrentPage: pageTotal,
      resetStageClock: true,
    });

    return {
      ok: true,
      text,
      summary: {
        pagesProcessed: pageTotal,
        pagesTotal: pageTotal,
        extractedChars: text.length,
        warnings,
      },
    };
  } catch (err) {
    return fail('OCR_EXEC_FAILED', 'OCR execution failed unexpectedly.', {
      error: String(err),
    });
  } finally {
    if (stallWatchdogHandle) clearInterval(stallWatchdogHandle);
    removeDirIfExists(tempDir);
  }
}

async function runOcrPipeline(session, options = {}) {
  const sidecar = resolveSidecarPaths(options || {});
  if (!sidecar.ok) return sidecar;

  if (!ensurePathExists(sidecar.tesseractPath)) {
    return fail('OCR_BINARY_MISSING', 'Tesseract sidecar binary not found.', {
      binary: 'tesseract',
      path: sidecar.tesseractPath,
      profileKey: sidecar.profileKey,
    });
  }
  if (!ensurePathExists(sidecar.tessdataPath)) {
    return fail('OCR_BINARY_MISSING', 'Tesseract language data directory not found.', {
      binary: 'tessdata',
      path: sidecar.tessdataPath,
      profileKey: sidecar.profileKey,
    });
  }
  if (isPdfInput(session)) {
    return runPdfRasterOcr(session, sidecar, options || {});
  }
  return runImageOcr(session, sidecar, options || {});
}

module.exports = {
  runOcrPipeline,
};
