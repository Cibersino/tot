// public/renderer.js
console.log("Renderer main starting...");

const { AppConstants } = window;
if (!AppConstants) {
  throw new Error("[renderer] AppConstants no disponible; verifica la carga de constants.js");
}

const {
  WPM_MIN,
  WPM_MAX,
  PREVIEW_INLINE_THRESHOLD,
  PREVIEW_START_CHARS,
  PREVIEW_END_CHARS
} = AppConstants;

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
if (wpmSlider) {
  wpmSlider.min = String(WPM_MIN);
  wpmSlider.max = String(WPM_MAX);
}
if (wpmInput) {
  wpmInput.min = String(WPM_MIN);
  wpmInput.max = String(WPM_MAX);
}

const realWpmDisplay = document.getElementById('realWpmDisplay');
const selectorTitle = document.getElementById('selector-title');
const velTitle = document.getElementById('vel-title');
const resultsTitle = document.getElementById('results-title');
const cronTitle = document.getElementById('cron-title');

const toggleVF = document.getElementById('toggleVF');
const manualLoader = document.getElementById('manualLoader');

// References to presets elements
const presetsSelect = document.getElementById('presets');
const btnNewPreset = document.getElementById('btnNewPreset');
const btnEditPreset = document.getElementById('btnEditPreset');
const btnDeletePreset = document.getElementById('btnDeletePreset');
const btnResetDefaultPresets = document.getElementById('btnResetDefaultPresets');
const presetDescription = document.getElementById('presetDescription');

let currentText = "";
// Local limit in renderer to prevent concatenations that create excessively large strings
let MAX_TEXT_CHARS = AppConstants.MAX_TEXT_CHARS; // Default value until main responds
// --- Global cache and state for count/language ---
let modoConteo = "preciso";   // Precise by default; can be "simple"
let idiomaActual = "es";      // Initializes on startup
let settingsCache = {};       // Settings cache (number formatting, language, etc.)
// --- i18n renderer translations cache ---
const { loadRendererTranslations, tRenderer, msgRenderer } = window.RendererI18n || {};
if (!loadRendererTranslations || !tRenderer || !msgRenderer) {
  throw new Error("[renderer] RendererI18n no disponible; no se puede continuar");
}

function applyTranslations() {
  if (!tRenderer) return;
  // Text Selector buttons
  if (btnCountClipboard) btnCountClipboard.textContent = tRenderer("renderer.main.buttons.overwrite_clipboard", btnCountClipboard.textContent || "");
  if (btnAppendClipboardNewLine) btnAppendClipboardNewLine.textContent = tRenderer("renderer.main.buttons.append_clipboard_newline", btnAppendClipboardNewLine.textContent || "");
  if (btnEdit) btnEdit.textContent = tRenderer("renderer.main.buttons.edit", btnEdit.textContent || "");
  if (btnEmptyMain) btnEmptyMain.textContent = tRenderer("renderer.main.buttons.clear", btnEmptyMain.textContent || "");
  // Text Selector tooltips
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
  // Floating Window toggle
  const vfSwitchLabel = document.querySelector(".vf-switch-wrapper label.switch");
  if (vfSwitchLabel) vfSwitchLabel.title = tRenderer("renderer.main.tooltips.floating_window", vfSwitchLabel.title || "");
  // Section Titles
  if (selectorTitle) selectorTitle.textContent = tRenderer("renderer.main.selector_title", selectorTitle.textContent || "");
  if (velTitle) velTitle.textContent = tRenderer("renderer.main.speed.title", velTitle.textContent || "");
  if (resultsTitle) resultsTitle.textContent = tRenderer("renderer.main.results.title", resultsTitle.textContent || "");
  if (cronTitle) cronTitle.textContent = tRenderer("renderer.main.timer.title", cronTitle.textContent || "");
  // Speed Selector labels
  const wpmLabel = document.querySelector(".wpm-row span");
  if (wpmLabel) wpmLabel.textContent = tRenderer("renderer.main.speed.wpm_label", wpmLabel.textContent || "");
  // Results: precise mode label
  const togglePrecisoLabel = document.querySelector(".toggle-wrapper .toggle-label");
  if (togglePrecisoLabel) {
    togglePrecisoLabel.textContent = tRenderer("renderer.main.results.precise_mode", togglePrecisoLabel.textContent || "");
    togglePrecisoLabel.title = tRenderer("renderer.main.results.precise_tooltip", togglePrecisoLabel.title || "");
    const toggleWrapper = togglePrecisoLabel.closest(".toggle-wrapper");
    if (toggleWrapper) {
      toggleWrapper.title = tRenderer("renderer.main.results.precise_tooltip", toggleWrapper.title || togglePrecisoLabel.title || "");
    }
  }
  // Stopwatch: Speed label and controls aria-label
  const realWpmLabel = document.querySelector(".realwpm");
  if (realWpmLabel && realWpmLabel.firstChild) {
    realWpmLabel.firstChild.textContent = tRenderer("renderer.main.timer.speed", realWpmLabel.firstChild.textContent || "");
  }
  const timerControls = document.querySelector(".timer-controls");
  if (timerControls) {
    const ariaLabel = tRenderer("renderer.main.timer.controls_label", timerControls.getAttribute("aria-label") || "");
    if (ariaLabel) timerControls.setAttribute("aria-label", ariaLabel);
  }
  const labelsCrono = getTimerLabels();
  if (tToggle) tToggle.textContent = running ? labelsCrono.pauseLabel : labelsCrono.playLabel;
  // Abbreviated label for the floating window
  const vfLabel = document.querySelector(".vf-label");
  if (vfLabel) {
    vfLabel.textContent = tRenderer("renderer.main.timer.floating_short", vfLabel.textContent || vfLabel.textContent);
  }
  
  // Help button (title)
  if (btnHelp) {
    const helpTitle = tRenderer("renderer.main.tooltips.help_button", btnHelp.getAttribute("title") || "");
    if (helpTitle) btnHelp.setAttribute("title", helpTitle);
  }
}

