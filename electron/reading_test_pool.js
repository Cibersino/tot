'use strict';

// =============================================================================
// Overview
// =============================================================================
// Reading-test pool helpers.
// Responsibilities:
// - Resolve and ensure the dedicated runtime pool folder under snapshots.
// - Track pool usage + bundled starter hashes in an external state file.
// - Synchronize bundled starter files at startup using bundled content hashes.
// - Scan pool files and return validated metadata for filtering and selection.
// =============================================================================

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Log = require('./log');
const {
  getCurrentTextSnapshotsDir,
  ensureCurrentTextSnapshotsDir,
  getReadingTestPoolStateFile,
  loadJson,
  saveJson,
} = require('./fs_storage');
const snapshotTagCatalog = require('../public/js/lib/snapshot_tag_catalog');
const readingTestQuestionsCore = require('../public/js/lib/reading_test_questions_core');

const log = Log.get('reading-test-pool');
log.debug('Reading test pool starting...');

const POOL_DIR_NAME = 'reading_speed_test_pool';
const BUNDLED_POOL_SOURCE_DIR = path.join(__dirname, 'reading_test_pool');
const POOL_STATE_FALLBACK = Object.freeze({ entries: {} });
const DESCRIPTIVE_TAG_KEYS = Object.freeze(['language', 'type', 'difficulty']);

function safeRealpath(targetPath) {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    return null;
  }
}

function getCanonicalPath(targetPath) {
  return safeRealpath(targetPath) || path.resolve(targetPath);
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

function normalizeSnapshotRelPath(raw) {
  const source = typeof raw === 'string' ? raw.trim() : '';
  if (!source) return '';
  const normalizedSlashes = source.replace(/\\/g, '/');
  const withoutLeading = normalizedSlashes.startsWith('/')
    ? normalizedSlashes.slice(1)
    : normalizedSlashes;
  const segments = withoutLeading.split('/').filter(Boolean);
  if (!segments.length) return '';
  if (segments.some((segment) => segment === '.' || segment === '..')) return '';
  const rel = `/${segments.join('/')}`;
  if (!rel.toLowerCase().endsWith('.json')) return '';
  return rel;
}

function isPathInsideRoot(rootPath, candidatePath) {
  if (!rootPath || !candidatePath) return false;
  const rel = path.relative(rootPath, candidatePath);
  if (rel === '') return true;
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

function toSnapshotRelPath(rootPath, filePath) {
  const rootCanonical = getCanonicalPath(rootPath);
  const fileCanonical = getCanonicalPath(filePath);
  if (!isPathInsideRoot(rootCanonical, fileCanonical)) return '';
  return normalizeSnapshotRelPath(
    `/${path.relative(rootCanonical, fileCanonical).split(path.sep).join('/')}`
  );
}

function buildPoolSnapshotRelPath(relativePathWithinPool) {
  const source = typeof relativePathWithinPool === 'string'
    ? relativePathWithinPool.trim().replace(/\\/g, '/')
    : '';
  if (!source) return '';
  const withoutLeading = source.startsWith('/') ? source.slice(1) : source;
  const segments = withoutLeading.split('/').filter(Boolean);
  if (!segments.length || segments.some((segment) => segment === '.' || segment === '..')) return '';
  return normalizeSnapshotRelPath(`/${POOL_DIR_NAME}/${segments.join('/')}`);
}

function isPoolSnapshotRelPath(snapshotRelPath) {
  const normalizedPath = normalizeSnapshotRelPath(snapshotRelPath);
  return normalizedPath.startsWith(`/${POOL_DIR_NAME}/`);
}

function resolveRuntimePathFromSnapshotRelPath(snapshotsRootPath, snapshotRelPath) {
  const normalizedPath = normalizeSnapshotRelPath(snapshotRelPath);
  if (!snapshotsRootPath || !normalizedPath) return '';
  const resolvedPath = path.resolve(path.join(snapshotsRootPath, normalizedPath.slice(1)));
  return isPathInsideRoot(path.resolve(snapshotsRootPath), resolvedPath)
    ? resolvedPath
    : '';
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

function getExistingFileKind(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return 'missing';
  try {
    const stats = fs.statSync(filePath);
    if (stats.isFile()) return 'file';
    return 'other';
  } catch {
    return 'missing';
  }
}

function canonicalizeJsonValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeJsonValue(item));
  }
  if (snapshotTagCatalog.isPlainObject(value)) {
    const normalized = {};
    for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) {
      normalized[key] = canonicalizeJsonValue(value[key]);
    }
    return normalized;
  }
  return value;
}

