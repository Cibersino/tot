// electron/text_extraction_platform/platform_adapters/fallback.js
'use strict';

const {
  normalizeAbsolutePath,
  normalizeExistingDirectoryOrEmpty,
  normalizeSelectedDirectoryFromFilePath,
  resolveExistingDirectory,
  safeGetSystemPath,
} = require('./common');

function resolveDefaultPickerPath({ app, cwd, log }) {
  const documents = safeGetSystemPath(app, 'documents', log, 'text_extraction_picker.default.fallback.documents');
  const home = safeGetSystemPath(app, 'home', log, 'text_extraction_picker.default.fallback.home');
  return resolveExistingDirectory([documents, home], cwd, log, 'text_extraction_picker.default.fallback');
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

