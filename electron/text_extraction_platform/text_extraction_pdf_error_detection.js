'use strict';

// =============================================================================
// Overview
// =============================================================================
// Shared PDF error-detection helpers for text extraction.
// Responsibilities:
// - Detect password-protected/encrypted PDF failures across probe/extract/inspect.
// - Detect unreadable/corrupt PDF failures from parser/runtime errors.
// - Keep PDF-specific classification heuristics in one place to reduce drift.

// =============================================================================
// Shared PDF error heuristics
// =============================================================================

function isPdfPasswordProtectedError(err) {
  if (!err) return false;
  const name = String(err && err.name ? err.name : '').toLowerCase();
  const message = String(err && err.message ? err.message : '').toLowerCase();
  const code = String(err && err.code ? err.code : '').trim();

  return (
    name.includes('passwordexception')
    || (name.includes('password') && name.includes('exception'))
    || message.includes('password')
    || message.includes('encrypted')
    || code === '1'
  );
}

function isUnreadableOrCorruptPdfError(err) {
  if (!err) return false;
  const code = String(err && err.code ? err.code : '').trim();
  const message = String(err && err.message ? err.message : '').toLowerCase();

  if (code === 'ENOENT' || code === 'EISDIR' || code === 'EACCES' || code === 'EPERM') {
    return true;
  }

  return message.includes('invalid pdf')
    || message.includes('failed to parse')
    || message.includes('bad xref')
    || message.includes('unexpected response')
    || message.includes('formaterror')
    || message.includes('missing pdf')
    || message.includes('corrupt');
}

// =============================================================================
// Exports / module surface
// =============================================================================

module.exports = {
  isPdfPasswordProtectedError,
  isUnreadableOrCorruptPdfError,
};

// =============================================================================
// End of electron/text_extraction_platform/text_extraction_pdf_error_detection.js
// =============================================================================