function computeJsonContentHash(data) {
  const canonicalText = JSON.stringify(canonicalizeJsonValue(data));
  const digest = crypto.createHash('sha256').update(canonicalText).digest('hex');
  return `sha256:${digest}`;
}

function normalizePoolStateEntry(rawEntry) {
  const source = rawEntry && typeof rawEntry === 'object' && !Array.isArray(rawEntry)
    ? rawEntry
    : {};
  const entry = {
    used: source.used === true,
  };
  const managedBundledHash = typeof source.managedBundledHash === 'string'
    ? source.managedBundledHash.trim()
    : '';
  if (managedBundledHash) {
    entry.managedBundledHash = managedBundledHash;
  }
  return entry;
}

function normalizePoolState(rawState) {
  const source = rawState && typeof rawState === 'object' && !Array.isArray(rawState)
    ? rawState
    : {};
  const rawEntries = source.entries && typeof source.entries === 'object' && !Array.isArray(source.entries)
    ? source.entries
    : {};
  const entries = {};

  for (const [snapshotRelPath, rawEntry] of Object.entries(rawEntries)) {
    const normalizedPath = normalizeSnapshotRelPath(snapshotRelPath);
    if (!normalizedPath) continue;
    entries[normalizedPath] = normalizePoolStateEntry(rawEntry);
  }

  return { entries };
}

function loadPoolState({ stateFilePath } = {}) {
  const targetStateFile = typeof stateFilePath === 'string' && stateFilePath.trim()
    ? path.resolve(stateFilePath)
    : path.resolve(getReadingTestPoolStateFile());
  const rawState = loadJson(targetStateFile, POOL_STATE_FALLBACK);
  return normalizePoolState(rawState);
}

function savePoolState(state, { stateFilePath } = {}) {
  const targetStateFile = typeof stateFilePath === 'string' && stateFilePath.trim()
    ? path.resolve(stateFilePath)
    : path.resolve(getReadingTestPoolStateFile());
  saveJson(targetStateFile, normalizePoolState(state));
}

function updatePoolStateEntry(snapshotRelPath, updater, options = {}) {
  const normalizedPath = normalizeSnapshotRelPath(snapshotRelPath);
  if (!normalizedPath || typeof updater !== 'function') {
    return { ok: false, code: 'INVALID_STATE_UPDATE' };
  }

  const state = loadPoolState(options);
  const currentEntry = normalizePoolStateEntry(state.entries[normalizedPath]);
  const nextEntry = updater({ ...currentEntry });
  if (!nextEntry || typeof nextEntry !== 'object' || Array.isArray(nextEntry)) {
    return { ok: false, code: 'INVALID_STATE_ENTRY' };
  }

  state.entries[normalizedPath] = normalizePoolStateEntry(nextEntry);
  savePoolState(state, options);
  return {
    ok: true,
    state,
    entry: state.entries[normalizedPath],
  };
}

function markPoolEntryUsed(snapshotRelPath, nextValue, options = {}) {
  return updatePoolStateEntry(snapshotRelPath, (entry) => ({
    ...entry,
    used: nextValue === true,
  }), options);
}

