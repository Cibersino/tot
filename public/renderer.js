// public/renderer.js
/* global Notify */
'use strict';

const log = window.getLogger('renderer');

log.debug('Renderer main starting...');

const { AppConstants } = window;
if (!AppConstants) {
  throw new Error('[renderer] AppConstants no disponible; verifica la carga de constants.js');
}

const {
  WPM_MIN,
  WPM_MAX,
  PREVIEW_INLINE_THRESHOLD,
  PREVIEW_START_CHARS,
  PREVIEW_END_CHARS
} = AppConstants;

const textPreview = document.getElementById('textPreview');
const btnOverwriteClipboard = document.getElementById('btnOverwriteClipboard');
const btnAppendClipboard = document.getElementById('btnAppendClipboard');
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
const editorLoader = document.getElementById('editorLoader');

// References to presets elements
const presetsSelect = document.getElementById('presets');
const btnNewPreset = document.getElementById('btnNewPreset');
const btnEditPreset = document.getElementById('btnEditPreset');
const btnDeletePreset = document.getElementById('btnDeletePreset');
const btnResetDefaultPresets = document.getElementById('btnResetDefaultPresets');
const presetDescription = document.getElementById('presetDescription');

// Visibility helper: warn only once per key (renderer scope)
const warnOnceRenderer = (...args) => log.warnOnce(...args);

let currentText = '';
// Local limit in renderer to prevent concatenations that create excessively large strings
let maxTextChars = AppConstants.MAX_TEXT_CHARS; // Default value until main responds
let maxIpcChars = AppConstants.MAX_TEXT_CHARS * 4; // Fallback until main responds
// --- Global cache and state for count/language ---
let modoConteo = 'preciso';   // Precise by default; can be `simple`
let idiomaActual = 'es';      // Initializes on startup
let settingsCache = {};       // Settings cache (number formatting, language, etc.)
// --- i18n renderer translations cache ---
const { loadRendererTranslations, tRenderer, msgRenderer } = window.RendererI18n || {};
if (!loadRendererTranslations || !tRenderer || !msgRenderer) {
  throw new Error('[renderer] RendererI18n no disponible; no se puede continuar');
}

