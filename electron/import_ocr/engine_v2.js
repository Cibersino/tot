// electron/import_ocr/engine_v2.js
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Log = require('../log');
const {
  terminateWithEscalation,
} = require('./platform/process_control');
const {
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
} = require('./ocr_runtime');

const LOG_KEY_BRIDGE_IS_CANCEL_REQUESTED_FAILED = 'import_ocr_engine_v2.bridge.failed_ignored.isCancelRequested';
const LOG_KEY_TMP_FILE_CLEANUP_FAILED = 'import_ocr_engine_v2.cleanup.remove_file_failed_ignored';
const LOG_KEY_PDFJS_FONTS_DIR_FALLBACK = 'import_ocr_engine_v2.pdfjs.standard_fonts.fallback';
const LOG_KEY_PDFJS_ESM_FALLBACK = 'import_ocr_engine_v2.pdfjs.esm_fallback';
const LOG_KEY_PDFJS_LOAD_FAILED = 'import_ocr_engine_v2.pdfjs.load_failed';
const log = Log.get('import-ocr-engine-v2');

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

function removeFileIfExists(filePath) {
  if (!filePath) return;
  try {
    if (!ensurePathExists(filePath)) return;
    fs.unlinkSync(filePath);
  } catch (err) {
    log.warnOnce(
      LOG_KEY_TMP_FILE_CLEANUP_FAILED,
      'Temporary OCR file cleanup failed (ignored):',
      filePath,
      err
    );
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
    log.warnOnce(
      LOG_KEY_PDFJS_FONTS_DIR_FALLBACK,
      'pdfjs-dist standard_fonts directory not found; continuing without standardFontDataUrl.'
    );
  } catch (err) {
    log.warnOnce(
      LOG_KEY_PDFJS_FONTS_DIR_FALLBACK,
      'Resolving pdfjs-dist standard_fonts failed; continuing without standardFontDataUrl.',
      err
    );
  }
  return '';
}

async function loadPdfJs() {
  try {
    // pdfjs-dist v5+ ships ESM bundles.
    return await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch (errEsm) {
    log.warnOnce(
      LOG_KEY_PDFJS_ESM_FALLBACK,
      'pdfjs ESM load failed (ignored); trying legacy CommonJS fallback.',
      errEsm
    );
    try {
      // Backward compatibility for older pdfjs-dist versions.
      return require('pdfjs-dist/legacy/build/pdf.js');
    } catch (errCjs) {
      log.warnOnce(
        LOG_KEY_PDFJS_LOAD_FAILED,
        'pdfjs load failed after ESM and CommonJS attempts.',
        errCjs
      );
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
    } catch (err) {
      log.warn('pdfjs loadingTask.destroy failed (ignored):', err);
    }
  }
}

function buildStallFail(stallMeta, stallTimeoutMs, extra = {}) {
  return fail(
    'OCR_TIMEOUT_JOB',
    'OCR job stalled with no progress.',
    Object.assign({}, stallMeta || {}, {
      timeoutMs: stallTimeoutMs,
    }, extra || {})
  );
}

async function runPdfRasterOcrV2(session, sidecar, options = {}) {
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
  let activeChild = null;
  let pageDone = 0;
  let pageTotal = 0;
  let stage = 'queued';
  let currentPage = 0;
  let lastProgressAt = Date.now();
  let stallWatchdogHandle = null;
  let stallTimedOut = false;
  let stallMeta = null;

  try {
    if (isCancelRequestedSafe()) {
      return fail('OCR_CANCELED', 'OCR canceled by user.');
    }

    function failIfStalled(extra = {}) {
      if (!stallTimedOut) return null;
      return buildStallFail(stallMeta, stallTimeoutMs, extra);
    }

    function failCanceledForPage(pageNumber) {
      return fail('OCR_CANCELED', 'OCR canceled by user.', {
        pageDone,
        pageTotal,
        pageNumber,
      });
    }

    function isCancelRequestedSafe() {
      if (typeof options.isCancelRequested !== 'function') return false;
      try {
        return !!options.isCancelRequested();
      } catch (err) {
        log.warnOnce(
          LOG_KEY_BRIDGE_IS_CANCEL_REQUESTED_FAILED,
          'isCancelRequested callback failed (ignored); treating as not canceled.',
          err
        );
        return false;
      }
    }

    function onChildProcess(child) {
      activeChild = child;
      safeInvoke(options.onChildProcess, 'onChildProcess', child);
    }

    function emitProgress(nextStage, {
      nextPageDone,
      nextPageTotal,
      nextCurrentPage,
    } = {}) {
      const normalizedStage = String(nextStage || stage || 'running').trim().toLowerCase() || 'running';
      const nowTs = Date.now();
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
      const payload = {
        stage,
        pageDone,
        pageTotal,
      };
      safeInvoke(options.onProgress, 'onProgress', payload);
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
    });

    const preflightRes = await preflightPdfPageCount(pdfPath);
    if (!preflightRes.ok) return preflightRes;
    pageTotal = preflightRes.pageTotal;
    {
      const stallFail = failIfStalled();
      if (stallFail) return stallFail;
    }

    emitProgress('preflight', {
      nextPageDone: 0,
      nextPageTotal: pageTotal,
      nextCurrentPage: 0,
    });

    const pageTexts = [];
    for (let pageNumber = 1; pageNumber <= pageTotal; pageNumber += 1) {
      {
        const stallFail = failIfStalled();
        if (stallFail) return stallFail;
      }
      if (isCancelRequestedSafe()) {
        return failCanceledForPage(pageNumber);
      }

      const pageBase = path.join(tempDir, `page-${String(pageNumber).padStart(6, '0')}`);
      const pageImagePath = `${pageBase}.png`;
      removeFileIfExists(pageImagePath);

      emitProgress('rasterizing', {
        nextPageDone: pageDone,
        nextPageTotal: pageTotal,
        nextCurrentPage: pageNumber,
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
        workingDirectory: path.dirname(sidecar.pdftoppmPath),
        timeoutMs: rasterTimeoutPerPageMs,
        onChildProcess,
        isCancelRequested: options.isCancelRequested,
        maxStdoutChars: OCR_RASTER_STDOUT_LIMIT_CHARS,
        maxStderrChars: OCR_RASTER_STDERR_LIMIT_CHARS,
      });
      activeChild = null;
      if (!rasterRes.ok) {
        {
          const stallFail = failIfStalled({
            stderr: rasterRes.stderr || '',
          });
          if (stallFail) return stallFail;
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
          return failCanceledForPage(pageNumber);
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
      });

      const pageRes = await runProcessWithTimeout({
        executablePath: sidecar.tesseractPath,
        args: resolveTesseractArgs({
          inputPath: pageImagePath,
          tesseractLang,
          tessdataPath: sidecar.tessdataPath,
        }),
        workingDirectory: path.dirname(sidecar.tesseractPath),
        timeoutMs: timeoutPerPageMs,
        onChildProcess,
        isCancelRequested: options.isCancelRequested,
      });
      activeChild = null;

      if (!pageRes.ok) {
        removeFileIfExists(pageImagePath);
        {
          const stallFail = failIfStalled({
            stderr: pageRes.stderr || '',
          });
          if (stallFail) return stallFail;
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
          return failCanceledForPage(pageNumber);
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

    {
      const stallFail = failIfStalled();
      if (stallFail) return stallFail;
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

module.exports = {
  runPdfRasterOcrV2,
};

// =============================================================================
// End of electron/import_ocr/engine_v2.js
// =============================================================================
