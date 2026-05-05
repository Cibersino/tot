// electron/spellcheck.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-process spellcheck policy/controller for the shared Electron session.
// Responsibilities:
// - Normalize and parse the app language tag without default-language fallback.
// - Resolve the best compatible Electron spellchecker dictionary from the
//   runtime-reported available dictionaries.
// - Keep Chinese script-family resolution explicit and deterministic.
// - Apply the resulting session configuration and expose a small controller for
//   main.js startup and settings updates.

// =============================================================================
// Imports
// =============================================================================
const settingsState = require('./settings');

// =============================================================================
// Resolver constants
// =============================================================================
const DICTIONARY_PREFERENCE_BY_BASE = Object.freeze({
  de: Object.freeze(['de-de', 'de-at', 'de-ch', 'de']),
  en: Object.freeze(['en-us', 'en-gb', 'en-au', 'en-ca', 'en']),
  es: Object.freeze(['es-es', 'es-mx', 'es-us', 'es']),
  fr: Object.freeze(['fr-fr', 'fr-ca', 'fr']),
  it: Object.freeze(['it-it', 'it']),
  pt: Object.freeze(['pt-pt', 'pt-br', 'pt']),
});

const ZH_HANS_FAMILY_ORDER = Object.freeze(['zh-hans', 'zh-cn', 'zh-sg']);
const ZH_HANT_FAMILY_ORDER = Object.freeze(['zh-hant', 'zh-tw', 'zh-hk', 'zh-mo']);
const ZH_HANS_REGION_SET = new Set(['cn', 'sg']);
const ZH_HANT_REGION_SET = new Set(['tw', 'hk', 'mo']);

// =============================================================================
// Helpers
// =============================================================================
function normalizeLanguageTag(value) {
  return typeof value === 'string'
    ? settingsState.normalizeLangTag(value)
    : '';
}

function parseLanguageTag(normalizedTag) {
  if (!normalizedTag) {
    return {
      isValid: false,
      base: '',
      script: null,
      region: null,
    };
  }

  const parts = normalizedTag.split('-');
  if (parts.length === 0 || parts.some((part) => !part)) {
    return {
      isValid: false,
      base: '',
      script: null,
      region: null,
    };
  }

  const base = parts[0];
  if (!/^[a-z0-9]{2,8}$/.test(base)) {
    return {
      isValid: false,
      base,
      script: null,
      region: null,
    };
  }

  let script = null;
  let region = null;
  let index = 1;

  if (parts[index] && /^[a-z]{4}$/.test(parts[index])) {
    script = parts[index];
    index += 1;
  }

  if (parts[index] && /^([a-z]{2}|\d{3})$/.test(parts[index])) {
    region = parts[index];
    index += 1;
  }

  for (; index < parts.length; index += 1) {
    if (!/^[a-z0-9]{1,8}$/.test(parts[index])) {
      return {
        isValid: false,
        base,
        script,
        region,
      };
    }
  }

  return {
    isValid: true,
    base,
    script,
    region,
  };
}

function getChineseFamily(parsedTag) {
  if (!parsedTag || parsedTag.isValid !== true || parsedTag.base !== 'zh') {
    return null;
  }

  if (parsedTag.script === 'hans') return 'zh-hans';
  if (parsedTag.script === 'hant') return 'zh-hant';
  if (parsedTag.script !== null) return null;
  if (ZH_HANS_REGION_SET.has(parsedTag.region)) return 'zh-hans';
  if (ZH_HANT_REGION_SET.has(parsedTag.region)) return 'zh-hant';
  return null;
}

function getRequestedFamily(parsedTag) {
  if (!parsedTag || parsedTag.isValid !== true) return null;
  if (parsedTag.base !== 'zh') return 'default';
  return getChineseFamily(parsedTag);
}

function createRequestContext(appLanguage) {
  const requestedTag = typeof appLanguage === 'string'
    ? appLanguage.trim()
    : '';
  const normalizedTag = normalizeLanguageTag(requestedTag);
  const parsedTag = parseLanguageTag(normalizedTag);
  const family = getRequestedFamily(parsedTag);

  return {
    requestedTag,
    normalizedTag,
    parsedTag,
    family,
  };
}

function buildResolveResultBase(requestContext) {
  const parsedTag = requestContext.parsedTag || {};
  return {
    requestedTag: requestContext.requestedTag,
    normalizedTag: requestContext.normalizedTag,
    base: parsedTag.base || '',
    script: parsedTag.script || null,
    region: parsedTag.region || null,
    family: requestContext.family,
  };
}

function buildRejectedResolveResult(requestContext, reasonCode) {
  return {
    status: 'rejected',
    reasonCode,
    ...buildResolveResultBase(requestContext),
    selectedLanguage: '',
    selectedLanguageNormalized: '',
    languages: [],
    compatibleCandidates: [],
  };
}

