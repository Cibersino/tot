// electron/main.js
const { app, BrowserWindow, ipcMain, dialog, Menu, shell, screen, globalShortcut } = require('electron');
const https = require('https');
const path = require('path');
const fs = require('fs');

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const SETTINGS_FILE = path.join(CONFIG_DIR, 'user_settings.json');
const CURRENT_TEXT_FILE = path.join(CONFIG_DIR, 'current_text.json');
const MODAL_STATE_FILE = path.join(CONFIG_DIR, 'modal_state.json');
const VERSION_FILE = path.join(__dirname, '..', 'VERSION');
const VERSION_REMOTE_URL = "https://raw.githubusercontent.com/Cibersino/tot-readingmeter/main/VERSION";
const DOWNLOAD_URL = "https://github.com/Cibersino/tot-readingmeter/releases/latest";
const VERSION_FILE = path.join(__dirname, '..', 'VERSION');

// Language modal assets
const LANGUAGE_MODAL_HTML = path.join(__dirname, '../public/language_modal.html');
const LANGUAGE_PRELOAD = path.join(__dirname, 'language_preload.js');

// Helpers: load numberFormat defaults from i18n (per language)
function loadNumberFormatDefaults(lang) {
  const baseDir = path.join(__dirname, '..', 'i18n');
  const file = path.join(baseDir, lang || 'es', 'numberFormat.json');
  try {
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, 'utf8');
      const cleaned = raw.replace(/^\uFEFF/, ''); // strip BOM if present
      const data = JSON.parse(cleaned || '{}');
      return (data && data.numberFormat) ? data.numberFormat : null;
    }
  } catch (err) {
    // noop: fall back handled by callers
    return null;
  }
  return null;
}

// Helpers: load main (menu/dialog) translations from i18n
function loadMainTranslations(lang) {
  const baseDir = path.join(__dirname, '..', 'i18n');
  const file = path.join(baseDir, lang || 'es', 'main.json');
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf8');
    const cleaned = raw.replace(/^\uFEFF/, ''); // strip BOM if present
    return JSON.parse(cleaned || '{}');
  } catch (err) {
    console.error('Error cargando traducciones de main.json:', err);
    return null;
  }
}

function getDialogTexts(lang) {
  const langCode = (lang || 'es').toLowerCase() || 'es';
  const tr = loadMainTranslations(langCode);
  const tMain = (tr && tr.main) ? tr.main : {};
  return tMain.dialog || {};
}

function compareVersions(a, b) {
  const pa = String(a || '').trim().split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '').trim().split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

function fetchRemoteVersion(url) {
  return new Promise((resolve) => {
    try {
      https.get(url, (res) => {
        if (res.statusCode !== 200) return resolve(null);
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve(String(data || '').trim()));
      }).on('error', () => resolve(null));
    } catch (e) {
      resolve(null);
    }
  });
}

async function checkForUpdates(lang) {
  try {
    const dlg = getDialogTexts(lang || currentLanguage || 'es') || {};
    let localVer = null;
    try {
      localVer = fs.readFileSync(VERSION_FILE, 'utf8').trim();
    } catch (e) {
      // sin VERSION local, continuar sin avisar
      return;
    }
    const remoteVer = await fetchRemoteVersion(VERSION_REMOTE_URL);
    if (!remoteVer) return;
    if (compareVersions(remoteVer, localVer) <= 0) return; // nada nuevo

    const title = dlg.update_title || 'Actualización disponible';
    const message = (dlg.update_message || 'Hay una versión nueva {remote}. Actual: {local}. ¿Descargar ahora?')
      .replace('{remote}', remoteVer)
      .replace('{local}', localVer);
    const btnDownload = dlg.update_download || 'Descargar';
    const btnLater = dlg.update_later || 'Más tarde';

    const res = await dialog.showMessageBox(mainWin, {
      type: 'info',
      buttons: [btnDownload, btnLater],
      defaultId: 0,
      cancelId: 1,
      title,
      message
    });
    if (res.response === 0) {
      shell.openExternal(DOWNLOAD_URL);
    }
  } catch (err) {
    console.warn('checkForUpdates failed:', err);
  }
}

// Helpers: presets defaults (general + por idioma si existe)
function sanitizeLangCode(lang) {
  if (typeof lang !== 'string') return '';
  const base = lang.trim().toLowerCase().split(/[-_]/)[0];
  return /^[a-z0-9]+$/.test(base) ? base : '';
}

function loadPresetArray(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    let data = require(filePath);
    if (!Array.isArray(data) && data && Array.isArray(data.default)) data = data.default;
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error(`Error loading preset file ${filePath}:`, err);
    return [];
  }
}

function loadDefaultPresetsCombined(lang) {
  const presetsDir = path.join(__dirname, 'presets');
  const combined = loadPresetArray(path.join(presetsDir, 'defaults_presets.js')).slice();
  const langCode = sanitizeLangCode(lang);
  if (langCode) {
    const langFile = path.join(presetsDir, `defaults_presets_${langCode}.js`);
    const langPresets = loadPresetArray(langFile);
    if (langPresets.length) combined.push(...langPresets);
  }
  return combined;
}

