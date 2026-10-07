// public/reading_test_result.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Renderer script for the reading-test result window.
// Responsibilities:
// - Validate required renderer bridges before the window boots.
// - Resolve bootstrap settings and late init payloads through one render path.
// - Load renderer translations for the active window language.
// - Render the measured WPM summary and invariant numeric values.
// - Keep the window self-contained after the preload hands off init data.

(() => {
  // =============================================================================
  // Renderer bridges / logger
  // =============================================================================
  let log = null;

  function failClosedResultBootstrap(error) {
    try {
      if (log && typeof log.error === 'function') {
        log.error('Reading-test result bootstrap failed; closing window:', error);
      }
    } finally {
      if (typeof window.close === 'function') window.close();
    }
    throw error;
  }

  if (typeof window.getLogger !== 'function') {
    failClosedResultBootstrap(new Error('[reading-test-result] window.getLogger unavailable; cannot continue'));
  }
  try {
    log = window.getLogger('reading-test-result');
    log.debug('Reading-test result window starting...');
  } catch (err) {
    failClosedResultBootstrap(err);
  }

  const resultApi = window.readingTestResultAPI || null;
  if (!resultApi
    || typeof resultApi.getSettings !== 'function'
    || typeof resultApi.onInitData !== 'function'
    || typeof resultApi.onSettingsChanged !== 'function') {
    failClosedResultBootstrap(new Error('[reading-test-result] readingTestResultAPI unavailable; cannot continue'));
  }
  let resultI18nTerminal = false;
  const i18nApi = window.RendererI18n || null;
  if (!i18nApi
    || typeof i18nApi.transitionRendererTranslations !== 'function'
    || typeof i18nApi.tRenderer !== 'function'
    || typeof i18nApi.renderLocalizedLabelWithInvariantValue !== 'function') {
    reportTerminalResultI18nFailure('startup-api');
    throw new Error('[reading-test-result] RendererI18n unavailable; cannot continue');
  }
  const {
    transitionRendererTranslations,
    tRenderer,
    renderLocalizedLabelWithInvariantValue,
  } = i18nApi;

  const appConstants = window.AppConstants || null;
  if (!appConstants || typeof appConstants.DEFAULT_LANG !== 'string' || !appConstants.DEFAULT_LANG.trim()) {
    throw new Error('[reading-test-result] AppConstants.DEFAULT_LANG unavailable; cannot continue');
  }
  const formatUtils = window.FormatUtils || null;
  if (!formatUtils
    || typeof formatUtils.obtenerSeparadoresDeNumeros !== 'function'
    || typeof formatUtils.formatearNumero !== 'function') {
    failClosedResultBootstrap(new Error('[reading-test-result] FormatUtils unavailable; cannot continue'));
  }
  const { obtenerSeparadoresDeNumeros, formatearNumero } = formatUtils;

  // =============================================================================
  // App lifecycle / bootstrapping
  // =============================================================================
  document.addEventListener('DOMContentLoaded', initReadingTestResultWindow);

  function reportTerminalResultI18nFailure(kind) {
    if (resultI18nTerminal) return;
    resultI18nTerminal = true;
    if (typeof resultApi.reportRendererI18nFailure !== 'function') {
      log.warn('readingTestResultAPI.reportRendererI18nFailure unavailable (ignored); closing failed renderer locally.');
      if (typeof window.close === 'function') window.close();
      return;
    }
    try {
      resultApi.reportRendererI18nFailure({ kind });
    } catch (reportErr) {
      log.warn('readingTestResultAPI.reportRendererI18nFailure failed (ignored); closing failed renderer locally:', reportErr);
      if (typeof window.close === 'function') window.close();
    }
  }

  function initReadingTestResultWindow() {
    if (resultI18nTerminal) return;
    // Keep the required DOM contract explicit so the window aborts early if
    // the HTML shell drifts away from the renderer script expectations.
    function getRequiredElements() {
      const requiredElements = {
        title: document.getElementById('readingTestResultTitle'),
        wpmLabel: document.getElementById('readingTestResultWpmLabel'),
        wpmValue: document.getElementById('readingTestResultWpmValue'),
        summary: document.getElementById('readingTestResultSummary'),
        summaryRegion: document.querySelector('.reading-test-result__meta'),
        btnContinue: document.getElementById('readingTestResultContinue'),
      };

      if (Object.values(requiredElements).some((element) => !element)) {
        log.error('Reading-test result window missing required DOM; script aborted.');
        if (typeof window.close === 'function') window.close();
        return null;
      }

      return requiredElements;
    }

    const elements = getRequiredElements();
    if (!elements) return;

    // Keep event-driven updates and bootstrap settings on the same queued render
    // path so translation loading and DOM writes stay serialized.
    function handleInitData(payload) {
      if (resultI18nTerminal) return;
      enqueueUiSync(async () => {
        applyPayloadState(payload);
      }).then(() => {
        if (resultI18nTerminal) return;
        elements.btnContinue.focus({ preventScroll: true });
      }).catch((err) => {
        log.error('Reading-test result init failed:', err);
        reportResultI18nFailure(err, { startup: !state.translationsLoadedFor });
      });
    }

    // Bootstrap may start before settings are available; this path applies the
    // persisted language if possible and otherwise keeps the window on DEFAULT_LANG.
    function loadInitialSettings() {
      enqueueUiSync(async () => {
        let nextSettings;
        try {
          nextSettings = await resultApi.getSettings() || {};
        } catch (err) {
          log.warn('BOOTSTRAP: Reading-test result initial settings fetch failed (using default language):', err);
          nextSettings = {};
        }
        return {
          language: normalizeLanguage(nextSettings.language),
          settings: nextSettings,
        };
      }).catch((err) => {
        log.error('BOOTSTRAP: Reading-test result initial render failed:', err);
        reportResultI18nFailure(err, { startup: !state.translationsLoadedFor });
      });
    }

    function handleSettingsChanged(settings) {
      if (resultI18nTerminal) return;
      enqueueUiSync(async () => {
        const nextSettings = settings || {};
        const nextLanguage = normalizeLanguage(nextSettings.language);
        const languageChanged = nextLanguage !== state.currentLanguage;
        const needsTranslationRetry = state.translationsLoadedFor !== nextLanguage;
        if (!languageChanged && !needsTranslationRetry) {
          state.settingsCache = nextSettings;
          return false;
        }
        return { language: nextLanguage, settings: nextSettings };
      }).catch((err) => {
        reportResultI18nFailure(err);
      });
    }

    // =============================================================================
    // Constants / shared state
    // =============================================================================
    const DEFAULT_LANG = appConstants.DEFAULT_LANG.trim();
    const state = {
      currentLanguage: DEFAULT_LANG,
      translationsLoadedFor: '',
      settingsCache: {},
      measuredWpm: 0,
      elapsedMs: 0,
      wordCount: 0,
    };
    // Chain UI updates so late preload replay and bootstrap settings do not race
    // each other during first paint.
    let uiSyncChain = Promise.resolve();
    // Summary metrics keep invariant values LTR even when the window language is RTL.
    let currentWindowLanguageDirection = null;

    // =============================================================================
    // Helpers
    // =============================================================================
    function normalizeLanguage(language, fallback = DEFAULT_LANG) {
      const normalized = typeof language === 'string'
        ? language.trim().toLowerCase()
        : '';
      return normalized || fallback;
    }

    async function transitionResultTranslations(language, settings) {
      const target = normalizeLanguage(language || state.currentLanguage);
      const previousLanguage = state.currentLanguage;
      const previousSettings = state.settingsCache;
      const nextSettings = typeof settings === 'undefined'
        ? state.settingsCache
        : settings || {};
      await transitionRendererTranslations(target, {
        applyTranslations: async ({ language: appliedLanguage, restoring }) => {
          state.currentLanguage = restoring ? previousLanguage : appliedLanguage;
          state.settingsCache = restoring ? previousSettings : nextSettings;
          currentWindowLanguageDirection = document.documentElement.dataset.languageDirection;
          await renderUi();
        },
      });
      state.translationsLoadedFor = state.currentLanguage;
    }

    function reportResultI18nFailure(err, { startup = false } = {}) {
      const transition = err && err.rendererI18nTransition;
      if (!transition) {
        return;
      }
      if (!startup && transition && transition.hadEstablishedState && !transition.restorationFailed) {
        log.error('Reading-test result language transition failed; previous translation state remains authoritative:', err);
        return;
      }
      log.error('Reading-test result i18n failure requires window closure:', err);
      reportTerminalResultI18nFailure(startup ? 'startup' : 'transition-restoration');
    }

    async function formatInteger(value) {
      const numeric = Number(value);
      const safe = Number.isFinite(numeric) ? Math.round(numeric) : 0;
      const { separadorMiles, separadorDecimal } = await obtenerSeparadoresDeNumeros(
        state.currentLanguage || DEFAULT_LANG,
        state.settingsCache
      );
      return formatearNumero(safe, separadorMiles, separadorDecimal);
    }

    function getRoundedFiniteValue(value, { minimum = null } = {}) {
      if (!Number.isFinite(value)) return 0;
      const rounded = Math.round(value);
      return minimum === null ? rounded : Math.max(minimum, rounded);
    }

    function applyPayloadState(payload) {
      state.measuredWpm = getRoundedFiniteValue(payload && payload.measuredWpm);
      state.elapsedMs = getRoundedFiniteValue(payload && payload.elapsedMs, { minimum: 0 });
      state.wordCount = getRoundedFiniteValue(payload && payload.wordCount, { minimum: 0 });
    }

    function formatElapsedTime(ms) {
      const numericMs = Number(ms);
      const totalSeconds = Number.isFinite(numericMs) && numericMs > 0
        ? Math.floor(numericMs / 1000)
        : 0;
      const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
      const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
      const seconds = (totalSeconds % 60).toString().padStart(2, '0');
      return `${hours}:${minutes}:${seconds}`;
    }

    function buildSummaryMetricNode(labelKey, valueText, languageDirection) {
      const metricNode = document.createElement('span');
      metricNode.className = 'reading-test-result__summary-metric';
      metricNode.dir = languageDirection === 'rtl' ? 'rtl' : 'ltr';
      renderLocalizedLabelWithInvariantValue(metricNode, {
        labelText: `${tRenderer(labelKey)}: `,
        valueText,
        valueDirection: 'ltr',
      });
      return metricNode;
    }

    function buildSummarySeparatorNode() {
      const separatorNode = document.createElement('span');
      separatorNode.className = 'reading-test-result__summary-separator';
      separatorNode.setAttribute('aria-hidden', 'true');
      separatorNode.textContent = '·';
      return separatorNode;
    }

    // RendererI18n owns the copy; this function only maps current state into DOM.
    async function renderUi() {
      document.title = tRenderer('renderer.reading_test.result.title');
      elements.title.textContent = tRenderer('renderer.reading_test.result.title');
      elements.wpmLabel.textContent = tRenderer('renderer.reading_test.result.measured_wpm');
      elements.summaryRegion.setAttribute('aria-label', tRenderer('renderer.reading_test.result.summary_aria'));
      elements.btnContinue.textContent = tRenderer('renderer.reading_test.result.continue_button');
      const measuredWpmText = await formatInteger(state.measuredWpm);
      const wordCountText = await formatInteger(state.wordCount);
      const metricDirection = currentWindowLanguageDirection === 'rtl' ? 'rtl' : 'ltr';
      elements.wpmValue.textContent = measuredWpmText;
      elements.summary.textContent = '';
      const summaryRow = document.createElement('span');
      summaryRow.className = 'reading-test-result__summary-row';
      summaryRow.dir = 'ltr';
      summaryRow.appendChild(
        buildSummaryMetricNode(
          'renderer.reading_test.result.elapsed_time',
          formatElapsedTime(state.elapsedMs),
          metricDirection
        )
      );
      summaryRow.appendChild(buildSummarySeparatorNode());
      summaryRow.appendChild(
        buildSummaryMetricNode(
          'renderer.reading_test.result.word_count',
          wordCountText,
          metricDirection
        )
      );
      elements.summary.appendChild(summaryRow);
    }

    // Every state-changing entrypoint funnels through this queue so translation
    // readiness and DOM rendering observe the same ordering.
    function enqueueUiSync(updateFn) {
      const runUpdate = async () => {
        // Main-process closure is asynchronous. Do not admit queued semantic
        // work after this window has entered terminal i18n failure.
        if (resultI18nTerminal) return;
        const transitionRequest = await updateFn();
        if (transitionRequest === false) return;
        await transitionResultTranslations(
          transitionRequest && transitionRequest.language,
          transitionRequest && transitionRequest.settings
        );
      };
      uiSyncChain = uiSyncChain.then(runUpdate, runUpdate);
      return uiSyncChain;
    }

    // =============================================================================
    // UI wiring / bootstrap updates
    // =============================================================================
    elements.btnContinue.addEventListener('click', () => {
      window.close();
    });

    resultApi.onInitData(handleInitData);
    resultApi.onSettingsChanged(handleSettingsChanged);
    loadInitialSettings();
  }
})();

// =============================================================================
// End of public/reading_test_result.js
// =============================================================================
