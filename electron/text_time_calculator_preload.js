// electron/text_time_calculator_preload.js
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const api = {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  reportRendererI18nFailure: (payload) => ipcRenderer.send('renderer-i18n-failed', payload),
  onSettingsChanged: (cb) => {
    const listener = (_event, settings) => {
      try {
        cb(settings);
      } catch (error) {
        console.error('settings callback error:', error);
      }
    };

    ipcRenderer.on('settings-updated', listener);

    return () => {
      try {
        ipcRenderer.removeListener('settings-updated', listener);
      } catch (error) {
        console.error('removeListener error (settings-updated):', error);
      }
    };
  },
};

contextBridge.exposeInMainWorld('textTimeCalculatorAPI', api);
