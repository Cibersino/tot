// electron/preload.js
'use strict';

const { contextBridge, ipcRenderer } = require('electron');


const subscribeWithUnsub = (channel, listener, removeErrorMessage) => {
    ipcRenderer.on(channel, listener);
    return () => {
        try {
            ipcRenderer.removeListener(channel, listener);
        } catch (err) {
            console.error(removeErrorMessage, err);
        }
    };
};

const api = {
    // Clipboard / editor / presets / settings (we preserve all existing settings)
    readClipboard: () => ipcRenderer.invoke('clipboard-read-text'),
    openEditor: () => ipcRenderer.invoke('open-editor'),
    checkForUpdates: (manual = false) => ipcRenderer.invoke('check-for-updates', { manual }),
    // openPresetModal accepts an optional argument: number (wpm) or object { wpm, mode, preset }
    openPresetModal: (payload) => ipcRenderer.invoke('open-preset-modal', payload),
    openDefaultPresetsFolder: () => ipcRenderer.invoke('open-default-presets-folder'),
    getCurrentText: () => ipcRenderer.invoke('get-current-text'),
    setCurrentText: (text) => ipcRenderer.invoke('set-current-text', text),
    saveCurrentTextSnapshot: () => ipcRenderer.invoke('current-text-snapshot-save'),
    loadCurrentTextSnapshot: () => ipcRenderer.invoke('current-text-snapshot-load'),
    getAppConfig: () => ipcRenderer.invoke('get-app-config'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getAppRuntimeInfo: () => ipcRenderer.invoke('get-app-runtime-info'),
    openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
    openAppDoc: (docKey) => ipcRenderer.invoke('open-app-doc', docKey),
    onCurrentTextUpdated: (cb) => {
        ipcRenderer.on('current-text-updated', (_e, text) => cb(text));
    },

    // Centralized: request settings to the main process (reads from disk in the main)
    getSettings: () => ipcRenderer.invoke('get-settings'),

    // Listening to created presets (notification from main)
    onPresetCreated: (cb) => {
        ipcRenderer.on('preset-created', (_e, preset) => cb(preset));
    },

    // Get default presets from main (electron/presets/*.js)
    getDefaultPresets: () => ipcRenderer.invoke('get-default-presets'),

    // Persist selected preset per language (settings)
    setSelectedPreset: (name) => ipcRenderer.invoke('set-selected-preset', name),

    // Request preset deletion (main will show native dialogs and perform persistence)
    requestDeletePreset: (name) => ipcRenderer.invoke('request-delete-preset', name),

    // Request restoration of default presets (main will show native dialog and perform persistence)
    requestRestoreDefaults: () => ipcRenderer.invoke('request-restore-defaults'),

    // Notify renderer -> main to show 'no selection to edit' dialog
    notifyNoSelectionEdit: () => ipcRenderer.invoke('notify-no-selection-edit'),

    // Force clear editor (invoked by renderer when user presses 'Empty' in the main screen)
    forceClearEditor: () => ipcRenderer.invoke('force-clear-editor'),

    // ======================= Stable listener for top bar =======================
    onMenuClick: (cb) => {
        const wrapper = (_e, payload) => {
            try { cb(payload); } catch (err) { console.error('menuAPI callback error:', err); }
        };
        // return an unsubscribe function
        return subscribeWithUnsub('menu-click', wrapper, 'Error removing menu listener:');
    },

    setModeConteo: (mode) => ipcRenderer.invoke('set-mode-conteo', mode),

    onSettingsChanged: (cb) => {
        const listener = (ev, newSettings) => {
            try { cb(newSettings); } catch (err) { console.error('settings callback error:', err); }
        };
        // return function to remove listener if used by caller
        return subscribeWithUnsub('settings-updated', listener, 'removeListener error:');
    },

    // Central Crono API (renderer <-> main)
    sendCronoToggle: () => ipcRenderer.send('crono-toggle'),
    sendCronoReset: () => ipcRenderer.send('crono-reset'),
    setCronoElapsed: (ms) => ipcRenderer.send('crono-set-elapsed', ms),
    getCronoState: () => ipcRenderer.invoke('crono-get-state'),
    onCronoState: (cb) => {
        const wrapper = (_e, state) => { try { cb(state); } catch (err) { console.error('onCronoState callback error:', err); } };
        return subscribeWithUnsub('crono-state', wrapper, 'removeListener error (crono-state):');
    },

    // ------------------ APIs for the floating window (updated) ------------------
    openFlotanteWindow: async () => {
        return ipcRenderer.invoke('flotante-open');
    },
    closeFlotanteWindow: async () => {
        return ipcRenderer.invoke('flotante-close');
    },

    // Hold listener to notify that the flotante was closed (main emits 'flotante-closed')
    onFlotanteClosed: (cb) => {
        const listener = () => { try { cb(); } catch (err) { console.error('flotante closed callback error:', err); } };
        return subscribeWithUnsub('flotante-closed', listener, 'removeListener error:');
    },

    // editor ready (to hide loader in main window)
    onEditorReady: (cb) => {
        const listener = () => { try { cb(); } catch (err) { console.error('editor-ready callback error:', err); } };
        return subscribeWithUnsub('editor-ready', listener, 'removeListener error (editor-ready):');
    },

    // Startup handshake (renderer <-> main)
    sendStartupRendererCoreReady: () => ipcRenderer.send('startup:renderer-core-ready'),
    onStartupReady: (cb) => {
        const listener = () => { try { cb(); } catch (err) { console.error('startup:ready callback error:', err); } };
        return subscribeWithUnsub('startup:ready', listener, 'removeListener error (startup:ready):');
    },
    sendStartupSplashRemoved: () => ipcRenderer.send('startup:splash-removed')
};

contextBridge.exposeInMainWorld('electronAPI', api);
