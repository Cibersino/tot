// electron/preset_preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('presetAPI', {
  createPreset: (preset) => ipcRenderer.invoke('create-preset', preset),
  // Exponer un listener para recibir datos iniciales desde main ('preset-init')
  onInit: (cb) => {
    ipcRenderer.on('preset-init', (_e, data) => cb(data));
  },
  // NEW: edit preset (main will handle confirmation + silent delete + creation)
  editPreset: (originalName, newPreset) => ipcRenderer.invoke('edit-preset', { originalName, newPreset }),
  getSettings: () => ipcRenderer.invoke('get-settings')
});
