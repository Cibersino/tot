// electron/menu_builder.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-process menu and native-dialog translation owner.
// Responsibilities:
// - Load main-process translations from i18n/<lang>/main.json with the repo fallback chain.
// - Expose helpers for native dialog text resolution used by other main-side modules.
// - Build and install the native application menu from translated labels.
// - Gate menu dispatch when main-window interaction is intentionally locked.
// - Forward approved menu actions to the main renderer via 'menu-click'.

// =============================================================================
// Imports (external modules)
// =============================================================================

const { app, BrowserWindow, Menu } = require('electron');
const fs = require('fs');
const path = require('path');

// =============================================================================
// Imports (internal modules)
// =============================================================================

const Log = require('./log');
const { DEFAULT_LANG } = require('./constants_main');
const { normalizeLangTag, getLangBase } = require('./settings');

// =============================================================================
// Constants/config
// =============================================================================

const I18N_DIR = path.join(__dirname, '..', 'i18n');
const MENU_CLICK_CHANNEL = 'menu-click';
const MENU_PROCESSING_LOCK_NOTICE_ACTION = '__menu_processing_lock_notice__';

// =============================================================================
// Logger + shared helpers
// =============================================================================

const log = Log.get('menu');
log.debug('Menu builder starting...');

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

function resolveMenuLabel(obj, key, fallback = key) {
    if (obj && typeof obj[key] === 'string') return obj[key];
    log.warnOnce(
        `menu_builder.missingKey:${key}`,
        'Missing menu translation key (using fallback):',
        key
    );
    return fallback;
}

// Exported helper: callers inject their own logger scope/prefix so missing
// dialog-key diagnostics stay attributed to the feature that requested them.
function resolveDialogText(dialogTexts, key, fallback = key, opts = {}) {
    if (dialogTexts && typeof dialogTexts[key] === 'string') return dialogTexts[key];
    if (!opts.log || typeof opts.log.warnOnce !== 'function') {
        throw new Error('[menu_builder] resolveDialogText requires opts.log.warnOnce');
    }
    const prefix = opts.warnPrefix || 'menu_builder.dialog.missing';
    opts.log.warnOnce(
        `${prefix}:${key}`,
        'Missing dialog translation key (using fallback):',
        key
    );
    return fallback;
}

function describeMenuBlockReason(reason) {
    if (reason === 'processing_mode') return 'processing-mode lock active';
    if (reason === 'current_text_pending') return 'current-text pending lock active';
    if (reason === 'pre_ready') return 'pre-READY';
    return `lock:${reason}`;
}

function createMenuActionItem(menuTexts, labelKey, actionId, sendMenuClick) {
    return {
        label: resolveMenuLabel(menuTexts, labelKey),
        click: () => sendMenuClick(actionId),
    };
}

function resolveMacAppMenuLabel() {
    if (typeof app.name === 'string' && app.name.trim()) return app.name;
    if (typeof app.getName === 'function') {
        const appName = app.getName();
        if (typeof appName === 'string' && appName.trim()) return appName;
    }
    return 'App';
}

