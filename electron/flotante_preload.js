// flotante_preload.js
'use strict';

const { contextBridge, ipcRenderer } = require('electron');


const api = {
  reportRendererI18nFailure: (payload) => ipcRenderer.send('renderer-i18n-failed', payload),
  // Receive status updates from main (channel is now 'crono-state')
  onState: (cb) => {
    const wrapper = (_e, state) => {
      try { cb(state); } catch (error) { console.error(error); }
    };
    ipcRenderer.on('crono-state', wrapper);
    return () => { try { ipcRenderer.removeListener('crono-state', wrapper); } catch (error) { console.error('removeListener error (crono-state):', error); } };
  },

  // Send command to main (main will process the command: toggle/reset/set)
  sendCommand: (cmd) => {
    ipcRenderer.send('flotante-command', cmd);
  },

  // Get settings to know the language (reuses handler from main)
  getSettings: () => ipcRenderer.invoke('get-settings'),
  onSettingsChanged: (cb) => {
    const listener = (_e, settings) => {
      try { cb(settings); } catch (error) { console.error('settings callback error:', error); }
    };
    ipcRenderer.on('settings-updated', listener);
    return () => { try { ipcRenderer.removeListener('settings-updated', listener); } catch (error) { console.error('removeListener error (settings-updated):', error); } };
  }
};

contextBridge.exposeInMainWorld('flotanteAPI', api);
