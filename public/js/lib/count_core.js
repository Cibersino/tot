// public/js/lib/count_core.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Shared counting core for renderer-facing CountUtils.
// Responsibilities:
// - Provide simple and precise counting strategies for characters and words.
// - Apply hyphen-join rules for word segmentation in precise mode.
// - Support both browser-script and CommonJS consumers.

(function initCountCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === 'object') {
    root.CountCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  function createNoopLog() {
    return {
      warn() {},
      warnOnce() {},
    };
  }

  function createCountUtils({ DEFAULT_LANG, log = null, intlObject = Intl } = {}) {
    const safeLog = log && typeof log === 'object' ? log : createNoopLog();
    const defaultLang = typeof DEFAULT_LANG === 'string' ? DEFAULT_LANG.trim() : '';
    if (!defaultLang) {
      throw new Error('[count_core] DEFAULT_LANG is required');
    }

    const HYPHEN_JOINERS = new Set([
      '-',
      '\u2010',
      '\u2011',
      '\u2012',
      '\u2013',
      '\u2212',
    ]);

    let reAlnumOnly;
    try {
      reAlnumOnly = new RegExp('^[\\p{L}\\p{N}]+$', 'u');
    } catch {
      reAlnumOnly = /^[A-Za-z0-9]+$/;
      if (typeof safeLog.warn === 'function') {
        safeLog.warn('Unicode property escapes unsupported; using ASCII alnum fallback.');
      }
    }

    function hasIntlSegmenter() {
      return !!(intlObject && typeof intlObject.Segmenter === 'function');
    }

    function isHyphenJoinerSegment(segment) {
      return typeof segment === 'string' && segment.length === 1 && HYPHEN_JOINERS.has(segment);
    }

    function isAlnumOnlySegment(segment) {
      return typeof segment === 'string' && segment.length > 0 && reAlnumOnly.test(segment);
    }

    function resolveLanguage(language) {
      return typeof language === 'string' && language.trim()
        ? language.trim()
        : defaultLang;
    }

    function contarTextoSimple(texto) {
      const conEspacios = texto.length;
      const sinEspacios = texto.replace(/\s+/g, '').length;
      const palabras = texto.trim() === '' ? 0 : texto.trim().split(/\s+/).length;
      return { conEspacios, sinEspacios, palabras };
    }

    function contarTextoPrecisoFallback(texto) {
      const graphemes = [...texto];
      const conEspacios = graphemes.length;
      const sinEspacios = graphemes.filter((c) => !/\s/.test(c)).length;
      const palabras = texto.trim() === '' ? 0 : texto.trim().split(/\s+/).length;
      return { conEspacios, sinEspacios, palabras };
    }

    function contarTextoPreciso(texto, language) {
      if (!hasIntlSegmenter()) {
        if (typeof safeLog.warnOnce === 'function') {
          safeLog.warnOnce('count.intl-segmenter-missing', 'Intl.Segmenter unavailable; using fallback segmentation.');
        }
        return contarTextoPrecisoFallback(texto);
      }

      const resolvedLanguage = resolveLanguage(language);
      const segGraf = new intlObject.Segmenter(resolvedLanguage, { granularity: 'grapheme' });
      const grafemas = [...segGraf.segment(texto)];
      const conEspacios = grafemas.length;
      const sinEspacios = grafemas.filter((g) => !/\s/.test(g.segment)).length;

      const segPal = new intlObject.Segmenter(resolvedLanguage, { granularity: 'word' });

      let palabras = 0;
      let prevWasJoinableWord = false;
      let pendingHyphenJoin = false;

      for (const seg of segPal.segment(texto)) {
        if (seg && seg.isWordLike) {
          const joinable = isAlnumOnlySegment(seg.segment);

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

    function contarTexto(texto, opts = {}) {
      const modoConteo = opts.modoConteo === 'simple' ? 'simple' : 'preciso';
      const idioma = resolveLanguage(opts.idioma);

      return modoConteo === 'simple'
        ? contarTextoSimple(texto)
        : contarTextoPreciso(texto, idioma);
    }

    return {
      contarTextoSimple,
      contarTextoPrecisoFallback,
      contarTextoPreciso,
      contarTexto,
      hasIntlSegmenter,
    };
  }

  return {
    createCountUtils,
  };
});

// =============================================================================
// End of public/js/lib/count_core.js
// =============================================================================
