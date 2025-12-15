// electron/menu_builder.js
//
// Construccion del meno nativo y textos de dialogos de main,
// a partir de i18n/<lang>/main.json.

const { app, Menu } = require('electron');
const fs = require('fs');
const path = require('path');

// Helpers: load main (menu/dialog) translations from i18n
function loadMainTranslations(lang) {
    const langCode = (lang || 'es').toLowerCase() || 'es';
    const file = path.join(__dirname, '..', 'i18n', langCode, 'main.json');
    try {
        if (!fs.existsSync(file)) {
            console.warn('[menu_builder] main.json no found for', langCode, 'in', file);
            return null;
        }
        let raw = fs.readFileSync(file, 'utf8');
        // Eliminar BOM UTF-8 si existe
        raw = raw.replace(/^\uFEFF/, '');
        return JSON.parse(raw || '{}');
    } catch (err) {
        console.error('[menu_builder] Error loading translations from main.json:', err);
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
 * Construye el meno nativo de la app.
 *
 * @param {string} lang - Codigo de idioma (ej: 'es', 'en').
 * @param {object} [opts]
 * @param {Electron.BrowserWindow|null} [opts.mainWindow] - Ventana principal para enviar 'menu-click'.
 * @param {Function} [opts.onOpenLanguage] - Callback para abrir la ventana de seleccion de idioma.
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
            console.error('[menu_builder] Error sending menu-click:', payload, err);
        }
    };

    const menuTemplate = [
        {
            label: m.como_usar || 'Como usar la app?',
            submenu: [
                {
                    label: m.guia_basica || 'Guia basica',
                    click: () => sendMenuClick('guia_basica'),
                },
                {
                    label: m.instrucciones_completas || 'Instrucciones completas',
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
                    label: m.cargador_texto || 'Cargador de archivo de texto',
                    click: () => sendMenuClick('cargador_texto'),
                },
                {
                    label: m.cargador_imagen || 'Cargador de imagenes con texto',
                    click: () => sendMenuClick('contador_imagen'),
                },
                {
                    label: m.test_velocidad || 'Reading speed test',
                    click: () => sendMenuClick('test_velocidad'),
                },
            ],
        },
        {
            label: m.preferencias || 'Preferences',
            submenu: [
                {
                    label: m.idioma || 'Language',
                    // Aqui antes se llamaba directamente a createLanguageWindow() en main.js.
                    click: () => {
                        if (onOpenLanguage) {
                            try {
                                onOpenLanguage();
                            } catch (err) {
                                console.error(
                                    '[menu_builder] Error in callback onOpenLanguage:',
                                    err
                                );
                            }
                        }
                    },
                },
                {
                    label: m.diseno || 'Diseno',
                    submenu: [
                        {
                            label: m.skins || 'Skins',
                            click: () => sendMenuClick('diseno_skins'),
                        },
                        {
                            label: m.crono_flotante || 'Cronometro flotante',
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
            label: m.links_interes || 'Links de interes',
            click: () => sendMenuClick('links_interes'),
        },
        {
            label: m.colabora || 'CONTRIBUTE ($)',
            click: () => sendMenuClick('colabora'),
        },
        {
            label: m.ayuda || '?',
            submenu: [
                {
                    label: m.actualizar_version || 'Actualizar a ultima version',
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

    // Dev menu (solo si se habilita por variable de entorno)
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
                            console.error(
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
    loadMainTranslations,
    getDialogTexts,
    buildAppMenu,
};
