# Issue #72 - Evidence slice: File boundaries & Updater policy

Date: `2026-01-12`
Objective: Prepare app security before the first build.
Scope: This document covers only file boundaries + updater policy evidence.  
Other baseline areas (IPC surface, BrowserWindow/preloads, CSP) are documented elsewhere in the Issue #72 baseline notes.  
This slice should not be read as the full Issue #72 security baseline.
https://github.com/Cibersino/tot-readingmeter/issues/72

## PART 1 — Evidence pointers (raw)

### A) File I/O inventory (read/write)

Evidence ID: A1  
File: `electron/fs_storage.js` Lines: 31-32  
Snippet:
```js
const CONFIG_DIR = path.join(__dirname, '..', 'config');
const CONFIG_PRESETS_DIR = path.join(CONFIG_DIR, 'presets_defaults');
```
What it reads/writes: N/A (path definitions used by I/O).  
How the path is constructed: `CONFIG_DIR` from `__dirname/..` + `config`; `CONFIG_PRESETS_DIR` from `CONFIG_DIR/presets_defaults`.  
User-controlled path component: None shown.  
Guards/bounds: N/A.

Evidence ID: A2  
File: `electron/fs_storage.js` Lines: 38-50  
Snippet:
```js
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
```
What it reads/writes: Creates directories for `CONFIG_DIR` and `CONFIG_PRESETS_DIR`.  
How the path is constructed: Uses `CONFIG_DIR` and `CONFIG_PRESETS_DIR` from A1.  
User-controlled path component: None shown.  
Guards/bounds: `fs.existsSync` check before `mkdirSync`.

Evidence ID: A3  
File: `electron/fs_storage.js` Lines: 60-67  
Snippet:
```js
function loadJson(filePath, fallback = {}) {
  try {
    // Missing file is recoverable: callers decide what the fallback should be.
    if (!fs.existsSync(filePath)) {
      const baseName = path.basename(String(filePath));
      let note = '';
      if (baseName === 'current_text.json') {
        note = ' (note: may be normal on first run; file is created on quit)';
```
What it reads/writes: N/A (guard for `loadJson`).  
How the path is constructed: `filePath` is provided by callers.  
User-controlled path component: Path is caller-provided; safety depends on caller contract. Call sites shown in this slice wire fixed paths rooted in CONFIG_DIR + fixed filenames (A6-A7).  
Guards/bounds: Returns fallback when file missing (`fs.existsSync`).

Evidence ID: A4  
File: `electron/fs_storage.js` Lines: 82-85  
Snippet:
```js
let raw = fs.readFileSync(filePath, 'utf8');

// Remove UTF-8 BOM if present (some editors add it and JSON.parse may fail).
raw = raw.replace(/^\uFEFF/, '');
```
What it reads/writes: Reads JSON text from `filePath`.  
How the path is constructed: `filePath` is provided by callers.  
User-controlled path component: Path is caller-provided; safety depends on caller contract. Call sites shown in this slice wire fixed paths rooted in CONFIG_DIR + fixed filenames (A6-A7).  
Guards/bounds: BOM stripping before JSON parse.

Evidence ID: A5  
File: `electron/fs_storage.js` Lines: 110-118  
Snippet:
```js
function saveJson(filePath, obj) {
  try {
    // Ensure the parent folder exists so callers do not depend on init ordering.
    const parentDir = path.dirname(filePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
```
What it reads/writes: Writes JSON to `filePath`.  
How the path is constructed: `filePath` is provided by callers.  
User-controlled path component: Path is caller-provided; safety depends on caller contract. Call sites shown in this slice wire fixed paths rooted in CONFIG_DIR + fixed filenames (A6-A7).  
Guards/bounds: Ensures parent directory exists before write.

Evidence ID: A6  
File: `electron/main.js` Lines: 45-46  
Snippet:
```js
const SETTINGS_FILE = path.join(CONFIG_DIR, 'user_settings.json');
const CURRENT_TEXT_FILE = path.join(CONFIG_DIR, 'current_text.json');
```
What it reads/writes: N/A (path definitions used by I/O).  
How the path is constructed: Both files are `CONFIG_DIR/<filename>`.  
User-controlled path component: None shown.

