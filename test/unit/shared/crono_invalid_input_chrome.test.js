'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createStopwatchTimeUtils } = require('../../../public/js/lib/stopwatch_time_core');

function createElement() {
  const listeners = new Map();
  const attributes = {};
  const classes = new Set();

  return {
    value: '',
    disabled: false,
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

function createHarness() {
  const cronoDisplay = createElement();
  cronoDisplay.value = '00:00:00';
  const sandbox = {
    window: {
      getLogger() {
        return {
          debug() {},
          warn() {},
          warnOnce() {},
          error() {},
        };
      },
      RendererIcons: {
        applyIconToElement() {},
      },
      StopwatchTimeCore: {
        createStopwatchTimeUtils,
      },
    },
    console,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/crono.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/crono.js' });

  const controller = sandbox.window.RendererCrono.createController({
    elements: {
      cronoDisplay,
      realWpmDisplay: createElement(),
    },
  });
  controller.bind();

  return { cronoDisplay };
}

test('stopwatch display shows invalid chrome while a malformed time is being edited', () => {
  const { cronoDisplay } = createHarness();

  cronoDisplay.dispatch('focus');
  cronoDisplay.value = '1:2:03';
  cronoDisplay.dispatch('input');
  assert.equal(cronoDisplay.classList.contains('is-invalid'), true);
  assert.equal(cronoDisplay.getAttribute('aria-invalid'), 'true');

  cronoDisplay.dispatch('blur');
  assert.equal(cronoDisplay.value, '00:00:00');
  assert.equal(cronoDisplay.classList.contains('is-invalid'), false);
  assert.equal(cronoDisplay.getAttribute('aria-invalid'), 'false');
});
