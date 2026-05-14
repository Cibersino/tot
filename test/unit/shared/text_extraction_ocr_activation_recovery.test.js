'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHarness({
  activationResult = null,
  retriedPreparationRun = null,
} = {}) {
  const notifications = [];
  let activationCallCount = 0;
  let retryPrepareCallCount = 0;

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
    path.resolve(__dirname, '../../../public/js/text_extraction_ocr_activation_recovery.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/text_extraction_ocr_activation_recovery.js' });

  const recovery = sandbox.window.TextExtractionOcrActivationRecovery;
  recovery.configure({
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
    recovery,
    notifications,
    getActivationCallCount() {
      return activationCallCount;
    },
    getRetryPrepare() {
      return async () => {
        retryPrepareCallCount += 1;
        return retriedPreparationRun || {
          preparation: {
            ok: true,
            prepareReady: true,
          },
        };
      };
    },
    getRetryPrepareCallCount() {
      return retryPrepareCallCount;
    },
  };
}

function buildRecoverablePreparation() {
  return {
    ok: true,
    prepareFailed: true,
    error: {
      code: 'ocr_activation_required',
    },
    routeMetadata: {
      availableRoutes: ['ocr'],
    },
  };
}

test('OCR activation recovery reuses the shared flow, notifies success, and retries prepare', async () => {
  const harness = createHarness();

  const result = await harness.recovery.recoverAfterSetupFailure({
    preparation: buildRecoverablePreparation(),
    retryPrepare: harness.getRetryPrepare(),
    getOptionalElectronMethod() {
      return null;
    },
    routePreference: 'ocr',
  });

  assert.deepEqual(harness.notifications, [
    'renderer.alerts.text_extraction_ocr_activation_success',
  ]);
  assert.equal(harness.getActivationCallCount(), 1);
  assert.equal(harness.getRetryPrepareCallCount(), 1);
  assert.equal(result.handled, false);
  assert.ok(result.preparationRun);
});

test('OCR activation recovery keeps bridge-unavailable as a non-handled fallback', async () => {
  const harness = createHarness({
    activationResult: {
      ok: false,
      state: 'unavailable',
      stage: 'bridge',
      code: 'bridge_unavailable',
    },
  });

  const preparation = buildRecoverablePreparation();
  const result = await harness.recovery.recoverAfterSetupFailure({
    preparation,
    retryPrepare: harness.getRetryPrepare(),
    getOptionalElectronMethod() {
      return null;
    },
    routePreference: 'ocr',
  });

  assert.deepEqual(harness.notifications, []);
  assert.equal(harness.getActivationCallCount(), 1);
  assert.equal(harness.getRetryPrepareCallCount(), 0);
  assert.equal(result.handled, false);
  assert.equal(result.preparation, preparation);
});

test('OCR activation recovery stays silent when the disclosure is declined', async () => {
  const harness = createHarness({
    activationResult: {
      ok: false,
      state: 'cancelled',
      code: 'ocr_activation_disclosure_declined',
    },
  });

  const preparation = buildRecoverablePreparation();
  const result = await harness.recovery.recoverAfterSetupFailure({
    preparation,
    retryPrepare: harness.getRetryPrepare(),
    getOptionalElectronMethod() {
      return null;
    },
    routePreference: 'ocr',
  });

  assert.deepEqual(harness.notifications, []);
  assert.equal(harness.getActivationCallCount(), 1);
  assert.equal(harness.getRetryPrepareCallCount(), 0);
  assert.equal(result.handled, true);
  assert.equal(result.preparation, preparation);
});

test('OCR activation recovery uses recovery-specific cancellation messaging for launch cancellation', async () => {
  const harness = createHarness({
    activationResult: {
      ok: false,
      state: 'cancelled',
      code: 'ocr_activation_cancelled',
    },
  });

  const preparation = buildRecoverablePreparation();
  const result = await harness.recovery.recoverAfterSetupFailure({
    preparation,
    retryPrepare: harness.getRetryPrepare(),
    getOptionalElectronMethod() {
      return null;
    },
    routePreference: 'ocr',
  });

  assert.deepEqual(harness.notifications, [
    'renderer.alerts.text_extraction_ocr_activation_cancelled',
  ]);
  assert.equal(harness.getActivationCallCount(), 1);
  assert.equal(harness.getRetryPrepareCallCount(), 0);
  assert.equal(result.handled, true);
  assert.equal(result.preparation, preparation);
});
