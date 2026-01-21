// electron/main.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main process entry point (Electron).
// Responsibilities:
// - Ensure persistent storage is ready (config folder + JSON-backed state).
// - Create and manage application windows (main, editor, preset modal, language picker, flotante stopwatch).
// - Register IPC handlers used by renderer windows (the visible UI).
// - Own the stopwatch ("crono") state and broadcast updates to any open UI windows.

// =============================================================================
// Imports (external + internal modules)
// =============================================================================

const { app, BrowserWindow, ipcMain, screen, globalShortcut, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const Log = require('./log');
const { MAX_TEXT_CHARS, MAX_IPC_CHARS, MAX_META_STR_CHARS, DEFAULT_LANG } = require('./constants_main');

const {
  initStorage,
  ensureConfigDir,
  getSettingsFile,
  getCurrentTextFile,
  loadJson,
  saveJson,
} = require('./fs_storage');

const settingsState = require('./settings');
const textState = require('./text_state');
const editorState = require('./editor_state');
const menuBuilder = require('./menu_builder');
const presetsMain = require('./presets_main');
const updater = require('./updater');
const { registerLinkIpc } = require('./link_openers');

const log = Log.get('main');
log.debug('Main process starting...');

// =============================================================================
// File locations (persistent user data)
// =============================================================================
// Resolved after app readiness (requires app.getPath('userData')).

// Language selection modal (first launch) assets
const LANGUAGE_WINDOW_HTML = path.join(__dirname, '../public/language_window.html');
const LANGUAGE_PRELOAD = path.join(__dirname, 'language_preload.js');
// Fallback exists if the manifest is missing/corrupt so the picker still works.
// Keep this list intentionally minimal to avoid drift and make fallback usage obvious.
const FALLBACK_LANGUAGES = [
  { tag: 'es', label: 'Español' },
  { tag: 'en', label: 'English' },
];

// Helper to avoid repeating the same warning many times (keeps logs readable).
const warnOnce = (...args) => log.warnOnce(...args);

function isPlainObject(x) {
  if (!x || typeof x !== 'object') return false;
  return Object.getPrototypeOf(x) === Object.prototype;
}

// Maximum allowed characters for the current text (safety limit for memory/performance).
// Renderer fallback lives in public/js/constants.js; main/text_state use MAX_TEXT_CHARS and injected maxTextChars.

// =============================================================================
// Global window references (singletons)
// =============================================================================
// We keep references so we can reuse windows (avoid duplicates), send IPC messages and close related windows during shutdown.

let mainWin = null;     // Main window (index.html)
let editorWin = null;   // Editor window (editor.html) - user edits current text
let presetWin = null;   // Preset modal (preset_modal.html) - create/edit preset
let langWin = null;     // Language selection window (first launch)
let flotanteWin = null; // Floating stopwatch window (flotante.html)

// =============================================================================
// Menu + development utilities
// =============================================================================

function getSelectedLanguage() {
  try {
    const settings = settingsState.getSettings();
    const lang = settings && typeof settings.language === 'string' ? settings.language.trim() : '';
    if (!lang) {
      warnOnce(
        'main.menu.language.empty',
        `Settings language is empty; falling back to "${DEFAULT_LANG}" for menu.`
      );
      return DEFAULT_LANG;
    }
    return lang;
  } catch (err) {
    log.error(`Failed to read settings language for menu; falling back to "${DEFAULT_LANG}":`, err);
    return DEFAULT_LANG;
  }
}

/**
 * Rebuild the application menu using i18n translations.
 * The menu definition is in menu_builder.js; this function just wires it to mainWin.
 */
function buildAppMenu(lang) {
  const candidate = typeof lang === 'string' ? lang.trim() : '';
  if (lang && !candidate) {
    warnOnce(
      'main.menu.language.invalid',
      'Invalid menu language override; using settings language instead.'
    );
  }
  const effectiveLang = candidate || getSelectedLanguage();
  menuBuilder.buildAppMenu(effectiveLang, {
    mainWindow: mainWin,
    onOpenLanguage: () => createLanguageWindow(),
  });
}

/**
 * Developer-only global shortcuts (disabled in packaged builds).
 * Used for quick inspection and reload during development.
 */
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
    log.warn('Error registering development shortcuts:', err);
  }
}

