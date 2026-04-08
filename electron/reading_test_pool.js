'use strict';

// =============================================================================
// Overview
// =============================================================================
// Reading-test pool helpers.
// Responsibilities:
// - Resolve and ensure the dedicated pool folder under snapshots.
// - Seed bundled pool files into the writable config tree when missing.
// - Scan pool files and return validated metadata for filtering and selection.
// - Rewrite inline tags.testUsed state for selected/reset pool files.
// =============================================================================

const fs = require('fs');
const path = require('path');
const Log = require('./log');
const {
  getCurrentTextSnapshotsDir,
  ensureCurrentTextSnapshotsDir,
} = require('./fs_storage');
const snapshotTagCatalog = require('../public/js/lib/snapshot_tag_catalog');
const readingTestQuestionsCore = require('../public/js/lib/reading_test_questions_core');

const log = Log.get('reading-test-pool');
log.debug('Reading test pool starting...');

// This folder name is the current implementation assumption for the issue's
// still-open naming decision. Keeping it centralized here limits future drift.
const POOL_DIR_NAME = 'reading_speed_test_pool';
const BUNDLED_POOL_SOURCE_DIR = path.join(__dirname, 'reading_test_pool');

function safeRealpath(targetPath) {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    return null;
  }
}

function ensurePoolDir() {
  ensureCurrentTextSnapshotsDir();
  const poolDir = path.join(getCurrentTextSnapshotsDir(), POOL_DIR_NAME);
  try {
    if (!fs.existsSync(poolDir)) {
      fs.mkdirSync(poolDir, { recursive: true });
    }
  } catch (err) {
    log.error('ensurePoolDir failed:', poolDir, err);
  }
  return poolDir;
}

function getSnapshotsRootReal() {
  ensureCurrentTextSnapshotsDir();
  return safeRealpath(getCurrentTextSnapshotsDir());
}

function isPathInsideRoot(rootReal, candidatePath) {
  if (!rootReal || !candidatePath) return false;
  const rel = path.relative(rootReal, candidatePath);
  if (rel === '') return true;
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

function toSnapshotRelPath(rootReal, fileReal) {
  if (!rootReal || !fileReal || !isPathInsideRoot(rootReal, fileReal)) return '';
  return `/${path.relative(rootReal, fileReal).split(path.sep).join('/')}`;
}

function listJsonFilesRecursive(startDir) {
  const results = [];
  if (!startDir || !fs.existsSync(startDir)) return results;

  const stack = [startDir];
  while (stack.length > 0) {
    const currentDir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (err) {
      log.warn('Reading-test pool directory scan failed (ignored):', currentDir, err);
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && fullPath.toLowerCase().endsWith('.json')) {
        results.push(fullPath);
      }
    }
  }

  return results.sort((a, b) => a.localeCompare(b));
}

function loadJsonFileStrict(filePath) {
  let raw = '';
  try {
    raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  } catch (err) {
    return { ok: false, code: 'READ_FAILED', error: err };
  }

  if (!raw.trim()) {
    return { ok: false, code: 'EMPTY_FILE' };
  }

  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, code: 'INVALID_JSON', error: err };
  }
}

function sanitizePoolTags(rawTags) {
  if (!snapshotTagCatalog.isPlainObject(rawTags)) {
    return { ok: false, code: 'INVALID_TAGS_SHAPE' };
  }

  const normalizedTags = {};

  if (Object.prototype.hasOwnProperty.call(rawTags, 'language')) {
    const language = snapshotTagCatalog.normalizeLanguageTag(rawTags.language);
    if (!language) return { ok: false, code: 'INVALID_LANGUAGE_TAG' };
    normalizedTags.language = language;
  }

  if (Object.prototype.hasOwnProperty.call(rawTags, 'type')) {
    const type = snapshotTagCatalog.normalizeTypeTag(rawTags.type);
    if (!type) return { ok: false, code: 'INVALID_TYPE_TAG' };
    normalizedTags.type = type;
  }

  if (Object.prototype.hasOwnProperty.call(rawTags, 'difficulty')) {
    const difficulty = snapshotTagCatalog.normalizeDifficultyTag(rawTags.difficulty);
    if (!difficulty) return { ok: false, code: 'INVALID_DIFFICULTY_TAG' };
    normalizedTags.difficulty = difficulty;
  }

  const testUsed = snapshotTagCatalog.normalizeTestUsedTag(rawTags.testUsed);
  if (testUsed === null) {
    return { ok: false, code: 'INVALID_TEST_USED_TAG' };
  }
  normalizedTags.testUsed = testUsed;

  return { ok: true, tags: normalizedTags };
}

function sanitizePoolData(rawData) {
  if (!rawData || typeof rawData !== 'object' || typeof rawData.text !== 'string' || !rawData.text.length) {
    return { ok: false, code: 'INVALID_TEXT' };
  }

  const tagsInfo = sanitizePoolTags(rawData.tags);
  if (!tagsInfo.ok) return tagsInfo;

  const questionsInfo = readingTestQuestionsCore.validateQuestionsPayload(rawData.readingTest);
  const hasValidQuestions = !!questionsInfo.ok;
  const normalizedData = {
    text: rawData.text,
    tags: tagsInfo.tags,
  };

  if (hasValidQuestions) {
    normalizedData.readingTest = {
      questions: questionsInfo.questions,
    };
  }

  return {
    ok: true,
    data: normalizedData,
    hasValidQuestions,
    questions: hasValidQuestions ? questionsInfo.questions : [],
  };
}

