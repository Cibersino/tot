// electron/settings.js
// Gestion centralizada de user_settings.json: language, modeConteo, numberFormatting, etc.

const fs = require("fs");
const path = require("path");

// Dependencias inyectadas desde main.js
let _loadJson = null;
let _saveJson = null;
let _settingsFile = null;

// Cache en memoria del último settings normalizado
let _currentSettings = null;

/**
 * Carga los defaults de formato numerico desde i18n/<lang>/numberFormat.json
 * Retorna { thousands, decimal } o null si no se pudo cargar.
 */
function loadNumberFormatDefaults(lang) {
    try {
        const langCode = (lang || "es").toLowerCase();
        const filePath = path.join(
            __dirname,
            "..",
            "i18n",
            langCode,
            "numberFormat.json"
        );
        if (!fs.existsSync(filePath)) return null;

        let raw = fs.readFileSync(filePath, "utf8");
        if (!raw) return null;

        // Eliminar BOM UTF-8 si existe (evita SyntaxError: Unexpected token '∩╗┐')
        raw = raw.replace(/^\uFEFF/, "");

        const json = JSON.parse(raw);

        const thousands =
            json.thousands ||
            json.thousandsSeparator ||
            json.separadorMiles ||
            json.sepMiles ||
            ".";
        const decimal =
            json.decimal ||
            json.decimalSeparator ||
            json.separadorDecimal ||
            json.sepDecimal ||
            ",";

        return { thousands, decimal };
    } catch (e) {
        console.error(
            "[settings] Error cargando numberFormat defaults para",
            lang,
            e
        );
        return null;
    }
}

/**
 * Normalizar settings: asegurar campos por defecto sin sobrescribir los existentes.
 * Mantiene la logica anterior de main.js.
 */
function normalizeSettings(s) {
    s = s || {};
    if (typeof s.language !== "string") s.language = "";
    if (!Array.isArray(s.presets)) s.presets = [];
    if (typeof s.numberFormatting !== "object") {
        s.numberFormatting = s.numberFormatting || {};
    }

    // Persistir modo de conteo por defecto: "preciso"
    if (!s.modeConteo || (s.modeConteo !== "preciso" && s.modeConteo !== "simple")) {
        s.modeConteo = "preciso";
    }

    // Ensure numberFormatting has defaults for current language (from i18n if available)
    const lang =
        s.language && typeof s.language === "string" && s.language.trim()
            ? s.language.trim()
            : "es";

    if (!s.numberFormatting[lang]) {
        const nf = loadNumberFormatDefaults(lang);
        if (nf && nf.thousands && nf.decimal) {
            s.numberFormatting[lang] = {
                separadorMiles: nf.thousands,
                separadorDecimal: nf.decimal,
            };
        } else {
            // fallback simple
            s.numberFormatting[lang] =
                lang === "en"
                    ? { separadorMiles: ",", separadorDecimal: "." }
                    : { separadorMiles: ".", separadorDecimal: "," };
        }
    }

    return s;
}

/**
 * Inicializacion desde main.js
 * - Inyecta loadJson/saveJson y ruta de SETTINGS_FILE.
 * - Lee, normaliza y persiste user_settings.json.
 * - Deja _currentSettings cacheado.
 */
function init({ loadJson, saveJson, settingsFile }) {
    if (typeof loadJson !== "function" || typeof saveJson !== "function") {
        throw new Error("[settings] init requiere loadJson y saveJson");
    }
    if (!settingsFile) {
        throw new Error("[settings] init requiere settingsFile");
    }

    _loadJson = loadJson;
    _saveJson = saveJson;
    _settingsFile = settingsFile;

    const raw = _loadJson(_settingsFile, { language: "", presets: [] });
    const normalized = normalizeSettings(raw);
    _currentSettings = normalized;

    try {
        _saveJson(_settingsFile, _currentSettings);
    } catch (e) {
        console.error("[settings] Error persistiendo settings en init:", e);
    }

    return _currentSettings;
}

/**
 * Devuelve el settings actual normalizado desde cache o disco.
 */
function getSettings() {
    if (!_loadJson || !_settingsFile) {
        throw new Error("[settings] getSettings llamado antes de init");
    }
    // Siempre recargar desde disco para reflejar cambios hechos fuera de settingsState
    const raw = _loadJson(_settingsFile, { language: "", presets: [] });
    _currentSettings = normalizeSettings(raw);
    return _currentSettings;
}

/**
 * Normaliza y persiste settings, actualizando el cache.
 */
function saveSettings(nextSettings) {
    if (!nextSettings) return getSettings();
    const normalized = normalizeSettings(nextSettings);
    _currentSettings = normalized;
    try {
        if (_saveJson && _settingsFile) {
            _saveJson(_settingsFile, normalized);
        }
    } catch (e) {
        console.error("[settings] Error guardando settings:", e);
    }
    return _currentSettings;
}

/**
 * Broadcast centralizado de 'settings-updated' a ventanas conocidas.
 */
function broadcastSettingsUpdated(settings, windows) {
    if (!windows) return;
    const { mainWin, editorWin, presetWin, floatingWin } = windows;

    try {
        if (mainWin && !mainWin.isDestroyed()) {
            mainWin.webContents.send("settings-updated", settings);
        }
        if (editorWin && !editorWin.isDestroyed()) {
            editorWin.webContents.send("settings-updated", settings);
        }
        if (presetWin && !presetWin.isDestroyed()) {
            presetWin.webContents.send("settings-updated", settings);
        }
        if (floatingWin && !floatingWin.isDestroyed()) {
            floatingWin.webContents.send("settings-updated", settings);
        }
    } catch (err) {
        console.error("[settings] Error notificando settings-updated:", err);
    }
}