function applyTranslations() {
  if (!tRenderer) return;
  // Text Selector buttons
  if (btnOverwriteClipboard) btnOverwriteClipboard.textContent = tRenderer('renderer.main.buttons.overwrite_clipboard', btnOverwriteClipboard.textContent || '');
  if (btnAppendClipboard) btnAppendClipboard.textContent = tRenderer('renderer.main.buttons.append_clipboard', btnAppendClipboard.textContent || '');
  if (btnEdit) btnEdit.textContent = tRenderer('renderer.main.buttons.edit', btnEdit.textContent || '');
  if (btnEmptyMain) btnEmptyMain.textContent = tRenderer('renderer.main.buttons.clear', btnEmptyMain.textContent || '');
  // Text Selector tooltips
  if (btnOverwriteClipboard) btnOverwriteClipboard.title = tRenderer('renderer.main.tooltips.overwrite_clipboard', btnOverwriteClipboard.title || '');
  if (btnAppendClipboard) btnAppendClipboard.title = tRenderer('renderer.main.tooltips.append_clipboard', btnAppendClipboard.title || '');
  if (btnEdit) btnEdit.title = tRenderer('renderer.main.tooltips.edit', btnEdit.title || '');
  if (btnEmptyMain) btnEmptyMain.title = tRenderer('renderer.main.tooltips.clear', btnEmptyMain.title || '');
  // Presets
  if (btnNewPreset) btnNewPreset.textContent = tRenderer('renderer.main.speed.new', btnNewPreset.textContent || '');
  if (btnEditPreset) btnEditPreset.textContent = tRenderer('renderer.main.speed.edit', btnEditPreset.textContent || '');
  if (btnDeletePreset) btnDeletePreset.textContent = tRenderer('renderer.main.speed.delete', btnDeletePreset.textContent || '');
  if (btnResetDefaultPresets) btnResetDefaultPresets.textContent = tRenderer('renderer.main.speed.reset_defaults', btnResetDefaultPresets.textContent || '');
  if (btnNewPreset) btnNewPreset.title = tRenderer('renderer.main.tooltips.new_preset', btnNewPreset.title || '');
  if (btnEditPreset) btnEditPreset.title = tRenderer('renderer.main.tooltips.edit_preset', btnEditPreset.title || '');
  if (btnDeletePreset) btnDeletePreset.title = tRenderer('renderer.main.tooltips.delete_preset', btnDeletePreset.title || '');
  if (btnResetDefaultPresets) btnResetDefaultPresets.title = tRenderer('renderer.main.tooltips.reset_presets', btnResetDefaultPresets.title || '');
  // Floating Window toggle
  const vfSwitchLabel = document.querySelector('.vf-switch-wrapper label.switch');
  if (vfSwitchLabel) vfSwitchLabel.title = tRenderer('renderer.main.tooltips.flotante_window', vfSwitchLabel.title || '');
  // Section Titles
  if (selectorTitle) selectorTitle.textContent = tRenderer('renderer.main.selector_title', selectorTitle.textContent || '');
  if (velTitle) velTitle.textContent = tRenderer('renderer.main.speed.title', velTitle.textContent || '');
  if (resultsTitle) resultsTitle.textContent = tRenderer('renderer.main.results.title', resultsTitle.textContent || '');
  if (cronTitle) cronTitle.textContent = tRenderer('renderer.main.crono.title', cronTitle.textContent || '');
  // Speed Selector labels
  const wpmLabel = document.querySelector('.wpm-row span');
  if (wpmLabel) wpmLabel.textContent = tRenderer('renderer.main.speed.wpm_label', wpmLabel.textContent || '');
  // Results: precise mode label
  const togglePrecisoLabel = document.querySelector('.toggle-wrapper .toggle-label');
  if (togglePrecisoLabel) {
    togglePrecisoLabel.textContent = tRenderer('renderer.main.results.precise_mode', togglePrecisoLabel.textContent || '');
    togglePrecisoLabel.title = tRenderer('renderer.main.results.precise_tooltip', togglePrecisoLabel.title || '');
    const toggleWrapper = togglePrecisoLabel.closest('.toggle-wrapper');
    if (toggleWrapper) {
      toggleWrapper.title = tRenderer('renderer.main.results.precise_tooltip', toggleWrapper.title || togglePrecisoLabel.title || '');
    }
  }
  // Stopwatch: Speed label and controls aria-label
  const realWpmLabel = document.querySelector('.realwpm');
  if (realWpmLabel && realWpmLabel.firstChild) {
    realWpmLabel.firstChild.textContent = tRenderer('renderer.main.crono.speed', realWpmLabel.firstChild.textContent || '');
  }
  const cronoControls = document.querySelector('.crono-controls');
  if (cronoControls) {
    const ariaLabel = tRenderer('renderer.main.crono.controls_label', cronoControls.getAttribute('aria-label') || '');
    if (ariaLabel) cronoControls.setAttribute('aria-label', ariaLabel);
  }
  const labelsCrono = getCronoLabels();
  if (tToggle) tToggle.textContent = running ? labelsCrono.pauseLabel : labelsCrono.playLabel;
  // Abbreviated label for the floating window
  const vfLabel = document.querySelector('.vf-label');
  if (vfLabel) {
    vfLabel.textContent = tRenderer('renderer.main.crono.flotante_short', vfLabel.textContent || vfLabel.textContent);
  }

  // Help button (title)
  if (btnHelp) {
    const helpTitle = tRenderer('renderer.main.tooltips.help_button', btnHelp.getAttribute('title') || '');
    if (helpTitle) btnHelp.setAttribute('title', helpTitle);
  }
}

(async () => {
  try {
    const cfg = await window.electronAPI.getAppConfig();
    if (AppConstants && typeof AppConstants.applyConfig === 'function') {
      maxTextChars = AppConstants.applyConfig(cfg);
    } else if (cfg && cfg.maxTextChars) {
      maxTextChars = Number(cfg.maxTextChars) || maxTextChars;
    }
    if (cfg && typeof cfg.maxIpcChars === 'number' && cfg.maxIpcChars > 0) {
      maxIpcChars = Number(cfg.maxIpcChars) || maxIpcChars;
    } else {
      maxIpcChars = maxTextChars * 4;
    }
  } catch (err) {
    log.error('Could not get getAppConfig using defaults:', err);
  }

  // Load user settings ONCE when the renderer starts
  try {
    const settings = await window.electronAPI.getSettings();
    settingsCache = settings || {};
    idiomaActual = settingsCache.language || 'es';
    if (settingsCache.modeConteo) modoConteo = settingsCache.modeConteo;

    // Load and apply renderer translations
    try {
      await loadRendererTranslations(idiomaActual);
      applyTranslations();
      // Refresh the initial view with the loaded translations
      updatePreviewAndResults(currentText);
    } catch (err) {
      log.warn('Could not apply initial translations in renderer:', err);
    }
  } catch (err) {
    log.error('Could not get user settings at startup:', err);
    // Current language is set to 'es' by default
  }
})();

