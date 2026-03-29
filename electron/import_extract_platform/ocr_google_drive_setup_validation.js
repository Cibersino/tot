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

const { google } = require('googleapis');

const { resolveGoogleDriveOcrAvailability } = require('./ocr_google_drive_activation_state');
const { readGoogleOAuthCredentialsFile } = require('./ocr_google_drive_credentials_file');
const {
  PROVIDER_API_DISABLED_CODE,
  parseGoogleProviderFailure,
} = require('./ocr_google_drive_provider_failure');
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

const ERROR_SURFACE = Object.freeze({
  credentials_missing: true,
  credentials_invalid: true,
  [PROVIDER_API_DISABLED_CODE]: true,
  ocr_activation_required: true,
  ocr_token_state_invalid: true,
  auth_failed: true,
  quota_or_rate_limited: true,
  connectivity_failed: true,
  platform_runtime_failed: true,
  unknown: true,
});

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

function parseProbeFailure(err) {
  return parseGoogleProviderFailure(err, safeErrorMessage(err));
}

function classifyApiFailure({
  statusCode,
  errorsReason,
  errorInfoReason,
  normalizedCategory,
  reasonConflict,
  networkErrorCode,
}) {
  if (hasNonEmptyString(networkErrorCode)) {
    return {
      code: 'connectivity_failed',
      issueSubtype: 'network',
    };
  }

  const normalizedReason = String(errorsReason || errorInfoReason || '').trim();

  if (normalizedCategory === PROVIDER_API_DISABLED_CODE) {
    return {
      code: PROVIDER_API_DISABLED_CODE,
      issueSubtype: 'provider_api_disabled',
    };
  }

  if (statusCode === 429) {
    return {
      code: 'quota_or_rate_limited',
      issueSubtype: 'rate_limit',
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

  if (reasonConflict) {
    return {
      code: 'platform_runtime_failed',
      issueSubtype: 'provider_reason_conflict',
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
  const normalizedCode = ERROR_SURFACE[code] ? code : 'unknown';

  return {
    code: normalizedCode,
    detailsSafeForLogs,
  };
}

function buildFailureResult({
  code,
  summary,
  checks,
  detailsSafeForLogs,
}) {
  const state = code === 'ocr_activation_required' ? 'ocr_activation_required' : 'failure';

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
      errorsReason: '',
      errorInfoReason: '',
      normalizedCategory: '',
      reasonConflict: false,
      providerMessage: 'OAuth client transporter is unavailable.',
      providerStatus: '',
      providerService: '',
      providerConsumer: '',
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
      errorsReason: '',
      errorInfoReason: '',
      normalizedCategory: '',
      reasonConflict: false,
      providerMessage: '',
      providerStatus: '',
      providerService: '',
      providerConsumer: '',
      networkErrorCode: '',
    };
  } catch (err) {
    if (timeoutTriggered) {
      return {
        ok: false,
        statusCode: 0,
        errorsReason: '',
        errorInfoReason: '',
        normalizedCategory: '',
        reasonConflict: false,
        providerMessage: 'request_timeout',
        providerStatus: '',
        providerService: '',
        providerConsumer: '',
        networkErrorCode: 'request_timeout',
      };
    }

    const parsedFailure = parseProbeFailure(err);
    return {
      ok: false,
      statusCode: parsedFailure.statusCode,
      errorsReason: String(parsedFailure.errorsReason || ''),
      errorInfoReason: String(parsedFailure.errorInfoReason || ''),
      normalizedCategory: String(parsedFailure.normalizedCategory || ''),
      reasonConflict: !!parsedFailure.reasonConflict,
      providerMessage: parsedFailure.providerMessage,
      providerStatus: parsedFailure.providerStatus,
      providerService: String(parsedFailure.providerService || ''),
      providerConsumer: String(parsedFailure.providerConsumer || ''),
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
  bundledCredentialsFailureCode = '',
  bundledCredentialsFailureReason = '',
  bundledCredentialsFailureDetailsSafeForLogs = {},
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

  if (bundledCredentialsFailureCode) {
    return buildFailureResult({
      code: bundledCredentialsFailureCode,
      summary: 'Google OCR setup validation blocked because bundled credentials are unavailable.',
      checks,
      detailsSafeForLogs: {
        reason: bundledCredentialsFailureReason || 'bundled_credentials_unavailable',
        ...bundledCredentialsFailureDetailsSafeForLogs,
      },
    });
  }

  if (!availability.available) {
    return buildFailureResult({
      code: availability.errorCode || 'credentials_missing',
      summary: 'Google OCR setup validation blocked before API probe.',
      checks,
      detailsSafeForLogs: {
        reason: availability.reason || 'availability_check_failed',
      },
    });
  }

  const credentialsRead = readGoogleOAuthCredentialsFile(credentialsPath);
  if (!credentialsRead.ok) {
    const credentialsCode = credentialsRead.code === 'missing_file'
      ? 'credentials_missing'
      : 'credentials_invalid';
    return buildFailureResult({
      code: credentialsCode,
      summary: 'Google OCR credentials are missing or invalid.',
      checks,
      detailsSafeForLogs: {
        credentialsReadCode: credentialsRead.code || 'invalid_shape',
        credentialsErrorName: credentialsRead.code === 'read_failed'
          ? (credentialsRead.errorName || '')
          : '',
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
    oauthClient = buildGoogleOAuthClient(credentialsRead.parsed, tokenRead.data);
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
  checks.apiReasonCode = String(
    (probeResult && (probeResult.errorsReason || probeResult.errorInfoReason)) || ''
  );

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
    errorsReason: String((probeResult && probeResult.errorsReason) || ''),
    errorInfoReason: String((probeResult && probeResult.errorInfoReason) || ''),
    normalizedCategory: String((probeResult && probeResult.normalizedCategory) || ''),
    reasonConflict: !!(probeResult && probeResult.reasonConflict),
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
      errorsReason: String((probeResult && probeResult.errorsReason) || ''),
      errorInfoReason: String((probeResult && probeResult.errorInfoReason) || ''),
      issueSubtype: classification.issueSubtype,
      providerStatus: String((probeResult && probeResult.providerStatus) || ''),
      providerService: String((probeResult && probeResult.providerService) || ''),
      providerConsumer: String((probeResult && probeResult.providerConsumer) || ''),
      reasonConflict: !!(probeResult && probeResult.reasonConflict),
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
};

// =============================================================================
// End of electron/import_extract_platform/ocr_google_drive_setup_validation.js
// =============================================================================
