// flotante_preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flotanteAPI', {
  // Recibe actualizaciones de estado desde main (reenviadas desde renderer principal)
  onState: (cb) => {
    ipcRenderer.on('flotante-state', (event, state) => {
      try { cb(state); } catch (e) { console.error(e); }
    });
  },
  // Enviar comando al main (que reenviará al renderer principal)
  sendCommand: (cmd) => {
    ipcRenderer.send('flotante-command', cmd);
  },
  // Opción: permitir que main indique que flotante se va a cerrar (no obligatorio)
  onClose: (cb) => {
    ipcRenderer.on('flotante-close', () => cb && cb());
  }
});
