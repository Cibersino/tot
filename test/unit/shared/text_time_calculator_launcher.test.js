'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createElement(id) {
  const listeners = {};
  const attributes = {};

  return {
    id,
    disabled: false,
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name)
        ? attributes[name]
        : null;
    },
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    dispatch(type) {
      if (listeners[type]) listeners[type]();
    },
  };
}

function loadLauncherHarness(includeButton = true) {
  const button = createElement('btnTextTimeCalculator');
  const sandbox = {
    window: {
      getLogger() {
        return {
          warn() {},
        };
      },
      RendererI18n: {
        tRenderer(path) {
          if (path === 'renderer.main.tooltips.text_time_calculator') {
            return 'Open calculator';
          }
          if (path === 'renderer.main.aria.text_time_calculator') {
            return 'Open calculator aria';
          }
          return path;
        },
      },
    },
    document: {
      getElementById(id) {
        return includeButton && id === 'btnTextTimeCalculator' ? button : null;
      },
    },
    console,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/text_time_calculator_launcher.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/text_time_calculator_launcher.js' });

  return {
    api: sandbox.window.TextTimeCalculatorLauncher,
    button,
  };
}

test('text_time_calculator_launcher fails fast when the launcher button is missing', () => {
  assert.throws(
    () => loadLauncherHarness(false),
    /\[text_time_calculator_launcher\] btnTextTimeCalculator missing; cannot continue/
  );
});

test('text_time_calculator_launcher applies translated tooltip and aria label', () => {
  const harness = loadLauncherHarness();

  harness.api.applyTranslations();

  assert.equal(harness.button.getAttribute('title'), 'Open calculator');
  assert.equal(harness.button.getAttribute('aria-label'), 'Open calculator aria');
});

test('text_time_calculator_launcher binds click action once', () => {
  const harness = loadLauncherHarness();
  let clicks = 0;

  harness.api.bindActions({
    onOpenCalculator() {
      clicks += 1;
    },
  });
  harness.api.bindActions({
    onOpenCalculator() {
      clicks += 10;
    },
  });

  harness.button.dispatch('click');
  assert.equal(clicks, 1);
});

test('text_time_calculator_launcher synchronizes disabled and aria-disabled state', () => {
  const harness = loadLauncherHarness();

  harness.api.setInteractionLocked(true);
  assert.equal(harness.button.disabled, true);
  assert.equal(harness.button.getAttribute('aria-disabled'), 'true');

  harness.api.setInteractionLocked(false);
  assert.equal(harness.button.disabled, false);
  assert.equal(harness.button.getAttribute('aria-disabled'), 'false');
});
