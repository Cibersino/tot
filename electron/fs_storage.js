// electron/fs_storage.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// File system helpers for the Electron main process.
//
// Responsibilities:
// - Resolve the app's config paths under ./config.
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

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const CONFIG_PRESETS_DIR = path.join(CONFIG_DIR, 'presets_defaults');

// =============================================================================
// Directory helpers
// =============================================================================

function ensureConfigDir() {
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  } catch (err) {
    log.error('ensureConfigDir failed:', CONFIG_DIR, err);
  }
}

function ensureConfigPresetsDir() {
  try {
    if (!fs.existsSync(CONFIG_PRESETS_DIR)) {
      fs.mkdirSync(CONFIG_PRESETS_DIR, { recursive: true });
    }
  } catch (err) {
    log.error('ensureConfigPresetsDir failed:', CONFIG_PRESETS_DIR, err);
  }
}

// =============================================================================
// JSON helpers
// =============================================================================

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
      }

      log.warnOnce(
        `fs_storage.loadJson:missing:${String(filePath)}`,
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
        `fs_storage.loadJson:empty:${String(filePath)}`,
        'loadJson empty file (using fallback):',
        filePath
      );
      return fallback;
    }

    return JSON.parse(raw);
  } catch (err) {
    // Invalid JSON is recoverable: return fallback and continue running.
    log.warnOnce(
      `fs_storage.loadJson:failed:${String(filePath)}`,
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
  CONFIG_DIR,
  CONFIG_PRESETS_DIR,
  ensureConfigDir,
  ensureConfigPresetsDir,
  loadJson,
  saveJson,
};

// =============================================================================
// End of fs_storage.js
// =============================================================================
