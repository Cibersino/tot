(function exposeTextToTimeLogic(globalObject) {
  'use strict';

  const CONSTANTS = Object.freeze({
    MIN_WORDS: 12,
    SELECTION_STABILIZE_MS: 200,
    HIDE_DELAY_MS: 800,
    DEFAULT_WPM: 238,
    MIN_WPM: 10,
    MAX_WPM: 700,
  });

  function normalizeText(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function normalizeLocaleTag(locale) {
    const trimmed = String(locale || '').trim();
    if (!trimmed) return '';

    try {
      return Intl.getCanonicalLocales(trimmed)[0] || '';
    } catch (_err) {
      return '';
    }
  }

  function isSegmenterLocaleSupported(locale, intlObject) {
    const normalized = normalizeLocaleTag(locale);
    if (!normalized || !intlObject || typeof intlObject.Segmenter !== 'function') {
      return false;
    }

    if (typeof intlObject.Segmenter.supportedLocalesOf !== 'function') {
      return true;
    }

    return intlObject.Segmenter.supportedLocalesOf([normalized]).length > 0;
  }

  function resolveLocale(documentLanguage, browserLanguage, intlObject) {
    const intlSource = intlObject || Intl;
    const pageLanguage = normalizeLocaleTag(documentLanguage);
    if (isSegmenterLocaleSupported(pageLanguage, intlSource)) {
      return pageLanguage;
    }

    const navigatorLanguage = normalizeLocaleTag(browserLanguage);
    if (isSegmenterLocaleSupported(navigatorLanguage, intlSource)) {
      return navigatorLanguage;
    }

    return navigatorLanguage || pageLanguage || 'en';
  }

  function countWords(text, locale, intlObject) {
    const normalized = normalizeText(text);
    if (!normalized) return 0;

    const intlSource = intlObject || Intl;
    if (!intlSource || typeof intlSource.Segmenter !== 'function') {
      return 0;
    }

    const segmenter = new intlSource.Segmenter(locale || 'en', { granularity: 'word' });
    let count = 0;

    for (const segment of segmenter.segment(normalized)) {
      if (segment && segment.isWordLike) {
        count += 1;
      }
    }

    return count;
  }

  function parseWpm(value) {
    const text = String(value || '').trim();
    if (!/^\d+$/.test(text)) {
      return { ok: false, value: null };
    }

    const parsed = Number(text);
    if (
      !Number.isSafeInteger(parsed)
      || parsed < CONSTANTS.MIN_WPM
      || parsed > CONSTANTS.MAX_WPM
    ) {
      return { ok: false, value: null };
    }

    return { ok: true, value: parsed };
  }

  function estimateSeconds(wordCount, wpm) {
    const safeWordCount = Math.max(0, Number(wordCount) || 0);
    const safeWpm = Math.max(CONSTANTS.MIN_WPM, Number(wpm) || CONSTANTS.DEFAULT_WPM);
    return Math.ceil((safeWordCount / safeWpm) * 60);
  }

  function formatDuration(totalSeconds) {
    const safeSeconds = Math.max(0, Math.ceil(Number(totalSeconds) || 0));
    const hours = Math.floor(safeSeconds / 3600);
    const minutes = Math.floor((safeSeconds % 3600) / 60);
    const seconds = safeSeconds % 60;

    return `${hours}h ${minutes}m ${seconds}s`;
  }

  const api = Object.freeze({
    CONSTANTS,
    normalizeText,
    resolveLocale,
    countWords,
    parseWpm,
    estimateSeconds,
    formatDuration,
  });

  globalObject.TotTextToTimeLogic = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
