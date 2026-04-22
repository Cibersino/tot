// public/js/lib/editor_find_replace_core.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Shared literal matching and replace-all core for editor find/replace.
// Responsibilities:
// - Normalize matching for case-sensitive and case-insensitive comparisons.
// - Mirror native find behavior by folding common Latin diacritics when matchCase is off.
// - Check whether the current selection still matches a literal query.
// - Compute replace-all output without mutating editor state directly.

// =============================================================================
// Module Factory
// =============================================================================

function createEditorFindReplaceCore() {
  // =============================================================================
  // Helpers
  // =============================================================================

  function normalizeForMatch(text, matchCase) {
    const value = String(text || '');
    if (matchCase) {
      return value;
    }

    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase();
  }

  function selectionMatchesLiteralQuery({
    value = '',
    selectionStart = 0,
    selectionEnd = 0,
    query = '',
    matchCase = false,
  } = {}) {
    const needle = String(query || '');
    if (!needle) return false;

    const start = Number(selectionStart);
    const end = Number(selectionEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return false;
    }

    const sourceText = String(value || '');
    const selectedText = sourceText.slice(start, end);
    if (selectedText.length !== needle.length) {
      return false;
    }

    return normalizeForMatch(selectedText, matchCase) === normalizeForMatch(needle, matchCase);
  }

  function computeLiteralReplaceAll({
    value = '',
    query = '',
    replacement = '',
    matchCase = false,
  } = {}) {
    const sourceText = String(value || '');
    const needle = String(query || '');
    const replacementText = String(replacement || '');

    if (!needle) {
      return {
        replacements: 0,
        nextValue: sourceText,
      };
    }

    const haystack = normalizeForMatch(sourceText, matchCase);
    const normalizedNeedle = normalizeForMatch(needle, matchCase);
    const needleLength = needle.length;
    let fromIndex = 0;
    let replacements = 0;
    const parts = [];

    while (fromIndex <= sourceText.length) {
      const matchIndex = haystack.indexOf(normalizedNeedle, fromIndex);
      if (matchIndex === -1) {
        parts.push(sourceText.slice(fromIndex));
        break;
      }

      parts.push(sourceText.slice(fromIndex, matchIndex));
      parts.push(replacementText);
      fromIndex = matchIndex + needleLength;
      replacements += 1;
    }

    return {
      replacements,
      nextValue: replacements > 0 ? parts.join('') : sourceText,
    };
  }

  // =============================================================================
  // Module Surface
  // =============================================================================

  return {
    selectionMatchesLiteralQuery,
    computeLiteralReplaceAll,
  };
}

// =============================================================================
// Exports
// =============================================================================

(function initEditorFindReplaceCore(factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (typeof window !== 'undefined') {
    window.EditorFindReplaceCore = api;
  }
})(createEditorFindReplaceCore);

// =============================================================================
// End of public/js/lib/editor_find_replace_core.js
// =============================================================================
