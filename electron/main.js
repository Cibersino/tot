// electron/main.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main process entrypoint for the application.
// Responsibilities:
// - Create and coordinate application windows (main, editor, preset modal, language picker, floating stopwatch).
// - Initialize shared state backed by JSON files (settings + current text) via dedicated modules.
// - Register IPC endpoints used by renderer windows.
// - Keep the stopwatch state consistent across windows (specially the floating window) while the app is running.

// =============================================================================
// Imports (external + internal modules)
// =============================================================================

const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require('electron');
const path = require('path');
const Log = require('./log');

const {
  CONFIG_DIR,
  ensureConfigDir,
  loadJson,
  saveJson,
} = require('./fs_storage');

const settingsState = require('./settings');
const textState = require('./text_state');
const editorState = require('./editor_state');
const menuBuilder = require('./menu_builder');
const presetsMain = require('./presets_main');
const updater = require('./updater');

const log = Log.get('main');

// =============================================================================
// File locations (persistent user data)
// =============================================================================

const SETTINGS_FILE = path.join(CONFIG_DIR, 'user_settings.json');
const CURRENT_TEXT_FILE = path.join(CONFIG_DIR, 'current_text.json');

// Language selection modal (first launch) assets
const LANGUAGE_WINDOW_HTML = path.join(__dirname, '../public/language_window.html');
const LANGUAGE_PRELOAD = path.join(__dirname, 'language_preload.js');

// Ensure config directory exists before any module tries to read/write JSON.
ensureConfigDir();

// Convenience wrapper: warnOnce is used to avoid log spam in expected, repeated “ignored” failures.
const warnOnce = (...args) => log.warnOnce(...args);

// Canonical source of the text limit.
// Keep fallbacks synchronized in text_state.js and constants.js (renderer side).
const MAX_TEXT_CHARS = 10000000;

// Initialize shared text state early (current_text.json).
// This module owns loading/saving current text and its IPC surface.
textState.init({
  loadJson,
  saveJson,
  currentTextFile: CURRENT_TEXT_FILE,
  settingsFile: SETTINGS_FILE,
  app,
  maxTextChars: MAX_TEXT_CHARS,
});

// =============================================================================
// Global window references (singletons)
// =============================================================================
// We keep references so we can:
// - focus existing windows instead of creating duplicates,
// - send IPC messages to them,
// - close dependent windows when quitting.

let mainWin = null;     // Main window (index.html)
let editorWin = null;   // Editor window (editor.html) — user edits current text
let presetWin = null;   // Preset modal (preset_modal.html) — create/edit preset
let langWin = null;     // Language selection window (first launch)
let flotanteWin = null; // Floating stopwatch window (flotante.html)

let currentLanguage = 'es';

// =============================================================================
// Menu + development utilities
// =============================================================================

/**
 * Rebuild the application menu using i18n translations.
 * The actual menu definition lives in menu_builder.js; this is just the orchestration.
 */
function buildAppMenu(lang) {
  const effectiveLang = lang || currentLanguage || 'es';
  menuBuilder.buildAppMenu(effectiveLang, {
    mainWindow: mainWin,
    onOpenLanguage: () => createLanguageWindow(),
  });
}

/**
 * Developer-only global shortcuts (disabled in packaged builds).
 * These are quality-of-life actions during development and testing.
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
 * Create the main application window.
 * This is the first “real” window after language selection (if needed).
 */
function createMainWindow() {
  // NOTE: useContentSize:true => width/height apply to content area (exclude window borders).
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
      sandbox: false,
    },
  });

  mainWin.loadFile(path.join(__dirname, '../public/index.html'));

  // Build top menu using translations.
  buildAppMenu(currentLanguage);

  // Dev-only shortcuts for inspection/reload.
  registerDevShortcuts(mainWin);

  // When the main window starts closing, request dependent windows to close too.
  // We do not block closing; we just try to clean up related windows.
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

  // When the main window is gone, exit the application (Windows/Linux behavior).
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
 * Create the editor window (text editing).
 * The editor uses editor_state.js to remember size/position/maximized state.
 */
