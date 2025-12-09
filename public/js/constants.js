// public/js/constants.js
(() => {
  const DEFAULTS = {
    MAX_TEXT_CHARS: 10_000_000,
    PASTE_ALLOW_LIMIT: 10_000,
    SMALL_UPDATE_THRESHOLD: 200_000,
    WPM_MIN: 50,
    WPM_MAX: 500,
    PRESET_NAME_MAX: 13,
    PRESET_DESC_MAX: 120,
    PREVIEW_INLINE_THRESHOLD: 200,
    PREVIEW_START_CHARS: 350,
    PREVIEW_END_CHARS: 230,
    TIMER_PLAY_SYMBOL: ">",
    TIMER_PAUSE_SYMBOL: "||"
  };

  const AppConstants = {
    ...DEFAULTS,
    applyConfig(cfg = {}) {
      const max = Number(cfg.maxTextChars || cfg.MAX_TEXT_CHARS || cfg.max_text_chars);
      if (Number.isFinite(max) && max > 0) {
        this.MAX_TEXT_CHARS = max;
      }
      return this.MAX_TEXT_CHARS;
    }
  };

  if (typeof window === "undefined") {
    throw new Error("AppConstants requiere window; verifica el orden de carga de scripts.");
  }

  window.AppConstants = AppConstants;
})();
