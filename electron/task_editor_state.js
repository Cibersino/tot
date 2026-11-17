// electron/task_editor_state.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Own the recoverable Task Editor presentation preferences:
// - window geometry and maximized state;
// - the six user-resizable utility column widths.
//
// A single in-memory snapshot is authoritative while a Task Editor BrowserWindow
// is alive. Every accepted change updates that snapshot before attempting a
// best-effort write of the complete document. This avoids independent writers
// accidentally discarding another presentation preference.

// =============================================================================
// Imports / logger
// =============================================================================
const { screen } = require('electron');
const { getTaskEditorStateFile, loadJson, saveJsonStrict } = require('./fs_storage');
const Log = require('./log');

const log = Log.get('task-editor-state');

// =============================================================================
// Constants / defaults
// =============================================================================
const TASK_COLUMN_WIDTH_MAX_PX = 100_000;
const DEFAULT_REDUCED_WIDTH = 1130;
const DEFAULT_REDUCED_HEIGHT = 720;
const MIN_REDUCED_WIDTH = 756;
const MIN_REDUCED_HEIGHT = 400;
const MIN_VISIBLE_EDGE_PX = 40;

const TASK_UTILITY_COLUMN_MIN_WIDTHS = Object.freeze({
  comentario: 82,
  tiempo: 88,
  percent: 63,
  falta: 65,
  enlace: 250,
  acciones: 124,
});

const DEFAULT_COLUMN_WIDTHS = Object.freeze({ ...TASK_UTILITY_COLUMN_MIN_WIDTHS });
const DEFAULT_STATE = Object.freeze({
  maximized: false,
  reduced: null,
  columnWidths: DEFAULT_COLUMN_WIDTHS,
});

let activeState = null;

// =============================================================================
// Geometry and state normalization helpers
// =============================================================================
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function copyColumnWidths(widths) {
  return { ...widths };
}

function copyState(state) {
  return {
    maximized: state.maximized,
    reduced: state.reduced ? { ...state.reduced } : null,
    columnWidths: copyColumnWidths(state.columnWidths),
  };
}

function createDefaultState() {
  return copyState(DEFAULT_STATE);
}

function isValidReduced(reduced) {
  if (!isPlainObject(reduced)) return false;
  const { x, y, width, height } = reduced;
  return (
    isFiniteNumber(x)
    && isFiniteNumber(y)
    && isFiniteNumber(width)
    && isFiniteNumber(height)
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
  if (!workArea) {
    log.warnOnce(
      'task-editor-state.normalize.work-area-unavailable',
      'intersectsWorkArea: display.workArea unavailable; treating display as non-intersecting (ignored).'
    );
    return false;
  }

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
    if (!displays.length) {
      log.warnOnce(
        'task-editor-state.normalize.no-displays',
        'normalizeReduced: no displays available; using stored bounds (ignored).'
      );
      return reduced;
    }
    const ok = displays.some((display) => intersectsWorkArea(reduced, display));
    return ok ? reduced : null;
  } catch (error) {
    log.warnOnce(
      'task-editor-state.normalize.displays',
      'normalizeReduced: failed to check displays; using stored bounds (ignored).',
      error
    );
    return reduced;
  }
}

function hasExactKeys(value, expectedKeys) {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expectedKeys.length
    && expectedKeys.every((key) => Object.hasOwn(value, key));
}

function normalizeColumnWidths(rawWidths) {
  const keys = Object.keys(TASK_UTILITY_COLUMN_MIN_WIDTHS);
  if (!isPlainObject(rawWidths) || !hasExactKeys(rawWidths, keys)) return null;

  const widths = {};
  for (const key of keys) {
    const width = rawWidths[key];
    if (
      !Number.isSafeInteger(width)
      || width < TASK_UTILITY_COLUMN_MIN_WIDTHS[key]
      || width > TASK_COLUMN_WIDTH_MAX_PX
    ) return null;
    widths[key] = width;
  }
  return widths;
}

function normalizeState(raw) {
  const state = createDefaultState();
  if (!isPlainObject(raw)) {
    log.warnOnce(
      'task-editor-state.normalize.invalid-root',
      'normalizeState: invalid state; using defaults (ignored).',
      raw
    );
    return state;
  }

  if (typeof raw.maximized === 'boolean') {
    state.maximized = raw.maximized;
  } else {
    log.warnOnce(
      'task-editor-state.normalize.invalid-maximized',
      'normalizeState: invalid maximized; using default (ignored).',
      raw.maximized
    );
  }

  if (raw.reduced === null) {
    state.reduced = null;
  } else {
    const normalizedReduced = normalizeReduced(raw.reduced);
    if (normalizedReduced) {
      state.reduced = normalizedReduced;
    } else {
      log.warnOnce(
        'task-editor-state.normalize.invalid-reduced',
        'normalizeState: invalid reduced bounds; using default (ignored).',
        raw.reduced
      );
    }
  }

  const widths = normalizeColumnWidths(raw.columnWidths);
  if (widths) {
    state.columnWidths = widths;
  } else {
    log.warnOnce(
      'task-editor-state.normalize.invalid-column-widths',
      'normalizeState: invalid column widths; using defaults (ignored).',
      raw.columnWidths
    );
  }

  return state;
}

