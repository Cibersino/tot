// electron/main.js
const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require('electron');
const path = require('path');

const {
  CONFIG_DIR,
  ensureConfigDir,
  loadJson,
  saveJson
} = require('./fs_storage');

const settingsState = require('./settings');
const textState = require('./text_state');
const editorState = require('./editor_state');
const menuBuilder = require('./menu_builder');
const presetsMain = require('./presets_main');
const updater = require('./updater');

const SETTINGS_FILE = path.join(CONFIG_DIR, 'user_settings.json');
const CURRENT_TEXT_FILE = path.join(CONFIG_DIR, 'current_text.json');

// Language modal assets
const LANGUAGE_WINDOW_HTML = path.join(__dirname, '../public/language_window.html');
const LANGUAGE_PRELOAD = path.join(__dirname, 'language_preload.js');

ensureConfigDir();

// Visibility helper: warn only once per key
const __WARN_ONCE = new Set();
function warnOnce(key, ...args) {
  if (__WARN_ONCE.has(key)) return;
  __WARN_ONCE.add(key);
  console.warn(...args);
}

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
  flotanteWin = null; // floating stopwatch window
let currentLanguage = 'es';

// Build menu with i18n translations (delegated to menu_builder.js)
function buildAppMenu(lang) {
  const effectiveLang = lang || currentLanguage || 'es';
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
    console.warn('Error registering development shortcuts:', err);
  }
}

function unregisterShortcuts() {
  try {
    globalShortcut.unregisterAll();
  } catch (err) {
    console.warn('Error unregistering global shortcuts:', err);
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
        } catch (err) {
          console.error('Error closing editorWin from mainWin.close:', err);
        }
      }

      if (presetWin && !presetWin.isDestroyed()) {
        try {
          presetWin.close();
        } catch (err) {
          console.error('Error closing presetWin from mainWin.close:', err);
        }
      }
    } catch (err) {
      console.error('Error in mainWin.close handler:', err);
    }
  });

  // When the main window is already destroyed...
  mainWin.on('closed', () => {
    mainWin = null;

    // Force an orderly application exit
    try {
      app.quit();
    } catch (err) {
      console.error('Error calling app.quit() in mainWin.closed:', err);
    }
  });
}

function createEditorWindow() {
  // Load initial state from editor_state.js
  const state = editorState.loadInitialState(loadJson);

  // Is there a saved and valid reduced state?
  const hasReduced =
    state &&
    state.reduced &&
    typeof state.reduced.width === 'number' &&
    typeof state.reduced.height === 'number' &&
    typeof state.reduced.x === 'number' &&
    typeof state.reduced.y === 'number';

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
      preload: path.join(__dirname, 'editor_preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  editorWin.setMenu(null);
  editorWin.setMenuBarVisibility(false);
  editorWin.loadFile(path.join(__dirname, '../public/editor.html'));

  editorWin.once('ready-to-show', () => {
    try {
      // RULE A + C: open maximized if applicable
      if (state && state.maximized === true) {
        editorWin.maximize();
      }

      editorWin.show();

      // Send initial currentText to the editor (when it's ready)
      try {
        const initialText = textState.getCurrentText();
        editorWin.webContents.send('editor-init-text', {
          text: initialText || '',
          meta: { source: 'main', action: 'init' }
        });
      } catch (err) {
        console.error('Error sending editor-init-text to editor:', err);
      }

      // Notify the main window that the editor is ready
      try {
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send('editor-ready');
        }
      } catch (err) {
        console.error('Error notifying editor-ready to main window:', err);
      }
    } catch (err) {
      console.error('Error showing editor:', err);
    }
  });

  // Delegate state management (maximized/reduced, fallback, persistence) to the editor_state module
  editorState.attachTo(editorWin, loadJson, saveJson);

  // Clear reference when the window is completely closed
  editorWin.on('closed', () => {
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
    } catch (err) {
      console.error('Error sending init to presetWin already open:', err);
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
    } catch (err) {
      console.error('Error sending preset-init:', err);
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
    flotanteWin,
  }),
  buildAppMenu,
  setCurrentLanguage: (lang) => {
    const trimmed =
      lang && typeof lang === 'string' && lang.trim()
        ? lang.trim()
        : 'es';
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
    flotanteWin,
  }),
});

// IPC related to updates (delegated to updater)
updater.registerIpc(ipcMain, {
  mainWinRef: () => mainWin,
  currentLanguageRef: () => currentLanguage,
});

