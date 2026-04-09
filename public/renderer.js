// public/renderer.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Bootstraps the renderer UI and pulls config/settings from main.
// - Applies i18n labels and number formatting.
// - Maintains text preview, counts, and time estimates.
// - Coordinates import/extract and OCR entry flows from the main window.
// - Wires presets, clipboard actions, editor, tasks, and help tips.
// - Hosts the info modal and top-bar menu actions.
// - Integrates the stopwatch controller and floating window toggle.
// =============================================================================
// Logger and constants
// =============================================================================
if (typeof window.getLogger !== 'function') {
  throw new Error('[renderer] getLogger unavailable; cannot initialize renderer');
}
const log = window.getLogger('renderer');

log.debug('Renderer main starting...');

const { AppConstants } = window;
if (!AppConstants) {
  throw new Error('[renderer] AppConstants unavailable; verify constants.js load order');
}

const {
  DEFAULT_LANG,
  WPM_MIN,
  WPM_MAX,
  MAX_CLIPBOARD_REPEAT,
  PREVIEW_INLINE_THRESHOLD,
  PREVIEW_START_CHARS,
  PREVIEW_END_CHARS
} = AppConstants;

// =============================================================================
// DOM references
// =============================================================================
const textPreview = document.getElementById('textPreview');
const btnImportExtract = document.getElementById('btnImportExtract');
const btnOverwriteClipboard = document.getElementById('btnOverwriteClipboard');
const btnAppendClipboard = document.getElementById('btnAppendClipboard');
const clipboardRepeatInput = document.getElementById('clipboardRepeatInput');
const btnEdit = document.getElementById('btnEdit');
const btnEmptyMain = document.getElementById('btnEmptyMain');
const btnLoadSnapshot = document.getElementById('btnLoadSnapshot');
const btnSaveSnapshot = document.getElementById('btnSaveSnapshot');
const btnNewTask = document.getElementById('btnNewTask');
const btnLoadTask = document.getElementById('btnLoadTask');
const btnHelp = document.getElementById('btnHelp');
const btnReadingSpeedTest = document.getElementById('btnReadingSpeedTest');

const importExtractEntry = window.ImportExtractEntry;
if (!importExtractEntry
  || typeof importExtractEntry.configure !== 'function'
  || typeof importExtractEntry.startFromFilePath !== 'function'
  || typeof importExtractEntry.startFromPicker !== 'function') {
  throw new Error('[renderer] ImportExtractEntry unavailable; cannot continue');
}

const importExtractDragDrop = window.ImportExtractDragDrop;
if (!importExtractDragDrop
  || typeof importExtractDragDrop.applyTranslations !== 'function'
  || typeof importExtractDragDrop.configure !== 'function') {
  throw new Error('[renderer] ImportExtractDragDrop unavailable; cannot continue');
}

const importExtractStatusUi = window.ImportExtractStatusUi;
if (!importExtractStatusUi
  || typeof importExtractStatusUi.applyProcessingModeState !== 'function'
  || typeof importExtractStatusUi.applyTranslations !== 'function'
  || typeof importExtractStatusUi.beginPrepare !== 'function'
  || typeof importExtractStatusUi.clearPendingExecutionContext !== 'function'
  || typeof importExtractStatusUi.endPrepare !== 'function'
  || typeof importExtractStatusUi.getAbortButton !== 'function'
  || typeof importExtractStatusUi.getFinalElapsedText !== 'function'
  || typeof importExtractStatusUi.isProcessingModeActive !== 'function'
  || typeof importExtractStatusUi.setPendingExecutionContext !== 'function') {
  throw new Error('[renderer] ImportExtractStatusUi unavailable; cannot continue');
}
const btnImportExtractAbort = importExtractStatusUi.getAbortButton();
const importExtractOcrDisconnect = window.ImportExtractOcrDisconnect || null;
const mainLogoLinks = window.MainLogoLinks || null;
const resultsTimeMultiplier = window.ResultsTimeMultiplier;
if (!resultsTimeMultiplier
  || typeof resultsTimeMultiplier.setBaseTotalSeconds !== 'function') {
  throw new Error('[renderer] ResultsTimeMultiplier unavailable; cannot continue');
}
const readingSpeedTestUi = window.ReadingSpeedTestUi || null;
if (!readingSpeedTestUi
  || typeof readingSpeedTestUi.applyTranslations !== 'function'
  || typeof readingSpeedTestUi.configure !== 'function'
  || typeof readingSpeedTestUi.hasBlockingModalOpen !== 'function'
  || typeof readingSpeedTestUi.isInteractionLocked !== 'function'
  || typeof readingSpeedTestUi.isSessionActive !== 'function'
  || typeof readingSpeedTestUi.openEntryFlow !== 'function') {
  throw new Error('[renderer] ReadingSpeedTestUi unavailable; cannot continue');
}

// =============================================================================
// UI keys and static lists
// =============================================================================
let lastHelpTipIdx = -1;

const resChars = document.getElementById('resChars');
const resCharsNoSpace = document.getElementById('resCharsNoSpace');
const resWords = document.getElementById('resWords');
const resTime = document.getElementById('resTime');
const resultsTimeMultiplierInput = document.getElementById('resultsTimeMultiplierInput');

const toggleModoPreciso = document.getElementById('toggleModoPreciso');

const wpmSlider = document.getElementById('wpmSlider');
const wpmInput = document.getElementById('wpmInput');
const { WpmCurve } = window;
const wpmCurveMapper = (
  WpmCurve && typeof WpmCurve.createMapperFromConstants === 'function'
)
  ? WpmCurve.createMapperFromConstants(AppConstants)
  : null;

if (!wpmCurveMapper) {
  log.warnOnce(
    'renderer.wpmCurve.unavailable',
    '[renderer] WpmCurve unavailable; using linear slider mapping.'
  );
}

function clampWpm(rawValue) {
  const numeric = Number(rawValue);
  const safe = Number.isFinite(numeric) ? Math.round(numeric) : WPM_MIN;
  return Math.min(Math.max(safe, WPM_MIN), WPM_MAX);
}

function wpmFromSliderControl(rawControl) {
  if (wpmCurveMapper && typeof wpmCurveMapper.wpmFromControl === 'function') {
    return clampWpm(wpmCurveMapper.wpmFromControl(rawControl));
  }
  return clampWpm(rawControl);
}

function sliderControlFromWpm(rawWpm) {
  if (wpmCurveMapper && typeof wpmCurveMapper.controlFromWpm === 'function') {
    return wpmCurveMapper.controlFromWpm(rawWpm);
  }
  return clampWpm(rawWpm);
}

function syncWpmControls(rawWpm) {
  const normalizedWpm = clampWpm(rawWpm);
  if (wpmInput) wpmInput.value = String(normalizedWpm);
  if (wpmSlider) wpmSlider.value = String(sliderControlFromWpm(normalizedWpm));
  return normalizedWpm;
}

if (wpmSlider) {
  wpmSlider.min = String(WPM_MIN);
  wpmSlider.max = String(WPM_MAX);
  if (wpmCurveMapper && Number.isFinite(wpmCurveMapper.controlStep) && wpmCurveMapper.controlStep > 0) {
    wpmSlider.step = String(wpmCurveMapper.controlStep);
  }
}
if (wpmInput) {
  wpmInput.min = String(WPM_MIN);
  wpmInput.max = String(WPM_MAX);
}
if (clipboardRepeatInput) {
  clipboardRepeatInput.min = '1';
  clipboardRepeatInput.max = String(MAX_CLIPBOARD_REPEAT);
}

function updateClipboardRepeatVisualState(rawValue = '') {
  if (!clipboardRepeatInput) return;
  const numericValue = Number(rawValue);
  const isRepeatActive = Number.isFinite(numericValue) && numericValue > 1;
  clipboardRepeatInput.classList.toggle('is-repeat-active', isRepeatActive);
}

if (clipboardRepeatInput) {
  updateClipboardRepeatVisualState(clipboardRepeatInput.value);
  clipboardRepeatInput.addEventListener('input', () => {
    updateClipboardRepeatVisualState(clipboardRepeatInput.value);
  });
}

const realWpmDisplay = document.getElementById('realWpmDisplay');
const selectorTitle = document.getElementById('selector-title');
const velTitle = document.getElementById('vel-title');
const resultsTitle = document.getElementById('results-title');
const cronTitle = document.getElementById('cron-title');

const toggleVF = document.getElementById('toggleVF');
const editorLoader = document.getElementById('editorLoader');
const startupSplash = document.getElementById('startupSplash');
const cronoDisplayInput = document.getElementById('cronoDisplay');
const cronoToggleBtnMain = document.getElementById('cronoToggle');
const cronoResetBtnMain = document.getElementById('cronoReset');

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
const PROCESSING_LOCK_NOTICE_THROTTLE_MS = 1000;

