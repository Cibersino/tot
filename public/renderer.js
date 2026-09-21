// public/renderer.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main renderer entry point for the primary window UI.
// Responsibilities:
// - Bootstrap renderer-owned UI state from main-owned config, settings, and READY signals.
// - Consume required renderer surfaces that must be loaded before renderer.js runs.
// - Keep current-text preview, counts, and timing displays in sync with main-owned updates.
// - Coordinate clipboard, presets, text extraction, Text Editor, Task Editor, and reading-test entry flows.
// - Host window-level integrations such as menu actions and the stopwatch controller.

// =============================================================================
// Logger and startup constants
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
  MAX_CLIPBOARD_REPEAT,
} = AppConstants;
if (typeof DEFAULT_LANG !== 'string' || !DEFAULT_LANG.trim()) {
  throw new Error('[renderer] AppConstants.DEFAULT_LANG unavailable; cannot continue');
}
if (!Number.isFinite(MAX_CLIPBOARD_REPEAT) || MAX_CLIPBOARD_REPEAT < 1) {
  throw new Error('[renderer] AppConstants.MAX_CLIPBOARD_REPEAT unavailable; cannot continue');
}
if (!Number.isFinite(AppConstants.MAX_TEXT_CHARS) || AppConstants.MAX_TEXT_CHARS < 1) {
  throw new Error('[renderer] AppConstants.MAX_TEXT_CHARS unavailable; cannot continue');
}

// =============================================================================
// Required renderer surfaces and primary DOM references
// =============================================================================
const btnHelp = document.getElementById('btnHelp');

const textExtractionEntry = window.TextExtractionEntry;
if (!textExtractionEntry
  || typeof textExtractionEntry.configure !== 'function'
  || typeof textExtractionEntry.startFromFilePath !== 'function'
  || typeof textExtractionEntry.startFromFilePaths !== 'function'
  || typeof textExtractionEntry.startFromPicker !== 'function') {
  throw new Error('[renderer] TextExtractionEntry unavailable; cannot continue');
}

const textExtractionDragDrop = window.TextExtractionDragDrop;
if (!textExtractionDragDrop
  || typeof textExtractionDragDrop.applyTranslations !== 'function'
  || typeof textExtractionDragDrop.configure !== 'function') {
  throw new Error('[renderer] TextExtractionDragDrop unavailable; cannot continue');
}
const textExtractionBatchFlow = window.TextExtractionBatchFlow || null;
if (!textExtractionBatchFlow
  || typeof textExtractionBatchFlow.configure !== 'function'
  || typeof textExtractionBatchFlow.startFromSelectedFiles !== 'function'
  || typeof textExtractionBatchFlow.startSyntheticSingleFileHeavySplit !== 'function') {
  throw new Error('[renderer] TextExtractionBatchFlow unavailable; cannot continue');
}

