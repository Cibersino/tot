// electron/language_preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('languageAPI', {
  setLanguage: async (lang) => {
    // Persist language via main handler
    const res = await ipcRenderer.invoke('set-language', lang);
    // Signal selection so main can continue startup
    ipcRenderer.send('language-selected', lang);
    return res;
  }
});
