// electron/language_preload.js
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const api = {
  setLanguage: async (lang) => {
    const tag = String(lang || '').trim().toLowerCase().replace(/_/g, '-');
    // Persist language via main handler
    const res = await ipcRenderer.invoke('set-language', tag);
    // Signal selection so main can continue startup
    ipcRenderer.send('language-selected', tag);
    return res;
  },
  getAvailableLanguages: () => ipcRenderer.invoke('get-available-languages'),
};

contextBridge.exposeInMainWorld('languageAPI', api);
