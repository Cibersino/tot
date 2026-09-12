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
  reportTerminalState: (payload) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('taskEditorAPI.reportTerminalState requires an object');
    }
    ipcRenderer.send('task-editor-terminal', payload);
  },
  saveTaskList: (payload) => ipcRenderer.invoke('task-list-save', payload),
  deleteTaskList: (path) => ipcRenderer.invoke('task-list-delete', { path }),
  selectTaskFile: () => ipcRenderer.invoke('task-file-select'),
  selectTaskFiles: () => ipcRenderer.invoke('task-files-select'),
  selectTaskRowSnapshot: () => ipcRenderer.invoke('current-text-snapshot-select'),
  inspectTaskRowSnapshot: (snapshotRelPath) => ipcRenderer.invoke(
    'current-text-snapshot-inspect',
    { snapshotRelPath }
  ),
  loadTaskRowSnapshot: (snapshotRelPath) => ipcRenderer.invoke('current-text-snapshot-load', { snapshotRelPath }),
  listLibrary: () => ipcRenderer.invoke('task-library-list'),
  saveLibraryEntry: (entry) => ipcRenderer.invoke('task-library-save', { entry }),
  deleteLibraryEntry: (texto) => ipcRenderer.invoke('task-library-delete', { texto }),
  openTaskLink: (raw) => ipcRenderer.invoke('task-open-link', { raw }),
  getColumnLayout: () => ipcRenderer.invoke('task-columns-load'),
  saveColumnLayout: (record) => ipcRenderer.invoke('task-columns-save', { record }),
  setDirtyState: (payload) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)
      || typeof payload.dirty !== 'boolean' || !Number.isInteger(payload.initId)) {
      throw new Error('taskEditorAPI.setDirtyState requires dirty and initId');
    }
    ipcRenderer.send('task-editor-dirty-state', payload);
  },
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
  respondToClose: (payload) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new Error('taskEditorAPI.respondToClose requires an object');
    }
    ipcRenderer.send('task-editor-close-response', payload);
  },
};

contextBridge.exposeInMainWorld('taskEditorAPI', api);
