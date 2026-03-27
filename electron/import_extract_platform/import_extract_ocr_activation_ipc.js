// electron/import_extract_platform/import_extract_ocr_activation_ipc.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-process OCR activation IPC for Google Drive OCR setup and token bootstrap.
// Responsibilities:
// - Authorize OCR activation requests to the main window sender.
// - Prepare bundled credentials readiness without launching the OAuth browser flow.
// - Launch the OAuth browser flow only after renderer-side disclosure consent.
// - Persist encrypted token material for later OCR setup validation.
// - Return structured readiness/activation results for OCR recovery and setup flows.

// =============================================================================
// Imports / logger
// =============================================================================

const fs = require('fs');
const path = require('path');
const { BrowserWindow } = require('electron');
const { authenticate } = require('@google-cloud/local-auth');
const Log = require('../log');
const { describePersistedGoogleToken } = require('./ocr_google_drive_oauth_client');
const { validateGoogleDriveOcrSetup } = require('./ocr_google_drive_setup_validation');
const { writeEncryptedTokenFile } = require('./ocr_google_drive_token_storage');

const log = Log.get('import-extract-ocr-activation');

// =============================================================================
// Constants / config
// =============================================================================

const OCR_SCOPES = Object.freeze(['https://www.googleapis.com/auth/drive.file']);
const PREPARE_CHANNEL = 'import-extract-prepare-ocr-activation';
const LAUNCH_CHANNEL = 'import-extract-launch-ocr-activation';

// =============================================================================
// Helpers
// =============================================================================

function safeErrorName(err) {
  return String(err && err.name ? err.name : 'Error');
}

function safeErrorMessage(err) {
  return String(err && err.message ? err.message : err || '');
}

function hasFile(filePath) {
  return typeof filePath === 'string' && filePath.trim() !== '' && fs.existsSync(filePath);
}

function hasNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function hasValidCredentialsShape(parsedCredentials) {
  if (!parsedCredentials || typeof parsedCredentials !== 'object') return false;

  const candidate = parsedCredentials.installed || parsedCredentials.web;
  if (!candidate || typeof candidate !== 'object') return false;
  if (!hasNonEmptyString(candidate.client_id)) return false;
  if (!hasNonEmptyString(candidate.client_secret)) return false;
  if (!Array.isArray(candidate.redirect_uris)) return false;
  return candidate.redirect_uris.some(hasNonEmptyString);
}

