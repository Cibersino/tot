// public/js/count.js
'use strict';

(() => {
  if (typeof window.getLogger !== 'function') {
    throw new Error('[count] window.getLogger unavailable; cannot continue');
  }

  const log = window.getLogger('count');
  log.debug('Count utilities starting...');

  const appConstants = window.AppConstants;
  if (!appConstants || typeof appConstants.DEFAULT_LANG !== 'string' || appConstants.DEFAULT_LANG.trim() === '') {
    throw new Error('[count] window.AppConstants.DEFAULT_LANG unavailable; cannot continue');
  }

  const countCore = window.CountCore;
  if (!countCore || typeof countCore.createCountUtils !== 'function') {
    throw new Error('[count] window.CountCore.createCountUtils unavailable; cannot continue');
  }

  window.CountUtils = countCore.createCountUtils({
    DEFAULT_LANG: appConstants.DEFAULT_LANG,
    log,
    intlObject: typeof Intl !== 'undefined' ? Intl : null
  });
})();
