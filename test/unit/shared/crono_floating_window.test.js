'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createStopwatchTimeUtils } = require('../../../public/js/lib/stopwatch_time_core');

function loadCrono(t) {
  const logs = [];
  const sandbox = {
    window: {
      getLogger() {
        return {
          debug(...args) { logs.push({ level: 'debug', args }); },
          warn(...args) { logs.push({ level: 'warn', args }); },
          warnOnce(...args) { logs.push({ level: 'warnOnce', args }); },
          error(...args) { logs.push({ level: 'error', args }); },
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

  return { crono: sandbox.window.RendererCrono, logs };
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
  const { crono } = loadCrono(t);
  const { openFlotante } = crono;
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
  const { crono, logs } = loadCrono(t);
  const { openFlotante } = crono;
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
  assert.equal(logs.some(({ level, args }) => (
    level === 'warn' && args[0].includes('direct stopwatch refresh skipped')
  )), true);
});

test('Floating Stopwatch close reports a rejected Main result while clearing the toggle', async (t) => {
  const { crono, logs } = loadCrono(t);
  const toggleVF = createFloatingToggle();
  toggleVF.checked = true;

  await crono.closeFlotante({
    electronAPI: {
      async closeFlotanteWindow() {
        return { ok: false, error: 'not ready' };
      },
    },
    toggleVF,
  });

  assert.equal(toggleVF.checked, false);
  assert.equal(toggleVF.getAttribute('aria-checked'), 'false');
  assert.equal(logs.some(({ level, args }) => (
    level === 'warn' && args[0].includes('close request was not accepted (ignored)') && args[1] === 'not ready'
  )), true);
});
