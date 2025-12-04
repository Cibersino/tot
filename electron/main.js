// electron/main.js
const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const CONFIG_DIR = path.join(__dirname, '..', 'config');
const SETTINGS_FILE = path.join(CONFIG_DIR, 'user_settings.json');
const CURRENT_TEXT_FILE = path.join(CONFIG_DIR, 'current_text.json');
const MODAL_STATE_FILE = path.join(CONFIG_DIR, 'modal_state.json');

// Language modal assets
const LANGUAGE_MODAL_HTML = path.join(__dirname, '../public/language_modal.html');
const LANGUAGE_PRELOAD = path.join(__dirname, 'language_preload.js');

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
  return s;
}

ensureConfigDir();

// --- límite máximo de texto vigente (10 MB ~ 10.000.000 chars)
const MAX_TEXT_CHARS = 10000000;

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

    const files = [
      "defaults_presets.js",
      "defaults_presets_en.js",
      "defaults_presets_es.js"
    ];

    files.forEach((fname) => {
      const src = path.join(PRESETS_SOURCE_DIR, fname);
      const dest = path.join(CONFIG_PRESETS_DIR, fname.replace(/\.js$/i, ".json"));

      // Sólo copiar si existe el JS fuente y NO existe el .json destino
      if (fs.existsSync(src) && !fs.existsSync(dest)) {
        try {
          // require del módulo JS que exporta el array
          // (se espera que module.exports = [ ... ] )
          let arr = require(src);
          if (!Array.isArray(arr)) arr = Array.isArray(arr.default) ? arr.default : [];
          fs.writeFileSync(dest, JSON.stringify(arr, null, 2), "utf8");
          console.debug(`Copied default preset: ${src} -> ${dest}`);
        } catch (err) {
          console.error(`Error convirtiendo preset ${src} a JSON:`, err);
        }
      }
    });
  } catch (err) {
    console.error("Error en copyDefaultPresetsIfMissing:", err);
  }
}

// Ejecutar la copia inicial (no sobrescribe archivos existentes)
copyDefaultPresetsIfMissing();

let mainWin = null, // ventana principal
  editorWin = null, // ventana modal para edición del texto vigente
  presetWin = null, // ventana modal para nuevo/editar preset wpm
  currentText = "", // texto vigente
  langWin = null, // ventana modal selección de idioma (primer arranque)
  floatingWin = null; // ventana flotante (cronómetro)

