'use strict';

const settingsState = require('./settings');

const PREFERRED_SPELLCHECK_LANGUAGES = Object.freeze({
  de: Object.freeze(['de-DE', 'de-AT', 'de-CH', 'de']),
  en: Object.freeze(['en-US', 'en-GB', 'en-AU', 'en-CA', 'en']),
  es: Object.freeze(['es-ES', 'es-MX', 'es-US', 'es']),
  fr: Object.freeze(['fr-FR', 'fr-CA', 'fr']),
  it: Object.freeze(['it-IT', 'it']),
  pt: Object.freeze(['pt-PT', 'pt-BR', 'pt']),
});

const UNSUPPORTED_APP_SPELLCHECK_TAGS = new Set([
  'arn',
  'es-cl',
]);

function normalizeLanguageCode(value) {
  return typeof value === 'string'
    ? value.trim().toLowerCase()
    : '';
}

function normalizeAvailableLanguages(availableLanguages) {
  if (!Array.isArray(availableLanguages)) return [];
  return availableLanguages
    .filter((value) => typeof value === 'string' && value.trim())
    .map((value) => value.trim());
}

function findExactAvailableMatch(candidates, availableLanguages) {
  if (!Array.isArray(candidates) || !Array.isArray(availableLanguages)) return '';

  const byNormalized = new Map();
  for (const available of availableLanguages) {
    byNormalized.set(normalizeLanguageCode(available), available);
  }

  for (const candidate of candidates) {
    const match = byNormalized.get(normalizeLanguageCode(candidate));
    if (match) return match;
  }

  return '';
}

function findBaseLanguageMatch(baseLanguage, availableLanguages) {
  if (!baseLanguage || !Array.isArray(availableLanguages)) return '';
  return availableLanguages.find((available) => (
    settingsState.deriveLangKey(available) === baseLanguage
  )) || '';
}

function resolveSpellCheckerLanguages(appLanguage, availableLanguages) {
  const normalizedTag = settingsState.normalizeLangTag(appLanguage);
  const appLanguageBase = settingsState.deriveLangKey(normalizedTag);

  if (!normalizedTag) {
    return {
      supported: false,
      reason: 'empty-app-language',
      appLanguage: normalizedTag,
      appLanguageBase,
      languages: [],
    };
  }

  if (UNSUPPORTED_APP_SPELLCHECK_TAGS.has(normalizedTag)) {
    return {
      supported: false,
      reason: 'unsupported-app-language',
      appLanguage: normalizedTag,
      appLanguageBase,
      languages: [],
    };
  }

  const preferredCandidates = PREFERRED_SPELLCHECK_LANGUAGES[appLanguageBase];
  if (!preferredCandidates || preferredCandidates.length === 0) {
    return {
      supported: false,
      reason: 'unsupported-app-language',
      appLanguage: normalizedTag,
      appLanguageBase,
      languages: [],
    };
  }

  const available = normalizeAvailableLanguages(availableLanguages);
  if (available.length === 0) {
    return {
      supported: false,
      reason: 'no-available-languages',
      appLanguage: normalizedTag,
      appLanguageBase,
      languages: [],
    };
  }

  const exactMatch = findExactAvailableMatch(preferredCandidates, available);
  if (exactMatch) {
    return {
      supported: true,
      reason: 'exact-match',
      appLanguage: normalizedTag,
      appLanguageBase,
      selectedLanguage: exactMatch,
      languages: [exactMatch],
    };
  }

  const baseMatch = findBaseLanguageMatch(appLanguageBase, available);
  if (baseMatch) {
    return {
      supported: true,
      reason: 'base-match',
      appLanguage: normalizedTag,
      appLanguageBase,
      selectedLanguage: baseMatch,
      languages: [baseMatch],
    };
  }

  return {
    supported: false,
    reason: 'no-matching-language',
    appLanguage: normalizedTag,
    appLanguageBase,
    languages: [],
  };
}