/**
 * Registra IPC relacionados con configuracion general:
 * - get-settings
 * - set-language
 * - set-mode-conteo
 */
function registerIpc(
    ipcMain,
    {
        getWindows,          // () => ({ mainWin, editorWin, presetWin, langWin, floatingWin })
        buildAppMenu,       // function(lang)
        getCurrentLanguage, // () => currentLanguage
        setCurrentLanguage, // (lang) => void
    }
) {
    if (!ipcMain) {
        throw new Error("[settings] registerIpc requiere ipcMain");
    }

    // get-settings: retorna el objeto settings actual (normalizado)
    ipcMain.handle("get-settings", async () => {
        try {
            return getSettings();
        } catch (e) {
            console.error("Error en get-settings:", e);
            return { language: "es", presets: [] };
        }
    });

    // set-language: guarda idioma, asegura numberFormatting y rebuildea menú
    ipcMain.handle("set-language", async (_event, lang) => {
        try {
            const chosen = String(lang || "").trim();
            const effectiveLang = chosen || "es";

            let settings = getSettings();
            settings.language = chosen;

            settings.numberFormatting = settings.numberFormatting || {};
            if (!settings.numberFormatting[effectiveLang]) {
                const nf = loadNumberFormatDefaults(effectiveLang);
                if (nf && nf.thousands && nf.decimal) {
                    settings.numberFormatting[effectiveLang] = {
                        separadorMiles: nf.thousands,
                        separadorDecimal: nf.decimal,
                    };
                } else if (effectiveLang === "en") {
                    settings.numberFormatting[effectiveLang] = {
                        separadorMiles: ",",
                        separadorDecimal: ".",
                    };
                } else {
                    settings.numberFormatting[effectiveLang] = {
                        separadorMiles: ".",
                        separadorDecimal: ",",
                    };
                }
            }

            settings = saveSettings(settings);

            if (typeof setCurrentLanguage === "function") {
                setCurrentLanguage(effectiveLang);
            }

            const windows = typeof getWindows === "function" ? getWindows() : {};

            // Rebuild menu con el nuevo idioma
            if (typeof buildAppMenu === "function") {
                try {
                    buildAppMenu(effectiveLang);
                } catch (menuErr) {
                    console.warn("[settings] No se pudo reconstruir el menu:", menuErr);
                }
            }

            // Ocultar la barra en ventanas secundarias (editor, preset, language)
            try {
                const { editorWin, presetWin, langWin } = windows;
                if (editorWin && !editorWin.isDestroyed()) {
                    editorWin.setMenu(null);
                    editorWin.setMenuBarVisibility(false);
                }
                if (presetWin && !presetWin.isDestroyed()) {
                    presetWin.setMenu(null);
                    presetWin.setMenuBarVisibility(false);
                }
                if (langWin && !langWin.isDestroyed()) {
                    langWin.setMenu(null);
                    langWin.setMenuBarVisibility(false);
                }
            } catch (menuErr) {
                console.warn(
                    "[settings] No se pudo ocultar menu en ventanas secundarias:",
                    menuErr
                );
            }

            broadcastSettingsUpdated(settings, windows);

            return { ok: true, language: chosen };
        } catch (err) {
            console.error("Error guardando language:", err);
            return { ok: false, error: String(err) };
        }
    });

    // set-mode-conteo: simple/preciso + broadcast
    ipcMain.handle("set-mode-conteo", async (_event, mode) => {
        try {
            let settings = getSettings();
            settings.modeConteo = mode === "simple" ? "simple" : "preciso";
            settings = saveSettings(settings);

            const windows = typeof getWindows === "function" ? getWindows() : {};
            broadcastSettingsUpdated(settings, windows);

            return { ok: true, mode: settings.modeConteo };
        } catch (err) {
            console.error("Error en set-mode-conteo:", err);
            return { ok: false, error: String(err) };
        }
    });
}

/**
 * Fallback para el caso en que el modal de idioma se cierra sin seleccionar nada.
 * Si settings.language esta vacio, fuerza fallbackLang (por defecto 'es')
 * y asegura numberFormatting[fallbackLang].
 */
function applyFallbackLanguageIfUnset(fallbackLang = "es") {
    try {
        let settings = getSettings();
        if (!settings.language || settings.language === "") {
            const lang = fallbackLang || "es";
            settings.language = lang;
            settings.numberFormatting = settings.numberFormatting || {};

            if (!settings.numberFormatting[lang]) {
                const nf = loadNumberFormatDefaults(lang);
                if (nf && nf.thousands && nf.decimal) {
                    settings.numberFormatting[lang] = {
                        separadorMiles: nf.thousands,
                        separadorDecimal: nf.decimal,
                    };
                } else if (lang === "en") {
                    settings.numberFormatting[lang] = {
                        separadorMiles: ",",
                        separadorDecimal: ".",
                    };
                } else {
                    settings.numberFormatting[lang] = {
                        separadorMiles: ".",
                        separadorDecimal: ",",
                    };
                }
            }

            saveSettings(settings);
        }
    } catch (e) {
        console.error("[settings] Error aplicando fallback language:", e);
    }
}

module.exports = {
    init,
    registerIpc,
    getSettings,
    saveSettings,
    normalizeSettings,
    loadNumberFormatDefaults,
    applyFallbackLanguageIfUnset,
    broadcastSettingsUpdated,
};
