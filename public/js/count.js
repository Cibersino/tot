// public/js/count.js
'use strict';

(() => {
  // DEFAULT_LANG is the app's fallback language tag (e.g., "en", "es", "pt-BR").
  // It is used when no explicit language is provided by the caller.
  const { DEFAULT_LANG } = window.AppConstants;
  const log = (window.getLogger && typeof window.getLogger === 'function')
    ? window.getLogger('count')
    : null;

  // Hyphen joiners we accept for "alnum join" in Precise word counting.
  // This supports common hyphenated compounds and numeric ranges without spaces (e.g., "e-mail", "3–4").
  const HYPHEN_JOINERS = new Set([
    '-',        // U+002D hyphen-minus
    '\u2010',   // U+2010 hyphen
    '\u2011',   // U+2011 non-breaking hyphen
    '\u2012',   // U+2012 figure dash
    '\u2013',   // U+2013 en dash
    '\u2212'    // U+2212 minus sign
  ]);

  // "Joinable" segments are alphanumeric-only: letters/digits across Unicode when supported.
  let RE_ALNUM_ONLY;
  try {
    RE_ALNUM_ONLY = /^[\p{L}\p{N}]+$/u;
  } catch {
    // Defensive fallback (older JS engines): ASCII only.
    RE_ALNUM_ONLY = /^[A-Za-z0-9]+$/;
    if (log && typeof log.warn === 'function') {
      log.warn('Unicode property escapes unsupported; using ASCII alnum fallback.');
    }
  }

  /**
   * Feature detection for Intl.Segmenter.
   * In modern Electron/Chromium this should be available, but we keep a fallback for safety.
   */
  function hasIntlSegmenter() {
    return typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function';
  }

  function isHyphenJoinerSegment(s) {
    return typeof s === 'string' && s.length === 1 && HYPHEN_JOINERS.has(s);
  }

  function isAlnumOnlySegment(s) {
    return typeof s === 'string' && s.length > 0 && RE_ALNUM_ONLY.test(s);
  }

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
   * Additional policy (UX-oriented):
   * - "Alnum join" for hyphenated compounds with no spaces: alnum + hyphen + alnum counts as 1 word
   *   (e.g., "e-mail", "co-operate", "state-of-the-art", "3-4").
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
      if (log && typeof log.warnOnce === 'function') {
        log.warnOnce('count.intl-segmenter-missing', 'Intl.Segmenter unavailable; using fallback segmentation.');
      } else if (log && typeof log.warn === 'function') {
        log.warn('Intl.Segmenter unavailable; using fallback segmentation.');
      }
      return contarTextoPrecisoFallback(texto);
    }

    // Grapheme segmentation: count perceived characters and optionally exclude whitespace.
    const segGraf = new Intl.Segmenter(language, { granularity: 'grapheme' });
    const grafemas = [...segGraf.segment(texto)];
    const conEspacios = grafemas.length;
    const sinEspacios = grafemas.filter(g => !/\s/.test(g.segment)).length;

    // Word segmentation: count only "word-like" segments, but apply "alnum join"
    // for hyphenated compounds: alnum + hyphen + alnum => 1 word (no whitespace).
    const segPal = new Intl.Segmenter(language, { granularity: 'word' });

    let palabras = 0;
    let prevWasJoinableWord = false;  // immediate previous segment was wordlike + alnum-only
    let pendingHyphenJoin = false;    // immediate previous segment was a joiner hyphen after a joinable word

    for (const seg of segPal.segment(texto)) {
      if (seg && seg.isWordLike) {
        const joinable = isAlnumOnlySegment(seg.segment);

        // Merge if the previous segment was a joiner hyphen that directly followed a joinable word,
        // and the current wordlike segment is also joinable (no whitespace/punct in between).
        if (!(pendingHyphenJoin && joinable)) {
          palabras += 1;
        }

        pendingHyphenJoin = false;
        prevWasJoinableWord = joinable;
      } else {
        if (seg && isHyphenJoinerSegment(seg.segment) && prevWasJoinableWord) {
          pendingHyphenJoin = true;
        } else {
          pendingHyphenJoin = false;
        }
        prevWasJoinableWord = false;
      }
    }

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
