// electron/current_text_snapshot_schema.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Canonical current-text snapshot schema shared by normal snapshot and reading-test-pool flows.
// Responsibilities:
// - Define the persisted snapshot fields and their canonical values.
// - Normalize tags and precise-count locales through their shared owners.
// - Validate optional metrics against the exact reading-duration calculation.
// - Return normalized snapshot data and reading-test questions without I/O.

// =============================================================================
// Imports (shared schema collaborators)
// =============================================================================

const snapshotTagCatalog = require('../public/js/lib/snapshot_tag_catalog');
const readingTestQuestionsCore = require('../public/js/lib/reading_test_questions_core');
const readingDurationCore = require('../public/js/lib/reading_duration_core');
const {
  PRESET_WPM_MIN,
  PRESET_WPM_MAX,
  SNAPSHOT_NAME_MAX_CHARS,
  SNAPSHOT_SOURCE_COMMENT_MAX_CHARS,
} = require('./constants_main');

// =============================================================================
// Schema contract and dependency checks
// =============================================================================

const readingDurationUtils = readingDurationCore.createReadingDurationUtils();

const SNAPSHOT_TYPE = 'text snapshot';
const SNAPSHOT_SAVED_WITH = 'toT (totapp.org)';
const SNAPSHOT_REQUIRED_KEYS = Object.freeze(['type', 'meta', 'text', 'tags']);
const SNAPSHOT_OPTIONAL_KEYS = Object.freeze([
  'name',
  'sourceComment',
  'metrics',
  'readingTest',
]);
const SNAPSHOT_META_KEYS = Object.freeze(['savedAt', 'savedWith']);
const SNAPSHOT_TAG_KEYS = Object.freeze(['language', 'type', 'difficulty']);
const SNAPSHOT_METRICS_SIMPLE_COUNT_KEYS = Object.freeze(['words', 'mode']);
const SNAPSHOT_METRICS_PRECISE_COUNT_KEYS = Object.freeze(['words', 'mode', 'locale']);
const SNAPSHOT_METRICS_READING_KEYS = Object.freeze(['estimatedSeconds', 'wpm']);

if (!snapshotTagCatalog
  || typeof snapshotTagCatalog.isPlainObject !== 'function'
  || typeof snapshotTagCatalog.normalizeLanguageTag !== 'function'
  || typeof snapshotTagCatalog.normalizeTypeTag !== 'function'
  || typeof snapshotTagCatalog.normalizeDifficultyTag !== 'function') {
  throw new Error('[current_text_snapshot_schema] SnapshotTagCatalog unavailable; cannot continue');
}

if (!readingTestQuestionsCore
  || typeof readingTestQuestionsCore.validateQuestionsPayload !== 'function') {
  throw new Error('[current_text_snapshot_schema] ReadingTestQuestionsCore unavailable; cannot continue');
}

// =============================================================================
// Schema validation helpers
// =============================================================================

