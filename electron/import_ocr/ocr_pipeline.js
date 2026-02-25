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

const log = Log.get('import-ocr-pipeline');
log.debug('OCR pipeline starting...');

function isPdfInput(session) {
  const route = String((session && session.route) || '').trim().toLowerCase();
  if (route === 'ocr_pdf_scanned') return true;
  const ext = path.extname(String((session && session.filePath) || '')).toLowerCase();
  return ext === '.pdf';
}

function normalizeOptionalCallback(callback, name, fallbackValueOnError) {
  if (callback === undefined || callback === null) return null;
  if (typeof callback !== 'function') {
    log.warn(
      `${name} callback is invalid (ignored); expected function.`
    );
    return null;
  }
  return (...args) => {
    try {
      return callback(...args);
    } catch (err) {
      if (name === 'isCancelRequested') {
        log.warnOnce(
          'import_ocr_pipeline.bridge.failed_ignored.isCancelRequested',
          'isCancelRequested callback failed (ignored); treating as not canceled.',
          err
        );
      } else {
        log.warnOnce(
          `import_ocr_pipeline.bridge.failed_ignored.${name}`,
          `${name} callback failed (ignored):`,
          err
        );
      }
      return fallbackValueOnError;
    }
  };
}

function normalizeBridgeCallbacks(options = {}) {
  const normalizedOptions = Object.assign({}, options || {});
  normalizedOptions.onProgress = normalizeOptionalCallback(normalizedOptions.onProgress, 'onProgress');
  normalizedOptions.onChildProcess = normalizeOptionalCallback(normalizedOptions.onChildProcess, 'onChildProcess');
  normalizedOptions.isCancelRequested = normalizeOptionalCallback(
    normalizedOptions.isCancelRequested,
    'isCancelRequested',
    false
  );
  return normalizedOptions;
}

function failMissingSidecarBinary(binary, targetPath, profileKey, message) {
  return fail('OCR_BINARY_MISSING', message, {
    binary,
    path: targetPath,
    profileKey,
  });
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

  const emitProgress = (stage, pageDone) => {
    if (typeof options.onProgress !== 'function') return;
    options.onProgress({
      stage,
      pageDone,
      pageTotal: 1,
    });
  };

  emitProgress('ocr', 0);

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
  if (!processRes.ok && processRes.code === 'OCR_TIMEOUT_PAGE') {
    return fail('OCR_TIMEOUT_PAGE', 'OCR timed out for page/image.', {
      timeoutPerPageSec,
      stderr: processRes.stderr || '',
    });
  }
  if (!processRes.ok) return processRes;

  const text = normalizeMultiline(processRes.stdout);
  if (!text) {
    return fail('OCR_EMPTY_RESULT', 'OCR completed but produced no text.');
  }

  emitProgress('ocr', 1);
  emitProgress('finalizing', 1);

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
  const normalizedOptions = normalizeBridgeCallbacks(options || {});
  const sidecar = resolveSidecarPaths(normalizedOptions);
  if (!sidecar.ok) return sidecar;

  if (!ensurePathExists(sidecar.tesseractPath)) {
    return failMissingSidecarBinary(
      'tesseract',
      sidecar.tesseractPath,
      sidecar.profileKey,
      'Tesseract sidecar binary not found.'
    );
  }
  if (!ensurePathExists(sidecar.tessdataPath)) {
    return failMissingSidecarBinary(
      'tessdata',
      sidecar.tessdataPath,
      sidecar.profileKey,
      'Tesseract language data directory not found.'
    );
  }
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
