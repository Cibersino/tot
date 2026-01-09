// public/js/i18n.js
'use strict';

(() => {
  const log = window.getLogger('i18n');

  let rendererTranslations = null;
  let rendererTranslationsLang = null;
  let rendererDefaultTranslations = null;

  const { AppConstants } = window;
  const { DEFAULT_LANG } = AppConstants;

  const normalizeLangTag = (lang) => (lang || '').trim().toLowerCase().replace(/_/g, '-');
  const getLangBase = (lang) => {
    const tag = normalizeLangTag(lang);
    if (!tag) return '';
    const idx = tag.indexOf('-');
    return idx > 0 ? tag.slice(0, idx) : tag;
  };

  const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

  const deepMerge = (base, overlay) => {
    const result = Object.assign({}, base || {});
    if (!overlay) return result;
    Object.keys(overlay).forEach((key) => {
      if (isPlainObject(result[key]) && isPlainObject(overlay[key])) {
        result[key] = deepMerge(result[key], overlay[key]);
      } else {
        result[key] = overlay[key];
      }
    });
    return result;
  };

  const getPath = (obj, path) => {
    if (!obj || !path) return undefined;
    const parts = path.split('.');
    let cur = obj;
    for (const p of parts) {
      if (cur && Object.prototype.hasOwnProperty.call(cur, p)) {
        cur = cur[p];
      } else {
        return undefined;
      }
    }
    return cur;
  };

  async function loadRendererTranslations(lang) {
    const requested = normalizeLangTag(lang);
    if (!requested) {
      log.warnOnce(
        'i18n.loadRendererTranslations.emptyLang',
        'Invalid language tag; using default bundle only.'
      );
    }

    const selected = requested || DEFAULT_LANG;
    if (rendererTranslations && rendererTranslationsLang === selected) return rendererTranslations;

    if (!rendererDefaultTranslations) {
      const defaults = await loadBundle(DEFAULT_LANG, DEFAULT_LANG, true);
      if (!defaults) {
        log.errorOnce(
          `i18n.loadRendererTranslations.defaultMissing:${DEFAULT_LANG}`,
          'Default renderer.json missing or invalid (using empty defaults):',
          DEFAULT_LANG
        );
      }
      rendererDefaultTranslations = defaults || {};
    }

    let overlay = null;
    if (selected && selected !== DEFAULT_LANG) {
      overlay = await loadOverlay(selected, getLangBase(selected));
      if (!overlay) {
        log.warnOnce(
          `i18n.loadRendererTranslations.overlayMissing:${selected}`,
          'No overlay renderer.json found (using default only):',
          { selected }
        );
      }
    }

    rendererTranslations = deepMerge(rendererDefaultTranslations || {}, overlay || {});
    rendererTranslationsLang = selected;
    return rendererTranslations;
  }

  async function loadOverlay(requested, base) {
    const candidates = [];
    if (requested) candidates.push(requested);
    if (base && base !== requested) candidates.push(base);

    for (const target of candidates) {
      if (target === DEFAULT_LANG) continue;
      const data = await loadBundle(target, requested, false);
      if (data) return data;
    }

    return null;
  }

  async function loadBundle(langCode, requested, required) {
    const targetBase = getLangBase(langCode) || langCode;
    const paths = [];
    if (langCode.includes('-')) {
      paths.push(`../i18n/${targetBase}/${langCode}/renderer.json`);
    }
    paths.push(`../i18n/${langCode}/renderer.json`);

    for (const p of paths) {
      try {
        const resp = await fetch(p);
        if (!resp || !resp.ok) continue;
        const raw = await resp.text();
        const cleaned = raw.replace(/^\uFEFF/, ''); // strip BOM if present
        if (!cleaned.trim()) {
          log.warnOnce(
            `i18n.loadRendererTranslations.empty:${requested || langCode}:${langCode}:${p}`,
            'renderer.json is empty (trying fallback):',
            { requested, langCode, path: p }
          );
          continue;
        }
        try {
          return JSON.parse(cleaned || '{}');
        } catch (err) {
          log.warnOnce(
            `i18n.loadRendererTranslations.parse:${requested || langCode}:${langCode}:${p}`,
            'Failed to parse renderer.json (trying fallback):',
            { requested, langCode, path: p },
            err
          );
        }
      } catch (err) {
        log.warnOnce(
          `i18n.loadRendererTranslations.fetch:${requested || langCode}:${langCode}:${p}`,
          'Failed to fetch renderer.json (trying fallback):',
          { requested, langCode, path: p },
          err
        );
      }
    }

    if (required) {
      log.errorOnce(
        `i18n.loadRendererTranslations.requiredMissing:${langCode}`,
        'Required renderer.json missing/invalid:',
        { langCode, paths }
      );
    }

    return null;
  }

  function tRenderer(path, fallback) {
    if (!rendererTranslations) return fallback;
    const value = getPath(rendererTranslations, path);
    if (typeof value === 'string') return value;
    log.warnOnce(
      `i18n.missingKey:${rendererTranslationsLang || 'unknown'}:${path}`,
      'Missing translation key (using fallback):',
      { path, lang: rendererTranslationsLang }
    );
    return fallback;
  }

  function msgRenderer(path, params = {}, fallback = '') {
    let str = tRenderer(path, fallback);
    if (!str) return fallback;
    Object.keys(params || {}).forEach(k => {
      const val = params[k];
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(val));
    });
    return str;
  }

  window.RendererI18n = {
    loadRendererTranslations,
    tRenderer,
    msgRenderer,
    normalizeLangTag,
    getLangBase
  };
})();
