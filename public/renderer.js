// public/renderer.js
/* global Notify */
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Bootstraps the renderer UI and pulls config/settings from main.
// - Applies i18n labels and number formatting.
// - Maintains text preview, counts, and time estimates.
// - Wires presets, clipboard actions, editor, and help tips.
// - Hosts the info modal and top-bar menu actions.
// - Integrates the stopwatch controller and floating window toggle.
// =============================================================================
// Logger and constants
// =============================================================================
const log = window.getLogger('renderer');

log.debug('Renderer main starting...');

const { AppConstants } = window;
if (!AppConstants) {
  throw new Error('[renderer] AppConstants no disponible; verifica la carga de constants.js');
}

const {
  DEFAULT_LANG,
  WPM_MIN,
  WPM_MAX,
  PREVIEW_INLINE_THRESHOLD,
  PREVIEW_START_CHARS,
  PREVIEW_END_CHARS
} = AppConstants;

// =============================================================================
// DOM references
// =============================================================================
const textPreview = document.getElementById('textPreview');
const btnOverwriteClipboard = document.getElementById('btnOverwriteClipboard');
const btnAppendClipboard = document.getElementById('btnAppendClipboard');
const btnEdit = document.getElementById('btnEdit');
const btnEmptyMain = document.getElementById('btnEmptyMain');
const btnHelp = document.getElementById('btnHelp');

// =============================================================================
// UI keys and static lists
// =============================================================================
const HELP_TIP_KEY_LIST = Object.freeze([
  'renderer.main.tips.results_help.tip1',
  'renderer.main.tips.results_help.tip2',
  'renderer.main.tips.results_help.tip3',
  'renderer.main.tips.results_help.tip4'
]);
let lastHelpTipIdx = -1;

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
const startupSplash = document.getElementById('startupSplash');

// Preset DOM references
const presetsSelect = document.getElementById('presets');
const btnNewPreset = document.getElementById('btnNewPreset');
const btnEditPreset = document.getElementById('btnEditPreset');
const btnDeletePreset = document.getElementById('btnDeletePreset');
const btnResetDefaultPresets = document.getElementById('btnResetDefaultPresets');
const presetDescription = document.getElementById('presetDescription');

// =============================================================================
// Startup gating + handshake
// =============================================================================
function isRendererReady() {
  return rendererReadyState === 'READY';
}

function guardUserAction(actionId) {
  if (isRendererReady()) return true;
  log.warnOnce(
    `BOOTSTRAP:renderer.preReady.${actionId}`,
    'Renderer action ignored (pre-READY):',
    actionId
  );
  return false;
}

function sendRendererCoreReady() {
  if (rendererCoreReadySent) return;
  rendererCoreReadySent = true;
  if (window.electronAPI && typeof window.electronAPI.sendStartupRendererCoreReady === 'function') {
    try {
      window.electronAPI.sendStartupRendererCoreReady();
    } catch (err) {
      log.error('Error sending startup:renderer-core-ready:', err);
    }
  } else {
    log.warnOnce(
      'BOOTSTRAP:renderer.startup.coreReady.unavailable',
      'startup:renderer-core-ready unavailable; renderer/core ready signal not sent.'
    );
  }
}

function sendSplashRemoved() {
  if (splashRemovedSent) return;
  splashRemovedSent = true;
  if (window.electronAPI && typeof window.electronAPI.sendStartupSplashRemoved === 'function') {
    try {
      window.electronAPI.sendStartupSplashRemoved();
    } catch (err) {
      log.error('Error sending startup:splash-removed:', err);
    }
  } else {
    log.warnOnce(
      'BOOTSTRAP:renderer.startup.splashRemoved.unavailable',
      'startup:splash-removed unavailable; post-READY confirmation not sent.'
    );
  }
}

function maybeUnblockReady() {
  if (!rendererInvariantsReady || !startupReadyReceived) return;
  if (rendererReadyState === 'READY') return;
  rendererReadyState = 'READY';

  if (startupSplash && typeof startupSplash.remove === 'function') {
    startupSplash.remove();
  } else {
    log.warnOnce(
      'BOOTSTRAP:renderer.startup.splash.missing',
      'Startup splash element missing; proceeding to READY.'
    );
  }

  sendSplashRemoved();
}

function markRendererInvariantsReady() {
  if (rendererInvariantsReady) return;
  if (!ipcSubscriptionsArmed || !uiListenersArmed) {
    log.warnOnce(
      'BOOTSTRAP:renderer.startup.invariants.incomplete',
      'Renderer invariants marked ready before all listeners/subscriptions were armed.',
      { ipcSubscriptionsArmed, uiListenersArmed }
    );
  }
  rendererInvariantsReady = true;
  sendRendererCoreReady();
  maybeUnblockReady();
}


// =============================================================================
// Shared state and limits
// =============================================================================
let currentText = '';
// Local limit in renderer to prevent concatenations that create excessively large strings
let maxTextChars = AppConstants.MAX_TEXT_CHARS; // Default value until main responds
let maxIpcChars = AppConstants.MAX_TEXT_CHARS * 4; // Fallback until main responds
// Global cache and state for count/language
let modoConteo = 'preciso';   // Precise by default; can be `simple`
let idiomaActual = DEFAULT_LANG; // Initializes on startup
let settingsCache = null;     // Settings cache (number formatting, language, etc.)
let cronoController = null;
let rendererReadyState = 'PRE_READY';
let rendererInvariantsReady = false;
let startupReadyReceived = false;
let rendererCoreReadySent = false;
let splashRemovedSent = false;
let ipcSubscriptionsArmed = false;
let uiListenersArmed = false;
let syncToggleFromSettings = null;

