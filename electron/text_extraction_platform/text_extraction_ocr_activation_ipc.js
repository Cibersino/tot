// electron/text_extraction_platform/text_extraction_ocr_activation_ipc.js
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
const { BrowserWindow, shell } = require('electron');
const Log = require('../log');
const { PROVIDER_API_DISABLED_CODE } = require('./ocr_google_drive_provider_failure');
const { readGoogleOAuthCredentialsFile } = require('./ocr_google_drive_credentials_file');
const { describePersistedGoogleToken } = require('./ocr_google_drive_oauth_client');
const { authenticateGoogleLoopback } = require('./ocr_google_drive_secure_oauth');
const { validateGoogleDriveOcrSetup } = require('./ocr_google_drive_setup_validation');
const { writeEncryptedTokenFile } = require('./ocr_google_drive_token_storage');

const log = Log.get('text-extraction-ocr-activation');

// =============================================================================
// Constants / config
// =============================================================================

const OCR_SCOPES = Object.freeze(['https://www.googleapis.com/auth/drive.file']);
const PREPARE_CHANNEL = 'text-extraction-prepare-ocr-activation';
const LAUNCH_CHANNEL = 'text-extraction-launch-ocr-activation';

// =============================================================================
// Helpers
// =============================================================================

function safeErrorName(err) {
  return String(err && err.name ? err.name : 'Error');
}

function safeErrorMessage(err) {
  return String(err && err.message ? err.message : err || '');
}

function ensureParentDir(filePath) {
  const parent = path.dirname(filePath);
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
}

function mapCodeToAlertKey(code) {
  if (code === 'credentials_missing') {
    return 'renderer.alerts.text_extraction_ocr_setup_missing_credentials';
  }
  if (code === 'credentials_invalid') {
    return 'renderer.alerts.text_extraction_ocr_setup_invalid_credentials';
  }
  if (code === PROVIDER_API_DISABLED_CODE) {
    return 'renderer.alerts.text_extraction_ocr_unavailable';
  }
  if (code === 'ocr_activation_cancelled') {
    return 'renderer.alerts.text_extraction_ocr_activation_cancelled';
  }
  if (code === 'ocr_activation_required') {
    return 'renderer.alerts.text_extraction_ocr_activation_required';
  }
  if (code === 'ocr_token_state_invalid') {
    return 'renderer.alerts.text_extraction_ocr_token_state_invalid';
  }
  if (code === 'connectivity_failed') {
    return 'renderer.alerts.text_extraction_ocr_connectivity_failed';
  }
  if (code === 'quota_or_rate_limited') {
    return 'renderer.alerts.text_extraction_ocr_quota_or_rate_limited';
  }
  return 'renderer.alerts.text_extraction_ocr_activation_failed';
}

