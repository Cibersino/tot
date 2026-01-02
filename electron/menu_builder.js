// electron/menu_builder.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Builds the app's native (top) menu and main-process dialog texts.
// Responsibilities:
// - Load translations from i18n/<lang>/main.json with a safe fallback chain.
// - Build and install the application menu.
// - Forward menu actions to the main renderer via 'menu-click'.

// =============================================================================
// Imports (external modules)
// =============================================================================

const { app, Menu } = require('electron');
const fs = require('fs');
const path = require('path');

// =============================================================================
// Imports (internal modules)
// =============================================================================

const Log = require('./log');

const log = Log.get('menu');

// =============================================================================
// Language helpers
// =============================================================================
// We normalize language tags so folder/file paths are predictable.
// Examples:
// - 'es_CL' -> 'es-cl'
// - 'EN'    -> 'en'
//
// "Base language" is the part before a region:
// - 'es-cl' -> 'es'
// - 'en-us' -> 'en'

const normalizeLangTag = (lang) => (lang || '').trim().toLowerCase().replace(/_/g, '-');
const getLangBase = (lang) => {
    const tag = normalizeLangTag(lang);
    if (!tag) return '';
    const idx = tag.indexOf('-');
    return idx > 0 ? tag.slice(0, idx) : tag;
};

// =============================================================================
// Translation loading
// =============================================================================
// Translations live under i18n/<lang>/main.json.
//
// Fallback chain (in order):
// 1) requested tag (e.g. 'es-cl')
// 2) base tag      (e.g. 'es')
// 3) 'es' as a final safe fallback
//
// For each language code we try these file candidates:
// - If it has a region (contains '-'):
//     i18n/<base>/<full>/main.json   (example: i18n/es/es-cl/main.json)
// - Always:
//     i18n/<lang>/main.json          (example: i18n/es/main.json)
//
// Behavior:
// - If a candidate file is missing, we try the next one.
// - If a file is empty/invalid JSON, we log once and try the next one.
// - If nothing can be loaded, we return {} and the menu uses hardcoded labels.

function loadMainTranslations(lang) {
    const requested = normalizeLangTag(lang) || 'es';
    const base = getLangBase(requested) || 'es';

    const candidates = [];
    if (requested) candidates.push(requested);
    if (base && base !== requested) candidates.push(base);
    if (!candidates.includes('es')) candidates.push('es');

    for (const langCode of candidates) {
        const langBase = getLangBase(langCode) || langCode;

        const files = [];
        if (langCode.includes('-')) {
            files.push(path.join(__dirname, '..', 'i18n', langBase, langCode, 'main.json'));
        }
        files.push(path.join(__dirname, '..', 'i18n', langCode, 'main.json'));

        for (const file of files) {
            if (!fs.existsSync(file)) continue;

            try {
                let raw = fs.readFileSync(file, 'utf8');

                // Remove UTF-8 BOM if present (some editors add it and JSON.parse fails).
                raw = raw.replace(/^\uFEFF/, '');

                if (raw.trim() === '') {
                    log.warnOnce(
                        `menu_builder.loadMainTranslations:empty:${requested}:${langCode}:${String(file)}`,
                        'main.json is empty (trying fallback):',
                        { requested, langCode, file }
                    );
                    continue;
                }

                return JSON.parse(raw);
            } catch (err) {
                log.warnOnce(
                    `menu_builder.loadMainTranslations:failed:${requested}:${langCode}:${String(file)}`,
                    'Failed to load/parse main.json (trying fallback):',
                    { requested, langCode, file },
                    err
                );
            }
        }
    }

    log.warnOnce(
        `menu_builder.loadMainTranslations:none:${requested}`,
        'No main.json could be loaded (using empty translations):',
        { requested, base, candidates }
    );
    return {};
}

// =============================================================================
// Public helper: dialog texts
// =============================================================================
// Some dialogs are shown by the main process (Electron native dialogs).
// This returns the "main.dialog" section from the translation file.

function getDialogTexts(lang) {
    const tr = loadMainTranslations(lang);
    const tMain = tr && tr.main ? tr.main : {};
    return tMain.dialog || {};
}

// =============================================================================
// Public helper: build the native application menu
// =============================================================================

/**
 * Builds and installs the native menu.
 * - Labels come from i18n/<lang>/main.json (with fallbacks).
 * - Clicks send an action id to the renderer via 'menu-click'.
 *
 * @param {string} lang - Language code (e.g. 'es', 'en').
 * @param {object} [opts]
 * @param {Electron.BrowserWindow|null} [opts.mainWindow] - Target window for 'menu-click'.
 * @param {Function} [opts.onOpenLanguage] - Callback that opens the language selection window.
 */