function isRendererReady() {
  return rendererReadyState === 'READY';
}

function isProcessingModeActive() {
  return importExtractStatusUi.isProcessingModeActive();
}

function setControlInteractionLocked(element, locked) {
  if (!element) return;
  element.disabled = locked;
  element.setAttribute('aria-disabled', locked ? 'true' : 'false');
}

function isReadingTestInteractionLocked() {
  return !!(readingSpeedTestUi && readingSpeedTestUi.isInteractionLocked());
}

function isReadingTestSessionActive() {
  return !!(readingSpeedTestUi && readingSpeedTestUi.isSessionActive());
}

function syncMainInteractionLockUi() {
  const locked = !isRendererReady()
    || isProcessingModeActive()
    || isReadingTestInteractionLocked();

  setControlInteractionLocked(btnImportExtract, locked);
  setControlInteractionLocked(btnOverwriteClipboard, locked);
  setControlInteractionLocked(btnAppendClipboard, locked);
  setControlInteractionLocked(clipboardRepeatInput, locked);
  setControlInteractionLocked(btnEdit, locked);
  setControlInteractionLocked(btnEmptyMain, locked);
  setControlInteractionLocked(btnLoadSnapshot, locked);
  setControlInteractionLocked(btnSaveSnapshot, locked);
  setControlInteractionLocked(btnNewTask, locked);
  setControlInteractionLocked(btnLoadTask, locked);
  setControlInteractionLocked(btnHelp, locked);
  setControlInteractionLocked(wpmInput, locked);
  setControlInteractionLocked(wpmSlider, locked);
  setControlInteractionLocked(presetsSelect, locked);
  setControlInteractionLocked(btnNewPreset, locked);
  setControlInteractionLocked(btnEditPreset, locked);
  setControlInteractionLocked(btnDeletePreset, locked);
  setControlInteractionLocked(btnResetDefaultPresets, locked);
  setControlInteractionLocked(btnReadingSpeedTest, locked);
  setControlInteractionLocked(resultsTimeMultiplierInput, locked);
  setControlInteractionLocked(toggleModoPreciso, locked);
  setControlInteractionLocked(toggleVF, locked);
  setControlInteractionLocked(cronoDisplayInput, locked);
  setControlInteractionLocked(cronoToggleBtnMain, locked);
  setControlInteractionLocked(cronoResetBtnMain, locked);
}

function startImportExtractPrepareAttempt() {
  importExtractPrepareAttemptId += 1;
  return importExtractPrepareAttemptId;
}

function isLatestImportExtractPrepareAttempt(attemptId) {
  return attemptId === importExtractPrepareAttemptId;
}

function isAriaHiddenElementVisible(elementId) {
  const element = document.getElementById(elementId);
  return !!(element && element.getAttribute('aria-hidden') === 'false');
}

function hasBlockingMainWindowModalOpen() {
  return isAriaHiddenElementVisible('infoModal')
    || isAriaHiddenElementVisible('importExtractRouteModal')
    || isAriaHiddenElementVisible('importExtractApplyModal')
    || isAriaHiddenElementVisible('snapshotSaveTagsModal')
    || isAriaHiddenElementVisible('readingTestEntryModal')
    || isAriaHiddenElementVisible('importExtractOcrActivationDisclosureModal');
}

function canAcceptImportExtractDrop() {
  return isRendererReady()
    && !isProcessingModeActive()
    && !isReadingTestSessionActive()
    && !hasBlockingMainWindowModalOpen();
}

async function requestPreparedImport({
  prepareImportExtractSelectedFile,
  preparationRequest,
}) {
  const attemptId = startImportExtractPrepareAttempt();
  importExtractStatusUi.beginPrepare();
  try {
    const preparation = await prepareImportExtractSelectedFile(preparationRequest);
    return {
      attemptId,
      preparation,
      stale: !isLatestImportExtractPrepareAttempt(attemptId),
    };
  } finally {
    importExtractStatusUi.endPrepare();
  }
}

function maybeNotifyProcessingLock(actionId) {
  const now = Date.now();
  if ((now - lastProcessingLockNoticeAt) < PROCESSING_LOCK_NOTICE_THROTTLE_MS) return;
  lastProcessingLockNoticeAt = now;
  window.Notify.notifyMain('renderer.alerts.import_extract_processing_locked');
  log.warnOnce(
    `renderer.processing_lock.${actionId}`,
    'Renderer action ignored (processing-mode lock active):',
    actionId
  );
}

