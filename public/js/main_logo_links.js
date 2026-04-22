// public/js/main_logo_links.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own main-window brand-logo external link bindings.
// - Route fixed brand links through the shared electronAPI.openExternalUrl bridge.
// - Apply translated tooltip/accessibility labels for the clickable brand logos.
// =============================================================================

(() => {
  // =============================================================================
  // Logger
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[main-logo-links] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('main-logo-links');
  log.debug('Main logo links starting...');

  // =============================================================================
  // Constants
  // =============================================================================
  const LOGO_LINK_CONFIG = Object.freeze({
    devLogoLink: Object.freeze({
      url: 'https://totapp.org/',
      tooltipKey: 'renderer.main.tooltips.cibersino_website',
    }),
    kofiLogoLink: Object.freeze({
      url: 'https://ko-fi.com/cibersino/',
      tooltipKey: 'renderer.main.tooltips.cibersino_kofi',
    }),
  });

  let linksBound = false;

  // =============================================================================
  // Helpers
  // =============================================================================
  function getLogoControl(id) {
    const element = document.getElementById(id);
    if (element) return element;
    log.warnOnce(`main_logo_links.element.${id}.missing`, 'Main logo link element missing:', id);
    return null;
  }

  function setControlLabel(element, label) {
    if (!element || typeof label !== 'string' || !label.trim()) return;
    const normalizedLabel = label.trim();
    element.title = normalizedLabel;
    element.setAttribute('aria-label', normalizedLabel);
  }

  // =============================================================================
  // Public API
  // =============================================================================
  function applyTranslations({ tRenderer } = {}) {
    if (typeof tRenderer !== 'function') {
      log.warnOnce(
        'main_logo_links.tRenderer.missing',
        'tRenderer unavailable; keeping current main logo link labels.'
      );
      return;
    }

    Object.entries(LOGO_LINK_CONFIG).forEach(([id, config]) => {
      const element = getLogoControl(id);
      if (!element) return;
      const translatedLabel = tRenderer(config.tooltipKey);
      setControlLabel(element, translatedLabel);
    });
  }

  function bindBrandLinks({ electronAPI } = {}) {
    if (linksBound) return;

    const api = electronAPI || window.electronAPI;
    if (!api || typeof api.openExternalUrl !== 'function') {
      log.warnOnce(
        'main_logo_links.openExternalUrl.missing',
        'openExternalUrl unavailable; main logo links disabled.'
      );
      return;
    }

    let attachedCount = 0;
    Object.entries(LOGO_LINK_CONFIG).forEach(([id, config]) => {
      const element = getLogoControl(id);
      if (!element) return;

      element.addEventListener('click', () => {
        api.openExternalUrl(config.url)
          .then((result) => {
            if (!result || result.ok !== true) {
              log.warn('Main logo external URL blocked or failed:', config.url, result);
            }
          })
          .catch((err) => {
            log.error('Main logo external URL request failed:', config.url, err);
          });
      });
      attachedCount += 1;
    });

    if (attachedCount > 0) {
      linksBound = true;
    }
  }

  window.MainLogoLinks = {
    applyTranslations,
    bindBrandLinks,
  };
})();

// =============================================================================
// End of public/js/main_logo_links.js
// =============================================================================
