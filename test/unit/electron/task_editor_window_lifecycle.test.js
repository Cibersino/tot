'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const lifecycle = require('../../../electron/task_editor_window_lifecycle');

function createWindowDouble() {
  const sends = [];
  const calls = [];
  const webContents = {
    send(channel, payload) {
      sends.push({ channel, payload });
    },
  };
  const win = {
    destroyed: false,
    webContents,
    isDestroyed() {
      return this.destroyed;
    },
    close() {
      calls.push('close');
      if (typeof this.beforeClose === 'function') {
        this.beforeClose();
      }
      this.destroyed = true;
    },
  };
  return { calls, sends, webContents, win };
}

function createDialogDouble({ responses = [], fail = false } = {}) {
  const calls = [];
  return {
    calls,
    async showMessageBox(owner, options) {
      calls.push({ owner, options });
      if (fail) throw new Error('DIALOG_FAILED');
      return { response: responses.length ? responses.shift() : 1 };
    },
  };
}

function createDeferredDialogDouble() {
  const calls = [];
  let resolvePending = null;
  return {
    calls,
    showMessageBox(owner, options) {
      calls.push({ owner, options });
      return new Promise((resolve) => {
        resolvePending = resolve;
      });
    },
    resolve(response) {
      assert.ok(resolvePending, 'expected a pending native dialog');
      const resolve = resolvePending;
      resolvePending = null;
      resolve({ response });
    },
  };
}

function createQueuedDeferredDialogDouble() {
  const calls = [];
  const resolvers = [];
  return {
    calls,
    showMessageBox(owner, options) {
      calls.push({ owner, options });
      return new Promise((resolve) => {
        resolvers.push(resolve);
      });
    },
    resolveNext(response) {
      const resolve = resolvers.shift();
      assert.ok(resolve, 'expected a pending native dialog');
      resolve({ response });
    },
  };
}

function createController(dialog, getDialogTexts) {
  return lifecycle.createController({
    dialog,
    getDialogTexts: getDialogTexts || (() => ({
      ok: 'OK',
      task_terminal_title: 'Task unavailable',
      task_terminal_startup_message: 'Startup failure',
      task_terminal_clean_message: 'No changes',
      task_terminal_dirty_message: 'May have changes',
      task_discard_and_close: 'Discard and close',
      task_keep_open: 'Keep open',
      task_discard_changes_title: 'Discard task changes',
      task_discard_changes_confirm: 'Discard current task changes?',
    })),
  });
}

function issueInitialization(controller, win, payload = {}) {
  const correlated = controller.prepareInitialization(win, payload);
  assert.ok(correlated);
  assert.equal(controller.acceptInitializationIssued(win, correlated.initId), true);
  return correlated;
}

test('Task lifecycle accepts dirty evidence only for the latest issued initialization', async () => {
  const dialog = createDialogDouble();
  const controller = createController(dialog);
  const { webContents, win } = createWindowDouble();
  controller.attachWindow(win);

  const first = issueInitialization(controller, win);
  assert.equal(controller.acceptDirtyState({ sender: webContents }, { dirty: false, initId: first.initId }), true);
  const second = issueInitialization(controller, win);

  assert.equal(controller.acceptDirtyState({ sender: webContents }, { dirty: false, initId: first.initId }), false);
  assert.equal(controller.acceptDirtyState({ sender: webContents }, { dirty: false, initId: second.initId }), true);
  assert.equal(await controller.confirmReplacement(win), true);
  assert.equal(dialog.calls.length, 0);
});

test('Task lifecycle treats unknown current dirty evidence as a replacement discard decision', async () => {
  const dialog = createDialogDouble({ responses: [1] });
  const controller = createController(dialog);
  const { win } = createWindowDouble();
  controller.attachWindow(win);
  issueInitialization(controller, win);

  assert.equal(await controller.confirmReplacement(win), false);
  assert.equal(dialog.calls.length, 1);
  assert.deepEqual(dialog.calls[0].options.buttons, ['Discard and close', 'Keep open']);
  assert.equal(dialog.calls[0].options.defaultId, 1);
  assert.equal(dialog.calls[0].options.cancelId, 1);
});

