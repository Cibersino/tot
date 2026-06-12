'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createTestTempDir } = require('../../helpers/test_temp_paths');

const MODULE_PATH = path.resolve(
  __dirname,
  '../../../electron/text_extraction_platform/ocr_jp2_normalization.js'
);
const JP2_FIXTURE_PATH = path.resolve('test/fixtures/jp2/sample1.jp2');

function loadJp2NormalizationModuleWithMocks({
  appTempPathsOverrides = null,
  jpeg2000DecoderExports = null,
} = {}) {
  const appTempPathsModulePath = path.resolve(__dirname, '../../../electron/app_temp_paths.js');
  const jpeg2000DecoderModulePath = path.resolve(
    __dirname,
    '../../../electron/text_extraction_platform/openjpeg_wasm_runtime.js'
  );
  const originalTargetModule = require.cache[MODULE_PATH];
  const originalAppTempPathsModule = require.cache[appTempPathsModulePath];
  const originalJpeg2000DecoderModule = require.cache[jpeg2000DecoderModulePath];

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

  if (jpeg2000DecoderExports && typeof jpeg2000DecoderExports === 'object') {
    const runtimeExports =
      typeof jpeg2000DecoderExports.OpenJPEGWASM === 'function'
        ? jpeg2000DecoderExports.OpenJPEGWASM
        : jpeg2000DecoderExports;
    require.cache[jpeg2000DecoderModulePath] = {
      id: jpeg2000DecoderModulePath,
      filename: jpeg2000DecoderModulePath,
      loaded: true,
      exports: runtimeExports,
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
    if (originalJpeg2000DecoderModule) {
      require.cache[jpeg2000DecoderModulePath] = originalJpeg2000DecoderModule;
    } else {
      delete require.cache[jpeg2000DecoderModulePath];
    }
  }

  return {
    loadedModule,
    restore,
  };
}

test('normalizeJp2ForOcrUpload materializes a PNG upload input from a valid JP2 fixture', async (t) => {
  const { loadedModule, restore } = loadJp2NormalizationModuleWithMocks();
  t.after(restore);

  const uploadInput = await loadedModule.normalizeJp2ForOcrUpload({
    fileInfo: {
      absoluteFilePath: JP2_FIXTURE_PATH,
      sourceFileExt: 'jp2',
      sourceFileName: 'sample1.jp2',
      sourceMimeType: 'image/jp2',
    },
  });

  t.after(() => {
    if (uploadInput && typeof uploadInput.cleanup === 'function') {
      uploadInput.cleanup();
    }
  });

  const stat = fs.statSync(uploadInput.uploadFilePath);
  assert.equal(uploadInput.uploadFileName, 'sample1.png');
  assert.equal(uploadInput.uploadMimeType, 'image/png');
  assert.equal(uploadInput.metadataSafeForLogs.normalizedFrom, 'jp2');
  assert.equal(uploadInput.metadataSafeForLogs.decodedWidth, 2717);
  assert.equal(uploadInput.metadataSafeForLogs.decodedHeight, 3701);
  assert.equal(uploadInput.metadataSafeForLogs.decodedComponentCount, 3);
  assert.equal(uploadInput.metadataSafeForLogs.decodedBitsPerSample, 8);
  assert.equal(uploadInput.metadataSafeForLogs.normalizedColorMode, 'grayscale_palette_png');
  assert.equal(uploadInput.metadataSafeForLogs.uploadFileExt, 'png');
  assert.equal(uploadInput.metadataSafeForLogs.uploadMimeType, 'image/png');
  assert.equal(path.extname(uploadInput.uploadFilePath).toLowerCase(), '.png');
  assert.equal(stat.isFile(), true);
  assert.equal(stat.size > 0, true);
});

test('normalizeJp2ForOcrUpload emits a palette PNG to reduce OCR upload size', async (t) => {
  const { loadedModule, restore } = loadJp2NormalizationModuleWithMocks();
  t.after(restore);

  const uploadInput = await loadedModule.normalizeJp2ForOcrUpload({
    fileInfo: {
      absoluteFilePath: JP2_FIXTURE_PATH,
      sourceFileExt: 'jp2',
      sourceFileName: 'sample1.jp2',
      sourceMimeType: 'image/jp2',
    },
  });

  t.after(() => {
    if (uploadInput && typeof uploadInput.cleanup === 'function') {
      uploadInput.cleanup();
    }
  });

  const meta = await require('sharp')(uploadInput.uploadFilePath).metadata();
  assert.equal(meta.format, 'png');
  assert.equal(meta.isPalette, true);
  assert.equal(meta.hasAlpha, false);
  assert.equal(meta.bitsPerSample, 8);
});

test('normalizeJp2ForOcrUpload cleanup returns one structured warning object', async (t) => {
  const tempDirPath = createTestTempDir('ocr-jp2-normalization-cleanup-warning');
  t.after(() => fs.rmSync(tempDirPath, { recursive: true, force: true }));

  const { loadedModule, restore } = loadJp2NormalizationModuleWithMocks({
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
  });
  t.after(restore);

  const uploadInput = await loadedModule.normalizeJp2ForOcrUpload({
    fileInfo: {
      absoluteFilePath: JP2_FIXTURE_PATH,
      sourceFileExt: 'jp2',
      sourceFileName: 'sample1.jp2',
      sourceMimeType: 'image/jp2',
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

test('normalizeJp2ForOcrUpload accepts grayscale-plus-alpha JP2 decodes', async (t) => {
  const tempDirPath = createTestTempDir('ocr-jp2-normalization-two-channel');
  t.after(() => fs.rmSync(tempDirPath, { recursive: true, force: true }));

  const sourcePath = path.join(tempDirPath, 'two-channel.jp2');
  fs.writeFileSync(sourcePath, Buffer.from('mock jp2 bytes'));

  const { loadedModule, restore } = loadJp2NormalizationModuleWithMocks({
    jpeg2000DecoderExports: {
      OpenJPEGWASM: async () => ({
        J2KDecoder: class MockJ2KDecoder {
          getEncodedBuffer(length) {
            return new Uint8Array(length);
          }

          decodeSubResolution() {}

          getDecodedBuffer() {
            return Uint8Array.from([
              0, 255,
              64, 255,
              128, 255,
              255, 255,
            ]);
          }

          getFrameInfo() {
            return {
              width: 2,
              height: 2,
              bitsPerSample: 8,
              componentCount: 2,
              isSigned: false,
            };
          }

          delete() {}
        },
      }),
    },
  });
  t.after(restore);

  const uploadInput = await loadedModule.normalizeJp2ForOcrUpload({
    fileInfo: {
      absoluteFilePath: sourcePath,
      sourceFileExt: 'jp2',
      sourceFileName: 'two-channel.jp2',
      sourceMimeType: 'image/jp2',
    },
  });

  t.after(() => {
    if (uploadInput && typeof uploadInput.cleanup === 'function') {
      uploadInput.cleanup();
    }
  });

  const stat = fs.statSync(uploadInput.uploadFilePath);
  assert.equal(uploadInput.uploadMimeType, 'image/png');
  assert.equal(stat.isFile(), true);
  assert.equal(stat.size > 0, true);
});

test('normalizeJp2ForOcrUpload maps corrupt JP2 inputs to source_to_png_conversion_failed', async (t) => {
  const tempDirPath = createTestTempDir('ocr-jp2-normalization-corrupt');
  t.after(() => fs.rmSync(tempDirPath, { recursive: true, force: true }));

  const corruptPath = path.join(tempDirPath, 'corrupt.jp2');
  fs.writeFileSync(corruptPath, Buffer.from('not a jp2'));

  const { loadedModule, restore } = loadJp2NormalizationModuleWithMocks({
    jpeg2000DecoderExports: {
      OpenJPEGWASM: async () => ({
        J2KDecoder: class MockJ2KDecoder {
          getEncodedBuffer(length) {
            return new Uint8Array(length);
          }

          decodeSubResolution() {
            throw new Error('decode failed');
          }

          delete() {}
        },
      }),
    },
  });
  t.after(restore);

  await assert.rejects(
    loadedModule.normalizeJp2ForOcrUpload({
      fileInfo: {
        absoluteFilePath: corruptPath,
        sourceFileExt: 'jp2',
        sourceFileName: 'corrupt.jp2',
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
