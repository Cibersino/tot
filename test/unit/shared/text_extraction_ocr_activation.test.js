'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHarness({
  activationResult = null,
} = {}) {
  const notifications = [];
  let activationCallCount = 0;

  const sandbox = {
    window: {
      Notify: {
        notifyMain(key) {
          notifications.push(key);
        },
      },
      getLogger() {
        return {
          debug() {},
          info() {},
          warn() {},
          warnOnce() {},
          error() {},
        };
      },
    },
    console,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/text_extraction_ocr_activation.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/text_extraction_ocr_activation.js' });

  const activation = sandbox.window.TextExtractionOcrActivation;
  activation.configure({
    ocrActivationFlow: {
      async startActivationFlow() {
        activationCallCount += 1;
        return activationResult || {
          ok: true,
          state: 'success',
        };
      },
    },
  });

  return {
    activation,
    notifications,
    getActivationCallCount() {
      return activationCallCount;
    },
  };
}

test('Preferences-menu OCR activation notifies success after the shared flow succeeds', async () => {
  const harness = createHarness();

  const result = await harness.activation.startFromPreferencesMenu();

  assert.equal(result.ok, true);
  assert.deepEqual(harness.notifications, [
    'renderer.alerts.text_extraction_ocr_enable_success',
  ]);
  assert.equal(harness.getActivationCallCount(), 1);
});

test('Preferences-menu OCR activation stays silent when the disclosure is declined', async () => {
  const harness = createHarness({
    activationResult: {
      ok: false,
      state: 'cancelled',
      code: 'ocr_activation_disclosure_declined',
    },
  });

  const result = await harness.activation.startFromPreferencesMenu();

  assert.equal(result.ok, false);
  assert.deepEqual(harness.notifications, []);
  assert.equal(harness.getActivationCallCount(), 1);
});

test('Preferences-menu OCR activation forwards activation failure alerts from the shared flow', async () => {
  const harness = createHarness({
    activationResult: {
      ok: false,
      state: 'cancelled',
      code: 'ocr_activation_cancelled',
    },
  });

  const result = await harness.activation.startFromPreferencesMenu();

  assert.equal(result.ok, false);
  assert.deepEqual(harness.notifications, [
    'renderer.alerts.text_extraction_ocr_enable_cancelled',
  ]);
  assert.equal(harness.getActivationCallCount(), 1);
});

test('Preferences-menu OCR activation uses setup-specific alerts for credential failures', async () => {
  const harness = createHarness({
    activationResult: {
      ok: false,
      state: 'failure',
      code: 'credentials_missing',
    },
  });

  const result = await harness.activation.startFromPreferencesMenu();

  assert.equal(result.ok, false);
  assert.deepEqual(harness.notifications, [
    'renderer.alerts.text_extraction_ocr_setup_missing_credentials',
  ]);
  assert.equal(harness.getActivationCallCount(), 1);
});
