// electron/task_editor_position.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Persist and restore task editor window position (x, y) only.
// - Reads/writes task_editor_position.json via fs_storage.
// - Validates stored positions against available displays.
// - Attaches move/close handlers to persist changes.

// =============================================================================
// Imports / logger
// =============================================================================
const { screen } = require('electron');
const { getTaskEditorPositionFile, loadJson, saveJson } = require('./fs_storage');
const Log = require('./log');

const log = Log.get('task-editor-position');
log.debug('Task editor position starting...');

// =============================================================================
// Constants / defaults
// =============================================================================
const DEFAULT_POS = null; // no stored position

// =============================================================================
// Helpers
// =============================================================================
function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

function isPositionObject(pos) {
  return pos && typeof pos === 'object' && isFiniteNumber(pos.x) && isFiniteNumber(pos.y);
}

function isPointInWorkArea(x, y, display) {
  const wa = display && display.workArea ? display.workArea : null;
  if (!wa) return false;
  return x >= wa.x && x <= wa.x + wa.width - 40 && y >= wa.y && y <= wa.y + wa.height - 40;
}

function normalizePosition(raw) {
  if (!isPositionObject(raw)) return null;
  const { x, y } = raw;
  try {
    const displays = screen.getAllDisplays() || [];
    if (!displays.length) return { x, y };
    const ok = displays.some((d) => isPointInWorkArea(x, y, d));
    return ok ? { x, y } : null;
  } catch (err) {
    log.warnOnce(
      'task-editor-position.normalize.displays',
      'normalizePosition: failed to check displays; using stored position (ignored).',
      err
    );
    return { x, y };
  }
}

// =============================================================================
// API (public entrypoints)
// =============================================================================
function loadInitialPosition(customLoadJson) {
  const loader = typeof customLoadJson === 'function' ? customLoadJson : loadJson;
  try {
    const filePath = getTaskEditorPositionFile();
    const raw = loader(filePath, DEFAULT_POS);
    return normalizePosition(raw);
  } catch (err) {
    log.error('[task_editor_position] Error reading initial position:', err);
    return null;
  }
}

function attachTo(taskEditorWin, customLoadJson, customSaveJson) {
  if (!taskEditorWin) return;

  const saver = typeof customSaveJson === 'function' ? customSaveJson : saveJson;
  let positionFile = null;

  try {
    positionFile = getTaskEditorPositionFile();
  } catch (err) {
    log.error('[task_editor_position] getTaskEditorPositionFile failed:', err);
    return;
  }

  const savePosition = () => {
    try {
      if (!taskEditorWin || taskEditorWin.isDestroyed()) return;
      const bounds = taskEditorWin.getBounds();
      const pos = { x: bounds.x, y: bounds.y };
      saver(positionFile, pos);
    } catch (err) {
      log.error('[task_editor_position] Error saving task editor position:', err);
    }
  };

  taskEditorWin.on('move', savePosition);
  taskEditorWin.on('close', savePosition);
}

// =============================================================================
// Exports / module surface
// =============================================================================
module.exports = {
  loadInitialPosition,
  attachTo,
};

// =============================================================================
// End of electron/task_editor_position.js
// =============================================================================
