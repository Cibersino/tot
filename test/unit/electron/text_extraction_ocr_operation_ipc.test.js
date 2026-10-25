'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function createHarness({ holdValidation = false, holdRevocation = false } = {}) {
  const mainWin = {};
  const oauth = deferred();
  const confirmation = deferred();
  const validation = deferred();
  const revocation = deferred();
  let writes = 0;
  let deletes = 0;
  const handlers = new Map();
  const operation = require('../../../electron/text_extraction_platform/ocr_google_drive_operation');
  const log = { debug() {}, info() {}, warn() {}, warnOnce() {}, error() {} };
  const mocks = {
    electron: { BrowserWindow: { fromWebContents: (sender) => sender.window }, shell: { openExternal() {} }, dialog: { showMessageBox: () => confirmation.promise } },
    '../log': { get: () => log },
    '../constants_main': { DEFAULT_LANG: 'es' },
    '../settings': { getSettings: () => ({ language: 'en' }) },
    '../menu_builder': { getDialogTexts: () => ({}), resolveDialogText: (_texts, key) => key },
    './ocr_google_drive_operation': operation,
    './ocr_google_drive_provider_failure': {},
    './ocr_google_drive_credentials_file': { readGoogleOAuthCredentialsFile: () => ({ ok: true, parsed: {} }) },
    './ocr_google_drive_oauth_client': {
      describePersistedGoogleToken: () => ({ acceptablePersistedTokenShape: true }),
      selectPreferredRevocationToken: () => ({ token: 'token', kind: 'refresh' }),
      buildGoogleTokenRevocationClient: () => ({ revokeToken: () => holdRevocation ? revocation.promise : Promise.resolve() }),
    },
    './ocr_google_drive_secure_oauth': { authenticateGoogleLoopback: () => oauth.promise },
    './ocr_google_drive_setup_validation': { validateGoogleDriveOcrSetup: () => holdValidation ? validation.promise : Promise.resolve({ ok: true }) },
    './ocr_google_drive_token_storage': { readEncryptedTokenFile: () => ({ refresh_token: 'token' }), writeEncryptedTokenFile() { writes += 1; }, deleteEncryptedTokenFile() { deletes += 1; } },
  };
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  for (const name of ['text_extraction_ocr_activation_ipc', 'text_extraction_ocr_disconnect_ipc']) {
    const filename = path.resolve(__dirname, '../../../electron/text_extraction_platform', `${name}.js`);
    const module = { exports: {} };
    const load = (id) => Object.hasOwn(mocks, id) ? mocks[id] : require(id);
    const wrapper = vm.runInThisContext(`(function(require, module, exports) { ${fs.readFileSync(filename, 'utf8')}\n})`, { filename });
    wrapper(load, module, module.exports);
    module.exports.registerIpc(ipcMain, { getWindows: () => ({ mainWin }), resolvePaths: () => ({ credentialsPath: 'credentials', tokenPath: 'token' }) });
  }
  const event = { sender: { window: mainWin } };
  return { oauth, confirmation, validation, revocation, counts: () => ({ writes, deletes }), invoke: (channel) => handlers.get(channel)(event) };
}

test('main handlers reject disconnect and a second launch while OAuth runs, then release on failure', async () => {
  const h = createHarness();
  const first = h.invoke('text-extraction-launch-ocr-activation');
  assert.equal((await h.invoke('text-extraction-disconnect-ocr')).code, 'ocr_operation_in_progress');
  assert.equal((await h.invoke('text-extraction-launch-ocr-activation')).code, 'ocr_operation_in_progress');
  h.oauth.reject(new Error('OAuth failed'));
  assert.equal((await first).ok, false);
  const disconnect = h.invoke('text-extraction-disconnect-ocr');
  h.confirmation.resolve({ response: 1 });
  assert.equal((await disconnect).cancelled, true);
});

test('main handlers reject activation while disconnect confirmation is pending, then release on cancellation', async () => {
  const h = createHarness();
  const first = h.invoke('text-extraction-disconnect-ocr');
  assert.equal((await h.invoke('text-extraction-launch-ocr-activation')).code, 'ocr_operation_in_progress');
  assert.equal((await h.invoke('text-extraction-disconnect-ocr')).code, 'ocr_operation_in_progress');
  h.confirmation.resolve({ response: 1 });
  assert.equal((await first).cancelled, true);
  const activation = h.invoke('text-extraction-launch-ocr-activation');
  h.oauth.reject(new Error('OAuth failed'));
  assert.notEqual((await activation).code, 'ocr_operation_in_progress');
});

test('activation retains admission after token write until validation completes', async () => {
  const h = createHarness({ holdValidation: true });
  const first = h.invoke('text-extraction-launch-ocr-activation');
  h.oauth.resolve({ credentials: { refresh_token: 'token' } });
  await Promise.resolve();
  assert.equal(h.counts().writes, 1);
  assert.equal((await h.invoke('text-extraction-disconnect-ocr')).code, 'ocr_operation_in_progress');
  h.validation.resolve({ ok: true });
  assert.equal((await first).ok, true);
  const next = h.invoke('text-extraction-disconnect-ocr');
  h.confirmation.resolve({ response: 1 });
  assert.equal((await next).cancelled, true);
});

test('disconnect retains admission during revocation until the token is deleted', async () => {
  const h = createHarness({ holdRevocation: true });
  const first = h.invoke('text-extraction-disconnect-ocr');
  h.confirmation.resolve({ response: 0 });
  await Promise.resolve();
  assert.equal((await h.invoke('text-extraction-launch-ocr-activation')).code, 'ocr_operation_in_progress');
  assert.equal(h.counts().deletes, 0);
  h.revocation.resolve();
  assert.equal((await first).ok, true);
  assert.equal(h.counts().deletes, 1);
});
