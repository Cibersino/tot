'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const editorWindowLifecycle = require('../../../electron/editor_window_lifecycle');

function createLogDouble() {
  return {
    warnings: [],
    errors: [],
    warn(...args) {
      this.warnings.push(args);
    },
    error(...args) {
      this.errors.push(args);
    },
  };
}

function createEditorWindowDouble({
  visible = false,
  maximized = false,
  minimized = false,
  savedMaximized = false,
} = {}) {
  const calls = [];
  const editorWin = {
    __totSavedMaximized: savedMaximized,
    webContents: {
      destroyed: false,
      focus() {
        calls.push('webContents.focus');
      },
      isDestroyed() {
        return this.destroyed;
      },
    },
    destroyed: false,
    visible,
    maximized,
    minimized,
    isDestroyed() {
      return this.destroyed;
    },
    isVisible() {
      return this.visible;
    },
    isMaximized() {
      return this.maximized;
    },
    isMinimized() {
      return this.minimized;
    },
    restore() {
      calls.push('restore');
      this.minimized = false;
    },
    maximize() {
      calls.push('maximize');
      this.maximized = true;
    },
    show() {
      calls.push('show');
      this.visible = true;
    },
    focus() {
      calls.push('focus');
    },
  };

  return { editorWin, calls };
}

function createMainWindowDouble() {
  const sends = [];
  const mainWin = {
    destroyed: false,
    isDestroyed() {
      return this.destroyed;
    },
    webContents: {
      destroyed: false,
      send(channel, payload) {
        sends.push({ channel, payload });
      },
      isDestroyed() {
        return this.destroyed;
      },
    },
  };

  return { mainWin, sends };
}

function createController() {
  const log = createLogDouble();
  const notifyWindowStateCalls = [];
  const controller = editorWindowLifecycle.createController({
    log,
    editorState: {
      notifyWindowState(win, source) {
        notifyWindowStateCalls.push({ win, source });
      },
    },
  });

  return { controller, log, notifyWindowStateCalls };
}

test('showEditorWindow restores, shows, focuses, and reports window state for a live editor window', () => {
  const { controller, notifyWindowStateCalls } = createController();
  const { editorWin, calls } = createEditorWindowDouble({
    visible: false,
    maximized: false,
    minimized: true,
    savedMaximized: true,
  });

  const result = controller.showEditorWindow(editorWin);

  assert.equal(result, editorWin);
  assert.deepEqual(calls, ['restore', 'maximize', 'show', 'focus', 'webContents.focus']);
  assert.equal(notifyWindowStateCalls.length, 1);
  assert.equal(notifyWindowStateCalls[0].source, 'showEditorWindow');
});

test('ensureEditorWindowOpen reuses a live editor window without recreating or reseeding it', () => {
  const { controller } = createController();
  const { editorWin, calls } = createEditorWindowDouble({ visible: false });
  const { mainWin, sends } = createMainWindowDouble();
  let createCalls = 0;

  const result = controller.ensureEditorWindowOpen({
    editorWin,
    mainWin,
    createEditorWindow() {
      createCalls += 1;
      return null;
    },
    logContext: 'ensureEditorWindowOpen',
  });

  assert.equal(result, editorWin);
  assert.equal(createCalls, 0);
  assert.deepEqual(calls, ['show', 'focus', 'webContents.focus']);
  assert.deepEqual(sends, [{ channel: 'editor-ready', payload: undefined }]);
});

test('ensureEditorWindowOpen creates a new editor window when none is alive', () => {
  const { controller } = createController();
  const { mainWin } = createMainWindowDouble();
  const { editorWin } = createEditorWindowDouble();
  const createArgs = [];

  const result = controller.ensureEditorWindowOpen({
    editorWin: null,
    mainWin,
    createEditorWindow(options) {
      createArgs.push(options);
      return editorWin;
    },
    options: { deferShow: true },
    logContext: 'ensureEditorWindowOpen',
  });

  assert.equal(result, editorWin);
  assert.deepEqual(createArgs, [{ deferShow: true }]);
});

test('handleEditorWindowReady keeps deferred editor windows hidden while still clearing the main-window loader', () => {
  const { controller } = createController();
  const { editorWin, calls } = createEditorWindowDouble({ visible: false });
  const { mainWin, sends } = createMainWindowDouble();

  const result = controller.handleEditorWindowReady({
    editorWin,
    mainWin,
    deferShow: true,
    logContext: 'createEditorWindow',
  });

  assert.equal(result, editorWin);
  assert.deepEqual(calls, []);
  assert.deepEqual(sends, [{ channel: 'editor-ready', payload: undefined }]);
});
