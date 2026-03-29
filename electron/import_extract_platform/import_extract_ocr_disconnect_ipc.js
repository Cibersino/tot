// electron/import_extract_platform/import_extract_ocr_disconnect_ipc.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-process OCR disconnect IPC for Google Drive OCR token revocation/removal.
// Responsibilities:
// - Authorize disconnect requests to the main window sender.
// - Confirm disconnect intent with a native dialog.
// - Revoke the stored Google OAuth token (prefer refresh token when present).
// - Delete the local encrypted OCR token file after successful revocation.

// =============================================================================
// Imports / logger
// =============================================================================

const { BrowserWindow, dialog } = require('electron');
const Log = require('../log');
const { DEFAULT_LANG } = require('../constants_main');
const settingsState = require('../settings');
const menuBuilder = require('../menu_builder');
const {
  readEncryptedTokenFile,
  deleteEncryptedTokenFile,
} = require('./ocr_google_drive_token_storage');
const {
  buildGoogleTokenRevocationClient,
  selectPreferredRevocationToken,
} = require('./ocr_google_drive_oauth_client');

const log = Log.get('import-extract-ocr-disconnect');

// =============================================================================
// Helpers
// =============================================================================

function safeErrorName(err) {
  return String(err && err.name ? err.name : 'Error');
}

function safeErrorMessage(err) {
  return String(err && err.message ? err.message : err || '');
}

function resolveDialogText(dialogTexts, key, fallback) {
  return menuBuilder.resolveDialogText(dialogTexts, key, fallback, {
    log,
    warnPrefix: 'import_extract_ocr_disconnect.dialog.missing',
  });
}

function getDialogTexts() {
  try {
    const settings = settingsState.getSettings();
    const lang = settings && settings.language ? settings.language : DEFAULT_LANG;
    return menuBuilder.getDialogTexts(lang);
  } catch (err) {
    log.warnOnce(
      'import_extract_ocr_disconnect.dialogTexts',
      'Using fallback dialog texts:',
      err
    );
    return {};
  }
}

function buildFailure({
  code = 'disconnect_failed',
  alertKey = 'renderer.alerts.import_extract_ocr_disconnect_failed',
  detailsSafeForLogs = {},
} = {}) {
  return {
    ok: false,
    code,
    alertKey,
    detailsSafeForLogs,
  };
}

function buildSuccess({
  code = 'disconnected',
  alertKey = 'renderer.alerts.import_extract_ocr_disconnect_success',
  detailsSafeForLogs = {},
} = {}) {
  return {
    ok: true,
    code,
    alertKey,
    detailsSafeForLogs,
  };
}

function isAuthorizedSender(event, mainWin) {
  try {
    const senderWin = event && event.sender
      ? BrowserWindow.fromWebContents(event.sender)
      : null;
    if (!mainWin || senderWin !== mainWin) {
      log.warnOnce(
        'import_extract_ocr_disconnect.unauthorized',
        'import-extract-disconnect-ocr unauthorized (ignored).'
      );
      return false;
    }
    return true;
  } catch (err) {
    log.warn('import-extract-disconnect-ocr sender validation failed:', err);
    return false;
  }
}

function resolvePayload(payload) {
  const raw = payload && typeof payload === 'object' ? payload : {};
  return {
    source: typeof raw.source === 'string' ? raw.source.trim() : '',
    reason: typeof raw.reason === 'string' ? raw.reason.trim() : '',
  };
}

async function confirmDisconnect(mainWin) {
  const dialogTexts = getDialogTexts();
  const yesLabel = resolveDialogText(dialogTexts, 'yes', 'Yes, continue');
  const noLabel = resolveDialogText(dialogTexts, 'no', 'No, cancel');
  const title = resolveDialogText(
    dialogTexts,
    'disconnect_google_ocr_title',
    'Disconnect Google OCR'
  );
  const message = resolveDialogText(
    dialogTexts,
    'disconnect_google_ocr_confirm',
    'Disconnect Google OCR?'
  );
  const detail = resolveDialogText(
    dialogTexts,
    'disconnect_google_ocr_detail',
    'This revokes the saved Google OCR sign-in token and deletes the local token file from this app. App-managed local Google OAuth credentials may remain so OCR can reconnect later.'
  );

  const result = await dialog.showMessageBox(mainWin || null, {
    type: 'none',
    buttons: [yesLabel, noLabel],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    title,
    message,
    detail,
  });

  return !!(result && result.response === 0);
}

function buildRevocationClient(tokenJson) {
  return buildGoogleTokenRevocationClient(tokenJson);
}

async function revokeStoredToken({ tokenJson }) {
  const selected = selectPreferredRevocationToken(tokenJson);
  if (!selected.token) {
    const err = new Error('No revocable Google OCR token is available.');
    err.code = 'missing_revocable_token';
    throw err;
  }

  const oauthClient = buildRevocationClient(tokenJson);
  await oauthClient.revokeToken(selected.token);
  return {
    revokedTokenKind: selected.kind,
  };
}

// =============================================================================
// IPC registration / handler
// =============================================================================

