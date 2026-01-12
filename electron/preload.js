// electron/preload.js
'use strict';

const { contextBridge, ipcRenderer } = require('electron');


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
    getAppConfig: () => ipcRenderer.invoke('get-app-config'),
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
        ipcRenderer.on('menu-click', wrapper);

        // return an unsubscribe function
        return () => {
            try {
                ipcRenderer.removeListener('menu-click', wrapper);
            } catch (err) {
                console.error('Error removing menu listener:', err);
            }
        };
    },

    setModeConteo: (mode) => ipcRenderer.invoke('set-mode-conteo', mode),

    onSettingsChanged: (cb) => {
        const listener = (ev, newSettings) => {
            try { cb(newSettings); } catch (err) { console.error('settings callback error:', err); }
        };
        ipcRenderer.on('settings-updated', listener);
        // return function to remove listener if used by caller
        return () => { try { ipcRenderer.removeListener('settings-updated', listener); } catch (err) { console.error('removeListener error:', err); } };
    },

    // Central Crono API (renderer <-> main)
    sendCronoToggle: () => ipcRenderer.send('crono-toggle'),
    sendCronoReset: () => ipcRenderer.send('crono-reset'),
    setCronoElapsed: (ms) => ipcRenderer.send('crono-set-elapsed', ms),
    getCronoState: () => ipcRenderer.invoke('crono-get-state'),
    onCronoState: (cb) => {
        const wrapper = (_e, state) => { try { cb(state); } catch (err) { console.error('onCronoState callback error:', err); } };
        ipcRenderer.on('crono-state', wrapper);
        return () => { try { ipcRenderer.removeListener('crono-state', wrapper); } catch (err) { console.error('removeListener error (crono-state):', err); } };
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
        ipcRenderer.on('flotante-closed', listener);
        return () => { try { ipcRenderer.removeListener('flotante-closed', listener); } catch (err) { console.error('removeListener error:', err); } };
    },

    // editor ready (to hide loader in main window)
    onEditorReady: (cb) => {
        const listener = () => { try { cb(); } catch (err) { console.error('editor-ready callback error:', err); } };
        ipcRenderer.on('editor-ready', listener);
        return () => { try { ipcRenderer.removeListener('editor-ready', listener); } catch (err) { console.error('removeListener error (editor-ready):', err); } };
    }
};

contextBridge.exposeInMainWorld('electronAPI', api);
