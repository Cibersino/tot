'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  createTestTempDir,
} = require('../../helpers/test_temp_paths');

function loadAppTempPathsWithMockedTmpdir(mockTmpdir) {
  const modulePath = path.resolve(__dirname, '../../../electron/app_temp_paths.js');
  const osModulePath = require.resolve('os');
  const originalModule = require.cache[modulePath];
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

  delete require.cache[modulePath];
  const appTempPaths = require(modulePath);

  function restore() {
    delete require.cache[modulePath];
    if (originalModule) {
      require.cache[modulePath] = originalModule;
    } else {
      delete require.cache[modulePath];
    }
    if (originalOsModule) {
      require.cache[osModulePath] = originalOsModule;
    } else {
      delete require.cache[osModulePath];
    }
  }

  return {
    appTempPaths,
    restore,
  };
}

test('app_temp_paths keeps runtime temp ownership explicit and guarded', (t) => {
  const mockedTmpdir = createTestTempDir('app-temp-paths-mocked-tmpdir');
  const outsideDir = createTestTempDir('app-temp-paths-outside');
  t.after(() => fs.rmSync(mockedTmpdir, { recursive: true, force: true }));
  t.after(() => fs.rmSync(outsideDir, { recursive: true, force: true }));

  const { appTempPaths, restore } = loadAppTempPathsWithMockedTmpdir(mockedTmpdir);
  t.after(restore);

  const {
    cleanupRuntimeTempRoot,
    cleanupRuntimeTempRunDir,
    createRuntimeTempRunDir,
    getRuntimeTempDir,
    getRuntimeTempRoot,
    isInsideRuntimeTempRoot,
    resolveRuntimeTempFilePath,
  } = appTempPaths;

  const runDir = createRuntimeTempRunDir('generated-pdf-subsets');
  const tempFilePath = resolveRuntimeTempFilePath('app-docs', 'tot_LICENSE:test?.txt');

  assert.equal(path.dirname(runDir), getRuntimeTempDir('generated-pdf-subsets'));
  assert.equal(isInsideRuntimeTempRoot(runDir), true);
  assert.equal(path.basename(tempFilePath), 'tot_LICENSE_test_.txt');
  assert.equal(isInsideRuntimeTempRoot(tempFilePath), true);

  fs.writeFileSync(tempFilePath, 'fixture');

  const outsideWarning = cleanupRuntimeTempRunDir(outsideDir, { force: true });
  assert.equal(outsideWarning.warningCode, 'cleanup:runtime_temp_run_dir_outside_root');
  assert.equal(fs.existsSync(outsideDir), true);

  const ownedCleanupWarning = cleanupRuntimeTempRunDir(runDir, { force: false });
  assert.equal(ownedCleanupWarning, null);
  assert.equal(fs.existsSync(runDir), false);

  const rootCleanupWarning = cleanupRuntimeTempRoot();
  assert.equal(rootCleanupWarning, null);
  assert.equal(fs.existsSync(getRuntimeTempRoot()), false);
});
