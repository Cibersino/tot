console.log("Renderer main starting...");

const textPreview = document.getElementById('textPreview');
const btnCountClipboard = document.getElementById('btnCountClipboard');
const btnAppendClipboardNewLine = document.getElementById('btnAppendClipboardNewLine');
const btnEdit = document.getElementById('btnEdit');
const btnEmptyMain = document.getElementById('btnEmptyMain');
const btnHelp = document.getElementById('btnHelp');

const resChars = document.getElementById('resChars');
const resCharsNoSpace = document.getElementById('resCharsNoSpace');
const resWords = document.getElementById('resWords');
const resTime = document.getElementById('resTime');

const toggleModoPreciso = document.getElementById('toggleModoPreciso');

const wpmSlider = document.getElementById('wpmSlider');
const wpmInput = document.getElementById('wpmInput');

const realWpmDisplay = document.getElementById('realWpmDisplay');
const selectorTitle = document.getElementById('selector-title');
const velTitle = document.getElementById('vel-title');
const resultsTitle = document.getElementById('results-title');
const cronTitle = document.getElementById('cron-title');

const toggleVF = document.getElementById('toggleVF');

// Referencias a elementos para presets
const presetsSelect = document.getElementById('presets');
const btnNewPreset = document.getElementById('btnNewPreset');
const btnEditPreset = document.getElementById('btnEditPreset');
const btnDeletePreset = document.getElementById('btnDeletePreset');
const btnResetDefaultPresets = document.getElementById('btnResetDefaultPresets');
const presetDescription = document.getElementById('presetDescription');

let currentText = "";

// Límite local en renderer para evitar concatenaciones que creen strings demasiado grandes
let MAX_TEXT_CHARS = 1e7; // valor por defecto hasta que main responda

// --- Cache y estado global para conteo / idioma ---
let modoConteo = "preciso";   // preciso por defecto; puede ser "simple"
let idiomaActual = "es";      // se inicializa al arrancar
let settingsCache = {};       // caché de settings (numberFormatting, language, etc.)

// --- i18n renderer translations cache ---
let rendererTranslations = null;
let rendererTranslationsLang = null;

async function loadRendererTranslations(lang) {
  const target = (lang || "").toLowerCase() || "es";
  if (rendererTranslations && rendererTranslationsLang === target) return rendererTranslations;
  try {
    const resp = await fetch(`../i18n/${target}/renderer.json`);
    if (resp && resp.ok) {
      const raw = await resp.text();
      const cleaned = raw.replace(/^\uFEFF/, ""); // strip BOM if present
      const data = JSON.parse(cleaned || "{}");
      rendererTranslations = data;
      rendererTranslationsLang = target;
      return data;
    }
  } catch (e) {
    console.warn("No se pudieron cargar traducciones de renderer:", e);
  }
  rendererTranslations = null;
  rendererTranslationsLang = null;
  return null;
}

function tRenderer(path, fallback) {
  if (!rendererTranslations) return fallback;
  const parts = path.split(".");
  let cur = rendererTranslations;
  for (const p of parts) {
    if (cur && Object.prototype.hasOwnProperty.call(cur, p)) {
      cur = cur[p];
    } else {
      return fallback;
    }
  }
  return (typeof cur === "string") ? cur : fallback;
}

function msgRenderer(path, params = {}, fallback = "") {
  let str = tRenderer(path, fallback);
  if (!str) return fallback;
  Object.keys(params || {}).forEach(k => {
    const val = params[k];
    str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(val));
  });
  return str;
}

function applyTranslations() {
  if (!rendererTranslations) return;
  // Botones principales
  if (btnCountClipboard) btnCountClipboard.textContent = tRenderer("renderer.main.buttons.overwrite_clipboard", btnCountClipboard.textContent || "");
  if (btnAppendClipboardNewLine) btnAppendClipboardNewLine.textContent = tRenderer("renderer.main.buttons.append_clipboard_newline", btnAppendClipboardNewLine.textContent || "");
  if (btnEdit) btnEdit.textContent = tRenderer("renderer.main.buttons.edit", btnEdit.textContent || "");
  if (btnEmptyMain) btnEmptyMain.textContent = tRenderer("renderer.main.buttons.clear", btnEmptyMain.textContent || "");
  // Tooltips de botones principales
  if (btnCountClipboard) btnCountClipboard.title = tRenderer("renderer.main.tooltips.overwrite_clipboard", btnCountClipboard.title || "");
  if (btnAppendClipboardNewLine) btnAppendClipboardNewLine.title = tRenderer("renderer.main.tooltips.append_clipboard_newline", btnAppendClipboardNewLine.title || "");
  if (btnEdit) btnEdit.title = tRenderer("renderer.main.tooltips.edit", btnEdit.title || "");
  if (btnEmptyMain) btnEmptyMain.title = tRenderer("renderer.main.tooltips.clear", btnEmptyMain.title || "");

  // Presets
  if (btnNewPreset) btnNewPreset.textContent = tRenderer("renderer.main.speed.new", btnNewPreset.textContent || "");
  if (btnEditPreset) btnEditPreset.textContent = tRenderer("renderer.main.speed.edit", btnEditPreset.textContent || "");
  if (btnDeletePreset) btnDeletePreset.textContent = tRenderer("renderer.main.speed.delete", btnDeletePreset.textContent || "");
  if (btnResetDefaultPresets) btnResetDefaultPresets.textContent = tRenderer("renderer.main.speed.reset_defaults", btnResetDefaultPresets.textContent || "");
  if (btnNewPreset) btnNewPreset.title = tRenderer("renderer.main.tooltips.new_preset", btnNewPreset.title || "");
  if (btnEditPreset) btnEditPreset.title = tRenderer("renderer.main.tooltips.edit_preset", btnEditPreset.title || "");
  if (btnDeletePreset) btnDeletePreset.title = tRenderer("renderer.main.tooltips.delete_preset", btnDeletePreset.title || "");
  if (btnResetDefaultPresets) btnResetDefaultPresets.title = tRenderer("renderer.main.tooltips.reset_presets", btnResetDefaultPresets.title || "");

  // Toggle flotante
  if (toggleVF) toggleVF.textContent = tRenderer("renderer.main.timer.floating", toggleVF.textContent || "");
  const vfSwitchLabel = document.querySelector(".vf-switch-wrapper label.switch");
  if (vfSwitchLabel) vfSwitchLabel.title = tRenderer("renderer.main.tooltips.floating_window", vfSwitchLabel.title || "");

  // Títulos de secciones
  if (selectorTitle) selectorTitle.textContent = tRenderer("renderer.main.selector_title", selectorTitle.textContent || "");
  if (velTitle) velTitle.textContent = tRenderer("renderer.main.speed.title", velTitle.textContent || "");
  if (resultsTitle) resultsTitle.textContent = tRenderer("renderer.main.results.title", resultsTitle.textContent || "");
  if (cronTitle) cronTitle.textContent = tRenderer("renderer.main.timer.title", cronTitle.textContent || "");

  // Labels dentro de velocidad
  const wpmLabel = document.querySelector(".wpm-row span");
  if (wpmLabel) wpmLabel.textContent = tRenderer("renderer.main.speed.wpm_label", wpmLabel.textContent || "");
  if (presetsSelect) {
    const placeholderOpt = presetsSelect.querySelector("option");
    if (placeholderOpt) {
      placeholderOpt.textContent = tRenderer("renderer.main.speed.presets_placeholder", placeholderOpt.textContent || "");
    }
  }

  // Resultados: label modo preciso
  const togglePrecisoLabel = document.querySelector(".toggle-wrapper .toggle-label");
  if (togglePrecisoLabel) {
    togglePrecisoLabel.textContent = tRenderer("renderer.main.results.precise_mode", togglePrecisoLabel.textContent || "");
  }

  // Cronómetro: label velocidad y aria-label controles
  const realWpmLabel = document.querySelector(".realwpm");
  if (realWpmLabel && realWpmLabel.firstChild) {
    realWpmLabel.firstChild.textContent = tRenderer("renderer.main.timer.speed", realWpmLabel.firstChild.textContent || "");
  }
  const timerControls = document.querySelector(".timer-controls");
  if (timerControls) {
    const ariaLabel = tRenderer("renderer.main.timer.controls_label", timerControls.getAttribute("aria-label") || "");
    if (ariaLabel) timerControls.setAttribute("aria-label", ariaLabel);
  }

  // Etiqueta abreviada de la ventana flotante
  const vfLabel = document.querySelector(".vf-label");
  if (vfLabel) {
    vfLabel.textContent = tRenderer("renderer.main.timer.floating_short", vfLabel.textContent || vfLabel.textContent);
  }

  // Botón de ayuda (titulo)
  if (btnHelp) {
    const helpTitle = tRenderer("renderer.main.tooltips.help_button", btnHelp.getAttribute("title") || "");
    if (helpTitle) btnHelp.setAttribute("title", helpTitle);
  }
}

