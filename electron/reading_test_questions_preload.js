'use strict';

const { contextBridge, ipcRenderer } = require('electron');

let latestInitData = null;
const initDataListeners = new Set();

function subscribeWithUnsub(channel, cb, callbackErrorMessage, removeErrorMessage) {
  const listener = (_event, payload) => {
    try {
      cb(payload);
    } catch (err) {
      console.error(callbackErrorMessage, err);
    }
  };

  ipcRenderer.on(channel, listener);

  return () => {
    try {
      ipcRenderer.removeListener(channel, listener);
    } catch (err) {
      console.error(removeErrorMessage, err);
    }
  };
}

ipcRenderer.on('reading-test-questions-init', (_event, payload) => {
  latestInitData = payload;
  for (const listener of initDataListeners) {
    try {
      listener(payload);
    } catch (err) {
      console.error('reading-test-questions-init callback error:', err);
    }
  }
});

contextBridge.exposeInMainWorld('readingTestQuestionsAPI', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  onInitData: (cb) => {
    if (typeof cb !== 'function') {
      console.error('readingTestQuestionsAPI.onInitData called with non-function callback:', cb);
      return () => {};
    }

    initDataListeners.add(cb);

    if (latestInitData !== null) {
      try {
        cb(latestInitData);
      } catch (err) {
        console.error('reading-test-questions-init callback error:', err);
      }
    }

    return () => {
      try {
        initDataListeners.delete(cb);
      } catch (err) {
        console.error('removeListener error (reading-test-questions-init):', err);
      }
    };
  },
  onSettingsChanged: (cb) => subscribeWithUnsub(
    'settings-updated',
    cb,
    'settings-updated callback error:',
    'removeListener error (settings-updated):'
  ),
});
