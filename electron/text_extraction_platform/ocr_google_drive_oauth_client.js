// electron/text_extraction_platform/ocr_google_drive_oauth_client.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Shared Google OAuth helpers for OCR activation/runtime/disconnect flows.
// Responsibilities:
// - Build a configured OAuth2 client from credentials + stored token payload.
// - Build a token-only OAuth2 client for explicit disconnect-time revocation.
// - Select the preferred token to revoke for explicit disconnect flows.

// =============================================================================
// Imports
// =============================================================================

const { google } = require('googleapis');

// =============================================================================
// Helpers
// =============================================================================

function hasNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function extractGoogleOAuthCredentialsRoot(credentialsJson) {
  const root = credentialsJson && typeof credentialsJson === 'object'
    ? (credentialsJson.installed || credentialsJson.web || null)
    : null;

  if (!root || typeof root !== 'object') {
    throw new Error('Invalid Google credentials shape.');
  }
  if (!hasNonEmptyString(root.client_id) || !hasNonEmptyString(root.client_secret)) {
    throw new Error('Google credentials missing client_id/client_secret.');
  }

  return root;
}

function resolveCanonicalRedirectUri(redirectUris) {
  if (!Array.isArray(redirectUris)) return '';

  for (const candidate of redirectUris) {
    if (!hasNonEmptyString(candidate)) continue;
    return String(candidate).trim();
  }

  return '';
}

function describePersistedGoogleToken(tokenPayload) {
  const payload = tokenPayload && typeof tokenPayload === 'object' ? tokenPayload : null;
  const hasAccessToken = hasNonEmptyString(payload && payload.access_token);
  const hasRefreshToken = hasNonEmptyString(payload && payload.refresh_token);

  return {
    hasAccessToken,
    hasRefreshToken,
    acceptablePersistedTokenShape: hasAccessToken || hasRefreshToken,
  };
}

function buildGoogleOAuthClientFromCredentials(
  credentialsJson,
  {
    tokenJson = null,
    redirectUri = '',
  } = {}
) {
  const root = extractGoogleOAuthCredentialsRoot(credentialsJson);
  const effectiveRedirectUri = hasNonEmptyString(redirectUri)
    ? String(redirectUri).trim()
    : resolveCanonicalRedirectUri(root.redirect_uris);

  const oauthClient = new google.auth.OAuth2(
    String(root.client_id),
    String(root.client_secret),
    effectiveRedirectUri
  );
  oauthClient.setCredentials(tokenJson && typeof tokenJson === 'object' ? tokenJson : {});
  return oauthClient;
}

function buildGoogleOAuthClient(credentialsJson, tokenJson) {
  return buildGoogleOAuthClientFromCredentials(credentialsJson, { tokenJson });
}

function buildGoogleTokenRevocationClient(tokenJson) {
  const oauthClient = new google.auth.OAuth2();
  oauthClient.setCredentials(tokenJson && typeof tokenJson === 'object' ? tokenJson : {});
  return oauthClient;
}

function selectPreferredRevocationToken(tokenPayload) {
  const payload = tokenPayload && typeof tokenPayload === 'object' ? tokenPayload : {};
  const tokenState = describePersistedGoogleToken(payload);
  const refreshToken = tokenState.hasRefreshToken ? payload.refresh_token.trim() : '';
  if (refreshToken) {
    return {
      token: refreshToken,
      kind: 'refresh_token',
    };
  }

  const accessToken = tokenState.hasAccessToken ? payload.access_token.trim() : '';
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
  buildGoogleOAuthClientFromCredentials,
  describePersistedGoogleToken,
  buildGoogleOAuthClient,
  buildGoogleTokenRevocationClient,
  extractGoogleOAuthCredentialsRoot,
  resolveCanonicalRedirectUri,
  selectPreferredRevocationToken,
};

// =============================================================================
// End of electron/text_extraction_platform/ocr_google_drive_oauth_client.js
// =============================================================================

