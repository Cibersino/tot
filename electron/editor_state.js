// electron/editor_state.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Persist and restore editor window geometry and maximized state.
// - Reads/writes editor_state.json via fs_storage.
// - Normalizes persisted state and validates reduced bounds.
// - Attaches window event handlers to persist changes.
// - Restores reduced bounds or applies a fallback placement on unmaximize.
// - Exposes editor-window state to the renderer via explicit IPC and notifications.
// - Logs recoverable anomalies and fallbacks.

// =============================================================================
// Imports / logger
// =============================================================================

const { screen } = require('electron');
const { getEditorStateFile, loadJson, saveJson } = require('./fs_storage');
const {
  EDITOR_MAXIMIZED_TEXT_WIDTH_MIN_PX,
  EDITOR_MAXIMIZED_TEXT_WIDTH_MAX_PX,
  EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX,
} = require('./constants_main');
const Log = require('./log');

const log = Log.get('editor-state');
log.debug('Editor state starting...');

// =============================================================================
// Constants / defaults
// =============================================================================

const DEFAULT_STATE = {
  maximized: true,
  reduced: null,
  maximizedTextWidthPx: EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX,
};

// =============================================================================
// Helpers
// =============================================================================

function isLiveWindow(editorWin) {
  return !!(
    editorWin
    && typeof editorWin.isDestroyed === 'function'
    && editorWin.isDestroyed() === false
  );
}

function hasLiveWebContents(editorWin) {
  return !!(
    isLiveWindow(editorWin)
    && editorWin.webContents
    && (
      typeof editorWin.webContents.isDestroyed !== 'function'
      || editorWin.webContents.isDestroyed() === false
    )
  );
}

function isValidReduced(reduced) {
  if (!reduced || typeof reduced !== 'object') return false;
  const { width, height, x, y } = reduced;
  return (
    typeof width === 'number' &&
    typeof height === 'number' &&
    typeof x === 'number' &&
    typeof y === 'number' &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    Number.isFinite(x) &&
    Number.isFinite(y)
  );
}

function normalizeMaximizedTextWidthPx(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX;
  const rounded = Math.round(parsed);
  return Math.min(
    EDITOR_MAXIMIZED_TEXT_WIDTH_MAX_PX,
    Math.max(EDITOR_MAXIMIZED_TEXT_WIDTH_MIN_PX, rounded)
  );
}

function normalizeState(raw) {
  const base = { ...DEFAULT_STATE };
  if (!raw || typeof raw !== 'object') {
    log.warnOnce(
      'editor-state.normalize.invalid-root',
      'normalizeState: invalid state; using defaults (ignored).',
      raw
    );
    return { ...base };
  }

  const st = { ...base };

  if (typeof raw.maximized === 'boolean') {
    st.maximized = raw.maximized;
  } else if ('maximized' in raw) {
    log.warnOnce(
      'editor-state.normalize.invalid-maximized',
      'normalizeState: invalid maximized; using default (ignored).',
      raw.maximized
    );
  }

  if (raw.reduced && isValidReduced(raw.reduced)) {
    st.reduced = {
      width: raw.reduced.width,
      height: raw.reduced.height,
      x: raw.reduced.x,
      y: raw.reduced.y
    };
  } else {
    if ('reduced' in raw && raw.reduced !== null) {
      log.warnOnce(
        'editor-state.normalize.invalid-reduced',
        'normalizeState: invalid reduced bounds; ignoring.',
        raw.reduced
      );
    }
    st.reduced = null;
  }

  if (typeof raw.maximizedTextWidthPx === 'undefined') {
    st.maximizedTextWidthPx = EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX;
  } else {
    const nextMaximizedTextWidthPx = normalizeMaximizedTextWidthPx(raw.maximizedTextWidthPx);
    if (!Number.isFinite(Number(raw.maximizedTextWidthPx))) {
      log.warnOnce(
        'editor-state.normalize.invalid-maximized-text-width',
        'normalizeState: invalid maximizedTextWidthPx; using default (ignored).',
        raw.maximizedTextWidthPx
      );
    } else if (nextMaximizedTextWidthPx !== Math.round(Number(raw.maximizedTextWidthPx))) {
      log.warnOnce(
        'editor-state.normalize.out-of-range-maximized-text-width',
        'normalizeState: out-of-range maximizedTextWidthPx; clamping.',
        {
          value: raw.maximizedTextWidthPx,
          min: EDITOR_MAXIMIZED_TEXT_WIDTH_MIN_PX,
          max: EDITOR_MAXIMIZED_TEXT_WIDTH_MAX_PX,
        }
      );
    }
    st.maximizedTextWidthPx = nextMaximizedTextWidthPx;
  }

  return st;
}

