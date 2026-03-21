// electron/import_extract_platform/import_extract_ocr_activation_ipc.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-process OCR activation IPC for Google Drive OCR setup and token bootstrap.
// Responsibilities:
// - Authorize OCR activation requests to the main window sender.
// - Import and validate OAuth credentials JSON when local credentials are missing.
// - Run the local-auth browser flow and classify activation/authentication failures.
// - Persist encrypted token material for later OCR setup validation.
// - Return a structured activation result for OCR recovery and setup flows.

// =============================================================================
// Imports / logger
// =============================================================================

const fs = require('fs');
const path = require('path');
const { BrowserWindow, dialog } = require('electron');
const { authenticate } = require('@google-cloud/local-auth');
const Log = require('../log');
const { validateGoogleDriveOcrSetup } = require('./ocr_google_drive_setup_validation');
const { writeEncryptedTokenFile } = require('./ocr_google_drive_token_storage');

const log = Log.get('import-extract-ocr-activation');

// =============================================================================
// Constants / config
// =============================================================================

const OCR_SCOPES = Object.freeze(['https://www.googleapis.com/auth/drive.file']);

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
  if (code === 'ocr_activation_required') {
    return 'renderer.alerts.import_extract_ocr_activation_cancelled';
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
      state: 'ocr_activation_required',
      code: 'ocr_activation_required',
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

async function promptCredentialsFile(mainWin) {
  const result = await dialog.showOpenDialog(mainWin || undefined, {
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });

  if (!result || result.canceled || !Array.isArray(result.filePaths) || !result.filePaths[0]) {
    return {
      ok: false,
      cancelled: true,
      filePath: '',
    };
  }

  return {
    ok: true,
    cancelled: false,
    filePath: String(result.filePaths[0]),
  };
}

function importCredentialsFile({ sourcePath, targetPath }) {
  try {
    if (!hasFile(sourcePath)) {
      return buildFailure({
        state: 'setup_incomplete',
        code: 'setup_incomplete',
        detailsSafeForLogs: {
          stage: 'credentials_import',
          reason: 'source_missing',
        },
      });
    }

    const parsed = readJsonFileStrict(sourcePath);
    if (!hasValidCredentialsShape(parsed)) {
      return buildFailure({
        state: 'setup_incomplete',
        code: 'credentials_missing',
        alertKey: 'renderer.alerts.import_extract_ocr_setup_invalid_credentials',
        detailsSafeForLogs: {
          stage: 'credentials_import',
          reason: 'invalid_credentials_shape',
        },
      });
    }

    ensureParentDir(targetPath);
    fs.writeFileSync(targetPath, JSON.stringify(parsed, null, 2), 'utf8');
    return {
      ok: true,
      state: 'ready',
      code: '',
      alertKey: '',
      detailsSafeForLogs: {
        stage: 'credentials_import',
        imported: true,
      },
    };
  } catch (err) {
    return buildFailure({
      state: 'setup_incomplete',
      code: 'credentials_missing',
      alertKey: 'renderer.alerts.import_extract_ocr_setup_invalid_credentials',
      detailsSafeForLogs: {
        stage: 'credentials_import',
        reason: 'import_failed',
        errorName: safeErrorName(err),
        errorMessage: safeErrorMessage(err),
      },
    });
  }
}

function isAuthorizedSender(event, mainWin) {
  try {
    const senderWin = event && event.sender
      ? BrowserWindow.fromWebContents(event.sender)
      : null;
    if (!mainWin || senderWin !== mainWin) {
      log.warnOnce(
        'import_extract_ocr_activation.unauthorized',
        'import-extract-activate-ocr unauthorized (ignored).'
      );
      return false;
    }
    return true;
  } catch (err) {
    log.warn('import-extract-activate-ocr sender validation failed:', err);
    return false;
  }
}

function resolvePayload(payload) {
  const raw = payload && typeof payload === 'object' ? payload : {};
  return {
    credentialsSourcePath: typeof raw.credentialsSourcePath === 'string'
      ? raw.credentialsSourcePath.trim()
      : '',
  };
}

function extractSerializableCredentials(authClient) {
  const candidate = authClient && typeof authClient === 'object'
    ? authClient.credentials
    : null;
  if (!candidate || typeof candidate !== 'object') return null;

  const hasAccessToken = hasNonEmptyString(candidate.access_token);
  const hasRefreshToken = hasNonEmptyString(candidate.refresh_token);
  if (!hasAccessToken && !hasRefreshToken) return null;

  return { ...candidate };
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

  ipcMain.handle('import-extract-activate-ocr', async (event, payload = {}) => {
    const request = resolvePayload(payload);
    const mainWin = resolveMainWin();
    try {
      if (!isAuthorizedSender(event, mainWin)) {
        return buildFailure({
          state: 'failure',
          code: 'platform_runtime_failed',
          detailsSafeForLogs: {
            stage: 'authorization',
            reason: 'unauthorized_sender',
          },
        });
      }

      const paths = resolvePaths();
      const credentialsPath = String(paths && paths.credentialsPath ? paths.credentialsPath : '');
      const tokenPath = String(paths && paths.tokenPath ? paths.tokenPath : '');
      if (!credentialsPath || !tokenPath) {
        log.error('import/extract OCR activation runtime paths unavailable:', {
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

      let importedCredentials = false;
      if (!hasFile(credentialsPath)) {
        const selectedCredentialsPath = request.credentialsSourcePath || '';
        let sourcePath = selectedCredentialsPath;
        if (!sourcePath) {
          const pick = await promptCredentialsFile(mainWin);
          if (!pick.ok) {
            log.info('import/extract OCR activation cancelled while selecting credentials file.');
            return buildFailure({
              state: 'setup_incomplete',
              code: 'setup_incomplete',
              alertKey: 'renderer.alerts.import_extract_ocr_setup_cancelled',
              detailsSafeForLogs: {
                stage: 'credentials_pick',
                cancelled: true,
              },
            });
          }
          sourcePath = pick.filePath;
        }

        const importResult = importCredentialsFile({
          sourcePath,
          targetPath: credentialsPath,
        });
        if (!importResult.ok) {
          log.warn('import/extract OCR activation blocked during credentials import:', {
            state: importResult.state,
            code: importResult.code,
            sourcePathProvided: !!selectedCredentialsPath,
            detailsSafeForLogs: importResult.detailsSafeForLogs,
          });
          return {
            ...importResult,
            detailsSafeForLogs: {
              ...importResult.detailsSafeForLogs,
              sourcePathProvided: !!selectedCredentialsPath,
            },
          };
        }
        importedCredentials = true;
      }

      let authClient = null;
      try {
        authClient = await authenticate({
          scopes: OCR_SCOPES,
          keyfilePath: credentialsPath,
        });
      } catch (authErr) {
        const authFailure = mapAuthenticateError(authErr);
        if (authFailure.code === 'ocr_activation_required') {
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
        importedCredentials,
      };

      if (mapped.ok) {
        log.info('import/extract OCR activation completed:', telemetry);
      } else {
        log.warn('import/extract OCR activation completed but setup is not ready:', telemetry);
      }

      return {
        ...mapped,
        detailsSafeForLogs: {
          importedCredentials,
        },
      };
    } catch (err) {
      const failure = buildFailure({
        state: 'failure',
        code: 'platform_runtime_failed',
        detailsSafeForLogs: {
          stage: 'ipc_handler_failure',
          errorName: safeErrorName(err),
          errorMessage: safeErrorMessage(err),
        },
      });
      log.error('import-extract-activate-ocr failed unexpectedly:', failure.detailsSafeForLogs);
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
