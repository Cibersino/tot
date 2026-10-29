// electron/text_extraction_platform/text_extraction_ocr_disconnect_ipc.js
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
const ocrOperation = require('./ocr_google_drive_operation');
const {
  readEncryptedTokenFile,
  deleteEncryptedTokenFile,
} = require('./ocr_google_drive_token_storage');
const {
  buildGoogleTokenRevocationClient,
  selectPreferredRevocationToken,
} = require('./ocr_google_drive_oauth_client');

const log = Log.get('text-extraction-ocr-disconnect');

// =============================================================================
// Helpers
// =============================================================================

function safeErrorName(error) {
  return String(error && error.name ? error.name : 'Error');
}

function safeErrorMessage(error) {
  return String(error && error.message ? error.message : error || '');
}

function resolveDialogText(dialogTexts, key, fallback) {
  return menuBuilder.resolveDialogText(dialogTexts, key, fallback, {
    log,
  });
}

function getDialogTexts() {
  try {
    const settings = settingsState.getSettings();
    const lang = settings && settings.language ? settings.language : DEFAULT_LANG;
    return menuBuilder.getDialogTexts(lang);
  } catch (error) {
    log.warnOnce(
      'text_extraction_ocr_disconnect.dialogTexts',
      'Using fallback dialog texts:',
      error
    );
    return {};
  }
}

function buildFailure({
  code = 'disconnect_failed',
  alertKey = 'renderer.text_extraction.alerts.ocr.disconnect_failed',
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
  alertKey = 'renderer.text_extraction.alerts.ocr.disconnect_success',
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
        'text_extraction_ocr_disconnect.unauthorized',
        'text-extraction-disconnect-ocr unauthorized (ignored).'
      );
      return false;
    }
    return true;
  } catch (error) {
    log.warn('text-extraction-disconnect-ocr sender validation failed:', error);
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
  const continueLabel = resolveDialogText(dialogTexts, 'continue_button');
  const cancelLabel = resolveDialogText(dialogTexts, 'cancel_button');
  const title = resolveDialogText(dialogTexts, 'disconnect_google_ocr_title');
  const message = resolveDialogText(dialogTexts, 'disconnect_google_ocr_confirm');
  const detail = resolveDialogText(dialogTexts, 'disconnect_google_ocr_detail');

  const result = await dialog.showMessageBox(mainWin || null, {
    type: 'none',
    buttons: [continueLabel, cancelLabel],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
    title,
    message,
    detail,
  });

  return !!(result && result.response === 0);
}

async function revokeStoredToken({ tokenJson }) {
  const selected = selectPreferredRevocationToken(tokenJson);
  if (!selected.token) {
    const error = new Error('No revocable Google OCR token is available.');
    error.code = 'missing_revocable_token';
    throw error;
  }

  const oauthClient = buildGoogleTokenRevocationClient(tokenJson);
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
    throw new Error('[text_extraction_ocr_disconnect] registerIpc requires ipcMain');
  }
  if (typeof getWindows !== 'function') {
    throw new Error('[text_extraction_ocr_disconnect] registerIpc requires getWindows()');
  }
  if (typeof resolvePaths !== 'function') {
    throw new Error('[text_extraction_ocr_disconnect] registerIpc requires resolvePaths()');
  }

  const resolveMainWin = () => {
    const windows = getWindows() || {};
    return windows.mainWin || null;
  };

  ipcMain.handle('text-extraction-disconnect-ocr', async (event, payload = {}) => {
    const request = resolvePayload(payload);
    const mainWin = resolveMainWin();
    let releaseOperation = null;

    try {
      if (!isAuthorizedSender(event, mainWin)) {
        return buildFailure({
          detailsSafeForLogs: {
            stage: 'authorization',
            reason: 'unauthorized_sender',
          },
        });
      }

      releaseOperation = ocrOperation.begin();
      if (!releaseOperation) {
        log.warn('Google OCR disconnect ignored because another operation is in progress.');
        return buildFailure({
          code: 'ocr_operation_in_progress',
          alertKey: 'renderer.text_extraction.alerts.ocr.operation_in_progress',
        });
      }

      const paths = resolvePaths();
      const tokenPath = String(paths && paths.tokenPath ? paths.tokenPath : '');
      if (!tokenPath) {
        log.error('text extraction OCR disconnect runtime paths unavailable:', {
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
      } catch (error) {
        const tokenReadCode = String(error && error.code ? error.code : '');
        if (tokenReadCode === 'missing_file') {
          log.info('text extraction OCR disconnect requested but no local token exists:', {
            source: request.source,
            reason: request.reason,
          });
          return buildFailure({
            code: 'not_connected',
            alertKey: 'renderer.text_extraction.alerts.ocr.disconnect_not_connected',
            detailsSafeForLogs: {
              stage: 'token_read',
              reason: 'missing_file',
              source: request.source,
              requestReason: request.reason,
            },
          });
        }

        log.warn('text extraction OCR disconnect blocked: token read failed.', {
          source: request.source,
          reason: request.reason,
          tokenReadCode,
          errorName: safeErrorName(error),
        });
        return buildFailure({
          detailsSafeForLogs: {
            stage: 'token_read',
            reason: 'token_read_failed',
            tokenReadCode,
            errorName: safeErrorName(error),
            source: request.source,
            requestReason: request.reason,
          },
        });
      }

      const confirmed = await confirmDisconnect(mainWin);
      if (!confirmed) {
        log.info('text extraction OCR disconnect cancelled by user:', {
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
      } catch (error) {
        log.warn('text extraction OCR disconnect blocked: token revocation failed.', {
          source: request.source,
          reason: request.reason,
          errorName: safeErrorName(error),
          errorMessage: safeErrorMessage(error),
        });
        return buildFailure({
          detailsSafeForLogs: {
            stage: 'token_revoke',
            reason: 'revoke_failed',
            errorName: safeErrorName(error),
            errorMessage: safeErrorMessage(error),
            source: request.source,
            requestReason: request.reason,
          },
        });
      }
      const revokedTokenKind = revocation && revocation.revokedTokenKind
        ? revocation.revokedTokenKind
        : '';

      try {
        deleteEncryptedTokenFile(tokenPath);
      } catch (error) {
        log.error('text extraction OCR disconnect failed after revocation: token delete failed.', {
          source: request.source,
          reason: request.reason,
          revokedTokenKind,
          errorName: safeErrorName(error),
          errorMessage: safeErrorMessage(error),
        });
        return buildFailure({
          detailsSafeForLogs: {
            stage: 'token_delete',
            reason: 'delete_failed',
            revokedTokenKind,
            errorName: safeErrorName(error),
            errorMessage: safeErrorMessage(error),
            source: request.source,
            requestReason: request.reason,
          },
        });
      }

      log.info('text extraction OCR disconnected successfully:', {
        source: request.source,
        reason: request.reason,
        revokedTokenKind,
      });
      return buildSuccess({
        detailsSafeForLogs: {
          source: request.source,
          requestReason: request.reason,
          revokedTokenKind,
        },
      });
    } catch (error) {
      const failure = buildFailure({
        detailsSafeForLogs: {
          stage: 'ipc_handler_failure',
          errorName: safeErrorName(error),
          errorMessage: safeErrorMessage(error),
          source: request.source,
          requestReason: request.reason,
        },
      });
      log.error('text-extraction-disconnect-ocr failed unexpectedly:', failure.detailsSafeForLogs);
      return failure;
    } finally {
      if (releaseOperation) releaseOperation();
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
// End of electron/text_extraction_platform/text_extraction_ocr_disconnect_ipc.js
// =============================================================================

