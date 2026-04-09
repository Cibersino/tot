// electron/editor_preload.js
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribeWithUnsub(channel, cb, callbackErrorMessage, removeErrorMessage) {
  const listener = (_event, payload) => {
    try {
      cb(payload);
    } catch (err) {
      console.error(callbackErrorMessage, err);
    }
  };

  ipcRenderer.on(channel, listener);

  return () => {
    try {
      ipcRenderer.removeListener(channel, listener);
    } catch (err) {
      console.error(removeErrorMessage, err);
    }
  };
}

const api = {
  getCurrentText: () => ipcRenderer.invoke('get-current-text'),
  setCurrentText: (text) => ipcRenderer.invoke('set-current-text', text),
  getAppConfig: () => ipcRenderer.invoke('get-app-config'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSpellcheckEnabled: (enabled) => ipcRenderer.invoke('set-spellcheck-enabled', enabled),
  setEditorFontSizePx: (fontSizePx) => ipcRenderer.invoke('set-editor-font-size-px', fontSizePx),
  onInitText: (cb) => subscribeWithUnsub(
    'editor-init-text',
    cb,
    'editor-init-text callback error:',
    'removeListener error (editor-init-text):'
  ),
  onExternalUpdate: (cb) => subscribeWithUnsub(
    'editor-text-updated',
    cb,
    'editor-text-updated callback error:',
    'removeListener error (editor-text-updated):'
  ),
  onSettingsChanged: (cb) => subscribeWithUnsub(
    'settings-updated',
    cb,
    'settings callback error:',
    'removeListener error (settings-updated):'
  ),
  // Listener to force clear content (main will send 'editor-force-clear')
  onForceClear: (cb) => subscribeWithUnsub(
    'editor-force-clear',
    cb,
    'editor-force-clear callback error:',
    'removeListener error (editor-force-clear):'
  ),
  onReadingTestCountdown: (cb) => subscribeWithUnsub(
    'reading-test-prestart-countdown',
    cb,
    'reading-test-prestart-countdown callback error:',
    'removeListener error (reading-test-prestart-countdown):'
  )
};

contextBridge.exposeInMainWorld('editorAPI', api);
