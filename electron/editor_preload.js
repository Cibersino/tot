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
  setCurrentText: (payload) => ipcRenderer.invoke('set-current-text', payload),
  getAppConfig: () => ipcRenderer.invoke('get-app-config'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  getWindowState: () => ipcRenderer.invoke('get-editor-window-state'),
  reportBasePresentationState: (payload) => ipcRenderer.send('editor-report-base-presentation-state', payload),
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
  onReadingTestPrestartStateChanged: (cb) => subscribeWithUnsub(
    'reading-test-prestart-state-changed',
    cb,
    'reading-test-prestart-state-changed callback error:',
    'removeListener error (reading-test-prestart-state-changed):'
  )
};

contextBridge.exposeInMainWorld('editorAPI', api);
