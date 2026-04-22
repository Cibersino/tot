// public/reading_test_result.js
'use strict';

(() => {
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
    || typeof i18nApi.msgRenderer !== 'function') {
    throw new Error('[reading-test-result] RendererI18n unavailable; cannot continue');
  }
  const { loadRendererTranslations, tRenderer, msgRenderer } = i18nApi;

  const appConstants = window.AppConstants || null;
  if (!appConstants || typeof appConstants.DEFAULT_LANG !== 'string' || !appConstants.DEFAULT_LANG.trim()) {
    throw new Error('[reading-test-result] AppConstants.DEFAULT_LANG unavailable; cannot continue');
  }

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

    const DEFAULT_LANG = appConstants.DEFAULT_LANG.trim();
    const state = {
      currentLanguage: DEFAULT_LANG,
      translationsLoadedFor: '',
      measuredWpm: 0,
      elapsedMs: 0,
      wordCount: 0,
    };
    let uiSyncChain = Promise.resolve();

    function normalizeLanguage(language, fallback = DEFAULT_LANG) {
      const normalized = typeof language === 'string'
        ? language.trim().toLowerCase()
        : '';
      return normalized || fallback;
    }

    function tr(path) {
      return tRenderer(path);
    }

    function mr(path, params) {
      return msgRenderer(path, params);
    }

    async function ensureTranslationsLoaded() {
      const target = normalizeLanguage(state.currentLanguage);
      if (state.translationsLoadedFor === target) return;
      state.currentLanguage = target;
      try {
        await loadRendererTranslations(target);
        state.translationsLoadedFor = target;
      } catch (err) {
        log.warn('Reading-test result translation load failed (using fallback copy):', err);
      }
    }

    function formatInteger(value) {
      const numeric = Number(value);
      const safe = Number.isFinite(numeric) ? Math.round(numeric) : 0;
      try {
        return new Intl.NumberFormat(state.currentLanguage || DEFAULT_LANG).format(safe);
      } catch (err) {
        log.warn('Reading-test result integer format failed (ignored):', err);
        return String(safe);
      }
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

    function renderUi() {
      document.title = tr('renderer.reading_test.result.title');
      elements.title.textContent = tr('renderer.reading_test.result.title');
      elements.wpmLabel.textContent = tr('renderer.reading_test.result.measured_wpm');
      elements.btnContinue.textContent = tr('renderer.reading_test.result.buttons.continue');
      elements.wpmValue.textContent = formatInteger(state.measuredWpm);
      elements.summary.textContent = `${tr('renderer.reading_test.result.elapsed_time')}: ${formatElapsedTime(state.elapsedMs)} · ${mr('renderer.main.results.words', { n: formatInteger(state.wordCount) })}`;
    }

    function enqueueUiSync(updateFn) {
      const runUpdate = async () => {
        await updateFn();
        await ensureTranslationsLoaded();
        renderUi();
      };
      uiSyncChain = uiSyncChain.then(runUpdate, runUpdate);
      return uiSyncChain;
    }

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
        state.currentLanguage = normalizeLanguage(settings && settings.language);
      } catch (err) {
        log.warn('BOOTSTRAP: Reading-test result initial settings fetch failed (using default language):', err);
        state.currentLanguage = DEFAULT_LANG;
      }
    }).catch((err) => {
      log.error('BOOTSTRAP: Reading-test result initial render failed:', err);
    });
  });
})();