Evidence ID: A7  
File: `electron/main.js` Lines: 74-79  
Snippet:
```js
textState.init({
  loadJson,
  saveJson,
  currentTextFile: CURRENT_TEXT_FILE,
  settingsFile: SETTINGS_FILE,
  app,
```
What it reads/writes: Wires `CURRENT_TEXT_FILE` and `SETTINGS_FILE` into `text_state` I/O.  
How the path is constructed: Uses `CURRENT_TEXT_FILE` / `SETTINGS_FILE` from A6.  
User-controlled path component: None shown.

Evidence ID: A8  
File: `electron/settings.js` Lines: 330-343  
Snippet:
```js
_settingsFile = settingsFile;

const raw = _loadJson(_settingsFile, {
  language: '',
  presets_by_language: {},
  selected_preset_by_language: {},
  disabled_default_presets: {},
});

const normalized = normalizeSettings(raw);
_currentSettings = normalized;

try {
  _saveJson(_settingsFile, _currentSettings);
```
What it reads/writes: Reads and writes the settings JSON file via injected `loadJson`/`saveJson`.  
How the path is constructed: `settingsFile` passed from `main.js` (A6/A7).  
User-controlled path component: None shown in path.

Evidence ID: A9  
File: `electron/settings.js` Lines: 36-39  
Snippet:
```js
const normalizeLangBase = (lang) => {
  if (typeof lang !== 'string') return DEFAULT_LANG;
  const base = lang.trim().toLowerCase().split(/[-_]/)[0];
  return /^[a-z0-9]+$/.test(base) ? base : DEFAULT_LANG;
};
```
What it reads/writes: N/A (language base normalization used by I/O paths).  
How the path is constructed: Restricts `lang` base to `[a-z0-9]+` or `DEFAULT_LANG`.  
User-controlled path component: `lang` is caller-provided; this slice shows settings language is set via `set-language` (B3).  
Guards/bounds: Regex validation of base language.

Evidence ID: A10  
File: `electron/settings.js` Lines: 68-75  
Snippet:
```js
function loadNumberFormatDefaults(lang) {
  const langCode = deriveLangKey(lang);
  const filePath = path.join(__dirname, '..', 'i18n', langCode, 'numberFormat.json');

  try {
    if (!fs.existsSync(filePath)) return null;

    let raw = fs.readFileSync(filePath, 'utf8');
```
What it reads/writes: Reads `i18n/<langCode>/numberFormat.json`.  
How the path is constructed: `__dirname/../i18n/<langCode>/numberFormat.json`, where `langCode` is derived from the caller-provided `lang` via `deriveLangKey` (see snippet).  
User-controlled path component: `langCode` is derived from the caller-provided `lang`; the caller source is not shown in this slice.  
Guards/bounds: `fs.existsSync` before read.

Evidence ID: A11  
File: `electron/menu_builder.js` Lines: 137-150  
Snippet:
```js
function loadBundle(langCode, requested, required) {
    const langBase = getLangBase(langCode) || langCode;

    const files = [];
    if (langCode.includes('-')) {
        files.push(path.join(__dirname, '..', 'i18n', langBase, langCode, 'main.json'));
    }
    files.push(path.join(__dirname, '..', 'i18n', langCode, 'main.json'));

    for (const file of files) {
        if (!fs.existsSync(file)) continue;

        try {
            let raw = fs.readFileSync(file, 'utf8');
```
What it reads/writes: Reads `i18n/.../main.json` translation files.  
How the path is constructed: `__dirname/../i18n/<langBase>/<langCode>/main.json` (if `langCode` has `-`) and `__dirname/../i18n/<langCode>/main.json`.  
User-controlled path component: `langCode` is an input to `loadBundle`; `langBase` is derived via `getLangBase` before path construction (see snippet).  
Guards/bounds: `fs.existsSync` before read.

Evidence ID: A12  
File: `electron/text_state.js` Lines: 132-136  
Snippet:
```js
// Initial load from disk + truncated if hard cap is exceeded
try {
  let raw = loadJson
    ? loadJson(currentTextFile, { text: '' })
    : { text: '' };
```
What it reads/writes: Reads `currentTextFile` (via `loadJson`).  
How the path is constructed: `currentTextFile` passed from `main.js` (A6/A7).  
User-controlled path component: Path is caller-provided; in this slice, the caller wiring uses CONFIG_DIR/current_text.json via main.js (A6-A7).  
Guards/bounds: Fallback `{ text: '' }` if missing (A3).

