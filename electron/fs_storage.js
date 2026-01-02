// electron/fs_storage.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Disk utilities for the main process.
// Responsibilities:
// - Define canonical config paths used by the app.
// - Ensure required config folders exist.
// - Read/write small JSON files used for persistent state (settings, current text, etc.).
//
// Notes:
// - All operations are synchronous (main process only).
// - loadJson() returns a caller-provided fallback on missing/invalid JSON.

// =============================================================================
// Imports (external + internal modules)
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
    // Missing file is not an error: callers decide what the fallback should be.
    if (!fs.existsSync(filePath)) {
      log.warnOnce(
        `fs_storage.loadJson:missing:${String(filePath)}`,
        'loadJson missing (using fallback):',
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
    // Recoverable by design: we return fallback and the app can continue.
    // Deduplicate to avoid log spam if a file is repeatedly read while invalid.
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
    // Ensure parent directory exists so callers don't depend on init ordering.
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