test('Task terminal closure requires both current false evidence values to be definitely clean', async () => {
  const dialog = createDialogDouble({ responses: [0] });
  const controller = createController(dialog);
  const { calls, webContents, win } = createWindowDouble();
  controller.attachWindow(win);
  const init = issueInitialization(controller, win);
  controller.acceptDirtyState({ sender: webContents }, { dirty: false, initId: init.initId });

  assert.equal(controller.acceptTerminalOutcome({ sender: webContents }, {
    kind: 'transition-restoration',
    phase: 'initialized',
    initId: init.initId,
    dirty: false,
  }), true);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls, ['close']);
  assert.equal(controller.isForceCloseAuthorized(), true);
  assert.equal(dialog.calls[0].options.message, 'No changes');
});

test('Task terminal dirty evidence keeps the window open by default and permits a later explicit discard', async () => {
  const dialog = createDialogDouble({ responses: [1, 0] });
  const controller = createController(dialog);
  const { calls, webContents, win } = createWindowDouble();
  controller.attachWindow(win);
  const init = issueInitialization(controller, win);
  controller.acceptDirtyState({ sender: webContents }, { dirty: true, initId: init.initId });

  controller.acceptTerminalOutcome({ sender: webContents }, {
    kind: 'transition-restoration',
    phase: 'initialized',
    initId: init.initId,
    dirty: false,
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, []);
  assert.equal(controller.isForceCloseAuthorized(), false);

  assert.equal(await controller.requestNativeClose(win), true);
  assert.deepEqual(calls, ['close']);
  assert.equal(dialog.calls[1].options.message, 'May have changes');
});

test('Task terminal renderer dirtiness overrides current Main clean evidence', async () => {
  const dialog = createDialogDouble({ responses: [1] });
  const controller = createController(dialog);
  const { calls, webContents, win } = createWindowDouble();
  controller.attachWindow(win);
  const init = issueInitialization(controller, win);
  controller.acceptDirtyState({ sender: webContents }, { dirty: false, initId: init.initId });

  assert.equal(controller.acceptTerminalOutcome({ sender: webContents }, {
    kind: 'transition-restoration',
    phase: 'initialized',
    initId: init.initId,
    dirty: true,
  }), true);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls, []);
  assert.equal(dialog.calls[0].options.message, 'May have changes');
  assert.equal(controller.isForceCloseAuthorized(), false);
});

test('Task no-draft terminal disposition closes even when its disclosure fails', async () => {
  const dialog = createDialogDouble({ fail: true });
  const controller = createController(dialog);
  const { calls, webContents, win } = createWindowDouble();
  controller.attachWindow(win);

  controller.acceptTerminalOutcome({ sender: webContents }, {
    kind: 'bootstrap-contract',
    phase: 'no-draft',
    initId: null,
    dirty: null,
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls, ['close']);
  assert.equal(controller.isForceCloseAuthorized(), true);
});

test('Task no-draft terminal disposition closes when native-copy acquisition fails', async () => {
  const dialog = createDialogDouble();
  const controller = createController(dialog, () => { throw new Error('COPY_PROVIDER_FAILED'); });
  const { calls, webContents, win } = createWindowDouble();
  controller.attachWindow(win);

  controller.acceptTerminalOutcome({ sender: webContents }, {
    kind: 'bootstrap-contract',
    phase: 'no-draft',
    initId: null,
    dirty: null,
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls, ['close']);
  assert.deepEqual(dialog.calls, []);
  assert.equal(controller.isForceCloseAuthorized(), true);
});

test('Task definitely-clean terminal disposition closes when native-copy acquisition fails', async () => {
  const dialog = createDialogDouble();
  const controller = createController(dialog, () => { throw new Error('COPY_PROVIDER_FAILED'); });
  const { calls, webContents, win } = createWindowDouble();
  controller.attachWindow(win);
  const init = issueInitialization(controller, win);
  controller.acceptDirtyState({ sender: webContents }, { dirty: false, initId: init.initId });

  controller.acceptTerminalOutcome({ sender: webContents }, {
    kind: 'transition-restoration',
    phase: 'initialized',
    initId: init.initId,
    dirty: false,
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls, ['close']);
  assert.deepEqual(dialog.calls, []);
  assert.equal(controller.isForceCloseAuthorized(), true);
});

test('Task lifecycle accepts a current no-draft terminal report after initial payload application fails', async () => {
  const dialog = createDialogDouble();
  const controller = createController(dialog);
  const { calls, webContents, win } = createWindowDouble();
  controller.attachWindow(win);
  const init = issueInitialization(controller, win);

  assert.equal(controller.acceptTerminalOutcome({ sender: webContents }, {
    kind: 'task-payload-application',
    phase: 'no-draft',
    initId: init.initId,
    dirty: null,
  }), true);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls, ['close']);
  assert.equal(dialog.calls[0].options.message, 'Startup failure');
});

test('Task lifecycle accepts an uncorrelated no-draft report before the renderer can consume a replayed initialization', async () => {
  const dialog = createDialogDouble();
  const controller = createController(dialog);
  const { calls, webContents, win } = createWindowDouble();
  controller.attachWindow(win);
  issueInitialization(controller, win);

  assert.equal(controller.acceptTerminalOutcome({ sender: webContents }, {
    kind: 'bootstrap-renderer-icons',
    phase: 'no-draft',
    initId: null,
    dirty: null,
  }), true);
  assert.equal(controller.isInitialPresentationAllowed(win), true);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls, ['close']);
  assert.equal(dialog.calls[0].options.message, 'Startup failure');
});

test('Task lifecycle handles the verified initial preload failure as no-draft and blocks presentation', async () => {
  const dialog = createDialogDouble();
  const controller = createController(dialog);
  const { calls, win } = createWindowDouble();
  controller.attachWindow(win);
  issueInitialization(controller, win);

  assert.equal(controller.handleInitialPreloadFailure({
    taskEditorWin: win,
    preloadPath: 'task_editor_preload.js',
    error: new Error('PRELOAD_FAILED'),
    logContext: 'test.initialPreload',
  }), true);
  assert.equal(controller.isInitialPresentationAllowed(win), false);

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ['close']);
  assert.equal(dialog.calls.length, 1);
  assert.equal(dialog.calls[0].options.message, 'Startup failure');
});