(async () => {
  try {
    const cfg = await window.electronAPI.getAppConfig();
    if (cfg && cfg.maxTextChars) MAX_TEXT_CHARS = Number(cfg.maxTextChars) || MAX_TEXT_CHARS;
  } catch (e) {
    console.error("No se pudo obtener getAppConfig, usando defaults:", e);
  }

  // Cargar settings del usuario UNA VEZ al iniciar renderer
  try {
    const settings = await window.electronAPI.getSettings();
    settingsCache = settings || {};
    idiomaActual = settingsCache.language || "es";
    if (settingsCache.modeConteo) modoConteo = settingsCache.modeConteo;

    // Cargar traducciones del renderer y aplicarlas
    try {
      await loadRendererTranslations(idiomaActual);
      applyTranslations();
      // Refrescar la vista inicial con las traducciones cargadas
      updatePreviewAndResults(currentText);
    } catch (e) {
      console.warn("No se pudieron aplicar traducciones iniciales en renderer:", e);
    }
  } catch (e) {
    console.error("No se pudo obtener user settings al inicio:", e);
    // idiomaActual queda en "es" por defecto
  }
})();

let wpm = Number(wpmSlider.value);
let currentPresetName = null;

// Caché local de presets (lista completa cargada una vez)
let allPresetsCache = [];

// ======================= Conteo de texto =======================
// Version simple
function contarTextoSimple(texto, language) {
  const conEspacios = texto.length;
  const sinEspacios = texto.replace(/\s+/g, '').length;
  const palabras = texto.trim() === "" ? 0 : texto.trim().split(/\s+/).length;
  return { conEspacios, sinEspacios, palabras };
}

function hasIntlSegmenter() {
  return typeof Intl !== "undefined" && typeof Intl.Segmenter === "function";
}

function contarTextoPrecisoFallback(texto, language) {
  // Fallback razonable: graphemes mediante spread (mejor que length) y palabras por regex simple
  const graphemes = [...texto]; // no perfecto para todos los combining clusters pero superior a length
  const conEspacios = graphemes.length;
  const sinEspacios = graphemes.filter(c => !/\s/.test(c)).length;

  // simple word extraction: sequences separated by whitespace (degradado al antiguo)
  const palabras = texto.trim() === "" ? 0 : texto.trim().split(/\s+/).length;

  return { conEspacios, sinEspacios, palabras };
}

// Version precisa usando Intl.Segmenter
// Fallback y comprobación de soporte
function hasIntlSegmenter() {
  return typeof Intl !== "undefined" && typeof Intl.Segmenter === "function";
}

function contarTextoPrecisoFallback(texto, language) {
  // Fallback razonable: spread para mejores graphemes que .length y split básico
  const graphemes = [...texto];
  const conEspacios = graphemes.length;
  const sinEspacios = graphemes.filter(c => !/\s/.test(c)).length;
  const palabras = texto.trim() === "" ? 0 : texto.trim().split(/\s+/).length;
  return { conEspacios, sinEspacios, palabras };
}

// Versión precisa con fallback automático
function contarTextoPreciso(texto, language) {
  if (!hasIntlSegmenter()) {
    // motor antiguo: usar fallback seguro
    return contarTextoPrecisoFallback(texto, language);
  }

  // Si Intl.Segmenter existe, usar la implementación precisa
  const segGraf = new Intl.Segmenter(language, { granularity: "grapheme" });
  const grafemas = [...segGraf.segment(texto)];

  const conEspacios = grafemas.length;
  const sinEspacios = grafemas.filter(g => !/\s/.test(g.segment)).length;

  const segPal = new Intl.Segmenter(language, { granularity: "word" });
  const palabras = [...segPal.segment(texto)]
    .filter(seg => seg.isWordLike)
    .length;

  return { conEspacios, sinEspacios, palabras };
}

// Dispatcher que selecciona el modo (simple/preciso). Preciso por defecto.
function contarTexto(texto) {
  // usar idiomaActual cargado al inicio
  return (modoConteo === "simple")
    ? contarTextoSimple(texto, idiomaActual)
    : contarTextoPreciso(texto, idiomaActual);
}

// Helpers para actualizar modo / idioma desde otras partes (p. ej. menú)
function setModoConteo(nuevoModo) {
  if (nuevoModo === "simple" || nuevoModo === "preciso") {
    modoConteo = nuevoModo;
  }
}

function setIdiomaActual(nuevoIdioma) {
  if (typeof nuevoIdioma === "string" && nuevoIdioma.length > 0) {
    idiomaActual = nuevoIdioma;
  }
}

