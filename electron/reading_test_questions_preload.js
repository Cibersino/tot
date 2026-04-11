// electron/reading_test_questions_preload.js
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

let latestInitData = null;
const initDataListeners = new Set();

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
});