function buildAppMenu(lang, opts = {}) {
    const effectiveLang = normalizeLangTag(lang) || 'es';
    const tr = loadMainTranslations(effectiveLang) || {};
    const tMain = tr.main || {};
    const m = tMain.menu || {};

    const mainWindow = opts.mainWindow || null;

    // Optional hook: the menu can trigger the language picker window.
    const onOpenLanguage =
        typeof opts.onOpenLanguage === 'function' ? opts.onOpenLanguage : null;

    // Send a menu action to the renderer.
    // If the window is missing/closing, we drop the action and log once (best-effort IPC).
    const sendMenuClick = (payload) => {
        if (!mainWindow) {
            log.warnOnce(
                `menu_builder.sendMenuClick:noWindow:${String(payload)}`,
                'menu-click dropped (no mainWindow):',
                payload
            );
            return;
        }
        if (mainWindow.isDestroyed()) {
            log.warnOnce(
                `menu_builder.sendMenuClick:destroyed:${String(payload)}`,
                'menu-click dropped (mainWindow destroyed):',
                payload
            );
            return;
        }

        try {
            mainWindow.webContents.send('menu-click', payload);
        } catch (err) {
            log.warnOnce(
                `menu_builder.sendMenuClick:sendFailed:${String(payload)}`,
                "webContents.send('menu-click') failed (ignored):",
                payload,
                err
            );
        }
    };

    // Menu template:
    // - Prefer translated labels when available.
    // - Each click emits a stable action id (string).
    const menuTemplate = [
        {
            label: m.como_usar || 'Como usar la app?',
            submenu: [
                {
                    label: m.guia_basica || 'Guide',
                    click: () => sendMenuClick('guia_basica'),
                },
                {
                    label: m.instrucciones_completas || 'Instructions',
                    click: () => sendMenuClick('instrucciones_completas'),
                },
                {
                    label: m.faq || 'FAQ',
                    click: () => sendMenuClick('faq'),
                },
            ],
        },
        {
            label: m.herramientas || 'Tools',
            submenu: [
                {
                    label: m.cargador_texto || 'Text loader',
                    click: () => sendMenuClick('cargador_texto'),
                },
                {
                    label: m.cargador_imagen || 'Image loader',
                    click: () => sendMenuClick('contador_imagen'),
                },
                {
                    label: m.test_velocidad || 'Speed test',
                    click: () => sendMenuClick('test_velocidad'),
                },
            ],
        },
        {
            label: m.preferencias || 'Preferences',
            submenu: [
                {
                    label: m.idioma || 'Language',
                    // The window lifecycle is handled by main.js; this module only calls the hook.
                    click: () => {
                        if (onOpenLanguage) {
                            try {
                                onOpenLanguage();
                            } catch (err) {
                                log.errorOnce(
                                    'menu_builder.onOpenLanguage',
                                    'onOpenLanguage callback failed:',
                                    err
                                );
                            }
                        } else {
                            log.warnOnce(
                                'menu_builder.onOpenLanguage.missing',
                                'Language menu clicked but no handler was provided (ignored).'
                            );
                        }
                    },
                },
                {
                    label: m.diseno || 'Design',
                    submenu: [
                        {
                            label: m.skins || 'Skins',
                            click: () => sendMenuClick('diseno_skins'),
                        },
                        {
                            label: m.crono_flotante || 'FW',
                            click: () => sendMenuClick('diseno_crono_flotante'),
                        },
                        {
                            label: m.fuentes || 'Fonts',
                            click: () => sendMenuClick('diseno_fuentes'),
                        },
                        {
                            label: m.colores || 'Colors',
                            click: () => sendMenuClick('diseno_colores'),
                        },
                    ],
                },
                {
                    label: m.shortcuts || 'Shortcuts',
                    click: () => sendMenuClick('shortcuts'),
                },
                {
                    label: m.presets_por_defecto || 'Default presets',
                    click: () => sendMenuClick('presets_por_defecto'),
                },
            ],
        },
        {
            label: m.comunidad || 'Community',
            submenu: [
                {
                    label: m.discord || 'Discord',
                    click: () => sendMenuClick('discord'),
                },
                {
                    label: m.avisos || 'News & updates',
                    click: () => sendMenuClick('avisos'),
                },
            ],
        },
        {
            label: m.links_interes || 'Links',
            click: () => sendMenuClick('links_interes'),
        },
        {
            label: m.colabora || '($)',
            click: () => sendMenuClick('colabora'),
        },
        {
            label: m.ayuda || '?',
            submenu: [
                {
                    label: m.actualizar_version || 'Update',
                    click: () => sendMenuClick('actualizar_version'),
                },
                {
                    label: m.readme || 'Readme',
                    click: () => sendMenuClick('readme'),
                },
                {
                    label: m.acerca_de || 'About',
                    click: () => sendMenuClick('acerca_de'),
                },
            ],
        },
    ];

    // Development menu:
    // - Hidden in packaged builds.
    // - In development, shown only if SHOW_DEV_MENU=1.
    const showDevMenu = process.env.SHOW_DEV_MENU === '1';
    if (!app.isPackaged && showDevMenu) {
        menuTemplate.push({
            label: m.desarrollo || 'Development',
            submenu: [
                { role: 'reload', label: m.recargar || 'Reload' },
                { role: 'forcereload', label: m.forcereload || 'Force reload' },
                {
                    label: m.toggle_devtools || 'Toggle DevTools',
                    accelerator: 'Ctrl+Shift+I',
                    click: () => {
                        if (!mainWindow || mainWindow.isDestroyed()) return;
                        try {
                            mainWindow.webContents.toggleDevTools();
                        } catch (err) {
                            log.warnOnce(
                                'menu_builder.toggleDevTools',
                                'toggleDevTools failed (ignored):',
                                err
                            );
                        }
                    },
                },
            ],
        });
    }

    // Apply the menu to the application.
    const appMenu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(appMenu);
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
    getDialogTexts,
    buildAppMenu,
};

// =============================================================================
// End of menu_builder.js
// =============================================================================
