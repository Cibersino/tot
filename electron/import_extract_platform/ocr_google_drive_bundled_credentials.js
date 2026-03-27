// electron/import_extract_platform/ocr_google_drive_bundled_credentials.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Google Drive OCR bundled-credentials bootstrap helper.
// Responsibilities:
// - Validate the app-owned bundled desktop OAuth credentials file shape.
// - Keep the canonical runtime credentials path app-managed in production.
// - Materialize or repair the runtime credentials mirror when the bundled source exists.
// - Never prompt ordinary users to browse for or import credentials.json.

// =============================================================================
// Imports / logger
// =============================================================================

const fs = require('fs');
const path = require('path');
const Log = require('../log');

const log = Log.get('ocr-google-drive-bundled-credentials');

// =============================================================================
// Helpers
// =============================================================================

function hasNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function safeErrorName(err) {
  return String(err && err.name ? err.name : 'Error');
}

function safeErrorMessage(err) {
  return String(err && err.message ? err.message : err || '');
}

function ensureParentDir(filePath) {
  const parent = path.dirname(filePath);
  if (!fs.existsSync(parent)) {
    fs.mkdirSync(parent, { recursive: true });
  }
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

function readJsonFileStrict(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

function validateCredentialsFile(filePath) {
  if (!hasNonEmptyString(filePath) || !fs.existsSync(filePath)) {
    return {
      ok: false,
      code: 'missing_file',
      parsed: null,
    };
  }

  try {
    const parsed = readJsonFileStrict(filePath);
    if (!hasValidCredentialsShape(parsed)) {
      return {
        ok: false,
        code: 'invalid_shape',
        parsed: null,
      };
    }

    return {
      ok: true,
      code: '',
      parsed,
    };
  } catch (err) {
    return {
      ok: false,
      code: 'read_failed',
      parsed: null,
      errorName: safeErrorName(err),
      errorMessage: safeErrorMessage(err),
    };
  }
}

// =============================================================================
// Runtime materialization
// =============================================================================

function materializeBundledCredentials({
  runtimeCredentialsPath,
  bundledCredentialsPath,
} = {}) {
  const runtimeValidation = validateCredentialsFile(runtimeCredentialsPath);
  if (runtimeValidation.ok) {
    return {
      ok: true,
      copied: false,
      repairedRuntimeMirror: false,
      reason: 'runtime_ready',
    };
  }

  const repairedRuntimeMirror = runtimeValidation.code !== 'missing_file';
  const bundledValidation = validateCredentialsFile(bundledCredentialsPath);
  if (!bundledValidation.ok) {
    const detailsSafeForLogs = {
      runtimeValidationCode: runtimeValidation.code,
      bundledValidationCode: bundledValidation.code,
      bundledCredentialsPathPresent: hasNonEmptyString(bundledCredentialsPath),
      bundledErrorName: bundledValidation.errorName || '',
      bundledErrorMessage: bundledValidation.errorMessage || '',
    };

    log.warnOnce(
      `ocrGoogleDriveBundledCredentials.missingOrInvalid.${bundledValidation.code}`,
      'Google OCR bundled credentials are unavailable; canonical runtime credentials were not materialized:',
      detailsSafeForLogs
    );

    return {
      ok: false,
      copied: false,
      repairedRuntimeMirror,
      reason: 'bundled_credentials_unavailable',
      detailsSafeForLogs,
    };
  }

  try {
    ensureParentDir(runtimeCredentialsPath);
    fs.writeFileSync(runtimeCredentialsPath, JSON.stringify(bundledValidation.parsed, null, 2), 'utf8');

    log.info('Google OCR bundled credentials materialized into canonical runtime path:', {
      runtimeCredentialsPath,
      bundledCredentialsPath,
      copied: true,
      repairedRuntimeMirror,
    });

    return {
      ok: true,
      copied: true,
      repairedRuntimeMirror,
      reason: repairedRuntimeMirror ? 'runtime_repaired_from_bundle' : 'runtime_created_from_bundle',
    };
  } catch (err) {
    const detailsSafeForLogs = {
      runtimeValidationCode: runtimeValidation.code,
      errorName: safeErrorName(err),
      errorMessage: safeErrorMessage(err),
    };

    log.error('Google OCR bundled credentials materialization failed:', detailsSafeForLogs);

    return {
      ok: false,
      copied: false,
      repairedRuntimeMirror,
      reason: 'runtime_materialization_failed',
      detailsSafeForLogs,
    };
  }
}

// =============================================================================
// Module surface
// =============================================================================

module.exports = {
  materializeBundledCredentials,
};

// =============================================================================
// End of electron/import_extract_platform/ocr_google_drive_bundled_credentials.js
// =============================================================================