// =============================================================================
// i18n wiring
// =============================================================================
const { loadRendererTranslations, tRenderer, msgRenderer } = window.RendererI18n || {};
if (!loadRendererTranslations || !tRenderer || !msgRenderer) {
  throw new Error('[renderer] RendererI18n no disponible; no se puede continuar');
}

const getCronoLabels = () => ({
  playLabel: tRenderer ? tRenderer('renderer.main.crono.play_symbol', '>') : '>',
  pauseLabel: tRenderer ? tRenderer('renderer.main.crono.pause_symbol', '||') : '||'
});

function applyTranslations() {
  if (!tRenderer) return;
  // Text selector buttons
  if (btnOverwriteClipboard) btnOverwriteClipboard.textContent = tRenderer('renderer.main.buttons.overwrite_clipboard', btnOverwriteClipboard.textContent || '');
  if (btnAppendClipboard) btnAppendClipboard.textContent = tRenderer('renderer.main.buttons.append_clipboard', btnAppendClipboard.textContent || '');
  if (btnEdit) btnEdit.textContent = tRenderer('renderer.main.buttons.edit', btnEdit.textContent || '');
  if (btnEmptyMain) btnEmptyMain.textContent = tRenderer('renderer.main.buttons.clear', btnEmptyMain.textContent || '');
  // Text selector tooltips
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
  // Floating window toggle
  const vfSwitchLabel = document.querySelector('.vf-switch-wrapper label.switch');
  if (vfSwitchLabel) vfSwitchLabel.title = tRenderer('renderer.main.tooltips.flotante_window', vfSwitchLabel.title || '');
  // Section titles
  if (selectorTitle) selectorTitle.textContent = tRenderer('renderer.main.selector_title', selectorTitle.textContent || '');
  if (velTitle) velTitle.textContent = tRenderer('renderer.main.speed.title', velTitle.textContent || '');
  if (resultsTitle) resultsTitle.textContent = tRenderer('renderer.main.results.title', resultsTitle.textContent || '');
  if (cronTitle) cronTitle.textContent = tRenderer('renderer.main.crono.title', cronTitle.textContent || '');
  // Speed selector labels
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
  // Stopwatch: speed label and controls aria-label
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
  if (cronoController && typeof cronoController.updateLabels === 'function') {
    cronoController.updateLabels(labelsCrono);
  }
  // Abbreviated label for the floating window
  const vfLabel = document.querySelector('.vf-label');
  if (vfLabel) {
    vfLabel.textContent = tRenderer('renderer.main.crono.flotante_short', vfLabel.textContent || vfLabel.textContent);
  }

  // Help button title
  if (btnHelp) {
    const helpTitle = tRenderer('renderer.main.tooltips.help_button', btnHelp.getAttribute('title') || '');
    if (helpTitle) btnHelp.setAttribute('title', helpTitle);
  }
}

let wpm = Number(wpmSlider.value);
let currentPresetName = null;

// Local preset cache (full list loaded once)
let allPresetsCache = [];

// =============================================================================
// Presets integration
// =============================================================================
const { applyPresetSelection, loadPresetsIntoDom, resolvePresetSelection } = window.RendererPresets || {};
if (!applyPresetSelection || !loadPresetsIntoDom || !resolvePresetSelection) {
  log.error('[renderer] RendererPresets not available');
}

// =============================================================================
// Text counting
// =============================================================================
const { contarTexto: contarTextoModulo } = window.CountUtils || {};
if (typeof contarTextoModulo !== 'function') {
  throw new Error('[renderer] CountUtils no disponible; no se puede continuar');
}

function contarTexto(texto) {
  return contarTextoModulo(texto, { modoConteo, idioma: idiomaActual });
}

function normalizeText(value) {
  if (typeof value === 'string') return value;
  if (value === null || typeof value === 'undefined') return '';
  return String(value);
}

// Update mode/language from other parts (e.g., menu actions)
function setModoConteo(nuevoModo) {
  if (nuevoModo === 'simple' || nuevoModo === 'preciso') {
    modoConteo = nuevoModo;
  }
}

// =============================================================================
// Time formatting
// =============================================================================
const { getTimeParts, obtenerSeparadoresDeNumeros, formatearNumero } = window.FormatUtils || {};
if (!getTimeParts || !obtenerSeparadoresDeNumeros || !formatearNumero) {
  log.error('[renderer] FormatUtils not available');
}

// =============================================================================
// Preview and results
// =============================================================================
let currentTextStats = null;

async function updatePreviewAndResults(text) {
  const normalizedText = normalizeText(text);
  const displayText = normalizedText.replace(/\r?\n/g, '   ');
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

  const stats = contarTexto(normalizedText);
  currentTextStats = stats;
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
}

function updateTimeOnlyFromStats() {
  if (!currentTextStats) {
    log.warnOnce(
      'renderer.timeOnly.noStats',
      'WPM-only update requested without text stats; time not updated.'
    );
    return;
  }
  const { hours, minutes, seconds } = getTimeParts(currentTextStats.palabras, wpm);
  resTime.textContent = msgRenderer('renderer.main.results.time', { h: hours, m: minutes, s: seconds });
}

function installCurrentTextState(text) {
  const nextText = normalizeText(text);
  currentText = nextText;
  return nextText;
}

function setCurrentTextAndUpdateUI(text, options = {}) {
  const previousText = currentText;
  const nextText = normalizeText(text);
  currentText = nextText;
  updatePreviewAndResults(nextText);
  if (options.applyRules) {
    if (cronoController && typeof cronoController.handleTextChange === 'function') {
      cronoController.handleTextChange(previousText, nextText);
    }
  }
}