function registerIpc(ipcMain, { getWindows, resolvePaths } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[import_extract_ocr_disconnect] registerIpc requires ipcMain');
  }
  if (typeof getWindows !== 'function') {
    throw new Error('[import_extract_ocr_disconnect] registerIpc requires getWindows()');
  }
  if (typeof resolvePaths !== 'function') {
    throw new Error('[import_extract_ocr_disconnect] registerIpc requires resolvePaths()');
  }

  const resolveMainWin = () => {
    const windows = getWindows() || {};
    return windows.mainWin || null;
  };

  ipcMain.handle('import-extract-disconnect-ocr', async (event, payload = {}) => {
    const request = resolvePayload(payload);
    const mainWin = resolveMainWin();

    try {
      if (!isAuthorizedSender(event, mainWin)) {
        return buildFailure({
          detailsSafeForLogs: {
            stage: 'authorization',
            reason: 'unauthorized_sender',
          },
        });
      }

      const paths = resolvePaths();
      const tokenPath = String(paths && paths.tokenPath ? paths.tokenPath : '');
      if (!tokenPath) {
        log.error('import/extract OCR disconnect runtime paths unavailable:', {
          stage: 'resolve_paths',
          tokenPathPresent: !!tokenPath,
        });
        return buildFailure({
          detailsSafeForLogs: {
            stage: 'resolve_paths',
            reason: 'missing_runtime_paths',
          },
        });
      }

      let tokenJson = null;
      try {
        tokenJson = readEncryptedTokenFile(tokenPath);
      } catch (err) {
        const tokenReadCode = String(err && err.code ? err.code : '');
        if (tokenReadCode === 'missing_file') {
          log.info('import/extract OCR disconnect requested but no local token exists:', {
            source: request.source,
            reason: request.reason,
          });
          return buildFailure({
            code: 'not_connected',
            alertKey: 'renderer.alerts.import_extract_ocr_disconnect_not_connected',
            detailsSafeForLogs: {
              stage: 'token_read',
              reason: 'missing_file',
              source: request.source,
              requestReason: request.reason,
            },
          });
        }

        log.warn('import/extract OCR disconnect blocked: token read failed.', {
          source: request.source,
          reason: request.reason,
          tokenReadCode,
          errorName: safeErrorName(err),
        });
        return buildFailure({
          detailsSafeForLogs: {
            stage: 'token_read',
            reason: 'token_read_failed',
            tokenReadCode,
            errorName: safeErrorName(err),
            source: request.source,
            requestReason: request.reason,
          },
        });
      }

      const confirmed = await confirmDisconnect(mainWin);
      if (!confirmed) {
        log.info('import/extract OCR disconnect cancelled by user:', {
          source: request.source,
          reason: request.reason,
        });
        return {
          ok: false,
          cancelled: true,
          detailsSafeForLogs: {
            stage: 'confirm_disconnect',
            cancelled: true,
            source: request.source,
            requestReason: request.reason,
          },
        };
      }

      let revocation = null;
      try {
        revocation = await revokeStoredToken({
          tokenJson,
        });
      } catch (err) {
        log.warn('import/extract OCR disconnect blocked: token revocation failed.', {
          source: request.source,
          reason: request.reason,
          errorName: safeErrorName(err),
          errorMessage: safeErrorMessage(err),
        });
        return buildFailure({
          detailsSafeForLogs: {
            stage: 'token_revoke',
            reason: 'revoke_failed',
            errorName: safeErrorName(err),
            errorMessage: safeErrorMessage(err),
            source: request.source,
            requestReason: request.reason,
          },
        });
      }

      try {
        deleteEncryptedTokenFile(tokenPath);
      } catch (err) {
        log.error('import/extract OCR disconnect failed after revocation: token delete failed.', {
          source: request.source,
          reason: request.reason,
          revokedTokenKind: revocation && revocation.revokedTokenKind ? revocation.revokedTokenKind : '',
          errorName: safeErrorName(err),
          errorMessage: safeErrorMessage(err),
        });
        return buildFailure({
          detailsSafeForLogs: {
            stage: 'token_delete',
            reason: 'delete_failed',
            revokedTokenKind: revocation && revocation.revokedTokenKind ? revocation.revokedTokenKind : '',
            errorName: safeErrorName(err),
            errorMessage: safeErrorMessage(err),
            source: request.source,
            requestReason: request.reason,
          },
        });
      }

      log.info('import/extract OCR disconnected successfully:', {
        source: request.source,
        reason: request.reason,
        revokedTokenKind: revocation && revocation.revokedTokenKind ? revocation.revokedTokenKind : '',
      });
      return buildSuccess({
        detailsSafeForLogs: {
          source: request.source,
          requestReason: request.reason,
          revokedTokenKind: revocation && revocation.revokedTokenKind ? revocation.revokedTokenKind : '',
        },
      });
    } catch (err) {
      const failure = buildFailure({
        detailsSafeForLogs: {
          stage: 'ipc_handler_failure',
          errorName: safeErrorName(err),
          errorMessage: safeErrorMessage(err),
          source: request.source,
          requestReason: request.reason,
        },
      });
      log.error('import-extract-disconnect-ocr failed unexpectedly:', failure.detailsSafeForLogs);
      return failure;
    }
  });
}

// =============================================================================
// Exports / module surface
// =============================================================================

module.exports = {
  registerIpc,
};

// =============================================================================
// End of electron/import_extract_platform/import_extract_ocr_disconnect_ipc.js
// =============================================================================
