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
  jp2NormalizerExports = null,
} = {}) {
  const appTempPathsModulePath = path.resolve(__dirname, '../../../electron/app_temp_paths.js');
  const sharpModulePath = require.resolve('sharp');
  const jp2NormalizerModulePath = path.resolve(
    __dirname,
    '../../../electron/text_extraction_platform/ocr_jp2_normalization.js'
  );
  const originalTargetModule = require.cache[MODULE_PATH];
  const originalAppTempPathsModule = require.cache[appTempPathsModulePath];
  const originalSharpModule = require.cache[sharpModulePath];
  const originalJp2NormalizerModule = require.cache[jp2NormalizerModulePath];

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

  if (jp2NormalizerExports && typeof jp2NormalizerExports === 'object') {
    require.cache[jp2NormalizerModulePath] = {
      id: jp2NormalizerModulePath,
      filename: jp2NormalizerModulePath,
      loaded: true,
      exports: jp2NormalizerExports,
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
    if (originalJp2NormalizerModule) {
      require.cache[jp2NormalizerModulePath] = originalJp2NormalizerModule;
    } else {
      delete require.cache[jp2NormalizerModulePath];
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

test('normalizeImageForOcrUpload delegates JP2 handling to the dedicated normalizer module', async (t) => {
  const tempDirPath = createTestTempDir('ocr-image-normalization-jp2-delegate');
  t.after(() => fs.rmSync(tempDirPath, { recursive: true, force: true }));

  let delegatedFileInfo = null;
  const cleanupWarning = {
    warningCode: 'cleanup:image_normalization_cleanup_failed',
    detailsSafeForLogs: {
      stage: 'cleanup_image_normalization',
      tempDirPath,
      cleanupWarningCode: 'cleanup:runtime_temp_run_dir_cleanup_failed',
      cleanupWarningDetails: {
        errorCode: 'EPERM',
      },
    },
  };
  const { loadedModule, restore } = loadNormalizationModuleWithMocks({
    jp2NormalizerExports: {
      async normalizeJp2ForOcrUpload({ fileInfo }) {
        delegatedFileInfo = fileInfo;
        return {
          uploadFilePath: path.join(tempDirPath, 'scan.png'),
          uploadFileName: 'scan.png',
          uploadMimeType: 'image/png',
          metadataSafeForLogs: {
            normalizedFrom: 'jp2',
            uploadFileExt: 'png',
            uploadMimeType: 'image/png',
          },
          cleanup() {
            return cleanupWarning;
          },
        };
      },
    },
  });
  t.after(restore);

  const uploadInput = await loadedModule.normalizeImageForOcrUpload({
    fileInfo: {
      absoluteFilePath: path.join(tempDirPath, 'scan.jp2'),
      sourceFileExt: 'jp2',
      sourceFileName: 'scan.jp2',
      sourceMimeType: 'image/jp2',
    },
  });

  assert.equal(delegatedFileInfo.sourceFileExt, 'jp2');
  assert.equal(uploadInput.uploadMimeType, 'image/png');
  assert.equal(uploadInput.metadataSafeForLogs.normalizedFrom, 'jp2');
  assert.deepEqual(uploadInput.cleanup(), cleanupWarning);
});

test('normalizeImageForOcrUpload preserves image_normalizer_unavailable from JP2 delegation', async (t) => {
  const tempDirPath = createTestTempDir('ocr-image-normalization-jp2-runtime-unavailable');
  t.after(() => fs.rmSync(tempDirPath, { recursive: true, force: true }));

  const { loadedModule, restore } = loadNormalizationModuleWithMocks({
    jp2NormalizerExports: {
      async normalizeJp2ForOcrUpload() {
        const err = new Error('runtime unavailable');
        err.code = 'image_normalizer_unavailable';
        err.detailsSafeForLogs = {
          reason: 'openjpeg_runtime_init_failed',
        };
        throw err;
      },
    },
  });
  t.after(restore);

  await assert.rejects(
    loadedModule.normalizeImageForOcrUpload({
      fileInfo: {
        absoluteFilePath: path.join(tempDirPath, 'scan.jp2'),
        sourceFileExt: 'jp2',
        sourceFileName: 'scan.jp2',
        sourceMimeType: 'image/jp2',
      },
    }),
    (err) => {
      assert.equal(err.code, 'image_normalizer_unavailable');
      assert.equal(err.detailsSafeForLogs.reason, 'openjpeg_runtime_init_failed');
      return true;
    }
  );
});

test('normalizeImageForOcrUpload preserves source_to_png_conversion_failed from JP2 delegation', async (t) => {
  const tempDirPath = createTestTempDir('ocr-image-normalization-jp2-conversion-failure');
  t.after(() => fs.rmSync(tempDirPath, { recursive: true, force: true }));

  const { loadedModule, restore } = loadNormalizationModuleWithMocks({
    jp2NormalizerExports: {
      async normalizeJp2ForOcrUpload() {
        const err = new Error('decode failed');
        err.code = 'source_to_png_conversion_failed';
        err.detailsSafeForLogs = {
          reason: 'jp2_source_to_png_failed',
          sourceFileExt: 'jp2',
        };
        throw err;
      },
    },
  });
  t.after(restore);

  await assert.rejects(
    loadedModule.normalizeImageForOcrUpload({
      fileInfo: {
        absoluteFilePath: path.join(tempDirPath, 'scan.jp2'),
        sourceFileExt: 'jp2',
        sourceFileName: 'scan.jp2',
        sourceMimeType: 'image/jp2',
      },
    }),
    (err) => {
      assert.equal(err.code, 'source_to_png_conversion_failed');
      assert.equal(err.detailsSafeForLogs.reason, 'jp2_source_to_png_failed');
      assert.equal(err.detailsSafeForLogs.sourceFileExt, 'jp2');
      return true;
    }
  );
});
