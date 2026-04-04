// public/js/lib/snapshot_tag_catalog.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Expose one shared snapshot tag catalog for renderer and main-process consumers.
// - Define the canonical snapshot tag option sets.
// - Normalize language/type/difficulty/testUsed tag values.
// - Support both browser-script and CommonJS consumers.

// =============================================================================
// Module bootstrapping
// =============================================================================
(function initSnapshotTagCatalog(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  if (root && typeof root === 'object') {
    root.SnapshotTagCatalog = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  // =============================================================================
  // Constants / config
  // =============================================================================
  const LANGUAGE_OPTIONS = Object.freeze([
    Object.freeze({ value: 'es', labelKey: 'renderer.snapshot_save_tags.options.language.es', fallback: 'Español' }),
    Object.freeze({ value: 'en', labelKey: 'renderer.snapshot_save_tags.options.language.en', fallback: 'English' }),
    Object.freeze({ value: 'pt', labelKey: 'renderer.snapshot_save_tags.options.language.pt', fallback: 'Português' }),
    Object.freeze({ value: 'fr', labelKey: 'renderer.snapshot_save_tags.options.language.fr', fallback: 'Français' }),
    Object.freeze({ value: 'de', labelKey: 'renderer.snapshot_save_tags.options.language.de', fallback: 'Deutsch' }),
    Object.freeze({ value: 'it', labelKey: 'renderer.snapshot_save_tags.options.language.it', fallback: 'Italiano' }),
    Object.freeze({ value: 'arn', labelKey: 'renderer.snapshot_save_tags.options.language.arn', fallback: 'Mapudungun' }),
    Object.freeze({ value: 'ja', labelKey: 'renderer.snapshot_save_tags.options.language.ja', fallback: '日本語' }),
    Object.freeze({ value: 'ko', labelKey: 'renderer.snapshot_save_tags.options.language.ko', fallback: '한국어' }),
    Object.freeze({ value: 'ru', labelKey: 'renderer.snapshot_save_tags.options.language.ru', fallback: 'Русский' }),
    Object.freeze({ value: 'tr', labelKey: 'renderer.snapshot_save_tags.options.language.tr', fallback: 'Türkçe' }),
    Object.freeze({ value: 'id', labelKey: 'renderer.snapshot_save_tags.options.language.id', fallback: 'Bahasa Indonesia' }),
    Object.freeze({ value: 'hi', labelKey: 'renderer.snapshot_save_tags.options.language.hi', fallback: 'हिन्दी' }),
    Object.freeze({ value: 'bn', labelKey: 'renderer.snapshot_save_tags.options.language.bn', fallback: 'বাংলা' }),
    Object.freeze({ value: 'ur', labelKey: 'renderer.snapshot_save_tags.options.language.ur', fallback: 'اردو' }),
    Object.freeze({ value: 'ar', labelKey: 'renderer.snapshot_save_tags.options.language.ar', fallback: 'العربية' }),
    Object.freeze({ value: 'zh-Hans', labelKey: 'renderer.snapshot_save_tags.options.language.zh_hans', fallback: '简体中文' }),
    Object.freeze({ value: 'zh-Hant', labelKey: 'renderer.snapshot_save_tags.options.language.zh_hant', fallback: '繁體中文' }),
  ]);

  const TYPE_OPTIONS = Object.freeze([
    Object.freeze({ value: 'fiction', labelKey: 'renderer.snapshot_save_tags.options.type.fiction', fallback: 'Fiction' }),
    Object.freeze({ value: 'non_fiction', labelKey: 'renderer.snapshot_save_tags.options.type.non_fiction', fallback: 'Non-fiction' }),
  ]);

  const DIFFICULTY_OPTIONS = Object.freeze([
    Object.freeze({ value: 'easy', labelKey: 'renderer.snapshot_save_tags.options.difficulty.easy', fallback: 'Easy' }),
    Object.freeze({ value: 'normal', labelKey: 'renderer.snapshot_save_tags.options.difficulty.normal', fallback: 'Normal' }),
    Object.freeze({ value: 'hard', labelKey: 'renderer.snapshot_save_tags.options.difficulty.hard', fallback: 'Hard' }),
  ]);

  const TAG_KEYS = Object.freeze(['language', 'type', 'difficulty', 'testUsed']);
  const LANGUAGE_RE = /^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/;
  const LANGUAGE_CANONICAL_MAP = Object.freeze(
    Object.fromEntries(
      LANGUAGE_OPTIONS.map((option) => [String(option.value).toLowerCase(), option.value])
    )
  );
  const TYPE_VALUE_SET = new Set(TYPE_OPTIONS.map((option) => option.value));
  const DIFFICULTY_VALUE_SET = new Set(DIFFICULTY_OPTIONS.map((option) => option.value));

  // =============================================================================
  // Helpers
  // =============================================================================
  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function normalizeLanguageTag(rawValue) {
    const source = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!source) return '';
    const normalized = source.replace(/_/g, '-');
    if (!LANGUAGE_RE.test(normalized)) return '';
    const mapped = LANGUAGE_CANONICAL_MAP[normalized.toLowerCase()];
    return typeof mapped === 'string' ? mapped : normalized;
  }

  function normalizeTypeTag(rawValue) {
    const source = typeof rawValue === 'string'
      ? rawValue.trim().toLowerCase().replace(/-/g, '_').replace(/\s+/g, '_')
      : '';
    return TYPE_VALUE_SET.has(source) ? source : '';
  }

  function normalizeDifficultyTag(rawValue) {
    const source = typeof rawValue === 'string'
      ? rawValue.trim().toLowerCase()
      : '';
    return DIFFICULTY_VALUE_SET.has(source) ? source : '';
  }

  function normalizeTestUsedTag(rawValue) {
    return typeof rawValue === 'boolean' ? rawValue : null;
  }

  function normalizeTags(rawTags) {
    if (!isPlainObject(rawTags)) return null;
    const tags = {};

    const language = normalizeLanguageTag(rawTags.language);
    const type = normalizeTypeTag(rawTags.type);
    const difficulty = normalizeDifficultyTag(rawTags.difficulty);
    const testUsed = normalizeTestUsedTag(rawTags.testUsed);

    if (language) tags.language = language;
    if (type) tags.type = type;
    if (difficulty) tags.difficulty = difficulty;
    if (testUsed !== null) tags.testUsed = testUsed;

    return Object.keys(tags).length ? tags : null;
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================
  return {
    TAG_KEYS,
    LANGUAGE_OPTIONS,
    TYPE_OPTIONS,
    DIFFICULTY_OPTIONS,
    isPlainObject,
    normalizeLanguageTag,
    normalizeTypeTag,
    normalizeDifficultyTag,
    normalizeTestUsedTag,
    normalizeTags,
  };
});

// =============================================================================
// End of public/js/lib/snapshot_tag_catalog.js
// =============================================================================
