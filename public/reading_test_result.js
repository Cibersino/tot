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
// =============================================================================

(() => {
  // =============================================================================
  // Renderer bridges / logger
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[reading-test-result] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('reading-test-result');
  log.debug('Reading-test result window starting...');

  const resultApi = window.readingTestResultAPI || null;
  if (!resultApi
    || typeof resultApi.getSettings !== 'function'
    || typeof resultApi.onInitData !== 'function') {
    throw new Error('[reading-test-result] readingTestResultAPI unavailable; cannot continue');
  }

  const i18nApi = window.RendererI18n || null;
  if (!i18nApi
    || typeof i18nApi.loadRendererTranslations !== 'function'
    || typeof i18nApi.tRenderer !== 'function'
    || typeof i18nApi.applyWindowLanguageAttributes !== 'function'
    || typeof i18nApi.renderLocalizedLabelWithInvariantValue !== 'function') {
    throw new Error('[reading-test-result] RendererI18n unavailable; cannot continue');
  }
  const {
    loadRendererTranslations,
    tRenderer,
    applyWindowLanguageAttributes,
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
    throw new Error('[reading-test-result] FormatUtils unavailable; cannot continue');
  }
  const { obtenerSeparadoresDeNumeros, formatearNumero } = formatUtils;

  // =============================================================================
  // App lifecycle / bootstrapping
  // =============================================================================
  document.addEventListener('DOMContentLoaded', initReadingTestResultWindow);

  function initReadingTestResultWindow() {
    // Keep the required DOM contract explicit so the window aborts early if
    // the HTML shell drifts away from the renderer script expectations.
    function getRequiredElements() {
      const requiredElements = {
        title: document.getElementById('readingTestResultTitle'),
        wpmLabel: document.getElementById('readingTestResultWpmLabel'),
        wpmValue: document.getElementById('readingTestResultWpmValue'),
        summary: document.getElementById('readingTestResultSummary'),
        btnContinue: document.getElementById('readingTestResultContinue'),
      };

      if (Object.values(requiredElements).some((element) => !element)) {
        log.error('Reading-test result window missing required DOM; script aborted.');
        return null;
      }

      return requiredElements;
    }

    const elements = getRequiredElements();
    if (!elements) return;

    // Keep event-driven updates and bootstrap settings on the same queued render
    // path so translation loading and DOM writes stay serialized.
    function handleInitData(payload) {
      enqueueUiSync(async () => {
        applyPayloadState(payload);
      }).catch((err) => {
        log.error('Reading-test result init failed:', err);
      });
    }

    // Bootstrap may start before settings are available; this path applies the
    // persisted language if possible and otherwise keeps the window on DEFAULT_LANG.
    function loadInitialSettings() {
      enqueueUiSync(async () => {
        try {
          const settings = await resultApi.getSettings();
          state.settingsCache = settings || {};
          state.currentLanguage = normalizeLanguage(settings && settings.language);
        } catch (err) {
          log.warn('BOOTSTRAP: Reading-test result initial settings fetch failed (using default language):', err);
          state.settingsCache = {};
          state.currentLanguage = DEFAULT_LANG;
        }
      }).catch((err) => {
        log.error('BOOTSTRAP: Reading-test result initial render failed:', err);
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

    async function ensureTranslationsLoaded() {
      const target = normalizeLanguage(state.currentLanguage);
      state.currentLanguage = target;
      const windowLanguage = applyWindowLanguageAttributes(target);
      currentWindowLanguageDirection = windowLanguage && windowLanguage.languageDirection;
      if (state.translationsLoadedFor === target) return;
      try {
        await loadRendererTranslations(target);
        state.translationsLoadedFor = target;
      } catch (err) {
        log.warn('Reading-test result translation load failed (using fallback copy):', err);
      }
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
      elements.btnContinue.textContent = tRenderer('renderer.reading_test.result.buttons.continue');
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
        await updateFn();
        await ensureTranslationsLoaded();
        await renderUi();
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
    loadInitialSettings();
  }
})();

// =============================================================================
// End of public/reading_test_result.js
// =============================================================================