Evidence ID: A13  
File: `electron/text_state.js` Lines: 152-158  
Snippet:
```js
if (txt.length > maxTextChars) {
  log.warn(
    `Initial text exceeds effective hard cap (${txt.length} > ${maxTextChars}); truncated and saved.`
  );
  txt = txt.slice(0, maxTextChars);
  if (saveJson && currentTextFile) {
    saveJson(currentTextFile, { text: txt });
```
What it reads/writes: Writes truncated current text to `currentTextFile`.  
How the path is constructed: `currentTextFile` from `main.js` (A6/A7).  
User-controlled path component: Path is caller-provided; in this slice, the caller wiring uses CONFIG_DIR/current_text.json via main.js (A6-A7).  
Guards/bounds: Truncates to `maxTextChars` before write.

Evidence ID: A14  
File: `electron/text_state.js` Lines: 88-101  
Snippet:
```js
if (saveJson && currentTextFile) {
  saveJson(currentTextFile, { text: currentText || '' });
}

// Maintain previous behavior: ensure settings file exists.
if (loadJson && saveJson && settingsFile) {
  const settingsDefaults = {
    language: 'es',
    presets_by_language: {},
    disabled_default_presets: {},
  };
  const settings = loadJson(settingsFile, settingsDefaults);
  if (!fs.existsSync(settingsFile)) {
    saveJson(settingsFile, settings);
  }
```
What it reads/writes: Writes `currentTextFile`; reads and possibly writes `settingsFile`.  
How the path is constructed: `currentTextFile` / `settingsFile` from `main.js` (A6/A7).  
User-controlled path component: Path is caller-provided; in this slice, the caller wiring passes fixed paths rooted in CONFIG_DIR (current_text.json, user_settings.json) via main.js (A6-A7).  
Guards/bounds: Only writes when helpers and file paths exist; checks `fs.existsSync` before creating settings file.

Evidence ID: A15  
File: `electron/editor_state.js` Lines: 6-10  
Snippet:
```js
const { CONFIG_DIR, loadJson, saveJson } = require('./fs_storage');
const Log = require('./log');

const log = Log.get('editor-state');
const EDITOR_STATE_FILE = path.join(CONFIG_DIR, 'editor_state.json');
```
What it reads/writes: N/A (path definition for editor state I/O).  
How the path is constructed: `CONFIG_DIR/editor_state.json`.  
User-controlled path component: None shown.

Evidence ID: A16  
File: `electron/editor_state.js` Lines: 59-63  
Snippet:
```js
function loadInitialState(customLoadJson) {
  const loader = typeof customLoadJson === 'function' ? customLoadJson : loadJson;
  try {
    const raw = loader(EDITOR_STATE_FILE, DEFAULT_STATE);
    return normalizeState(raw);
```
What it reads/writes: Reads `EDITOR_STATE_FILE` via `loadJson`.  
How the path is constructed: `EDITOR_STATE_FILE` from A15.  
User-controlled path component: None shown.

Evidence ID: A17  
File: `electron/editor_state.js` Lines: 83-98  
Snippet:
```js
const bounds = editorWin.getBounds();
const current = loader(EDITOR_STATE_FILE, { maximized: false, reduced: null });
const state = normalizeState(current);

if (!state.reduced && state.maximized === true) {
  return;
}

state.reduced = {
  width: bounds.width,
  height: bounds.height,
  x: bounds.x,
  y: bounds.y
};

saver(EDITOR_STATE_FILE, state);
```
What it reads/writes: Reads and writes `EDITOR_STATE_FILE` during window events.  
How the path is constructed: `EDITOR_STATE_FILE` from A15.  
User-controlled path component: None shown.  
Guards/bounds: Only saves reduced state when not maximized; normalization via `normalizeState`.

Evidence ID: A18  
File: `electron/presets_main.js` Lines: 11-18  
Snippet:
```js
const { DEFAULT_LANG, MAX_PRESET_STR_CHARS } = require('./constants_main');
const { CONFIG_PRESETS_DIR, ensureConfigPresetsDir } = require('./fs_storage');
const settingsState = require('./settings');
const { normalizeLangTag, normalizeLangBase } = settingsState;
const menuBuilder = require('./menu_builder');

// Default presets source folder (.js)
const PRESETS_SOURCE_DIR = path.join(__dirname, 'presets'); // original folder: electron/presets
```
What it reads/writes: N/A (path bases for preset files).  
How the path is constructed: `PRESETS_SOURCE_DIR` is `__dirname/presets`; `CONFIG_PRESETS_DIR` from A1.  
User-controlled path component: None shown.