// Create language selection window (small, light)
function createLanguageWindow() {
  if (langWin && !langWin.isDestroyed()) {
    try { langWin.focus(); } catch (err) { warnOnce('langWin.focus', 'langWin.focus failed (ignored):', err); }
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
  langWin.loadFile(LANGUAGE_WINDOW_HTML);

  langWin.once('ready-to-show', () => {
    langWin.show();
  });

  // If user closes modal without choosing, apply fallback 'es'
  langWin.on('closed', () => {
    try {
      // If the user closes without choosing, force a fallback to 'es' if no language is defined
      settingsState.applyFallbackLanguageIfUnset('es');
    } catch (err) {
      console.error('Error applying fallback language:', err);
    } finally {
      langWin = null;
      // Ensure mainWin is created after closing the modal
      try {
        if (!mainWin) createMainWindow();
      } catch (err) {
        console.error('Error creating mainWin after closing language modal:', err);
      }
    }
  });
}

// ----------------- Floating Window (PIP) -----------------
const FLOTANTE_PRELOAD = path.join(__dirname, 'flotante_preload.js');
// Floating window HTML path: place it in ../public to maintain convention
const FLOTANTE_HTML = path.join(__dirname, '../public/flotante.html');

function clampInt(n, min, max) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return Math.min(Math.max(n, lo), hi);
}

function pointInRect(pt, rect) {
  return (
    pt.x >= rect.x &&
    pt.x < rect.x + rect.width &&
    pt.y >= rect.y &&
    pt.y < rect.y + rect.height
  );
}

function getWindowCenter(bounds) {
  return {
    x: Math.round(bounds.x + bounds.width / 2),
    y: Math.round(bounds.y + bounds.height / 2)
  };
}

// screen where the center falls
function getDisplayByWindowCenter(bounds) {
  const center = getWindowCenter(bounds);
  const displays = screen.getAllDisplays();
  const containing = displays.find((d) => d && d.bounds && pointInRect(center, d.bounds));
  return containing || screen.getDisplayNearestPoint(center);
}

// Fit 100% within the workArea of the chosen display.
function snapWindowFullyIntoWorkArea(win) {
  if (!win || win.isDestroyed()) return;

  const b = win.getBounds();
  const display = getDisplayByWindowCenter(b);
  const wa = display && display.workArea ? display.workArea : null;
  if (!wa) return;

  const maxX = wa.x + wa.width - b.width;
  const maxY = wa.y + wa.height - b.height;

  const nx = clampInt(b.x, wa.x, maxX);
  const ny = clampInt(b.y, wa.y, maxY);

  if (nx !== b.x || ny !== b.y) {
    win.setBounds({ x: nx, y: ny, width: b.width, height: b.height }, false);
  }
}

/**
 * Cross-platform guard:
 * - Windows: will-move (user gate) + moved (one-shot end-of-move).
 * - macOS: moved is alias of move; use end-of-move by stability on move.
 * - Linux: no will-move/moved per docs; use stability on move.
 */
function installWorkAreaGuard(win, opts = {}) {
  snapWindowFullyIntoWorkArea(win);

  let snapping = false;
  let userMoveArmed = false;

  // will-move: only when the user drags by hand (Windows/macOS). :contentReference[oaicite:1]{index=1}
  win.on('will-move', () => {
    if (!snapping) userMoveArmed = true;
  });

  if (process.platform === 'win32') {
    // moved: emitted once at the end of the movement in Windows. :contentReference[oaicite:2]{index=2}
    win.on('moved', () => {
      if (!userMoveArmed || snapping || win.isDestroyed()) return;
      userMoveArmed = false;
      snapping = true;
      try {
        snapWindowFullyIntoWorkArea(win);
      } finally {
        setImmediate(() => { snapping = false; });
      }
    });

    win.on('closed', () => { });
    return;
  }

  // --- macOS + Linux: "end-of-move" for stability ---
  const endMoveMs = typeof opts.endMoveMs === 'number' ? opts.endMoveMs : 80;

  let lastMoveAt = 0;
  let timer = null;

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  win.on('move', () => {
    if (snapping || win.isDestroyed()) return;

    // Linux: no will-move in the current doc; treat any move as user.
    if (process.platform === 'linux') userMoveArmed = true;

    if (!userMoveArmed) return;

    lastMoveAt = Date.now();
    clearTimer();
    timer = setTimeout(() => {
      if (Date.now() - lastMoveAt < endMoveMs) return;
      if (!userMoveArmed || snapping || win.isDestroyed()) return;

      userMoveArmed = false;
      snapping = true;
      try {
        snapWindowFullyIntoWorkArea(win);
      } finally {
        setImmediate(() => { snapping = false; });
      }
    }, endMoveMs);
  });

  win.on('closed', () => clearTimer());
}

