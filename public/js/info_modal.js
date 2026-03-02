// public/js/info_modal.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own info modal DOM wiring and lifecycle.
// - Load and render localized info pages with graceful fallbacks.
// - Hydrate About metadata from Electron APIs when available.
// - Expose a small controller API for renderer menu integration.
// =============================================================================

(() => {
  // =============================================================================
  // Startup guards and logger
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[info-modal] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('info-modal');

  const appConstants = window.AppConstants;
  if (!appConstants || typeof appConstants.DEFAULT_LANG !== 'string') {
    throw new Error('[info-modal] AppConstants.DEFAULT_LANG unavailable; cannot continue');
  }
  const { DEFAULT_LANG } = appConstants;

  // =============================================================================
  // Helpers
  // =============================================================================
  async function fetchText(path) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      log.warnOnce('renderer:fetchText:failed', 'fetchText failed; info modal will fallback:', path, err);
      return null;
    }
  }

  async function fetchTextWithFallback(paths) {
    for (const path of paths) {
      const html = await fetchText(path);
      if (html !== null) return { html, path };
    }
    return { html: null, path: null };
  }

  function translateInfoHtml(htmlString, key, tRenderer) {
    if (!tRenderer) return htmlString;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlString, 'text/html');
      doc.querySelectorAll('[data-i18n]').forEach((el) => {
        const dataKey = el.getAttribute('data-i18n');
        if (!dataKey) return;
        const tKey = `renderer.info.${key}.${dataKey}`;
        const translated = tRenderer(tKey, el.textContent || '');
        if (translated) el.textContent = translated;
      });
      return doc.body.innerHTML;
    } catch (err) {
      log.warn('translateInfoHtml failed:', err);
      return htmlString;
    }
  }

  function extractInfoBodyHtml(htmlString) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlString, 'text/html');
      return doc.body.innerHTML;
    } catch (err) {
      log.warn('extractInfoBodyHtml failed:', err);
      return htmlString;
    }
  }

  async function hydrateAboutVersion(container, electronAPI) {
    const versionEl = container ? container.querySelector('#appVersion') : null;
    if (!versionEl) return;

    if (!electronAPI || typeof electronAPI.getAppVersion !== 'function') {
      log.warnOnce('renderer.info.acerca_de.version.unavailable', 'getAppVersion not available for About modal.');
      versionEl.textContent = 'N/A';
      return;
    }

    try {
      const version = await electronAPI.getAppVersion();
      const cleaned = typeof version === 'string' ? version.trim() : '';
      if (!cleaned) {
        log.warnOnce(
          'renderer.info.acerca_de.version.empty',
          'getAppVersion returned empty; About modal shows N/A.'
        );
        versionEl.textContent = 'N/A';
        return;
      }
      versionEl.textContent = cleaned;
    } catch (err) {
      log.warn('getAppVersion failed; About modal shows N/A:', err);
      versionEl.textContent = 'N/A';
    }
  }

  async function hydrateAboutEnvironment(container, electronAPI) {
    const envEl = container ? container.querySelector('#appEnv') : null;
    if (!envEl) return;

    if (!electronAPI || typeof electronAPI.getAppRuntimeInfo !== 'function') {
      log.warnOnce('renderer.info.acerca_de.env.unavailable', 'getAppRuntimeInfo not available for About modal.');
      envEl.textContent = 'N/A';
      return;
    }

    try {
      const info = await electronAPI.getAppRuntimeInfo();
      const platform = info && typeof info.platform === 'string' ? info.platform.trim() : '';
      const arch = info && typeof info.arch === 'string' ? info.arch.trim() : '';
      const platformMap = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };
      const osLabel = platformMap[platform] || platform;

      if (!osLabel || !arch) {
        log.warnOnce(
          'renderer.info.acerca_de.env.missing_fields',
          'getAppRuntimeInfo missing platform/arch; About modal shows N/A.'
        );
        envEl.textContent = 'N/A';
        return;
      }

      envEl.textContent = `${osLabel} (${arch})`;
    } catch (err) {
      log.warn('getAppRuntimeInfo failed; About modal shows N/A:', err);
      envEl.textContent = 'N/A';
    }
  }

  function normalizeLangTagSafe(lang) {
    if (window.RendererI18n && typeof window.RendererI18n.normalizeLangTag === 'function') {
      return window.RendererI18n.normalizeLangTag(lang);
    }
    log.warnOnce(
      'renderer.info.normalizeLangTag.fallback',
      'RendererI18n.normalizeLangTag unavailable; using local fallback normalization.'
    );
    return String(lang || '').trim().toLowerCase().replace(/_/g, '-');
  }

  function getLangBaseSafe(lang) {
    if (window.RendererI18n && typeof window.RendererI18n.getLangBase === 'function') {
      return window.RendererI18n.getLangBase(lang);
    }
    log.warnOnce(
      'renderer.info.getLangBase.fallback',
      'RendererI18n.getLangBase unavailable; using local fallback language base.'
    );
    const normalized = normalizeLangTagSafe(lang);
    if (!normalized) return '';
    const idx = normalized.indexOf('-');
    return idx > 0 ? normalized.slice(0, idx) : normalized;
  }

  function getManualFileCandidates(langTag) {
    const candidates = [];
    const normalized = normalizeLangTagSafe(langTag);
    const base = getLangBaseSafe(normalized);
    if (normalized) candidates.push(normalized);
    if (base && base !== normalized) candidates.push(base);
    const defaultLang = normalizeLangTagSafe(DEFAULT_LANG);
    if (defaultLang && !candidates.includes(defaultLang)) candidates.push(defaultLang);
    return candidates.map(tag => `./info/instrucciones.${tag}.html`);
  }

  // =============================================================================
  // Controller factory
  // =============================================================================
  function createController(options = {}) {
    const deps = {
      tRenderer: (typeof options.tRenderer === 'function') ? options.tRenderer : null,
      getIdiomaActual: (typeof options.getIdiomaActual === 'function') ? options.getIdiomaActual : () => DEFAULT_LANG,
      getSettingsCache: (typeof options.getSettingsCache === 'function') ? options.getSettingsCache : () => null,
      electronAPI: options.electronAPI || window.electronAPI || null,
    };

    const infoModal = document.getElementById('infoModal');
    const infoModalBackdrop = document.getElementById('infoModalBackdrop');
    const infoModalClose = document.getElementById('infoModalClose');
    const infoModalTitle = document.getElementById('infoModalTitle');
    const infoModalContent = document.getElementById('infoModalContent');
    const bindInfoModalLinks = (
      window.InfoModalLinks &&
      typeof window.InfoModalLinks.bindInfoModalLinks === 'function'
    )
      ? window.InfoModalLinks.bindInfoModalLinks
      : null;

    let bound = false;

    function close() {
      try {
        if (!infoModal || !infoModalContent) return;
        infoModal.setAttribute('aria-hidden', 'true');
        infoModalContent.innerHTML = '<div class="info-loading">Cargando...</div>';
      } catch (err) {
        log.error('Error closing modal info:', err);
      }
    }

    function bind() {
      if (bound) return;
      bound = true;

      if (infoModalClose) infoModalClose.addEventListener('click', close);
      if (infoModalBackdrop) infoModalBackdrop.addEventListener('click', close);

      window.addEventListener('keydown', (ev) => {
        if (!infoModal) return;
        if (ev.key === 'Escape' && infoModal.getAttribute('aria-hidden') === 'false') {
          close();
        }
      });
    }

    async function show(key, opts = {}) {
      const sectionTitles = {
        instrucciones: 'Instrucciones completas',
        guia_basica: 'Guia basica',
        faq: 'Preguntas frecuentes (FAQ)',
        acerca_de: 'Acerca de'
      };

      if (!infoModal || !infoModalTitle || !infoModalContent) return;

      let fileToLoad = null;
      let sectionId = null;
      const isManual = (key === 'guia_basica' || key === 'instrucciones' || key === 'faq');

      if (key === 'acerca_de') {
        fileToLoad = './info/acerca_de.html';
      } else if (isManual) {
        const settingsCache = deps.getSettingsCache();
        const idiomaActual = deps.getIdiomaActual();
        const langTag = (settingsCache && settingsCache.language)
          ? settingsCache.language
          : (idiomaActual || DEFAULT_LANG);
        fileToLoad = getManualFileCandidates(langTag);
        const mapping = { guia_basica: 'guia-basica', instrucciones: 'instrucciones', faq: 'faq' };
        sectionId = mapping[key] || 'instrucciones';
      } else {
        fileToLoad = `./info/${key}.html`;
      }

      const translationKey = (key === 'guia_basica' || key === 'faq') ? 'instrucciones' : key;
      if (isManual) {
        infoModalTitle.textContent = 'Manual de uso';
      } else {
        const defaultTitle = sectionTitles[key] || (opts.title || 'Información');
        infoModalTitle.textContent = deps.tRenderer
          ? deps.tRenderer(`renderer.info.${translationKey}.title`, defaultTitle)
          : defaultTitle;
      }

      infoModal.setAttribute('aria-hidden', 'false');

      const tryHtml = Array.isArray(fileToLoad)
        ? (await fetchTextWithFallback(fileToLoad)).html
        : await fetchText(fileToLoad);

      if (tryHtml === null) {
        infoModalContent.innerHTML =
          `<p>No hay contenido disponible para '${infoModalTitle.textContent}'.</p>`;
        if (typeof infoModalContent.focus === 'function') infoModalContent.focus();
        return;
      }

      const renderedHtml = isManual
        ? extractInfoBodyHtml(tryHtml)
        : translateInfoHtml(tryHtml, translationKey, deps.tRenderer);
      infoModalContent.innerHTML = renderedHtml;

      if (bindInfoModalLinks) {
        bindInfoModalLinks(infoModalContent, { electronAPI: deps.electronAPI });
      } else {
        log.warnOnce(
          'renderer.info.bindInfoModalLinks.unavailable',
          'InfoModalLinks.bindInfoModalLinks unavailable; modal links will use default behavior.'
        );
      }

      if (key === 'acerca_de') {
        await hydrateAboutVersion(infoModalContent, deps.electronAPI);
        await hydrateAboutEnvironment(infoModalContent, deps.electronAPI);
      }

      const panel = document.querySelector('.info-modal-panel');
      if (panel) panel.scrollTop = 0;

      if (sectionId) {
        requestAnimationFrame(() => {
          try {
            const target = infoModalContent.querySelector(`#${sectionId}`);
            if (!target) {
              if (typeof infoModalContent.focus === 'function') infoModalContent.focus();
              return;
            }

            try {
              target.scrollIntoView({ behavior: 'auto', block: 'start' });
            } catch {
              if (!panel) {
                if (typeof infoModalContent.focus === 'function') infoModalContent.focus();
                return;
              }
              const panelRect = panel.getBoundingClientRect();
              const targetRect = target.getBoundingClientRect();
              const desired = (targetRect.top - panelRect.top) + panel.scrollTop;
              const finalTop = Math.max(0, Math.min(desired, panel.scrollHeight - panel.clientHeight));
              panel.scrollTo({ top: finalTop, behavior: 'auto' });
            }

            if (typeof infoModalContent.focus === 'function') infoModalContent.focus();
          } catch (err) {
            log.error('Error moving modal to section:', err);
            if (typeof infoModalContent.focus === 'function') infoModalContent.focus();
          }
        });
      } else if (typeof infoModalContent.focus === 'function') {
        infoModalContent.focus();
      }
    }

    return {
      bind,
      show,
      close
    };
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================
  window.RendererInfoModal = {
    createController
  };
})();

// =============================================================================
// End of public/js/info_modal.js
// =============================================================================
