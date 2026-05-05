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

function createSessionDouble(availableSpellCheckerLanguages = [], options = {}) {
  const sessionDouble = {
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

  if (options.includeSetSpellCheckerEnabled === false) {
    delete sessionDouble.setSpellCheckerEnabled;
  }

  if (options.includeSetSpellCheckerLanguages === false) {
    delete sessionDouble.setSpellCheckerLanguages;
  }

  return sessionDouble;
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

function createControllerSessionState(availableSpellCheckerLanguages = [], options = {}) {
  return {
    defaultSession: createSessionDouble(availableSpellCheckerLanguages, options),
  };
}

test('resolveSpellCheckerLanguages prefers an exact normalized tag match before other compatible dictionaries', () => {
  const spellcheck = loadFreshSpellcheckModule();

  const result = spellcheck.resolveSpellCheckerLanguages('es-MX', ['es-ES', 'es-MX', 'es']);

  assert.deepEqual(result, {
    status: 'accepted',
    reasonCode: 'accepted.exact',
    requestedTag: 'es-MX',
    normalizedTag: 'es-mx',
    base: 'es',
    script: null,
    region: 'mx',
    family: 'default',
    selectedLanguage: 'es-MX',
    selectedLanguageNormalized: 'es-mx',
    languages: ['es-MX'],
    compatibleCandidates: ['es-MX', 'es-ES', 'es'],
  });
});

test('resolveSpellCheckerLanguages resolves es-cl through deterministic Spanish regional fallback order', () => {
  const spellcheck = loadFreshSpellcheckModule();

  const result = spellcheck.resolveSpellCheckerLanguages('es-cl', ['es-MX', 'es-ES', 'es']);

  assert.deepEqual(result, {
    status: 'accepted',
    reasonCode: 'accepted.preferred-order',
    requestedTag: 'es-cl',
    normalizedTag: 'es-cl',
    base: 'es',
    script: null,
    region: 'cl',
    family: 'default',
    selectedLanguage: 'es-ES',
    selectedLanguageNormalized: 'es-es',
    languages: ['es-ES'],
    compatibleCandidates: ['es-ES', 'es-MX', 'es'],
  });
});

test('resolveSpellCheckerLanguages accepts same-base fallback candidates outside the explicit preference table', () => {
  const spellcheck = loadFreshSpellcheckModule();

  const result = spellcheck.resolveSpellCheckerLanguages('pt', ['en-US', 'pt-AO']);

  assert.deepEqual(result, {
    status: 'accepted',
    reasonCode: 'accepted.same-base-fallback',
    requestedTag: 'pt',
    normalizedTag: 'pt',
    base: 'pt',
    script: null,
    region: null,
    family: 'default',
    selectedLanguage: 'pt-AO',
    selectedLanguageNormalized: 'pt-ao',
    languages: ['pt-AO'],
    compatibleCandidates: ['pt-AO'],
  });
});

test('resolveSpellCheckerLanguages uses explicit Chinese script-family fallback ordering for zh-Hans', () => {
  const spellcheck = loadFreshSpellcheckModule();

  const result = spellcheck.resolveSpellCheckerLanguages('zh-Hans', ['zh-SG', 'zh-CN']);

  assert.deepEqual(result, {
    status: 'accepted',
    reasonCode: 'accepted.chinese-family-fallback',
    requestedTag: 'zh-Hans',
    normalizedTag: 'zh-hans',
    base: 'zh',
    script: 'hans',
    region: null,
    family: 'zh-hans',
    selectedLanguage: 'zh-CN',
    selectedLanguageNormalized: 'zh-cn',
    languages: ['zh-CN'],
    compatibleCandidates: ['zh-CN', 'zh-SG'],
  });
});

test('resolveSpellCheckerLanguages rejects ambiguous plain zh requests', () => {
  const spellcheck = loadFreshSpellcheckModule();

  const result = spellcheck.resolveSpellCheckerLanguages('zh', ['zh-CN']);

  assert.deepEqual(result, {
    status: 'rejected',
    reasonCode: 'rejected.invalid-requested-tag',
    requestedTag: 'zh',
    normalizedTag: 'zh',
    base: 'zh',
    script: null,
    region: null,
    family: null,
    selectedLanguage: '',
    selectedLanguageNormalized: '',
    languages: [],
    compatibleCandidates: [],
  });
});

test('resolveSpellCheckerLanguages rejects explicit non-Hans non-Hant Chinese scripts even when region would otherwise imply a family', () => {
  const spellcheck = loadFreshSpellcheckModule();

  const result = spellcheck.resolveSpellCheckerLanguages('zh-Latn-CN', ['zh-CN']);

  assert.deepEqual(result, {
    status: 'rejected',
    reasonCode: 'rejected.invalid-requested-tag',
    requestedTag: 'zh-Latn-CN',
    normalizedTag: 'zh-latn-cn',
    base: 'zh',
    script: 'latn',
    region: 'cn',
    family: null,
    selectedLanguage: '',
    selectedLanguageNormalized: '',
    languages: [],
    compatibleCandidates: [],
  });
});

test('resolveSpellCheckerLanguages rejects zh-Hans when only opposite-script Chinese dictionaries exist', () => {
  const spellcheck = loadFreshSpellcheckModule();

  const result = spellcheck.resolveSpellCheckerLanguages('zh-Hans', ['zh-TW', 'zh-Hant']);

  assert.deepEqual(result, {
    status: 'rejected',
    reasonCode: 'rejected.chinese-cross-script-only',
    requestedTag: 'zh-Hans',
    normalizedTag: 'zh-hans',
    base: 'zh',
    script: 'hans',
    region: null,
    family: 'zh-hans',
    selectedLanguage: '',
    selectedLanguageNormalized: '',
    languages: [],
    compatibleCandidates: [],
  });
});

test('resolveSpellCheckerLanguages does not treat explicit non-Hans non-Hant Chinese dictionary scripts as family-compatible by region', () => {
  const spellcheck = loadFreshSpellcheckModule();

  const result = spellcheck.resolveSpellCheckerLanguages('zh-Hans', ['zh-Latn-CN']);

  assert.deepEqual(result, {
    status: 'rejected',
    reasonCode: 'rejected.chinese-unscripted-only',
    requestedTag: 'zh-Hans',
    normalizedTag: 'zh-hans',
    base: 'zh',
    script: 'hans',
    region: null,
    family: 'zh-hans',
    selectedLanguage: '',
    selectedLanguageNormalized: '',
    languages: [],
    compatibleCandidates: [],
  });
});

test('resolveSpellCheckerLanguages rejects zh-Hans when only unscripted Chinese dictionaries exist', () => {
  const spellcheck = loadFreshSpellcheckModule();

  const result = spellcheck.resolveSpellCheckerLanguages('zh-Hans', ['zh']);

  assert.deepEqual(result, {
    status: 'rejected',
    reasonCode: 'rejected.chinese-unscripted-only',
    requestedTag: 'zh-Hans',
    normalizedTag: 'zh-hans',
    base: 'zh',
    script: 'hans',
    region: null,
    family: 'zh-hans',
    selectedLanguage: '',
    selectedLanguageNormalized: '',
    languages: [],
    compatibleCandidates: [],
  });
});

test('resolveSpellCheckerLanguages rejects arn when no compatible runtime dictionary exists', () => {
  const spellcheck = loadFreshSpellcheckModule();

  const result = spellcheck.resolveSpellCheckerLanguages('arn', ['es-ES', 'en-US']);

  assert.deepEqual(result, {
    status: 'rejected',
    reasonCode: 'rejected.no-compatible-dictionary',
    requestedTag: 'arn',
    normalizedTag: 'arn',
    base: 'arn',
    script: null,
    region: null,
    family: 'default',
    selectedLanguage: '',
    selectedLanguageNormalized: '',
    languages: [],
    compatibleCandidates: [],
  });
});

test('applySpellCheckerSessionConfig disables by user preference before resolving dictionaries', () => {
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
  assert.equal(result.preferenceEnabled, false);
  assert.equal(result.effectiveEnabled, false);
  assert.equal(result.resolution, null);
  assert.deepEqual(sessionDouble.enabledCalls, [false]);
  assert.deepEqual(sessionDouble.languageCalls, []);
});

test('applySpellCheckerSessionConfig enables the resolved es-cl dictionary on non-darwin platforms', () => {
  const spellcheck = loadFreshSpellcheckModule();
  const sessionDouble = createSessionDouble(['es-MX', 'es-ES', 'en-US']);

  const result = spellcheck.applySpellCheckerSessionConfig({
    targetSession: sessionDouble,
    appLanguage: 'es-cl',
    spellcheckEnabled: true,
    platform: 'win32',
  });

  assert.equal(result.ok, true);
  assert.equal(result.reason, 'applied');
  assert.equal(result.preferenceEnabled, true);
  assert.equal(result.effectiveEnabled, true);
  assert.equal(result.selectedLanguage, 'es-ES');
  assert.deepEqual(result.languages, ['es-ES']);
  assert.equal(result.resolution.reasonCode, 'accepted.preferred-order');
  assert.deepEqual(sessionDouble.enabledCalls, [true]);
  assert.deepEqual(sessionDouble.languageCalls, [['es-ES']]);
});

test('applySpellCheckerSessionConfig disables spellcheck when resolver rejects the app language', () => {
  const spellcheck = loadFreshSpellcheckModule();
  const sessionDouble = createSessionDouble(['en-US', 'es-ES']);

  const result = spellcheck.applySpellCheckerSessionConfig({
    targetSession: sessionDouble,
    appLanguage: 'arn',
    spellcheckEnabled: true,
    platform: 'win32',
  });

  assert.equal(result.ok, true);
  assert.equal(result.reason, 'resolver-rejected');
  assert.equal(result.preferenceEnabled, true);
  assert.equal(result.effectiveEnabled, false);
  assert.equal(result.resolution.reasonCode, 'rejected.no-compatible-dictionary');
  assert.deepEqual(sessionDouble.enabledCalls, [false]);
  assert.deepEqual(sessionDouble.languageCalls, []);
});

test('applySpellCheckerSessionConfig leaves darwin spellcheck platform-managed', () => {
  const spellcheck = loadFreshSpellcheckModule();
  const sessionDouble = createSessionDouble(['fr-FR', 'en-US']);

  const result = spellcheck.applySpellCheckerSessionConfig({
    targetSession: sessionDouble,
    appLanguage: 'fr',
    spellcheckEnabled: true,
    platform: 'darwin',
  });

  assert.equal(result.ok, true);
  assert.equal(result.reason, 'platform-managed');
  assert.equal(result.effectiveEnabled, true);
  assert.equal(result.resolution, null);
  assert.deepEqual(sessionDouble.enabledCalls, [true]);
  assert.deepEqual(sessionDouble.languageCalls, []);
});

test('applySpellCheckerSessionConfig disables spellcheck when setSpellCheckerLanguages is unavailable', () => {
  const spellcheck = loadFreshSpellcheckModule();
  const sessionDouble = createSessionDouble(['fr-FR', 'en-US'], {
    includeSetSpellCheckerLanguages: false,
  });

  const result = spellcheck.applySpellCheckerSessionConfig({
    targetSession: sessionDouble,
    appLanguage: 'fr',
    spellcheckEnabled: true,
    platform: 'win32',
  });

  assert.equal(result.ok, true);
  assert.equal(result.reason, 'set-spellchecker-languages-unavailable');
  assert.equal(result.effectiveEnabled, false);
  assert.equal(result.resolution.reasonCode, 'accepted.preferred-order');
  assert.deepEqual(sessionDouble.enabledCalls, [false]);
  assert.deepEqual(sessionDouble.languageCalls, []);
});

test('createController applies override settings without consulting settingsState.getSettings', () => {
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
    language: 'es-cl',
    spellcheckEnabled: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.reason, 'applied');
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

test('createController logs a resolver rejection with the new reason code surface', () => {
  const spellcheck = loadFreshSpellcheckModule();
  const log = createLogDouble();
  const sessionState = createControllerSessionState(['en-US']);

  const controller = spellcheck.createController({
    settingsState: {
      getSettings() {
        return { language: 'arn', spellcheckEnabled: true };
      },
    },
    log,
    sessionState,
    platform: 'win32',
  });

  const result = controller.apply();

  assert.equal(result.ok, true);
  assert.equal(result.reason, 'resolver-rejected');
  assert.equal(log.warnOnceCalls.length, 1);
  assert.equal(
    log.warnOnceCalls[0].key,
    'main.spellcheck.rejected.rejected.no-compatible-dictionary'
  );
  assert.deepEqual(log.warnOnceCalls[0].args[1], {
    language: 'arn',
    reasonCode: 'rejected.no-compatible-dictionary',
  });
});

test('createController decorates settings with spellcheck availability when a compatible dictionary resolves', () => {
  const spellcheck = loadFreshSpellcheckModule();

  const controller = spellcheck.createController({
    settingsState: {
      getSettings() {
        return { language: 'es-cl', spellcheckEnabled: true };
      },
    },
    log: createLogDouble(),
    sessionState: createControllerSessionState(['es-ES', 'en-US']),
    platform: 'win32',
  });

  const result = controller.decorateSettings();

  assert.deepEqual(result, {
    language: 'es-cl',
    spellcheckEnabled: true,
    spellcheckAvailable: true,
  });
});

test('createController decorates settings with spellcheck availability false when the current language has no compatible dictionary', () => {
  const spellcheck = loadFreshSpellcheckModule();

  const controller = spellcheck.createController({
    settingsState: {
      getSettings() {
        return { language: 'ar', spellcheckEnabled: true };
      },
    },
    log: createLogDouble(),
    sessionState: createControllerSessionState(['es-ES', 'en-US']),
    platform: 'win32',
  });

  const result = controller.decorateSettings();

  assert.deepEqual(result, {
    language: 'ar',
    spellcheckEnabled: true,
    spellcheckAvailable: false,
  });
});