Evidence ID: A19  
File: `electron/presets_main.js` Lines: 62-66  
Snippet:
```js
function loadPresetArrayFromJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, 'utf8');
    const arr = JSON.parse(raw || '[]');
```
What it reads/writes: Reads JSON from `filePath`.  
How the path is constructed: `filePath` passed by callers (e.g., A20).  
User-controlled path component: Path is caller-provided; in this slice, call sites construct it from CONFIG_PRESETS_DIR / PRESETS_SOURCE_DIR and (when language-specific) constrain the language token via normalizeLangBase (A20, A9).  
Guards/bounds: Returns empty array if file missing.

Evidence ID: A20  
File: `electron/presets_main.js` Lines: 81-93  
Snippet:
```js
const combined =
  loadPresetArrayFromJson(path.join(CONFIG_PRESETS_DIR, 'defaults_presets.json')).slice();
if (!combined.length) {
  combined.push(
    ...loadPresetArrayFromJson(path.join(PRESETS_SOURCE_DIR, 'defaults_presets.json'))
  );
}

const langCode = normalizeLangBase(lang);
if (langCode) {
  const langPresets =
    loadPresetArrayFromJson(
      path.join(CONFIG_PRESETS_DIR, `defaults_presets_${langCode}.json`)
```
What it reads/writes: Reads preset defaults from `CONFIG_PRESETS_DIR` and fallback from `PRESETS_SOURCE_DIR`.  
How the path is constructed: `CONFIG_PRESETS_DIR/defaults_presets*.json` and `PRESETS_SOURCE_DIR/defaults_presets*.json`; language file name uses `langCode` from `normalizeLangBase` (A9).  
User-controlled path component: `lang` is caller-provided; `langCode` is derived via `normalizeLangBase` in this function (A9).  
Guards/bounds: Uses `normalizeLangBase`.

Evidence ID: A21  
File: `electron/presets_main.js` Lines: 117-131  
Snippet:
```js
const entries = fs.readdirSync(PRESETS_SOURCE_DIR);
entries
  .filter((name) => /^defaults_presets.*\.json$/i.test(name))
  .forEach((fname) => {
    const src = path.join(PRESETS_SOURCE_DIR, fname);
    const dest = path.join(
      CONFIG_PRESETS_DIR,
      fname
    );

    // Only copy if the source JSON exists and the destination does not yet exist
    if (fs.existsSync(src) && !fs.existsSync(dest)) {
      try {
        const raw = fs.readFileSync(src, 'utf8');
        fs.writeFileSync(dest, raw, 'utf8');
```
What it reads/writes: Reads preset JSON from `PRESETS_SOURCE_DIR` and writes to `CONFIG_PRESETS_DIR`.  
How the path is constructed: `PRESETS_SOURCE_DIR/<fname>` and `CONFIG_PRESETS_DIR/<fname>`.  
User-controlled path component: None shown.  
Guards/bounds: Copies only if source exists and destination missing.

Evidence ID: A22  
File: `electron/presets_main.js` Lines: 229-240  
Snippet:
```js
const entries = fs.existsSync(CONFIG_PRESETS_DIR)
  ? fs.readdirSync(CONFIG_PRESETS_DIR)
  : [];

// Load general defaults
const generalJson = entries.find(
  (n) => n.toLowerCase() === 'defaults_presets.json'
);
if (generalJson) {
  try {
    general = JSON.parse(
      fs.readFileSync(path.join(CONFIG_PRESETS_DIR, generalJson), 'utf8')
    );
```
What it reads/writes: Reads preset defaults from `CONFIG_PRESETS_DIR/defaults_presets.json`.  
How the path is constructed: `CONFIG_PRESETS_DIR/<filename>`.  
User-controlled path component: None shown.  
Guards/bounds: `fs.existsSync` for directory; JSON parse in try/catch.

