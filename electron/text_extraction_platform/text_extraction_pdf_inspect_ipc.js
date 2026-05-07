// electron/text_extraction_platform/text_extraction_pdf_inspect_ipc.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-process IPC wrapper for pre-prepare PDF inspection requests.
// Responsibilities:
// - Register the 'text-extraction-inspect-selected-file' IPC handler.
// - Authorize the sender against the current main window before inspecting.
// - Delegate PDF inspection to the shared text extraction core.
// - Keep the renderer-visible inspect contract stable and minimal.

// =============================================================================
// Imports / logger
// =============================================================================

const Log = require('../log');
const {
  getFileInfo,
  inspectSelectedFile,
  isAuthorizedSender,
  resolveInspectPayload,
} = require('./text_extraction_prepare_execute_core');

const log = Log.get('text-extraction-pdf-inspect-ipc');

// =============================================================================
// IPC registration / handler
// =============================================================================

function registerIpc(ipcMain, { getWindows } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[text_extraction_pdf_inspect_ipc] registerIpc requires ipcMain');
  }
  if (typeof getWindows !== 'function') {
    throw new Error('[text_extraction_pdf_inspect_ipc] registerIpc requires getWindows()');
  }

  const resolveMainWin = () => {
    const windows = getWindows() || {};
    return windows.mainWin || null;
  };

  ipcMain.handle('text-extraction-inspect-selected-file', async (event, payload = {}) => {
    const request = resolveInspectPayload(payload);

    try {
      const mainWin = resolveMainWin();
      if (!isAuthorizedSender(event, mainWin, log, 'text-extraction-inspect-selected-file')) {
        return { ok: false, code: 'UNAUTHORIZED' };
      }
      if (!request.filePath) {
        return { ok: false, code: 'INVALID_FILE_PATH' };
      }

      const inspection = await inspectSelectedFile({ filePath: request.filePath });
      if (!inspection || inspection.ok !== true) {
        log.error('text extraction PDF inspect returned unexpected shape:', inspection);
        return { ok: false, code: 'INSPECT_SHAPE_INVALID' };
      }

      const fileInfo = getFileInfo(request.filePath);
      if (inspection.isPdf && inspection.error) {
        log.warn('text extraction PDF inspect failed:', {
          sourceFileExt: fileInfo.sourceFileExt,
          sourceFileKind: fileInfo.sourceFileKind,
          code: inspection.error.code || '',
        });
      } else {
        log.info('text extraction PDF inspect completed:', {
          sourceFileExt: fileInfo.sourceFileExt,
          sourceFileKind: fileInfo.sourceFileKind,
          isPdf: inspection.isPdf === true,
          totalPages: Number.isFinite(inspection.totalPages) ? inspection.totalPages : null,
        });
      }

      return inspection;
    } catch (err) {
      log.error('text-extraction-inspect-selected-file failed unexpectedly:', err);
      return {
        ok: false,
        code: 'INSPECT_IPC_FAILED',
        error: String(err),
      };
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
// End of electron/text_extraction_platform/text_extraction_pdf_inspect_ipc.js
// =============================================================================