function readJsonFileStrict(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

function ensureParentDir(filePath) {
  const parent = path.dirname(filePath);
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
}

function mapCodeToAlertKey(code) {
  if (code === 'setup_incomplete' || code === 'credentials_missing') {
    return 'renderer.alerts.import_extract_ocr_setup_missing_credentials';
  }
  if (code === 'ocr_activation_cancelled') {
    return 'renderer.alerts.import_extract_ocr_activation_cancelled';
  }
  if (code === 'ocr_activation_required') {
    return 'renderer.alerts.import_extract_ocr_activation_required';
  }
  if (code === 'ocr_token_state_invalid') {
    return 'renderer.alerts.import_extract_ocr_token_state_invalid';
  }
  if (code === 'connectivity_failed') {
    return 'renderer.alerts.import_extract_ocr_connectivity_failed';
  }
  if (code === 'quota_or_rate_limited') {
    return 'renderer.alerts.import_extract_ocr_quota_or_rate_limited';
  }
  return 'renderer.alerts.import_extract_ocr_activation_failed';
}

function mapValidationToActivationResult(validationResult) {
  if (validationResult && validationResult.ok === true) {
    return {
      ok: true,
      state: 'ready',
      code: '',
      alertKey: 'renderer.alerts.import_extract_ocr_activation_success',
      detailsSafeForLogs: {},
    };
  }

  const code = validationResult
    && validationResult.error
    && typeof validationResult.error.code === 'string'
    ? validationResult.error.code
    : 'platform_runtime_failed';
  const state = validationResult && typeof validationResult.state === 'string'
    ? validationResult.state
    : 'failure';

  return {
    ok: false,
    state,
    code,
    alertKey: mapCodeToAlertKey(code),
    detailsSafeForLogs: {},
  };
}

function buildFailure({
  state = 'failure',
  code = 'platform_runtime_failed',
  alertKey = '',
  detailsSafeForLogs = {},
} = {}) {
  return {
    ok: false,
    state,
    code,
    alertKey: alertKey || mapCodeToAlertKey(code),
    detailsSafeForLogs,
  };
}

function buildPrepareFailure({
  code = 'platform_runtime_failed',
  alertKey = '',
  detailsSafeForLogs = {},
} = {}) {
  return {
    ok: false,
    ready: false,
    code,
    alertKey: alertKey || mapCodeToAlertKey(code),
    detailsSafeForLogs,
  };
}

function buildPrepareSuccess() {
  return {
    ok: true,
    ready: true,
    code: '',
    alertKey: '',
    detailsSafeForLogs: {},
  };
}

function toPrepareFailure(failure) {
  if (!failure || failure.ok === true) {
    return buildPrepareFailure();
  }
  return buildPrepareFailure({
    code: failure.code || 'platform_runtime_failed',
    alertKey: failure.alertKey || '',
    detailsSafeForLogs: failure.detailsSafeForLogs || {},
  });
}

function mapAuthenticateError(err) {
  const name = safeErrorName(err);
  const message = safeErrorMessage(err);
  const lowered = `${name} ${message}`.toLowerCase();

  if (lowered.includes('access_denied')
    || lowered.includes('cancel')
    || lowered.includes('canceled')
    || lowered.includes('denied')
    || lowered.includes('consent')) {
    return buildFailure({
      state: 'cancelled',
      code: 'ocr_activation_cancelled',
      alertKey: 'renderer.alerts.import_extract_ocr_activation_cancelled',
      detailsSafeForLogs: {
        stage: 'oauth_authenticate',
        errorName: name,
        errorMessage: message,
      },
    });
  }

  if (lowered.includes('invalid_grant')
    || lowered.includes('invalid_client')
    || lowered.includes('unauthorized')
    || lowered.includes('auth')) {
    return buildFailure({
      state: 'failure',
      code: 'auth_failed',
      detailsSafeForLogs: {
        stage: 'oauth_authenticate',
        errorName: name,
        errorMessage: message,
      },
    });
  }

  if (lowered.includes('econn')
    || lowered.includes('timedout')
    || lowered.includes('enotfound')
    || lowered.includes('socket')
    || lowered.includes('network')) {
    return buildFailure({
      state: 'failure',
      code: 'connectivity_failed',
      detailsSafeForLogs: {
        stage: 'oauth_authenticate',
        errorName: name,
        errorMessage: message,
      },
    });
  }

  return buildFailure({
    state: 'failure',
    code: 'platform_runtime_failed',
    detailsSafeForLogs: {
      stage: 'oauth_authenticate',
      errorName: name,
      errorMessage: message,
    },
  });
}

function validateStoredCredentialsFile({ credentialsPath, stage = 'credentials_validate' } = {}) {
  if (!hasFile(credentialsPath)) {
    return buildFailure({
      state: 'setup_incomplete',
      code: 'setup_incomplete',
      detailsSafeForLogs: {
        stage,
        reason: 'credentials_missing',
      },
    });
  }

  let parsed = null;
  try {
    parsed = readJsonFileStrict(credentialsPath);
  } catch (err) {
    return buildFailure({
      state: 'setup_incomplete',
      code: 'credentials_missing',
      alertKey: 'renderer.alerts.import_extract_ocr_setup_invalid_credentials',
      detailsSafeForLogs: {
        stage,
        reason: 'read_failed',
        errorName: safeErrorName(err),
        errorMessage: safeErrorMessage(err),
      },
    });
  }

  if (!hasValidCredentialsShape(parsed)) {
    return buildFailure({
      state: 'setup_incomplete',
      code: 'credentials_missing',
      alertKey: 'renderer.alerts.import_extract_ocr_setup_invalid_credentials',
      detailsSafeForLogs: {
        stage,
        reason: 'invalid_credentials_shape',
      },
    });
  }

  return {
    ok: true,
    parsed,
  };
}

function isAuthorizedSender(event, mainWin, {
  warnKey,
  unauthorizedMessage,
  senderValidationMessage,
} = {}) {
  try {
    const senderWin = event && event.sender
      ? BrowserWindow.fromWebContents(event.sender)
      : null;
    if (!mainWin || senderWin !== mainWin) {
      log.warnOnce(
        warnKey,
        unauthorizedMessage
      );
      return false;
    }
    return true;
  } catch (err) {
    log.warn(senderValidationMessage, err);
    return false;
  }
}

function extractSerializableCredentials(authClient) {
  const candidate = authClient && typeof authClient === 'object'
    ? authClient.credentials
    : null;
  if (!candidate || typeof candidate !== 'object') return null;

  const tokenState = describePersistedGoogleToken(candidate);
  if (!tokenState.acceptablePersistedTokenShape) return null;

  return { ...candidate };
}

function resolveRuntimePaths(resolvePaths) {
  const paths = resolvePaths();
  return {
    credentialsPath: String(paths && paths.credentialsPath ? paths.credentialsPath : ''),
    tokenPath: String(paths && paths.tokenPath ? paths.tokenPath : ''),
  };
}

// =============================================================================
// IPC registration / handler
// =============================================================================

function registerIpc(ipcMain, { getWindows, resolvePaths } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[import_extract_ocr_activation] registerIpc requires ipcMain');
  }
  if (typeof getWindows !== 'function') {
    throw new Error('[import_extract_ocr_activation] registerIpc requires getWindows()');
  }
  if (typeof resolvePaths !== 'function') {
    throw new Error('[import_extract_ocr_activation] registerIpc requires resolvePaths()');
  }

  const resolveMainWin = () => {
    const windows = getWindows() || {};
    return windows.mainWin || null;
  };

  ipcMain.handle(PREPARE_CHANNEL, async (event) => {
    const mainWin = resolveMainWin();
    try {
      if (!isAuthorizedSender(event, mainWin, {
        warnKey: 'import_extract_ocr_activation.prepare.unauthorized',
        unauthorizedMessage: `${PREPARE_CHANNEL} unauthorized (ignored).`,
        senderValidationMessage: `${PREPARE_CHANNEL} sender validation failed:`,
      })) {
        return buildPrepareFailure({
          code: 'platform_runtime_failed',
          detailsSafeForLogs: {
            stage: 'authorization',
            reason: 'unauthorized_sender',
          },
        });
      }

      const { credentialsPath, tokenPath } = resolveRuntimePaths(resolvePaths);
      if (!credentialsPath || !tokenPath) {
        log.error('import/extract OCR activation prepare runtime paths unavailable:', {
          stage: 'resolve_paths',
          credentialsPathPresent: !!credentialsPath,
          tokenPathPresent: !!tokenPath,
        });
        return buildPrepareFailure({
          code: 'platform_runtime_failed',
          detailsSafeForLogs: {
            stage: 'resolve_paths',
            reason: 'missing_runtime_paths',
          },
        });
      }

      const readiness = validateStoredCredentialsFile({
        credentialsPath,
        stage: 'credentials_prepare_validate',
      });
      if (!readiness.ok) {
        const safeFailure = toPrepareFailure(readiness);
        log.warn('import/extract OCR activation prepare blocked during bundled credentials readiness:', {
          code: safeFailure.code,
          detailsSafeForLogs: safeFailure.detailsSafeForLogs,
        });
        return safeFailure;
      }

      const result = buildPrepareSuccess();
      log.info('import/extract OCR activation prepare completed:', {
        ok: result.ok,
        ready: result.ready,
        bundledCredentialsReady: true,
      });
      return result;
    } catch (err) {
      const failure = buildPrepareFailure({
        code: 'platform_runtime_failed',
        detailsSafeForLogs: {
          stage: 'ipc_prepare_handler_failure',
          errorName: safeErrorName(err),
          errorMessage: safeErrorMessage(err),
        },
      });
      log.error(`${PREPARE_CHANNEL} failed unexpectedly:`, failure.detailsSafeForLogs);
      return failure;
    }
  });

  ipcMain.handle(LAUNCH_CHANNEL, async (event) => {
    const mainWin = resolveMainWin();
    try {
      if (!isAuthorizedSender(event, mainWin, {
        warnKey: 'import_extract_ocr_activation.launch.unauthorized',
        unauthorizedMessage: `${LAUNCH_CHANNEL} unauthorized (ignored).`,
        senderValidationMessage: `${LAUNCH_CHANNEL} sender validation failed:`,
      })) {
        return buildFailure({
          state: 'failure',
          code: 'platform_runtime_failed',
          detailsSafeForLogs: {
            stage: 'authorization',
            reason: 'unauthorized_sender',
          },
        });
      }

      const { credentialsPath, tokenPath } = resolveRuntimePaths(resolvePaths);
      if (!credentialsPath || !tokenPath) {
        log.error('import/extract OCR activation launch runtime paths unavailable:', {
          stage: 'resolve_paths',
          credentialsPathPresent: !!credentialsPath,
          tokenPathPresent: !!tokenPath,
        });
        return buildFailure({
          state: 'failure',
          code: 'platform_runtime_failed',
          detailsSafeForLogs: {
            stage: 'resolve_paths',
            reason: 'missing_runtime_paths',
          },
        });
      }

      const credentialsValidation = validateStoredCredentialsFile({
        credentialsPath,
        stage: 'credentials_launch_validate',
      });
      if (!credentialsValidation.ok) {
        log.warn('import/extract OCR activation launch blocked because credentials are not ready:', {
          state: credentialsValidation.state,
          code: credentialsValidation.code,
          detailsSafeForLogs: credentialsValidation.detailsSafeForLogs,
        });
        return credentialsValidation;
      }

      let authClient = null;
      try {
        authClient = await authenticate({
          scopes: OCR_SCOPES,
          keyfilePath: credentialsPath,
        });
      } catch (authErr) {
        const authFailure = mapAuthenticateError(authErr);
        if (authFailure.code === 'ocr_activation_cancelled') {
          log.info('import/extract OCR activation cancelled during authentication:', {
            state: authFailure.state,
            code: authFailure.code,
            detailsSafeForLogs: authFailure.detailsSafeForLogs,
          });
        } else {
          log.warn('import/extract OCR activation blocked during authentication:', {
            state: authFailure.state,
            code: authFailure.code,
            detailsSafeForLogs: authFailure.detailsSafeForLogs,
          });
        }
        return authFailure;
      }

      const serializableCredentials = extractSerializableCredentials(authClient);
      if (!serializableCredentials) {
        log.warn('import/extract OCR activation returned no serializable credentials:', {
          stage: 'token_serialize',
          reason: 'missing_access_and_refresh_token',
        });
        return buildFailure({
          state: 'failure',
          code: 'auth_failed',
          detailsSafeForLogs: {
            stage: 'token_serialize',
            reason: 'missing_access_and_refresh_token',
          },
        });
      }

      ensureParentDir(tokenPath);
      writeEncryptedTokenFile({
        tokenPath,
        tokenPayload: serializableCredentials,
      });

      const validation = await validateGoogleDriveOcrSetup({
        credentialsPath,
        tokenPath,
        probeApiPath: true,
      });
      const mapped = mapValidationToActivationResult(validation);
      const telemetry = {
        ok: mapped.ok,
        state: mapped.state,
        code: mapped.code,
      };

      if (mapped.ok) {
        log.info('import/extract OCR activation launch completed:', telemetry);
      } else {
        log.warn('import/extract OCR activation launch completed but setup is not ready:', telemetry);
      }

      return mapped;
    } catch (err) {
      const failure = buildFailure({
        state: 'failure',
        code: 'platform_runtime_failed',
        detailsSafeForLogs: {
          stage: 'ipc_launch_handler_failure',
          errorName: safeErrorName(err),
          errorMessage: safeErrorMessage(err),
        },
      });
      log.error(`${LAUNCH_CHANNEL} failed unexpectedly:`, failure.detailsSafeForLogs);
      return failure;
    }
  });
}

// =============================================================================
// Module surface
// =============================================================================

module.exports = {
  registerIpc,
};

// =============================================================================
// End of electron/import_extract_platform/import_extract_ocr_activation_ipc.js
// =============================================================================