let wpm = Number(wpmSlider.value);
let currentPresetName = null;

// Local preset cache (full list loaded once)
let allPresetsCache = [];

// ======================= Presets module =======================
const { combinePresets, fillPresetsSelect, applyPresetSelection, loadPresetsIntoDom } = window.RendererPresets || {};
if (!combinePresets || !fillPresetsSelect || !applyPresetSelection || !loadPresetsIntoDom) {
  log.error('[renderer] RendererPresets not available');
}

// ======================= Text Count =======================
const { contarTexto: contarTextoModulo } = window.CountUtils || {};
if (typeof contarTextoModulo !== 'function') {
  throw new Error('[renderer] CountUtils no disponible; no se puede continuar');
}

function contarTexto(texto) {
  return contarTextoModulo(texto, { modoConteo, idioma: idiomaActual });
}

// Helpers to update mode/language from other parts (e.g., menu)
function setModoConteo(nuevoModo) {
  if (nuevoModo === 'simple' || nuevoModo === 'preciso') {
    modoConteo = nuevoModo;
  }
}

// ======================= HHh MMm SSs format =======================
const { getTimeParts, formatTimeFromWords, obtenerSeparadoresDeNumeros, formatearNumero } = window.FormatUtils || {};
if (!getTimeParts || !formatTimeFromWords || !obtenerSeparadoresDeNumeros || !formatearNumero) {
  log.error('[renderer] FormatUtils not available');
}

