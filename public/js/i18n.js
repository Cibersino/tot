// public/js/i18n.js
(() => {
  const log = window.getLogger('i18n');

  log.debug('[i18n.js] module loaded');

  let rendererTranslations = null;
  let rendererTranslationsLang = null;

  async function loadRendererTranslations(lang) {
    const target = (lang || '').toLowerCase() || 'es';
    if (rendererTranslations && rendererTranslationsLang === target) return rendererTranslations;
    try {
      const resp = await fetch(`../i18n/${target}/renderer.json`);
      if (resp && resp.ok) {
        const raw = await resp.text();
        const cleaned = raw.replace(/^\uFEFF/, ''); // strip BOM if present
        const data = JSON.parse(cleaned || '{}');
        rendererTranslations = data;
        rendererTranslationsLang = target;
        return data;
      }
    } catch (err) {
      log.warn('[i18n] Unable to load renderer translations:', err);
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
