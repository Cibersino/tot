// public/js/i18n.js
'use strict';

(() => {
  const log = window.getLogger('i18n');

  let rendererTranslations = null;
  let rendererTranslationsLang = null;

  const normalizeLangTag = (lang) => (lang || '').trim().toLowerCase().replace(/_/g, '-');
  const getLangBase = (lang) => {
    const tag = normalizeLangTag(lang);
    if (!tag) return '';
    const idx = tag.indexOf('-');
    return idx > 0 ? tag.slice(0, idx) : tag;
  };

  async function loadRendererTranslations(lang) {
    const requested = normalizeLangTag(lang) || 'es';
    if (rendererTranslations && rendererTranslationsLang === requested) return rendererTranslations;
    const base = getLangBase(requested) || 'es';
    const candidates = [];
    if (requested) candidates.push(requested);
    if (base && base !== requested) candidates.push(base);
    if (!candidates.includes('es')) candidates.push('es');
    for (const target of candidates) {
      const targetBase = getLangBase(target) || target;
      const paths = [];
      if (target.includes('-')) {
        paths.push(`../i18n/${targetBase}/${target}/renderer.json`);
      }
      paths.push(`../i18n/${target}/renderer.json`);
      try {
        for (const p of paths) {
          const resp = await fetch(p);
          if (resp && resp.ok) {
            const raw = await resp.text();
            const cleaned = raw.replace(/^\uFEFF/, ''); // strip BOM if present
            const data = JSON.parse(cleaned || '{}');
            rendererTranslations = data;
            rendererTranslationsLang = requested;
            return data;
          }
        }
      } catch (err) {
        log.warn('[i18n] Unable to load renderer translations:', err);
      }
    }
    rendererTranslations = null;
    rendererTranslationsLang = null;
    return null;
  }

  function tRenderer(path, fallback) {
    if (!rendererTranslations) return fallback;
    const parts = path.split('.');
    let cur = rendererTranslations;
    for (const p of parts) {
      if (cur && Object.prototype.hasOwnProperty.call(cur, p)) {
        cur = cur[p];
      } else {
        return fallback;
      }
    }
    return (typeof cur === 'string') ? cur : fallback;
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
    msgRenderer
  };
})();