test('Task lifecycle handles an initial document failure as no-draft after init issuance but before draft admission', async () => {
  const dialog = createDialogDouble();
  const controller = createController(dialog);
  const { calls, win } = createWindowDouble();
  controller.attachWindow(win);
  issueInitialization(controller, win);

  assert.equal(controller.handleInitialDocumentLoadFailure({
    taskEditorWin: win,
    error: new Error('ERR_FILE_NOT_FOUND'),
    logContext: 'test.initialDocumentLoad',
  }), true);
  assert.equal(controller.isInitialPresentationAllowed(win), false);

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ['close']);
  assert.equal(dialog.calls.length, 1);
  assert.equal(dialog.calls[0].options.message, 'Startup failure');
});

test('Task lifecycle deduplicates overlapping initial preload and document failure signals', async () => {
  const dialog = createDeferredDialogDouble();
  const controller = createController(dialog);
  const { calls, win } = createWindowDouble();
  controller.attachWindow(win);

  assert.equal(controller.handleInitialPreloadFailure({
    taskEditorWin: win,
    preloadPath: 'task_editor_preload.js',
    error: new Error('PRELOAD_FAILED'),
    logContext: 'test.initialPreload',
  }), true);
  assert.equal(controller.handleInitialDocumentLoadFailure({
    taskEditorWin: win,
    error: new Error('ERR_FILE_NOT_FOUND'),
    logContext: 'test.initialDocumentLoad',
  }), false);
  assert.equal(dialog.calls.length, 1);

  dialog.resolve(0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ['close']);
});

test('Task lifecycle leaves an authorized close distinct from an initial document failure', () => {
  const dialog = createDialogDouble();
  const controller = createController(dialog);
  const { calls, webContents, win } = createWindowDouble();
  controller.attachWindow(win);
  let loadFailureResult = null;
  win.beforeClose = () => {
    loadFailureResult = controller.handleInitialDocumentLoadFailure({
      taskEditorWin: win,
      error: new Error('LOAD_ABORTED_BY_CLOSE'),
      logContext: 'test.authorizedClose',
    });
  };

  assert.equal(controller.handleCloseResponse(
    { sender: webContents },
    { kind: 'normal', allow: true }
  ), true);
  assert.equal(loadFailureResult, false);
  assert.deepEqual(calls, ['close']);
  assert.equal(dialog.calls.length, 0);
});

