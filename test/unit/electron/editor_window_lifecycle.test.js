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
  focusFailureMode = 'never',
} = {}) {
  const calls = [];
  let focusFailuresConsumed = 0;

  const editorWin = {
    __totSavedMaximized: savedMaximized,
    destroyed: false,
    visible,
    maximized,
    minimized,
    webContents: {
      destroyed: false,
      focus() {
        calls.push('webContents.focus');
      },
      isDestroyed() {
        return this.destroyed;
      },
    },
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
      if (focusFailureMode === 'always') {
        throw new Error('FOCUS_FAILED');
      }
      if (focusFailureMode === 'once' && focusFailuresConsumed === 0) {
        focusFailuresConsumed += 1;
        throw new Error('FOCUS_FAILED');
      }
    },
    destroy() {
      calls.push('destroy');
      this.destroyed = true;
      this.visible = false;
      this.webContents.destroyed = true;
    },
    close() {
      calls.push('close');
      this.destroyed = true;
      this.visible = false;
      this.webContents.destroyed = true;
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

function createFreshOrdinaryStartup(controller, mainWin, editorWin, options = {}) {
  const createArgs = [];
  const result = controller.ensureEditorWindowOpen({
    editorWin: null,
    mainWin,
    createEditorWindow(createOptions) {
      createArgs.push(createOptions);
      return editorWin;
    },
    options: {
      deferShow: true,
      waitForBasePresentationReady: true,
      startupOwner: 'ordinary',
      initialPresentationMode: options.initialPresentationMode || 'reduced',
      startupState: options.startupState || null,
    },
    logContext: 'test.ensureEditorWindowOpen',
  });

  if (result && result.baseReadyPromise && typeof result.baseReadyPromise.catch === 'function') {
    result.baseReadyPromise.catch(() => {});
  }

  return {
    result,
    createArgs,
    firstShowGeneration: createArgs[0] ? createArgs[0].firstShowGeneration : null,
  };
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

test('handleOpenEditor preserves the failure envelope when the main action guard rejects the request', () => {
  const { controller } = createController();

  const result = controller.handleOpenEditor({
    guardOpenEditor: () => false,
    editorWin: null,
    mainWin: null,
    createEditorWindow() {
      throw new Error('SHOULD_NOT_CREATE');
    },
    startupState: { maximized: true },
    logContext: 'test.handleOpenEditor',
  });

  assert.deepEqual(result, {
    ok: false,
    error: 'not ready',
  });
});

test('handleOpenEditor returns reused-visible when the editor is already open and visible', () => {
  const { controller } = createController();
  const { editorWin, calls } = createEditorWindowDouble({ visible: true });

  const result = controller.handleOpenEditor({
    guardOpenEditor: () => true,
    editorWin,
    mainWin: null,
    createEditorWindow() {
      throw new Error('SHOULD_NOT_CREATE');
    },
    startupState: { maximized: false },
    logContext: 'test.handleOpenEditor',
  });

  assert.deepEqual(result, {
    ok: true,
    launchDisposition: 'reused-visible',
  });
  assert.deepEqual(calls, ['focus', 'webContents.focus']);
});

test('fresh ordinary open starts a hidden startup cycle and passes startup query options into window creation', () => {
  const { controller } = createController();
  const { mainWin } = createMainWindowDouble();
  const { editorWin, calls } = createEditorWindowDouble({ visible: false, maximized: false });

  const { result, createArgs, firstShowGeneration } = createFreshOrdinaryStartup(controller, mainWin, editorWin, {
    initialPresentationMode: 'maximized',
  });

  assert.equal(result.ok, true);
  assert.equal(typeof result.baseReadyPromise.then, 'function');
  assert.equal(firstShowGeneration, 1);
  assert.deepEqual(createArgs, [
    {
      deferShow: true,
      waitForBasePresentationReady: true,
      startupOwner: 'ordinary',
      initialPresentationMode: 'maximized',
      startupState: null,
      firstShowGeneration: 1,
    },
  ]);
  assert.deepEqual(calls, ['maximize']);
  controller.handleEditorWindowClosed({
    mainWin,
    logContext: 'test.cleanup.freshOrdinaryOpen',
  });
});

test('repeated ordinary open during the same unresolved hidden startup reuses the existing generation', () => {
  const { controller } = createController();
  const { mainWin } = createMainWindowDouble();
  const { editorWin } = createEditorWindowDouble({ visible: false });

  const { createArgs, firstShowGeneration } = createFreshOrdinaryStartup(controller, mainWin, editorWin);
  const secondResult = controller.ensureEditorWindowOpen({
    editorWin,
    mainWin,
    createEditorWindow() {
      throw new Error('SHOULD_NOT_CREATE_AGAIN');
    },
    options: {
      deferShow: true,
      waitForBasePresentationReady: true,
      startupOwner: 'ordinary',
      initialPresentationMode: 'reduced',
    },
    logContext: 'test.ensureEditorWindowOpen.second',
  });

  assert.equal(createArgs.length, 1);
  assert.equal(firstShowGeneration, 1);
  assert.equal(typeof secondResult.baseReadyPromise.then, 'function');
  controller.handleEditorWindowClosed({
    mainWin,
    logContext: 'test.cleanup.repeatedOrdinaryOpen',
  });
});

test('ordinary open shows an existing hidden editor window immediately when no startup cycle is active', () => {
  const { controller } = createController();
  const { editorWin, calls } = createEditorWindowDouble({ visible: false });

  const result = controller.handleOpenEditor({
    guardOpenEditor: () => true,
    editorWin,
    mainWin: null,
    createEditorWindow() {
      throw new Error('SHOULD_NOT_CREATE');
    },
    startupState: { maximized: false },
    logContext: 'test.handleOpenEditor.hiddenExisting',
  });

  assert.deepEqual(result, {
    ok: true,
    launchDisposition: 'reused-visible',
  });
  assert.deepEqual(calls, ['show', 'focus', 'webContents.focus']);
});

test('handleEditorWindowReady keeps hidden startup windows hidden until base readiness is accepted', () => {
  const { controller } = createController();
  const { editorWin, calls } = createEditorWindowDouble({ visible: false, maximized: true });

  const result = controller.handleEditorWindowReady({
    editorWin,
    deferShow: true,
    waitForBasePresentationReady: true,
  });

  assert.equal(result, editorWin);
  assert.deepEqual(calls, []);
});

test('accepted ordinary base readiness shows the window and emits editor-first-show-state ready', () => {
  const { controller } = createController();
  const { mainWin, sends } = createMainWindowDouble();
  const { editorWin, calls } = createEditorWindowDouble({ visible: false, maximized: false });

  const { firstShowGeneration } = createFreshOrdinaryStartup(controller, mainWin, editorWin, {
    initialPresentationMode: 'maximized',
  });

  const accepted = controller.handleBasePresentationStateReport({
    event: { sender: editorWin.webContents },
    editorWin,
    mainWin,
    payload: {
      generation: firstShowGeneration,
      status: 'ready',
    },
    logContext: 'test.handleBasePresentationStateReport',
  });

  assert.equal(accepted, true);
  assert.deepEqual(calls, ['maximize', 'show', 'focus', 'webContents.focus']);
  assert.deepEqual(sends, [
    {
      channel: 'editor-first-show-state',
      payload: {
        generation: 1,
        state: 'ready',
      },
    },
  ]);
});

test('ordinary base readiness ignores unauthorized and stale reports', () => {
  const { controller, log } = createController();
  const { mainWin, sends } = createMainWindowDouble();
  const { editorWin, calls } = createEditorWindowDouble({ visible: false });

  const { firstShowGeneration } = createFreshOrdinaryStartup(controller, mainWin, editorWin);

  const unauthorized = controller.handleBasePresentationStateReport({
    event: { sender: {} },
    editorWin,
    mainWin,
    payload: {
      generation: firstShowGeneration,
      status: 'ready',
    },
    logContext: 'test.handleBasePresentationStateReport.unauthorized',
  });

  const stale = controller.handleBasePresentationStateReport({
    event: { sender: editorWin.webContents },
    editorWin,
    mainWin,
    payload: {
      generation: 99,
      status: 'ready',
    },
    logContext: 'test.handleBasePresentationStateReport.stale',
  });

  assert.equal(unauthorized, false);
  assert.equal(stale, false);
  assert.deepEqual(calls, []);
  assert.deepEqual(sends, []);
  assert.equal(log.warnings.length, 2);
  controller.handleEditorWindowClosed({
    mainWin,
    logContext: 'test.cleanup.ignoreUnauthorizedAndStale',
  });
});

test('ordinary bootstrap failure emits failed/bootstrap-failed and disposes the hidden editor', () => {
  const { controller } = createController();
  const { mainWin, sends } = createMainWindowDouble();
  const { editorWin, calls } = createEditorWindowDouble({ visible: false });

  const { firstShowGeneration } = createFreshOrdinaryStartup(controller, mainWin, editorWin);

  const accepted = controller.handleBasePresentationStateReport({
    event: { sender: editorWin.webContents },
    editorWin,
    mainWin,
    payload: {
      generation: firstShowGeneration,
      status: 'failed',
      reason: 'bootstrap-failed',
    },
    logContext: 'test.handleBasePresentationStateReport.failed',
  });

  assert.equal(accepted, true);
  assert.deepEqual(calls, ['destroy']);
  assert.deepEqual(sends, [
    {
      channel: 'editor-first-show-state',
      payload: {
        generation: 1,
        state: 'failed',
        reason: 'bootstrap-failed',
      },
    },
  ]);
});

test('reading-test bootstrap failure marks the later hidden editor close as lifecycle-owned', () => {
  const { controller } = createController();
  const { editorWin, calls } = createEditorWindowDouble({ visible: false, maximized: false });

  const result = controller.ensureEditorWindowOpen({
    editorWin: null,
    mainWin: null,
    createEditorWindow() {
      return editorWin;
    },
    options: {
      deferShow: true,
      waitForBasePresentationReady: true,
      startupOwner: 'reading-test',
      initialPresentationMode: 'maximized',
    },
    logContext: 'test.ensureEditorWindowOpen.readingTestFailure',
  });

  result.baseReadyPromise.catch(() => {});

  const accepted = controller.handleBasePresentationStateReport({
    event: { sender: editorWin.webContents },
    editorWin,
    mainWin: null,
    payload: {
      generation: 1,
      status: 'failed',
      reason: 'bootstrap-failed',
    },
    logContext: 'test.handleBasePresentationStateReport.readingTestFailed',
  });

  assert.equal(accepted, true);
  assert.deepEqual(calls, ['maximize', 'destroy']);
  assert.equal(controller.handleEditorWindowClosed({
    editorWin,
    mainWin: null,
    logContext: 'test.handleEditorWindowClosed.readingTestFailure',
  }), true);
});

test('ordinary hidden close before base readiness emits closed/window-closed-before-base-ready', () => {
  const { controller } = createController();
  const { mainWin, sends } = createMainWindowDouble();
  const { editorWin } = createEditorWindowDouble({ visible: false });

  createFreshOrdinaryStartup(controller, mainWin, editorWin);

  const handled = controller.handleEditorWindowClosed({
    mainWin,
    logContext: 'test.handleEditorWindowClosed',
  });

  assert.equal(handled, true);
  assert.deepEqual(sends, [
    {
      channel: 'editor-first-show-state',
      payload: {
        generation: 1,
        state: 'closed',
        reason: 'window-closed-before-base-ready',
      },
    },
  ]);
});

test('ordinary late finalization fallback emits ready with fallback true', () => {
  const { controller } = createController();
  const { mainWin, sends } = createMainWindowDouble();
  const { editorWin, calls } = createEditorWindowDouble({
    visible: false,
    focusFailureMode: 'once',
  });

  const { firstShowGeneration } = createFreshOrdinaryStartup(controller, mainWin, editorWin);

  const accepted = controller.handleBasePresentationStateReport({
    event: { sender: editorWin.webContents },
    editorWin,
    mainWin,
    payload: {
      generation: firstShowGeneration,
      status: 'ready',
    },
    logContext: 'test.handleBasePresentationStateReport.readyWithFallback',
  });

  assert.equal(accepted, true);
  assert.deepEqual(calls, ['show', 'focus', 'focus', 'webContents.focus']);
  assert.deepEqual(sends, [
    {
      channel: 'editor-first-show-state',
      payload: {
        generation: 1,
        state: 'ready',
        fallback: true,
        reason: 'late-finalization-fallback',
      },
    },
  ]);
});

test('ordinary late finalization failure emits failed/late-finalization-failed', () => {
  const { controller } = createController();
  const { mainWin, sends } = createMainWindowDouble();
  const { editorWin, calls } = createEditorWindowDouble({
    visible: false,
    focusFailureMode: 'always',
  });

  const { firstShowGeneration } = createFreshOrdinaryStartup(controller, mainWin, editorWin);

  const accepted = controller.handleBasePresentationStateReport({
    event: { sender: editorWin.webContents },
    editorWin,
    mainWin,
    payload: {
      generation: firstShowGeneration,
      status: 'ready',
    },
    logContext: 'test.handleBasePresentationStateReport.readyFallbackFailure',
  });

  assert.equal(accepted, true);
  assert.deepEqual(calls, ['show', 'focus', 'focus']);
  assert.deepEqual(sends, [
    {
      channel: 'editor-first-show-state',
      payload: {
        generation: 1,
        state: 'failed',
        reason: 'late-finalization-failed',
      },
    },
  ]);
});

test('ordinary startup timeout emits failed/startup-timeout, destroys the hidden editor, and ignores late readiness', async () => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  let timeoutCallback = null;

  global.setTimeout = (callback) => {
    timeoutCallback = callback;
    return 1;
  };
  global.clearTimeout = () => {};

  try {
    const { controller, log } = createController();
    const { mainWin, sends } = createMainWindowDouble();
    const { editorWin, calls } = createEditorWindowDouble({ visible: false });

    const { firstShowGeneration } = createFreshOrdinaryStartup(controller, mainWin, editorWin);
    assert.equal(typeof timeoutCallback, 'function');

    timeoutCallback();

    assert.deepEqual(calls, ['destroy']);
    assert.deepEqual(sends, [
      {
        channel: 'editor-first-show-state',
        payload: {
          generation: 1,
          state: 'failed',
          reason: 'startup-timeout',
        },
      },
    ]);
    assert.equal(log.errors.length, 1);

    const lateReportAccepted = controller.handleBasePresentationStateReport({
      event: { sender: editorWin.webContents },
      editorWin,
      mainWin,
      payload: {
        generation: firstShowGeneration,
        status: 'ready',
      },
      logContext: 'test.handleBasePresentationStateReport.late',
    });

    assert.equal(lateReportAccepted, false);
    assert.equal(sends.length, 1);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});

test('reading-test startup timeout marks the later hidden editor close as lifecycle-owned', () => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  let timeoutCallback = null;

  global.setTimeout = (callback) => {
    timeoutCallback = callback;
    return 1;
  };
  global.clearTimeout = () => {};

  try {
    const { controller } = createController();
    const { editorWin, calls } = createEditorWindowDouble({ visible: false, maximized: false });

    const result = controller.ensureEditorWindowOpen({
      editorWin: null,
      mainWin: null,
      createEditorWindow() {
        return editorWin;
      },
      options: {
        deferShow: true,
        waitForBasePresentationReady: true,
        startupOwner: 'reading-test',
        initialPresentationMode: 'maximized',
      },
      logContext: 'test.ensureEditorWindowOpen.readingTestTimeout',
    });

    result.baseReadyPromise.catch(() => {});
    assert.equal(typeof timeoutCallback, 'function');

    timeoutCallback();

    assert.deepEqual(calls, ['maximize', 'destroy']);
    assert.equal(controller.handleEditorWindowClosed({
      editorWin,
      mainWin: null,
      logContext: 'test.handleEditorWindowClosed.readingTestTimeout',
    }), true);
  } finally {
    global.setTimeout = originalSetTimeout;
    global.clearTimeout = originalClearTimeout;
  }
});
