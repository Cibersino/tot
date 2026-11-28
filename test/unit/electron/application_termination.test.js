'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const termination = require('../../../electron/application_termination');
const taskLifecycle = require('../../../electron/task_editor_window_lifecycle');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function windowDouble({ autoClose = false } = {}) {
  const win = new EventEmitter();
  win.destroyed = false;
  win.webContents = { send() {} };
  win.isDestroyed = () => win.destroyed;
  win.close = () => { if (autoClose) win.finishClose(); };
  win.finishClose = () => {
    win.destroyed = true;
    win.emit('closed');
  };
  return win;
}

function closeEvent() {
  return { prevented: false, preventDefault() { this.prevented = true; } };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('Task approval, extraction settlement and dependent closure precede the quit handoff', async () => {
  const main = windowDouble();
  const task = windowDouble();
  const dependent = windowDouble();
  const taskOwner = taskLifecycle.createController({
    dialog: { async showMessageBox() { return { response: 1 }; } },
    getDialogTexts: () => ({}),
  });
  taskOwner.attachWindow(task);
  const extraction = deferred();
  const actions = [];
  const failures = [];
  const controller = termination.createController({
    isReady: () => true,
    getMainWindow: () => main,
    getTaskWindow: () => task,
    requestTaskClose: () => taskOwner.requestNativeClose(main),
    extractionCommand: async (command) => {
      actions.push(command);
      if (command === 'settle') await extraction.promise;
    },
    abortExtraction: () => actions.push('abort'),
    terminateReadingTest: () => actions.push('reading'),
    getDependentWindows: () => [dependent],
    setInteractionHeld: (held) => actions.push(held ? 'hold' : 'release-hold'),
    quit: () => actions.push('quit'),
    reportFailure: (error) => failures.push(error),
    log: { error() {} },
  });

  const first = closeEvent();
  controller.handleEvent(first);
  await flush();
  assert.equal(first.prevented, true);
  taskOwner.handleCloseResponse({ sender: task.webContents }, { kind: 'normal', allow: true });
  await flush();
  assert.deepEqual(actions, ['begin']);
  const duringTaskClose = closeEvent();
  controller.handleEvent(duringTaskClose);
  assert.equal(duringTaskClose.prevented, true);
  task.finishClose();
  await flush();
  assert.deepEqual(actions, ['begin', 'hold', 'admit', 'abort', 'settle']);
  const duringExtraction = closeEvent();
  controller.handleEvent(duringExtraction);
  assert.equal(duringExtraction.prevented, true);
  extraction.resolve();
  await flush();
  assert.deepEqual(actions, ['begin', 'hold', 'admit', 'abort', 'settle', 'reading']);
  const duringWindowClose = closeEvent();
  controller.handleEvent(duringWindowClose);
  assert.equal(duringWindowClose.prevented, true);
  dependent.finishClose();
  await flush();
  assert.deepEqual(actions, ['begin', 'hold', 'admit', 'abort', 'settle', 'reading', 'quit']);
  assert.deepEqual(failures, []);
  const handoffEvent = closeEvent();
  controller.handleEvent(handoffEvent);
  assert.equal(handoffEvent.prevented, false);
});

test('Task refusal leaves running extraction untouched and restores communication', async () => {
  const main = windowDouble();
  const task = windowDouble();
  const taskOwner = taskLifecycle.createController({
    dialog: { async showMessageBox() { return { response: 1 }; } },
    getDialogTexts: () => ({}),
  });
  taskOwner.attachWindow(task);
  const actions = [];
  const controller = termination.createController({
    isReady: () => true,
    getMainWindow: () => main,
    getTaskWindow: () => task,
    requestTaskClose: () => taskOwner.requestNativeClose(main),
    extractionCommand: async (command) => { actions.push(command); },
    abortExtraction: () => actions.push('abort'),
    terminateReadingTest: () => actions.push('reading'),
    getDependentWindows: () => [],
    setInteractionHeld: () => {},
    quit: () => actions.push('quit'),
    reportFailure: () => assert.fail('Task refusal is not a teardown failure'),
    log: { error() {} },
  });
  controller.handleEvent(closeEvent());
  await flush();
  taskOwner.handleCloseResponse({ sender: task.webContents }, { kind: 'normal', allow: false });
  await flush();
  assert.deepEqual(actions, ['begin', 'release']);
  assert.equal(main.isDestroyed(), false);
});

test('A dependent window that refuses to close cannot authorize the handoff', async () => {
  const main = windowDouble();
  const dependent = windowDouble();
  const actions = [];
  const controller = termination.createController({
    isReady: () => true,
    getMainWindow: () => main,
    getTaskWindow: () => null,
    requestTaskClose: async () => true,
    extractionCommand: async (command) => { actions.push(command); },
    abortExtraction() {},
    terminateReadingTest() {},
    getDependentWindows: () => [dependent],
    setInteractionHeld: (held) => actions.push(held ? 'hold' : 'release-hold'),
    quit: () => actions.push('quit'),
    reportFailure: () => actions.push('failure'),
    log: { error() {} },
    closeTimeoutMs: 5,
  });
  controller.handleEvent(closeEvent());
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.deepEqual(actions, ['begin', 'hold', 'admit', 'settle', 'failure', 'release-hold', 'release']);
  assert.equal(main.isDestroyed(), false);
  assert.equal(dependent.isDestroyed(), false);
});