// ======================= Update view and results =======================
async function updatePreviewAndResults(text) {
  const previousText = currentText;      // Text before change
  currentText = text || '';              // New text (normalized)
  const textChanged = previousText !== currentText;

  const displayText = currentText.replace(/\r?\n/g, '   ');
  const n = displayText.length;

  if (n === 0) {
    const emptyMsg = tRenderer('renderer.main.selector_empty', '(empty)');
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

  resChars.textContent = msgRenderer('renderer.main.results.chars', { n: caracteresFormateado }, `Caracteres: ${caracteresFormateado}`);
  resCharsNoSpace.textContent = msgRenderer('renderer.main.results.chars_no_space', { n: caracteresSinEspaciosFormateado }, `Chars w/o space: ${caracteresSinEspaciosFormateado}`);
  resWords.textContent = msgRenderer('renderer.main.results.words', { n: palabrasFormateado }, `Palabras: ${palabrasFormateado}`);

  const { hours, minutes, seconds } = getTimeParts(stats.palabras, wpm);
  resTime.textContent = msgRenderer('renderer.main.results.time', { h: hours, m: minutes, s: seconds });

  // If detect that the text has changed from the previous state -> reset the crono in main
  if (textChanged) {
    try {
      if (window.electronAPI && typeof window.electronAPI.sendCronoReset === 'function') {
        // We ask main to reset the crono (authority). We also perform an immediate UI reset.
        window.electronAPI.sendCronoReset();
        uiResetCrono();
        lastComputedElapsedForWpm = 0;
      } else {
        // Local fallback if no IPC (rare)
        uiResetCrono();
        lastComputedElapsedForWpm = 0;
      }
    } catch (err) {
      log.error('Error requesting stopwatch reset after text change:', err);
      uiResetCrono();
      lastComputedElapsedForWpm = 0;
    }
  }
}

// Listen for stopwatch status from main (authority)
if (window.electronAPI && typeof window.electronAPI.onCronoState === 'function') {
  window.electronAPI.onCronoState((state) => {
    try {
      const res = cronoModule.handleCronoState({
        state,
        cronoDisplay,
        cronoEditing,
        tToggle,
        realWpmDisplay,
        currentText,
        contarTexto,
        obtenerSeparadoresDeNumeros,
        formatearNumero,
        idiomaActual,
        prevRunning,
        lastComputedElapsedForWpm,
        ...getCronoLabels()
      });
      if (res) {
        elapsed = res.elapsed;
        running = res.running;
        prevRunning = res.prevRunning;
        lastComputedElapsedForWpm = res.lastComputedElapsedForWpm;
      }
    } catch (err) {
      log.error('Error handling crono-state in renderer:', err);
    }
  });
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
    log.error('Error loading presets:', err);
    if (presetsSelect) presetsSelect.innerHTML = '';
    if (presetDescription) presetDescription.textContent = '';
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
    updatePreviewAndResults(t || '');

    // Subscription to updates from main (modal)
    if (window.electronAPI && typeof window.electronAPI.onCurrentTextUpdated === 'function') {
      window.electronAPI.onCurrentTextUpdated((text) => {
        updatePreviewAndResults(text || '');
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
        } catch (err) {
          log.error('Error handling preset-created event:', err);
        }
      });
    }

    // Load presets and save them to the cache
    const allPresets = await loadPresets();

    // Select the initial 'default' preset from the general settings and set it visually
    const initialPreset = allPresets.find(p => p.name === 'default');
    if (initialPreset) {
      currentPresetName = initialPreset.name;
      applyPresetSelection(initialPreset, { selectEl: presetsSelect, wpmInput, wpmSlider, presetDescription });
      wpm = initialPreset.wpm;
    }

    // Update the final view with the possible initial WPM
    updatePreviewAndResults(t || '');

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
          } catch (err) {
            warnOnceRenderer(
              'renderer.loadRendererTranslations',
              `[renderer] loadRendererTranslations(${idiomaActual}) failed (ignored):`,
              err
            );
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
            log.error('Error loading presets after language change:', err);
          }
          updatePreviewAndResults(currentText);
        }
        if (settingsCache.modeConteo && settingsCache.modeConteo !== modoConteo) {
          modoConteo = settingsCache.modeConteo;
          if (toggleModoPreciso) toggleModoPreciso.checked = (modoConteo === 'preciso');
        }
        updatePreviewAndResults(currentText);
      } catch (err) {
        log.error('Error handling settings change:', err);
      }
    };

    if (window.electronAPI) {
      if (typeof window.electronAPI.onSettingsChanged === 'function') {
        window.electronAPI.onSettingsChanged(settingsChangeHandler);
      } else if (typeof window.electronAPI.onSettingsUpdated === 'function') {
        window.electronAPI.onSettingsUpdated(settingsChangeHandler);
      } // If it doesn't exist, there's no listener available and nothing happens

      if (typeof window.electronAPI.onEditorReady === 'function') {
        window.electronAPI.onEditorReady(() => {
          hideeditorLoader();
        });
      }
    }

    // ------------------------------
    // Initialize and bind the 'Precise Mode' toggle
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
              } catch (err) {
                log.error('Error persisting modeCount using setModeCount:', err);
              }
            }
          } catch (err) {
            log.error('Error handling change of toggleModoPreciso:', err);
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
            log.error('Error syncing toggle from settings:', err);
          }
        };

        // Perform immediate synchronization with settingsCache (already loaded)
        try {
          syncToggleFromSettings(settingsCache || {});
        } catch (err) {
          warnOnceRenderer('renderer.syncToggleFromSettings', '[renderer] syncToggleFromSettings failed (ignored):', err);
        }
      }
    } catch (err) {
      log.error('Error initialazing toggleModoPreciso:', err);
    }

  } catch (err) {
    log.error('Error initialazing renderer:', err);
  }
  /* --- Info modal utility --- */
  const infoModal = document.getElementById('infoModal');
  const infoModalBackdrop = document.getElementById('infoModalBackdrop');
  const infoModalClose = document.getElementById('infoModalClose');
  const infoModalTitle = document.getElementById('infoModalTitle');
  const infoModalContent = document.getElementById('infoModalContent');

  function closeInfoModal() {
    try {
      if (!infoModal || !infoModalContent) return;
      infoModal.setAttribute('aria-hidden', 'true');
      infoModalContent.innerHTML = '<div class="info-loading">Cargando...</div>';
    } catch (err) {
      log.error('Error closing modal info:', err);
    }
  }

  if (infoModalClose) infoModalClose.addEventListener('click', closeInfoModal);
  if (infoModalBackdrop) infoModalBackdrop.addEventListener('click', closeInfoModal);

  window.addEventListener('keydown', (ev) => {
    if (!infoModal) return;
    if (ev.key === 'Escape' && infoModal.getAttribute('aria-hidden') === 'false') {
      closeInfoModal();
    }
  });

  async function fetchText(path) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      log.debug('fetchText error:', path, err);
      return null;
    }
  }

  // Translate the HTML loaded in the info modal using data-i18n and renderer.info.<key>.*
  function translateInfoHtml(htmlString, key) {
    // If no translation function is available, return the unmodified HTML
    if (!tRenderer) return htmlString;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlString, 'text/html');
      doc.querySelectorAll('[data-i18n]').forEach((el) => {
        const dataKey = el.getAttribute('data-i18n');
        if (!dataKey) return;
        const tKey = `renderer.info.${key}.${dataKey}`;
        const translated = tRenderer(tKey, el.textContent || '');
        if (translated) el.textContent = translated;
      });
      return doc.body.innerHTML;
    } catch (err) {
      log.warn('translateInfoHtml failed:', err);
      return htmlString;
    }
  }

  async function showInfoModal(key, opts = {}) {
    // key: 'readme' | 'instrucciones' | 'guia_basica' | 'faq' | 'acerca_de'
    const sectionTitles = {
      readme: 'Readme',
      instrucciones: 'Instrucciones completas',
      guia_basica: 'Guia basica',
      faq: 'Preguntas frecuentes (FAQ)',
      acerca_de: 'Acerca de'
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

    const translationKey = (key === 'guia_basica' || key === 'faq') ? 'instrucciones' : key;
    // Modal title: Display the section title (not generic 'Info')
    const defaultTitle = sectionTitles[key] || (opts.title || 'InformaciA3n');
    infoModalTitle.textContent = tRenderer ? tRenderer(`renderer.info.${translationKey}.title`, defaultTitle) : defaultTitle;

    // Open modal
    infoModal.setAttribute('aria-hidden', 'false');

    // Load HTML
    const tryHtml = await fetchText(fileToLoad);
    if (tryHtml === null) {
      // Fallback: Indicate missing content
      infoModalContent.innerHTML =
        `<p>No hay contenido disponible para '${infoModalTitle.textContent}'.</p>`;
      if (infoModalContent && typeof infoModalContent.focus === 'function') infoModalContent.focus();
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
            if (infoModalContent && typeof infoModalContent.focus === 'function') infoModalContent.focus();
            return;
          }

          try {
            target.scrollIntoView({ behavior: 'auto', block: 'start' });
          } catch {
            // Defensive fallback: Calculate relative top without compensating for header
            const panelRect = panel.getBoundingClientRect();
            const targetRect = target.getBoundingClientRect();
            const desired = (targetRect.top - panelRect.top) + panel.scrollTop;
            const finalTop = Math.max(0, Math.min(desired, panel.scrollHeight - panel.clientHeight));
            panel.scrollTo({ top: finalTop, behavior: 'auto' });
          }

          // Finally, focus on the content so the reader can use the keyboard
          if (infoModalContent && typeof infoModalContent.focus === 'function') infoModalContent.focus();
        } catch (err) {
          log.error('Error moving modal to section:', err);
          if (infoModalContent && typeof infoModalContent.focus === 'function') infoModalContent.focus();
        }
      });
    } else {
      // No section: only focus on the content (entire document)
      if (infoModalContent && typeof infoModalContent.focus === 'function') infoModalContent.focus();
    }
  }

  // ======================= TOP BAR: Register actions with menuActions =======================
  // Ensure menu_actions.js is loaded (script included before renderer.js)
  if (window.menuActions && typeof window.menuActions.registerMenuAction === 'function') {
    window.menuActions.registerMenuAction('guia_basica', () => { showInfoModal('guia_basica') });
    window.menuActions.registerMenuAction('instrucciones_completas', () => { showInfoModal('instrucciones') });
    window.menuActions.registerMenuAction('faq', () => { showInfoModal('faq') });
    window.menuActions.registerMenuAction('cargador_texto', () => {
      Notify.notifyMain('renderer.alerts.wip_cargador_texto'); // WIP
    });
    window.menuActions.registerMenuAction('contador_imagen', () => {
      Notify.notifyMain('renderer.alerts.wip_contador_imagen'); // WIP
    });
    window.menuActions.registerMenuAction('test_velocidad', () => {
      Notify.notifyMain('renderer.alerts.wip_test_velocidad'); // WIP
    });
    window.menuActions.registerMenuAction('diseno_skins', () => {
      Notify.notifyMain('renderer.alerts.wip_diseno_skins'); // WIP
    });
    window.menuActions.registerMenuAction('diseno_crono_flotante', () => {
      Notify.notifyMain('renderer.alerts.wip_diseno_crono'); // WIP
    });
    window.menuActions.registerMenuAction('diseno_fuentes', () => {
      Notify.notifyMain('renderer.alerts.wip_diseno_fuentes'); // WIP
    });
    window.menuActions.registerMenuAction('diseno_colores', () => {
      Notify.notifyMain('renderer.alerts.wip_diseno_colores'); // WIP
    });
    window.menuActions.registerMenuAction('shortcuts', () => {
      Notify.notifyMain('renderer.alerts.wip_shortcuts'); // WIP
    });
    window.menuActions.registerMenuAction('presets_por_defecto', async () => {
      try {
        if (!window.electronAPI || typeof window.electronAPI.openDefaultPresetsFolder !== 'function') {
          log.warn('openDefaultPresetsFolder not available at electronAPI');
          Notify.notifyMain('renderer.alerts.open_presets_unsupported');
          return;
        }

        const res = await window.electronAPI.openDefaultPresetsFolder();
        if (res && res.ok) {
          // Folder opened successfully; do not show intrusive notifications
          log.debug('config/presets_defaults floder opened in explorer.');
          return;
        }

        // In case of failure, inform the user
        const errMsg = res && res.error ? String(res.error) : 'Desconocido';
        log.error('default presets folder failed to open:', errMsg);
        Notify.notifyMain('renderer.alerts.open_presets_fail');
      } catch (err) {
        log.error('default presets folder failed to open', err);
        Notify.notifyMain('renderer.alerts.open_presets_error');
      }
    });

    window.menuActions.registerMenuAction('avisos', () => {
      Notify.notifyMain('renderer.alerts.wip_avisos'); // WIP
    });
    window.menuActions.registerMenuAction('discord', () => {
      Notify.notifyMain('renderer.alerts.wip_discord'); // WIP
    });
    window.menuActions.registerMenuAction('links_interes', () => {
      Notify.notifyMain('renderer.alerts.wip_links_interes'); // WIP
    });
    window.menuActions.registerMenuAction('colabora', () => {
      Notify.notifyMain('renderer.alerts.wip_colabora'); // WIP
    });

    window.menuActions.registerMenuAction('actualizar_version', async () => {
      try {
        await window.electronAPI.checkForUpdates();
      } catch (err) {
        log.error('Error requesting checkForUpdates:', err);
      }
    });

    window.menuActions.registerMenuAction('readme', () => { showInfoModal('readme') });
    window.menuActions.registerMenuAction('acerca_de', () => { showInfoModal('acerca_de') });

  } else {
    log.warn('menuActions unavailable - the top bar will not be handled by the renderer.');
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
    presetDescription.textContent = preset.description || '';
    updatePreviewAndResults(currentText);
  }
});

