'use strict';

function installElectronModuleMock(overrides = null) {
  const electronModulePath = require.resolve('electron');
  const originalElectronModule = require.cache[electronModulePath];
  const safeOverrides = overrides && typeof overrides === 'object' ? overrides : {};
  const screenOverrides = safeOverrides.screen && typeof safeOverrides.screen === 'object'
    ? safeOverrides.screen
    : {};
  const browserWindowOverride = safeOverrides.BrowserWindow;
  const browserWindowExport = typeof browserWindowOverride === 'function'
    ? browserWindowOverride
    : {
      fromWebContents() {
        return null;
      },
      ...(browserWindowOverride && typeof browserWindowOverride === 'object'
        ? browserWindowOverride
        : {}),
    };

  require.cache[electronModulePath] = {
    id: electronModulePath,
    filename: electronModulePath,
    loaded: true,
    exports: {
      ...safeOverrides,
      screen: {
        getAllDisplays() {
          return [];
        },
        getCursorScreenPoint() {
          return { x: 0, y: 0 };
        },
        getDisplayNearestPoint() {
          return {
            workArea: {
              x: 0,
              y: 0,
              width: 1920,
              height: 1080,
            },
          };
        },
        ...screenOverrides,
      },
      BrowserWindow: browserWindowExport,
    },
  };

  return function restoreElectronModuleMock() {
    if (originalElectronModule) {
      require.cache[electronModulePath] = originalElectronModule;
    } else {
      delete require.cache[electronModulePath];
    }
  };
}

module.exports = {
  installElectronModuleMock,
};
