// electron/text_extraction_platform/text_extraction_file_picker_ipc.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-process IPC module for the text extraction file picker.
// Responsibilities:
// - Register the 'text-extraction-open-picker' IPC handler.
// - Enforce that only the main window can invoke the picker.
// - Resolve the initial picker directory from persisted state or platform defaults.
// - Persist the last selected directory when a valid file is chosen.
// - Normalize picker output before returning it to the renderer.

// =============================================================================
// Imports / logger
// =============================================================================

const { dialog, app, BrowserWindow } = require('electron');
const Log = require('../log');
const { getTextExtractionStateFile, loadJson, saveJson } = require('../fs_storage');
const { getTextExtractionPlatformAdapter } = require('./text_extraction_platform_adapter');
const {
  getSupportedNativeExtensions,
  getSupportedOcrSourceExtensions,
} = require('./text_extraction_supported_formats');

const log = Log.get('text-extraction-picker');
const platformAdapter = getTextExtractionPlatformAdapter(process.platform);

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
    const statePath = getTextExtractionStateFile();
    const raw = loadJson(statePath, PICKER_STATE_FALLBACK);
    return {
      statePath,
      state: normalizePickerState(raw),
    };
  } catch (err) {
    log.warn('Failed to read text extraction picker state (using defaults):', err);
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
    log.warn('Failed to persist text extraction picker state (ignored):', err);
  }
}

function isAuthorizedSender(event, mainWin) {
  try {
    const senderWin = event && event.sender
      ? BrowserWindow.fromWebContents(event.sender)
      : null;
    if (!mainWin || senderWin !== mainWin) {
      log.warnOnce(
        'text_extraction_picker.unauthorized',
        'text-extraction-open-picker unauthorized (ignored).'
      );
      return false;
    }
    return true;
  } catch (err) {
    log.warn('text-extraction-open-picker sender validation failed:', err);
    return false;
  }
}

function getSupportedPickerExtensions() {
  const ordered = [
    ...getSupportedOcrSourceExtensions(),
    ...getSupportedNativeExtensions(),
  ];
  return ordered.filter((extension, index) => ordered.indexOf(extension) === index);
}

// =============================================================================
// IPC registration / handlers
// =============================================================================

function registerIpc(ipcMain, { getWindows } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[text_extraction_picker] registerIpc requires ipcMain');
  }
  if (typeof getWindows !== 'function') {
    throw new Error('[text_extraction_picker] registerIpc requires getWindows');
  }

  const resolveMainWin = () => {
    const windows = getWindows() || {};
    return windows.mainWin || null;
  };

  ipcMain.handle('text-extraction-open-picker', async (event) => {
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
            extensions: getSupportedPickerExtensions(),
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
          'text_extraction_picker.empty_selection',
          'text-extraction-open-picker returned empty selection (treated as cancelled).'
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
      log.error('text-extraction-open-picker failed:', err);
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
// End of electron/text_extraction_platform/text_extraction_file_picker_ipc.js
// =============================================================================


