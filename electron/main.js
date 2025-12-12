// electron/main.js
const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require('electron');
const path = require('path');

const {
  CONFIG_DIR,
  ensureConfigDir,
  loadJson,
  saveJson
} = require('./fs_storage');

const settingsState = require("./settings");
const textState = require("./text_state");
const modalState = require('./modal_state');
const menuBuilder = require("./menu_builder");
const presetsMain = require("./presets_main");
const updater = require("./updater");

const SETTINGS_FILE = path.join(CONFIG_DIR, 'user_settings.json');
const CURRENT_TEXT_FILE = path.join(CONFIG_DIR, 'current_text.json');

// Language modal assets
const LANGUAGE_MODAL_HTML = path.join(__dirname, '../public/language_modal.html');
const LANGUAGE_PRELOAD = path.join(__dirname, 'language_preload.js');

ensureConfigDir();

// Canonical source of the text limit.
// Keep fallbacks synchronized in text_state.js and constants.js.
const MAX_TEXT_CHARS = 10000000;

// Initialize the shared text state (current_text)
textState.init({
  loadJson,
  saveJson,
  currentTextFile: CURRENT_TEXT_FILE,
  settingsFile: SETTINGS_FILE,
  app,
  maxTextChars: MAX_TEXT_CHARS,
});

let mainWin = null, // main window
  editorWin = null, // modal window to edit current text
  presetWin = null, // modal window for new/edit preset wpm
  langWin = null, // language selection modal (first launch)
  floatingWin = null; // floating stopwatch window
let currentLanguage = 'es';

// Build menu with i18n translations (delegated to menu_builder.js)
function buildAppMenu(lang) {
  const effectiveLang = lang || currentLanguage || "es";
  menuBuilder.buildAppMenu(effectiveLang, {
    mainWindow: mainWin,
    onOpenLanguage: () => createLanguageWindow(),
  });
}

// Register global shortcuts in development (without showing menu)
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

