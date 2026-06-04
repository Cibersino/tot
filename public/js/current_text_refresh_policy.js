// public/js/current_text_refresh_policy.js
'use strict';

(() => {
  if (typeof window.getLogger !== 'function') {
    throw new Error('[current-text-refresh-policy] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('current-text-refresh-policy');

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

  function normalizeSettings(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return {};
    }
    return settings;
  }

  function normalizeCountContext(context) {
    const source = context && typeof context === 'object' ? context : {};
    return {
      modoConteo: source.modoConteo === 'simple' ? 'simple' : 'preciso',
      idioma: typeof source.idioma === 'string' && source.idioma.trim()
        ? source.idioma.trim()
        : 'es',
    };
  }

  function getLangBase(language) {
    const helper = window.RendererI18n && typeof window.RendererI18n.getLangBase === 'function'
      ? window.RendererI18n.getLangBase
      : null;
    if (helper) {
      const resolved = helper(language);
      if (typeof resolved === 'string' && resolved.trim()) {
        return resolved.trim().toLowerCase();
      }
    }
    log.warnOnce(
      'current_text_refresh_policy.rendererI18n.getLangBase.fallback',
      'RendererI18n.getLangBase did not resolve a language base; using fallback.'
    );
    return String(language || '').trim().toLowerCase().split(/[-_]/)[0] || 'es';
  }

  function getRefreshKindPriority(kind) {
    return REFRESH_KIND_PRIORITY[kind] || 0;
  }

  function pickHigherPriorityRefresh(currentKind, nextKind) {
    return getRefreshKindPriority(nextKind) > getRefreshKindPriority(currentKind)
      ? nextKind
      : currentKind;
  }

  function getNumberFormattingEntry(settings, language) {
    const normalizedSettings = normalizeSettings(settings);
    const numberFormatting = normalizedSettings.numberFormatting;
    if (!numberFormatting || typeof numberFormatting !== 'object' || Array.isArray(numberFormatting)) {
      return null;
    }
    const entry = numberFormatting[getLangBase(language)];
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

  function isNumberFormattingChanged(previousSettings, nextSettings, language) {
    const previousEntry = getNumberFormattingEntry(previousSettings, language);
    const nextEntry = getNumberFormattingEntry(nextSettings, language);
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
  } = {}) {
    const previousContext = normalizeCountContext(previousCountContext);
    const nextContext = normalizeCountContext(nextCountContext);
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

    if (isNumberFormattingChanged(previousSettings, nextSettings, nextContext.idioma)) {
      refreshKind = pickHigherPriorityRefresh(refreshKind, REFRESH_KIND_STATS_DISPLAY);
    }

    return pickHigherPriorityRefresh(refreshKind, classifyPresetOutcome(presetOutcome));
  }

  function createController({
    requestFullRefresh,
    requestStatsDisplayRefresh,
    requestTimeOnlyRefresh,
  } = {}) {
    if (typeof requestFullRefresh !== 'function') {
      throw new Error('[current-text-refresh-policy] requestFullRefresh missing');
    }
    if (typeof requestStatsDisplayRefresh !== 'function') {
      throw new Error('[current-text-refresh-policy] requestStatsDisplayRefresh missing');
    }
    if (typeof requestTimeOnlyRefresh !== 'function') {
      throw new Error('[current-text-refresh-policy] requestTimeOnlyRefresh missing');
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
      const kind = classifySettingsChange(args);
      dispatchRefresh(kind, args.reason || 'settings change');
      return kind;
    }

    return {
      classifyPresetOutcome,
      classifySettingsChange,
      dispatchPresetOutcome,
      dispatchRefresh,
      dispatchSettingsChange,
      pickHigherPriorityRefresh,
    };
  }

  window.CurrentTextRefreshPolicy = {
    REFRESH_KIND_FULL,
    REFRESH_KIND_NONE,
    REFRESH_KIND_STATS_DISPLAY,
    REFRESH_KIND_TIME_ONLY,
    createController,
    pickHigherPriorityRefresh,
  };
})();
