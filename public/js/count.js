// public/js/count.js
'use strict';

(() => {
  // DEFAULT_LANG is the app's fallback language tag (e.g., "en", "es", "pt-BR").
  // It is used when no explicit language is provided by the caller.
  const { DEFAULT_LANG } = window.AppConstants;

  /**
   * Simple counting strategy (fast, coarse):
   * - Characters "with spaces" is just the JS string length (UTF-16 code units).
   * - Characters "without spaces" removes whitespace and measures the resulting string length.
   * - Words are split on whitespace.
   *
   * Notes:
   * - This method is not Unicode-grapheme aware; emojis and some composed characters
   *   may count as more than 1 "character" depending on UTF-16 representation.
   * - Works reasonably for languages that separate words with spaces, but is weak for
   *   scripts that do not (e.g., Thai, Chinese, Japanese).
   */
  function contarTextoSimple(texto) {
    const conEspacios = texto.length;
    const sinEspacios = texto.replace(/\s+/g, '').length;
    const palabras = texto.trim() === '' ? 0 : texto.trim().split(/\s+/).length;
    return { conEspacios, sinEspacios, palabras };
  }

  /**
   * Feature detection for Intl.Segmenter.
   * In modern Electron/Chromium this should be available, but we keep a fallback for safety.
   */
  function hasIntlSegmenter() {
    return typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function';
  }

  /**
   * Fallback "precise" counting when Intl.Segmenter is not available.
   *
   * What we can still do:
   * - Use `[...texto]` to iterate Unicode code points (better than `texto.length` for some
   *   cases, but still not a true grapheme cluster segmentation).
   * - Words still fall back to whitespace splitting.
   *
   * Notes:
   * - `[...texto]` uses the string iterator and splits by code points, which is closer to what
   *   users perceive as characters than UTF-16 code units, but still imperfect for grapheme
   *   clusters (e.g., emoji sequences, combined accents).
   */
  function contarTextoPrecisoFallback(texto) {
    const graphemes = [...texto];
    const conEspacios = graphemes.length;
    const sinEspacios = graphemes.filter(c => !/\s/.test(c)).length;
    const palabras = texto.trim() === '' ? 0 : texto.trim().split(/\s+/).length;
    return { conEspacios, sinEspacios, palabras };
  }

  /**
   * "Precise" counting strategy (Unicode-aware via Intl.Segmenter):
   *
   * - Grapheme segmentation counts user-perceived characters (grapheme clusters) rather than
   *   UTF-16 code units. This is more accurate for emojis and composed characters.
   * - Word segmentation uses `granularity: 'word'` and counts only segments flagged as `isWordLike`,
   *   which excludes pure punctuation/whitespace segments.
   *
   * Parameters:
   * - texto: input string to count
   * - language: BCP 47 language tag (e.g., "en", "es", "pt-BR"). The segmenter can use it to apply
   *   locale-sensitive segmentation rules. In practice, some locales may behave identically for
   *   many texts, but passing the correct language is the right design.
   */
  function contarTextoPreciso(texto, language) {
    // If Intl.Segmenter is missing, fall back to a best-effort approximation.
    if (!hasIntlSegmenter()) {
      return contarTextoPrecisoFallback(texto);
    }

    // Grapheme segmentation: count perceived characters and optionally exclude whitespace.
    const segGraf = new Intl.Segmenter(language, { granularity: 'grapheme' });
    const grafemas = [...segGraf.segment(texto)];
    const conEspacios = grafemas.length;
    const sinEspacios = grafemas.filter(g => !/\s/.test(g.segment)).length;

    // Word segmentation: count only "word-like" segments (letters/digits/etc.), excluding punctuation.
    const segPal = new Intl.Segmenter(language, { granularity: 'word' });
    const palabras = [...segPal.segment(texto)].filter(seg => seg.isWordLike).length;

    return { conEspacios, sinEspacios, palabras };
  }

  /**
   * Main entry point for counting.
   *
   * opts:
   * - modoConteo: "simple" or "preciso" (defaults to "preciso" if anything else is passed)
   * - idioma: language tag for Intl.Segmenter (defaults to DEFAULT_LANG)
   */
  function contarTexto(texto, opts = {}) {
    // Normalize mode: only accept the explicit "simple" string; everything else becomes "preciso".
    const modoConteo = opts.modoConteo === 'simple' ? 'simple' : 'preciso';

    // Pick the language tag to feed Intl.Segmenter (or to keep consistent behavior across calls).
    const idioma = opts.idioma || DEFAULT_LANG;

    return (modoConteo === 'simple')
      ? contarTextoSimple(texto)
      : contarTextoPreciso(texto, idioma);
  }

  // Public API exposed to the renderer via window.CountUtils.
  window.CountUtils = {
    contarTextoSimple,
    contarTextoPrecisoFallback,
    contarTextoPreciso,
    contarTexto,
    hasIntlSegmenter
  };
})();
