// electron/import_extract_platform/import_extract_file_picker_ipc.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-process IPC module for the import/extract file picker.
// Responsibilities:
// - Register the 'import-extract-open-picker' IPC handler.
// - Enforce that only the main window can invoke the picker.
// - Resolve the initial picker directory from persisted state or platform defaults.
// - Persist the last selected directory when a valid file is chosen.
// - Normalize picker output before returning it to the renderer.

// =============================================================================
// Imports / logger
// =============================================================================

const { dialog, app, BrowserWindow } = require('electron');
const Log = require('../log');
const { getImportExtractStateFile, loadJson, saveJson } = require('../fs_storage');
const { getImportExtractPlatformAdapter } = require('./import_extract_platform_adapter');

const log = Log.get('import-extract-picker');
const platformAdapter = getImportExtractPlatformAdapter(process.platform);

// =============================================================================
// Constants / config
// =============================================================================

const PICKER_STATE_FALLBACK = Object.freeze({
  lastDirectory: '',
});

// =============================================================================
// Helpers
// =============================================================================

function normalizePickerState(rawState) {
  const state = rawState && typeof rawState === 'object' ? rawState : {};
  const lastDirectory = typeof state.lastDirectory === 'string'
    ? state.lastDirectory.trim()
    : '';
  return {
    lastDirectory,
  };
}

function resolveDefaultFolder() {
  return platformAdapter.resolveDefaultPickerPath({
    app,
    cwd: process.cwd(),
    log,
  });
}

function resolvePickerDefaultPath(pickerState) {
  const persisted = platformAdapter.normalizePersistedDirectory(pickerState.lastDirectory);
  if (persisted) return persisted;
  return resolveDefaultFolder();
}

function readPickerState() {
  try {
    const statePath = getImportExtractStateFile();
    const raw = loadJson(statePath, PICKER_STATE_FALLBACK);
    return {
      statePath,
      state: normalizePickerState(raw),
    };
  } catch (err) {
    log.warn('Failed to read import/extract picker state (using defaults):', err);
    return {
      statePath: null,
      state: { ...PICKER_STATE_FALLBACK },
    };
  }
}

function persistPickerState(statePath, nextState) {
  if (!statePath) return;
  try {
    saveJson(statePath, nextState);
  } catch (err) {
    log.warn('Failed to persist import/extract picker state (ignored):', err);
  }
}

function isAuthorizedSender(event, mainWin) {
  try {
    const senderWin = event && event.sender
      ? BrowserWindow.fromWebContents(event.sender)
      : null;
    if (!mainWin || senderWin !== mainWin) {
      log.warnOnce(
        'import_extract_picker.unauthorized',
        'import-extract-open-picker unauthorized (ignored).'
      );
      return false;
    }
    return true;
  } catch (err) {
    log.warn('import-extract-open-picker sender validation failed:', err);
    return false;
  }
}

// =============================================================================
// IPC registration / handlers
// =============================================================================

function registerIpc(ipcMain, { getWindows } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[import_extract_picker] registerIpc requires ipcMain');
  }
  if (typeof getWindows !== 'function') {
    throw new Error('[import_extract_picker] registerIpc requires getWindows');
  }

  const resolveMainWin = () => {
    const windows = getWindows() || {};
    return windows.mainWin || null;
  };

  ipcMain.handle('import-extract-open-picker', async (event) => {
    try {
      const mainWin = resolveMainWin();
      if (!isAuthorizedSender(event, mainWin)) {
        return { ok: false, code: 'UNAUTHORIZED' };
      }

      const stateInfo = readPickerState();
      const defaultPath = resolvePickerDefaultPath(stateInfo.state);

      const dialogResult = await dialog.showOpenDialog(mainWin, {
        defaultPath,
        filters: [
          {
            name: 'Supported files',
            extensions: [
              'jpg', 'jpeg', 'png', 'webp', 'bmp',
              'pdf',
              'txt', 'md', 'html', 'htm', 'docx',
            ],
          },
          { name: 'All files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      });

      if (!dialogResult || dialogResult.canceled || !Array.isArray(dialogResult.filePaths) || !dialogResult.filePaths.length) {
        return { ok: true, canceled: true };
      }

      const selectedPath = platformAdapter.normalizeSelectedFilePath(dialogResult.filePaths[0]);
      if (!selectedPath) {
        log.warnOnce(
          'import_extract_picker.empty_selection',
          'import-extract-open-picker returned empty selection (treated as cancelled).'
        );
        return { ok: true, canceled: true };
      }

      const selectedDirectory = platformAdapter.normalizeSelectedDirectory(selectedPath);
      if (selectedDirectory) {
        persistPickerState(stateInfo.statePath, { lastDirectory: selectedDirectory });
      }

      return {
        ok: true,
        canceled: false,
        filePath: selectedPath,
        selectedDirectory,
      };
    } catch (err) {
      log.error('import-extract-open-picker failed:', err);
      return { ok: false, code: 'PICKER_FAILED', error: String(err) };
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
// End of electron/import_extract_platform/import_extract_file_picker_ipc.js
// =============================================================================
