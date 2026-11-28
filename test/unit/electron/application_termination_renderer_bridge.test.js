'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createBridge } = require('../../../electron/application_termination_renderer_bridge');

test('termination acknowledgments must come from the requested Main renderer', async () => {
  const ipc = new EventEmitter();
  const contents = new EventEmitter();
  contents.isDestroyed = () => false;
  let request;
  contents.send = (_channel, payload) => { request = payload; };
  const bridge = createBridge({
    ipcMain: ipc,
    resolveMainWindow: () => ({ webContents: contents, isDestroyed: () => false }),
  });
  let settled = false;
  const result = bridge.send('settle').then(() => { settled = true; });
  ipc.emit('application-termination-response', { sender: {} }, { id: request.id, ok: true });
  await Promise.resolve();
  assert.equal(settled, false);
  ipc.emit('application-termination-response', { sender: contents }, { id: request.id, ok: true });
  await result;
  assert.equal(settled, true);
  assert.equal(contents.listenerCount('destroyed'), 0);
  assert.equal(contents.listenerCount('render-process-gone'), 0);
});

test('a renderer failure rejects a pending termination command', async () => {
  const ipc = new EventEmitter();
  const contents = new EventEmitter();
  contents.isDestroyed = () => false;
  contents.send = () => {};
  const bridge = createBridge({
    ipcMain: ipc,
    resolveMainWindow: () => ({ webContents: contents, isDestroyed: () => false }),
  });
  const result = bridge.send('settle');
  contents.emit('render-process-gone');
  await assert.rejects(result, /renderer became unavailable/);
  assert.equal(contents.listenerCount('destroyed'), 0);
});
