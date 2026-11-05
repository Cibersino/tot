// public/js/format.js
'use strict';

(() => {
  if (typeof window.getLogger !== 'function') {
    throw new Error('[format] window.getLogger unavailable; cannot continue');
  }

  const log = window.getLogger('format');
  log.debug('Format utilities starting...');

  const appConstants = window.AppConstants;
  if (!appConstants || typeof appConstants.DEFAULT_LANG !== 'string' || appConstants.DEFAULT_LANG.trim() === '') {
    throw new Error('[format] window.AppConstants.DEFAULT_LANG unavailable; cannot continue');
  }

  const rendererI18n = window.RendererI18n;
  if (!rendererI18n
    || typeof rendererI18n.getPreferenceScope !== 'function') {
    throw new Error('[format] window.RendererI18n.getPreferenceScope unavailable; cannot continue');
  }

  const formatCore = window.FormatCore;
  if (!formatCore || typeof formatCore.createFormatUtils !== 'function') {
    throw new Error('[format] window.FormatCore.createFormatUtils unavailable; cannot continue');
  }

  window.FormatUtils = formatCore.createFormatUtils({
    DEFAULT_LANG: appConstants.DEFAULT_LANG,
    getPreferenceScope: rendererI18n.getPreferenceScope,
    log
  });
})();
