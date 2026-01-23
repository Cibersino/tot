// public/js/constants.js
'use strict';

(() => {
  const DEFAULTS = {
    DEFAULT_LANG: 'es', // Default language for the app. It must match 'electron/constants_main.js'. This can be overridden by user settings.
    MAX_TEXT_CHARS: 10_000_000, // Renderer fallback. Real limit from main (constants_main.js via IPC).
    PASTE_ALLOW_LIMIT: 10_000, // Max chars allowed in paste. This is a soft limit to prevent performance issues.
    SMALL_UPDATE_THRESHOLD: 200_000, // If text is smaller than this, update the preview immediately.
    WPM_MIN: 50, // Minimum WPM for reading speed.
    WPM_MAX: 500, // Maximum WPM for reading speed.
    PRESET_NAME_MAX: 20, // Max chars for preset names.
    PRESET_DESC_MAX: 120, // Max chars for preset descriptions.
    PREVIEW_INLINE_THRESHOLD: 1200, // If text is shorter than this, show it all in the preview.
    PREVIEW_START_CHARS: 275, // Number of chars to show at the start of the preview.
    PREVIEW_END_CHARS: 275, // Number of chars to show at the end of the preview.
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