// ======================= Formato HHh MMm SSs =======================
function getTimeParts(words, wpm) {
  if (!wpm || wpm <= 0) return { hours: 0, minutes: 0, seconds: 0 };
  const totalSeconds = Math.round((words / wpm) * 60);
  return {
    hours: Math.floor(totalSeconds / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60
  };
}

function formatTimeFromWords(words, wpm) {
  const { hours, minutes, seconds } = getTimeParts(words, wpm);
  return `${hours}h ${minutes}m ${seconds}s`;
}

// ======================= Number format defaults (i18n fallback) =======================
const numberFormatDefaults = {};
const loadNumberFormatDefaults = async (idioma) => {
  const lang = (idioma || "").toLowerCase() || "es";
  if (numberFormatDefaults[lang]) return numberFormatDefaults[lang];
  try {
    const resp = await fetch(`../i18n/${lang}/numberFormat.json`);
    if (resp && resp.ok) {
      const data = await resp.json();
      if (data && data.numberFormat) {
        numberFormatDefaults[lang] = data.numberFormat;
        return data.numberFormat;
      }
    }
  } catch (e) {
    // noop
  }
  if (lang.startsWith("en")) return { thousands: ",", decimal: "." };
  return { thousands: ".", decimal: "," };
};

// ======================= Obtener separadores de números según el idioma (usa cache) =======================
const obtenerSeparadoresDeNumeros = async (idioma) => {
  // 1) User preference from settings
  const nf = settingsCache && settingsCache.numberFormatting ? settingsCache.numberFormatting : null;
  if (nf && nf[idioma]) return nf[idioma];

  // 2) Default from i18n numberFormat
  try {
    const def = await loadNumberFormatDefaults(idioma || "es");
    if (def && def.thousands && def.decimal) {
      return { separadorMiles: def.thousands, separadorDecimal: def.decimal };
    }
  } catch (e) {
    // noop
  }

  // 3) Fallback simple
  if (idioma && idioma.toLowerCase().startsWith('en')) {
    return { separadorMiles: ',', separadorDecimal: '.' };
  }
  return { separadorMiles: '.', separadorDecimal: ',' };
};

// ======================= Formatear número con separadores de miles y decimales =======================
const formatearNumero = (numero, separadorMiles, separadorDecimal) => {
  // Convertir el número a string con decimales si es necesario
  let [entero, decimal] = numero.toFixed(0).split('.');

  // Agregar separador de miles
  entero = entero.replace(/\B(?=(\d{3})+(?!\d))/g, separadorMiles);

  // Si hay parte decimal, usar el separador adecuado
  return decimal ? `${entero}${separadorDecimal}${decimal}` : entero;
};

// ======================= Actualizar vista y resultados =======================
async function updatePreviewAndResults(text) {
  const previousText = currentText;      // texto antes del cambio
  currentText = text || "";              // nuevo texto (normalizado)
  const textChanged = previousText !== currentText;

  const displayText = currentText.replace(/\r?\n/g, '   ');
  const n = displayText.length;

  if (n === 0) {
    const emptyMsg = tRenderer("renderer.main.selector_empty", "(empty)");
    textPreview.textContent = emptyMsg;
  } else if (n <= 200) {
    textPreview.textContent = displayText;
  } else {
    const start = displayText.slice(0, 320); // PREVIEW TEXTO VIGENTE VENTANA PRINCIPAL
    const end = displayText.slice(-320);
    textPreview.textContent = `${start}... | ...${end}`;
  }

  const stats = contarTexto(currentText);
  const idioma = idiomaActual; // cacheado al iniciar y actualizado por listener si aplica
  const { separadorMiles, separadorDecimal } = await obtenerSeparadoresDeNumeros(idioma);

  // Formatear las cifras según el idioma
  const caracteresFormateado = formatearNumero(stats.conEspacios, separadorMiles, separadorDecimal);
  const caracteresSinEspaciosFormateado = formatearNumero(stats.sinEspacios, separadorMiles, separadorDecimal);
  const palabrasFormateado = formatearNumero(stats.palabras, separadorMiles, separadorDecimal);

  resChars.textContent = msgRenderer("renderer.main.results.chars", { n: caracteresFormateado }, `Caracteres: ${caracteresFormateado}`);
  resCharsNoSpace.textContent = msgRenderer("renderer.main.results.chars_no_space", { n: caracteresSinEspaciosFormateado }, `Chars s/space: ${caracteresSinEspaciosFormateado}`);
  resWords.textContent = msgRenderer("renderer.main.results.words", { n: palabrasFormateado }, `Palabras: ${palabrasFormateado}`);

  const { hours, minutes, seconds } = getTimeParts(stats.palabras, wpm);
  const timeFallback = `⏱ Tiempo estimado de lectura: ${formatTimeFromWords(stats.palabras, wpm)}`;
  resTime.textContent = msgRenderer("renderer.main.results.time", { h: hours, m: minutes, s: seconds }, timeFallback);

  // Si detectamos que el texto cambió respecto al estado anterior -> resetear cronómetro en main
  if (textChanged) {
    try {
      if (window.electronAPI && typeof window.electronAPI.sendCronoReset === 'function') {
        // Pedimos a main que reseteé el crono (autoridad). También hacemos UI reset inmediato.
        window.electronAPI.sendCronoReset();
        uiResetTimer();
        lastComputedElapsedForWpm = 0;
      } else {
        // Fallback local si no hay IPC (rare)
        uiResetTimer();
        lastComputedElapsedForWpm = 0;
      }
    } catch (err) {
      console.error("Error pidiendo reset del crono tras cambio de texto:", err);
      uiResetTimer();
      lastComputedElapsedForWpm = 0;
    }
  }
}

// Escuchar estado del crono desde main (autoridad)
if (window.electronAPI && typeof window.electronAPI.onCronoState === 'function') {
  window.electronAPI.onCronoState((state) => {
    try {
      // Normalizar estado recibido
      const newElapsed = typeof state.elapsed === 'number' ? state.elapsed : 0;
      const newRunning = !!state.running;

      // Actualizar mirrors locales
      elapsed = newElapsed;
      running = newRunning;

      // Actualizar display SOLO si el usuario NO está editando el campo; sin embargo, si hubo transición running:true -> false, recalculamos WPM aunque se esté editando.
      if (timerDisplay && !timerEditing) {
        timerDisplay.value = (state && state.display) ? state.display : formatTimer(elapsed);
      }

      // Actualizar botón toggle
      if (tToggle) tToggle.textContent = running ? '⏸' : '▶';

      // WPM: recalcular en los casos relevantes:
      //  - transición running:true -> false (pausa): recalcular siempre
      //  - o si estamos parados (running===false) y elapsed cambió desde la última vez que calculamos
      const becamePaused = (prevRunning === true && running === false);
      if (becamePaused) {
        // recalcular WPM inmediatamente al pausar (comportamiento antiguo)
        actualizarVelocidadRealFromElapsed(elapsed);
        lastComputedElapsedForWpm = elapsed;
      } else if (!running) {
        // estamos parados; solo recalcular si elapsed cambió desde la última vez que calculamos
        if (lastComputedElapsedForWpm === null || lastComputedElapsedForWpm !== elapsed) {
          actualizarVelocidadRealFromElapsed(elapsed);
          lastComputedElapsedForWpm = elapsed;
        }
      }
      // Si running === true -> no recalculamos (evitamos updates continuos)

      // UI reset handling: si elapsed===0 y no está corriendo, forzamos la UI de reset
      if (!running && elapsed === 0 && !timerEditing) {
        uiResetTimer();
        lastComputedElapsedForWpm = 0;
      }

      // Actualizar prevRunning
      prevRunning = running;
    } catch (e) {
      console.error("Error manejando crono-state en renderer:", e);
    }
  });
}

// ======================= Mostrar velocidad real (WPM) =======================
async function mostrarVelocidadReal(realWpm) {
  const idioma = idiomaActual;
  const { separadorMiles, separadorDecimal } = await obtenerSeparadoresDeNumeros(idioma);
  // Aplicar el mismo formato a la velocidad real
  const velocidadFormateada = formatearNumero(realWpm, separadorMiles, separadorDecimal);
  realWpmDisplay.textContent = `${velocidadFormateada} WPM`;
}

// ======================= Cargar presets (fusionar + shadowing) =======================
const loadPresets = async () => {
  presetsSelect.innerHTML = "";

  // Cargar settings de usuario (incluye presets personalizados)
  const settings = (await window.electronAPI.getSettings()) || { language: "es", presets: [] };
  const lang = settings.language || "es";
  const userPresets = Array.isArray(settings.presets) ? settings.presets.slice() : [];

  // Obtener presets por defecto desde el main process (electron/presets/*.js)
  let defaults = { general: [], languagePresets: {} };
  try {
    defaults = await window.electronAPI.getDefaultPresets();
  } catch (e) {
    console.error("Error obteniendo default presets desde main:", e);
    defaults = { general: [], languagePresets: {} };
  }

  // 1) Combinar defaults general + defaults idioma
  let combined = Array.isArray(defaults.general) ? defaults.general.slice() : [];
  const langPresets = (defaults.languagePresets && defaults.languagePresets[lang]) ? defaults.languagePresets[lang] : [];
  if (Array.isArray(langPresets)) combined.push(...langPresets);

  // 1.b) Aplicar lista de defaults ignorados desde settings (si existe)
  const disabledByUser = (settings.disabled_default_presets && Array.isArray(settings.disabled_default_presets[lang])) ? settings.disabled_default_presets[lang] : [];
  if (Array.isArray(disabledByUser) && disabledByUser.length > 0) {
    combined = combined.filter(p => !disabledByUser.includes(p.name));
  }

  // 2) Aplicar "shadowing": los presets de usuario reemplazan por nombre, sin borrar los defaults
  const map = new Map();
  combined.forEach(p => map.set(p.name, Object.assign({}, p))); // defaults
  userPresets.forEach(up => {
    // Si usuario introdujo un preset con mismo nombre, lo sustituye (shadow) en el map
    map.set(up.name, Object.assign({}, up));
  });

  // 3) Convertir a array y ordenar
  const finalList = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));

  // Guardar caché y poblar DOM del select
  allPresetsCache = finalList.slice();
  allPresetsCache.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name;
    presetsSelect.appendChild(opt);
  });

  // Si hay un preset actualmente seleccionado (por ejemplo re-inicialización), reflejarlo
  if (currentPresetName) {
    presetsSelect.value = currentPresetName;
  } else {
    presetsSelect.selectedIndex = -1;
  }

  return allPresetsCache;
};

