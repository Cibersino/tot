// public/js/lib/snapshot_tag_catalog.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Expose the shared snapshot tag catalog for renderer and main-process consumers.
// - Define canonical default tag option sets and custom-tag value generation.
// - Normalize snapshot tags and editable snapshot-tag preferences.
// - Resolve visible editable catalogs without duplicating merge logic.
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
    Object.freeze({ value: 'ar', labelKey: 'renderer.snapshots.options.language.ar' }),
    Object.freeze({ value: 'arn', labelKey: 'renderer.snapshots.options.language.arn' }),
    Object.freeze({ value: 'ay', labelKey: 'renderer.snapshots.options.language.ay' }),
    Object.freeze({ value: 'bn', labelKey: 'renderer.snapshots.options.language.bn' }),
    Object.freeze({ value: 'ca', labelKey: 'renderer.snapshots.options.language.ca' }),
    Object.freeze({ value: 'de', labelKey: 'renderer.snapshots.options.language.de' }),
    Object.freeze({ value: 'en', labelKey: 'renderer.snapshots.options.language.en' }),
    Object.freeze({ value: 'es', labelKey: 'renderer.snapshots.options.language.es' }),
    Object.freeze({ value: 'eu', labelKey: 'renderer.snapshots.options.language.eu' }),
    Object.freeze({ value: 'fa', labelKey: 'renderer.snapshots.options.language.fa' }),
    Object.freeze({ value: 'fr', labelKey: 'renderer.snapshots.options.language.fr' }),
    Object.freeze({ value: 'gn', labelKey: 'renderer.snapshots.options.language.gn' }),
    Object.freeze({ value: 'hi', labelKey: 'renderer.snapshots.options.language.hi' }),
    Object.freeze({ value: 'ht', labelKey: 'renderer.snapshots.options.language.ht' }),
    Object.freeze({ value: 'id', labelKey: 'renderer.snapshots.options.language.id' }),
    Object.freeze({ value: 'it', labelKey: 'renderer.snapshots.options.language.it' }),
    Object.freeze({ value: 'ja', labelKey: 'renderer.snapshots.options.language.ja' }),
    Object.freeze({ value: 'ko', labelKey: 'renderer.snapshots.options.language.ko' }),
    Object.freeze({ value: 'mi', labelKey: 'renderer.snapshots.options.language.mi' }),
    Object.freeze({ value: 'pcm', labelKey: 'renderer.snapshots.options.language.pcm' }),
    Object.freeze({ value: 'pt', labelKey: 'renderer.snapshots.options.language.pt' }),
    Object.freeze({ value: 'qu', labelKey: 'renderer.snapshots.options.language.qu' }),
    Object.freeze({ value: 'ru', labelKey: 'renderer.snapshots.options.language.ru' }),
    Object.freeze({ value: 'sv', labelKey: 'renderer.snapshots.options.language.sv' }),
    Object.freeze({ value: 'tr', labelKey: 'renderer.snapshots.options.language.tr' }),
    Object.freeze({ value: 'ur', labelKey: 'renderer.snapshots.options.language.ur' }),
    Object.freeze({ value: 'vi', labelKey: 'renderer.snapshots.options.language.vi' }),
    Object.freeze({ value: 'zh-Hans', labelKey: 'renderer.snapshots.options.language.zh_hans' }),
    Object.freeze({ value: 'zh-Hant', labelKey: 'renderer.snapshots.options.language.zh_hant' }),
    Object.freeze({ value: 'zu', labelKey: 'renderer.snapshots.options.language.zu' }),
  ]);

  const TYPE_OPTIONS = Object.freeze([
    Object.freeze({ value: 'fiction', labelKey: 'renderer.snapshots.options.type.fiction' }),
    Object.freeze({ value: 'non_fiction', labelKey: 'renderer.snapshots.options.type.non_fiction' }),
  ]);

  const DIFFICULTY_OPTIONS = Object.freeze([
    Object.freeze({ value: 'easy', labelKey: 'renderer.snapshots.options.difficulty.easy' }),
    Object.freeze({ value: 'normal', labelKey: 'renderer.snapshots.options.difficulty.normal' }),
    Object.freeze({ value: 'hard', labelKey: 'renderer.snapshots.options.difficulty.hard' }),
  ]);

  const TAG_KEYS = Object.freeze(['language', 'type', 'difficulty']);
  const CATEGORY_OPTIONS = Object.freeze({
    language: LANGUAGE_OPTIONS,
    type: TYPE_OPTIONS,
    difficulty: DIFFICULTY_OPTIONS,
  });
  const CUSTOM_TAG_PREFIX = 'custom';
  const MAX_CUSTOM_LABEL_LENGTH = 48;
  const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;
  const LANGUAGE_RE = /^[A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*$/;
  const CUSTOM_TAG_VALUE_RE = /^custom:(language|type|difficulty):([a-z0-9_-]+)$/i;
  const LANGUAGE_CANONICAL_MAP = Object.freeze(
    Object.fromEntries(
      LANGUAGE_OPTIONS.map((option) => [String(option.value).toLowerCase(), option.value])
    )
  );
  const TYPE_VALUE_SET = new Set(TYPE_OPTIONS.map((option) => option.value));
  const DIFFICULTY_VALUE_SET = new Set(DIFFICULTY_OPTIONS.map((option) => option.value));
  // =============================================================================
  // Generic helpers
  // =============================================================================
  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function normalizeOptionalString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function collapseInternalWhitespace(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function stripAccents(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function normalizeLabelForComparison(value) {
    return stripAccents(collapseInternalWhitespace(value)).toLowerCase();
  }

  function normalizeTagCategory(rawCategory) {
    const category = normalizeOptionalString(rawCategory).toLowerCase();
    return TAG_KEYS.includes(category) ? category : '';
  }

  function getDefaultOptionsForCategory(category) {
    const normalizedCategory = normalizeTagCategory(category);
    return normalizedCategory ? CATEGORY_OPTIONS[normalizedCategory].slice() : [];
  }

  function getDefaultOptionByValue(category, value) {
    const normalizedCategory = normalizeTagCategory(category);
    const normalizedValue = normalizeOptionalString(value);
    if (!normalizedCategory || !normalizedValue) return null;
    return CATEGORY_OPTIONS[normalizedCategory].find((option) => option.value === normalizedValue) || null;
  }

  function resolveDefaultOptionLabel(option, getDefaultLabel) {
    if (!option) return '';
    if (typeof getDefaultLabel === 'function') {
      const label = normalizeOptionalString(getDefaultLabel(option));
      if (label) return label;
    }
    if (typeof option.label === 'string' && option.label.trim()) {
      return option.label.trim();
    }
    return String(option.value || '');
  }

  function compareByLabel(left, right) {
    const leftLabel = normalizeOptionalString(left && left.label);
    const rightLabel = normalizeOptionalString(right && right.label);
    return leftLabel.localeCompare(rightLabel, undefined, { sensitivity: 'base' });
  }

  function moveArrayValue(values, value, direction) {
    const source = Array.isArray(values) ? values.slice() : [];
    const index = source.indexOf(value);
    if (index < 0) return source;
    const delta = direction === 'up' ? -1 : 1;
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= source.length) return source;
    const nextValues = source.slice();
    const temp = nextValues[index];
    nextValues[index] = nextValues[nextIndex];
    nextValues[nextIndex] = temp;
    return nextValues;
  }

  // =============================================================================
  // Value normalization
  // =============================================================================
  function normalizeLanguageTagSyntax(rawValue) {
    const source = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!source) return '';
    const normalized = source.replace(/_/g, '-');
    return LANGUAGE_RE.test(normalized) ? normalized : '';
  }

  function normalizeDefaultLanguageTag(rawValue) {
    const normalized = normalizeLanguageTagSyntax(rawValue);
    if (!normalized) return '';
    const mapped = LANGUAGE_CANONICAL_MAP[normalized.toLowerCase()];
    return typeof mapped === 'string' ? mapped : '';
  }

  function normalizeDefaultTypeTag(rawValue) {
    const source = typeof rawValue === 'string'
      ? rawValue.trim().toLowerCase().replace(/-/g, '_').replace(/\s+/g, '_')
      : '';
    return TYPE_VALUE_SET.has(source) ? source : '';
  }

  function normalizeDefaultDifficultyTag(rawValue) {
    const source = typeof rawValue === 'string'
      ? rawValue.trim().toLowerCase()
      : '';
    return DIFFICULTY_VALUE_SET.has(source) ? source : '';
  }

  function normalizeDefaultTagValue(category, rawValue) {
    switch (normalizeTagCategory(category)) {
      case 'language':
        return normalizeDefaultLanguageTag(rawValue);
      case 'type':
        return normalizeDefaultTypeTag(rawValue);
      case 'difficulty':
        return normalizeDefaultDifficultyTag(rawValue);
      default:
        return '';
    }
  }

  function normalizeCustomTagValue(rawValue, expectedCategory = '') {
    const source = normalizeOptionalString(rawValue).toLowerCase();
    if (!source) return '';
    const match = source.match(CUSTOM_TAG_VALUE_RE);
    if (!match) return '';
    const category = match[1];
    if (expectedCategory && normalizeTagCategory(expectedCategory) !== category) {
      return '';
    }
    return `${CUSTOM_TAG_PREFIX}:${category}:${match[2]}`;
  }

  function normalizeLanguageTag(rawValue) {
    const defaultValue = normalizeDefaultLanguageTag(rawValue);
    if (defaultValue) return defaultValue;

    const customValue = normalizeCustomTagValue(rawValue, 'language');
    if (customValue) return customValue;

    return normalizeLanguageTagSyntax(rawValue);
  }

  function normalizeTypeTag(rawValue) {
    return normalizeDefaultTypeTag(rawValue) || normalizeCustomTagValue(rawValue, 'type');
  }

  function normalizeDifficultyTag(rawValue) {
    return normalizeDefaultDifficultyTag(rawValue) || normalizeCustomTagValue(rawValue, 'difficulty');
  }

  function normalizeTagValue(category, rawValue) {
    switch (normalizeTagCategory(category)) {
      case 'language':
        return normalizeLanguageTag(rawValue);
      case 'type':
        return normalizeTypeTag(rawValue);
      case 'difficulty':
        return normalizeDifficultyTag(rawValue);
      default:
        return '';
    }
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
  // Custom label helpers
  // =============================================================================
  function validateCustomLabel(rawLabel) {
    const source = typeof rawLabel === 'string' ? rawLabel.trim() : '';
    if (!source) {
      return {
        ok: false,
        code: 'empty',
        label: '',
        normalizedLabel: '',
      };
    }
    if (CONTROL_CHAR_RE.test(source)) {
      return {
        ok: false,
        code: 'control_characters',
        label: '',
        normalizedLabel: '',
      };
    }

    const label = collapseInternalWhitespace(source);
    if (!label) {
      return {
        ok: false,
        code: 'empty',
        label: '',
        normalizedLabel: '',
      };
    }
    if (label.length > MAX_CUSTOM_LABEL_LENGTH) {
      return {
        ok: false,
        code: 'too_long',
        label,
        normalizedLabel: '',
      };
    }

    const normalizedLabel = normalizeLabelForComparison(label);
    if (!normalizedLabel) {
      return {
        ok: false,
        code: 'empty',
        label: '',
        normalizedLabel: '',
      };
    }

    return {
      ok: true,
      code: '',
      label,
      normalizedLabel,
    };
  }

  function encodeCustomSlug(normalizedLabel) {
    let slug = '';
    for (const char of String(normalizedLabel || '')) {
      if (/[a-z0-9]/.test(char)) {
        slug += char;
        continue;
      }
      if (char === ' ') {
        slug += '-';
        continue;
      }
      if (char === '_') {
        slug += '__';
        continue;
      }
      slug += `_${char.codePointAt(0).toString(16)}_`;
    }
    return slug || 'tag';
  }

  function decodeCustomSlug(slug) {
    const source = normalizeOptionalString(slug).toLowerCase();
    if (!source) return '';
    let decoded = '';
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (char === '-') {
        decoded += ' ';
        continue;
      }
      if (char !== '_') {
        decoded += char;
        continue;
      }

      if (source[index + 1] === '_') {
        decoded += '_';
        index += 1;
        continue;
      }

      const endIndex = source.indexOf('_', index + 1);
      if (endIndex < 0) {
        return '';
      }
      const hex = source.slice(index + 1, endIndex);
      if (!/^[0-9a-f]+$/.test(hex)) {
        return '';
      }
      decoded += String.fromCodePoint(parseInt(hex, 16));
      index = endIndex;
    }
    return collapseInternalWhitespace(decoded);
  }

  function buildCustomTagValueFromNormalizedLabel(category, normalizedLabel) {
    const normalizedCategory = normalizeTagCategory(category);
    if (!normalizedCategory || !normalizedLabel) return '';
    return `${CUSTOM_TAG_PREFIX}:${normalizedCategory}:${encodeCustomSlug(normalizedLabel)}`;
  }

  function buildCustomTagValue(category, rawLabel) {
    const labelInfo = validateCustomLabel(rawLabel);
    if (!labelInfo.ok) return '';
    return buildCustomTagValueFromNormalizedLabel(category, labelInfo.normalizedLabel);
  }

  function decodeCustomTagValueToLabel(value) {
    const normalizedValue = normalizeCustomTagValue(value);
    if (!normalizedValue) return '';
    const slug = normalizedValue.split(':')[2] || '';
    return decodeCustomSlug(slug);
  }

  // =============================================================================
  // Editable preferences normalization
  // =============================================================================
  function createEmptyCategoryPreferences() {
    return {
      custom: [],
      hiddenDefaults: [],
      order: [],
    };
  }

  function createEmptySnapshotTagPreferences() {
    return {
      language: createEmptyCategoryPreferences(),
      type: createEmptyCategoryPreferences(),
      difficulty: createEmptyCategoryPreferences(),
    };
  }

  function normalizeCategoryPreferences(rawCategoryPreferences, category) {
    const normalizedCategory = normalizeTagCategory(category);
    if (!normalizedCategory) {
      return createEmptyCategoryPreferences();
    }

    const source = isPlainObject(rawCategoryPreferences) ? rawCategoryPreferences : {};
    const custom = [];
    const seenCustomValues = new Set();
    const seenCustomLabels = new Set();
    const rawCustom = Array.isArray(source.custom) ? source.custom : [];

    rawCustom.forEach((entry) => {
      if (!isPlainObject(entry)) return;
      const labelInfo = validateCustomLabel(entry.label);
      if (!labelInfo.ok) return;

      const rawValue = normalizeCustomTagValue(entry.value, normalizedCategory);
      const value = rawValue || buildCustomTagValueFromNormalizedLabel(
        normalizedCategory,
        labelInfo.normalizedLabel
      );
      if (!value) return;
      if (seenCustomValues.has(value) || seenCustomLabels.has(labelInfo.normalizedLabel)) return;
      seenCustomValues.add(value);
      seenCustomLabels.add(labelInfo.normalizedLabel);
      custom.push({
        value,
        label: labelInfo.label,
      });
    });

    const hiddenDefaults = [];
    const hiddenDefaultSet = new Set();
    const rawHiddenDefaults = Array.isArray(source.hiddenDefaults) ? source.hiddenDefaults : [];
    rawHiddenDefaults.forEach((rawValue) => {
      const value = normalizeDefaultTagValue(normalizedCategory, rawValue);
      if (!value || hiddenDefaultSet.has(value)) return;
      hiddenDefaultSet.add(value);
      hiddenDefaults.push(value);
    });

    const knownCustomValues = new Set(custom.map((entry) => entry.value));
    const order = [];
    const seenOrder = new Set();
    const rawOrder = Array.isArray(source.order) ? source.order : [];
    rawOrder.forEach((rawValue) => {
      const defaultValue = normalizeDefaultTagValue(normalizedCategory, rawValue);
      if (defaultValue) {
        if (hiddenDefaultSet.has(defaultValue) || seenOrder.has(defaultValue)) return;
        seenOrder.add(defaultValue);
        order.push(defaultValue);
        return;
      }

      const customValue = normalizeCustomTagValue(rawValue, normalizedCategory);
      if (!customValue || !knownCustomValues.has(customValue) || seenOrder.has(customValue)) return;
      seenOrder.add(customValue);
      order.push(customValue);
    });

    return {
      custom,
      hiddenDefaults,
      order,
    };
  }

  function normalizeSnapshotTagPreferences(rawPreferences) {
    const source = isPlainObject(rawPreferences) ? rawPreferences : {};
    const normalized = createEmptySnapshotTagPreferences();

    TAG_KEYS.forEach((category) => {
      normalized[category] = normalizeCategoryPreferences(source[category], category);
    });

    return normalized;
  }

  // =============================================================================
  // Catalog resolution
  // =============================================================================
  function getSeededDefaultCategoryValues(category, getDefaultLabel) {
    const normalizedCategory = normalizeTagCategory(category);
    const options = getDefaultOptionsForCategory(normalizedCategory);
    if (normalizedCategory !== 'language') {
      return options.map((option) => option.value);
    }
    return options
      .map((option) => ({
        value: option.value,
        label: resolveDefaultOptionLabel(option, getDefaultLabel),
      }))
      .sort(compareByLabel)
      .map((option) => option.value);
  }

  function resolveCategoryCatalog(category, rawPreferences, { getDefaultLabel } = {}) {
    const normalizedCategory = normalizeTagCategory(category);
    const preferences = normalizeSnapshotTagPreferences(rawPreferences);
    const categoryPreferences = preferences[normalizedCategory];
    const hiddenDefaults = new Set(categoryPreferences.hiddenDefaults);
    const defaultOptions = getDefaultOptionsForCategory(normalizedCategory).map((option) => ({
      value: option.value,
      labelKey: option.labelKey,
      label: resolveDefaultOptionLabel(option, getDefaultLabel),
      origin: 'default',
      hidden: hiddenDefaults.has(option.value),
    }));
    const customOptions = categoryPreferences.custom.map((option) => ({
      value: option.value,
      label: option.label,
      origin: 'custom',
      hidden: false,
    }));

    const visibleByValue = new Map();
    defaultOptions.forEach((option) => {
      if (!option.hidden) {
        visibleByValue.set(option.value, option);
      }
    });
    customOptions.forEach((option) => {
      visibleByValue.set(option.value, option);
    });

    const visibleDefaultValues = getSeededDefaultCategoryValues(normalizedCategory, getDefaultLabel)
      .filter((value) => visibleByValue.has(value));
    const customValues = customOptions.map((option) => option.value);
    const seededVisibleValues = [...visibleDefaultValues];
    customValues.forEach((value) => {
      if (!seededVisibleValues.includes(value) && visibleByValue.has(value)) {
        seededVisibleValues.push(value);
      }
    });

    const visibleOrder = categoryPreferences.order.length
      ? categoryPreferences.order
        .filter((value) => visibleByValue.has(value))
        .concat(seededVisibleValues.filter((value) => !categoryPreferences.order.includes(value)))
      : seededVisibleValues;

    const visibleOptions = visibleOrder
      .map((value) => visibleByValue.get(value) || null)
      .filter(Boolean)
      .map((option) => ({
        value: option.value,
        label: option.label,
        labelKey: option.labelKey || '',
        origin: option.origin,
      }));

    return {
      category: normalizedCategory,
      preferences: categoryPreferences,
      defaultOptions: defaultOptions.map((option) => ({
        value: option.value,
        label: option.label,
        labelKey: option.labelKey,
        origin: option.origin,
        hidden: option.hidden,
      })),
      customOptions: customOptions.map((option) => ({
        value: option.value,
        label: option.label,
        origin: option.origin,
      })),
      hiddenDefaultValues: categoryPreferences.hiddenDefaults.slice(),
      visibleOptions,
      visibleValueSet: new Set(visibleOptions.map((option) => option.value)),
    };
  }

  function resolveEditableCatalog(rawPreferences, { getDefaultLabel } = {}) {
    const preferences = normalizeSnapshotTagPreferences(rawPreferences);
    const catalog = {};
    TAG_KEYS.forEach((category) => {
      catalog[category] = resolveCategoryCatalog(category, preferences, { getDefaultLabel });
    });
    return catalog;
  }

  function normalizeTagsAgainstCatalog(rawTags, rawPreferences, { getDefaultLabel } = {}) {
    const normalizedTags = normalizeTags(rawTags);
    if (!normalizedTags) return null;
    const catalog = resolveEditableCatalog(rawPreferences, { getDefaultLabel });
    const nextTags = {};

    TAG_KEYS.forEach((category) => {
      const value = normalizedTags[category];
      if (!value) return;
      if (catalog[category].visibleValueSet.has(value)) {
        nextTags[category] = value;
      }
    });

    return Object.keys(nextTags).length ? nextTags : null;
  }

  function findKnownOptionByNormalizedLabel(category, rawPreferences, normalizedLabel, { getDefaultLabel } = {}) {
    if (!normalizedLabel) return null;
    const resolvedCategory = resolveCategoryCatalog(category, rawPreferences, { getDefaultLabel });
    const allOptions = resolvedCategory.defaultOptions.concat(resolvedCategory.customOptions);
    return allOptions.find((option) => normalizeLabelForComparison(option.label) === normalizedLabel) || null;
  }

  function resolveTagLabel(category, value, rawPreferences, { getDefaultLabel } = {}) {
    const normalizedCategory = normalizeTagCategory(category);
    const defaultOption = getDefaultOptionByValue(normalizedCategory, value);
    if (defaultOption) {
      return resolveDefaultOptionLabel(defaultOption, getDefaultLabel) || value;
    }

    const preferences = normalizeSnapshotTagPreferences(rawPreferences);
    const customOption = preferences[normalizedCategory].custom.find((option) => option.value === value);
    if (customOption) {
      return customOption.label;
    }

    const fallbackCustomLabel = decodeCustomTagValueToLabel(value);
    return fallbackCustomLabel || normalizeOptionalString(value);
  }

  // =============================================================================
  // Editable-preferences mutations
  // =============================================================================
  function cloneCategoryPreferences(categoryPreferences) {
    return {
      custom: categoryPreferences.custom.map((entry) => ({ ...entry })),
      hiddenDefaults: categoryPreferences.hiddenDefaults.slice(),
      order: categoryPreferences.order.slice(),
    };
  }

  function getVisibleOptionValues(resolvedCategory) {
    return resolvedCategory.visibleOptions.map((option) => option.value);
  }

  function cloneSnapshotTagPreferences(rawPreferences) {
    const preferences = normalizeSnapshotTagPreferences(rawPreferences);
    return {
      language: cloneCategoryPreferences(preferences.language),
      type: cloneCategoryPreferences(preferences.type),
      difficulty: cloneCategoryPreferences(preferences.difficulty),
    };
  }

  function createCustomTag(rawPreferences, category, rawLabel, { getDefaultLabel } = {}) {
    const normalizedCategory = normalizeTagCategory(category);
    const labelInfo = validateCustomLabel(rawLabel);
    if (!normalizedCategory) {
      return { ok: false, code: 'invalid_category', preferences: normalizeSnapshotTagPreferences(rawPreferences) };
    }
    if (!labelInfo.ok) {
      return {
        ok: false,
        code: labelInfo.code,
        label: labelInfo.label,
        normalizedLabel: labelInfo.normalizedLabel,
        preferences: normalizeSnapshotTagPreferences(rawPreferences),
      };
    }

    const existingOption = findKnownOptionByNormalizedLabel(
      normalizedCategory,
      rawPreferences,
      labelInfo.normalizedLabel,
      { getDefaultLabel }
    );
    if (existingOption) {
      return {
        ok: false,
        code: 'duplicate',
        existingOption,
        label: labelInfo.label,
        normalizedLabel: labelInfo.normalizedLabel,
        preferences: normalizeSnapshotTagPreferences(rawPreferences),
      };
    }

    const value = buildCustomTagValueFromNormalizedLabel(normalizedCategory, labelInfo.normalizedLabel);
    const preferences = cloneSnapshotTagPreferences(rawPreferences);
    const resolvedCategory = resolveCategoryCatalog(normalizedCategory, preferences, { getDefaultLabel });
    preferences[normalizedCategory].custom.push({
      value,
      label: labelInfo.label,
    });
    preferences[normalizedCategory].order = getVisibleOptionValues(resolvedCategory).concat(value);

    return {
      ok: true,
      code: '',
      preferences: normalizeSnapshotTagPreferences(preferences),
      createdTag: {
        category: normalizedCategory,
        value,
        label: labelInfo.label,
        origin: 'custom',
      },
    };
  }

  function hideDefaultTag(rawPreferences, category, value, { getDefaultLabel } = {}) {
    const normalizedCategory = normalizeTagCategory(category);
    const normalizedValue = normalizeDefaultTagValue(normalizedCategory, value);
    const preferences = cloneSnapshotTagPreferences(rawPreferences);
    if (!normalizedCategory || !normalizedValue) {
      return { ok: false, code: 'invalid_default', preferences: normalizeSnapshotTagPreferences(preferences) };
    }

    if (preferences[normalizedCategory].hiddenDefaults.includes(normalizedValue)) {
      return { ok: true, code: 'noop', preferences: normalizeSnapshotTagPreferences(preferences) };
    }

    const resolvedCategory = resolveCategoryCatalog(normalizedCategory, preferences, { getDefaultLabel });
    preferences[normalizedCategory].hiddenDefaults.push(normalizedValue);
    preferences[normalizedCategory].order = getVisibleOptionValues(resolvedCategory)
      .filter((candidate) => candidate !== normalizedValue);

    return {
      ok: true,
      code: '',
      preferences: normalizeSnapshotTagPreferences(preferences),
    };
  }

  function restoreHiddenDefaultTags(rawPreferences, category, { getDefaultLabel } = {}) {
    const normalizedCategory = normalizeTagCategory(category);
    const preferences = cloneSnapshotTagPreferences(rawPreferences);
    if (!normalizedCategory) {
      return { ok: false, code: 'invalid_category', preferences: normalizeSnapshotTagPreferences(preferences) };
    }

    const hiddenDefaults = preferences[normalizedCategory].hiddenDefaults.slice();
    if (!hiddenDefaults.length) {
      return { ok: true, code: 'noop', preferences: normalizeSnapshotTagPreferences(preferences), restoredValues: [] };
    }

    const seededDefaultValues = getSeededDefaultCategoryValues(normalizedCategory, getDefaultLabel);
    const restoredValues = seededDefaultValues.filter((value) => hiddenDefaults.includes(value));
    const resolvedCategory = resolveCategoryCatalog(normalizedCategory, preferences, { getDefaultLabel });

    preferences[normalizedCategory].hiddenDefaults = [];
    preferences[normalizedCategory].order = getVisibleOptionValues(resolvedCategory).concat(restoredValues);

    return {
      ok: true,
      code: '',
      preferences: normalizeSnapshotTagPreferences(preferences),
      restoredValues,
    };
  }

  function deleteCustomTag(rawPreferences, category, value, { getDefaultLabel } = {}) {
    const normalizedCategory = normalizeTagCategory(category);
    const normalizedValue = normalizeCustomTagValue(value, normalizedCategory);
    const preferences = cloneSnapshotTagPreferences(rawPreferences);
    if (!normalizedCategory || !normalizedValue) {
      return { ok: false, code: 'invalid_custom', preferences: normalizeSnapshotTagPreferences(preferences) };
    }

    const nextCustom = preferences[normalizedCategory].custom
      .filter((entry) => entry.value !== normalizedValue);
    if (nextCustom.length === preferences[normalizedCategory].custom.length) {
      return { ok: true, code: 'noop', preferences: normalizeSnapshotTagPreferences(preferences) };
    }

    const resolvedCategory = resolveCategoryCatalog(normalizedCategory, preferences, { getDefaultLabel });
    preferences[normalizedCategory].custom = nextCustom;
    preferences[normalizedCategory].order = getVisibleOptionValues(resolvedCategory)
      .filter((candidate) => candidate !== normalizedValue);

    return {
      ok: true,
      code: '',
      preferences: normalizeSnapshotTagPreferences(preferences),
    };
  }

  function moveVisibleTagValue(rawPreferences, category, value, direction, { getDefaultLabel } = {}) {
    const normalizedCategory = normalizeTagCategory(category);
    const normalizedValue = normalizeTagValue(normalizedCategory, value);
    const preferences = cloneSnapshotTagPreferences(rawPreferences);
    if (!normalizedCategory || !normalizedValue || (direction !== 'up' && direction !== 'down')) {
      return { ok: false, code: 'invalid_move', preferences: normalizeSnapshotTagPreferences(preferences) };
    }

    const resolvedCategory = resolveCategoryCatalog(normalizedCategory, preferences, { getDefaultLabel });
    const currentOrder = getVisibleOptionValues(resolvedCategory);
    if (!currentOrder.includes(normalizedValue)) {
      return { ok: false, code: 'missing_value', preferences: normalizeSnapshotTagPreferences(preferences) };
    }

    preferences[normalizedCategory].order = moveArrayValue(currentOrder, normalizedValue, direction);
    return {
      ok: true,
      code: '',
      preferences: normalizeSnapshotTagPreferences(preferences),
    };
  }

  function sortVisibleTagValuesAlphabetically(rawPreferences, category, { getDefaultLabel } = {}) {
    const normalizedCategory = normalizeTagCategory(category);
    const preferences = cloneSnapshotTagPreferences(rawPreferences);
    if (!normalizedCategory) {
      return { ok: false, code: 'invalid_category', preferences: normalizeSnapshotTagPreferences(preferences) };
    }

    const resolvedCategory = resolveCategoryCatalog(normalizedCategory, preferences, { getDefaultLabel });
    preferences[normalizedCategory].order = resolvedCategory.visibleOptions
      .slice()
      .sort(compareByLabel)
      .map((option) => option.value);

    return {
      ok: true,
      code: '',
      preferences: normalizeSnapshotTagPreferences(preferences),
    };
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================
  return {
    TAG_KEYS,
    LANGUAGE_OPTIONS,
    TYPE_OPTIONS,
    DIFFICULTY_OPTIONS,
    CATEGORY_OPTIONS,
    CUSTOM_TAG_PREFIX,
    MAX_CUSTOM_LABEL_LENGTH,
    isPlainObject,
    normalizeTagCategory,
    normalizeLabelForComparison,
    normalizeLanguageTag,
    normalizeTypeTag,
    normalizeDifficultyTag,
    normalizeTagValue,
    normalizeTags,
    normalizeCustomTagValue,
    validateCustomLabel,
    buildCustomTagValue,
    decodeCustomTagValueToLabel,
    getDefaultOptionsForCategory,
    getSeededDefaultCategoryValues,
    createEmptySnapshotTagPreferences,
    normalizeSnapshotTagPreferences,
    resolveCategoryCatalog,
    resolveEditableCatalog,
    normalizeTagsAgainstCatalog,
    resolveTagLabel,
    findKnownOptionByNormalizedLabel,
    createCustomTag,
    hideDefaultTag,
    restoreHiddenDefaultTags,
    deleteCustomTag,
    moveVisibleTagValue,
    sortVisibleTagValuesAlphabetically,
  };
});

// =============================================================================
// End of public/js/lib/snapshot_tag_catalog.js
// =============================================================================
