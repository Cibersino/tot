// electron/editor_state.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Persist and restore Text Editor geometry and editor-specific presentation preferences.
// - Reads/writes editor_state.json through the owner-selected fs_storage paths.
// - Normalizes persisted state, reduced bounds, and local preferences.
// - Attaches window event handlers to persist changes.
// - Restores reduced bounds or applies a fallback placement on unmaximize.
// - Exposes editor state to the renderer via explicit IPC and notifications.
// - Logs recoverable anomalies and fallbacks.

// =============================================================================
// Imports / logger
// =============================================================================

const { screen } = require('electron');
const {
  getEditorStateFile,
  loadJson,
  saveJsonDirectStrict,
} = require('./fs_storage');
const {
  EDITOR_FONT_SIZE_DEFAULT_PX,
  EDITOR_FONT_SIZE_MAX_PX,
  EDITOR_FONT_SIZE_MIN_PX,
  EDITOR_FONT_SIZE_STEP_PX,
  EDITOR_MAXIMIZED_TEXT_WIDTH_MIN_PX,
  EDITOR_MAXIMIZED_TEXT_WIDTH_MAX_PX,
  EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX,
} = require('./constants_main');
const Log = require('./log');

const log = Log.get('editor-state');

// =============================================================================
// Constants / defaults
// =============================================================================

const DEFAULT_STATE = {
  maximized: true,
  reduced: null,
  spellcheckEnabled: true,
  editorFontSizePx: EDITOR_FONT_SIZE_DEFAULT_PX,
  maximizedTextWidthPx: EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX,
};

let activeState = null;
let editorStateFile = null;

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

function normalizeEditorFontSizePx(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return EDITOR_FONT_SIZE_DEFAULT_PX;
  const rounded = Math.round(parsed);
  return Math.min(
    EDITOR_FONT_SIZE_MAX_PX,
    Math.max(EDITOR_FONT_SIZE_MIN_PX, rounded)
  );
}