const textExtractionStatusUi = window.TextExtractionStatusUi;
if (!textExtractionStatusUi
  || typeof textExtractionStatusUi.applyCurrentTextProcessingState !== 'function'
  || typeof textExtractionStatusUi.applyProcessingModeState !== 'function'
  || typeof textExtractionStatusUi.applyStandaloneFullRefreshPendingState !== 'function'
  || typeof textExtractionStatusUi.applyTranslations !== 'function'
  || typeof textExtractionStatusUi.beginAbortFinalization !== 'function'
  || typeof textExtractionStatusUi.beginPrepare !== 'function'
  || typeof textExtractionStatusUi.clearPendingExecutionContext !== 'function'
  || typeof textExtractionStatusUi.endAbortFinalization !== 'function'
  || typeof textExtractionStatusUi.endPrepare !== 'function'
  || typeof textExtractionStatusUi.getAbortButton !== 'function'
  || typeof textExtractionStatusUi.getFinalElapsedValueText !== 'function'
  || typeof textExtractionStatusUi.isAbortFinalizationActive !== 'function'
  || typeof textExtractionStatusUi.isCurrentTextAreaPendingActive !== 'function'
  || typeof textExtractionStatusUi.isCurrentTextProcessingActive !== 'function'
  || typeof textExtractionStatusUi.isProcessingModeActive !== 'function'
  || typeof textExtractionStatusUi.isStandaloneFullRefreshPendingActive !== 'function'
  || typeof textExtractionStatusUi.setTerminalUnavailable !== 'function'
  || typeof textExtractionStatusUi.setPendingExecutionContext !== 'function') {
  throw new Error('[renderer] TextExtractionStatusUi unavailable; cannot continue');
}
const textExtractionOcrActivationFlow = window.TextExtractionOcrActivationFlow || null;
const textExtractionOcrActivation = window.TextExtractionOcrActivation || null;
const textExtractionOcrActivationRecovery = window.TextExtractionOcrActivationRecovery || null;
const textExtractionOcrDisconnect = window.TextExtractionOcrDisconnect || null;
const browserExtensionModal = window.BrowserExtensionModal || null;
let browserExtensionCapabilityAvailable = !!browserExtensionModal;
const mainLogoLinks = window.MainLogoLinks || null;
let mainLogoLinksCapabilityAvailable = !!mainLogoLinks;
const activeCustomPromptTranslationOwners = [
  window.SnapshotSaveTagsModal,
  window.TextExtractionPdfOptionsModal,
  window.TextExtractionRouteChoiceModal,
  window.TextExtractionApplyModal,
  window.TextExtractionBatchPlanningModal,
  window.TextExtractionBatchFinalModal,
  window.TextExtractionSingleFileHeavyPdfModal,
  window.TextExtractionOcrActivationDisclosureModal,
];
const currentTextSelectorSection = window.CurrentTextSelectorSection || null;
if (!currentTextSelectorSection
  || typeof currentTextSelectorSection.applyTranslations !== 'function'
  || typeof currentTextSelectorSection.bindActions !== 'function'
  || typeof currentTextSelectorSection.getClipboardRepeatCount !== 'function'
  || typeof currentTextSelectorSection.renderPreview !== 'function'
  || typeof currentTextSelectorSection.setEditorLaunchPending !== 'function'
  || typeof currentTextSelectorSection.setInteractionLocked !== 'function'
  || typeof currentTextSelectorSection.setPreviewSpoilerEnabled !== 'function') {
  throw new Error('[renderer] CurrentTextSelectorSection unavailable; cannot continue');
}
const resultsTimeMultiplier = window.ResultsTimeMultiplier;
if (!resultsTimeMultiplier
  || typeof resultsTimeMultiplier.clearBaseReadingDuration !== 'function'
  || typeof resultsTimeMultiplier.setBaseReadingDuration !== 'function') {
  throw new Error('[renderer] ResultsTimeMultiplier unavailable; cannot continue');
}
const currentTextRuntime = window.CurrentTextRuntime || null;
if (!currentTextRuntime
  || typeof currentTextRuntime.applyCurrentTextProcessingState !== 'function'
  || typeof currentTextRuntime.copyCurrentTextProcessingState !== 'function'
  || typeof currentTextRuntime.configure !== 'function'
  || typeof currentTextRuntime.getCurrentText !== 'function'
  || typeof currentTextRuntime.handleCurrentTextUpdated !== 'function'
  || typeof currentTextRuntime.requestDerivedRefresh !== 'function'
  || typeof currentTextRuntime.requestStatsDisplayRefresh !== 'function'
  || typeof currentTextRuntime.requestTimeOnlyRefresh !== 'function'
  || typeof currentTextRuntime.setTerminalPresentationUnavailable !== 'function'
  || typeof currentTextRuntime.startDeferredBootstrapSettle !== 'function'
  || typeof currentTextRuntime.syncBootstrapState !== 'function') {
  throw new Error('[renderer] CurrentTextRuntime unavailable; cannot continue');
}
const currentTextRefreshPolicyModule = window.CurrentTextRefreshPolicy || null;
if (!currentTextRefreshPolicyModule
  || typeof currentTextRefreshPolicyModule.createController !== 'function') {
  throw new Error('[renderer] CurrentTextRefreshPolicy unavailable; cannot continue');
}
const textTimeCalculatorLauncher = window.TextTimeCalculatorLauncher || null;
if (!textTimeCalculatorLauncher
  || typeof textTimeCalculatorLauncher.applyTranslations !== 'function'
  || typeof textTimeCalculatorLauncher.bindActions !== 'function'
  || typeof textTimeCalculatorLauncher.setInteractionLocked !== 'function') {
  throw new Error('[renderer] TextTimeCalculatorLauncher unavailable; cannot continue');
}
const infoModal = window.InfoModal || null;
if (!infoModal
  || typeof infoModal.applyTranslations !== 'function'
  || typeof infoModal.init !== 'function'
  || typeof infoModal.isOpen !== 'function'
  || typeof infoModal.open !== 'function') {
  throw new Error('[renderer] InfoModal unavailable; cannot continue');
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
const {
  configure: configureCurrentTextSnapshots,
  saveSnapshot,
  loadSnapshot,
} = window.CurrentTextSnapshots || {};
if (typeof configureCurrentTextSnapshots !== 'function'
  || typeof saveSnapshot !== 'function'
  || typeof loadSnapshot !== 'function') {
  log.warn('CurrentTextSnapshots bridge unavailable; snapshot actions disabled.');
}

// =============================================================================
// UI controls and panels
// =============================================================================
const resultsTimeMultiplierInput = document.getElementById('resultsTimeMultiplierInput');

const toggleModoPreciso = document.getElementById('toggleModoPreciso');

const wpmSlider = document.getElementById('wpmSlider');
const wpmInput = document.getElementById('wpmInput');

const realWpmDisplay = document.getElementById('realWpmDisplay');
const velTitle = document.getElementById('vel-title');
const resultsTitle = document.getElementById('results-title');
const cronTitle = document.getElementById('cron-title');

const toggleVF = document.getElementById('toggleVF');
const editorLoader = document.getElementById('editorLoader');
const editorLoaderStatus = document.getElementById('editorLoaderStatus');
const startupSplash = document.getElementById('startupSplash');
const cronoDisplayInput = document.getElementById('cronoDisplay');
const cronoToggleBtnMain = document.getElementById('cronoToggle');
const cronoResetBtnMain = document.getElementById('cronoReset');

const presetsHost = document.getElementById('presets');
const btnNewPreset = document.getElementById('btnNewPreset');
const btnEditPreset = document.getElementById('btnEditPreset');
const btnDeletePreset = document.getElementById('btnDeletePreset');
const btnResetDefaultPresets = document.getElementById('btnResetDefaultPresets');

// The custom combobox must not be exposed before its localized accessible name
// is applied during the initial translation pass.
if (presetsHost) presetsHost.hidden = true;
const presetDescription = document.getElementById('presetDescription');

// =============================================================================
// Shared state and core controllers
// =============================================================================
// Start with renderer-safe defaults until startup loads authoritative config/settings from main.
let maxTextChars = AppConstants.MAX_TEXT_CHARS;
let maxIpcChars = AppConstants.MAX_TEXT_CHARS * 4;
let modoConteo = 'preciso';
let idiomaActual = DEFAULT_LANG;
let settingsCache = null;
let settingsApplicationQueue = Promise.resolve();
let mainRendererI18nTerminal = false;
let cronoController = null;
// READY stays blocked until both main signals and renderer listeners are fully armed.
let rendererReadyState = 'PRE_READY';
let rendererInvariantsReady = false;
let startupReadyReceived = false;
let rendererCoreReadySent = false;
let splashRemovedSent = false;
let ipcSubscriptionsArmed = false;
let uiListenersArmed = false;
let syncToggleFromSettings = null;
let hasCurrentTextSubscription = false;
let textExtractionPrepareAttemptId = 0;
let lastHelpTipIdx = -1;
let lastProcessingLockNoticeAt = 0;

const { RendererCombobox, WpmControls } = window;
if (!RendererCombobox || typeof RendererCombobox.create !== 'function') {
  throw new Error('[renderer] RendererCombobox unavailable; cannot continue');
}
const presetsCombobox = RendererCombobox.create({
  host: presetsHost,
  mode: 'select',
  options: [],
  value: '',
});
if (!WpmControls || typeof WpmControls.createController !== 'function') {
  throw new Error('[renderer] WpmControls unavailable; cannot continue');
}
const wpmControls = WpmControls.createController({
  wpmInput,
  wpmSlider,
  presetsCombobox,
  presetDescription,
  onPresetSelectionChanged: () => {
    syncPresetActionButtons();
  },
});
if (!wpmControls
  || typeof wpmControls.applyExternalWpm !== 'function'
  || typeof wpmControls.bind !== 'function'
  || typeof wpmControls.getAllPresets !== 'function'
  || typeof wpmControls.getWpm !== 'function'
  || typeof wpmControls.handlePresetCreated !== 'function'
  || typeof wpmControls.handlePresetSelectionChange !== 'function'
  || typeof wpmControls.loadPresets !== 'function') {
  throw new Error('[renderer] WpmControls controller unavailable; cannot continue');
}
if (typeof configureCurrentTextSnapshots === 'function') {
  configureCurrentTextSnapshots({ getCurrentWpm: () => wpmControls.getWpm() });
}

if (!window.electronAPI || typeof window.electronAPI.resolveCurrentTextProcessing !== 'function') {
  throw new Error('[renderer] electronAPI.resolveCurrentTextProcessing unavailable; cannot continue');
}
currentTextRuntime.configure({
  currentTextSelectorSection,
  resultsTimeMultiplier,
  getCountContext: () => ({
    modoConteo,
    idioma: idiomaActual,
  }),
  getSettingsCache: () => settingsCache,
  getWpm: () => wpmControls.getWpm(),
  applyStandaloneFullRefreshPendingState: textExtractionStatusUi.applyStandaloneFullRefreshPendingState,
  resolveCurrentTextProcessing: window.electronAPI.resolveCurrentTextProcessing.bind(window.electronAPI),
});
const currentTextRefreshPolicy = currentTextRefreshPolicyModule.createController({
  requestFullRefresh: (reason) => {
    currentTextRuntime.requestDerivedRefresh(reason);
  },
  requestStatsDisplayRefresh: (reason) => {
    currentTextRuntime.requestStatsDisplayRefresh(reason);
  },
  requestTimeOnlyRefresh: (reason) => {
    currentTextRuntime.requestTimeOnlyRefresh(reason);
  },
});
if (!currentTextRefreshPolicy
  || typeof currentTextRefreshPolicy.dispatchPresetOutcome !== 'function'
  || typeof currentTextRefreshPolicy.dispatchSettingsChange !== 'function') {
  throw new Error('[renderer] CurrentTextRefreshPolicy controller unavailable; cannot continue');
}

// =============================================================================
// Startup gating + handshake
// =============================================================================
const PROCESSING_LOCK_NOTICE_THROTTLE_MS = 1000;

function isRendererReady() {
  return !mainRendererI18nTerminal && rendererReadyState === 'READY';
}

function isProcessingModeActive() {
  return textExtractionStatusUi.isProcessingModeActive();
}

function isAbortFinalizationActive() {
  return textExtractionStatusUi.isAbortFinalizationActive();
}

function isCurrentTextAreaPendingActive() {
  return textExtractionStatusUi.isCurrentTextAreaPendingActive();
}

function isStandaloneFullRefreshPendingActive() {
  return textExtractionStatusUi.isStandaloneFullRefreshPendingActive();
}

function setControlInteractionLocked(element, locked) {
  if (!element) return;
  element.disabled = locked;
  element.setAttribute('aria-disabled', locked ? 'true' : 'false');
}

function hasSelectedPreset() {
  return !!presetsCombobox.getValue().trim();
}

function syncPresetActionButtons({ interactionLocked } = {}) {
  const locked = typeof interactionLocked === 'boolean'
    ? interactionLocked
    : !isRendererReady()
      || isProcessingModeActive()
      || isCurrentTextAreaPendingActive()
      || isAbortFinalizationActive()
      || isReadingTestInteractionLocked();
  const disabled = locked || !hasSelectedPreset();
  setControlInteractionLocked(btnEditPreset, disabled);
  setControlInteractionLocked(btnDeletePreset, disabled);
}

function isReadingTestInteractionLocked() {
  return !!(readingSpeedTestUi && readingSpeedTestUi.isInteractionLocked());
}

function isReadingTestSessionActive() {
  return !!(readingSpeedTestUi && readingSpeedTestUi.isSessionActive());
}

function setMainLogoLinksCapabilityUnavailable(reason, err = null) {
  const wasAvailable = mainLogoLinksCapabilityAvailable;
  mainLogoLinksCapabilityAvailable = false;
  ['devLogoLink', 'kofiLogoLink'].forEach((id) => {
    const element = document.getElementById(id);
    if (element) setControlInteractionLocked(element, true);
  });
  if (wasAvailable) {
    log.warn(`Main logo links disabled for this renderer lifetime: ${reason}`, err || '');
    return;
  }
  log.warnOnce(
    'renderer.mainLogoLinks.unavailable',
    `Main logo links unavailable for this renderer lifetime: ${reason}`,
    err || ''
  );
}

function syncMainInteractionLockUi() {
  const locked = !isRendererReady()
    || isProcessingModeActive()
    || isCurrentTextAreaPendingActive()
    || isAbortFinalizationActive()
    || isReadingTestInteractionLocked();

  currentTextSelectorSection.setInteractionLocked(locked);
  textTimeCalculatorLauncher.setInteractionLocked(locked);
  setControlInteractionLocked(btnHelp, locked);
  setControlInteractionLocked(wpmInput, locked);
  setControlInteractionLocked(wpmSlider, locked);
  presetsCombobox.update({ disabled: locked });
  setControlInteractionLocked(btnNewPreset, locked);
  syncPresetActionButtons({ interactionLocked: locked });
  setControlInteractionLocked(btnResetDefaultPresets, locked);
  setControlInteractionLocked(resultsTimeMultiplierInput, locked);
  setControlInteractionLocked(toggleModoPreciso, locked);
  setControlInteractionLocked(toggleVF, locked);
  setControlInteractionLocked(cronoDisplayInput, locked);
  setControlInteractionLocked(cronoToggleBtnMain, locked);
  setControlInteractionLocked(cronoResetBtnMain, locked);
  if (browserExtensionModal && typeof browserExtensionModal.setInteractionLocked === 'function') {
    browserExtensionModal.setInteractionLocked(locked || !browserExtensionCapabilityAvailable);
  } else {
    if (!browserExtensionCapabilityAvailable) {
      const element = document.getElementById('browserExtensionLogoLink');
      if (element) setControlInteractionLocked(element, true);
    }
    log.warnOnce(
      'renderer.browserExtensionModal.setInteractionLocked.unavailable',
      'BrowserExtensionModal.setInteractionLocked unavailable; browser extension entry lock state will not sync.'
    );
  }
}

function startTextExtractionPrepareAttempt() {
  textExtractionPrepareAttemptId += 1;
  return textExtractionPrepareAttemptId;
}

function isLatestTextExtractionPrepareAttempt(attemptId) {
  return attemptId === textExtractionPrepareAttemptId;
}

function isAriaHiddenElementVisible(elementId) {
  const element = document.getElementById(elementId);
  return !!(element && element.getAttribute('aria-hidden') === 'false');
}

function hasBrowserExtensionBlockingModalOpen() {
  if (!browserExtensionModal) return false;
  if (typeof browserExtensionModal.hasBlockingModalOpen !== 'function') {
    log.warnOnce(
      'renderer.browserExtensionModal.hasBlockingModalOpen.unavailable',
      'BrowserExtensionModal.hasBlockingModalOpen unavailable; browser extension modal blocking state will be ignored.'
    );
    return false;
  }

  try {
    return !!browserExtensionModal.hasBlockingModalOpen();
  } catch (err) {
    log.warnOnce(
      'renderer.browserExtensionModal.hasBlockingModalOpen.failed',
      'BrowserExtensionModal.hasBlockingModalOpen failed; browser extension modal blocking state will be ignored:',
      err
    );
    return false;
  }
}

function hasBlockingMainWindowModalOpen() {
  return infoModal.isOpen()
    || hasBrowserExtensionBlockingModalOpen()
    || isAriaHiddenElementVisible('textExtractionPdfOptionsModal')
    || isAriaHiddenElementVisible('textExtractionRouteModal')
    || isAriaHiddenElementVisible('textExtractionApplyModal')
    || isAriaHiddenElementVisible('textExtractionBatchPlanModal')
    || isAriaHiddenElementVisible('textExtractionBatchFinalModal')
    || isAriaHiddenElementVisible('textExtractionSingleFileHeavyPdfModal')
    || isAriaHiddenElementVisible('snapshotSaveTagsModal')
    || isAriaHiddenElementVisible('readingTestEntryModal')
    || isAriaHiddenElementVisible('textExtractionOcrActivationDisclosureModal');
}

function canAcceptTextExtractionDrop() {
  return isRendererReady()
    && !isProcessingModeActive()
    && !isCurrentTextAreaPendingActive()
    && !isAbortFinalizationActive()
    && !isReadingTestSessionActive()
    && !hasBlockingMainWindowModalOpen();
}

async function requestPreparedImport({
  prepareTextExtractionSelectedFile,
  preparationRequest,
}) {
  const attemptId = startTextExtractionPrepareAttempt();
  textExtractionStatusUi.beginPrepare({
    filePath: preparationRequest && preparationRequest.filePath,
  });
  try {
    const preparation = await prepareTextExtractionSelectedFile(preparationRequest);
    return {
      attemptId,
      preparation,
      stale: !isLatestTextExtractionPrepareAttempt(attemptId),
    };
  } finally {
    textExtractionStatusUi.endPrepare();
  }
}

function maybeNotifyProcessingLock(actionId) {
  const now = Date.now();
  if ((now - lastProcessingLockNoticeAt) < PROCESSING_LOCK_NOTICE_THROTTLE_MS) return;
  lastProcessingLockNoticeAt = now;
  const alertKey = isAbortFinalizationActive()
    ? 'renderer.text_extraction.alerts.cancellation_requested'
    : (isProcessingModeActive()
      ? 'renderer.text_extraction.alerts.processing_locked'
      : (isStandaloneFullRefreshPendingActive()
        ? 'renderer.main.alerts.current_text_recount_locked'
        : 'renderer.main.alerts.current_text_processing_locked'));
  window.Notify.notifyMain(
    alertKey
  );
  log.warnOnce(
    `renderer.processing_lock.${actionId}`,
    'Renderer action ignored (main-window processing lock active):',
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

  const isAbortAction = normalizedActionId === 'text-extraction-abort';
  if (!allowDuringProcessing
    && !isAbortAction
    && (isProcessingModeActive() || isCurrentTextAreaPendingActive() || isAbortFinalizationActive())) {
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
  if (!window.electronAPI || typeof window.electronAPI.sendStartupRendererCoreReady !== 'function') {
    throw new Error('[renderer] electronAPI.sendStartupRendererCoreReady unavailable; cannot complete renderer READY handshake');
  }
  try {
    window.electronAPI.sendStartupRendererCoreReady();
  } catch (err) {
    throw new Error(`[renderer] sendStartupRendererCoreReady failed; cannot complete renderer READY handshake: ${err}`);
  }
  rendererCoreReadySent = true;
}

function sendSplashRemoved() {
  if (splashRemovedSent) return;
  if (!window.electronAPI || typeof window.electronAPI.sendStartupSplashRemoved !== 'function') {
    throw new Error('[renderer] electronAPI.sendStartupSplashRemoved unavailable; cannot complete renderer READY handshake');
  }
  try {
    window.electronAPI.sendStartupSplashRemoved();
  } catch (err) {
    throw new Error(`[renderer] sendStartupSplashRemoved failed; cannot complete renderer READY handshake: ${err}`);
  }
  splashRemovedSent = true;
}

function scheduleDeferredBootstrapSettleAfterUnlock() {
  const kickOffBootstrapSettle = () => {
    setTimeout(() => {
      currentTextRuntime.startDeferredBootstrapSettle();
    }, 0);
  };

  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(kickOffBootstrapSettle);
    return;
  }

  setTimeout(() => {
    currentTextRuntime.startDeferredBootstrapSettle();
  }, 0);
}

function maybeUnblockReady() {
  if (mainRendererI18nTerminal) return;
  if (!rendererInvariantsReady || !startupReadyReceived) return;
  if (rendererReadyState === 'READY') return;
  rendererReadyState = 'READY';

  if (startupSplash && typeof startupSplash.remove === 'function') {
    startupSplash.remove();
  } else {
    log.warn('BOOTSTRAP: Startup splash element missing; proceeding to READY.');
  }

  sendSplashRemoved();
  syncMainInteractionLockUi();
  // Keep the bootstrap current-text settle behind the READY/splash unlock because its synchronous recount work can delay the first useful paint.
  // Current-text derived results may remain pending at READY and settle immediately afterward.
  // Main intentionally has no programmatic initial DOM focus.
  scheduleDeferredBootstrapSettleAfterUnlock();
}

function markRendererInvariantsReady() {
  if (rendererInvariantsReady) return;
  if (!ipcSubscriptionsArmed || !uiListenersArmed || !hasCurrentTextSubscription) {
    log.warn(
      'BOOTSTRAP: Renderer invariants marked ready before all listeners/subscriptions were armed.',
      { ipcSubscriptionsArmed, uiListenersArmed, hasCurrentTextSubscription }
    );
  }
  rendererInvariantsReady = true;
  sendRendererCoreReady();
  maybeUnblockReady();
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

function getRequiredElectronMethod(methodName) {
  const api = window.electronAPI;
  if (!api || typeof api[methodName] !== 'function') {
    throw new Error(`[renderer] electronAPI.${methodName} unavailable; cannot continue bootstrap`);
  }
  return api[methodName].bind(api);
}

// =============================================================================
// i18n wiring
// =============================================================================
const {
  transitionRendererTranslations,
  tRenderer,
  msgRenderer,
  getRendererValue,
} = window.RendererI18n || {};
if (!transitionRendererTranslations
  || !tRenderer
  || !msgRenderer
  || !getRendererValue) {
  reportTerminalRendererI18nFailure('startup-api');
  throw new Error('[renderer] RendererI18n unavailable; cannot continue');
}

function getHelpTipKeyList() {
  const tips = getRendererValue('renderer.tips');
  if (!tips || typeof tips !== 'object' || Array.isArray(tips)) return [];
  return Object.keys(tips)
    .map((key) => {
      const match = /^tip(\d+)$/.exec(key);
      if (!match) return null;
      return { key, order: Number(match[1]) };
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
    .map(({ key }) => `renderer.tips.${key}`);
}

const getCronoIcons = () => ({
  playIconName: 'play',
  pauseIconName: 'pause'
});

function applyTranslations() {
  const applyAriaLabel = (el, key) => {
    if (!el) return;
    const aria = tRenderer(key);
    if (!aria) return;
    el.setAttribute('aria-label', aria);
  };
  textExtractionStatusUi.applyTranslations({ tRenderer, msgRenderer });
  textExtractionDragDrop.applyTranslations({ tRenderer });
  readingSpeedTestUi.applyTranslations();
  currentTextSelectorSection.applyTranslations({ tRenderer });
  textTimeCalculatorLauncher.applyTranslations({ tRenderer });
  if (mainLogoLinksCapabilityAvailable
    && mainLogoLinks && typeof mainLogoLinks.applyTranslations === 'function') {
    try {
      mainLogoLinks.applyTranslations({ tRenderer });
    } catch (err) {
      setMainLogoLinksCapabilityUnavailable('translation application failed', err);
    }
  } else {
    setMainLogoLinksCapabilityUnavailable('translation application unavailable');
  }
  if (browserExtensionModal && typeof browserExtensionModal.applyTranslations === 'function') {
    try {
      browserExtensionModal.applyTranslations();
    } catch (err) {
      log.warn('BrowserExtensionModal translation application failed; browser extension entry disabled.', err);
      browserExtensionCapabilityAvailable = false;
      if (typeof browserExtensionModal.setInteractionLocked === 'function') {
        browserExtensionModal.setInteractionLocked(true);
      } else {
        const element = document.getElementById('browserExtensionLogoLink');
        if (element) setControlInteractionLocked(element, true);
      }
    }
  } else {
    log.warn('BrowserExtensionModal.applyTranslations unavailable; browser extension entry disabled.');
    browserExtensionCapabilityAvailable = false;
    if (browserExtensionModal && typeof browserExtensionModal.setInteractionLocked === 'function') {
      browserExtensionModal.setInteractionLocked(true);
    } else {
      const element = document.getElementById('browserExtensionLogoLink');
      if (element) setControlInteractionLocked(element, true);
    }
  }
  infoModal.applyTranslations();
  activeCustomPromptTranslationOwners.forEach((owner) => {
    if (owner && typeof owner.applyTranslations === 'function') {
      owner.applyTranslations();
    }
  });
  if (editorLoaderStatus && editorLoader?.classList.contains('visible')) {
    editorLoaderStatus.textContent = tRenderer('renderer.main.processing.editor_loading');
  }
  // Presets
  [
    [btnNewPreset, 'renderer.main.names.new_preset'],
    [btnEditPreset, 'renderer.main.names.edit_preset'],
    [btnDeletePreset, 'renderer.main.names.delete_preset'],
    [btnResetDefaultPresets, 'renderer.main.names.reset_presets'],
  ].forEach(([element, key]) => {
    if (!element) return;
    const name = tRenderer(key);
    element.setAttribute('aria-label', name);
    element.setAttribute('data-tot-tooltip', name);
  });
  // Section titles
  if (velTitle) velTitle.textContent = tRenderer('renderer.main.speed.title');
  if (resultsTitle) resultsTitle.textContent = tRenderer('renderer.main.results.title');
  if (cronTitle) cronTitle.textContent = tRenderer('renderer.main.crono.title');
  // Speed selector labels
  const wpmLabel = document.querySelector('.wpm-row span');
  if (wpmLabel) wpmLabel.textContent = tRenderer('renderer.main.speed.wpm_label');
  applyAriaLabel(wpmInput, 'renderer.main.aria.wpm_input');
  applyAriaLabel(wpmSlider, 'renderer.main.aria.wpm_slider');
  presetsCombobox.update({ ariaLabel: tRenderer('renderer.main.aria.speed_presets') });
  if (presetsHost) presetsHost.hidden = false;
  // Results: precise mode label
  const togglePrecisoLabel = document.querySelector('.toggle-wrapper .toggle-label');
  if (togglePrecisoLabel) {
    togglePrecisoLabel.textContent = tRenderer('renderer.main.results.precise_mode');
    const toggleWrapper = togglePrecisoLabel.closest('.toggle-wrapper');
    if (toggleWrapper) {
      toggleWrapper.setAttribute('data-tot-tooltip', tRenderer('renderer.main.help.precise_mode'));
    }
  }
  const preciseModeDescription = document.getElementById('preciseModeDescription');
  if (preciseModeDescription) {
    preciseModeDescription.textContent = tRenderer('renderer.main.help.precise_mode');
  }
  // Stopwatch: speed label and controls aria-label
  const realWpmLabel = document.querySelector('.realwpm');
  if (realWpmLabel && realWpmLabel.firstChild) {
    realWpmLabel.firstChild.textContent = tRenderer('renderer.main.crono.speed');
  }
  const cronoControls = document.querySelector('.crono-controls');
  if (cronoControls) {
    const ariaLabel = tRenderer('renderer.main.aria.crono_controls');
    if (ariaLabel) cronoControls.setAttribute('aria-label', ariaLabel);
  }
  const cronoDisplayEl = document.getElementById('cronoDisplay');
  const cronoToggleBtn = document.getElementById('cronoToggle');
  const cronoResetBtn = document.getElementById('cronoReset');
  const vfSwitchWrapper = document.querySelector('.vf-switch-wrapper');
  applyAriaLabel(cronoDisplayEl, 'renderer.main.aria.crono_display');
  [
    [cronoToggleBtn, 'renderer.main.names.crono_toggle'],
    [cronoResetBtn, 'renderer.main.names.crono_reset'],
  ].forEach(([element, key]) => {
    if (!element) return;
    const name = tRenderer(key);
    element.setAttribute('aria-label', name);
    element.setAttribute('data-tot-tooltip', name);
  });
  applyAriaLabel(toggleVF, 'renderer.main.names.floating_window');
  applyAriaLabel(vfSwitchWrapper, 'renderer.main.aria.floating_window_group');
  if (vfSwitchWrapper) {
    vfSwitchWrapper.setAttribute('data-tot-tooltip', tRenderer('renderer.main.names.floating_window'));
  }
  const iconsCrono = getCronoIcons();
  if (cronoController && typeof cronoController.updateIcons === 'function') {
    cronoController.updateIcons(iconsCrono);
  }
  // Help button name and visual identification
  if (btnHelp) {
    const helpName = tRenderer('renderer.main.names.help_button');
    if (helpName) {
      btnHelp.setAttribute('aria-label', helpName);
      btnHelp.setAttribute('data-tot-tooltip', helpName);
    }
  }
}

async function transitionMainRendererLanguage(
  language,
  { candidateSettings = settingsCache, previousSettings = settingsCache } = {}
) {
  await transitionRendererTranslations(language, {
    applyTranslations: ({ language: appliedLanguage, restoring }) => {
      idiomaActual = appliedLanguage;
      settingsCache = restoring ? previousSettings : candidateSettings;
      applyTranslations();
    },
  });
}

function reportRendererI18nFailure(err, { startup = false } = {}) {
  const transition = err && err.rendererI18nTransition;
  if (!transition) {
    return;
  }
  if (!startup && transition && !transition.restorationFailed && transition.hadEstablishedState) {
    log.error('Renderer language transition failed; previous translation state remains authoritative:', err);
    return;
  }

  log.error('Renderer i18n failure requires window closure:', err);
  reportTerminalRendererI18nFailure(startup ? 'startup' : 'transition-restoration');
}

function reportTerminalRendererI18nFailure(kind) {
  mainRendererI18nTerminal = true;
  currentTextRuntime.setTerminalPresentationUnavailable();
  textExtractionStatusUi.setTerminalUnavailable();
  syncMainInteractionLockUi();
  if (!window.electronAPI || typeof window.electronAPI.reportRendererI18nFailure !== 'function') {
    log.warn('electronAPI.reportRendererI18nFailure unavailable (ignored); closing failed renderer locally.');
    if (typeof window.close === 'function') window.close();
    return;
  }
  try {
    window.electronAPI.reportRendererI18nFailure({
      kind,
    });
  } catch (reportErr) {
    log.warn('electronAPI.reportRendererI18nFailure failed (ignored); closing failed renderer locally:', reportErr);
    if (typeof window.close === 'function') window.close();
  }
}

// =============================================================================
// Text counting
// =============================================================================
const { contarTexto: contarTextoModulo } = window.CountUtils || {};
if (typeof contarTextoModulo !== 'function') {
  throw new Error('[renderer] CountUtils unavailable; cannot continue');
}
const { obtenerSeparadoresDeNumeros, formatearNumero } = window.FormatUtils || {};
if (!obtenerSeparadoresDeNumeros || !formatearNumero) {
  throw new Error('[renderer] FormatUtils unavailable; cannot continue');
}

function contarTexto(texto) {
  return contarTextoModulo(texto, { modoConteo, idioma: idiomaActual });
}

function setModoConteo(nuevoModo) {
  if (nuevoModo === 'simple' || nuevoModo === 'preciso') {
    modoConteo = nuevoModo;
  }
}

// =============================================================================
// Preview and results
// =============================================================================
function getCurrentTextValue() {
  return currentTextRuntime.getCurrentText();
}

function startPreviewAndResultsUpdate(textOrReason, maybeReason) {
  const reason = typeof maybeReason === 'string'
    ? maybeReason
    : (typeof textOrReason === 'string' ? textOrReason : 'current-text refresh');
  currentTextRuntime.requestDerivedRefresh(reason);
}

function updateTimeOnlyFromStats() {
  currentTextRuntime.requestTimeOnlyRefresh('wpm change');
}

function setCurrentTextAndUpdateUI(payload, options = {}) {
  currentTextRuntime.handleCurrentTextUpdated(payload, {
    onAuthoritativeTextChanged: (previousText, nextText) => {
      if (!options.applyRules) return;
      if (cronoController && typeof cronoController.handleTextChange === 'function') {
        cronoController.handleTextChange(previousText, nextText);
      }
    },
  });
}

// Listen for stopwatch status from main (authoritative state)
if (window.electronAPI && typeof window.electronAPI.onCronoState === 'function') {
  window.electronAPI.onCronoState((state) => {
    if (mainRendererI18nTerminal) return;
    try {
      if (cronoController && typeof cronoController.handleState === 'function') {
        cronoController.handleState(state);
      }
    } catch (err) {
      log.error('Error handling crono-state in renderer:', err);
    }
  });
} else if (window.electronAPI) {
  log.warn('onCronoState unavailable; crono state will not sync.');
}

// =============================================================================
// Preset loading
// =============================================================================
function resolveSettingsSnapshot(settingsSnapshot) {
  return (settingsSnapshot && typeof settingsSnapshot === 'object')
    ? settingsSnapshot
    : (settingsCache || {});
}

const loadPresets = async ({ settingsSnapshot } = {}) => {
  const snapshot = resolveSettingsSnapshot(settingsSnapshot);
  const result = await wpmControls.loadPresets({
    settingsSnapshot: snapshot,
    language: idiomaActual,
    electronAPI: window.electronAPI,
  });
  syncPresetActionButtons();
  return result;
};

// =============================================================================
// Bootstrapping and subscriptions
// =============================================================================
async function applySettingsChange(newSettings) {
  try {
    const previousSettings = settingsCache || {};
    const previousCountContext = {
      modoConteo,
      idioma: idiomaActual,
    };
    const nextSettings = newSettings && typeof newSettings === 'object' ? newSettings : {};
    const nuevoIdioma = nextSettings.language || DEFAULT_LANG;
    const idiomaCambio = (nuevoIdioma !== idiomaActual);
    let presetOutcome = null;
    let recoveredLanguageFailure = false;
    if (idiomaCambio) {
      try {
        await transitionMainRendererLanguage(nuevoIdioma, {
          candidateSettings: nextSettings,
          previousSettings,
        });
      } catch (err) {
        reportRendererI18nFailure(err);
        const transition = err && err.rendererI18nTransition;
        if (!transition || !transition.hadEstablishedState || transition.restorationFailed) {
          return;
        }
        // The failed language is not part of this renderer's established state,
        // but independent settings from the same full payload still apply.
        settingsCache = { ...nextSettings, language: idiomaActual };
        recoveredLanguageFailure = true;
      }
      if (!recoveredLanguageFailure) {
        try {
          const presetLoadResult = await loadPresets({ settingsSnapshot: settingsCache });
          presetOutcome = presetLoadResult && presetLoadResult.selectionOutcome
            ? presetLoadResult.selectionOutcome
            : null;
        } catch (err) {
          log.error('Error loading presets after language change:', err);
        }
      }
    } else {
      settingsCache = nextSettings;
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
      currentTextRefreshPolicy.dispatchSettingsChange({
        previousSettings,
        nextSettings: settingsCache,
        previousCountContext,
        nextCountContext: {
          modoConteo,
          idioma: idiomaActual,
        },
        presetOutcome,
        reason: 'settings change',
      });
      if (modeChanged && cronoController && typeof cronoController.handleTextChange === 'function') {
        cronoController.handleTextChange(null, getCurrentTextValue());
      }
    }
  } catch (err) {
    log.error('Error handling settings change:', err);
  }
}

function enqueueMainSemanticWork(work) {
  const run = async () => {
    // Window closure is coordinated asynchronously through the main process.
    // Do not admit queued main-renderer semantic work after terminal i18n failure.
    if (mainRendererI18nTerminal) return;
    return work();
  };
  settingsApplicationQueue = settingsApplicationQueue.then(run, run);
  return settingsApplicationQueue;
}

function settingsChangeHandler(newSettings) {
  const run = () => applySettingsChange(newSettings);
  // Preload listeners do not await async callbacks. Admit live settings after
  // the preceding bootstrap or settings semantic operation has settled.
  return enqueueMainSemanticWork(run);
}

function armCurrentTextSubscription() {
  if (hasCurrentTextSubscription) return;
  if (!window.electronAPI || typeof window.electronAPI.onCurrentTextUpdated !== 'function') {
    throw new Error('[renderer] electronAPI.onCurrentTextUpdated unavailable; cannot maintain current text synchronization');
  }

  window.electronAPI.onCurrentTextUpdated((payload) => {
    try {
      setCurrentTextAndUpdateUI(payload, { applyRules: !mainRendererI18nTerminal });
    } catch (err) {
      log.error('Error handling current-text-updated:', err);
    }
  });
  hasCurrentTextSubscription = true;
}

function armIpcSubscriptions() {

  // Subscribe to preset create/update notifications from main
  if (window.electronAPI && typeof window.electronAPI.onPresetCreated === 'function') {
    window.electronAPI.onPresetCreated(async (preset) => {
      if (!isRendererReady()) {
        log.warn('BOOTSTRAP: preset-created received pre-READY; ignored.');
        return;
      }
      try {
        const presetCreatedResult = await wpmControls.handlePresetCreated({
          preset,
          settingsSnapshot: settingsCache,
          language: idiomaActual,
          electronAPI: window.electronAPI,
        });
        currentTextRefreshPolicy.dispatchPresetOutcome(
          presetCreatedResult && presetCreatedResult.selectionOutcome
            ? presetCreatedResult.selectionOutcome
            : null,
          'preset-created sync'
        );
      } catch (err) {
        log.error('Error handling preset-created event:', err);
      }
    });
  } else if (window.electronAPI) {
    log.warn('onPresetCreated unavailable; preset updates will not sync.');
  }

  if (window.electronAPI) {
    if (typeof window.electronAPI.onStartupReady === 'function') {
      window.electronAPI.onStartupReady(() => {
        if (mainRendererI18nTerminal) return;
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
      log.warn('onSettingsChanged unavailable; settings updates will not sync.');
    }

    if (typeof window.electronAPI.onTextExtractionProcessingModeChanged === 'function') {
      window.electronAPI.onTextExtractionProcessingModeChanged((state) => {
        try {
          textExtractionStatusUi.applyProcessingModeState(state, { source: 'ipc_event' });
          syncMainInteractionLockUi();
        } catch (err) {
          log.error('Error handling text-extraction-processing-mode-changed:', err);
        }
      });
    } else {
      log.warn('onTextExtractionProcessingModeChanged unavailable; processing lock updates will not sync.');
    }

    if (typeof window.electronAPI.onCurrentTextProcessingStateChanged === 'function') {
      window.electronAPI.onCurrentTextProcessingStateChanged((state) => {
        try {
          currentTextRuntime.applyCurrentTextProcessingState(state, { source: 'ipc_event' });
          textExtractionStatusUi.applyCurrentTextProcessingState(state, { source: 'ipc_event' });
          syncMainInteractionLockUi();
        } catch (err) {
          log.error('Error handling current-text-processing-state-changed:', err);
        }
      });
    } else {
      throw new Error('[renderer] electronAPI.onCurrentTextProcessingStateChanged unavailable; cannot maintain current text pending synchronization');
    }

    if (typeof window.electronAPI.onEditorFirstShowState === 'function') {
      window.electronAPI.onEditorFirstShowState((payload) => {
        handleEditorFirstShowState(payload);
      });
    } else {
      log.warn('onEditorFirstShowState unavailable; Text Editor loader may not clear.');
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
        const previousModo = modoConteo;
        const nuevoModo = toggleModoPreciso.checked ? 'preciso' : 'simple';

        // Update state in memory (immediately)
        setModoConteo(nuevoModo);

        toggleModoPreciso.setAttribute('aria-checked', toggleModoPreciso.checked ? 'true' : 'false');

        // Immediate recount of the current text
        startPreviewAndResultsUpdate(getCurrentTextValue(), 'mode toggle');
        if (cronoController && typeof cronoController.handleTextChange === 'function') {
          cronoController.handleTextChange(null, getCurrentTextValue());
        }

        // Attempt to persist settings via IPC (if preload/main implemented setModeConteo)
        if (window.electronAPI && typeof window.electronAPI.setModeConteo === 'function') {
          try {
            const persistResult = await window.electronAPI.setModeConteo(nuevoModo);
            if (
              persistResult
              && typeof persistResult.ok === 'boolean'
              && persistResult.ok !== true
            ) {
              throw new Error(
                persistResult.error
                  ? String(persistResult.error)
                  : 'setModeConteo returned non-ok result.'
              );
            }
          } catch (err) {
            log.error('Error persisting modeConteo using setModeConteo:', err);
            setModoConteo(previousModo);
            toggleModoPreciso.checked = (previousModo === 'preciso');
            toggleModoPreciso.setAttribute('aria-checked', toggleModoPreciso.checked ? 'true' : 'false');
            startPreviewAndResultsUpdate(getCurrentTextValue(), 'mode toggle rollback');
            if (cronoController && typeof cronoController.handleTextChange === 'function') {
              cronoController.handleTextChange(null, getCurrentTextValue());
            }
          }
        } else if (window.electronAPI) {
          log.warn('setModeConteo unavailable; mode persistence skipped.');
          setModoConteo(previousModo);
          toggleModoPreciso.checked = (previousModo === 'preciso');
          toggleModoPreciso.setAttribute('aria-checked', toggleModoPreciso.checked ? 'true' : 'false');
          startPreviewAndResultsUpdate(getCurrentTextValue(), 'mode toggle rollback');
          if (cronoController && typeof cronoController.handleTextChange === 'function') {
            cronoController.handleTextChange(null, getCurrentTextValue());
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
      log.warn('BOOTSTRAP: syncToggleFromSettings failed (ignored):', err);
    }
  } catch (err) {
    log.error('Error initializing toggleModoPreciso:', err);
  }
}

async function runMainStartup() {
  try {
    const getAppConfig = getOptionalElectronMethod('getAppConfig', {
      dedupeKey: 'BOOTSTRAP:renderer.ipc.getAppConfig.unavailable',
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
      dedupeKey: 'BOOTSTRAP:renderer.ipc.getSettings.unavailable',
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
    currentTextSelectorSection.setPreviewSpoilerEnabled(settingsCache.previewSpoilerEnabled);

    // Translation state and required semantic application establish the renderer UI.
    try {
      await transitionMainRendererLanguage(idiomaActual);
    } catch (err) {
      reportRendererI18nFailure(err, { startup: true });
      return;
    }

    const getCurrentText = getRequiredElectronMethod('getCurrentText');
    let initialText = await getCurrentText();
    if (typeof initialText !== 'string') {
      throw new Error('getCurrentText returned a non-string value');
    }

    const getCurrentTextProcessingState = getRequiredElectronMethod('getCurrentTextProcessingState');
    const currentTextProcessingResult = await getCurrentTextProcessingState();
    if (!currentTextProcessingResult
      || typeof currentTextProcessingResult !== 'object'
      || Array.isArray(currentTextProcessingResult)
      || typeof currentTextProcessingResult.ok !== 'boolean') {
      throw new Error('getCurrentTextProcessingState returned an invalid result envelope');
    }
    if (currentTextProcessingResult.ok === false) {
      if (typeof currentTextProcessingResult.code !== 'string' || !currentTextProcessingResult.code) {
        throw new Error('getCurrentTextProcessingState returned an invalid failed result');
      }
      throw new Error(`getCurrentTextProcessingState failed: ${currentTextProcessingResult.code}`);
    }
    if (!Object.prototype.hasOwnProperty.call(currentTextProcessingResult, 'state')) {
      throw new Error('getCurrentTextProcessingState returned an invalid successful result');
    }
    const startupCurrentTextProcessingState = currentTextRuntime.copyCurrentTextProcessingState(
      currentTextProcessingResult.state
    );

    currentTextRuntime.syncBootstrapState({
      initialText,
      processingState: startupCurrentTextProcessingState,
    });
    armCurrentTextSubscription();
    textExtractionStatusUi.applyCurrentTextProcessingState(startupCurrentTextProcessingState, {
      source: 'startup_query',
    });

    syncMainInteractionLockUi();

    // Load presets and save them to the cache
    const presetLoadResult = await loadPresets({ settingsSnapshot });
    currentTextRefreshPolicy.dispatchPresetOutcome(
      presetLoadResult && presetLoadResult.selectionOutcome
        ? presetLoadResult.selectionOutcome
        : null,
      'startup preset resolution'
    );

    if (typeof syncToggleFromSettings === 'function') {
      try {
        syncToggleFromSettings(settingsSnapshot || {});
      } catch (err) {
        log.warn('BOOTSTRAP: syncToggleFromSettings failed (ignored):', err);
      }
    }

    markRendererInvariantsReady();
  } catch (err) {
    log.error('Error initializing renderer:', err);
  }
}

async function runStartupOrchestrator() {
  return enqueueMainSemanticWork(runMainStartup);
}

// =============================================================================
// Top bar menu actions
// =============================================================================
// menu_actions.js must load before renderer.js so top-bar registrations have a stable surface.
function registerMenuActions() {
  if (window.menuActions && typeof window.menuActions.registerMenuAction === 'function') {
    const registerMenuActionGuarded = (actionId, handler) => {
      window.menuActions.registerMenuAction(actionId, () => {
        if (!guardUserAction(`menu.${actionId}`)) return;
        handler();
      });
    };

    registerMenuActionGuarded('__menu_processing_lock_notice__', () => { });

    registerMenuActionGuarded('guia_basica', () => { infoModal.open('guia_basica') });
    registerMenuActionGuarded('instrucciones_completas', () => { infoModal.open('instrucciones') });
    registerMenuActionGuarded('faq', () => { infoModal.open('faq') });
    registerMenuActionGuarded('diseno_skins', () => {
      window.Notify.notifyMain('renderer.main.alerts.wip.design_skins'); // WIP
    });
    registerMenuActionGuarded('diseno_crono_flotante', () => {
      window.Notify.notifyMain('renderer.main.alerts.wip.floating_stopwatch'); // WIP
    });
    registerMenuActionGuarded('diseno_fuentes', () => {
      window.Notify.notifyMain('renderer.main.alerts.wip.fonts'); // WIP
    });
    registerMenuActionGuarded('diseno_colores', () => {
      window.Notify.notifyMain('renderer.main.alerts.wip.colors'); // WIP
    });
    registerMenuActionGuarded('shortcuts', () => {
      window.Notify.notifyMain('renderer.main.alerts.wip.shortcuts'); // WIP
    });
    registerMenuActionGuarded('presets_por_defecto', async () => {
      try {
        if (!window.electronAPI || typeof window.electronAPI.openDefaultPresetsFolder !== 'function') {
          log.warn('openDefaultPresetsFolder unavailable at electronAPI; action skipped.');
          window.Notify.notifyMain('renderer.presets.alerts.open_folder_unsupported');
          return;
        }

        const res = await window.electronAPI.openDefaultPresetsFolder();
        if (res && res.ok) {
          // Folder opened successfully; do not show intrusive notifications
          log.debug('config/presets_defaults folder opened in explorer.');
          return;
        }

        // In case of failure, inform the user
        const errMsg = res && res.error ? String(res.error) : 'Unknown';
        log.error('default presets folder failed to open:', errMsg);
        window.Notify.notifyMain('renderer.presets.alerts.open_default_folder_failed');
      } catch (err) {
        log.error('default presets folder failed to open', err);
        window.Notify.notifyMain('renderer.presets.alerts.open_folder_error');
      }
    });
    registerMenuActionGuarded('enable_google_ocr', async () => {
      if (!textExtractionOcrActivation
        || typeof textExtractionOcrActivation.startFromPreferencesMenu !== 'function') {
        log.warn('TextExtractionOcrActivation.startFromPreferencesMenu unavailable; menu action skipped.');
        window.Notify.notifyMain('renderer.text_extraction.alerts.ocr.activation_failed');
        return;
      }

      await textExtractionOcrActivation.startFromPreferencesMenu();
    });
    registerMenuActionGuarded('disconnect_google_ocr', async () => {
      if (!textExtractionOcrDisconnect
        || typeof textExtractionOcrDisconnect.startFromPreferencesMenu !== 'function') {
        log.warn('TextExtractionOcrDisconnect.startFromPreferencesMenu unavailable; menu action skipped.');
        window.Notify.notifyMain('renderer.text_extraction.alerts.ocr.disconnect_failed');
        return;
      }

      await textExtractionOcrDisconnect.startFromPreferencesMenu();
    });

    registerMenuActionGuarded('links_interes', () => { infoModal.open('links_interes') });

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

    registerMenuActionGuarded('acerca_de', () => { infoModal.open('acerca_de') });
    return;
  }

  log.warn('menuActions unavailable - the top bar will not be handled by the renderer.');
}
// =============================================================================
// Preset selection wiring
// =============================================================================
function bindPresetSelection() {
  presetsCombobox.update({ onChange: async () => {
    if (!guardUserAction('preset-change')) return;
    try {
      await wpmControls.handlePresetSelectionChange({
        settingsSnapshot: settingsCache,
        language: idiomaActual,
        electronAPI: window.electronAPI,
        onWpmChanged: updateTimeOnlyFromStats,
      });
    } finally {
      syncPresetActionButtons();
    }
  } });
}

// =============================================================================
// Manual WPM edits
// =============================================================================
function applyReadingTestWpm(rawWpm) {
  wpmControls.applyExternalWpm(rawWpm, { onWpmChanged: updateTimeOnlyFromStats });
  syncPresetActionButtons();
}

function bindSpeedControls() {
  readingSpeedTestUi.configure({
    onLockChange: syncMainInteractionLockUi,
    applyWpm: applyReadingTestWpm,
    getSettingsCache: () => settingsCache,
  });
  wpmControls.bind({
    guardUserAction,
    onWpmChanged: updateTimeOnlyFromStats,
  });
}

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
  if (!res || typeof res !== 'object' || Array.isArray(res) || typeof res.ok !== 'boolean') {
    throw new Error('clipboard read returned an invalid result envelope');
  }
  if (res.ok === false) {
    if (res.tooLarge === true) {
      window.Notify.notifyMain(tooLargeKey);
      return { ok: false, tooLarge: true };
    }
    if (typeof res.error !== 'string') {
      throw new Error('clipboard read returned an invalid failed result');
    }
    throw new Error(res.error);
  }
  if (typeof res.text !== 'string') {
    throw new Error('clipboard read returned an invalid successful result');
  }
  return { ok: true, text: res.text };
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

function assertCurrentTextSubscription() {
  if (!hasCurrentTextSubscription) {
    throw new Error('current-text-updated subscription unavailable');
  }
}

// =============================================================================
// Text extraction integration helpers
// =============================================================================
async function maybeRecoverTextExtractionOcrSetupAndRetry({
  preparation,
  preparationRequest,
  prepareTextExtractionSelectedFile,
  routePreference = '',
}) {
  const recoveryApi = textExtractionOcrActivationRecovery;
  if (!recoveryApi || typeof recoveryApi.recoverAfterSetupFailure !== 'function') {
    log.warnOnce(
      'renderer.textExtraction.ocrActivationRecovery.unavailable',
      'TextExtractionOcrActivationRecovery.recoverAfterSetupFailure unavailable; OCR setup auto-recovery disabled.'
    );
    return { preparation, handled: false };
  }

  try {
    return await recoveryApi.recoverAfterSetupFailure({
      preparation,
      retryPrepare: async () => {
        return await requestPreparedImport({
          prepareTextExtractionSelectedFile,
          preparationRequest,
        });
      },
      getOptionalElectronMethod,
      routePreference,
    });
  } catch (err) {
    log.error('text extraction OCR setup recovery module failed unexpectedly:', err);
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
      log.warn('getPathForFile returned empty/invalid; falling back to File.path.');
    } catch (err) {
      log.warn('getPathForFile failed; falling back to File.path:', err);
    }
  }

  const fallbackPath = file && typeof file.path === 'string'
    ? file.path.trim()
    : '';
  if (!fallbackPath) {
    log.warn('Dropped file path unresolved; returning empty path.');
  }
  return fallbackPath;
}

// renderer.js keeps only app-level wiring here.
// Shared text extraction behavior stays in delegated window modules.
function configureTextExtractionModules() {
  if (textExtractionOcrActivationFlow
    && typeof textExtractionOcrActivationFlow.configure === 'function') {
    textExtractionOcrActivationFlow.configure({
      getOptionalElectronMethod,
    });
  } else {
    log.warn('TextExtractionOcrActivationFlow.configure unavailable; OCR activation flows will be disabled.');
  }

  if (textExtractionOcrActivation
    && typeof textExtractionOcrActivation.configure === 'function') {
    textExtractionOcrActivation.configure({
      ocrActivationFlow: textExtractionOcrActivationFlow,
    });
  } else {
    log.warn('TextExtractionOcrActivation.configure unavailable; Preferences > Enable Google OCR will be disabled.');
  }

  if (textExtractionOcrActivationRecovery
    && typeof textExtractionOcrActivationRecovery.configure === 'function') {
    textExtractionOcrActivationRecovery.configure({
      ocrActivationFlow: textExtractionOcrActivationFlow,
    });
  } else {
    log.warn('TextExtractionOcrActivationRecovery.configure unavailable; OCR setup recovery will be disabled.');
  }

  textExtractionBatchFlow.configure({
    applyTextViaCanonicalPath,
    getOptionalElectronMethod,
    getOcrLanguage: () => idiomaActual || '',
    getSettingsCache: () => settingsCache,
    guardUserAction,
    hasBlockingModalOpen: hasBlockingMainWindowModalOpen,
    hasCurrentTextSubscription: () => hasCurrentTextSubscription,
    requestPreparedImport,
    syncMainInteractionLockUi,
    textExtractionStatusUi,
  });

  textExtractionEntry.configure({
    applyTextViaCanonicalPath,
    getClipboardRepeatCount: () => currentTextSelectorSection.getClipboardRepeatCount(),
    getOcrLanguage: () => idiomaActual || '',
    getOptionalElectronMethod,
    guardUserAction,
    hasBlockingModalOpen: hasBlockingMainWindowModalOpen,
    hasCurrentTextSubscription: () => hasCurrentTextSubscription,
    syncMainInteractionLockUi,
    textExtractionBatchFlow,
    textExtractionStatusUi,
    isLatestTextExtractionPrepareAttempt,
    maybeRecoverTextExtractionOcrSetupAndRetry,
    requestPreparedImport,
  });

  textExtractionDragDrop.configure({
    canAcceptDrop: canAcceptTextExtractionDrop,
    resolveDroppedFilePath,
    startFromFilePath: textExtractionEntry.startFromFilePath,
    startFromFilePaths: textExtractionEntry.startFromFilePaths,
  });

  if (textExtractionOcrDisconnect
    && typeof textExtractionOcrDisconnect.configure === 'function') {
    textExtractionOcrDisconnect.configure({
      getOptionalElectronMethod,
    });
  } else {
    log.warn('TextExtractionOcrDisconnect.configure unavailable; Preferences > Disconnect Google OCR will be disabled.');
  }
}

function initializeDelegatedIntegrations() {
  configureTextExtractionModules();

  if (browserExtensionModal && typeof browserExtensionModal.configure === 'function') {
    browserExtensionModal.configure({
      electronAPI: window.electronAPI,
      hasBlockingModalOpen: hasBlockingMainWindowModalOpen,
    });
  } else {
    log.warn('BrowserExtensionModal.configure unavailable; browser extension entry disabled.');
  }

  if (mainLogoLinksCapabilityAvailable
    && mainLogoLinks && typeof mainLogoLinks.bindBrandLinks === 'function') {
    mainLogoLinks.bindBrandLinks({
      electronAPI: window.electronAPI,
      canAcceptBrandLinkAction: () => isRendererReady() && mainLogoLinksCapabilityAvailable,
    });
    return;
  }

  if (mainLogoLinksCapabilityAvailable) {
    setMainLogoLinksCapabilityUnavailable('binding unavailable');
  }
}

// Text Editor launch state mirrors the pending UI while the Text Editor window opens.
function showEditorLoader() {
  if (editorLoader) {
    if (editorLoaderStatus) {
      editorLoaderStatus.textContent = tRenderer('renderer.main.processing.editor_loading');
    }
    editorLoader.classList.add('visible');
  }
  currentTextSelectorSection.setEditorLaunchPending(true);
}

function hideEditorLoader() {
  if (editorLoader) {
    editorLoader.classList.remove('visible');
    if (editorLoaderStatus) editorLoaderStatus.textContent = '';
  }
  currentTextSelectorSection.setEditorLaunchPending(false);
}

function handleEditorFirstShowState(payload) {
  if (!isRendererReady()) {
    log.warn('BOOTSTRAP: editor-first-show-state received pre-READY; ignored.');
    return;
  }

  hideEditorLoader();

  if (!payload || typeof payload !== 'object') {
    log.error('editor-first-show-state payload invalid:', payload);
    return;
  }

  if (payload.state === 'ready' || payload.state === 'closed') {
    return;
  }

  if (payload.state !== 'failed') {
    log.error('editor-first-show-state payload has unsupported state:', payload);
    return;
  }

  // Lifecycle-owned Editor startup failures are disclosed once through Main's
  // native surface. The main renderer only clears its pending launch state.
}

// =============================================================================
// Text extraction actions
// =============================================================================
async function handleTextExtractionPicker() {
  await textExtractionEntry.startFromPicker();
}

async function handleTextExtractionAbort() {
  if (!guardUserAction('text-extraction-abort', { allowDuringProcessing: true })) return;
  try {
    const requestTextExtractionAbort = getOptionalElectronMethod('requestTextExtractionAbort', {
      dedupeKey: 'renderer.ipc.requestTextExtractionAbort.unavailable',
      unavailableMessage: 'requestTextExtractionAbort unavailable; abort action skipped.'
    });
    if (!requestTextExtractionAbort) {
      window.Notify.notifyMain('renderer.text_extraction.alerts.abort_error');
      return;
    }

    const result = await requestTextExtractionAbort({
      source: 'main_window',
      reason: 'user_abort_button',
    });
    if (!result || result.ok !== true) {
      if (result && result.code === 'NOT_ACTIVE' && result.state) {
        textExtractionStatusUi.applyProcessingModeState(result.state, { source: 'abort_not_active' });
        return;
      }
      log.error('text extraction abort failed:', result);
      window.Notify.notifyMain('renderer.text_extraction.alerts.abort_error');
      return;
    }

    textExtractionStatusUi.beginAbortFinalization();
    if (result.state) {
      textExtractionStatusUi.applyProcessingModeState(result.state, { source: 'abort_response' });
    }
    syncMainInteractionLockUi();
    window.Notify.notifyMain('renderer.text_extraction.alerts.cancellation_requested');
  } catch (err) {
    log.error('Error handling text extraction abort:', err);
    window.Notify.notifyMain('renderer.text_extraction.alerts.abort_error');
  }
}

// =============================================================================
// Current text actions
// =============================================================================
// Clipboard overwrite/append use the canonical apply path so truncation,
// persistence, and shared notifications stay consistent across entry points.
async function handleClipboardOverwrite() {
  if (!guardUserAction('clipboard-overwrite')) return;
  try {
    const read = await readClipboardText({
      tooLargeKey: 'renderer.main.alerts.clipboard_too_large',
      unavailableKey: 'renderer.main.alerts.overwrite_clipboard_error'
    });
    if (!read.ok) return;
    const clip = read.text;
    const repeatCount = currentTextSelectorSection.getClipboardRepeatCount();
    const applyResult = await applyTextViaCanonicalPath({
      mode: 'overwrite',
      textToApply: clip,
      repeatCount,
    });
    if (!applyResult || applyResult.ok !== true) {
      if (applyResult && applyResult.code === 'PAYLOAD_TOO_LARGE') {
        window.Notify.notifyMain('renderer.main.alerts.apply_too_large');
      } else {
        window.Notify.notifyMain('renderer.main.alerts.overwrite_clipboard_error');
      }
      return;
    }
    assertCurrentTextSubscription();
    if (applyResult.truncated) {
      window.Notify.notifyMain('renderer.main.alerts.apply_truncated');
    }
  } catch (err) {
    log.error('clipboard error:', err);
    window.Notify.notifyMain('renderer.main.alerts.overwrite_clipboard_error');
  }
}

async function handleClipboardAppend() {
  if (!guardUserAction('clipboard-append')) return;
  try {
    const read = await readClipboardText({
      tooLargeKey: 'renderer.main.alerts.clipboard_too_large',
      unavailableKey: 'renderer.main.alerts.append_clipboard_error'
    });
    if (!read.ok) return;
    const clip = read.text;
    const repeatCount = currentTextSelectorSection.getClipboardRepeatCount();
    const applyResult = await applyTextViaCanonicalPath({
      mode: 'append',
      textToApply: clip,
      repeatCount,
    });
    if (!applyResult || applyResult.ok !== true) {
      if (applyResult && applyResult.code === 'PAYLOAD_TOO_LARGE') {
        window.Notify.notifyMain('renderer.main.alerts.apply_too_large');
      } else if (applyResult && applyResult.code === 'TEXT_LIMIT') {
        window.Notify.notifyMain('renderer.main.alerts.append_text_limit');
      } else {
        window.Notify.notifyMain('renderer.main.alerts.append_clipboard_error');
      }
      return;
    }
    assertCurrentTextSubscription();
    if (applyResult.truncated) {
      window.Notify.notifyMain('renderer.main.alerts.apply_truncated');
    }
  } catch (err) {
    log.error('An error occurred while pasting the clipboard:', err);
    window.Notify.notifyMain('renderer.main.alerts.append_clipboard_error');
  }
}

async function handleOpenEditor() {
  if (!guardUserAction('open-editor')) return;
  showEditorLoader();
  try {
    const openEditor = getOptionalElectronMethod('openEditor', {
      dedupeKey: 'renderer.ipc.openEditor.unavailable',
      unavailableMessage: 'openEditor unavailable; Text Editor launch skipped.'
    });
    if (!openEditor) {
      hideEditorLoader();
      return;
    }
    const result = await openEditor();
    if (!result || typeof result.ok !== 'boolean') {
      log.error('open-editor result invalid:', result);
      hideEditorLoader();
      return;
    }
    if (result.ok !== true) {
      log.error('open-editor failed:', result);
      hideEditorLoader();
      return;
    }
    if (result.launchDisposition === 'reused-visible') {
      hideEditorLoader();
      return;
    }
    if (result.launchDisposition !== 'first-show-pending') {
      log.error('open-editor returned unsupported launchDisposition:', result);
      hideEditorLoader();
    }
  } catch (err) {
    log.error('Error opening Text Editor:', err);
    hideEditorLoader();
  }
}

async function handleOpenTextTimeCalculator() {
  if (!guardUserAction('text-time-calculator')) return;
  try {
    const openTextTimeCalculator = getOptionalElectronMethod('openTextTimeCalculator', {
      dedupeKey: 'renderer.ipc.openTextTimeCalculator.unavailable',
      unavailableMessage: 'openTextTimeCalculator unavailable; calculator launch skipped.',
    });
    if (!openTextTimeCalculator) return;

    const result = await openTextTimeCalculator();
    if (!result || result.ok !== true) {
      log.error('text-time-calculator open failed:', result);
    }
  } catch (err) {
    log.error('Error opening text-time calculator:', err);
  }
}

async function handleClearText() {
  if (!guardUserAction('clear-text')) return;
  try {
    const setCurrentText = getOptionalElectronMethod('setCurrentText', {
      dedupeKey: 'renderer.ipc.setCurrentText.unavailable',
      unavailableMessage: 'setCurrentText unavailable; clear-text action skipped.'
    });
    if (!setCurrentText) {
      window.Notify.notifyMain('renderer.main.alerts.clear_error');
      return;
    }
    const resp = await setCurrentText({
      text: '',
      meta: { source: 'main-window', action: 'overwrite' }
    });
    if (resp && resp.ok === false) {
      throw new Error(resp.error || 'set-current-text failed');
    }
    assertCurrentTextSubscription();
  } catch (err) {
    log.error('Error clearing text from main window:', err);
    window.Notify.notifyMain('renderer.main.alerts.clear_error');
  }
}

// =============================================================================
// Snapshot actions
// =============================================================================
async function handleLoadSnapshot() {
  if (!guardUserAction('snapshot-load')) return;
  if (typeof loadSnapshot !== 'function') {
    log.warn('loadSnapshot unavailable; snapshot-load action skipped.');
    return;
  }
  try {
    await loadSnapshot();
  } catch (err) {
    log.error('Error loading snapshot:', err);
  }
}

async function handleSaveSnapshot() {
  if (!guardUserAction('snapshot-save')) return;
  if (typeof saveSnapshot !== 'function') {
    log.warn('saveSnapshot unavailable; snapshot-save action skipped.');
    return;
  }
  try {
    await saveSnapshot();
  } catch (err) {
    log.error('Error saving snapshot:', err);
  }
}

// =============================================================================
// Task Editor entrypoints
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

async function openTaskEditorForMode(mode, { unavailableMessage } = {}) {
  const openTaskEditor = getOptionalElectronMethod('openTaskEditor', {
    dedupeKey: 'renderer.ipc.openTaskEditor.unavailable',
    unavailableMessage,
  });
  if (!openTaskEditor) {
    window.Notify.notifyMain('renderer.tasks.alerts.task_unavailable');
    return;
  }
  const res = await openTaskEditor(mode);
  handleTaskOpenResult(res, { mode });
}

async function handleNewTask() {
  if (!guardUserAction('task-new')) return;
  try {
    await openTaskEditorForMode('new', {
      unavailableMessage: 'openTaskEditor unavailable; new-task action skipped.'
    });
  } catch (err) {
    log.error('Error opening Task Editor (new):', err);
    window.Notify.notifyMain('renderer.tasks.alerts.task_open_error');
  }
}

async function handleLoadTask() {
  if (!guardUserAction('task-load')) return;
  try {
    await openTaskEditorForMode('load', {
      unavailableMessage: 'openTaskEditor unavailable; load-task action skipped.'
    });
  } catch (err) {
    log.error('Error opening Task Editor (load):', err);
    window.Notify.notifyMain('renderer.tasks.alerts.task_load_error');
  }
}

// =============================================================================
// Help tips and reading test
// =============================================================================
// Avoid repeating the same tip twice in a row when multiple tips exist.
function bindHelpAction() {
  if (btnHelp) {
    btnHelp.addEventListener('click', () => {
      if (!guardUserAction('help-tip')) return;
      const helpTipKeys = getHelpTipKeyList();
      const tipCount = helpTipKeys.length;
      if (!tipCount) {
        log.warn('Help tip list is empty; falling back to tip1.');
        window.Notify.notifyMain('renderer.tips.tip1');
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
          log.warn('Help tip toast failed; falling back to notifyMain:', err);
          window.Notify.notifyMain(tipKey);
        }
      } catch (err) {
        log.error('Help tip fallback failed:', err);
      }
    });
  }
}

async function handleOpenReadingSpeedTest() {
  if (!guardUserAction('reading-speed-test')) return;
  try {
    await readingSpeedTestUi.openEntryFlow();
  } catch (err) {
    log.error('Error opening reading speed test flow:', err);
    window.Notify.notifyMain('renderer.reading_test.alerts.start_failed');
  }
}

// =============================================================================
// Preset actions
// =============================================================================
// Preset buttons are wired here; preset modals and native confirmation
// dialogs are handled by main.
async function openPresetModalFromMain(payload) {
  if (!window.electronAPI || typeof window.electronAPI.openPresetModal !== 'function') {
    log.warn('openPresetModal unavailable in electronAPI; preset-modal action skipped.');
    window.Notify.notifyMain('renderer.presets.alerts.unavailable');
    return;
  }

  try {
    const res = await window.electronAPI.openPresetModal(payload);
    if (!res || res.ok === false) {
      log.error('Preset modal open failed:', res);
      window.Notify.notifyMain('renderer.presets.alerts.open_error');
    }
  } catch (err) {
    log.error('Error opening preset modal:', err);
    window.Notify.notifyMain('renderer.presets.alerts.open_error');
  }
}

function bindPresetActions() {
  btnNewPreset.addEventListener('click', async () => {
    if (!guardUserAction('preset-new')) return;
    await openPresetModalFromMain(wpmControls.getWpm());
  });

  // Edit preset
  btnEditPreset.addEventListener('click', async () => {
    if (!guardUserAction('preset-edit')) return;
    try {
      const selectedName = presetsCombobox.getValue();
      if (!selectedName) {
        log.warn('Preset edit requested without a selected preset; action skipped.');
        syncPresetActionButtons();
        return;
      }

      // Find preset data from cache
      const preset = wpmControls.getAllPresets().find(p => p.name === selectedName);
      if (!preset) {
        window.Notify.notifyMain('renderer.presets.alerts.not_found');
        return;
      }

      // Open modal in edit mode and pass preset data.
      const payload = { wpm: wpmControls.getWpm(), mode: 'edit', preset: preset };
      log.debug('openPresetModal payload:', payload);
      await openPresetModalFromMain(payload);
    } catch (err) {
      log.error('Error preparing edit preset modal payload:', err);
      window.Notify.notifyMain('renderer.presets.alerts.open_error');
    }
  });

  // Delete preset
  btnDeletePreset.addEventListener('click', async () => {
    if (!guardUserAction('preset-delete')) return;
    try {
      const name = presetsCombobox.getValue() || null;
      if (!name) {
        log.warn('Preset delete requested without a selected preset; action skipped.');
        syncPresetActionButtons();
        return;
      }
      const requestDeletePreset = getOptionalElectronMethod('requestDeletePreset', {
        dedupeKey: 'renderer.ipc.requestDeletePreset.unavailable',
        unavailableMessage: 'requestDeletePreset unavailable; preset-delete action skipped.'
      });
      if (!requestDeletePreset) {
        window.Notify.notifyMain('renderer.presets.alerts.delete_error');
        return;
      }
      // Call main to request deletion; main shows native dialogs as needed
      const res = await requestDeletePreset(name);

      if (res && res.ok) {
        // On success, reload presets and apply fallback selection if needed.
        const presetDeleteResult = await loadPresets({ settingsSnapshot: settingsCache || {} });
        currentTextRefreshPolicy.dispatchPresetOutcome(
          presetDeleteResult && presetDeleteResult.selectionOutcome
            ? presetDeleteResult.selectionOutcome
            : null,
          'preset delete'
        );
        // No further UI dialog required; main already showed confirmation.
        return;
      } else {
        // res.ok === false -> handle known codes
        if (res && res.code === 'CANCELLED') {
          // User cancelled; nothing to do
          return;
        }
        // Unexpected error: log and show a simple alert
        log.error('Error deleting preset:', res && res.error ? res.error : res);
        window.Notify.notifyMain('renderer.presets.alerts.delete_error');
      }
    } catch (err) {
      log.error('Error in deletion request:', err);
      window.Notify.notifyMain('renderer.presets.alerts.delete_error');
    }
  });

  // Restore default presets
  btnResetDefaultPresets.addEventListener('click', async () => {
    if (!guardUserAction('preset-reset-defaults')) return;
    try {
      const requestRestoreDefaults = getOptionalElectronMethod('requestRestoreDefaults', {
        dedupeKey: 'renderer.ipc.requestRestoreDefaults.unavailable',
        unavailableMessage: 'requestRestoreDefaults unavailable; presets restore action skipped.'
      });
      if (!requestRestoreDefaults) {
        window.Notify.notifyMain('renderer.presets.alerts.restore_error');
        return;
      }
      // Call main to request restore. Main will show a native confirmation dialog.
      const res = await requestRestoreDefaults();

      if (res && res.ok) {
        // Reload presets to reflect restored defaults
        const presetRestoreResult = await loadPresets({ settingsSnapshot: settingsCache || {} });
        currentTextRefreshPolicy.dispatchPresetOutcome(
          presetRestoreResult && presetRestoreResult.selectionOutcome
            ? presetRestoreResult.selectionOutcome
            : null,
          'preset restore'
        );
        return;
      } else {
        if (res && res.code === 'CANCELLED') {
          // User cancelled in native dialog; nothing to do
          return;
        }
        log.error('Error restoring presets:', res && res.error ? res.error : res);
        window.Notify.notifyMain('renderer.presets.alerts.restore_error');
      }
    } catch (err) {
      log.error('Error in restoring request:', err);
      window.Notify.notifyMain('renderer.presets.alerts.restore_error');
    }
  });
}

// =============================================================================
// Stopwatch
// =============================================================================
const cronoDisplay = document.getElementById('cronoDisplay');
const tToggle = document.getElementById('cronoToggle');
const tReset = document.getElementById('cronoReset');

const cronoModule = (typeof window !== 'undefined') ? window.RendererCrono : null;

const initCronoController = () => {
  if (!cronoModule || typeof cronoModule.createController !== 'function') {
    log.warn('RendererCrono.createController unavailable.');
    return;
  }
  const icons = getCronoIcons();
  cronoController = cronoModule.createController({
    elements: { cronoDisplay, tToggle, tReset, realWpmDisplay, toggleVF },
    electronAPI: window.electronAPI,
    contarTexto,
    obtenerSeparadoresDeNumeros,
    formatearNumero,
    getIdiomaActual: () => idiomaActual,
    getCurrentText: () => getCurrentTextValue(),
    getSettingsCache: () => settingsCache,
    playIconName: icons.playIconName,
    pauseIconName: icons.pauseIconName
  });
  if (cronoController && typeof cronoController.bind === 'function') {
    cronoController.bind();
  }
  if (cronoController && typeof cronoController.updateIcons === 'function') {
    cronoController.updateIcons(icons);
  }
};

// =============================================================================
// Renderer bootstrap entrypoint
// =============================================================================
// Core listener and UI wiring must happen before runStartupOrchestrator().
// The current-text stream is armed by runMainStartup() after its authoritative
// bootstrap snapshot is synchronized and before READY can unblock.
function startRendererBootstrap() {
  infoModal.init({
    getCurrentLanguage: () => (settingsCache && settingsCache.language) || idiomaActual || DEFAULT_LANG,
  });
  armIpcSubscriptions();
  setupToggleModoPreciso();
  currentTextSelectorSection.bindActions({
    onTextExtraction: handleTextExtractionPicker,
    onTextExtractionAbort: handleTextExtractionAbort,
    onOverwriteClipboard: handleClipboardOverwrite,
    onAppendClipboard: handleClipboardAppend,
    onOpenEditor: handleOpenEditor,
    onClearText: handleClearText,
    onLoadSnapshot: handleLoadSnapshot,
    onSaveSnapshot: handleSaveSnapshot,
    onNewTask: handleNewTask,
    onLoadTask: handleLoadTask,
    onReadingSpeedTest: handleOpenReadingSpeedTest,
    onPreviewSpoilerEnabledChange: async (enabled) => {
      const result = await window.electronAPI.setPreviewSpoilerEnabled(enabled);
      if (!result || result.ok !== true) {
        throw new Error('setPreviewSpoilerEnabled failed.');
      }
    },
  });
  textTimeCalculatorLauncher.bindActions({
    onOpenCalculator: handleOpenTextTimeCalculator,
  });
  registerMenuActions();
  bindPresetSelection();
  bindSpeedControls();
  initializeDelegatedIntegrations();
  bindHelpAction();
  bindPresetActions();
  initCronoController();
  uiListenersArmed = true;
  syncMainInteractionLockUi();
  runStartupOrchestrator();
}

startRendererBootstrap();

// =============================================================================
// End of public/renderer.js
// =============================================================================
