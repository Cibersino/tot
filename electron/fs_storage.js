// electron/fs_storage.js
// Disk access utilities shared by the main process
'use strict';

const fs = require('fs');
const path = require('path');
const Log = require('./log');

const log = Log.get('fs-storage');

// Base configuration folder
const CONFIG_DIR = path.join(__dirname, '..', 'config');

// Default presets folder in config
const CONFIG_PRESETS_DIR = path.join(CONFIG_DIR, 'presets_defaults');

function ensureConfigDir() {
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  } catch (err) {
    log.error('Error creating config dir:', err);
  }
}

function ensureConfigPresetsDir() {
  try {
    if (!fs.existsSync(CONFIG_PRESETS_DIR)) {
      fs.mkdirSync(CONFIG_PRESETS_DIR, { recursive: true });
    }
  } catch (err) {
    log.error('Error creating config/presets_defaults:', err);
  }
}

function loadJson(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return fallback;

    let raw = fs.readFileSync(filePath, 'utf8');

    // Remove UTF-8 BOM if present (some editors add it and JSON.parse may fail).
    raw = raw.replace(/^\uFEFF/, '');

    return JSON.parse(raw || '{}');
  } catch (err) {
    // Recoverable by design: we return fallback and the app can continue.
    // Deduplicate to avoid log spam if a file is repeatedly read while invalid.
    log.warnOnce(
      `fs_storage.loadJson:${String(filePath)}`,
      'Error reading/parsing JSON (using fallback):',
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
    log.error(`Error writing JSON ${filePath}:`, err);
  }
}

module.exports = {
  CONFIG_DIR,
  CONFIG_PRESETS_DIR,
  ensureConfigDir,
  ensureConfigPresetsDir,
  loadJson,
  saveJson,
};
