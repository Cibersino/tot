// electron/fs_storage.js
// Utilidades de acceso a disco compartidas por el proceso principal

const fs = require('fs');
const path = require('path');

// Carpeta de configuracion base (mismo calculo que en main.js)
const CONFIG_DIR = path.join(__dirname, '..', 'config');

// Carpeta de presets por defecto en config
const CONFIG_PRESETS_DIR = path.join(CONFIG_DIR, 'presets_defaults');

function ensureConfigDir() {
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  } catch (e) {
    console.error('No se pudo crear config dir:', e);
  }
}

function loadJson(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (e) {
    console.error(`Error leyendo JSON ${filePath}:`, e);
    return fallback;
  }
}

function saveJson(filePath, obj) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
  } catch (e) {
    console.error(`Error escribiendo JSON ${filePath}:`, e);
  }
}

function ensureConfigPresetsDir() {
  try {
    if (!fs.existsSync(CONFIG_PRESETS_DIR)) {
      fs.mkdirSync(CONFIG_PRESETS_DIR, { recursive: true });
    }
  } catch (err) {
    console.error('No se pudo crear config/presets_defaults:', err);
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