function getWindowState(editorWin) {
  const persistedState = loadInitialState();
  if (!isLiveWindow(editorWin) || typeof editorWin.isMaximized !== 'function') {
    return {
      maximized: false,
      maximizedTextWidthPx: persistedState.maximizedTextWidthPx,
    };
  }

  return {
    maximized: !!editorWin.isMaximized(),
    maximizedTextWidthPx: persistedState.maximizedTextWidthPx,
  };
}

function notifyWindowState(editorWin, logContext = 'editorState.notifyWindowState') {
  if (!hasLiveWebContents(editorWin)) {
    log.warn('editor-window-state skipped (ignored): editor window unavailable.', logContext);
    return false;
  }

  try {
    editorWin.webContents.send('editor-window-state-changed', getWindowState(editorWin));
    return true;
  } catch (err) {
    log.warn(`Unable to notify editor-window-state from ${logContext}:`, err);
    return false;
  }
}

// =============================================================================
// API (public entrypoints)
// =============================================================================

function loadInitialState(customLoadJson) {
  const loader = typeof customLoadJson === 'function' ? customLoadJson : loadJson;
  try {
    const filePath = getEditorStateFile();
    const raw = loader(filePath, DEFAULT_STATE);
    return normalizeState(raw);
  } catch (err) {
    log.error('[editor_state] Error reading initial state:', err);
    return { ...DEFAULT_STATE };
  }
}

function attachTo(editorWin, customLoadJson, customSaveJson) {
  if (!editorWin) return;

  const loader = typeof customLoadJson === 'function' ? customLoadJson : loadJson;
  const saver = typeof customSaveJson === 'function' ? customSaveJson : saveJson;
  let editorStateFile = null;

  try {
    editorStateFile = getEditorStateFile();
  } catch (err) {
    log.error('[editor_state] getEditorStateFile failed:', err);
    return;
  }

  // Save reduced bounds only when the window is not maximized.
  const saveReducedState = () => {
    try {
      if (!editorWin || editorWin.isDestroyed()) return;
      if (editorWin.isMaximized()) return;

      const bounds = editorWin.getBounds();
      const current = loader(editorStateFile, { maximized: false, reduced: null });
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

      saver(editorStateFile, state);
    } catch (err) {
      log.error('[editor_state] Error saving editor reduced state:', err);
    }
  };

  editorWin.on('resize', saveReducedState);
  editorWin.on('move', saveReducedState);

  // On maximize, persist the maximized flag only.
  editorWin.on('maximize', () => {
    try {
      const current = loader(editorStateFile, { maximized: true, reduced: null });
      const state = normalizeState(current);
      state.maximized = true;
      saver(editorStateFile, state);
      notifyWindowState(editorWin, 'editorWin.maximize');
    } catch (err) {
      log.error('[editor_state] Error updating state in maximize:', err);
    }
  });

  // On unmaximize, restore reduced bounds or apply a fallback placement.
  editorWin.on('unmaximize', () => {
    try {
      const current = loader(editorStateFile, { maximized: false, reduced: null });
      const state = normalizeState(current);
      state.maximized = false;

      if (state.reduced && isValidReduced(state.reduced)) {
        editorWin.setBounds({
          width: state.reduced.width,
          height: state.reduced.height,
          x: state.reduced.x,
          y: state.reduced.y
        });
      } else {
        log.warnOnce(
          'editor-state.unmaximize.fallback-reduced',
          'unmaximize: reduced bounds missing; using fallback placement (ignored).',
          'note: may be normal until the editor window is first resized/moved while not maximized.'
        );
        // Fallback: place at upper-right half of the current monitor work area.
        const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
        const workArea = (display && display.workArea)
          ? display.workArea
          : { x: 0, y: 0, width: 1200, height: 800 };
        if (!display || !display.workArea) {
          log.warnOnce(
            'editor-state.unmaximize.fallback-workarea',
            'unmaximize: display workArea unavailable; using hardcoded bounds (ignored).'
          );
        }

        const width = Math.round(workArea.width / 2);
        const height = Math.round(workArea.height / 2);
        const x = workArea.x + workArea.width - width - 20;
        const y = workArea.y + 20;

        const reduced = { width, height, x, y };
        editorWin.setBounds(reduced);
        state.reduced = reduced;
      }

      saver(editorStateFile, state);
      notifyWindowState(editorWin, 'editorWin.unmaximize');
    } catch (err) {
      log.error('[editor_state] Error handling editor unmaximize:', err);
    }
  });

  // On close, persist maximized flag and keep last reduced bounds.
  editorWin.on('close', () => {
    try {
      const current = loader(editorStateFile, { maximized: false, reduced: null });
      const state = normalizeState(current);
      state.maximized = editorWin.isMaximized();
      saver(editorStateFile, state);
    } catch (err) {
      log.error('[editor_state] Error saving editor closed state:', err);
    }
  });
}

