'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadRendererCrono } = require('../../helpers/renderer_crono_test_harness');

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
  const { crono } = loadRendererCrono(t);
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
  const { crono, logs } = loadRendererCrono(t);
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
  const { crono, logs } = loadRendererCrono(t);
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