function unregisterShortcuts() {
  try {
    globalShortcut.unregisterAll();
  } catch (err) {
    log.warn('Error unregistering global shortcuts:', err);
  }
}

// =============================================================================
// Window factories (create/show/focus windows)
// =============================================================================

/**
 * Create the main application window (public/index.html).
 * This is the first "real" window after language selection (if needed).
 */
function createMainWindow() {
  // NOTE: useContentSize:true => width/height apply to the content area (exclude window borders).
  mainWin = new BrowserWindow({
    width: 828,
    height: 490,
    useContentSize: true,
    resizable: false,   // Fixed size for consistent layout
    maximizable: false, // Prevent maximize button from changing size
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWin.loadFile(path.join(__dirname, '../public/index.html'));

  // Build top menu using translations.
  buildAppMenu();

  // Dev-only shortcuts for inspection/reload.
  registerDevShortcuts(mainWin);

  // Best-effort shutdown: when the main window closes, try to close auxiliary windows too.
  mainWin.on('close', () => {
    try {
      if (editorWin && !editorWin.isDestroyed()) {
        try {
          editorWin.close();
        } catch (err) {
          log.error('Error closing editorWin from mainWin.close:', err);
        }
      }

      if (presetWin && !presetWin.isDestroyed()) {
        try {
          presetWin.close();
        } catch (err) {
          log.error('Error closing presetWin from mainWin.close:', err);
        }
      }
    } catch (err) {
      log.error('Error in mainWin.close handler:', err);
    }
  });

  // Release reference and quit the app once the main window is gone.
  mainWin.on('closed', () => {
    mainWin = null;

    // Force an orderly application exit.
    // (If something goes wrong here, we still want to see it as an error.)
    try {
      app.quit();
    } catch (err) {
      log.error('Error calling app.quit() in mainWin.closed:', err);
    }
  });
}

/**
 * Create the editor window (public/editor.html).
 * The editor uses editor_state.js to remember size/position/maximized state.
 */
function createEditorWindow() {
  // Load last saved window state (size/position/maximized) from editor_state.js.
  const state = editorState.loadInitialState(loadJson);

  // Determine whether we have a valid saved "reduced" (non-maximized) state.
  const hasReduced =
    state &&
    state.reduced &&
    typeof state.reduced.width === 'number' &&
    typeof state.reduced.height === 'number' &&
    typeof state.reduced.x === 'number' &&
    typeof state.reduced.y === 'number';

  // Create window using saved bounds if available; otherwise use defaults.
  editorWin = new BrowserWindow({
    width: hasReduced ? state.reduced.width : 1200,
    height: hasReduced ? state.reduced.height : 800,
    x: hasReduced ? state.reduced.x : undefined,
    y: hasReduced ? state.reduced.y : undefined,
    resizable: true,
    minimizable: true,
    maximizable: true,
    show: false, // Show only after ready-to-show to avoid flicker.
    webPreferences: {
      preload: path.join(__dirname, 'editor_preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // The editor window uses custom in-page controls; hide the native menu bar.
  editorWin.setMenu(null);
  editorWin.setMenuBarVisibility(false);

  editorWin.loadFile(path.join(__dirname, '../public/editor.html'));

  // When ready, apply maximized state (if needed), show it, and send initial data.
  editorWin.once('ready-to-show', () => {
    try {
      // If it was last closed maximized, reopen maximized.
      if (state && state.maximized === true) {
        editorWin.maximize();
      }

      editorWin.show();

      // Send current text so the editor can render and allow editing.
      try {
        const initialText = textState.getCurrentText();
        editorWin.webContents.send('editor-init-text', {
          text: initialText || '',
          meta: { source: 'main', action: 'init' },
        });
      } catch (err) {
        log.error('Error sending editor-init-text to editor:', err);
      }

      // Notify the main window that the editor is ready (UI may enable/refresh controls).
      try {
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send('editor-ready');
        }
      } catch (err) {
        log.error('Error notifying editor-ready to main window:', err);
      }
    } catch (err) {
      log.error('Error showing editor:', err);
    }
  });

  // Delegate persistent window-state management to editor_state.js.
  editorState.attachTo(editorWin, loadJson, saveJson);

  // Drop reference on close so the window can be recreated later.
  editorWin.on('closed', () => {
    editorWin = null;
  });
}

/**
 * Create the preset modal window (public/preset_modal.html).
 * This is a modal dialog for creating/editing WPM presets.
 * If already open, focus it and resend the latest init payload.
 */
function createPresetWindow(initialData) {
  // If already open, focus and re-send init data (so the modal can update itself).
  if (presetWin && !presetWin.isDestroyed()) {
    try {
      presetWin.focus();
      presetWin.webContents.send('preset-init', initialData || {});
    } catch (err) {
      log.error('Error sending init to presetWin already open:', err);
    }
    return;
  }

  presetWin = new BrowserWindow({
    width: 460,
    height: 410,
    resizable: false,
    minimizable: false,
    maximizable: false,
    parent: mainWin, // Modal blocks the parent window while open.
    modal: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preset_preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  presetWin.setMenu(null);
  presetWin.loadFile(path.join(__dirname, '../public/preset_modal.html'));

  // Show and send initial payload only when ready.
  presetWin.once('ready-to-show', () => {
    presetWin.show();
    try {
      presetWin.webContents.send('preset-init', initialData || {});
    } catch (err) {
      log.error('Error sending preset-init:', err);
    }
  });

  presetWin.on('closed', () => {
    presetWin = null;
  });
}

/**
 * Create the language selection window (first launch).
 * This is a small window used only to select the UI language on first run.
 * It is not modal relative to mainWin because it can be opened before mainWin exists.
 */
function createLanguageWindow() {
  if (langWin && !langWin.isDestroyed()) {
    try {
      langWin.focus();
    } catch (err) {
      warnOnce('langWin.focus', 'langWin.focus failed (ignored):', err);
    }
    return;
  }

  langWin = new BrowserWindow({
    width: 420,
    height: 360,
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
      sandbox: true,
    },
  });

  langWin.setMenu(null);
  langWin.loadFile(LANGUAGE_WINDOW_HTML);

  langWin.once('ready-to-show', () => {
    langWin.show();
  });

  // If the user closes the language window without choosing, persist a safe fallback and continue startup.
  langWin.on('closed', () => {
    try {
      settingsState.applyFallbackLanguageIfUnset(DEFAULT_LANG);
    } catch (err) {
      log.error('Error applying fallback language:', err);
    } finally {
      langWin = null;

      // Ensure the app can proceed even if the user dismissed the window.
      try {
        if (!mainWin) createMainWindow();
      } catch (err) {
        log.error('Error creating mainWin after closing language modal:', err);
      }
    }
  });
}

// =============================================================================
// IPC registration (delegated modules)
// =============================================================================
// main.js owns windows. Feature modules own their IPC contract and internal logic.
// We provide window references and callbacks so modules can notify the UI.
// Registration happens after app readiness in app.whenReady().

// =============================================================================
// Floating window - window placement safety
// =============================================================================
// The flotante window is a small always-on-top stopwatch UI.
// We keep it fully visible by clamping its bounds to the display "work area"
// (the usable desktop area excluding taskbar/dock).

const FLOTANTE_PRELOAD = path.join(__dirname, 'flotante_preload.js');
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
    y: Math.round(bounds.y + bounds.height / 2),
  };
}

/**
 * Pick the display that "owns" the window center.
 * Used to decide which monitor's work area should be used for snapping.
 */
function getDisplayByWindowCenter(bounds) {
  const center = getWindowCenter(bounds);
  const displays = screen.getAllDisplays();
  const containing = displays.find((d) => d && d.bounds && pointInRect(center, d.bounds));
  return containing || screen.getDisplayNearestPoint(center);
}

/**
 * Ensure the whole window is visible inside the current display work area
 * (work area excludes taskbar/dock).
 */
function snapWindowFullyIntoWorkArea(win) {
  if (!win || win.isDestroyed()) return;

  const b = win.getBounds();
  const display = getDisplayByWindowCenter(b);
  const wa = display && display.workArea ? display.workArea : null;

  if (!wa) {
    warnOnce(
      'snapWindowFullyIntoWorkArea.noWorkArea',
      'snapWindowFullyIntoWorkArea: display.workArea unavailable; snap skipped (ignored).'
    );
    return;
  }

  const maxX = wa.x + wa.width - b.width;
  const maxY = wa.y + wa.height - b.height;

  const nx = clampInt(b.x, wa.x, maxX);
  const ny = clampInt(b.y, wa.y, maxY);

  if (nx !== b.x || ny !== b.y) {
    win.setBounds({ x: nx, y: ny, width: b.width, height: b.height }, false);
  }
}

/**
 * Work-area guard (cross-platform).
 * Goal: after a user drags the window, snap it back into the visible work area so it cannot end up partially off-screen.
 */
function installWorkAreaGuard(win, opts = {}) {
  // Snap immediately on creation.
  snapWindowFullyIntoWorkArea(win);

  let snapping = false;
  let userMoveArmed = false;

  // will-move: fired when the user starts dragging the window (Windows/macOS).
  win.on('will-move', () => {
    if (!snapping) userMoveArmed = true;
  });

  if (process.platform === 'win32') {
    // moved: emitted once at the end of the movement on Windows.
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

    // Keep a no-op handler for symmetry; could host future cleanup.
    win.on('closed', () => { });
    return;
  }

  // macOS + Linux: approximate "end of move" with a short timer after the last move event.
  const endMoveMs = typeof opts.endMoveMs === 'number' ? opts.endMoveMs : 80;

  let lastMoveAt = 0;
  let timer = null;

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  win.on('move', () => {
    if (snapping || win.isDestroyed()) return;

    // Linux: treat any move event as user-driven (platform behavior varies).
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

/**
 * Create (or restore) the floating stopwatch window (public/flotante.html).
 * - If already open, reuse it (avoid duplicates).
 * - Default position: near bottom-right of the primary display work area.
 */
async function createFlotanteWindow(options = {}) {
  // Normalize options to avoid TypeError when callers pass null (or other non-object values).
  if (!options || typeof options !== 'object') {
    warnOnce(
      'flotante.options.invalid',
      'createFlotanteWindow: invalid options; using defaults (ignored).'
    );
    options = {};
  }

  // If it already exists and wasn't destroyed, restore it (don't recreate it).
  if (flotanteWin && !flotanteWin.isDestroyed()) {
    // Optional: apply forced position if requested.
    if (options && (typeof options.x === 'number' || typeof options.y === 'number')) {
      try {
        const b = flotanteWin.getBounds();
        const nx = (typeof options.x === 'number') ? options.x : b.x;
        const ny = (typeof options.y === 'number') ? options.y : b.y;
        flotanteWin.setBounds({ x: nx, y: ny });
      } catch (err) {
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
      sandbox: true,
    },
  };

  // Margins so the window is not flush against edges (px).
  const DEFAULT_MARGIN_RIGHT = 30;
  const DEFAULT_MARGIN_BOTTOM = 20;

  // Default position is bottom-right inside the primary display work area.
  let pos = {};
  try {
    const display = screen.getPrimaryDisplay();
    const wa = display && display.workArea ? display.workArea : null;

    if (!wa) {
      warnOnce(
        'flotante.position.noWorkArea',
        'Flotante position: primary display workArea unavailable; using OS default position (ignored).'
      );
    } else {
      const marginRight = typeof options.marginRight === 'number' ? options.marginRight : DEFAULT_MARGIN_RIGHT;
      const marginBottom = typeof options.marginBottom === 'number' ? options.marginBottom : DEFAULT_MARGIN_BOTTOM;

      pos.x = wa.x + wa.width - bwOpts.width - marginRight;
      pos.y = wa.y + wa.height - bwOpts.height - marginBottom;
    }
  } catch (err) {
    log.warn('Flotante position: screen.getPrimaryDisplay failed; using OS defaults.', err);
  }

  // Allow explicit overrides.
  if (typeof options.x === 'number') pos.x = options.x;
  if (typeof options.y === 'number') pos.y = options.y;

  // Merge default options with computed position and any caller overrides.
  const createOpts = Object.assign({}, bwOpts, pos, options);

  flotanteWin = new BrowserWindow(createOpts);
  const win = flotanteWin;

  installWorkAreaGuard(win, { endMoveMs: 80 });

  // Track close to avoid noisy "load failed" logs during stress open/close.
  let winClosing = false;
  win.on('close', () => { winClosing = true; });

  // When the floating window closes, clear the reference and notify main UI.
  win.on('closed', () => {
    if (flotanteWin === win) {
      flotanteWin = null;
    }

    // Best-effort notification: main renderer may update UI state.
    try {
      if (mainWin && !mainWin.isDestroyed() && mainWin.webContents && !mainWin.webContents.isDestroyed()) {
        mainWin.webContents.send('flotante-closed');
      }
    } catch (err) {
      warnOnce('mainWin.send.flotante-closed', "mainWin send('flotante-closed') failed (ignored):", err);
    }
  });

  // Load the HTML content. If the user closes quickly, loadFile may reject; treat as expected.
  try {
    await win.loadFile(FLOTANTE_HTML);
  } catch (err) {
    if (!winClosing && !win.isDestroyed()) {
      log.error('Error loading flotante HTML:', err);
    }
  }

  // Final safety: ensure it's fully visible.
  try {
    snapWindowFullyIntoWorkArea(win);
  } catch (err) {
    warnOnce('snapWindowFullyIntoWorkArea', 'snapWindowFullyIntoWorkArea failed (ignored):', err);
  }

  return win;
}

// =============================================================================
// Stopwatch (crono)
// =============================================================================
// The stopwatch lives in the main process so it keeps working even if the UI windows
// are hidden/reloaded, and so the flotante window can stay consistent.

let crono = {
  running: false,
  elapsed: 0,   // Accumulated milliseconds while paused/stopped.
  startTs: null // Timestamp when started (used to compute running delta).
};

let cronoInterval = null;
const CRONO_BROADCAST_MS = 1000;

function formatCronoMs(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function getCronoState() {
  const elapsedNow = crono.running
    ? (crono.elapsed + (Date.now() - crono.startTs))
    : crono.elapsed;

  return {
    elapsed: elapsedNow,
    running: !!crono.running,
    display: formatCronoMs(elapsedNow),
  };
}

/**
 * Broadcast the current stopwatch state to renderer windows (main + flotante).
 * Best-effort: a window may be closing or not exist.
 */
function broadcastCronoState() {
  const state = getCronoState();

  try {
    if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('crono-state', state);
  } catch (err) {
    warnOnce('send.crono-state.mainWin', 'send crono-state to mainWin failed (ignored):', err);
  }

  try {
    if (flotanteWin && !flotanteWin.isDestroyed()) flotanteWin.webContents.send('crono-state', state);
  } catch (err) {
    warnOnce('send.crono-state.flotanteWin', 'send crono-state to flotanteWin failed (ignored):', err);
  }
}

function stopCronoIntervalIfIdle() {
  if (cronoInterval && !crono.running) {
    clearInterval(cronoInterval);
    cronoInterval = null;
  }
}

// Keep a lightweight timer only while the stopwatch is running.
function ensureCronoInterval() {
  if (cronoInterval) return;
  cronoInterval = setInterval(() => {
    if (!crono.running) {
      stopCronoIntervalIfIdle();
      return;
    }
    broadcastCronoState();
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
    stopCronoIntervalIfIdle();
  }
}

function resetCrono() {
  crono.running = false;
  crono.startTs = null;
  crono.elapsed = 0;
  broadcastCronoState();
  stopCronoIntervalIfIdle();
}

/**
 * Set elapsed time from UI (only when paused/stopped).
 * Value is rounded down to the nearest second.
 */
function setCronoElapsed(ms) {
  if (crono.running) {
    warnOnce(
      'crono.setElapsed.whileRunning',
      'crono-set-elapsed ignored: crono is running (ignored).'
    );
    return;
  }

  const n = Number(ms);
  if (!Number.isFinite(n)) {
    warnOnce(
      'crono.setElapsed.invalidNumber',
      'crono-set-elapsed ignored: invalid elapsed value (ignored).'
    );
    return;
  }

  const msRounded = Math.max(0, Math.floor(n / 1000) * 1000);

  if (msRounded === 0) {
    resetCrono();
    return;
  }

  crono.elapsed = msRounded;
  crono.startTs = null;
  crono.running = false;
  broadcastCronoState();
  stopCronoIntervalIfIdle();
}

// =============================================================================
// IPC (main-owned handlers that directly manipulate windows or crono)
// =============================================================================

// Language manifest loader for the language selection window.
ipcMain.handle('get-available-languages', async () => {
  const manifestPath = path.join(app.getAppPath(), 'i18n', 'languages.json');

  try {
    const raw = await fs.promises.readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      log.warn('Language manifest invalid (expected array). Using fallback:', manifestPath);
      return FALLBACK_LANGUAGES;
    }

    const filtered = parsed.reduce((acc, entry) => {
      if (!entry || typeof entry !== 'object') return acc;
      const tag = typeof entry.tag === 'string' ? entry.tag.trim() : '';
      const label = typeof entry.label === 'string' ? entry.label.trim() : '';
      if (!tag || !label) return acc;
      acc.push({ tag, label });
      return acc;
    }, []);

    if (!filtered.length) {
      log.warn('Language manifest empty or invalid entries. Using fallback:', manifestPath);
      return FALLBACK_LANGUAGES;
    }

    return filtered;
  } catch (err) {
    log.error('Error loading language manifest. Using fallback:', err);
    return FALLBACK_LANGUAGES;
  }
});

// Stopwatch (crono) IPC handlers
ipcMain.handle('crono-get-state', () => {
  return getCronoState();
});

ipcMain.on('crono-toggle', () => {
  try {
    if (crono.running) stopCrono(); else startCrono();
  } catch (err) {
    log.error('Error in crono-toggle:', err);
  }
});

ipcMain.on('crono-reset', () => {
  try {
    resetCrono();
  } catch (err) {
    log.error('Error in crono-reset:', err);
  }
});

ipcMain.on('crono-set-elapsed', (_ev, ms) => {
  try {
    setCronoElapsed(ms);
  } catch (err) {
    log.error('Error in crono-set-elapsed:', err);
  }
});

// Floating window: open/close + commands from the flotante UI
ipcMain.handle('flotante-open', async () => {
  try {
    await createFlotanteWindow();

    // After opening, push current state so UI is immediately consistent.
    try {
      broadcastCronoState();
    } catch (err) {
      warnOnce('broadcastCronoState.after.flotante-open', 'broadcastCronoState failed after flotante-open (ignored):', err);
    }

    if (crono.running) ensureCronoInterval();
    return { ok: true };
  } catch (err) {
    log.error('Error processing flotante-open:', err);
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('flotante-close', () => {
  try {
    const win = flotanteWin;

    if (win && !win.isDestroyed()) {
      // IMPORTANT: do not set flotanteWin = null here.
      // The 'closed' handler is responsible for clearing the reference.
      win.close();
    }

    return { ok: true };
  } catch (err) {
    log.error('Error processing flotante-close:', err);
    return { ok: false, error: String(err) };
  }
});

ipcMain.on('flotante-command', (_ev, cmd) => {
  try {
    if (!cmd || !cmd.cmd) {
      warnOnce('flotante-command.invalid', 'flotante-command ignored: payload missing cmd (ignored).');
      return;
    }

    if (cmd.cmd === 'toggle') {
      if (crono.running) stopCrono(); else startCrono();
      return;
    }

    if (cmd.cmd === 'reset') {
      resetCrono();
      return;
    }

    if (cmd.cmd === 'set') {
      if (typeof cmd.value === 'undefined') {
        warnOnce(
          'flotante-command.set.missingValue',
          'flotante-command set ignored: payload missing value (ignored).'
        );
        return;
      }

      const n = Number(cmd.value);
      if (!Number.isFinite(n)) {
        warnOnce(
          'flotante-command.set.invalidNumber',
          'flotante-command set: invalid value; coerced to 0 (ignored).'
        );
        setCronoElapsed(0);
        return;
      }

      setCronoElapsed(n);
      return;
    }

    warnOnce(
      'flotante-command.unknown',
      'flotante-command ignored: unknown cmd (ignored):',
      String(cmd.cmd)
    );
  } catch (err) {
    log.error('Error processing flotante-command in main:', err);
  }
});

// Editor window: open (create or focus) and push current text
ipcMain.handle('open-editor', () => {
  try {
    if (!editorWin || editorWin.isDestroyed()) {
      createEditorWindow();
    } else {
      editorWin.show();

      // Re-send current text to ensure editor is in sync (best-effort).
      try {
        const initialText = textState.getCurrentText();
        editorWin.webContents.send('editor-init-text', {
          text: initialText || '',
          meta: { source: 'main', action: 'init' },
        });
      } catch (err) {
        log.error('Error sending editor-init-text from open-editor:', err);
      }

      // Notify main UI that editor is ready (it already is, but keeps state consistent).
      try {
        if (mainWin && !mainWin.isDestroyed()) {
          mainWin.webContents.send('editor-ready');
        }
      } catch (err) {
        log.warn('Unable to notify editor-ready (editor already open):', err);
      }
    }

    return { ok: true };
  } catch (err) {
    log.error('Error processing open-editor:', err);
    return { ok: false, error: String(err) };
  }
});

// Preset modal: open (with payload normalization)
ipcMain.handle('open-preset-modal', (event, payload) => {
  try {
    if (!mainWin) {
      warnOnce('open-preset-modal.noMainWin', 'open-preset-modal ignored: main window not ready (ignored).');
      return { ok: false, error: 'main window not ready' };
    }

    const senderWin = BrowserWindow.fromWebContents(event.sender);
    if (!senderWin || senderWin !== mainWin) {
      warnOnce('open-preset-modal.unauthorized', 'open-preset-modal unauthorized (ignored).');
      return { ok: false, error: 'unauthorized' };
    }

    let initialData = {};
    if (Number.isFinite(payload)) {
      initialData = { wpm: Number(payload) };
    } else if (isPlainObject(payload)) {
      if (Object.prototype.hasOwnProperty.call(payload, 'wpm')) {
        const wpmNum = Number(payload.wpm);
        if (Number.isFinite(wpmNum)) {
          initialData.wpm = wpmNum;
        }
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'mode')) {
        const mode = String(payload.mode || '').trim();
        if (mode && mode.length <= MAX_META_STR_CHARS) {
          initialData.mode = mode;
        }
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'preset')) {
        const sanitized = presetsMain.sanitizePresetInput(payload.preset);
        if (sanitized.ok) {
          initialData.preset = sanitized.preset;
        } else {
          warnOnce(
            'open-preset-modal.invalidPreset',
            'open-preset-modal: invalid preset payload (ignored).'
          );
        }
      }
    } else if (typeof payload !== 'undefined') {
      warnOnce(
        'open-preset-modal.invalidPayload',
        'open-preset-modal: invalid payload; using defaults (ignored).'
      );
    }

    createPresetWindow(initialData);
    return { ok: true };
  } catch (err) {
    log.error('Error processing open-preset-modal:', err);
    return { ok: false, error: String(err) };
  }
});

// Expose read-only configuration to renderers (so UI can enforce shared constraints)
ipcMain.handle('get-app-config', () => {
  try {
    return { ok: true, maxTextChars: MAX_TEXT_CHARS, maxIpcChars: MAX_IPC_CHARS };
  } catch (err) {
    log.error('Error processing get-app-config:', err);
    return { ok: false, error: String(err), maxTextChars: 1e7, maxIpcChars: MAX_IPC_CHARS };
  }
});

ipcMain.handle('get-app-version', () => {
  try {
    return String(app.getVersion() || '').trim();
  } catch (err) {
    log.error('Error processing get-app-version:', err);
    return '';
  }
});

ipcMain.handle('get-app-runtime-info', () => {
  try {
    return {
      platform: process.platform,
      arch: process.arch,
    };
  } catch (err) {
    log.error('Error processing get-app-runtime-info:', err);
    return { platform: '', arch: '' };
  }
});

registerLinkIpc({ ipcMain, app, shell, log });

// =============================================================================
// App lifecycle (startup, activate, quit)
// =============================================================================

app.whenReady().then(() => {
  try {
    initStorage(app);
  } catch (err) {
    log.error('Storage init failed:', err);
    throw err;
  }

  // Ensure config directory exists before any module tries to read/write JSON.
  ensureConfigDir();

  const SETTINGS_FILE = getSettingsFile();
  const CURRENT_TEXT_FILE = getCurrentTextFile();

  // Initialize shared text state early (current text file).
  // This module owns loading/saving current text and its IPC surface.
  textState.init({
    loadJson,
    saveJson,
    currentTextFile: CURRENT_TEXT_FILE,
    settingsFile: SETTINGS_FILE,
    app,
    maxTextChars: MAX_TEXT_CHARS,
  });

  // Load settings (normalized and persisted) via settingsState.
  const settings = settingsState.init({
    loadJson,
    saveJson,
    settingsFile: SETTINGS_FILE,
  });

  // IPC registration (delegated modules).
  textState.registerIpc(ipcMain, () => ({
    mainWin,
    editorWin,
  }));

  settingsState.registerIpc(ipcMain, {
    getWindows: () => ({
      mainWin,
      editorWin,
      presetWin,
      langWin,
      flotanteWin,
    }),
    buildAppMenu,
  });

  presetsMain.registerIpc(ipcMain, {
    getWindows: () => ({
      mainWin,
      editorWin,
      presetWin,
      langWin,
      flotanteWin,
    }),
  });

  updater.registerIpc(ipcMain, {
    mainWinRef: () => mainWin,
    currentLanguageRef: () => getSelectedLanguage(),
  });

  // First run: show language picker before creating the main window.
  if (!settings.language || settings.language === '') {
    createLanguageWindow();

    // The language window notifies the main process via IPC once the user picks a language.
    ipcMain.once('language-selected', () => {
      try {
        if (!mainWin) createMainWindow();
      } catch (err) {
        log.error('Error creating mainWin after selecting language:', err);
      } finally {
        // Close the language window if it is still open.
        try {
          if (langWin && !langWin.isDestroyed()) langWin.close();
        } catch (err) {
          warnOnce('langWin.close.after.language-selected', 'langWin.close failed after language-selected (ignored):', err);
        }
      }

      updater.scheduleInitialCheck();
    });
  } else {
    // Language already defined: go directly to the main window.
    createMainWindow();
    updater.scheduleInitialCheck();
  }

  // macOS behavior: recreate a window when clicking the dock icon and none are open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

// Windows/Linux behavior: quit when the last window is closed.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  // Dev-only shortcuts should be removed cleanly.
  unregisterShortcuts();

  // Stop the stopwatch interval on exit (best-effort).
  try {
    if (cronoInterval) {
      clearInterval(cronoInterval);
      cronoInterval = null;
    }
  } catch (err) {
    log.error('Error clearing stopwatch in will-quit:', err);
  }
});
// =============================================================================
// End of main.js
// =============================================================================
