// electron/import_ocr/ocr_runtime.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Provide shared runtime helpers used by OCR image and PDF pipelines.
// - Validate OCR language requests against available tessdata files.
// - Execute external OCR/raster processes with timeout and cancellation support.
// - Capture stdout/stderr with in-memory truncation caps and truncation flags.
// - Normalize bridge callback failure handling for optional runtime hooks.
// - Return consistent result/failure object shapes consumed by OCR orchestrators.

// =============================================================================
// Imports / logger
// =============================================================================
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const Log = require('../log');
const {
  mapUiLanguageToTesseract,
  getRequiredTesseractCodes,
} = require('./language_policy');
const {
  terminateWithEscalation,
} = require('./platform/process_control');

// =============================================================================
// Constants / config
// =============================================================================
const OCR_PROCESS_STDOUT_LIMIT_DEFAULT_CHARS = 2_000_000; // Default cap for OCR process stdout capture (typically tesseract text output).
const OCR_PROCESS_STDERR_LIMIT_DEFAULT_CHARS = 200_000; // Default cap for OCR process stderr capture when no per-call override is provided.
const OCR_RASTER_STDOUT_LIMIT_CHARS = 200_000; // Raster (pdftoppm) override: stdout is not expected to carry main payload.
const OCR_RASTER_STDERR_LIMIT_CHARS = 500_000; // Raster (pdftoppm) override: stderr can be verbose for diagnostics.
const LOG_KEY_BRIDGE_CALLBACK_FAILED_BASE = 'import_ocr_runtime.bridge.failed_ignored.safeInvoke';
const LOG_KEY_BRIDGE_IS_CANCEL_REQUESTED_FAILED = 'import_ocr_runtime.bridge.failed_ignored.isCancelRequested';
const SAFE_INVOKE_LABEL_OTHER = 'other';
const SAFE_INVOKE_LABEL_ON_CHILD_PROCESS = 'onChildProcess';

const log = Log.get('import-ocr-runtime');

// =============================================================================
// Helpers (result shaping and local normalization)
// =============================================================================
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

function normalizeCaptureLimit(rawLimit, fallback) {
  const n = Number(rawLimit);
  if (!Number.isFinite(n)) return fallback;
  return Math.floor(n);
}

function appendChunkWithLimit(currentText, chunk, maxChars) {
  const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
  const remaining = maxChars - currentText.length;
  if (remaining <= 0) {
    return { nextText: currentText, truncated: true };
  }
  if (text.length > remaining) {
    return { nextText: currentText + text.slice(0, remaining), truncated: true };
  }
  return { nextText: currentText + text, truncated: false };
}

function normalizeSafeInvokeLabel(rawLabel) {
  const label = typeof rawLabel === 'string' ? rawLabel.trim() : '';
  if (!label) return SAFE_INVOKE_LABEL_OTHER;
  if (!/^[A-Za-z0-9_]{1,64}$/.test(label)) return SAFE_INVOKE_LABEL_OTHER;
  return label;
}

// =============================================================================
// OCR language validation
// =============================================================================
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

