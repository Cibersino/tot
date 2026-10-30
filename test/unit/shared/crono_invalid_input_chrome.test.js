'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadRendererCrono } = require('../../helpers/renderer_crono_test_harness');

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

function createHarness(t) {
  const cronoDisplay = createElement();
  cronoDisplay.value = '00:00:00';
  const { crono } = loadRendererCrono(t);
  const controller = crono.createController({
    elements: {
      cronoDisplay,
      realWpmDisplay: createElement(),
    },
  });
  controller.bind();

  return { cronoDisplay };
}

test('stopwatch display shows invalid chrome while a malformed time is being edited', (t) => {
  const { cronoDisplay } = createHarness(t);

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
