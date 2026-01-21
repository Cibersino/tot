// electron/fs_storage.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// File system helpers for the Electron main process.
//
// Responsibilities:
// - Resolve the app's config paths under app.getPath('userData') plus the 'config' subfolder.
// - Ensure required config folders exist before reading/writing files.
// - Read/write small JSON state files (settings, current text, etc.) safely.
//
// Notes:
// - This module is intentionally synchronous (main process only).

// =============================================================================
// Imports / logger
// =============================================================================

const fs = require('fs');
const path = require('path');
const Log = require('./log');

const log = Log.get('fs-storage');

// =============================================================================
// Config paths
// =============================================================================

let CONFIG_DIR = null;

// =============================================================================
// Directory helpers
// =============================================================================

function initStorage(app) {
  if (!app || typeof app.getPath !== 'function') {
    throw new Error('[fs_storage] initStorage requires Electron app');
  }
  if (typeof app.isReady === 'function' && !app.isReady()) {
    throw new Error('[fs_storage] initStorage called before app is ready');
  }

  CONFIG_DIR = path.join(app.getPath('userData'), 'config');
}

function getConfigDir() {
  if (!CONFIG_DIR) {
    throw new Error('[fs_storage] CONFIG_DIR is not initialized');
  }
  return CONFIG_DIR;
}

function getConfigPresetsDir() {
  return path.join(getConfigDir(), 'presets_defaults');
}

function getSettingsFile() {
  return path.join(getConfigDir(), 'user_settings.json');
}

function getCurrentTextFile() {
  return path.join(getConfigDir(), 'current_text.json');
}

function getEditorStateFile() {
  return path.join(getConfigDir(), 'editor_state.json');
}

function ensureConfigDir() {
  try {
    const dir = getConfigDir();
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    log.error('ensureConfigDir failed:', CONFIG_DIR || '(uninitialized)', err);
  }
}

function ensureConfigPresetsDir() {
  let presetsDir = null;
  try {
    presetsDir = getConfigPresetsDir();
    if (!fs.existsSync(presetsDir)) {
      fs.mkdirSync(presetsDir, { recursive: true });
    }
  } catch (err) {
    log.error('ensureConfigPresetsDir failed:', presetsDir || '(uninitialized)', err);
  }
}

// =============================================================================
// JSON helpers
// =============================================================================

const LOAD_JSON_KNOWN_FILES = new Set([
  'current_text.json',
  'user_settings.json',
  'editor_state.json',
]);

function getLoadJsonOnceKey(kind, filePath) {
  const baseName = path.basename(String(filePath));
  const variant = LOAD_JSON_KNOWN_FILES.has(baseName) ? baseName : 'other';
  return `fs_storage.loadJson.${kind}.${variant}`;
}

function loadJson(filePath, fallback = {}) {
  try {
    // Missing file is recoverable: callers decide what the fallback should be.
    if (!fs.existsSync(filePath)) {
      const baseName = path.basename(String(filePath));
      let note = '';
      if (baseName === 'current_text.json') {
        note = ' (note: may be normal on first run; file is created on quit)';
      } else if (baseName === 'user_settings.json') {
        note = ' (note: may be normal on first run; file is created during startup)';
      } else if (baseName === 'editor_state.json') {
        note = ' (note: may be normal on first run; file is created when editor window is opened for the first time)';
      }

      log.warnOnce(
        getLoadJsonOnceKey('missing', filePath),
        `loadJson missing (using fallback):${note}`,
        filePath
      );
      return fallback;
    }

    let raw = fs.readFileSync(filePath, 'utf8');

    // Remove UTF-8 BOM if present (some editors add it and JSON.parse may fail).
    raw = raw.replace(/^\uFEFF/, '');

    // Empty/whitespace-only file is treated as invalid JSON (recoverable).
    if (raw.trim() === '') {
      log.warnOnce(
        getLoadJsonOnceKey('empty', filePath),
        'loadJson empty file (using fallback):',
        filePath
      );
      return fallback;
    }

    return JSON.parse(raw);
  } catch (err) {
    // Invalid JSON is recoverable: return fallback and continue running.
    log.warnOnce(
      getLoadJsonOnceKey('failed', filePath),
      'loadJson failed (using fallback):',
      filePath,
      err
    );
    return fallback;
  }
}

function saveJson(filePath, obj) {
  try {
    // Ensure the parent folder exists so callers do not depend on init ordering.
    const parentDir = path.dirname(filePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
  } catch (err) {
    log.error('saveJson failed:', filePath, err);
  }
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  initStorage,
  getConfigDir,
  getConfigPresetsDir,
  getSettingsFile,
  getCurrentTextFile,
  getEditorStateFile,
  ensureConfigDir,
  ensureConfigPresetsDir,
  loadJson,
  saveJson,
};

// =============================================================================
// End of fs_storage.js
// =============================================================================
