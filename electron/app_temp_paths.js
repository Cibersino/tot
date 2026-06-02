// electron/app_temp_paths.js
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const RUNTIME_TEMP_ROOT_NAME = 'tot-temp';
const RUN_DIR_PREFIX = 'run-';

function toTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getErrorDetails(err) {
  return {
    errorName: String(err && err.name ? err.name : 'Error'),
    errorCode: String(err && err.code ? err.code : ''),
    errorMessage: String(err && err.message ? err.message : err || ''),
  };
}

function normalizeTempKind(kind) {
  const safeKind = toTrimmedString(kind).toLowerCase();
  if (!safeKind || !/^[a-z0-9][a-z0-9_-]*$/.test(safeKind)) {
    throw new Error('[app_temp_paths] Invalid runtime temp kind.');
  }
  return safeKind;
}

function normalizeTempFileName(fileName) {
  const baseName = path.basename(toTrimmedString(fileName));
  const sanitizedBaseName = baseName
    .replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '_')
    .trim();
  if (!sanitizedBaseName) {
    throw new Error('[app_temp_paths] Invalid runtime temp file name.');
  }
  return sanitizedBaseName;
}

function buildCleanupWarning(warningCode, stage, detailsSafeForLogs = {}) {
  return {
    warningCode,
    detailsSafeForLogs: {
      stage,
      ...detailsSafeForLogs,
    },
  };
}

function resolveRealPathOrFallback(candidatePath) {
  try {
    return fs.realpathSync(candidatePath);
  } catch (_err) {
    return path.resolve(candidatePath);
  }
}

function isRelativePathInsideRoot(relativePath, { allowRoot = false } = {}) {
  if (relativePath === '') return allowRoot;
  return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
}

function getRuntimeTempRoot() {
  return path.join(os.tmpdir(), RUNTIME_TEMP_ROOT_NAME);
}

function getRuntimeTempDir(kind) {
  return path.join(getRuntimeTempRoot(), normalizeTempKind(kind));
}

function createRuntimeTempDir(kind) {
  const tempDir = getRuntimeTempDir(kind);
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

function createRuntimeTempRunDir(kind) {
  const tempDir = createRuntimeTempDir(kind);
  return fs.mkdtempSync(path.join(tempDir, RUN_DIR_PREFIX));
}

function resolveRuntimeTempFilePath(kind, fileName) {
  const tempDir = createRuntimeTempDir(kind);
  return path.join(tempDir, normalizeTempFileName(fileName));
}

function isInsideRuntimeTempRoot(candidatePath) {
  const safeCandidatePath = toTrimmedString(candidatePath);
  if (!safeCandidatePath) return false;

  const runtimeTempRoot = resolveRealPathOrFallback(getRuntimeTempRoot());
  const resolvedCandidatePath = resolveRealPathOrFallback(safeCandidatePath);
  const relativePath = path.relative(runtimeTempRoot, resolvedCandidatePath);
  return isRelativePathInsideRoot(relativePath, { allowRoot: true });
}

function cleanupRuntimeTempRunDir(runDir, { force = true } = {}) {
  const safeRunDir = toTrimmedString(runDir);
  if (!safeRunDir || !fs.existsSync(safeRunDir)) return null;

  const runtimeTempRoot = resolveRealPathOrFallback(getRuntimeTempRoot());
  const resolvedRunDir = resolveRealPathOrFallback(safeRunDir);
  const relativePath = path.relative(runtimeTempRoot, resolvedRunDir);
  const isDescendantDir = isRelativePathInsideRoot(relativePath);

  if (!isDescendantDir) {
    return buildCleanupWarning(
      'cleanup:runtime_temp_run_dir_outside_root',
      'cleanup_runtime_temp_run_dir',
      {
        runDir: safeRunDir,
        resolvedRunDir,
        runtimeTempRoot,
      }
    );
  }

  try {
    fs.rmSync(resolvedRunDir, { recursive: true, force });
    return null;
  } catch (err) {
    return buildCleanupWarning(
      'cleanup:runtime_temp_run_dir_cleanup_failed',
      'cleanup_runtime_temp_run_dir',
      {
        runDir: safeRunDir,
        resolvedRunDir,
        runtimeTempRoot,
        ...getErrorDetails(err),
      }
    );
  }
}

function cleanupRuntimeTempRoot() {
  const runtimeTempRoot = getRuntimeTempRoot();
  if (!fs.existsSync(runtimeTempRoot)) return null;

  try {
    fs.rmSync(runtimeTempRoot, { recursive: true, force: true });
    return null;
  } catch (err) {
    return buildCleanupWarning(
      'cleanup:runtime_temp_root_cleanup_failed',
      'cleanup_runtime_temp_root',
      {
        runtimeTempRoot: path.resolve(runtimeTempRoot),
        ...getErrorDetails(err),
      }
    );
  }
}

module.exports = {
  cleanupRuntimeTempRoot,
  cleanupRuntimeTempRunDir,
  createRuntimeTempRunDir,
  getRuntimeTempDir,
  getRuntimeTempRoot,
  isInsideRuntimeTempRoot,
  resolveRuntimeTempFilePath,
};
