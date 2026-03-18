'use strict';

const Log = require('../log');
const { validateGoogleDriveOcrSetup } = require('./ocr_google_drive_setup_validation');

const log = Log.get('ocr-google-drive-setup-ipc');

function buildUnexpectedFailureResult() {
  return {
    ok: false,
    state: 'failure',
    summary: 'Google OCR setup validation failed unexpectedly.',
    checks: {
      credentialsPresent: false,
      tokenPresent: false,
      credentialsValid: false,
      tokenValid: false,
      tokenHasAccessToken: false,
      tokenHasRefreshToken: false,
      apiProbeAttempted: false,
      apiReachable: false,
      apiStatusCode: null,
      apiReasonCode: '',
      apiIssueSubtype: '',
    },
    error: {
      code: 'platform_runtime_failed',
      issueType: 'platform_runtime',
      userMessageKey: 'ocr.google_drive.validation.platform_runtime_failed',
      userMessageFallback:
        'Google OCR setup validation failed due to a runtime/platform error.',
      userActionKey: 'ocr.google_drive.validation.retry',
      detailsSafeForLogs: {
        reason: 'ipc_handler_failure',
      },
    },
  };
}

function resolvePayloadOptions(payload) {
  const raw = payload && typeof payload === 'object' ? payload : {};
  return {
    probeApiPath: raw.probeApiPath !== false,
    timeoutMs: raw.timeoutMs,
  };
}

function registerIpc(ipcMain, { resolvePaths } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[ocr-google-drive-setup-ipc] registerIpc requires ipcMain');
  }
  if (typeof resolvePaths !== 'function') {
    throw new Error('[ocr-google-drive-setup-ipc] registerIpc requires resolvePaths()');
  }

  ipcMain.handle('ocr-google-drive-validate-setup', async (_event, payload = {}) => {
    try {
      const paths = resolvePaths();
      const options = resolvePayloadOptions(payload);

      const result = await validateGoogleDriveOcrSetup({
        credentialsPath: paths.credentialsPath,
        tokenPath: paths.tokenPath,
        probeApiPath: options.probeApiPath,
        timeoutMs: options.timeoutMs,
      });

      const telemetry = {
        state: result.state,
        ok: result.ok,
        code: result.error ? result.error.code : null,
        probeApiPath: options.probeApiPath,
        checks: result.checks,
      };

      if (result.ok) {
        log.info('ocr-google-drive setup validation ready:', telemetry);
      } else if (result.error && result.error.code === 'platform_runtime_failed') {
        log.error('ocr-google-drive setup validation failed (runtime):', telemetry, result.error.detailsSafeForLogs);
      } else {
        log.warn('ocr-google-drive setup validation blocked/failed:', telemetry, result.error ? result.error.detailsSafeForLogs : {});
      }

      return result;
    } catch (err) {
      const failure = buildUnexpectedFailureResult();
      failure.error.detailsSafeForLogs.errorName =
        String(err && err.name ? err.name : 'Error');
      failure.error.detailsSafeForLogs.errorMessage =
        String(err && err.message ? err.message : err || '');

      log.error('ocr-google-drive-validate-setup handler failed:', failure.error.detailsSafeForLogs);
      return failure;
    }
  });
}

module.exports = {
  registerIpc,
};
