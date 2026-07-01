'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createStopwatchTimeUtils,
} = require('../../../public/js/lib/stopwatch_time_core');

test('stopwatch_time_core parses valid stopwatch input', () => {
  const utils = createStopwatchTimeUtils();

  assert.equal(utils.parseStopwatchInput('01:20:04'), 4804000);
  assert.equal(utils.parseStopwatchInput('125:09:07'), 450547000);
  assert.equal(utils.parseStopwatchInput('00:00:00'), 0);
});

test('stopwatch_time_core rejects malformed stopwatch input', () => {
  const utils = createStopwatchTimeUtils();

  assert.equal(utils.parseStopwatchInput('1:2:03'), null);
  assert.equal(utils.parseStopwatchInput('01:60:00'), null);
  assert.equal(utils.parseStopwatchInput('abc'), null);
});

test('stopwatch_time_core formats stopwatch milliseconds with floor semantics', () => {
  const utils = createStopwatchTimeUtils();

  assert.equal(utils.formatStopwatchMs(3661999), '01:01:01');
  assert.equal(utils.formatStopwatchMs(0), '00:00:00');
});

test('stopwatch_time_core formats derived seconds with nearest-second rounding', () => {
  const utils = createStopwatchTimeUtils();

  assert.equal(utils.formatRoundedSeconds(3661.49), '01:01:01');
  assert.equal(utils.formatRoundedSeconds(3661.5), '01:01:02');
});
