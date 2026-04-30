'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PROVIDER_API_DISABLED_CODE,
} = require('../../../electron/text_extraction_platform/ocr_google_drive_provider_failure');
const {
  classifyCommonGoogleProviderFailure,
  isRetryableGoogleProviderRateLimit,
} = require('../../../electron/text_extraction_platform/ocr_google_drive_provider_failure_classification');

test('classifies HTTP 429 as quota or rate limited', () => {
  assert.deepEqual(
    classifyCommonGoogleProviderFailure({ statusCode: 429 }),
    {
      code: 'quota_or_rate_limited',
      matchedBy: 'http_429',
      reasonCode: '',
    }
  );
});

test('classifies known quota reasons as quota or rate limited', () => {
  assert.deepEqual(
    classifyCommonGoogleProviderFailure({ errorsReason: 'quotaExceeded' }),
    {
      code: 'quota_or_rate_limited',
      matchedBy: 'quota_reason',
      reasonCode: 'quotaExceeded',
    }
  );
});

test('classifies auth failures by status code and reason', () => {
  assert.deepEqual(
    classifyCommonGoogleProviderFailure({ statusCode: 401 }),
    {
      code: 'auth_failed',
      matchedBy: 'http_401',
      reasonCode: '',
    }
  );

  assert.deepEqual(
    classifyCommonGoogleProviderFailure({ errorsReason: 'insufficientPermissions' }),
    {
      code: 'auth_failed',
      matchedBy: 'auth_reason',
      reasonCode: 'insufficientPermissions',
    }
  );
});

test('classifies connectivity failures by network error code and http 5xx', () => {
  assert.deepEqual(
    classifyCommonGoogleProviderFailure({ networkErrorCode: 'ECONNRESET' }),
    {
      code: 'connectivity_failed',
      matchedBy: 'network_error_code',
      reasonCode: '',
    }
  );

  assert.deepEqual(
    classifyCommonGoogleProviderFailure({ statusCode: 503 }),
    {
      code: 'connectivity_failed',
      matchedBy: 'http_5xx',
      reasonCode: '',
    }
  );
});

test('classifies provider_api_disabled and conflict fallbacks', () => {
  assert.deepEqual(
    classifyCommonGoogleProviderFailure({ normalizedCategory: PROVIDER_API_DISABLED_CODE }),
    {
      code: PROVIDER_API_DISABLED_CODE,
      matchedBy: 'provider_api_disabled',
      reasonCode: '',
    }
  );

  assert.deepEqual(
    classifyCommonGoogleProviderFailure({
      reasonConflict: true,
      errorsReason: 'foo',
      errorInfoReason: 'bar',
    }),
    {
      code: 'platform_runtime_failed',
      matchedBy: 'reason_conflict',
      reasonCode: 'foo',
    }
  );
});

test('retryability helper mirrors quota classification only', () => {
  assert.equal(
    isRetryableGoogleProviderRateLimit({ errorsReason: 'rateLimitExceeded' }),
    true
  );
  assert.equal(
    isRetryableGoogleProviderRateLimit({ statusCode: 401 }),
    false
  );
});

