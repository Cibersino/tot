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
  function createCountUtils({ DEFAULT_LANG, log, intlObject = Intl } = {}) {
    const defaultLang = typeof DEFAULT_LANG === 'string' ? DEFAULT_LANG.trim() : '';
    if (!defaultLang) {
      throw new Error('[count_core] DEFAULT_LANG is required');
    }
    if (!log || typeof log.warn !== 'function' || typeof log.warnOnce !== 'function') {
      throw new Error('[count_core] log.warn() and log.warnOnce() are required');
    }

    const HYPHEN_JOINERS = new Set([
      '-',
      '\u2010',
      '\u2011',
      '\u2012',
      '\u2013',
      '\u2212',
    ]);
    const reWhitespace = /\s/;

    let reAlnumOnly;
    try {
      reAlnumOnly = new RegExp('^[\\p{L}\\p{N}]+$', 'u');
    } catch {
      reAlnumOnly = /^[A-Za-z0-9]+$/;
      log.warn('Unicode property escapes unsupported; using ASCII alnum fallback.');
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

    function countSimpleStreamingRange(texto, startIndex, endIndex, state) {
      for (let index = startIndex; index < endIndex; index += 1) {
        const segment = texto[index];
        const isWhitespace = reWhitespace.test(segment);
        if (isWhitespace) {
          state.insideWord = false;
        } else {
          state.sinEspacios += 1;
          if (!state.insideWord) {
            state.palabras += 1;
            state.insideWord = true;
          }
        }
      }
    }

    function finalizeSimpleStats(texto, state) {
      return {
        conEspacios: texto.length,
        sinEspacios: state.sinEspacios,
        palabras: state.palabras,
      };
    }

    function countSimpleStreaming(texto) {
      const state = {
        sinEspacios: 0,
        palabras: 0,
        insideWord: false,
      };
      countSimpleStreamingRange(texto, 0, texto.length, state);
      return finalizeSimpleStats(texto, state);
    }

    function consumePreciseFallbackUnit(segment, state) {
      const isWhitespace = reWhitespace.test(segment);
      state.conEspacios += 1;
      if (isWhitespace) {
        state.insideWord = false;
      } else {
        state.sinEspacios += 1;
        if (!state.insideWord) {
          state.palabras += 1;
          state.insideWord = true;
        }
      }
    }

    function finalizePreciseFallbackStats(state) {
      return {
        conEspacios: state.conEspacios,
        sinEspacios: state.sinEspacios,
        palabras: state.palabras,
      };
    }

    function countPreciseFallbackStreaming(texto) {
      const state = {
        conEspacios: 0,
        sinEspacios: 0,
        palabras: 0,
        insideWord: false,
      };
      for (const segment of texto) {
        consumePreciseFallbackUnit(segment, state);
      }
      return finalizePreciseFallbackStats(state);
    }

    function consumePreciseWordSegment(seg, state) {
      if (seg && seg.isWordLike) {
        const joinable = isAlnumOnlySegment(seg.segment);

        if (!(state.pendingHyphenJoin && joinable)) {
          state.palabras += 1;
        }

        state.pendingHyphenJoin = false;
        state.prevWasJoinableWord = joinable;
      } else {
        if (seg && isHyphenJoinerSegment(seg.segment) && state.prevWasJoinableWord) {
          state.pendingHyphenJoin = true;
        } else {
          state.pendingHyphenJoin = false;
        }
        state.prevWasJoinableWord = false;
      }
    }

    function countPreciseStreaming(texto, language) {
      if (!hasIntlSegmenter()) {
        log.warnOnce('count.intl-segmenter-missing', 'Intl.Segmenter unavailable; using fallback segmentation.');
        return countPreciseFallbackStreaming(texto);
      }

      const resolvedLanguage = resolveLanguage(language);
      const segGraf = new intlObject.Segmenter(resolvedLanguage, { granularity: 'grapheme' });
      let conEspacios = 0;
      let sinEspacios = 0;
      for (const grapheme of segGraf.segment(texto)) {
        conEspacios += 1;
        if (!reWhitespace.test(grapheme.segment)) {
          sinEspacios += 1;
        }
      }

      const segPal = new intlObject.Segmenter(resolvedLanguage, { granularity: 'word' });
      const wordState = {
        palabras: 0,
        prevWasJoinableWord: false,
        pendingHyphenJoin: false,
      };
      for (const seg of segPal.segment(texto)) {
        consumePreciseWordSegment(seg, wordState);
      }

      return {
        conEspacios,
        sinEspacios,
        palabras: wordState.palabras,
      };
    }

    function contarTextoSimple(texto) {
      return countSimpleStreaming(texto);
    }

    function contarTextoPrecisoFallback(texto) {
      return countPreciseFallbackStreaming(texto);
    }

    function contarTextoPreciso(texto, language) {
      return countPreciseStreaming(texto, language);
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
