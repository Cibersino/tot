'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  resolveGoogleDriveOcrAvailability,
} = require('../../../electron/text_extraction_platform/ocr_google_drive_activation_state');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tot-ocr-activation-state-'));
}

test('returns credentials_missing when credentials file is absent', (t) => {
  const dir = makeTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const tokenPath = path.join(dir, 'token.json');
  fs.writeFileSync(tokenPath, '{}');

  assert.deepEqual(
    resolveGoogleDriveOcrAvailability({
      credentialsPath: path.join(dir, 'missing-credentials.json'),
      tokenPath,
    }),
    {
      available: false,
      errorCode: 'credentials_missing',
      reason: 'credentials_missing',
      checks: {
        credentialsPresent: false,
        tokenPresent: true,
      },
    }
  );
});

test('returns ocr_activation_required when credentials exist but token is absent', (t) => {
  const dir = makeTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const credentialsPath = path.join(dir, 'credentials.json');
  fs.writeFileSync(credentialsPath, '{}');

  assert.deepEqual(
    resolveGoogleDriveOcrAvailability({
      credentialsPath,
      tokenPath: path.join(dir, 'missing-token.json'),
    }),
    {
      available: false,
      errorCode: 'ocr_activation_required',
      reason: 'token_missing',
      checks: {
        credentialsPresent: true,
        tokenPresent: false,
      },
    }
  );
});

test('returns ready when both credentials and token files exist', (t) => {
  const dir = makeTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const credentialsPath = path.join(dir, 'credentials.json');
  const tokenPath = path.join(dir, 'token.json');
  fs.writeFileSync(credentialsPath, '{}');
  fs.writeFileSync(tokenPath, '{}');

  assert.deepEqual(
    resolveGoogleDriveOcrAvailability({
      credentialsPath,
      tokenPath,
    }),
    {
      available: true,
      errorCode: null,
      reason: 'ready',
      checks: {
        credentialsPresent: true,
        tokenPresent: true,
      },
    }
  );
});

