// public/js/current_text_refresh_policy.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Current-text refresh policy owner for main-window derived refresh decisions.
// Responsibilities:
// - Define refresh-kind constants and priority ordering.
// - Normalize settings/count-context inputs used by refresh classification.
// - Decide whether settings or preset changes require full, stats-only, or time-only refreshes.
// - Resolve number-format entries through explicit graph preference scopes.
// - Build a controller that dispatches refresh requests through injected callbacks.

(() => {
  // =============================================================================
  // Logger
  // =============================================================================

  if (typeof window.getLogger !== 'function') {
    throw new Error('[current-text-refresh-policy] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('current-text-refresh-policy');
  log.debug('Current text refresh policy starting...');

  // =============================================================================
  // Constants / config
  // =============================================================================

  const REFRESH_KIND_NONE = 'none';
  const REFRESH_KIND_TIME_ONLY = 'time_only';
  const REFRESH_KIND_STATS_DISPLAY = 'stats_display';
  const REFRESH_KIND_FULL = 'full';

  const REFRESH_KIND_PRIORITY = Object.freeze({
    [REFRESH_KIND_NONE]: 0,
    [REFRESH_KIND_TIME_ONLY]: 1,
    [REFRESH_KIND_STATS_DISPLAY]: 2,
    [REFRESH_KIND_FULL]: 3,
  });

  // =============================================================================
  // Helpers
  // =============================================================================

  function normalizeSettings(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return {};
    }
    return settings;
  }

  function normalizeCountContext(context, getDefaultCountLocaleTag) {
    const source = context && typeof context === 'object' ? context : {};
    const explicitLocaleTag = typeof source.idioma === 'string' && source.idioma.trim()
      ? source.idioma.trim()
      : '';
    const defaultLocaleTag = explicitLocaleTag ? '' : getDefaultCountLocaleTag();
    const localeTag = explicitLocaleTag || (
      typeof defaultLocaleTag === 'string' && defaultLocaleTag.trim()
        ? defaultLocaleTag.trim()
        : ''
    );
    if (!localeTag) {
      throw new Error('[current-text-refresh-policy] default count locale tag unavailable');
    }
    return {
      modoConteo: source.modoConteo === 'simple' ? 'simple' : 'preciso',
      idioma: localeTag,
    };
  }

  function getPreferenceScope(language) {
    const helper = window.RendererI18n && typeof window.RendererI18n.getPreferenceScope === 'function'
      ? window.RendererI18n.getPreferenceScope
      : null;
    if (!helper) throw new Error('[current-text-refresh-policy] RendererI18n.getPreferenceScope unavailable');
    return helper(language);
  }

  function getRefreshKindPriority(kind) {
    return REFRESH_KIND_PRIORITY[kind] || 0;
  }

  function pickHigherPriorityRefresh(currentKind, nextKind) {
    return getRefreshKindPriority(nextKind) > getRefreshKindPriority(currentKind)
      ? nextKind
      : currentKind;
  }

  function getNumberFormattingEntry(settings, languageId) {
    const normalizedSettings = normalizeSettings(settings);
    const numberFormattingByScope = normalizedSettings.numberFormattingByScope;
    if (!numberFormattingByScope || typeof numberFormattingByScope !== 'object' || Array.isArray(numberFormattingByScope)) {
      return null;
    }
    const entry = numberFormattingByScope[getPreferenceScope(languageId)];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return null;
    }
    const thousands = typeof entry.separadorMiles === 'string' ? entry.separadorMiles : '';
    const decimal = typeof entry.separadorDecimal === 'string' ? entry.separadorDecimal : '';
    if (!thousands && !decimal) {
      return null;
    }
    return {
      separadorMiles: thousands,
      separadorDecimal: decimal,
    };
  }

  function isNumberFormattingChanged(previousSettings, nextSettings, languageId) {
    const previousEntry = getNumberFormattingEntry(previousSettings, languageId);
    const nextEntry = getNumberFormattingEntry(nextSettings, languageId);
    if (!previousEntry && !nextEntry) return false;
    if (!previousEntry || !nextEntry) return true;
    return previousEntry.separadorMiles !== nextEntry.separadorMiles
      || previousEntry.separadorDecimal !== nextEntry.separadorDecimal;
  }

  function classifyPresetOutcome(outcome) {
    return outcome && outcome.wpmChanged === true
      ? REFRESH_KIND_TIME_ONLY
      : REFRESH_KIND_NONE;
  }

  function classifySettingsChange({
    previousSettings,
    nextSettings,
    previousCountContext,
    nextCountContext,
    presetOutcome,
  } = {}, getDefaultCountLocaleTag) {
    const previousContext = normalizeCountContext(previousCountContext, getDefaultCountLocaleTag);
    const nextContext = normalizeCountContext(nextCountContext, getDefaultCountLocaleTag);
    let refreshKind = REFRESH_KIND_NONE;

    if (previousContext.modoConteo !== nextContext.modoConteo) {
      refreshKind = REFRESH_KIND_FULL;
    }

    if (previousContext.idioma !== nextContext.idioma) {
      refreshKind = pickHigherPriorityRefresh(
        refreshKind,
        nextContext.modoConteo === 'preciso'
          ? REFRESH_KIND_FULL
          : REFRESH_KIND_STATS_DISPLAY
      );
    }

    const nextLanguageId = normalizeSettings(nextSettings).language;
    if (isNumberFormattingChanged(previousSettings, nextSettings, nextLanguageId)) {
      refreshKind = pickHigherPriorityRefresh(refreshKind, REFRESH_KIND_STATS_DISPLAY);
    }

    return pickHigherPriorityRefresh(refreshKind, classifyPresetOutcome(presetOutcome));
  }

  // =============================================================================
  // Controller factory
  // =============================================================================

  function createController({
    getDefaultCountLocaleTag,
    requestFullRefresh,
    requestStatsDisplayRefresh,
    requestTimeOnlyRefresh,
  } = {}) {
    if (typeof getDefaultCountLocaleTag !== 'function') {
      throw new Error('[current-text-refresh-policy] getDefaultCountLocaleTag missing');
    }
    if (typeof requestFullRefresh !== 'function') {
      throw new Error('[current-text-refresh-policy] requestFullRefresh missing');
    }
    if (typeof requestStatsDisplayRefresh !== 'function') {
      throw new Error('[current-text-refresh-policy] requestStatsDisplayRefresh missing');
    }
    if (typeof requestTimeOnlyRefresh !== 'function') {
      throw new Error('[current-text-refresh-policy] requestTimeOnlyRefresh missing');
    }

    function classifySettingsChangeForDefaultLocale(args = {}) {
      return classifySettingsChange(args, getDefaultCountLocaleTag);
    }

    function dispatchRefresh(kind, reason = 'current-text refresh') {
      if (kind === REFRESH_KIND_FULL) {
        requestFullRefresh(reason);
        return REFRESH_KIND_FULL;
      }
      if (kind === REFRESH_KIND_STATS_DISPLAY) {
        requestStatsDisplayRefresh(reason);
        return REFRESH_KIND_STATS_DISPLAY;
      }
      if (kind === REFRESH_KIND_TIME_ONLY) {
        requestTimeOnlyRefresh(reason);
        return REFRESH_KIND_TIME_ONLY;
      }
      return REFRESH_KIND_NONE;
    }

    function dispatchPresetOutcome(outcome, reason = 'preset resolution') {
      const kind = classifyPresetOutcome(outcome);
      dispatchRefresh(kind, reason);
      return kind;
    }

    function dispatchSettingsChange(args = {}) {
      const kind = classifySettingsChangeForDefaultLocale(args);
      dispatchRefresh(kind, args.reason || 'settings change');
      return kind;
    }

    return {
      classifyPresetOutcome,
      classifySettingsChange: classifySettingsChangeForDefaultLocale,
      dispatchPresetOutcome,
      dispatchRefresh,
      dispatchSettingsChange,
      pickHigherPriorityRefresh,
    };
  }

  // =============================================================================
  // Module surface
  // =============================================================================

  window.CurrentTextRefreshPolicy = {
    REFRESH_KIND_FULL,
    REFRESH_KIND_NONE,
    REFRESH_KIND_STATS_DISPLAY,
    REFRESH_KIND_TIME_ONLY,
    createController,
    pickHigherPriorityRefresh,
  };
})();

// =============================================================================
// End of public/js/current_text_refresh_policy.js
// =============================================================================
