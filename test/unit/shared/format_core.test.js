'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createFormatUtils,
} = require('../../../public/js/lib/format_core');

const TEST_DEFAULT_LANG = 'es';
const getPreferenceScope = (languageId) => String(languageId || '').trim() || TEST_DEFAULT_LANG;

test('createFormatUtils creates number-formatting utilities', () => {
  const utils = createFormatUtils({
    DEFAULT_LANG: TEST_DEFAULT_LANG,
    getPreferenceScope,
  });

  assert.equal(typeof utils.obtenerSeparadoresDeNumeros, 'function');
  assert.equal(typeof utils.formatearNumero, 'function');
});

test('createFormatUtils resolves separators from the requested language bucket', async () => {
  const utils = createFormatUtils({
    DEFAULT_LANG: TEST_DEFAULT_LANG,
    getPreferenceScope,
  });

  const separators = await utils.obtenerSeparadoresDeNumeros('en', {
    numberFormattingByScope: {
      en: { separadorMiles: ',', separadorDecimal: '.' },
      es: { separadorMiles: '.', separadorDecimal: ',' },
    },
  });

  assert.deepEqual(separators, {
    separadorMiles: ',',
    separadorDecimal: '.',
  });
});

test('createFormatUtils rejects a missing required scope entry', async () => {
  const utils = createFormatUtils({
    DEFAULT_LANG: TEST_DEFAULT_LANG,
    getPreferenceScope,
  });

  await assert.rejects(() => utils.obtenerSeparadoresDeNumeros('fr', {
    numberFormattingByScope: {
      es: { separadorMiles: '.', separadorDecimal: ',' },
    },
  }), /required number formatting/);
});

test('createFormatUtils rejects unavailable number-format state', async () => {
  const utils = createFormatUtils({
    DEFAULT_LANG: TEST_DEFAULT_LANG,
    getPreferenceScope,
  });

  await assert.rejects(() => utils.obtenerSeparadoresDeNumeros('es', null), /unavailable/);
  await assert.rejects(() => utils.obtenerSeparadoresDeNumeros('es', {}), /required number formatting/);
});

test('createFormatUtils formats integers with grouping separators', () => {
  const utils = createFormatUtils({
    DEFAULT_LANG: TEST_DEFAULT_LANG,
    getPreferenceScope,
  });

  assert.equal(utils.formatearNumero(1234567, '.', ','), '1.234.567');
});

test('createFormatUtils normalizes fraction digits once', () => {
  const utils = createFormatUtils({
    DEFAULT_LANG: TEST_DEFAULT_LANG,
    getPreferenceScope,
  });
  let conversionCount = 0;
  const fractionDigits = {
    valueOf() {
      conversionCount += 1;
      return 2;
    },
  };

  assert.equal(utils.formatearNumero(1234, ',', '.', fractionDigits), '1,234.00');
  assert.equal(conversionCount, 1);
});

test('createFormatUtils requires DEFAULT_LANG to be injected', () => {
  assert.throws(
    () => createFormatUtils(),
    /\[format_core\] DEFAULT_LANG is required/
  );
});
