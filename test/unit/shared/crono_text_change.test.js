'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { loadRendererCrono } = require('../../helpers/renderer_crono_test_harness');

function createDisplayElement(value = '') {
  const attributes = {};

  return {
    value,
    disabled: false,
    classList: {
      toggle() {},
    },
    setAttribute(name, attributeValue) {
      attributes[name] = String(attributeValue);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
  };
}

function createController(crono, getCurrentText) {
  const cronoDisplay = createDisplayElement('00:00:00');
  const realWpmDisplay = { innerHTML: '&nbsp;' };
  const controller = crono.createController({
    elements: {
      cronoDisplay,
      realWpmDisplay,
    },
    contarTexto(text) {
      return { palabras: text === 'restored text' ? 120 : 0 };
    },
    obtenerSeparadoresDeNumeros: async () => ({ separadorMiles: '.', separadorDecimal: ',' }),
    formatearNumero(value) {
      return String(value);
    },
    getCurrentText,
  });

  return { controller, cronoDisplay, realWpmDisplay };
}

test('empty current text preserves stopwatch state and allows cumulative Real WPM after text returns', async (t) => {
  const { crono } = loadRendererCrono(t);
  let currentText = '';
  const { controller, cronoDisplay, realWpmDisplay } = createController(crono, () => currentText);

  controller.handleState({ elapsed: 60000, running: true });
  realWpmDisplay.innerHTML = '120 WPM';
  await controller.handleTextChange('prior text', '');
  let state = controller.getState();
  assert.equal(state.elapsed, 60000);
  assert.equal(state.running, true);
  assert.equal(cronoDisplay.value, '00:01:00');
  assert.equal(realWpmDisplay.innerHTML, '&nbsp;');

  currentText = 'restored text';
  await controller.handleTextChange('', currentText);
  assert.equal(realWpmDisplay.innerHTML, '&nbsp;');
  controller.handleState({ elapsed: 60000, running: false });
  await new Promise((resolve) => setImmediate(resolve));

  state = controller.getState();
  assert.equal(state.elapsed, 60000);
  assert.equal(state.running, false);
  assert.equal(cronoDisplay.value, '00:01:00');
  assert.equal(realWpmDisplay.textContent, '120 WPM');
});
