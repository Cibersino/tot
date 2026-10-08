'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createStopwatchTimeUtils } = require('../../../public/js/lib/stopwatch_time_core');

function loadCrono(t) {
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
  const source = fs.readFileSync(path.resolve(__dirname, '../../../public/js/crono.js'), 'utf8');
  vm.runInContext(source, sandbox, { filename: 'public/js/crono.js' });
  t.after(() => {
    sandbox.window = null;
  });

  return sandbox.window.RendererCrono;
}

function createFloatingToggle() {
  const attributes = {};
  return {
    checked: false,
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    getAttribute(name) {
      return attributes[name];
    },
  };
}

test('Floating Stopwatch open leaves the main toggle clear after a failed Main open result', async (t) => {
  const { openFlotante } = loadCrono(t);
  const toggleVF = createFloatingToggle();

  await openFlotante({
    electronAPI: {
      async openFlotanteWindow() {
        return { ok: false, error: 'FLOTANTE_INITIAL_DOCUMENT_LOAD_FAILED' };
      },
    },
    toggleVF,
  });

  assert.equal(toggleVF.checked, false);
  assert.equal(toggleVF.getAttribute('aria-checked'), 'false');
});

test('Floating Stopwatch open retains the main toggle after Main accepts the window', async (t) => {
  const { openFlotante } = loadCrono(t);
  const toggleVF = createFloatingToggle();

  await openFlotante({
    electronAPI: {
      async openFlotanteWindow() {
        return { ok: true };
      },
    },
    toggleVF,
  });

  assert.equal(toggleVF.checked, true);
  assert.equal(toggleVF.getAttribute('aria-checked'), 'true');
});
