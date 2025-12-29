// flotante_preload.js
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

  // Flotante closing notification (main emits 'flotante-closed' when closing)
  onClose: (cb) => {
    const wrapper = () => { try { cb && cb(); } catch (err) { console.error(err); } };
    ipcRenderer.on('flotante-closed', wrapper);
    return () => { try { ipcRenderer.removeListener('flotante-closed', wrapper); } catch (err) { console.error('removeListener error (flotante-closed):', err); } };
  },

  // Get settings to know the language (reuses handler from main)
  getSettings: () => ipcRenderer.invoke('get-settings')
});
