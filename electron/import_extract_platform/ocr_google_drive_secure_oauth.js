// electron/import_extract_platform/ocr_google_drive_secure_oauth.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Secure Google OAuth loopback helper for OCR activation.
// Responsibilities:
// - Reuse the app-managed desktop OAuth client configuration already bundled in credentials.json.
// - Open the system browser with state + PKCE protections.
// - Listen on a loopback callback server bound to the existing redirect owner with an ephemeral port.
// - Exchange the authorization code for tokens and return a configured OAuth2 client.

// =============================================================================
// Imports
// =============================================================================

const crypto = require('crypto');
const http = require('http');
const { URL } = require('url');
const Log = require('../log');

const {
  buildGoogleOAuthClientFromCredentials,
  extractGoogleOAuthCredentialsRoot,
  resolveCanonicalRedirectUri,
} = require('./ocr_google_drive_oauth_client');

const log = Log.get('import-extract-ocr-google-oauth');

// =============================================================================
// Constants / config
// =============================================================================

const SUCCESS_RESPONSE = 'Authentication successful. You can return to the app.';
const DENIED_RESPONSE = 'Authorization rejected. You can close this window.';
const INVALID_STATE_RESPONSE = 'Authentication state is invalid. You can close this window.';
const MISSING_CODE_RESPONSE = 'No authentication code was provided. You can close this window.';
const FAILURE_RESPONSE = 'Authentication failed. You can close this window and try again.';
const INVALID_CALLBACK_RESPONSE = 'Invalid callback URL.';
const DEFAULT_CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

// =============================================================================
// Helpers
// =============================================================================

function hasNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function normalizeScopes(scopes) {
  if (Array.isArray(scopes)) {
    return scopes
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean);
  }

  if (hasNonEmptyString(scopes)) {
    return [String(scopes).trim()];
  }

  return [];
}

function isLoopbackHostname(hostname) {
  const normalized = String(hostname || '').trim().toLowerCase();
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized === '[::1]';
}

function normalizeLoopbackListenHost(hostname) {
  const normalized = String(hostname || '').trim().toLowerCase();
  if (normalized === '[::1]') {
    return '::1';
  }
  return normalized;
}

function normalizeCallbackTimeoutMs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_CALLBACK_TIMEOUT_MS;
  }
  return Math.trunc(parsed);
}

function resolveLoopbackRedirectTemplate(credentialsJson) {
  const root = extractGoogleOAuthCredentialsRoot(credentialsJson);
  const redirectUri = resolveCanonicalRedirectUri(root.redirect_uris);

  let redirectUrl = null;
  try {
    redirectUrl = new URL(redirectUri);
  } catch {
    throw new Error('Google OAuth redirect URI is invalid.');
  }

  if (redirectUrl.protocol !== 'http:') {
    throw new Error('Google OAuth redirect URI must use http for loopback desktop auth.');
  }
  if (!isLoopbackHostname(redirectUrl.hostname)) {
    throw new Error('Google OAuth redirect URI must use a loopback hostname.');
  }

  return redirectUrl;
}

function createCsrfState(randomBytesFn = crypto.randomBytes) {
  return randomBytesFn(24).toString('hex');
}

