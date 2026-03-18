'use strict';

const fs = require('fs');
const path = require('path');

function cleanPathString(rawValue) {
  return typeof rawValue === 'string' ? rawValue.trim() : '';
}

function isExistingDirectory(candidatePath) {
  const normalized = cleanPathString(candidatePath);
  if (!normalized) return false;
  try {
    return fs.existsSync(normalized) && fs.statSync(normalized).isDirectory();
  } catch {
    return false;
  }
}

function normalizeAbsolutePath(rawPath) {
  const normalized = cleanPathString(rawPath);
  if (!normalized) return '';
  try {
    return path.resolve(normalized);
  } catch {
    return '';
  }
}

function resolveExistingDirectory(candidates, fallbackPath) {
  for (const candidate of candidates) {
    const normalized = normalizeAbsolutePath(candidate);
    if (isExistingDirectory(normalized)) return normalized;
  }

  const fallback = normalizeAbsolutePath(fallbackPath);
  if (isExistingDirectory(fallback)) return fallback;
  return process.cwd();
}

function normalizeExistingDirectoryOrEmpty(rawDirectory) {
  const normalized = normalizeAbsolutePath(rawDirectory);
  if (!normalized) return '';
  return isExistingDirectory(normalized) ? normalized : '';
}

function normalizeSelectedDirectoryFromFilePath(rawFilePath) {
  const normalizedFilePath = normalizeAbsolutePath(rawFilePath);
  if (!normalizedFilePath) return '';
  try {
    return normalizeExistingDirectoryOrEmpty(path.dirname(normalizedFilePath));
  } catch {
    return '';
  }
}

function safeGetSystemPath(app, key, log, onceKey) {
  if (!app || typeof app.getPath !== 'function') return '';
  try {
    return app.getPath(key);
  } catch (err) {
    if (log && typeof log.warnOnce === 'function') {
      log.warnOnce(
        onceKey,
        `Unable to resolve app.getPath('${key}') (falling back):`,
        err
      );
    }
    return '';
  }
}

module.exports = {
  cleanPathString,
  isExistingDirectory,
  normalizeAbsolutePath,
  resolveExistingDirectory,
  normalizeExistingDirectoryOrEmpty,
  normalizeSelectedDirectoryFromFilePath,
  safeGetSystemPath,
};