(async () => {
  try {
    const cfg = await window.electronAPI.getAppConfig();
    if (AppConstants && typeof AppConstants.applyConfig === "function") {
      MAX_TEXT_CHARS = AppConstants.applyConfig(cfg);
    } else if (cfg && cfg.maxTextChars) {
      MAX_TEXT_CHARS = Number(cfg.maxTextChars) || MAX_TEXT_CHARS;
    }
  } catch (e) {
    console.error("No se pudo obtener getAppConfig, usando defaults:", e);
  }

  // Load user settings ONCE when the renderer starts
  try {
    const settings = await window.electronAPI.getSettings();
    settingsCache = settings || {};
    idiomaActual = settingsCache.language || "es";
    if (settingsCache.modeConteo) modoConteo = settingsCache.modeConteo;

    // Load and apply renderer translations
    try {
      await loadRendererTranslations(idiomaActual);
      applyTranslations();
      // Refresh the initial view with the loaded translations
      updatePreviewAndResults(currentText);
    } catch (e) {
      console.warn("No se pudieron aplicar traducciones iniciales en renderer:", e);
    }
  } catch (e) {
    console.error("No se pudo obtener user settings al inicio:", e);
    // Current language is set to "es" by default
  }
})();

let wpm = Number(wpmSlider.value);
let currentPresetName = null;

// Local preset cache (full list loaded once)
let allPresetsCache = [];

// ======================= Presets module =======================
const { combinePresets, fillPresetsSelect, applyPresetSelection, loadPresetsIntoDom } = window.RendererPresets || {};
if (!combinePresets || !fillPresetsSelect || !applyPresetSelection || !loadPresetsIntoDom) {
  console.error("[renderer] RendererPresets no disponible");
}

// ======================= Text Count =======================
const { contarTexto: contarTextoModulo } = window.CountUtils || {};
if (typeof contarTextoModulo !== "function") {
  throw new Error("[renderer] CountUtils no disponible; no se puede continuar");
}

function contarTexto(texto) {
  return contarTextoModulo(texto, { modoConteo, idioma: idiomaActual });
}

// Helpers to update mode/language from other parts (e.g., menu)
function setModoConteo(nuevoModo) {
  if (nuevoModo === "simple" || nuevoModo === "preciso") {
    modoConteo = nuevoModo;
  }
}

// ======================= HHh MMm SSs format =======================
const { getTimeParts, formatTimeFromWords, obtenerSeparadoresDeNumeros, formatearNumero } = window.FormatUtils || {};
if (!getTimeParts || !formatTimeFromWords || !obtenerSeparadoresDeNumeros || !formatearNumero) {
  console.error("[renderer] FormatUtils no disponible");
}

