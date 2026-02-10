// electron/editor_preload.js
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const api = {
  getCurrentText: () => ipcRenderer.invoke('get-current-text'),
  setCurrentText: (text) => ipcRenderer.invoke('set-current-text', text),
  getAppConfig: () => ipcRenderer.invoke('get-app-config'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  onInitText: (cb) => {
    ipcRenderer.on('editor-init-text', (_e, text) => cb(text));
  },
  onExternalUpdate: (cb) => {
    ipcRenderer.on('editor-text-updated', (_e, text) => cb(text));
  },
  onSettingsChanged: (cb) => {
    const listener = (_e, settings) => {
      try { cb(settings); } catch (err) { console.error('settings callback error:', err); }
    };
    ipcRenderer.on('settings-updated', listener);
    return () => { try { ipcRenderer.removeListener('settings-updated', listener); } catch (err) { console.error('removeListener error (settings-updated):', err); } };
  },
  // Listener to force clear content (main will send 'editor-force-clear')
  onForceClear: (cb) => {
    ipcRenderer.on('editor-force-clear', (_e, payload) => cb(payload));
  }
};

contextBridge.exposeInMainWorld('editorAPI', api);
