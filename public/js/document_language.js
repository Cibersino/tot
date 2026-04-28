// public/js/document_language.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Renderer document-language helper.
// Responsibilities:
// - Normalize renderer language tags against the app default.
// - Derive document direction from the effective language tag.
// - Apply `lang` and `dir` to the current window document root.
// =============================================================================

(() => {
  if (typeof window.getLogger !== 'function') {
    throw new Error('[document-language] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('document-language');
  log.debug('Renderer document-language helper starting...');

  const appConstants = window.AppConstants || null;
  if (!appConstants || typeof appConstants.DEFAULT_LANG !== 'string' || !appConstants.DEFAULT_LANG.trim()) {
    throw new Error('[document-language] AppConstants.DEFAULT_LANG unavailable; cannot continue');
  }

  const rendererI18n = window.RendererI18n || null;
  const fallbackNormalizeLangTag = (lang) => String(lang || '').trim().toLowerCase().replace(/_/g, '-');
  const fallbackGetLangBase = (lang) => {
    const normalized = fallbackNormalizeLangTag(lang);
    const idx = normalized.indexOf('-');
    return idx > 0 ? normalized.slice(0, idx) : normalized;
  };

  const normalizeViaI18n = rendererI18n && typeof rendererI18n.normalizeLangTag === 'function'
    ? rendererI18n.normalizeLangTag
    : fallbackNormalizeLangTag;
  const getBaseViaI18n = rendererI18n && typeof rendererI18n.getLangBase === 'function'
    ? rendererI18n.getLangBase
    : fallbackGetLangBase;

  const RTL_LANGUAGE_BASES = new Set(['ar', 'fa', 'he', 'ps', 'sd', 'ug', 'ur']);

  function normalizeLanguageTag(language, fallback = appConstants.DEFAULT_LANG) {
    const fallbackTag = normalizeViaI18n(fallback);
    const normalized = normalizeViaI18n(language);
    return normalized || fallbackTag;
  }

  function getLanguageDirection(language) {
    const base = getBaseViaI18n(normalizeLanguageTag(language));
    return RTL_LANGUAGE_BASES.has(base) ? 'rtl' : 'ltr';
  }

  function applyDocumentLanguage(language, { documentRef = document, defaultLang = appConstants.DEFAULT_LANG } = {}) {
    const targetDocument = documentRef && documentRef.documentElement ? documentRef : null;
    if (!targetDocument) {
      log.warnOnce(
        'document-language.document.missing',
        'document.documentElement unavailable; document language update skipped.'
      );
      return { lang: '', dir: 'ltr' };
    }

    const langTag = normalizeLanguageTag(language, defaultLang);
    const dir = getLanguageDirection(langTag);
    targetDocument.documentElement.lang = langTag;
    targetDocument.documentElement.dir = dir;
    return { lang: langTag, dir };
  }

  window.RendererDocumentLanguage = {
    normalizeLanguageTag,
    getLanguageDirection,
    applyDocumentLanguage,
  };
})();

// =============================================================================
// End of public/js/document_language.js
// =============================================================================
