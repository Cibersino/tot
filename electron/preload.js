// electron/preload.js
const { contextBridge, clipboard, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  readClipboard: () => clipboard.readText(),
  openEditor: () => ipcRenderer.invoke('open-editor'),
  // openPresetModal ahora acepta un argumento opcional: número (wpm) o un objeto { wpm, mode, preset }
  openPresetModal: (payload) => ipcRenderer.invoke('open-preset-modal', payload),
  getCurrentText: () => ipcRenderer.invoke('get-current-text'),
  setCurrentText: (text) => ipcRenderer.invoke('set-current-text', text),
  onCurrentTextUpdated: (cb) => {
    ipcRenderer.on('current-text-updated', (_e, text) => cb(text));
  },

  // Centralizado: solicitar settings al main process (lee desde disco en el main)
  getSettings: () => ipcRenderer.invoke('get-settings'),

  // Nuevo: escucha de presets creados (notificación desde main)
  onPresetCreated: (cb) => {
    ipcRenderer.on('preset-created', (_e, preset) => cb(preset));
  },

  // NEW: obtener presets por defecto desde el main (electron/presets/*.js)
  getDefaultPresets: () => ipcRenderer.invoke('get-default-presets'),

  // NEW: solicitar borrado de preset (main mostrará diálogos nativos y realizará persistencia)
  requestDeletePreset: (name) => ipcRenderer.invoke('request-delete-preset', name),

  // NEW: solicitar restauración de presets por defecto (main mostrará diálogo nativo y realizará persistencia)
  requestRestoreDefaults: () => ipcRenderer.invoke('request-restore-defaults'),

  // NEW: notify renderer -> main para mostrar "no selection to edit" dialog
  notifyNoSelectionEdit: () => ipcRenderer.invoke('notify-no-selection-edit'),

  // NEW: force clear editor (invocado por renderer cuando el usuario presiona "Vaciar" en la pantalla principal)
  forceClearEditor: () => ipcRenderer.invoke('force-clear-editor')
});
