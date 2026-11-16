'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTestTempDir } = require('../../helpers/test_temp_paths');
const { installElectronModuleMock } = require('../../helpers/electron_module_mock');

const FS_STORAGE_PATH = path.resolve(__dirname, '../../../electron/fs_storage.js');
const TASK_EDITOR_STATE_PATH = path.resolve(__dirname, '../../../electron/task_editor_state.js');
const APP_ROOT_DIR = path.resolve(__dirname, '../../..');

const DEFAULT_WIDTHS = Object.freeze({
  comentario: 82,
  tiempo: 88,
  percent: 63,
  falta: 65,
  enlace: 250,
  acciones: 124,
});

function createRecord(widths = DEFAULT_WIDTHS) {
  return { widths: { ...widths } };
}

function createState({ maximized = false, reduced = null, columnWidths = DEFAULT_WIDTHS } = {}) {
  return {
    maximized,
    reduced,
    columnWidths: { ...columnWidths },
  };
}

function loadFreshModule(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function createStorageHarness(t, initialState) {
  const userDataDir = createTestTempDir('task-editor-state');
  t.after(() => fs.rmSync(userDataDir, { recursive: true, force: true }));
  t.after(installElectronModuleMock());

  const fsStorage = loadFreshModule(FS_STORAGE_PATH);
  fsStorage.initStorage({
    isReady() {
      return true;
    },
    getPath(name) {
      if (name !== 'userData') throw new Error(`Unexpected path request: ${name}`);
      return userDataDir;
    },
    getAppPath() {
      return APP_ROOT_DIR;
    },
  });
  fsStorage.ensureConfigDir();

  if (typeof initialState !== 'undefined') {
    fsStorage.saveJson(fsStorage.getTaskEditorStateFile(), initialState);
  }

  const taskEditorState = loadFreshModule(TASK_EDITOR_STATE_PATH);
  return { taskEditorState, fsStorage };
}

function createWindowDouble({ bounds, maximized = false } = {}) {
  const listeners = new Map();
  let currentBounds = bounds || { x: 10, y: 20, width: 1200, height: 720 };
  let currentMaximized = maximized;

  return {
    on(eventName, handler) {
      const handlers = listeners.get(eventName) || [];
      handlers.push(handler);
      listeners.set(eventName, handlers);
    },
    emit(eventName, event = {}) {
      const handlers = listeners.get(eventName) || [];
      handlers.forEach((handler) => handler(event));
    },
    isDestroyed() {
      return false;
    },
    isMaximized() {
      return currentMaximized;
    },
    setMaximized(nextValue) {
      currentMaximized = Boolean(nextValue);
    },
    getBounds() {
      return { ...currentBounds };
    },
    setBounds(nextBounds) {
      currentBounds = { ...nextBounds };
    },
  };
}

test('a fresh Task Editor supplies default presentation state without creating a file', (t) => {
  const { taskEditorState, fsStorage } = createStorageHarness(t);

  assert.deepEqual(taskEditorState.loadInitialState(), createState());
  assert.deepEqual(taskEditorState.getColumnLayout(), createRecord());
  assert.equal(fs.existsSync(fsStorage.getTaskEditorStateFile()), false);
});

test('loadInitialState validates each presentation field independently', (t) => {
  const { taskEditorState } = createStorageHarness(t, createState({
    maximized: 'bad',
    reduced: {
      x: 50.4,
      y: 60.6,
      width: 300,
      height: 400,
    },
    columnWidths: { ...DEFAULT_WIDTHS, tiempo: '88' },
  }));

  const normalized = taskEditorState.loadInitialState();

  assert.equal(normalized.maximized, false);
  assert.deepEqual(normalized.reduced, {
    x: 50,
    y: 61,
    width: 756,
    height: 400,
  });
  assert.deepEqual(normalized.columnWidths, DEFAULT_WIDTHS);
});

test('loadInitialState keeps valid presentation fields when another field is missing', (t) => {
  const columnWidths = { ...DEFAULT_WIDTHS, tiempo: 118 };
  const { taskEditorState } = createStorageHarness(t, {
    maximized: true,
    columnWidths,
  });

  const normalized = taskEditorState.loadInitialState();

  assert.equal(normalized.maximized, true);
  assert.equal(normalized.reduced, null);
  assert.deepEqual(normalized.columnWidths, columnWidths);
});

test('a geometry update preserves accepted column widths in the complete persisted snapshot', (t) => {
  const { taskEditorState, fsStorage } = createStorageHarness(t);
  const taskEditorWin = createWindowDouble({
    bounds: { x: 80, y: 100, width: 1333, height: 777 },
  });

  taskEditorState.loadInitialState();
  assert.deepEqual(
    taskEditorState.saveColumnLayout(createRecord({ ...DEFAULT_WIDTHS, tiempo: 118 })),
    { ok: true }
  );
  taskEditorState.attachTo(taskEditorWin);
  taskEditorWin.emit('resize');

  assert.deepEqual(fsStorage.loadJson(fsStorage.getTaskEditorStateFile(), {}), createState({
    reduced: { x: 80, y: 100, width: 1333, height: 777 },
    columnWidths: { ...DEFAULT_WIDTHS, tiempo: 118 },
  }));
});

test('a column update preserves restored maximized geometry state in the complete snapshot', (t) => {
  const reduced = { x: 25, y: 35, width: 1200, height: 720 };
  const { taskEditorState, fsStorage } = createStorageHarness(t, createState({
    maximized: true,
    reduced,
  }));

  taskEditorState.loadInitialState();
  assert.deepEqual(
    taskEditorState.saveColumnLayout(createRecord({ ...DEFAULT_WIDTHS, enlace: 320 })),
    { ok: true }
  );

  assert.deepEqual(fsStorage.loadJson(fsStorage.getTaskEditorStateFile(), {}), createState({
    maximized: true,
    reduced,
    columnWidths: { ...DEFAULT_WIDTHS, enlace: 320 },
  }));
});

test('maximizing the live window preserves its columns and reduced bounds', (t) => {
  const reduced = { x: 25, y: 35, width: 1200, height: 720 };
  const { taskEditorState, fsStorage } = createStorageHarness(t, createState({
    reduced,
    columnWidths: { ...DEFAULT_WIDTHS, percent: 90 },
  }));
  const taskEditorWin = createWindowDouble({ bounds: reduced });

  taskEditorState.loadInitialState();
  taskEditorState.attachTo(taskEditorWin);
  taskEditorWin.setMaximized(true);
  taskEditorWin.emit('maximize');

  assert.deepEqual(fsStorage.loadJson(fsStorage.getTaskEditorStateFile(), {}), createState({
    maximized: true,
    reduced,
    columnWidths: { ...DEFAULT_WIDTHS, percent: 90 },
  }));
});

test('a cancelled close attempt preserves the complete presentation snapshot', (t) => {
  const { taskEditorState, fsStorage } = createStorageHarness(t);
  const taskEditorWin = createWindowDouble({
    bounds: { x: 70, y: 90, width: 1320, height: 760 },
  });
  const closeEvent = {
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
  let closeGuardRan = false;

  taskEditorState.loadInitialState();
  assert.deepEqual(
    taskEditorState.saveColumnLayout(createRecord({ ...DEFAULT_WIDTHS, tiempo: 118 })),
    { ok: true }
  );
  taskEditorState.attachTo(taskEditorWin);
  taskEditorWin.on('close', (event) => {
    closeGuardRan = true;
    event.preventDefault();
  });
  taskEditorWin.emit('close', closeEvent);

  assert.equal(closeGuardRan, true);
  assert.equal(closeEvent.defaultPrevented, true);
  assert.deepEqual(taskEditorState.getColumnLayout(), createRecord({
    ...DEFAULT_WIDTHS,
    tiempo: 118,
  }));
  assert.deepEqual(fsStorage.loadJson(fsStorage.getTaskEditorStateFile(), {}), createState({
    reduced: { x: 70, y: 90, width: 1320, height: 760 },
    columnWidths: { ...DEFAULT_WIDTHS, tiempo: 118 },
  }));
});

test('a later Task Editor creation reloads its predecessor complete snapshot', (t) => {
  const { taskEditorState } = createStorageHarness(t);
  const firstWindow = createWindowDouble({
    bounds: { x: 60, y: 80, width: 1300, height: 750 },
  });

  taskEditorState.loadInitialState();
  assert.deepEqual(
    taskEditorState.saveColumnLayout(createRecord({ ...DEFAULT_WIDTHS, enlace: 320 })),
    { ok: true }
  );
  taskEditorState.attachTo(firstWindow);
  firstWindow.emit('close');

  assert.deepEqual(taskEditorState.loadInitialState(), createState({
    reduced: { x: 60, y: 80, width: 1300, height: 750 },
    columnWidths: { ...DEFAULT_WIDTHS, enlace: 320 },
  }));
});

test('a failed column write reports failure but retains the accepted snapshot for a later geometry write', (t) => {
  const { taskEditorState, fsStorage } = createStorageHarness(t);
  const stateFile = fsStorage.getTaskEditorStateFile();
  fs.mkdirSync(stateFile);

  taskEditorState.loadInitialState();
  assert.deepEqual(
    taskEditorState.saveColumnLayout(createRecord({ ...DEFAULT_WIDTHS, acciones: 180 })),
    { ok: false, code: 'WRITE_FAILED' }
  );

  fs.rmdirSync(stateFile);
  const taskEditorWin = createWindowDouble({
    bounds: { x: 90, y: 110, width: 1340, height: 780 },
  });
  taskEditorState.attachTo(taskEditorWin);
  taskEditorWin.emit('move');

  assert.deepEqual(fsStorage.loadJson(stateFile, {}), createState({
    reduced: { x: 90, y: 110, width: 1340, height: 780 },
    columnWidths: { ...DEFAULT_WIDTHS, acciones: 180 },
  }));
});

test('saveColumnLayout rejects an incomplete or out-of-range record without overwriting state', (t) => {
  const { taskEditorState } = createStorageHarness(t);
  taskEditorState.loadInitialState();

  assert.deepEqual(
    taskEditorState.saveColumnLayout({ widths: { ...DEFAULT_WIDTHS, texto: 200 } }),
    { ok: false, code: 'INVALID_SCHEMA' }
  );
  assert.deepEqual(
    taskEditorState.saveColumnLayout(createRecord({ ...DEFAULT_WIDTHS, comentario: 81 })),
    { ok: false, code: 'INVALID_SCHEMA' }
  );
  assert.deepEqual(taskEditorState.getColumnLayout(), createRecord());
});