test('Task lifecycle does not override established renderer draft evidence with an initial document failure', () => {
  const dialog = createDialogDouble();
  const controller = createController(dialog);
  const { calls, webContents, win } = createWindowDouble();
  controller.attachWindow(win);
  const init = issueInitialization(controller, win);
  controller.acceptDirtyState({ sender: webContents }, { dirty: false, initId: init.initId });

  assert.equal(controller.handleInitialDocumentLoadFailure({
    taskEditorWin: win,
    error: new Error('UNEXPECTED_LOAD_FAILURE'),
    logContext: 'test.afterDraftAdmission',
  }), false);
  assert.equal(controller.isInitialPresentationAllowed(win), true);
  assert.deepEqual(calls, []);
  assert.equal(dialog.calls.length, 0);
});

test('Task lifecycle accepts normal close authorization only from the current renderer sender', () => {
  const dialog = createDialogDouble();
  const controller = createController(dialog);
  const { calls, webContents, win } = createWindowDouble();
  controller.attachWindow(win);

  assert.equal(controller.handleCloseResponse({ sender: {} }, { kind: 'normal', allow: true }), false);
  assert.deepEqual(calls, []);
  assert.equal(controller.handleCloseResponse({ sender: webContents }, { kind: 'normal', allow: true }), true);
  assert.deepEqual(calls, ['close']);
});

test('Task close-response transport failure never force-closes an initialized draft without discard authorization', async () => {
  const dialog = createDialogDouble({ responses: [1] });
  const controller = createController(dialog);
  const { calls, webContents, win } = createWindowDouble();
  win.webContents.send = () => { throw new Error('SEND_FAILED'); };
  controller.attachWindow(win);
  const init = issueInitialization(controller, win);
  controller.acceptDirtyState({ sender: webContents }, { dirty: false, initId: init.initId });

  assert.equal(await controller.requestNativeClose(win), false);
  assert.deepEqual(calls, []);
  assert.equal(controller.isForceCloseAuthorized(), false);
  assert.equal(dialog.calls[0].options.message, 'May have changes');
});

test('Task close-request transport failure does not infer a no-draft startup outcome', async () => {
  const dialog = createDialogDouble({ fail: true });
  const controller = createController(dialog);
  const { calls, win } = createWindowDouble();
  win.webContents.send = () => { throw new Error('SEND_FAILED'); };
  controller.attachWindow(win);

  assert.equal(await controller.requestNativeClose(win), false);
  assert.deepEqual(calls, []);
  assert.deepEqual(dialog.calls, []);
});

test('Task terminal outcome treats a prior draft as potentially dirty when its latest initialization never applied', async () => {
  const dialog = createDialogDouble({ responses: [1] });
  const controller = createController(dialog);
  const { calls, webContents, win } = createWindowDouble();
  controller.attachWindow(win);
  const first = issueInitialization(controller, win);
  controller.acceptDirtyState({ sender: webContents }, { dirty: false, initId: first.initId });
  issueInitialization(controller, win);

  assert.equal(controller.acceptTerminalOutcome({ sender: webContents }, {
    kind: 'task-payload-application',
    phase: 'initialized',
    initId: null,
    dirty: null,
  }), true);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls, []);
  assert.equal(dialog.calls[0].options.message, 'May have changes');
});

test('Task accepts a stale initialized terminal snapshot as unknown and coalesces pending native close', async () => {
  const dialog = createDeferredDialogDouble();
  const controller = createController(dialog);
  const { calls, sends, webContents, win } = createWindowDouble();
  controller.attachWindow(win);
  const first = issueInitialization(controller, win);
  controller.acceptDirtyState({ sender: webContents }, { dirty: false, initId: first.initId });
  issueInitialization(controller, win);

  const firstClose = controller.requestNativeClose(win);
  assert.deepEqual(sends, [{ channel: 'task-editor-request-close', payload: undefined }]);
  assert.equal(controller.handleCloseResponse({ sender: webContents }, {
    kind: 'terminal',
    phase: 'initialized',
    initId: first.initId,
    dirty: false,
  }), true);
  assert.equal(dialog.calls.length, 1);
  assert.equal(dialog.calls[0].options.message, 'May have changes');

  const laterClose = controller.requestNativeClose(win);
  assert.equal(dialog.calls.length, 1);

  dialog.resolve(1);
  assert.equal(await firstClose, false);
  assert.equal(await laterClose, false);
  assert.deepEqual(calls, []);
  assert.equal(controller.isForceCloseAuthorized(), false);
});

