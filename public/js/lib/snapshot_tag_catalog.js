// public/js/lib/snapshot_tag_catalog.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Expose one shared snapshot tag catalog for renderer and main-process consumers.
// - Define the canonical snapshot tag option sets.
// - Normalize language/type/difficulty tag values.
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
    Object.freeze({ value: 'ar', labelKey: 'renderer.snapshot_save_tags.options.language.ar' }),
    Object.freeze({ value: 'arn', labelKey: 'renderer.snapshot_save_tags.options.language.arn' }),
    Object.freeze({ value: 'ay', labelKey: 'renderer.snapshot_save_tags.options.language.ay' }),
    Object.freeze({ value: 'bn', labelKey: 'renderer.snapshot_save_tags.options.language.bn' }),
    Object.freeze({ value: 'ca', labelKey: 'renderer.snapshot_save_tags.options.language.ca' }),
    Object.freeze({ value: 'de', labelKey: 'renderer.snapshot_save_tags.options.language.de' }),
    Object.freeze({ value: 'en', labelKey: 'renderer.snapshot_save_tags.options.language.en' }),
    Object.freeze({ value: 'es', labelKey: 'renderer.snapshot_save_tags.options.language.es' }),
    Object.freeze({ value: 'eu', labelKey: 'renderer.snapshot_save_tags.options.language.eu' }),
    Object.freeze({ value: 'fa', labelKey: 'renderer.snapshot_save_tags.options.language.fa' }),
    Object.freeze({ value: 'fr', labelKey: 'renderer.snapshot_save_tags.options.language.fr' }),
    Object.freeze({ value: 'gn', labelKey: 'renderer.snapshot_save_tags.options.language.gn' }),
    Object.freeze({ value: 'hi', labelKey: 'renderer.snapshot_save_tags.options.language.hi' }),
    Object.freeze({ value: 'ht', labelKey: 'renderer.snapshot_save_tags.options.language.ht' }),
    Object.freeze({ value: 'id', labelKey: 'renderer.snapshot_save_tags.options.language.id' }),
    Object.freeze({ value: 'it', labelKey: 'renderer.snapshot_save_tags.options.language.it' }),
    Object.freeze({ value: 'ja', labelKey: 'renderer.snapshot_save_tags.options.language.ja' }),
    Object.freeze({ value: 'ko', labelKey: 'renderer.snapshot_save_tags.options.language.ko' }),
    Object.freeze({ value: 'mi', labelKey: 'renderer.snapshot_save_tags.options.language.mi' }),
    Object.freeze({ value: 'pcm', labelKey: 'renderer.snapshot_save_tags.options.language.pcm' }),
    Object.freeze({ value: 'pt', labelKey: 'renderer.snapshot_save_tags.options.language.pt' }),
    Object.freeze({ value: 'qu', labelKey: 'renderer.snapshot_save_tags.options.language.qu' }),
    Object.freeze({ value: 'ru', labelKey: 'renderer.snapshot_save_tags.options.language.ru' }),
    Object.freeze({ value: 'sv', labelKey: 'renderer.snapshot_save_tags.options.language.sv' }),
    Object.freeze({ value: 'tr', labelKey: 'renderer.snapshot_save_tags.options.language.tr' }),
    Object.freeze({ value: 'ur', labelKey: 'renderer.snapshot_save_tags.options.language.ur' }),
    Object.freeze({ value: 'vi', labelKey: 'renderer.snapshot_save_tags.options.language.vi' }),
    Object.freeze({ value: 'zh-Hans', labelKey: 'renderer.snapshot_save_tags.options.language.zh_hans' }),
    Object.freeze({ value: 'zh-Hant', labelKey: 'renderer.snapshot_save_tags.options.language.zh_hant' }),
    Object.freeze({ value: 'zu', labelKey: 'renderer.snapshot_save_tags.options.language.zu' }),
  ]);

  const TYPE_OPTIONS = Object.freeze([
    Object.freeze({ value: 'fiction', labelKey: 'renderer.snapshot_save_tags.options.type.fiction' }),
    Object.freeze({ value: 'non_fiction', labelKey: 'renderer.snapshot_save_tags.options.type.non_fiction' }),
  ]);

  const DIFFICULTY_OPTIONS = Object.freeze([
    Object.freeze({ value: 'easy', labelKey: 'renderer.snapshot_save_tags.options.difficulty.easy' }),
    Object.freeze({ value: 'normal', labelKey: 'renderer.snapshot_save_tags.options.difficulty.normal' }),
    Object.freeze({ value: 'hard', labelKey: 'renderer.snapshot_save_tags.options.difficulty.hard' }),
  ]);

  const TAG_KEYS = Object.freeze(['language', 'type', 'difficulty']);
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

  function normalizeTags(rawTags) {
    if (!isPlainObject(rawTags)) return null;
    const tags = {};

    const language = normalizeLanguageTag(rawTags.language);
    const type = normalizeTypeTag(rawTags.type);
    const difficulty = normalizeDifficultyTag(rawTags.difficulty);

    if (language) tags.language = language;
    if (type) tags.type = type;
    if (difficulty) tags.difficulty = difficulty;

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
    normalizeTags,
  };
});

// =============================================================================
// End of public/js/lib/snapshot_tag_catalog.js
// =============================================================================