// =============================================================================
// Process output capture
// =============================================================================
function readProcessStreams(
  child,
  maxStdoutChars = OCR_PROCESS_STDOUT_LIMIT_DEFAULT_CHARS,
  maxStderrChars = OCR_PROCESS_STDERR_LIMIT_DEFAULT_CHARS
) {
  return new Promise((resolve) => {
    const normalizedMaxStdoutChars = normalizeCaptureLimit(
      maxStdoutChars,
      OCR_PROCESS_STDOUT_LIMIT_DEFAULT_CHARS
    );
    const normalizedMaxStderrChars = normalizeCaptureLimit(
      maxStderrChars,
      OCR_PROCESS_STDERR_LIMIT_DEFAULT_CHARS
    );
    let stdoutText = '';
    let stderrText = '';
    let stdoutTruncated = false;
    let stderrTruncated = false;

    if (child.stdout) {
      child.stdout.on('data', (chunk) => {
        if (stdoutTruncated) return;
        const next = appendChunkWithLimit(stdoutText, chunk, normalizedMaxStdoutChars);
        stdoutText = next.nextText;
        stdoutTruncated = next.truncated;
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (chunk) => {
        if (stderrTruncated) return;
        const next = appendChunkWithLimit(stderrText, chunk, normalizedMaxStderrChars);
        stderrText = next.nextText;
        stderrTruncated = next.truncated;
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

// =============================================================================
// Optional bridge callbacks and text normalization
// =============================================================================
function safeInvoke(cb, maybeLabel, ...restArgs) {
  if (typeof cb !== 'function') return;
  const hasExplicitLabel = typeof maybeLabel === 'string' && restArgs.length > 0;
  const label = hasExplicitLabel ? normalizeSafeInvokeLabel(maybeLabel) : SAFE_INVOKE_LABEL_OTHER;
  const args = hasExplicitLabel
    ? restArgs
    : (maybeLabel === undefined && restArgs.length === 0 ? [] : [maybeLabel, ...restArgs]);
  try {
    cb(...args);
  } catch (err) {
    log.warnOnce(
      `${LOG_KEY_BRIDGE_CALLBACK_FAILED_BASE}.${label}`,
      `Bridge callback '${label}' failed (ignored).`,
      err
    );
  }
}

function normalizeMultiline(text) {
  return String(text || '').replace(/\r\n?/g, '\n').trim();
}

// =============================================================================
// External process execution (timeout + cancellation)
// =============================================================================
async function runProcessWithTimeout({
  executablePath,
  args,
  workingDirectory,
  timeoutMs,
  onChildProcess,
  isCancelRequested,
  maxStdoutChars = OCR_PROCESS_STDOUT_LIMIT_DEFAULT_CHARS,
  maxStderrChars = OCR_PROCESS_STDERR_LIMIT_DEFAULT_CHARS,
}) {
  let child = null;
  let spawnError = null;
  let timedOut = false;
  let timeoutHandle = null;
  const normalizedExecutablePath = String(executablePath || '').trim();
  const derivedWorkingDirectory = normalizedExecutablePath
    ? path.dirname(normalizedExecutablePath)
    : '';
  const normalizedWorkingDirectory = String(workingDirectory || derivedWorkingDirectory).trim();
  const spawnOptions = {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  };
  if (normalizedWorkingDirectory) {
    spawnOptions.cwd = normalizedWorkingDirectory;
  }

  try {
    child = spawn(executablePath, args, spawnOptions);
  } catch (err) {
    spawnError = err;
  }

  if (!child || spawnError) {
    return fail('OCR_EXEC_FAILED', 'Failed to launch external process.', {
      error: String(spawnError || ''),
      path: executablePath,
      args,
      cwd: normalizedWorkingDirectory || '',
    });
  }

  safeInvoke(onChildProcess, SAFE_INVOKE_LABEL_ON_CHILD_PROCESS, child);

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
      cwd: normalizedWorkingDirectory || '',
    });
  }

  if (timedOut) {
    return fail('OCR_TIMEOUT_PAGE', 'OCR timed out for page/image.', {
      stderr: processRes.stderr || '',
    });
  }

  let cancelRequested = false;
  if (typeof isCancelRequested === 'function') {
    try {
      cancelRequested = !!isCancelRequested();
    } catch (err) {
      log.warnOnce(
        LOG_KEY_BRIDGE_IS_CANCEL_REQUESTED_FAILED,
        'isCancelRequested callback failed (ignored); treating as not canceled.',
        err
      );
    }
  }
  if (cancelRequested) {
    return fail('OCR_CANCELED', 'OCR canceled by user.');
  }

  if (processRes.code !== 0) {
    return fail('OCR_EXEC_FAILED', 'External process exited with error.', {
      exitCode: processRes.code,
      signal: processRes.signal || '',
      stderr: processRes.stderr || '',
      path: executablePath,
      args,
      cwd: normalizedWorkingDirectory || '',
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

// =============================================================================
// OCR argument builders
// =============================================================================
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

// =============================================================================
// Exports / module surface
// =============================================================================
module.exports = {
  OCR_PROCESS_STDOUT_LIMIT_DEFAULT_CHARS,
  OCR_PROCESS_STDERR_LIMIT_DEFAULT_CHARS,
  OCR_RASTER_STDOUT_LIMIT_CHARS,
  OCR_RASTER_STDERR_LIMIT_CHARS,
  fail,
  clampInt,
  ensurePathExists,
  resolveAndValidateOcrLanguage,
  runProcessWithTimeout,
  resolveTesseractArgs,
  safeInvoke,
  normalizeMultiline,
};

// =============================================================================
// End of electron/import_ocr/ocr_runtime.js
// =============================================================================