test('Task typed terminal close response resolves an existing native close request conservatively', async () => {
  const dialog = createDialogDouble();
  const controller = createController(dialog);
  const { calls, sends, webContents, win } = createWindowDouble();
  controller.attachWindow(win);
  const init = issueInitialization(controller, win);
  controller.acceptDirtyState({ sender: webContents }, { dirty: false, initId: init.initId });

  const request = controller.requestNativeClose(win);
  assert.deepEqual(sends, [{ channel: 'task-editor-request-close', payload: undefined }]);
  assert.equal(controller.handleCloseResponse({ sender: webContents }, {
    kind: 'terminal',
    phase: 'initialized',
    initId: init.initId,
    dirty: false,
  }), true);

  assert.equal(await request, true);
  assert.deepEqual(calls, ['close']);
  assert.equal(dialog.calls[0].options.message, 'No changes');
});

test('Task native close requests coalesce until one current renderer response settles them', async () => {
  const dialog = createDialogDouble();
  const controller = createController(dialog);
  const { calls, sends, webContents, win } = createWindowDouble();
  controller.attachWindow(win);

  const firstRequest = controller.requestNativeClose(win);
  const secondRequest = controller.requestNativeClose(win);
  assert.deepEqual(sends, [{ channel: 'task-editor-request-close', payload: undefined }]);
  assert.equal(controller.handleCloseResponse({ sender: webContents }, { kind: 'normal', allow: true }), true);

  assert.equal(await firstRequest, true);
  assert.equal(await secondRequest, true);
  assert.deepEqual(calls, ['close']);
});

test('Task terminal resolution coalesces a later native close while its discard decision is pending', async () => {
  const dialog = createDeferredDialogDouble();
  const controller = createController(dialog);
  const { calls, webContents, win } = createWindowDouble();
  controller.attachWindow(win);
  const init = issueInitialization(controller, win);
  controller.acceptDirtyState({ sender: webContents }, { dirty: true, initId: init.initId });

  assert.equal(controller.acceptTerminalOutcome({ sender: webContents }, {
    kind: 'transition-restoration',
    phase: 'initialized',
    initId: init.initId,
    dirty: false,
  }), true);
  assert.equal(dialog.calls.length, 1);

  const laterClose = controller.requestNativeClose(win);
  assert.equal(dialog.calls.length, 1);

  dialog.resolve(1);
  assert.equal(await laterClose, false);
  assert.deepEqual(calls, []);
});

test('Task terminal resolution fences late normal authorization and replacement initialization', async () => {
  const dialog = createDeferredDialogDouble();
  const controller = createController(dialog);
  const { calls, webContents, win } = createWindowDouble();
  controller.attachWindow(win);
  const init = issueInitialization(controller, win);
  controller.acceptDirtyState({ sender: webContents }, { dirty: true, initId: init.initId });

  assert.equal(controller.acceptTerminalOutcome({ sender: webContents }, {
    kind: 'transition-restoration',
    phase: 'initialized',
    initId: init.initId,
    dirty: false,
  }), true);
  assert.equal(dialog.calls.length, 1);

  assert.equal(
    controller.handleCloseResponse({ sender: webContents }, { kind: 'normal', allow: true }),
    false
  );
  assert.equal(controller.prepareInitialization(win, { mode: 'new' }), null);
  assert.deepEqual(calls, []);

  dialog.resolve(1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, []);
});

test('Task replacement approval cannot admit work after terminalization while its native decision awaited', async () => {
  const dialog = createQueuedDeferredDialogDouble();
  const controller = createController(dialog);
  const { calls, webContents, win } = createWindowDouble();
  controller.attachWindow(win);
  const init = issueInitialization(controller, win);
  controller.acceptDirtyState({ sender: webContents }, { dirty: true, initId: init.initId });

  const replacement = controller.confirmReplacement(win);
  assert.equal(dialog.calls.length, 1);

  assert.equal(controller.acceptTerminalOutcome({ sender: webContents }, {
    kind: 'transition-restoration',
    phase: 'initialized',
    initId: init.initId,
    dirty: false,
  }), true);
  assert.equal(dialog.calls.length, 2);

  dialog.resolveNext(0);
  assert.equal(await replacement, false);
  assert.equal(controller.prepareInitialization(win, { mode: 'new' }), null);
  assert.deepEqual(calls, []);

  dialog.resolveNext(1);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, []);
});
