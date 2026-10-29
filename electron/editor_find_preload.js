// electron/editor_find_preload.js
'use strict';

const { contextBridge, ipcRenderer } = require('electron');


let lastInitPayload = null;
const initCallbacks = new Set();

let lastStatePayload = null;
const stateCallbacks = new Set();

ipcRenderer.on('editor-find-init', (_event, payload) => {
  lastInitPayload = payload;
  for (const cb of Array.from(initCallbacks)) {
    try {
      cb(payload);
    } catch (error) {
      console.error('editor-find-init callback error:', error);
    }
  }
});

ipcRenderer.on('editor-find-state', (_event, payload) => {
  lastStatePayload = payload;
  for (const cb of Array.from(stateCallbacks)) {
    try {
      cb(payload);
    } catch (error) {
      console.error('editor-find-state callback error:', error);
    }
  }
});

function onInit(cb) {
  if (typeof cb !== 'function') {
    console.error('editorFindAPI.onInit called with non-function callback:', cb);
    return () => {};
  }

  initCallbacks.add(cb);
  if (lastInitPayload !== null) {
    setTimeout(() => {
      if (!initCallbacks.has(cb)) return;
      try {
        cb(lastInitPayload);
      } catch (error) {
        console.error('editor-find-init replay callback error:', error);
      }
    }, 0);
  }

  return () => {
    try {
      initCallbacks.delete(cb);
    } catch (error) {
      console.error('editor-find-init unsubscribe error:', error);
    }
  };
}

function onState(cb) {
  if (typeof cb !== 'function') {
    console.error('editorFindAPI.onState called with non-function callback:', cb);
    return () => {};
  }

  stateCallbacks.add(cb);
  if (lastStatePayload !== null) {
    setTimeout(() => {
      if (!stateCallbacks.has(cb)) return;
      try {
        cb(lastStatePayload);
      } catch (error) {
        console.error('editor-find-state replay callback error:', error);
      }
    }, 0);
  }

  return () => {
    try {
      stateCallbacks.delete(cb);
    } catch (error) {
      console.error('editor-find-state unsubscribe error:', error);
    }
  };
}

const api = {
  setQuery: (query) => ipcRenderer.invoke('editor-find-set-query', query),
  reportRendererI18nFailure: (payload) => ipcRenderer.send('renderer-i18n-failed', payload),
  next: () => ipcRenderer.invoke('editor-find-next'),
  prev: () => ipcRenderer.invoke('editor-find-prev'),
  replaceCurrent: (replacement) => ipcRenderer.invoke('editor-find-replace-current', replacement),
  replaceAll: (replacement) => ipcRenderer.invoke('editor-find-replace-all', replacement),
  toggleExpanded: () => ipcRenderer.invoke('editor-find-toggle-expanded'),
  close: () => ipcRenderer.invoke('editor-find-close'),
  onInit,
  onState,
  onFocusTarget: (cb) => {
    if (typeof cb !== 'function') {
      console.error('editorFindAPI.onFocusTarget called with non-function callback:', cb);
      return () => {};
    }
    const listener = (_event, payload) => {
      try {
        cb(payload || {});
      } catch (error) {
        console.error('editor-find-focus-target callback error:', error);
      }
    };
    ipcRenderer.on('editor-find-focus-target', listener);
    return () => {
      try {
        ipcRenderer.removeListener('editor-find-focus-target', listener);
      } catch (error) {
        console.error('editor-find-focus-target unsubscribe error:', error);
      }
    };
  },
  getSettings: () => ipcRenderer.invoke('get-settings'),
  onSettingsChanged: (cb) => {
    if (typeof cb !== 'function') {
      console.error('editorFindAPI.onSettingsChanged called with non-function callback:', cb);
      return () => {};
    }
    const listener = (_event, settings) => {
      try {
        cb(settings);
      } catch (error) {
        console.error('editor-find settings callback error:', error);
      }
    };
    ipcRenderer.on('settings-updated', listener);
    return () => {
      try {
        ipcRenderer.removeListener('settings-updated', listener);
      } catch (error) {
        console.error('editor-find settings unsubscribe error:', error);
      }
    };
  },
};

contextBridge.exposeInMainWorld('editorFindAPI', api);
