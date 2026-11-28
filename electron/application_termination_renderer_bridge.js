// electron/application_termination_renderer_bridge.js
'use strict';

// Acknowledges the Main renderer's extraction lifecycle work, rather than treating delivery of an IPC message as completion.
function createBridge({ ipcMain, resolveMainWindow }) {
  const pending = new Map();
  let nextId = 0;

  ipcMain.on('application-termination-response', (event, response) => {
    const request = response && pending.get(response.id);
    if (!request || event.sender !== request.contents) return;
    request.finish(response.ok === true ? null : new Error('Main renderer termination command failed'));
  });

  function send(command) {
    const win = resolveMainWindow();
    if (!win || win.isDestroyed() || !win.webContents || win.webContents.isDestroyed()
      || (typeof win.webContents.isCrashed === 'function' && win.webContents.isCrashed())) {
      return Promise.reject(new Error('Main renderer unavailable during termination'));
    }
    const contents = win.webContents;
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        pending.delete(id);
        contents.removeListener('destroyed', onUnavailable);
        contents.removeListener('render-process-gone', onUnavailable);
      };
      const finish = (error) => {
        if (!pending.has(id)) return;
        cleanup();
        if (error) reject(error);
        else resolve();
      };
      const onUnavailable = () => finish(new Error('Main renderer became unavailable during termination'));
      pending.set(id, { contents, finish });
      contents.once('destroyed', onUnavailable);
      contents.once('render-process-gone', onUnavailable);
      try {
        contents.send('application-termination-command', { id, command });
      } catch (error) {
        finish(error);
      }
    });
  }

  return { send };
}

module.exports = { createBridge };