function clearImportedPoolEntriesState(snapshotRelPaths, options = {}) {
  const normalizedPaths = Array.isArray(snapshotRelPaths)
    ? snapshotRelPaths.map((value) => normalizeSnapshotRelPath(value)).filter(Boolean)
    : [];
  if (!normalizedPaths.length) {
    return { ok: true, updated: 0 };
  }

  const state = loadPoolState(options);
  let updated = 0;

  for (const snapshotRelPath of normalizedPaths) {
    state.entries[snapshotRelPath] = {
      used: false,
    };
    updated += 1;
  }

  savePoolState(state, options);
  return { ok: true, updated };
}

function sanitizePoolTags(rawTags) {
  if (rawTags == null) {
    return { ok: true, tags: {} };
  }
  if (!snapshotTagCatalog.isPlainObject(rawTags)) {
    return { ok: false, code: 'INVALID_TAGS_SHAPE' };
  }

  const rawKeys = Object.keys(rawTags);
  if (rawKeys.some((key) => !DESCRIPTIVE_TAG_KEYS.includes(key))) {
    return { ok: false, code: 'UNSUPPORTED_TAG_KEY' };
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

  return { ok: true, tags: normalizedTags };
}

function sanitizePoolData(rawData) {
  if (!rawData || typeof rawData !== 'object' || typeof rawData.text !== 'string' || !rawData.text.length) {
    return { ok: false, code: 'INVALID_TEXT' };
  }

  const tagsInfo = sanitizePoolTags(rawData.tags);
  if (!tagsInfo.ok) return tagsInfo;

  const hasReadingTestPayload = Object.prototype.hasOwnProperty.call(rawData, 'readingTest');
  let questions = [];
  const normalizedData = {
    text: rawData.text,
  };

  if (Object.keys(tagsInfo.tags).length > 0) {
    normalizedData.tags = tagsInfo.tags;
  }

  if (hasReadingTestPayload) {
    const questionsInfo = readingTestQuestionsCore.validateQuestionsPayload(rawData.readingTest);
    if (!questionsInfo.ok) return { ok: false, code: questionsInfo.code };
    questions = questionsInfo.questions;
    normalizedData.readingTest = {
      questions,
    };
  }

  return {
    ok: true,
    data: normalizedData,
    hasValidQuestions: questions.length > 0,
    questions,
  };
}

function parsePoolFile(filePath, rootPath, stateEntry) {
  const fileCanonical = getCanonicalPath(filePath);
  const rootCanonical = getCanonicalPath(rootPath);
  if (!isPathInsideRoot(rootCanonical, fileCanonical)) {
    return { ok: false, code: 'OUTSIDE_ROOT' };
  }

  const jsonInfo = loadJsonFileStrict(fileCanonical);
  if (!jsonInfo.ok) return jsonInfo;
  const dataInfo = sanitizePoolData(jsonInfo.data);
  if (!dataInfo.ok) return dataInfo;

  return {
    ok: true,
    entry: {
      absolutePath: fileCanonical,
      snapshotRelPath: toSnapshotRelPath(rootCanonical, fileCanonical),
      fileName: path.basename(fileCanonical),
      text: dataInfo.data.text,
      tags: dataInfo.data.tags ? { ...dataInfo.data.tags } : {},
      used: !!(stateEntry && stateEntry.used === true),
      hasValidQuestions: dataInfo.hasValidQuestions,
      questions: dataInfo.questions,
      rawData: dataInfo.data,
    },
  };
}

function resolvePoolContext(options = {}) {
  const snapshotsRootDir = typeof options.snapshotsRootDir === 'string' && options.snapshotsRootDir.trim()
    ? path.resolve(options.snapshotsRootDir)
    : path.resolve(getCurrentTextSnapshotsDir());
  const poolDir = typeof options.poolDir === 'string' && options.poolDir.trim()
    ? path.resolve(options.poolDir)
    : path.resolve(path.join(snapshotsRootDir, POOL_DIR_NAME));
  const bundledSourceDir = typeof options.bundledSourceDir === 'string' && options.bundledSourceDir.trim()
    ? path.resolve(options.bundledSourceDir)
    : path.resolve(BUNDLED_POOL_SOURCE_DIR);
  const stateFilePath = typeof options.stateFilePath === 'string' && options.stateFilePath.trim()
    ? path.resolve(options.stateFilePath)
    : path.resolve(getReadingTestPoolStateFile());

  try {
    fs.mkdirSync(snapshotsRootDir, { recursive: true });
    fs.mkdirSync(poolDir, { recursive: true });
  } catch (err) {
    log.error('Failed to ensure reading-test pool context directories:', { snapshotsRootDir, poolDir }, err);
  }

  return {
    snapshotsRootDir,
    snapshotsRootCanonical: getCanonicalPath(snapshotsRootDir),
    poolDir,
    bundledSourceDir,
    stateFilePath,
  };
}

function prunePoolStateEntries(state, {
  snapshotsRootCanonical,
  currentBundledSnapshotRelPaths,
} = {}) {
  const bundledPaths = currentBundledSnapshotRelPaths instanceof Set
    ? currentBundledSnapshotRelPaths
    : new Set();
  let prunedStateEntries = 0;
  let removedManagedFiles = 0;
  let failed = 0;

  for (const snapshotRelPath of Object.keys(state.entries)) {
    if (!isPoolSnapshotRelPath(snapshotRelPath)) {
      delete state.entries[snapshotRelPath];
      prunedStateEntries += 1;
      continue;
    }

    const stateEntry = normalizePoolStateEntry(state.entries[snapshotRelPath]);
    const runtimePath = resolveRuntimePathFromSnapshotRelPath(snapshotsRootCanonical, snapshotRelPath);
    const runtimeKind = getExistingFileKind(runtimePath);
    const isManaged = !!stateEntry.managedBundledHash;
    const isBundledNow = bundledPaths.has(snapshotRelPath);

    if (isManaged && !isBundledNow) {
      if (runtimeKind === 'file') {
        try {
          fs.unlinkSync(runtimePath);
          removedManagedFiles += 1;
        } catch (err) {
          failed += 1;
          log.warn('Reading-test bundled prune failed to remove retired managed file (ignored):', runtimePath, err);
          continue;
        }
      }
      delete state.entries[snapshotRelPath];
      prunedStateEntries += 1;
      continue;
    }

    if (runtimeKind !== 'file') {
      delete state.entries[snapshotRelPath];
      prunedStateEntries += 1;
    }
  }

  return {
    prunedStateEntries,
    removedManagedFiles,
    failed,
  };
}

function synchronizeBundledPoolContent(options = {}) {
  const context = resolvePoolContext(options);
  const {
    snapshotsRootCanonical,
    poolDir,
    bundledSourceDir,
    stateFilePath,
  } = context;

  if (!fs.existsSync(bundledSourceDir)) {
    log.warnOnce(
      'reading_test_pool.seed.source_missing',
      'Reading-test bundled source dir missing; pool sync skipped (ignored):',
      bundledSourceDir
    );
    return {
      ok: true,
      copied: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
    };
  }

  const state = loadPoolState({ stateFilePath });
  const currentBundledSnapshotRelPaths = new Set();
  let copied = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const sourcePath of listJsonFilesRecursive(bundledSourceDir)) {
    const relativeWithinBundle = path.relative(bundledSourceDir, sourcePath);
    const destinationPath = path.join(poolDir, relativeWithinBundle);
    const snapshotRelPath = toSnapshotRelPath(snapshotsRootCanonical, destinationPath);
    if (!snapshotRelPath) {
      failed += 1;
      log.warn('Reading-test bundled sync skipped path outside snapshots root (ignored):', {
        sourcePath,
        destinationPath,
      });
      continue;
    }
    currentBundledSnapshotRelPaths.add(snapshotRelPath);

    const hashInfo = loadJsonFileStrict(sourcePath);
    if (!hashInfo.ok) {
      failed += 1;
      log.warn('Reading-test bundled sync skipped unreadable source file (ignored):', sourcePath, hashInfo.code);
      continue;
    }
    const bundledContentHash = computeJsonContentHash(hashInfo.data);
    const existingStateEntry = normalizePoolStateEntry(state.entries[snapshotRelPath]);

    try {
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      if (!fs.existsSync(destinationPath)) {
        fs.copyFileSync(sourcePath, destinationPath);
        state.entries[snapshotRelPath] = {
          used: false,
          managedBundledHash: bundledContentHash,
        };
        copied += 1;
        continue;
      }

      if (existingStateEntry.managedBundledHash) {
        if (existingStateEntry.managedBundledHash !== bundledContentHash) {
          fs.copyFileSync(sourcePath, destinationPath);
          state.entries[snapshotRelPath] = {
            used: false,
            managedBundledHash: bundledContentHash,
          };
          updated += 1;
        } else {
          skipped += 1;
        }
        continue;
      }

      skipped += 1;
    } catch (err) {
      failed += 1;
      log.warn('Reading-test bundled sync failed (ignored):', { sourcePath, destinationPath }, err);
    }
  }

  const pruneInfo = prunePoolStateEntries(state, {
    snapshotsRootCanonical,
    currentBundledSnapshotRelPaths,
  });
  failed += pruneInfo.failed;

  savePoolState(state, { stateFilePath });
  return {
    ok: true,
    copied,
    updated,
    skipped,
    prunedStateEntries: pruneInfo.prunedStateEntries,
    removedManagedFiles: pruneInfo.removedManagedFiles,
    failed,
  };
}