function buildAcceptedResolveResult(requestContext, selectedDictionary, compatibleCandidates, reasonCode) {
  return {
    status: 'accepted',
    reasonCode,
    ...buildResolveResultBase(requestContext),
    selectedLanguage: selectedDictionary.raw,
    selectedLanguageNormalized: selectedDictionary.normalized,
    languages: [selectedDictionary.raw],
    compatibleCandidates: compatibleCandidates.map((candidate) => candidate.raw),
  };
}

function collectAvailableDictionaries(availableLanguages) {
  if (!Array.isArray(availableLanguages)) return [];

  const dictionaries = [];
  const seenNormalized = new Set();

  availableLanguages.forEach((value, index) => {
    if (typeof value !== 'string' || !value.trim()) return;

    const raw = value.trim();
    const normalized = normalizeLanguageTag(raw);
    if (!normalized || seenNormalized.has(normalized)) return;

    seenNormalized.add(normalized);

    const parsedTag = parseLanguageTag(normalized);
    dictionaries.push({
      raw,
      normalized,
      parsedTag,
      family: getChineseFamily(parsedTag),
      index,
    });
  });

  return dictionaries;
}

function sortByNormalizedTagAscending(left, right) {
  if (left.normalized < right.normalized) return -1;
  if (left.normalized > right.normalized) return 1;
  return left.index - right.index;
}

function buildNonChineseCandidateOrder(requestContext, dictionaries) {
  const compatible = dictionaries.filter((dictionary) => (
    dictionary.parsedTag.isValid === true
    && dictionary.parsedTag.base === requestContext.parsedTag.base
  ));

  if (compatible.length === 0) return [];

  const preferenceOrder = DICTIONARY_PREFERENCE_BY_BASE[requestContext.parsedTag.base] || [];
  const ordered = [];
  const used = new Set();

  preferenceOrder.forEach((preferredTag) => {
    const match = compatible.find((dictionary) => dictionary.normalized === preferredTag);
    if (!match || used.has(match.normalized)) return;
    ordered.push(match);
    used.add(match.normalized);
  });

  const remaining = compatible
    .filter((dictionary) => !used.has(dictionary.normalized))
    .sort(sortByNormalizedTagAscending);

  return ordered.concat(remaining);
}

function buildChineseCandidateOrder(requestContext, dictionaries) {
  const familyOrder = requestContext.family === 'zh-hans'
    ? ZH_HANS_FAMILY_ORDER
    : ZH_HANT_FAMILY_ORDER;
  const compatible = dictionaries.filter((dictionary) => dictionary.family === requestContext.family);
  if (compatible.length === 0) return [];

  const ordered = [];
  const used = new Set();

  familyOrder.forEach((familyTag) => {
    compatible.forEach((dictionary) => {
      if (dictionary.normalized !== familyTag || used.has(dictionary.normalized)) return;
      ordered.push(dictionary);
      used.add(dictionary.normalized);
    });

    compatible
      .filter((dictionary) => (
        dictionary.normalized.startsWith(`${familyTag}-`)
        && !used.has(dictionary.normalized)
      ))
      .sort(sortByNormalizedTagAscending)
      .forEach((dictionary) => {
        ordered.push(dictionary);
        used.add(dictionary.normalized);
      });
  });

  return ordered;
}

function moveSelectedDictionaryToFront(selectedDictionary, candidates) {
  return [
    selectedDictionary,
    ...candidates.filter((candidate) => candidate.normalized !== selectedDictionary.normalized),
  ];
}

function resolveChineseRejectionReason(requestContext, dictionaries) {
  const availableChinese = dictionaries.filter((dictionary) => (
    dictionary.parsedTag.isValid === true
    && dictionary.parsedTag.base === 'zh'
  ));

  if (availableChinese.length === 0) {
    return 'rejected.no-compatible-dictionary';
  }

  const hasUnscriptedChinese = availableChinese.some((dictionary) => dictionary.family === null);
  const hasCrossScriptChinese = availableChinese.some((dictionary) => (
    dictionary.family !== null
    && dictionary.family !== requestContext.family
  ));

  if (hasUnscriptedChinese && !hasCrossScriptChinese) {
    return 'rejected.chinese-unscripted-only';
  }

  if (hasCrossScriptChinese && !hasUnscriptedChinese) {
    return 'rejected.chinese-cross-script-only';
  }

  return 'rejected.no-compatible-dictionary';
}

