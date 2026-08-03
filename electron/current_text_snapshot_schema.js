// electron/current_text_snapshot_schema.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Canonical current-text snapshot schema shared by normal snapshot and
// reading-test-pool flows.
// =============================================================================

const snapshotTagCatalog = require('../public/js/lib/snapshot_tag_catalog');
const readingTestQuestionsCore = require('../public/js/lib/reading_test_questions_core');

const SNAPSHOT_TYPE = 'text snapshot';
const SNAPSHOT_SAVED_WITH = 'toT (totapp.org)';
const SNAPSHOT_REQUIRED_KEYS = Object.freeze(['type', 'meta', 'text', 'tags']);
const SNAPSHOT_OPTIONAL_KEYS = Object.freeze(['readingTest']);
const SNAPSHOT_META_KEYS = Object.freeze(['savedAt', 'savedWith']);
const SNAPSHOT_TAG_KEYS = Object.freeze(['language', 'type', 'difficulty']);

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

module.exports = {
  SNAPSHOT_TYPE,
  SNAPSHOT_SAVED_WITH,
  validateSnapshotTags,
  validateSnapshotDocument,
};

// =============================================================================
// End of electron/current_text_snapshot_schema.js
// =============================================================================