Evidence ID: A23  
File: `electron/main.js` Lines: 889-894  
Snippet:
```js
ipcMain.handle('get-available-languages', async () => {
  const manifestPath = path.join(app.getAppPath(), 'i18n', 'languages.json');

  try {
    const raw = await fs.promises.readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw);
```
What it reads/writes: Reads `languages.json` manifest from app path.  
How the path is constructed: `app.getAppPath()/i18n/languages.json`.  
User-controlled path component: None shown.

Evidence ID: A24  
File: `electron/updater.js` Lines: 15-18  
Snippet:
```js
// Version/download paths and URLs
const VERSION_FILE = path.join(__dirname, '..', 'VERSION');
const VERSION_REMOTE_URL = 'https://raw.githubusercontent.com/Cibersino/tot-readingmeter/main/VERSION';
const DOWNLOAD_URL = 'https://github.com/Cibersino/tot-readingmeter/releases/latest';
```
What it reads/writes: N/A (local version path + remote URLs).  
How the path is constructed: `VERSION_FILE` is `__dirname/../VERSION`.  
User-controlled path component: None shown.

Evidence ID: A25  
File: `electron/updater.js` Lines: 71-73  
Snippet:
```js
let localVer = null;
try {
  localVer = fs.readFileSync(VERSION_FILE, 'utf8').trim();
```
What it reads/writes: Reads local `VERSION_FILE`.  
How the path is constructed: `VERSION_FILE` from A24.  
User-controlled path component: None shown.

### B) User-controlled inputs that can reach file I/O

Evidence ID: B1  
File: `electron/text_state.js` Lines: 206-210  
Snippet:
```js
// set-current-text: accept { text, meta } or simple string
ipcMain.handle('set-current-text', (_event, payload) => {
  try {
    const isPayloadObject = payload && typeof payload === 'object';
    const hasTextProp =
```
Input receipt: IPC channel `set-current-text` receives renderer payload.

Evidence ID: B2  
File: `electron/text_state.js` Lines: 213-227  
Snippet:
```js
if (isPayloadObject && !hasTextProp) {
  log.warnOnce(
    'text_state.setCurrentText.missingText',
    'set-current-text payload missing text; using String(payload).'
  );
}
const incomingMeta = hasTextProp ? sanitizeMeta(payload.meta) : null;
let text = hasTextProp ? String(payload.text || '') : String(payload || '');

if (text.length > maxIpcChars) {
  log.warnOnce(
    'text_state.setCurrentText.payload_too_large',
    `set-current-text payload too large (${text.length} > ${maxIpcChars}); rejecting.`
  );
  throw new Error('set-current-text payload too large');
```
Bounds before persistence: Rejects payloads over `maxIpcChars` and coerces payload to string.  
Persistence path: `currentTextFile` written on quit (A14) and on truncation (A13).

Evidence ID: B3  
File: `electron/settings.js` Lines: 494-508  
Snippet:
```js
ipcMain.handle('set-language', async (_event, lang) => {
  try {
    const chosenRaw = String(lang || '');
    const chosen = normalizeLangTag(chosenRaw);
    if (!chosen) {
      log.warnOnce(
        'settings.set-language.invalid',
        `set-language called with empty/invalid language; falling back to "${DEFAULT_LANG}" for menu.`
      );
    }

    let settings = getSettings();
    if (chosen) {
      settings.language = chosen;
      settings = saveSettings(settings);
```
Bounds before persistence: Normalizes language via `normalizeLangTag`; empty/invalid logged and skipped.  
Persistence path: Writes settings file via `saveSettings` (A8).  
User-controlled path influence: Language value feeds i18n file paths (A10, A11).

Evidence ID: B4  
File: `electron/settings.js` Lines: 555-560  
Snippet:
```js
// set-mode-conteo: updates modeConteo and broadcasts
ipcMain.handle('set-mode-conteo', async (_event, mode) => {
  try {
    let settings = getSettings();
    settings.modeConteo = mode === 'simple' ? 'simple' : 'preciso';
    settings = saveSettings(settings);
```
Bounds before persistence: Only `'simple'` or `'preciso'` persisted.  
Persistence path: Writes settings file via `saveSettings` (A8).

Evidence ID: B5  
File: `electron/settings.js` Lines: 573-581  
Snippet:
```js
ipcMain.handle('set-selected-preset', async (_event, presetName) => {
  try {
    const name = typeof presetName === 'string' ? presetName.trim() : '';
    if (!name) {
      log.warnOnce(
        'settings.set-selected-preset.invalid',
        'set-selected-preset called with empty/invalid preset name (ignored).'
      );
      return { ok: false, error: 'invalid' };
```
Bounds before persistence: Trims name and rejects empty input.