// Listen for stopwatch status from main (authoritative state)
if (window.electronAPI && typeof window.electronAPI.onCronoState === 'function') {
  window.electronAPI.onCronoState((state) => {
    try {
      if (cronoController && typeof cronoController.handleState === 'function') {
        cronoController.handleState(state);
      }
    } catch (err) {
      log.error('Error handling crono-state in renderer:', err);
    }
  });
} else if (window.electronAPI) {
  log.warnOnce(
    'renderer.ipc.onCronoState.unavailable',
    'onCronoState unavailable; crono state will not sync.'
  );
}

// =============================================================================
// Preset loading (merge + shadowing)
// =============================================================================
function resolveSettingsSnapshot(settingsSnapshot) {
  return (settingsSnapshot && typeof settingsSnapshot === 'object')
    ? settingsSnapshot
    : (settingsCache || {});
}

function resetPresetsState() {
  if (presetsSelect) presetsSelect.innerHTML = '';
  if (presetDescription) presetDescription.textContent = '';
  allPresetsCache = [];
  currentPresetName = null;
  return allPresetsCache;
}

const reloadPresetsList = async ({ settingsSnapshot } = {}) => {
  try {
    const snapshot = resolveSettingsSnapshot(settingsSnapshot);
    const res = await loadPresetsIntoDom({
      electronAPI: window.electronAPI,
      settings: snapshot,
      language: idiomaActual,
      selectEl: presetsSelect
    });
    allPresetsCache = res && res.list ? res.list.slice() : [];
    return allPresetsCache;
  } catch (err) {
    log.error('Error loading presets:', err);
    return resetPresetsState();
  }
};

const loadPresets = async ({ settingsSnapshot } = {}) => {
  try {
    const snapshot = resolveSettingsSnapshot(settingsSnapshot);
    await reloadPresetsList({ settingsSnapshot: snapshot });
    const selected = await resolvePresetSelection({
      list: allPresetsCache,
      settings: snapshot,
      language: idiomaActual,
      currentPresetName,
      selectEl: presetsSelect,
      wpmInput,
      wpmSlider,
      presetDescription,
      electronAPI: window.electronAPI
    });
    if (selected) {
      currentPresetName = selected.name;
      wpm = selected.wpm;
    } else {
      currentPresetName = null;
    }
    return allPresetsCache;
  } catch (err) {
    log.error('Error loading presets:', err);
    return resetPresetsState();
  }
};

// =============================================================================
// Bootstrapping and subscriptions
// =============================================================================
const settingsChangeHandler = async (newSettings) => {
  try {
    settingsCache = newSettings || {};
    const nuevoIdioma = settingsCache.language || DEFAULT_LANG;
    const idiomaCambio = (nuevoIdioma !== idiomaActual);
    if (idiomaCambio) {
      idiomaActual = nuevoIdioma;
      try {
        await loadRendererTranslations(idiomaActual);
      } catch (err) {
        log.warnOnce(
          'renderer.loadRendererTranslations',
          `[renderer] loadRendererTranslations(${idiomaActual}) failed (ignored):`,
          err
        );
      }
      applyTranslations();
      try {
        await loadPresets({ settingsSnapshot: settingsCache });
      } catch (err) {
        log.error('Error loading presets after language change:', err);
      }
    }
    if (settingsCache.modeConteo && settingsCache.modeConteo !== modoConteo) {
      modoConteo = settingsCache.modeConteo;
      if (typeof syncToggleFromSettings === 'function') {
        syncToggleFromSettings(settingsCache || {});
      } else if (toggleModoPreciso) {
        toggleModoPreciso.checked = (modoConteo === 'preciso');
      }
    }
    if (isRendererReady()) {
      updatePreviewAndResults(currentText);
    }
  } catch (err) {
    log.error('Error handling settings change:', err);
  }
};

