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
const { DEFAULT_LANG } = require('./constants_main');
const { normalizeLangTag, getLangBase } = require('./settings');

const log = Log.get('menu');

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

const deepMerge = (base, overlay) => {
    const result = Object.assign({}, base || {});
    if (!overlay) return result;
    Object.keys(overlay).forEach((key) => {
        if (isPlainObject(result[key]) && isPlainObject(overlay[key])) {
            result[key] = deepMerge(result[key], overlay[key]);
        } else {
            result[key] = overlay[key];
        }
    });
    return result;
};

function resolveMenuLabel(obj, key, fallback) {
    if (obj && typeof obj[key] === 'string') return obj[key];
    log.warnOnce(
        `menu_builder.missingKey:${key}`,
        'Missing menu translation key (using fallback):',
        key
    );
    return fallback;
}

function resolveDialogText(dialogTexts, key, fallback, opts = {}) {
    if (dialogTexts && typeof dialogTexts[key] === 'string') return dialogTexts[key];
    const logger = opts.log || log;
    const prefix = opts.warnPrefix || 'menu_builder.dialog.missing';
    logger.warnOnce(
        `${prefix}:${key}`,
        'Missing dialog translation key (using fallback):',
        key
    );
    return fallback;
}

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
    const requested = normalizeLangTag(lang);
    if (!requested) {
        log.warnOnce(
            'menu_builder.loadMainTranslations.emptyLang',
            'Invalid language tag for menu; using default bundle only.'
        );
    }

    const base = getLangBase(requested) || '';

    const defaultBundle = loadBundle(DEFAULT_LANG, DEFAULT_LANG, true);
    if (!defaultBundle) {
        log.errorOnce(
            `menu_builder.loadMainTranslations.defaultMissing:${DEFAULT_LANG}`,
            'Default main.json missing or invalid (using empty defaults):',
            DEFAULT_LANG
        );
    }

    let overlay = null;
    if (requested && requested !== DEFAULT_LANG) {
        overlay = loadOverlay(requested, base);
        if (!overlay) {
            log.warnOnce(
                `menu_builder.loadMainTranslations.overlayMissing:${requested}`,
                'No overlay main.json found (using default only):',
                { requested, base }
            );
        }
    }

    return deepMerge(defaultBundle || {}, overlay || {});
}

function loadOverlay(requested, base) {
    const candidates = [];
    if (requested) candidates.push(requested);
    if (base && base !== requested) candidates.push(base);

    for (const langCode of candidates) {
        const parsed = loadBundle(langCode, requested, false);
        if (parsed) return parsed;
    }

    return null;
}

function loadBundle(langCode, requested, required) {
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
                    `menu_builder.loadMainTranslations:empty:${requested || langCode}:${langCode}:${String(file)}`,
                    'main.json is empty (trying fallback):',
                    { requested, langCode, file }
                );
                continue;
            }

            return JSON.parse(raw);
        } catch (err) {
            log.warnOnce(
                `menu_builder.loadMainTranslations:failed:${requested || langCode}:${langCode}:${String(file)}`,
                'Failed to load/parse main.json (trying fallback):',
                { requested, langCode, file },
                err
            );
        }
    }

    if (required) {
        log.errorOnce(
            `menu_builder.loadMainTranslations.requiredMissing:${langCode}`,
            'Required main.json missing/invalid:',
            { langCode, files }
        );
    }

    return null;
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
    const effectiveLang = normalizeLangTag(lang) || DEFAULT_LANG;
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
            label: resolveMenuLabel(m, 'como_usar', 'Como usar la app?'),
            submenu: [
                {
                    label: resolveMenuLabel(m, 'guia_basica', 'Guide'),
                    click: () => sendMenuClick('guia_basica'),
                },
                {
                    label: resolveMenuLabel(m, 'instrucciones_completas', 'Instructions'),
                    click: () => sendMenuClick('instrucciones_completas'),
                },
                {
                    label: resolveMenuLabel(m, 'faq', 'FAQ'),
                    click: () => sendMenuClick('faq'),
                },
            ],
        },
        {
            label: resolveMenuLabel(m, 'herramientas', 'Tools'),
            submenu: [
                {
                    label: resolveMenuLabel(m, 'cargador_texto', 'Text loader'),
                    click: () => sendMenuClick('cargador_texto'),
                },
                {
                    label: resolveMenuLabel(m, 'cargador_imagen', 'Image loader'),
                    click: () => sendMenuClick('cargador_imagen'),
                },
                {
                    label: resolveMenuLabel(m, 'test_velocidad', 'Speed test'),
                    click: () => sendMenuClick('test_velocidad'),
                },
            ],
        },
        {
            label: resolveMenuLabel(m, 'preferencias', 'Preferences'),
            submenu: [
                {
                    label: resolveMenuLabel(m, 'idioma', 'Language'),
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
                    label: resolveMenuLabel(m, 'diseno', 'Design'),
                    submenu: [
                        {
                            label: resolveMenuLabel(m, 'skins', 'Skins'),
                            click: () => sendMenuClick('diseno_skins'),
                        },
                        {
                            label: resolveMenuLabel(m, 'crono_flotante', 'FW'),
                            click: () => sendMenuClick('diseno_crono_flotante'),
                        },
                        {
                            label: resolveMenuLabel(m, 'fuentes', 'Fonts'),
                            click: () => sendMenuClick('diseno_fuentes'),
                        },
                        {
                            label: resolveMenuLabel(m, 'colores', 'Colors'),
                            click: () => sendMenuClick('diseno_colores'),
                        },
                    ],
                },
                {
                    label: resolveMenuLabel(m, 'shortcuts', 'Shortcuts'),
                    click: () => sendMenuClick('shortcuts'),
                },
                {
                    label: resolveMenuLabel(m, 'presets_por_defecto', 'Default presets'),
                    click: () => sendMenuClick('presets_por_defecto'),
                },
            ],
        },
        {
            label: resolveMenuLabel(m, 'comunidad', 'Community'),
            submenu: [
                {
                    label: resolveMenuLabel(m, 'discord', 'Discord'),
                    click: () => sendMenuClick('discord'),
                },
                {
                    label: resolveMenuLabel(m, 'avisos', 'News & updates'),
                    click: () => sendMenuClick('avisos'),
                },
            ],
        },
        {
            label: resolveMenuLabel(m, 'links_interes', 'Links'),
            click: () => sendMenuClick('links_interes'),
        },
        {
            label: resolveMenuLabel(m, 'colabora', '($)'),
            click: () => sendMenuClick('colabora'),
        },
        {
            label: resolveMenuLabel(m, 'ayuda', '?'),
            submenu: [
                {
                    label: resolveMenuLabel(m, 'actualizar_version', 'Update'),
                    click: () => sendMenuClick('actualizar_version'),
                },
                {
                    label: resolveMenuLabel(m, 'acerca_de', 'About'),
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
            label: resolveMenuLabel(m, 'desarrollo', 'Development'),
            submenu: [
                { role: 'reload', label: resolveMenuLabel(m, 'recargar', 'Reload') },
                { role: 'forcereload', label: resolveMenuLabel(m, 'forcereload', 'Force reload') },
                {
                    label: resolveMenuLabel(m, 'toggle_devtools', 'Toggle DevTools'),
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
    resolveDialogText,
};

// =============================================================================
// End of menu_builder.js
// =============================================================================
