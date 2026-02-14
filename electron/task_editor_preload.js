// electron/task_editor_preload.js
'use strict';

const { contextBridge, ipcRenderer } = require('electron');


let lastInitData = null;
const initCallbacks = new Set();

// Always-on listener: main may send 'task-editor-init' before renderer registers onInit.
ipcRenderer.on('task-editor-init', (_e, data) => {
  lastInitData = data;
  for (const cb of Array.from(initCallbacks)) {
    try {
      cb(data);
    } catch (err) {
      console.error('task-editor-init callback error:', err);
    }
  }
});

function onInit(cb) {
  if (typeof cb !== 'function') {
    console.error('taskEditorAPI.onInit called with non-function callback:', cb);
    return () => {};
  }

  initCallbacks.add(cb);

  if (lastInitData !== null) {
    setTimeout(() => {
      if (!initCallbacks.has(cb)) return;
      try {
        cb(lastInitData);
      } catch (err) {
        console.error('task-editor-init replay callback error:', err);
      }
    }, 0);
  }

  return () => {
    try {
      initCallbacks.delete(cb);
    } catch (err) {
      console.error('task-editor-init unsubscribe error:', err);
    }
  };
}

const api = {
  onInit,
  saveTaskList: (payload) => ipcRenderer.invoke('task-list-save', payload),
  deleteTaskList: (path) => ipcRenderer.invoke('task-list-delete', { path }),
  listLibrary: () => ipcRenderer.invoke('task-library-list'),
  saveLibraryRow: (row, includeComment) => ipcRenderer.invoke('task-library-save', { row, includeComment }),
  deleteLibraryEntry: (texto) => ipcRenderer.invoke('task-library-delete', { texto }),
  openTaskLink: (raw) => ipcRenderer.invoke('task-open-link', { raw }),
  getColumnWidths: () => ipcRenderer.invoke('task-columns-load'),
  saveColumnWidths: (widths) => ipcRenderer.invoke('task-columns-save', { widths }),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  onSettingsChanged: (cb) => {
    const listener = (_e, settings) => {
      try { cb(settings); } catch (err) { console.error('settings callback error:', err); }
    };
    ipcRenderer.on('settings-updated', listener);
    return () => { try { ipcRenderer.removeListener('settings-updated', listener); } catch (err) { console.error('removeListener error (settings-updated):', err); } };
  },
  onRequestClose: (cb) => {
    const listener = () => { try { cb(); } catch (err) { console.error('task editor close request error:', err); } };
    ipcRenderer.on('task-editor-request-close', listener);
    return () => { try { ipcRenderer.removeListener('task-editor-request-close', listener); } catch (err) { console.error('removeListener error (task-editor-request-close):', err); } };
  },
  confirmClose: () => ipcRenderer.send('task-editor-confirm-close'),
};

contextBridge.exposeInMainWorld('taskEditorAPI', api);