// =============================================================================
// Resolver
// =============================================================================
function resolveSpellCheckerLanguages(appLanguage, availableLanguages) {
  const requestContext = createRequestContext(appLanguage);
  if (!requestContext.normalizedTag) {
    return buildRejectedResolveResult(requestContext, 'rejected.empty-requested-tag');
  }

  if (requestContext.parsedTag.isValid !== true) {
    return buildRejectedResolveResult(requestContext, 'rejected.invalid-requested-tag');
  }

  if (requestContext.parsedTag.base === 'zh' && requestContext.family === null) {
    return buildRejectedResolveResult(requestContext, 'rejected.invalid-requested-tag');
  }

  const dictionaries = collectAvailableDictionaries(availableLanguages);
  if (dictionaries.length === 0) {
    return buildRejectedResolveResult(requestContext, 'rejected.no-available-dictionaries');
  }

  const exactDictionary = dictionaries.find((dictionary) => (
    dictionary.normalized === requestContext.normalizedTag
  ));

  if (exactDictionary) {
    const orderedCompatibleCandidates = requestContext.family === 'default'
      ? buildNonChineseCandidateOrder(requestContext, dictionaries)
      : buildChineseCandidateOrder(requestContext, dictionaries);
    return buildAcceptedResolveResult(
      requestContext,
      exactDictionary,
      moveSelectedDictionaryToFront(exactDictionary, orderedCompatibleCandidates),
      'accepted.exact'
    );
  }

  if (requestContext.family === 'zh-hans' || requestContext.family === 'zh-hant') {
    const orderedChineseCandidates = buildChineseCandidateOrder(requestContext, dictionaries);
    if (orderedChineseCandidates.length > 0) {
      return buildAcceptedResolveResult(
        requestContext,
        orderedChineseCandidates[0],
        orderedChineseCandidates,
        'accepted.chinese-family-fallback'
      );
    }

    return buildRejectedResolveResult(
      requestContext,
      resolveChineseRejectionReason(requestContext, dictionaries)
    );
  }

  const orderedCandidates = buildNonChineseCandidateOrder(requestContext, dictionaries);
  if (orderedCandidates.length === 0) {
    return buildRejectedResolveResult(requestContext, 'rejected.no-compatible-dictionary');
  }

  const selectedDictionary = orderedCandidates[0];
  const preferenceOrder = DICTIONARY_PREFERENCE_BY_BASE[requestContext.parsedTag.base] || [];
  const acceptedReasonCode = preferenceOrder.includes(selectedDictionary.normalized)
    ? 'accepted.preferred-order'
    : 'accepted.same-base-fallback';

  return buildAcceptedResolveResult(
    requestContext,
    selectedDictionary,
    orderedCandidates,
    acceptedReasonCode
  );
}

// =============================================================================
// Session availability
// =============================================================================
function getSpellcheckAvailability({
  targetSession,
  appLanguage,
  platform = process.platform,
} = {}) {
  if (!targetSession) {
    return {
      available: false,
      reason: 'session-unavailable',
      selectedLanguage: '',
      languages: [],
      resolution: null,
    };
  }

  if (typeof targetSession.setSpellCheckerEnabled !== 'function') {
    return {
      available: false,
      reason: 'set-spellchecker-enabled-unavailable',
      selectedLanguage: '',
      languages: [],
      resolution: null,
    };
  }

  if (platform === 'darwin') {
    return {
      available: true,
      reason: 'platform-managed',
      selectedLanguage: '',
      languages: [],
      resolution: null,
    };
  }

  const resolution = resolveSpellCheckerLanguages(
    appLanguage,
    targetSession.availableSpellCheckerLanguages
  );

  if (resolution.status !== 'accepted') {
    return {
      available: false,
      reason: 'resolver-rejected',
      selectedLanguage: '',
      languages: [],
      resolution,
    };
  }

  if (typeof targetSession.setSpellCheckerLanguages !== 'function') {
    return {
      available: false,
      reason: 'set-spellchecker-languages-unavailable',
      selectedLanguage: '',
      languages: [],
      resolution,
    };
  }

  return {
    available: true,
    reason: 'resolved',
    selectedLanguage: resolution.selectedLanguage,
    languages: resolution.languages.slice(),
    resolution,
  };
}

