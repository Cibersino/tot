// electron/task_editor_state.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Persist and restore task editor window geometry and maximized state.
// - Reads/writes task_editor_state.json via fs_storage.
// - Validates stored reduced bounds against available displays when possible.
// - Attaches move/resize/maximize/close handlers to persist state changes.

// =============================================================================
// Imports / logger
// =============================================================================
const { screen } = require('electron');
const { getTaskEditorStateFile, loadJson, saveJson } = require('./fs_storage');
const Log = require('./log');

const log = Log.get('task-editor-state');
log.debug('Task editor state starting...');

// =============================================================================
// Constants / defaults
// =============================================================================
const DEFAULT_REDUCED_WIDTH = 1130;
const DEFAULT_REDUCED_HEIGHT = 720;
const MIN_REDUCED_WIDTH = 900;
const MIN_REDUCED_HEIGHT = 560;
const MIN_VISIBLE_EDGE_PX = 40;

const DEFAULT_STATE = Object.freeze({
  maximized: false,
  reduced: null,
});

// =============================================================================
// Helpers
// =============================================================================
function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function isValidReduced(reduced) {
  if (!reduced || typeof reduced !== 'object') return false;
  const { x, y, width, height } = reduced;
  return (
    isFiniteNumber(x) &&
    isFiniteNumber(y) &&
    isFiniteNumber(width) &&
    isFiniteNumber(height)
  );
}

function clampReduced(reduced) {
  if (!isValidReduced(reduced)) return null;
  return {
    x: Math.round(reduced.x),
    y: Math.round(reduced.y),
    width: Math.max(MIN_REDUCED_WIDTH, Math.round(reduced.width)),
    height: Math.max(MIN_REDUCED_HEIGHT, Math.round(reduced.height)),
  };
}

function intersectsWorkArea(bounds, display) {
  const workArea = display && display.workArea ? display.workArea : null;
  if (!workArea) return false;

  const left = Math.max(bounds.x, workArea.x);
  const top = Math.max(bounds.y, workArea.y);
  const right = Math.min(bounds.x + bounds.width, workArea.x + workArea.width);
  const bottom = Math.min(bounds.y + bounds.height, workArea.y + workArea.height);

  return (right - left) >= MIN_VISIBLE_EDGE_PX && (bottom - top) >= MIN_VISIBLE_EDGE_PX;
}

function normalizeReduced(rawReduced) {
  const reduced = clampReduced(rawReduced);
  if (!reduced) return null;

  try {
    const displays = screen.getAllDisplays() || [];
    if (!displays.length) return reduced;
    const ok = displays.some((display) => intersectsWorkArea(reduced, display));
    return ok ? reduced : null;
  } catch (err) {
    log.warnOnce(
      'task-editor-state.normalize.displays',
      'normalizeReduced: failed to check displays; using stored bounds (ignored).',
      err
    );
    return reduced;
  }
}

function normalizeState(raw) {
  const state = {
    maximized: DEFAULT_STATE.maximized,
    reduced: DEFAULT_STATE.reduced,
  };

  if (!raw || typeof raw !== 'object') {
    log.warnOnce(
      'task-editor-state.normalize.invalid-root',
      'normalizeState: invalid state; using defaults (ignored).',
      raw
    );
    return state;
  }

  if (typeof raw.maximized === 'boolean') {
    state.maximized = raw.maximized;
  } else if ('maximized' in raw) {
    log.warnOnce(
      'task-editor-state.normalize.invalid-maximized',
      'normalizeState: invalid maximized; using default (ignored).',
      raw.maximized
    );
  }

  if (raw.reduced) {
    const normalizedReduced = normalizeReduced(raw.reduced);
    if (normalizedReduced) {
      state.reduced = normalizedReduced;
    } else {
      log.warnOnce(
        'task-editor-state.normalize.invalid-reduced',
        'normalizeState: invalid reduced bounds; ignoring.',
        raw.reduced
      );
    }
  } else if ('reduced' in raw && raw.reduced !== null) {
    log.warnOnce(
      'task-editor-state.normalize.invalid-reduced-shape',
      'normalizeState: invalid reduced payload; ignoring.',
      raw.reduced
    );
  }

  return state;
}