// ======================= Inicialización =======================
(async () => {
  try {
    // Obtener texto inicial actual (si hay)
    const t = await window.electronAPI.getCurrentText();
    updatePreviewAndResults(t || "");

    // Suscripción a actualizaciones desde main (modal)
    if (window.electronAPI && typeof window.electronAPI.onCurrentTextUpdated === 'function') {
      window.electronAPI.onCurrentTextUpdated((text) => {
        updatePreviewAndResults(text || "");
      });
    }

    // Suscripción: escuchar cuando main notifica que se creó/actualizó un preset
    if (window.electronAPI && typeof window.electronAPI.onPresetCreated === 'function') {
      window.electronAPI.onPresetCreated(async (preset) => {
        try {
          // Recargar presets desde settings (aplica shadowing) y seleccionar el creado
          const updated = await loadPresets();
          if (preset && preset.name) {
            const found = updated.find(p => p.name === preset.name);
            if (found) {
              currentPresetName = found.name;
              // fijar selección visual
              presetsSelect.value = found.name;
              wpm = found.wpm;
              wpmInput.value = wpm;
              wpmSlider.value = wpm;
              presetDescription.textContent = found.description || "";
              updatePreviewAndResults(currentText);
            }
          }
        } catch (e) {
          console.error("Error handling preset-created event:", e);
        }
      });
    }

    // Cargar presets y guardarlos en caché
    const allPresets = await loadPresets();

    // Seleccionar preset inicial "default" del general y fijarlo visualmente
    const initialPreset = allPresets.find(p => p.name === "default");
    if (initialPreset) {
      currentPresetName = initialPreset.name;
      presetsSelect.value = currentPresetName; // fija la selección visualmente
      wpm = initialPreset.wpm;
      wpmInput.value = wpm;
      wpmSlider.value = wpm;
      presetDescription.textContent = initialPreset.description;
    }

    // Actualizar vista final con el posible WPM inicial
    updatePreviewAndResults(t || "");

    // --- Listener para cambios de settings desde main/preload (opcional) ---
    // Si el main/preload expone un evento, lo usamos para mantener settingsCache e idiomaActual actualizados.
    const settingsChangeHandler = async (newSettings) => {
      try {
        settingsCache = newSettings || {};
        const nuevoIdioma = settingsCache.language || 'es';
        const idiomaCambio = (nuevoIdioma !== idiomaActual);
        if (idiomaCambio) {
          idiomaActual = nuevoIdioma;
          try {
            await loadRendererTranslations(idiomaActual);
          } catch (_) {
            /* noop */
          }
          applyTranslations();
          // recargar presets para el nuevo idioma y sincronizar selección
          try {
            const updated = await loadPresets();
            let selected = updated.find(p => p.name === currentPresetName);
            if (!selected) {
              selected = updated.find(p => p.name === 'default') || updated[0];
            }
            if (selected) {
              currentPresetName = selected.name;
              presetsSelect.value = selected.name;
              wpm = selected.wpm;
              wpmInput.value = wpm;
              wpmSlider.value = wpm;
              presetDescription.textContent = selected.description || "";
            }
          } catch (err) {
            console.error("Error recargando presets tras cambio de idioma:", err);
          }
          updatePreviewAndResults(currentText);
        }
        if (settingsCache.modeConteo && settingsCache.modeConteo !== modoConteo) {
          modoConteo = settingsCache.modeConteo;
          if (toggleModoPreciso) toggleModoPreciso.checked = (modoConteo === 'preciso');
        }
        updatePreviewAndResults(currentText);
      } catch (err) {
        console.error("Error manejando settings change:", err);
      }
    };

    if (window.electronAPI) {
      if (typeof window.electronAPI.onSettingsChanged === 'function') {
        window.electronAPI.onSettingsChanged(settingsChangeHandler);
      } else if (typeof window.electronAPI.onSettingsUpdated === 'function') {
        window.electronAPI.onSettingsUpdated(settingsChangeHandler);
      } // si no existe, no hay listener disponible y no pasa nada
    }

    // ------------------------------
    // Inicializar y vincular toggle "Modo preciso"
    // ------------------------------
    try {
      if (toggleModoPreciso) {
        // Asegurar estado inicial del switch según el modo en memoria (cargado al inicio)
        toggleModoPreciso.checked = (modoConteo === 'preciso');

        // Cuando el usuario cambie el switch:
        toggleModoPreciso.addEventListener('change', async () => {
          try {
            const nuevoModo = toggleModoPreciso.checked ? 'preciso' : 'simple';

            // Actualizar estado en memoria (inmediato)
            setModoConteo(nuevoModo);

            toggleModoPreciso.setAttribute('aria-checked', toggleModoPreciso.checked ? 'true' : 'false');

            // Reconteo inmediato del texto actual
            updatePreviewAndResults(currentText);

            // Intentar persistir en settings vía IPC (si preload/main implementaron setModeConteo)
            if (window.electronAPI && typeof window.electronAPI.setModeConteo === 'function') {
              try {
                await window.electronAPI.setModeConteo(nuevoModo);
              } catch (ipcErr) {
                console.error("Error persistiendo modeConteo mediante setModeConteo:", ipcErr);
              }
            } else {
              // Fallback: si no existe setModeConteo, intentar escribir settings completo (si expuesto)
              if (window.electronAPI && typeof window.electronAPI.updateSettings === 'function') {
                try {
                  // leer settingsCache, actualizar y enviar
                  const copy = Object.assign({}, settingsCache || {});
                  copy.modeConteo = nuevoModo;
                  await window.electronAPI.updateSettings(copy);
                } catch (updateErr) {
                  console.warn("updateSettings no disponible o falló:", updateErr);
                }
              }
            }
          } catch (err) {
            console.error("Error manejando cambio del toggleModoPreciso:", err);
          }
        });

        // Si el settings cambia desde main, sincronizamos el switch al nuevo valor
        // (esto complementa settingsChangeHandler; repetimos por seguridad local)
        const syncToggleFromSettings = (s) => {
          try {
            if (!toggleModoPreciso) return;
            const modo = (s && s.modeConteo) ? s.modeConteo : modoConteo;
            toggleModoPreciso.checked = (modo === 'preciso');
          } catch (err) {
            console.error("Error sincronizando toggle desde settings:", err);
          }
        };

        // Ejecutar sincronización inmediata con settingsCache (ya cargado)
        try { syncToggleFromSettings(settingsCache || {}); } catch (e) { /* noop */ }
      }
    } catch (ex) {
      console.error("Error inicializando toggleModoPreciso:", ex);
    }

  } catch (e) {
    console.error("Error inicializando renderer:", e);
  }
  /* --- Info modal utility --- */
  const infoModal = document.getElementById("infoModal");
  const infoModalBackdrop = document.getElementById("infoModalBackdrop");
  const infoModalClose = document.getElementById("infoModalClose");
  const infoModalTitle = document.getElementById("infoModalTitle");
  const infoModalContent = document.getElementById("infoModalContent");

  function closeInfoModal() {
    try {
      if (!infoModal || !infoModalContent) return;
      infoModal.setAttribute("aria-hidden", "true");
      infoModalContent.innerHTML = '<div class="info-loading">Cargando...</div>';
    } catch (e) {
      console.error("Error cerrando modal info:", e);
    }
  }

  if (infoModalClose) infoModalClose.addEventListener("click", closeInfoModal);
  if (infoModalBackdrop) infoModalBackdrop.addEventListener("click", closeInfoModal);

  window.addEventListener("keydown", (ev) => {
    if (!infoModal) return;
    if (ev.key === "Escape" && infoModal.getAttribute("aria-hidden") === "false") {
      closeInfoModal();
    }
  });

  async function fetchText(path) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      console.debug("fetchText error:", path, e);
      return null;
    }
  }

  async function showInfoModal(key, opts = {}) {
    // key: 'readme' | 'instrucciones' | 'guia_basica' | 'faq' | 'acerca_de'
    const sectionTitles = {
      readme: "Readme",
      instrucciones: "Instrucciones completas",
      guia_basica: "Guía básica",
      faq: "Preguntas frecuentes (FAQ)",
      acerca_de: "Acerca de"
    };

    if (!infoModal || !infoModalTitle || !infoModalContent) return;

    // Decide qué archivo cargar según la key.
    // Unificamos guia_basica, instrucciones y faq en ./info/instrucciones.html
    let fileToLoad = null;
    let sectionId = null;

    if (key === 'readme') {
      fileToLoad = './info/readme.html';
    } else if (key === 'acerca_de' || key === 'acerca_de') {
      fileToLoad = './info/acerca_de.html';
    } else if (key === 'guia_basica' || key === 'instrucciones' || key === 'faq') {
      fileToLoad = './info/instrucciones.html';
      // mapear key a id del bloque dentro de instrucciones.html
      const mapping = { guia_basica: 'guia-basica', instrucciones: 'instrucciones', faq: 'faq' };
      sectionId = mapping[key] || 'instrucciones';
    } else {
      // fallback: intentar cargar ./info/<key>.html (compatibilidad)
      fileToLoad = `./info/${key}.html`;
    }

    // Título del modal: mostrar el título de la sección (no "Info" genérico)
    infoModalTitle.textContent = sectionTitles[key] || (opts.title || "Información");

    // Abrir modal
    infoModal.setAttribute("aria-hidden", "false");

    // Cargar HTML
    const tryHtml = await fetchText(fileToLoad);
    if (tryHtml === null) {
      // fallback: indicar falta de contenido
      infoModalContent.innerHTML =
        `<p>No hay contenido disponible para "${infoModalTitle.textContent}".</p>`;
      if (infoModalContent && typeof infoModalContent.focus === "function") infoModalContent.focus();
      return;
    }

    // Poner contenido (documento completo)
    infoModalContent.innerHTML = tryHtml;

    // Asegurar que el panel empieza en top antes de hacer scroll
    const panel = document.querySelector('.info-modal-panel');
    if (panel) panel.scrollTop = 0;

    // Si se pidió una sección concreta, scrollear para que aparezca *arriba* del panel
    if (sectionId) {
      // Esperar al siguiente frame para que el DOM parseado esté layoutado
      requestAnimationFrame(() => {
        try {
          const target = infoModalContent.querySelector(`#${sectionId}`);
          if (!target) {
            // si no existe el id, no hacemos nada más
            if (infoModalContent && typeof infoModalContent.focus === "function") infoModalContent.focus();
            return;
          }

          try {
            target.scrollIntoView({ behavior: 'auto', block: 'start' });
          } catch (err) {
            // Fallback defensivo: calcular top relativo sin compensar por header
            const panelRect = panel.getBoundingClientRect();
            const targetRect = target.getBoundingClientRect();
            const desired = (targetRect.top - panelRect.top) + panel.scrollTop;
            const finalTop = Math.max(0, Math.min(desired, panel.scrollHeight - panel.clientHeight));
            panel.scrollTo({ top: finalTop, behavior: 'auto' });
          }

          // finalmente, dar foco al contenido para que el lector pueda usar teclado
          if (infoModalContent && typeof infoModalContent.focus === "function") infoModalContent.focus();
        } catch (e) {
          console.error("Error desplazando modal a sección:", e);
          if (infoModalContent && typeof infoModalContent.focus === "function") infoModalContent.focus();
        }
      });
    } else {
      // No hay sección: solo enfocar el contenido (documento entero)
      if (infoModalContent && typeof infoModalContent.focus === "function") infoModalContent.focus();
    }
  }

  // ======================= BARRA SUPERIOR: registrar acciones con menuActions =======================
  // Asegúrate de que menu.js fue cargado (script incluido antes de renderer.js)
  if (window.menuActions && typeof window.menuActions.registerMenuAction === 'function') {

    // Registrar acción para "guia_basica"
    window.menuActions.registerMenuAction("guia_basica", () => { showInfoModal("guia_basica") });

    // Registrar acción para "instrucciones_completas"
    window.menuActions.registerMenuAction("instrucciones_completas", () => { showInfoModal("instrucciones") });

    // Registrar acción para "faq"
    window.menuActions.registerMenuAction("faq", () => { showInfoModal("faq") });

    window.menuActions.registerMenuAction('cargador_texto', () => {
      console.log("Cargador de archivo de texto pulsado - acción temporal (registrada vía menuActions)");
      alert("WIP: Aquí se abrirá el cargador de archivos de texto en una futura versión.");
    });

    window.menuActions.registerMenuAction('contador_imagen', () => {
      console.log("Cargador de imágenes con texto pulsado - acción temporal (registrada vía menuActions)");
      alert("WIP: Aquí se abrirá el cargador de imágenes con texto en una futura versión.");
    });

    window.menuActions.registerMenuAction('test_velocidad', () => {
      console.log("Test de velocidad de lectura pulsado - acción temporal (registrada vía menuActions)");
      alert("WIP: Aquí se abrirá el test de velocidad de lectura en una futura versión.");
    });

    window.menuActions.registerMenuAction('preferencias_idioma', () => {
      console.log("Idioma pulsado - acción temporal (registrada vía menuActions)");
      alert("WIP: Aquí se abrirá el selector de idioma en una futura versión.");
    });

    window.menuActions.registerMenuAction('diseno_skins', () => {
      console.log("Skins pulsado - acción temporal (registrada vía menuActions)");
      alert("WIP: Aquí se abrirá el selector de skins en una futura versión.");
    });

    window.menuActions.registerMenuAction('diseno_crono_flotante', () => {
      console.log("Cronómetro flotante pulsado - acción temporal (registrada vía menuActions)");
      alert("WIP: Aquí se abrirá la configuración del cronómetro flotante en una futura versión.");
    });

    window.menuActions.registerMenuAction('diseno_fuentes', () => {
      console.log("Fuentes pulsado - acción temporal (registrada vía menuActions)");
      alert("WIP: Aquí se abrirá el selector de fuentes en una futura versión.");
    });

    window.menuActions.registerMenuAction('diseno_colores', () => {
      console.log("Colores pulsado - acción temporal (registrada vía menuActions)");
      alert("WIP: Aquí se abrirá el selector de colores en una futura versión.");
    });

    window.menuActions.registerMenuAction("presets_por_defecto", async () => {
      try {
        if (!window.electronAPI || typeof window.electronAPI.openDefaultPresetsFolder !== "function") {
          console.warn("openDefaultPresetsFolder no disponible en electronAPI");
          alert(tRenderer("renderer.alerts.open_presets_unsupported", "No es posible abrir la carpeta de presets en este entorno."));
          return;
        }

        const res = await window.electronAPI.openDefaultPresetsFolder();
        if (res && res.ok) {
          // carpeta abierta correctamente; no mostrar notificación intrusiva
          console.debug("Carpeta config/presets_defaults abierta en el explorador.");
          return;
        }

        // en caso de fallo, informar al usuario
        const errMsg = res && res.error ? String(res.error) : "Desconocido";
        console.error("No se pudo abrir carpeta presets por defecto:", errMsg);
        alert(tRenderer("renderer.alerts.open_presets_fail", "No se pudo abrir la carpeta de presets por defecto. Revisa la consola para más detalles."));
      } catch (err) {
        console.error("Error abriendo carpeta presets por defecto:", err);
        alert(tRenderer("renderer.alerts.open_presets_error", "Ocurrió un error al intentar abrir la carpeta de presets. Revisa la consola."));
      }
    });

    window.menuActions.registerMenuAction('avisos', () => {
      console.log("Avisos y novedades pulsado - acción temporal (registrada vía menuActions)");
      alert("WIP: Aquí se mostrarán los avisos y novedades en una futura versión.");
    });

    window.menuActions.registerMenuAction('discord', () => {
      console.log("Discord pulsado - acción temporal (registrada vía menuActions)");
      alert("WIP: Aquí se abrirá el enlace a Discord en una futura versión.");
    });

    window.menuActions.registerMenuAction('links_interes', () => {
      console.log("Links de interés pulsado - acción temporal (registrada vía menuActions)");
      alert("WIP: Aquí se mostrarán los links de interés en una futura versión.");
    });

    window.menuActions.registerMenuAction('colabora', () => {
      console.log("COLABORA ($) pulsado - acción temporal (registrada vía menuActions)");
      alert("WIP: Aquí se mostrará la información para colaborar en una futura versión.");
    });

    window.menuActions.registerMenuAction('actualizar_version', () => {
      console.log("Actualizar a última versión pulsado - acción temporal (registrada vía menuActions)");
      alert("WIP: Aquí se iniciará el proceso de actualización en una futura versión.");
    });
    // Registrar acción para "readme"
    window.menuActions.registerMenuAction("readme", () => { showInfoModal("readme") });

    // Registrar acción para "acerca_de"
    window.menuActions.registerMenuAction("acerca_de", () => { showInfoModal("acerca_de") });

    // Ejemplo genérico para ver payloads no registrados explícitamente:
    // (opcional) registrar un "catch-all" no es necesario; menu.js ya loguea payloads sin handler.
  } else {
    // Si menuActions no está disponible, registra un receptor directo (fallback)
    if (window.electronAPI && typeof window.electronAPI.onMenuClick === 'function') {
      window.electronAPI.onMenuClick((payload) => {
        console.log('menu-click recibido (fallback desde renderer):', payload);
      });
    } else {
      console.warn('menuActions y electronAPI.onMenuClick no disponibles — la barra superior no será manejada por renderer.');
    }
  }
})();