function applySpellCheckerSessionConfig({
  targetSession,
  appLanguage,
  spellcheckEnabled,
  platform = process.platform,
} = {}) {
  if (!targetSession || typeof targetSession.setSpellCheckerEnabled !== 'function') {
    return {
      ok: false,
      reason: 'session-unavailable',
      effectiveEnabled: false,
      languages: [],
    };
  }

  const preferenceEnabled = spellcheckEnabled !== false;
  if (!preferenceEnabled) {
    targetSession.setSpellCheckerEnabled(false);
    return {
      ok: true,
      supported: true,
      reason: 'disabled-by-user',
      effectiveEnabled: false,
      languages: [],
    };
  }

  if (platform === 'darwin') {
    targetSession.setSpellCheckerEnabled(true);
    return {
      ok: true,
      supported: true,
      reason: 'darwin-managed',
      effectiveEnabled: true,
      languages: [],
    };
  }

  const resolved = resolveSpellCheckerLanguages(
    appLanguage,
    targetSession.availableSpellCheckerLanguages
  );

  if (!resolved.supported || !Array.isArray(resolved.languages) || resolved.languages.length === 0) {
    targetSession.setSpellCheckerEnabled(false);
    return {
      ok: true,
      supported: false,
      reason: resolved.reason,
      appLanguage: resolved.appLanguage,
      appLanguageBase: resolved.appLanguageBase,
      effectiveEnabled: false,
      languages: [],
    };
  }

  targetSession.setSpellCheckerEnabled(true);
  if (typeof targetSession.setSpellCheckerLanguages === 'function') {
    targetSession.setSpellCheckerLanguages(resolved.languages);
  }

  return {
    ok: true,
    supported: true,
    reason: resolved.reason,
    appLanguage: resolved.appLanguage,
    appLanguageBase: resolved.appLanguageBase,
    selectedLanguage: resolved.selectedLanguage,
    effectiveEnabled: true,
    languages: resolved.languages.slice(),
  };
}

function loadElectronSessionState() {
  try {
    const electronModule = require('electron');
    if (electronModule && typeof electronModule === 'object' && electronModule.session) {
      return electronModule.session;
    }
  } catch {}
  return null;
}

function createController({
  settingsState: settingsModule = settingsState,
  log,
  sessionState = null,
  platform = process.platform,
} = {}) {
  if (!settingsModule || typeof settingsModule.getSettings !== 'function') {
    throw new Error('[spellcheck] createController requires settingsState.getSettings');
  }

  const logger = log && typeof log === 'object' ? log : null;

  function warnOnce(key, ...args) {
    if (logger && typeof logger.warnOnce === 'function') {
      logger.warnOnce(key, ...args);
    }
  }

  function error(...args) {
    if (logger && typeof logger.error === 'function') {
      logger.error(...args);
    }
  }

  function getDefaultSession() {
    const source = sessionState || loadElectronSessionState();
    return source && source.defaultSession ? source.defaultSession : null;
  }

  function resolveSettings(settingsOverride = null) {
    return (
      settingsOverride
      && typeof settingsOverride === 'object'
      && !Array.isArray(settingsOverride)
    )
      ? settingsOverride
      : settingsModule.getSettings();
  }

  function apply(settingsOverride = null) {
    try {
      const effectiveSettings = resolveSettings(settingsOverride);
      const targetSession = getDefaultSession();

      if (!targetSession) {
        warnOnce(
          'main.spellcheck.session.unavailable',
          'Spellcheck configuration skipped: default session unavailable.'
        );
        return { ok: false, reason: 'session-unavailable' };
      }

      const result = applySpellCheckerSessionConfig({
        targetSession,
        appLanguage: effectiveSettings && typeof effectiveSettings.language === 'string'
          ? effectiveSettings.language
          : '',
        spellcheckEnabled: !effectiveSettings || effectiveSettings.spellcheckEnabled !== false,
        platform,
      });

      if (result && result.ok === true && result.supported === false && effectiveSettings.spellcheckEnabled !== false) {
        const langTag = (
          effectiveSettings
          && typeof effectiveSettings.language === 'string'
          && effectiveSettings.language.trim()
        )
          ? effectiveSettings.language.trim().toLowerCase()
          : 'unset';
        warnOnce(
          `main.spellcheck.unsupported.${langTag}.${result.reason || 'unknown'}`,
          'Spellcheck disabled for current app language: no supported Electron spellchecker language resolved.',
          { language: langTag, reason: result.reason || 'unknown' }
        );
      }

      return result;
    } catch (err) {
      error('Failed to apply spellcheck configuration:', err);
      return { ok: false, reason: 'apply-failed', error: String(err) };
    }
  }

  return {
    apply,
  };
}

module.exports = {
  PREFERRED_SPELLCHECK_LANGUAGES,
  UNSUPPORTED_APP_SPELLCHECK_TAGS,
  resolveSpellCheckerLanguages,
  applySpellCheckerSessionConfig,
  createController,
};
