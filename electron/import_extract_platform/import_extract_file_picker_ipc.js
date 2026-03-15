'use strict';

const fs = require('fs');
const path = require('path');
const { dialog, app, BrowserWindow } = require('electron');
const Log = require('../log');
const { getImportExtractStateFile, loadJson, saveJson } = require('../fs_storage');

const log = Log.get('import-extract-picker');

const PICKER_STATE_FALLBACK = Object.freeze({
  lastDirectory: '',
});

function isExistingDirectory(candidatePath) {
  if (typeof candidatePath !== 'string' || candidatePath.trim() === '') return false;
  try {
    return fs.existsSync(candidatePath) && fs.statSync(candidatePath).isDirectory();
  } catch {
    return false;
  }
}

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
  try {
    const documents = app.getPath('documents');
    if (isExistingDirectory(documents)) return documents;
  } catch (err) {
    log.warnOnce('import_extract_picker.default.documents', 'Unable to resolve documents path (falling back):', err);
  }

  try {
    const home = app.getPath('home');
    if (isExistingDirectory(home)) return home;
  } catch (err) {
    log.warnOnce('import_extract_picker.default.home', 'Unable to resolve home path (falling back):', err);
  }

  return process.cwd();
}

function resolvePickerDefaultPath(pickerState) {
  if (isExistingDirectory(pickerState.lastDirectory)) {
    return pickerState.lastDirectory;
  }
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

function registerIpc(ipcMain, { getWindows } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[import_extract_picker] registerIpc requires ipcMain');
  }

  const resolveMainWin = () => {
    if (typeof getWindows === 'function') {
      const windows = getWindows() || {};
      return windows.mainWin || null;
    }
    return null;
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

      const selectedPath = String(dialogResult.filePaths[0] || '').trim();
      if (!selectedPath) {
        log.warnOnce(
          'import_extract_picker.empty_selection',
          'import-extract-open-picker returned empty selection (treated as cancelled).'
        );
        return { ok: true, canceled: true };
      }

      const selectedDirectory = path.dirname(selectedPath);
      if (isExistingDirectory(selectedDirectory)) {
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

module.exports = {
  registerIpc,
};