function isLiveWindow(taskEditorWin) {
  return !!(
    taskEditorWin
    && typeof taskEditorWin.isDestroyed === 'function'
    && taskEditorWin.isDestroyed() === false
  );
}

function readCurrentState(loader, stateFile) {
  return normalizeState(loader(stateFile, DEFAULT_STATE));
}

function getReducedBounds(taskEditorWin) {
  if (!isLiveWindow(taskEditorWin) || typeof taskEditorWin.getBounds !== 'function') return null;
  return normalizeReduced(taskEditorWin.getBounds());
}

// =============================================================================
// API (public entrypoints)
// =============================================================================
function loadInitialState(customLoadJson) {
  const loader = typeof customLoadJson === 'function' ? customLoadJson : loadJson;
  try {
    const filePath = getTaskEditorStateFile();
    return normalizeState(loader(filePath, DEFAULT_STATE));
  } catch (err) {
    log.error('[task_editor_state] Error reading initial state:', err);
    return { ...DEFAULT_STATE };
  }
}

function attachTo(taskEditorWin, customLoadJson, customSaveJson) {
  if (!taskEditorWin) return;

  const loader = typeof customLoadJson === 'function' ? customLoadJson : loadJson;
  const saver = typeof customSaveJson === 'function' ? customSaveJson : saveJson;
  let stateFile = null;

  try {
    stateFile = getTaskEditorStateFile();
  } catch (err) {
    log.error('[task_editor_state] getTaskEditorStateFile failed:', err);
    return;
  }

  const saveReducedState = () => {
    try {
      if (!isLiveWindow(taskEditorWin)) return;
      if (typeof taskEditorWin.isMaximized === 'function' && taskEditorWin.isMaximized()) return;

      const reduced = getReducedBounds(taskEditorWin);
      if (!reduced) {
        log.warnOnce(
          'task-editor-state.save.invalid-reduced',
          'saveReducedState: current task editor bounds are invalid; save skipped (ignored).'
        );
        return;
      }

      const state = readCurrentState(loader, stateFile);
      state.maximized = false;
      state.reduced = reduced;
      saver(stateFile, state);
    } catch (err) {
      log.error('[task_editor_state] Error saving reduced task editor state:', err);
    }
  };

  const saveMaximizedFlag = (maximized) => {
    try {
      const state = readCurrentState(loader, stateFile);
      state.maximized = !!maximized;
      saver(stateFile, state);
    } catch (err) {
      log.error('[task_editor_state] Error saving task editor maximized flag:', err);
    }
  };

  taskEditorWin.on('resize', saveReducedState);
  taskEditorWin.on('move', saveReducedState);
  taskEditorWin.on('maximize', () => saveMaximizedFlag(true));
  taskEditorWin.on('unmaximize', saveReducedState);
  taskEditorWin.on('close', () => {
    try {
      if (!isLiveWindow(taskEditorWin)) return;
      const maximized = typeof taskEditorWin.isMaximized === 'function' && taskEditorWin.isMaximized();
      if (!maximized) {
        saveReducedState();
      }
      saveMaximizedFlag(maximized);
    } catch (err) {
      log.error('[task_editor_state] Error saving task editor closed state:', err);
    }
  });
}

// =============================================================================
// Exports / module surface
// =============================================================================
module.exports = {
  DEFAULT_REDUCED_WIDTH,
  DEFAULT_REDUCED_HEIGHT,
  MIN_REDUCED_WIDTH,
  MIN_REDUCED_HEIGHT,
  loadInitialState,
  attachTo,
};

// =============================================================================
// End of electron/task_editor_state.js
// =============================================================================
