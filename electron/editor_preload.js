// electron/editor_preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('manualAPI', {
  getCurrentText: () => ipcRenderer.invoke('get-current-text'),
  setCurrentText: (t) => ipcRenderer.invoke('set-current-text', t),
  getAppConfig: () => ipcRenderer.invoke('get-app-config'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  onInitText: (cb) => {
    ipcRenderer.on('manual-init-text', (_e, text) => cb(text));
  },
  onExternalUpdate: (cb) => {
    ipcRenderer.on('manual-text-updated', (_e, text) => cb(text));
  },
  // Listener to force clear content (main will send 'manual-force-clear')
  onForceClear: (cb) => {
    ipcRenderer.on('manual-force-clear', (_e, _payload) => cb(_payload));
  }
});
