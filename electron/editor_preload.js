// electron/editor_preload.js
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('editorAPI', {
  getCurrentText: () => ipcRenderer.invoke('get-current-text'),
  setCurrentText: (t) => ipcRenderer.invoke('set-current-text', t),
  getAppConfig: () => ipcRenderer.invoke('get-app-config'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  onInitText: (cb) => {
    ipcRenderer.on('editor-init-text', (_e, text) => cb(text));
  },
  onExternalUpdate: (cb) => {
    ipcRenderer.on('editor-text-updated', (_e, text) => cb(text));
  },
  // Listener to force clear content (main will send 'editor-force-clear')
  onForceClear: (cb) => {
    ipcRenderer.on('editor-force-clear', (_e, _payload) => cb(_payload));
  }
});
