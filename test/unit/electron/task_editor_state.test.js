'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const FS_STORAGE_PATH = path.resolve(__dirname, '../../../electron/fs_storage.js');
const TASK_EDITOR_STATE_PATH = path.resolve(__dirname, '../../../electron/task_editor_state.js');
const APP_ROOT_DIR = path.resolve(__dirname, '../../..');

function loadFreshModule(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function createStorageHarness(t, initialState) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tot-task-editor-state-test-'));
  t.after(() => fs.rmSync(userDataDir, { recursive: true, force: true }));

  const fsStorage = loadFreshModule(FS_STORAGE_PATH);
  fsStorage.initStorage({
    isReady() {
      return true;
    },
    getPath(name) {
      if (name !== 'userData') {
        throw new Error(`Unexpected path request: ${name}`);
      }
      return userDataDir;
    },
    getAppPath() {
      return APP_ROOT_DIR;
    },
  });
  fsStorage.ensureConfigDir();
  fsStorage.ensureTasksDirs();

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
      listeners.set(eventName, handler);
    },
    emit(eventName) {
      const handler = listeners.get(eventName);
      if (handler) handler();
    },
    isDestroyed() {
      return false;
    },
    isMaximized() {
      return currentMaximized;
    },
    setMaximized(nextValue) {
      currentMaximized = !!nextValue;
    },
    getBounds() {
      return { ...currentBounds };
    },
    setBounds(nextBounds) {
      currentBounds = { ...nextBounds };
    },
  };
}

test('loadInitialState normalizes invalid task editor state payloads', (t) => {
  const { taskEditorState } = createStorageHarness(t, {
    maximized: 'bad',
    reduced: {
      x: 50.4,
      y: 60.6,
      width: 300,
      height: 400,
    },
  });

  const normalized = taskEditorState.loadInitialState();

  assert.equal(normalized.maximized, false);
  assert.deepEqual(normalized.reduced, {
    x: 50,
    y: 61,
    width: 900,
    height: 560,
  });
});

test('attachTo persists reduced task editor bounds on resize/close', (t) => {
  const { taskEditorState, fsStorage } = createStorageHarness(t);
  const taskEditorWin = createWindowDouble({
    bounds: { x: 80, y: 100, width: 1333, height: 777 },
    maximized: false,
  });

  taskEditorState.attachTo(taskEditorWin);
  taskEditorWin.emit('resize');
  taskEditorWin.emit('close');

  assert.deepEqual(fsStorage.loadJson(fsStorage.getTaskEditorStateFile(), {}), {
    maximized: false,
    reduced: {
      x: 80,
      y: 100,
      width: 1333,
      height: 777,
    },
  });
});

test('attachTo persists task editor maximized state on close', (t) => {
  const { taskEditorState, fsStorage } = createStorageHarness(t, {
    maximized: false,
    reduced: {
      x: 25,
      y: 35,
      width: 1200,
      height: 720,
    },
  });
  const taskEditorWin = createWindowDouble({
    bounds: { x: 25, y: 35, width: 1200, height: 720 },
    maximized: true,
  });

  taskEditorState.attachTo(taskEditorWin);
  taskEditorWin.emit('maximize');
  taskEditorWin.emit('close');

  assert.deepEqual(fsStorage.loadJson(fsStorage.getTaskEditorStateFile(), {}), {
    maximized: true,
    reduced: {
      x: 25,
      y: 35,
      width: 1200,
      height: 720,
    },
  });
});
