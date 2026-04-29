// public/reading_test_result.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Renderer script for the reading-test result window.
// Responsibilities:
// - Validate required renderer bridges before the window boots.
// - Load renderer translations for the current language.
// - Render the measured WPM and elapsed-time summary from init payload data.
// - Serialize bootstrap settings and init-payload updates through one UI sync path.
// - Keep the continue action local to the result window.
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
  // DOM bootstrap
  // =============================================================================
  document.addEventListener('DOMContentLoaded', () => {
    const elements = {
      title: document.getElementById('readingTestResultTitle'),
      wpmLabel: document.getElementById('readingTestResultWpmLabel'),
      wpmValue: document.getElementById('readingTestResultWpmValue'),
      summary: document.getElementById('readingTestResultSummary'),
      btnContinue: document.getElementById('readingTestResultContinue'),
    };

    if (Object.values(elements).some((element) => !element)) {
      log.error('Reading-test result window missing required DOM; script aborted.');
      return;
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
    let uiSyncChain = Promise.resolve();
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

    function applyPayloadState(payload) {
      state.measuredWpm = Number.isFinite(payload && payload.measuredWpm)
        ? Math.round(payload.measuredWpm)
        : 0;
      state.elapsedMs = Number.isFinite(payload && payload.elapsedMs)
        ? Math.max(0, Math.round(payload.elapsedMs))
        : 0;
      state.wordCount = Number.isFinite(payload && payload.wordCount)
        ? Math.max(0, Math.round(payload.wordCount))
        : 0;
    }

    function formatElapsedTime(ms) {
      const totalSeconds = Number.isFinite(Number(ms)) && Number(ms) > 0
        ? Math.floor(Number(ms) / 1000)
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

    resultApi.onInitData((payload) => {
      enqueueUiSync(async () => {
        applyPayloadState(payload);
      }).catch((err) => {
        log.error('Reading-test result init failed:', err);
      });
    });

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
  });
})();

// =============================================================================
// End of public/reading_test_result.js
// =============================================================================