Evidence ID: B6  
File: `electron/settings.js` Lines: 592-598  
Snippet:
```js
const langKey = deriveLangKey(langTag);
settings.selected_preset_by_language = settings.selected_preset_by_language || {};
if (settings.selected_preset_by_language[langKey] === name) {
  return { ok: true, langKey, name };
}
settings.selected_preset_by_language[langKey] = name;
settings = saveSettings(settings);
```
Persistence path: Writes settings file via `saveSettings` (A8).

Evidence ID: B7  
File: `electron/presets_main.js` Lines: 36-49  
Snippet:
```js
const name = String(raw.name || '').trim();
const description = String(raw.description || '').trim();
const wpmNum = Number(raw.wpm);

if (!name) {
  return { ok: false, error: 'invalid preset payload', code: 'INVALID_PRESET' };
}

if (name.length > MAX_PRESET_STR_CHARS || description.length > MAX_PRESET_STR_CHARS) {
  return { ok: false, error: 'preset payload too large', code: 'PAYLOAD_TOO_LARGE' };
}

if (!Number.isFinite(wpmNum)) {
  return { ok: false, error: 'invalid preset payload', code: 'INVALID_PRESET' };
```
Bounds before persistence: Requires non-empty name, max length for name/description, numeric `wpm`.

Evidence ID: B8  
File: `electron/presets_main.js` Lines: 325-334  
Snippet:
```js
// Handle preset creation request from preset modal
ipcMain.handle('create-preset', (_event, preset) => {
  try {
    const sanitized = sanitizePresetInput(preset);
    if (!sanitized.ok) {
      log.warnOnce(
        'presets_main.create-preset.invalid',
        '[presets_main] create-preset invalid payload (ignored).'
      );
      return { ok: false, error: sanitized.error, code: sanitized.code };
```
Input receipt: IPC channel `create-preset` uses `sanitizePresetInput` (B7).

Evidence ID: B9  
File: `electron/presets_main.js` Lines: 337-351  
Snippet:
```js
const sanitizedPreset = sanitized.preset;
let settings = settingsState.getSettings();
const lang = getEffectiveLang(settings);
const userPresets = getUserPresets(settings, lang);

// If preset name already exists in user's presets, overwrite that one
const idx = userPresets.findIndex((p) => p.name === sanitizedPreset.name);
if (idx >= 0) {
  userPresets[idx] = sanitizedPreset;
} else {
  userPresets.push(sanitizedPreset);
}

settings = settingsState.saveSettings(settings);
broadcast(settings);
```
Persistence path: Writes settings file via `settingsState.saveSettings` (A8).

Evidence ID: B10  
File: `electron/presets_main.js` Lines: 620-632  
Snippet:
```js
ipcMain.handle('edit-preset', async (_event, payload) => {
  try {
    const originalName =
      isPlainObject(payload) && Object.prototype.hasOwnProperty.call(payload, 'originalName')
        ? String(payload.originalName || '').trim()
        : '';
    if (!originalName) {
      return { ok: false, code: 'NO_ORIGINAL_NAME', error: 'invalid originalName' };
    }

    const sanitized = sanitizePresetInput(
      isPlainObject(payload) ? payload.newPreset : null
    );
```
Bounds before persistence: Requires non-empty original name; uses `sanitizePresetInput` (B7).

Evidence ID: B11  
File: `electron/presets_main.js` Lines: 714-715  
Snippet:
```js
settings = settingsState.saveSettings(settings);
broadcast(settings);
```
Persistence path: Writes settings file via `settingsState.saveSettings` (A8).

Evidence ID: B12  
File: `electron/presets_main.js` Lines: 371-385  
Snippet:
```js
ipcMain.handle('request-delete-preset', async (_event, name) => {
  try {
    if (typeof name !== 'undefined' && name !== null && typeof name !== 'string') {
      log.warnOnce(
        'presets_main.request-delete-preset.invalid_name',
        '[presets_main] request-delete-preset invalid name (ignored).'
      );
      return { ok: false, error: 'invalid name', code: 'INVALID_NAME' };
    }
    if (typeof name === 'string') {
      const trimmed = name.trim();
      if (trimmed.length > MAX_PRESET_STR_CHARS) {
        log.warnOnce(
          'presets_main.request-delete-preset.name_too_large',
          '[presets_main] request-delete-preset name too large (ignored).'
```
Bounds before persistence: Requires string; trims; enforces `MAX_PRESET_STR_CHARS`.

