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

function createWarnOnceLogDouble() {
  return {
    warnOnce() {},
  };
}

test('createFormatUtils creates number-formatting utilities', () => {
  const utils = createFormatUtils({
    DEFAULT_LANG: TEST_DEFAULT_LANG,
    log: createWarnOnceLogDouble(),
  });

  assert.equal(typeof utils.obtenerSeparadoresDeNumeros, 'function');
  assert.equal(typeof utils.formatearNumero, 'function');
});

test('createFormatUtils resolves separators from the requested language bucket', async () => {
  const utils = createFormatUtils({
    DEFAULT_LANG: TEST_DEFAULT_LANG,
    normalizeLangTag: (lang) => String(lang || '').trim().toLowerCase(),
    getLangBase,
    log: createWarnOnceLogDouble(),
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
  const utils = createFormatUtils({
    DEFAULT_LANG: TEST_DEFAULT_LANG,
    log: createWarnOnceLogDouble(),
  });

  assert.equal(utils.formatearNumero(1234567, '.', ','), '1.234.567');
});

test('createFormatUtils requires DEFAULT_LANG to be injected', () => {
  assert.throws(
    () => createFormatUtils({ log: createWarnOnceLogDouble() }),
    /\[format_core\] DEFAULT_LANG is required/
  );
});