// =============================================================================
// Session application
// =============================================================================
function applySpellCheckerSessionConfig({
  targetSession,
  appLanguage,
  spellcheckEnabled,
  platform = process.platform,
} = {}) {
  const preferenceEnabled = spellcheckEnabled !== false;
  const availability = getSpellcheckAvailability({
    targetSession,
    appLanguage,
    platform,
  });

  if (availability.reason === 'session-unavailable') {
    return {
      ok: false,
      reason: 'session-unavailable',
      preferenceEnabled,
      effectiveEnabled: false,
      selectedLanguage: '',
      languages: [],
      resolution: null,
    };
  }

  if (availability.reason === 'set-spellchecker-enabled-unavailable') {
    return {
      ok: false,
      reason: 'set-spellchecker-enabled-unavailable',
      preferenceEnabled,
      effectiveEnabled: false,
      selectedLanguage: '',
      languages: [],
      resolution: null,
    };
  }

  if (!preferenceEnabled) {
    targetSession.setSpellCheckerEnabled(false);
    return {
      ok: true,
      reason: 'disabled-by-user',
      preferenceEnabled: false,
      effectiveEnabled: false,
      selectedLanguage: '',
      languages: [],
      resolution: null,
    };
  }

  if (availability.reason === 'platform-managed') {
    targetSession.setSpellCheckerEnabled(true);
    return {
      ok: true,
      reason: 'platform-managed',
      preferenceEnabled: true,
      effectiveEnabled: true,
      selectedLanguage: '',
      languages: [],
      resolution: null,
    };
  }

  if (availability.available !== true) {
    targetSession.setSpellCheckerEnabled(false);
    return {
      ok: true,
      reason: availability.reason,
      preferenceEnabled: true,
      effectiveEnabled: false,
      selectedLanguage: '',
      languages: [],
      resolution: availability.resolution,
    };
  }

  targetSession.setSpellCheckerEnabled(true);
  targetSession.setSpellCheckerLanguages(availability.languages);

  return {
    ok: true,
    reason: 'applied',
    preferenceEnabled: true,
    effectiveEnabled: true,
    selectedLanguage: availability.selectedLanguage,
    languages: availability.languages.slice(),
    resolution: availability.resolution,
  };
}

// =============================================================================
// Electron session access
// =============================================================================
function loadElectronSessionState() {
  try {
    const electronModule = require('electron');
    if (electronModule && typeof electronModule === 'object' && electronModule.session) {
      return electronModule.session;
    }
  } catch {}
  return null;
}

// =============================================================================
// Controller factory
// =============================================================================
function createController({
  settingsState: settingsModule = settingsState,
  log,
  sessionState = null,
  platform = process.platform,
} = {}) {
  if (!settingsModule || typeof settingsModule.getSettings !== 'function') {
    throw new Error('[spellcheck] createController requires settingsState.getSettings');
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
        log.warnOnce(
          'main.spellcheck.session.unavailable',
          'Spellcheck configuration skipped: default session unavailable.'
        );
        return {
          ok: false,
          reason: 'session-unavailable',
        };
      }

      const result = applySpellCheckerSessionConfig({
        targetSession,
        appLanguage: effectiveSettings && typeof effectiveSettings.language === 'string'
          ? effectiveSettings.language
          : '',
        spellcheckEnabled: !effectiveSettings || effectiveSettings.spellcheckEnabled !== false,
        platform,
      });

      if (result.ok === false) {
        log.warnOnce(
          `main.spellcheck.session-api.${result.reason || 'unknown'}`,
          'Spellcheck configuration skipped: required Electron spellchecker session API unavailable.',
          { reason: result.reason || 'unknown' }
        );
        return result;
      }

      if (result.reason === 'set-spellchecker-languages-unavailable') {
        const normalizedLanguage = normalizeLanguageTag(
          effectiveSettings && typeof effectiveSettings.language === 'string'
            ? effectiveSettings.language
            : ''
        ) || 'unset';
        log.warnOnce(
          `main.spellcheck.session-api.${normalizedLanguage}.set-spellchecker-languages-unavailable`,
          'Spellcheck disabled for current app language: session.setSpellCheckerLanguages unavailable.',
          { language: normalizedLanguage }
        );
      } else if (
        result.reason === 'resolver-rejected'
        && result.preferenceEnabled === true
        && result.resolution
      ) {
        const normalizedLanguage = result.resolution.normalizedTag || 'unset';
        log.warnOnce(
          `main.spellcheck.rejected.${normalizedLanguage}.${result.resolution.reasonCode}`,
          'Spellcheck disabled for current app language: no compatible Electron spellchecker dictionary resolved.',
          {
            language: normalizedLanguage,
            reasonCode: result.resolution.reasonCode,
          }
        );
      }

      return result;
    } catch (err) {
      log.error('Failed to apply spellcheck configuration:', err);
      return { ok: false, reason: 'apply-failed', error: String(err) };
    }
  }

  function decorateSettings(settingsOverride = null) {
    const effectiveSettings = resolveSettings(settingsOverride);
    const targetSession = getDefaultSession();
    const availability = getSpellcheckAvailability({
      targetSession,
      appLanguage: effectiveSettings && typeof effectiveSettings.language === 'string'
        ? effectiveSettings.language
        : '',
      platform,
    });

    return {
      ...effectiveSettings,
      spellcheckAvailable: availability.available,
    };
  }

  return {
    apply,
    decorateSettings,
  };
}

// =============================================================================
// Exports
// =============================================================================
module.exports = {
  resolveSpellCheckerLanguages,
  applySpellCheckerSessionConfig,
  createController,
};

// =============================================================================
// End of electron/spellcheck.js
// =============================================================================