Evidence ID: B13  
File: `electron/presets_main.js` Lines: 458-466  
Snippet:
```js
if (idxUser >= 0) {
  // There is a personalized preset with that name
  if (isDefault) {
    // Remove personalized preset and mark default as ignored
    userPresets.splice(idxUser, 1);
    if (!settings.disabled_default_presets[lang].includes(name)) {
      settings.disabled_default_presets[lang].push(name);
    }
    settings = settingsState.saveSettings(settings);
    broadcast(settings);
```
Persistence path: Writes settings file via `settingsState.saveSettings` (A8).

Evidence ID: B14  
Search evidence (no file dialogs in main process)  
Command: `rg -n "showOpenDialog|showSaveDialog" electron`  
Result: 0 hits.

### C) Updater policy inventory

Evidence ID: C1  
File: `electron/updater.js` Lines: 15-18  
Snippet:
```js
// Version/download paths and URLs
const VERSION_FILE = path.join(__dirname, '..', 'VERSION');
const VERSION_REMOTE_URL = 'https://raw.githubusercontent.com/Cibersino/tot-readingmeter/main/VERSION';
const DOWNLOAD_URL = 'https://github.com/Cibersino/tot-readingmeter/releases/latest';
```
Endpoints/URLs: `VERSION_REMOTE_URL`, `DOWNLOAD_URL`.  
Local file: `VERSION_FILE`.

Evidence ID: C2  
File: `electron/updater.js` Lines: 46-54  
Snippet:
```js
function fetchRemoteVersion(url) {
  return new Promise((resolve) => {
    try {
      https.get(url, (res) => {
        if (res.statusCode !== 200) return resolve(null);
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve(String(data || '').trim()));
      }).on('error', () => resolve(null));
```
Network behavior: HTTPS GET to fetch remote version text.

Evidence ID: C3  
File: `electron/updater.js` Lines: 71-73  
Snippet:
```js
let localVer = null;
try {
  localVer = fs.readFileSync(VERSION_FILE, 'utf8').trim();
```
Local read: Reads `VERSION_FILE`.

Evidence ID: C4  
File: `electron/updater.js` Lines: 79-88  
Snippet:
```js
const remoteVer = await fetchRemoteVersion(VERSION_REMOTE_URL);
if (!remoteVer) {
  if (manual && mainWin && !mainWin.isDestroyed()) {
    const title = resolveDialogText(dlg, 'update_failed_title', 'Update check failed');
    const message = resolveDialogText(
      dlg,
      'update_failed_message',
      'Could not check for updates. Please check your connection and try again.'
    );
    await dialog.showMessageBox(mainWin, {
```
Failure behavior: Manual checks show a dialog on failure.

Evidence ID: C5  
File: `electron/updater.js` Lines: 135-145  
Snippet:
```js
const res = await dialog.showMessageBox(mainWin, {
  type: 'none',
  buttons: [btnDownload, btnLater],
  defaultId: 0,
  cancelId: 1,
  title,
  message,
});
if (res.response === 0) {
  shell.openExternal(DOWNLOAD_URL);
}
```
User prompts/consent: Shows dialog; only opens URL if user selects Download.  
External URLs: `shell.openExternal(DOWNLOAD_URL)`.

Evidence ID: C6  
File: `electron/updater.js` Lines: 151-157  
Snippet:
```js
// Automatic, one-time check
function scheduleInitialCheck() {
  if (updateCheckDone) return;
  updateCheckDone = true;
  // we do not check manual: if it fails, the user is not informed
  checkForUpdates({ manual: false }).catch((err) => {
    log.warn('initial checkForUpdates failed:', err);
  });
```
Automatic behavior: One-time automatic check; failures logged without user dialog.

Evidence ID: C7  
File: `electron/updater.js` Lines: 170-175  
Snippet:
```js
if (ipcMain && typeof ipcMain.handle === 'function') {
  ipcMain.handle('check-for-updates', async () => {
    try {
      await checkForUpdates({
        lang: typeof currentLanguageRef === 'function' ? currentLanguageRef() : DEFAULT_LANG,
        manual: true,
```
Manual check: IPC channel `check-for-updates` triggers manual update check.

