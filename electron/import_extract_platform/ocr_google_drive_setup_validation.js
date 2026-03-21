// electron/import_extract_platform/ocr_google_drive_setup_validation.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Google Drive OCR setup validator for main-process consumers.
// Responsibilities:
// - Check credentials/token file presence before deeper validation runs.
// - Validate credentials and token payload shapes needed for Google OCR use.
// - Optionally probe the Drive API path with a bounded timeout.
// - Classify validation failures into stable setup/auth/quota/connectivity codes.
// - Return a structured validation surface shared by IPC and prepare/activation flows.

// =============================================================================
// Imports
// =============================================================================

const fs = require('fs');
const https = require('https');

const { resolveGoogleDriveOcrAvailability } = require('./ocr_google_drive_activation_state');
const { readEncryptedTokenFile } = require('./ocr_google_drive_token_storage');

// =============================================================================
// Constants / config
// =============================================================================

const DEFAULT_TIMEOUT_MS = 10000;
const MAX_TIMEOUT_MS = 20000;
const MIN_TIMEOUT_MS = 1000;
const DRIVE_REACHABILITY_URL =
  'https://www.googleapis.com/drive/v3/files?pageSize=1&fields=files(id)';

const QUOTA_REASON_CODES = new Set([
  'dailyLimitExceeded',
  'downloadQuotaExceeded',
  'quotaExceeded',
  'rateLimitExceeded',
  'sharingRateLimitExceeded',
  'userRateLimitExceeded',
]);

const BILLING_REASON_CODES = new Set([
  'billingNotEnabled',
  'projectBillingNotFound',
]);

const SETUP_REASON_CODES = new Set([
  'accessNotConfigured',
  'serviceDisabled',
]);

const AUTH_REASON_CODES = new Set([
  'authError',
  'forbidden',
  'insufficientPermissions',
  'invalidCredentials',
  'unauthorized',
]);

const ERROR_SURFACE = {
  setup_incomplete: {
    issueType: 'setup',
    userMessageKey: 'ocr.google_drive.validation.setup_incomplete',
    userMessageFallback:
      'Google OCR setup is incomplete. Add credentials and verify the Drive API setup.',
    userActionKey: 'ocr.google_drive.validation.open_setup_guide',
  },
  credentials_missing: {
    issueType: 'credentials',
    userMessageKey: 'ocr.google_drive.validation.credentials_missing',
    userMessageFallback:
      'Google OCR credentials are missing or invalid in this app instance.',
    userActionKey: 'ocr.google_drive.validation.replace_credentials',
  },
  ocr_activation_required: {
    issueType: 'activation',
    userMessageKey: 'ocr.google_drive.validation.activation_required',
    userMessageFallback:
      'Google OCR is not activated yet. Sign in to continue.',
    userActionKey: 'ocr.google_drive.validation.sign_in',
  },
  auth_failed: {
    issueType: 'auth',
    userMessageKey: 'ocr.google_drive.validation.auth_failed',
    userMessageFallback:
      'Google OCR authentication failed. Reconnect your Google account.',
    userActionKey: 'ocr.google_drive.validation.reconnect',
  },
  quota_or_rate_limited: {
    issueType: 'quota_or_rate',
    userMessageKey: 'ocr.google_drive.validation.quota_or_rate_limited',
    userMessageFallback:
      'Google OCR is temporarily unavailable due to quota/rate limits. Wait and retry.',
    userActionKey: 'ocr.google_drive.validation.wait_then_retry',
  },
  connectivity_failed: {
    issueType: 'connectivity',
    userMessageKey: 'ocr.google_drive.validation.connectivity_failed',
    userMessageFallback:
      'Google OCR validation failed due to a network/connectivity problem.',
    userActionKey: 'ocr.google_drive.validation.retry',
  },
  platform_runtime_failed: {
    issueType: 'platform_runtime',
    userMessageKey: 'ocr.google_drive.validation.platform_runtime_failed',
    userMessageFallback:
      'Google OCR validation failed due to a runtime/platform error.',
    userActionKey: 'ocr.google_drive.validation.retry',
  },
  unknown: {
    issueType: 'unknown',
    userMessageKey: 'ocr.google_drive.validation.unknown',
    userMessageFallback: 'Google OCR validation failed due to an unknown error.',
    userActionKey: 'ocr.google_drive.validation.retry',
  },
};

