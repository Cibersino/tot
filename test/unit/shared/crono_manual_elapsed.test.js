'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadRendererCrono } = require('../../helpers/renderer_crono_test_harness');

function createManualTimeArgs(overrides = {}) {
  const cronoDisplay = { value: '00:00:30' };
  const realWpmDisplay = { innerHTML: 'existing WPM' };
  const elapsedWrites = [];
  const lastComputedWrites = [];

  return {
    args: {
      value: '00:01:00',
      cronoDisplay,
      currentText: '',
      contarTexto: () => ({ palabras: 0 }),
      obtenerSeparadoresDeNumeros: async () => ({ separadorMiles: '.', separadorDecimal: ',' }),
      formatearNumero: (value) => String(value),
      realWpmDisplay,
      setElapsed: (value) => {
        elapsedWrites.push(value);
        return value;
      },
      setLastComputedElapsed: (value) => { lastComputedWrites.push(value); },
      baselineElapsed: 30000,
      baselineDisplay: '00:00:30',
      ...overrides,
    },
    cronoDisplay,
    realWpmDisplay,
    elapsedWrites,
    lastComputedWrites,
  };
}

test('manual elapsed edit stays at its canonical baseline when setCronoElapsed is unavailable', async (t) => {
  const { crono, logs } = loadRendererCrono(t);
  const harness = createManualTimeArgs();

  const result = await crono.applyManualTime(harness.args);

  assert.equal(result, null);
  assert.equal(harness.cronoDisplay.value, '00:00:30');
  assert.equal(harness.realWpmDisplay.innerHTML, 'existing WPM');
  assert.deepEqual(harness.elapsedWrites, []);
  assert.deepEqual(harness.lastComputedWrites, []);
  assert.equal(logs.some(({ level, args }) => (
    level === 'warn' && args[0].includes('manual elapsed edit ignored')
  )), true);
});

test('manual elapsed edit stays at its canonical baseline when setCronoElapsed throws', async (t) => {
  const { crono, logs } = loadRendererCrono(t);
  const harness = createManualTimeArgs({
    electronAPI: {
      setCronoElapsed() {
        throw new Error('bridge unavailable');
      },
    },
  });

  const result = await crono.applyManualTime(harness.args);

  assert.equal(result, null);
  assert.equal(harness.cronoDisplay.value, '00:00:30');
  assert.equal(harness.realWpmDisplay.innerHTML, 'existing WPM');
  assert.deepEqual(harness.elapsedWrites, []);
  assert.deepEqual(harness.lastComputedWrites, []);
  assert.equal(logs.some(({ level, args }) => (
    level === 'warn' && args[0].includes('manual elapsed edit ignored')
  )), true);
});

test('manual elapsed edit rejects unrepresentable stopwatch input before bridge dispatch', async (t) => {
  const { crono } = loadRendererCrono(t);
  const elapsedRequests = [];
  const harness = createManualTimeArgs({
    electronAPI: {
      setCronoElapsed(milliseconds) {
        elapsedRequests.push(milliseconds);
      },
    },
  });

  for (const value of [
    '2501922841124:19:55',
    `${'1'.repeat(309)}:00:00`,
  ]) {
    const result = await crono.applyManualTime({ ...harness.args, value });

    assert.equal(result, null);
    assert.equal(harness.cronoDisplay.value, '00:00:30');
  }

  assert.deepEqual(elapsedRequests, []);
  assert.equal(harness.realWpmDisplay.innerHTML, 'existing WPM');
  assert.deepEqual(harness.elapsedWrites, []);
  assert.deepEqual(harness.lastComputedWrites, []);
});

test('manual elapsed UI synchronization failures do not re-enter bridge-failure handling', async (t) => {
  const { crono, logs } = loadRendererCrono(t);
  const harness = createManualTimeArgs({
    electronAPI: {
      setCronoElapsed() {},
    },
    setLastComputedElapsed() {
      throw new Error('UI bookkeeping failed');
    },
  });

  const result = await crono.applyManualTime(harness.args);

  assert.equal(result, 60000);
  assert.equal(harness.cronoDisplay.value, '00:01:00');
  assert.deepEqual(harness.elapsedWrites, []);
  assert.equal(logs.some(({ level, args }) => (
    level === 'error' && args[0].includes('UI synchronization failed')
  )), true);
  assert.equal(logs.some(({ args }) => String(args[0]).includes('manual elapsed edit ignored')), false);
});
