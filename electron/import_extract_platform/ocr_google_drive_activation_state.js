// electron/import_extract_platform/ocr_google_drive_activation_state.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Presence-only availability check for Google Drive OCR activation artifacts.
// Responsibilities:
// - Check whether credentials and token paths resolve to existing files.
// - Derive the coarse availability state used before deeper validation runs.
// - Distinguish missing credentials from missing token material.
// - Return a small availability/checks surface for higher-level validators.

// =============================================================================
// Imports
// =============================================================================

const fs = require('fs');

// =============================================================================
// Helpers
// =============================================================================

function hasFile(filePath) {
  return typeof filePath === 'string' && filePath.trim() !== '' && fs.existsSync(filePath);
}

// =============================================================================
// Availability resolution
// =============================================================================

function resolveGoogleDriveOcrAvailability({ credentialsPath, tokenPath } = {}) {
  const credentialsPresent = hasFile(credentialsPath);
  const tokenPresent = hasFile(tokenPath);

  if (!credentialsPresent) {
    return {
      available: false,
      errorCode: 'setup_incomplete',
      reason: 'credentials_missing',
      checks: { credentialsPresent, tokenPresent },
    };
  }

  if (!tokenPresent) {
    return {
      available: false,
      errorCode: 'ocr_activation_required',
      reason: 'token_missing',
      checks: { credentialsPresent, tokenPresent },
    };
  }

  return {
    available: true,
    errorCode: null,
    reason: 'ready',
    checks: { credentialsPresent, tokenPresent },
  };
}

// =============================================================================
// Exports / module surface
// =============================================================================

module.exports = {
  resolveGoogleDriveOcrAvailability,
};

// =============================================================================
// End of electron/import_extract_platform/ocr_google_drive_activation_state.js
// =============================================================================