async function createflotanteWindow(options = {}) {
  // If it already exists and wasn't destroyed, restore it (don't recreate it)
  if (flotanteWin && !flotanteWin.isDestroyed()) {
    // Apply a forced position if it was requested
    if (options && (typeof options.x === 'number' || typeof options.y === 'number')) {
      try { flotanteWin.setBounds({ x: options.x || flotanteWin.getBounds().x, y: options.y || flotanteWin.getBounds().y }); } catch (err) {
        warnOnce('flotanteWin.setBounds', 'flotanteWin.setBounds failed (ignored):', err);
      }
    }
    return flotanteWin;
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
      preload: FLOTANTE_PRELOAD,
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
  } catch (err) {
    console.warn('Position could not be calculated from screen.getPrimaryDisplay(); using the default FW position.', err);
  }

  // If x/y were provided explicitly in options, respect them (allow override)
  if (typeof options.x === 'number') pos.x = options.x;
  if (typeof options.y === 'number') pos.y = options.y;

  // Combine calculated options with bwOpts, allowing caller to override
  const createOpts = Object.assign({}, bwOpts, pos, options);

  flotanteWin = new BrowserWindow(createOpts);
  const win = flotanteWin;

  installWorkAreaGuard(win, { endMoveMs: 80 });

  // Track whether the window is in the process of closing; used to de-noise load failures in stress tests.
  let winClosing = false;
  win.on('close', () => { winClosing = true; });

  // Notify closure so the main renderer can clean up state
  win.on('closed', () => {
    // Only clear the global ref if it still points to this instance.
    if (flotanteWin === win) {
      flotanteWin = null;
    }

    // Notify the main renderer if it needs to clean up state
    try {
      if (mainWin && !mainWin.isDestroyed() && mainWin.webContents && !mainWin.webContents.isDestroyed()) {
        mainWin.webContents.send('flotante-closed');
      }
    } catch (err) {
      warnOnce('mainWin.send.flotante-closed', "mainWin send('flotante-closed') failed (ignored):", err);
    }
  });

  // Load the HTML of the floating window
  try {
    await win.loadFile(FLOTANTE_HTML);
  } catch (err) {
    // Expected if the window is closed while loadFile is in-flight (e.g., open/close stress test).
    if (!winClosing && !win.isDestroyed()) {
      console.error('Error loading flotante HTML:', err);
    }
  }

  // Ensure the window starts fully inside the workArea of the display chosen by its center.
  try {
    snapWindowFullyIntoWorkArea(win);
  } catch (err) {
    warnOnce('snapWindowFullyIntoWorkArea', 'snapWindowFullyIntoWorkArea failed (ignored):', err);
  }

  // Optional: if the floating window should not steal focus, use showInactive(); here we want immediate interaction so we keep focusable=true and let it take focus.
  return win;
}

// ---------------- Main stopwatch (timekeeping + broadcast) ---------------- //

let crono = {
  running: false,
  elapsed: 0,
  startTs: null
};

let cronoInterval = null;
const CRONO_BROADCAST_MS = 1000; // Adjustable if you want less resource consumption

