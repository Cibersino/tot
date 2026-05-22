'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const TEST_TEMP_ROOT_NAME = 'tot-temp-test';
const RUN_DIR_PREFIX = 'run-';

function toTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeTestTempKind(kind) {
  const safeKind = toTrimmedString(kind).toLowerCase();
  if (!safeKind || !/^[a-z0-9][a-z0-9_-]*$/.test(safeKind)) {
    throw new Error('[test_temp_paths] Invalid test temp kind.');
  }
  return safeKind;
}

function resolveRealPathOrFallback(candidatePath) {
  try {
    return fs.realpathSync(candidatePath);
  } catch (_err) {
    return path.resolve(candidatePath);
  }
}

function getTestTempRoot() {
  return path.join(os.tmpdir(), TEST_TEMP_ROOT_NAME);
}

function getTestTempDir(kind) {
  return path.join(getTestTempRoot(), normalizeTestTempKind(kind));
}

function createTestTempDir(kind) {
  const tempDir = getTestTempDir(kind);
  fs.mkdirSync(tempDir, { recursive: true });
  return fs.mkdtempSync(path.join(tempDir, RUN_DIR_PREFIX));
}

function isInsideTestTempRoot(candidatePath) {
  const safeCandidatePath = toTrimmedString(candidatePath);
  if (!safeCandidatePath) return false;

  const testTempRoot = resolveRealPathOrFallback(getTestTempRoot());
  const resolvedCandidatePath = resolveRealPathOrFallback(safeCandidatePath);
  const relativePath = path.relative(testTempRoot, resolvedCandidatePath);
  return relativePath === ''
    || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

module.exports = {
  createTestTempDir,
  getTestTempDir,
  getTestTempRoot,
  isInsideTestTempRoot,
};