function guardUserAction(actionId, { allowDuringProcessing = false } = {}) {
  const normalizedActionId = typeof actionId === 'string' ? actionId : 'unknown_action';
  if (!isRendererReady()) {
    log.warnOnce(
      `BOOTSTRAP:renderer.preReady.${normalizedActionId}`,
      'Renderer action ignored (pre-READY):',
      normalizedActionId
    );
    return false;
  }

  const isAbortAction = normalizedActionId === 'import-extract-abort';
  if (!allowDuringProcessing && !isAbortAction && isProcessingModeActive()) {
    maybeNotifyProcessingLock(normalizedActionId);
    return false;
  }

  if (isReadingTestSessionActive()) {
    log.warnOnce(
      `renderer.readingTestLock.${normalizedActionId}`,
      'Renderer action ignored (reading-test session lock active):',
      normalizedActionId
    );
    return false;
  }

  return true;
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
  syncMainInteractionLockUi();
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
let hasCurrentTextSubscription = false;
let importExtractPrepareAttemptId = 0;
let lastProcessingLockNoticeAt = 0;

function getOptionalElectronMethod(methodName, { dedupeKey, unavailableMessage } = {}) {
  const api = window.electronAPI;
  if (!api || typeof api[methodName] !== 'function') {
    log.warnOnce(
      dedupeKey || `renderer.ipc.${methodName}.unavailable`,
      unavailableMessage || `${methodName} unavailable; optional action skipped.`
    );
    return null;
  }
  return api[methodName].bind(api);
}

// =============================================================================
// i18n wiring
// =============================================================================
const { loadRendererTranslations, tRenderer, msgRenderer, getRendererValue } = window.RendererI18n || {};
if (!loadRendererTranslations || !tRenderer || !msgRenderer || !getRendererValue) {
  throw new Error('[renderer] RendererI18n unavailable; cannot continue');
}

function getHelpTipKeyList() {
  const tips = getRendererValue('renderer.main.tips.results_help');
  if (!tips || typeof tips !== 'object' || Array.isArray(tips)) return [];
  return Object.keys(tips)
    .map((key) => {
      const match = /^tip(\d+)$/.exec(key);
      if (!match) return null;
      return { key, order: Number(match[1]) };
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
    .map(({ key }) => `renderer.main.tips.results_help.${key}`);
}

const getCronoLabels = () => ({
  playLabel: tRenderer ? tRenderer('renderer.main.crono.play_symbol', '>') : '>',
  pauseLabel: tRenderer ? tRenderer('renderer.main.crono.pause_symbol', '||') : '||'
});

function applyTranslations() {
  if (!tRenderer) return;
  const applyAriaLabel = (el, key, fallback = '') => {
    if (!el) return;
    const defaultValue = fallback || el.getAttribute('aria-label') || '';
    const aria = tRenderer(key, defaultValue);
    if (aria) el.setAttribute('aria-label', aria);
  };
  importExtractStatusUi.applyTranslations({ tRenderer, msgRenderer });
  importExtractDragDrop.applyTranslations({ tRenderer });
  readingSpeedTestUi.applyTranslations();
  if (mainLogoLinks && typeof mainLogoLinks.applyTranslations === 'function') {
    mainLogoLinks.applyTranslations({ tRenderer });
  } else {
    log.warnOnce(
      'renderer.mainLogoLinks.applyTranslations.unavailable',
      'MainLogoLinks.applyTranslations unavailable; brand logo labels will use defaults.'
    );
  }
  const infoModalLoading = document.getElementById('infoModalLoading');
  if (infoModalLoading) {
    infoModalLoading.textContent = tRenderer('renderer.info.loading', infoModalLoading.textContent || 'Cargando...');
  }
  // Text selector buttons
  if (btnImportExtract) btnImportExtract.textContent = tRenderer('renderer.main.buttons.import_extract', btnImportExtract.textContent || '');
  if (btnOverwriteClipboard) btnOverwriteClipboard.textContent = tRenderer('renderer.main.buttons.overwrite_clipboard', btnOverwriteClipboard.textContent || '');
  if (btnAppendClipboard) btnAppendClipboard.textContent = tRenderer('renderer.main.buttons.append_clipboard', btnAppendClipboard.textContent || '');
  if (btnEdit) btnEdit.textContent = tRenderer('renderer.main.buttons.edit', btnEdit.textContent || '');
  if (btnEmptyMain) btnEmptyMain.textContent = tRenderer('renderer.main.buttons.clear', btnEmptyMain.textContent || '');
  if (btnLoadSnapshot) btnLoadSnapshot.textContent = tRenderer('renderer.main.buttons.snapshot_load', btnLoadSnapshot.textContent || '');
  if (btnSaveSnapshot) btnSaveSnapshot.textContent = tRenderer('renderer.main.buttons.snapshot_save', btnSaveSnapshot.textContent || '');
  if (btnNewTask) btnNewTask.textContent = tRenderer('renderer.main.buttons.task_new', btnNewTask.textContent || '');
  if (btnLoadTask) btnLoadTask.textContent = tRenderer('renderer.main.buttons.task_load', btnLoadTask.textContent || '');
  // Text selector tooltips
  if (btnImportExtract) btnImportExtract.title = tRenderer('renderer.main.tooltips.import_extract', btnImportExtract.title || '');
  if (btnOverwriteClipboard) btnOverwriteClipboard.title = tRenderer('renderer.main.tooltips.overwrite_clipboard', btnOverwriteClipboard.title || '');
  if (btnAppendClipboard) btnAppendClipboard.title = tRenderer('renderer.main.tooltips.append_clipboard', btnAppendClipboard.title || '');
  applyAriaLabel(btnImportExtract, 'renderer.main.aria.import_extract');
  if (clipboardRepeatInput) {
    clipboardRepeatInput.title = tRenderer('renderer.main.tooltips.clipboard_repeat_count', clipboardRepeatInput.title || '');
    applyAriaLabel(clipboardRepeatInput, 'renderer.main.aria.clipboard_repeat_count');
  }
  if (btnEdit) btnEdit.title = tRenderer('renderer.main.tooltips.edit', btnEdit.title || '');
  if (btnEmptyMain) btnEmptyMain.title = tRenderer('renderer.main.tooltips.clear', btnEmptyMain.title || '');
  if (btnLoadSnapshot) btnLoadSnapshot.title = tRenderer('renderer.main.tooltips.snapshot_load', btnLoadSnapshot.title || '');
  if (btnSaveSnapshot) btnSaveSnapshot.title = tRenderer('renderer.main.tooltips.snapshot_save', btnSaveSnapshot.title || '');
  if (btnNewTask) btnNewTask.title = tRenderer('renderer.main.tooltips.task_new', btnNewTask.title || '');
  if (btnLoadTask) btnLoadTask.title = tRenderer('renderer.main.tooltips.task_load', btnLoadTask.title || '');
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
  if (btnReadingSpeedTest) {
    const label = tRenderer('renderer.main.reading_tools.reading_speed_test', btnReadingSpeedTest.textContent || '');
    btnReadingSpeedTest.textContent = label;
    if (label) {
      btnReadingSpeedTest.title = label;
      btnReadingSpeedTest.setAttribute('aria-label', label);
    }
  }
  // Speed selector labels
  const wpmLabel = document.querySelector('.wpm-row span');
  if (wpmLabel) wpmLabel.textContent = tRenderer('renderer.main.speed.wpm_label', wpmLabel.textContent || '');
  applyAriaLabel(wpmInput, 'renderer.main.aria.wpm_input');
  applyAriaLabel(wpmSlider, 'renderer.main.aria.wpm_slider');
  applyAriaLabel(presetsSelect, 'renderer.main.aria.speed_presets');
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
  applyAriaLabel(toggleModoPreciso, 'renderer.main.aria.precise_mode_toggle', togglePrecisoLabel ? togglePrecisoLabel.textContent : '');
  // Stopwatch: speed label and controls aria-label
  const realWpmLabel = document.querySelector('.realwpm');
  if (realWpmLabel && realWpmLabel.firstChild) {
    realWpmLabel.firstChild.textContent = tRenderer('renderer.main.crono.speed', realWpmLabel.firstChild.textContent || '');
  }
  const cronoControls = document.querySelector('.crono-controls');
  if (cronoControls) {
    const ariaLabel = tRenderer(
      'renderer.main.aria.crono_controls',
      tRenderer('renderer.main.crono.controls_label', cronoControls.getAttribute('aria-label') || '')
    );
    if (ariaLabel) cronoControls.setAttribute('aria-label', ariaLabel);
  }
  const cronoDisplayEl = document.getElementById('cronoDisplay');
  const cronoToggleBtn = document.getElementById('cronoToggle');
  const cronoResetBtn = document.getElementById('cronoReset');
  const vfSwitchWrapper = document.querySelector('.vf-switch-wrapper');
  applyAriaLabel(cronoDisplayEl, 'renderer.main.aria.crono_display');
  applyAriaLabel(cronoToggleBtn, 'renderer.main.aria.crono_toggle');
  applyAriaLabel(cronoResetBtn, 'renderer.main.aria.crono_reset');
  applyAriaLabel(toggleVF, 'renderer.main.aria.floating_window_toggle');
  applyAriaLabel(vfSwitchWrapper, 'renderer.main.aria.floating_window_group');
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

let wpm = syncWpmControls(wpmInput ? wpmInput.value : WPM_MIN);
let currentPresetName = null;

// Local preset cache (full list loaded once)
let allPresetsCache = [];

// =============================================================================
// Presets integration
// =============================================================================
const { loadPresetsIntoDom, resolvePresetSelection } = window.RendererPresets || {};
const hasRendererPresetsBridge = (
  typeof loadPresetsIntoDom === 'function' &&
  typeof resolvePresetSelection === 'function'
);
if (!hasRendererPresetsBridge) {
  log.warnOnce(
    'renderer.bridge.RendererPresets.unavailable',
    'RendererPresets bridge unavailable; preset integration disabled.'
  );
}

// =============================================================================
// Snapshot helpers
// =============================================================================
const { saveSnapshot, loadSnapshot } = window.CurrentTextSnapshots || {};
if (typeof saveSnapshot !== 'function' || typeof loadSnapshot !== 'function') {
  log.warnOnce(
    'renderer.bridge.CurrentTextSnapshots.unavailable',
    'CurrentTextSnapshots bridge unavailable; snapshot actions disabled.'
  );
}

// =============================================================================
// Text counting
// =============================================================================
const { contarTexto: contarTextoModulo } = window.CountUtils || {};
if (typeof contarTextoModulo !== 'function') {
  throw new Error('[renderer] CountUtils unavailable; cannot continue');
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
const { getExactTotalSeconds, getDisplayTimeParts, obtenerSeparadoresDeNumeros, formatearNumero } = window.FormatUtils || {};
if (!getExactTotalSeconds || !getDisplayTimeParts || !obtenerSeparadoresDeNumeros || !formatearNumero) {
  throw new Error('[renderer] FormatUtils unavailable; cannot continue');
}

// =============================================================================
// Preview and results
// =============================================================================
let currentTextStats = null;

function renderEstimatedTime(totalSeconds) {
  const { hours, minutes, seconds } = getDisplayTimeParts(totalSeconds);
  resTime.textContent = msgRenderer(
    'renderer.main.results.time',
    { h: hours, m: minutes, s: seconds }
  );
  resultsTimeMultiplier.setBaseTotalSeconds(totalSeconds);
}

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

  resChars.textContent = msgRenderer('renderer.main.results.chars', { n: caracteresFormateado }, `Characters: ${caracteresFormateado}`);
  resCharsNoSpace.textContent = msgRenderer('renderer.main.results.chars_no_space', { n: caracteresSinEspaciosFormateado }, `Characters (no spaces): ${caracteresSinEspaciosFormateado}`);
  resWords.textContent = msgRenderer('renderer.main.results.words', { n: palabrasFormateado }, `Words: ${palabrasFormateado}`);

  const totalSeconds = getExactTotalSeconds(stats.palabras, wpm);
  renderEstimatedTime(totalSeconds);
}

function startPreviewAndResultsUpdate(text, reason) {
  updatePreviewAndResults(text).catch((err) => {
    log.error(`Error updating preview/results after ${reason}:`, err);
  });
}

function updateTimeOnlyFromStats() {
  if (!currentTextStats) {
    log.warnOnce(
      'renderer.timeOnly.noStats',
      'WPM-only update requested without text stats; time not updated.'
    );
    return;
  }
  const totalSeconds = getExactTotalSeconds(currentTextStats.palabras, wpm);
  renderEstimatedTime(totalSeconds);
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
  startPreviewAndResultsUpdate(nextText, 'current-text update');
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
  if (!hasRendererPresetsBridge) {
    log.warnOnce(
      'renderer.bridge.RendererPresets.reload.unavailable',
      'Preset list reload skipped because RendererPresets bridge is unavailable.'
    );
    return resetPresetsState();
  }
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
  if (!hasRendererPresetsBridge) {
    log.warnOnce(
      'renderer.bridge.RendererPresets.selection.unavailable',
      'Preset selection skipped because RendererPresets bridge is unavailable.'
    );
    return resetPresetsState();
  }
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
      wpm = syncWpmControls(selected.wpm);
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
      try {
        applyTranslations();
      } catch (err) {
        log.warn('applyTranslations failed after settings change (ignored):', err);
      }
      try {
        await loadPresets({ settingsSnapshot: settingsCache });
      } catch (err) {
        log.error('Error loading presets after language change:', err);
      }
    }
    const modeChanged = !!(settingsCache.modeConteo && settingsCache.modeConteo !== modoConteo);
    if (modeChanged) {
      modoConteo = settingsCache.modeConteo;
      if (typeof syncToggleFromSettings === 'function') {
        syncToggleFromSettings(settingsCache || {});
      } else if (toggleModoPreciso) {
        toggleModoPreciso.checked = (modoConteo === 'preciso');
      }
    }
    if (isRendererReady()) {
      startPreviewAndResultsUpdate(currentText, 'settings change');
      if (modeChanged && cronoController && typeof cronoController.handleTextChange === 'function') {
        cronoController.handleTextChange(null, currentText);
      }
    }
  } catch (err) {
    log.error('Error handling settings change:', err);
  }
};

function armIpcSubscriptions() {
  // Subscribe to updates from main (current text changes)
  if (window.electronAPI && typeof window.electronAPI.onCurrentTextUpdated === 'function') {
    hasCurrentTextSubscription = true;
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
    throw new Error('[renderer] electronAPI.onCurrentTextUpdated unavailable; cannot maintain current text synchronization');
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
              wpm = syncWpmControls(selected.wpm);
              startPreviewAndResultsUpdate(currentText, 'preset-created sync');
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
      throw new Error('[renderer] electronAPI.onStartupReady unavailable; cannot bootstrap renderer readiness');
    }

    if (typeof window.electronAPI.onSettingsChanged === 'function') {
      window.electronAPI.onSettingsChanged(settingsChangeHandler);
    } else {
      log.warnOnce(
        'renderer.ipc.onSettingsChanged.unavailable',
        'onSettingsChanged unavailable; settings updates will not sync.'
      );
    }

    if (typeof window.electronAPI.onImportExtractProcessingModeChanged === 'function') {
      window.electronAPI.onImportExtractProcessingModeChanged((state) => {
        try {
          importExtractStatusUi.applyProcessingModeState(state, { source: 'ipc_event' });
          syncMainInteractionLockUi();
        } catch (err) {
          log.error('Error handling import-extract-processing-mode-changed:', err);
        }
      });
    } else {
      log.warnOnce(
        'renderer.ipc.onImportExtractProcessingModeChanged.unavailable',
        'onImportExtractProcessingModeChanged unavailable; processing lock updates will not sync.'
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
    throw new Error('[renderer] electronAPI unavailable; cannot bootstrap renderer readiness');
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
        startPreviewAndResultsUpdate(currentText, 'mode toggle');
        if (cronoController && typeof cronoController.handleTextChange === 'function') {
          cronoController.handleTextChange(null, currentText);
        }

        // Attempt to persist settings via IPC (if preload/main implemented setModeConteo)
        if (window.electronAPI && typeof window.electronAPI.setModeConteo === 'function') {
          try {
            await window.electronAPI.setModeConteo(nuevoModo);
          } catch (err) {
            log.error('Error persisting modeConteo using setModeConteo:', err);
          }
        } else if (window.electronAPI) {
          log.warnOnce(
            'renderer.ipc.setModeConteo.unavailable',
            'setModeConteo unavailable; mode persistence skipped.'
          );
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
    const getAppConfig = getOptionalElectronMethod('getAppConfig', {
      dedupeKey: 'renderer.ipc.getAppConfig.unavailable',
      unavailableMessage: 'getAppConfig unavailable; bootstrap will use default limits.'
    });
    if (getAppConfig) {
      try {
        const cfg = await getAppConfig();
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
    }

    let settingsSnapshot = {};
    // Load user settings once at renderer startup
    const getSettings = getOptionalElectronMethod('getSettings', {
      dedupeKey: 'renderer.ipc.getSettings.unavailable',
      unavailableMessage: 'getSettings unavailable; bootstrap will use default settings.'
    });
    if (getSettings) {
      try {
        const settings = await getSettings();
        settingsCache = settings || {};
        settingsSnapshot = settingsCache;
        idiomaActual = settingsCache.language || DEFAULT_LANG;
        if (settingsCache.modeConteo) modoConteo = settingsCache.modeConteo;
      } catch (err) {
        log.warn('BOOTSTRAP: getSettings failed; using defaults:', err);
        settingsCache = {};
        settingsSnapshot = settingsCache;
      }
    } else {
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
    const getCurrentText = getOptionalElectronMethod('getCurrentText', {
      dedupeKey: 'renderer.ipc.getCurrentText.unavailable',
      unavailableMessage: 'getCurrentText unavailable; bootstrap will use empty text.'
    });
    if (getCurrentText) {
      try {
        const t = await getCurrentText();
        installCurrentTextState(t || '');
      } catch (err) {
        log.error('Error loading initial current text:', err);
        installCurrentTextState('');
      }
    } else {
      installCurrentTextState('');
    }

    const getImportExtractProcessingMode = getOptionalElectronMethod('getImportExtractProcessingMode', {
      dedupeKey: 'renderer.ipc.getImportExtractProcessingMode.unavailable',
      unavailableMessage: 'getImportExtractProcessingMode unavailable; processing mode defaults to inactive.'
    });
    if (getImportExtractProcessingMode) {
      try {
        const processingMode = await getImportExtractProcessingMode();
        if (processingMode && processingMode.ok === true) {
          importExtractStatusUi.applyProcessingModeState(processingMode.state, { source: 'startup_query' });
        } else {
          log.warn(
            'BOOTSTRAP: getImportExtractProcessingMode returned non-ok result; keeping processing mode inactive:',
            processingMode
          );
        }
      } catch (err) {
        log.warn('BOOTSTRAP: getImportExtractProcessingMode failed; keeping processing mode inactive:', err);
      }
    }
    syncMainInteractionLockUi();

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
    startPreviewAndResultsUpdate(currentText, 'startup kickoff');
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
      const loadingText = tRenderer('renderer.info.loading', 'Cargando...');
      infoModalContent.innerHTML = `<div id="infoModalLoading" class="info-loading">${loadingText}</div>`;
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
    const unavailableText = tRenderer
      ? tRenderer('renderer.info.acerca_de.version.unavailable', 'Unavailable')
      : 'Unavailable';

    if (!window.electronAPI || typeof window.electronAPI.getAppVersion !== 'function') {
      log.warnOnce('renderer.info.acerca_de.version.unavailable', 'getAppVersion not available for About modal.');
      versionEl.textContent = unavailableText;
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
        versionEl.textContent = unavailableText;
        return;
      }
      versionEl.textContent = cleaned;
    } catch (err) {
      log.warn('getAppVersion failed; About modal shows N/A:', err);
      versionEl.textContent = unavailableText;
    }
  }

  async function hydrateAboutEnvironment(container) {
    const envEl = container ? container.querySelector('#appEnv') : null;
    const runtimeEl = container ? container.querySelector('#appRuntimeVersions') : null;
    const sharpRuntimeLicenseRow = container ? container.querySelector('#sharpRuntimeLicenseRow') : null;
    const sharpRuntimeNoticeRow = container ? container.querySelector('#sharpRuntimeNoticeRow') : null;
    const sharpRuntimeEl = container ? container.querySelector('#sharpRuntimePackageName') : null;
    const sharpRuntimeNoticeEl = container ? container.querySelector('#sharpRuntimeNoticePackageName') : null;
    if (!envEl) return;
    const unavailableText = tRenderer
      ? tRenderer('renderer.info.acerca_de.env.unavailable', 'Unavailable')
      : 'Unavailable';

    if (!window.electronAPI || typeof window.electronAPI.getAppRuntimeInfo !== 'function') {
      log.warnOnce('renderer.info.acerca_de.env.unavailable', 'getAppRuntimeInfo not available for About modal.');
      envEl.textContent = unavailableText;
      if (runtimeEl) runtimeEl.textContent = unavailableText;
      if (sharpRuntimeLicenseRow) sharpRuntimeLicenseRow.hidden = true;
      if (sharpRuntimeNoticeRow) sharpRuntimeNoticeRow.hidden = true;
      return;
    }

    try {
      const info = await window.electronAPI.getAppRuntimeInfo();
      const platform = info && typeof info.platform === 'string' ? info.platform.trim() : '';
      const arch = info && typeof info.arch === 'string' ? info.arch.trim() : '';
      const electronVersion = info && typeof info.electronVersion === 'string'
        ? info.electronVersion.trim()
        : '';
      const chromeVersion = info && typeof info.chromeVersion === 'string'
        ? info.chromeVersion.trim()
        : '';
      const nodeVersion = info && typeof info.nodeVersion === 'string'
        ? info.nodeVersion.trim()
        : '';
      const platformMap = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };
      const osLabel = platformMap[platform] || platform;
      const sharpRuntimePackageMap = {
        'win32:x64': '@img/sharp-win32-x64@0.34.4',
        'darwin:x64': '@img/sharp-darwin-x64@0.34.4',
        'darwin:arm64': '@img/sharp-darwin-arm64@0.34.4',
        'linux:x64': '@img/sharp-linux-x64@0.34.4',
      };
      const sharpRuntimePackage = sharpRuntimePackageMap[`${platform}:${arch}`]
        || '@img/sharp-<plataforma>-<arquitectura>@0.34.4';

      if (!osLabel || !arch) {
        log.warnOnce(
          'renderer.info.acerca_de.env.missing_fields',
          'getAppRuntimeInfo missing platform/arch; About modal shows N/A.'
        );
        envEl.textContent = unavailableText;
        if (runtimeEl) runtimeEl.textContent = unavailableText;
        if (sharpRuntimeEl) sharpRuntimeEl.textContent = '@img/sharp-<plataforma>-<arquitectura>@0.34.4';
        if (sharpRuntimeNoticeEl) sharpRuntimeNoticeEl.textContent = '@img/sharp-<plataforma>-<arquitectura>@0.34.4';
        if (sharpRuntimeLicenseRow) sharpRuntimeLicenseRow.hidden = true;
        if (sharpRuntimeNoticeRow) sharpRuntimeNoticeRow.hidden = true;
        return;
      }

      envEl.textContent = `${osLabel} (${arch})`;
      if (sharpRuntimeEl) sharpRuntimeEl.textContent = sharpRuntimePackage;
      if (sharpRuntimeNoticeEl) sharpRuntimeNoticeEl.textContent = sharpRuntimePackage;
      if (runtimeEl) {
        const runtimeParts = [];
        runtimeParts.push(electronVersion ? `Electron ${electronVersion}` : `Electron ${unavailableText}`);
        runtimeParts.push(chromeVersion ? `Chromium ${chromeVersion}` : `Chromium ${unavailableText}`);
        runtimeParts.push(nodeVersion ? `Node.js ${nodeVersion}` : `Node.js ${unavailableText}`);
        runtimeEl.textContent = runtimeParts.join(' | ');
      }

      if (
        window.electronAPI
        && typeof window.electronAPI.getAppDocAvailability === 'function'
      ) {
        const [licenseAvailability, noticeAvailability] = await Promise.all([
          window.electronAPI.getAppDocAvailability('license-import-extract-image-processing-runtime'),
          window.electronAPI.getAppDocAvailability('notice-import-extract-image-processing-runtime'),
        ]);
        if (sharpRuntimeLicenseRow) sharpRuntimeLicenseRow.hidden = !(licenseAvailability && licenseAvailability.available);
        if (sharpRuntimeNoticeRow) sharpRuntimeNoticeRow.hidden = !(noticeAvailability && noticeAvailability.available);
      } else {
        if (sharpRuntimeLicenseRow) sharpRuntimeLicenseRow.hidden = true;
        if (sharpRuntimeNoticeRow) sharpRuntimeNoticeRow.hidden = true;
      }
    } catch (err) {
      log.warn('getAppRuntimeInfo failed; About modal shows N/A:', err);
      envEl.textContent = unavailableText;
      if (runtimeEl) runtimeEl.textContent = unavailableText;
      if (sharpRuntimeEl) sharpRuntimeEl.textContent = '@img/sharp-<plataforma>-<arquitectura>@0.34.4';
      if (sharpRuntimeNoticeEl) sharpRuntimeNoticeEl.textContent = '@img/sharp-<plataforma>-<arquitectura>@0.34.4';
      if (sharpRuntimeLicenseRow) sharpRuntimeLicenseRow.hidden = true;
      if (sharpRuntimeNoticeRow) sharpRuntimeNoticeRow.hidden = true;
    }
  }

  const normalizeLangTagSafe = (lang) => {
    if (window.RendererI18n && typeof window.RendererI18n.normalizeLangTag === 'function') {
      return window.RendererI18n.normalizeLangTag(lang);
    }
    log.warnOnce(
      'renderer.info.normalizeLangTag.fallback',
      'RendererI18n.normalizeLangTag unavailable; using local fallback normalization.'
    );
    return String(lang || '').trim().toLowerCase().replace(/_/g, '-');
  };

  const getLangBaseSafe = (lang) => {
    if (window.RendererI18n && typeof window.RendererI18n.getLangBase === 'function') {
      return window.RendererI18n.getLangBase(lang);
    }
    log.warnOnce(
      'renderer.info.getLangBase.fallback',
      'RendererI18n.getLangBase unavailable; using local fallback language base.'
    );
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

  async function showInfoModal(key) {
    // key: 'instrucciones' | 'guia_basica' | 'faq' | 'links_interes' | 'acerca_de'
    if (!infoModal || !infoModalTitle || !infoModalContent) return;

    // Decide which file to load based on the key.
    // Basic guide, instructions, and FAQ are served from localized manual HTML.
    let fileToLoad = null;
    let sectionId = null;
    const isManual = (key === 'guia_basica' || key === 'instrucciones' || key === 'faq');

    if (key === 'acerca_de') {
      fileToLoad = './info/acerca_de.html';
    } else if (key === 'links_interes') {
      fileToLoad = './info/links_interes.html';
    } else if (isManual) {
      const langTag = (settingsCache && settingsCache.language) ? settingsCache.language : (idiomaActual || DEFAULT_LANG);
      fileToLoad = getManualFileCandidates(langTag);
      // Map key to block ID within instructions.html
      const mapping = { guia_basica: 'guia-basica', instrucciones: 'instrucciones', faq: 'faq' };
      sectionId = mapping[key] || 'instrucciones';
    } else {
      log.warnOnce(
        'renderer.info.unsupportedKey',
        'showInfoModal received unsupported key:',
        key
      );
      return;
    }

    const translationKey = (key === 'guia_basica' || key === 'faq') ? 'instrucciones' : key;
    let defaultTitle = 'Links de interés';
    if (translationKey === 'instrucciones') {
      defaultTitle = 'Manual de uso';
    } else if (translationKey === 'acerca_de') {
      defaultTitle = 'Acerca de';
    }
    const infoDialogLabel = tRenderer
      ? tRenderer(`renderer.info.${translationKey}.title`, defaultTitle)
      : defaultTitle;
    infoModalTitle.textContent = infoDialogLabel;

    // Open modal early so loading state is visible during fetch
    const loadingText = tRenderer('renderer.info.loading', 'Cargando...');
    infoModalContent.innerHTML = `<div id="infoModalLoading" class="info-loading">${loadingText}</div>`;
    infoModal.setAttribute('aria-hidden', 'false');

    // Fetch HTML (manual pages use a language fallback list)
    const tryHtml = Array.isArray(fileToLoad)
      ? (await fetchTextWithFallback(fileToLoad)).html
      : await fetchText(fileToLoad);
    if (tryHtml === null) {
      // Fallback: show a simple missing-content message
      const missingContentText = msgRenderer
        ? msgRenderer(
          'renderer.info.missing_content',
          { name: infoDialogLabel },
          `No hay contenido disponible para '${infoDialogLabel}'.`
        )
        : `No hay contenido disponible para '${infoDialogLabel}'.`;
      infoModalContent.innerHTML = `<p>${missingContentText}</p>`;
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
    } else {
      log.warnOnce(
        'renderer.info.bindInfoModalLinks.unavailable',
        'InfoModalLinks.bindInfoModalLinks unavailable; modal links will use default behavior.'
      );
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

    registerMenuActionGuarded('__menu_processing_lock_notice__', () => { });

    registerMenuActionGuarded('guia_basica', () => { showInfoModal('guia_basica') });
    registerMenuActionGuarded('instrucciones_completas', () => { showInfoModal('instrucciones') });
    registerMenuActionGuarded('faq', () => { showInfoModal('faq') });
    registerMenuActionGuarded('diseno_skins', () => {
      window.Notify.notifyMain('renderer.alerts.wip_diseno_skins'); // WIP
    });
    registerMenuActionGuarded('diseno_crono_flotante', () => {
      window.Notify.notifyMain('renderer.alerts.wip_diseno_crono'); // WIP
    });
    registerMenuActionGuarded('diseno_fuentes', () => {
      window.Notify.notifyMain('renderer.alerts.wip_diseno_fuentes'); // WIP
    });
    registerMenuActionGuarded('diseno_colores', () => {
      window.Notify.notifyMain('renderer.alerts.wip_diseno_colores'); // WIP
    });
    registerMenuActionGuarded('shortcuts', () => {
      window.Notify.notifyMain('renderer.alerts.wip_shortcuts'); // WIP
    });
    registerMenuActionGuarded('presets_por_defecto', async () => {
      try {
        if (!window.electronAPI || typeof window.electronAPI.openDefaultPresetsFolder !== 'function') {
          log.warnOnce(
            'renderer.ipc.openDefaultPresetsFolder.unavailable',
            'openDefaultPresetsFolder unavailable at electronAPI; action skipped.'
          );
          window.Notify.notifyMain('renderer.alerts.open_presets_unsupported');
          return;
        }

        const res = await window.electronAPI.openDefaultPresetsFolder();
        if (res && res.ok) {
          // Folder opened successfully; do not show intrusive notifications
          log.debug('config/presets_defaults floder opened in explorer.');
          return;
        }

        // In case of failure, inform the user
        const errMsg = res && res.error ? String(res.error) : 'Unknown';
        log.error('default presets folder failed to open:', errMsg);
        window.Notify.notifyMain('renderer.alerts.open_presets_fail');
      } catch (err) {
        log.error('default presets folder failed to open', err);
        window.Notify.notifyMain('renderer.alerts.open_presets_error');
      }
    });
    registerMenuActionGuarded('disconnect_google_ocr', async () => {
      if (!importExtractOcrDisconnect
        || typeof importExtractOcrDisconnect.startFromPreferencesMenu !== 'function') {
        log.warnOnce(
          'renderer.importExtract.ocrDisconnect.entrypoint.unavailable',
          'ImportExtractOcrDisconnect.startFromPreferencesMenu unavailable; menu action skipped.'
        );
        window.Notify.notifyMain('renderer.alerts.import_extract_ocr_disconnect_failed');
        return;
      }

      await importExtractOcrDisconnect.startFromPreferencesMenu();
    });

    registerMenuActionGuarded('links_interes', () => { showInfoModal('links_interes') });

    registerMenuActionGuarded('actualizar_version', async () => {
      try {
        const checkForUpdates = getOptionalElectronMethod('checkForUpdates', {
          dedupeKey: 'renderer.ipc.checkForUpdates.unavailable',
          unavailableMessage: 'checkForUpdates unavailable; update check action skipped.'
        });
        if (!checkForUpdates) return;
        await checkForUpdates(true);
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
  if (!hasRendererPresetsBridge) {
    log.warnOnce(
      'renderer.bridge.RendererPresets.change.unavailable',
      'Preset change ignored because RendererPresets bridge is unavailable.'
    );
    return;
  }
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
        wpm = syncWpmControls(selected.wpm);
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

function applyReadingTestWpm(rawWpm) {
  wpm = syncWpmControls(rawWpm);
  resetPresetSelection();
  updateTimeOnlyFromStats();
}

readingSpeedTestUi.configure({
  onLockChange: syncMainInteractionLockUi,
  applyWpm: applyReadingTestWpm,
});

// Keep slider/input in sync and invalidate preset selection
wpmSlider.addEventListener('input', () => {
  if (!guardUserAction('wpm-slider')) return;
  wpm = wpmFromSliderControl(wpmSlider.value);
  wpmInput.value = String(wpm);
  resetPresetSelection();
  updateTimeOnlyFromStats();
});

wpmInput.addEventListener('blur', () => {
  if (!guardUserAction('wpm-input-blur')) return;
  let val = Number(wpmInput.value);
  if (isNaN(val)) val = wpmFromSliderControl(wpmSlider ? wpmSlider.value : WPM_MIN);
  wpm = syncWpmControls(val);
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
// Clipboard and text-apply helpers
// =============================================================================
async function readClipboardText({ tooLargeKey, unavailableKey }) {
  const readClipboard = getOptionalElectronMethod('readClipboard', {
    dedupeKey: 'renderer.ipc.readClipboard.unavailable',
    unavailableMessage: 'readClipboard unavailable; clipboard action skipped.'
  });
  if (!readClipboard) {
    if (unavailableKey) window.Notify.notifyMain(unavailableKey);
    return { ok: false, unavailable: true };
  }

  const res = await readClipboard();
  if (res && res.ok === false) {
    if (res.tooLarge === true) {
      window.Notify.notifyMain(tooLargeKey);
      return { ok: false, tooLarge: true };
    }
    throw new Error(res.error || 'clipboard read failed');
  }
  const text = (res && typeof res === 'object') ? (res.text || '') : (res || '');
  return { ok: true, text };
}

function normalizeClipboardRepeat(rawValue) {
  const textApplyApi = window.TextApplyCanonical;
  if (textApplyApi && typeof textApplyApi.normalizeRepeat === 'function') {
    return textApplyApi.normalizeRepeat(rawValue, { maxRepeat: MAX_CLIPBOARD_REPEAT });
  }
  const numericValue = Number(rawValue);
  if (!Number.isInteger(numericValue) || numericValue < 1) return 1;
  return Math.min(numericValue, MAX_CLIPBOARD_REPEAT);
}

function getClipboardRepeatCount() {
  if (!clipboardRepeatInput) return 1;
  const normalized = normalizeClipboardRepeat(clipboardRepeatInput.value);
  clipboardRepeatInput.value = String(normalized);
  updateClipboardRepeatVisualState(normalized);
  return normalized;
}

function getTextApplyCanonicalApi() {
  const api = window.TextApplyCanonical;
  if (!api || typeof api.applyTextWithMode !== 'function') {
    log.warnOnce(
      'renderer.textApplyCanonical.unavailable',
      'TextApplyCanonical.applyTextWithMode unavailable; canonical apply flow cannot continue.'
    );
    return null;
  }
  return api;
}

async function applyTextViaCanonicalPath({ mode, textToApply, repeatCount }) {
  const textApplyApi = getTextApplyCanonicalApi();
  if (!textApplyApi) return { ok: false, code: 'APPLY_API_UNAVAILABLE' };

  const setCurrentText = getOptionalElectronMethod('setCurrentText', {
    dedupeKey: 'renderer.ipc.setCurrentText.unavailable',
    unavailableMessage: 'setCurrentText unavailable; text apply skipped.'
  });
  if (!setCurrentText) return { ok: false, code: 'SET_CURRENT_TEXT_UNAVAILABLE' };

  let getCurrentText = null;
  if (mode === 'append') {
    getCurrentText = getOptionalElectronMethod('getCurrentText', {
      dedupeKey: 'renderer.ipc.getCurrentText.unavailable',
      unavailableMessage: 'getCurrentText unavailable; append apply skipped.'
    });
    if (!getCurrentText) return { ok: false, code: 'GET_CURRENT_TEXT_UNAVAILABLE' };
  }

  return await textApplyApi.applyTextWithMode({
    mode,
    textToApply,
    repeatCount,
    maxRepeat: MAX_CLIPBOARD_REPEAT,
    maxTextChars,
    maxIpcChars,
    getCurrentText,
    setCurrentText,
    source: 'main-window',
  });
}

// =============================================================================
// Import/extract integration helpers
// =============================================================================
async function maybeRecoverImportExtractOcrSetupAndRetry({
  preparation,
  preparationRequest,
  prepareImportExtractSelectedFile,
  routePreference = '',
}) {
  const recoveryApi = window.ImportExtractOcrActivationRecovery;
  if (!recoveryApi || typeof recoveryApi.recoverAfterSetupFailure !== 'function') {
    log.warnOnce(
      'renderer.importExtract.ocrActivationRecovery.unavailable',
      'ImportExtractOcrActivationRecovery.recoverAfterSetupFailure unavailable; OCR setup auto-recovery disabled.'
    );
    return { preparation, handled: false };
  }

  try {
    return await recoveryApi.recoverAfterSetupFailure({
      preparation,
      retryPrepare: async () => {
        return await requestPreparedImport({
          prepareImportExtractSelectedFile,
          preparationRequest,
        });
      },
      getOptionalElectronMethod,
      routePreference,
    });
  } catch (err) {
    log.error('import/extract OCR setup recovery module failed unexpectedly:', err);
    return { preparation, handled: false };
  }
}

async function resolveDroppedFilePath(file) {
  const getPathForFile = getOptionalElectronMethod('getPathForFile', {
    dedupeKey: 'renderer.ipc.getPathForFile.unavailable',
    unavailableMessage: 'getPathForFile unavailable; dropped file path cannot be resolved.'
  });
  if (getPathForFile) {
    try {
      const resolvedPath = getPathForFile(file);
      if (typeof resolvedPath === 'string' && resolvedPath.trim()) {
        return resolvedPath.trim();
      }
    } catch (err) {
      log.error('Failed to resolve dropped file path via electronAPI.getPathForFile:', err);
    }
  }

  const fallbackPath = file && typeof file.path === 'string'
    ? file.path.trim()
    : '';
  return fallbackPath;
}

// renderer.js owns only app-level feature wiring here.
// The shared import/extract flow stays in the delegated window modules.
function configureImportExtractModules() {
  importExtractEntry.configure({
    applyTextViaCanonicalPath,
    getClipboardRepeatCount,
    getOcrLanguage: () => idiomaActual || '',
    getOptionalElectronMethod,
    guardUserAction,
    hasBlockingModalOpen: hasBlockingMainWindowModalOpen,
    hasCurrentTextSubscription: () => hasCurrentTextSubscription,
    importExtractStatusUi,
    isLatestImportExtractPrepareAttempt,
    maybeRecoverImportExtractOcrSetupAndRetry,
    requestPreparedImport,
  });

  importExtractDragDrop.configure({
    canAcceptDrop: canAcceptImportExtractDrop,
    resolveDroppedFilePath,
    startFromFilePath: importExtractEntry.startFromFilePath,
  });

  if (importExtractOcrDisconnect
    && typeof importExtractOcrDisconnect.configure === 'function') {
    importExtractOcrDisconnect.configure({
      getOptionalElectronMethod,
    });
  } else {
    log.warnOnce(
      'renderer.importExtract.ocrDisconnect.unavailable',
      'ImportExtractOcrDisconnect.configure unavailable; Preferences > Disconnect Google OCR will be disabled.'
    );
  }
}

configureImportExtractModules();

if (mainLogoLinks && typeof mainLogoLinks.bindBrandLinks === 'function') {
  mainLogoLinks.bindBrandLinks({ electronAPI: window.electronAPI });
} else {
  log.warnOnce(
    'renderer.mainLogoLinks.bindBrandLinks.unavailable',
    'MainLogoLinks.bindBrandLinks unavailable; brand logo links disabled.'
  );
}

// =============================================================================
// Import/extract entrypoint wiring
// =============================================================================
if (btnImportExtract) {
  btnImportExtract.addEventListener('click', async () => {
    await importExtractEntry.startFromPicker();
  });
}

if (btnImportExtractAbort) {
  btnImportExtractAbort.addEventListener('click', async () => {
    if (!guardUserAction('import-extract-abort', { allowDuringProcessing: true })) return;
    try {
      const requestImportExtractAbort = getOptionalElectronMethod('requestImportExtractAbort', {
        dedupeKey: 'renderer.ipc.requestImportExtractAbort.unavailable',
        unavailableMessage: 'requestImportExtractAbort unavailable; abort action skipped.'
      });
      if (!requestImportExtractAbort) {
        window.Notify.notifyMain('renderer.alerts.import_extract_abort_error');
        return;
      }

      const result = await requestImportExtractAbort({
        source: 'main_window',
        reason: 'user_abort_button',
      });
      if (!result || result.ok !== true) {
        if (result && result.code === 'NOT_ACTIVE' && result.state) {
          importExtractStatusUi.applyProcessingModeState(result.state, { source: 'abort_not_active' });
          return;
        }
        log.error('import/extract abort failed:', result);
        window.Notify.notifyMain('renderer.alerts.import_extract_abort_error');
        return;
      }

      if (result.state) {
        importExtractStatusUi.applyProcessingModeState(result.state, { source: 'abort_response' });
      }
      window.Notify.notifyMain('renderer.alerts.import_extract_cancelled');
    } catch (err) {
      log.error('Error handling import/extract abort:', err);
      window.Notify.notifyMain('renderer.alerts.import_extract_abort_error');
    }
  });
}

// =============================================================================
// Overwrite current text with clipboard content
// =============================================================================
btnOverwriteClipboard.addEventListener('click', async () => {
  if (!guardUserAction('clipboard-overwrite')) return;
  try {
    const read = await readClipboardText({
      tooLargeKey: 'renderer.alerts.clipboard_too_large',
      unavailableKey: 'renderer.alerts.clipboard_error'
    });
    if (!read.ok) return;
    const clip = read.text;
    const repeatCount = getClipboardRepeatCount();
    const applyResult = await applyTextViaCanonicalPath({
      mode: 'overwrite',
      textToApply: clip,
      repeatCount,
    });
    if (!applyResult || applyResult.ok !== true) {
      if (applyResult && applyResult.code === 'PAYLOAD_TOO_LARGE') {
        window.Notify.notifyMain('renderer.alerts.clipboard_too_large');
      } else {
        window.Notify.notifyMain('renderer.alerts.clipboard_error');
      }
      return;
    }

    // UI/state sync is authoritative via "current-text-updated" subscription.
    if (!hasCurrentTextSubscription) {
      throw new Error('current-text-updated subscription unavailable');
    }
    if (applyResult.truncated) {
      window.Notify.notifyMain('renderer.alerts.clipboard_overflow');
    }
  } catch (err) {
    log.error('clipboard error:', err);
    window.Notify.notifyMain('renderer.alerts.clipboard_error');
  }
});

// =============================================================================
// Append clipboard content to current text
// =============================================================================
btnAppendClipboard.addEventListener('click', async () => {
  if (!guardUserAction('clipboard-append')) return;
  try {
    const read = await readClipboardText({
      tooLargeKey: 'renderer.alerts.append_too_large',
      unavailableKey: 'renderer.alerts.append_error'
    });
    if (!read.ok) return;
    const clip = read.text;
    const repeatCount = getClipboardRepeatCount();
    const applyResult = await applyTextViaCanonicalPath({
      mode: 'append',
      textToApply: clip,
      repeatCount,
    });
    if (!applyResult || applyResult.ok !== true) {
      if (applyResult && applyResult.code === 'PAYLOAD_TOO_LARGE') {
        window.Notify.notifyMain('renderer.alerts.append_too_large');
      } else if (applyResult && applyResult.code === 'TEXT_LIMIT') {
        window.Notify.notifyMain('renderer.alerts.text_limit');
      } else {
        window.Notify.notifyMain('renderer.alerts.append_error');
      }
      return;
    }

    // UI/state sync is authoritative via "current-text-updated" subscription.
    if (!hasCurrentTextSubscription) {
      throw new Error('current-text-updated subscription unavailable');
    }

    // Notify truncation only if main confirms it
    if (applyResult.truncated) {
      window.Notify.notifyMain('renderer.alerts.append_overflow');
    }
  } catch (err) {
    log.error('An error occurred while pasting the clipboard:', err);
    window.Notify.notifyMain('renderer.alerts.append_error');
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
    const openEditor = getOptionalElectronMethod('openEditor', {
      dedupeKey: 'renderer.ipc.openEditor.unavailable',
      unavailableMessage: 'openEditor unavailable; editor launch skipped.'
    });
    if (!openEditor) {
      hideeditorLoader();
      return;
    }
    await openEditor();
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
    const setCurrentText = getOptionalElectronMethod('setCurrentText', {
      dedupeKey: 'renderer.ipc.setCurrentText.unavailable',
      unavailableMessage: 'setCurrentText unavailable; clear-text action skipped.'
    });
    if (!setCurrentText) {
      window.Notify.notifyMain('renderer.alerts.clear_error');
      return;
    }
    const resp = await setCurrentText({
      text: '',
      meta: { source: 'main-window', action: 'overwrite' }
    });
    if (resp && resp.ok === false) {
      throw new Error(resp.error || 'set-current-text failed');
    }
    // UI/state sync is authoritative via "current-text-updated" subscription.
    if (!hasCurrentTextSubscription) {
      throw new Error('current-text-updated subscription unavailable');
    }
  } catch (err) {
    log.error('Error clearing text from main window:', err);
    window.Notify.notifyMain('renderer.alerts.clear_error');
  }
});

btnLoadSnapshot.addEventListener('click', async () => {
  if (!guardUserAction('snapshot-load')) return;
  if (typeof loadSnapshot !== 'function') {
    log.warnOnce(
      'renderer.snapshot.load.unavailable',
      'loadSnapshot unavailable; snapshot-load action skipped.'
    );
    return;
  }
  try {
    await loadSnapshot();
  } catch (err) {
    log.error('Error loading snapshot:', err);
  }
});

btnSaveSnapshot.addEventListener('click', async () => {
  if (!guardUserAction('snapshot-save')) return;
  if (typeof saveSnapshot !== 'function') {
    log.warnOnce(
      'renderer.snapshot.save.unavailable',
      'saveSnapshot unavailable; snapshot-save action skipped.'
    );
    return;
  }
  try {
    await saveSnapshot();
  } catch (err) {
    log.error('Error saving snapshot:', err);
  }
});

// =============================================================================
// Task selector (open task editor)
// =============================================================================
function handleTaskOpenResult(res, { mode } = {}) {
  if (!res || res.ok === false) {
    const code = res && res.code ? res.code : 'READ_FAILED';
    if (code === 'CANCELLED' || code === 'CONFIRM_DENIED') return;
    if (code === 'PATH_OUTSIDE_TASKS') {
      window.Notify.notifyMain('renderer.tasks.alerts.task_path_outside');
      return;
    }
    if (code === 'INVALID_JSON' || code === 'INVALID_SCHEMA') {
      window.Notify.notifyMain('renderer.tasks.alerts.task_invalid_file');
      return;
    }
    window.Notify.notifyMain(mode === 'load'
      ? 'renderer.tasks.alerts.task_load_error'
      : 'renderer.tasks.alerts.task_open_error');
    return;
  }
}

if (btnNewTask) {
  btnNewTask.addEventListener('click', async () => {
    if (!guardUserAction('task-new')) return;
    try {
      if (!window.electronAPI || typeof window.electronAPI.openTaskEditor !== 'function') {
        log.warnOnce(
          'renderer.ipc.openTaskEditor.unavailable',
          'openTaskEditor unavailable; new-task action skipped.'
        );
        window.Notify.notifyMain('renderer.tasks.alerts.task_unavailable');
        return;
      }
      const res = await window.electronAPI.openTaskEditor('new');
      handleTaskOpenResult(res, { mode: 'new' });
    } catch (err) {
      log.error('Error opening task editor (new):', err);
      window.Notify.notifyMain('renderer.tasks.alerts.task_open_error');
    }
  });
}

if (btnLoadTask) {
  btnLoadTask.addEventListener('click', async () => {
    if (!guardUserAction('task-load')) return;
    try {
      if (!window.electronAPI || typeof window.electronAPI.openTaskEditor !== 'function') {
        log.warnOnce(
          'renderer.ipc.openTaskEditor.unavailable',
          'openTaskEditor unavailable; load-task action skipped.'
        );
        window.Notify.notifyMain('renderer.tasks.alerts.task_unavailable');
        return;
      }
      const res = await window.electronAPI.openTaskEditor('load');
      handleTaskOpenResult(res, { mode: 'load' });
    } catch (err) {
      log.error('Error opening task editor (load):', err);
      window.Notify.notifyMain('renderer.tasks.alerts.task_load_error');
    }
  });
}

// Help button: show a random tip key via Notify
if (btnHelp) {
  btnHelp.addEventListener('click', () => {
    if (!guardUserAction('help-tip')) return;
    const helpTipKeys = getHelpTipKeyList();
    const tipCount = helpTipKeys.length;
    if (!tipCount) {
      log.error('Help tip list is empty.');
      window.Notify.notifyMain('renderer.main.tips.results_help.tip1');
      return;
    }

    let idx = Math.floor(Math.random() * tipCount);
    if (tipCount > 1 && idx === lastHelpTipIdx) {
      idx = Math.floor(Math.random() * (tipCount - 1));
      if (idx >= lastHelpTipIdx) idx += 1;
    }
    lastHelpTipIdx = idx;

    const tipKey = helpTipKeys[idx];

    try {
      try {
        window.Notify.toastMain(tipKey);
      } catch (err) {
        log.error('Error showing help tip toast:', err);
        window.Notify.notifyMain(tipKey);
      }
    } catch (err) {
      log.error('Help tip fallback failed:', err);
    }
  });
}

// =============================================================================
// Reading tools
// =============================================================================
if (btnReadingSpeedTest) {
  btnReadingSpeedTest.addEventListener('click', async () => {
    if (!guardUserAction('reading-speed-test')) return;
    try {
      await readingSpeedTestUi.openEntryFlow();
    } catch (err) {
      log.error('Error opening reading speed test flow:', err);
      window.Notify.notifyMain('renderer.alerts.reading_test_start_failed');
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
      log.warnOnce(
        'renderer.ipc.openPresetModal.unavailable',
        'openPresetModal unavailable in electronAPI; preset-new action skipped.'
      );
      window.Notify.notifyMain('renderer.alerts.modal_unavailable');
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
        log.warnOnce(
          'renderer.ipc.notifyNoSelectionEdit.unavailable',
          'notifyNoSelectionEdit unavailable; using renderer fallback notification.'
        );
        window.Notify.notifyMain('renderer.alerts.edit_none');
        return;
      }
    }

    // Find preset data from cache
    const preset = allPresetsCache.find(p => p.name === selectedName);
    if (!preset) {
      window.Notify.notifyMain('renderer.alerts.preset_not_found');
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
      log.warnOnce(
        'renderer.ipc.openPresetModal.unavailable',
        'openPresetModal unavailable in electronAPI; preset-edit action skipped.'
      );
      window.Notify.notifyMain('renderer.alerts.edit_unavailable');
    }
  } catch (err) {
    log.error('Error opening edit preset modal:', err);
    window.Notify.notifyMain('renderer.alerts.edit_error');
  }
});

// =============================================================================
// Delete preset
// =============================================================================
btnDeletePreset.addEventListener('click', async () => {
  if (!guardUserAction('preset-delete')) return;
  try {
    const name = presetsSelect.value || null;
    const requestDeletePreset = getOptionalElectronMethod('requestDeletePreset', {
      dedupeKey: 'renderer.ipc.requestDeletePreset.unavailable',
      unavailableMessage: 'requestDeletePreset unavailable; preset-delete action skipped.'
    });
    if (!requestDeletePreset) {
      window.Notify.notifyMain('renderer.alerts.delete_error');
      return;
    }
    // Call main to request deletion; main shows native dialogs as needed
    const res = await requestDeletePreset(name);

    if (res && res.ok) {
      // On success, reload presets and apply fallback selection if needed.
      await loadPresets({ settingsSnapshot: settingsCache || {} });
      startPreviewAndResultsUpdate(currentText, 'preset delete');
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
      window.Notify.notifyMain('renderer.alerts.delete_error');
    }
  } catch (err) {
    log.error('Error in deletion request:', err);
    window.Notify.notifyMain('renderer.alerts.delete_error');
  }
});

// =============================================================================
// Restore default presets
// =============================================================================
btnResetDefaultPresets.addEventListener('click', async () => {
  if (!guardUserAction('preset-reset-defaults')) return;
  try {
    const requestRestoreDefaults = getOptionalElectronMethod('requestRestoreDefaults', {
      dedupeKey: 'renderer.ipc.requestRestoreDefaults.unavailable',
      unavailableMessage: 'requestRestoreDefaults unavailable; presets restore action skipped.'
    });
    if (!requestRestoreDefaults) {
      window.Notify.notifyMain('renderer.alerts.restore_error');
      return;
    }
    // Call main to request restore. Main will show a native confirmation dialog.
    const res = await requestRestoreDefaults();

    if (res && res.ok) {
      // Reload presets to reflect restored defaults
      await loadPresets({ settingsSnapshot: settingsCache || {} });
      startPreviewAndResultsUpdate(currentText, 'preset restore');
      return;
    } else {
      if (res && res.code === 'CANCELLED') {
        // User cancelled in native dialog; nothing to do
        return;
      }
      log.error('Error restoring presets:', res && res.error ? res.error : res);
      window.Notify.notifyMain('renderer.alerts.restore_error');
    }
  } catch (err) {
    log.error('Error in restoring request:', err);
    window.Notify.notifyMain('renderer.alerts.restore_error');
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
syncMainInteractionLockUi();
runStartupOrchestrator();

// =============================================================================
// End of public/renderer.js
// =============================================================================
