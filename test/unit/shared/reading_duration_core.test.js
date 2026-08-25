'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  createReadingDurationUtils,
} = require('../../../public/js/lib/reading_duration_core');

test('reading_duration_core rounds exact reading estimates to the nearest second', () => {
  const utils = createReadingDurationUtils();

  assert.equal(utils.getEstimatedReadingSeconds(300, 150), 120);
  assert.equal(utils.getEstimatedReadingSeconds(0, 150), 0);
  assert.equal(utils.getEstimatedReadingSeconds(123, 120), 62);
});

test('reading_duration_core applies multipliers before nearest-second conversion', () => {
  const utils = createReadingDurationUtils();
  const duration = utils.createEstimatedReadingDuration(1, 40);

  assert.equal(utils.getRoundedReadingSeconds(duration), 2);
  assert.equal(utils.getRoundedReadingSeconds(duration, 2), 3);
});

test('reading_duration_core derives inverse reading values from whole seconds exactly', () => {
  const utils = createReadingDurationUtils();

  assert.equal(utils.getWordsForDurationSeconds(300, 180), 900);
  assert.equal(utils.getWordsForDurationSeconds(1, 30), 1);
  assert.equal(utils.getWpmForDurationSeconds(600, 180), 200);
  assert.equal(utils.getWpmForDurationSeconds(1, 40), 2);
  assert.equal(utils.getWpmForDurationSeconds(600, 0), null);
});

test('reading_duration_core rejects invalid estimate inputs without conflating them with zero words', () => {
  const utils = createReadingDurationUtils();
  const zeroDuration = utils.createEstimatedReadingDuration(0, 120);

  assert.equal(utils.isEstimatedReadingDuration(zeroDuration), true);
  assert.equal(utils.getRoundedReadingSeconds(zeroDuration), 0);
  assert.equal(utils.getEstimatedReadingSeconds(0, 120), 0);
  assert.equal(utils.createEstimatedReadingDuration(-1, 120), null);
  assert.equal(utils.getEstimatedReadingSeconds(-1, 120), null);
  assert.equal(utils.createEstimatedReadingDuration(100, 0), null);
  assert.equal(utils.getEstimatedReadingSeconds(100, 0), null);
  assert.equal(utils.createEstimatedReadingDuration(0, 0), null);
  assert.equal(utils.getEstimatedReadingSeconds(0, 0), null);
  assert.equal(utils.createEstimatedReadingDuration(100, 120.5), null);
  assert.equal(utils.getEstimatedReadingSeconds(100, 120.5), null);
});

test('reading_duration_core exposes one browser utility without a renderer wrapper', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/lib/reading_duration_core.js'),
    'utf8'
  );
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: 'public/js/lib/reading_duration_core.js' });

  assert.equal(typeof sandbox.ReadingDurationUtils.getEstimatedReadingSeconds, 'function');
  assert.equal(sandbox.ReadingDurationUtils.getEstimatedReadingSeconds(123, 120), 62);
});
