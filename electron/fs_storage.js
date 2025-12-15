// electron/fs_storage.js
// Disk access utilities shared by the main process

const fs = require('fs');
const path = require('path');

// Base configuration folder
const CONFIG_DIR = path.join(__dirname, '..', 'config');

// Default presets folder in config
const CONFIG_PRESETS_DIR = path.join(CONFIG_DIR, 'presets_defaults');

function ensureConfigDir() {
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  } catch (e) {
    console.error('Error creating config dir:', e);
  }
}

function loadJson(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    console.error(`Error reading JSON ${filePath}:`, e);
    return fallback;
  }
}

function saveJson(filePath, obj) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
  } catch (e) {
    console.error(`Error writing JSON ${filePath}:`, e);
  }
}

function ensureConfigPresetsDir() {
  try {
    if (!fs.existsSync(CONFIG_PRESETS_DIR)) {
      fs.mkdirSync(CONFIG_PRESETS_DIR, { recursive: true });
    }
  } catch (err) {
    console.error('Error creating config/presets_defaults:', err);
  }
}

module.exports = {
  CONFIG_DIR,
  CONFIG_PRESETS_DIR,
  ensureConfigDir,
  ensureConfigPresetsDir,
  loadJson,
  saveJson
};
