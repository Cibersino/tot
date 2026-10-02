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
  function createCountUtils({
    DEFAULT_LANG,
    log,
    intlObject = (typeof Intl !== 'undefined' ? Intl : null),
  } = {}) {
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
    const reWhitespace = /\s/;

    let reAlnumOnly = null;
    let unicodePropertyEscapesAvailable = true;
    try {
      reAlnumOnly = new RegExp('^[\\p{L}\\p{N}]+$', 'u');
    } catch {
      unicodePropertyEscapesAvailable = false;
      log.warn('Unicode property escapes unavailable; Precise counting will use canonical Simple recovery.');
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

    const PRECISE_FAILURE_CODE_UNAVAILABLE = 'PRECISE_SEGMENTER_UNAVAILABLE';
    const PRECISE_FAILURE_CODE_UNICODE_PROPERTIES_UNAVAILABLE = 'PRECISE_UNICODE_PROPERTIES_UNAVAILABLE';
    const PRECISE_FAILURE_CODE_EXECUTION = 'PRECISE_SEGMENTER_EXECUTION_FAILED';

    function createPreciseCountFailure(code, stage, cause = null) {
      const error = new Error(`Precise counting failed at ${stage}.`);
      error.name = 'PreciseCountError';
      error.code = code;
      error.stage = stage;
      if (cause) error.cause = cause;
      return error;
    }

    function isPreciseCountFailure(error) {
      return !!error
        && error.name === 'PreciseCountError'
        && (error.code === PRECISE_FAILURE_CODE_UNAVAILABLE
          || error.code === PRECISE_FAILURE_CODE_UNICODE_PROPERTIES_UNAVAILABLE
          || error.code === PRECISE_FAILURE_CODE_EXECUTION)
        && typeof error.stage === 'string';
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
        throw createPreciseCountFailure(PRECISE_FAILURE_CODE_UNAVAILABLE, 'availability');
      }
      if (!unicodePropertyEscapesAvailable) {
        throw createPreciseCountFailure(
          PRECISE_FAILURE_CODE_UNICODE_PROPERTIES_UNAVAILABLE,
          'unicode-properties'
        );
      }

      const resolvedLanguage = resolveLanguage(language);
      let segGraf;
      try {
        segGraf = new intlObject.Segmenter(resolvedLanguage, { granularity: 'grapheme' });
      } catch (err) {
        throw createPreciseCountFailure(PRECISE_FAILURE_CODE_EXECUTION, 'grapheme-construction', err);
      }
      let conEspacios = 0;
      let sinEspacios = 0;
      try {
        for (const grapheme of segGraf.segment(texto)) {
          conEspacios += 1;
          if (!reWhitespace.test(grapheme.segment)) {
            sinEspacios += 1;
          }
        }
      } catch (err) {
        throw createPreciseCountFailure(PRECISE_FAILURE_CODE_EXECUTION, 'grapheme-segmentation', err);
      }

      let segPal;
      try {
        segPal = new intlObject.Segmenter(resolvedLanguage, { granularity: 'word' });
      } catch (err) {
        throw createPreciseCountFailure(PRECISE_FAILURE_CODE_EXECUTION, 'word-construction', err);
      }
      const wordState = {
        palabras: 0,
        prevWasJoinableWord: false,
        pendingHyphenJoin: false,
      };
      try {
        for (const seg of segPal.segment(texto)) {
          consumePreciseWordSegment(seg, wordState);
        }
      } catch (err) {
        throw createPreciseCountFailure(PRECISE_FAILURE_CODE_EXECUTION, 'word-segmentation', err);
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
      contarTextoPreciso,
      contarTexto,
      hasIntlSegmenter,
      isPreciseCountFailure,
    };
  }

  return {
    createCountUtils,
  };
});

// =============================================================================
// End of public/js/lib/count_core.js
// =============================================================================