// ======================= Detect manual change in WPM speed selector =======================
function resetPresetSelection() {
  currentPresetName = null;
  // Leave the select without visual selection
  presetsSelect.selectedIndex = -1;
  presetDescription.textContent = '';
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
btnOverwriteClipboard.addEventListener('click', async () => {
  try {
    let clip = await window.electronAPI.readClipboard() || '';

    if (clip.length > maxIpcChars) {
      Notify.notifyMain('renderer.alerts.clipboard_too_large');
      return;
    }

    // Send object with meta (overwrite)
    const resp = await window.electronAPI.setCurrentText({
      text: clip,
      meta: { source: 'main-window', action: 'overwrite' }
    });

    if (resp && resp.ok === false) {
      throw new Error(resp.error || 'set-current-text failed');
    }

    updatePreviewAndResults(resp && resp.text ? resp.text : clip);
    if (resp && resp.truncated) {
      Notify.notifyMain('renderer.alerts.clipboard_overflow');
    }
  } catch (err) {
    log.error('clipboard error:', err);
    Notify.notifyMain('renderer.alerts.clipboard_error');
  }
});

// ======================= 'Paste clipboard in new line' button =======================
btnAppendClipboard.addEventListener('click', async () => {
  try {
    const clip = await window.electronAPI.readClipboard() || '';
    const current = await window.electronAPI.getCurrentText() || '';

    let joiner = '';
    if (current) joiner = current.endsWith('\n') || current.endsWith('\r') ? '\n' : '\n\n';

    const projectedLen = current.length + (current ? joiner.length : 0) + clip.length;
    if (projectedLen > maxIpcChars) {
      Notify.notifyMain('renderer.alerts.append_too_large');
      return;
    }

    const available = maxTextChars - current.length;
    if (available <= 0) {
      Notify.notifyMain('renderer.alerts.text_limit');
      return;
    }

    const newFull = current + (current ? joiner : '') + clip;

    // Send object with meta (append_newline)
    const resp = await window.electronAPI.setCurrentText({
      text: newFull,
      meta: { source: 'main-window', action: 'append_newline' }
    });

    if (resp && resp.ok === false) {
      throw new Error(resp.error || 'set-current-text failed');
    }

    updatePreviewAndResults(resp && resp.text ? resp.text : newFull);

    // Notify truncation only if main confirms it
    if (resp && resp.truncated) {
      Notify.notifyMain('renderer.alerts.append_overflow');
    }
  } catch (err) {
    log.error('An error occurred while pasting the clipboard:', err);
    Notify.notifyMain('renderer.alerts.append_error');
  }
});

btnEdit.addEventListener('click', async () => {
  showeditorLoader();
  try {
    await window.electronAPI.openEditor();
  } catch (err) {
    log.error('Error opening editor:', err);
    hideeditorLoader();
  }
});

// ======================= Clear Button (Main Screen) =======================
btnEmptyMain.addEventListener('click', async () => {
  try {
    const resp = await window.electronAPI.setCurrentText({
      text: '',
      meta: { source: 'main-window', action: 'overwrite' }
    });

    updatePreviewAndResults(resp && resp.text ? resp.text : '');
    if (window.electronAPI && typeof window.electronAPI.forceClearEditor === 'function') {
      try { await window.electronAPI.forceClearEditor(); } catch (err) { log.error('Error invoking forceClearEditor:', err); }
    }
  } catch (err) {
    log.error('Error clearing text from main window:', err);
    Notify.notifyMain('renderer.alerts.clear_error');
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
      log.warn('openPresetModal unavailable in electronAPI');
      Notify.notifyMain('renderer.alerts.modal_unavailable');
    }
  } catch (err) {
    log.error('Error opening new preset modal:', err);
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
        Notify.notifyMain('renderer.alerts.edit_none');
        return;
      }
    }

    // Find preset data from cache
    const preset = allPresetsCache.find(p => p.name === selectedName);
    if (!preset) {
      Notify.notifyMain('renderer.alerts.preset_not_found');
      return;
    }

    // Open modal in edit mode. We pass an object with mode and the preset data.
    const payload = { wpm: wpm, mode: 'edit', preset: preset };
    try {
      log.debug('[renderer] openPresetModal payload:', payload);
    } catch (err) {
      warnOnceRenderer('log.debug.openPresetModal', '[renderer] log.debug failed (ignored):', err);
    }
    if (window.electronAPI && typeof window.electronAPI.openPresetModal === 'function') {
      window.electronAPI.openPresetModal(payload);
    } else {
      Notify.notifyMain('renderer.alerts.edit_unavailable');
    }
  } catch (err) {
    log.error('Error opening edit preset modal:', err);
    Notify.notifyMain('renderer.alerts.edit_error');
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
      presetDescription.textContent = '';
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
      log.error('Error deleting preset:', res && res.error ? res.error : res);
      Notify.notifyMain('renderer.alerts.delete_error');
    }
  } catch (err) {
    log.error('Error in deletion request:', err);
    Notify.notifyMain('renderer.alerts.delete_error');
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
      presetDescription.textContent = '';

      return;
    } else {
      if (res && res.code === 'CANCELLED') {
        // User cancelled in native dialog; nothing to do
        return;
      }
      log.error('Error restoring presets:', res && res.error ? res.error : res);
      Notify.notifyMain('renderer.alerts.restore_error');
    }
  } catch (err) {
    log.error('Error in restoring request:', err);
    Notify.notifyMain('renderer.alerts.restore_error');
  }
});

