'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  createTestTempDir,
} = require('../../helpers/test_temp_paths');

function createIpcMainDouble() {
  const handlers = new Map();

  return {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
    async invoke(channel, event, ...args) {
      if (!handlers.has(channel)) {
        throw new Error(`Missing IPC handler: ${channel}`);
      }
      return handlers.get(channel)(event, ...args);
    },
  };
}

function loadLinkOpenersWithMockedTmpdir(mockTmpdir) {
  const linkOpenersModulePath = path.resolve(__dirname, '../../../electron/link_openers.js');
  const appTempPathsModulePath = path.resolve(__dirname, '../../../electron/app_temp_paths.js');
  const osModulePath = require.resolve('os');
  const originalLinkOpenersModule = require.cache[linkOpenersModulePath];
  const originalAppTempPathsModule = require.cache[appTempPathsModulePath];
  const originalOsModule = require.cache[osModulePath];
  const realOs = require('os');

  require.cache[osModulePath] = {
    id: osModulePath,
    filename: osModulePath,
    loaded: true,
    exports: {
      ...realOs,
      tmpdir() {
        return mockTmpdir;
      },
    },
  };

  delete require.cache[appTempPathsModulePath];
  const appTempPaths = require(appTempPathsModulePath);
  delete require.cache[linkOpenersModulePath];
  const linkOpeners = require(linkOpenersModulePath);

  function restore() {
    delete require.cache[linkOpenersModulePath];
    delete require.cache[appTempPathsModulePath];
    if (originalLinkOpenersModule) {
      require.cache[linkOpenersModulePath] = originalLinkOpenersModule;
    } else {
      delete require.cache[linkOpenersModulePath];
    }
    if (originalAppTempPathsModule) {
      require.cache[appTempPathsModulePath] = originalAppTempPathsModule;
    } else {
      delete require.cache[appTempPathsModulePath];
    }
    if (originalOsModule) {
      require.cache[osModulePath] = originalOsModule;
    } else {
      delete require.cache[osModulePath];
    }
  }

  return {
    appTempPaths,
    linkOpeners,
    restore,
  };
}

test('open-app-doc copies bundled public docs into the runtime temp root', async (t) => {
  const mockedTmpdir = createTestTempDir('link-openers-mocked-tmpdir');
  const appRoot = createTestTempDir('link-openers-app-root');
  t.after(() => fs.rmSync(mockedTmpdir, { recursive: true, force: true }));
  t.after(() => fs.rmSync(appRoot, { recursive: true, force: true }));

  const { appTempPaths, linkOpeners, restore } = loadLinkOpenersWithMockedTmpdir(mockedTmpdir);
  t.after(restore);

  const licenseDir = path.join(appRoot, 'public', 'third_party_licenses');
  const sourceLicensePath = path.join(licenseDir, 'LICENSE_pdf-parse_1.1.1.txt');
  fs.mkdirSync(licenseDir, { recursive: true });
  fs.writeFileSync(sourceLicensePath, 'fixture license');

  const openedPaths = [];
  const ipcMain = createIpcMainDouble();
  linkOpeners.registerLinkIpc({
    ipcMain,
    app: {
      isPackaged: true,
      getAppPath() {
        return appRoot;
      },
    },
    shell: {
      async openPath(filePath) {
        openedPaths.push(filePath);
        return '';
      },
    },
  });

  const result = await ipcMain.invoke('open-app-doc', {}, 'license-text-extraction-pdf');

  assert.deepEqual(result, { ok: true });
  assert.equal(openedPaths.length, 1);
  assert.equal(appTempPaths.isInsideRuntimeTempRoot(openedPaths[0]), true);
  assert.notEqual(openedPaths[0], sourceLicensePath);
  assert.equal(fs.readFileSync(openedPaths[0], 'utf8'), 'fixture license');
});

test('open-app-doc resolves the EPUB parser bundled license doc key', async (t) => {
  const mockedTmpdir = createTestTempDir('link-openers-epub-license-mocked-tmpdir');
  const appRoot = createTestTempDir('link-openers-epub-license-app-root');
  t.after(() => fs.rmSync(mockedTmpdir, { recursive: true, force: true }));
  t.after(() => fs.rmSync(appRoot, { recursive: true, force: true }));

  const { appTempPaths, linkOpeners, restore } = loadLinkOpenersWithMockedTmpdir(mockedTmpdir);
  t.after(restore);

  const licenseDir = path.join(appRoot, 'public', 'third_party_licenses');
  const sourceLicensePath = path.join(licenseDir, 'LICENSE_@xmldom_xmldom_0.8.13.txt');
  fs.mkdirSync(licenseDir, { recursive: true });
  fs.writeFileSync(sourceLicensePath, 'epub parser license');

  const openedPaths = [];
  const ipcMain = createIpcMainDouble();
  linkOpeners.registerLinkIpc({
    ipcMain,
    app: {
      isPackaged: true,
      getAppPath() {
        return appRoot;
      },
    },
    shell: {
      async openPath(filePath) {
        openedPaths.push(filePath);
        return '';
      },
    },
  });

  const result = await ipcMain.invoke('open-app-doc', {}, 'license-text-extraction-epub');

  assert.deepEqual(result, { ok: true });
  assert.equal(openedPaths.length, 1);
  assert.equal(appTempPaths.isInsideRuntimeTempRoot(openedPaths[0]), true);
  assert.equal(fs.readFileSync(openedPaths[0], 'utf8'), 'epub parser license');
});
