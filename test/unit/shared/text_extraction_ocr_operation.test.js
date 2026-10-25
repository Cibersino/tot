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

function createHarness() {
  const notifications = [];
  const disclosure = deferred();
  const disconnect = deferred();
  let prompts = 0;
  let launches = 0;
  let disconnects = 0;
  const log = { debug() {}, info() {}, warn() {}, error() {} };
  const window = {
    getLogger: () => log,
    Notify: {
      notifyMain: (key) => notifications.push(key),
      promptTextExtractionOcrActivationDisclosure() { prompts += 1; return disclosure.promise; },
    },
  };
  const context = vm.createContext({ window, console });
  for (const name of ['text_extraction_ocr_connection_flow',
    'text_extraction_ocr_activation', 'text_extraction_ocr_activation_recovery', 'text_extraction_ocr_disconnect']) {
    const filename = path.resolve(__dirname, '../../../public/js', `${name}.js`);
    vm.runInContext(fs.readFileSync(filename, 'utf8'), context, { filename });
  }
  const getOptionalElectronMethod = (name) => {
    if (name === 'prepareTextExtractionOcrActivation') return async () => ({ ok: true, ready: true });
    if (name === 'launchTextExtractionOcrActivation') return async () => { launches += 1; return { ok: true }; };
    if (name === 'disconnectTextExtractionOcr') return () => { disconnects += 1; return disconnect.promise; };
    return null;
  };
  window.TextExtractionOcrConnectionFlow.configure({ getOptionalElectronMethod });
  window.TextExtractionOcrActivation.configure({ ocrConnectionFlow: window.TextExtractionOcrConnectionFlow });
  window.TextExtractionOcrActivationRecovery.configure({ ocrConnectionFlow: window.TextExtractionOcrConnectionFlow });
  window.TextExtractionOcrDisconnect.configure({ getOptionalElectronMethod, ocrConnectionFlow: window.TextExtractionOcrConnectionFlow });
  return { window, notifications, disclosure, disconnect, counts: () => ({ prompts, launches, disconnects }) };
}

test('an active Preferences disclosure rejects recovery and disconnect and releases after cancellation', async () => {
  const h = createHarness();
  const first = h.window.TextExtractionOcrActivation.startFromPreferencesMenu();
  await Promise.resolve();
  const recovery = await h.window.TextExtractionOcrActivationRecovery.recoverAfterSetupFailure({
    preparation: { ok: true, prepareFailed: true, error: { code: 'ocr_activation_required' }, routeMetadata: { availableRoutes: ['ocr'] } },
    retryPrepare: async () => { throw new Error('busy recovery must not retry'); },
    getOptionalElectronMethod() {},
  });
  await h.window.TextExtractionOcrDisconnect.startFromPreferencesMenu();
  assert.equal(recovery.handled, true);
  assert.deepEqual(h.notifications, [
    'renderer.text_extraction.alerts.ocr.operation_in_progress',
    'renderer.text_extraction.alerts.ocr.operation_in_progress',
  ]);
  assert.deepEqual(h.counts(), { prompts: 1, launches: 0, disconnects: 0 });
  h.disclosure.resolve(false);
  assert.equal((await first).code, 'ocr_activation_disclosure_declined');
  const next = h.window.TextExtractionOcrDisconnect.startFromPreferencesMenu();
  assert.equal(h.counts().disconnects, 1);
  h.disconnect.resolve({ ok: true, alertKey: 'disconnect_success' });
  await next;
  assert.equal(h.notifications.at(-1), 'disconnect_success');
});

test('an active disconnect rejects activation and releases after a bridge failure', async () => {
  const h = createHarness();
  const first = h.window.TextExtractionOcrDisconnect.startFromPreferencesMenu();
  const activation = await h.window.TextExtractionOcrActivation.startFromPreferencesMenu();
  assert.equal(activation.code, 'ocr_operation_in_progress');
  assert.equal(h.counts().prompts, 0);
  h.disconnect.reject(new Error('bridge failure'));
  await first;
  const next = h.window.TextExtractionOcrActivation.startFromPreferencesMenu();
  await Promise.resolve();
  h.disclosure.resolve(true);
  assert.equal((await next).ok, true);
  assert.equal(h.counts().launches, 1);
});

test('recovery activation rejects a concurrent Preferences activation and retries after consent', async () => {
  const h = createHarness();
  let retries = 0;
  const first = h.window.TextExtractionOcrActivationRecovery.recoverAfterSetupFailure({
    preparation: { ok: true, prepareFailed: true, error: { code: 'ocr_activation_required' }, routeMetadata: { availableRoutes: ['ocr'] } },
    retryPrepare: async () => { retries += 1; return { preparation: { ok: true } }; },
    getOptionalElectronMethod() {},
  });
  await Promise.resolve();
  const second = await h.window.TextExtractionOcrActivation.startFromPreferencesMenu();
  assert.equal(second.code, 'ocr_operation_in_progress');
  assert.equal(h.counts().prompts, 1);
  h.disclosure.resolve(true);
  assert.equal((await first).handled, false);
  assert.equal(retries, 1);
  assert.equal(h.counts().launches, 1);
});

test('a busy main-process launch produces the same user feedback', async () => {
  const h = createHarness();
  h.window.TextExtractionOcrConnectionFlow.configure({
    getOptionalElectronMethod(name) {
      return name === 'prepareTextExtractionOcrActivation'
        ? async () => ({ ok: true, ready: true })
        : async () => ({ ok: false, code: 'ocr_operation_in_progress' });
    },
  });
  h.disclosure.resolve(true);
  const result = await h.window.TextExtractionOcrActivation.startFromPreferencesMenu();
  assert.equal(result.code, 'ocr_operation_in_progress');
  assert.equal(h.notifications[0], 'renderer.text_extraction.alerts.ocr.operation_in_progress');
});

test('a busy main-process disconnect produces the same user feedback', async () => {
  const h = createHarness();
  h.window.TextExtractionOcrDisconnect.configure({
    ocrConnectionFlow: h.window.TextExtractionOcrConnectionFlow,
    getOptionalElectronMethod: () => async () => ({
      ok: false,
      code: 'ocr_operation_in_progress',
      alertKey: 'renderer.text_extraction.alerts.ocr.operation_in_progress',
    }),
  });
  await h.window.TextExtractionOcrDisconnect.startFromPreferencesMenu();
  assert.deepEqual(h.notifications, ['renderer.text_extraction.alerts.ocr.operation_in_progress']);
});