function armIpcSubscriptions() {
  // Subscribe to updates from main (current text changes)
  if (window.electronAPI && typeof window.electronAPI.onCurrentTextUpdated === 'function') {
    window.electronAPI.onCurrentTextUpdated((text) => {
      try {
        if (!isRendererReady()) {
          installCurrentTextState(text || '');
          log.warnOnce(
            'BOOTSTRAP:renderer.preReady.currentTextUpdated',
            'current-text-updated received pre-READY; state updated only.'
          );
          return;
        }
        setCurrentTextAndUpdateUI(text || '', { applyRules: true });
      } catch (err) {
        log.error('Error handling current-text-updated:', err);
      }
    });
  } else if (window.electronAPI) {
    log.warnOnce(
      'renderer.ipc.onCurrentTextUpdated.unavailable',
      'onCurrentTextUpdated unavailable; current text updates will not sync.'
    );
  }

  // Subscribe to preset create/update notifications from main
  if (window.electronAPI && typeof window.electronAPI.onPresetCreated === 'function') {
    window.electronAPI.onPresetCreated(async (preset) => {
      if (!isRendererReady()) {
        log.warnOnce(
          'BOOTSTRAP:renderer.preReady.presetCreated',
          'preset-created received pre-READY; ignored.'
        );
        return;
      }
      try {
        // Reload presets from settings (applies shadowing) and select the created one
        const updated = await reloadPresetsList({ settingsSnapshot: settingsCache });
        if (preset && preset.name) {
          const found = updated.find(p => p.name === preset.name);
          if (found) {
            const neutralSettings = Object.assign({}, settingsCache || {}, {
              selected_preset_by_language: {}
            });
            const selected = await resolvePresetSelection({
              list: updated,
              settings: neutralSettings,
              language: idiomaActual,
              currentPresetName: preset.name,
              selectEl: presetsSelect,
              wpmInput,
              wpmSlider,
              presetDescription,
              electronAPI: window.electronAPI
            });
            if (selected) {
              currentPresetName = selected.name;
              wpm = selected.wpm;
              updatePreviewAndResults(currentText);
            }
          }
        }
      } catch (err) {
        log.error('Error handling preset-created event:', err);
      }
    });
  } else if (window.electronAPI) {
    log.warnOnce(
      'renderer.ipc.onPresetCreated.unavailable',
      'onPresetCreated unavailable; preset updates will not sync.'
    );
  }

  if (window.electronAPI) {
    if (typeof window.electronAPI.onStartupReady === 'function') {
      window.electronAPI.onStartupReady(() => {
        if (startupReadyReceived) {
          log.warnOnce(
            'renderer.startup.ready.duplicate',
            'startup:ready received more than once (ignored).'
          );
          return;
        }
        startupReadyReceived = true;
        maybeUnblockReady();
      });
    } else {
      log.errorOnce(
        'renderer.startup.ready.unavailable',
        'startup:ready listener unavailable; renderer may remain pre-READY.'
      );
    }

    if (typeof window.electronAPI.onSettingsChanged === 'function') {
      window.electronAPI.onSettingsChanged(settingsChangeHandler);
    } else {
      log.warnOnce(
        'renderer.ipc.onSettingsChanged.unavailable',
        'onSettingsChanged unavailable; settings updates will not sync.'
      );
    }

    if (typeof window.electronAPI.onEditorReady === 'function') {
      window.electronAPI.onEditorReady(() => {
        if (!isRendererReady()) {
          log.warnOnce(
            'BOOTSTRAP:renderer.preReady.editorReady',
            'editor-ready received pre-READY; ignored.'
          );
          return;
        }
        hideeditorLoader();
      });
    } else {
      log.warnOnce(
        'renderer.ipc.onEditorReady.unavailable',
        'onEditorReady unavailable; editor loader may not clear.'
      );
    }
  } else {
    log.warnOnce(
      'renderer.ipc.electronAPI.unavailable',
      'electronAPI unavailable; IPC subscriptions not armed.'
    );
  }

  ipcSubscriptionsArmed = true;
}

