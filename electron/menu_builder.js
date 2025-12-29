// electron/menu_builder.js
//
// Construction of the native menu and dialog texts of main,
// from i18n/<lang>/main.json.

const { app, Menu } = require('electron');
const fs = require('fs');
const path = require('path');
const Log = require('./log');

const log = Log.get('menu');

// Helpers: load main (menu/dialog) translations from i18n
function loadMainTranslations(lang) {
    const langCode = (lang || 'es').toLowerCase() || 'es';
    const file = path.join(__dirname, '..', 'i18n', langCode, 'main.json');
    try {
        if (!fs.existsSync(file)) {
            log.warn('[menu_builder] main.json no found for', langCode, 'in', file);
            return null;
        }
        let raw = fs.readFileSync(file, 'utf8');
        // Remove BOM UTF-8 if it exists
        raw = raw.replace(/^\uFEFF/, '');
        return JSON.parse(raw || '{}');
    } catch (err) {
        log.error('[menu_builder] Error loading translations from main.json:', err);
        return null;
    }
}

function getDialogTexts(lang) {
    const langCode = (lang || 'es').toLowerCase() || 'es';
    const tr = loadMainTranslations(langCode);
    const tMain = tr && tr.main ? tr.main : {};
    return tMain.dialog || {};
}

/**
 * Build the native menu of the app.
 *
 * @param {string} lang - Language code (e.g. 'es', 'en').
 * @param {object} [opts]
 * @param {Electron.BrowserWindow|null} [opts.mainWindow] - Main window to send 'menu-click'.
 * @param {Function} [opts.onOpenLanguage] - Callback to open the language selection window.
 */
function buildAppMenu(lang, opts = {}) {
    const effectiveLang = (lang || 'es').toLowerCase();
    const tr = loadMainTranslations(effectiveLang) || {};
    const tMain = tr.main || {};
    const m = tMain.menu || {};

    const mainWindow = opts.mainWindow || null;
    const onOpenLanguage =
        typeof opts.onOpenLanguage === 'function' ? opts.onOpenLanguage : null;

    const sendMenuClick = (payload) => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        try {
            mainWindow.webContents.send('menu-click', payload);
        } catch (err) {
            log.error('[menu_builder] Error sending menu-click:', payload, err);
        }
    };

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
                    // Here we used to call createLanguageWindow() directly in main.js.
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

    // Dev menu (only if enabled by environment variable)
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

    const appMenu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(appMenu);
}

module.exports = {
    getDialogTexts,
    buildAppMenu,
};