// ======================= Update view and results =======================
async function updatePreviewAndResults(text) {
  const previousText = currentText;      // Text before change
  currentText = text || "";              // New text (normalized)
  const textChanged = previousText !== currentText;

  const displayText = currentText.replace(/\r?\n/g, '   ');
  const n = displayText.length;

  if (n === 0) {
    const emptyMsg = tRenderer("renderer.main.selector_empty", "(empty)");
    textPreview.textContent = emptyMsg;
  } else if (n <= PREVIEW_INLINE_THRESHOLD) {
    textPreview.textContent = displayText;
  } else {
    const start = displayText.slice(0, PREVIEW_START_CHARS);
    const end = displayText.slice(-PREVIEW_END_CHARS);
    textPreview.textContent = `${start}... | ...${end}`;
  }

  const stats = contarTexto(currentText);
  const idioma = idiomaActual; // Cached on startup and updated by listener if applicable
  const { separadorMiles, separadorDecimal } = await obtenerSeparadoresDeNumeros(idioma, settingsCache);

  // Format numbers according to language
  const caracteresFormateado = formatearNumero(stats.conEspacios, separadorMiles, separadorDecimal);
  const caracteresSinEspaciosFormateado = formatearNumero(stats.sinEspacios, separadorMiles, separadorDecimal);
  const palabrasFormateado = formatearNumero(stats.palabras, separadorMiles, separadorDecimal);

  resChars.textContent = msgRenderer("renderer.main.results.chars", { n: caracteresFormateado }, `Caracteres: ${caracteresFormateado}`);
  resCharsNoSpace.textContent = msgRenderer("renderer.main.results.chars_no_space", { n: caracteresSinEspaciosFormateado }, `Chars w/o space: ${caracteresSinEspaciosFormateado}`);
  resWords.textContent = msgRenderer("renderer.main.results.words", { n: palabrasFormateado }, `Palabras: ${palabrasFormateado}`);

  const { hours, minutes, seconds } = getTimeParts(stats.palabras, wpm);
  resTime.textContent = msgRenderer("renderer.main.results.time", { h: hours, m: minutes, s: seconds });

  // If detect that the text has changed from the previous state -> reset the timer in main
  if (textChanged) {
    try {
      if (window.electronAPI && typeof window.electronAPI.sendCronoReset === 'function') {
        // We ask main to reset the timer (authority). We also perform an immediate UI reset.
        window.electronAPI.sendCronoReset();
        uiResetTimer();
        lastComputedElapsedForWpm = 0;
      } else {
        // Local fallback if no IPC (rare)
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

// Listen for stopwatch status from main (authority)
if (window.electronAPI && typeof window.electronAPI.onCronoState === 'function') {
  window.electronAPI.onCronoState((state) => {
    try {
      const res = timerModule.handleCronoState({
        state,
        timerDisplay,
        timerEditing,
        tToggle,
        realWpmDisplay,
        currentText,
        contarTexto,
        obtenerSeparadoresDeNumeros,
        formatearNumero,
        idiomaActual,
        prevRunning,
        lastComputedElapsedForWpm,
        ...getTimerLabels()
      });
      if (res) {
        elapsed = res.elapsed;
        running = res.running;
        prevRunning = res.prevRunning;
        lastComputedElapsedForWpm = res.lastComputedElapsedForWpm;
      }
    } catch (e) {
      console.error("Error manejando crono-state en renderer:", e);
    }
  });
}

// ======================= Show real speed (WPM) =======================
async function mostrarVelocidadReal(realWpm) {
  const idioma = idiomaActual;
  const { separadorMiles, separadorDecimal } = await obtenerSeparadoresDeNumeros(idioma, settingsCache);
  // Apply the same formatting to the real speed
  const velocidadFormateada = formatearNumero(realWpm, separadorMiles, separadorDecimal);
  realWpmDisplay.textContent = `${velocidadFormateada} WPM`;
}

// ======================= Load presets (merge + shadowing) =======================
const loadPresets = async () => {
  try {
    const res = await loadPresetsIntoDom({
      electronAPI: window.electronAPI,
      language: idiomaActual,
      currentPresetName,
      selectEl: presetsSelect,
      wpmInput,
      wpmSlider,
      presetDescription
    });
    allPresetsCache = res && res.list ? res.list.slice() : [];
    if (res && res.selected) {
      currentPresetName = res.selected.name;
      wpm = res.selected.wpm;
    } else {
      currentPresetName = null;
    }
    return allPresetsCache;
  } catch (err) {
    console.error("Error cargando presets:", err);
    if (presetsSelect) presetsSelect.innerHTML = "";
    if (presetDescription) presetDescription.textContent = "";
    allPresetsCache = [];
    currentPresetName = null;
    return allPresetsCache;
  }
};

// ======================= Initialization =======================
(async () => {
  try {
    // Get current initial text (if any)
    const t = await window.electronAPI.getCurrentText();
    updatePreviewAndResults(t || "");

    // Subscription to updates from main (modal)
    if (window.electronAPI && typeof window.electronAPI.onCurrentTextUpdated === 'function') {
      window.electronAPI.onCurrentTextUpdated((text) => {
        updatePreviewAndResults(text || "");
      });
    }

    // Subscription: listen when main notifies that a preset has been created/updated
    if (window.electronAPI && typeof window.electronAPI.onPresetCreated === 'function') {
      window.electronAPI.onPresetCreated(async (preset) => {
        try {
          // Reload presets from settings (applies shadowing) and select the created one
          const updated = await loadPresets();
          if (preset && preset.name) {
            const found = updated.find(p => p.name === preset.name);
            if (found) {
              currentPresetName = found.name;
              applyPresetSelection(found, { selectEl: presetsSelect, wpmInput, wpmSlider, presetDescription });
              wpm = found.wpm;
              updatePreviewAndResults(currentText);
            }
          }
        } catch (e) {
          console.error("Error handling preset-created event:", e);
        }
      });
    }

    // Load presets and save them to the cache
    const allPresets = await loadPresets();

    // Select the initial "default" preset from the general settings and set it visually
    const initialPreset = allPresets.find(p => p.name === "default");
    if (initialPreset) {
      currentPresetName = initialPreset.name;
      applyPresetSelection(initialPreset, { selectEl: presetsSelect, wpmInput, wpmSlider, presetDescription });
      wpm = initialPreset.wpm;
    }

    // Update the final view with the possible initial WPM
    updatePreviewAndResults(t || "");

    // --- Listener for settings changes from main/preload (optional) ---
    // If main/preload exposes an event, we use it to keep settingsCache and currentLanguage updated.
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
          // Reload presets for the new language and synchronize selection
          try {
            const updated = await loadPresets();
            let selected = updated.find(p => p.name === currentPresetName);
            if (!selected) {
              selected = updated.find(p => p.name === 'default') || updated[0];
            }
            if (selected) {
              currentPresetName = selected.name;
              applyPresetSelection(selected, { selectEl: presetsSelect, wpmInput, wpmSlider, presetDescription });
              wpm = selected.wpm;
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
      } // If it doesn't exist, there's no listener available and nothing happens

      if (typeof window.electronAPI.onManualEditorReady === 'function') {
        window.electronAPI.onManualEditorReady(() => {
          hideManualLoader();
        });
      }
    }

    // ------------------------------
    // Initialize and bind the "Precise Mode" toggle
    // ------------------------------
    try {
      if (toggleModoPreciso) {
        // Ensure initial switch state according to the memory mode (loaded at startup)
        toggleModoPreciso.checked = (modoConteo === 'preciso');

        // When the user changes the switch:
        toggleModoPreciso.addEventListener('change', async () => {
          try {
            const nuevoModo = toggleModoPreciso.checked ? 'preciso' : 'simple';

            // Update state in memory (immediately)
            setModoConteo(nuevoModo);

            toggleModoPreciso.setAttribute('aria-checked', toggleModoPreciso.checked ? 'true' : 'false');

            // Immediate recount of the current text
            updatePreviewAndResults(currentText);

            // Attempt to persist settings via IPC (if preload/main implemented setModeCount)
            if (window.electronAPI && typeof window.electronAPI.setModeConteo === 'function') {
              try {
                await window.electronAPI.setModeConteo(nuevoModo);
              } catch (ipcErr) {
                console.error("Error persistiendo modeConteo mediante setModeConteo:", ipcErr);
              }
            }
          } catch (err) {
            console.error("Error manejando cambio del toggleModoPreciso:", err);
          }
        });

        // If the settings changes from main, synchronize the switch to the new value
        // (This complements settingsChangeHandler; repeated for local security)
        const syncToggleFromSettings = (s) => {
          try {
            if (!toggleModoPreciso) return;
            const modo = (s && s.modeConteo) ? s.modeConteo : modoConteo;
            toggleModoPreciso.checked = (modo === 'preciso');
          } catch (err) {
            console.error("Error sincronizando toggle desde settings:", err);
          }
        };

        // Perform immediate synchronization with settingsCache (already loaded)
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

  // Translate the HTML loaded in the info modal using data-i18n and renderer.info.<key>.*
  function translateInfoHtml(htmlString, key) {
    // If no translation function is available, return the unmodified HTML
    if (!tRenderer) return htmlString;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlString, "text/html");
      doc.querySelectorAll("[data-i18n]").forEach((el) => {
        const dataKey = el.getAttribute("data-i18n");
        if (!dataKey) return;
        const tKey = `renderer.info.${key}.${dataKey}`;
        const translated = tRenderer(tKey, el.textContent || "");
        if (translated) el.textContent = translated;
      });
      return doc.body.innerHTML;
    } catch (e) {
      console.warn("translateInfoHtml failed:", e);
      return htmlString;
    }
  }

  async function showInfoModal(key, opts = {}) {
    // key: 'readme' | 'instrucciones' | 'guia_basica' | 'faq' | 'acerca_de'
    const sectionTitles = {
      readme: "Readme",
      instrucciones: "Instrucciones completas",
      guia_basica: "Guia basica",
      faq: "Preguntas frecuentes (FAQ)",
      acerca_de: "Acerca de"
    };

    if (!infoModal || !infoModalTitle || !infoModalContent) return;

    // Decide which file to load based on the key.
    // Unify basic_guide, instructions, and FAQ in ./info/instructions.html
    let fileToLoad = null;
    let sectionId = null;

    if (key === 'readme') {
      fileToLoad = './info/readme.html';
    } else if (key === 'acerca_de') {
      fileToLoad = './info/acerca_de.html';
    } else if (key === 'guia_basica' || key === 'instrucciones' || key === 'faq') {
      fileToLoad = './info/instrucciones.html';
      // Map key to block ID within instructions.html
      const mapping = { guia_basica: 'guia-basica', instrucciones: 'instrucciones', faq: 'faq' };
      sectionId = mapping[key] || 'instrucciones';
    } else {
      // Fallback: Attempt to load ./info/<key>.html (compatibility)
      fileToLoad = `./info/${key}.html`;
    }

    const translationKey = (key === "guia_basica" || key === "faq") ? "instrucciones" : key;
    // Modal title: Display the section title (not generic "Info")
    const defaultTitle = sectionTitles[key] || (opts.title || "InformaciA3n");
    infoModalTitle.textContent = tRenderer ? tRenderer(`renderer.info.${translationKey}.title`, defaultTitle) : defaultTitle;

    // Open modal
    infoModal.setAttribute("aria-hidden", "false");

    // Load HTML
    const tryHtml = await fetchText(fileToLoad);
    if (tryHtml === null) {
      // Fallback: Indicate missing content
      infoModalContent.innerHTML =
        `<p>No hay contenido disponible para "${infoModalTitle.textContent}".</p>`;
      if (infoModalContent && typeof infoModalContent.focus === "function") infoModalContent.focus();
      return;
    }

    // Translate if i18n is loaded and then add content
    const translatedHtml = translateInfoHtml(tryHtml, translationKey);
    infoModalContent.innerHTML = translatedHtml;

    // Ensure the panel starts at the top before scrolling
    const panel = document.querySelector('.info-modal-panel');
    if (panel) panel.scrollTop = 0;

    // If a specific section was requested, scroll so it appears *above* the panel
    if (sectionId) {
      // Wait for the next frame for the parsed DOM to be laid out
      requestAnimationFrame(() => {
        try {
          const target = infoModalContent.querySelector(`#${sectionId}`);
          if (!target) {
            // If the ID doesn't exist, do nothing else
            if (infoModalContent && typeof infoModalContent.focus === "function") infoModalContent.focus();
            return;
          }

          try {
            target.scrollIntoView({ behavior: 'auto', block: 'start' });
          } catch (err) {
            // Defensive fallback: Calculate relative top without compensating for header
            const panelRect = panel.getBoundingClientRect();
            const targetRect = target.getBoundingClientRect();
            const desired = (targetRect.top - panelRect.top) + panel.scrollTop;
            const finalTop = Math.max(0, Math.min(desired, panel.scrollHeight - panel.clientHeight));
            panel.scrollTo({ top: finalTop, behavior: 'auto' });
          }

          // Finally, focus on the content so the reader can use the keyboard
          if (infoModalContent && typeof infoModalContent.focus === "function") infoModalContent.focus();
        } catch (e) {
          console.error("Error desplazando modal a seccion:", e);
          if (infoModalContent && typeof infoModalContent.focus === "function") infoModalContent.focus();
        }
      });
    } else {
      // No section: only focus on the content (entire document)
      if (infoModalContent && typeof infoModalContent.focus === "function") infoModalContent.focus();
    }
  }

  // ======================= TOP BAR: Register actions with menuActions =======================
  // Ensure menu.js is loaded (script included before renderer.js)
  if (window.menuActions && typeof window.menuActions.registerMenuAction === 'function') {  
    window.menuActions.registerMenuAction("guia_basica", () => { showInfoModal("guia_basica") });
    window.menuActions.registerMenuAction("instrucciones_completas", () => { showInfoModal("instrucciones") });
    window.menuActions.registerMenuAction("faq", () => { showInfoModal("faq") });
    window.menuActions.registerMenuAction('cargador_texto', () => {
      Notify.notifyMain("renderer.alerts.wip_cargador_texto"); // TEMP
    });
    window.menuActions.registerMenuAction('contador_imagen', () => {
      Notify.notifyMain("renderer.alerts.wip_contador_imagen"); // TEMP
    });
    window.menuActions.registerMenuAction('test_velocidad', () => {
      Notify.notifyMain("renderer.alerts.wip_test_velocidad"); // TEMP
    });
    window.menuActions.registerMenuAction('preferencias_idioma', () => {
      Notify.notifyMain("renderer.alerts.wip_idioma"); // TEMP
    });
    window.menuActions.registerMenuAction('diseno_skins', () => {
      Notify.notifyMain("renderer.alerts.wip_diseno_skins"); // TEMP
    });
    window.menuActions.registerMenuAction('diseno_crono_flotante', () => {
      Notify.notifyMain("renderer.alerts.wip_diseno_crono"); // TEMP
    });
    window.menuActions.registerMenuAction('diseno_fuentes', () => {
      Notify.notifyMain("renderer.alerts.wip_diseno_fuentes"); // TEMP
    });
    window.menuActions.registerMenuAction('diseno_colores', () => {
      Notify.notifyMain("renderer.alerts.wip_diseno_colores"); // TEMP
    });

    window.menuActions.registerMenuAction("presets_por_defecto", async () => {
      try {
        if (!window.electronAPI || typeof window.electronAPI.openDefaultPresetsFolder !== "function") {
          console.warn("openDefaultPresetsFolder no disponible en electronAPI");
          Notify.notifyMain("renderer.alerts.open_presets_unsupported");
          return;
        }

        const res = await window.electronAPI.openDefaultPresetsFolder();
        if (res && res.ok) {
          // Folder opened successfully; do not show intrusive notifications
          console.debug("Carpeta config/presets_defaults abierta en el explorador.");
          return;
        }

        // In case of failure, inform the user
        const errMsg = res && res.error ? String(res.error) : "Desconocido";
        console.error("No se pudo abrir carpeta presets por defecto:", errMsg);
        Notify.notifyMain("renderer.alerts.open_presets_fail");
      } catch (err) {
        console.error("Error abriendo carpeta presets por defecto:", err);
        Notify.notifyMain("renderer.alerts.open_presets_error");
      }
    });

    window.menuActions.registerMenuAction('avisos', () => {
      Notify.notifyMain("renderer.alerts.wip_avisos"); // TEMP
    });
    window.menuActions.registerMenuAction('discord', () => {
      Notify.notifyMain("renderer.alerts.wip_discord"); // TEMP
    });
    window.menuActions.registerMenuAction('links_interes', () => {
      Notify.notifyMain("renderer.alerts.wip_links_interes"); // TEMP
    });
    window.menuActions.registerMenuAction('colabora', () => {
      Notify.notifyMain("renderer.alerts.wip_colabora"); // TEMP
    });

    window.menuActions.registerMenuAction('actualizar_version', async () => {
      try {
        await window.electronAPI.checkForUpdates();
      } catch (e) {
        console.error("Error al solicitar checkForUpdates:", e);
      }
    });

    window.menuActions.registerMenuAction("readme", () => { showInfoModal("readme") });
    window.menuActions.registerMenuAction("acerca_de", () => { showInfoModal("acerca_de") });

    // Generic example for viewing payloads not explicitly registered:
    // (optional) Registering a "catch-all" is not necessary; menu.js already logs payloads without a handler.
  } else {
    // If menuActions is unavailable, register a direct receiver (fallback)
    if (window.electronAPI && typeof window.electronAPI.onMenuClick === 'function') {
      window.electronAPI.onMenuClick((payload) => {
      });
    } else {
      console.warn('menuActions y electronAPI.onMenuClick no disponibles - la barra superior no sera manejada por renderer.');
    }
  }
})();

// ======================= Preset selection (uses cache, doesn't reload DOM) =======================
presetsSelect.addEventListener('change', () => {
  const name = presetsSelect.value;
  if (!name) return;

  const preset = allPresetsCache.find(p => p.name === name);
  if (preset) {
    currentPresetName = preset.name;
    // Visually pin (in case the select doesn't mark it on some platforms)
    presetsSelect.value = preset.name;
    wpm = preset.wpm;
    wpmInput.value = wpm;
    wpmSlider.value = wpm;
    presetDescription.textContent = preset.description || "";
    updatePreviewAndResults(currentText);
  }
});

// ======================= Detect manual change in WPM speed selector =======================
function resetPresetSelection() {
  currentPresetName = null;
  // Leave the select without visual selection
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
  if (isNaN(val)) val = Number(wpmSlider.value) || WPM_MIN;
  val = Math.min(Math.max(val, WPM_MIN), WPM_MAX);
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

// ======================= Overwrite with clipboard button =======================
btnCountClipboard.addEventListener("click", async () => {
  try {
    let clip = await window.electronAPI.readClipboard() || "";
    if (clip.length > MAX_TEXT_CHARS) {
      console.warn("Contenido del portapapeles supera el tamano permitido - sera truncado.");
      clip = clip.slice(0, MAX_TEXT_CHARS);
      Notify.notifyMain("renderer.alerts.clipboard_overflow");
    }

    // Send object with meta (overwrite)
    const resp = await window.electronAPI.setCurrentText({
      text: clip,
      meta: { source: "main-window", action: "overwrite", clipboardText: clip }
    });

    updatePreviewAndResults(resp && resp.text ? resp.text : clip);
    resp && resp.truncated && Notify.notifyMain("renderer.editor_alerts.text_truncated");
  } catch (err) {
    console.error("clipboard error:", err);
    Notify.notifyMain("renderer.alerts.clipboard_error");
  }
});

// ======================= "Paste clipboard in new line" button =======================
btnAppendClipboardNewLine.addEventListener("click", async () => {
  try {
    const clip = await window.electronAPI.readClipboard() || "";
    const current = await window.electronAPI.getCurrentText() || "";

    let joiner = "";
    if (current) joiner = current.endsWith("\n") || current.endsWith("\r") ? "\n" : "\n\n";

    const available = MAX_TEXT_CHARS - current.length;
    if (available <= 0) {
      Notify.notifyMain("renderer.alerts.too_big");
      return;
    }

    const toAdd = clip.slice(0, available);
    const newFull = current + (current ? joiner : "") + toAdd;

    // Send object with meta (append_newline)
    const resp = await window.electronAPI.setCurrentText({
      text: newFull,
      meta: { source: "main-window", action: "append_newline", clipboardText: clip }
    });

    updatePreviewAndResults(resp && resp.text ? resp.text : newFull);

    // Notify truncation only if main confirms it
    if (resp && resp.truncated) {
      Notify.notifyMain("renderer.editor_alerts.text_truncated");
    }
  } catch (err) {
    console.error("Ocurrio un error al pegar el portapapeles:", err);
    Notify.notifyMain("renderer.alerts.paste_error");
  }
});

btnEdit.addEventListener('click', async () => {
  showManualLoader();
  try {
    await window.electronAPI.openEditor();
  } catch (err) {
    console.error("Error abriendo editor manual:", err);
    hideManualLoader();
  }
});

// ======================= Clear Button (Main Screen) =======================
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
    Notify.notifyMain("renderer.alerts.clear_error");
  }
});

// '?' Button (for now, it's just there; no functionality)
if (btnHelp) {
  btnHelp.addEventListener('click', () => {
  });
}

// Open modal to create preset (main creates the modal window)
// Sends the current WPM to main so it can propagate it to the modal
btnNewPreset.addEventListener('click', () => {
  try {
    if (window.electronAPI && typeof window.electronAPI.openPresetModal === 'function') {
      window.electronAPI.openPresetModal(wpm);
    } else {
      console.warn("openPresetModal no disponible en electronAPI");
      Notify.notifyMain("renderer.alerts.modal_unavailable");
    }
  } catch (e) {
    console.error("Error abriendo modal de nuevo preset:", e);
  }
});

// ======================= EDIT Button (Edit selected preset) =======================
btnEditPreset.addEventListener('click', async () => {
  try {
    const selectedName = presetsSelect.value;
    if (!selectedName) {
      // Ask main to show native info dialog 'No hay ningun preset seleccionado para editar'
      if (window.electronAPI && typeof window.electronAPI.notifyNoSelectionEdit === 'function') {
        await window.electronAPI.notifyNoSelectionEdit();
        return;
      } else {
        Notify.notifyMain("renderer.alerts.edit_none");
        return;
      }
    }

    // Find preset data from cache
    const preset = allPresetsCache.find(p => p.name === selectedName);
    if (!preset) {
      Notify.notifyMain("renderer.alerts.preset_not_found");
      return;
    }

    // Open modal in edit mode. We pass an object with mode and the preset data.
    const payload = { wpm: wpm, mode: 'edit', preset: preset };
    try {
      console.debug("[renderer] openPresetModal payload:", payload);
    } catch (e) { /* noop */ }
    if (window.electronAPI && typeof window.electronAPI.openPresetModal === 'function') {
      window.electronAPI.openPresetModal(payload);
    } else {
      Notify.notifyMain("renderer.alerts.edit_unavailable");
    }
  } catch (e) {
    console.error("Error abriendo modal de editar preset:", e);
    Notify.notifyMain("renderer.alerts.edit_error");
  }
});

// ======================= DELETE Button (trash can icon) =======================
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
      Notify.notifyMain("renderer.alerts.delete_error");
    }
  } catch (e) {
    console.error("Error en peticion de borrado:", e);
    Notify.notifyMain("renderer.alerts.delete_error");
  }
});

