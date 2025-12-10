// electron/preload.js
const { contextBridge, clipboard, ipcRenderer } = require('electron');

const api = {
    // Clipboard / editor / presets / settings (preservamos todo lo existente)
    readClipboard: () => clipboard.readText(),
    openEditor: () => ipcRenderer.invoke('open-editor'),
    checkForUpdates: (manual = false) => ipcRenderer.invoke('check-for-updates', { manual }),
    // openPresetModal acepta un argumento opcional: numero (wpm) o un objeto { wpm, mode, preset }
    openPresetModal: (payload) => ipcRenderer.invoke('open-preset-modal', payload),
    openDefaultPresetsFolder: () => ipcRenderer.invoke('open-default-presets-folder'),
    getCurrentText: () => ipcRenderer.invoke('get-current-text'),
    setCurrentText: (text) => ipcRenderer.invoke('set-current-text', text),
    getAppConfig: () => ipcRenderer.invoke('get-app-config'),
    onCurrentTextUpdated: (cb) => {
        ipcRenderer.on('current-text-updated', (_e, text) => cb(text));
    },

    // Centralizado: solicitar settings al main process (lee desde disco en el main)
    getSettings: () => ipcRenderer.invoke('get-settings'),

    // Escucha de presets creados (notificacion desde main)
    onPresetCreated: (cb) => {
        ipcRenderer.on('preset-created', (_e, preset) => cb(preset));
    },

    // Obtener presets por defecto desde el main (electron/presets/*.js)
    getDefaultPresets: () => ipcRenderer.invoke('get-default-presets'),

    // Solicitar borrado de preset (main mostrara dialogos nativos y realizara persistencia)
    requestDeletePreset: (name) => ipcRenderer.invoke('request-delete-preset', name),

    // Solicitar restauracion de presets por defecto (main mostrara dialogo nativo y realizara persistencia)
    requestRestoreDefaults: () => ipcRenderer.invoke('request-restore-defaults'),

    // Notify renderer -> main para mostrar 'no selection to edit' dialog
    notifyNoSelectionEdit: () => ipcRenderer.invoke('notify-no-selection-edit'),

    // Force clear editor (invocado por renderer cuando el usuario presiona 'Vaciar' en la pantalla principal)
    forceClearEditor: () => ipcRenderer.invoke('force-clear-editor'),

    // ======================= Listener estable para barra superior =======================
    onMenuClick: (cb) => {
        const wrapper = (_e, payload) => {
            try { cb(payload); } catch (err) { console.error('menuAPI callback error:', err); }
        };
        ipcRenderer.on('menu-click', wrapper);

        // devolver una funcion para desuscribirse
        return () => {
            try {
                ipcRenderer.removeListener('menu-click', wrapper);
            } catch (e) {
                console.error('Error removing menu listener:', e);
            }
        };
    },

    setModeConteo: (mode) => ipcRenderer.invoke('set-mode-conteo', mode),

    onSettingsChanged: (cb) => {
        const listener = (ev, newSettings) => {
            try { cb(newSettings); } catch (err) { console.error('settings callback error:', err); }
        };
        ipcRenderer.on('settings-updated', listener);
        // devolver funcion para remover listener si el caller la usa
        return () => { try { ipcRenderer.removeListener('settings-updated', listener); } catch (e) { console.error('removeListener error:', e); } };
    },

    // Cronometro central API (renderer <-> main)
    sendCronoToggle: () => ipcRenderer.send('crono-toggle'),
    sendCronoReset: () => ipcRenderer.send('crono-reset'),
    setCronoElapsed: (ms) => ipcRenderer.send('crono-set-elapsed', ms),
    getCronoState: () => ipcRenderer.invoke('crono-get-state'),
    onCronoState: (cb) => {
        const wrapper = (_e, state) => { try { cb(state); } catch (err) { console.error("onCronoState callback error:", err); } };
        ipcRenderer.on('crono-state', wrapper);
        return () => { try { ipcRenderer.removeListener('crono-state', wrapper); } catch (e) { console.error("removeListener error (crono-state):", e); } };
    },

    // ------------------ NUEVAS APIs para la ventana flotante (actualizado) ------------------
    openFloatingWindow: async () => {
        return ipcRenderer.invoke('floating-open');
    },
    closeFloatingWindow: async () => {
        return ipcRenderer.invoke('floating-close');
    },

    // Mantener listener para notificar que el flotante fue cerrado (main emite 'flotante-closed')
    onFloatingClosed: (cb) => {
        const listener = () => { try { cb(); } catch (e) { console.error('floating closed callback error:', e); } };
        ipcRenderer.on('flotante-closed', listener);
        return () => { try { ipcRenderer.removeListener('flotante-closed', listener); } catch (e) { console.error('removeListener error:', e); } };
    },

    // Editor manual listo (para ocultar loader en ventana principal)
    onManualEditorReady: (cb) => {
        const listener = () => { try { cb(); } catch (err) { console.error("manual-ready callback error:", err); } };
        ipcRenderer.on('manual-editor-ready', listener);
        return () => { try { ipcRenderer.removeListener('manual-editor-ready', listener); } catch (e) { console.error("removeListener error (manual-editor-ready):", e); } };
    }
};

contextBridge.exposeInMainWorld('electronAPI', api);
