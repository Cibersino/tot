// electron/manual_preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('manualAPI', {
  getCurrentText: () => ipcRenderer.invoke('get-current-text'),
  setCurrentText: (t) => ipcRenderer.invoke('set-current-text', t),
  onInitText: (cb) => {
    ipcRenderer.on('manual-init-text', (_e, text) => cb(text));
  },
  onExternalUpdate: (cb) => {
    ipcRenderer.on('manual-text-updated', (_e, text) => cb(text));
  },
  // NEW: listener to force clear content (main will send 'manual-force-clear')
  onForceClear: (cb) => {
    ipcRenderer.on('manual-force-clear', (_e, _payload) => cb(_payload));
  }
});