// ======================= Selección de preset (usa caché, no recarga DOM) =======================
presetsSelect.addEventListener('change', () => {
  const name = presetsSelect.value;
  if (!name) return;

  const preset = allPresetsCache.find(p => p.name === name);
  if (preset) {
    currentPresetName = preset.name;
    // Fijar visualmente (por si el select no lo marca en alguna plataforma)
    presetsSelect.value = preset.name;
    wpm = preset.wpm;
    wpmInput.value = wpm;
    wpmSlider.value = wpm;
    presetDescription.textContent = preset.description || "";
    updatePreviewAndResults(currentText);
  }
});

// ======================= Detectar cambio manual en WPM =======================
function resetPresetSelection() {
  currentPresetName = null;
  // dejar el select sin selección visual
  presetsSelect.selectedIndex = -1;
  presetDescription.textContent = "";
}

// Slider/input WPM
wpmSlider.addEventListener('input', () => {
  wpm = Number(wpmSlider.value);
  wpmInput.value = wpm;
  resetPresetSelection();
  updatePreviewAndResults(currentText);
});

wpmInput.addEventListener('blur', () => {
  let val = Number(wpmInput.value);
  if (isNaN(val)) val = 200;
  val = Math.min(Math.max(val, 50), 500);
  wpm = val;
  wpmInput.value = wpm;
  wpmSlider.value = wpm;
  resetPresetSelection();
  updatePreviewAndResults(currentText);
});

wpmInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    wpmInput.blur();
  }
});

// ======================= Botón "Sobreescribir con portapapeles" =======================
btnCountClipboard.addEventListener("click", async () => {
  try {
    let clip = await window.electronAPI.readClipboard() || "";
    if (clip.length > MAX_TEXT_CHARS) {
      console.warn("Contenido del portapapeles supera 10000000 chars — será truncado.");
      clip = clip.slice(0, MAX_TEXT_CHARS);
      alert(tRenderer("renderer.editor_alerts.clipboard_overflow", "El texto del portapapeles supera el tamaño máximo permitido y será truncado."));
    }

    // enviar objeto con meta (overwrite)
    const resp = await window.electronAPI.setCurrentText({
      text: clip,
      meta: { source: "main-window", action: "overwrite", clipboardText: clip }
    });

    updatePreviewAndResults(resp && resp.text ? resp.text : clip);
    resp && resp.truncated && alert(tRenderer("renderer.editor_alerts.text_truncated", "El texto fue truncado para ajustarse al límite máximo de la aplicación."));
  } catch (err) {
    console.error("clipboard error:", err);
  }
});

// ======================= Botón "Pegar portapapeles nueva línea" =======================
btnAppendClipboardNewLine.addEventListener("click", async () => {
  try {
    const clip = await window.electronAPI.readClipboard() || "";
    const current = await window.electronAPI.getCurrentText() || "";

    let joiner = "";
    if (current) joiner = current.endsWith("\n") || current.endsWith("\r") ? "\n" : "\n\n";

    const available = MAX_TEXT_CHARS - current.length;
    if (available <= 0) {
      alert(tRenderer("renderer.editor_alerts.too_big", "No es posible agregar texto: ya se alcanzó el tamaño máximo permitido."));
      return;
    }

    const toAdd = clip.slice(0, available);
    const newFull = current + (current ? joiner : "") + toAdd;

    // enviar objeto con meta (append_newline)
    const resp = await window.electronAPI.setCurrentText({
      text: newFull,
      meta: { source: "main-window", action: "append_newline", clipboardText: clip }
    });

    updatePreviewAndResults(resp && resp.text ? resp.text : newFull);

    // notificar truncado solo si main lo confirma
    if (resp && resp.truncated) {
      alert(tRenderer("renderer.editor_alerts.text_truncated", "El texto fue truncado para ajustarse al límite máximo de la aplicación."));
    }
  } catch (err) {
    console.error("Error pegando portapapeles en nueva línea:", err);
    alert(tRenderer("renderer.editor_alerts.paste_error", "Ocurrió un error al pegar el portapapeles. Revisa la consola."));
  }
});

