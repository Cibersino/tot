'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createTestTempDir } = require('../../helpers/test_temp_paths');

const MODULE_PATH = path.resolve(
  __dirname,
  '../../../electron/text_extraction_platform/ocr_google_drive_route.js'
);

function loadRouteModuleWithMocks({
  logDouble = null,
  normalizeImageForOcrUpload = null,
  driveFilesOverrides = null,
} = {}) {
  const logModulePath = path.resolve(__dirname, '../../../electron/log.js');
  const googleApisModulePath = require.resolve('googleapis');
  const credentialsFileModulePath = path.resolve(
    __dirname,
    '../../../electron/text_extraction_platform/ocr_google_drive_credentials_file.js'
  );
  const tokenStorageModulePath = path.resolve(
    __dirname,
    '../../../electron/text_extraction_platform/ocr_google_drive_token_storage.js'
  );
  const oauthClientModulePath = path.resolve(
    __dirname,
    '../../../electron/text_extraction_platform/ocr_google_drive_oauth_client.js'
  );
  const imageNormalizationModulePath = path.resolve(
    __dirname,
    '../../../electron/text_extraction_platform/ocr_image_normalization.js'
  );
  const originalTargetModule = require.cache[MODULE_PATH];
  const originalLogModule = require.cache[logModulePath];
  const originalGoogleApisModule = require.cache[googleApisModulePath];
  const originalCredentialsFileModule = require.cache[credentialsFileModulePath];
  const originalTokenStorageModule = require.cache[tokenStorageModulePath];
  const originalOauthClientModule = require.cache[oauthClientModulePath];
  const originalImageNormalizationModule = require.cache[imageNormalizationModulePath];

  const fakeLog = logDouble || {
    warn() {},
    warnOnce() {},
    error() {},
    errorOnce() {},
    debug() {},
    info() {},
  };

  require.cache[logModulePath] = {
    id: logModulePath,
    filename: logModulePath,
    loaded: true,
    exports: {
      get() {
        return fakeLog;
      },
    },
  };
  require.cache[googleApisModulePath] = {
    id: googleApisModulePath,
    filename: googleApisModulePath,
    loaded: true,
    exports: {
      google: {
        drive() {
          const baseFiles = {
            async create() {
              return {
                data: {
                  id: 'temp-doc-1',
                  name: 'temp-doc-1',
                },
              };
            },
            async export() {
              return {
                data: Buffer.from('OCR text'),
              };
            },
            async delete() {
              return {};
            },
          };
          return {
            files: driveFilesOverrides && typeof driveFilesOverrides === 'object'
              ? {
                ...baseFiles,
                ...driveFilesOverrides,
              }
              : baseFiles,
          };
        },
      },
    },
  };
  require.cache[credentialsFileModulePath] = {
    id: credentialsFileModulePath,
    filename: credentialsFileModulePath,
    loaded: true,
    exports: {
      readGoogleOAuthCredentialsFile() {
        return {
          ok: true,
          parsed: { installed: {} },
        };
      },
    },
  };
  require.cache[tokenStorageModulePath] = {
    id: tokenStorageModulePath,
    filename: tokenStorageModulePath,
    loaded: true,
    exports: {
      readEncryptedTokenFile() {
        return { access_token: 'token' };
      },
    },
  };
  require.cache[oauthClientModulePath] = {
    id: oauthClientModulePath,
    filename: oauthClientModulePath,
    loaded: true,
    exports: {
      buildGoogleOAuthClient() {
        return {};
      },
      describePersistedGoogleToken() {
        return {
          acceptablePersistedTokenShape: true,
        };
      },
    },
  };
  if (typeof normalizeImageForOcrUpload === 'function') {
    require.cache[imageNormalizationModulePath] = {
      id: imageNormalizationModulePath,
      filename: imageNormalizationModulePath,
      loaded: true,
      exports: {
        normalizeImageForOcrUpload,
      },
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
    if (originalLogModule) {
      require.cache[logModulePath] = originalLogModule;
    } else {
      delete require.cache[logModulePath];
    }
    if (originalGoogleApisModule) {
      require.cache[googleApisModulePath] = originalGoogleApisModule;
    } else {
      delete require.cache[googleApisModulePath];
    }
    if (originalCredentialsFileModule) {
      require.cache[credentialsFileModulePath] = originalCredentialsFileModule;
    } else {
      delete require.cache[credentialsFileModulePath];
    }
    if (originalTokenStorageModule) {
      require.cache[tokenStorageModulePath] = originalTokenStorageModule;
    } else {
      delete require.cache[tokenStorageModulePath];
    }
    if (originalOauthClientModule) {
      require.cache[oauthClientModulePath] = originalOauthClientModule;
    } else {
      delete require.cache[oauthClientModulePath];
    }
    if (originalImageNormalizationModule) {
      require.cache[imageNormalizationModulePath] = originalImageNormalizationModule;
    } else {
      delete require.cache[imageNormalizationModulePath];
    }
  }

  return {
    loadedModule,
    restore,
  };
}

test('runGoogleDriveOcrRoute logs structured upload cleanup details with warning identity', async () => {
  const tempDir = createTestTempDir('ocr-google-drive-route');
  const sourceFilePath = path.join(tempDir, 'source.png');
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(sourceFilePath, Buffer.from('png'));

  const warnCalls = [];
  const logDouble = {
    warn(...args) {
      warnCalls.push(args);
    },
    warnOnce() {},
    error() {},
    errorOnce() {},
    debug() {},
    info() {},
  };
  const cleanupWarning = {
    warningCode: 'cleanup:image_normalization_cleanup_failed',
    detailsSafeForLogs: {
      stage: 'cleanup_image_normalization',
      tempDirPath: path.join(tempDir, 'run-1'),
      cleanupWarningCode: 'cleanup:runtime_temp_run_dir_cleanup_failed',
      cleanupWarningDetails: {
        errorCode: 'EPERM',
      },
    },
  };
  const { loadedModule, restore } = loadRouteModuleWithMocks({
    logDouble,
    async normalizeImageForOcrUpload() {
      return {
        uploadFilePath: sourceFilePath,
        uploadFileName: 'normalized.png',
        uploadMimeType: 'image/png',
        metadataSafeForLogs: {},
        cleanup() {
          return cleanupWarning;
        },
      };
    },
  });

  try {
    const result = await loadedModule.runGoogleDriveOcrRoute({
      filePath: sourceFilePath,
      credentialsPath: path.join(tempDir, 'credentials.json'),
      tokenPath: path.join(tempDir, 'token.json'),
      isAborted: () => false,
    });

    assert.equal(result.state, 'success');
    assert.equal(result.summary, 'OCR route succeeded with cleanup warning.');
    assert.deepEqual(result.warnings, ['cleanup:image_normalization_cleanup_failed']);

    const cleanupLog = warnCalls.find((call) => call[0] === 'OCR upload cleanup failed (ignored):');
    assert.ok(cleanupLog);
    assert.deepEqual(cleanupLog[1], {
      warningCode: 'cleanup:image_normalization_cleanup_failed',
      stage: 'cleanup_image_normalization',
      tempDirPath: path.join(tempDir, 'run-1'),
      cleanupWarningCode: 'cleanup:runtime_temp_run_dir_cleanup_failed',
      cleanupWarningDetails: {
        errorCode: 'EPERM',
      },
    });
  } finally {
    restore();
  }
});

test('runGoogleDriveOcrRoute size-checks the normalized PNG input for JP2 sources', async () => {
  const tempDir = createTestTempDir('ocr-google-drive-route-jp2-size-check');
  const sourceFilePath = path.join(tempDir, 'source.jp2');
  const normalizedFilePath = path.join(tempDir, 'normalized.png');
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(sourceFilePath, Buffer.from('jp2'));
  fs.writeFileSync(normalizedFilePath, Buffer.alloc(64, 1));

  const { loadedModule, restore } = loadRouteModuleWithMocks({
    async normalizeImageForOcrUpload() {
      return {
        uploadFilePath: normalizedFilePath,
        uploadFileName: 'source.png',
        uploadMimeType: 'image/png',
        metadataSafeForLogs: {
          normalizedFrom: 'jp2',
          uploadFileExt: 'png',
          uploadMimeType: 'image/png',
        },
        cleanup() {
          return null;
        },
      };
    },
  });

  try {
    const result = await loadedModule.runGoogleDriveOcrRoute({
      filePath: sourceFilePath,
      credentialsPath: path.join(tempDir, 'credentials.json'),
      tokenPath: path.join(tempDir, 'token.json'),
      isAborted: () => false,
    });

    assert.equal(result.state, 'success');
    assert.equal(result.provenance.sourceFileExt, 'jp2');
    assert.equal(result.provenance.metadataSafeForLogs.normalizedFrom, 'jp2');
    assert.equal(result.provenance.metadataSafeForLogs.uploadFileExt, 'png');
  } finally {
    restore();
  }
});

test('runGoogleDriveOcrRoute rejects image uploads at the exact Google OCR image size limit', async () => {
  const tempDir = createTestTempDir('ocr-google-drive-route-image-limit');
  const sourceFilePath = path.join(tempDir, 'scan.png');
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(sourceFilePath, Buffer.from('png'));
  fs.truncateSync(sourceFilePath, 10 * 1024 * 1024);

  const createCalls = [];
  const warnCalls = [];
  const logDouble = {
    warn(...args) {
      warnCalls.push(args);
    },
    warnOnce() {},
    error() {},
    errorOnce() {},
    debug() {},
    info() {},
  };
  const { loadedModule, restore } = loadRouteModuleWithMocks({
    logDouble,
    driveFilesOverrides: {
      async create(request) {
        createCalls.push(request);
        return {
          data: {
            id: 'temp-doc-1',
            name: 'temp-doc-1',
          },
        };
      },
    },
  });

  try {
    const result = await loadedModule.runGoogleDriveOcrRoute({
      filePath: sourceFilePath,
      credentialsPath: path.join(tempDir, 'credentials.json'),
      tokenPath: path.join(tempDir, 'token.json'),
      isAborted: () => false,
    });

    assert.equal(result.state, 'failure');
    assert.equal(result.error.code, 'ocr_image_upload_too_large');
    assert.equal(result.error.detailsSafeForLogs.effectiveInputSizeBytes, 10 * 1024 * 1024);
    assert.equal(result.error.detailsSafeForLogs.providerLimitBytes, 10 * 1024 * 1024);
    assert.equal(result.error.detailsSafeForLogs.providerLimitMB, 10);
    assert.equal(result.error.detailsSafeForLogs.uploadStatus, 'not_uploaded');
    assert.equal(createCalls.length, 0);

    const failureLog = warnCalls.find((call) => call[0] === 'OCR route failed:');
    assert.ok(failureLog);
    assert.deepEqual(failureLog[1], {
      sourceFileExt: 'png',
      sourceFileKind: 'image',
      errorCode: 'ocr_image_upload_too_large',
      summary: 'OCR route blocked before upload: image upload exceeds Google OCR size limit.',
      effectiveInputFileName: 'scan.png',
      effectiveInputSizeBytes: 10 * 1024 * 1024,
      effectiveInputSizeMB: 10,
      providerLimitBytes: 10 * 1024 * 1024,
      providerLimitMB: 10,
      uploadStatus: 'not_uploaded',
      stage: 'preflight',
      reason: 'ocr_image_upload_too_large',
    });
  } finally {
    restore();
  }
});

test('runGoogleDriveOcrRoute rejects normalized image uploads at the exact Google OCR image size limit', async () => {
  const tempDir = createTestTempDir('ocr-google-drive-route-normalized-image-limit');
  const sourceFilePath = path.join(tempDir, 'scan.jp2');
  const normalizedFilePath = path.join(tempDir, 'scan.png');
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(sourceFilePath, Buffer.from('jp2'));
  fs.writeFileSync(normalizedFilePath, Buffer.from('png'));
  fs.truncateSync(normalizedFilePath, 10 * 1024 * 1024);

  let cleanupCalls = 0;
  const createCalls = [];
  const { loadedModule, restore } = loadRouteModuleWithMocks({
    driveFilesOverrides: {
      async create(request) {
        createCalls.push(request);
        return {
          data: {
            id: 'temp-doc-1',
            name: 'temp-doc-1',
          },
        };
      },
    },
    async normalizeImageForOcrUpload() {
      return {
        uploadFilePath: normalizedFilePath,
        uploadFileName: 'scan.png',
        uploadMimeType: 'image/png',
        metadataSafeForLogs: {
          normalizedFrom: 'jp2',
          uploadFileExt: 'png',
          uploadMimeType: 'image/png',
        },
        cleanup() {
          cleanupCalls += 1;
          return null;
        },
      };
    },
  });

  try {
    const result = await loadedModule.runGoogleDriveOcrRoute({
      filePath: sourceFilePath,
      credentialsPath: path.join(tempDir, 'credentials.json'),
      tokenPath: path.join(tempDir, 'token.json'),
      isAborted: () => false,
    });

    assert.equal(result.state, 'failure');
    assert.equal(result.error.code, 'ocr_image_upload_too_large');
    assert.equal(result.error.detailsSafeForLogs.effectiveInputFileName, 'scan.png');
    assert.equal(result.error.detailsSafeForLogs.effectiveInputSizeBytes, 10 * 1024 * 1024);
    assert.equal(createCalls.length, 0);
    assert.equal(cleanupCalls, 1);
  } finally {
    restore();
  }
});

test('runGoogleDriveOcrRoute preserves the existing non-image oversized OCR code path', async () => {
  const tempDir = createTestTempDir('ocr-google-drive-route-pdf-limit');
  const sourceFilePath = path.join(tempDir, 'source.pdf');
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(sourceFilePath, Buffer.from('pdf'));
  fs.truncateSync(sourceFilePath, (50 * 1024 * 1024) + 1);

  const createCalls = [];
  const { loadedModule, restore } = loadRouteModuleWithMocks({
    driveFilesOverrides: {
      async create(request) {
        createCalls.push(request);
        return {
          data: {
            id: 'temp-doc-1',
            name: 'temp-doc-1',
          },
        };
      },
    },
  });

  try {
    const result = await loadedModule.runGoogleDriveOcrRoute({
      filePath: sourceFilePath,
      credentialsPath: path.join(tempDir, 'credentials.json'),
      tokenPath: path.join(tempDir, 'token.json'),
      isAborted: () => false,
    });

    assert.equal(result.state, 'failure');
    assert.equal(result.error.code, 'ocr_input_too_large');
    assert.equal(result.error.detailsSafeForLogs.providerLimitBytes, 50 * 1024 * 1024);
    assert.equal(result.error.detailsSafeForLogs.providerLimitMB, 50);
    assert.equal(createCalls.length, 0);
  } finally {
    restore();
  }
});

test('runGoogleDriveOcrRoute uploads the normalized PNG instead of the source JP2 input', async () => {
  const tempDir = createTestTempDir('ocr-google-drive-route-jp2-upload');
  const sourceFilePath = path.join(tempDir, 'source.jp2');
  const normalizedFilePath = path.join(tempDir, 'normalized.png');
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(sourceFilePath, Buffer.from('jp2'));
  fs.writeFileSync(normalizedFilePath, Buffer.from('png'));

  const createCalls = [];
  const { loadedModule, restore } = loadRouteModuleWithMocks({
    driveFilesOverrides: {
      async create(request) {
        createCalls.push(request);
        return {
          data: {
            id: 'temp-doc-1',
            name: 'temp-doc-1',
          },
        };
      },
    },
    async normalizeImageForOcrUpload() {
      return {
        uploadFilePath: normalizedFilePath,
        uploadFileName: 'normalized.png',
        uploadMimeType: 'image/png',
        metadataSafeForLogs: {
          normalizedFrom: 'jp2',
          uploadFileExt: 'png',
          uploadMimeType: 'image/png',
        },
        cleanup() {
          return {
            warningCode: 'cleanup:image_normalization_cleanup_failed',
            detailsSafeForLogs: {
              stage: 'cleanup_image_normalization',
              tempDirPath: path.join(tempDir, 'run-1'),
              cleanupWarningCode: 'cleanup:runtime_temp_run_dir_cleanup_failed',
              cleanupWarningDetails: {
                errorCode: 'EPERM',
              },
            },
          };
        },
      };
    },
  });

  try {
    const result = await loadedModule.runGoogleDriveOcrRoute({
      filePath: sourceFilePath,
      credentialsPath: path.join(tempDir, 'credentials.json'),
      tokenPath: path.join(tempDir, 'token.json'),
      isAborted: () => false,
    });

    assert.equal(result.state, 'success');
    assert.equal(createCalls.length, 1);
    assert.equal(createCalls[0].requestBody.name, 'normalized.png');
    assert.equal(createCalls[0].media.mimeType, 'image/png');
    assert.equal(createCalls[0].media.body.path, normalizedFilePath);
    assert.deepEqual(result.warnings, ['cleanup:image_normalization_cleanup_failed']);
  } finally {
    restore();
  }
});

test('runGoogleDriveOcrRoute logs structured failure details for JP2 normalization failures', async () => {
  const tempDir = createTestTempDir('ocr-google-drive-route-jp2-failure-log');
  const sourceFilePath = path.join(tempDir, 'source.jp2');
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(sourceFilePath, Buffer.from('jp2'));

  const warnCalls = [];
  const logDouble = {
    warn(...args) {
      warnCalls.push(args);
    },
    warnOnce() {},
    error() {},
    errorOnce() {},
    debug() {},
    info() {},
  };
  const { loadedModule, restore } = loadRouteModuleWithMocks({
    logDouble,
    async normalizeImageForOcrUpload() {
      const err = new Error('decode failed');
      err.code = 'source_to_png_conversion_failed';
      err.detailsSafeForLogs = {
        reason: 'jp2_source_to_png_failed',
        sourceFileExt: 'jp2',
      };
      throw err;
    },
  });

  try {
    const result = await loadedModule.runGoogleDriveOcrRoute({
      filePath: sourceFilePath,
      credentialsPath: path.join(tempDir, 'credentials.json'),
      tokenPath: path.join(tempDir, 'token.json'),
      isAborted: () => false,
    });

    assert.equal(result.state, 'failure');
    assert.equal(result.error.code, 'unreadable_or_corrupt');

    const failureLog = warnCalls.find((call) => call[0] === 'OCR route failed:');
    assert.ok(failureLog);
    assert.deepEqual(failureLog[1], {
      sourceFileExt: 'jp2',
      sourceFileKind: 'image',
      errorCode: 'unreadable_or_corrupt',
      summary: 'OCR route failed before upload: JP2-to-PNG normalization failed.',
      stage: 'preflight',
      reason: 'jp2_source_to_png_failed',
      errorName: 'Error',
      errorMessage: 'decode failed',
    });
  } finally {
    restore();
  }
});

test('runGoogleDriveOcrRoute logs structured provider details for upload-convert failures', async () => {
  const tempDir = createTestTempDir('ocr-google-drive-route-jp2-provider-failure-log');
  const sourceFilePath = path.join(tempDir, 'source.jp2');
  const normalizedFilePath = path.join(tempDir, 'normalized.png');
  fs.mkdirSync(tempDir, { recursive: true });
  fs.writeFileSync(sourceFilePath, Buffer.from('jp2'));
  fs.writeFileSync(normalizedFilePath, Buffer.from('png'));

  const warnCalls = [];
  const logDouble = {
    warn(...args) {
      warnCalls.push(args);
    },
    warnOnce() {},
    error() {},
    errorOnce() {},
    debug() {},
    info() {},
  };
  const uploadError = new Error('Google upload rejected the PNG payload.');
  uploadError.response = {
    status: 400,
    data: {
      error: {
        message: 'Bad Request',
      },
    },
  };
  const { loadedModule, restore } = loadRouteModuleWithMocks({
    logDouble,
    driveFilesOverrides: {
      async create() {
        throw uploadError;
      },
    },
    async normalizeImageForOcrUpload() {
      return {
        uploadFilePath: normalizedFilePath,
        uploadFileName: 'normalized.png',
        uploadMimeType: 'image/png',
        metadataSafeForLogs: {
          normalizedFrom: 'jp2',
          decodedWidth: 2400,
          decodedHeight: 3200,
          decodedComponentCount: 3,
          decodedBitsPerSample: 8,
          normalizedColorMode: 'grayscale_palette_png',
          uploadFileExt: 'png',
          uploadMimeType: 'image/png',
        },
        cleanup() {
          return null;
        },
      };
    },
  });

  try {
    const result = await loadedModule.runGoogleDriveOcrRoute({
      filePath: sourceFilePath,
      credentialsPath: path.join(tempDir, 'credentials.json'),
      tokenPath: path.join(tempDir, 'token.json'),
      isAborted: () => false,
    });

    assert.equal(result.state, 'failure');
    assert.equal(result.error.code, 'ocr_conversion_failed');

    const failureLog = warnCalls.find((call) => call[0] === 'OCR route failed:');
    assert.ok(failureLog);
    assert.deepEqual(failureLog[1], {
      sourceFileExt: 'jp2',
      sourceFileKind: 'image',
      errorCode: 'ocr_conversion_failed',
      summary: 'OCR route failed during provider workflow.',
      normalizedFrom: 'jp2',
      decodedWidth: 2400,
      decodedHeight: 3200,
      decodedComponentCount: 3,
      decodedBitsPerSample: 8,
      normalizedColorMode: 'grayscale_palette_png',
      uploadFileExt: 'png',
      uploadMimeType: 'image/png',
      stage: 'upload_convert',
      errorName: 'Error',
      errorMessage: 'Google upload rejected the PNG payload.',
      statusCode: 400,
      reasonCode: '',
      errorsReason: '',
      errorInfoReason: '',
      providerStatus: '',
      providerService: '',
      providerConsumer: '',
      providerMessage: 'Bad Request',
      networkErrorCode: '',
    });
  } finally {
    restore();
  }
});
