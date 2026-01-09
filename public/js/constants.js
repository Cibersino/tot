// public/js/constants.js
'use strict';

(() => {
  const DEFAULTS = {
    DEFAULT_LANG: 'es',
    MAX_TEXT_CHARS: 10_000_000, // Renderer fallback. Real limit from main (constants_main.js via IPC).
    PASTE_ALLOW_LIMIT: 10_000,
    SMALL_UPDATE_THRESHOLD: 200_000,
    WPM_MIN: 50,
    WPM_MAX: 500,
    PRESET_NAME_MAX: 20,
    PRESET_DESC_MAX: 120,
    PREVIEW_INLINE_THRESHOLD: 200,
    PREVIEW_START_CHARS: 350,
    PREVIEW_END_CHARS: 230
  };

  const AppConstants = {
    ...DEFAULTS,
    // Pure: returns effective maxTextChars from cfg.maxTextChars without mutating AppConstants.
    applyConfig(cfg = {}) {
      const max = Number(cfg.maxTextChars);
      if (Number.isFinite(max) && max > 0) {
        return max;
      }
      return this.MAX_TEXT_CHARS;
    }
  };

  if (typeof window === 'undefined') {
    throw new Error('AppConstants requiere window; verifica el orden de carga de scripts.');
  }

  window.AppConstants = AppConstants;
})();