// ======================= RESTORE Button (R) =======================
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
      Notify.notifyMain("renderer.alerts.restore_error");
    }
  } catch (e) {
    console.error("Error en peticion de restaurar presets:", e);
    Notify.notifyMain("renderer.alerts.restore_error");
  }
});

// ======================= STOPWATCH =======================
const timerDisplay = document.getElementById('timerDisplay');

// Prevent main broadcasts from overwriting the current edit
if (timerDisplay) {
  timerDisplay.addEventListener('focus', () => {
    timerEditing = true;
  });
  timerDisplay.addEventListener('blur', () => {
    // The blur event will execute applyManualTime (already registered) which will update the stopwatch in main
    timerEditing = false;
  });
}

const tToggle = document.getElementById('timerToggle');
const tReset = document.getElementById('timerReset');

// Local mirror of the stopwatch state (synchronized from main via onCronoState)
let elapsed = 0;
let running = false;
// Flag to detect transitions and prevent continuous recalculations
let prevRunning = false;
// Indicates if the user is manually editing the timer field (to prevent overwriting)
let timerEditing = false;
// Last elapsed for which we calculate WPM (avoid repeated recalculations)
let lastComputedElapsedForWpm = null;

function showManualLoader() {
  if (manualLoader) manualLoader.classList.add('visible');
  if (btnEdit) btnEdit.disabled = true;
}