function normalizeColumnLayoutRecord(raw) {
  if (!hasExactKeys(raw, ['widths'])) return null;
  const widths = normalizeColumnWidths(raw.widths);
  return widths ? { widths } : null;
}

function getColumnLayoutRecord(state) {
  return {
    widths: copyColumnWidths(state.columnWidths),
  };
}

// =============================================================================
// Window and persistence helpers
// =============================================================================
function isLiveWindow(taskEditorWin) {
  if (
    !taskEditorWin
    || typeof taskEditorWin.isDestroyed !== 'function'
    || taskEditorWin.isDestroyed() !== false
  ) {
    log.warnOnce(
      'task-editor-state.window.unavailable',
      'isLiveWindow: Task Editor window unavailable; state persistence skipped (ignored).'
    );
    return false;
  }
  return true;
}

function isWindowMaximized(taskEditorWin) {
  if (typeof taskEditorWin.isMaximized !== 'function') {
    log.warnOnce(
      'task-editor-state.window.is-maximized-unavailable',
      'isWindowMaximized: Task Editor window isMaximized unavailable; treating it as not maximized (ignored).'
    );
    return false;
  }
  return taskEditorWin.isMaximized();
}

function getReducedBounds(taskEditorWin) {
  if (!isLiveWindow(taskEditorWin) || typeof taskEditorWin.getBounds !== 'function') return null;
  return normalizeReduced(taskEditorWin.getBounds());
}

function persistActiveState() {
  try {
    saveJsonStrict(getTaskEditorStateFile(), copyState(activeState));
    return true;
  } catch (error) {
    log.warn('Task Editor presentation state save failed (ignored):', error);
    return false;
  }
}

function requireActiveState() {
  if (activeState) return activeState;
  return loadInitialState();
}

// =============================================================================
// API (public entrypoints)
// =============================================================================
function loadInitialState() {
  try {
    activeState = normalizeState(loadJson(getTaskEditorStateFile(), DEFAULT_STATE));
  } catch (error) {
    log.warn('Task Editor presentation state load failed; using defaults (ignored):', error);
    activeState = createDefaultState();
  }
  return copyState(activeState);
}

function getColumnLayout() {
  return getColumnLayoutRecord(requireActiveState());
}

function saveColumnLayout(rawRecord) {
  const record = normalizeColumnLayoutRecord(rawRecord);
  if (!record) {
    log.warn('saveColumnLayout received invalid column layout payload.');
    return { ok: false, code: 'INVALID_SCHEMA' };
  }

  const state = requireActiveState();
  state.columnWidths = copyColumnWidths(record.widths);
  return persistActiveState() ? { ok: true } : { ok: false, code: 'WRITE_FAILED' };
}

function attachTo(taskEditorWin) {
  if (!taskEditorWin) {
    log.warn('attachTo: Task Editor window unavailable; persistence listeners not attached (ignored).');
    return;
  }

  const saveReducedState = () => {
    try {
      if (!isLiveWindow(taskEditorWin) || isWindowMaximized(taskEditorWin)) return;
      const reduced = getReducedBounds(taskEditorWin);
      if (!reduced) {
        log.warnOnce(
          'task-editor-state.save.invalid-reduced',
          'saveReducedState: current Task Editor bounds unavailable or invalid; save skipped (ignored).'
        );
        return;
      }
      const state = requireActiveState();
      state.maximized = false;
      state.reduced = reduced;
      persistActiveState();
    } catch (error) {
      log.warn('Task Editor reduced presentation state update failed (ignored):', error);
    }
  };

  const saveMaximizedFlag = (maximized) => {
    try {
      const state = requireActiveState();
      state.maximized = Boolean(maximized);
      persistActiveState();
    } catch (error) {
      log.warn('Task Editor maximized presentation state update failed (ignored):', error);
    }
  };

  taskEditorWin.on('resize', saveReducedState);
  taskEditorWin.on('move', saveReducedState);
  taskEditorWin.on('maximize', () => saveMaximizedFlag(true));
  taskEditorWin.on('unmaximize', saveReducedState);
  taskEditorWin.on('close', () => {
    try {
      if (!isLiveWindow(taskEditorWin)) return;
      const maximized = isWindowMaximized(taskEditorWin);
      if (!maximized) saveReducedState();
      saveMaximizedFlag(maximized);
    } catch (error) {
      log.warn('Task Editor close presentation state update failed (ignored):', error);
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
  TASK_COLUMN_WIDTH_MAX_PX,
  TASK_UTILITY_COLUMN_MIN_WIDTHS,
  loadInitialState,
  getColumnLayout,
  saveColumnLayout,
  attachTo,
};

// =============================================================================
// End of electron/task_editor_state.js
// =============================================================================
