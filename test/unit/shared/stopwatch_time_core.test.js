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

test('stopwatch_time_core parses and formats canonical whole-second clock durations directly', () => {
  const utils = createStopwatchTimeUtils();
  const input = '2501922841124:19:55';

  assert.equal(utils.parseClockSeconds(input), 9006922228047595);
  assert.equal(utils.formatClockSeconds(9006922228047595), input);
  assert.deepEqual(utils.getClockTimeParts(9006922228047595), {
    hours: 2501922841124,
    minutes: 19,
    seconds: 55,
  });
});

test('stopwatch_time_core rejects invalid whole-second clock values instead of formatting zero', () => {
  const utils = createStopwatchTimeUtils();

  assert.equal(utils.formatClockSeconds(-1), null);
  assert.equal(utils.formatClockSeconds(1.5), null);
  assert.equal(utils.getClockTimeParts(-1), null);
  assert.equal(utils.getClockTimeParts(1.5), null);
});

test('stopwatch_time_core rejects malformed stopwatch input', () => {
  const utils = createStopwatchTimeUtils();

  assert.equal(utils.parseStopwatchInput('1:2:03'), null);
  assert.equal(utils.parseStopwatchInput('01:60:00'), null);
  assert.equal(utils.parseStopwatchInput('abc'), null);
  assert.equal(utils.parseStopwatchInput({ toString: () => '01:02:03' }), null);
  assert.equal(utils.parseClockSeconds('1:2:03'), null);
  assert.equal(utils.parseClockSeconds('01:60:00'), null);
  assert.equal(utils.parseClockSeconds('abc'), null);
  assert.equal(utils.parseClockSeconds({ toString: () => '01:02:03' }), null);
});

test('stopwatch_time_core formats stopwatch milliseconds with floor semantics', () => {
  const utils = createStopwatchTimeUtils();

  assert.equal(utils.formatStopwatchMs(3661999), '01:01:01');
  assert.equal(utils.formatStopwatchMs(0), '00:00:00');
});
