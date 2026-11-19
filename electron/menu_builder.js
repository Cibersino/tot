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
const languageResources = require('./language_resources');
const graphApi = require('../public/js/lib/language_resource_graph');

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

const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);
let defaultMainTranslations = null;

const deepMerge = (base, overlay) => {
    const result = Object.assign({}, base);
    Object.keys(overlay).forEach((key) => {
        if (isPlainObject(result[key]) && isPlainObject(overlay[key])) {
            result[key] = deepMerge(result[key], overlay[key]);
        } else {
            result[key] = overlay[key];
        }
    });
    return result;
};

function resolveMenuLabel(menuTexts, key, fallback = key) {
    if (menuTexts && typeof menuTexts[key] === 'string') return menuTexts[key];
    log.warnOnce(
        `menu_builder.missingKey:${key}`,
        'Missing menu translation key (using fallback):',
        key
    );
    return fallback;
}

// Exported helper: callers inject their own logger scope so missing
// dialog-key diagnostics stay attributed to the feature that requested them.
function resolveDialogText(dialogTexts, key, fallback = key, opts = {}) {
    if (dialogTexts && typeof dialogTexts[key] === 'string') return dialogTexts[key];
    if (!opts.log || typeof opts.log.warn !== 'function') {
        throw new Error('[menu_builder] resolveDialogText requires opts.log.warn');
    }
    opts.log.warn(
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

function resolveAppMenuName() {
    const candidates = [];
    if (typeof app.getName === 'function') candidates.push(app.getName());
    candidates.push(app.name);

    for (const candidate of candidates) {
        if (typeof candidate === 'string' && candidate.trim()) return candidate;
    }

    return 'toT';
}

function formatMenuLabel(template, params = {}) {
    return String(template).replace(/\{(\w+)\}/g, (match, key) => (
        Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : match
    ));
}

// =============================================================================
// Translation loading
// =============================================================================
function initializeDefaultMainTranslations() {
    if (defaultMainTranslations) return defaultMainTranslations;

    const graph = languageResources.getGraph();
    const defaultDescriptor = graphApi.getDescriptor(graph, DEFAULT_LANG);
    if (!defaultDescriptor) {
        throw new Error(`[menu_builder] required default language is undeclared: ${DEFAULT_LANG}`);
    }

    const bundle = loadBundle(defaultDescriptor, DEFAULT_LANG, true);
    if (!bundle) throw new Error(`[menu_builder] required default main.json unavailable: ${DEFAULT_LANG}`);

    defaultMainTranslations = bundle;
    return defaultMainTranslations;
}

function loadMainTranslations(lang) {
    const graph = languageResources.getGraph();
    const selectedId = graphApi.resolveLanguageId(graph, lang || DEFAULT_LANG);
    if (!selectedId) throw new Error(`[menu_builder] unsupported application language: ${String(lang)}`);
    const chain = graphApi.getMergeChain(graph, selectedId);
    let translations = initializeDefaultMainTranslations();
    chain.forEach((descriptor) => {
        if (descriptor.id === DEFAULT_LANG) return;
        const bundle = loadBundle(descriptor, selectedId, false);
        if (!bundle) return;
        translations = deepMerge(translations, bundle);
    });
    return translations;
}

function loadBundle(descriptor, requestedLanguageId, isRequired) {
    const file = path.join(I18N_DIR, descriptor.resourceDirectory, 'main.json');
    try {
        const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
        const parsed = JSON.parse(raw);
        if (!isPlainObject(parsed)) throw new Error('root is not a JSON object');
        return parsed;
    } catch (error) {
        const details = { requestedLanguageId, languageId: descriptor.id, resourceDirectory: descriptor.resourceDirectory, file };
        if (isRequired) {
            log.errorOnce(`menu_builder.loadMainTranslations.requiredMissing:${descriptor.id}`, 'Required default main.json unavailable:', details, error);
        } else {
            log.warnOnce(`menu_builder.loadMainTranslations.failed:${descriptor.id}`, 'main.json unavailable; continuing through declared graph chain:', details, error);
        }
        return null;
    }
}

// =============================================================================
// Public helper: native dialog texts
// =============================================================================
// Some dialogs are shown by the main process (Electron native dialogs).
// This returns the "main.dialog" section from the translation file.

function getDialogTexts(lang) {
    const translations = loadMainTranslations(lang);
    const mainTexts = isPlainObject(translations.main) ? translations.main : {};
    return isPlainObject(mainTexts.dialog) ? mainTexts.dialog : {};
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
    const effectiveLang = typeof lang === 'string' && lang.trim() ? lang.trim() : DEFAULT_LANG;
    const translations = loadMainTranslations(effectiveLang);
    const mainTexts = isPlainObject(translations.main) ? translations.main : {};
    const menuTexts = isPlainObject(mainTexts.menu) ? mainTexts.menu : {};
    const macMenuTexts = isPlainObject(menuTexts.mac) ? menuTexts.mac : {};
    const appMenuName = resolveAppMenuName();

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
        const shouldSendProcessingLockNotice = reason === 'processing_mode' || reason === 'current_text_pending';
        if (!shouldSendProcessingLockNotice) return false;

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
        } catch (error) {
            log.warnOnce(
                'menu_builder.processing_lock_notice.sendFailed',
                "webContents.send('menu-click') failed for processing lock notice (ignored):",
                error
            );
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

    const createDevMenuActionItem = (labelKey, actionId, accelerator, actionLabel, runOnTarget) => ({
        label: resolveMenuLabel(menuTexts, labelKey),
        accelerator,
        click: () => {
            if (!canDispatchMenuAction(actionId)) return;

            const target = resolveDevTarget();
            if (!target) {
                log.warn(`${actionLabel} failed (ignored): no target window`);
                return;
            }

            try {
                runOnTarget(target);
            } catch (error) {
                log.warn(`${actionLabel} failed (ignored):`, error);
            }
        },
    });

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
        } catch (error) {
            log.warn(
                "webContents.send('menu-click') failed (ignored):",
                payload,
                error
            );
        }
    };

    // Menu template:
    // - Prefer translated labels when available.
    // - Each click emits a stable action id (string).
    const menuTemplate = [];
    if (process.platform === 'darwin') {
        menuTemplate.push({
            label: appMenuName,
            submenu: [
                {
                    role: 'services',
                    label: resolveMenuLabel(macMenuTexts, 'mac_services'),
                },
                { type: 'separator' },
                {
                    role: 'hide',
                    label: formatMenuLabel(resolveMenuLabel(macMenuTexts, 'mac_hide_app'), { app: appMenuName }),
                },
                {
                    role: 'hideOthers',
                    label: resolveMenuLabel(macMenuTexts, 'mac_hide_others'),
                },
                {
                    role: 'unhide',
                    label: resolveMenuLabel(macMenuTexts, 'mac_show_all'),
                },
                { type: 'separator' },
                {
                    role: 'quit',
                    label: formatMenuLabel(resolveMenuLabel(macMenuTexts, 'mac_quit_app'), { app: appMenuName }),
                },
            ],
        });
    }

    menuTemplate.push(
        {
            label: resolveMenuLabel(menuTexts, 'como_usar'),
            submenu: [
                createMenuActionItem(menuTexts, 'guia_basica', 'guia_basica', sendMenuClick),
                createMenuActionItem(menuTexts, 'instrucciones_completas', 'instrucciones_completas', sendMenuClick),
                createMenuActionItem(menuTexts, 'faq', 'faq', sendMenuClick),
            ],
        },
        {
            label: resolveMenuLabel(menuTexts, 'preferencias'),
            submenu: [
                {
                    label: resolveMenuLabel(menuTexts, 'idioma'),
                    // The window lifecycle is handled by main.js; this module only calls the hook.
                    click: () => {
                        if (!canDispatchMenuAction('menu.language')) return;
                        if (!onOpenLanguage) {
                            log.warn(
                                'Language menu clicked but no handler was provided (ignored).'
                            );
                            return;
                        }
                        try {
                            onOpenLanguage();
                        } catch (error) {
                            log.error(
                                'onOpenLanguage callback failed:',
                                error
                            );
                        }
                    },
                },
                {
                    label: resolveMenuLabel(menuTexts, 'diseno'),
                    submenu: [
                        createMenuActionItem(menuTexts, 'skins', 'diseno_skins', sendMenuClick),
                        createMenuActionItem(menuTexts, 'crono_flotante', 'diseno_crono_flotante', sendMenuClick),
                        createMenuActionItem(menuTexts, 'fuentes', 'diseno_fuentes', sendMenuClick),
                        createMenuActionItem(menuTexts, 'colores', 'diseno_colores', sendMenuClick),
                    ],
                },
                createMenuActionItem(menuTexts, 'shortcuts', 'shortcuts', sendMenuClick),
                createMenuActionItem(menuTexts, 'presets_por_defecto', 'presets_por_defecto', sendMenuClick),
                createMenuActionItem(menuTexts, 'enable_google_ocr', 'enable_google_ocr', sendMenuClick),
                createMenuActionItem(menuTexts, 'disconnect_google_ocr', 'disconnect_google_ocr', sendMenuClick),
            ],
        },
        {
            label: resolveMenuLabel(menuTexts, 'links_interes'),
            submenu: [
                createMenuActionItem(menuTexts, 'enlaces_generales', 'links_interes', sendMenuClick),
            ],
        },
        {
            label: resolveMenuLabel(menuTexts, 'ayuda'),
            submenu: [
                createMenuActionItem(menuTexts, 'actualizar_version', 'actualizar_version', sendMenuClick),
                createMenuActionItem(menuTexts, 'acerca_de', 'acerca_de', sendMenuClick),
            ],
        }
    );

    // Development menu:
    // - Hidden in packaged builds.
    // - In development, shown only if SHOW_DEV_MENU=1.
    const showDevMenu = process.env.SHOW_DEV_MENU === '1';
    if (!app.isPackaged && showDevMenu) {
        menuTemplate.push({
            label: resolveMenuLabel(menuTexts, 'desarrollo'),
            submenu: [
                createDevMenuActionItem(
                    'recargar',
                    'dev.reload',
                    'CommandOrControl+R',
                    'dev reload',
                    (target) => target.webContents.reload()
                ),
                createDevMenuActionItem(
                    'forcereload',
                    'dev.forceReload',
                    'CommandOrControl+Shift+R',
                    'dev force reload',
                    (target) => target.webContents.reloadIgnoringCache()
                ),
                createDevMenuActionItem(
                    'toggle_devtools',
                    'dev.toggleDevTools',
                    'Ctrl+Shift+I',
                    'toggleDevTools',
                    (target) => target.webContents.toggleDevTools()
                ),
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
    initializeDefaultMainTranslations,
    resolveDialogText,
};

// =============================================================================
// End of electron/menu_builder.js
// =============================================================================