// Load current text from file at startup (if exists)
try {
  const obj = loadJson(CURRENT_TEXT_FILE, { text: "" });
  let txt = String(obj.text || "");
  if (txt.length > MAX_TEXT_CHARS) {
    console.warn(`current_text.json excede MAX_TEXT_CHARS (${txt.length}). Se truncará a ${MAX_TEXT_CHARS} caracteres.`);
    txt = txt.slice(0, MAX_TEXT_CHARS);
    // Guardar la versión truncada para mantener coherencia entre sesiones
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
    height: 480,
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

  // --- BARRA SUPERIOR PERSONALIZADA (insertada aquí) ---
  const menuTemplate = [
    {
      label: '¿Cómo usar la app?',
      submenu: [
        { label: 'Guía básica', click: () => mainWin.webContents.send('menu-click', 'guia_basica') },
        { label: 'Instrucciones completas', click: () => mainWin.webContents.send('menu-click', 'instrucciones_completas') },
        { label: 'Preguntas frecuentes (FAQ)', click: () => mainWin.webContents.send('menu-click', 'faq') }
      ]
    },
    {
      label: 'Herramientas',
      submenu: [
        { label: 'Cargador de archivo de texto', click: () => mainWin.webContents.send('menu-click', 'cargador_texto') },
        { label: 'Cargador de imágenes con texto', click: () => mainWin.webContents.send('menu-click', 'contador_imagen') },
        { label: 'Test de velocidad de lectura', click: () => mainWin.webContents.send('menu-click', 'test_velocidad') }
      ]
    },
    {
      label: 'Preferencias',
      submenu: [
        { label: 'Idioma', click: () => mainWin.webContents.send('menu-click', 'preferencias_idioma') },
        {
          label: 'Diseño',
          submenu: [
            { label: 'Skins', click: () => mainWin.webContents.send('menu-click', 'diseno_skins') },
            { label: 'Cronómetro flotante', click: () => mainWin.webContents.send('menu-click', 'diseno_crono_flotante') },
            { label: 'Fuentes', click: () => mainWin.webContents.send('menu-click', 'diseno_fuentes') },
            { label: 'Colores', click: () => mainWin.webContents.send('menu-click', 'diseno_colores') }
          ]
        },
        { label: 'Shortcuts', click: () => mainWin.webContents.send('menu-click', 'shortcuts') },
        { label: 'Presets por defecto', click: () => mainWin.webContents.send('menu-click', 'presets_por_defecto') }
      ]
    },
    {
      label: 'Comunidad',
      submenu: [
        { label: 'Discord', click: () => mainWin.webContents.send('menu-click', 'discord') },
        { label: 'Avisos y novedades', click: () => mainWin.webContents.send('menu-click', 'avisos') }
      ]
    },
    { label: 'Links de interés', click: () => mainWin.webContents.send('menu-click', 'links_interes') },
    { label: 'COLABORA ($)', click: () => mainWin.webContents.send('menu-click', 'colabora') },
    {
      label: '?',
      submenu: [
        { label: 'Actualizar a última versión', click: () => mainWin.webContents.send('menu-click', 'actualizar_version') },
        { label: 'Readme', click: () => mainWin.webContents.send('menu-click', 'readme') },
        { label: 'Acerca de', click: () => mainWin.webContents.send('menu-click', 'acerca_de') }
      ]
    }
  ];

  if (!app.isPackaged) {
    // añadimos una sección "Desarrollo" con Toggle DevTools y Reload
    menuTemplate.push({
      label: 'Desarrollo',
      submenu: [
        { role: 'reload', label: 'Recargar' },
        { role: 'forcereload', label: 'Forzar recarga' },
        {
          label: 'Toggle DevTools',
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
  // --- FIN BARRA SUPERIOR ---

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

  // Cuando la ventana principal ya quedó destruida...
  mainWin.on('closed', () => {
    mainWin = null;

    // Forzar salida ordenada de la aplicación
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

  // Aquí eliminamos la barra de menú (ventana modal/editor)
  editorWin.setMenu(null);

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

    // Ensure numberFormatting has sensible defaults for es/en if missing
    settings.numberFormatting = settings.numberFormatting || {};
    if (!settings.numberFormatting[chosen]) {
      if (chosen === 'es') {
        settings.numberFormatting[chosen] = { separadorMiles: ".", separadorDecimal: "," };
      } else if (chosen === 'en') {
        settings.numberFormatting[chosen] = { separadorMiles: ",", separadorDecimal: "." };
      } else {
        settings.numberFormatting[chosen] = { separadorMiles: ",", separadorDecimal: "." };
      }
    }

    // Save normalized settings (includes modeConteo if no estaba)
    saveJson(SETTINGS_FILE, settings);

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
          settings.numberFormatting['es'] = { separadorMiles: ".", separadorDecimal: "," };
        }
        saveJson(SETTINGS_FILE, settings);
      }
    } catch (e) {
      console.error("Error aplicando fallback language:", e);
    } finally {
      langWin = null;
      // Ensure main window is created after modal closure
      try { if (!mainWin) createMainWindow(); } catch (e) { console.error("Error creando mainWin después del modal:", e); }
    }
  });
}

// ----------------- Ventana flotante (PIP) -----------------
const FLOATER_PRELOAD = path.join(__dirname, 'flotante_preload.js');
// Ruta del HTML del flotante: colocarlo en ../public para seguir la convención
const FLOATER_HTML = path.join(__dirname, '../public/flotante.html');

async function createFloatingWindow(options = {}) {
  if (floatingWin && !floatingWin.isDestroyed()) {
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

  floatingWin = new BrowserWindow(Object.assign({}, bwOpts, options));
  // Cargar el HTML minimalista del flotante (coloca flotante.html en ../public)
  try {
    floatingWin.loadFile(FLOATER_HTML);
  } catch (e) {
    console.error("Error cargando flotante HTML:", e);
  }

  floatingWin.on('closed', () => {
    floatingWin = null;
    // Notificar al renderer principal si necesita limpiar estado
    if (mainWin && mainWin.webContents) {
      try { mainWin.webContents.send('flotante-closed'); } catch (err) { /* noop */ }
    }
  });

  return floatingWin;
}

// IPC: abrir flotante
ipcMain.handle('floating-open', async () => {
  try {
    await createFloatingWindow();
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

// IPC: reenviar estado del renderer principal al flotante
ipcMain.on('floating-state', (_ev, state) => {
  try {
    if (floatingWin && !floatingWin.isDestroyed()) {
      floatingWin.webContents.send('flotante-state', state);
    }
  } catch (e) {
    console.error("Error reenviando floating-state al flotante:", e);
  }
});

// IPC: comandos desde el flotante -> reenvío al renderer principal
ipcMain.on('flotante-command', (_ev, cmd) => {
  try {
    if (mainWin && mainWin.webContents) {
      mainWin.webContents.send('flotante-command', cmd);
    }
  } catch (e) {
    console.error("Error reenviando flotante-command al main renderer:", e);
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

    const generalJson = path.join(CONFIG_PRESETS_DIR, "defaults_presets.json");
    const enJson = path.join(CONFIG_PRESETS_DIR, "defaults_presets_en.json");
    const esJson = path.join(CONFIG_PRESETS_DIR, "defaults_presets_es.json");

    let general = [];
    let en = [];
    let es = [];

    if (fs.existsSync(generalJson)) {
      try { general = JSON.parse(fs.readFileSync(generalJson, "utf8")); }
      catch (err) { console.error("Error parseando", generalJson, err); general = []; }
    } else {
      // Fallback: leer original JS (como antes)
      const n = path.join(PRESETS_SOURCE_DIR, "defaults_presets.js");
      general = fs.existsSync(n) ? require(n) : [];
    }

    if (fs.existsSync(enJson)) {
      try { en = JSON.parse(fs.readFileSync(enJson, "utf8")); }
      catch (err) { console.error("Error parseando", enJson, err); en = []; }
    } else {
      const n = path.join(PRESETS_SOURCE_DIR, "defaults_presets_en.js");
      en = fs.existsSync(n) ? require(n) : [];
    }

    if (fs.existsSync(esJson)) {
      try { es = JSON.parse(fs.readFileSync(esJson, "utf8")); }
      catch (err) { console.error("Error parseando", esJson, err); es = []; }
    } else {
      const n = path.join(PRESETS_SOURCE_DIR, "defaults_presets_es.js");
      es = fs.existsSync(n) ? require(n) : [];
    }

    return {
      general: Array.isArray(general) ? general : [],
      languagePresets: {
        en: Array.isArray(en) ? en : [],
        es: Array.isArray(es) ? es : []
      }
    };
  } catch (e) {
    console.error("Error proporcionando default presets (get-default-presets):", e);
    return { general: [], languagePresets: { en: [], es: [] } };
  }
});
// --- Abrir carpeta editable de presets por defecto en el explorador ---
ipcMain.handle("open-default-presets-folder", async () => {
  try {
    // Aseguramos que la carpeta exista
    ensureConfigPresetsDir();

    // shell.openPath devuelve '' en éxito, o un string con error
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
    // If no name provided, show information dialog and exit
    if (!name) {
      try {
        await dialog.showMessageBox(mainWin || null, {
          type: 'none',
          buttons: ['Aceptar'],
          defaultId: 0,
          message: 'No hay ningún preset seleccionado para borrar'
        });
      } catch (e) {
        console.error("Error mostrando dialog no-selection:", e);
      }
      return { ok: false, code: 'NO_SELECTION' };
    }

    // Ask confirmation
    const conf = await dialog.showMessageBox(mainWin || null, {
      type: 'none',
      buttons: ['Sí', 'No'],
      defaultId: 1,
      cancelId: 1,
      message: `¿Eliminar el preset "${name}"?`
    });

    if (conf.response !== 0) {
      // User chose "No" or cancelled
      return { ok: false, code: 'CANCELLED' };
    }

    // Proceed with deletion logic
    let settings = loadJson(SETTINGS_FILE, { language: "es", presets: [] });
    settings = normalizeSettings(settings);
    settings.presets = settings.presets || [];
    const lang = settings.language || 'es';

    // Load default presets (same sources as get-default-presets)
    const presetsDir = path.join(__dirname, 'presets');
    const generalPath = path.join(presetsDir, 'defaults_presets.js');
    const enPath = path.join(presetsDir, 'defaults_presets_en.js');
    const esPath = path.join(presetsDir, 'defaults_presets_es.js');

    const general = fs.existsSync(generalPath) ? require(generalPath) : [];
    const en = fs.existsSync(enPath) ? require(enPath) : [];
    const es = fs.existsSync(esPath) ? require(esPath) : [];

    const defaultsCombined = Array.isArray(general) ? general.slice() : [];
    const langPresets = (lang === 'en') ? (Array.isArray(en) ? en : []) : (lang === 'es' ? (Array.isArray(es) ? es : []) : []);
    if (Array.isArray(langPresets)) defaultsCombined.push(...langPresets);

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
    const conf = await dialog.showMessageBox(mainWin || null, {
      type: 'none',
      buttons: ['Sí', 'No'],
      defaultId: 1,
      cancelId: 1,
      message: `¿Restaurar presets por defecto (generales y para el idioma "${lang}") a su versión original? Esto revertirá las eliminaciones y los cambios realizados sobre presets por defecto del idioma activo.`
    });

    if (conf.response !== 0) {
      // User cancelled / chose No
      return { ok: false, code: 'CANCELLED' };
    }

    // Load default presets
    const presetsDir = path.join(__dirname, 'presets');
    const generalPath = path.join(presetsDir, 'defaults_presets.js');
    const enPath = path.join(presetsDir, 'defaults_presets_en.js');
    const esPath = path.join(presetsDir, 'defaults_presets_es.js');

    const general = fs.existsSync(generalPath) ? require(generalPath) : [];
    const en = fs.existsSync(enPath) ? require(enPath) : [];
    const es = fs.existsSync(esPath) ? require(esPath) : [];

    const defaultsCombined = Array.isArray(general) ? general.slice() : [];
    const langPresets = (lang === 'en') ? (Array.isArray(en) ? en : []) : (lang === 'es' ? (Array.isArray(es) ? es : []) : []);
    if (Array.isArray(langPresets)) defaultsCombined.push(...langPresets);

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
    await dialog.showMessageBox(mainWin || null, {
      type: 'none',
      buttons: ['Aceptar'],
      defaultId: 0,
      message: 'No hay ningún preset seleccionado para editar'
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

    // Ask confirmation (native dialog)
    const conf = await dialog.showMessageBox(mainWin || null, {
      type: 'none',
      buttons: ['Sí', 'No'],
      defaultId: 1,
      cancelId: 1,
      message: `¿Está seguro de editar "${originalName}" por el actual?`
    });

    if (conf.response !== 0) {
      // User chose "No" or cancelled
      return { ok: false, code: 'CANCELLED' };
    }

    // Proceed: perform silent deletion of originalName (same semantics as request-delete-preset but WITHOUT dialogs)
    let settings = loadJson(SETTINGS_FILE, { language: "es", presets: [] });
    settings = normalizeSettings(settings);
    settings.presets = settings.presets || [];
    const lang = settings.language || 'es';

    // Load default presets (same sources as get-default-presets)
    const presetsDir = path.join(__dirname, 'presets');
    const generalPath = path.join(presetsDir, 'defaults_presets.js');
    const enPath = path.join(presetsDir, 'defaults_presets_en.js');
    const esPath = path.join(presetsDir, 'defaults_presets_es.js');

    const general = fs.existsSync(generalPath) ? require(generalPath) : [];
    const en = fs.existsSync(enPath) ? require(enPath) : [];
    const es = fs.existsSync(esPath) ? require(esPath) : [];

    const defaultsCombined = Array.isArray(general) ? general.slice() : [];
    const langPresets = (lang === 'en') ? (Array.isArray(en) ? en : []) : (lang === 'es' ? (Array.isArray(es) ? es : []) : []);
    if (Array.isArray(langPresets)) defaultsCombined.push(...langPresets);

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

    // Notificar modal/editor con objeto que incluye meta (para que el modal use la edición nativa)
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

// Exponer configuración (MAX_TEXT_CHARS) vía IPC
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

// Si normalize añadió defaults (p. ej. modeConteo), guardamos de vuelta para persistirlo
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
      try { if (langWin && !langWin.isDestroyed()) langWin.close(); } catch (e) {}
    }
  });
} else {
  createMainWindow();
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