function writeResponse(res, statusCode, message) {
  if (!res) {
    log.warn('OAuth callback response write failed (ignored): missing response object.', {
      statusCode,
    });
    return;
  }
  if (typeof res.writeHead !== 'function' || typeof res.end !== 'function') {
    log.warn('OAuth callback response write failed (ignored): invalid response object.', {
      statusCode,
      hasWriteHead: typeof res.writeHead === 'function',
      hasEnd: typeof res.end === 'function',
    });
    return;
  }

  try {
    res.writeHead(statusCode, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(message);
  } catch (err) {
    log.warn('OAuth callback response write failed (ignored):', {
      statusCode,
      errorName: String(err && err.name ? err.name : 'Error'),
      errorMessage: String(err && err.message ? err.message : err || ''),
    });
  }
}

function closeServer(server) {
  if (!server) return;
  if (typeof server.close !== 'function') {
    log.warn('OAuth callback server cleanup failed (ignored): invalid server handle.');
    return;
  }
  try {
    server.close();
  } catch (err) {
    log.warn('OAuth callback server cleanup failed (ignored):', {
      errorName: String(err && err.name ? err.name : 'Error'),
      errorMessage: String(err && err.message ? err.message : err || ''),
    });
  }
}

function buildAuthorizationUrl(oauthClient, {
  redirectUri,
  scopes,
  state,
  codeChallenge,
} = {}) {
  return oauthClient.generateAuthUrl({
    redirect_uri: redirectUri,
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
}

// =============================================================================
// Entrypoint
// =============================================================================

async function authenticateGoogleLoopback({
  credentialsJson,
  scopes,
  openExternal,
  httpModule = http,
  randomBytes = crypto.randomBytes,
  callbackTimeoutMs = DEFAULT_CALLBACK_TIMEOUT_MS,
  createOAuthClient = (redirectUri) => buildGoogleOAuthClientFromCredentials(credentialsJson, {
    redirectUri,
  }),
} = {}) {
  if (!credentialsJson || typeof credentialsJson !== 'object') {
    throw new Error('Google OAuth credentials are required.');
  }
  if (typeof openExternal !== 'function') {
    throw new Error('openExternal callback is required for Google OAuth activation.');
  }
  if (!httpModule || typeof httpModule.createServer !== 'function') {
    throw new Error('HTTP server module is required for Google OAuth activation.');
  }

  const normalizedScopes = normalizeScopes(scopes);
  if (normalizedScopes.length === 0) {
    throw new Error('Google OAuth scopes are required.');
  }

  const redirectUrl = resolveLoopbackRedirectTemplate(credentialsJson);
  const listenHost = normalizeLoopbackListenHost(redirectUrl.hostname);
  const listenPort = hasNonEmptyString(redirectUrl.port) ? Number(redirectUrl.port) : 0;
  const effectiveCallbackTimeoutMs = normalizeCallbackTimeoutMs(callbackTimeoutMs);

  let settled = false;
  let oauthClient = null;
  let expectedState = '';
  let codeVerifier = '';
  let server = null;
  let timeoutHandle = null;

  return new Promise((resolve, reject) => {
    const settle = (err, client) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      closeServer(server);
      if (err) {
        reject(err);
        return;
      }
      resolve(client);
    };

    server = httpModule.createServer(async (req, res) => {
      try {
        const callbackUrl = new URL(
          String(req && req.url ? req.url : ''),
          redirectUrl.toString()
        );

        if (callbackUrl.pathname !== redirectUrl.pathname) {
          writeResponse(res, 404, INVALID_CALLBACK_RESPONSE);
          return;
        }

        const errorCode = String(callbackUrl.searchParams.get('error') || '').trim();
        if (errorCode) {
          writeResponse(res, 200, DENIED_RESPONSE);
          const err = new Error(errorCode);
          err.code = 'oauth_access_denied';
          settle(err);
          return;
        }

        const returnedState = String(callbackUrl.searchParams.get('state') || '').trim();
        if (!returnedState || returnedState !== expectedState) {
          writeResponse(res, 400, INVALID_STATE_RESPONSE);
          const err = new Error('Invalid OAuth state.');
          err.code = 'oauth_state_invalid';
          settle(err);
          return;
        }

        const code = String(callbackUrl.searchParams.get('code') || '').trim();
        if (!code) {
          writeResponse(res, 400, MISSING_CODE_RESPONSE);
          const err = new Error('Cannot read authentication code.');
          err.code = 'oauth_missing_code';
          settle(err);
          return;
        }

        const tokenResult = await oauthClient.getToken({
          code,
          redirect_uri: redirectUrl.toString(),
          codeVerifier,
        });
        oauthClient.credentials = tokenResult && tokenResult.tokens ? tokenResult.tokens : {};
        writeResponse(res, 200, SUCCESS_RESPONSE);
        settle(null, oauthClient);
      } catch (err) {
        writeResponse(res, 500, FAILURE_RESPONSE);
        settle(err);
      }
    });

    server.on('error', (err) => {
      settle(err);
    });

    timeoutHandle = setTimeout(() => {
      const err = new Error('OAuth callback timed out.');
      err.code = 'oauth_timeout';
      settle(err);
    }, effectiveCallbackTimeoutMs);
    if (typeof timeoutHandle.unref === 'function') {
      timeoutHandle.unref();
    }

    server.listen(listenPort, listenHost, async () => {
      try {
        const address = server.address();
        if (!address || typeof address !== 'object' || !Number.isFinite(address.port)) {
          throw new Error('Google OAuth callback server did not expose a usable port.');
        }

        redirectUrl.port = String(address.port);
        oauthClient = createOAuthClient(redirectUrl.toString());
        if (!oauthClient || typeof oauthClient !== 'object') {
          throw new Error('Google OAuth client factory returned no client.');
        }
        if (typeof oauthClient.generateCodeVerifierAsync !== 'function'
          || typeof oauthClient.generateAuthUrl !== 'function'
          || typeof oauthClient.getToken !== 'function') {
          throw new Error('Google OAuth client factory returned an invalid client.');
        }

        const verifier = await oauthClient.generateCodeVerifierAsync();
        codeVerifier = String(verifier && verifier.codeVerifier ? verifier.codeVerifier : '').trim();
        const codeChallenge = String(verifier && verifier.codeChallenge ? verifier.codeChallenge : '').trim();
        expectedState = createCsrfState(randomBytes);

        if (!codeVerifier || !codeChallenge || !expectedState) {
          throw new Error('Google OAuth PKCE/state generation failed.');
        }

        const authorizeUrl = buildAuthorizationUrl(oauthClient, {
          redirectUri: redirectUrl.toString(),
          scopes: normalizedScopes,
          state: expectedState,
          codeChallenge,
        });

        await Promise.resolve(openExternal(authorizeUrl));
      } catch (err) {
        settle(err);
      }
    });
  });
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  authenticateGoogleLoopback,
  createCsrfState,
  isLoopbackHostname,
  normalizeLoopbackListenHost,
  resolveLoopbackRedirectTemplate,
};

// =============================================================================
// End of electron/import_extract_platform/ocr_google_drive_secure_oauth.js
// =============================================================================