// ======================= STOPWATCH =======================
const cronoDisplay = document.getElementById('cronoDisplay');

// Prevent main broadcasts from overwriting the current edit
if (cronoDisplay) {
  cronoDisplay.addEventListener('focus', () => {
    cronoEditing = true;
  });
  cronoDisplay.addEventListener('blur', () => {
    // The blur event will execute applyManualTime (already registered) which will update the stopwatch in main
    cronoEditing = false;
  });
}

const tToggle = document.getElementById('cronoToggle');
const tReset = document.getElementById('cronoReset');

// Local mirror of the stopwatch state (synchronized from main via onCronoState)
let elapsed = 0;
let running = false;
// Flag to detect transitions and prevent continuous recalculations
let prevRunning = false;
// Indicates if the user is manually editing the crono field (to prevent overwriting)
let cronoEditing = false;
// Baseline elapsed/display captured on focus to avoid losing fractional seconds if unchanged
let cronoBaselineElapsed = null;
let cronoBaselineDisplay = null;
// Last elapsed for which we calculate WPM (avoid repeated recalculations)
let lastComputedElapsedForWpm = null;

function showeditorLoader() {
  if (editorLoader) editorLoader.classList.add('visible');
  if (btnEdit) btnEdit.disabled = true;
}

function hideeditorLoader() {
  if (editorLoader) editorLoader.classList.remove('visible');
  if (btnEdit) btnEdit.disabled = false;
}

