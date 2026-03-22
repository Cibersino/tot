// electron/import_extract_platform/ocr_google_drive_oauth_client.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Shared Google OAuth helpers for OCR activation/runtime/disconnect flows.
// Responsibilities:
// - Read and parse Google OAuth credentials JSON from disk.
// - Build a configured OAuth2 client from credentials + stored token payload.
// - Select the preferred token to revoke for explicit disconnect flows.

// =============================================================================
// Imports
// =============================================================================

const fs = require('fs');
const { google } = require('googleapis');

// =============================================================================
// Helpers
// =============================================================================

function hasNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function readGoogleCredentialsFile(credentialsPath) {
  if (!hasNonEmptyString(credentialsPath)) {
    throw new Error('Google credentials path is invalid.');
  }

  const raw = fs.readFileSync(String(credentialsPath), 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

function buildGoogleOAuthClient(credentialsJson, tokenJson) {
  const root = credentialsJson && typeof credentialsJson === 'object'
    ? (credentialsJson.installed || credentialsJson.web || null)
    : null;

  if (!root || typeof root !== 'object') {
    throw new Error('Invalid Google credentials shape.');
  }
  if (!hasNonEmptyString(root.client_id) || !hasNonEmptyString(root.client_secret)) {
    throw new Error('Google credentials missing client_id/client_secret.');
  }

  const redirectUri = Array.isArray(root.redirect_uris) && root.redirect_uris.length
    ? String(root.redirect_uris[0] || '')
    : '';

  const oauthClient = new google.auth.OAuth2(
    String(root.client_id),
    String(root.client_secret),
    redirectUri
  );
  oauthClient.setCredentials(tokenJson && typeof tokenJson === 'object' ? tokenJson : {});
  return oauthClient;
}

function selectPreferredRevocationToken(tokenPayload) {
  const payload = tokenPayload && typeof tokenPayload === 'object' ? tokenPayload : {};
  const refreshToken = hasNonEmptyString(payload.refresh_token) ? payload.refresh_token.trim() : '';
  if (refreshToken) {
    return {
      token: refreshToken,
      kind: 'refresh_token',
    };
  }

  const accessToken = hasNonEmptyString(payload.access_token) ? payload.access_token.trim() : '';
  if (accessToken) {
    return {
      token: accessToken,
      kind: 'access_token',
    };
  }

  return {
    token: '',
    kind: '',
  };
}

// =============================================================================
// Exports / module surface
// =============================================================================

module.exports = {
  readGoogleCredentialsFile,
  buildGoogleOAuthClient,
  selectPreferredRevocationToken,
};

// =============================================================================
// End of electron/import_extract_platform/ocr_google_drive_oauth_client.js
// =============================================================================
