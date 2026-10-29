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
    } catch (error) {
      console.error('reading-test-questions-init callback error:', error);
    }
  }
});

contextBridge.exposeInMainWorld('readingTestQuestionsAPI', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  reportRendererI18nFailure: (payload) => ipcRenderer.send('renderer-i18n-failed', payload),
  onSettingsChanged: (cb) => {
    if (typeof cb !== 'function') {
      console.error('readingTestQuestionsAPI.onSettingsChanged called with non-function callback:', cb);
      return () => {};
    }
    const listener = (_event, settings) => {
      try {
        cb(settings);
      } catch (error) {
        console.error('reading-test-questions settings callback error:', error);
      }
    };
    ipcRenderer.on('settings-updated', listener);
    return () => {
      try {
        ipcRenderer.removeListener('settings-updated', listener);
      } catch (error) {
        console.error('removeListener error (reading-test-questions settings-updated):', error);
      }
    };
  },
  onInitData: (cb) => {
    if (typeof cb !== 'function') {
      console.error('readingTestQuestionsAPI.onInitData called with non-function callback:', cb);
      return () => {};
    }

    initDataListeners.add(cb);

    if (latestInitData !== null) {
      try {
        cb(latestInitData);
      } catch (error) {
        console.error('reading-test-questions-init callback error:', error);
      }
    }

    return () => {
      try {
        initDataListeners.delete(cb);
      } catch (error) {
        console.error('removeListener error (reading-test-questions-init):', error);
      }
    };
  },
});