function listPoolEntries(options = {}) {
  const context = resolvePoolContext(options);
  const {
    snapshotsRootCanonical,
    poolDir,
    stateFilePath,
  } = context;

  const state = loadPoolState({ stateFilePath });
  const entries = [];
  for (const filePath of listJsonFilesRecursive(poolDir)) {
    const fileSnapshotRelPath = toSnapshotRelPath(snapshotsRootCanonical, filePath);
    const stateEntry = fileSnapshotRelPath ? state.entries[fileSnapshotRelPath] : null;
    const fileInfo = parsePoolFile(filePath, snapshotsRootCanonical, stateEntry);
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
    tags: { ...(entry.tags || {}) },
    used: !!(entry && entry.used === true),
  };
}

function findEntryBySnapshotRelPath(entries, snapshotRelPath) {
  const normalizedPath = normalizeSnapshotRelPath(snapshotRelPath);
  return (Array.isArray(entries) ? entries : []).find((entry) => entry.snapshotRelPath === normalizedPath) || null;
}

function resetPoolUsageState(options = {}) {
  const state = loadPoolState(options);
  let updated = 0;
  for (const snapshotRelPath of Object.keys(state.entries)) {
    if (state.entries[snapshotRelPath].used === true) {
      updated += 1;
    }
    state.entries[snapshotRelPath] = {
      ...state.entries[snapshotRelPath],
      used: false,
    };
  }
  savePoolState(state, options);
  return {
    ok: true,
    updated,
    failed: 0,
  };
}

module.exports = {
  POOL_DIR_NAME,
  BUNDLED_POOL_SOURCE_DIR,
  ensurePoolDir,
  normalizeSnapshotRelPath,
  buildPoolSnapshotRelPath,
  loadPoolState,
  savePoolState,
  synchronizeBundledPoolContent,
  listPoolEntries,
  serializePoolEntryMeta,
  sanitizePoolData,
  findEntryBySnapshotRelPath,
  markPoolEntryUsed,
  clearImportedPoolEntriesState,
  resetPoolUsageState,
  computeJsonContentHash,
};

// =============================================================================
// End of electron/reading_test_pool.js
// =============================================================================