function hideManualLoader() {
  if (manualLoader) manualLoader.classList.remove('visible');
  if (btnEdit) btnEdit.disabled = false;
}

const timerModule = (typeof window !== "undefined") ? window.RendererTimer : null;

const getTimerLabels = () => ({
  playLabel: tRenderer ? tRenderer("renderer.main.timer.play_symbol", ">") : ">",
  pauseLabel: tRenderer ? tRenderer("renderer.main.timer.pause_symbol", "||") : "||"
});

const formatTimer = (ms) => timerModule.formatTimer(ms);

const actualizarVelocidadRealFromElapsed = (ms) => timerModule.actualizarVelocidadRealFromElapsed({
  ms,
  currentText,
  contarTexto,
  obtenerSeparadoresDeNumeros,
  formatearNumero,
  idiomaActual,
  realWpmDisplay
});

const uiResetTimer = () => {
  elapsed = 0;
  running = false;
  prevRunning = false;
  const { playLabel } = getTimerLabels();
  timerModule.uiResetTimer({ timerDisplay, realWpmDisplay, tToggle, playLabel });
};

tToggle.addEventListener('click', () => {
  if (window.electronAPI && typeof window.electronAPI.sendCronoToggle === 'function') {
    window.electronAPI.sendCronoToggle();
  }
});