function createMainWindow() {
  // Note: `useContentSize:true` makes `width/height` apply to the content (excluding borders)
  mainWin = new BrowserWindow({
    width: 828,
    height: 490,
    useContentSize: true,
    resizable: false,      // Window not resizable by the user
    maximizable: false,    // Do not allow maximization (maintain fixed dimensions)
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWin.loadFile(path.join(__dirname, '../public/index.html'));

  // --- CUSTOM TOP BAR (translations by i18n) ---
  buildAppMenu(currentLanguage);
  // --- END OF TOP BAR ---
  registerDevShortcuts(mainWin);

  // When the main window starts closing, close dependent windows in an orderly fashion.
  // We don't prevent closure; we only request the editor/preset to close if they exist.
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
  // Load initial state from modal_state.js
  const state = modalState.loadInitialState(loadJson);

  // Is there a saved and valid reduced state?
  const hasReduced =
    state &&
    state.reduced &&
    typeof state.reduced.width === "number" &&
    typeof state.reduced.height === "number" &&
    typeof state.reduced.x === "number" &&
    typeof state.reduced.y === "number";

  // Build window using reduced state if it exists
  editorWin = new BrowserWindow({
    width: hasReduced ? state.reduced.width : 1200,
    height: hasReduced ? state.reduced.height : 800,
    x: hasReduced ? state.reduced.x : undefined,
    y: hasReduced ? state.reduced.y : undefined,
    resizable: true,
    minimizable: true,
    maximizable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "manual_preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  editorWin.setMenu(null);
  editorWin.setMenuBarVisibility(false);
  editorWin.loadFile(path.join(__dirname, "../public/manual.html"));

  editorWin.once("ready-to-show", () => {
    try {
      // RULE A + C: open maximized if applicable
      if (state && state.maximized === true) {
        editorWin.maximize();
      }

      editorWin.show();

      // Send initial currentText to the editor (when it's ready)
      try {
        const initialText = textState.getCurrentText();
        editorWin.webContents.send("manual-init-text", {
          text: initialText || "",
          meta: { source: "main", action: "init" }
        });
      } catch (err) {
        console.error("Error enviando manual-init-text al editor:", err);
      }

      // Notify the main window that the editor is ready
      try {
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send("manual-editor-ready");
        }
      } catch (err) {
        console.error("Error notificando manual-editor-ready a la ventana principal:", err);
      }
    } catch (e) {
      console.error("Error mostrando editor manual:", e);
    }
  });

  // Delegate state management (maximized/reduced, fallback, persistence) to the modal_state module
  modalState.attachTo(editorWin, loadJson, saveJson);

  // Clear reference when the window is completely closed
  editorWin.on("closed", () => {
    editorWin = null;
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

// IPC related to text state (delegated to text_state)
textState.registerIpc(ipcMain, () => ({
  mainWin,
  editorWin,
}));

// IPC related to settings (delegated to settingsState)
settingsState.registerIpc(ipcMain, {
  getWindows: () => ({
    mainWin,
    editorWin,
    presetWin,
    langWin,
    floatingWin,
  }),
  buildAppMenu,
  getCurrentLanguage: () => currentLanguage,
  setCurrentLanguage: (lang) => {
    const trimmed =
      lang && typeof lang === "string" && lang.trim()
        ? lang.trim()
        : "es";
    currentLanguage = trimmed;
  },
});

// IPC related to presets (delegated to presetsMain)
presetsMain.registerIpc(ipcMain, {
  getWindows: () => ({
    mainWin,
    editorWin,
    presetWin,
    langWin,
    floatingWin,
  }),
});

// IPC related to updates (delegated to updater)
updater.register(ipcMain, {
  mainWinRef: () => mainWin,
  currentLanguageRef: () => currentLanguage,
});

// Create language selection window (small, light)
function createLanguageWindow() {
  if (langWin && !langWin.isDestroyed()) {
    try { langWin.focus(); } catch (e) { /* noop */ }
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

  // If user closes modal without choosing, apply fallback 'es'
  langWin.on("closed", () => {
    try {
      // If the user closes without choosing, force a fallback to 'es' if no language is defined
      settingsState.applyFallbackLanguageIfUnset("es");
    } catch (e) {
      console.error("Error aplicando fallback language:", e);
    } finally {
      langWin = null;
      // Ensure mainWin is created after closing the modal
      try {
        if (!mainWin) createMainWindow();
      } catch (e) {
        console.error("Error creando mainWin tras el modal de idioma:", e);
      }
    }
  });
}

// ----------------- Floating Window (PIP) -----------------
const FLOATER_PRELOAD = path.join(__dirname, 'flotante_preload.js');
// Floating window HTML path: place it in ../public to maintain convention
const FLOATER_HTML = path.join(__dirname, '../public/flotante.html');

async function createFloatingWindow(options = {}) {
  // If it already exists and wasn't destroyed, restore it (don't recreate it)
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

  // Margin values ​​so the floating window isn't exactly flush against the edge or over the scrollbars.
  // Adjust these values ​​if desired (in px).
  const DEFAULT_MARGIN_RIGHT = 30; // Slightly to the left of the far right to avoid scrollbars
  const DEFAULT_MARGIN_BOTTOM = 20;  // Space above the taskbar/dock

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
    console.warn("No se pudo calcular la posicion desde screen.getPrimaryDisplay(); usando la posicion del flotante predeterminada.", e);
  }

  // If x/y were provided explicitly in options, respect them (allow override)
  if (typeof options.x === 'number') pos.x = options.x;
  if (typeof options.y === 'number') pos.y = options.y;

  // Combine calculated options with bwOpts, allowing caller to override
  const createOpts = Object.assign({}, bwOpts, pos, options);

  floatingWin = new BrowserWindow(createOpts);

  // Load the HTML of the floating window
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

  // Notify closure so the main renderer can clean up state
  floatingWin.on('closed', () => {
    floatingWin = null;
    // Notify the main renderer if it needs to clean up state
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
const CRONO_BROADCAST_MS = 1000; // Adjustable if you want less resource consumption

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

// IPC: open floating window
ipcMain.handle('floating-open', async () => {
  try {
    await createFloatingWindow();
    try { broadcastCronoState(); } catch (e) {/*noop*/ }
    if (crono.running) ensureCronoInterval();
    return { ok: true };
  } catch (e) {
    console.error("Error procesando floating-open:", e);
    return { ok: false, error: String(e) };
  }
});

// IPC: close floating window
ipcMain.handle('floating-close', async () => {
  try {
    if (floatingWin && !floatingWin.isDestroyed()) {
      floatingWin.close();
      floatingWin = null;
    }
    return { ok: true };
  } catch (e) {
    console.error("Error procesando floating-close:", e);
    return { ok: false, error: String(e) };
  }
});

// IPC: commands from floating window
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
    // broadcastCronoState() is already called by the previous functions
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
      const initialText = textState.getCurrentText();
      editorWin.webContents.send("manual-init-text", {
        text: initialText || "",
        meta: { source: "main", action: "init" },
      });
    } catch (err) {
      console.error("Error enviando manual-init-text desde open-editor:", err);
    }
    try {
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send("manual-editor-ready");
      }
    } catch (e) {
      console.warn(
        "No se pudo notificar manual-editor-ready (editor ya abierto):",
        e
      );
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

// Expose configuration (MAX_TEXT_CHARS) via IPC
ipcMain.handle("get-app-config", async () => {
  try {
    return { ok: true, maxTextChars: MAX_TEXT_CHARS };
  } catch (e) {
    console.error("Error procesando get-app-config:", e);
    return { ok: false, error: String(e), maxTextChars: 1e7 };
  }
});

/* --- App start logic --- */

app.whenReady().then(() => {
  // Initial load of settings (normalized and persisted) via settingsState
  const settings = settingsState.init({
    loadJson,
    saveJson,
    settingsFile: SETTINGS_FILE,
  });
  currentLanguage = settings.language || "es";

  if (!settings.language || settings.language === "") {
    // First time: Show language modal
    createLanguageWindow();
    ipcMain.once("language-selected", (_evt, lang) => {
      try {
        if (!mainWin) createMainWindow();
      } catch (e) {
        console.error("Error creando mainWin tras seleccionar idioma:", e);
      } finally {
        try {
          if (langWin && !langWin.isDestroyed()) langWin.close();
        } catch (e) {
          /* noop */
        }
      }
      updater.scheduleInitialCheck();
    });
  } else {
    // Language already defined: Go directly to the main window
    createMainWindow();
    updater.scheduleInitialCheck();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on("will-quit", () => {
  // Development shortcuts
  unregisterShortcuts();

  // Clearing the stopwatch
  try {
    if (cronoInterval) {
      clearInterval(cronoInterval);
      cronoInterval = null;
    }
  } catch (e) {
    console.error("Error limpiando cronometro en will-quit:", e);
  }
});
