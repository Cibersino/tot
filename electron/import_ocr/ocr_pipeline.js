// electron/import_ocr/ocr_pipeline.js
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
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

function ensurePathExists(targetPath) {
  try {
    return fs.existsSync(targetPath);
  } catch {
    return false;
  }
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

function createJobTempDir(prefix = 'tot-ocr-') {
  const baseDir = path.join(os.tmpdir(), prefix);
  ensureDir(baseDir);
  return fs.mkdtempSync(path.join(baseDir, 'job-'));
}

function escapeRegExp(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function listRasterizedPngPages(tempDir, prefixBase) {
  const files = fs.readdirSync(tempDir);
  const pattern = new RegExp(`^${escapeRegExp(prefixBase)}-(\\d+)\\.png$`, 'i');
  const pages = [];
  files.forEach((name) => {
    const match = pattern.exec(name);
    if (!match) return;
    const pageNum = Number(match[1]);
    if (!Number.isFinite(pageNum) || pageNum <= 0) return;
    pages.push({
      pageNum,
      filePath: path.join(tempDir, name),
      filename: name,
    });
  });
  pages.sort((a, b) => a.pageNum - b.pageNum);
  return pages;
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
  const tesseractLang = mapToTesseractLang(
    options.ocrLanguage || options.ocrLang || options.languageTag || options.lang || ''
  );

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
  const tesseractLang = mapToTesseractLang(
    options.ocrLanguage || options.ocrLang || options.languageTag || options.lang || ''
  );

  const tempDir = createJobTempDir('tot-ocr-pdf-');
  const prefixBase = 'page';
  const prefixPath = path.join(tempDir, prefixBase);
  const warnings = [];

  let watchdogHandle = null;
  let watchdogTimedOut = false;
  let activeChild = null;

  try {
    if (typeof options.isCancelRequested === 'function' && options.isCancelRequested()) {
      return fail('OCR_CANCELED', 'OCR canceled by user.');
    }

    safeInvoke(options.onStage, 'rasterizing');
    safeInvoke(options.onProgress, {
      stage: 'rasterizing',
      pageDone: 0,
      pageTotal: 0,
    });

    const rasterTimeoutMs = Math.max(120_000, timeoutPerPageMs * 2);
    const rasterRes = await runProcessWithTimeout({
      executablePath: sidecar.pdftoppmPath,
      args: ['-r', String(dpi), '-png', pdfPath, prefixPath],
      timeoutMs: rasterTimeoutMs,
      onChildProcess: (child) => {
        activeChild = child;
        safeInvoke(options.onChildProcess, child);
      },
      isCancelRequested: options.isCancelRequested,
      maxStdoutChars: 200_000,
      maxStderrChars: 500_000,
    });
    if (!rasterRes.ok) {
      if (rasterRes.code === 'OCR_TIMEOUT_PAGE') {
        return fail('OCR_RASTER_FAILED', 'PDF rasterization timed out.', {
          timeoutMs: rasterTimeoutMs,
          stderr: rasterRes.stderr || '',
        });
      }
      if (rasterRes.code === 'OCR_CANCELED') return rasterRes;
      return fail('OCR_RASTER_FAILED', 'PDF rasterization failed.', {
        stderr: rasterRes.stderr || '',
        error: rasterRes.error || '',
      });
    }
    if (rasterRes.stderrTruncated) warnings.push('pdftoppm stderr truncated in-memory.');

    const pages = listRasterizedPngPages(tempDir, prefixBase);
    if (!pages.length) {
      return fail('OCR_RASTER_FAILED', 'PDF rasterization produced no pages.');
    }
    const pageTotal = pages.length;
    const totalTimeoutMs = Math.max(120_000, (pageTotal * timeoutPerPageMs) + 60_000);

    watchdogHandle = setTimeout(async () => {
      watchdogTimedOut = true;
      if (activeChild) {
        await terminateWithEscalation(activeChild, {
          gracefulWaitMs: 2000,
          forceWaitMs: 5000,
        });
      }
    }, totalTimeoutMs);
    if (typeof watchdogHandle.unref === 'function') watchdogHandle.unref();

    safeInvoke(options.onStage, 'ocr');
    safeInvoke(options.onProgress, {
      stage: 'ocr',
      pageDone: 0,
      pageTotal,
    });

    const pageTexts = [];
    for (let idx = 0; idx < pages.length; idx += 1) {
      const pageInfo = pages[idx];
      const pageNumber = pageInfo.pageNum;

      if (watchdogTimedOut) {
        return fail('OCR_TIMEOUT_JOB', 'OCR job timed out before completion.', {
          pageDone: idx,
          pageTotal,
          timeoutMs: totalTimeoutMs,
        });
      }
      if (typeof options.isCancelRequested === 'function' && options.isCancelRequested()) {
        return fail('OCR_CANCELED', 'OCR canceled by user.', {
          pageDone: idx,
          pageTotal,
        });
      }

      const pageRes = await runProcessWithTimeout({
        executablePath: sidecar.tesseractPath,
        args: resolveTesseractArgs({
          inputPath: pageInfo.filePath,
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

      if (!pageRes.ok) {
        if (pageRes.code === 'OCR_TIMEOUT_PAGE') {
          return fail('OCR_TIMEOUT_PAGE', 'OCR timed out for page/image.', {
            timeoutPerPageSec,
            pageNumber,
            pageDone: idx,
            pageTotal,
            stderr: pageRes.stderr || '',
          });
        }
        if (pageRes.code === 'OCR_CANCELED') {
          return fail('OCR_CANCELED', 'OCR canceled by user.', {
            pageDone: idx,
            pageTotal,
          });
        }
        return fail('OCR_EXEC_FAILED', 'OCR process exited with error.', {
          pageNumber,
          pageDone: idx,
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

      safeInvoke(options.onProgress, {
        stage: 'ocr',
        pageDone: idx + 1,
        pageTotal,
      });
    }

    if (watchdogTimedOut) {
      return fail('OCR_TIMEOUT_JOB', 'OCR job timed out before completion.', {
        pageDone: pageTotal,
        pageTotal,
        timeoutMs: totalTimeoutMs,
      });
    }

    const text = normalizeMultiline(pageTexts.join('\n\n'));
    if (!text) {
      return fail('OCR_EMPTY_RESULT', 'OCR completed but produced no text.', {
        pageDone: pageTotal,
        pageTotal,
      });
    }

    safeInvoke(options.onStage, 'finalizing');

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
    if (watchdogHandle) clearTimeout(watchdogHandle);
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
