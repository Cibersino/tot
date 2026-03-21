// electron/import_extract_platform/platform_adapters/fallback.js
'use strict';

const {
  normalizeAbsolutePath,
  normalizeExistingDirectoryOrEmpty,
  normalizeSelectedDirectoryFromFilePath,
  resolveExistingDirectory,
  safeGetSystemPath,
} = require('./common');

function resolveDefaultPickerPath({ app, cwd, log }) {
  const documents = safeGetSystemPath(app, 'documents', log, 'import_extract_picker.default.fallback.documents');
  const home = safeGetSystemPath(app, 'home', log, 'import_extract_picker.default.fallback.home');
  return resolveExistingDirectory([documents, home], cwd);
}

function normalizePersistedDirectory(rawDirectory) {
  return normalizeExistingDirectoryOrEmpty(rawDirectory);
}

function normalizeSelectedFilePath(rawFilePath) {
  return normalizeAbsolutePath(rawFilePath);
}

function normalizeSelectedDirectory(rawFilePath) {
  return normalizeSelectedDirectoryFromFilePath(rawFilePath);
}

module.exports = {
  id: 'fallback',
  resolveDefaultPickerPath,
  normalizePersistedDirectory,
  normalizeSelectedFilePath,
  normalizeSelectedDirectory,
};