// =============================================================================
// Translation loading
// =============================================================================
// Translations live under i18n/<lang>/main.json.
//
// Fallback chain (in order):
// 1) requested tag (e.g. 'es-cl')
// 2) base tag      (e.g. 'es')
// 3) DEFAULT_LANG as a final safe fallback
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
// - If nothing can be loaded, we return {} and the menu falls back to translation keys.

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
                `menu_builder.loadMainTranslations.overlayMissing:${requested}:${base || 'none'}`,
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
        files.push(path.join(I18N_DIR, langBase, langCode, 'main.json'));
    }
    files.push(path.join(I18N_DIR, langCode, 'main.json'));

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileVariant = files.length > 1 && i === 0 ? 'region' : 'root';
        if (!fs.existsSync(file)) continue;

        try {
            let raw = fs.readFileSync(file, 'utf8');

            // Remove UTF-8 BOM if present (some editors add it and JSON.parse fails).
            raw = raw.replace(/^\uFEFF/, '');

            if (raw.trim() === '') {
                log.warnOnce(
                    `menu_builder.loadMainTranslations.empty:${langCode}:${fileVariant}`,
                    'main.json is empty (trying fallback):',
                    { requested, langCode, file }
                );
                continue;
            }

            const parsed = JSON.parse(raw);
            if (!isPlainObject(parsed)) {
                log.warnOnce(
                    `menu_builder.loadMainTranslations.invalidShape:${langCode}:${fileVariant}`,
                    'main.json root must be a JSON object (trying fallback):',
                    { requested, langCode, file }
                );
                continue;
            }

            return parsed;
        } catch (err) {
            log.warnOnce(
                `menu_builder.loadMainTranslations.failed:${langCode}:${fileVariant}`,
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
// Public helper: native dialog texts
// =============================================================================
// Some dialogs are shown by the main process (Electron native dialogs).
// This returns the "main.dialog" section from the translation file.

function getDialogTexts(lang) {
    const tr = loadMainTranslations(lang);
    const tMain = isPlainObject(tr && tr.main) ? tr.main : {};
    return isPlainObject(tMain.dialog) ? tMain.dialog : {};
}

// =============================================================================
// Public helper: native application menu
// =============================================================================

/**
 * Builds and installs the native menu.
 * - Labels come from i18n/<lang>/main.json (with fallbacks).
 * - Clicks send an action id to the renderer via 'menu-click'.
 *
 * @param {string} lang - Language code (e.g. 'es', 'en').
 * @param {object} [opts]
 * @param {Electron.BrowserWindow|null} [opts.mainWindow] - Target window for 'menu-click'.
 * @param {Function} [opts.resolveMainWindow] - Resolver for the target window.
 * @param {Function} [opts.isMenuEnabled] - Returns whether menu actions should dispatch.
 * @param {Function} [opts.getMenuBlockReason] - Optional reason provider when menu actions are blocked.
 * @param {Function} [opts.onOpenLanguage] - Callback that opens the language selection window.
 */
function buildAppMenu(lang, opts = {}) {
    const effectiveLang = normalizeLangTag(lang) || DEFAULT_LANG;
    const tr = loadMainTranslations(effectiveLang) || {};
    const tMain = isPlainObject(tr.main) ? tr.main : {};
    const m = isPlainObject(tMain.menu) ? tMain.menu : {};

    const resolveMainWindow =
        typeof opts.resolveMainWindow === 'function'
            ? opts.resolveMainWindow
            : () => (opts.mainWindow || null);

    const isMenuEnabled =
        typeof opts.isMenuEnabled === 'function'
            ? opts.isMenuEnabled
            : () => true;

    const getMenuBlockReason =
        typeof opts.getMenuBlockReason === 'function'
            ? opts.getMenuBlockReason
            : () => 'pre_ready';

    const canDispatchMenuAction = (actionId) => {
        if (isMenuEnabled()) return true;
        const reasonRaw = String(getMenuBlockReason(actionId) || '').trim();
        const reason = reasonRaw || 'interaction_locked';
        const reasonLabel = describeMenuBlockReason(reason);
        log.warnOnce(
            `menu_builder.inert.${reason}:${actionId}`,
            `Menu action ignored (${reasonLabel}):`,
            actionId
        );
        if (reason === 'processing_mode' || reason === 'current_text_pending') {
            const mainWindow = resolveMainWindow();
            if (!mainWindow) {
                log.warnOnce(
                    'menu_builder.processing_lock_notice.noWindow',
                    "Processing lock notice 'menu-click' send failed (ignored): no mainWindow"
                );
                return false;
            }
            if (mainWindow.isDestroyed()) {
                log.warnOnce(
                    'menu_builder.processing_lock_notice.destroyed',
                    "Processing lock notice 'menu-click' send failed (ignored): mainWindow destroyed"
                );
                return false;
            }
            try {
                mainWindow.webContents.send(MENU_CLICK_CHANNEL, MENU_PROCESSING_LOCK_NOTICE_ACTION);
            } catch (err) {
                log.warnOnce(
                    'menu_builder.processing_lock_notice.sendFailed',
                    "webContents.send('menu-click') failed for processing lock notice (ignored):",
                    err
                );
            }
        }
        return false;
    };

    const resolveDevTarget = () => {
        const focused = BrowserWindow.getFocusedWindow();
        const resolvedMain = resolveMainWindow();
        if (focused && !focused.isDestroyed()) return focused;
        if (resolvedMain && !resolvedMain.isDestroyed()) return resolvedMain;
        return null;
    };

    // Optional integration hook supplied by main.js for the language picker.
    const onOpenLanguage =
        typeof opts.onOpenLanguage === 'function' ? opts.onOpenLanguage : null;

    // Send a menu action to the renderer.
    // If the window is missing/closing, we drop the action and log once (best-effort IPC).
    const sendMenuClick = (payload) => {
        if (!canDispatchMenuAction(payload)) return;

        const mainWindow = resolveMainWindow();
        if (!mainWindow) {
            log.warn(
                'menu-click failed (ignored): no mainWindow',
                payload
            );
            return;
        }
        if (mainWindow.isDestroyed()) {
            log.warn(
                'menu-click failed (ignored): mainWindow destroyed',
                payload
            );
            return;
        }

        try {
            mainWindow.webContents.send(MENU_CLICK_CHANNEL, payload);
        } catch (err) {
            log.warn(
                "webContents.send('menu-click') failed (ignored):",
                payload,
                err
            );
        }
    };

    // Menu template:
    // - Prefer translated labels when available.
    // - Each click emits a stable action id (string).
    const menuTemplate = [];
    if (process.platform === 'darwin') {
        menuTemplate.push({
            label: resolveMacAppMenuLabel(),
            submenu: [
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' },
            ],
        });
    }

    menuTemplate.push(
        {
            label: resolveMenuLabel(m, 'como_usar'),
            submenu: [
                createMenuActionItem(m, 'guia_basica', 'guia_basica', sendMenuClick),
                createMenuActionItem(m, 'instrucciones_completas', 'instrucciones_completas', sendMenuClick),
                createMenuActionItem(m, 'faq', 'faq', sendMenuClick),
            ],
        },
        {
            label: resolveMenuLabel(m, 'preferencias'),
            submenu: [
                {
                    label: resolveMenuLabel(m, 'idioma'),
                    // The window lifecycle is handled by main.js; this module only calls the hook.
                    click: () => {
                        if (!canDispatchMenuAction('menu.language')) return;
                        if (onOpenLanguage) {
                            try {
                                onOpenLanguage();
                            } catch (err) {
                                log.error(
                                    'onOpenLanguage callback failed:',
                                    err
                                );
                            }
                        } else {
                            log.warn(
                                'Language menu clicked but no handler was provided (ignored).'
                            );
                        }
                    },
                },
                {
                    label: resolveMenuLabel(m, 'diseno'),
                    submenu: [
                        createMenuActionItem(m, 'skins', 'diseno_skins', sendMenuClick),
                        createMenuActionItem(m, 'crono_flotante', 'diseno_crono_flotante', sendMenuClick),
                        createMenuActionItem(m, 'fuentes', 'diseno_fuentes', sendMenuClick),
                        createMenuActionItem(m, 'colores', 'diseno_colores', sendMenuClick),
                    ],
                },
                createMenuActionItem(m, 'shortcuts', 'shortcuts', sendMenuClick),
                createMenuActionItem(m, 'presets_por_defecto', 'presets_por_defecto', sendMenuClick),
                createMenuActionItem(m, 'enable_google_ocr', 'enable_google_ocr', sendMenuClick),
                createMenuActionItem(m, 'disconnect_google_ocr', 'disconnect_google_ocr', sendMenuClick),
            ],
        },
        createMenuActionItem(m, 'links_interes', 'links_interes', sendMenuClick),
        {
            label: resolveMenuLabel(m, 'ayuda'),
            submenu: [
                createMenuActionItem(m, 'actualizar_version', 'actualizar_version', sendMenuClick),
                createMenuActionItem(m, 'acerca_de', 'acerca_de', sendMenuClick),
            ],
        }
    );

    // Development menu:
    // - Hidden in packaged builds.
    // - In development, shown only if SHOW_DEV_MENU=1.
    const showDevMenu = process.env.SHOW_DEV_MENU === '1';
    if (!app.isPackaged && showDevMenu) {
        menuTemplate.push({
            label: resolveMenuLabel(m, 'desarrollo'),
            submenu: [
                {
                    label: resolveMenuLabel(m, 'recargar'),
                    accelerator: 'CommandOrControl+R',
                    click: () => {
                        if (!canDispatchMenuAction('dev.reload')) return;
                        const target = resolveDevTarget();
                        if (!target) {
                            log.warn('dev reload failed (ignored): no target window');
                            return;
                        }
                        try {
                            target.webContents.reload();
                        } catch (err) {
                            log.warn(
                                'dev reload failed (ignored):',
                                err
                            );
                        }
                    },
                },
                {
                    label: resolveMenuLabel(m, 'forcereload'),
                    accelerator: 'CommandOrControl+Shift+R',
                    click: () => {
                        if (!canDispatchMenuAction('dev.forceReload')) return;
                        const target = resolveDevTarget();
                        if (!target) {
                            log.warn('dev force reload failed (ignored): no target window');
                            return;
                        }
                        try {
                            target.webContents.reloadIgnoringCache();
                        } catch (err) {
                            log.warn(
                                'dev force reload failed (ignored):',
                                err
                            );
                        }
                    },
                },
                {
                    label: resolveMenuLabel(m, 'toggle_devtools'),
                    accelerator: 'Ctrl+Shift+I',
                    click: () => {
                        if (!canDispatchMenuAction('dev.toggleDevTools')) return;
                        const target = resolveDevTarget();
                        if (!target) {
                            log.warn('toggleDevTools failed (ignored): no target window');
                            return;
                        }
                        try {
                            target.webContents.toggleDevTools();
                        } catch (err) {
                            log.warn(
                                'toggleDevTools failed (ignored):',
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

// =============================================================================
// Exports
// =============================================================================

module.exports = {
    getDialogTexts,
    buildAppMenu,
    resolveDialogText,
};

// =============================================================================
// End of electron/menu_builder.js
// =============================================================================