function hasExactKeys(value, expectedKeys) {
  if (!snapshotTagCatalog.isPlainObject(value)) return false;
  const actualKeys = Object.keys(value);
  return actualKeys.length === expectedKeys.length
    && expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

function hasCanonicalSnapshotKeys(value) {
  if (!snapshotTagCatalog.isPlainObject(value)) return false;
  const actualKeys = Object.keys(value);
  return SNAPSHOT_REQUIRED_KEYS.every((key) => Object.prototype.hasOwnProperty.call(value, key))
    && actualKeys.every((key) => SNAPSHOT_REQUIRED_KEYS.includes(key)
      || SNAPSHOT_OPTIONAL_KEYS.includes(key));
}

function isCanonicalIsoTimestamp(value) {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function validateSnapshotMeta(rawMeta) {
  if (!hasExactKeys(rawMeta, SNAPSHOT_META_KEYS)) {
    return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot metadata invalid' };
  }
  if (!isCanonicalIsoTimestamp(rawMeta.savedAt)) {
    return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot savedAt invalid' };
  }
  if (rawMeta.savedWith !== SNAPSHOT_SAVED_WITH) {
    return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot savedWith invalid' };
  }
  return {
    ok: true,
    meta: {
      savedAt: rawMeta.savedAt,
      savedWith: SNAPSHOT_SAVED_WITH,
    },
  };
}

function validateSnapshotTags(rawTags) {
  if (!snapshotTagCatalog.isPlainObject(rawTags)) {
    return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot tags must be an object' };
  }

  const rawKeys = Object.keys(rawTags);
  if (rawKeys.some((key) => !SNAPSHOT_TAG_KEYS.includes(key))) {
    return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot tags contain unsupported keys' };
  }

  const tags = {};
  if (Object.prototype.hasOwnProperty.call(rawTags, 'language')) {
    const language = snapshotTagCatalog.normalizeLanguageTag(rawTags.language);
    if (!language) {
      return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot language tag invalid' };
    }
    tags.language = language;
  }

  if (Object.prototype.hasOwnProperty.call(rawTags, 'type')) {
    const type = snapshotTagCatalog.normalizeTypeTag(rawTags.type);
    if (!type) {
      return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot type tag invalid' };
    }
    tags.type = type;
  }

  if (Object.prototype.hasOwnProperty.call(rawTags, 'difficulty')) {
    const difficulty = snapshotTagCatalog.normalizeDifficultyTag(rawTags.difficulty);
    if (!difficulty) {
      return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot difficulty tag invalid' };
    }
    tags.difficulty = difficulty;
  }

  return { ok: true, tags };
}

function validateOptionalSnapshotText(value, maxChars, fieldName) {
  if (typeof value !== 'string'
    || !value.trim()
    || value.length > maxChars
    || /[\r\n]/.test(value)) {
    return { ok: false, code: 'INVALID_SCHEMA', message: `snapshot ${fieldName} invalid` };
  }
  return { ok: true, value };
}

function validateSnapshotName(value) {
  return validateOptionalSnapshotText(value, SNAPSHOT_NAME_MAX_CHARS, 'name');
}

function validateSnapshotSourceComment(value) {
  return validateOptionalSnapshotText(
    value,
    SNAPSHOT_SOURCE_COMMENT_MAX_CHARS,
    'source comment'
  );
}

function normalizeSnapshotPreciseCountLocale(value) {
  const rawLocale = typeof value === 'string' ? value.trim() : '';
  if (!rawLocale || typeof Intl === 'undefined' || typeof Intl.getCanonicalLocales !== 'function') {
    return '';
  }

  try {
    const locales = Intl.getCanonicalLocales(rawLocale);
    return locales.length ? locales[0] : '';
  } catch {
    return '';
  }
}

function getExpectedEstimatedSeconds(words, wpm) {
  const estimatedSeconds = readingDurationUtils.getEstimatedReadingSeconds(words, wpm);
  return Number.isSafeInteger(estimatedSeconds) ? estimatedSeconds : null;
}

function validateSnapshotMetrics(rawMetrics) {
  if (!snapshotTagCatalog.isPlainObject(rawMetrics)) {
    return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot metrics must be an object' };
  }

  const metricKeys = Object.keys(rawMetrics);
  const hasCount = Object.prototype.hasOwnProperty.call(rawMetrics, 'count');
  const hasReading = Object.prototype.hasOwnProperty.call(rawMetrics, 'reading');
  if (!hasCount
    || metricKeys.some((key) => key !== 'count' && key !== 'reading')) {
    return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot metrics invalid' };
  }

  const count = rawMetrics.count;
  if (!snapshotTagCatalog.isPlainObject(count)
    || !Number.isSafeInteger(count.words)
    || count.words < 0
    || (count.mode !== 'simple' && count.mode !== 'preciso')) {
    return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot count metrics invalid' };
  }

  let normalizedCount = null;
  if (count.mode === 'simple') {
    if (!hasExactKeys(count, SNAPSHOT_METRICS_SIMPLE_COUNT_KEYS)) {
      return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot count metrics invalid' };
    }
    normalizedCount = {
      words: count.words,
      mode: 'simple',
    };
  } else {
    if (!hasExactKeys(count, SNAPSHOT_METRICS_PRECISE_COUNT_KEYS)) {
      return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot count metrics invalid' };
    }
    const locale = normalizeSnapshotPreciseCountLocale(count.locale);
    if (!locale) {
      return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot count metrics invalid' };
    }
    normalizedCount = {
      words: count.words,
      mode: 'preciso',
      locale,
    };
  }

  const metrics = { count: normalizedCount };

  if (!hasReading) return { ok: true, metrics };

  if (!hasExactKeys(rawMetrics.reading, SNAPSHOT_METRICS_READING_KEYS)) {
    return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot reading metrics invalid' };
  }

  const reading = rawMetrics.reading;
  const expectedEstimatedSeconds = getExpectedEstimatedSeconds(count.words, reading.wpm);
  if (!Number.isSafeInteger(reading.wpm)
    || reading.wpm < PRESET_WPM_MIN
    || reading.wpm > PRESET_WPM_MAX
    || !Number.isSafeInteger(reading.estimatedSeconds)
    || reading.estimatedSeconds < 0
    || expectedEstimatedSeconds === null
    || reading.estimatedSeconds !== expectedEstimatedSeconds) {
    return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot reading metrics invalid' };
  }

  metrics.reading = {
    estimatedSeconds: reading.estimatedSeconds,
    wpm: reading.wpm,
  };
  return { ok: true, metrics };
}

// =============================================================================
// Snapshot document validation
// =============================================================================

function validateSnapshotDocument(rawSnapshot) {
  if (!hasCanonicalSnapshotKeys(rawSnapshot)
    || rawSnapshot.type !== SNAPSHOT_TYPE
    || typeof rawSnapshot.text !== 'string') {
    return { ok: false, code: 'INVALID_SCHEMA', message: 'invalid snapshot schema' };
  }

  const metaInfo = validateSnapshotMeta(rawSnapshot.meta);
  if (!metaInfo.ok) return metaInfo;

  const tagsInfo = validateSnapshotTags(rawSnapshot.tags);
  if (!tagsInfo.ok) return tagsInfo;

  const snapshot = {
    type: SNAPSHOT_TYPE,
    meta: metaInfo.meta,
    text: rawSnapshot.text,
    tags: tagsInfo.tags,
  };
  if (Object.prototype.hasOwnProperty.call(rawSnapshot, 'name')) {
    const nameInfo = validateSnapshotName(rawSnapshot.name);
    if (!nameInfo.ok) return nameInfo;
    snapshot.name = nameInfo.value;
  }
  if (Object.prototype.hasOwnProperty.call(rawSnapshot, 'sourceComment')) {
    const sourceCommentInfo = validateSnapshotSourceComment(rawSnapshot.sourceComment);
    if (!sourceCommentInfo.ok) return sourceCommentInfo;
    snapshot.sourceComment = sourceCommentInfo.value;
  }
  if (Object.prototype.hasOwnProperty.call(rawSnapshot, 'metrics')) {
    const metricsInfo = validateSnapshotMetrics(rawSnapshot.metrics);
    if (!metricsInfo.ok) return metricsInfo;
    snapshot.metrics = metricsInfo.metrics;
  }
  let questions = [];

  if (Object.prototype.hasOwnProperty.call(rawSnapshot, 'readingTest')) {
    const questionsInfo = readingTestQuestionsCore.validateQuestionsPayload(rawSnapshot.readingTest);
    if (!questionsInfo.ok) {
      return { ok: false, code: 'INVALID_SCHEMA', message: 'snapshot readingTest invalid' };
    }
    questions = questionsInfo.questions;
    snapshot.readingTest = { questions };
  }

  return {
    ok: true,
    snapshot,
    questions,
  };
}

// =============================================================================
// Module exports
// =============================================================================

module.exports = {
  SNAPSHOT_TYPE,
  SNAPSHOT_SAVED_WITH,
  normalizeSnapshotPreciseCountLocale,
  validateSnapshotName,
  validateSnapshotSourceComment,
  validateSnapshotTags,
  validateSnapshotDocument,
};

// =============================================================================
// End of electron/current_text_snapshot_schema.js
// =============================================================================
