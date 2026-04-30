// electron/reading_test_pool_import.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-owned reading-test pool import helpers + IPC.
// Responsibilities:
// - Open a native picker for one or more .json/.zip files.
// - Validate imported candidates against the reading-test pool contract.
// - Flatten valid zip entries into pool-file candidates.
// - Handle destination-filename duplicates explicitly before writing.
// - Install validated files into the local reading-test pool directory.
// =============================================================================

// =============================================================================
// Imports / logger
// =============================================================================

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const Log = require('./log');
const readingTestPool = require('./reading_test_pool');
const {
  getReadingTestPoolImportStateFile,
  loadJson,
  saveJson,
} = require('./fs_storage');
const { getTextExtractionPlatformAdapter } = require('./text_extraction_platform/text_extraction_platform_adapter');

const log = Log.get('reading-test-pool-import');
log.debug('Reading test pool import starting...');

// =============================================================================
// Constants / config
// =============================================================================

const IMPORT_CONFLICT_STRATEGY = Object.freeze({
  SKIP: 'skip',
  REPLACE: 'replace',
  CANCEL: 'cancel',
});
const PICKER_STATE_FALLBACK = Object.freeze({
  lastDirectory: '',
});

// =============================================================================
// Helpers: import candidates and pool writes
// =============================================================================

function readJsonTextWithBomStrip(filePath) {
  try {
    return {
      ok: true,
      text: fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''),
    };
  } catch (err) {
    return { ok: false, code: 'READ_FAILED', error: err };
  }
}

function parseJsonText(jsonText) {
  const source = typeof jsonText === 'string' ? jsonText.trim() : '';
  if (!source) return { ok: false, code: 'INVALID_JSON' };
  try {
    return { ok: true, data: JSON.parse(source) };
  } catch (err) {
    return { ok: false, code: 'INVALID_JSON', error: err };
  }
}

function normalizeDestinationName(rawName) {
  const fileName = path.basename(typeof rawName === 'string' ? rawName.trim() : '');
  if (!fileName || !fileName.toLowerCase().endsWith('.json')) return '';
  return fileName;
}

function buildCandidateFromJsonSource({ destinationName, jsonText, sourcePath, archiveEntryName = '' }) {
  const parseInfo = parseJsonText(jsonText);
  if (!parseInfo.ok) return { ok: false, code: parseInfo.code };

  const dataInfo = readingTestPool.sanitizePoolData(parseInfo.data);
  if (!dataInfo.ok) return { ok: false, code: dataInfo.code };

  return {
    ok: true,
    candidate: {
      destinationName,
      payload: dataInfo.data,
      sourcePath,
      archiveEntryName,
    },
  };
}

function collectJsonFileCandidate(filePath) {
  const destinationName = normalizeDestinationName(filePath);
  if (!destinationName) return { ok: false, code: 'INVALID_DESTINATION_NAME' };

  const textInfo = readJsonTextWithBomStrip(filePath);
  if (!textInfo.ok) return { ok: false, code: textInfo.code };

  return buildCandidateFromJsonSource({
    destinationName,
    jsonText: textInfo.text,
    sourcePath: filePath,
  });
}

function collectZipCandidates(zipPath) {
  const result = {
    candidates: [],
    failedValidation: 0,
    failedArchiveEntries: 0,
  };

  let zip;
  try {
    zip = new AdmZip(zipPath);
  } catch (err) {
    log.warn('Reading-test zip open failed:', zipPath, err);
    result.failedArchiveEntries += 1;
    return result;
  }

  const entries = Array.isArray(zip.getEntries()) ? zip.getEntries() : [];
  for (const entry of entries) {
    if (!entry || entry.isDirectory) continue;

    const destinationName = normalizeDestinationName(entry.entryName);
    if (!destinationName) continue;

    let entryText = '';
    try {
      entryText = entry.getData().toString('utf8').replace(/^\uFEFF/, '');
    } catch (err) {
      log.warn('Reading-test zip entry read failed:', { zipPath, entryName: entry.entryName }, err);
      result.failedArchiveEntries += 1;
      continue;
    }

    const candidateInfo = buildCandidateFromJsonSource({
      destinationName,
      jsonText: entryText,
      sourcePath: zipPath,
      archiveEntryName: entry.entryName,
    });
    if (!candidateInfo.ok) {
      result.failedValidation += 1;
      continue;
    }

    result.candidates.push(candidateInfo.candidate);
  }

  return result;
}

