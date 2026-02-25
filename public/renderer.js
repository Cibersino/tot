// public/renderer.js
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
  MAX_PASTE_REPEAT,
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
const pasteRepeatInput = document.getElementById('pasteRepeatInput');
const btnEdit = document.getElementById('btnEdit');
const btnEmptyMain = document.getElementById('btnEmptyMain');
const btnLoadSnapshot = document.getElementById('btnLoadSnapshot');
const btnSaveSnapshot = document.getElementById('btnSaveSnapshot');
const btnNewTask = document.getElementById('btnNewTask');
const btnLoadTask = document.getElementById('btnLoadTask');
const btnHelp = document.getElementById('btnHelp');

const importOcrUi = window.ImportOcrUi || null;
if (!importOcrUi) {
  throw new Error('[renderer] ImportOcrUi unavailable; cannot continue');
}
const btnCancelOcr = typeof importOcrUi.getCancelButton === 'function'
  ? importOcrUi.getCancelButton()
  : null;

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
if (pasteRepeatInput) {
  pasteRepeatInput.min = '1';
  pasteRepeatInput.max = String(MAX_PASTE_REPEAT);
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

function isInteractionGateBlocked() {
  return !!interactionGateBlocked;
}

function guardUserAction(actionId, { allowWhenInteractionBlocked = false } = {}) {
  if (!isRendererReady()) {
    log.warnOnce(
      `BOOTSTRAP:renderer.preReady.${actionId}`,
      'Renderer action ignored (pre-READY):',
      actionId
    );
    return false;
  }
  if (isInteractionGateBlocked() && !allowWhenInteractionBlocked) {
    log.warnOnce(
      `INTERACTION_BLOCKED:renderer.action.${actionId}`,
      `Interaction gate active: blocked renderer action '${actionId}'.`
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
let interactionGateBlocked = false;
let interactionGateReason = '';
const importJobSessionMap = new Map();
const importJobIsOcrMap = new Map();

if (btnCancelOcr) {
  btnCancelOcr.dataset.interactionGateExempt = '1';
}

function isOcrRoute(route) {
  if (!importOcrUi || typeof importOcrUi.isOcrRoute !== 'function') return false;
  return importOcrUi.isOcrRoute(route);
}

function getDefaultImportRunOptions() {
  if (!importOcrUi || typeof importOcrUi.getDefaultRunOptions !== 'function') {
    return { languageTag: idiomaActual || DEFAULT_LANG, timeoutPerPageSec: 90 };
  }
  return importOcrUi.getDefaultRunOptions();
}

async function getAvailableOcrLanguages() {
  const importGetOcrLanguages = getOptionalElectronMethod('importGetOcrLanguages', {
    dedupeKey: 'renderer.ipc.importGetOcrLanguages.unavailable',
    unavailableMessage: 'importGetOcrLanguages unavailable; OCR language options cannot be resolved.'
  });
  if (!importGetOcrLanguages) {
    return { ok: false, code: 'IMPORT_UNAVAILABLE', message: 'importGetOcrLanguages unavailable' };
  }

  try {
    const res = await importGetOcrLanguages();
    if (!res || res.ok !== true) {
      return res || { ok: false, code: 'IMPORT_UNAVAILABLE', message: 'importGetOcrLanguages failed' };
    }
    const availableUiLanguages = Array.isArray(res.availableUiLanguages)
      ? res.availableUiLanguages.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
      : [];
    if (!availableUiLanguages.length) {
      return { ok: false, code: 'OCR_LANG_UNAVAILABLE', message: 'No OCR language options available.' };
    }
    return {
      ok: true,
      availableUiLanguages,
    };
  } catch (err) {
    log.error('Failed to resolve OCR language capabilities:', err);
    return { ok: false, code: 'IMPORT_UNAVAILABLE', message: 'importGetOcrLanguages threw an exception.' };
  }
}

function formatImportElapsedLabel(ms) {
  const totalSeconds = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  return `${minutes}m ${seconds}s`;
}

function setMainPasteRepeatValue(rawValue) {
  const normalized = normalizePasteRepeat(rawValue);
  if (pasteRepeatInput) {
    pasteRepeatInput.value = String(normalized);
  }
  return normalized;
}

function getMainPasteRepeatValue() {
  if (!pasteRepeatInput) return 1;
  return setMainPasteRepeatValue(pasteRepeatInput.value);
}

function promptImportChoice(choice = {}) {
  const safeChoice = (choice && typeof choice === 'object') ? choice : {};
  if (!importOcrUi || typeof importOcrUi.promptChoice !== 'function') {
    throw new Error('[renderer] ImportOcrUi.promptChoice unavailable; cannot continue.');
  }
  return importOcrUi.promptChoice(safeChoice);
}

async function chooseImportApplyChoice(options = {}) {
  const opts = options && typeof options === 'object' ? options : {};
  const isOcrJob = !!opts.isOcrJob;
  const summary = opts.summary && typeof opts.summary === 'object' ? opts.summary : {};
  const initialRepeat = getMainPasteRepeatValue();
  const baseTitle = tRenderer
    ? tRenderer('renderer.main.import_apply.title', 'Import finished. Choose apply mode:')
    : 'Import finished. Choose apply mode:';
  let applyTitle = baseTitle;
  const elapsedMs = Number(summary.elapsedMs);
  if (isOcrJob && Number.isFinite(elapsedMs) && elapsedMs > 0) {
    const elapsed = formatImportElapsedLabel(elapsedMs);
    applyTitle = msgRenderer
      ? msgRenderer(
        'renderer.main.import_apply.title_with_elapsed',
        { elapsed },
        `${baseTitle} OCR completed in ${elapsed}.`
      )
      : `${baseTitle} OCR completed in ${elapsed}.`;
  }

  const choice = {
    title: applyTitle,
    context: '',
    primaryLabel: tRenderer
      ? tRenderer('renderer.main.import_apply.overwrite', 'Overwrite')
      : 'Overwrite',
    primaryValue: 'overwrite',
    secondaryLabel: tRenderer
      ? tRenderer('renderer.main.import_apply.append', 'Append')
      : 'Append',
    secondaryValue: 'append',
    dismissValue: '',
    showRepeatInput: true,
    repeatLabel: tRenderer
      ? tRenderer('renderer.main.import_apply.repeat_count', 'Repeat count')
      : 'Repeat count',
    repeatAriaLabel: tRenderer
      ? tRenderer('renderer.main.import_apply.repeat_count', 'Repeat count')
      : 'Repeat count',
    repeatValue: initialRepeat,
    repeatMin: 1,
    repeatMax: MAX_PASTE_REPEAT,
    repeatStep: 1,
    onRepeatChange: (nextRepeat) => {
      setMainPasteRepeatValue(nextRepeat);
    },
  };
  const rawChoice = await promptImportChoice(choice);
  const choicePayload = (rawChoice && typeof rawChoice === 'object')
    ? rawChoice
    : { value: rawChoice, repeatCount: initialRepeat };
  const mode = String(choicePayload.value || '').trim().toLowerCase();
  const repeatCount = setMainPasteRepeatValue(choicePayload.repeatCount);
  return { mode, repeatCount };
}

function choosePdfSelectableExtractionMode() {
  const title = tRenderer
    ? tRenderer(
      'renderer.main.pdf_selectable_choice.title',
      'PDF with selectable text detected'
    )
    : 'PDF with selectable text detected';
  const message = tRenderer
    ? tRenderer(
      'renderer.main.pdf_selectable_choice.message',
      'Recommendation: try it on normal first. If results are not good, use extraction via OCR.'
    )
    : 'Recommendation: try it on normal first. If results are not good, use extraction via OCR.';
  const choice = {
    title,
    context: message,
    primaryLabel: tRenderer
      ? tRenderer('renderer.main.pdf_selectable_choice.normal', 'Normal extraction')
      : 'Normal extraction',
    primaryValue: 'normal',
    secondaryLabel: tRenderer
      ? tRenderer('renderer.main.pdf_selectable_choice.ocr', 'Extraction via OCR')
      : 'Extraction via OCR',
    secondaryValue: 'ocr',
    dismissValue: '',
  };
  return promptImportChoice(choice).then((rawChoice) => {
    if (rawChoice && typeof rawChoice === 'object') {
      return String(rawChoice.value || '');
    }
    return String(rawChoice || '');
  });
}

function promptOcrOptionsDialog(payload) {
  if (!importOcrUi || typeof importOcrUi.promptOcrOptionsDialog !== 'function') {
    return Promise.resolve({
      confirmed: true,
      options: getDefaultImportRunOptions(),
    });
  }
  return importOcrUi.promptOcrOptionsDialog(payload || {});
}

function handleImportProgress(payload) {
  if (!importOcrUi || typeof importOcrUi.handleImportProgress !== 'function') return;
  importOcrUi.handleImportProgress(payload || {});
}

function noteQueuedOcrJob(payload) {
  if (!importOcrUi || typeof importOcrUi.noteJobQueued !== 'function') return;
  importOcrUi.noteJobQueued(payload);
}

function applyGlobalInteractionGateUi() {
  const controls = document.querySelectorAll('button, input, select, textarea');
  controls.forEach((el) => {
    if (!el || el.dataset.interactionGateExempt === '1') return;
    if (interactionGateBlocked) {
      if (!Object.prototype.hasOwnProperty.call(el.dataset, 'interactionGatePrevDisabled')) {
        el.dataset.interactionGatePrevDisabled = el.disabled ? '1' : '0';
      }
      el.disabled = true;
      return;
    }
    if (!Object.prototype.hasOwnProperty.call(el.dataset, 'interactionGatePrevDisabled')) return;
    el.disabled = (el.dataset.interactionGatePrevDisabled === '1');
    delete el.dataset.interactionGatePrevDisabled;
  });
}

function syncOcrControlVisibility() {
  if (!importOcrUi || typeof importOcrUi.setLockState !== 'function') return;
  importOcrUi.setLockState({
    locked: interactionGateBlocked,
    reason: interactionGateReason,
  });
}

function updateInteractionGateState(payload) {
  const nextBlocked = !!(payload && payload.blocked);
  const nextReason = nextBlocked
    ? String((payload && payload.reason) || 'OCR_RUNNING')
    : '';
  const changed = (interactionGateBlocked !== nextBlocked) || (interactionGateReason !== nextReason);
  interactionGateBlocked = nextBlocked;
  interactionGateReason = nextReason;
  if (!changed) {
    syncOcrControlVisibility();
    return;
  }
  applyGlobalInteractionGateUi();
  syncOcrControlVisibility();
}

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

function showImportDialogMessage(keyPath) {
  const key = String(keyPath || '').trim();
  if (!key) return;
  try {
    if (typeof window.Notify?.notifyMain === 'function') {
      window.Notify.notifyMain(key);
      return;
    }
    log.warnOnce(
      'renderer.notifyMain.unavailable.import_dialog',
      'Notify.notifyMain unavailable; falling back to window.alert for import message.'
    );
    const fallbackText = (
      window.RendererI18n
      && typeof window.RendererI18n.msgRenderer === 'function'
    )
      ? window.RendererI18n.msgRenderer(key, {}, key)
      : key;
    window.alert(fallbackText);
  } catch (err) {
    log.warn('Unable to show import dialog message:', err);
  }
}

const IMPORT_ERROR_MESSAGE_KEYS = Object.freeze({
  IMPORT_UNAVAILABLE: 'renderer.alerts.import_unavailable',
  IMPORT_DEP_MISSING_MAMMOTH: 'renderer.alerts.import_dep_missing_mammoth',
  IMPORT_DEP_MISSING_PDFJS: 'renderer.alerts.import_dep_missing_pdfjs',
  IMPORT_TEXT_DECODE_FAILED: 'renderer.alerts.import_decode_failed',
  IMPORT_TEXT_ENCODING_UNSUPPORTED: 'renderer.alerts.import_decode_failed',
  IMPORT_TEXT_BINARY_DETECTED: 'renderer.alerts.import_text_binary_detected',
  IMPORT_SIGNATURE_MISMATCH: 'renderer.alerts.import_signature_mismatch',
  IMPORT_UNSUPPORTED_FORMAT: 'renderer.alerts.import_unsupported_format',
  IMPORT_UNSUPPORTED_KIND: 'renderer.alerts.import_unsupported_format',
  IMPORT_READ_FAILED: 'renderer.alerts.import_read_failed',
  IMPORT_DOCX_EXTRACT_FAILED: 'renderer.alerts.import_read_failed',
  IMPORT_PDF_EXTRACT_FAILED: 'renderer.alerts.import_read_failed',
  IMPORT_INVALID_PATH: 'renderer.alerts.import_invalid_path',
  IMPORT_INVALID_SESSION: 'renderer.alerts.import_invalid_path',
  IMPORT_INVALID_PAYLOAD: 'renderer.alerts.import_invalid_payload',
  IMPORT_SESSION_NOT_FOUND: 'renderer.alerts.import_session_not_found',
  IMPORT_NOT_READY_TO_APPLY: 'renderer.alerts.import_not_ready_to_apply',
  IMPORT_APPLY_UNAVAILABLE: 'renderer.alerts.import_apply_unavailable',
  IMPORT_BUSY: 'renderer.alerts.import_busy',
  IMPORT_EXEC_FAILED: 'renderer.alerts.import_failed_generic',
  OCR_UNAVAILABLE_PLATFORM: 'renderer.alerts.import_ocr_unavailable_platform',
  OCR_PLATFORM_PROFILE_INVALID: 'renderer.alerts.import_ocr_unavailable_platform',
  OCR_BINARY_MISSING: 'renderer.alerts.import_ocr_binary_missing',
  OCR_RUNTIME_PATH_INVALID: 'renderer.alerts.import_ocr_binary_missing',
  OCR_RUNTIME_NOT_VALIDATED: 'renderer.alerts.import_ocr_binary_missing',
  OCR_EXEC_FAILED: 'renderer.alerts.import_ocr_exec_failed',
  OCR_PROCESS_INVALID: 'renderer.alerts.import_ocr_exec_failed',
  OCR_PROCESS_TERMINATE_FAILED: 'renderer.alerts.import_ocr_exec_failed',
  OCR_PROCESS_KILL_FAILED: 'renderer.alerts.import_ocr_exec_failed',
  OCR_RASTER_FAILED: 'renderer.alerts.import_ocr_raster_failed',
  OCR_TIMEOUT_PAGE: 'renderer.alerts.import_ocr_timeout_page',
  OCR_TIMEOUT_JOB: 'renderer.alerts.import_ocr_timeout_job',
  OCR_LANG_UNSUPPORTED: 'renderer.alerts.import_ocr_lang_unsupported',
  OCR_LANG_UNAVAILABLE: 'renderer.alerts.import_ocr_lang_unavailable',
  OCR_EMPTY_RESULT: 'renderer.alerts.import_ocr_empty_result',
  OCR_NOT_RUNNING: 'renderer.alerts.import_ocr_not_running',
  OCR_CANCELED: 'renderer.alerts.import_ocr_canceled',
  OCR_CANCEL_KILL_TIMEOUT: 'renderer.alerts.import_ocr_cancel_timeout',
});
const OCR_PRECONDITION_WINDOW_LABELS = Object.freeze({
  editor: 'Manual editor',
  editor_find: 'Find window',
  preset: 'Preset window',
  task_editor: 'Task editor',
  language: 'Language window',
  flotante: 'Floating stopwatch window',
});

function mapPreconditionWindowLabel(rawId) {
  const key = String(rawId || '').trim().toLowerCase();
  if (key && Object.prototype.hasOwnProperty.call(OCR_PRECONDITION_WINDOW_LABELS, key)) {
    return OCR_PRECONDITION_WINDOW_LABELS[key];
  }
  return key || 'Secondary window';
}

function buildOcrPreconditionWarning(res) {
  const p = res && typeof res === 'object' ? res : {};
  const reasons = new Set(
    (Array.isArray(p.reasons) ? p.reasons : [])
      .map((item) => String(item || '').trim().toUpperCase())
      .filter(Boolean)
  );
  const openSecondaryWindows = Array.isArray(p.openSecondaryWindows)
    ? p.openSecondaryWindows.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
    : [];
  const hasSecondaryWindows = reasons.has('SECONDARY_WINDOWS_OPEN') || openSecondaryWindows.length > 0;
  const hasRunningStopwatch = reasons.has('STOPWATCH_RUNNING') || !!p.stopwatchRunning;

  const details = [];
  if (hasSecondaryWindows) {
    if (openSecondaryWindows.length > 0) {
      const labels = Array.from(new Set(openSecondaryWindows.map(mapPreconditionWindowLabel)));
      details.push(`Close these secondary windows: ${labels.join(', ')}.`);
    } else {
      details.push('Close all secondary windows.');
    }
  }
  if (hasRunningStopwatch) {
    details.push('Pause the stopwatch.');
  }
  if (!details.length) {
    details.push('Close any secondary windows and pause the stopwatch.');
  }
  return `Cannot start OCR right now. ${details.join(' ')}`;
}

function showOcrPreconditionWarning(res) {
  const message = buildOcrPreconditionWarning(res);
  try {
    if (typeof window.Notify?.notifyMain === 'function') {
      window.Notify.notifyMain(message);
      return;
    }
    window.alert(message);
  } catch (err) {
    log.warn('Unable to show OCR precondition warning:', err);
  }
}

function humanizeImportError(res) {
  const code = res && typeof res.code === 'string' ? res.code : '';
  const mappedKey = IMPORT_ERROR_MESSAGE_KEYS[code];
  if (mappedKey) return mappedKey;
  if (code === 'INTERACTION_BLOCKED' || code === 'OCR_PRECONDITION_FAILED') {
    return '';
  }
  if (code === 'CANCELLED') {
    return '';
  }
  if (code) {
    log.warnOnce(
      `renderer.import_error.unmapped.${code}`,
      'Unmapped import/OCR error code; using generic key:',
      code
    );
  }
  return 'renderer.alerts.import_failed_generic';
}

async function discardImportSession(sessionId) {
  const importDiscard = getOptionalElectronMethod('importDiscard', {
    dedupeKey: 'renderer.ipc.importDiscard.unavailable',
    unavailableMessage: 'importDiscard unavailable; session cleanup skipped.'
  });
  if (!importDiscard || !sessionId) return;
  try {
    await importDiscard({ sessionId });
  } catch (err) {
    log.warn('Failed to discard import session (ignored):', err);
  }
}

async function startPdfOcrFromSession(sessionId, summary = {}) {
  if (!sessionId) {
    return { ok: false, code: 'IMPORT_SESSION_NOT_FOUND' };
  }

  const safeSummary = summary && typeof summary === 'object' ? summary : {};
  const pageCountHint = Number.isFinite(Number(safeSummary.pagesTotal))
    ? Math.max(1, Math.floor(Number(safeSummary.pagesTotal)))
    : 1;

  const ocrLangRes = await getAvailableOcrLanguages();
  if (!ocrLangRes || ocrLangRes.ok !== true) {
    return ocrLangRes || { ok: false, code: 'OCR_LANG_UNAVAILABLE' };
  }

  const ocrOptsRes = await promptOcrOptionsDialog({
    kind: 'pdf',
    filename: String(safeSummary.filename || ''),
    pageCountHint,
    availableUiLanguages: ocrLangRes.availableUiLanguages,
  });
  if (!ocrOptsRes || ocrOptsRes.confirmed !== true) {
    return { ok: false, code: 'CANCELLED' };
  }

  const importRun = getOptionalElectronMethod('importRun', {
    dedupeKey: 'renderer.ipc.importRun.unavailable',
    unavailableMessage: 'importRun unavailable; PDF OCR fallback execution skipped.'
  });
  if (!importRun) {
    return { ok: false, code: 'IMPORT_UNAVAILABLE' };
  }

  try {
    const ocrRunOptions = Object.assign(
      {},
      getDefaultImportRunOptions(),
      ocrOptsRes.options || {},
      { forcePdfOcr: true }
    );
    const rerunRes = await importRun({
      sessionId,
      options: ocrRunOptions,
    });
    if (!rerunRes || rerunRes.ok !== true || !rerunRes.jobId) {
      return rerunRes || { ok: false, code: 'IMPORT_EXEC_FAILED' };
    }

    const queuedJobId = String(rerunRes.jobId);
    importJobSessionMap.set(queuedJobId, String(sessionId));
    importJobIsOcrMap.set(queuedJobId, true);
    noteQueuedOcrJob({
      jobId: queuedJobId,
      pageCountHint,
      preset: ocrRunOptions.preset || ocrRunOptions.qualityPreset || 'balanced',
      timeoutPerPageSec: ocrRunOptions.timeoutPerPageSec,
      dpi: ocrRunOptions.dpi,
      preprocessProfile: ocrRunOptions.preprocessProfile,
    });
    return { ok: true };
  } catch (err) {
    log.error('Error requesting scanned-PDF OCR fallback:', err);
    return { ok: false, code: 'IMPORT_SCANNED_PDF_OCR_START_FAILED' };
  }
}

async function handlePdfOcrStartFailure(sessionId, startRes) {
  const code = String(startRes && startRes.code || '');
  if (code === 'OCR_PRECONDITION_FAILED') {
    showOcrPreconditionWarning(startRes);
  } else if (code === 'IMPORT_SCANNED_PDF_OCR_START_FAILED') {
    showImportDialogMessage('renderer.alerts.import_scanned_pdf_ocr_start_failed');
  } else {
    const message = humanizeImportError(startRes);
    if (message) showImportDialogMessage(message);
  }
  await discardImportSession(sessionId);
}

async function handlePdfProbeNoTextFallback(sessionId, summary = {}) {
  if (!sessionId) return false;
  const safeSummary = summary && typeof summary === 'object' ? summary : {};
  const startRes = await startPdfOcrFromSession(sessionId, safeSummary);
  if (!startRes || startRes.ok !== true) {
    await handlePdfOcrStartFailure(sessionId, startRes);
  }
  return true;
}

async function handleImportFinished(payload) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const jobId = typeof p.jobId === 'string' ? p.jobId : '';
  const sessionId = jobId ? importJobSessionMap.get(jobId) : '';
  const isOcrJob = jobId ? importJobIsOcrMap.get(jobId) === true : false;
  if (jobId) importJobSessionMap.delete(jobId);
  if (jobId) importJobIsOcrMap.delete(jobId);
  if (importOcrUi && typeof importOcrUi.markImportFinished === 'function') {
    importOcrUi.markImportFinished(p);
  }

  if (!p.ok) {
    if (String(p.code || '') === 'IMPORT_PDF_NO_TEXT_LAYER') {
      if (!sessionId) {
        showImportDialogMessage('renderer.alerts.import_session_mapping_missing');
        return;
      }
      const handled = await handlePdfProbeNoTextFallback(sessionId, p.summary);
      if (handled) return;
    }
    const message = humanizeImportError(p);
    if (message) showImportDialogMessage(message);
    if (sessionId) await discardImportSession(sessionId);
    return;
  }

  if (!sessionId) {
    showImportDialogMessage('renderer.alerts.import_session_mapping_missing');
    return;
  }

  const summary = p.summary && typeof p.summary === 'object' ? p.summary : {};
  const isPdfProbeSuccess = !isOcrJob && String(summary.kind || '').trim().toLowerCase() === 'pdf';
  if (isPdfProbeSuccess) {
    const extractionMode = await choosePdfSelectableExtractionMode();
    if (extractionMode === 'ocr') {
      const startRes = await startPdfOcrFromSession(sessionId, summary);
      if (!startRes || startRes.ok !== true) {
        await handlePdfOcrStartFailure(sessionId, startRes);
      }
      return;
    }
    if (extractionMode !== 'normal') {
      await discardImportSession(sessionId);
      return;
    }
  }

  const applyChoice = await chooseImportApplyChoice({
    isOcrJob,
    summary,
  });
  if (
    !applyChoice
    || (applyChoice.mode !== 'overwrite' && applyChoice.mode !== 'append')
  ) {
    await discardImportSession(sessionId);
    return;
  }

  const importApply = getOptionalElectronMethod('importApply', {
    dedupeKey: 'renderer.ipc.importApply.unavailable',
    unavailableMessage: 'importApply unavailable; cannot apply imported text.'
  });
  if (!importApply) {
    await discardImportSession(sessionId);
    return;
  }

  try {
    const applyRes = await importApply({
      sessionId,
      mode: applyChoice.mode,
      repeatCount: normalizePasteRepeat(applyChoice.repeatCount),
    });
    if (!applyRes || applyRes.ok !== true) {
      const message = humanizeImportError(applyRes);
      if (message) showImportDialogMessage(message);
      return;
    }
    if (applyRes.truncated) {
      showImportDialogMessage('renderer.alerts.import_truncated');
    }
  } catch (err) {
    log.error('Error applying import session:', err);
    showImportDialogMessage('renderer.alerts.import_apply_failed');
  }
}

// =============================================================================
// i18n wiring
// =============================================================================
const { loadRendererTranslations, tRenderer, msgRenderer } = window.RendererI18n || {};
if (!loadRendererTranslations || !tRenderer || !msgRenderer) {
  throw new Error('[renderer] RendererI18n unavailable; cannot continue');
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
  // Text selector buttons
  if (btnImportExtract) btnImportExtract.textContent = tRenderer('renderer.main.buttons.import_extract', btnImportExtract.textContent || '');
  if (importOcrUi && typeof importOcrUi.setI18n === 'function') {
    importOcrUi.setI18n({ tRenderer, msgRenderer });
  }
  if (importOcrUi && typeof importOcrUi.setLanguage === 'function') {
    importOcrUi.setLanguage({
      uiLanguage: idiomaActual || DEFAULT_LANG,
      fallbackLanguage: DEFAULT_LANG,
    });
  }
  if (importOcrUi && typeof importOcrUi.applyTranslations === 'function') {
    importOcrUi.applyTranslations();
  }
  if (btnOverwriteClipboard) btnOverwriteClipboard.textContent = tRenderer('renderer.main.buttons.overwrite_clipboard', btnOverwriteClipboard.textContent || '');
  if (btnAppendClipboard) btnAppendClipboard.textContent = tRenderer('renderer.main.buttons.append_clipboard', btnAppendClipboard.textContent || '');
  if (btnEdit) btnEdit.textContent = tRenderer('renderer.main.buttons.edit', btnEdit.textContent || '');
  if (btnEmptyMain) btnEmptyMain.textContent = tRenderer('renderer.main.buttons.clear', btnEmptyMain.textContent || '');
  if (btnLoadSnapshot) btnLoadSnapshot.textContent = tRenderer('renderer.main.buttons.snapshot_load', btnLoadSnapshot.textContent || '');
  if (btnSaveSnapshot) btnSaveSnapshot.textContent = tRenderer('renderer.main.buttons.snapshot_save', btnSaveSnapshot.textContent || '');
  if (btnNewTask) btnNewTask.textContent = tRenderer('renderer.main.buttons.task_new', btnNewTask.textContent || '');
  if (btnLoadTask) btnLoadTask.textContent = tRenderer('renderer.main.buttons.task_load', btnLoadTask.textContent || '');
  // Text selector tooltips
  if (btnImportExtract) {
    btnImportExtract.title = tRenderer('renderer.main.tooltips.import_extract', btnImportExtract.title || '');
    applyAriaLabel(btnImportExtract, 'renderer.main.aria.import_extract', btnImportExtract.title || btnImportExtract.textContent || '');
  }
  if (btnOverwriteClipboard) btnOverwriteClipboard.title = tRenderer('renderer.main.tooltips.overwrite_clipboard', btnOverwriteClipboard.title || '');
  if (btnAppendClipboard) btnAppendClipboard.title = tRenderer('renderer.main.tooltips.append_clipboard', btnAppendClipboard.title || '');
  if (pasteRepeatInput) {
    pasteRepeatInput.title = tRenderer('renderer.main.tooltips.paste_repeat_count', pasteRepeatInput.title || '');
    applyAriaLabel(pasteRepeatInput, 'renderer.main.aria.paste_repeat_count');
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
const { getTimeParts, obtenerSeparadoresDeNumeros, formatearNumero } = window.FormatUtils || {};
if (!getTimeParts || !obtenerSeparadoresDeNumeros || !formatearNumero) {
  throw new Error('[renderer] FormatUtils unavailable; cannot continue');
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
      applyTranslations();
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
      updatePreviewAndResults(currentText);
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
      throw new Error('[renderer] electronAPI.onStartupReady unavailable; cannot bootstrap renderer readiness');
    }

    if (typeof window.electronAPI.onInteractionGateState === 'function') {
      window.electronAPI.onInteractionGateState((payload) => {
        try {
          updateInteractionGateState(payload || {});
        } catch (err) {
          log.error('Error handling interaction-gate-state event:', err);
        }
      });
    } else {
      log.warnOnce(
        'renderer.ipc.onInteractionGateState.unavailable',
        'onInteractionGateState unavailable; interaction-gate live updates will not sync.'
      );
    }

    if (typeof window.electronAPI.onImportProgress === 'function') {
      window.electronAPI.onImportProgress((payload) => {
        try {
          const p = payload && typeof payload === 'object' ? payload : {};
          handleImportProgress(p);
          if (p.kind !== 'tick') {
            log.debug('import-progress:', p);
          }
        } catch (err) {
          log.warn('Error handling import-progress:', err);
        }
      });
    } else {
      log.warnOnce(
        'renderer.ipc.onImportProgress.unavailable',
        'onImportProgress unavailable; import progress updates will not sync.'
      );
    }

    if (typeof window.electronAPI.onImportFinished === 'function') {
      window.electronAPI.onImportFinished((payload) => {
        handleImportFinished(payload).catch((err) => {
          log.error('Error handling import-finished event:', err);
        });
      });
    } else {
      log.warnOnce(
        'renderer.ipc.onImportFinished.unavailable',
        'onImportFinished unavailable; import completion updates will not sync.'
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
        updatePreviewAndResults(currentText);
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

    const getInteractionGateState = getOptionalElectronMethod('getInteractionGateState', {
      dedupeKey: 'renderer.ipc.getInteractionGateState.unavailable',
      unavailableMessage: 'getInteractionGateState unavailable; assuming interaction gate is inactive.'
    });
    if (getInteractionGateState) {
      try {
        const gateSnapshot = await getInteractionGateState();
        if (gateSnapshot && gateSnapshot.ok === true) {
          updateInteractionGateState(gateSnapshot);
        } else if (gateSnapshot && gateSnapshot.code === 'INTERACTION_BLOCKED') {
          updateInteractionGateState({ blocked: true, reason: gateSnapshot.reason || 'OCR_RUNNING' });
        }
      } catch (err) {
        log.warn('BOOTSTRAP: getInteractionGateState failed; assuming unblocked:', err);
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

    registerMenuActionGuarded('guia_basica', () => { showInfoModal('guia_basica') });
    registerMenuActionGuarded('instrucciones_completas', () => { showInfoModal('instrucciones') });
    registerMenuActionGuarded('faq', () => { showInfoModal('faq') });
    registerMenuActionGuarded('cargador_texto', () => {
      window.Notify.notifyMain('renderer.alerts.wip_cargador_texto'); // WIP
    });
    registerMenuActionGuarded('cargador_imagen', () => {
      window.Notify.notifyMain('renderer.alerts.wip_cargador_imagen'); // WIP
    });
    registerMenuActionGuarded('test_velocidad', () => {
      window.Notify.notifyMain('renderer.alerts.wip_test_velocidad'); // WIP
    });
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

    registerMenuActionGuarded('avisos', () => {
      window.Notify.notifyMain('renderer.alerts.wip_avisos'); // WIP
    });
    registerMenuActionGuarded('discord', () => {
      window.Notify.notifyMain('renderer.alerts.wip_discord'); // WIP
    });

    registerMenuActionGuarded('links_interes', () => { showInfoModal('links_interes') });

    registerMenuActionGuarded('colabora', () => {
      window.Notify.notifyMain('renderer.alerts.wip_colabora'); // WIP
    });

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
// Import/OCR entry point
// =============================================================================
async function runImportFlowFromSelection(selectRes) {
  if (!selectRes || selectRes.ok !== true || !selectRes.sessionId) {
    const message = humanizeImportError(selectRes);
    if (message) showImportDialogMessage(message);
    return;
  }

  const importRun = getOptionalElectronMethod('importRun', {
    dedupeKey: 'renderer.ipc.importRun.unavailable',
    unavailableMessage: 'importRun unavailable; import execution skipped.'
  });
  if (!importRun) {
    await discardImportSession(selectRes.sessionId);
    return;
  }

  let runOptions = getDefaultImportRunOptions();
  if (isOcrRoute(selectRes.route)) {
    const ocrLangRes = await getAvailableOcrLanguages();
    if (!ocrLangRes || ocrLangRes.ok !== true) {
      const message = humanizeImportError(ocrLangRes);
      if (message) showImportDialogMessage(message);
      await discardImportSession(selectRes.sessionId);
      return;
    }
    const ocrOptsRes = await promptOcrOptionsDialog({
      kind: selectRes.kind,
      filename: selectRes.filename,
      pageCountHint: selectRes.pageCountHint,
      availableUiLanguages: ocrLangRes.availableUiLanguages,
    });
    if (!ocrOptsRes || ocrOptsRes.confirmed !== true) {
      await discardImportSession(selectRes.sessionId);
      return;
    }
    runOptions = Object.assign({}, runOptions, ocrOptsRes.options || {});
  }

  const runRes = await importRun({
    sessionId: selectRes.sessionId,
    options: runOptions,
  });
  if (!runRes || runRes.ok !== true) {
    if (String(runRes && runRes.code || '') === 'OCR_PRECONDITION_FAILED') {
      showOcrPreconditionWarning(runRes);
    } else {
      const message = humanizeImportError(runRes);
      if (message) showImportDialogMessage(message);
    }
    await discardImportSession(selectRes.sessionId);
    return;
  }

  if (runRes.jobId && selectRes.sessionId) {
    const isOcrJob = isOcrRoute(selectRes.route);
    importJobSessionMap.set(String(runRes.jobId), String(selectRes.sessionId));
    importJobIsOcrMap.set(String(runRes.jobId), isOcrJob);
    if (isOcrJob) {
      noteQueuedOcrJob({
        jobId: String(runRes.jobId),
        pageCountHint: Number.isFinite(Number(selectRes.pageCountHint))
          ? Math.max(1, Math.floor(Number(selectRes.pageCountHint)))
          : 0,
        preset: runOptions.preset || runOptions.qualityPreset || 'balanced',
        timeoutPerPageSec: runOptions.timeoutPerPageSec,
        dpi: runOptions.dpi,
        preprocessProfile: runOptions.preprocessProfile,
      });
    }
  }
}

async function selectImportSessionFromDroppedFile(filePath) {
  const importSelectFilePath = getOptionalElectronMethod('importSelectFilePath', {
    dedupeKey: 'renderer.ipc.importSelectFilePath.unavailable',
    unavailableMessage: 'importSelectFilePath unavailable; drop import action skipped.'
  });
  if (!importSelectFilePath) {
    return { ok: false, code: 'IMPORT_UNAVAILABLE' };
  }
  try {
    return await importSelectFilePath(filePath);
  } catch (err) {
    log.error('Error selecting dropped file for import:', err);
    return { ok: false, code: 'IMPORT_UNAVAILABLE' };
  }
}

function installMainWindowFileDropImport() {
  const importDrop = window.ImportDrop;
  if (!importDrop || typeof importDrop.installFileDropHandler !== 'function') {
    log.warnOnce(
      'renderer.importDrop.unavailable',
      'ImportDrop module unavailable; file-drop import disabled.'
    );
    return;
  }

  importDrop.installFileDropHandler({
    target: window,
    electronAPI: window.electronAPI,
    logger: log,
    guardUserAction: () => guardUserAction('import-drop-file'),
    onResolvedPath: async (droppedPath) => {
      const selectRes = await selectImportSessionFromDroppedFile(droppedPath);
      if (!selectRes || selectRes.ok !== true) {
        const message = humanizeImportError(selectRes);
        if (message) showImportDialogMessage(message);
        return;
      }
      await runImportFlowFromSelection(selectRes);
    },
    onInvalidPath: () => {
      showImportDialogMessage('renderer.alerts.import_invalid_path');
    },
    onUnhandledError: (err) => {
      log.error('Error in dropped-file import flow:', err);
      showImportDialogMessage('renderer.alerts.import_unexpected');
    },
  });
}

if (btnImportExtract) {
  btnImportExtract.addEventListener('click', async () => {
    if (!guardUserAction('import-select-file')) return;
    try {
      const importSelectFile = getOptionalElectronMethod('importSelectFile', {
        dedupeKey: 'renderer.ipc.importSelectFile.unavailable',
        unavailableMessage: 'importSelectFile unavailable; import action skipped.'
      });
      if (!importSelectFile) {
        showImportDialogMessage('renderer.alerts.import_unavailable');
        return;
      }

      const selectRes = await importSelectFile();
      if (!selectRes || selectRes.ok !== true) {
        const message = humanizeImportError(selectRes);
        if (message) showImportDialogMessage(message);
        return;
      }
      await runImportFlowFromSelection(selectRes);
    } catch (err) {
      log.error('Error in import flow:', err);
      showImportDialogMessage('renderer.alerts.import_unexpected');
    }
  });
}
installMainWindowFileDropImport();

if (btnCancelOcr) {
  btnCancelOcr.addEventListener('click', async () => {
    if (!guardUserAction('import-cancel', { allowWhenInteractionBlocked: true })) return;
    try {
      const importCancel = getOptionalElectronMethod('importCancel', {
        dedupeKey: 'renderer.ipc.importCancel.unavailable',
        unavailableMessage: 'importCancel unavailable; OCR cancel skipped.'
      });
      if (!importCancel) return;
      const res = await importCancel();
      if (!res || res.ok !== true) {
        const message = humanizeImportError(res);
        if (message) showImportDialogMessage(message);
      }
    } catch (err) {
      log.error('Error requesting OCR cancel:', err);
      showImportDialogMessage('renderer.alerts.import_cancel_request_failed');
    }
  });
}

// =============================================================================
// Clipboard helpers (shared by overwrite/append)
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

function normalizePasteRepeat(rawValue) {
  const numericValue = Number(rawValue);
  if (!Number.isInteger(numericValue) || numericValue < 1) return 1;
  return Math.min(numericValue, MAX_PASTE_REPEAT);
}

function getPasteRepeatCount() {
  if (!pasteRepeatInput) return 1;
  const normalized = normalizePasteRepeat(pasteRepeatInput.value);
  pasteRepeatInput.value = String(normalized);
  return normalized;
}

function projectRepeatedPasteLength(current, clip, repeatCount) {
  const clipLength = clip.length;
  const clipEndsWithNewline = clipLength > 0 && (clip.endsWith('\n') || clip.endsWith('\r'));
  let projected = current.length;
  let hasContent = current.length > 0;
  let endsWithNewline = hasContent && (current.endsWith('\n') || current.endsWith('\r'));

  for (let i = 0; i < repeatCount; i += 1) {
    if (hasContent) {
      projected += endsWithNewline ? 1 : 2;
      endsWithNewline = true;
    }
    if (clipLength > 0) {
      projected += clipLength;
      hasContent = true;
      endsWithNewline = clipEndsWithNewline;
    }
  }
  return projected;
}

function buildRepeatedPasteText(current, clip, repeatCount) {
  const clipLength = clip.length;
  const clipEndsWithNewline = clipLength > 0 && (clip.endsWith('\n') || clip.endsWith('\r'));
  const parts = [current];
  let hasContent = current.length > 0;
  let endsWithNewline = hasContent && (current.endsWith('\n') || current.endsWith('\r'));

  for (let i = 0; i < repeatCount; i += 1) {
    if (hasContent) {
      parts.push(endsWithNewline ? '\n' : '\n\n');
      endsWithNewline = true;
    }
    if (clipLength > 0) {
      parts.push(clip);
      hasContent = true;
      endsWithNewline = clipEndsWithNewline;
    }
  }
  return parts.join('');
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
    const repeatCount = getPasteRepeatCount();

    const projectedLen = projectRepeatedPasteLength('', clip, repeatCount);
    if (projectedLen > maxIpcChars) {
      window.Notify.notifyMain('renderer.alerts.clipboard_too_large');
      return;
    }
    const overwriteText = buildRepeatedPasteText('', clip, repeatCount);

    // Send object with meta (overwrite)
    const setCurrentText = getOptionalElectronMethod('setCurrentText', {
      dedupeKey: 'renderer.ipc.setCurrentText.unavailable',
      unavailableMessage: 'setCurrentText unavailable; clipboard overwrite skipped.'
    });
    if (!setCurrentText) {
      window.Notify.notifyMain('renderer.alerts.clipboard_error');
      return;
    }
    const resp = await setCurrentText({
      text: overwriteText,
      meta: { source: 'main-window', action: 'overwrite' }
    });

    if (resp && resp.ok === false) {
      throw new Error(resp.error || 'set-current-text failed');
    }

    // UI/state sync is authoritative via "current-text-updated" subscription.
    if (!hasCurrentTextSubscription) {
      throw new Error('current-text-updated subscription unavailable');
    }
    if (resp && resp.truncated) {
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
    const getCurrentText = getOptionalElectronMethod('getCurrentText', {
      dedupeKey: 'renderer.ipc.getCurrentText.unavailable',
      unavailableMessage: 'getCurrentText unavailable; clipboard append skipped.'
    });
    if (!getCurrentText) {
      window.Notify.notifyMain('renderer.alerts.append_error');
      return;
    }
    const current = await getCurrentText() || '';
    const repeatCount = getPasteRepeatCount();

    const projectedLen = projectRepeatedPasteLength(current, clip, repeatCount);
    if (projectedLen > maxIpcChars) {
      window.Notify.notifyMain('renderer.alerts.append_too_large');
      return;
    }

    const available = maxTextChars - current.length;
    if (available <= 0) {
      window.Notify.notifyMain('renderer.alerts.text_limit');
      return;
    }

    const newFull = buildRepeatedPasteText(current, clip, repeatCount);

    // Send object with meta (append_newline)
    const setCurrentText = getOptionalElectronMethod('setCurrentText', {
      dedupeKey: 'renderer.ipc.setCurrentText.unavailable',
      unavailableMessage: 'setCurrentText unavailable; clipboard append skipped.'
    });
    if (!setCurrentText) {
      window.Notify.notifyMain('renderer.alerts.append_error');
      return;
    }
    const resp = await setCurrentText({
      text: newFull,
      meta: { source: 'main-window', action: 'append_newline' }
    });

    if (resp && resp.ok === false) {
      throw new Error(resp.error || 'set-current-text failed');
    }

    // UI/state sync is authoritative via "current-text-updated" subscription.
    if (!hasCurrentTextSubscription) {
      throw new Error('current-text-updated subscription unavailable');
    }

    // Notify truncation only if main confirms it
    if (resp && resp.truncated) {
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
    const tipCount = HELP_TIP_KEY_LIST.length;
    if (!tipCount) {
      log.error('Help tip list is empty.');
      if (typeof window.Notify?.notifyMain === 'function') {
        window.Notify.notifyMain('renderer.main.tips.results_help.tip1');
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
      if (typeof window.Notify?.toastMain === 'function') {
        window.Notify.toastMain(tipKey);
      } else if (typeof window.Notify?.notifyMain === 'function') {
        window.Notify.notifyMain(tipKey);
      } else {
        log.error('Notify API unavailable for help tips.');
      }
    } catch (err) {
      log.error('Error showing help tip:', err);
      try {
        if (typeof window.Notify?.notifyMain === 'function') {
          window.Notify.notifyMain(tipKey);
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
      updatePreviewAndResults(currentText);
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
runStartupOrchestrator();

// =============================================================================
// End of public/renderer.js
// =============================================================================