function createEditorWindow() {
  // Load initial window state (size/position/maximized) from editor_state.js.
  const state = editorState.loadInitialState(loadJson);

  // Determine whether we have a valid saved “reduced” (non-maximized) state.
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
    show: false, // show only after ready-to-show to avoid flicker
    webPreferences: {
      preload: path.join(__dirname, 'editor_preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // The editor window uses custom in-page controls; hide the native menu bar.
  editorWin.setMenu(null);
  editorWin.setMenuBarVisibility(false);

  editorWin.loadFile(path.join(__dirname, '../public/editor.html'));

  // When the window is ready, apply maximized state (if needed), show it, and send initial data.
  editorWin.once('ready-to-show', () => {
    try {
      // If it was last closed maximized, reopen maximized.
      if (state && state.maximized === true) {
        editorWin.maximize();
      }

      editorWin.show();

      // Send initial current text to the editor.
      // The renderer will render it and allow editing.
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

  // Delegate persistent window-state management (maximized/reduced, persistence) to editor_state.js.
  editorState.attachTo(editorWin, loadJson, saveJson);

  // Drop reference on close to allow garbage collection and re-create later.
  editorWin.on('closed', () => {
    editorWin = null;
  });
}

/**
 * Create the preset modal window (create/edit WPM presets).
 * If the modal is already open, we focus it and push the latest init payload.
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
    parent: mainWin, // Modal blocks the parent window while open
    modal: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preset_preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
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
 * This window is NOT modal relative to mainWin because it may be opened before mainWin exists.
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
      sandbox: false,
    },
  });

  langWin.setMenu(null);
  langWin.loadFile(LANGUAGE_WINDOW_HTML);

  langWin.once('ready-to-show', () => {
    langWin.show();
  });

  // If the user closes the language window without choosing, apply a safe fallback.
  langWin.on('closed', () => {
    try {
      settingsState.applyFallbackLanguageIfUnset('es');
    } catch (err) {
      log.error('Error applying fallback language:', err);
    } finally {
      langWin = null;

      // Ensure the app can proceed even if the user dismissed the modal.
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
// main.js owns the windows; feature modules own their IPC contract and internal logic.

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
  setCurrentLanguage: (lang) => {
    const trimmed =
      lang && typeof lang === 'string' && lang.trim()
        ? lang.trim()
        : 'es';
    currentLanguage = trimmed;
  },
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
  currentLanguageRef: () => currentLanguage,
});

// =============================================================================
// Floating window (Picture-in-Picture stopwatch) — window placement safety
// =============================================================================

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
 * Pick the display that “owns” the window center.
 * This is used when snapping the floating window inside the visible work area.
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
 * Work-area guard (cross-platform):
 * - Windows: uses will-move + moved (end-of-move event).
 * - macOS/Linux: uses a short “stability timer” after move events.
 *
 * Goal:
 * - Keep the floating window fully visible (not hidden behind taskbar/dock or off-screen).
 */
function installWorkAreaGuard(win, opts = {}) {
  // Snap immediately on creation.
  snapWindowFullyIntoWorkArea(win);

  let snapping = false;
  let userMoveArmed = false;

  // will-move: only when the user drags by hand (Windows/macOS).
  win.on('will-move', () => {
    if (!snapping) userMoveArmed = true;
  });

  if (process.platform === 'win32') {
    // moved: emitted once at the end of the movement in Windows.
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
    win.on('closed', () => {});
    return;
  }

  // macOS + Linux: approximate “end-of-move” via a short timer after the last move event.
  const endMoveMs = typeof opts.endMoveMs === 'number' ? opts.endMoveMs : 80;

  let lastMoveAt = 0;
  let timer = null;

  function clearTimer() {
    if (timer) clearTimeout(timer);
    timer = null;
  }

  win.on('move', () => {
    if (snapping || win.isDestroyed()) return;

    // Linux: treat any move as user-driven (docs differ by platform).
    if (process.platform === 'linux') userMoveArmed = true;

    if (!userMoveArmed) return;

    lastMoveAt = Date.now();
    clearTimer();
    timer = setTimeout(() => {
      // If new move events happened recently, wait a bit longer.
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
 * Create (or restore) the floating stopwatch window.
 * - If already open, we reuse it (avoid duplicates).
 * - We compute a default position near bottom-right of the work area.
 */
async function createFlotanteWindow(options = {}) {
  // If it already exists and wasn't destroyed, restore it (don't recreate it).
  if (flotanteWin && !flotanteWin.isDestroyed()) {
    // Optional: apply forced position if requested.
    if (options && (typeof options.x === 'number' || typeof options.y === 'number')) {
      try {
        flotanteWin.setBounds({
          x: options.x || flotanteWin.getBounds().x,
          y: options.y || flotanteWin.getBounds().y,
        });
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
      sandbox: false,
    },
  };

  // Margins so the window is not flush against edges / scrollbars (px).
  const DEFAULT_MARGIN_RIGHT = 30;
  const DEFAULT_MARGIN_BOTTOM = 20;

  // Default position is bottom-right inside the primary display work area.
  let pos = {};
  try {
    const display = screen.getPrimaryDisplay();
    const wa = display && display.workArea ? display.workArea : null;

    if (wa) {
      const marginRight = typeof options.marginRight === 'number' ? options.marginRight : DEFAULT_MARGIN_RIGHT;
      const marginBottom = typeof options.marginBottom === 'number' ? options.marginBottom : DEFAULT_MARGIN_BOTTOM;

      pos.x = wa.x + wa.width - bwOpts.width - marginRight;
      pos.y = wa.y + wa.height - bwOpts.height - marginBottom;
    }
  } catch (err) {
    log.warn('Position could not be calculated from screen.getPrimaryDisplay(); using the default FW position.', err);
  }

  // Allow explicit overrides.
  if (typeof options.x === 'number') pos.x = options.x;
  if (typeof options.y === 'number') pos.y = options.y;

  // Merge default options with computed position and any caller overrides.
  const createOpts = Object.assign({}, bwOpts, pos, options);

  flotanteWin = new BrowserWindow(createOpts);
  const win = flotanteWin;

  installWorkAreaGuard(win, { endMoveMs: 80 });

  // Track if the window is closing to avoid noisy “load failed” logs during stress open/close.
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

  // Load the HTML content. If the user closes quickly, loadFile may reject; treat as expected in stress tests.
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
// Why main process?
// - To conserve the functionality of floating window even when main UI is not visible.

let crono = {
  running: false,
  elapsed: 0, // accumulated milliseconds while paused/stopped
  startTs: null, // timestamp when started (for running delta)
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
 * Broadcast the current stopwatch state to floating window.
 * These sends are best-effort: floating window might not exist or might be closing.
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

  try {
    if (editorWin && !editorWin.isDestroyed()) editorWin.webContents.send('crono-state', state);
  } catch (err) {
    warnOnce('send.crono-state.editorWin', 'send crono-state to editorWin failed (ignored):', err);
  }
}

function ensureCronoInterval() {
  if (cronoInterval) return;

  cronoInterval = setInterval(() => {
    broadcastCronoState();

    // Optimization: stop the interval if nothing is running and no floating window exist.
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

/**
 * Set elapsed time from UI (only when paused/stopped).
 * Value is rounded down to the nearest second.
 */
function setCronoElapsed(ms) {
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

// =============================================================================
// IPC (main-owned handlers that directly manipulate windows or crono)
// =============================================================================

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

// Floating window: open/close + commands from the floating UI
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

ipcMain.handle('flotante-close', async () => {
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
    if (!cmd || !cmd.cmd) return;

    if (cmd.cmd === 'toggle') {
      if (crono.running) stopCrono(); else startCrono();
    } else if (cmd.cmd === 'reset') {
      resetCrono();
    } else if (cmd.cmd === 'set' && typeof cmd.value !== 'undefined') {
      setCronoElapsed(Number(cmd.value) || 0);
    }
    // No need to call broadcastCronoState() here: the above functions already do it.
  } catch (err) {
    log.error('Error processing flotante-command in main:', err);
  }
});

// Editor window: open (create or focus) and push current text
ipcMain.handle('open-editor', () => {
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
});

// Preset modal: open (with payload normalization)
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

// Expose read-only configuration to renderers (so UI can enforce shared constraints)
ipcMain.handle('get-app-config', async () => {
  try {
    return { ok: true, maxTextChars: MAX_TEXT_CHARS };
  } catch (err) {
    log.error('Error processing get-app-config:', err);
    return { ok: false, error: String(err), maxTextChars: 1e7 };
  }
});

// =============================================================================
// App lifecycle (startup, activate, quit)
// =============================================================================

app.whenReady().then(() => {
  // Load settings (normalized and persisted) via settingsState.
  const settings = settingsState.init({
    loadJson,
    saveJson,
    settingsFile: SETTINGS_FILE,
  });

  currentLanguage = settings.language || 'es';

  // First run: show language picker before creating the main window.
  if (!settings.language || settings.language === '') {
    createLanguageWindow();

    // Renderer emits 'language-selected' once the user picks a language.
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