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
          return {
            files: {
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
            },
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