function parsePoolFile(filePath, rootReal) {
  const fileReal = safeRealpath(filePath);
  if (!fileReal) return { ok: false, code: 'REALPATH_FAILED' };
  if (!isPathInsideRoot(rootReal, fileReal)) {
    return { ok: false, code: 'OUTSIDE_ROOT' };
  }

  const jsonInfo = loadJsonFileStrict(fileReal);
  if (!jsonInfo.ok) return jsonInfo;
  const data = jsonInfo.data;

  const dataInfo = sanitizePoolData(data);
  if (!dataInfo.ok) return dataInfo;

  return {
    ok: true,
    entry: {
      absolutePath: fileReal,
      snapshotRelPath: toSnapshotRelPath(rootReal, fileReal),
      fileName: path.basename(fileReal),
      text: dataInfo.data.text,
      tags: dataInfo.data.tags,
      hasValidQuestions: dataInfo.hasValidQuestions,
      questions: dataInfo.questions,
      rawData: dataInfo.data,
    },
  };
}

function copyBundledPoolIfMissing() {
  const poolDir = ensurePoolDir();

  if (!fs.existsSync(BUNDLED_POOL_SOURCE_DIR)) {
    log.warnOnce(
      'reading_test_pool.seed.source_missing',
      'Reading-test bundled source dir missing; pool seeding skipped (ignored):',
      BUNDLED_POOL_SOURCE_DIR
    );
    return;
  }

  for (const sourcePath of listJsonFilesRecursive(BUNDLED_POOL_SOURCE_DIR)) {
    const rel = path.relative(BUNDLED_POOL_SOURCE_DIR, sourcePath);
    const destPath = path.join(poolDir, rel);
    if (fs.existsSync(destPath)) continue;
    try {
      fs.mkdirSync(path.dirname(destPath), { recursive: true });
      fs.copyFileSync(sourcePath, destPath);
    } catch (err) {
      log.warn('Reading-test bundled pool copy failed (ignored):', { sourcePath, destPath }, err);
    }
  }
}

function listPoolEntries() {
  copyBundledPoolIfMissing();
  const poolDir = ensurePoolDir();
  const rootReal = getSnapshotsRootReal();
  if (!rootReal) {
    return { ok: false, code: 'SNAPSHOTS_ROOT_UNAVAILABLE', entries: [] };
  }

  const entries = [];
  for (const filePath of listJsonFilesRecursive(poolDir)) {
    const fileInfo = parsePoolFile(filePath, rootReal);
    if (!fileInfo.ok) {
      log.warn('Ignoring invalid reading-test pool file (ignored):', filePath, fileInfo.code);
      continue;
    }
    entries.push(fileInfo.entry);
  }

  return { ok: true, entries };
}

function serializePoolEntryMeta(entry) {
  return {
    snapshotRelPath: entry.snapshotRelPath,
    fileName: entry.fileName,
    hasValidQuestions: !!entry.hasValidQuestions,
    tags: { ...entry.tags },
  };
}

function findEntryBySnapshotRelPath(entries, snapshotRelPath) {
  const normalizedPath = typeof snapshotRelPath === 'string' ? snapshotRelPath.trim() : '';
  return (Array.isArray(entries) ? entries : []).find((entry) => entry.snapshotRelPath === normalizedPath) || null;
}

function rewritePoolEntryTestUsed(entry, nextValue) {
  const safeValue = nextValue === true;
  if (!entry || !entry.absolutePath) {
    return { ok: false, code: 'INVALID_ENTRY' };
  }

  const jsonInfo = loadJsonFileStrict(entry.absolutePath);
  if (!jsonInfo.ok) return jsonInfo;
  const data = jsonInfo.data;
  if (!snapshotTagCatalog.isPlainObject(data.tags)) {
    return { ok: false, code: 'INVALID_TAGS_SHAPE' };
  }

  const tagsInfo = sanitizePoolTags({
    ...data.tags,
    testUsed: safeValue,
  });
  if (!tagsInfo.ok) return tagsInfo;

  data.tags = tagsInfo.tags;
  try {
    fs.writeFileSync(entry.absolutePath, JSON.stringify(data, null, 2), 'utf8');
    return { ok: true };
  } catch (err) {
    log.error('Reading-test pool write failed:', entry.absolutePath, err);
    return { ok: false, code: 'WRITE_FAILED' };
  }
}

function resetPoolUsageState() {
  const scanInfo = listPoolEntries();
  if (!scanInfo.ok) return scanInfo;

  let updated = 0;
  let failed = 0;
  for (const entry of scanInfo.entries) {
    const writeInfo = rewritePoolEntryTestUsed(entry, false);
    if (writeInfo.ok) {
      updated += 1;
    } else {
      failed += 1;
      log.warn('Reading-test pool reset skipped file (ignored):', entry.absolutePath, writeInfo.code);
    }
  }

  return {
    ok: true,
    updated,
    failed,
  };
}

module.exports = {
  POOL_DIR_NAME,
  BUNDLED_POOL_SOURCE_DIR,
  ensurePoolDir,
  listPoolEntries,
  serializePoolEntryMeta,
  sanitizePoolData,
  findEntryBySnapshotRelPath,
  rewritePoolEntryTestUsed,
  resetPoolUsageState,
};

// =============================================================================
// End of electron/reading_test_pool.js
// =============================================================================
