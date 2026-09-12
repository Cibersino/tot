'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  createTaskDurationUtils,
} = require('../../../public/js/lib/task_duration_core');

test('task_duration_core exposes its API to CommonJS without a global side effect', () => {
  assert.equal(typeof createTaskDurationUtils, 'function');
  assert.equal(globalThis.TaskDurationCore, undefined);
});

test('task_duration_core exposes its API as a browser global', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/lib/task_duration_core.js'),
    'utf8'
  );
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'public/js/lib/task_duration_core.js' });

  assert.equal(typeof sandbox.TaskDurationCore.createTaskDurationUtils, 'function');
});

test('task_duration_core derives per-row remaining seconds with exact hundredths', () => {
  const utils = createTaskDurationUtils();

  assert.equal(utils.getRowRemainingSeconds(5, 80), 1);
  assert.equal(utils.getRowRemainingSeconds(1, 50), 0);
});

test('task_duration_core aggregates remaining hundredths before flooring', () => {
  const utils = createTaskDurationUtils();
  const summaryResult = utils.deriveTaskSummary([
    { tiempoSeconds: 1, percentComplete: 1 },
    { tiempoSeconds: 29, percentComplete: 31 },
  ]);

  assert.deepEqual(summaryResult, {
    ok: true,
    summary: {
      estimatedTotalSeconds: 30,
      estimatedRemainingSeconds: 21,
    },
  });
});

test('task_duration_core preserves aggregate residuals below one second per row', () => {
  const utils = createTaskDurationUtils();
  const summaryResult = utils.deriveTaskSummary([
    { tiempoSeconds: 1, percentComplete: 50 },
    { tiempoSeconds: 1, percentComplete: 50 },
  ]);

  assert.deepEqual(summaryResult, {
    ok: true,
    summary: {
      estimatedTotalSeconds: 2,
      estimatedRemainingSeconds: 1,
    },
  });
});

test('task_duration_core rejects noncanonical Task Editor duration values', () => {
  const utils = createTaskDurationUtils();

  assert.equal(utils.isWholeDurationSeconds(12.5), false);
  assert.equal(utils.isPercentComplete(25.5), false);
  assert.deepEqual(utils.deriveTaskSummary([]), {
    ok: true,
    summary: null,
  });
  assert.deepEqual(utils.deriveTaskSummary([{ tiempoSeconds: 12.5, percentComplete: 0 }]), {
    ok: false,
    code: 'INVALID_ROW_DURATION',
  });
});

test('task_duration_core rejects a valid-row aggregate that cannot be represented safely', () => {
  const utils = createTaskDurationUtils();

  assert.deepEqual(utils.deriveTaskSummary([
    { tiempoSeconds: Number.MAX_SAFE_INTEGER, percentComplete: 0 },
    { tiempoSeconds: 1, percentComplete: 0 },
  ]), {
    ok: false,
    code: 'INVALID_SUMMARY',
  });
});
