// electron/import_ocr/ocr_pipeline.js
'use strict';

const fs = require('fs');
const { spawn } = require('child_process');
const { resolveSidecarPaths } = require('./platform/resolve_sidecar');
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

function normalizeLangBase(raw) {
  const value = String(raw || '').trim().toLowerCase().replace(/_/g, '-');
  if (!value) return '';
  return value.split('-')[0];
}

function mapToTesseractLang(rawLang) {
  const value = String(rawLang || '').trim().toLowerCase();
  if (!value) return 'eng';
  if (value === 'es' || value === 'spa') return 'spa';
  if (value === 'en' || value === 'eng') return 'eng';
  if (value === 'es+en' || value === 'en+es' || value === 'spa+eng' || value === 'eng+spa') {
    return 'spa+eng';
  }
  const base = normalizeLangBase(value);
  if (base === 'es') return 'spa';
  if (base === 'en') return 'eng';
  return 'eng';
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

function ensurePathExists(targetPath) {
  try {
    return fs.existsSync(targetPath);
  } catch {
    return false;
  }
}

async function runOcrPipeline(session, options = {}) {
  const sidecar = resolveSidecarPaths(options || {});
  if (!sidecar.ok) return sidecar;

  const imagePath = session && typeof session.filePath === 'string' ? session.filePath : '';
  if (!imagePath || !ensurePathExists(imagePath)) {
    return fail('OCR_EXEC_FAILED', 'OCR input image is missing.');
  }
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

  const timeoutPerPageSec = clampInt(options.timeoutPerPageSec, 30, 600, 90);
  const timeoutMs = timeoutPerPageSec * 1000;
  const tesseractLang = mapToTesseractLang(
    options.ocrLanguage || options.ocrLang || options.languageTag || options.lang || ''
  );

  const args = [
    imagePath,
    'stdout',
    '-l',
    tesseractLang,
    '--tessdata-dir',
    sidecar.tessdataPath,
    '--psm',
    '3',
  ];

  let child = null;
  let spawnError = null;
  let timedOut = false;
  let timeoutHandle = null;

  try {
    child = spawn(sidecar.tesseractPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    spawnError = err;
  }

  if (!child || spawnError) {
    return fail('OCR_EXEC_FAILED', 'Failed to launch OCR process.', {
      error: String(spawnError || ''),
      path: sidecar.tesseractPath,
      args,
    });
  }

  if (typeof options.onChildProcess === 'function') {
    try {
      options.onChildProcess(child);
    } catch {
      // ignore callback errors
    }
  }

  child.once('error', (err) => {
    spawnError = err;
  });

  if (typeof options.onStage === 'function') {
    try {
      options.onStage('ocr');
    } catch {
      // no-op
    }
  }

  timeoutHandle = setTimeout(async () => {
    timedOut = true;
    await terminateWithEscalation(child, {
      gracefulWaitMs: 2000,
      forceWaitMs: 5000,
    });
  }, timeoutMs);

  const processRes = await readProcessStreams(child);
  if (timeoutHandle) clearTimeout(timeoutHandle);

  if (spawnError) {
    return fail('OCR_EXEC_FAILED', 'OCR process failed.', {
      error: String(spawnError),
      stderr: processRes.stderr || '',
    });
  }

  if (timedOut) {
    return fail('OCR_TIMEOUT_PAGE', 'OCR timed out for page/image.', {
      timeoutPerPageSec,
      stderr: processRes.stderr || '',
    });
  }

  if (typeof options.isCancelRequested === 'function' && options.isCancelRequested()) {
    return fail('OCR_CANCELED', 'OCR canceled by user.');
  }

  if (processRes.code !== 0) {
    return fail('OCR_EXEC_FAILED', 'OCR process exited with error.', {
      exitCode: processRes.code,
      signal: processRes.signal || '',
      stderr: processRes.stderr || '',
    });
  }

  const text = String(processRes.stdout || '').replace(/\r\n?/g, '\n').trim();
  if (!text) {
    return fail('OCR_EMPTY_RESULT', 'OCR completed but produced no text.');
  }

  const warnings = [];
  if (processRes.stdoutTruncated) warnings.push('OCR stdout truncated in-memory.');
  if (processRes.stderrTruncated) warnings.push('OCR stderr truncated in-memory.');
  if (tesseractLang !== 'spa' && tesseractLang !== 'eng' && tesseractLang !== 'spa+eng') {
    warnings.push('OCR language fallback used.');
  }

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

module.exports = {
  runOcrPipeline,
};
