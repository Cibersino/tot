'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  createReadingDurationUtils,
} = require('../../../public/js/lib/reading_duration_core');
const {
  createStopwatchTimeUtils,
} = require('../../../public/js/lib/stopwatch_time_core');

function createElement(id) {
  const listeners = new Map();
  const attributes = {};
  const classes = new Set();

  return {
    id,
    value: '',
    textContent: '',
    classList: {
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      },
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    dispatch(type, event = {}) {
      (listeners.get(type) || []).forEach((handler) => handler(event));
    },
    blur() {
      this.dispatch('blur');
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
  };
}

function createHarness({
  maxResultsTimeMultiplier = 9999,
  readingDurationUtils = createReadingDurationUtils(),
} = {}) {
  const stopwatchTimeUtils = createStopwatchTimeUtils();
  const elements = {
    resultsTimeMultiplierLabel: createElement('resultsTimeMultiplierLabel'),
    resultsTimeMultiplierInput: createElement('resultsTimeMultiplierInput'),
    resultsTimeMultiplierOutput: createElement('resultsTimeMultiplierOutput'),
  };
  elements.resultsTimeMultiplierInput.value = '1';

  const sandbox = {
    window: {
      AppConstants: {
        MAX_RESULTS_TIME_MULTIPLIER: maxResultsTimeMultiplier,
      },
      ReadingDurationUtils: readingDurationUtils,
      StopwatchTimeCore: {
        createStopwatchTimeUtils() {
          return stopwatchTimeUtils;
        },
      },
      getLogger() {
        return {
          debug() {},
          errorOnce() {},
        };
      },
    },
    document: {
      getElementById(id) {
        return elements[id] || null;
      },
    },
    console,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/results_time_multiplier.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/results_time_multiplier.js' });

  return {
    elements,
    multiplier: sandbox.window.ResultsTimeMultiplier,
    readingDurationUtils,
  };
}

test('results multiplier marks an over-cap value invalid before committing its configured cap', () => {
  const harness = createHarness();
  const input = harness.elements.resultsTimeMultiplierInput;
  const output = harness.elements.resultsTimeMultiplierOutput;
  harness.multiplier.setBaseReadingDuration(
    harness.readingDurationUtils.createEstimatedReadingDuration(1, 60)
  );

  input.value = '2e0';
  input.dispatch('input');
  assert.equal(input.classList.contains('is-invalid'), false);
  assert.equal(output.textContent, ': 0h 0m 2s');
  input.dispatch('blur');
  assert.equal(input.value, '2');

  input.value = '10000';
  input.dispatch('input');
  assert.equal(input.classList.contains('is-invalid'), true);
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  assert.equal(output.textContent, '');
  input.dispatch('blur');
  assert.equal(input.value, '9999');
  assert.equal(input.classList.contains('is-invalid'), false);
  assert.equal(input.getAttribute('aria-invalid'), 'false');
  assert.equal(output.textContent, ': 2h 46m 39s');

  let prevented = false;
  input.value = '0';
  input.dispatch('keydown', {
    key: 'Enter',
    preventDefault() {
      prevented = true;
    },
  });
  assert.equal(prevented, true);
  assert.equal(input.value, '1');

  input.value = '1.5';
  input.dispatch('input');
  assert.equal(input.classList.contains('is-invalid'), true);
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  assert.equal(output.textContent, '');
  input.dispatch('blur');
  assert.equal(input.value, '1');
});

test('results multiplier uses its AppConstants cap', () => {
  const harness = createHarness({ maxResultsTimeMultiplier: 3 });
  const input = harness.elements.resultsTimeMultiplierInput;
  const output = harness.elements.resultsTimeMultiplierOutput;
  harness.multiplier.setBaseReadingDuration(
    harness.readingDurationUtils.createEstimatedReadingDuration(1, 60)
  );

  input.value = '4';
  input.dispatch('input');
  assert.equal(input.classList.contains('is-invalid'), true);
  assert.equal(output.textContent, '');

  input.dispatch('blur');
  assert.equal(input.value, '3');
  assert.equal(output.textContent, ': 0h 0m 3s');
});

test('results multiplier scales the exact reading estimate before rounding for display', () => {
  const harness = createHarness();
  const input = harness.elements.resultsTimeMultiplierInput;
  const output = harness.elements.resultsTimeMultiplierOutput;

  harness.multiplier.setBaseReadingDuration(
    harness.readingDurationUtils.createEstimatedReadingDuration(1, 40)
  );
  assert.equal(output.textContent, ': 0h 0m 2s');

  input.value = '2';
  input.dispatch('input');
  assert.equal(output.textContent, ': 0h 0m 3s');
});

test('results multiplier treats a failed reading-duration calculation as an invariant violation', () => {
  const exactReadingDurationUtils = createReadingDurationUtils();
  const harness = createHarness({
    readingDurationUtils: {
      ...exactReadingDurationUtils,
      getRoundedReadingSeconds() {
        return null;
      },
    },
  });

  assert.throws(
    () => harness.multiplier.setBaseReadingDuration(
      exactReadingDurationUtils.createEstimatedReadingDuration(1, 60)
    ),
    /multiplied reading duration unavailable/
  );
  assert.equal(harness.elements.resultsTimeMultiplierOutput.textContent, '');
});
