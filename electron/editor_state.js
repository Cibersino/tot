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
// - Logs recoverable anomalies and fallbacks.

// =============================================================================
// Imports / logger
// =============================================================================

const { screen } = require('electron');
const { getEditorStateFile, loadJson, saveJson } = require('./fs_storage');
const Log = require('./log');

const log = Log.get('editor-state');

// =============================================================================
// Constants / defaults
// =============================================================================

const DEFAULT_STATE = {
  maximized: true,
  reduced: null
};

// =============================================================================
// Helpers
// =============================================================================

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

  return st;
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

// =============================================================================
// Exports / module surface
// =============================================================================

module.exports = {
  loadInitialState,
  attachTo
};

// =============================================================================
// End of electron/editor_state.js
// =============================================================================
