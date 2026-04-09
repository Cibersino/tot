'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

function loadFreshSpellcheckModule() {
  const modulePath = path.resolve(__dirname, '../../../electron/spellcheck.js');
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function createSessionDouble(availableSpellCheckerLanguages = []) {
  return {
    availableSpellCheckerLanguages,
    enabledCalls: [],
    languageCalls: [],
    setSpellCheckerEnabled(enabled) {
      this.enabledCalls.push(enabled);
    },
    setSpellCheckerLanguages(languages) {
      this.languageCalls.push(languages.slice());
    },
  };
}

function createLogDouble() {
  return {
    warnOnceCalls: [],
    errorCalls: [],
    warnOnce(key, ...args) {
      this.warnOnceCalls.push({ key, args });
    },
    error(...args) {
      this.errorCalls.push(args);
    },
  };
}

function createControllerSessionState(availableSpellCheckerLanguages = []) {
  return {
    defaultSession: {
      availableSpellCheckerLanguages,
      enabledCalls: [],
      languageCalls: [],
      setSpellCheckerEnabled(enabled) {
        this.enabledCalls.push(enabled);
      },
      setSpellCheckerLanguages(languages) {
        this.languageCalls.push(languages.slice());
      },
    },
  };
}

test('resolveSpellCheckerLanguages prefers exact supported matches and can fall back to base matches', () => {
  const spellcheck = loadFreshSpellcheckModule();

  const exact = spellcheck.resolveSpellCheckerLanguages('es', ['en-US', 'es-ES']);
  assert.equal(exact.supported, true);
  assert.deepEqual(exact.languages, ['es-ES']);
  assert.equal(exact.reason, 'exact-match');

  const baseMatch = spellcheck.resolveSpellCheckerLanguages('pt', ['en-US', 'pt-AO']);
  assert.equal(baseMatch.supported, true);
  assert.deepEqual(baseMatch.languages, ['pt-AO']);
  assert.equal(baseMatch.reason, 'base-match');
});

test('resolveSpellCheckerLanguages rejects unsupported app-language tags including arn and es-cl', () => {
  const spellcheck = loadFreshSpellcheckModule();

  const arn = spellcheck.resolveSpellCheckerLanguages('arn', ['es-ES', 'en-US']);
  assert.equal(arn.supported, false);
  assert.equal(arn.reason, 'unsupported-app-language');

  const esCl = spellcheck.resolveSpellCheckerLanguages('es-cl', ['es-ES', 'en-US']);
  assert.equal(esCl.supported, false);
  assert.equal(esCl.reason, 'unsupported-app-language');
});

test('applySpellCheckerSessionConfig disables by user preference before touching languages', () => {
  const spellcheck = loadFreshSpellcheckModule();
  const sessionDouble = createSessionDouble(['en-US', 'es-ES']);

  const result = spellcheck.applySpellCheckerSessionConfig({
    targetSession: sessionDouble,
    appLanguage: 'es',
    spellcheckEnabled: false,
    platform: 'win32',
  });

  assert.equal(result.ok, true);
  assert.equal(result.reason, 'disabled-by-user');
  assert.deepEqual(sessionDouble.enabledCalls, [false]);
  assert.deepEqual(sessionDouble.languageCalls, []);
});

test('applySpellCheckerSessionConfig disables spellcheck when app language is unsupported', () => {
  const spellcheck = loadFreshSpellcheckModule();
  const sessionDouble = createSessionDouble(['en-US', 'es-ES']);

  const result = spellcheck.applySpellCheckerSessionConfig({
    targetSession: sessionDouble,
    appLanguage: 'arn',
    spellcheckEnabled: true,
    platform: 'win32',
  });

  assert.equal(result.ok, true);
  assert.equal(result.supported, false);
  assert.equal(result.effectiveEnabled, false);
  assert.deepEqual(sessionDouble.enabledCalls, [false]);
  assert.deepEqual(sessionDouble.languageCalls, []);
});

test('applySpellCheckerSessionConfig enables the resolved language on supported platforms', () => {
  const spellcheck = loadFreshSpellcheckModule();
  const sessionDouble = createSessionDouble(['fr-FR', 'en-US']);

  const result = spellcheck.applySpellCheckerSessionConfig({
    targetSession: sessionDouble,
    appLanguage: 'fr',
    spellcheckEnabled: true,
    platform: 'win32',
  });

  assert.equal(result.ok, true);
  assert.equal(result.supported, true);
  assert.equal(result.effectiveEnabled, true);
  assert.deepEqual(result.languages, ['fr-FR']);
  assert.deepEqual(sessionDouble.enabledCalls, [true]);
  assert.deepEqual(sessionDouble.languageCalls, [['fr-FR']]);
});

test('createController applies override settings without needing a second spellcheck module', () => {
  const spellcheck = loadFreshSpellcheckModule();
  const log = createLogDouble();
  const sessionState = createControllerSessionState(['es-ES', 'en-US']);

  const controller = spellcheck.createController({
    settingsState: {
      getSettings() {
        throw new Error('getSettings should not be used when an override is provided');
      },
    },
    log,
    sessionState,
    platform: 'win32',
  });

  const result = controller.apply({
    language: 'es',
    spellcheckEnabled: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.effectiveEnabled, true);
  assert.deepEqual(result.languages, ['es-ES']);
  assert.deepEqual(sessionState.defaultSession.enabledCalls, [true]);
  assert.deepEqual(sessionState.defaultSession.languageCalls, [['es-ES']]);
  assert.equal(log.warnOnceCalls.length, 0);
  assert.equal(log.errorCalls.length, 0);
});

test('createController warns once when no default session is available', () => {
  const spellcheck = loadFreshSpellcheckModule();
  const log = createLogDouble();

  const controller = spellcheck.createController({
    settingsState: {
      getSettings() {
        return { language: 'es', spellcheckEnabled: true };
      },
    },
    log,
    sessionState: {},
    platform: 'win32',
  });

  const result = controller.apply();

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'session-unavailable');
  assert.equal(log.warnOnceCalls.length, 1);
  assert.equal(log.warnOnceCalls[0].key, 'main.spellcheck.session.unavailable');
});
