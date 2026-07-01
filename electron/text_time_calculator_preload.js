// electron/text_time_calculator_preload.js
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const api = {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  onSettingsChanged: (cb) => {
    const listener = (_event, settings) => {
      try {
        cb(settings);
      } catch (err) {
        console.error('settings callback error:', err);
      }
    };

    ipcRenderer.on('settings-updated', listener);

    return () => {
      try {
        ipcRenderer.removeListener('settings-updated', listener);
      } catch (err) {
        console.error('removeListener error (settings-updated):', err);
      }
    };
  },
};

contextBridge.exposeInMainWorld('textTimeCalculatorAPI', api);
