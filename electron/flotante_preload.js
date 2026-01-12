// flotante_preload.js
'use strict';

const { contextBridge, ipcRenderer } = require('electron');


contextBridge.exposeInMainWorld('flotanteAPI', {
  // Receive status updates from main (channel is now 'crono-state')
  onState: (cb) => {
    const wrapper = (_e, state) => {
      try { cb(state); } catch (err) { console.error(err); }
    };
    ipcRenderer.on('crono-state', wrapper);
    return () => { try { ipcRenderer.removeListener('crono-state', wrapper); } catch (err) { console.error('removeListener error (crono-state):', err); } };
  },

  // Send command to main (main will process the command: toggle/reset/set)
  sendCommand: (cmd) => {
    ipcRenderer.send('flotante-command', cmd);
  },

  // Get settings to know the language (reuses handler from main)
  getSettings: () => ipcRenderer.invoke('get-settings'),
  onSettingsChanged: (cb) => {
    const listener = (_e, settings) => {
      try { cb(settings); } catch (err) { console.error('settings callback error:', err); }
    };
    ipcRenderer.on('settings-updated', listener);
    return () => { try { ipcRenderer.removeListener('settings-updated', listener); } catch (err) { console.error('removeListener error (settings-updated):', err); } };
  }
});