function registerIpc(ipcMain, { getEditorWindow } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[editor_state] registerIpc requires ipcMain');
  }

  ipcMain.handle('get-editor-window-state', async (event) => {
    try {
      if (typeof getEditorWindow !== 'function') {
        log.warnOnce(
          'editor-state.getEditorWindow.unavailable',
          'getEditorWindow unavailable; editor window-state IPC skipped.'
        );
        return {
          ok: false,
          error: 'unavailable',
          maximized: false,
          maximizedTextWidthPx: EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX,
        };
      }

      const editorWin = getEditorWindow();
      if (!hasLiveWebContents(editorWin)) {
        return {
          ok: false,
          error: 'editor-window-unavailable',
          maximized: false,
          maximizedTextWidthPx: EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX,
        };
      }

      if (!event || event.sender !== editorWin.webContents) {
        log.warn('get-editor-window-state unauthorized (ignored).');
        return {
          ok: false,
          error: 'unauthorized',
          maximized: false,
          maximizedTextWidthPx: EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX,
        };
      }

      return { ok: true, ...getWindowState(editorWin) };
    } catch (err) {
      log.error('Error processing get-editor-window-state:', err);
      return {
        ok: false,
        error: String(err),
        maximized: false,
        maximizedTextWidthPx: EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX,
      };
    }
  });

  ipcMain.handle('set-editor-maximized-text-width-px', async (event, textWidthPx) => {
    try {
      if (typeof getEditorWindow !== 'function') {
        log.warnOnce(
          'editor-state.set-maximized-text-width.getEditorWindow.unavailable',
          'getEditorWindow unavailable; maximized text width IPC skipped.'
        );
        return { ok: false, error: 'unavailable' };
      }

      const editorWin = getEditorWindow();
      if (!hasLiveWebContents(editorWin)) {
        return { ok: false, error: 'editor-window-unavailable' };
      }

      if (!event || event.sender !== editorWin.webContents) {
        log.warn('set-editor-maximized-text-width-px unauthorized (ignored).');
        return { ok: false, error: 'unauthorized' };
      }

      const parsed = Number(textWidthPx);
      if (!Number.isFinite(parsed)) {
        log.warnOnce(
          'editor-state.set-maximized-text-width.invalid',
          'set-editor-maximized-text-width-px called with non-finite value (ignored).',
          { value: textWidthPx }
        );
        return { ok: false, error: 'invalid' };
      }

      const editorStateFile = getEditorStateFile();
      const state = normalizeState(loadJson(editorStateFile, DEFAULT_STATE));
      const nextMaximizedTextWidthPx = normalizeMaximizedTextWidthPx(parsed);

      if (state.maximizedTextWidthPx === nextMaximizedTextWidthPx) {
        return { ok: true, maximizedTextWidthPx: nextMaximizedTextWidthPx };
      }

      state.maximizedTextWidthPx = nextMaximizedTextWidthPx;
      saveJson(editorStateFile, state);
      notifyWindowState(editorWin, 'editorState.setMaximizedTextWidthPx');

      return { ok: true, maximizedTextWidthPx: state.maximizedTextWidthPx };
    } catch (err) {
      log.error('Error processing set-editor-maximized-text-width-px:', err);
      return { ok: false, error: String(err) };
    }
  });
}

// =============================================================================
// Exports / module surface
// =============================================================================

module.exports = {
  loadInitialState,
  attachTo,
  getWindowState,
  notifyWindowState,
  registerIpc,
};

// =============================================================================
// End of electron/editor_state.js
// =============================================================================
