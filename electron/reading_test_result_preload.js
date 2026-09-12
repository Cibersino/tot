// electron/reading_test_result_preload.js
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

let latestInitData = null;
const initDataListeners = new Set();

ipcRenderer.on('reading-test-result-init', (_event, payload) => {
  latestInitData = payload;
  for (const listener of initDataListeners) {
    try {
      listener(payload);
    } catch (err) {
      console.error('reading-test-result-init callback error:', err);
    }
  }
});

contextBridge.exposeInMainWorld('readingTestResultAPI', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  reportRendererI18nFailure: (payload) => ipcRenderer.send('renderer-i18n-failed', payload),
  onSettingsChanged: (cb) => {
    if (typeof cb !== 'function') {
      console.error('readingTestResultAPI.onSettingsChanged called with non-function callback:', cb);
      return () => {};
    }
    const listener = (_event, settings) => {
      try {
        cb(settings);
      } catch (err) {
        console.error('reading-test-result settings callback error:', err);
      }
    };
    ipcRenderer.on('settings-updated', listener);
    return () => {
      try {
        ipcRenderer.removeListener('settings-updated', listener);
      } catch (err) {
        console.error('removeListener error (reading-test-result settings-updated):', err);
      }
    };
  },
  onInitData: (cb) => {
    if (typeof cb !== 'function') {
      console.error('readingTestResultAPI.onInitData called with non-function callback:', cb);
      return () => {};
    }

    initDataListeners.add(cb);

    if (latestInitData !== null) {
      try {
        cb(latestInitData);
      } catch (err) {
        console.error('reading-test-result-init callback error:', err);
      }
    }

    return () => {
      try {
        initDataListeners.delete(cb);
      } catch (err) {
        console.error('reading-test-result-init unsubscribe failed (ignored):', err);
      }
    };
  },
});
