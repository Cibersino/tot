'use strict';

const windowsAdapter = require('./platform_adapters/windows');
const darwinAdapter = require('./platform_adapters/darwin');
const linuxAdapter = require('./platform_adapters/linux');
const fallbackAdapter = require('./platform_adapters/fallback');

function getImportExtractPlatformAdapter(platform = process.platform) {
  switch (platform) {
    case 'win32':
      return windowsAdapter;
    case 'darwin':
      return darwinAdapter;
    case 'linux':
      return linuxAdapter;
    default:
      return fallbackAdapter;
  }
}

module.exports = {
  getImportExtractPlatformAdapter,
};
