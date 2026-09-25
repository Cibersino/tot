// electron/reading_test_pool.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Reading-test pool owner for bundled and runtime pool content under snapshots.
// Responsibilities:
// - Resolve and ensure the dedicated runtime pool folder under snapshots.
// - Track pool usage + current bundled-entry ownership hashes in external state.
// - Synchronize bundled starter files at startup using bundled content hashes.
// - Scan pool files and return validated metadata for filtering and selection.

// =============================================================================
// Imports / logger
// =============================================================================

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const Log = require('./log');
const {
  getCurrentTextSnapshotsDir,
  getReadingTestPoolStateFile,
  loadJson,
  saveJson,
  saveJsonStrict,
} = require('./fs_storage');
const snapshotTagCatalog = require('../public/js/lib/snapshot_tag_catalog');
const currentTextSnapshotSchema = require('./current_text_snapshot_schema');

const log = Log.get('reading-test-pool');
log.debug('Reading test pool starting...');

// =============================================================================
// Constants / config
// =============================================================================

const POOL_DIR_NAME = 'reading_speed_test_pool';
const BUNDLED_POOL_SOURCE_DIR = path.join(__dirname, 'reading_test_pool');
const SHOW_BUNDLED_ENTRIES_DEFAULT = true;
const POOL_STATE_FALLBACK = Object.freeze({
  showBundledEntries: SHOW_BUNDLED_ENTRIES_DEFAULT,
  entries: {},
});

// =============================================================================
// Helpers: paths, files, and hashing
// =============================================================================

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