function setupToggleModoPreciso() {
  try {
    if (!toggleModoPreciso) return;

    // Ensure initial switch state according to the in-memory mode
    toggleModoPreciso.checked = (modoConteo === 'preciso');

    // When the user changes the switch:
    toggleModoPreciso.addEventListener('change', async () => {
      if (!guardUserAction('toggle-modo-preciso')) {
        toggleModoPreciso.checked = (modoConteo === 'preciso');
        return;
      }
      try {
        const nuevoModo = toggleModoPreciso.checked ? 'preciso' : 'simple';

        // Update state in memory (immediately)
        setModoConteo(nuevoModo);

        toggleModoPreciso.setAttribute('aria-checked', toggleModoPreciso.checked ? 'true' : 'false');

        // Immediate recount of the current text
        updatePreviewAndResults(currentText);

        // Attempt to persist settings via IPC (if preload/main implemented setModeConteo)
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

    // If settings change from main, keep the toggle in sync.
    // This complements settingsChangeHandler for local safety.
    syncToggleFromSettings = (s) => {
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
      log.warnOnce('BOOTSTRAP:renderer.syncToggleFromSettings', '[renderer] syncToggleFromSettings failed (ignored):', err);
    }
  } catch (err) {
    log.error('Error initialazing toggleModoPreciso:', err);
  }
}

async function runStartupOrchestrator() {
  try {
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
      log.warn('BOOTSTRAP: getAppConfig failed; using defaults:', err);
    }

    let settingsSnapshot = {};
    // Load user settings once at renderer startup
    try {
      const settings = await window.electronAPI.getSettings();
      settingsCache = settings || {};
      settingsSnapshot = settingsCache;
      idiomaActual = settingsCache.language || DEFAULT_LANG;
      if (settingsCache.modeConteo) modoConteo = settingsCache.modeConteo;
    } catch (err) {
      log.warn('BOOTSTRAP: getSettings failed; using defaults:', err);
      settingsCache = {};
      settingsSnapshot = settingsCache;
    }

    // Load and apply renderer translations
    try {
      await loadRendererTranslations(idiomaActual);
    } catch (err) {
      log.warn('BOOTSTRAP: initial translations failed; using defaults:', err);
    }
    try {
      applyTranslations();
    } catch (err) {
      log.warn('BOOTSTRAP: applyTranslations failed (ignored):', err);
    }

    // Get current initial text (state-only)
    try {
      const t = await window.electronAPI.getCurrentText();
      installCurrentTextState(t || '');
    } catch (err) {
      log.error('Error loading initial current text:', err);
      installCurrentTextState('');
    }

    // Load presets and save them to the cache
    await loadPresets({ settingsSnapshot });

    if (typeof syncToggleFromSettings === 'function') {
      try {
        syncToggleFromSettings(settingsSnapshot || {});
      } catch (err) {
        log.warnOnce('BOOTSTRAP:renderer.syncToggleFromSettings', '[renderer] syncToggleFromSettings failed (ignored):', err);
      }
    }

    markRendererInvariantsReady();

    // Final update after presets load in case WPM changed
    updatePreviewAndResults(currentText).catch((err) => {
      log.error('Error in startup preview/results kickoff:', err);
    });
  } catch (err) {
    log.error('Error initialazing renderer:', err);
  }
}

armIpcSubscriptions();
setupToggleModoPreciso();

// =============================================================================
// Info modal
// =============================================================================
  const infoModal = document.getElementById('infoModal');
  const infoModalBackdrop = document.getElementById('infoModalBackdrop');
  const infoModalClose = document.getElementById('infoModalClose');
  const infoModalTitle = document.getElementById('infoModalTitle');
  const infoModalContent = document.getElementById('infoModalContent');
  const { bindInfoModalLinks } = window.InfoModalLinks || {};

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
      log.warnOnce('renderer:fetchText:failed', 'fetchText failed; info modal will fallback:', path, err);
      return null;
    }
  }

  async function fetchTextWithFallback(paths) {
    for (const path of paths) {
      const html = await fetchText(path);
      if (html !== null) return { html, path };
    }
    return { html: null, path: null };
  }

  // Translate HTML fragments using data-i18n and renderer.info.<key>.*
  function translateInfoHtml(htmlString, key) {
    // If no translation function is available, return the HTML unchanged.
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

  function extractInfoBodyHtml(htmlString) {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlString, 'text/html');
      return doc.body.innerHTML;
    } catch (err) {
      log.warn('extractInfoBodyHtml failed:', err);
      return htmlString;
    }
  }

  async function hydrateAboutVersion(container) {
    const versionEl = container ? container.querySelector('#appVersion') : null;
    if (!versionEl) return;

    if (!window.electronAPI || typeof window.electronAPI.getAppVersion !== 'function') {
      log.warnOnce('renderer.info.acerca_de.version.unavailable', 'getAppVersion not available for About modal.');
      versionEl.textContent = 'N/A';
      return;
    }

    try {
      const version = await window.electronAPI.getAppVersion();
      const cleaned = typeof version === 'string' ? version.trim() : '';
      if (!cleaned) {
        log.warnOnce(
          'renderer.info.acerca_de.version.empty',
          'getAppVersion returned empty; About modal shows N/A.'
        );
        versionEl.textContent = 'N/A';
        return;
      }
      versionEl.textContent = cleaned;
    } catch (err) {
      log.warn('getAppVersion failed; About modal shows N/A:', err);
      versionEl.textContent = 'N/A';
    }
  }

  async function hydrateAboutEnvironment(container) {
    const envEl = container ? container.querySelector('#appEnv') : null;
    if (!envEl) return;

    if (!window.electronAPI || typeof window.electronAPI.getAppRuntimeInfo !== 'function') {
      log.warnOnce('renderer.info.acerca_de.env.unavailable', 'getAppRuntimeInfo not available for About modal.');
      envEl.textContent = 'N/A';
      return;
    }

    try {
      const info = await window.electronAPI.getAppRuntimeInfo();
      const platform = info && typeof info.platform === 'string' ? info.platform.trim() : '';
      const arch = info && typeof info.arch === 'string' ? info.arch.trim() : '';
      const platformMap = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };
      const osLabel = platformMap[platform] || platform;

      if (!osLabel || !arch) {
        log.warnOnce(
          'renderer.info.acerca_de.env.missing_fields',
          'getAppRuntimeInfo missing platform/arch; About modal shows N/A.'
        );
        envEl.textContent = 'N/A';
        return;
      }

      envEl.textContent = `${osLabel} (${arch})`;
    } catch (err) {
      log.warn('getAppRuntimeInfo failed; About modal shows N/A:', err);
      envEl.textContent = 'N/A';
    }
  }

  const normalizeLangTagSafe = (lang) => {
    if (window.RendererI18n && typeof window.RendererI18n.normalizeLangTag === 'function') {
      return window.RendererI18n.normalizeLangTag(lang);
    }
    return String(lang || '').trim().toLowerCase().replace(/_/g, '-');
  };

  const getLangBaseSafe = (lang) => {
    if (window.RendererI18n && typeof window.RendererI18n.getLangBase === 'function') {
      return window.RendererI18n.getLangBase(lang);
    }
    const normalized = normalizeLangTagSafe(lang);
    if (!normalized) return '';
    const idx = normalized.indexOf('-');
    return idx > 0 ? normalized.slice(0, idx) : normalized;
  };

  function getManualFileCandidates(langTag) {
    const candidates = [];
    const normalized = normalizeLangTagSafe(langTag);
    const base = getLangBaseSafe(normalized);
    if (normalized) candidates.push(normalized);
    if (base && base !== normalized) candidates.push(base);
    const defaultLang = normalizeLangTagSafe(DEFAULT_LANG);
    if (defaultLang && !candidates.includes(defaultLang)) candidates.push(defaultLang);
    return candidates.map(tag => `./info/instrucciones.${tag}.html`);
  }

  async function showInfoModal(key, opts = {}) {
    // key: 'instrucciones' | 'guia_basica' | 'faq' | 'acerca_de'
    const sectionTitles = {
      instrucciones: 'Instrucciones completas',
      guia_basica: 'Guia basica',
      faq: 'Preguntas frecuentes (FAQ)',
      acerca_de: 'Acerca de'
    };

    if (!infoModal || !infoModalTitle || !infoModalContent) return;

    // Decide which file to load based on the key.
    // Basic guide, instructions, and FAQ are served from localized manual HTML.
    let fileToLoad = null;
    let sectionId = null;
    const isManual = (key === 'guia_basica' || key === 'instrucciones' || key === 'faq');

    if (key === 'acerca_de') {
      fileToLoad = './info/acerca_de.html';
    } else if (isManual) {
      const langTag = (settingsCache && settingsCache.language) ? settingsCache.language : (idiomaActual || DEFAULT_LANG);
      fileToLoad = getManualFileCandidates(langTag);
      // Map key to block ID within instructions.html
      const mapping = { guia_basica: 'guia-basica', instrucciones: 'instrucciones', faq: 'faq' };
      sectionId = mapping[key] || 'instrucciones';
    } else {
      // Compatibility fallback for legacy standalone pages
      fileToLoad = `./info/${key}.html`;
    }

    const translationKey = (key === 'guia_basica' || key === 'faq') ? 'instrucciones' : key;
    // Manual uses a fixed title; other pages use i18n when available.
    if (isManual) {
      infoModalTitle.textContent = 'Manual de uso';
    } else {
      const defaultTitle = sectionTitles[key] || (opts.title || 'Información');
      infoModalTitle.textContent = tRenderer ? tRenderer(`renderer.info.${translationKey}.title`, defaultTitle) : defaultTitle;
    }

    // Open modal early so loading state is visible during fetch
    infoModal.setAttribute('aria-hidden', 'false');

    // Fetch HTML (manual pages use a language fallback list)
    const tryHtml = Array.isArray(fileToLoad)
      ? (await fetchTextWithFallback(fileToLoad)).html
      : await fetchText(fileToLoad);
    if (tryHtml === null) {
      // Fallback: show a simple missing-content message
      infoModalContent.innerHTML =
        `<p>No hay contenido disponible para '${infoModalTitle.textContent}'.</p>`;
      if (infoModalContent && typeof infoModalContent.focus === 'function') infoModalContent.focus();
      return;
    }

    // Translate non-manual pages; manual HTML is loaded as-is.
    const renderedHtml = isManual
      ? extractInfoBodyHtml(tryHtml)
      : translateInfoHtml(tryHtml, translationKey);
    infoModalContent.innerHTML = renderedHtml;
    if (typeof bindInfoModalLinks === 'function') {
      bindInfoModalLinks(infoModalContent, { electronAPI: window.electronAPI });
    }
    if (key === 'acerca_de') {
      await hydrateAboutVersion(infoModalContent);
      await hydrateAboutEnvironment(infoModalContent);
    }

    // Ensure the panel starts at the top before scrolling
    const panel = document.querySelector('.info-modal-panel');
    if (panel) panel.scrollTop = 0;

    // If a specific section was requested, scroll so it appears above the panel
    if (sectionId) {
      // Wait for the next frame so the parsed DOM is laid out
      requestAnimationFrame(() => {
        try {
          const target = infoModalContent.querySelector(`#${sectionId}`);
          if (!target) {
            // If the ID does not exist, do nothing else
            if (infoModalContent && typeof infoModalContent.focus === 'function') infoModalContent.focus();
            return;
          }

          try {
            target.scrollIntoView({ behavior: 'auto', block: 'start' });
          } catch {
            // Defensive fallback: calculate relative top without compensating for header
            const panelRect = panel.getBoundingClientRect();
            const targetRect = target.getBoundingClientRect();
            const desired = (targetRect.top - panelRect.top) + panel.scrollTop;
            const finalTop = Math.max(0, Math.min(desired, panel.scrollHeight - panel.clientHeight));
            panel.scrollTo({ top: finalTop, behavior: 'auto' });
          }

          // Focus on the content so the reader can use the keyboard
          if (infoModalContent && typeof infoModalContent.focus === 'function') infoModalContent.focus();
        } catch (err) {
          log.error('Error moving modal to section:', err);
          if (infoModalContent && typeof infoModalContent.focus === 'function') infoModalContent.focus();
        }
      });
    } else {
      // No section: focus the content for the whole document
      if (infoModalContent && typeof infoModalContent.focus === 'function') infoModalContent.focus();
    }
  }

  // =============================================================================
  // Top bar menu actions
  // =============================================================================
  // menu_actions.js must be loaded before renderer.js
  if (window.menuActions && typeof window.menuActions.registerMenuAction === 'function') {
    const registerMenuActionGuarded = (actionId, handler) => {
      window.menuActions.registerMenuAction(actionId, () => {
        if (!guardUserAction(`menu.${actionId}`)) return;
        handler();
      });
    };

    registerMenuActionGuarded('guia_basica', () => { showInfoModal('guia_basica') });
    registerMenuActionGuarded('instrucciones_completas', () => { showInfoModal('instrucciones') });
    registerMenuActionGuarded('faq', () => { showInfoModal('faq') });
    registerMenuActionGuarded('cargador_texto', () => {
      Notify.notifyMain('renderer.alerts.wip_cargador_texto'); // WIP
    });
    registerMenuActionGuarded('cargador_imagen', () => {
      Notify.notifyMain('renderer.alerts.wip_cargador_imagen'); // WIP
    });
    registerMenuActionGuarded('test_velocidad', () => {
      Notify.notifyMain('renderer.alerts.wip_test_velocidad'); // WIP
    });
    registerMenuActionGuarded('diseno_skins', () => {
      Notify.notifyMain('renderer.alerts.wip_diseno_skins'); // WIP
    });
    registerMenuActionGuarded('diseno_crono_flotante', () => {
      Notify.notifyMain('renderer.alerts.wip_diseno_crono'); // WIP
    });
    registerMenuActionGuarded('diseno_fuentes', () => {
      Notify.notifyMain('renderer.alerts.wip_diseno_fuentes'); // WIP
    });
    registerMenuActionGuarded('diseno_colores', () => {
      Notify.notifyMain('renderer.alerts.wip_diseno_colores'); // WIP
    });
    registerMenuActionGuarded('shortcuts', () => {
      Notify.notifyMain('renderer.alerts.wip_shortcuts'); // WIP
    });
    registerMenuActionGuarded('presets_por_defecto', async () => {
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

    registerMenuActionGuarded('avisos', () => {
      Notify.notifyMain('renderer.alerts.wip_avisos'); // WIP
    });
    registerMenuActionGuarded('discord', () => {
      Notify.notifyMain('renderer.alerts.wip_discord'); // WIP
    });

    registerMenuActionGuarded('links_interes', () => { showInfoModal('links_interes') });

    registerMenuActionGuarded('colabora', () => {
      Notify.notifyMain('renderer.alerts.wip_colabora'); // WIP
    });

    registerMenuActionGuarded('actualizar_version', async () => {
      try {
        await window.electronAPI.checkForUpdates(true);
      } catch (err) {
        log.error('Error requesting checkForUpdates:', err);
      }
    });

    registerMenuActionGuarded('acerca_de', () => { showInfoModal('acerca_de') });

  } else {
    log.warn('menuActions unavailable - the top bar will not be handled by the renderer.');
  }
// =============================================================================
// Preset selection (cache-only)
// =============================================================================
presetsSelect.addEventListener('change', async () => {
  if (!guardUserAction('preset-change')) return;
  const name = presetsSelect.value;
  if (!name) return;

  const preset = allPresetsCache.find(p => p.name === name);
  if (preset) {
    const settingsOverride = Object.assign({}, settingsCache || {}, {
      selected_preset_by_language: {}
    });
    try {
      const selected = await resolvePresetSelection({
        list: allPresetsCache,
        settings: settingsOverride,
        language: idiomaActual,
        currentPresetName: preset.name,
        selectEl: presetsSelect,
        wpmInput,
        wpmSlider,
        presetDescription,
        electronAPI: window.electronAPI
      });
      if (selected) {
        currentPresetName = selected.name;
        wpm = selected.wpm;
        updateTimeOnlyFromStats();
      }
    } catch (err) {
      log.error('Error resolving preset selection:', err);
    }
  }
});

// =============================================================================
// Manual WPM edits
// =============================================================================
function resetPresetSelection() {
  currentPresetName = null;
  // Leave the select without a visual selection
  presetsSelect.selectedIndex = -1;
  presetDescription.textContent = '';
}

// Keep slider/input in sync and invalidate preset selection
wpmSlider.addEventListener('input', () => {
  if (!guardUserAction('wpm-slider')) return;
  wpm = Number(wpmSlider.value);
  wpmInput.value = wpm;
  resetPresetSelection();
  updateTimeOnlyFromStats();
});

wpmInput.addEventListener('blur', () => {
  if (!guardUserAction('wpm-input-blur')) return;
  let val = Number(wpmInput.value);
  if (isNaN(val)) val = Number(wpmSlider.value) || WPM_MIN;
  val = Math.min(Math.max(val, WPM_MIN), WPM_MAX);
  wpm = val;
  wpmInput.value = wpm;
  wpmSlider.value = wpm;
  resetPresetSelection();
  updateTimeOnlyFromStats();
});

wpmInput.addEventListener('keydown', (e) => {
  if (!guardUserAction('wpm-input-keydown')) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    wpmInput.blur();
  }
});

// =============================================================================
// Clipboard helpers (shared by overwrite/append)
// =============================================================================
async function readClipboardText({ tooLargeKey }) {
  const res = await window.electronAPI.readClipboard();
  if (res && res.ok === false) {
    if (res.tooLarge === true) {
      Notify.notifyMain(tooLargeKey);
      return { ok: false, tooLarge: true };
    }
    throw new Error(res.error || 'clipboard read failed');
  }
  const text = (res && typeof res === 'object') ? (res.text || '') : (res || '');
  return { ok: true, text };
}

// =============================================================================
// Overwrite current text with clipboard content
// =============================================================================
btnOverwriteClipboard.addEventListener('click', async () => {
  if (!guardUserAction('clipboard-overwrite')) return;
  try {
    const read = await readClipboardText({ tooLargeKey: 'renderer.alerts.clipboard_too_large' });
    if (!read.ok) return;
    const clip = read.text;

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

    setCurrentTextAndUpdateUI(resp && resp.text ? resp.text : clip, { applyRules: true });
    if (resp && resp.truncated) {
      Notify.notifyMain('renderer.alerts.clipboard_overflow');
    }
  } catch (err) {
    log.error('clipboard error:', err);
    Notify.notifyMain('renderer.alerts.clipboard_error');
  }
});

// =============================================================================
// Append clipboard content to current text
// =============================================================================
btnAppendClipboard.addEventListener('click', async () => {
  if (!guardUserAction('clipboard-append')) return;
  try {
    const read = await readClipboardText({ tooLargeKey: 'renderer.alerts.append_too_large' });
    if (!read.ok) return;
    const clip = read.text;
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

    setCurrentTextAndUpdateUI(resp && resp.text ? resp.text : newFull, { applyRules: true });

    // Notify truncation only if main confirms it
    if (resp && resp.truncated) {
      Notify.notifyMain('renderer.alerts.append_overflow');
    }
  } catch (err) {
    log.error('An error occurred while pasting the clipboard:', err);
    Notify.notifyMain('renderer.alerts.append_error');
  }
});

function showeditorLoader() {
  if (editorLoader) editorLoader.classList.add('visible');
  if (btnEdit) btnEdit.disabled = true;
}

function hideeditorLoader() {
  if (editorLoader) editorLoader.classList.remove('visible');
  if (btnEdit) btnEdit.disabled = false;
}

btnEdit.addEventListener('click', async () => {
  if (!guardUserAction('open-editor')) return;
  showeditorLoader();
  try {
    await window.electronAPI.openEditor();
  } catch (err) {
    log.error('Error opening editor:', err);
    hideeditorLoader();
  }
});

// =============================================================================
// Clear current text
// =============================================================================
btnEmptyMain.addEventListener('click', async () => {
  if (!guardUserAction('clear-text')) return;
  try {
    const resp = await window.electronAPI.setCurrentText({
      text: '',
      meta: { source: 'main-window', action: 'overwrite' }
    });

    setCurrentTextAndUpdateUI(resp && resp.text ? resp.text : '', { applyRules: true });
    if (window.electronAPI && typeof window.electronAPI.forceClearEditor === 'function') {
      try { await window.electronAPI.forceClearEditor(); } catch (err) { log.error('Error invoking forceClearEditor:', err); }
    }
  } catch (err) {
    log.error('Error clearing text from main window:', err);
    Notify.notifyMain('renderer.alerts.clear_error');
  }
});

// Help button: show a random tip key via Notify
if (btnHelp) {
  btnHelp.addEventListener('click', () => {
    if (!guardUserAction('help-tip')) return;
    const tipCount = HELP_TIP_KEY_LIST.length;
    if (!tipCount) {
      log.error('Help tip list is empty.');
      if (typeof Notify?.notifyMain === 'function') {
        Notify.notifyMain('renderer.main.tips.results_help.tip1');
      }
      return;
    }

    let idx = Math.floor(Math.random() * tipCount);
    if (tipCount > 1 && idx === lastHelpTipIdx) {
      idx = Math.floor(Math.random() * (tipCount - 1));
      if (idx >= lastHelpTipIdx) idx += 1;
    }
    lastHelpTipIdx = idx;

    const tipKey = HELP_TIP_KEY_LIST[idx];

    try {
      if (typeof Notify?.toastMain === 'function') {
        Notify.toastMain(tipKey);
      } else if (typeof Notify?.notifyMain === 'function') {
        Notify.notifyMain(tipKey);
      } else {
        log.error('Notify API unavailable for help tips.');
      }
    } catch (err) {
      log.error('Error showing help tip:', err);
      try {
        if (typeof Notify?.notifyMain === 'function') {
          Notify.notifyMain(tipKey);
        } else {
          log.error('Notify notifyMain unavailable for help tip fallback.');
        }
      } catch (fallbackErr) {
        log.error('Help tip fallback failed:', fallbackErr);
      }
    }
  });
}

// Create preset: main owns the modal; renderer provides current WPM
btnNewPreset.addEventListener('click', () => {
  if (!guardUserAction('preset-new')) return;
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

// =============================================================================
// Edit preset
// =============================================================================
btnEditPreset.addEventListener('click', async () => {
  if (!guardUserAction('preset-edit')) return;
  try {
    const selectedName = presetsSelect.value;
    if (!selectedName) {
      // Ask main to show the native info dialog when no preset is selected.
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

    // Open modal in edit mode and pass preset data.
    const payload = { wpm: wpm, mode: 'edit', preset: preset };
    try {
      log.debug('[renderer] openPresetModal payload:', payload);
    } catch (err) {
      log.warnOnce('log.debug.openPresetModal', '[renderer] log.debug failed (ignored):', err);
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

// =============================================================================
// Delete preset
// =============================================================================
btnDeletePreset.addEventListener('click', async () => {
  if (!guardUserAction('preset-delete')) return;
  try {
    const name = presetsSelect.value || null;
    // Call main to request deletion; main shows native dialogs as needed
    const res = await window.electronAPI.requestDeletePreset(name);

    if (res && res.ok) {
      // On success, reload presets and apply fallback selection if needed.
      await loadPresets({ settingsSnapshot: settingsCache || {} });
      updatePreviewAndResults(currentText);
      // No further UI dialog required; main already showed confirmation.
      return;
    } else {
      // res.ok === false -> handle known codes
      if (res && res.code === 'NO_SELECTION') {
        // Main already showed a native info dialog; nothing else to do.
        return;
      }
      if (res && res.code === 'CANCELLED') {
        // User cancelled; nothing to do
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

// =============================================================================
// Restore default presets
// =============================================================================
btnResetDefaultPresets.addEventListener('click', async () => {
  if (!guardUserAction('preset-reset-defaults')) return;
  try {
    // Call main to request restore. Main will show a native confirmation dialog.
    const res = await window.electronAPI.requestRestoreDefaults();

    if (res && res.ok) {
      // Reload presets to reflect restored defaults
      await loadPresets({ settingsSnapshot: settingsCache || {} });
      updatePreviewAndResults(currentText);
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

// =============================================================================
// Stopwatch
// =============================================================================
const cronoDisplay = document.getElementById('cronoDisplay');
const tToggle = document.getElementById('cronoToggle');
const tReset = document.getElementById('cronoReset');

const cronoModule = (typeof window !== 'undefined') ? window.RendererCrono : null;

const initCronoController = () => {
  if (!cronoModule || typeof cronoModule.createController !== 'function') {
    log.warn('[renderer] RendererCrono.createController not available');
    return;
  }
  const labels = getCronoLabels();
  cronoController = cronoModule.createController({
    elements: { cronoDisplay, tToggle, tReset, realWpmDisplay, toggleVF },
    electronAPI: window.electronAPI,
    contarTexto,
    obtenerSeparadoresDeNumeros,
    formatearNumero,
    getIdiomaActual: () => idiomaActual,
    getCurrentText: () => currentText,
    getSettingsCache: () => settingsCache,
    playLabel: labels.playLabel,
    pauseLabel: labels.pauseLabel
  });
  if (cronoController && typeof cronoController.bind === 'function') {
    cronoController.bind();
  }
  if (cronoController && typeof cronoController.updateLabels === 'function') {
    cronoController.updateLabels(labels);
  }
};

initCronoController();

uiListenersArmed = true;
runStartupOrchestrator();

// =============================================================================
// End of public/renderer.js
// =============================================================================
