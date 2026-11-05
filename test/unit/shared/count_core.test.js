'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createCountUtils,
} = require('../../../public/js/lib/count_core');

const TEST_DEFAULT_LOCALE_TAG = 'fr-CA';

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

test('createCountUtils simple mode counts words and characters by whitespace rules without locale resolution', () => {
  const utils = createCountUtils({ log: createWarnLogDouble() });

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
  const utils = createCountUtils({ log: createWarnLogDouble() });

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
    log: createWarnLogDouble(),
  });

  const result = utils.contarTextoPreciso('state-of-the-art e-mail 3-4', 'en');

  assert.equal(result.palabras, 3);
  assert.ok(result.conEspacios > 0);
  assert.ok(result.sinEspacios > 0);
});

test('createCountUtils resolves an injected default locale only for direct Precise counting without a locale', () => {
  const seenLanguages = [];
  let defaultLocaleRequests = 0;
  const utils = createCountUtils({
    getDefaultLocaleTag() {
      defaultLocaleRequests += 1;
      return TEST_DEFAULT_LOCALE_TAG;
    },
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
    { language: TEST_DEFAULT_LOCALE_TAG, granularity: 'grapheme' },
    { language: TEST_DEFAULT_LOCALE_TAG, granularity: 'word' },
  ]);
  assert.equal(defaultLocaleRequests, 1);
});

test('createCountUtils bypasses the default locale resolver when Precise counting receives an explicit locale', () => {
  const seenLanguages = [];
  const utils = createCountUtils({
    getDefaultLocaleTag() {
      throw new Error('default locale resolver should not run');
    },
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

  utils.contarTextoPreciso('hola', 'zh-Hans');

  assert.deepEqual(seenLanguages, [
    { language: 'zh-Hans', granularity: 'grapheme' },
    { language: 'zh-Hans', granularity: 'word' },
  ]);
});

test('createCountUtils reports a structured failure when Intl.Segmenter is unavailable', () => {
  const { log } = createLogSpy();
  const utils = createCountUtils({
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
    getDefaultLocaleTag() {
      return TEST_DEFAULT_LOCALE_TAG;
    },
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

test('createCountUtils requires a default locale resolver only when Precise counting omits its locale', () => {
  const utils = createCountUtils({
    log: createWarnLogDouble(),
    intlObject: {
      Segmenter: class SegmenterMock {},
    },
  });

  assert.throws(
    () => utils.contarTextoPreciso('hola'),
    /\[count_core\] getDefaultLocaleTag is required for Precise counting without an explicit locale/
  );
});

test('createCountUtils preserves graph-metadata failures without classifying them as Precise-count execution failures', () => {
  const metadataError = new Error('language graph unavailable');
  const utils = createCountUtils({
    getDefaultLocaleTag() {
      throw metadataError;
    },
    log: createWarnLogDouble(),
    intlObject: {
      Segmenter: class SegmenterMock {},
    },
  });

  assert.throws(
    () => utils.contarTextoPreciso('hola'),
    (error) => error === metadataError && !utils.isPreciseCountFailure(error)
  );
});
