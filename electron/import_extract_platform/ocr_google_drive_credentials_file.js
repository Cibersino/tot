// electron/import_extract_platform/ocr_google_drive_credentials_file.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Shared Google OAuth credentials-file reader/validator.
// Responsibilities:
// - Read credentials.json with BOM-safe UTF-8 parsing.
// - Validate the supported Google desktop/web OAuth credentials shape.
// - Return normalized low-level read/shape results for caller-specific mapping.

// =============================================================================
// Imports
// =============================================================================

const fs = require('fs');

// =============================================================================
// Helpers
// =============================================================================

function hasNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function safeErrorName(err) {
  if (!err || typeof err !== 'object') return 'Error';
  const candidate = String(err.name || '').trim();
  return candidate || 'Error';
}

function safeErrorMessage(err) {
  if (!err || typeof err !== 'object') return String(err || '');
  const candidate = String(err.message || '').trim();
  return candidate || '';
}

function hasValidCredentialsShape(parsedCredentials) {
  if (!parsedCredentials || typeof parsedCredentials !== 'object') return false;

  const candidate = parsedCredentials.installed || parsedCredentials.web;
  if (!candidate || typeof candidate !== 'object') return false;
  if (!hasNonEmptyString(candidate.client_id)) return false;
  if (!hasNonEmptyString(candidate.client_secret)) return false;
  if (!Array.isArray(candidate.redirect_uris)) return false;
  return candidate.redirect_uris.some(hasNonEmptyString);
}

function readGoogleOAuthCredentialsFile(filePath) {
  if (!hasNonEmptyString(filePath)) {
    return {
      ok: false,
      code: 'missing_file',
      parsed: null,
      errorName: '',
      errorMessage: '',
    };
  }

  let raw = '';
  try {
    raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return {
        ok: false,
        code: 'missing_file',
        parsed: null,
        errorName: '',
        errorMessage: '',
      };
    }

    return {
      ok: false,
      code: 'read_failed',
      parsed: null,
      errorName: safeErrorName(err),
      errorMessage: safeErrorMessage(err),
    };
  }

  if (!raw.trim()) {
    try {
      JSON.parse(raw);
    } catch (err) {
      return {
        ok: false,
        code: 'empty_file',
        parsed: null,
        errorName: safeErrorName(err),
        errorMessage: safeErrorMessage(err),
      };
    }
  }

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      code: 'invalid_json',
      parsed: null,
      errorName: safeErrorName(err),
      errorMessage: safeErrorMessage(err),
    };
  }

  if (!hasValidCredentialsShape(parsed)) {
    return {
      ok: false,
      code: 'invalid_shape',
      parsed: null,
      errorName: '',
      errorMessage: '',
    };
  }

  return {
    ok: true,
    code: '',
    parsed,
    errorName: '',
    errorMessage: '',
  };
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  readGoogleOAuthCredentialsFile,
};

// =============================================================================
// End of electron/import_extract_platform/ocr_google_drive_credentials_file.js
// =============================================================================
