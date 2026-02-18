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
    } catch (err) {
      console.error('editor-find-init callback error:', err);
    }
  }
});

ipcRenderer.on('editor-find-state', (_event, payload) => {
  lastStatePayload = payload;
  for (const cb of Array.from(stateCallbacks)) {
    try {
      cb(payload);
    } catch (err) {
      console.error('editor-find-state callback error:', err);
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
      } catch (err) {
        console.error('editor-find-init replay callback error:', err);
      }
    }, 0);
  }

  return () => {
    try {
      initCallbacks.delete(cb);
    } catch (err) {
      console.error('editor-find-init unsubscribe error:', err);
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
      } catch (err) {
        console.error('editor-find-state replay callback error:', err);
      }
    }, 0);
  }

  return () => {
    try {
      stateCallbacks.delete(cb);
    } catch (err) {
      console.error('editor-find-state unsubscribe error:', err);
    }
  };
}

const api = {
  setQuery: (query) => ipcRenderer.invoke('editor-find-set-query', query),
  next: () => ipcRenderer.invoke('editor-find-next'),
  prev: () => ipcRenderer.invoke('editor-find-prev'),
  close: () => ipcRenderer.invoke('editor-find-close'),
  onInit,
  onState,
  onFocusQuery: (cb) => {
    if (typeof cb !== 'function') {
      console.error('editorFindAPI.onFocusQuery called with non-function callback:', cb);
      return () => {};
    }
    const listener = (_event, payload) => {
      try {
        cb(payload || {});
      } catch (err) {
        console.error('editor-find-focus-query callback error:', err);
      }
    };
    ipcRenderer.on('editor-find-focus-query', listener);
    return () => {
      try {
        ipcRenderer.removeListener('editor-find-focus-query', listener);
      } catch (err) {
        console.error('editor-find-focus-query unsubscribe error:', err);
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
      } catch (err) {
        console.error('editor-find settings callback error:', err);
      }
    };
    ipcRenderer.on('settings-updated', listener);
    return () => {
      try {
        ipcRenderer.removeListener('settings-updated', listener);
      } catch (err) {
        console.error('editor-find settings unsubscribe error:', err);
      }
    };
  },
};

contextBridge.exposeInMainWorld('editorFindAPI', api);

