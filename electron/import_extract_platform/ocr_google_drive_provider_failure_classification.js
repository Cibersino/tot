// electron/import_extract_platform/ocr_google_drive_provider_failure_classification.js
'use strict';

const { PROVIDER_API_DISABLED_CODE } = require('./ocr_google_drive_provider_failure');

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

const AUTH_REASON_CODES = new Set([
  'authError',
  'forbidden',
  'insufficientPermissions',
  'invalidCredentials',
  'unauthorized',
]);

function hasNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function normalizeReasonCode(parsedFailure = {}) {
  if (hasNonEmptyString(parsedFailure.errorsReason)) {
    return String(parsedFailure.errorsReason).trim();
  }
  if (hasNonEmptyString(parsedFailure.errorInfoReason)) {
    return String(parsedFailure.errorInfoReason).trim();
  }
  return '';
}

function classifyCommonGoogleProviderFailure(parsedFailure = {}) {
  const reasonCode = normalizeReasonCode(parsedFailure);
  const statusCode = Number(parsedFailure.statusCode || 0);
  const networkErrorCode = hasNonEmptyString(parsedFailure.networkErrorCode)
    ? String(parsedFailure.networkErrorCode).trim()
    : '';

  if (networkErrorCode) {
    return {
      code: 'connectivity_failed',
      matchedBy: 'network_error_code',
      reasonCode,
    };
  }

  if (parsedFailure.normalizedCategory === PROVIDER_API_DISABLED_CODE) {
    return {
      code: PROVIDER_API_DISABLED_CODE,
      matchedBy: 'provider_api_disabled',
      reasonCode,
    };
  }

  if (statusCode === 429) {
    return {
      code: 'quota_or_rate_limited',
      matchedBy: 'http_429',
      reasonCode,
    };
  }

  if (BILLING_REASON_CODES.has(reasonCode)) {
    return {
      code: 'quota_or_rate_limited',
      matchedBy: 'billing_reason',
      reasonCode,
    };
  }

  if (QUOTA_REASON_CODES.has(reasonCode)) {
    return {
      code: 'quota_or_rate_limited',
      matchedBy: 'quota_reason',
      reasonCode,
    };
  }

  if (statusCode === 401) {
    return {
      code: 'auth_failed',
      matchedBy: 'http_401',
      reasonCode,
    };
  }

  if (AUTH_REASON_CODES.has(reasonCode)) {
    return {
      code: 'auth_failed',
      matchedBy: 'auth_reason',
      reasonCode,
    };
  }

  if (parsedFailure.reasonConflict) {
    return {
      code: 'platform_runtime_failed',
      matchedBy: 'reason_conflict',
      reasonCode,
    };
  }

  if (statusCode >= 500) {
    return {
      code: 'connectivity_failed',
      matchedBy: 'http_5xx',
      reasonCode,
    };
  }

  return {
    code: '',
    matchedBy: '',
    reasonCode,
  };
}

function isRetryableGoogleProviderRateLimit(parsedFailure = {}) {
  return classifyCommonGoogleProviderFailure(parsedFailure).code === 'quota_or_rate_limited';
}

module.exports = {
  classifyCommonGoogleProviderFailure,
  isRetryableGoogleProviderRateLimit,
};
