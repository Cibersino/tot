'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHarness({
  prepareResult = null,
  launchResult = null,
  disclosureAccepted = true,
  missingPrepareMethod = false,
  missingLaunchMethod = false,
} = {}) {
  const notifications = [];
  let prepareCallCount = 0;
  let launchCallCount = 0;
  let disclosurePromptCount = 0;

  const sandbox = {
    window: {
      Notify: {
        notifyMain(key) {
          notifications.push(key);
        },
        async promptTextExtractionOcrActivationDisclosure() {
          disclosurePromptCount += 1;
          return disclosureAccepted;
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
    path.resolve(__dirname, '../../../public/js/text_extraction_ocr_activation_flow.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/text_extraction_ocr_activation_flow.js' });

  const flow = sandbox.window.TextExtractionOcrActivationFlow;
  flow.configure({
    getOptionalElectronMethod(methodName) {
      if (methodName === 'prepareTextExtractionOcrActivation') {
        if (missingPrepareMethod) return null;
        return async () => {
          prepareCallCount += 1;
          return prepareResult || {
            ok: true,
            ready: true,
            code: '',
            alertKey: '',
          };
        };
      }
      if (methodName === 'launchTextExtractionOcrActivation') {
        if (missingLaunchMethod) return null;
        return async () => {
          launchCallCount += 1;
          return launchResult || {
            ok: true,
            state: 'ready',
            code: '',
            alertKey: 'renderer.alerts.text_extraction_ocr_activation_success',
          };
        };
      }
      return null;
    },
  });

  return {
    flow,
    notifications,
    getPrepareCallCount() {
      return prepareCallCount;
    },
    getLaunchCallCount() {
      return launchCallCount;
    },
    getDisclosurePromptCount() {
      return disclosurePromptCount;
    },
  };
}

test('OCR activation flow returns success without notifying directly', async () => {
  const harness = createHarness();

  const result = await harness.flow.startActivationFlow({
    source: 'test',
  });

  assert.equal(result.ok, true);
  assert.equal(result.state, 'success');
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'alertKey'), false);
  assert.deepEqual(harness.notifications, []);
  assert.equal(harness.getPrepareCallCount(), 1);
  assert.equal(harness.getDisclosurePromptCount(), 1);
  assert.equal(harness.getLaunchCallCount(), 1);
});

test('OCR activation flow returns disclosure cancellation without notifying directly', async () => {
  const harness = createHarness({
    disclosureAccepted: false,
  });

  const result = await harness.flow.startActivationFlow({
    source: 'test',
  });

  assert.equal(result.ok, false);
  assert.equal(result.state, 'cancelled');
  assert.equal(result.stage, 'disclosure');
  assert.equal(result.code, 'ocr_activation_disclosure_declined');
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'alertKey'), false);
  assert.deepEqual(harness.notifications, []);
  assert.equal(harness.getPrepareCallCount(), 1);
  assert.equal(harness.getDisclosurePromptCount(), 1);
  assert.equal(harness.getLaunchCallCount(), 0);
});

test('OCR activation flow returns bridge-unavailable when activation IPC is missing', async () => {
  const harness = createHarness({
    missingLaunchMethod: true,
  });

  const result = await harness.flow.startActivationFlow({
    source: 'test',
  });

  assert.equal(result.ok, false);
  assert.equal(result.state, 'unavailable');
  assert.equal(result.stage, 'bridge');
  assert.equal(result.code, 'bridge_unavailable');
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'alertKey'), false);
  assert.deepEqual(harness.notifications, []);
  assert.equal(harness.getPrepareCallCount(), 0);
  assert.equal(harness.getDisclosurePromptCount(), 0);
  assert.equal(harness.getLaunchCallCount(), 0);
});
