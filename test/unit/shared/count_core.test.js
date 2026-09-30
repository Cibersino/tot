'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createCountUtils,
} = require('../../../public/js/lib/count_core');

const TEST_DEFAULT_LANG = 'es';

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

function createWarnLogDouble() {
  return {
    warn() {},
    warnOnce() {},
  };
}

test('createCountUtils simple mode counts words and characters by whitespace rules', () => {
  const utils = createCountUtils({
    DEFAULT_LANG: TEST_DEFAULT_LANG,
    log: createWarnLogDouble(),
  });

  assert.deepEqual(
    utils.contarTexto('hola mundo', { modoConteo: 'simple' }),
    {
      conEspacios: 10,
      sinEspacios: 9,
      palabras: 2,
    }
  );
});

test('createCountUtils simple mode preserves JS whitespace semantics on mixed whitespace input', () => {
  const utils = createCountUtils({
    DEFAULT_LANG: TEST_DEFAULT_LANG,
    log: createWarnLogDouble(),
  });

  assert.deepEqual(
    utils.contarTexto('\r\n\tuno\u00a0dos  tres\r\ncuatro\t\tcinco ', { modoConteo: 'simple' }),
    {
      conEspacios: 32,
      sinEspacios: 21,
      palabras: 5,
    }
  );
});

test('createCountUtils precise mode joins hyphenated compounds into one word', () => {
  const utils = createCountUtils({
    DEFAULT_LANG: 'en',
    log: createWarnLogDouble(),
  });

  const result = utils.contarTextoPreciso('state-of-the-art e-mail 3-4', 'en');

  assert.equal(result.palabras, 3);
  assert.ok(result.conEspacios > 0);
  assert.ok(result.sinEspacios > 0);
});

test('createCountUtils uses injected DEFAULT_LANG for direct precise counting when language is omitted', () => {
  const seenLanguages = [];
  const utils = createCountUtils({
    DEFAULT_LANG: TEST_DEFAULT_LANG,
    log: createWarnLogDouble(),
    intlObject: {
      Segmenter: class SegmenterMock {
        constructor(language, options) {
          seenLanguages.push({ language, granularity: options && options.granularity });
        }

        segment(text) {
          if (seenLanguages[seenLanguages.length - 1].granularity === 'grapheme') {
            return [{ segment: text }];
          }
          return [{ segment: text, isWordLike: true }];
        }
      },
    },
  });

  utils.contarTextoPreciso('hola', undefined);

  assert.deepEqual(seenLanguages, [
    { language: TEST_DEFAULT_LANG, granularity: 'grapheme' },
    { language: TEST_DEFAULT_LANG, granularity: 'word' },
  ]);
});

test('createCountUtils reports a structured failure when Intl.Segmenter is unavailable', () => {
  const { log } = createLogSpy();
  const utils = createCountUtils({
    DEFAULT_LANG: TEST_DEFAULT_LANG,
    log,
    intlObject: {},
  });

  assert.equal(utils.hasIntlSegmenter(), false);
  assert.throws(
    () => utils.contarTexto('hola mundo', { modoConteo: 'preciso' }),
    (err) => utils.isPreciseCountFailure(err)
      && err.code === 'PRECISE_SEGMENTER_UNAVAILABLE'
      && err.stage === 'availability'
  );
});

test('createCountUtils reports Segmenter construction failures structurally', () => {
  const utils = createCountUtils({
    DEFAULT_LANG: TEST_DEFAULT_LANG,
    log: createWarnLogDouble(),
    intlObject: {
      Segmenter: class SegmenterMock {
        constructor() {
          throw new Error('construction failed');
        }
      },
    },
  });

  assert.throws(
    () => utils.contarTexto('hola', { modoConteo: 'preciso' }),
    (err) => utils.isPreciseCountFailure(err)
      && err.code === 'PRECISE_SEGMENTER_EXECUTION_FAILED'
      && err.stage === 'grapheme-construction'
      && err.cause && err.cause.message === 'construction failed'
  );
});

test('createCountUtils reports Unicode-property support loss as a structured Precise failure', () => {
  const originalRegExp = global.RegExp;
  const { log, warnCalls } = createLogSpy();

  global.RegExp = function RegExpShim(pattern, flags) {
    if (String(pattern) === '^[\\p{L}\\p{N}]+$' && flags === 'u') {
      throw new SyntaxError('unsupported');
    }
    return new originalRegExp(pattern, flags);
  };

  try {
    const utils = createCountUtils({
      DEFAULT_LANG: TEST_DEFAULT_LANG,
      log,
      intlObject: {
        Segmenter: class SegmenterMock {},
      },
    });

    assert.throws(
      () => utils.contarTexto('hola mundo', { modoConteo: 'preciso' }),
      (err) => utils.isPreciseCountFailure(err)
        && err.code === 'PRECISE_UNICODE_PROPERTIES_UNAVAILABLE'
        && err.stage === 'unicode-properties'
    );
  } finally {
    global.RegExp = originalRegExp;
  }

  assert.equal(warnCalls.length, 1);
  assert.match(warnCalls[0][0], /canonical Simple recovery/);
});

test('createCountUtils requires DEFAULT_LANG to be injected', () => {
  assert.throws(
    () => createCountUtils({ log: createWarnLogDouble() }),
    /\[count_core\] DEFAULT_LANG is required/
  );
});

test('createCountUtils requires injected warn logging', () => {
  assert.throws(
    () => createCountUtils({ DEFAULT_LANG: TEST_DEFAULT_LANG }),
    /\[count_core\] log\.warn\(\) is required/
  );
});
