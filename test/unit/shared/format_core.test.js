'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createFormatUtils,
} = require('../../../public/js/lib/format_core');

const TEST_DEFAULT_LANG = 'es';
const getLangBase = (lang) => String(lang || '').trim().toLowerCase().split(/[-_]/)[0] || TEST_DEFAULT_LANG;

function createLogSpy() {
  const warnOnceCalls = [];
  return {
    log: {
      warnOnce(...args) {
        warnOnceCalls.push(args);
      },
    },
    warnOnceCalls,
  };
}

test('createFormatUtils computes exact total seconds and rounded display parts', () => {
  const utils = createFormatUtils({ DEFAULT_LANG: TEST_DEFAULT_LANG });

  assert.equal(utils.getExactTotalSeconds(300, 150), 120);
  assert.equal(utils.getExactTotalSeconds(0, 150), 0);
  assert.deepEqual(utils.getDisplayTimeParts(3661.2), {
    hours: 1,
    minutes: 1,
    seconds: 1,
  });
});

test('createFormatUtils resolves separators from the requested language bucket', async () => {
  const utils = createFormatUtils({
    DEFAULT_LANG: TEST_DEFAULT_LANG,
    normalizeLangTag: (lang) => String(lang || '').trim().toLowerCase(),
    getLangBase,
  });

  const separators = await utils.obtenerSeparadoresDeNumeros('en-US', {
    numberFormatting: {
      en: { separadorMiles: ',', separadorDecimal: '.' },
      es: { separadorMiles: '.', separadorDecimal: ',' },
    },
  });

  assert.deepEqual(separators, {
    separadorMiles: ',',
    separadorDecimal: '.',
  });
});

test('createFormatUtils falls back to default language separators when the requested bucket is missing', async () => {
  const { log, warnOnceCalls } = createLogSpy();
  const utils = createFormatUtils({
    DEFAULT_LANG: TEST_DEFAULT_LANG,
    normalizeLangTag: (lang) => String(lang || '').trim().toLowerCase(),
    getLangBase,
    log,
  });

  const separators = await utils.obtenerSeparadoresDeNumeros('fr', {
    numberFormatting: {
      es: { separadorMiles: '.', separadorDecimal: ',' },
    },
  });

  assert.deepEqual(separators, {
    separadorMiles: '.',
    separadorDecimal: ',',
  });
  assert.equal(warnOnceCalls.length, 1);
});

test('createFormatUtils uses hardcoded defaults when formatting data is unavailable', async () => {
  const { log, warnOnceCalls } = createLogSpy();
  const utils = createFormatUtils({
    DEFAULT_LANG: TEST_DEFAULT_LANG,
    normalizeLangTag: (lang) => String(lang || '').trim().toLowerCase(),
    getLangBase,
    log,
  });

  const fromNull = await utils.obtenerSeparadoresDeNumeros('es', null);
  const fromMissing = await utils.obtenerSeparadoresDeNumeros('es', {});

  assert.deepEqual(fromNull, {
    separadorMiles: '.',
    separadorDecimal: ',',
  });
  assert.deepEqual(fromMissing, {
    separadorMiles: '.',
    separadorDecimal: ',',
  });
  assert.equal(warnOnceCalls.length, 2);
});

test('createFormatUtils formats integers with grouping separators', () => {
  const utils = createFormatUtils({ DEFAULT_LANG: TEST_DEFAULT_LANG });

  assert.equal(utils.formatearNumero(1234567, '.', ','), '1.234.567');
});

test('createFormatUtils requires DEFAULT_LANG to be injected', () => {
  assert.throws(
    () => createFormatUtils(),
    /\[format_core\] DEFAULT_LANG is required/
  );
});