tReset.addEventListener('click', () => {
  if (window.electronAPI && typeof window.electronAPI.sendCronoReset === 'function') {
    window.electronAPI.sendCronoReset();
  }
});

// --- Floating window control (FW) ---
// Open FW
const openFloating = async () => {
  const res = await timerModule.openFloating({
    electronAPI: window.electronAPI,
    toggleVF,
    timerDisplay,
    timerEditing,
    tToggle,
    ...getTimerLabels(),
    setElapsedRunning: (elapsedVal, runningVal) => {
      elapsed = elapsedVal;
      running = runningVal;
    }
  });
  if (res && typeof res.elapsed === "number") {
    lastComputedElapsedForWpm = res.elapsed;
    prevRunning = running;
  }
};

const closeFloating = async () => {
  await timerModule.closeFloating({ electronAPI: window.electronAPI, toggleVF });
};

// toggle WF from the UI (switch)
if (toggleVF) {
  toggleVF.addEventListener('change', async (ev) => {
    const wantOpen = !!toggleVF.checked;
    // Optimistic: reflect aria-checked immediately
    toggleVF.setAttribute('aria-checked', wantOpen ? 'true' : 'false');

    if (wantOpen) {
      await openFloating();
      // openFloating handles revert in case of error
    } else {
      await closeFloating();
    }
  });
}

// If the float is closed from main (or destroyed), we clean it up Local timers
if (window.electronAPI && typeof window.electronAPI.onFloatingClosed === 'function') {
  window.electronAPI.onFloatingClosed(() => {
    if (toggleVF) { toggleVF.checked = false; toggleVF.setAttribute('aria-checked', 'false'); }
  });
}

// ======================= Manual stopwatch editing =======================
const parseTimerInput = (input) => timerModule.parseTimerInput(input);

const applyManualTime = () => {
  timerModule.applyManualTime({
    value: timerDisplay.value,
    timerDisplay,
    electronAPI: window.electronAPI,
    currentText,
    contarTexto,
    obtenerSeparadoresDeNumeros,
    formatearNumero,
    idiomaActual,
    realWpmDisplay,
    ...getTimerLabels(),
    setElapsed: (msVal) => { elapsed = msVal; return elapsed; },
    setLastComputedElapsed: (msVal) => { lastComputedElapsedForWpm = msVal; }
  });
};

timerDisplay.addEventListener('blur', applyManualTime);

timerDisplay.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    timerDisplay.blur();
  }
});