btnEdit.addEventListener('click', () => {
  window.electronAPI.openEditor();
});

// ======================= Botón Vaciar (pantalla principal) =======================
btnEmptyMain.addEventListener("click", async () => {
  try {
    const resp = await window.electronAPI.setCurrentText({
      text: "",
      meta: { source: "main-window", action: "overwrite" }
    });

    updatePreviewAndResults(resp && resp.text ? resp.text : "");
    if (window.electronAPI && typeof window.electronAPI.forceClearEditor === "function") {
      try { await window.electronAPI.forceClearEditor(); } catch (e) { console.error("Error invocando forceClearEditor:", e); }
    }
  } catch (err) {
    console.error("Error vaciando texto desde pantalla principal:", err);
    alert(tRenderer("renderer.alerts.clear_error", "Ocurrió un error al vaciar el texto. Revisa la consola."));
  }
});

// Botón ? (por ahora solo está ubicado; sin funcionalidad)
if (btnHelp) {
  btnHelp.addEventListener('click', () => {
    console.log("Botón ? pulsado — funcionalidad pendiente.");
    // Por ahora no abrimos modal ni hacemos nada; quedará implementado más adelante.
  });
}

// Abrir modal para crear preset (main crea la ventana modal)
// Envía el WPM actual al main para que lo propague al modal
btnNewPreset.addEventListener('click', () => {
  try {
    if (window.electronAPI && typeof window.electronAPI.openPresetModal === 'function') {
      window.electronAPI.openPresetModal(wpm);
    } else {
      // Fallback: intentar usar prompt (rare platforms — but preload intentionally disabled prompt earlier)
      console.warn("openPresetModal no disponible en electronAPI");
      alert(tRenderer("renderer.alerts.modal_unavailable", "Funcionalidad de modal no disponible."));
    }
  } catch (e) {
    console.error("Error abriendo modal de nuevo preset:", e);
  }
});

// ======================= Botón EDIT (Editar preset seleccionado) =======================
btnEditPreset.addEventListener('click', async () => {
  try {
    const selectedName = presetsSelect.value;
    if (!selectedName) {
      // Ask main to show native info dialog "No hay ningún preset seleccionado para editar"
      if (window.electronAPI && typeof window.electronAPI.notifyNoSelectionEdit === 'function') {
        await window.electronAPI.notifyNoSelectionEdit();
        return;
      } else {
        alert(tRenderer("renderer.alerts.edit_none", "No hay ningún preset seleccionado para editar"));
        return;
      }
    }

    // Find preset data from cache
    const preset = allPresetsCache.find(p => p.name === selectedName);
    if (!preset) {
      alert(tRenderer("renderer.alerts.preset_not_found", "Preset seleccionado no encontrado en caché."));
      return;
    }

    // Open modal in edit mode. We pass an object with mode and the preset data.
    const payload = { wpm: wpm, mode: 'edit', preset: preset };
    if (window.electronAPI && typeof window.electronAPI.openPresetModal === 'function') {
      window.electronAPI.openPresetModal(payload);
    } else {
      alert(tRenderer("renderer.alerts.edit_unavailable", "Funcionalidad de edición no disponible."));
    }
  } catch (e) {
    console.error("Error abriendo modal de editar preset:", e);
    alert(tRenderer("renderer.alerts.edit_error", "Ocurrió un error al intentar editar el preset. Revisa la consola."));
  }
});

// ======================= Botón BORRAR (🗑️) =======================
btnDeletePreset.addEventListener('click', async () => {
  try {
    const name = presetsSelect.value || null;
    // Call main to request deletion; main will show native dialogs as needed
    const res = await window.electronAPI.requestDeletePreset(name);

    if (res && res.ok) {
      // On success, reload presets and clear selection. Do not change WPM.
      await loadPresets();
      presetsSelect.selectedIndex = -1;
      currentPresetName = null;
      presetDescription.textContent = "";
      // No further UI dialog required - main already showed confirmation earlier.
      return;
    } else {
      // res.ok === false -> handle known codes
      if (res && res.code === 'NO_SELECTION') {
        // main already showed native information dialog; nothing else to do.
        return;
      }
      if (res && res.code === 'CANCELLED') {
        // user cancelled; nothing to do
        return;
      }
      // Unexpected error: log and show a simple alert
      console.error("Error deleting preset:", res && res.error ? res.error : res);
      alert(tRenderer("renderer.alerts.delete_error", "Ocurrió un error al borrar el preset. Revisa la consola."));
    }
  } catch (e) {
    console.error("Error en petición de borrado:", e);
    alert(tRenderer("renderer.alerts.delete_error", "Ocurrió un error al borrar el preset. Revisa la consola."));
  }
});

// ======================= Botón RESTAURAR (R) =======================
btnResetDefaultPresets.addEventListener('click', async () => {
  try {
    // Call main to request restore. main will show native confirmation dialog.
    const res = await window.electronAPI.requestRestoreDefaults();

    if (res && res.ok) {
      // Reload presets to reflect restored defaults
      await loadPresets();

      // After restoration we leave selection cleared (consistently with delete behavior).
      presetsSelect.selectedIndex = -1;
      currentPresetName = null;
      presetDescription.textContent = "";

      return;
    } else {
      if (res && res.code === 'CANCELLED') {
        // User cancelled in native dialog; nothing to do
        return;
      }
      console.error("Error restaurando presets:", res && res.error ? res.error : res);
      alert(tRenderer("renderer.alerts.restore_error", "Ocurrió un error al restaurar presets. Revisa la consola."));
    }
  } catch (e) {
    console.error("Error en petición de restaurar presets:", e);
    alert(tRenderer("renderer.alerts.restore_error", "Ocurrió un error al restaurar presets. Revisa la consola."));
  }
});

// ======================= Cronómetro =======================
const timerDisplay = document.getElementById('timerDisplay');

// Evitar que los broadcasts de main sobrescriban la edición en curso
if (timerDisplay) {
  timerDisplay.addEventListener('focus', () => {
    timerEditing = true;
  });
  timerDisplay.addEventListener('blur', () => {
    // el blur ejecutará applyManualTime (ya registrado) que actualizará el crono en main
    timerEditing = false;
  });
}

const tToggle = document.getElementById('timerToggle');
const tReset = document.getElementById('timerReset');

