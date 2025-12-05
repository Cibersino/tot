// flotante_preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flotanteAPI', {
  // Recibe actualizaciones de estado desde main (ahora el canal es 'crono-state')
  onState: (cb) => {
    const wrapper = (_e, state) => {
      try { cb(state); } catch (e) { console.error(e); }
    };
    ipcRenderer.on('crono-state', wrapper);
    return () => { try { ipcRenderer.removeListener('crono-state', wrapper); } catch (e) { console.error('removeListener error (crono-state):', e); } };
  },

  // Enviar comando al main (main procesará el comando: toggle/reset/set)
  sendCommand: (cmd) => {
    ipcRenderer.send('flotante-command', cmd);
  },

  // Notificación de cierre del flotante (main emite 'flotante-closed' cuando cierra)
  onClose: (cb) => {
    const wrapper = () => { try { cb && cb(); } catch (e) { console.error(e); } };
    ipcRenderer.on('flotante-closed', wrapper);
    return () => { try { ipcRenderer.removeListener('flotante-closed', wrapper); } catch (e) { console.error('removeListener error (flotante-closed):', e); } };
  }
});