function scanImportCandidates(selectedPaths) {
  const candidates = [];
  let failedValidation = 0;
  let failedArchiveEntries = 0;

  const paths = Array.isArray(selectedPaths) ? selectedPaths : [];
  for (const sourcePath of paths) {
    const normalizedPath = typeof sourcePath === 'string' ? sourcePath.trim() : '';
    if (!normalizedPath) continue;

    const lower = normalizedPath.toLowerCase();
    if (lower.endsWith('.json')) {
      const candidateInfo = collectJsonFileCandidate(normalizedPath);
      if (!candidateInfo.ok) {
        failedValidation += 1;
        continue;
      }
      candidates.push(candidateInfo.candidate);
      continue;
    }

    if (lower.endsWith('.zip')) {
      const zipInfo = collectZipCandidates(normalizedPath);
      candidates.push(...zipInfo.candidates);
      failedValidation += zipInfo.failedValidation;
      failedArchiveEntries += zipInfo.failedArchiveEntries;
      continue;
    }

    failedValidation += 1;
  }

  return {
    candidates,
    failedValidation,
    failedArchiveEntries,
  };
}

function isPathInsideRoot(rootPath, candidatePath) {
  const rel = path.relative(rootPath, candidatePath);
  if (rel === '') return true;
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

function writeCandidateToPool(poolDir, candidate) {
  const destinationPath = path.resolve(path.join(poolDir, candidate.destinationName));
  if (!isPathInsideRoot(path.resolve(poolDir), destinationPath)) {
    return { ok: false, code: 'PATH_OUTSIDE_POOL' };
  }

  try {
    fs.writeFileSync(destinationPath, JSON.stringify(candidate.payload, null, 2), 'utf8');
    return { ok: true };
  } catch (err) {
    log.error('Reading-test imported candidate write failed:', { destinationPath }, err);
    return { ok: false, code: 'WRITE_FAILED' };
  }
}

async function importSelectedFiles({
  selectedPaths,
  poolDir,
  resolveConflictStrategy,
} = {}) {
  const destinationDir = typeof poolDir === 'string' && poolDir.trim()
    ? path.resolve(poolDir)
    : path.resolve(readingTestPool.ensurePoolDir());

  const scanInfo = scanImportCandidates(selectedPaths);
  const candidates = scanInfo.candidates;

  const existingDestinations = new Set();
  for (const candidate of candidates) {
    const destinationPath = path.join(destinationDir, candidate.destinationName);
    if (fs.existsSync(destinationPath)) {
      existingDestinations.add(candidate.destinationName);
    }
  }

  let conflictStrategy = IMPORT_CONFLICT_STRATEGY.SKIP;
  if (existingDestinations.size > 0) {
    conflictStrategy = typeof resolveConflictStrategy === 'function'
      ? await resolveConflictStrategy({
        duplicateCount: existingDestinations.size,
        duplicateNames: [...existingDestinations].sort((a, b) => a.localeCompare(b)),
      })
      : IMPORT_CONFLICT_STRATEGY.SKIP;

    if (conflictStrategy === IMPORT_CONFLICT_STRATEGY.CANCEL) {
      return {
        ok: true,
        canceled: true,
        imported: 0,
        skippedDuplicates: 0,
        failedValidation: scanInfo.failedValidation,
        failedArchiveEntries: scanInfo.failedArchiveEntries,
        failedWrites: 0,
        writtenDestinationNames: [],
      };
    }
  }

  let imported = 0;
  let skippedDuplicates = 0;
  let failedWrites = 0;
  const seenDestinationNames = new Set();
  const writtenDestinationNames = [];

  for (const candidate of candidates) {
    if (seenDestinationNames.has(candidate.destinationName)) {
      skippedDuplicates += 1;
      continue;
    }
    seenDestinationNames.add(candidate.destinationName);

    const destinationPath = path.join(destinationDir, candidate.destinationName);
    const destinationExists = fs.existsSync(destinationPath);

    if (destinationExists && conflictStrategy === IMPORT_CONFLICT_STRATEGY.SKIP) {
      skippedDuplicates += 1;
      continue;
    }

    const writeInfo = writeCandidateToPool(destinationDir, candidate);
    if (writeInfo.ok) {
      imported += 1;
      writtenDestinationNames.push(candidate.destinationName);
    } else {
      failedWrites += 1;
    }
  }

  return {
    ok: true,
    canceled: false,
    imported,
    skippedDuplicates,
    failedValidation: scanInfo.failedValidation,
    failedArchiveEntries: scanInfo.failedArchiveEntries,
    failedWrites,
    writtenDestinationNames,
  };
}

// =============================================================================
// Helpers: dialog copy and picker state
// =============================================================================

function normalizeDialogCopy(rawDialogCopy) {
  const copy = rawDialogCopy && typeof rawDialogCopy === 'object' ? rawDialogCopy : {};
  const normalize = (value, fallback) => {
    const text = typeof value === 'string' ? value.trim() : '';
    return text || fallback;
  };

  return {
    conflictTitle: normalize(copy.conflictTitle, 'renderer.reading_test.entry.import_conflict.title'),
    conflictMessage: normalize(copy.conflictMessage, 'renderer.reading_test.entry.import_conflict.message'),
    conflictDetail: normalize(copy.conflictDetail, 'renderer.reading_test.entry.import_conflict.detail'),
    buttons: {
      skip: normalize(copy.buttons && copy.buttons.skip, 'renderer.reading_test.entry.import_conflict.buttons.skip'),
      replace: normalize(copy.buttons && copy.buttons.replace, 'renderer.reading_test.entry.import_conflict.buttons.replace'),
      cancel: normalize(copy.buttons && copy.buttons.cancel, 'renderer.reading_test.entry.import_conflict.buttons.cancel'),
    },
  };
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

function readPickerState() {
  try {
    const statePath = getReadingTestPoolImportStateFile();
    const raw = loadJson(statePath, PICKER_STATE_FALLBACK);
    return {
      statePath,
      state: normalizePickerState(raw),
    };
  } catch (err) {
    log.warn('Failed to read reading-test pool import picker state (using defaults):', err);
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
    log.warn('Failed to persist reading-test pool import picker state (ignored):', err);
  }
}

function resolvePickerDefaultPath(platformAdapter, app, pickerState) {
  const persisted = platformAdapter.normalizePersistedDirectory(pickerState.lastDirectory);
  if (persisted) return persisted;
  return platformAdapter.resolveDefaultPickerPath({
    app,
    cwd: process.cwd(),
    log,
  });
}

// =============================================================================
// IPC registration / handler
// =============================================================================

function registerIpc(ipcMain, { getWindows, isReadingTestInteractionLocked } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[reading_test_pool_import] registerIpc requires ipcMain');
  }
  if (typeof getWindows !== 'function') {
    throw new Error('[reading_test_pool_import] registerIpc requires getWindows');
  }
  if (typeof isReadingTestInteractionLocked !== 'function') {
    throw new Error('[reading_test_pool_import] registerIpc requires isReadingTestInteractionLocked');
  }

  const { dialog, BrowserWindow, app } = require('electron');
  const platformAdapter = getTextExtractionPlatformAdapter(process.platform);

  function resolveMainWin() {
    const windows = getWindows() || {};
    return windows.mainWin || null;
  }

  function isAuthorizedSender(event, mainWin) {
    try {
      const senderWin = event && event.sender
        ? BrowserWindow.fromWebContents(event.sender)
        : null;
      if (!mainWin || senderWin !== mainWin) {
        log.warnOnce(
          'reading_test_pool_import.unauthorized',
          'reading-test-import-pool-files unauthorized or mainWin unavailable (ignored).'
        );
        return false;
      }
      return true;
    } catch (err) {
      log.warn('Reading-test import sender validation failed:', err);
      return false;
    }
  }

  ipcMain.handle('reading-test-import-pool-files', async (event, payload = {}) => {
    try {
      const mainWin = resolveMainWin();
      if (!isAuthorizedSender(event, mainWin)) {
        return { ok: false, code: 'UNAUTHORIZED' };
      }
      if (isReadingTestInteractionLocked()) {
        return {
          ok: false,
          code: 'SESSION_ACTIVE',
          guidanceKey: 'renderer.alerts.reading_test_precondition_blocked',
        };
      }

      const stateInfo = readPickerState();
      const defaultPath = resolvePickerDefaultPath(platformAdapter, app, stateInfo.state);
      const dialogResult = await dialog.showOpenDialog(mainWin, {
        defaultPath,
        filters: [
          { name: 'Reading test files', extensions: ['json', 'zip'] },
          { name: 'JSON', extensions: ['json'] },
          { name: 'ZIP', extensions: ['zip'] },
          { name: 'All files', extensions: ['*'] },
        ],
        properties: ['openFile', 'multiSelections'],
      });

      if (!dialogResult) {
        log.error('reading-test-import-pool-files failed: showOpenDialog returned no result.');
        return {
          ok: false,
          code: 'IMPORT_FAILED',
          guidanceKey: 'renderer.alerts.reading_test_pool_import_failed',
        };
      }
      if (dialogResult.canceled) {
        return { ok: true, canceled: true };
      }
      if (!Array.isArray(dialogResult.filePaths)) {
        log.error('reading-test-import-pool-files failed: showOpenDialog returned invalid filePaths.');
        return {
          ok: false,
          code: 'IMPORT_FAILED',
          guidanceKey: 'renderer.alerts.reading_test_pool_import_failed',
        };
      }
      if (!dialogResult.filePaths.length) {
        log.warnOnce(
          'reading_test_pool_import.empty_selection',
          'reading-test-import-pool-files returned empty selection (treated as cancelled).'
        );
        return { ok: true, canceled: true };
      }

      const normalizedSelectedPaths = dialogResult.filePaths
        .map((filePath) => platformAdapter.normalizeSelectedFilePath(filePath))
        .filter(Boolean);
      if (!normalizedSelectedPaths.length) {
        log.warnOnce(
          'reading_test_pool_import.empty_normalized_selection',
          'reading-test-import-pool-files returned empty normalized selection (treated as cancelled).'
        );
        return { ok: true, canceled: true };
      }

      const normalizedFirstPath = normalizedSelectedPaths[0];
      const selectedDirectory = platformAdapter.normalizeSelectedDirectory(normalizedFirstPath);
      if (selectedDirectory) {
        persistPickerState(stateInfo.statePath, { lastDirectory: selectedDirectory });
      }

      const dialogCopy = normalizeDialogCopy(payload.conflictDialog);
      const result = await importSelectedFiles({
        selectedPaths: normalizedSelectedPaths,
        poolDir: readingTestPool.ensurePoolDir(),
        resolveConflictStrategy: async ({ duplicateCount }) => {
          const conflictResult = await dialog.showMessageBox(mainWin, {
            type: 'question',
            title: dialogCopy.conflictTitle,
            message: dialogCopy.conflictMessage,
            detail: dialogCopy.conflictDetail.replace('{count}', String(duplicateCount)),
            buttons: [
              dialogCopy.buttons.skip,
              dialogCopy.buttons.replace,
              dialogCopy.buttons.cancel,
            ],
            defaultId: 0,
            cancelId: 2,
            noLink: true,
          });

          if (!conflictResult || typeof conflictResult.response !== 'number') {
            throw new Error('reading-test-import-pool-files conflict dialog returned invalid result');
          }
          if (conflictResult.response === 2) {
            return IMPORT_CONFLICT_STRATEGY.CANCEL;
          }
          if (conflictResult.response === 1) {
            return IMPORT_CONFLICT_STRATEGY.REPLACE;
          }
          if (conflictResult.response !== 0) {
            throw new Error('reading-test-import-pool-files conflict dialog returned unsupported response');
          }
          return IMPORT_CONFLICT_STRATEGY.SKIP;
        },
      });

      if (result && result.ok === true && result.canceled !== true && Array.isArray(result.writtenDestinationNames)) {
        const importedSnapshotRelPaths = result.writtenDestinationNames
          .map((destinationName) => readingTestPool.buildPoolSnapshotRelPath(destinationName))
          .filter(Boolean);
        const stateUpdate = readingTestPool.clearImportedPoolEntriesState(importedSnapshotRelPaths);
        if (!stateUpdate || stateUpdate.ok !== true) {
          log.warn('Reading-test import state update failed (ignored):', stateUpdate);
        }
      }

      return result;
    } catch (err) {
      log.error('reading-test-import-pool-files failed:', err);
      return {
        ok: false,
        code: 'IMPORT_FAILED',
        guidanceKey: 'renderer.alerts.reading_test_pool_import_failed',
      };
    }
  });
}

// =============================================================================
// Exports / module surface
// =============================================================================

module.exports = {
  IMPORT_CONFLICT_STRATEGY,
  buildCandidateFromJsonSource,
  collectZipCandidates,
  importSelectedFiles,
  scanImportCandidates,
  registerIpc,
};

// =============================================================================
// End of electron/reading_test_pool_import.js
// =============================================================================

