// electron/import_ocr/ocr_pipeline.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Resolve and validate OCR sidecar runtime prerequisites for image/PDF paths.
// - Validate and normalize preprocessConfig against the Batch 1 scoped-lock contract.
// - Normalize optional bridge callbacks used by OCR execution (progress, child, cancel).
// - Route PDF input to runPdfRasterOcr and non-PDF input to single-image OCR.
// - Execute single-image OCR with timeout/language validation and normalized output.
// - Return normalized OCR result/failure objects consumed by import OCR orchestration.

// =============================================================================
// Imports / logger
// =============================================================================
const fs = require('fs');
const os = require('os');
const path = require('path');
const Log = require('../log');
const { resolveSidecarPaths } = require('./platform/resolve_sidecar');
const { validateAndNormalizePreprocessConfig } = require('./preprocess_pipeline');
const { runPreprocessForImage } = require('./preprocess_runtime');
const { runPdfRasterOcr } = require('./pdf_raster_ocr');
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

// =============================================================================
// Helpers (routing, callback normalization, failure shaping)
// =============================================================================
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
  } catch (err) {
    log.warn('Temporary OCR directory cleanup failed (ignored):', dirPath, err);
  }
}

function createJobTempDir(prefix = 'tot-ocr-image-') {
  const baseDir = path.join(os.tmpdir(), prefix);
  ensureDir(baseDir);
  return fs.mkdtempSync(path.join(baseDir, 'job-'));
}

// =============================================================================
// Image OCR path (single-page pipeline)
// =============================================================================
async function runImageOcr(session, sidecar, options = {}) {
  const imagePath = session && typeof session.filePath === 'string' ? session.filePath : '';
  if (!imagePath || !ensurePathExists(imagePath)) {
    return fail('OCR_EXEC_FAILED', 'OCR input image is missing.');
  }

  const timeoutPerPageSec = clampInt(options.timeoutPerPageSec, 30, 600, 90);
  const timeoutMs = timeoutPerPageSec * 1000;
  const psm = options.psm ?? options.ocrPsm;
  const requestedLang = options.ocrLanguage || options.ocrLang || options.languageTag || options.lang || '';
  const langRes = resolveAndValidateOcrLanguage(requestedLang, sidecar.tessdataPath);
  if (!langRes.ok) return langRes;
  const { tesseractLang } = langRes;
  const tempDir = createJobTempDir('tot-ocr-image-');

  const emitProgress = (stage, pageDone) => {
    if (typeof options.onProgress !== 'function') return;
    options.onProgress({
      stage,
      pageDone,
      pageTotal: 1,
    });
  };

  try {
    emitProgress('preprocessing', 0);
    const preprocessRes = await runPreprocessForImage({
      inputPath: imagePath,
      preprocessConfig: options.preprocessConfig,
      sidecar,
      tempDir,
      outputPrefix: 'image_preprocess',
      safetyPolicy: {
        preprocessTimeoutPerPageSec: options.preprocessTimeoutPerPageSec || timeoutPerPageSec,
        preprocessMaxLongSidePx: options.preprocessMaxLongSidePx,
        preprocessMaxAreaPx: options.preprocessMaxAreaPx,
        preprocessMaxOutputBytes: options.preprocessMaxOutputBytes,
        preprocessMaxInputBytes: options.preprocessMaxInputBytes,
        preprocessTempStorageCapBytes: options.preprocessTempStorageCapBytes,
      },
      onChildProcess: options.onChildProcess,
      isCancelRequested: options.isCancelRequested,
    });
    if (!preprocessRes.ok) return preprocessRes;

    emitProgress('ocr', 0);

    const processRes = await runProcessWithTimeout({
      executablePath: sidecar.tesseractPath,
      args: resolveTesseractArgs({
        inputPath: preprocessRes.outputPath,
        tesseractLang,
        tessdataPath: sidecar.tessdataPath,
        psm,
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
  } finally {
    removeDirIfExists(tempDir);
  }
}

// =============================================================================
// Pipeline entrypoint (shared sidecar checks + route dispatch)
// =============================================================================
async function runOcrPipeline(session, options = {}) {
  const normalizedOptions = normalizeBridgeCallbacks(options || {});
  const preprocessRes = validateAndNormalizePreprocessConfig(normalizedOptions.preprocessConfig);
  if (!preprocessRes.ok) return preprocessRes;
  normalizedOptions.preprocessConfig = preprocessRes.preprocessConfig;

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
    return runPdfRasterOcr(session, sidecar, normalizedOptions);
  }
  return runImageOcr(session, sidecar, normalizedOptions);
}

// =============================================================================
// Exports / module surface
// =============================================================================
module.exports = {
  runOcrPipeline,
};

// =============================================================================
// End of electron/import_ocr/ocr_pipeline.js
// =============================================================================
