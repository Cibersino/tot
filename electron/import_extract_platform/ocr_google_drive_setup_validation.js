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
const { google } = require('googleapis');

const { resolveGoogleDriveOcrAvailability } = require('./ocr_google_drive_activation_state');
const {
  buildGoogleOAuthClient,
  describePersistedGoogleToken,
} = require('./ocr_google_drive_oauth_client');
const { readEncryptedTokenFile } = require('./ocr_google_drive_token_storage');

// =============================================================================
// Constants / config
// =============================================================================

const DEFAULT_TIMEOUT_MS = 10000;
const MAX_TIMEOUT_MS = 20000;
const MIN_TIMEOUT_MS = 1000;

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

const INVALID_PERSISTED_TOKEN_CODES = new Set([
  'empty_file',
  'invalid_json',
  'invalid_token_format',
  'decrypt_failed',
  'invalid_token_payload',
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
      'Google OCR is unavailable because this app build is missing bundled Google OAuth credentials.',
    userActionKey: 'ocr.google_drive.validation.check_app_build',
  },
  credentials_missing: {
    issueType: 'credentials',
    userMessageKey: 'ocr.google_drive.validation.credentials_missing',
    userMessageFallback:
      'Google OCR is unavailable because the bundled Google OAuth credentials are missing or invalid in this app instance.',
    userActionKey: 'ocr.google_drive.validation.check_app_build',
  },
  ocr_activation_required: {
    issueType: 'activation',
    userMessageKey: 'ocr.google_drive.validation.activation_required',
    userMessageFallback:
      'Google OCR is not activated yet. Sign in to continue.',
    userActionKey: 'ocr.google_drive.validation.sign_in',
  },
  ocr_token_state_invalid: {
    issueType: 'token_state',
    userMessageKey: 'ocr.google_drive.validation.token_state_invalid',
    userMessageFallback:
      'Google OCR saved sign-in state is invalid. Reconnect your Google account.',
    userActionKey: 'ocr.google_drive.validation.reconnect',
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

function maybeParseGoogleApiError(rawBody) {
  if (!rawBody) return {};

  if (typeof rawBody === 'string') {
    if (!hasNonEmptyString(rawBody)) return {};
    try {
      return maybeParseGoogleApiError(JSON.parse(rawBody));
    } catch {
      return {};
    }
  }

  if (typeof rawBody !== 'object') return {};

  const root = rawBody && typeof rawBody.error === 'object' ? rawBody.error : null;
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
}

function parseProbeFailure(err) {
  const statusCode = Number(
    err && err.response && err.response.status
      ? err.response.status
      : (typeof err.code === 'number' ? err.code : 0)
  ) || 0;

  const parsed = maybeParseGoogleApiError(err && err.response ? err.response.data : null);

  return {
    statusCode,
    reasonCode: String(parsed.reasonCode || ''),
    providerMessage: String(parsed.providerMessage || safeErrorMessage(err)),
    providerStatus: String(parsed.providerStatus || ''),
    networkErrorCode: typeof err.code === 'string' ? err.code.trim() : '',
  };
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

function classifyPersistedTokenReadFailure(tokenReadCode) {
  const normalized = String(tokenReadCode || '').trim();
  if (normalized === 'missing_file') {
    return {
      code: 'ocr_activation_required',
      summary: 'Google OCR setup validation blocked because activation is required.',
    };
  }
  if (INVALID_PERSISTED_TOKEN_CODES.has(normalized)) {
    return {
      code: 'ocr_token_state_invalid',
      summary: 'Google OCR token state is invalid or cannot be decrypted.',
    };
  }
  return {
    code: 'platform_runtime_failed',
    summary: 'Google OCR token state could not be read due to a runtime/platform error.',
  };
}

// =============================================================================
// API probe helper
// =============================================================================

async function probeGoogleDriveApiPath({ oauthClient, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const effectiveTimeoutMs = clampTimeoutMs(timeoutMs);
  const abortController = new AbortController();
  const drive = google.drive({ version: 'v3', auth: oauthClient });
  const originalTransporter = oauthClient && typeof oauthClient === 'object'
    ? oauthClient.transporter
    : null;
  let timeoutTriggered = false;
  let timeoutHandle = null;

  if (!originalTransporter || typeof originalTransporter.request !== 'function') {
    return {
      ok: false,
      statusCode: 400,
      reasonCode: '',
      providerMessage: 'OAuth client transporter is unavailable.',
      providerStatus: '',
      networkErrorCode: '',
    };
  }

  const wrappedTransporter = Object.create(originalTransporter);
  wrappedTransporter.request = (opts = {}) => originalTransporter.request.call(
    originalTransporter,
    {
      ...opts,
      signal: opts.signal || abortController.signal,
      timeout: Number.isFinite(opts.timeout) && opts.timeout > 0
        ? opts.timeout
        : effectiveTimeoutMs,
    }
  );

  oauthClient.transporter = wrappedTransporter;
  timeoutHandle = setTimeout(() => {
    timeoutTriggered = true;
    abortController.abort();
  }, effectiveTimeoutMs);

  try {
    const response = await drive.files.list(
      {
        pageSize: 1,
        fields: 'files(id)',
      },
      {
        signal: abortController.signal,
        timeout: effectiveTimeoutMs,
      }
    );
    const statusCode = Number(response && response.status ? response.status : 200) || 200;

    return {
      ok: true,
      statusCode,
      reasonCode: '',
      providerMessage: '',
      providerStatus: '',
      networkErrorCode: '',
    };
  } catch (err) {
    if (timeoutTriggered) {
      return {
        ok: false,
        statusCode: 0,
        reasonCode: '',
        providerMessage: 'request_timeout',
        providerStatus: '',
        networkErrorCode: 'request_timeout',
      };
    }

    const parsedFailure = parseProbeFailure(err);
    return {
      ok: false,
      statusCode: parsedFailure.statusCode,
      reasonCode: parsedFailure.reasonCode,
      providerMessage: parsedFailure.providerMessage,
      providerStatus: parsedFailure.providerStatus,
      networkErrorCode: parsedFailure.networkErrorCode,
    };
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    oauthClient.transporter = originalTransporter;
  }
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
  const tokenState = describePersistedGoogleToken(tokenRead.data);
  if (!tokenRead.ok) {
    const tokenFailure = classifyPersistedTokenReadFailure(tokenRead.code);
    return buildFailureResult({
      code: tokenFailure.code,
      summary: tokenFailure.summary,
      checks,
      detailsSafeForLogs: {
        tokenReadCode: tokenRead.code || 'token_read_failed',
        tokenErrorName: tokenRead.errorName || '',
      },
    });
  }
  if (!tokenState.acceptablePersistedTokenShape) {
    return buildFailureResult({
      code: 'ocr_token_state_invalid',
      summary: 'Google OCR token state is invalid or cannot be decrypted.',
      checks,
      detailsSafeForLogs: {
        tokenReadCode: tokenRead.code || 'invalid_shape',
        tokenErrorName: tokenRead.errorName || '',
      },
    });
  }
  checks.tokenValid = true;
  checks.tokenHasAccessToken = tokenState.hasAccessToken;
  checks.tokenHasRefreshToken = tokenState.hasRefreshToken;

  if (!probeApiPath) {
    return {
      ok: true,
      state: 'ready',
      summary: 'Google OCR setup validated (API reachability probe skipped).',
      checks,
      error: null,
    };
  }

  let oauthClient = null;
  try {
    oauthClient = buildGoogleOAuthClient(credentialsRead.data, tokenRead.data);
  } catch (err) {
    return buildFailureResult({
      code: 'platform_runtime_failed',
      summary: 'Google OCR OAuth client initialization failed for setup validation.',
      checks,
      detailsSafeForLogs: {
        reason: 'oauth_client_init_failed',
        errorName: safeErrorName(err),
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
    oauthClient,
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
      summary: 'Google OCR setup validated and API path reachable through OAuth client.',
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
