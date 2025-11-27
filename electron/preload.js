// electron/preload.js
const { contextBridge, clipboard, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  readClipboard: () => clipboard.readText(),
  openEditor: () => ipcRenderer.invoke('open-editor'),
  // openPresetModal acepta un argumento opcional: número (wpm) o un objeto { wpm, mode, preset }
  openPresetModal: (payload) => ipcRenderer.invoke('open-preset-modal', payload),
  getCurrentText: () => ipcRenderer.invoke('get-current-text'),
  setCurrentText: (text) => ipcRenderer.invoke('set-current-text', text),
  onCurrentTextUpdated: (cb) => {
    ipcRenderer.on('current-text-updated', (_e, text) => cb(text));
  },

  // Centralizado: solicitar settings al main process (lee desde disco en el main)
  getSettings: () => ipcRenderer.invoke('get-settings'),

  // Escucha de presets creados (notificación desde main)
  onPresetCreated: (cb) => {
    ipcRenderer.on('preset-created', (_e, preset) => cb(preset));
  },

  // Obtener presets por defecto desde el main (electron/presets/*.js)
  getDefaultPresets: () => ipcRenderer.invoke('get-default-presets'),

  // Solicitar borrado de preset (main mostrará diálogos nativos y realizará persistencia)
  requestDeletePreset: (name) => ipcRenderer.invoke('request-delete-preset', name),

  // Solicitar restauración de presets por defecto (main mostrará diálogo nativo y realizará persistencia)
  requestRestoreDefaults: () => ipcRenderer.invoke('request-restore-defaults'),

  // Notify renderer -> main para mostrar "no selection to edit" dialog
  notifyNoSelectionEdit: () => ipcRenderer.invoke('notify-no-selection-edit'),

  // Force clear editor (invocado por renderer cuando el usuario presiona "Vaciar" en la pantalla principal)
  forceClearEditor: () => ipcRenderer.invoke('force-clear-editor'),

  // ======================= NUEVO: listener estable para barra superior =======================
  onMenuClick: (cb) => {
    const channel = 'menu-click';
    const wrapper = (_e, payload) => {
      try { cb(payload); } catch (err) { console.error('menuAPI callback error:', err); }
    };
    ipcRenderer.on(channel, wrapper);

    // devolver una función para desuscribirse
    return () => {
      try {
        ipcRenderer.removeListener(channel, wrapper);
      } catch (e) {
        console.error('Error removing menu listener:', e);
      }
    };
  }
});