function normalizeState(raw) {
  const base = copyState(DEFAULT_STATE);
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

  if (typeof raw.spellcheckEnabled === 'undefined') {
    st.spellcheckEnabled = true;
  } else if (typeof raw.spellcheckEnabled !== 'boolean') {
    log.warnOnce(
      'editor-state.normalize.invalid-spellcheck-enabled',
      'normalizeState: invalid spellcheckEnabled; using default (ignored).',
      { type: typeof raw.spellcheckEnabled }
    );
    st.spellcheckEnabled = true;
  } else {
    st.spellcheckEnabled = raw.spellcheckEnabled;
  }

  if (typeof raw.editorFontSizePx === 'undefined') {
    st.editorFontSizePx = EDITOR_FONT_SIZE_DEFAULT_PX;
  } else {
    const nextEditorFontSizePx = normalizeEditorFontSizePx(raw.editorFontSizePx);
    if (!Number.isFinite(Number(raw.editorFontSizePx))) {
      log.warnOnce(
        'editor-state.normalize.invalid-editor-font-size',
        'normalizeState: invalid editorFontSizePx; using default (ignored).',
        { value: raw.editorFontSizePx }
      );
    } else if (nextEditorFontSizePx !== Math.round(Number(raw.editorFontSizePx))) {
      log.warnOnce(
        'editor-state.normalize.out-of-range-editor-font-size',
        'normalizeState: out-of-range editorFontSizePx; clamping.',
        {
          value: raw.editorFontSizePx,
          min: EDITOR_FONT_SIZE_MIN_PX,
          max: EDITOR_FONT_SIZE_MAX_PX,
        }
      );
    }
    st.editorFontSizePx = nextEditorFontSizePx;
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

function copyState(state) {
  return {
    maximized: state.maximized,
    reduced: state.reduced ? { ...state.reduced } : null,
    spellcheckEnabled: state.spellcheckEnabled,
    editorFontSizePx: state.editorFontSizePx,
    maximizedTextWidthPx: state.maximizedTextWidthPx,
  };
}

function getEditorStateFilePath() {
  if (editorStateFile) return editorStateFile;
  editorStateFile = getEditorStateFile();
  return editorStateFile;
}

function requireActiveState() {
  if (activeState) return activeState;
  loadInitialState();
  return activeState;
}

function persistActiveState(context) {
  try {
    saveJsonDirectStrict(getEditorStateFilePath(), copyState(requireActiveState()));
    return true;
  } catch (error) {
    log.warn(`Text Editor presentation state persistence failed from ${context} (ignored):`, error);
    return false;
  }
}

function getEditorState(editorWin) {
  const state = requireActiveState();
  if (!isLiveWindow(editorWin) || typeof editorWin.isMaximized !== 'function') {
    return {
      maximized: false,
      spellcheckEnabled: state.spellcheckEnabled,
      editorFontSizePx: state.editorFontSizePx,
      maximizedTextWidthPx: state.maximizedTextWidthPx,
    };
  }

  return {
    maximized: !!editorWin.isMaximized(),
    spellcheckEnabled: state.spellcheckEnabled,
    editorFontSizePx: state.editorFontSizePx,
    maximizedTextWidthPx: state.maximizedTextWidthPx,
  };
}

function notifyEditorState(editorWin, logContext = 'editorState.notifyEditorState') {
  if (!hasLiveWebContents(editorWin)) {
    log.warn('editor-state notification failed (ignored): Text Editor window unavailable.', logContext);
    return false;
  }

  try {
    editorWin.webContents.send('editor-state-changed', getEditorState(editorWin));
    return true;
  } catch (error) {
    log.warn(`editor-state notification failed (ignored) from ${logContext}:`, error);
    return false;
  }
}

function notifyEditorFontSizePersistenceFailure(
  editorWin,
  logContext = 'editorState.notifyEditorFontSizePersistenceFailure'
) {
  if (!hasLiveWebContents(editorWin)) {
    log.warn('Text Editor font-size failure notification skipped: Text Editor window unavailable.', logContext);
    return false;
  }

  try {
    editorWin.webContents.send('editor-font-size-persistence-failed');
    return true;
  } catch (error) {
    log.warn(`Text Editor font-size failure notification failed (ignored) from ${logContext}:`, error);
    return false;
  }
}

function setEditorSpellcheckEnabled(enabled, { editorWin = null } = {}) {
  if (typeof enabled !== 'boolean') {
    log.warnOnce(
      'editor-state.set-spellcheck-enabled.invalid',
      'set-editor-spellcheck-enabled called with non-boolean value (ignored).',
      { type: typeof enabled }
    );
    return { ok: false, error: 'invalid' };
  }

  try {
    const state = requireActiveState();
    if (state.spellcheckEnabled === enabled) {
      return { ok: true, enabled: state.spellcheckEnabled };
    }

    const candidate = copyState(state);
    candidate.spellcheckEnabled = enabled;
    saveJsonDirectStrict(getEditorStateFilePath(), candidate);
    activeState = candidate;
    if (state.spellcheckEnabled !== candidate.spellcheckEnabled) {
      notifyEditorState(editorWin, 'editorState.setSpellcheckEnabled');
    }
    return { ok: true, enabled: candidate.spellcheckEnabled };
  } catch (error) {
    log.error('Error saving Text Editor spellcheck preference:', error);
    return { ok: false, error: String(error) };
  }
}

function setEditorFontSizePx(fontSizePx, { editorWin = null } = {}) {
  const parsed = Number(fontSizePx);
  if (!Number.isFinite(parsed)) {
    log.warnOnce(
      'editor-state.set-editor-font-size.invalid',
      'set-editor-font-size-px called with non-finite value (ignored).',
      { value: fontSizePx }
    );
    return { ok: false, error: 'invalid' };
  }

  try {
    const nextEditorFontSizePx = normalizeEditorFontSizePx(parsed);
    const state = requireActiveState();
    if (state.editorFontSizePx === nextEditorFontSizePx) {
      return { ok: true, editorFontSizePx: state.editorFontSizePx };
    }

    const candidate = copyState(state);
    candidate.editorFontSizePx = nextEditorFontSizePx;
    saveJsonDirectStrict(getEditorStateFilePath(), candidate);
    activeState = candidate;
    if (state.editorFontSizePx !== candidate.editorFontSizePx) {
      notifyEditorState(editorWin, 'editorState.setEditorFontSizePx');
    }
    return { ok: true, editorFontSizePx: candidate.editorFontSizePx };
  } catch (error) {
    log.error('Error saving Text Editor font-size preference:', error);
    return { ok: false, error: String(error) };
  }
}

function getTextSizeShortcutActions({ getEditorWindow } = {}) {
  if (typeof getEditorWindow !== 'function') {
    throw new Error('[editor_state] getTextSizeShortcutActions requires getEditorWindow');
  }

  function adjustEditorFontSizePx(stepDeltaPx) {
    const editorWin = getEditorWindow();
    const state = requireActiveState();
    const result = setEditorFontSizePx(state.editorFontSizePx + stepDeltaPx, { editorWin });
    if (!result.ok) {
      notifyEditorFontSizePersistenceFailure(editorWin, 'editorState.adjustEditorFontSizePx');
    }
    return result;
  }

  return {
    onIncreaseTextSize: () => adjustEditorFontSizePx(EDITOR_FONT_SIZE_STEP_PX),
    onDecreaseTextSize: () => adjustEditorFontSizePx(-EDITOR_FONT_SIZE_STEP_PX),
    onResetTextSize: () => {
      const editorWin = getEditorWindow();
      const result = setEditorFontSizePx(EDITOR_FONT_SIZE_DEFAULT_PX, { editorWin });
      if (!result.ok) {
        notifyEditorFontSizePersistenceFailure(editorWin, 'editorState.resetEditorFontSizePx');
      }
      return result;
    },
  };
}

// =============================================================================
// API (public entrypoints)
// =============================================================================

function loadInitialState(customLoadJson) {
  if (activeState) return copyState(activeState);

  const loader = typeof customLoadJson === 'function' ? customLoadJson : loadJson;
  try {
    const raw = loader(getEditorStateFilePath(), DEFAULT_STATE);
    activeState = normalizeState(raw);
  } catch (error) {
    log.error('[editor_state] Error reading initial state:', error);
    activeState = copyState(DEFAULT_STATE);
  }
  return copyState(activeState);
}

function attachTo(editorWin) {
  if (!editorWin) return;

  requireActiveState();

  // Save reduced bounds only when the window is not maximized.
  const saveReducedState = () => {
    try {
      if (!editorWin || editorWin.isDestroyed()) return;
      if (editorWin.isMaximized()) return;

      const state = requireActiveState();
      // Before the first unmaximize, maximized defaults without reduced bounds represent an intentional presentation state, not a normal window geometry.
      if (!state.reduced && state.maximized === true) return;

      const bounds = editorWin.getBounds();
      state.maximized = false;
      state.reduced = {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y
      };
      persistActiveState('editorWin.reducedState');
    } catch (error) {
      log.error('[editor_state] Error saving Text Editor reduced state:', error);
    }
  };

  editorWin.on('resize', saveReducedState);
  editorWin.on('move', saveReducedState);

  // On maximize, persist the maximized flag only.
  editorWin.on('maximize', () => {
    try {
      const state = requireActiveState();
      state.maximized = true;
      persistActiveState('editorWin.maximize');
      notifyEditorState(editorWin, 'editorWin.maximize');
    } catch (error) {
      log.error('[editor_state] Error updating state in maximize:', error);
    }
  });

  // On unmaximize, restore reduced bounds or apply a fallback placement.
  editorWin.on('unmaximize', () => {
    try {
      const state = requireActiveState();
      state.maximized = false;
      let reduced;

      if (state.reduced && isValidReduced(state.reduced)) {
        reduced = { ...state.reduced };
      } else {
        log.warn(
          'editor-state.unmaximize.fallback-reduced',
          'unmaximize: reduced bounds missing; using fallback placement (ignored). (NOTE: may be normal; reduced bounds are first persisted when the Text Editor is resized or moved while not maximized)'
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

        reduced = { width, height, x, y };
      }

      // setBounds() may synchronously emit move/resize.
      state.reduced = { ...reduced };
      editorWin.setBounds(reduced);
      persistActiveState('editorWin.unmaximize');
      notifyEditorState(editorWin, 'editorWin.unmaximize');
    } catch (error) {
      log.error('[editor_state] Error handling Text Editor unmaximize:', error);
    }
  });

  // On close, persist maximized flag and keep last reduced bounds.
  editorWin.on('close', () => {
    try {
      if (!isLiveWindow(editorWin)) return;
      const state = requireActiveState();
      state.maximized = !!editorWin.isMaximized();
      if (!state.maximized) {
        const bounds = editorWin.getBounds();
        state.reduced = {
          width: bounds.width,
          height: bounds.height,
          x: bounds.x,
          y: bounds.y,
        };
      }
      persistActiveState('editorWin.close');
    } catch (error) {
      log.error('[editor_state] Error saving Text Editor closed state:', error);
    }
  });
}

function registerIpc(ipcMain, { getEditorWindow } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[editor_state] registerIpc requires ipcMain');
  }

  ipcMain.handle('get-editor-state', async (event) => {
    try {
      if (typeof getEditorWindow !== 'function') {
        log.warnOnce(
          'editor-state.get-editor-state.getEditorWindow.unavailable',
          'getEditorWindow unavailable; Text Editor state IPC skipped.'
        );
        return {
          ok: false,
          error: 'unavailable',
          maximized: false,
          spellcheckEnabled: true,
          editorFontSizePx: EDITOR_FONT_SIZE_DEFAULT_PX,
          maximizedTextWidthPx: EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX,
        };
      }

      const editorWin = getEditorWindow();
      if (!hasLiveWebContents(editorWin)) {
        return {
          ok: false,
          error: 'editor-window-unavailable',
          maximized: false,
          spellcheckEnabled: true,
          editorFontSizePx: EDITOR_FONT_SIZE_DEFAULT_PX,
          maximizedTextWidthPx: EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX,
        };
      }

      if (!event || event.sender !== editorWin.webContents) {
        log.warn('get-editor-state unauthorized (ignored).');
        return {
          ok: false,
          error: 'unauthorized',
          maximized: false,
          spellcheckEnabled: true,
          editorFontSizePx: EDITOR_FONT_SIZE_DEFAULT_PX,
          maximizedTextWidthPx: EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX,
        };
      }

      return { ok: true, ...getEditorState(editorWin) };
    } catch (error) {
      log.error('Error processing get-editor-state:', error);
      return {
        ok: false,
        error: String(error),
        maximized: false,
        spellcheckEnabled: true,
        editorFontSizePx: EDITOR_FONT_SIZE_DEFAULT_PX,
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

      const state = requireActiveState();
      const nextMaximizedTextWidthPx = normalizeMaximizedTextWidthPx(parsed);
      const widthChanged = state.maximizedTextWidthPx !== nextMaximizedTextWidthPx;
      if (widthChanged) {
        state.maximizedTextWidthPx = nextMaximizedTextWidthPx;
      }
      let persisted = true;
      try {
        saveJsonDirectStrict(getEditorStateFilePath(), copyState(state));
      } catch (error) {
        persisted = false;
        log.error('Text Editor maximized text width persistence failed; retained runtime value:', error);
      }
      if (widthChanged) {
        notifyEditorState(editorWin, 'editorState.setMaximizedTextWidthPx');
      }

      return {
        ok: true,
        maximizedTextWidthPx: state.maximizedTextWidthPx,
        persisted,
      };
    } catch (error) {
      log.error('Error processing set-editor-maximized-text-width-px:', error);
      return { ok: false, error: String(error) };
    }
  });

  ipcMain.handle('set-editor-spellcheck-enabled', async (event, enabled) => {
    try {
      if (typeof getEditorWindow !== 'function') {
        log.warnOnce(
          'editor-state.set-spellcheck-enabled.getEditorWindow.unavailable',
          'getEditorWindow unavailable; Text Editor spellcheck preference IPC skipped.'
        );
        return { ok: false, error: 'unavailable' };
      }

      const editorWin = getEditorWindow();
      if (!hasLiveWebContents(editorWin)) {
        return { ok: false, error: 'editor-window-unavailable' };
      }

      if (!event || event.sender !== editorWin.webContents) {
        log.warn('set-editor-spellcheck-enabled unauthorized (ignored).');
        return { ok: false, error: 'unauthorized' };
      }

      return setEditorSpellcheckEnabled(enabled, { editorWin });
    } catch (error) {
      log.error('Error processing set-editor-spellcheck-enabled:', error);
      return { ok: false, error: String(error) };
    }
  });

  ipcMain.handle('set-editor-font-size-px', async (event, fontSizePx) => {
    try {
      if (typeof getEditorWindow !== 'function') {
        log.warnOnce(
          'editor-state.set-editor-font-size.getEditorWindow.unavailable',
          'getEditorWindow unavailable; Text Editor font-size preference IPC skipped.'
        );
        return { ok: false, error: 'unavailable' };
      }

      const editorWin = getEditorWindow();
      if (!hasLiveWebContents(editorWin)) {
        return { ok: false, error: 'editor-window-unavailable' };
      }

      if (!event || event.sender !== editorWin.webContents) {
        log.warn('set-editor-font-size-px unauthorized (ignored).');
        return { ok: false, error: 'unauthorized' };
      }

      return setEditorFontSizePx(fontSizePx, { editorWin });
    } catch (error) {
      log.error('Error processing set-editor-font-size-px:', error);
      return { ok: false, error: String(error) };
    }
  });
}

// =============================================================================
// Exports / module surface
// =============================================================================

module.exports = {
  loadInitialState,
  attachTo,
  getEditorState,
  notifyEditorState,
  setEditorSpellcheckEnabled,
  setEditorFontSizePx,
  getTextSizeShortcutActions,
  registerIpc,
};

// =============================================================================
// End of electron/editor_state.js
// =============================================================================
