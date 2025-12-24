// electron/preset_preload.js
const { contextBridge, ipcRenderer } = require('electron');
const { initDeadcodeAuditPreload } = require('./deadcode_audit_preload');
initDeadcodeAuditPreload(ipcRenderer);

contextBridge.exposeInMainWorld('presetAPI', {
  createPreset: (preset) => ipcRenderer.invoke('create-preset', preset),
  // Expose a listener to receive initial data from main ('preset-init')
  onInit: (cb) => {
    ipcRenderer.on('preset-init', (_e, data) => cb(data));
  },
  // Edit preset (main will handle confirmation + silent delete + creation)
  editPreset: (originalName, newPreset) => ipcRenderer.invoke('edit-preset', { originalName, newPreset }),
  getSettings: () => ipcRenderer.invoke('get-settings')
});
