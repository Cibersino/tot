// electron/import_ocr/ocr_runtime.js
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
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

async function runProcessWithTimeout({
  executablePath,
  args,
  workingDirectory,
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
      cwd: normalizedWorkingDirectory || '',
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

module.exports = {
  fail,
  clampInt,
  ensurePathExists,
  resolveAndValidateOcrLanguage,
  runProcessWithTimeout,
  resolveTesseractArgs,
  safeInvoke,
  normalizeMultiline,
};
