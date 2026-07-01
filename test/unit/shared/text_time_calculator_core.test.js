'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createStopwatchTimeUtils,
} = require('../../../public/js/lib/stopwatch_time_core');
const {
  createTextTimeCalculatorUtils,
} = require('../../../public/js/lib/text_time_calculator_core');

function createHarness() {
  const stopwatchUtils = createStopwatchTimeUtils();
  return createTextTimeCalculatorUtils({
    parseStopwatchInput: stopwatchUtils.parseStopwatchInput,
    formatRoundedSeconds: stopwatchUtils.formatRoundedSeconds,
    formatInteger: (value) => String(Math.round(Number(value) || 0)),
  });
}

test('text_time_calculator_core derives time from words and WPM', () => {
  const utils = createHarness();
  const result = utils.evaluateCalculatorState({
    target: 'time',
    wordsText: '200',
    wpmText: '150',
  });

  assert.deepEqual(result, {
    ok: true,
    target: 'time',
    normalized: {
      words: 200,
      timeMs: 80000,
      wpm: 150,
    },
    invalid: {
      words: false,
      time: false,
      wpm: false,
      formula: false,
    },
    derived: {
      kind: 'time',
      rawNumber: 80,
      displayText: '00:01:20',
    },
  });
});

test('text_time_calculator_core derives words from time and WPM', () => {
  const utils = createHarness();
  const result = utils.evaluateCalculatorState({
    target: 'words',
    timeText: '00:05:00',
    wpmText: '180',
  });

  assert.deepEqual(result, {
    ok: true,
    target: 'words',
    normalized: {
      words: 900,
      timeMs: 300000,
      wpm: 180,
    },
    invalid: {
      words: false,
      time: false,
      wpm: false,
      formula: false,
    },
    derived: {
      kind: 'words',
      rawNumber: 900,
      displayText: '900',
    },
  });
});

test('text_time_calculator_core derives WPM from words and time', () => {
  const utils = createHarness();
  const result = utils.evaluateCalculatorState({
    target: 'wpm',
    wordsText: '600',
    timeText: '00:03:00',
  });

  assert.deepEqual(result, {
    ok: true,
    target: 'wpm',
    normalized: {
      words: 600,
      timeMs: 180000,
      wpm: 200,
    },
    invalid: {
      words: false,
      time: false,
      wpm: false,
      formula: false,
    },
    derived: {
      kind: 'wpm',
      rawNumber: 200,
      displayText: '200',
    },
  });
});

test('text_time_calculator_core keeps blank editable inputs neutral', () => {
  const utils = createHarness();
  const result = utils.evaluateCalculatorState({
    target: 'time',
    wordsText: '',
    wpmText: '',
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.invalid, {
    words: false,
    time: false,
    wpm: false,
    formula: false,
  });
  assert.equal(result.derived, null);
});

test('text_time_calculator_core accepts zero-word cases and zero-time words derivation', () => {
  const utils = createHarness();

  const zeroWordsToTime = utils.evaluateCalculatorState({
    target: 'time',
    wordsText: '0',
    wpmText: '250',
  });
  assert.equal(zeroWordsToTime.ok, true);
  assert.equal(zeroWordsToTime.derived.displayText, '00:00:00');

  const zeroTimeToWords = utils.evaluateCalculatorState({
    target: 'words',
    timeText: '00:00:00',
    wpmText: '250',
  });
  assert.equal(zeroTimeToWords.ok, true);
  assert.equal(zeroTimeToWords.derived.displayText, '0');

  const zeroWordsToWpm = utils.evaluateCalculatorState({
    target: 'wpm',
    wordsText: '0',
    timeText: '00:01:00',
  });
  assert.equal(zeroWordsToWpm.ok, true);
  assert.equal(zeroWordsToWpm.derived.displayText, '0');
});

test('text_time_calculator_core reports formula-invalid WPM derivation from zero time', () => {
  const utils = createHarness();
  const result = utils.evaluateCalculatorState({
    target: 'wpm',
    wordsText: '500',
    timeText: '00:00:00',
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.invalid, {
    words: false,
    time: false,
    wpm: false,
    formula: true,
  });
  assert.equal(result.derived, null);
});

test('text_time_calculator_core flags malformed time input', () => {
  const utils = createHarness();
  const result = utils.evaluateCalculatorState({
    target: 'words',
    timeText: '5:0:00',
    wpmText: '200',
  });

  assert.equal(result.ok, false);
  assert.equal(result.invalid.time, true);
  assert.equal(result.derived, null);
});

test('text_time_calculator_core rejects non-integer or negative inputs', () => {
  const utils = createHarness();

  const invalidWords = utils.evaluateCalculatorState({
    target: 'time',
    wordsText: '-1',
    wpmText: '200',
  });
  assert.equal(invalidWords.invalid.words, true);

  const invalidWpm = utils.evaluateCalculatorState({
    target: 'time',
    wordsText: '100',
    wpmText: '25.5',
  });
  assert.equal(invalidWpm.invalid.wpm, true);
});

test('text_time_calculator_core normalizes invalid target to WPM', () => {
  const utils = createHarness();
  const result = utils.evaluateCalculatorState({
    target: 'invalid-target',
    wordsText: '600',
    timeText: '00:03:00',
  });

  assert.equal(result.target, 'wpm');
  assert.equal(result.ok, true);
  assert.equal(result.derived && result.derived.kind, 'wpm');
  assert.equal(result.derived && result.derived.displayText, '200');
});
