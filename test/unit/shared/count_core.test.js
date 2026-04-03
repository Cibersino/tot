'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createCountUtils,
} = require('../../../public/js/lib/count_core');

function createLogSpy() {
  const warnCalls = [];
  const warnOnceCalls = [];
  return {
    log: {
      warn(...args) {
        warnCalls.push(args);
      },
      warnOnce(...args) {
        warnOnceCalls.push(args);
      },
    },
    warnCalls,
    warnOnceCalls,
  };
}

test('createCountUtils simple mode counts words and characters by whitespace rules', () => {
  const utils = createCountUtils({ DEFAULT_LANG: 'es' });

  assert.deepEqual(
    utils.contarTexto('hola mundo', { modoConteo: 'simple' }),
    {
      conEspacios: 10,
      sinEspacios: 9,
      palabras: 2,
    }
  );
});

test('createCountUtils precise mode joins hyphenated compounds into one word', () => {
  const utils = createCountUtils({ DEFAULT_LANG: 'en' });

  const result = utils.contarTextoPreciso('state-of-the-art e-mail 3-4', 'en');

  assert.equal(result.palabras, 3);
  assert.ok(result.conEspacios > 0);
  assert.ok(result.sinEspacios > 0);
});

test('createCountUtils falls back when Intl.Segmenter is unavailable', () => {
  const { log, warnOnceCalls } = createLogSpy();
  const utils = createCountUtils({
    DEFAULT_LANG: 'es',
    log,
    intlObject: {},
  });

  const result = utils.contarTexto('hola mundo', { modoConteo: 'preciso' });

  assert.deepEqual(result, {
    conEspacios: 10,
    sinEspacios: 9,
    palabras: 2,
  });
  assert.equal(utils.hasIntlSegmenter(), false);
  assert.equal(warnOnceCalls.length, 1);
});

test('createCountUtils warns and uses ASCII fallback when unicode property escapes are unsupported', () => {
  const originalRegExp = global.RegExp;
  const { log, warnCalls } = createLogSpy();

  global.RegExp = function RegExpShim(pattern, flags) {
    if (String(pattern) === '^[\\p{L}\\p{N}]+$' && flags === 'u') {
      throw new SyntaxError('unsupported');
    }
    return new originalRegExp(pattern, flags);
  };

  try {
    createCountUtils({
      DEFAULT_LANG: 'es',
      log,
      intlObject: {},
    });
  } finally {
    global.RegExp = originalRegExp;
  }

  assert.equal(warnCalls.length, 1);
});
