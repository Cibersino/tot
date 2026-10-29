// electron/preset_preload.js
'use strict';

const { contextBridge, ipcRenderer } = require('electron');


let lastInitData = null;
const initCallbacks = new Set();

// Always-on listener: main may send 'preset-init' before renderer registers onInit.
ipcRenderer.on('preset-init', (_e, data) => {
  lastInitData = data;

  // Deliver to all registered callbacks (isolate failures).
  for (const cb of Array.from(initCallbacks)) {
    try {
      cb(data);
    } catch (error) {
      console.error('preset-init callback error:', error);
    }
  }
});

function onInit(cb) {
  if (typeof cb !== 'function') {
    console.error('presetAPI.onInit called with non-function callback:', cb);
    return () => {};
  }

  initCallbacks.add(cb);

  // If init already arrived, replay it asynchronously to emulate event semantics
  // and to avoid surprising sync execution during registration.
  if (lastInitData !== null) {
    setTimeout(() => {
      if (!initCallbacks.has(cb)) return;
      try {
        cb(lastInitData);
      } catch (error) {
        console.error('preset-init replay callback error:', error);
      }
    }, 0);
  }

  // Unsubscribe (optional; safe even if unused).
  return () => {
    try {
      initCallbacks.delete(cb);
    } catch (error) {
      console.error('preset-init unsubscribe error:', error);
    }
  };
}

const api = {
  createPreset: (preset) => ipcRenderer.invoke('create-preset', preset),
  reportRendererI18nFailure: (payload) => ipcRenderer.send('renderer-i18n-failed', payload),

  // Reliable init hook
  onInit,

  // Edit preset (main will handle confirmation + silent delete + creation)
  editPreset: (originalName, newPreset) =>
    ipcRenderer.invoke('edit-preset', { originalName, newPreset }),

  getSettings: () => ipcRenderer.invoke('get-settings'),
  onSettingsChanged: (cb) => {
    const listener = (_e, settings) => {
      try { cb(settings); } catch (error) { console.error('settings callback error:', error); }
    };
    ipcRenderer.on('settings-updated', listener);
    return () => { try { ipcRenderer.removeListener('settings-updated', listener); } catch (error) { console.error('removeListener error (settings-updated):', error); } };
  },
};

contextBridge.exposeInMainWorld('presetAPI', api);
