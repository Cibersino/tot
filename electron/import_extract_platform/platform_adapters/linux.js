// electron/import_extract_platform/platform_adapters/linux.js
'use strict';

const {
  normalizeAbsolutePath,
  normalizeExistingDirectoryOrEmpty,
  normalizeSelectedDirectoryFromFilePath,
  resolveExistingDirectory,
  safeGetSystemPath,
} = require('./common');

function resolveDefaultPickerPath({ app, cwd, log }) {
  const home = safeGetSystemPath(app, 'home', log, 'import_extract_picker.default.linux.home');
  const documents = safeGetSystemPath(app, 'documents', log, 'import_extract_picker.default.linux.documents');
  return resolveExistingDirectory([home, documents], cwd);
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
  id: 'linux',
  resolveDefaultPickerPath,
  normalizePersistedDirectory,
  normalizeSelectedFilePath,
  normalizeSelectedDirectory,
};
