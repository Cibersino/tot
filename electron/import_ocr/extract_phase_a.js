// electron/import_ocr/extract_phase_a.js
'use strict';

const fs = require('fs');
const path = require('path');

function fail(code, message, extra = {}) {
  return Object.assign({ ok: false, code, message }, extra);
}

function normalizeLineEndings(text) {
  const value = String(text || '');
  if (!value.includes('\r')) return value;
  return value.replace(/\r\n?/g, '\n');
}

function readBuffer(filePath) {
  try {
    return { ok: true, buffer: fs.readFileSync(filePath) };
  } catch (err) {
    return fail('IMPORT_READ_FAILED', 'Unable to read selected file.', { error: String(err) });
  }
}

function detectBinaryLikeContent(buffer) {
  if (!buffer || !buffer.length) return false;
  let zeroCount = 0;
  const sampleSize = Math.min(buffer.length, 8192);
  for (let i = 0; i < sampleSize; i += 1) {
    if (buffer[i] === 0x00) zeroCount += 1;
  }
  return zeroCount > Math.floor(sampleSize * 0.01);
}

function decodeTextBuffer(buffer, options = {}) {
  const preferredEncoding = typeof options.textEncoding === 'string'
    ? options.textEncoding.trim().toLowerCase()
    : '';
  const needsLegacyDecoder = !!(preferredEncoding && preferredEncoding !== 'utf8' && preferredEncoding !== 'utf-8');
  const iconv = needsLegacyDecoder ? loadIconvLite() : null;

  if (needsLegacyDecoder && !iconv) {
    return fail(
      'IMPORT_TEXT_DECODE_FAILED',
      'Legacy text decoding dependency is unavailable for selected encoding.',
      {
        encoding: preferredEncoding,
      }
    );
  }

  if (needsLegacyDecoder && !iconv.encodingExists(preferredEncoding)) {
    return fail('IMPORT_TEXT_ENCODING_UNSUPPORTED', 'Requested text encoding is not supported.', {
      encoding: preferredEncoding,
    });
  }

  if (needsLegacyDecoder) {
    try {
      const decoded = iconv.decode(buffer, preferredEncoding);
      return { ok: true, text: normalizeLineEndings(decoded), encoding: preferredEncoding };
    } catch (err) {
      return fail('IMPORT_TEXT_DECODE_FAILED', 'Failed to decode text with selected encoding.', {
        encoding: preferredEncoding,
        error: String(err),
      });
    }
  }

  // Default path: UTF-8 first, no silent fallback.
  const utf8Text = buffer.toString('utf8');
  if (utf8Text.includes('\uFFFD')) {
    return fail(
      'IMPORT_TEXT_DECODE_FAILED',
      'Text decode failed with UTF-8; explicit user-selected encoding is required.',
      {
        recoverable: true,
        encodingOptions: ['utf-8', 'windows-1252', 'latin1'],
      }
    );
  }

  return { ok: true, text: normalizeLineEndings(utf8Text), encoding: 'utf-8' };
}

function loadMammoth() {
  try {
    // Optional dependency in local/offline environments.
    return require('mammoth');
  } catch {
    return null;
  }
}

function loadIconvLite() {
  try {
    // Optional dependency for legacy text encodings.
    return require('iconv-lite');
  } catch {
    return null;
  }
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
    // no-op; fallback below
  }
  return '';
}

async function extractTxt(filePath, options = {}) {
  const readRes = readBuffer(filePath);
  if (!readRes.ok) return readRes;
  const buffer = readRes.buffer;

  if (detectBinaryLikeContent(buffer)) {
    return fail('IMPORT_TEXT_BINARY_DETECTED', 'Selected .txt file appears to be binary.');
  }

  const decodeRes = decodeTextBuffer(buffer, options);
  if (!decodeRes.ok) return decodeRes;

  return {
    ok: true,
    text: decodeRes.text,
    summary: {
      pagesProcessed: 1,
      pagesTotal: 1,
      extractedChars: decodeRes.text.length,
      warnings: [],
    },
  };
}

async function extractDocx(filePath) {
  const mammoth = loadMammoth();
  if (!mammoth) {
    return fail('IMPORT_DEP_MISSING_MAMMOTH', 'DOCX extraction dependency is not installed.');
  }

  try {
    const result = await mammoth.extractRawText({ path: filePath });
    const text = normalizeLineEndings(result && typeof result.value === 'string' ? result.value : '');
    const warnings = Array.isArray(result && result.messages)
      ? result.messages.map((m) => (m && m.message ? String(m.message) : '')).filter(Boolean)
      : [];
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
  } catch (err) {
    return fail('IMPORT_DOCX_EXTRACT_FAILED', 'Failed to extract text from DOCX.', {
      error: String(err),
    });
  }
}

async function extractPdf(filePath) {
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
    const buffer = fs.readFileSync(filePath);
    const standardFontDataUrl = resolvePdfJsStandardFontsDir();
    loadingTask = getDocument({
      data: new Uint8Array(buffer),
      disableWorker: true,
      useSystemFonts: true,
      ...(standardFontDataUrl ? { standardFontDataUrl } : {}),
    });
    const doc = await loadingTask.promise;
    const chunks = [];

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum += 1) {
      const page = await doc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = (textContent.items || [])
        .map((item) => (item && typeof item.str === 'string' ? item.str : ''))
        .filter(Boolean)
        .join(' ')
        .trim();
      if (pageText) chunks.push(pageText);
    }

    const text = normalizeLineEndings(chunks.join('\n\n'));
    return {
      ok: true,
      text,
      summary: {
        pagesProcessed: doc.numPages || 0,
        pagesTotal: doc.numPages || 0,
        extractedChars: text.length,
        warnings: [],
      },
    };
  } catch (err) {
    return fail('IMPORT_PDF_EXTRACT_FAILED', 'Failed to extract text from PDF.', {
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

async function runPhaseAExtraction(session, options = {}) {
  const filePath = session && typeof session.filePath === 'string' ? session.filePath : '';
  const kind = session && typeof session.kind === 'string' ? session.kind : '';
  if (!filePath) {
    return fail('IMPORT_INVALID_SESSION', 'Session does not contain a valid file path.');
  }

  const ext = path.extname(filePath).toLowerCase();
  if (kind === 'txt' || ext === '.txt') {
    return extractTxt(filePath, options || {});
  }
  if (kind === 'docx' || ext === '.docx') {
    return extractDocx(filePath);
  }
  if (kind === 'pdf' || ext === '.pdf') {
    return extractPdf(filePath);
  }

  return fail('IMPORT_UNSUPPORTED_KIND', 'Unsupported extractor kind for Phase A.', {
    kind,
    ext,
  });
}

module.exports = {
  runPhaseAExtraction,
};

// =============================================================================
// End of electron/import_ocr/extract_phase_a.js
// =============================================================================
