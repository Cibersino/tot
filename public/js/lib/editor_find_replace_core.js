// public/js/lib/editor_find_replace_core.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Shared literal matching and replace-all core for Text Editor find/replace.
// Responsibilities:
// - Normalize matching for case-sensitive and case-insensitive comparisons.
// - Mirror native find behavior by folding common Latin diacritics when matchCase is off.
// - Compute replace-all output without mutating Text Editor state directly.

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

  function findLiteralMatchRanges({
    value = '',
    query = '',
    matchCase = false,
  } = {}) {
    const sourceText = String(value || '');
    const needle = String(query || '');

    if (!needle) {
      return [];
    }

    const haystack = normalizeForMatch(sourceText, matchCase);
    const normalizedNeedle = normalizeForMatch(needle, matchCase);
    const needleLength = needle.length;
    let fromIndex = 0;
    const ranges = [];

    while (fromIndex <= sourceText.length) {
      const matchIndex = haystack.indexOf(normalizedNeedle, fromIndex);
      if (matchIndex === -1) {
        break;
      }

      ranges.push({
        start: matchIndex,
        end: matchIndex + needleLength,
      });
      fromIndex = matchIndex + needleLength;
    }

    return ranges;
  }

  function resolveLiteralMatchByOrdinal({
    value = '',
    query = '',
    ordinal = 0,
    matchCase = false,
  } = {}) {
    const targetOrdinal = Number(ordinal);
    if (!Number.isFinite(targetOrdinal) || targetOrdinal < 1) {
      return null;
    }

    const ranges = findLiteralMatchRanges({
      value,
      query,
      matchCase,
    });
    return ranges[targetOrdinal - 1] || null;
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
    const ranges = findLiteralMatchRanges({
      value: sourceText,
      query: needle,
      matchCase,
    });
    let fromIndex = 0;
    const parts = [];

    for (const range of ranges) {
      parts.push(sourceText.slice(fromIndex, range.start));
      parts.push(replacementText);
      fromIndex = range.end;
    }
    parts.push(sourceText.slice(fromIndex));

    return {
      replacements: ranges.length,
      nextValue: ranges.length > 0 ? parts.join('') : sourceText,
    };
  }

  // =============================================================================
  // Module Surface
  // =============================================================================

  return {
    findLiteralMatchRanges,
    resolveLiteralMatchByOrdinal,
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