const cronoModule = (typeof window !== 'undefined') ? window.RendererCrono : null;

const getCronoLabels = () => ({
  playLabel: tRenderer ? tRenderer('renderer.main.crono.play_symbol', '>') : '>',
  pauseLabel: tRenderer ? tRenderer('renderer.main.crono.pause_symbol', '||') : '||'
});

const uiResetCrono = () => {
  elapsed = 0;
  running = false;
  prevRunning = false;
  const { playLabel } = getCronoLabels();
  cronoModule.uiResetCrono({ cronoDisplay, realWpmDisplay, tToggle, playLabel });
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
const openFlotante = async () => {
  const res = await cronoModule.openFlotante({
    electronAPI: window.electronAPI,
    toggleVF,
    cronoDisplay,
    cronoEditing,
    tToggle,
    ...getCronoLabels(),
    setElapsedRunning: (elapsedVal, runningVal) => {
      elapsed = elapsedVal;
      running = runningVal;
    }
  });
  if (res && typeof res.elapsed === 'number') {
    lastComputedElapsedForWpm = res.elapsed;
    prevRunning = running;
  }
};

const closeFlotante = async () => {
  await cronoModule.closeFlotante({ electronAPI: window.electronAPI, toggleVF });
};

// toggle WF from the UI (switch)
if (toggleVF) {
  toggleVF.addEventListener('change', async () => {
    const wantOpen = !!toggleVF.checked;
    // Optimistic: reflect aria-checked immediately
    toggleVF.setAttribute('aria-checked', wantOpen ? 'true' : 'false');

    if (wantOpen) {
      await openFlotante();
      // openFlotante handles revert in case of error
    } else {
      await closeFlotante();
    }
  });
}

// If the flotante is closed from main (or destroyed), we clean it up
if (window.electronAPI && typeof window.electronAPI.onFlotanteClosed === 'function') {
  window.electronAPI.onFlotanteClosed(() => {
    if (toggleVF) { toggleVF.checked = false; toggleVF.setAttribute('aria-checked', 'false'); }
  });
}

// ======================= Manual stopwatch editing =======================
const applyManualTime = () => {
  cronoModule.applyManualTime({
    value: cronoDisplay.value,
    cronoDisplay,
    electronAPI: window.electronAPI,
    currentText,
    contarTexto,
    obtenerSeparadoresDeNumeros,
    formatearNumero,
    idiomaActual,
    realWpmDisplay,
    ...getCronoLabels(),
    setElapsed: (msVal) => {
      if (typeof msVal === 'number') {
        elapsed = msVal;
      }
      return elapsed;
    },
    setLastComputedElapsed: (msVal) => { lastComputedElapsedForWpm = msVal; },
    running,
    baselineElapsed: cronoBaselineElapsed,
    baselineDisplay: cronoBaselineDisplay
  });
  cronoBaselineElapsed = null;
  cronoBaselineDisplay = null;
};

if (cronoDisplay) {
  cronoDisplay.addEventListener('focus', () => {
    cronoEditing = true;
    cronoBaselineElapsed = elapsed;
    cronoBaselineDisplay = cronoDisplay.value;
  });

  cronoDisplay.addEventListener('blur', () => {
    cronoEditing = false;
    applyManualTime();
  });

  cronoDisplay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      cronoDisplay.blur();
    }
  });
}
