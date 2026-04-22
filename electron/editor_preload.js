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
  getWindowState: () => ipcRenderer.invoke('get-editor-window-state'),
  setSpellcheckEnabled: (enabled) => ipcRenderer.invoke('set-spellcheck-enabled', enabled),
  setEditorFontSizePx: (fontSizePx) => ipcRenderer.invoke('set-editor-font-size-px', fontSizePx),
  setMaximizedTextWidthPx: (textWidthPx) => ipcRenderer.invoke('set-editor-maximized-text-width-px', textWidthPx),
  onReplaceRequest: (cb) => subscribeWithUnsub(
    'editor-replace-request',
    cb,
    'editor-replace-request callback error:',
    'removeListener error (editor-replace-request):'
  ),
  sendReplaceResponse: (payload) => ipcRenderer.send('editor-replace-response', payload),
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
  onWindowStateChanged: (cb) => subscribeWithUnsub(
    'editor-window-state-changed',
    cb,
    'editor-window-state-changed callback error:',
    'removeListener error (editor-window-state-changed):'
  ),
  // Listener to force clear content (main will send 'editor-force-clear')
  onForceClear: (cb) => subscribeWithUnsub(
    'editor-force-clear',
    cb,
    'editor-force-clear callback error:',
    'removeListener error (editor-force-clear):'
  ),
  onReadingTestPrestartStateChanged: (cb) => subscribeWithUnsub(
    'reading-test-prestart-state-changed',
    cb,
    'reading-test-prestart-state-changed callback error:',
    'removeListener error (reading-test-prestart-state-changed):'
  )
};

contextBridge.exposeInMainWorld('editorAPI', api);