function resolvePoolEntryPhysicalIdentity(filePath) {
  try {
    return {
      ok: true,
      path: fs.realpathSync.native(filePath),
    };
  } catch (err) {
    return {
      ok: false,
      code: 'CANONICALIZATION_FAILED',
      error: err,
    };
  }
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

function normalizePoolRelativePath(relativePathWithinPool) {
  const source = typeof relativePathWithinPool === 'string'
    ? relativePathWithinPool.trim().replace(/\\/g, '/')
    : '';
  if (!source) return '';
  const withoutLeading = source.startsWith('/') ? source.slice(1) : source;
  const segments = withoutLeading.split('/').filter(Boolean);
  if (!segments.length || segments.some((segment) => segment === '.' || segment === '..')) return '';
  const snapshotRelPath = buildPoolSnapshotRelPath(segments.join('/'));
  return snapshotRelPath ? segments.join('/') : '';
}

function isPoolSnapshotRelPath(snapshotRelPath) {
  const normalizedPath = normalizeSnapshotRelPath(snapshotRelPath);
  return normalizedPath.startsWith(`/${POOL_DIR_NAME}/`);
}

function listJsonFilesRecursive(startDir) {
  const results = [];
  const failedDirectories = [];
  const rootEntry = inspectPathEntry(startDir);
  if (!rootEntry.ok || !rootEntry.exists || rootEntry.kind !== 'directory') {
    return {
      ok: false,
      complete: false,
      files: results,
      failedDirectories,
      code: rootEntry.ok ? 'INVALID_DIRECTORY' : rootEntry.code,
      ...(rootEntry.error ? { error: rootEntry.error } : {}),
    };
  }

  const stack = [startDir];
  while (stack.length > 0) {
    const currentDir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch (err) {
      failedDirectories.push({ path: currentDir, error: err });
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

  return {
    ok: true,
    complete: failedDirectories.length === 0,
    files: results.sort((a, b) => a.localeCompare(b)),
    failedDirectories,
  };
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

function inspectPathEntry(filePath) {
  if (!filePath) return { ok: false, code: 'INVALID_PATH' };
  try {
    const stats = fs.lstatSync(filePath);
    if (stats.isFile()) return { ok: true, exists: true, kind: 'file' };
    if (stats.isDirectory()) return { ok: true, exists: true, kind: 'directory' };
    return { ok: true, exists: true, kind: 'other' };
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { ok: true, exists: false, kind: 'missing' };
    }
    return { ok: false, code: 'INSPECT_FAILED', error: err };
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

function loadPoolFileIdentity(filePath) {
  const jsonInfo = loadJsonFileStrict(filePath);
  if (!jsonInfo.ok) return jsonInfo;

  return {
    ok: true,
    data: jsonInfo.data,
    contentHash: computeJsonContentHash(jsonInfo.data),
  };
}

function loadValidatedPoolFile(filePath) {
  const identityInfo = loadPoolFileIdentity(filePath);
  if (!identityInfo.ok) return identityInfo;

  const dataInfo = sanitizePoolData(identityInfo.data);
  if (!dataInfo.ok) {
    return {
      ...dataInfo,
      contentHash: identityInfo.contentHash,
    };
  }

  return {
    ok: true,
    data: dataInfo.data,
    hasValidQuestions: dataInfo.hasValidQuestions,
    questions: dataInfo.questions,
    contentHash: identityInfo.contentHash,
  };
}

// =============================================================================
// Helpers: pool state persistence
// =============================================================================

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

function normalizeShowBundledEntries(rawValue) {
  return rawValue !== false;
}

function normalizePoolState(rawState) {
  const source = rawState && typeof rawState === 'object' && !Array.isArray(rawState)
    ? rawState
    : {};
  const showBundledEntries = normalizeShowBundledEntries(source.showBundledEntries);
  const rawEntries = source.entries && typeof source.entries === 'object' && !Array.isArray(source.entries)
    ? source.entries
    : {};
  const entries = {};

  for (const [snapshotRelPath, rawEntry] of Object.entries(rawEntries)) {
    const normalizedPath = normalizeSnapshotRelPath(snapshotRelPath);
    if (!normalizedPath) continue;
    entries[normalizedPath] = normalizePoolStateEntry(rawEntry);
  }

  return {
    showBundledEntries,
    entries,
  };
}

function resolvePoolStateFilePath(stateFilePath) {
  return typeof stateFilePath === 'string' && stateFilePath.trim()
    ? path.resolve(stateFilePath)
    : path.resolve(getReadingTestPoolStateFile());
}

function loadPoolState({ stateFilePath } = {}) {
  const targetStateFile = resolvePoolStateFilePath(stateFilePath);
  const rawState = loadJson(targetStateFile, POOL_STATE_FALLBACK);
  return normalizePoolState(rawState);
}

function savePoolState(state, { stateFilePath } = {}) {
  const targetStateFile = resolvePoolStateFilePath(stateFilePath);
  saveJson(targetStateFile, normalizePoolState(state));
}

function savePoolStateStrict(state, { stateFilePath } = {}) {
  const targetStateFile = resolvePoolStateFilePath(stateFilePath);
  try {
    saveJsonStrict(targetStateFile, normalizePoolState(state));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      code: 'WRITE_FAILED',
      message: String(err),
    };
  }
}

function getShowBundledEntries(options = {}) {
  return loadPoolState(options).showBundledEntries;
}

function setShowBundledEntries(nextValue, options = {}) {
  if (typeof nextValue !== 'boolean') {
    return { ok: false, code: 'INVALID_SHOW_BUNDLED_ENTRIES' };
  }

  const state = loadPoolState(options);
  state.showBundledEntries = nextValue;
  savePoolState(state, options);
  return {
    ok: true,
    showBundledEntries: state.showBundledEntries,
    state,
  };
}

function updatePoolStateEntryStrict(snapshotRelPath, updater, options = {}) {
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
  const saveInfo = savePoolStateStrict(state, options);
  if (!saveInfo.ok) {
    return saveInfo;
  }
  return {
    ok: true,
    state,
    entry: state.entries[normalizedPath],
  };
}

function markPoolEntryUsed(snapshotRelPath, nextValue, options = {}) {
  return updatePoolStateEntryStrict(snapshotRelPath, (entry) => ({
    ...entry,
    used: nextValue === true,
  }), options);
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
  const saveInfo = savePoolStateStrict(state, options);
  if (!saveInfo.ok) {
    return saveInfo;
  }
  return {
    ok: true,
    updated,
    failed: 0,
  };
}

// =============================================================================
// Helpers: pool entry validation and shaping
// =============================================================================

function sanitizePoolData(rawData) {
  const snapshotInfo = currentTextSnapshotSchema.validateSnapshotDocument(rawData);
  if (!snapshotInfo.ok) return snapshotInfo;

  if (!snapshotInfo.snapshot.text.length) {
    return { ok: false, code: 'INVALID_TEXT' };
  }

  return {
    ok: true,
    data: snapshotInfo.snapshot,
    hasValidQuestions: snapshotInfo.questions.length > 0,
    questions: snapshotInfo.questions,
  };
}

function parsePoolFile(filePath, rootPath, stateEntry) {
  let fileCanonical;
  try {
    fileCanonical = fs.realpathSync(filePath);
  } catch (err) {
    return { ok: false, code: 'CANONICALIZATION_FAILED', error: err };
  }
  const rootCanonical = getCanonicalPath(rootPath);
  if (!isPathInsideRoot(rootCanonical, fileCanonical)) {
    return { ok: false, code: 'OUTSIDE_ROOT' };
  }

  const dataInfo = loadValidatedPoolFile(fileCanonical);
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
      isBundled: !!(stateEntry && typeof stateEntry.managedBundledHash === 'string' && stateEntry.managedBundledHash),
      hasValidQuestions: dataInfo.hasValidQuestions,
      questions: dataInfo.questions,
      rawData: dataInfo.data,
    },
    contentHash: dataInfo.contentHash,
  };
}

function getPoolStateAssociation(associations, preferredSnapshotRelPath) {
  const candidates = Array.isArray(associations) ? associations : [];
  if (!candidates.length) {
    return { ok: true, association: null };
  }

  const managedCandidates = candidates.filter(({ stateEntry }) => !!stateEntry.managedBundledHash);
  if (managedCandidates.length > 1) {
    return { ok: false, code: 'AMBIGUOUS_MANAGED_STATE' };
  }

  const selected = managedCandidates[0]
    || candidates.find(({ snapshotRelPath }) => snapshotRelPath === preferredSnapshotRelPath)
    || (candidates.length === 1 ? candidates[0] : null);
  if (!selected) {
    return { ok: false, code: 'AMBIGUOUS_STATE' };
  }

  return {
    ok: true,
    association: {
      snapshotRelPath: selected.snapshotRelPath,
      stateEntry: {
        used: candidates.some(({ stateEntry }) => stateEntry.used === true),
        ...(selected.stateEntry.managedBundledHash
          ? { managedBundledHash: selected.stateEntry.managedBundledHash }
          : {}),
      },
    },
  };
}

// =============================================================================
// Pool context and startup synchronization
// =============================================================================

function resolvePoolContext(options = {}) {
  const suppliedPoolDir = typeof options.poolDir === 'string' && options.poolDir.trim()
    ? path.resolve(options.poolDir)
    : '';
  const snapshotsRootDir = typeof options.snapshotsRootDir === 'string' && options.snapshotsRootDir.trim()
    ? path.resolve(options.snapshotsRootDir)
    : (suppliedPoolDir ? path.dirname(suppliedPoolDir) : path.resolve(getCurrentTextSnapshotsDir()));
  const poolDir = path.resolve(path.join(snapshotsRootDir, POOL_DIR_NAME));
  const bundledSourceDir = typeof options.bundledSourceDir === 'string' && options.bundledSourceDir.trim()
    ? path.resolve(options.bundledSourceDir)
    : path.resolve(BUNDLED_POOL_SOURCE_DIR);
  const stateFilePath = typeof options.stateFilePath === 'string' && options.stateFilePath.trim()
    ? path.resolve(options.stateFilePath)
    : null;

  if (suppliedPoolDir && suppliedPoolDir !== poolDir) {
    return { ok: false, code: 'INVALID_POOL_CONTEXT' };
  }

  let rootEntry = inspectPathEntry(snapshotsRootDir);
  if (!rootEntry.ok) return rootEntry;
  if (rootEntry.exists && rootEntry.kind !== 'directory') {
    return { ok: false, code: 'INVALID_POOL_CONTEXT' };
  }
  if (!rootEntry.exists) {
    try {
      fs.mkdirSync(snapshotsRootDir, { recursive: true });
    } catch (err) {
      return { ok: false, code: 'POOL_CONTEXT_UNAVAILABLE', error: err };
    }
    rootEntry = inspectPathEntry(snapshotsRootDir);
  }

  if (!rootEntry.ok || rootEntry.kind !== 'directory') {
    return { ok: false, code: 'INVALID_POOL_CONTEXT' };
  }

  let poolEntry = inspectPathEntry(poolDir);
  if (!poolEntry.ok) return poolEntry;
  if (poolEntry.exists && poolEntry.kind !== 'directory') {
    return { ok: false, code: 'INVALID_POOL_CONTEXT' };
  }
  if (!poolEntry.exists) {
    try {
      fs.mkdirSync(poolDir, { recursive: true });
    } catch (err) {
      return { ok: false, code: 'POOL_CONTEXT_UNAVAILABLE', error: err };
    }
    poolEntry = inspectPathEntry(poolDir);
  }

  const rootReal = safeRealpath(snapshotsRootDir);
  const poolReal = safeRealpath(poolDir);
  const expectedPoolReal = rootReal ? path.resolve(path.join(rootReal, POOL_DIR_NAME)) : '';
  if (!rootReal
    || !rootEntry.ok
    || rootEntry.kind !== 'directory'
    || !poolEntry.ok
    || poolEntry.kind !== 'directory'
    || !poolReal
    || poolReal !== expectedPoolReal) {
    return { ok: false, code: 'INVALID_POOL_CONTEXT' };
  }

  return {
    ok: true,
    snapshotsRootDir,
    snapshotsRootCanonical: rootReal,
    poolDir,
    poolCanonical: poolReal,
    bundledSourceDir,
    stateFilePath,
  };
}

function resolvePoolDestination(context, relativePathWithinPool, { ensureParent = false } = {}) {
  if (!context || context.ok !== true) return { ok: false, code: 'INVALID_POOL_CONTEXT' };

  const normalizedRelativePath = normalizePoolRelativePath(relativePathWithinPool);
  if (!normalizedRelativePath) return { ok: false, code: 'INVALID_POOL_DESTINATION' };

  const segments = normalizedRelativePath.split('/');
  let parentPath = context.poolCanonical;
  for (const segment of segments.slice(0, -1)) {
    parentPath = path.join(parentPath, segment);
    let parentEntry = inspectPathEntry(parentPath);
    if (!parentEntry.ok) return parentEntry;
    if (!parentEntry.exists) {
      if (!ensureParent) {
        return { ok: false, code: 'MISSING_POOL_PARENT' };
      }
      try {
        fs.mkdirSync(parentPath);
      } catch (err) {
        return { ok: false, code: 'POOL_PARENT_CREATE_FAILED', error: err };
      }
      parentEntry = inspectPathEntry(parentPath);
    }
    if (!parentEntry.ok || parentEntry.kind !== 'directory') {
      return { ok: false, code: 'INVALID_POOL_PARENT', error: parentEntry.error };
    }
  }

  const destinationPath = path.resolve(path.join(context.poolCanonical, ...segments));
  if (!isPathInsideRoot(context.poolCanonical, destinationPath)) {
    return { ok: false, code: 'PATH_OUTSIDE_POOL' };
  }
  const entry = inspectPathEntry(destinationPath);
  if (!entry.ok) return entry;

  return {
    ok: true,
    destinationPath,
    relativePath: normalizedRelativePath,
    snapshotRelPath: buildPoolSnapshotRelPath(normalizedRelativePath),
    entry,
  };
}

function clearImportedPoolEntriesState(destinationNames, options = {}) {
  const context = options.context && options.context.ok === true
    ? options.context
    : resolvePoolContext(options);
  if (!context.ok) return context;

  const normalizedDestinationNames = Array.isArray(destinationNames)
    ? destinationNames.map((value) => normalizePoolRelativePath(value)).filter(Boolean)
    : [];
  if (!normalizedDestinationNames.length) {
    return { ok: true, updated: 0 };
  }

  const targetsByPhysicalIdentity = new Map();
  for (const destinationName of normalizedDestinationNames) {
    const destinationInfo = resolvePoolDestination(context, destinationName);
    if (!destinationInfo.ok) return destinationInfo;
    if (!destinationInfo.entry.exists || destinationInfo.entry.kind !== 'file') {
      return { ok: false, code: 'IMPORTED_DESTINATION_UNAVAILABLE' };
    }

    const physicalIdentity = resolvePoolEntryPhysicalIdentity(destinationInfo.destinationPath);
    if (!physicalIdentity.ok) return physicalIdentity;

    targetsByPhysicalIdentity.set(physicalIdentity.path, {
      fallbackSnapshotRelPath: destinationInfo.snapshotRelPath,
      statePaths: new Set(),
    });
  }

  const stateFilePath = context.stateFilePath || resolvePoolStateFilePath(options.stateFilePath);
  const state = loadPoolState({ stateFilePath });
  for (const snapshotRelPath of Object.keys(state.entries)) {
    if (!isPoolSnapshotRelPath(snapshotRelPath)) continue;

    const relativePath = snapshotRelPath.slice(`/${POOL_DIR_NAME}/`.length);
    const runtimeInfo = resolvePoolDestination(context, relativePath);
    if (!runtimeInfo.ok) {
      if (runtimeInfo.code === 'MISSING_POOL_PARENT') {
        continue;
      }
      return {
        ok: false,
        code: 'STATE_ASSOCIATION_UNVERIFIED',
        snapshotRelPath,
        ...(runtimeInfo.error ? { error: runtimeInfo.error } : {}),
      };
    }
    if (!runtimeInfo.entry.exists || runtimeInfo.entry.kind !== 'file') {
      continue;
    }

    const physicalIdentity = resolvePoolEntryPhysicalIdentity(runtimeInfo.destinationPath);
    if (!physicalIdentity.ok) {
      return {
        ok: false,
        code: 'STATE_ASSOCIATION_UNVERIFIED',
        snapshotRelPath,
        error: physicalIdentity.error,
      };
    }

    const target = targetsByPhysicalIdentity.get(physicalIdentity.path);
    if (target) {
      target.statePaths.add(snapshotRelPath);
    }
  }

  let updated = 0;
  for (const target of targetsByPhysicalIdentity.values()) {
    const statePaths = target.statePaths.size
      ? target.statePaths
      : new Set([target.fallbackSnapshotRelPath]);
    for (const snapshotRelPath of statePaths) {
      const hasStateEntry = Object.prototype.hasOwnProperty.call(state.entries, snapshotRelPath);
      const previousEntry = normalizePoolStateEntry(state.entries[snapshotRelPath]);
      if (!hasStateEntry || previousEntry.used !== false || previousEntry.managedBundledHash) {
        updated += 1;
      }
      state.entries[snapshotRelPath] = { used: false };
    }
  }

  const saveInfo = savePoolStateStrict(state, { stateFilePath });
  if (!saveInfo.ok) {
    return saveInfo;
  }
  return { ok: true, updated };
}

function removeManagedBundledHash(state, snapshotRelPath) {
  const stateEntry = normalizePoolStateEntry(state.entries[snapshotRelPath]);
  if (!stateEntry.managedBundledHash) return false;
  state.entries[snapshotRelPath] = { used: stateEntry.used };
  return true;
}

function inspectManagedPoolEntryOwnership(stateEntry, filePath) {
  if (!stateEntry || !stateEntry.managedBundledHash) {
    return { status: 'unmanaged', managed: false };
  }

  const identityInfo = loadPoolFileIdentity(filePath);
  if (!identityInfo.ok) {
    if (identityInfo.code === 'EMPTY_FILE' || identityInfo.code === 'INVALID_JSON') {
      return { status: 'mismatch', managed: false, identityInfo };
    }
    return { status: 'unverified', managed: false, identityInfo };
  }

  return identityInfo.contentHash === stateEntry.managedBundledHash
    ? { status: 'verified', managed: true, identityInfo }
    : { status: 'mismatch', managed: false, identityInfo };
}

function reconcilePoolEntryOwnership(state, snapshotRelPath, runtimeInfo) {
  const hasStateEntry = Object.prototype.hasOwnProperty.call(state.entries, snapshotRelPath);
  const stateEntry = normalizePoolStateEntry(state.entries[snapshotRelPath]);

  if (!runtimeInfo.ok) {
    if (runtimeInfo.code === 'MISSING_POOL_PARENT') {
      if (hasStateEntry) {
        delete state.entries[snapshotRelPath];
      }
      return {
        changed: hasStateEntry,
        removedStateEntry: hasStateEntry,
        managed: false,
        status: 'missing',
      };
    }
    return {
      changed: false,
      removedStateEntry: false,
      managed: false,
      status: stateEntry.managedBundledHash ? 'unverified' : 'unavailable',
      runtimeInfo,
    };
  }

  if (!runtimeInfo.entry.exists || runtimeInfo.entry.kind !== 'file') {
    if (hasStateEntry) {
      delete state.entries[snapshotRelPath];
    }
    return {
      changed: hasStateEntry,
      removedStateEntry: hasStateEntry,
      managed: false,
      status: 'missing',
    };
  }

  const ownershipInfo = inspectManagedPoolEntryOwnership(stateEntry, runtimeInfo.destinationPath);
  if (ownershipInfo.status === 'unmanaged' || ownershipInfo.status === 'verified') {
    return {
      changed: false,
      removedStateEntry: false,
      managed: ownershipInfo.managed,
      status: ownershipInfo.status,
      ownershipInfo,
    };
  }
  if (ownershipInfo.status === 'unverified') {
    return {
      changed: false,
      removedStateEntry: false,
      managed: false,
      status: 'unverified',
      ownershipInfo,
    };
  }
  if (ownershipInfo.status === 'mismatch') {
    removeManagedBundledHash(state, snapshotRelPath);
    return {
      changed: true,
      removedStateEntry: false,
      managed: false,
      status: 'mismatch',
      ownershipInfo,
    };
  }

  return {
    changed: false,
    removedStateEntry: false,
    managed: false,
    status: 'unavailable',
    ownershipInfo,
  };
}

function writePoolJsonEntry(context, relativePathWithinPool, payload, { replace = false } = {}) {
  const destinationInfo = resolvePoolDestination(context, relativePathWithinPool, { ensureParent: true });
  if (!destinationInfo.ok) return destinationInfo;

  const { destinationPath, entry } = destinationInfo;
  if (entry.exists && entry.kind !== 'file') {
    return { ok: false, code: 'INVALID_DESTINATION_ENTRY' };
  }
  if (entry.exists && !replace) {
    return { ok: false, code: 'DESTINATION_EXISTS' };
  }

  try {
    fs.writeFileSync(destinationPath, JSON.stringify(payload, null, 2), {
      encoding: 'utf8',
      ...(entry.exists ? {} : { flag: 'wx' }),
    });
    return { ok: true, created: !entry.exists, destinationPath };
  } catch (err) {
    if (!entry.exists && err && err.code === 'EEXIST') {
      return { ok: false, code: 'DESTINATION_EXISTS' };
    }
    return { ok: false, code: 'WRITE_FAILED', error: err };
  }
}

function prunePoolStateEntries(state, {
  context,
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

    const relativePath = snapshotRelPath.slice(`/${POOL_DIR_NAME}/`.length);
    const runtimeInfo = resolvePoolDestination(context, relativePath);
    const ownershipReconciliation = reconcilePoolEntryOwnership(state, snapshotRelPath, runtimeInfo);
    if (ownershipReconciliation.removedStateEntry) {
      prunedStateEntries += 1;
    }
    if (ownershipReconciliation.status === 'unverified') {
      failed += 1;
      log.error(
        'Reading-test bundled prune could not verify managed entry ownership; retained entry:',
        snapshotRelPath,
        ownershipReconciliation.ownershipInfo.identityInfo.code
      );
      continue;
    }
    if (!runtimeInfo.ok) {
      if (runtimeInfo.code !== 'MISSING_POOL_PARENT') {
        failed += 1;
        log.warn('Reading-test bundled prune skipped unavailable state destination:', snapshotRelPath, runtimeInfo.code);
      }
      continue;
    }
    const isManaged = ownershipReconciliation.managed;
    const isBundledNow = bundledPaths.has(snapshotRelPath);

    if (isManaged && !isBundledNow) {
      if (runtimeInfo.entry.kind === 'file') {
        try {
          fs.unlinkSync(runtimeInfo.destinationPath);
          removedManagedFiles += 1;
        } catch (err) {
          failed += 1;
          log.warn('Reading-test bundled prune failed to remove retired managed file (ignored):', runtimeInfo.destinationPath, err);
          continue;
        }
      }
      delete state.entries[snapshotRelPath];
      prunedStateEntries += 1;
      continue;
    }

    if (!runtimeInfo.entry.exists || runtimeInfo.entry.kind !== 'file') {
      if (!ownershipReconciliation.changed) {
        delete state.entries[snapshotRelPath];
        prunedStateEntries += 1;
      }
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
  if (!context.ok) {
    if (context.error) {
      log.error('Reading-test bundled sync failed to resolve the pool context:', context.code, context.error);
    } else {
      log.error('Reading-test bundled sync failed to resolve the pool context:', context.code);
    }
    return {
      ok: false,
      code: context.code,
      copied: 0,
      updated: 0,
      skipped: 0,
      failed: 1,
    };
  }
  const {
    bundledSourceDir,
    stateFilePath: suppliedStateFilePath,
  } = context;
  const stateFilePath = suppliedStateFilePath || resolvePoolStateFilePath();

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

  const sourceInventory = listJsonFilesRecursive(bundledSourceDir);
  if (!sourceInventory.ok) {
    failed += 1;
    log.error(
      'Reading-test bundled sync could not enumerate the bundled source directory; retired-entry pruning skipped:',
      bundledSourceDir,
      sourceInventory.code,
      sourceInventory.error
    );
  } else if (!sourceInventory.complete) {
    failed += 1;
    log.error(
      'Reading-test bundled sync source inventory incomplete; retired-entry pruning skipped:',
      sourceInventory.failedDirectories
    );
  }

  for (const sourcePath of sourceInventory.files) {
    const relativeWithinBundle = path.relative(bundledSourceDir, sourcePath);
    const relativePath = normalizePoolRelativePath(relativeWithinBundle);
    if (!relativePath) {
      failed += 1;
      log.warn('Reading-test bundled sync skipped invalid bundled destination path:', sourcePath);
      continue;
    }
    const snapshotRelPath = buildPoolSnapshotRelPath(relativePath);
    currentBundledSnapshotRelPaths.add(snapshotRelPath);

    const preflightDestinationInfo = resolvePoolDestination(context, relativePath);
    const ownershipReconciliation = reconcilePoolEntryOwnership(
      state,
      snapshotRelPath,
      preflightDestinationInfo
    );

    const sourceInfo = loadValidatedPoolFile(sourcePath);
    if (!sourceInfo.ok) {
      if (ownershipReconciliation.status === 'unverified') {
        log.error(
          'Reading-test bundled sync could not verify runtime entry ownership:',
          sourcePath,
          ownershipReconciliation.ownershipInfo.identityInfo.code
        );
      }
      if (!preflightDestinationInfo.ok && preflightDestinationInfo.code !== 'MISSING_POOL_PARENT') {
        log.warn(
          'Reading-test bundled sync could not verify runtime entry ownership:',
          sourcePath,
          preflightDestinationInfo.code
        );
      }
      failed += 1;
      log.warn('Reading-test bundled sync skipped invalid source file (ignored):', sourcePath, sourceInfo.code);
      continue;
    }
    const bundledContentHash = sourceInfo.contentHash;
    const existingStateEntry = normalizePoolStateEntry(state.entries[snapshotRelPath]);
    const destinationInfo = resolvePoolDestination(context, relativePath, { ensureParent: true });
    if (!destinationInfo.ok) {
      failed += 1;
      log.warn('Reading-test bundled sync skipped invalid destination:', sourcePath, destinationInfo.code);
      continue;
    }

    if (!destinationInfo.entry.exists) {
      delete state.entries[snapshotRelPath];
      try {
        fs.copyFileSync(sourcePath, destinationInfo.destinationPath, fs.constants.COPYFILE_EXCL);
        state.entries[snapshotRelPath] = {
          used: false,
          managedBundledHash: bundledContentHash,
        };
        copied += 1;
      } catch (err) {
        if (err && err.code === 'EEXIST') {
          skipped += 1;
        } else {
          failed += 1;
          log.warn('Reading-test bundled sync failed:', { sourcePath, destinationPath: destinationInfo.destinationPath }, err);
        }
      }
      continue;
    }

    if (destinationInfo.entry.kind !== 'file') {
      removeManagedBundledHash(state, snapshotRelPath);
      failed += 1;
      log.warn('Reading-test bundled sync skipped non-file destination:', destinationInfo.destinationPath);
      continue;
    }

    const destinationOwnership = reconcilePoolEntryOwnership(
      state,
      snapshotRelPath,
      destinationInfo
    );
    if (destinationOwnership.status === 'unverified') {
      failed += 1;
      log.error(
        'Reading-test bundled sync could not verify runtime entry ownership:',
        sourcePath,
        destinationOwnership.ownershipInfo.identityInfo.code
      );
      continue;
    }

    if (!destinationOwnership.managed) {
      skipped += 1;
      continue;
    }

    if (existingStateEntry.managedBundledHash === bundledContentHash) {
      skipped += 1;
      continue;
    }

    try {
      fs.copyFileSync(sourcePath, destinationInfo.destinationPath);
      state.entries[snapshotRelPath] = {
        used: false,
        managedBundledHash: bundledContentHash,
      };
      updated += 1;
    } catch (err) {
      failed += 1;
      log.warn('Reading-test bundled sync failed:', { sourcePath, destinationPath: destinationInfo.destinationPath }, err);
    }
  }

  let pruneInfo = {
    prunedStateEntries: 0,
    removedManagedFiles: 0,
    failed: 0,
  };
  if (sourceInventory.ok && sourceInventory.complete) {
    pruneInfo = prunePoolStateEntries(state, {
      context,
      currentBundledSnapshotRelPaths,
    });
    failed += pruneInfo.failed;
  }

  const saveInfo = savePoolStateStrict(state, { stateFilePath });
  if (!saveInfo.ok) {
    log.error('Reading-test bundled sync failed to persist pool state:', saveInfo);
    failed += 1;
  }
  return {
    ok: saveInfo.ok && sourceInventory.ok && sourceInventory.complete,
    ...(!saveInfo.ok
      ? { code: saveInfo.code }
      : (!sourceInventory.ok || !sourceInventory.complete ? { code: 'BUNDLED_SOURCE_SCAN_FAILED' } : {})),
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
  if (!context.ok) {
    if (context.error) {
      log.error('Reading-test pool listing failed to resolve the pool context:', context.code, context.error);
    } else {
      log.error('Reading-test pool listing failed to resolve the pool context:', context.code);
    }
    return { ok: false, code: context.code };
  }
  const {
    snapshotsRootCanonical,
    poolCanonical,
    stateFilePath: suppliedStateFilePath,
  } = context;
  const stateFilePath = suppliedStateFilePath || resolvePoolStateFilePath();

  const state = loadPoolState({ stateFilePath });
  const entries = [];
  const stateEntriesByPhysicalIdentity = new Map();
  let stateChanged = false;

  for (const snapshotRelPath of Object.keys(state.entries)) {
    const originalStateEntry = normalizePoolStateEntry(state.entries[snapshotRelPath]);
    if (!isPoolSnapshotRelPath(snapshotRelPath)) continue;

    const relativePath = snapshotRelPath.slice(`/${POOL_DIR_NAME}/`.length);
    const runtimeInfo = resolvePoolDestination(context, relativePath);

    if (originalStateEntry.managedBundledHash) {
      const ownershipReconciliation = reconcilePoolEntryOwnership(state, snapshotRelPath, runtimeInfo);
      if (ownershipReconciliation.changed) {
        stateChanged = true;
      }
      if (ownershipReconciliation.status === 'unverified') {
        log.warn(
          'Reading-test pool listing could not verify managed entry ownership:',
          snapshotRelPath,
          ownershipReconciliation.ownershipInfo.identityInfo.code
        );
        continue;
      }
      if (!runtimeInfo.ok && runtimeInfo.code !== 'MISSING_POOL_PARENT') {
        log.warn('Reading-test pool listing could not verify managed entry ownership:', snapshotRelPath, runtimeInfo.code);
      }
    }

    if (!Object.prototype.hasOwnProperty.call(state.entries, snapshotRelPath)
      || !runtimeInfo.ok
      || !runtimeInfo.entry.exists
      || runtimeInfo.entry.kind !== 'file') {
      continue;
    }

    const physicalIdentity = resolvePoolEntryPhysicalIdentity(runtimeInfo.destinationPath);
    if (!physicalIdentity.ok) {
      log.warn(
        'Reading-test pool listing could not establish state-entry physical identity:',
        snapshotRelPath,
        physicalIdentity.error
      );
      continue;
    }

    const associations = stateEntriesByPhysicalIdentity.get(physicalIdentity.path) || [];
    associations.push({
      snapshotRelPath,
      stateEntry: normalizePoolStateEntry(state.entries[snapshotRelPath]),
    });
    stateEntriesByPhysicalIdentity.set(physicalIdentity.path, associations);
  }

  const poolInventory = listJsonFilesRecursive(poolCanonical);
  if (!poolInventory.ok) {
    log.error(
      'Reading-test pool listing failed to enumerate the pool directory:',
      poolCanonical,
      poolInventory.code,
      poolInventory.error
    );
  } else if (!poolInventory.complete) {
    log.error(
      'Reading-test pool listing inventory incomplete:',
      poolInventory.failedDirectories
    );
  }

  for (const filePath of poolInventory.files) {
    const fileSnapshotRelPath = toSnapshotRelPath(snapshotsRootCanonical, filePath);
    const physicalIdentity = resolvePoolEntryPhysicalIdentity(filePath);
    if (!physicalIdentity.ok) {
      log.warn(
        'Reading-test pool listing could not establish inventory-entry physical identity:',
        filePath,
        physicalIdentity.error
      );
    }
    const associationInfo = getPoolStateAssociation(
      physicalIdentity.ok ? stateEntriesByPhysicalIdentity.get(physicalIdentity.path) : null,
      fileSnapshotRelPath
    );
    if (!associationInfo.ok) {
      log.warn(
        'Reading-test pool listing found ambiguous state entries for one physical file:',
        filePath,
        associationInfo.code
      );
    }
    const stateAssociation = associationInfo.ok ? associationInfo.association : null;
    const stateSnapshotRelPath = stateAssociation
      ? stateAssociation.snapshotRelPath
      : fileSnapshotRelPath;
    const stateEntry = stateAssociation
      ? stateAssociation.stateEntry
      : (fileSnapshotRelPath ? state.entries[fileSnapshotRelPath] : null);
    const fileInfo = parsePoolFile(filePath, snapshotsRootCanonical, stateEntry);
    if (!fileInfo.ok) {
      if (stateSnapshotRelPath
        && stateEntry
        && stateEntry.managedBundledHash
        && fileInfo.contentHash
        && fileInfo.contentHash !== stateEntry.managedBundledHash
        && removeManagedBundledHash(state, stateSnapshotRelPath)) {
        stateChanged = true;
      }
      if (fileInfo.code === 'CANONICALIZATION_FAILED') {
        log.warn(
          'Reading-test pool file excluded because canonical identity could not be established:',
          filePath,
          fileInfo.error
        );
      } else {
        log.warn('Reading-test pool file excluded from the current listing:', filePath, fileInfo.code);
      }
      continue;
    }
    if (stateAssociation) {
      fileInfo.entry.snapshotRelPath = stateAssociation.snapshotRelPath;
    }
    if (stateSnapshotRelPath
      && stateEntry
      && stateEntry.managedBundledHash
      && fileInfo.contentHash !== stateEntry.managedBundledHash) {
      removeManagedBundledHash(state, stateSnapshotRelPath);
      fileInfo.entry.isBundled = false;
      stateChanged = true;
    }
    entries.push(fileInfo.entry);
  }

  if (stateChanged) {
    const saveInfo = savePoolStateStrict(state, { stateFilePath });
    if (!saveInfo.ok) {
      log.error('Reading-test pool listing failed to persist ownership reconciliation:', saveInfo);
      return { ok: false, code: saveInfo.code };
    }
  }

  if (!poolInventory.ok || !poolInventory.complete) {
    return { ok: false, code: 'POOL_SCAN_FAILED' };
  }

  return { ok: true, entries };
}

// =============================================================================
// Exports / module surface
// =============================================================================

function serializePoolEntryMeta(entry) {
  return {
    snapshotRelPath: entry.snapshotRelPath,
    fileName: entry.fileName,
    hasValidQuestions: !!entry.hasValidQuestions,
    tags: { ...(entry.tags || {}) },
    used: !!(entry && entry.used === true),
  };
}

function isBundledPoolEntry(entry) {
  return !!(entry && entry.isBundled === true);
}

function getVisiblePoolEntries(entries, showBundledEntries) {
  const list = Array.isArray(entries) ? entries : [];
  if (showBundledEntries !== false) {
    return list.slice();
  }
  return list.filter((entry) => !isBundledPoolEntry(entry));
}

function hasHiddenBundledUnusedEntries(entries, showBundledEntries) {
  if (showBundledEntries !== false) return false;
  const list = Array.isArray(entries) ? entries : [];
  return list.some((entry) => isBundledPoolEntry(entry) && entry.used === false);
}

function findEntryBySnapshotRelPath(entries, snapshotRelPath) {
  const normalizedPath = normalizeSnapshotRelPath(snapshotRelPath);
  return (Array.isArray(entries) ? entries : []).find((entry) => entry.snapshotRelPath === normalizedPath) || null;
}

module.exports = {
  POOL_DIR_NAME,
  BUNDLED_POOL_SOURCE_DIR,
  resolvePoolContext,
  resolvePoolDestination,
  writePoolJsonEntry,
  normalizeSnapshotRelPath,
  buildPoolSnapshotRelPath,
  loadPoolState,
  savePoolState,
  getShowBundledEntries,
  setShowBundledEntries,
  synchronizeBundledPoolContent,
  listPoolEntries,
  serializePoolEntryMeta,
  isBundledPoolEntry,
  getVisiblePoolEntries,
  hasHiddenBundledUnusedEntries,
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
