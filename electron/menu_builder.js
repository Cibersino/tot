// electron/menu_builder.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// This module builds the native (top) application menu and provides localized
// dialog texts for the main process.
//
// Key idea (Electron architecture):
// - The native menu is created in the MAIN PROCESS.
// - The visible UI lives in a RENDERER WINDOW (the main window).
// - When a user clicks a menu item, we notify the renderer by sending an IPC
//   message: mainWindow.webContents.send('menu-click', <actionId>).
//
// Translations source:
// - Menu labels and dialog texts are loaded from: i18n/<lang>/main.json
// - We implement a safe fallback chain so the app still works even if some
//   translation files are missing or invalid.
//
// This file is intentionally "logic-light":
// - It does not open windows directly (except via an optional callback).
// - It only builds menu templates, loads translations, and emits menu actions.

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
// Normalize language tags so we can build predictable file paths.
//
// Examples:
// - 'es_CL' -> 'es-cl' (underscore to dash + lowercase)
// - 'EN'    -> 'en'
//
// "Base language" means the primary language part before the region:
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
// We load menu/dialog translations from i18n/<lang>/main.json.
//
// Fallback chain (in order):
// 1) requested tag (e.g. 'es-cl')
// 2) base tag      (e.g. 'es')
// 3) 'es' as a final safe fallback
//
// File candidates per language code:
// - If the tag includes a region (contains '-'), try:
//     i18n/<base>/<full>/main.json   (example: i18n/es/es-cl/main.json)
// - Always try:
//     i18n/<lang>/main.json         (example: i18n/es/main.json)
//
// Notes:
// - If a file has an UTF-8 BOM, we remove it before JSON parsing.
// - On any error, we log and continue trying other candidates.
// - If nothing can be loaded, we return an empty object.

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
        try {
            for (const file of files) {
                if (!fs.existsSync(file)) {
                    continue;
                }
                let raw = fs.readFileSync(file, 'utf8');
                // Remove UTF-8 BOM if present (some editors add it and JSON.parse fails).
                raw = raw.replace(/^\uFEFF/, '');
                return JSON.parse(raw || '{}');
            }
        } catch (err) {
            log.error('[menu_builder] Error loading translations from main.json:', err);
        }
    }
    return {};
}

// =============================================================================
// Public helper: dialog texts
// =============================================================================
// Some dialogs live in the main process (Electron dialog boxes).
// This returns the "dialog" section under "main" from the translation file.

function getDialogTexts(lang) {
    const tr = loadMainTranslations(lang);
    const tMain = tr && tr.main ? tr.main : {};
    return tMain.dialog || {};
}

// =============================================================================
// Public helper: build the native application menu
// =============================================================================

/**
 * Build the native menu of the app.
 *
 * How it works:
 * - Menu labels are read from i18n/<lang>/main.json (with fallbacks).
 * - On click, menu items send a simple action id to the renderer:
 *     'menu-click' -> <string action id>
 * - The renderer decides what to show (help page, links, modal, etc).
 *
 * @param {string} lang - Language code (e.g. 'es', 'en').
 * @param {object} [opts]
 * @param {Electron.BrowserWindow|null} [opts.mainWindow] - Main window to send 'menu-click'.
 * @param {Function} [opts.onOpenLanguage] - Callback to open the language selection window.
 */
function buildAppMenu(lang, opts = {}) {
    const effectiveLang = normalizeLangTag(lang) || 'es';
    const tr = loadMainTranslations(effectiveLang) || {};
    const tMain = tr.main || {};
    const m = tMain.menu || {};

    const mainWindow = opts.mainWindow || null;

    // Optional hook: the menu can trigger a language picker window.
    // We keep this as a callback so this module stays focused on menu building.
    const onOpenLanguage =
        typeof opts.onOpenLanguage === 'function' ? opts.onOpenLanguage : null;

    // Best-effort IPC: if the main window is not available, we just ignore the click.
    // This avoids crashes during startup/shutdown or when the window is closing.
    const sendMenuClick = (payload) => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        try {
            mainWindow.webContents.send('menu-click', payload);
        } catch (err) {
            log.error('[menu_builder] Error sending menu-click:', payload, err);
        }
    };

    // Menu template:
    // - Each label comes from translations when available.
    // - Each click sends a stable action id (string) to the renderer.
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
                    // Language selection is handled by main.js (window lifecycle).
                    // Here we only trigger the provided callback, if any.
                    click: () => {
                        if (onOpenLanguage) {
                            try {
                                onOpenLanguage();
                            } catch (err) {
                                log.error(
                                    '[menu_builder] Error in callback onOpenLanguage:',
                                    err
                                );
                            }
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
    // - Never show in packaged builds.
    // - In development, show only if explicitly enabled (SHOW_DEV_MENU=1).
    // This avoids exposing developer tools to normal end users.
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
                            log.error(
                                '[menu_builder] Error toggling DevTools from menu:',
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
