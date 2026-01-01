// flotante_preload.js
'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const Log = require('./log');

const log = Log.get('flotante-preload');

contextBridge.exposeInMainWorld('flotanteAPI', {
  // Receive status updates from main (channel is now 'crono-state')
  onState: (cb) => {
    const wrapper = (_e, state) => {
      try { cb(state); } catch (err) { log.error(err); }
    };
    ipcRenderer.on('crono-state', wrapper);
    return () => { try { ipcRenderer.removeListener('crono-state', wrapper); } catch (err) { log.error('removeListener error (crono-state):', err); } };
  },

  // Send command to main (main will process the command: toggle/reset/set)
  sendCommand: (cmd) => {
    ipcRenderer.send('flotante-command', cmd);
  },

  // Get settings to know the language (reuses handler from main)
  getSettings: () => ipcRenderer.invoke('get-settings')
});
