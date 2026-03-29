// electron/import_extract_platform/import_extract_supported_formats.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Shared supported-format helpers for import/extract routing.
// Responsibilities:
// - Keep native parser support and OCR upload support in one lightweight module.
// - Provide normalized extension lookups without pulling route/runtime dependencies.
// - Expose stable extension lists for picker and prepare-time capability checks.

// =============================================================================
// Constants
// =============================================================================

const NATIVE_PARSER_BY_EXT = Object.freeze({
  '.txt': 'plain_text',
  '.md': 'markdown_text',
  '.html': 'html_text',
  '.htm': 'html_text',
  '.docx': 'docx_text',
  '.pdf': 'pdf_text_layer',
});

const OCR_SOURCE_MIME_BY_EXT = Object.freeze({
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
});

// =============================================================================
// Helpers
// =============================================================================

function normalizeExtWithDot(rawExt) {
  const normalized = typeof rawExt === 'string' ? rawExt.trim().toLowerCase() : '';
  if (!normalized) return '';
  return normalized.startsWith('.') ? normalized : `.${normalized}`;
}

function getNativeParserForExt(rawExt) {
  const extWithDot = normalizeExtWithDot(rawExt);
  return NATIVE_PARSER_BY_EXT[extWithDot] || '';
}

function getOcrSourceMimeTypeForExt(rawExt) {
  const extWithDot = normalizeExtWithDot(rawExt);
  return OCR_SOURCE_MIME_BY_EXT[extWithDot] || '';
}

function getSupportedNativeExtensions() {
  return Object.keys(NATIVE_PARSER_BY_EXT).map((extWithDot) => extWithDot.slice(1));
}

function getSupportedOcrSourceExtensions() {
  return Object.keys(OCR_SOURCE_MIME_BY_EXT).map((extWithDot) => extWithDot.slice(1));
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  getNativeParserForExt,
  getOcrSourceMimeTypeForExt,
  getSupportedNativeExtensions,
  getSupportedOcrSourceExtensions,
};

// =============================================================================
// End of electron/import_extract_platform/import_extract_supported_formats.js
// =============================================================================