function mapValidationToActivationResult(validationResult) {
  if (validationResult && validationResult.ok === true) {
    return {
      ok: true,
      state: 'ready',
      code: '',
      alertKey: 'renderer.alerts.text_extraction_ocr_activation_success',
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

  if (String(err && err.code ? err.code : '') === 'oauth_state_invalid') {
    return buildFailure({
      state: 'failure',
      code: 'auth_failed',
      detailsSafeForLogs: {
        stage: 'oauth_authenticate',
        reason: 'oauth_state_invalid',
        errorName: name,
        errorMessage: message,
      },
    });
  }

  if (String(err && err.code ? err.code : '') === 'oauth_timeout') {
    return buildFailure({
      state: 'failure',
      code: 'platform_runtime_failed',
      detailsSafeForLogs: {
        stage: 'oauth_authenticate',
        reason: 'oauth_timeout',
        errorName: name,
        errorMessage: message,
      },
    });
  }

  if (lowered.includes('access_denied')
    || lowered.includes('cancel')
    || lowered.includes('canceled')
    || lowered.includes('denied')
    || lowered.includes('consent')) {
    return buildFailure({
      state: 'cancelled',
      code: 'ocr_activation_cancelled',
      alertKey: 'renderer.alerts.text_extraction_ocr_activation_cancelled',
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

function validateStoredCredentialsFile({
  credentialsPath,
  bundledCredentialsFailureCode = '',
  bundledCredentialsFailureReason = '',
  bundledCredentialsFailureDetailsSafeForLogs = {},
  stage = 'credentials_validate',
} = {}) {
  if (bundledCredentialsFailureCode) {
    return buildFailure({
      state: 'failure',
      code: bundledCredentialsFailureCode,
      detailsSafeForLogs: {
        stage,
        reason: bundledCredentialsFailureReason || 'bundled_credentials_unavailable',
        ...bundledCredentialsFailureDetailsSafeForLogs,
      },
    });
  }

  const credentialsRead = readGoogleOAuthCredentialsFile(credentialsPath);
  if (!credentialsRead.ok && credentialsRead.code === 'missing_file') {
    return buildFailure({
      state: 'failure',
      code: 'credentials_missing',
      detailsSafeForLogs: {
        stage,
        reason: 'credentials_missing',
      },
    });
  }

  if (!credentialsRead.ok && credentialsRead.code !== 'invalid_shape') {
    return buildFailure({
      state: 'failure',
      code: 'credentials_invalid',
      alertKey: 'renderer.alerts.text_extraction_ocr_setup_invalid_credentials',
      detailsSafeForLogs: {
        stage,
        reason: 'read_failed',
        errorName: credentialsRead.errorName || '',
        errorMessage: credentialsRead.errorMessage || '',
      },
    });
  }

  if (!credentialsRead.ok) {
    return buildFailure({
      state: 'failure',
      code: 'credentials_invalid',
      alertKey: 'renderer.alerts.text_extraction_ocr_setup_invalid_credentials',
      detailsSafeForLogs: {
        stage,
        reason: 'invalid_credentials_shape',
      },
    });
  }

  return {
    ok: true,
    parsed: credentialsRead.parsed,
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
    bundledCredentialsFailureCode: String(
      paths && paths.bundledCredentialsFailureCode ? paths.bundledCredentialsFailureCode : ''
    ),
    bundledCredentialsFailureReason: String(
      paths && paths.bundledCredentialsFailureReason ? paths.bundledCredentialsFailureReason : ''
    ),
    bundledCredentialsFailureDetailsSafeForLogs:
      paths
      && paths.bundledCredentialsFailureDetailsSafeForLogs
      && typeof paths.bundledCredentialsFailureDetailsSafeForLogs === 'object'
        ? paths.bundledCredentialsFailureDetailsSafeForLogs
        : {},
  };
}

// =============================================================================
// IPC registration / handler
// =============================================================================

function registerIpc(
  ipcMain,
  {
    getWindows,
    resolvePaths,
    launchSecureGoogleOAuth = authenticateGoogleLoopback,
  } = {}
) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[text_extraction_ocr_activation] registerIpc requires ipcMain');
  }
  if (typeof getWindows !== 'function') {
    throw new Error('[text_extraction_ocr_activation] registerIpc requires getWindows()');
  }
  if (typeof resolvePaths !== 'function') {
    throw new Error('[text_extraction_ocr_activation] registerIpc requires resolvePaths()');
  }
  if (typeof launchSecureGoogleOAuth !== 'function') {
    throw new Error('[text_extraction_ocr_activation] registerIpc requires launchSecureGoogleOAuth()');
  }

  const resolveMainWin = () => {
    const windows = getWindows() || {};
    return windows.mainWin || null;
  };

  ipcMain.handle(PREPARE_CHANNEL, async (event) => {
    const mainWin = resolveMainWin();
    try {
      if (!isAuthorizedSender(event, mainWin, {
        warnKey: 'text_extraction_ocr_activation.prepare.unauthorized',
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

      const {
        credentialsPath,
        tokenPath,
        bundledCredentialsFailureCode,
        bundledCredentialsFailureReason,
        bundledCredentialsFailureDetailsSafeForLogs,
      } = resolveRuntimePaths(resolvePaths);
      if (!credentialsPath || !tokenPath) {
        log.error('text extraction OCR activation prepare runtime paths unavailable:', {
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
        bundledCredentialsFailureCode,
        bundledCredentialsFailureReason,
        bundledCredentialsFailureDetailsSafeForLogs,
        stage: 'credentials_prepare_validate',
      });
      if (!readiness.ok) {
        const safeFailure = toPrepareFailure(readiness);
        log.warn('text extraction OCR activation prepare blocked during bundled credentials readiness:', {
          code: safeFailure.code,
          detailsSafeForLogs: safeFailure.detailsSafeForLogs,
        });
        return safeFailure;
      }

      const result = buildPrepareSuccess();
      log.info('text extraction OCR activation prepare completed:', {
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
        warnKey: 'text_extraction_ocr_activation.launch.unauthorized',
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

      const {
        credentialsPath,
        tokenPath,
        bundledCredentialsFailureCode,
        bundledCredentialsFailureReason,
        bundledCredentialsFailureDetailsSafeForLogs,
      } = resolveRuntimePaths(resolvePaths);
      if (!credentialsPath || !tokenPath) {
        log.error('text extraction OCR activation launch runtime paths unavailable:', {
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
        bundledCredentialsFailureCode,
        bundledCredentialsFailureReason,
        bundledCredentialsFailureDetailsSafeForLogs,
        stage: 'credentials_launch_validate',
      });
      if (!credentialsValidation.ok) {
        log.warn('text extraction OCR activation launch blocked because credentials are not ready:', {
          state: credentialsValidation.state,
          code: credentialsValidation.code,
          detailsSafeForLogs: credentialsValidation.detailsSafeForLogs,
        });
        return credentialsValidation;
      }

      let authClient = null;
      if (!shell || typeof shell.openExternal !== 'function') {
        log.warn('text extraction OCR activation launch blocked: browser opener unavailable.', {
          stage: 'oauth_authenticate',
        });
        return buildFailure({
          state: 'failure',
          code: 'platform_runtime_failed',
          detailsSafeForLogs: {
            stage: 'oauth_authenticate',
            reason: 'browser_launcher_unavailable',
          },
        });
      }
      try {
        authClient = await launchSecureGoogleOAuth({
          credentialsJson: credentialsValidation.parsed,
          scopes: OCR_SCOPES,
          openExternal: (url) => shell.openExternal(url),
        });
      } catch (authErr) {
        const authFailure = mapAuthenticateError(authErr);
        if (authFailure.code === 'ocr_activation_cancelled') {
          log.info('text extraction OCR activation cancelled during authentication:', {
            state: authFailure.state,
            code: authFailure.code,
            detailsSafeForLogs: authFailure.detailsSafeForLogs,
          });
        } else {
          log.warn('text extraction OCR activation blocked during authentication:', {
            state: authFailure.state,
            code: authFailure.code,
            detailsSafeForLogs: authFailure.detailsSafeForLogs,
          });
        }
        return authFailure;
      }

      const serializableCredentials = extractSerializableCredentials(authClient);
      if (!serializableCredentials) {
        log.warn('text extraction OCR activation returned no serializable credentials:', {
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
        log.info('text extraction OCR activation launch completed:', telemetry);
      } else {
        log.warn('text extraction OCR activation launch completed but setup is not ready:', telemetry);
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
// End of electron/text_extraction_platform/text_extraction_ocr_activation_ipc.js
// =============================================================================