// =============================================================================
// Helpers
// =============================================================================

function clampTimeoutMs(input) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return DEFAULT_TIMEOUT_MS;
  return Math.max(MIN_TIMEOUT_MS, Math.min(MAX_TIMEOUT_MS, Math.trunc(parsed)));
}

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

function safeReadJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
    if (!raw.trim()) {
      return { ok: false, code: 'empty_file' };
    }
    return { ok: true, data: JSON.parse(raw) };
  } catch (err) {
    if (err && err.code === 'ENOENT') return { ok: false, code: 'missing_file' };
    if (err instanceof SyntaxError) return { ok: false, code: 'invalid_json' };
    return {
      ok: false,
      code: 'read_failed',
      errorName: safeErrorName(err),
      errorMessage: safeErrorMessage(err),
    };
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

function parseTokenShape(parsedToken) {
  if (!parsedToken || typeof parsedToken !== 'object') {
    return {
      valid: false,
      hasAccessToken: false,
      hasRefreshToken: false,
    };
  }

  const hasAccessToken = hasNonEmptyString(parsedToken.access_token);
  const hasRefreshToken = hasNonEmptyString(parsedToken.refresh_token);

  return {
    valid: hasAccessToken || hasRefreshToken,
    hasAccessToken,
    hasRefreshToken,
  };
}

function maybeParseGoogleApiError(rawBody) {
  if (!hasNonEmptyString(rawBody)) return {};

  try {
    const parsed = JSON.parse(rawBody);
    const root = parsed && typeof parsed === 'object' ? parsed.error : null;
    if (!root || typeof root !== 'object') return {};

    const nested = Array.isArray(root.errors) && root.errors.length ? root.errors[0] : null;
    const reasonCode = nested && typeof nested.reason === 'string' ? nested.reason.trim() : '';
    const message = nested && typeof nested.message === 'string'
      ? nested.message.trim()
      : (typeof root.message === 'string' ? root.message.trim() : '');

    return {
      reasonCode,
      providerMessage: message,
      providerStatus: typeof root.status === 'string' ? root.status.trim() : '',
    };
  } catch {
    return {};
  }
}

function classifyApiFailure({ statusCode, reasonCode, networkErrorCode }) {
  if (hasNonEmptyString(networkErrorCode)) {
    return {
      code: 'connectivity_failed',
      issueSubtype: 'network',
    };
  }

  const normalizedReason = String(reasonCode || '').trim();

  if (statusCode === 429) {
    return {
      code: 'quota_or_rate_limited',
      issueSubtype: 'rate_limit',
    };
  }

  if (SETUP_REASON_CODES.has(normalizedReason)) {
    return {
      code: 'setup_incomplete',
      issueSubtype: 'api_not_configured',
    };
  }

  if (BILLING_REASON_CODES.has(normalizedReason)) {
    return {
      code: 'quota_or_rate_limited',
      issueSubtype: 'billing',
    };
  }

  if (QUOTA_REASON_CODES.has(normalizedReason)) {
    return {
      code: 'quota_or_rate_limited',
      issueSubtype: 'quota',
    };
  }

  if (statusCode === 401) {
    return {
      code: 'auth_failed',
      issueSubtype: 'invalid_token',
    };
  }

  if (AUTH_REASON_CODES.has(normalizedReason)) {
    return {
      code: 'auth_failed',
      issueSubtype: 'permission',
    };
  }

  if (statusCode >= 500) {
    return {
      code: 'connectivity_failed',
      issueSubtype: 'provider_unavailable',
    };
  }

  if (statusCode >= 400) {
    return {
      code: 'platform_runtime_failed',
      issueSubtype: 'http_failure',
    };
  }

  return {
    code: 'unknown',
    issueSubtype: 'unknown',
  };
}

function buildErrorSurface(code, detailsSafeForLogs) {
  const surface = ERROR_SURFACE[code] || ERROR_SURFACE.unknown;

  return {
    code,
    issueType: surface.issueType,
    userMessageKey: surface.userMessageKey,
    userMessageFallback: surface.userMessageFallback,
    userActionKey: surface.userActionKey,
    detailsSafeForLogs,
  };
}

function buildFailureResult({
  code,
  summary,
  checks,
  detailsSafeForLogs,
}) {
  const state = code === 'setup_incomplete'
    ? 'setup_incomplete'
    : (code === 'ocr_activation_required' ? 'ocr_activation_required' : 'failure');

  return {
    ok: false,
    state,
    summary,
    checks,
    error: buildErrorSurface(code, detailsSafeForLogs),
  };
}

// =============================================================================
// API probe helper
// =============================================================================

function probeGoogleDriveApiPath({ accessToken, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const effectiveTimeoutMs = clampTimeoutMs(timeoutMs);

  return new Promise((resolve) => {
    let settled = false;

    const settle = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    let req = null;
    try {
      req = https.request(
        DRIVE_REACHABILITY_URL,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
        },
        (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            if (body.length < 32768) {
              body += String(chunk || '');
            }
          });
          res.on('end', () => {
            const statusCode = Number(res.statusCode || 0);
            if (statusCode >= 200 && statusCode < 300) {
              settle({
                ok: true,
                statusCode,
                reasonCode: '',
                providerMessage: '',
                providerStatus: '',
              });
              return;
            }

            const parsed = maybeParseGoogleApiError(body);
            settle({
              ok: false,
              statusCode,
              reasonCode: parsed.reasonCode || '',
              providerMessage: parsed.providerMessage || '',
              providerStatus: parsed.providerStatus || '',
              networkErrorCode: '',
            });
          });
        }
      );
    } catch (err) {
      settle({
        ok: false,
        statusCode: 0,
        reasonCode: '',
        providerMessage: safeErrorMessage(err),
        providerStatus: '',
        networkErrorCode: 'request_init_failed',
      });
      return;
    }

    req.setTimeout(effectiveTimeoutMs, () => {
      try {
        req.destroy(new Error('request_timeout'));
      } catch {
        settle({
          ok: false,
          statusCode: 0,
          reasonCode: '',
          providerMessage: 'request_timeout',
          providerStatus: '',
          networkErrorCode: 'request_timeout',
        });
      }
    });

    req.on('error', (err) => {
      settle({
        ok: false,
        statusCode: 0,
        reasonCode: '',
        providerMessage: safeErrorMessage(err),
        providerStatus: '',
        networkErrorCode: String(err && err.code ? err.code : 'request_error'),
      });
    });

    req.end();
  });
}

