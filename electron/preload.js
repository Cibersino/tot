// electron/preload.js
'use strict';

const { contextBridge, ipcRenderer, webUtils } = require('electron');


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
    // Text extraction
    openTextExtractionPicker: () => ipcRenderer.invoke('text-extraction-open-picker'),
    getPathForFile: (file) => webUtils.getPathForFile(file),
    checkTextExtractionPreconditions: () => ipcRenderer.invoke('text-extraction-check-preconditions'),
    inspectTextExtractionSelectedFile: (payload) => ipcRenderer.invoke('text-extraction-inspect-selected-file', payload),
    prepareTextExtractionOcrActivation: () => ipcRenderer.invoke('text-extraction-prepare-ocr-activation'),
    launchTextExtractionOcrActivation: () => ipcRenderer.invoke('text-extraction-launch-ocr-activation'),
    checkTextExtractionOcrAvailability: () => ipcRenderer.invoke('text-extraction-check-ocr-availability'),
    disconnectTextExtractionOcr: (payload) => ipcRenderer.invoke('text-extraction-disconnect-ocr', payload),
    prepareTextExtractionSelectedFile: (payload) => ipcRenderer.invoke('text-extraction-prepare-selected-file', payload),
    executePreparedTextExtraction: (payload) => ipcRenderer.invoke('text-extraction-execute-prepared', payload),
    revealTextExtractionGeneratedPdf: (payload) => ipcRenderer.invoke('text-extraction-reveal-generated-pdf', payload),
    getTextExtractionProcessingMode: () => ipcRenderer.invoke('text-extraction-get-processing-mode'),
    enterTextExtractionProcessingSession: (payload) => ipcRenderer.invoke('text-extraction-enter-processing-session', payload),
    updateTextExtractionProcessingSession: (payload) => ipcRenderer.invoke('text-extraction-update-processing-session', payload),
    exitTextExtractionProcessingSession: (payload) => ipcRenderer.invoke('text-extraction-exit-processing-session', payload),
    requestTextExtractionAbort: (payload) => ipcRenderer.invoke('text-extraction-request-abort', payload),
    onTextExtractionProcessingModeChanged: (cb) => {
        const listener = (_e, state) => {
            try { cb(state); } catch (err) { console.error('text-extraction processing-mode callback error:', err); }
        };
        return subscribeWithUnsub(
            'text-extraction-processing-mode-changed',
            listener,
            'removeListener error (text-extraction-processing-mode-changed):'
        );
    },

    // Text / clipboard / Text Editor
    readClipboard: () => ipcRenderer.invoke('clipboard-read-text'),
    openEditor: () => ipcRenderer.invoke('open-editor'),
    getCurrentText: () => ipcRenderer.invoke('get-current-text'),
    setCurrentText: (payload) => ipcRenderer.invoke('set-current-text', payload),
    getCurrentTextProcessingState: () => ipcRenderer.invoke('current-text-processing-get-state'),
    resolveCurrentTextProcessing: (payload) => ipcRenderer.invoke('current-text-processing-resolve', payload),
    saveCurrentTextSnapshot: (payload) => ipcRenderer.invoke('current-text-snapshot-save', payload),
    openCurrentTextSnapshotsFolder: () => ipcRenderer.invoke('current-text-snapshot-open-folder'),
    loadCurrentTextSnapshot: () => ipcRenderer.invoke('current-text-snapshot-load'),
    onCurrentTextUpdated: (cb) => {
        const listener = (_e, payload) => {
            try { cb(payload); } catch (err) { console.error('current-text-updated callback error:', err); }
        };
        return subscribeWithUnsub(
            'current-text-updated',
            listener,
            'removeListener error (current-text-updated):'
        );
    },
    onCurrentTextProcessingStateChanged: (cb) => {
        const listener = (_e, state) => {
            try { cb(state); } catch (err) { console.error('current-text-processing-state callback error:', err); }
        };
        return subscribeWithUnsub(
            'current-text-processing-state-changed',
            listener,
            'removeListener error (current-text-processing-state-changed):'
        );
    },
    onEditorFirstShowState: (cb) => {
        const listener = (_e, payload) => {
            try { cb(payload); } catch (err) { console.error('editor-first-show-state callback error:', err); }
        };
        return subscribeWithUnsub(
            'editor-first-show-state',
            listener,
            'removeListener error (editor-first-show-state):'
        );
    },

    // Settings / app info
    getSettings: () => ipcRenderer.invoke('get-settings'),
    getSnapshotTagPreferences: () => ipcRenderer.invoke('get-snapshot-tag-preferences'),
    setSnapshotTagPreferences: (payload) => ipcRenderer.invoke('set-snapshot-tag-preferences', payload),
    setModeConteo: (mode) => ipcRenderer.invoke('set-mode-conteo', mode),
    getAppConfig: () => ipcRenderer.invoke('get-app-config'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    getAppRuntimeInfo: () => ipcRenderer.invoke('get-app-runtime-info'),
    getAppDocAvailability: (docKey) => ipcRenderer.invoke('get-app-doc-availability', docKey),
    onSettingsChanged: (cb) => {
        const listener = (ev, newSettings) => {
            try { cb(newSettings); } catch (err) { console.error('settings callback error:', err); }
        };
        // return function to remove listener if used by caller
        return subscribeWithUnsub('settings-updated', listener, 'removeListener error:');
    },

    // Presets
    // openPresetModal accepts an optional argument: number (wpm) or object { wpm, mode, preset }
    openPresetModal: (payload) => ipcRenderer.invoke('open-preset-modal', payload),
    openDefaultPresetsFolder: () => ipcRenderer.invoke('open-default-presets-folder'),
    getDefaultPresets: () => ipcRenderer.invoke('get-default-presets'),
    setSelectedPreset: (name) => ipcRenderer.invoke('set-selected-preset', name),
    requestDeletePreset: (name) => ipcRenderer.invoke('request-delete-preset', name),
    requestRestoreDefaults: () => ipcRenderer.invoke('request-restore-defaults'),
    onPresetCreated: (cb) => {
        const listener = (_e, preset) => {
            try { cb(preset); } catch (err) { console.error('preset-created callback error:', err); }
        };
        return subscribeWithUnsub('preset-created', listener, 'removeListener error (preset-created):');
    },

    // Task Editor
    openTaskEditor: (mode) => ipcRenderer.invoke('open-task-editor', { mode }),

    // Menu / external links / updates
    onMenuClick: (cb) => {
        const wrapper = (_e, payload) => {
            try { cb(payload); } catch (err) { console.error('menuAPI callback error:', err); }
        };
        // return an unsubscribe function
        return subscribeWithUnsub('menu-click', wrapper, 'Error removing menu listener:');
    },
    openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),
    openAppDoc: (docKey) => ipcRenderer.invoke('open-app-doc', docKey),
    checkForUpdates: (manual = false) => ipcRenderer.invoke('check-for-updates', { manual }),

    // Crono
    sendCronoToggle: () => ipcRenderer.send('crono-toggle'),
    sendCronoReset: () => ipcRenderer.send('crono-reset'),
    setCronoElapsed: (ms) => ipcRenderer.send('crono-set-elapsed', ms),
    getCronoState: () => ipcRenderer.invoke('crono-get-state'),
    onCronoState: (cb) => {
        const wrapper = (_e, state) => { try { cb(state); } catch (err) { console.error('onCronoState callback error:', err); } };
        return subscribeWithUnsub('crono-state', wrapper, 'removeListener error (crono-state):');
    },

    // Floating Stopwatch (flotante)
    openFlotanteWindow: async () => {
        return ipcRenderer.invoke('flotante-open');
    },
    closeFlotanteWindow: async () => {
        return ipcRenderer.invoke('flotante-close');
    },
    onFlotanteClosed: (cb) => {
        const listener = () => { try { cb(); } catch (err) { console.error('flotante closed callback error:', err); } };
        return subscribeWithUnsub('flotante-closed', listener, 'removeListener error:');
    },

    // Reading test
    getReadingTestEntryData: () => ipcRenderer.invoke('reading-test-get-entry-data'),
    importReadingTestPoolFiles: (payload) => ipcRenderer.invoke('reading-test-import-pool-files', payload),
    resetReadingTestPool: () => ipcRenderer.invoke('reading-test-reset-pool'),
    setReadingTestShowBundledEntries: (value) => ipcRenderer.invoke('reading-test-set-show-bundled-entries', value),
    startReadingTest: (payload) => ipcRenderer.invoke('reading-test-start', payload),
    getReadingTestState: () => ipcRenderer.invoke('reading-test-get-state'),
    onReadingTestStateChanged: (cb) => {
        const listener = (_e, state) => {
            try { cb(state); } catch (err) { console.error('reading-test-state callback error:', err); }
        };
        return subscribeWithUnsub(
            'reading-test-state-changed',
            listener,
            'removeListener error (reading-test-state-changed):'
        );
    },
    onReadingTestNotice: (cb) => {
        const listener = (_e, notice) => {
            try { cb(notice); } catch (err) { console.error('reading-test-notice callback error:', err); }
        };
        return subscribeWithUnsub(
            'reading-test-notice',
            listener,
            'removeListener error (reading-test-notice):'
        );
    },
    onReadingTestApplyWpm: (cb) => {
        const listener = (_e, payload) => {
            try { cb(payload); } catch (err) { console.error('reading-test-apply-wpm callback error:', err); }
        };
        return subscribeWithUnsub(
            'reading-test-apply-wpm',
            listener,
            'removeListener error (reading-test-apply-wpm):'
        );
    },

    // Startup handshake
    sendStartupRendererCoreReady: () => ipcRenderer.send('startup:renderer-core-ready'),
    onStartupReady: (cb) => {
        const listener = () => { try { cb(); } catch (err) { console.error('startup:ready callback error:', err); } };
        return subscribeWithUnsub('startup:ready', listener, 'removeListener error (startup:ready):');
    },
    sendStartupSplashRemoved: () => ipcRenderer.send('startup:splash-removed')
};

contextBridge.exposeInMainWorld('electronAPI', api);