function ensureConfigDir() {
  try {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
  } catch (e) {
    console.error("No se pudo crear config dir:", e);
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

// Normalizar settings: asegurar campos por defecto sin sobrescribir los existentes
function normalizeSettings(s) {
  s = s || {};
  if (typeof s.language !== 'string') s.language = "";
  if (!Array.isArray(s.presets)) s.presets = [];
  if (typeof s.numberFormatting !== 'object') s.numberFormatting = (s.numberFormatting || {});
  // persistir modo de conteo por defecto: "preciso"
  if (!s.modeConteo || (s.modeConteo !== 'preciso' && s.modeConteo !== 'simple')) {
    s.modeConteo = 'preciso';
  }
  // Ensure numberFormatting has defaults for current language (from i18n if available)
  const lang = (s.language && typeof s.language === 'string' && s.language.trim()) ? s.language.trim() : 'es';
  if (!s.numberFormatting[lang]) {
    const nf = loadNumberFormatDefaults(lang);
    if (nf && nf.thousands && nf.decimal) {
      s.numberFormatting[lang] = { separadorMiles: nf.thousands, separadorDecimal: nf.decimal };
    } else {
      // fallback simple
      s.numberFormatting[lang] = lang === 'en'
        ? { separadorMiles: ",", separadorDecimal: "." }
        : { separadorMiles: ".", separadorDecimal: "," };
    }
  }
  return s;
}

ensureConfigDir();

// --- Maximum current text size (10 MB ~ 10,000,000 chars)
const MAX_TEXT_CHARS = 10000000;
const VERSION_REMOTE_URL = "https://raw.githubusercontent.com/Cibersino/tot-readingmeter/main/VERSION";
const DOWNLOAD_URL = "https://github.com/Cibersino/tot-readingmeter/releases/latest";

// --- Presets defaults: copia inicial (JS -> JSON) en config/presets_defaults ---
const PRESETS_SOURCE_DIR = path.join(__dirname, "presets"); // carpeta original: electron/presets
const CONFIG_PRESETS_DIR = path.join(CONFIG_DIR, "presets_defaults");

function ensureConfigPresetsDir() {
  try {
    fs.existsSync(CONFIG_PRESETS_DIR) || fs.mkdirSync(CONFIG_PRESETS_DIR, { recursive: true });
  } catch (err) {
    console.error("No se pudo crear config/presets_defaults:", err);
  }
}

function copyDefaultPresetsIfMissing() {
  try {
    ensureConfigPresetsDir();

    if (fs.existsSync(PRESETS_SOURCE_DIR)) {
      const entries = fs.readdirSync(PRESETS_SOURCE_DIR);
      entries
        .filter(name => /^defaults_presets.*\.js$/i.test(name))
        .forEach((fname) => {
          const src = path.join(PRESETS_SOURCE_DIR, fname);
          const dest = path.join(CONFIG_PRESETS_DIR, fname.replace(/\.js$/i, ".json"));

          // Only copy if the source JS exists and the destination JSON is missing
          if (fs.existsSync(src) && !fs.existsSync(dest)) {
            try {
              // Require the JS module that exports the array
              let arr = require(src);
              if (!Array.isArray(arr)) arr = Array.isArray(arr.default) ? arr.default : [];
              fs.writeFileSync(dest, JSON.stringify(arr, null, 2), "utf8");
              console.debug(`Copied default preset: ${src} -> ${dest}`);
            } catch (err) {
              console.error(`Error convirtiendo preset ${src} a JSON:`, err);
            }
          }
        });
    }
  } catch (err) {
    console.error("Error en copyDefaultPresetsIfMissing:", err);
  }
}

// Run initial copy (does not overwrite existing files)
copyDefaultPresetsIfMissing();

let mainWin = null, // main window
  editorWin = null, // modal window to edit current text
  presetWin = null, // modal window for new/edit preset wpm
  currentText = "", // current text
  langWin = null, // language selection modal (first launch)
  floatingWin = null; // floating stopwatch window
let currentLanguage = 'es';
let updateCheckDone = false;

// Build menu with i18n translations (main.json)
function buildAppMenu(lang) {
  const tr = loadMainTranslations(lang || 'es');
  const tMain = (tr && tr.main) ? tr.main : {};
  const m = tMain.menu || {};

  const menuTemplate = [
    {
      label: m.como_usar || 'Como usar la app?',
      submenu: [
        { label: m.guia_basica || 'Guia basica', click: () => mainWin && mainWin.webContents.send('menu-click', 'guia_basica') },
        { label: m.instrucciones_completas || 'Instrucciones completas', click: () => mainWin && mainWin.webContents.send('menu-click', 'instrucciones_completas') },
        { label: m.faq || 'FAQ', click: () => mainWin && mainWin.webContents.send('menu-click', 'faq') }
      ]
    },
    {
      label: m.herramientas || 'Tools',
      submenu: [
        { label: m.cargador_texto || 'Cargador de archivo de texto', click: () => mainWin && mainWin.webContents.send('menu-click', 'cargador_texto') },
        { label: m.cargador_imagen || 'Cargador de imagenes con texto', click: () => mainWin && mainWin.webContents.send('menu-click', 'contador_imagen') },
        { label: m.test_velocidad || 'Reading speed test', click: () => mainWin && mainWin.webContents.send('menu-click', 'test_velocidad') }
      ]
    },
    {
      label: m.preferencias || 'Preferences',
      submenu: [
        { label: m.idioma || 'Language', click: () => createLanguageWindow() },
        {
          label: m.diseno || 'Diseno',
          submenu: [
            { label: m.skins || 'Skins', click: () => mainWin && mainWin.webContents.send('menu-click', 'diseno_skins') },
            { label: m.crono_flotante || 'Cronometro flotante', click: () => mainWin && mainWin.webContents.send('menu-click', 'diseno_crono_flotante') },
            { label: m.fuentes || 'Fonts', click: () => mainWin && mainWin.webContents.send('menu-click', 'diseno_fuentes') },
            { label: m.colores || 'Colors', click: () => mainWin && mainWin.webContents.send('menu-click', 'diseno_colores') }
          ]
        },
        { label: m.shortcuts || 'Shortcuts', click: () => mainWin && mainWin.webContents.send('menu-click', 'shortcuts') },
        { label: m.presets_por_defecto || 'Default presets', click: () => mainWin && mainWin.webContents.send('menu-click', 'presets_por_defecto') }
      ]
    },
    {
      label: m.comunidad || 'Community',
      submenu: [
        { label: m.discord || 'Discord', click: () => mainWin && mainWin.webContents.send('menu-click', 'discord') },
        { label: m.avisos || 'News & updates', click: () => mainWin && mainWin.webContents.send('menu-click', 'avisos') }
      ]
    },
    { label: m.links_interes || 'Links de interes', click: () => mainWin && mainWin.webContents.send('menu-click', 'links_interes') },
    { label: m.colabora || 'CONTRIBUTE ($)', click: () => mainWin && mainWin.webContents.send('menu-click', 'colabora') },
    {
      label: m.ayuda || '?',
      submenu: [
        { label: m.actualizar_version || 'Actualizar a ultima version', click: () => mainWin && mainWin.webContents.send('menu-click', 'actualizar_version') },
        { label: m.readme || 'Readme', click: () => mainWin && mainWin.webContents.send('menu-click', 'readme') },
        { label: m.acerca_de || 'About', click: () => mainWin && mainWin.webContents.send('menu-click', 'acerca_de') }
      ]
    }
  ];

  // Dev menu (solo si se habilita por variable de entorno)
  const showDevMenu = process.env.SHOW_DEV_MENU === '1';
  if (!app.isPackaged && showDevMenu) {
    menuTemplate.push({
      label: m.desarrollo || 'Development',
      submenu: [
        { role: 'reload', label: m.recargar || 'Reload' },
        { role: 'forcereload', label: m.forcereload || 'Force reload' },
        {
          label: m.toggle_devtools || 'Toggle DevTools',
          accelerator: 'Ctrl+Shift+I',
          click: () => {
            if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.toggleDevTools();
          }
        }
      ]
    });
  }

  const appMenu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(appMenu);
}

// Registrar atajos globales en desarrollo (sin mostrar menú)
function registerDevShortcuts(mainWin) {
  if (app.isPackaged) return;
  try {
    globalShortcut.register('CommandOrControl+Shift+I', () => {
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.toggleDevTools();
      }
    });
    globalShortcut.register('CommandOrControl+R', () => {
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.reload();
      }
    });
    globalShortcut.register('CommandOrControl+Shift+R', () => {
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.reloadIgnoringCache();
      }
    });
  } catch (err) {
    console.warn('No se pudieron registrar los atajos de desarrollo:', err);
  }
}

function unregisterShortcuts() {
  try {
    globalShortcut.unregisterAll();
  } catch (err) {
    console.warn('Error al desregistrar atajos globales:', err);
  }
}