Evidence ID: C8  
File: `electron/main.js` Lines: 1171-1176  
Snippet:
```js
updater.scheduleInitialCheck();
});
} else {
  // Language already defined: go directly to the main window.
  createMainWindow();
  updater.scheduleInitialCheck();
}
```
Startup behavior: `scheduleInitialCheck()` called after language selection or main window creation.

Evidence ID: C9  
File: `electron/updater.js` Lines: 146-147  
Snippet:
```js
} catch (err) {
  log.warn('checkForUpdates failed:', err);
```
Failure logging: Logs warning on check failure.

Evidence ID: C10  
Search evidence (no auto-update download/execute hooks in `electron/`)  
Command: `rg -n "autoUpdater|downloadUpdate|quitAndInstall|setFeedURL|Squirrel|app-update" electron`  
Result: 0 hits.

## PART 2 — Evidence-based conclusions (strictly derived)

- File boundaries: In this slice, persistent user-data reads/writes are rooted in `CONFIG_DIR` (`__dirname/../config`) and `CONFIG_PRESETS_DIR` (`config/presets_defaults`), with files `user_settings.json`, `current_text.json`, `editor_state.json`, and `defaults_presets*.json` (A1, A6, A14, A15, A20-A22).  
- Additional read locations: `i18n/<lang>/numberFormat.json` and `i18n/.../main.json` (A10-A11), `app.getAppPath()/i18n/languages.json` (A23), preset seeds in `electron/presets` (A18, A20-A21), and local `VERSION` file at `__dirname/../VERSION` (A24-A25).  
- User-controlled path influence: In this slice, renderer-controlled input influences language codes used for i18n file selection; language is normalized in `set-language` and base constrained by `normalizeLangBase` (B3, A9). No native file open/save dialogs were observed in the evidenced search scope (B14).  
- User-controlled data persisted: `set-current-text` is size-checked and persisted to `current_text.json` on quit or truncation (B1-B2, A13-A14); settings mutations from `set-language`, `set-mode-conteo`, `set-selected-preset`, and preset create/edit/delete flow into `user_settings.json` via `saveSettings` (B3-B13, A8).  
- Updater policy: Reads local `VERSION`, fetches remote version from `https://raw.githubusercontent.com/Cibersino/tot-readingmeter/main/VERSION`, prompts the user, and on consent opens `https://github.com/Cibersino/tot-readingmeter/releases/latest` in the external browser; automatic checks run once at startup, manual checks are via IPC, and failures are logged (C1-C9).  
- What the updater does NOT do: No in-app auto-update download/execute hooks (e.g., `autoUpdater`, `downloadUpdate`, `quitAndInstall`) are present in `electron/` per search with 0 hits (C10).  
- Gaps: Within the module set and searches explicitly evidenced in this document, no file dialogs or in-app auto-update download/execute hooks were observed (B14, C10).

### File boundary policy (derived from evidence in this slice)

- Persistent storage is rooted in `CONFIG_DIR` with fixed filenames for settings/current text/editor state (A1, A6, A14-A17).
- Preset defaults are read from `config/presets_defaults` with fallback to bundled `electron/presets` and are copied to config if missing (A18-A22).
- i18n data is read from `i18n/<lang>` paths using `langCode`/`langBase` in `loadBundle` (A11); language normalization/base constraints are defined in settings (B3, A9).
- No main-process open/save dialogs were observed in the evidenced search scope (B14).

### Updater policy & threat assumptions (derived from evidence in this slice)

- Reads local `VERSION` from disk and fetches remote `VERSION` via HTTPS GET (C1-C3).
- Compares local vs remote version and prompts the user before any navigation (C4-C5).
- On user consent, opens the releases URL in an external browser (C1, C5).
- Automatic checks run once at startup; manual checks are exposed over IPC (C6-C8).
- Manual failures surface a dialog; automatic failures are logged only (C4, C6, C9).
- No in-app update download/install/execute hooks were observed in the evidenced search scope (C10).
- Threat assumption: no cryptographic verification is shown in the updater flow evidenced here; risk is limited to update-notification correctness because the update action is an external URL open and no in-app download/execute hooks are observed in this search scope (C2, C5, C10).