// =============================================================================
// Validation entrypoint
// =============================================================================

async function validateGoogleDriveOcrSetup({
  credentialsPath,
  tokenPath,
  probeApiPath = true,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  apiProbe = probeGoogleDriveApiPath,
} = {}) {
  const availability = resolveGoogleDriveOcrAvailability({
    credentialsPath,
    tokenPath,
  });

  const checks = {
    credentialsPresent: !!(availability.checks && availability.checks.credentialsPresent),
    tokenPresent: !!(availability.checks && availability.checks.tokenPresent),
    credentialsValid: false,
    tokenValid: false,
    tokenHasAccessToken: false,
    tokenHasRefreshToken: false,
    apiProbeAttempted: false,
    apiReachable: false,
    apiStatusCode: null,
    apiReasonCode: '',
    apiIssueSubtype: '',
  };

  if (!availability.available) {
    return buildFailureResult({
      code: availability.errorCode || 'setup_incomplete',
      summary: 'Google OCR setup validation blocked before API probe.',
      checks,
      detailsSafeForLogs: {
        reason: availability.reason || 'availability_check_failed',
      },
    });
  }

  const credentialsRead = safeReadJson(credentialsPath);
  if (!credentialsRead.ok || !hasValidCredentialsShape(credentialsRead.data)) {
    return buildFailureResult({
      code: 'credentials_missing',
      summary: 'Google OCR credentials are missing or invalid.',
      checks,
      detailsSafeForLogs: {
        credentialsReadCode: credentialsRead.code || 'invalid_shape',
        credentialsErrorName: credentialsRead.errorName || '',
      },
    });
  }
  checks.credentialsValid = true;

  let tokenRead = {
    ok: false,
    code: 'token_read_failed',
    errorName: '',
    data: null,
  };
  try {
    tokenRead = {
      ok: true,
      code: '',
      errorName: '',
      data: readEncryptedTokenFile(tokenPath),
    };
  } catch (err) {
    tokenRead = {
      ok: false,
      code: String(err && err.code ? err.code : 'token_read_failed'),
      errorName: safeErrorName(err),
      data: null,
    };
  }
  const tokenShape = parseTokenShape(tokenRead.data);
  if (!tokenRead.ok || !tokenShape.valid) {
    return buildFailureResult({
      code: 'ocr_activation_required',
      summary: 'Google OCR token state is missing/invalid or cannot be decrypted.',
      checks,
      detailsSafeForLogs: {
        tokenReadCode: tokenRead.code || 'invalid_shape',
        tokenErrorName: tokenRead.errorName || '',
      },
    });
  }
  checks.tokenValid = true;
  checks.tokenHasAccessToken = tokenShape.hasAccessToken;
  checks.tokenHasRefreshToken = tokenShape.hasRefreshToken;

  if (!probeApiPath) {
    return {
      ok: true,
      state: 'ready',
      summary: 'Google OCR setup validated (API reachability probe skipped).',
      checks,
      error: null,
    };
  }

  if (!checks.tokenHasAccessToken) {
    return buildFailureResult({
      code: 'auth_failed',
      summary: 'Google OCR token is missing an access token for API reachability validation.',
      checks,
      detailsSafeForLogs: {
        reason: 'access_token_missing',
      },
    });
  }

  if (typeof apiProbe !== 'function') {
    return buildFailureResult({
      code: 'platform_runtime_failed',
      summary: 'Google OCR API probe is unavailable.',
      checks,
      detailsSafeForLogs: {
        reason: 'api_probe_missing',
      },
    });
  }

  checks.apiProbeAttempted = true;
  const probeResult = await apiProbe({
    accessToken: tokenRead.data.access_token,
    timeoutMs,
  });

  checks.apiStatusCode = Number.isFinite(probeResult && probeResult.statusCode)
    ? Number(probeResult.statusCode)
    : null;
  checks.apiReasonCode = String((probeResult && probeResult.reasonCode) || '');

  if (probeResult && probeResult.ok) {
    checks.apiReachable = true;
    return {
      ok: true,
      state: 'ready',
      summary: 'Google OCR setup validated and API path reachable.',
      checks,
      error: null,
    };
  }

  const classification = classifyApiFailure({
    statusCode: checks.apiStatusCode || 0,
    reasonCode: checks.apiReasonCode,
    networkErrorCode: String((probeResult && probeResult.networkErrorCode) || ''),
  });
  checks.apiIssueSubtype = classification.issueSubtype;

  return buildFailureResult({
    code: classification.code,
    summary: 'Google OCR API reachability validation failed.',
    checks,
    detailsSafeForLogs: {
      statusCode: checks.apiStatusCode,
      reasonCode: checks.apiReasonCode,
      issueSubtype: classification.issueSubtype,
      providerStatus: String((probeResult && probeResult.providerStatus) || ''),
      networkErrorCode: String((probeResult && probeResult.networkErrorCode) || ''),
      providerMessagePresent: hasNonEmptyString(probeResult && probeResult.providerMessage),
    },
  });
}

// =============================================================================
// Exports / module surface
// =============================================================================

module.exports = {
  validateGoogleDriveOcrSetup,
  probeGoogleDriveApiPath,
};

// =============================================================================
// End of electron/import_extract_platform/ocr_google_drive_setup_validation.js
// =============================================================================