function formatCronoMs(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function getCronoState() {
  const elapsedNow = crono.running ? (crono.elapsed + (Date.now() - crono.startTs)) : crono.elapsed;
  return { elapsed: elapsedNow, running: !!crono.running, display: formatCronoMs(elapsedNow) };
}

function broadcastCronoState() {
  const state = getCronoState();
  try { if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('crono-state', state); } catch (err) { warnOnce('send.crono-state.mainWin', 'send crono-state to mainWin failed (ignored):', err); }
  try { if (flotanteWin && !flotanteWin.isDestroyed()) flotanteWin.webContents.send('crono-state', state); } catch (err) { warnOnce('send.crono-state.flotanteWin', 'send crono-state to flotanteWin failed (ignored):', err); }
  try { if (editorWin && !editorWin.isDestroyed()) editorWin.webContents.send('crono-state', state); } catch (err) { warnOnce('send.crono-state.editorWin', 'send crono-state to editorWin failed (ignored):', err); }
}

function ensureCronoInterval() {
  if (cronoInterval) return;
  cronoInterval = setInterval(() => {
    broadcastCronoState();
    // Option: stop the interval if nobody listens and the timer is not running
    if (!crono.running && !mainWin && !flotanteWin && !editorWin) {
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
  // Ignore edits while running; allow only paused/stopped updates
  if (crono.running) return;

  const n = Number(ms);
  if (!Number.isFinite(n)) return;

  const msRounded = Math.max(0, Math.floor(n / 1000) * 1000);

  if (msRounded === 0) {
    resetCrono();
    return;
  }

  crono.elapsed = msRounded;
  crono.startTs = null;
  crono.running = false;
  broadcastCronoState();
}

ipcMain.handle('crono-get-state', () => {
  return getCronoState();
});

ipcMain.on('crono-toggle', () => {
  try {
    if (crono.running) stopCrono(); else startCrono();
  } catch (err) {
    console.error('Error in crono-toggle:', err);
  }
});

ipcMain.on('crono-reset', () => {
  try { resetCrono(); } catch (err) { console.error('Error in crono-reset:', err); }
});

ipcMain.on('crono-set-elapsed', (_ev, ms) => {
  try { setCronoElapsed(ms); } catch (err) { console.error('Error in crono-set-elapsed:', err); }
});

// IPC: open floating window
ipcMain.handle('flotante-open', async () => {
  try {
    await createflotanteWindow();
    try { broadcastCronoState(); } catch (err) { warnOnce('broadcastCronoState.after.flotante-open', 'broadcastCronoState failed after flotante-open (ignored):', err); }
    if (crono.running) ensureCronoInterval();
    return { ok: true };
  } catch (err) {
    console.error('Error processing flotante-open:', err);
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('flotante-close', async () => {
  try {
    const win = flotanteWin;

    if (win && !win.isDestroyed()) {
      // NO hacer flotanteWin = null aquí; el 'closed' handler debe dejar el puntero en null.
      win.close();
    }

    return { ok: true };
  } catch (err) {
    console.error('Error processing flotante-close:', err);
    return { ok: false, error: String(err) };
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
  } catch (err) {
    console.error('Error processing flotante-command in main:', err);
  }
});

// Open editor window (or focus + send current text)
ipcMain.handle('open-editor', () => {
  if (!editorWin || editorWin.isDestroyed()) {
    createEditorWindow();
  } else {
    editorWin.show();
    try {
      const initialText = textState.getCurrentText();
      editorWin.webContents.send('editor-init-text', {
        text: initialText || '',
        meta: { source: 'main', action: 'init' },
      });
    } catch (err) {
      console.error('Error sending editor-init-text from open-editor:', err);
    }
    try {
      if (mainWin && !mainWin.isDestroyed()) {
        mainWin.webContents.send('editor-ready');
      }
    } catch (err) {
      console.warn(
        'Unable to notify editor-ready (editor already open):',
        err
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
ipcMain.handle('get-app-config', async () => {
  try {
    return { ok: true, maxTextChars: MAX_TEXT_CHARS };
  } catch (err) {
    console.error('Error processing get-app-config:', err);
    return { ok: false, error: String(err), maxTextChars: 1e7 };
  }
});

// --- App start logic --- //

app.whenReady().then(() => {
  // Initial load of settings (normalized and persisted) via settingsState
  const settings = settingsState.init({
    loadJson,
    saveJson,
    settingsFile: SETTINGS_FILE,
  });
  currentLanguage = settings.language || 'es';

  if (!settings.language || settings.language === '') {
    // First time: Show language modal
    createLanguageWindow();
    ipcMain.once('language-selected', () => {
      try {
        if (!mainWin) createMainWindow();
      } catch (err) {
        console.error('Error creating mainWin after selecting language:', err);
      } finally {
        try {
          if (langWin && !langWin.isDestroyed()) langWin.close();
        } catch (err) {
          warnOnce('langWin.close.after.language-selected', 'langWin.close failed after language-selected (ignored):', err);
        }
      }
      updater.scheduleInitialCheck();
    });
  } else {
    // Language already defined: Go directly to the main window
    createMainWindow();
    updater.scheduleInitialCheck();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  // Development shortcuts
  unregisterShortcuts();

  // Clearing the stopwatch
  try {
    if (cronoInterval) {
      clearInterval(cronoInterval);
      cronoInterval = null;
    }
  } catch (err) {
    console.error('Error clearing stopwatch in will-quit:', err);
  }
});
