// public/js/lib/reading_test_filters_core.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Shared reading-test filter core.
// Responsibilities:
// - Normalize checkbox-style filter selections.
// - Compute eligible pool entries using OR-within / AND-across semantics.
// - Compute enabled/disabled checkbox state from real remaining combinations.
// - Support both browser-script and CommonJS consumers.

// =============================================================================
// Module bootstrap / dual export wrapper
// =============================================================================
(function initReadingTestFiltersCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === 'object') {
    root.ReadingTestFiltersCore = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  // =============================================================================
  // Constants / config
  // =============================================================================
  const CATEGORY_KEYS = Object.freeze(['language', 'type', 'difficulty']);

  // =============================================================================
  // Helpers
  // =============================================================================
  function normalizeValue(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function normalizeSelection(rawSelection) {
    const source = rawSelection && typeof rawSelection === 'object' ? rawSelection : {};
    const normalized = {};

    for (const key of CATEGORY_KEYS) {
      const rawValues = Array.isArray(source[key]) ? source[key] : [];
      const deduped = [];
      const seen = new Set();
      for (const rawValue of rawValues) {
        const value = normalizeValue(rawValue);
        if (!value || seen.has(value)) continue;
        seen.add(value);
        deduped.push(value);
      }
      normalized[key] = deduped;
    }

    return normalized;
  }

  function isActivelyFiltered(selection, key) {
    const normalized = normalizeSelection(selection);
    return Array.isArray(normalized[key]) && normalized[key].length > 0;
  }

  function isUnusedEntry(entry) {
    return !!(entry
      && entry.used === false);
  }

  function getEntryTags(entry) {
    return entry && entry.tags ? entry.tags : {};
  }

  function entryMatchesNormalizedSelection(entry, normalizedSelection) {
    if (!isUnusedEntry(entry)) return false;

    const tags = getEntryTags(entry);

    for (const key of CATEGORY_KEYS) {
      if (!normalizedSelection[key].length) continue;
      const entryValue = normalizeValue(tags[key]);
      if (!entryValue || !normalizedSelection[key].includes(entryValue)) {
        return false;
      }
    }

    return true;
  }

  function entryMatchesSelection(entry, selection) {
    return entryMatchesNormalizedSelection(entry, normalizeSelection(selection));
  }

  function getEligibleEntries(entries, selection) {
    const list = Array.isArray(entries) ? entries : [];
    const normalized = normalizeSelection(selection);
    return list.filter((entry) => entryMatchesNormalizedSelection(entry, normalized));
  }

  function collectOptionValues(entries) {
    const list = Array.isArray(entries) ? entries : [];
    const valuesByCategory = {
      language: new Set(),
      type: new Set(),
      difficulty: new Set(),
    };

    for (const entry of list) {
      if (!isUnusedEntry(entry)) continue;
      const tags = getEntryTags(entry);
      for (const key of CATEGORY_KEYS) {
        const value = normalizeValue(tags[key]);
        if (value) valuesByCategory[key].add(value);
      }
    }

    return {
      language: Array.from(valuesByCategory.language).sort((a, b) => a.localeCompare(b)),
      type: Array.from(valuesByCategory.type).sort((a, b) => a.localeCompare(b)),
      difficulty: Array.from(valuesByCategory.difficulty).sort((a, b) => a.localeCompare(b)),
    };
  }

  function cloneSelection(selection) {
    const normalized = normalizeSelection(selection);
    return {
      language: normalized.language.slice(),
      type: normalized.type.slice(),
      difficulty: normalized.difficulty.slice(),
    };
  }

  function computeOptionState(entries, selection) {
    const options = collectOptionValues(entries);
    const normalized = normalizeSelection(selection);
    const optionState = {
      language: [],
      type: [],
      difficulty: [],
    };

    for (const key of CATEGORY_KEYS) {
      for (const value of options[key]) {
        const checked = normalized[key].includes(value);
        let enabled = checked;

        if (!checked) {
          const nextSelection = cloneSelection(normalized);
          nextSelection[key].push(value);
          enabled = getEligibleEntries(entries, nextSelection).length > 0;
        }

        optionState[key].push({ value, checked, enabled });
      }
    }

    return optionState;
  }

  function computeFilterState(entries, selection) {
    const normalized = normalizeSelection(selection);
    const eligibleEntries = getEligibleEntries(entries, normalized);
    return {
      selection: normalized,
      eligibleEntries,
      eligibleCount: eligibleEntries.length,
      options: computeOptionState(entries, normalized),
    };
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================
  return {
    CATEGORY_KEYS,
    normalizeSelection,
    isActivelyFiltered,
    isUnusedEntry,
    entryMatchesSelection,
    getEligibleEntries,
    collectOptionValues,
    computeFilterState,
  };
});

// =============================================================================
// End of public/js/lib/reading_test_filters_core.js
// =============================================================================