// Mirror local del estado del crono (se sincroniza desde main vía onCronoState)
let elapsed = 0;
let running = false;
// Flag para detectar transición y evitar recálculos continuos
let prevRunning = false;
// Indica si el usuario está editando manualmente el campo del timer (para evitar sobrescrituras)
let timerEditing = false;
// Último elapsed para el que calculamos WPM (evitar recálculos repetidos)
let lastComputedElapsedForWpm = null;

function formatTimer(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

// Reusable: calcula y muestra la velocidad real usando `elapsed` y el texto actual
function actualizarVelocidadReal() {
  // contarTexto y mostrarVelocidadReal deben existir en el scope (ya las usas).
  const stats = contarTexto(currentText);
  const words = stats?.palabras || 0;
  const secondsTotal = elapsed / 1000;

  if (words > 0 && secondsTotal > 0) {
    const realWpm = (words / secondsTotal) * 60;
    mostrarVelocidadReal(realWpm);
  } else {
    // Limpia visual si no hay datos válidos
    realWpmDisplay.innerHTML = "&nbsp;";
  }
}

function actualizarVelocidadRealFromElapsed(ms) {
  const secondsTotal = (ms || 0) / 1000;
  const stats = contarTexto(currentText);
  const words = stats?.palabras || 0;
  if (words > 0 && secondsTotal > 0) {
    const realWpm = (words / secondsTotal) * 60;
    mostrarVelocidadReal(realWpm);
  } else {
    realWpmDisplay.innerHTML = "&nbsp;";
  }
}

// --------- Reset del cronómetro (misma acción que el botón ⏹) ----------
// Reset visual local (no autoritativo): usado como respuesta rápida mientras main broadcastea
function uiResetTimer() {
  // Sync local mirrors
  elapsed = 0;
  running = false;
  prevRunning = false;

  if (timerDisplay) timerDisplay.value = "00:00:00";
  if (realWpmDisplay) realWpmDisplay.innerHTML = "&nbsp;";
  if (tToggle) tToggle.textContent = '▶';
}

tToggle.addEventListener('click', () => {
  if (window.electronAPI && typeof window.electronAPI.sendCronoToggle === 'function') {
    window.electronAPI.sendCronoToggle();
  } else {
    // Fallback local: invertir estado visual (no authoritative)
    running = !running;
    tToggle.textContent = running ? '⏸' : '▶';
  }
});

tReset.addEventListener('click', () => {
  if (window.electronAPI && typeof window.electronAPI.sendCronoReset === 'function') {
    window.electronAPI.sendCronoReset();
  } else {
    uiResetTimer(); // fallback local (temporal)
  }
});

// --- Floating window control (VF) ---
let floatingOpen = false;

// abrir flotante
async function openFloating() {
  if (!window.electronAPI || typeof window.electronAPI.openFloatingWindow !== 'function') {
    console.warn("openFloatingWindow no disponible en electronAPI");
    // asegurar coherencia visual
    if (toggleVF) { toggleVF.checked = false; toggleVF.setAttribute('aria-checked', 'false'); }
    return;
  }
  try {
    await window.electronAPI.openFloatingWindow();
    floatingOpen = true;

    // actualizar switch (UI)
    if (toggleVF) {
      toggleVF.checked = true;
      toggleVF.setAttribute('aria-checked', 'true');
    }

    // pedir estado inicial vía invoke (main devuelve getCronoState)
    if (typeof window.electronAPI.getCronoState === 'function') {
      try {
        const state = await window.electronAPI.getCronoState();
        if (state) {
          // sincronizar UI inmediatamente, pero NO forzar recálculo de WPM
          elapsed = typeof state.elapsed === 'number' ? state.elapsed : 0;
          running = !!state.running;

          if (timerDisplay && !timerEditing) {
            timerDisplay.value = state.display || formatTimer(elapsed);
          }
          if (tToggle) tToggle.textContent = running ? '⏸' : '▶';

          lastComputedElapsedForWpm = elapsed;
          prevRunning = running;
        }
      } catch (e) {
        /* noop */
      }
    }
  } catch (e) {
    console.error("Error abriendo flotante:", e);
    // revertir switch si hay error
    if (toggleVF) { toggleVF.checked = false; toggleVF.setAttribute('aria-checked', 'false'); }
  }
}

// cerrar flotante
async function closeFloating() {
  if (!window.electronAPI || typeof window.electronAPI.closeFloatingWindow !== 'function') {
    console.warn("closeFloatingWindow no disponible en electronAPI");
    if (toggleVF) { toggleVF.checked = false; toggleVF.setAttribute('aria-checked', 'false'); }
    return;
  }
  try {
    await window.electronAPI.closeFloatingWindow();
  } catch (e) {
    console.error("Error cerrando flotante:", e);
  } finally {
    floatingOpen = false;
    if (toggleVF) { toggleVF.checked = false; toggleVF.setAttribute('aria-checked', 'false'); }
  }
}

// toggle VF desde la UI (switch)
if (toggleVF) {
  toggleVF.addEventListener('change', async (ev) => {
    const wantOpen = !!toggleVF.checked;
    // optimista: reflejar aria-checked inmediatamente
    toggleVF.setAttribute('aria-checked', wantOpen ? 'true' : 'false');

    if (wantOpen) {
      await openFloating();
      // openFloating maneja revert en caso de error
    } else {
      await closeFloating();
    }
  });
}

// Si el flotante se cierra desde main (o se destruye), limpiamos timers locales
if (window.electronAPI && typeof window.electronAPI.onFloatingClosed === 'function') {
  window.electronAPI.onFloatingClosed(() => {
    floatingOpen = false;
    if (toggleVF) { toggleVF.checked = false; toggleVF.setAttribute('aria-checked', 'false'); }
  });
}

// ======================= Edición manual del cronómetro =======================
function parseTimerInput(input) {
  const match = input.match(/^(\d+):([0-5]\d):([0-5]\d)$/);
  if (!match) return null;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);

  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

function applyManualTime() {
  const ms = parseTimerInput(timerDisplay.value);

  if (ms !== null) {
    // Si tenemos API, pedir a main que aplique el elapsed (autoridad)...
    if (window.electronAPI && typeof window.electronAPI.setCronoElapsed === 'function') {
      try {
        // Marcar que ya no estamos editando (blur ya lo hace, pero aseguramos)
        timerEditing = false;
        window.electronAPI.setCronoElapsed(ms);
        // Mostrar inmediatamente el valor aplicado y recalcular WPM localmente (comportamiento antiguo)
        if (timerDisplay) timerDisplay.value = formatTimer(ms);
        actualizarVelocidadRealFromElapsed(ms);
        lastComputedElapsedForWpm = ms;
      } catch (e) {
        console.error("Error enviando setCronoElapsed:", e);
        // Fallback local
        elapsed = ms;
        if (timerDisplay) timerDisplay.value = formatTimer(elapsed);
        actualizarVelocidadRealFromElapsed(elapsed);
        lastComputedElapsedForWpm = elapsed;
      }
    } else {
      // Fallback local (no main available)
      elapsed = ms;
      if (timerDisplay) timerDisplay.value = formatTimer(elapsed);
      actualizarVelocidadRealFromElapsed(elapsed);
      lastComputedElapsedForWpm = elapsed;
    }
  } else {
    // entrada inválida -> restaurar valor visible al último estado
    if (timerDisplay) timerDisplay.value = formatTimer(elapsed);
  }
}

timerDisplay.addEventListener('blur', applyManualTime);

timerDisplay.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    timerDisplay.blur();
  }
});
