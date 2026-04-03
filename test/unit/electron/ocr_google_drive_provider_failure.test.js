'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PROVIDER_API_DISABLED_CODE,
  parseGoogleProviderFailure,
} = require('../../../electron/import_extract_platform/ocr_google_drive_provider_failure');

test('parses provider failure payloads from nested response objects', () => {
  const parsed = parseGoogleProviderFailure({
    response: {
      status: 403,
      data: {
        error: {
          errors: [{ reason: 'accessNotConfigured', message: 'Drive API disabled.' }],
          message: 'Top-level message',
          status: 'PERMISSION_DENIED',
          details: [
            {
              '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
              reason: 'API_DISABLED',
              metadata: {
                service: 'drive.googleapis.com',
                consumer: 'projects/1234567890',
              },
            },
          ],
        },
      },
    },
  }, 'fallback');

  assert.equal(parsed.statusCode, 403);
  assert.equal(parsed.errorsReason, 'accessNotConfigured');
  assert.equal(parsed.errorInfoReason, 'API_DISABLED');
  assert.equal(parsed.providerMessage, 'Drive API disabled.');
  assert.equal(parsed.providerStatus, 'PERMISSION_DENIED');
  assert.equal(parsed.providerService, 'drive.googleapis.com');
  assert.equal(parsed.providerConsumer, 'projects/1234567890');
  assert.equal(parsed.normalizedCategory, PROVIDER_API_DISABLED_CODE);
  assert.equal(parsed.reasonConflict, false);
});

test('parses provider failure payloads from JSON-string response bodies', () => {
  const parsed = parseGoogleProviderFailure({
    response: {
      status: 400,
      data: JSON.stringify({
        error: {
          errors: [{ reason: 'quotaExceeded' }],
          message: 'Quota exceeded.',
          status: 'RESOURCE_EXHAUSTED',
        },
      }),
    },
  }, 'fallback');

  assert.equal(parsed.statusCode, 400);
  assert.equal(parsed.errorsReason, 'quotaExceeded');
  assert.equal(parsed.errorInfoReason, '');
  assert.equal(parsed.providerMessage, 'Quota exceeded.');
  assert.equal(parsed.providerStatus, 'RESOURCE_EXHAUSTED');
  assert.equal(parsed.normalizedCategory, '');
});

test('uses the fallback message when no provider payload is available', () => {
  const parsed = parseGoogleProviderFailure({ code: 'ECONNRESET' }, 'network fallback');

  assert.equal(parsed.statusCode, 0);
  assert.equal(parsed.networkErrorCode, 'ECONNRESET');
  assert.equal(parsed.providerMessage, 'network fallback');
  assert.equal(parsed.errorsReason, '');
  assert.equal(parsed.errorInfoReason, '');
});

test('flags reason conflicts while keeping bounded diagnostics', () => {
  const parsed = parseGoogleProviderFailure({
    response: {
      status: 403,
      data: {
        error: {
          errors: [{ reason: 'accessNotConfigured' }],
          details: [
            {
              '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
              reason: 'SOME_OTHER_REASON',
              metadata: {
                service: 'drive.googleapis.com',
              },
            },
          ],
        },
      },
    },
  }, 'fallback');

  assert.equal(parsed.errorsReason, 'accessNotConfigured');
  assert.equal(parsed.errorInfoReason, 'SOME_OTHER_REASON');
  assert.equal(parsed.reasonConflict, true);
  assert.equal(parsed.normalizedCategory, PROVIDER_API_DISABLED_CODE);
});