// Load current text from file at startup (if exists)
try {
  const obj = loadJson(CURRENT_TEXT_FILE, { text: "" });
  let txt = String(obj.text || "");
  if (txt.length > MAX_TEXT_CHARS) {
    console.warn(`current_text.json exceeds MAX_TEXT_CHARS (${txt.length}). It will be truncated to ${MAX_TEXT_CHARS} characters.`);
    txt = txt.slice(0, MAX_TEXT_CHARS);
    // Save the truncated version to keep sessions consistent
    saveJson(CURRENT_TEXT_FILE, { text: txt });
  }
  currentText = txt;
} catch (e) {
  currentText = "";
}

function createMainWindow() {
  // Nota: useContentSize:true hace que width/height se apliquen al contenido (sin incluir bordes)
  mainWin = new BrowserWindow({
    width: 828,
    height: 490,
    useContentSize: true,
    resizable: false,      // ventana no redimensionable por el usuario
    maximizable: false,    // no permitir maximizar (mantener dimensiones fijas)
    minimizable: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWin.loadFile(path.join(__dirname, '../public/index.html'));

  // --- BARRA SUPERIOR PERSONALIZADA (traducciones i18n) ---
  buildAppMenu(currentLanguage);
  // --- FIN BARRA SUPERIOR ---
  registerDevShortcuts(mainWin);

  // Al iniciarse el cierre de la ventana principal, cerrar ordenadamente ventanas dependientes.
  // No prevenimos el cierre; solo solicitamos el cierre de editor/preset si existen.
  mainWin.on('close', () => {
    try {
      if (editorWin && !editorWin.isDestroyed()) {
        try {
          editorWin.close();
        } catch (e) {
          console.error("Error cerrando editorWin desde mainWin.close:", e);
        }
      }

      if (presetWin && !presetWin.isDestroyed()) {
        try {
          presetWin.close();
        } catch (e) {
          console.error("Error cerrando presetWin desde mainWin.close:", e);
        }
      }
    } catch (e) {
      console.error("Error en mainWin.close handler:", e);
    }
  });

  // When the main window is already destroyed...
  mainWin.on('closed', () => {
    mainWin = null;

    // Force an orderly application exit
    try {
      app.quit();
    } catch (e) {
      console.error("Error llamando app.quit() en mainWin.closed:", e);
    }
  });
}

function createEditorWindow() {
  const modalState = loadJson(MODAL_STATE_FILE, {});
  // Default size if not present
  const defaults = { width: 1200, height: 800, x: undefined, y: undefined, maximized: false };
  const w = modalState.width || defaults.width;
  const h = modalState.height || defaults.height;
  const x = typeof modalState.x === 'number' ? modalState.x : undefined;
  const y = typeof modalState.y === 'number' ? modalState.y : undefined;

  editorWin = new BrowserWindow({
    width: w,
    height: h,
    x: x,
    y: y,
    resizable: true,
    minimizable: true,
    maximizable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'manual_preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // Remove the menu bar on the modal/editor window
  editorWin.setMenu(null);
  editorWin.setMenuBarVisibility(false);

  editorWin.loadFile(path.join(__dirname, '../public/manual.html'));

  // Show: if no modal_state exists, open maximized the first time
  const stateExists = fs.existsSync(MODAL_STATE_FILE);
  editorWin.once("ready-to-show", () => {
    if (!stateExists) {
      editorWin.maximize();
    } else {
      if (modalState.maximized) {
        editorWin.maximize();
      }
    }

    editorWin.show();

    // Enviar objeto estructurado al preload
    try {
      editorWin.webContents.send("manual-init-text", {
        text: currentText || "",
        meta: {
          source: "main",
          action: "init"
        }
      });
    } catch (err) {
      console.error("Error enviando manual-init-text:", err);
    }
    // Notificar a la ventana principal que el editor ya se mostró (para ocultar loader)
    try {
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send('manual-editor-ready');
      }
    } catch (notifyErr) {
      console.warn("No se pudo notificar manual-editor-ready:", notifyErr);
    }
  });

  editorWin.on('close', () => {
    try {
      const bounds = editorWin.getBounds();
      const modalStateToSave = Object.assign({}, loadJson(MODAL_STATE_FILE, {}), {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        maximized: editorWin.isMaximized()
      });
      saveJson(MODAL_STATE_FILE, modalStateToSave);
    } catch (e) {
      console.error("Error guardando estado modal:", e);
    }
    editorWin = null;
  });

  editorWin.on('maximize', () => {
    const state = loadJson(MODAL_STATE_FILE, {});
    state.maximized = true;
    saveJson(MODAL_STATE_FILE, state);
  });

  editorWin.on('unmaximize', () => {
    const state = loadJson(MODAL_STATE_FILE, {});
    state.maximized = false;
    saveJson(MODAL_STATE_FILE, state);
  });
}

function createPresetWindow(initialData) {
  // initialData is an object possibly containing { wpm, mode, preset }
  // If already open, focus and send init data
  if (presetWin && !presetWin.isDestroyed()) {
    try {
      presetWin.focus();
      // send init with whole payload (may include wpm/mode/preset)
      presetWin.webContents.send('preset-init', initialData || {});
    } catch (e) {
      console.error("Error enviando init a presetWin ya abierta:", e);
    }
    return;
  }

  presetWin = new BrowserWindow({
    width: 460,
    height: 410,
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: mainWin,
    modal: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preset_preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  presetWin.setMenu(null);
  presetWin.loadFile(path.join(__dirname, '../public/preset_modal.html'));

  presetWin.once('ready-to-show', () => {
    presetWin.show();
    // Send initial payload (may contain wpm, mode and preset data)
    try {
      presetWin.webContents.send('preset-init', initialData || {});
    } catch (e) {
      console.error("Error enviando preset-init:", e);
    }
  });

  presetWin.on('closed', () => {
    presetWin = null;
  });
}

/* --- Language modal handling --- */

// Save language selection into settings file (and ensure numberFormatting defaults)
ipcMain.handle('set-language', async (_event, lang) => {
  try {
    let settings = loadJson(SETTINGS_FILE, { language: "", presets: [] });
    settings = normalizeSettings(settings);

    const chosen = String(lang || '').trim();
    settings.language = chosen;
    currentLanguage = chosen || 'es';

    // Ensure numberFormatting has sensible defaults for es/en if missing
    settings.numberFormatting = settings.numberFormatting || {};
    if (!settings.numberFormatting[chosen]) {
      const nf = loadNumberFormatDefaults(chosen);
      if (nf && nf.thousands && nf.decimal) {
        settings.numberFormatting[chosen] = { separadorMiles: nf.thousands, separadorDecimal: nf.decimal };
      } else if (chosen === 'en') {
        settings.numberFormatting[chosen] = { separadorMiles: ",", separadorDecimal: "." };
      } else {
        settings.numberFormatting[chosen] = { separadorMiles: ".", separadorDecimal: "," };
      }
    }

    // Save normalized settings (includes modeConteo if no estaba)
    saveJson(SETTINGS_FILE, settings);

    // Rebuild menu with the new language
    buildAppMenu(currentLanguage);
    // Ocultar la barra en ventanas secundarias (editor, preset, etc.) tras reconstruir menú
    try {
      if (editorWin && !editorWin.isDestroyed()) {
        editorWin.setMenu(null);
        editorWin.setMenuBarVisibility(false);
      }
      if (presetWin && !presetWin.isDestroyed()) {
        presetWin.setMenu(null);
        presetWin.setMenuBarVisibility(false);
      }
      if (langWin && !langWin.isDestroyed()) {
        langWin.setMenu(null);
        langWin.setMenuBarVisibility(false);
      }
    } catch (menuErr) {
      console.warn("No se pudo ocultar menú en ventanas secundarias:", menuErr);
    }

    // Notificar renderers con el objeto settings correcto
    try {
      if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('settings-updated', settings);
      if (editorWin && !editorWin.isDestroyed()) editorWin.webContents.send('settings-updated', settings);
      if (presetWin && !presetWin.isDestroyed()) presetWin.webContents.send('settings-updated', settings);
    } catch (notifyErr) {
      console.error("Error notificando settings-updated:", notifyErr);
    }

    return { ok: true, language: chosen };
  } catch (err) {
    console.error("Error guardando language:", err);
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('set-mode-conteo', async (_event, mode) => {
  try {
    let settings = loadJson(SETTINGS_FILE, { language: "es", presets: [] });
    settings = normalizeSettings(settings);

    settings.modeConteo = (mode === 'simple') ? 'simple' : 'preciso';

    saveJson(SETTINGS_FILE, settings);

    // Notificar renderers del cambio
    try {
      if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('settings-updated', settings);
      if (editorWin && !editorWin.isDestroyed()) editorWin.webContents.send('settings-updated', settings);
      if (presetWin && !presetWin.isDestroyed()) presetWin.webContents.send('settings-updated', settings);
    } catch (notifyErr) {
      console.error("Error notificando settings-updated (set-mode-conteo):", notifyErr);
    }

    return { ok: true, mode: settings.modeConteo };
  } catch (err) {
    console.error("Error en set-mode-conteo:", err);
    return { ok: false, error: String(err) };
  }
});

// Create language selection window (small, light)
function createLanguageWindow() {
  if (langWin && !langWin.isDestroyed()) {
    try { langWin.focus(); } catch (e) { }
    return;
  }

  langWin = new BrowserWindow({
    width: 420,
    height: 220,
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: null,
    modal: false,
    show: false,
    frame: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: LANGUAGE_PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  langWin.setMenu(null);
  langWin.loadFile(LANGUAGE_MODAL_HTML);

  langWin.once('ready-to-show', () => {
    langWin.show();
  });

  // If user closes modal without choosing, apply fallback 'es' (tu requerimiento)
  langWin.on('closed', () => {
    try {
      const settings = loadJson(SETTINGS_FILE, { language: "", presets: [] });
      if (!settings.language || settings.language === "") {
        // fallback to Spanish
        settings.language = 'es';
        settings.numberFormatting = settings.numberFormatting || {};
        if (!settings.numberFormatting['es']) {
          const nf = loadNumberFormatDefaults('es');
          if (nf && nf.thousands && nf.decimal) {
            settings.numberFormatting['es'] = { separadorMiles: nf.thousands, separadorDecimal: nf.decimal };
          } else {
            settings.numberFormatting['es'] = { separadorMiles: ".", separadorDecimal: "," };
          }
        }
        saveJson(SETTINGS_FILE, settings);
      }
    } catch (e) {
      console.error("Error aplicando fallback language:", e);
    } finally {
      langWin = null;
      // Ensure main window is created after modal closure
      try { if (!mainWin) createMainWindow(); } catch (e) { console.error("Error creating mainWin after the modal:", e); }
    }
  });
}

// ----------------- Ventana flotante (PIP) -----------------
const FLOATER_PRELOAD = path.join(__dirname, 'flotante_preload.js');
// Floating window HTML path: place it in ../public to keep the convention
const FLOATER_HTML = path.join(__dirname, '../public/flotante.html');

async function createFloatingWindow(options = {}) {
  // Si ya existe y no fue destruida, devolverla (no recrear)
  if (floatingWin && !floatingWin.isDestroyed()) {
    // Apply a forced position if it was requested
    if (options && (typeof options.x === 'number' || typeof options.y === 'number')) {
      try { floatingWin.setBounds({ x: options.x || floatingWin.getBounds().x, y: options.y || floatingWin.getBounds().y }); } catch (e) { /* noop */ }
    }
    return floatingWin;
  }

  const bwOpts = {
    width: 220,
    height: 70,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: true,
    webPreferences: {
      preload: FLOATER_PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  };

  // Valores de margen para que la VF no quede pegada exactamente al borde ni sobre los scrollbars.
  // Ajusta estos valores si lo deseas (en px).
  const DEFAULT_MARGIN_RIGHT = 30; // un poco a la izquierda del extremo derecho para evitar scrollbars
  const DEFAULT_MARGIN_BOTTOM = 20;  // espacio encima de la barra de tareas / dock

  // Calculate default position using the primary display workArea (excludes taskbar/dock)
  let pos = {};
  try {
    const display = screen.getPrimaryDisplay();
    const wa = display && display.workArea ? display.workArea : null;

    if (wa) {
      // If the user did not force x/y via options, place it at the bottom-right of the workArea.
      const marginRight = typeof options.marginRight === 'number' ? options.marginRight : DEFAULT_MARGIN_RIGHT;
      const marginBottom = typeof options.marginBottom === 'number' ? options.marginBottom : DEFAULT_MARGIN_BOTTOM;

      const x = wa.x + wa.width - bwOpts.width - marginRight;
      const y = wa.y + wa.height - bwOpts.height - marginBottom;

      pos.x = x;
      pos.y = y;
    }
  } catch (e) {
    console.warn("Could not compute position from screen.getPrimaryDisplay(); using default floating position.", e);
  }

  // If x/y were provided explicitly in options, respect them (allow override)
  if (typeof options.x === 'number') pos.x = options.x;
  if (typeof options.y === 'number') pos.y = options.y;

  // Combinar opciones calculadas con bwOpts, permitiendo que caller sobreescriba
  const createOpts = Object.assign({}, bwOpts, pos, options);

  floatingWin = new BrowserWindow(createOpts);

  // Cargar el HTML del flotante
  try {
    await floatingWin.loadFile(FLOATER_HTML);
  } catch (e) {
    console.error("Error cargando flotante HTML:", e);
  }

  // If the window was created offscreen or out of bounds, ensure it stays inside the screen
  try {
    const bounds = floatingWin.getBounds();
    const display = screen.getDisplayMatching(bounds);
    if (display && display.workArea) {
      const wa = display.workArea;
      // Adjust if it ended up partially offscreen (keep it simple)
      let nx = bounds.x, ny = bounds.y;
      if (bounds.x < wa.x) nx = wa.x + DEFAULT_MARGIN_RIGHT;
      if (bounds.y < wa.y) ny = wa.y + DEFAULT_MARGIN_BOTTOM;
      if ((bounds.x + bounds.width) > (wa.x + wa.width)) nx = wa.x + wa.width - bounds.width - DEFAULT_MARGIN_RIGHT;
      if ((bounds.y + bounds.height) > (wa.y + wa.height)) ny = wa.y + wa.height - bounds.height - DEFAULT_MARGIN_BOTTOM;
      if (nx !== bounds.x || ny !== bounds.y) {
        floatingWin.setBounds({ x: nx, y: ny });
      }
    }
  } catch (e) {
    // noop
  }

  // Notificar cierre para que el renderer principal pueda limpiar estado
  floatingWin.on('closed', () => {
    floatingWin = null;
    // Notificar al renderer principal si necesita limpiar estado
    if (mainWin && mainWin.webContents) {
      try { mainWin.webContents.send('flotante-closed'); } catch (err) { /* noop */ }
    }
  });

  // Optional: if the floating window should not steal focus, use showInactive(); here we want immediate interaction so we keep focusable=true and let it take focus.
  return floatingWin;
}

/* ---------------- Main stopwatch (timekeeping + broadcast) ----------------*/

let crono = {
  running: false,
  elapsed: 0,
  startTs: null
};

let cronoInterval = null;
const CRONO_BROADCAST_MS = 1000; // ajustable si quieres menor carga

function formatTimerMs(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function getCronoState() {
  const elapsedNow = crono.running ? (crono.elapsed + (Date.now() - crono.startTs)) : crono.elapsed;
  return { elapsed: elapsedNow, running: !!crono.running, display: formatTimerMs(elapsedNow) };
}

function broadcastCronoState() {
  const state = getCronoState();
  try { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('crono-state', state); } catch (e) {/*noop*/ }
  try { if (floatingWin && !floatingWin.isDestroyed()) floatingWin.webContents.send('crono-state', state); } catch (e) {/*noop*/ }
  try { if (editorWin && !editorWin.isDestroyed()) editorWin.webContents.send('crono-state', state); } catch (e) {/*noop*/ }
}

function ensureCronoInterval() {
  if (cronoInterval) return;
  cronoInterval = setInterval(() => {
    broadcastCronoState();
    // Option: stop the interval if nobody listens and the timer is not running
    if (!crono.running && !mainWin && !floatingWin && !editorWin) {
      clearInterval(cronoInterval);
      cronoInterval = null;
    }
  }, CRONO_BROADCAST_MS);
}

function startCrono() {
  if (!crono.running) {
    crono.running = true;
    crono.startTs = Date.now();
    ensureCronoInterval();
    broadcastCronoState();
  }
}

function stopCrono() {
  if (crono.running) {
    crono.elapsed = crono.elapsed + (Date.now() - crono.startTs);
    crono.startTs = null;
    crono.running = false;
    broadcastCronoState();
  }
}

function resetCrono() {
  crono.running = false;
  crono.startTs = null;
  crono.elapsed = 0;
  broadcastCronoState();
}

function setCronoElapsed(ms) {
  const n = Number(ms) || 0;
  crono.elapsed = n;
  if (crono.running) crono.startTs = Date.now();
  broadcastCronoState();
}

ipcMain.handle('crono-get-state', () => {
  return getCronoState();
});

ipcMain.on('crono-toggle', () => {
  try {
    if (crono.running) stopCrono(); else startCrono();
  } catch (e) {
    console.error("Error en crono-toggle:", e);
  }
});

ipcMain.on('crono-reset', () => {
  try { resetCrono(); } catch (e) { console.error("Error en crono-reset:", e); }
});

ipcMain.on('crono-set-elapsed', (_ev, ms) => {
  try { setCronoElapsed(ms); } catch (e) { console.error("Error en crono-set-elapsed:", e); }
});

app.on('will-quit', () => {
  try { if (cronoInterval) { clearInterval(cronoInterval); cronoInterval = null; } } catch (e) { /* noop */ }
});

// IPC: abrir flotante
ipcMain.handle('floating-open', async () => {
  try {
    await createFloatingWindow();
    try { broadcastCronoState(); } catch (e) {/*noop*/ }
    if (crono.running) ensureCronoInterval();
    return { ok: true };
  } catch (e) {
    console.error("floating-open error:", e);
    return { ok: false, error: String(e) };
  }
});

// IPC: cerrar flotante
ipcMain.handle('floating-close', async () => {
  try {
    if (floatingWin && !floatingWin.isDestroyed()) {
      floatingWin.close();
      floatingWin = null;
    }
    return { ok: true };
  } catch (e) {
    console.error("floating-close error:", e);
    return { ok: false, error: String(e) };
  }
});

// IPC: comandos desde el flotante
ipcMain.on('flotante-command', (_ev, cmd) => {
  try {
    if (!cmd || !cmd.cmd) return;
    if (cmd.cmd === 'toggle') {
      if (crono.running) stopCrono(); else startCrono();
    } else if (cmd.cmd === 'reset') {
      resetCrono();
    } else if (cmd.cmd === 'set' && typeof cmd.value !== 'undefined') {
      setCronoElapsed(Number(cmd.value) || 0);
    }
    // broadcastCronoState() ya es llamado por las funciones anteriores
  } catch (e) {
    console.error("Error procesando flotante-command en main:", e);
  }
});

// Open editor window (or focus + send current text)
ipcMain.handle("open-editor", () => {
  if (!editorWin || editorWin.isDestroyed()) {
    createEditorWindow();
  } else {
    editorWin.show();
    try {
      editorWin.webContents.send("manual-init-text", { text: currentText || "", meta: { source: "main", action: "init" } });
    } catch (err) {
      console.error("Error enviando manual-init-text desde open-editor:", err);
    }
    try {
      if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('manual-editor-ready');
    } catch (e) {
      console.warn("No se pudo notificar manual-editor-ready (editor ya abierto):", e);
    }
  }
});

// Open preset modal window
ipcMain.handle('open-preset-modal', (_event, payload) => {
  if (!mainWin) return;
  let initialData = {};
  if (typeof payload === 'number') {
    initialData = { wpm: payload };
  } else if (payload && typeof payload === 'object') {
    initialData = payload;
  }
  createPresetWindow(initialData);
});

// Handle preset creation request from preset modal
ipcMain.handle('create-preset', (_event, preset) => {
  try {
    let settings = loadJson(SETTINGS_FILE, { language: "es", presets: [] });
    settings = normalizeSettings(settings);
    settings.presets = settings.presets || [];

    // If preset name already exists in user's presets, overwrite that one
    const idx = settings.presets.findIndex(p => p.name === preset.name);
    if (idx >= 0) {
      settings.presets[idx] = preset;
    } else {
      settings.presets.push(preset);
    }

    saveJson(SETTINGS_FILE, settings);
    // Notificar a los renderers que settings cambiaron (settings-updated)
    try {
      if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('settings-updated', settings);
      if (editorWin && !editorWin.isDestroyed()) editorWin.webContents.send('settings-updated', settings);
      if (presetWin && !presetWin.isDestroyed()) presetWin.webContents.send('settings-updated', settings);
    } catch (notifyErr) {
      console.error("Error notificando settings-updated:", notifyErr);
    }
    // Notify main window renderer that a preset was created/updated
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('preset-created', preset);
    }

    return { ok: true };
  } catch (e) {
    console.error("Error creando preset:", e);
    return { ok: false, error: String(e) };
  }
});

// Provide settings via IPC (centralized)
ipcMain.handle('get-settings', () => {
  try {
    const settings = loadJson(SETTINGS_FILE, { language: "es", presets: [] });
    return settings;
  } catch (e) {
    console.error("Error en get-settings:", e);
    return { language: "es", presets: [] };
  }
});

// Provide default presets
ipcMain.handle("get-default-presets", () => {
  try {
    // Preferir JSON en config/presets_defaults, si existen.
    ensureConfigPresetsDir();

    const entries = fs.readdirSync(CONFIG_PRESETS_DIR).filter(name => /^defaults_presets.*\.json$/i.test(name));

    let general = [];
    const languagePresets = {};

    // Cargar defaults generales
    const generalJson = entries.find(n => n.toLowerCase() === "defaults_presets.json");
    if (generalJson) {
      try { general = JSON.parse(fs.readFileSync(path.join(CONFIG_PRESETS_DIR, generalJson), "utf8")); }
      catch (err) { console.error("Error parseando", generalJson, err); general = []; }
    } else {
      const n = path.join(PRESETS_SOURCE_DIR, "defaults_presets.js");
      general = fs.existsSync(n) ? require(n) : [];
    }

    // Cargar defaults por idioma desde JSON: defaults_presets_<lang>.json
    entries
      .filter(n => /^defaults_presets_([a-z0-9-]+)\.json$/i.test(n))
      .forEach(n => {
        const match = /^defaults_presets_([a-z0-9-]+)\.json$/i.exec(n);
        if (!match || !match[1]) return;
        const lang = match[1].toLowerCase();
        try {
          const arr = JSON.parse(fs.readFileSync(path.join(CONFIG_PRESETS_DIR, n), "utf8"));
          if (Array.isArray(arr)) languagePresets[lang] = arr;
        } catch (err) {
          console.error("Error parseando", n, err);
        }
      });

    // Si falta algún idioma en JSON, intentar cargar desde los JS fuente
    const srcEntries = fs.existsSync(PRESETS_SOURCE_DIR) ? fs.readdirSync(PRESETS_SOURCE_DIR) : [];
    srcEntries
      .filter(n => /^defaults_presets_([a-z0-9-]+)\.js$/i.test(n))
      .forEach(n => {
        const match = /^defaults_presets_([a-z0-9-]+)\.js$/i.exec(n);
        if (!match || !match[1]) return;
        const lang = match[1].toLowerCase();
        if (languagePresets[lang]) return; // ya cargado desde JSON
        try {
          let arr = require(path.join(PRESETS_SOURCE_DIR, n));
          if (!Array.isArray(arr) && arr && Array.isArray(arr.default)) arr = arr.default;
          if (Array.isArray(arr)) languagePresets[lang] = arr;
        } catch (err) {
          console.error("Error cargando", n, err);
        }
      });

    return {
      general: Array.isArray(general) ? general : [],
      languagePresets
    };
  } catch (e) {
    console.error("Error proporcionando default presets (get-default-presets):", e);
    return { general: [], languagePresets: {} };
  }
});
// --- Abrir carpeta editable de presets por defecto en el explorador ---
ipcMain.handle("open-default-presets-folder", async () => {
  try {
    // Aseguramos que la carpeta exista
    ensureConfigPresetsDir();

    // shell.openPath returns '' on success, or an error string
    const result = await shell.openPath(CONFIG_PRESETS_DIR);
    if (typeof result === "string" && result.length > 0) {
      // error (result contiene un mensaje)
      console.error("shell.openPath() returned error:", result);
      return { ok: false, error: String(result) };
    }
    return { ok: true };
  } catch (err) {
    console.error("Error opening presets_defaults folder:", err);
    return { ok: false, error: String(err) };
  }
});

// Request to delete a preset (handles native dialogs + persistence)
ipcMain.handle('request-delete-preset', async (_event, name) => {
  try {
    // Cargar settings y textos de diálogo antes de cualquier mensaje
    let settings = loadJson(SETTINGS_FILE, { language: "es", presets: [] });
    settings = normalizeSettings(settings);
    const dialogTexts = getDialogTexts(settings.language || 'es');
    const yesLabel = dialogTexts.yes || 'Sí, continuar';
    const noLabel = dialogTexts.no || 'No, cancelar';

    // If no name provided, show information dialog and exit
    if (!name) {
      try {
        await dialog.showMessageBox(mainWin || null, {
          type: 'none',
          buttons: [dialogTexts.ok || 'Aceptar'],
          defaultId: 0,
          message: dialogTexts.delete_preset_none || 'No hay ningún preset seleccionado para borrar'
        });
      } catch (e) {
        console.error("Error mostrando dialog no-selection:", e);
      }
      return { ok: false, code: 'NO_SELECTION' };
    }

    // Ask confirmation
    const conf = await dialog.showMessageBox(mainWin || null, {
      type: 'none',
      buttons: [yesLabel, noLabel],
      defaultId: 1,
      cancelId: 1,
      message: (dialogTexts.delete_preset_message || `¿Eliminar el preset "{name}"?`).replace('{name}', name)
    });

    if (conf.response !== 0) {
      // User chose "No" or cancelled
      return { ok: false, code: 'CANCELLED' };
    }

    // Proceed with deletion logic
    // settings ya cargado arriba
    settings.presets = settings.presets || [];
    const lang = settings.language || 'es';

    // Load default presets (same sources as get-default-presets)
    const defaultsCombined = loadDefaultPresetsCombined(lang);

    // Normalize structures
    const idxUser = settings.presets.findIndex(p => p.name === name);
    const isDefault = defaultsCombined.find(p => p.name === name);

    // Ensure disabled_default_presets structure
    settings.disabled_default_presets = settings.disabled_default_presets || {};
    if (!Array.isArray(settings.disabled_default_presets[lang])) settings.disabled_default_presets[lang] = [];

    if (idxUser >= 0) {
      // There is a personalized preset with that name
      if (isDefault) {
        // Shadowing case: remove personalized and mark default as ignored
        settings.presets.splice(idxUser, 1);
        if (!settings.disabled_default_presets[lang].includes(name)) {
          settings.disabled_default_presets[lang].push(name);
        }
        saveJson(SETTINGS_FILE, settings);
        // Notificar a los renderers que settings cambiaron (settings-updated)
        try {
          if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('settings-updated', settings);
          if (editorWin && !editorWin.isDestroyed()) editorWin.webContents.send('settings-updated', settings);
          if (presetWin && !presetWin.isDestroyed()) presetWin.webContents.send('settings-updated', settings);
        } catch (notifyErr) {
          console.error("Error notificando settings-updated:", notifyErr);
        }
        // Notify main window renderer (optional)
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send('preset-deleted', { name, action: 'deleted_and_ignored' });
        }
        return { ok: true, action: 'deleted_and_ignored' };
      } else {
        // Personalized only: delete it
        settings.presets.splice(idxUser, 1);
        saveJson(SETTINGS_FILE, settings);
        // Notificar a los renderers que settings cambiaron (settings-updated)
        try {
          if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('settings-updated', settings);
          if (editorWin && !editorWin.isDestroyed()) editorWin.webContents.send('settings-updated', settings);
          if (presetWin && !presetWin.isDestroyed()) presetWin.webContents.send('settings-updated', settings);
        } catch (notifyErr) {
          console.error("Error notificando settings-updated:", notifyErr);
        }
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send('preset-deleted', { name, action: 'deleted_custom' });
        }
        return { ok: true, action: 'deleted_custom' };
      }
    } else {
      // Not personalized; could be a default preset
      if (isDefault) {
        // Mark default as ignored for this language
        if (!settings.disabled_default_presets[lang].includes(name)) {
          settings.disabled_default_presets[lang].push(name);
        }
        saveJson(SETTINGS_FILE, settings);
        // Notificar a los renderers que settings cambiaron (settings-updated)
        try {
          if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('settings-updated', settings);
          if (editorWin && !editorWin.isDestroyed()) editorWin.webContents.send('settings-updated', settings);
          if (presetWin && !presetWin.isDestroyed()) presetWin.webContents.send('settings-updated', settings);
        } catch (notifyErr) {
          console.error("Error notificando settings-updated:", notifyErr);
        }
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send('preset-deleted', { name, action: 'ignored_default' });
        }
        return { ok: true, action: 'ignored_default' };
      } else {
        // Not found anywhere
        return { ok: false, error: 'Preset no encontrado', code: 'NOT_FOUND' };
      }
    }

  } catch (e) {
    console.error("Error eliminando preset:", e);
    return { ok: false, error: String(e) };
  }
});

// Request to restore defaults (generales + idioma activo)
ipcMain.handle('request-restore-defaults', async (_event) => {
  try {
    let settings = loadJson(SETTINGS_FILE, { language: "es", presets: [] });
    settings = normalizeSettings(settings);
    settings.presets = settings.presets || [];
    const lang = settings.language || 'es';

    // Ask confirmation (native dialog)
    const dialogTexts = getDialogTexts(settings.language || 'es');
    const yesLabel = dialogTexts.yes || 'Sí, continuar';
    const noLabel = dialogTexts.no || 'No, cancelar';
    const conf = await dialog.showMessageBox(mainWin || null, {
      type: 'none',
      buttons: [yesLabel, noLabel],
      defaultId: 1,
      cancelId: 1,
      message: (dialogTexts.restore_defaults_message || `¿Restaurar presets por defecto (generales y para el idioma "{lang}") a su versión original? Esto revertirá las eliminaciones y los cambios realizados sobre presets por defecto del idioma activo.`).replace('{lang}', lang)
    });

    if (conf.response !== 0) {
      // User cancelled / chose No
      return { ok: false, code: 'CANCELLED' };
    }

    // Load default presets
    const defaultsCombined = loadDefaultPresetsCombined(lang);

    // Prepare structures to report what we changed
    const removedCustom = [];
    const unignored = [];

    // 1) Remove personalized presets that shadow defaults (i.e., same name)
    const defaultNames = new Set(defaultsCombined.map(p => p.name));
    settings.presets = (settings.presets || []).filter(p => {
      if (defaultNames.has(p.name)) {
        removedCustom.push(p.name);
        return false; // remove
      }
      return true; // keep others
    });

    // 2) For the active language, remove names from disabled_default_presets[lang] if present
    settings.disabled_default_presets = settings.disabled_default_presets || {};
    if (!Array.isArray(settings.disabled_default_presets[lang])) settings.disabled_default_presets[lang] = [];

    const beforeDisabled = settings.disabled_default_presets[lang].slice();
    settings.disabled_default_presets[lang] = settings.disabled_default_presets[lang].filter(n => {
      // keep those that are NOT in defaultNames
      const keep = !defaultNames.has(n);
      if (!keep) {
        unignored.push(n);
      }
      return keep;
    });

    // If the disabled_default_presets[lang] becomes empty, we can remove the empty array property (optional)
    if (Array.isArray(settings.disabled_default_presets[lang]) && settings.disabled_default_presets[lang].length === 0) {
      delete settings.disabled_default_presets[lang];
    }

    // If disabled_default_presets becomes empty object, normalize to undefined / remove
    if (settings.disabled_default_presets && Object.keys(settings.disabled_default_presets).length === 0) {
      delete settings.disabled_default_presets;
    }

    // Save
    saveJson(SETTINGS_FILE, settings);
    // Notificar a los renderers que settings cambiaron (settings-updated)
    try {
      if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('settings-updated', settings);
      if (editorWin && !editorWin.isDestroyed()) editorWin.webContents.send('settings-updated', settings);
      if (presetWin && !presetWin.isDestroyed()) presetWin.webContents.send('settings-updated', settings);
    } catch (notifyErr) {
      console.error("Error notificando settings-updated:", notifyErr);
    }
    // Notify renderer (optional)
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('preset-restored', { removedCustom, unignored, language: lang });
    }

    return { ok: true, action: 'restored', removedCustom, unignored };
  } catch (e) {
    console.error("Error restaurando presets por defecto:", e);
    return { ok: false, error: String(e) };
  }
});

// Notify for edit-no-selection (simple info dialog)
ipcMain.handle('notify-no-selection-edit', async () => {
  try {
    const settings = normalizeSettings(loadJson(SETTINGS_FILE, { language: "es", presets: [] }));
    const dialogTexts = getDialogTexts(settings.language || 'es');
    await dialog.showMessageBox(mainWin || null, {
      type: 'none',
      buttons: [(dialogTexts && dialogTexts.ok) || 'Aceptar'],
      defaultId: 0,
      message: (dialogTexts && dialogTexts.edit_preset_none) || 'No hay ningún preset seleccionado para editar'
    });
    return { ok: true };
  } catch (e) {
    console.error("Error mostrando dialog no-selection-edit:", e);
    return { ok: false, error: String(e) };
  }
});

// Edit-preset handler (confirmation + silent delete + create)
ipcMain.handle('edit-preset', async (_event, { originalName, newPreset }) => {
  try {
    if (!originalName) {
      return { ok: false, code: 'NO_ORIGINAL_NAME' };
    }

    // Cargar settings y textos de diálogo antes de la confirmación
    let settings = loadJson(SETTINGS_FILE, { language: "es", presets: [] });
    settings = normalizeSettings(settings);
    const dialogTexts = getDialogTexts(settings.language || 'es');

    // Ask confirmation (native dialog)
    const yesLabel = dialogTexts.yes || 'Sí, continuar';
    const noLabel = dialogTexts.no || 'No, cancelar';
    const conf = await dialog.showMessageBox(mainWin || null, {
      type: 'none',
      buttons: [yesLabel, noLabel],
      defaultId: 1,
      cancelId: 1,
      message: (dialogTexts.edit_preset_confirm || `¿Está seguro de editar "{name}" por el actual?`).replace('{name}', originalName)
    });

    if (conf.response !== 0) {
      // User chose "No" or cancelled
      return { ok: false, code: 'CANCELLED' };
    }

    // Proceed: perform silent deletion of originalName (same semantics as request-delete-preset but WITHOUT dialogs)
    settings.presets = settings.presets || [];
    const lang = settings.language || 'es';

    // Load default presets (general + idioma si existe)
    const defaultsCombined = loadDefaultPresetsCombined(lang);

    const idxUser = settings.presets.findIndex(p => p.name === originalName);
    const isDefault = defaultsCombined.find(p => p.name === originalName);

    // Ensure disabled_default_presets structure
    settings.disabled_default_presets = settings.disabled_default_presets || {};
    if (!Array.isArray(settings.disabled_default_presets[lang])) settings.disabled_default_presets[lang] = [];

    let deletedAction = null;

    if (idxUser >= 0) {
      if (isDefault) {
        // remove personalized and mark default as ignored
        settings.presets.splice(idxUser, 1);
        if (!settings.disabled_default_presets[lang].includes(originalName)) {
          settings.disabled_default_presets[lang].push(originalName);
        }
        deletedAction = 'deleted_and_ignored';
      } else {
        // personalized only
        settings.presets.splice(idxUser, 1);
        deletedAction = 'deleted_custom';
      }
    } else {
      // Not personalized; could be a default preset
      if (isDefault) {
        // mark default as ignored for this language
        if (!settings.disabled_default_presets[lang].includes(originalName)) {
          settings.disabled_default_presets[lang].push(originalName);
        }
        deletedAction = 'ignored_default';
      } else {
        deletedAction = 'not_found';
      }
    }

    // Now insert/overwrite newPreset in settings.presets
    // If newPreset.name exists among user presets, overwrite; otherwise push
    const newIdx = settings.presets.findIndex(p => p.name === newPreset.name);
    if (newIdx >= 0) {
      settings.presets[newIdx] = newPreset;
    } else {
      settings.presets.push(newPreset);
    }

    // Save settings once
    saveJson(SETTINGS_FILE, settings);
    // Notificar a los renderers que settings cambiaron (settings-updated)
    try {
      if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('settings-updated', settings);
      if (editorWin && !editorWin.isDestroyed()) editorWin.webContents.send('settings-updated', settings);
      if (presetWin && !presetWin.isDestroyed()) presetWin.webContents.send('settings-updated', settings);
    } catch (notifyErr) {
      console.error("Error notificando settings-updated:", notifyErr);
    }
    // Notify renderer about deletion and creation
    if (mainWin && !mainWin.isDestroyed()) {
      if (deletedAction && deletedAction !== 'not_found') {
        mainWin.webContents.send('preset-deleted', { name: originalName, action: deletedAction });
      }
      mainWin.webContents.send('preset-created', newPreset);
    }

    return { ok: true, action: 'edited', deletedAction };
  } catch (e) {
    console.error("Error editando preset:", e);
    return { ok: false, error: String(e) };
  }
});

// Get current text
ipcMain.handle('get-current-text', () => {
  return currentText || "";
});

// Set current text in memory (realtime updates from editor). Not persisted to disk here.
ipcMain.handle("set-current-text", (event, payload) => {
  try {
    let incomingMeta = null;
    let text = "";

    // aceptar payload tipo { text, meta } o string simple
    if (payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "text")) {
      text = String(payload.text || "");
      incomingMeta = payload.meta || null;
    } else {
      text = String(payload || "");
    }

    let truncated = false;
    if (text.length > MAX_TEXT_CHARS) {
      text = text.slice(0, MAX_TEXT_CHARS);
      truncated = true;
      console.warn("set-current-text: entrada truncada a " + MAX_TEXT_CHARS + " caracteres.");
    }

    currentText = text;

    // Notificar main window (compatibilidad anterior)
    if (mainWin && !mainWin.isDestroyed()) {
      try { mainWin.webContents.send("current-text-updated", currentText); } catch (err) { console.error("Error enviando current-text-updated a mainWin:", err); }
    }

    // Notify modal/editor with an object that includes meta (so the modal can use native editing)
    if (editorWin && !editorWin.isDestroyed()) {
      try {
        editorWin.webContents.send("manual-text-updated", { text: currentText, meta: incomingMeta || { source: "main", action: "set" } });
      } catch (err) { console.error("Error enviando manual-text-updated a editorWin:", err); }
    }

    return { ok: true, truncated: truncated, length: currentText.length, text: currentText };
  } catch (err) {
    console.error("Error en set-current-text:", err);
    return { ok: false, error: String(err) };
  }
});

// Force clear editor (no dialogs) - invoked from renderer to ensure editor clears
ipcMain.handle('force-clear-editor', async () => {
  try {
    // Also update main's in-memory currentText (defensive)
    currentText = "";
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('current-text-updated', currentText);
    }
    // Notify editor window explicitly to force clear
    if (editorWin && !editorWin.isDestroyed()) {
      try {
        editorWin.webContents.send('manual-force-clear', "");
      } catch (e) {
        console.error("Error enviando manual-force-clear:", e);
      }
    }
    return { ok: true };
  } catch (e) {
    console.error("Error en force-clear-editor:", e);
    return { ok: false, error: String(e) };
  }
});

// Provide modal state if renderer wants it (not strictly necessary but available)
ipcMain.handle('get-modal-state', () => {
  return loadJson(MODAL_STATE_FILE, {});
});

// Expose configuration (MAX_TEXT_CHARS) via IPC
ipcMain.handle("get-app-config", async () => {
  try {
    return { ok: true, maxTextChars: MAX_TEXT_CHARS };
  } catch (e) {
    console.error("Error en get-app-config:", e);
    return { ok: false, error: String(e), maxTextChars: 1e7 };
  }
});

// App lifecycle: persist currentText only on quit (user requirement)
function persistCurrentTextOnQuit() {
  try {
    saveJson(CURRENT_TEXT_FILE, { text: currentText || "" });
    const settings = loadJson(SETTINGS_FILE, { language: "es", presets: [] });
    if (!fs.existsSync(SETTINGS_FILE)) saveJson(SETTINGS_FILE, settings);
  } catch (e) {
    console.error("Error persistiendo texto en quit:", e);
  }
}

/* --- App start logic (modified to show language modal when needed) --- */

app.whenReady().then(() => {
  // On startup, check settings.language and possibly prompt
  let settings = loadJson(SETTINGS_FILE, { language: "", presets: [] });
  settings = normalizeSettings(settings);
  currentLanguage = settings.language || 'es';

  // If normalize added defaults (e.g., modeConteo), save back to persist them
  // (esto garantiza que user_settings.json contenga modeConteo desde el primer arranque).
  saveJson(SETTINGS_FILE, settings);

  if (!settings.language || settings.language === "") {
    createLanguageWindow();
    ipcMain.once('language-selected', (_evt, lang) => {
      try {
        if (!mainWin) createMainWindow();
      } catch (e) {
        console.error("Error creando mainWin tras seleccionar idioma:", e);
      } finally {
        try { if (langWin && !langWin.isDestroyed()) langWin.close(); } catch (e) { }
      }
      if (!updateCheckDone) {
        updateCheckDone = true;
        checkForUpdates(currentLanguage);
      }
    });
  } else {
    createMainWindow();
    if (!updateCheckDone) {
      updateCheckDone = true;
      checkForUpdates(currentLanguage);
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('before-quit', () => {
  persistCurrentTextOnQuit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  unregisterShortcuts();
});
