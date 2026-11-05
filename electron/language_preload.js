// electron/language_preload.js
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const api = {
  setLanguage: async (lang) => {
    const languageId = typeof lang === 'string' ? lang.trim() : '';
    const res = await ipcRenderer.invoke('set-language', languageId);
    if (res && res.ok === true) ipcRenderer.send('language-selected', res.language);
    return res;
  },
  getAvailableLanguages: () => ipcRenderer.invoke('get-available-languages'),
  getCurrentLanguage: () => ipcRenderer.invoke('get-current-language'),
};

contextBridge.exposeInMainWorld('languageAPI', api);
