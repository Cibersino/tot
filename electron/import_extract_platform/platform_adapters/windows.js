// electron/import_extract_platform/platform_adapters/windows.js
'use strict';

const {
  normalizeAbsolutePath,
  normalizeExistingDirectoryOrEmpty,
  normalizeSelectedDirectoryFromFilePath,
  resolveExistingDirectory,
  safeGetSystemPath,
} = require('./common');

function resolveDefaultPickerPath({ app, cwd, log }) {
  const documents = safeGetSystemPath(app, 'documents', log, 'import_extract_picker.default.win.documents');
  const home = safeGetSystemPath(app, 'home', log, 'import_extract_picker.default.win.home');
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
  id: 'windows',
  resolveDefaultPickerPath,
  normalizePersistedDirectory,
  normalizeSelectedFilePath,
  normalizeSelectedDirectory,
};
