// electron/import_ocr/ocr_pipeline.js
'use strict';

const path = require('path');
const Log = require('../log');
const { resolveSidecarPaths } = require('./platform/resolve_sidecar');
const { runPdfRasterOcrV2 } = require('./engine_v2');
const {
  fail,
  clampInt,
  ensurePathExists,
  resolveAndValidateOcrLanguage,
  runProcessWithTimeout,
  resolveTesseractArgs,
  normalizeMultiline,
} = require('./ocr_runtime');

const log = Log.get('ocr_pipeline');

function isPdfInput(session) {
  const route = String((session && session.route) || '').trim().toLowerCase();
  if (route === 'ocr_pdf_scanned') return true;
  const ext = path.extname(String((session && session.filePath) || '')).toLowerCase();
  return ext === '.pdf';
}

function emitProgress(onProgress, payload) {
  if (typeof onProgress !== 'function') return;
  try {
    onProgress(payload);
  } catch (err) {
    log.warnOnce(
      'ocr_pipeline.onProgress.failed',
      'OCR progress callback failed (ignored):',
      err
    );
  }
}

function buildChildProcessHook(onChildProcess) {
  if (typeof onChildProcess !== 'function') return undefined;
  return (child) => {
    try {
      onChildProcess(child);
    } catch (err) {
      log.warnOnce(
        'ocr_pipeline.onChildProcess.failed',
        'OCR child process callback failed (ignored):',
        err
      );
    }
  };
}

function buildCancelProbe(isCancelRequested) {
  if (typeof isCancelRequested !== 'function') return undefined;
  return () => {
    try {
      return isCancelRequested();
    } catch (err) {
      log.warnOnce(
        'ocr_pipeline.isCancelRequested.failed',
        'OCR cancel probe failed (ignored):',
        err
      );
      return false;
    }
  };
}

function normalizeBridgeOptions(options = {}) {
  const normalized = Object.assign({}, options || {});
  normalized.onProgress = typeof normalized.onProgress === 'function' ? normalized.onProgress : null;
  normalized.onChildProcess = buildChildProcessHook(normalized.onChildProcess);
  normalized.isCancelRequested = buildCancelProbe(normalized.isCancelRequested);
  return normalized;
}

function validateSidecarPrerequisites(sidecar) {
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
  return null;
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

  emitProgress(options.onProgress, {
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
    workingDirectory: path.dirname(sidecar.tesseractPath),
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

  emitProgress(options.onProgress, {
    stage: 'ocr',
    pageDone: 1,
    pageTotal: 1,
  });
  emitProgress(options.onProgress, {
    stage: 'finalizing',
    pageDone: 1,
    pageTotal: 1,
  });

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

async function runOcrPipeline(session, options = {}) {
  const normalizedOptions = normalizeBridgeOptions(options || {});
  const sidecar = resolveSidecarPaths(normalizedOptions);
  if (!sidecar.ok) return sidecar;

  const sidecarValidationResult = validateSidecarPrerequisites(sidecar);
  if (sidecarValidationResult) return sidecarValidationResult;
  if (isPdfInput(session)) {
    return runPdfRasterOcrV2(session, sidecar, normalizedOptions);
  }
  return runImageOcr(session, sidecar, normalizedOptions);
}

module.exports = {
  runOcrPipeline,
};

// =============================================================================
// End of electron/import_ocr/ocr_pipeline.js
// =============================================================================
