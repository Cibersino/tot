'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createTestTempDir } = require('../../helpers/test_temp_paths');

const MODULE_PATH = path.resolve(
  __dirname,
  '../../../electron/text_extraction_platform/ocr_image_normalization.js'
);

function loadNormalizationModuleWithMocks({
  appTempPathsOverrides = null,
  sharpFactory = null,
} = {}) {
  const appTempPathsModulePath = path.resolve(__dirname, '../../../electron/app_temp_paths.js');
  const sharpModulePath = require.resolve('sharp');
  const originalTargetModule = require.cache[MODULE_PATH];
  const originalAppTempPathsModule = require.cache[appTempPathsModulePath];
  const originalSharpModule = require.cache[sharpModulePath];

  delete require.cache[appTempPathsModulePath];
  const actualAppTempPathsModule = require(appTempPathsModulePath);
  require.cache[appTempPathsModulePath] = {
    id: appTempPathsModulePath,
    filename: appTempPathsModulePath,
    loaded: true,
    exports: appTempPathsOverrides && typeof appTempPathsOverrides === 'object'
      ? {
        ...actualAppTempPathsModule,
        ...appTempPathsOverrides,
      }
      : actualAppTempPathsModule,
  };

  if (typeof sharpFactory === 'function') {
    require.cache[sharpModulePath] = {
      id: sharpModulePath,
      filename: sharpModulePath,
      loaded: true,
      exports: sharpFactory,
    };
  }

  delete require.cache[MODULE_PATH];
  const loadedModule = require(MODULE_PATH);

  function restore() {
    delete require.cache[MODULE_PATH];
    if (originalTargetModule) {
      require.cache[MODULE_PATH] = originalTargetModule;
    } else {
      delete require.cache[MODULE_PATH];
    }
    if (originalAppTempPathsModule) {
      require.cache[appTempPathsModulePath] = originalAppTempPathsModule;
    } else {
      delete require.cache[appTempPathsModulePath];
    }
    if (originalSharpModule) {
      require.cache[sharpModulePath] = originalSharpModule;
    } else {
      delete require.cache[sharpModulePath];
    }
  }

  return {
    loadedModule,
    restore,
  };
}

test('normalizeImageForOcrUpload cleanup returns one structured warning object', async (t) => {
  const tempDirPath = createTestTempDir('ocr-image-normalization-success');
  t.after(() => fs.rmSync(tempDirPath, { recursive: true, force: true }));

  const { loadedModule, restore } = loadNormalizationModuleWithMocks({
    appTempPathsOverrides: {
      createRuntimeTempRunDir() {
        return tempDirPath;
      },
      cleanupRuntimeTempRunDir(runDir) {
        return {
          warningCode: 'cleanup:runtime_temp_run_dir_cleanup_failed',
          detailsSafeForLogs: {
            stage: 'cleanup_runtime_temp_run_dir',
            runDir,
            resolvedRunDir: runDir,
            runtimeTempRoot: path.join(tempDirPath, '..'),
            errorName: 'Error',
            errorCode: 'EPERM',
            errorMessage: 'cleanup denied',
          },
        };
      },
    },
    sharpFactory() {
      return {
        rotate() {
          return this;
        },
        png() {
          return this;
        },
        async toFile(outputPath) {
          fs.mkdirSync(path.dirname(outputPath), { recursive: true });
          fs.writeFileSync(outputPath, Buffer.from('png'));
        },
      };
    },
  });
  t.after(restore);

  const uploadInput = await loadedModule.normalizeImageForOcrUpload({
    fileInfo: {
      absoluteFilePath: path.join(tempDirPath, 'source.webp'),
      sourceFileExt: 'webp',
      sourceFileName: 'source.webp',
    },
  });

  const cleanupWarning = uploadInput.cleanup();
  assert.equal(cleanupWarning.warningCode, 'cleanup:image_normalization_cleanup_failed');
  assert.equal(cleanupWarning.detailsSafeForLogs.stage, 'cleanup_image_normalization');
  assert.equal(cleanupWarning.detailsSafeForLogs.tempDirPath, tempDirPath);
  assert.equal(
    cleanupWarning.detailsSafeForLogs.cleanupWarningCode,
    'cleanup:runtime_temp_run_dir_cleanup_failed'
  );
  assert.equal(
    cleanupWarning.detailsSafeForLogs.cleanupWarningDetails.errorCode,
    'EPERM'
  );
});

test('normalizeImageForOcrUpload preserves cleanup warning details on conversion failure', async (t) => {
  const tempDirPath = createTestTempDir('ocr-image-normalization-failure');
  t.after(() => fs.rmSync(tempDirPath, { recursive: true, force: true }));

  const { loadedModule, restore } = loadNormalizationModuleWithMocks({
    appTempPathsOverrides: {
      createRuntimeTempRunDir() {
        return tempDirPath;
      },
      cleanupRuntimeTempRunDir(runDir) {
        return {
          warningCode: 'cleanup:runtime_temp_run_dir_cleanup_failed',
          detailsSafeForLogs: {
            stage: 'cleanup_runtime_temp_run_dir',
            runDir,
            resolvedRunDir: runDir,
            runtimeTempRoot: path.join(tempDirPath, '..'),
            errorName: 'Error',
            errorCode: 'EPERM',
            errorMessage: 'cleanup denied',
          },
        };
      },
    },
    sharpFactory() {
      return {
        rotate() {
          return this;
        },
        png() {
          return this;
        },
        async toFile() {
          throw new Error('sharp failed');
        },
      };
    },
  });
  t.after(restore);

  await assert.rejects(
    loadedModule.normalizeImageForOcrUpload({
      fileInfo: {
        absoluteFilePath: path.join(tempDirPath, 'source.webp'),
        sourceFileExt: 'webp',
        sourceFileName: 'source.webp',
      },
    }),
    (err) => {
      assert.equal(err.code, 'source_to_png_conversion_failed');
      assert.equal(err.detailsSafeForLogs.cleanupWarningCode, 'cleanup:image_normalization_cleanup_failed');
      assert.equal(err.detailsSafeForLogs.cleanupFailure.stage, 'cleanup_image_normalization');
      assert.equal(err.detailsSafeForLogs.cleanupFailure.cleanupWarningDetails.errorCode, 'EPERM');
      return true;
    }
  );
});
