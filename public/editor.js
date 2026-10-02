// public/editor.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Text Editor renderer entry point.
// Responsibilities:
// - Validate required renderer surfaces and configure the Text Editor bootstrap.
// - Report base-presentation readiness or failure to the existing Main lifecycle boundary.
// - Build the shared editor context consumed by the UI and engine modules.
// - Apply bootstrap config, settings, translations, and initial text state.
// - Keep editor window state and settings-driven UI in sync with bridge updates.
// - Route local editor interactions back through the main-process text bridge.

// =============================================================================
// Required bootstrap surfaces and early lifecycle reporting
// =============================================================================
// This report path is attempted before scoped logger acquisition for early startup failure.
const editorBridge = window.editorAPI;
if (!editorBridge || typeof editorBridge.reportBasePresentationState !== 'function') {
  throw new Error('[editor] editorAPI.reportBasePresentationState unavailable; cannot continue');
}

function getBasePresentationGeneration(search) {
  try {
    const rawGeneration = new URLSearchParams(typeof search === 'string' ? search : '')
      .get('firstShowGeneration');
    const generation = Number(rawGeneration);
    return Number.isInteger(generation) && generation > 0 ? generation : null;
  } catch {
    return null;
  }
}

const basePresentationGeneration = getBasePresentationGeneration(
  window.location && window.location.search
);

function reportBasePresentationState(payload) {
  if (!Number.isInteger(basePresentationGeneration) || basePresentationGeneration <= 0) {
    if (log) {
      log.warn('BOOTSTRAP: startup firstShowGeneration missing; base presentation report skipped.');
    } else {
      console.error('BOOTSTRAP: startup firstShowGeneration missing; base presentation report skipped before logger initialization.');
    }
    return;
  }
  try {
    editorBridge.reportBasePresentationState({
      generation: basePresentationGeneration,
      status: payload && payload.status === 'failed' ? 'failed' : 'ready',
      ...(payload && typeof payload.reason === 'string' && payload.reason.trim()
        ? { reason: payload.reason.trim() }
        : {}),
    });
  } catch (err) {
    if (log) {
      log.error('BOOTSTRAP: reportBasePresentationState call failed:', err);
    } else {
      console.error('BOOTSTRAP: reportBasePresentationState call failed before logger initialization:', err);
    }
  }
}

// =============================================================================
// Bootstrap dependencies and configuration
// =============================================================================
let editorStartupPresentation = null;
let startupPresentation = null;

let log = null;
let appConstants = null;
let defaultLang;
let pasteAllowLimit;
let smallUpdateThreshold;
let editorFontSizeMinPx;
let editorFontSizeMaxPx;
let editorFontSizeDefaultPx;
let editorFontSizeStepPx;
let editorMaximizedTextWidthMinPx;
let editorMaximizedTextWidthMaxPx;
let editorMaximizedTextWidthDefaultPx;
let editorMaximizedGutterMinPx;
let bootstrapSetupError = null;

function isFiniteNonNegativeNumber(value) {
  return Number.isFinite(value) && value >= 0;
}

function failInvalidAppConstant(name) {
  throw new Error(`[editor] AppConstants.${name} invalid; cannot continue`);
}

function validateRequiredAppConstants(constants) {
  if (typeof constants.DEFAULT_LANG !== 'string' || constants.DEFAULT_LANG.trim() === '') {
    failInvalidAppConstant('DEFAULT_LANG');
  }
  if (!Number.isFinite(constants.MAX_TEXT_CHARS) || constants.MAX_TEXT_CHARS <= 0) {
    failInvalidAppConstant('MAX_TEXT_CHARS');
  }
  if (!isFiniteNonNegativeNumber(constants.PASTE_ALLOW_LIMIT)) {
    failInvalidAppConstant('PASTE_ALLOW_LIMIT');
  }
  if (!isFiniteNonNegativeNumber(constants.SMALL_UPDATE_THRESHOLD)) {
    failInvalidAppConstant('SMALL_UPDATE_THRESHOLD');
  }
  if (
    !isFiniteNonNegativeNumber(constants.EDITOR_FONT_SIZE_MIN_PX)
    || !isFiniteNonNegativeNumber(constants.EDITOR_FONT_SIZE_MAX_PX)
    || !isFiniteNonNegativeNumber(constants.EDITOR_FONT_SIZE_DEFAULT_PX)
    || constants.EDITOR_FONT_SIZE_MIN_PX > constants.EDITOR_FONT_SIZE_MAX_PX
    || constants.EDITOR_FONT_SIZE_DEFAULT_PX < constants.EDITOR_FONT_SIZE_MIN_PX
    || constants.EDITOR_FONT_SIZE_DEFAULT_PX > constants.EDITOR_FONT_SIZE_MAX_PX
  ) {
    failInvalidAppConstant('EDITOR_FONT_SIZE_*_PX');
  }
  if (!Number.isFinite(constants.EDITOR_FONT_SIZE_STEP_PX) || constants.EDITOR_FONT_SIZE_STEP_PX <= 0) {
    failInvalidAppConstant('EDITOR_FONT_SIZE_STEP_PX');
  }
  if (
    !isFiniteNonNegativeNumber(constants.EDITOR_MAXIMIZED_TEXT_WIDTH_MIN_PX)
    || !isFiniteNonNegativeNumber(constants.EDITOR_MAXIMIZED_TEXT_WIDTH_MAX_PX)
    || !isFiniteNonNegativeNumber(constants.EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX)
    || constants.EDITOR_MAXIMIZED_TEXT_WIDTH_MIN_PX > constants.EDITOR_MAXIMIZED_TEXT_WIDTH_MAX_PX
    || constants.EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX < constants.EDITOR_MAXIMIZED_TEXT_WIDTH_MIN_PX
    || constants.EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX > constants.EDITOR_MAXIMIZED_TEXT_WIDTH_MAX_PX
  ) {
    failInvalidAppConstant('EDITOR_MAXIMIZED_TEXT_WIDTH_*_PX');
  }
  if (!isFiniteNonNegativeNumber(constants.EDITOR_MAXIMIZED_GUTTER_MIN_PX)) {
    failInvalidAppConstant('EDITOR_MAXIMIZED_GUTTER_MIN_PX');
  }
}

if (typeof window.getLogger !== 'function') {
  reportBasePresentationState({ status: 'failed', reason: 'bootstrap-failed' });
  throw new Error('[editor] window.getLogger unavailable; cannot continue');
}
try {
  log = window.getLogger('editor');
} catch (err) {
  reportBasePresentationState({ status: 'failed', reason: 'bootstrap-failed' });
  throw err;
}
try {
  log.debug('Text Editor starting...');

  appConstants = window.AppConstants;
  if (!appConstants) {
    throw new Error('[editor] AppConstants unavailable; verify constants.js load order');
  }
  validateRequiredAppConstants(appConstants);
  ({
    DEFAULT_LANG: defaultLang,
    PASTE_ALLOW_LIMIT: pasteAllowLimit,
    SMALL_UPDATE_THRESHOLD: smallUpdateThreshold,
    EDITOR_FONT_SIZE_MIN_PX: editorFontSizeMinPx,
    EDITOR_FONT_SIZE_MAX_PX: editorFontSizeMaxPx,
    EDITOR_FONT_SIZE_DEFAULT_PX: editorFontSizeDefaultPx,
    EDITOR_FONT_SIZE_STEP_PX: editorFontSizeStepPx,
    EDITOR_MAXIMIZED_TEXT_WIDTH_MIN_PX: editorMaximizedTextWidthMinPx,
    EDITOR_MAXIMIZED_TEXT_WIDTH_MAX_PX: editorMaximizedTextWidthMaxPx,
    EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX: editorMaximizedTextWidthDefaultPx,
    EDITOR_MAXIMIZED_GUTTER_MIN_PX: editorMaximizedGutterMinPx,
  } = appConstants);
} catch (err) {
  bootstrapSetupError = err;
}

const editorMaximizedLayoutCore = window.EditorMaximizedLayoutCore;
const editorFindReplaceCore = window.EditorFindReplaceCore;
let editorI18nTerminal = false;
let latestCurrentTextRevision = 0;

// =============================================================================
// DOM references
// =============================================================================
const editorWrap = document.getElementById('editorWrap');
const editorLayout = document.getElementById('editorLayout');
const editorLeftGutter = document.getElementById('editorLeftGutter');
const editorTextColumn = document.getElementById('editorTextColumn');
const editorRightGutter = document.getElementById('editorRightGutter');
const editor = document.getElementById('editorArea');
const btnTrash = document.getElementById('btnTrash');
const calcWhileTyping = document.getElementById('calcWhileTyping');
const spellcheckToggle = document.getElementById('spellcheckToggle');
const btnCalc = document.getElementById('btnCalc');
const calcLabel = document.querySelector('.calc-label');
const spellcheckLabel = document.querySelector('.spellcheck-label');
const applyDescription = document.getElementById('editorApplyDescription');
const autoApplyDescription = document.getElementById('editorAutoApplyDescription');
const spellcheckDescription = document.getElementById('editorSpellcheckDescription');
const textSizeControls = document.getElementById('editorTextSizeControls');
const textSizeLabel = document.getElementById('editorTextSizeLabel');
const btnTextSizeDecrease = document.getElementById('btnTextSizeDecrease');
const btnTextSizeIncrease = document.getElementById('btnTextSizeIncrease');
const btnTextSizeReset = document.getElementById('btnTextSizeReset');
const textSizeValue = document.getElementById('editorTextSizeValue');
const readProgress = document.getElementById('editorReadProgress');
const readProgressLabel = document.getElementById('editorReadProgressLabel');
const readProgressValue = document.getElementById('editorReadProgressValue');
const bottomBar = document.getElementById('bottomBar');
const readingTestPrestartOverlay = document.getElementById('readingTestPrestartOverlay');
const readingTestPrestartMessage = document.getElementById('readingTestPrestartMessage');

// =============================================================================
// Shared state / context
// =============================================================================
let ctx = null;

function createEditorContext() {
  return {
    AppConstants: appConstants,
    DEFAULT_LANG: defaultLang,
    PASTE_ALLOW_LIMIT: pasteAllowLimit,
    SMALL_UPDATE_THRESHOLD: smallUpdateThreshold,
    EDITOR_FONT_SIZE_MIN_PX: editorFontSizeMinPx,
    EDITOR_FONT_SIZE_MAX_PX: editorFontSizeMaxPx,
    EDITOR_FONT_SIZE_DEFAULT_PX: editorFontSizeDefaultPx,
    EDITOR_FONT_SIZE_STEP_PX: editorFontSizeStepPx,
    EDITOR_MAXIMIZED_TEXT_WIDTH_MIN_PX: editorMaximizedTextWidthMinPx,
    EDITOR_MAXIMIZED_TEXT_WIDTH_MAX_PX: editorMaximizedTextWidthMaxPx,
    EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX: editorMaximizedTextWidthDefaultPx,
    EDITOR_MAXIMIZED_GUTTER_MIN_PX: editorMaximizedGutterMinPx,
    DEBOUNCE_MS: 300,
    editorAPI: editorBridge,
    editorMaximizedLayoutCore,
    editorFindReplaceCore,
    rendererI18n: window.RendererI18n || {},
    dom: {
      editorWrap,
      editorLayout,
      editorLeftGutter,
      editorTextColumn,
      editorRightGutter,
      editor,
      btnTrash,
      calcWhileTyping,
      spellcheckToggle,
      btnCalc,
      calcLabel,
      spellcheckLabel,
      applyDescription,
      autoApplyDescription,
      spellcheckDescription,
      textSizeControls,
      textSizeLabel,
      btnTextSizeDecrease,
      btnTextSizeIncrease,
      btnTextSizeReset,
      textSizeValue,
      readProgress,
      readProgressLabel,
      readProgressValue,
      bottomBar,
      readingTestPrestartOverlay,
      readingTestPrestartMessage,
    },
    state: {
      maxTextChars: appConstants.MAX_TEXT_CHARS,
      debounceTimer: null,
      suppressLocalUpdate: false,
      spellcheckEnabled: true,
      spellcheckAvailable: true,
      editorFontSizePx: editorFontSizeDefaultPx,
      editorWindowMaximized: false,
      maximizedTextWidthPx: editorMaximizedTextWidthDefaultPx,
      editorMarginDrag: null,
      readProgressFramePending: false,
      idiomaActual: defaultLang,
      translationsLoadedFor: null,
      startupFirstShowGeneration: null,
      startupPresentation: null,
    },
    ui: null,
    engine: null,
  };
}

// =============================================================================
// Bootstrap assembly
// =============================================================================
function requireBootstrapMethod(owner, methodName, ownerName) {
  if (!owner || typeof owner[methodName] !== 'function') {
    throw new Error(`[editor] ${ownerName}.${methodName} unavailable; cannot continue`);
  }
}

function validateEditorBootstrapRequirements() {
  requireBootstrapMethod(ctx.editorAPI, 'setCurrentText', 'editorAPI');
  requireBootstrapMethod(ctx.editorAPI, 'getInitialCurrentTextSnapshot', 'editorAPI');
  requireBootstrapMethod(ctx.editorAPI, 'onExternalUpdate', 'editorAPI');
  // Replace is not negotiated as an optional capability in the current bridge contract.
  // Relax these checks only with an owner-visible availability contract that disables Replace admission coherently.
  requireBootstrapMethod(ctx.editorAPI, 'onReplaceRequest', 'editorAPI');
  requireBootstrapMethod(ctx.editorAPI, 'sendReplaceResponse', 'editorAPI');
  requireBootstrapMethod(ctx.editorAPI, 'getWindowState', 'editorAPI');
  requireBootstrapMethod(editorMaximizedLayoutCore, 'clampPreferredTextWidthPx', 'EditorMaximizedLayoutCore');
  requireBootstrapMethod(
    editorMaximizedLayoutCore,
    'computeNextPreferredTextWidthPxFromDrag',
    'EditorMaximizedLayoutCore'
  );
  requireBootstrapMethod(editorFindReplaceCore, 'resolveLiteralMatchByOrdinal', 'EditorFindReplaceCore');
  requireBootstrapMethod(editorFindReplaceCore, 'computeLiteralReplaceAll', 'EditorFindReplaceCore');
  requireBootstrapMethod(editorStartupPresentation, 'parseStartupQuery', 'EditorStartupPresentation');
  requireBootstrapMethod(
    editorStartupPresentation,
    'createStartupPresentationController',
    'EditorStartupPresentation'
  );
  requireBootstrapMethod(window.EditorUI, 'createEditorUI', 'EditorUI');
  requireBootstrapMethod(window.EditorEngine, 'createEditorEngine', 'EditorEngine');
  requireBootstrapMethod(ctx.rendererI18n, 'transitionRendererTranslations', 'RendererI18n');
  requireBootstrapMethod(ctx.rendererI18n, 'tRenderer', 'RendererI18n');
  requireBootstrapMethod(ctx.rendererI18n, 'resolveUserTextDirection', 'RendererI18n');

  const requiredDom = [
    editorWrap,
    editorLayout,
    editorLeftGutter,
    editorTextColumn,
    editorRightGutter,
    editor,
    btnTrash,
    calcWhileTyping,
    spellcheckToggle,
    btnCalc,
    textSizeControls,
    btnTextSizeDecrease,
    btnTextSizeIncrease,
    btnTextSizeReset,
    bottomBar,
    readingTestPrestartOverlay,
  ];
  if (requiredDom.some((element) => !element)) {
    throw new Error('[editor] required Text Editor DOM unavailable; cannot continue');
  }
}

function establishStartupPresentation() {
  editorStartupPresentation = window.EditorStartupPresentation;
  requireBootstrapMethod(editorStartupPresentation, 'parseStartupQuery', 'EditorStartupPresentation');
  requireBootstrapMethod(
    editorStartupPresentation,
    'createStartupPresentationController',
    'EditorStartupPresentation'
  );
  const startupQuery = editorStartupPresentation.parseStartupQuery(window.location.search || '');
  const nextPresentation = editorStartupPresentation.createStartupPresentationController(startupQuery);
  if (!nextPresentation || !Number.isInteger(nextPresentation.firstShowGeneration)) {
    throw new Error('[editor] startup presentation firstShowGeneration unavailable; cannot continue');
  }
  startupPresentation = nextPresentation;
}

function initializeEditorBootstrap() {
  ctx = createEditorContext();
  establishStartupPresentation();
  ctx.state.startupPresentation = startupPresentation;
  ctx.state.startupFirstShowGeneration = startupPresentation.firstShowGeneration;
  ctx.state.editorWindowMaximized = startupPresentation.isInitiallyMaximized();
  validateEditorBootstrapRequirements();
  ctx.ui = window.EditorUI.createEditorUI(ctx);
  ctx.engine = window.EditorEngine.createEditorEngine(ctx);
  ctx.ui.setNormalInteractionAvailable(false);
  registerEditorBridgeListeners();
}

// =============================================================================
// Startup presentation and local UI helpers
// =============================================================================
function applyActualWindowState(windowState) {
  ctx.state.editorWindowMaximized = !!(windowState && windowState.maximized === true);
  ctx.state.maximizedTextWidthPx = ctx.ui.clampEditorMaximizedTextWidthPx(
    windowState && windowState.maximizedTextWidthPx
  );
  ctx.ui.setLocalEditorMaximizedTextWidthPx(ctx.state.maximizedTextWidthPx);
  ctx.ui.setLocalEditorWindowMaximized(ctx.state.editorWindowMaximized);
}

function captureActualWindowState(windowState, options = {}) {
  const bootstrap = !!(options && options.bootstrap);
  if (windowState && windowState.ok === false) {
    if (bootstrap) {
      log.warn(
        'BOOTSTRAP: editorAPI.getWindowState returned a non-ok result; keeping startup presentation until a live window-state update arrives.',
        windowState.error || 'unknown'
      );
    } else {
      log.warn(
        'editorAPI.onWindowStateChanged returned a non-ok result; keeping current maximized layout state.',
        windowState.error || 'unknown'
      );
    }
    return;
  }
  const nextWindowState = ctx.state.startupPresentation.captureActualWindowState(windowState);
  if (nextWindowState) {
    applyActualWindowState(nextWindowState);
  }
}

function releaseStartupPresentationLock() {
  const nextWindowState = ctx.state.startupPresentation.releaseStartupLock();
  if (nextWindowState) {
    applyActualWindowState(nextWindowState);
  }
}

function nextAnimationFrame() {
  if (typeof window.requestAnimationFrame !== 'function') {
    log.warn('BOOTSTRAP: requestAnimationFrame unavailable; continuing without startup frame boundary.');
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function applyInitialLocalUiState() {
  ctx.ui.applyTextareaDefaults();
  ctx.ui.applyEditorLanguage();
  ctx.ui.updateEditorTextDirection();
  ctx.ui.setLocalSpellcheckState({
    preferenceEnabled: ctx.state.spellcheckEnabled,
    available: ctx.state.spellcheckAvailable,
  });
  ctx.ui.setLocalEditorFontSizePx(ctx.state.editorFontSizePx);
  ctx.ui.setLocalEditorMaximizedTextWidthPx(ctx.state.maximizedTextWidthPx);
  ctx.ui.setLocalEditorWindowMaximized(ctx.state.editorWindowMaximized);
  ctx.ui.updateReadProgressUi();
}

// =============================================================================
// Renderer i18n coordination
// =============================================================================
async function transitionEditorTranslations(language) {
  const target = language || defaultLang;
  await ctx.rendererI18n.transitionRendererTranslations(target, {
    applyTranslations: async ({ language: appliedLanguage }) => {
      ctx.state.idiomaActual = appliedLanguage;
      await ctx.ui.applyEditorTranslations(appliedLanguage);
      ctx.ui.updateEditorTextDirection();
    },
  });
  ctx.state.translationsLoadedFor = ctx.state.idiomaActual;
}

function reportEditorI18nFailure(err, { startup = false } = {}) {
  const transition = err && err.rendererI18nTransition;
  if (!transition) {
    return;
  }
  if (!startup && transition.hadEstablishedState && !transition.restorationFailed) {
    log.error('Text Editor language transition failed; previous translation state remains authoritative:', err);
    return;
  }
  log.error('Text Editor i18n failure requires window closure:', err);
  reportTerminalEditorI18nFailure(startup ? 'startup' : 'transition-restoration');
}

function reportTerminalEditorI18nFailure(kind) {
  editorI18nTerminal = true;
  if (ctx.ui && typeof ctx.ui.setNormalInteractionAvailable === 'function') {
    ctx.ui.setNormalInteractionAvailable(false);
  }
  if (typeof window.editorAPI.reportRendererI18nFailure !== 'function') {
    log.warn('editorAPI.reportRendererI18nFailure unavailable (ignored); closing failed renderer locally.');
    if (typeof window.close === 'function') window.close();
    return;
  }
  try {
    window.editorAPI.reportRendererI18nFailure({
      kind,
    });
  } catch (reportErr) {
    log.warn('editorAPI.reportRendererI18nFailure failed (ignored); closing failed renderer locally:', reportErr);
    if (typeof window.close === 'function') window.close();
  }
}

// =============================================================================
// Bootstrap data and local editor setup
// =============================================================================
async function bootstrapEditorEnvironment() {
  return enqueueEditorSemanticWork(async () => {
    try {
      if (typeof ctx.editorAPI.getAppConfig !== 'function') {
        log.warn('BOOTSTRAP: editorAPI.getAppConfig missing; using defaults.');
      } else {
        const cfg = await ctx.editorAPI.getAppConfig();
        if (appConstants && typeof appConstants.applyConfig === 'function') {
          ctx.state.maxTextChars = appConstants.applyConfig(cfg);
        } else if (cfg && cfg.maxTextChars) {
          ctx.state.maxTextChars = Number(cfg.maxTextChars) || ctx.state.maxTextChars;
        }
      }
    } catch (err) {
      log.warn('BOOTSTRAP: getAppConfig failed; using defaults:', err);
    }

    let settings = null;
    try {
      if (typeof ctx.editorAPI.getSettings === 'function') {
        settings = await ctx.editorAPI.getSettings();
      } else {
        log.warn('BOOTSTRAP: editorAPI.getSettings missing; using default language.');
      }
    } catch (err) {
      log.warn('BOOTSTRAP: getSettings failed; using default editor settings:', err);
    }

    try {
      captureActualWindowState(await ctx.editorAPI.getWindowState(), { bootstrap: true });
    } catch (err) {
      log.warn(
        'BOOTSTRAP: getWindowState failed; keeping startup presentation until a live window-state update arrives:',
        err
      );
    }

    const established = await applyEditorSettingsSnapshot(settings, { startup: true });
    if (!established) {
      throw new Error('[editor] required renderer translation state could not be established during bootstrap');
    }

    applyInitialLocalUiState();
  });
}

async function bootstrapInitialEditorText() {
  let snapshot;

  try {
    snapshot = await ctx.editorAPI.getInitialCurrentTextSnapshot();
  } catch (err) {
    throw new Error(`[editor] editorAPI.getInitialCurrentTextSnapshot failed during bootstrap: ${String(err)}`);
  }

  if (!snapshot || snapshot.ok !== true || typeof snapshot.text !== 'string'
    || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 1) {
    throw new Error('[editor] editorAPI.getInitialCurrentTextSnapshot returned an invalid snapshot');
  }

  if (snapshot.revision > latestCurrentTextRevision) {
    latestCurrentTextRevision = snapshot.revision;
    const applied = await ctx.engine.applyInitialText({
      text: snapshot.text,
      meta: { source: 'main', action: 'init' },
    });
    if (applied !== true) {
      throw new Error('[editor] initial current-text application failed during bootstrap');
    }
  }
  ctx.ui.updateEditorTextDirection();
  btnCalc.disabled = !!(calcWhileTyping && calcWhileTyping.checked);
}

function registerEditorMarginGutter(gutter, side) {
  if (!gutter) return;

  // Both gutters use the same pointer and reset wiring; side identifies the active gutter.
  gutter.addEventListener('pointerdown', (event) => {
    ctx.ui.handleEditorMarginPointerDown(event, side);
  });
  gutter.addEventListener('dblclick', () => {
    ctx.ui.resetEditorMaximizedTextWidth().catch((err) => {
      log.error('Error resetting Text Editor maximized text width:', err);
    });
  });
}

// =============================================================================
// Live bridge integration
// =============================================================================
let editorSemanticQueue = Promise.resolve();

function enqueueEditorSemanticWork(work) {
  const run = async () => {
    // Do not admit queued Text Editor semantic work after terminal i18n failure.
    if (editorI18nTerminal) return;
    return work();
  };
  editorSemanticQueue = editorSemanticQueue.then(run, run);
  return editorSemanticQueue;
}

async function applyEditorSettingsSnapshot(settings, { startup = false } = {}) {
  const nextLang = settings && settings.language
    ? settings.language
    : (startup ? defaultLang : '');
  const nextSpellcheckEnabled = !settings || settings.spellcheckEnabled !== false;
  const nextSpellcheckAvailable = !settings || settings.spellcheckAvailable !== false;
  const nextEditorFontSizePx = ctx.ui.clampEditorFontSizePx(settings && settings.editorFontSizePx);
  const languageChanged = !!nextLang && (startup || nextLang !== ctx.state.idiomaActual);
  const spellcheckChanged = (
    nextSpellcheckEnabled !== ctx.state.spellcheckEnabled
    || nextSpellcheckAvailable !== ctx.state.spellcheckAvailable
  );
  const fontSizeChanged = nextEditorFontSizePx !== ctx.state.editorFontSizePx;

  if (!languageChanged && !spellcheckChanged && !fontSizeChanged) return;

  if (languageChanged) {
    try {
      await transitionEditorTranslations(nextLang);
    } catch (err) {
      const transition = err && err.rendererI18nTransition;
      if (!transition) {
        log.error('Text Editor settings update failed:', err);
        return false;
      }
      if (!startup) {
        reportEditorI18nFailure(err, { startup: false });
      }
      if (!transition.hadEstablishedState || transition.restorationFailed) {
        return false;
      }
    }
  }

  try {
    if (spellcheckChanged) {
      ctx.state.spellcheckEnabled = nextSpellcheckEnabled;
      ctx.state.spellcheckAvailable = nextSpellcheckAvailable;
      ctx.ui.setLocalSpellcheckState({
        preferenceEnabled: nextSpellcheckEnabled,
        available: nextSpellcheckAvailable,
      });
    }
    if (fontSizeChanged) {
      ctx.state.editorFontSizePx = nextEditorFontSizePx;
      ctx.ui.setLocalEditorFontSizePx(nextEditorFontSizePx);
    } else if (languageChanged) {
      ctx.ui.updateEditorTextSizeUi();
    }
  } catch (err) {
    log.error('Text Editor settings update failed:', err);
    return false;
  }

  return true;
}

function enqueueEditorSettingsApplication(settings) {
  const run = () => applyEditorSettingsSnapshot(settings);
  // Admit full settings snapshots after the preceding root semantic operation has settled.
  return enqueueEditorSemanticWork(run);
}

function registerEditorBridgeListeners() {
  try {
    ctx.editorAPI.onExternalUpdate(async (payload) => {
      if (editorI18nTerminal) return;
      const revision = payload && payload.revision;
      if (!Number.isSafeInteger(revision) || revision < 1) {
        log.error('editor-text-updated payload ignored: revision must be a positive safe integer.');
        return;
      }
      if (revision <= latestCurrentTextRevision) return;
      latestCurrentTextRevision = revision;
      await ctx.engine.applyExternalUpdate(payload);
      ctx.ui.updateEditorTextDirection();
    });
    ctx.editorAPI.onReplaceRequest((payload) => {
      if (editorI18nTerminal) return;
      const requestId = Number(payload && payload.requestId);

      Promise.resolve()
        .then(() => ctx.engine.handleReplaceRequest(payload || {}))
        .catch((err) => {
          log.error('Text Editor replace request handling failed:', err);
          return {
            requestId,
            operation: payload && payload.operation === 'replace-all' ? 'replace-all' : 'replace-current',
            ok: false,
            status: 'internal-error',
            error: String(err),
            replacements: 0,
            finalTextLength: editor.value.length,
          };
        })
        .then((response) => {
          try {
            ctx.editorAPI.sendReplaceResponse(response);
          } catch (err) {
            log.warn('Text Editor replace response send failed (ignored):', err);
          }
        });
    });
  } catch (err) {
    throw new Error(`[editor] required live listener registration failed: ${String(err)}`);
  }

  if (typeof ctx.editorAPI.onSettingsChanged !== 'function') {
    reportTerminalEditorI18nFailure('settings-listener');
    throw new Error('[editor] editorAPI.onSettingsChanged unavailable; cannot maintain required live settings synchronization');
  }
  try {
    ctx.editorAPI.onSettingsChanged((settings) => enqueueEditorSettingsApplication(settings));
  } catch (err) {
    reportTerminalEditorI18nFailure('settings-listener');
    throw new Error(`[editor] editorAPI.onSettingsChanged registration failed: ${String(err)}`);
  }

  if (typeof ctx.editorAPI.onWindowStateChanged === 'function') {
    try {
      ctx.editorAPI.onWindowStateChanged((windowState) => {
        if (editorI18nTerminal) return;
        captureActualWindowState(windowState, { bootstrap: false });
      });
    } catch (err) {
      log.warn(
        'BOOTSTRAP: editorAPI.onWindowStateChanged registration failed; live maximized layout updates disabled:',
        err
      );
    }
  } else {
    log.warn('BOOTSTRAP: editorAPI.onWindowStateChanged missing; live maximized layout updates disabled.');
  }

  if (typeof ctx.editorAPI.onReadingTestPrestartStateChanged === 'function') {
    try {
      ctx.editorAPI.onReadingTestPrestartStateChanged((payload) => {
        if (editorI18nTerminal) return;
        ctx.ui.applyReadingTestPrestartState(payload);
      });
    } catch (err) {
      log.warn(
        'BOOTSTRAP: editorAPI.onReadingTestPrestartStateChanged registration failed; reading-test prestart overlay disabled:',
        err
      );
    }
  } else {
    log.warn(
      'BOOTSTRAP: editorAPI.onReadingTestPrestartStateChanged missing; reading-test prestart overlay disabled.'
    );
  }
}

if (readingTestPrestartOverlay) {
  readingTestPrestartOverlay.addEventListener('keydown', (event) => {
    if (readingTestPrestartOverlay.getAttribute('aria-hidden') === 'false') {
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

// =============================================================================
// App lifecycle / bootstrapping
// =============================================================================
try {
  if (bootstrapSetupError) throw bootstrapSetupError;
  initializeEditorBootstrap();
} catch (err) {
  bootstrapSetupError = err;
  if (log) {
    log.error('BOOTSTRAP: Text Editor required startup setup failed:', err);
  }
}

Promise.resolve()
  .then(async () => {
    if (bootstrapSetupError) throw bootstrapSetupError;
    await bootstrapEditorEnvironment();
    await bootstrapInitialEditorText();
    releaseStartupPresentationLock();
    await nextAnimationFrame();
    ctx.ui.setNormalInteractionAvailable(true);
    ctx.ui.focusEditorAtTop();
    reportBasePresentationState({ status: 'ready' });
  })
  .catch((err) => {
    if (log) {
      log.error('BOOTSTRAP: Text Editor startup failed:', err);
    }
    editorI18nTerminal = true;
    if (ctx && ctx.ui && typeof ctx.ui.setNormalInteractionAvailable === 'function') {
      ctx.ui.setNormalInteractionAvailable(false);
    }
    reportBasePresentationState({ status: 'failed', reason: 'bootstrap-failed' });
  });

// =============================================================================
// Paste / drop handlers
// =============================================================================
if (!bootstrapSetupError && editor) {
  const pasteTransferConfig = {
    source: 'paste',
    noTextAlertKey: 'renderer.editor.alerts.paste_no_text',
    tooBigAlertKey: 'renderer.editor.alerts.paste_too_big',
    getText: (event) => (event.clipboardData && event.clipboardData.getData('text/plain')) || '',
    insertOptions: {
      action: 'paste',
      limitAlertKey: 'renderer.editor.alerts.paste_limit',
      truncatedAlertKey: 'renderer.editor.alerts.paste_truncated'
    }
  };

  const dropTransferConfig = {
    source: 'drop',
    noTextAlertKey: 'renderer.editor.alerts.drop_no_text',
    tooBigAlertKey: 'renderer.editor.alerts.drop_too_big',
    getText: (event) => {
      const dt = event.dataTransfer;
      return (dt && dt.getData && dt.getData('text/plain')) || '';
    },
    insertOptions: {
      action: 'drop',
      limitAlertKey: 'renderer.editor.alerts.drop_limit',
      truncatedAlertKey: 'renderer.editor.alerts.drop_truncated',
      onError: (err) => log.warn(
        'editorAPI.setCurrentText failed (ignored):',
        err
      )
    }
  };

  editor.addEventListener('paste', (ev) => { ctx.engine.handleTextTransferInsert(ev, pasteTransferConfig); });
  editor.addEventListener('drop', (ev) => { ctx.engine.handleTextTransferInsert(ev, dropTransferConfig); });
}

// =============================================================================
// Local input (typing)
// =============================================================================
if (!bootstrapSetupError && editor) {
  editor.addEventListener('beforeinput', (ev) => {
    try {
      if (ctx.state.suppressLocalUpdate || editor.readOnly) return;
      const inputType = (typeof ev.inputType === 'string') ? ev.inputType : '';
      if (!inputType || !inputType.startsWith('insert')) return;

      if (inputType === 'insertFromPaste' || inputType === 'insertFromDrop') return;

      const { start } = ctx.engine.getSelectionRange();
      const available = ctx.engine.getInsertionCapacity();
      if (available <= 0) {
        ev.preventDefault();
        window.Notify.notifyEditor('renderer.editor.alerts.type_limit', { type: 'warn', duration: 5000 });
        ctx.ui.restoreFocusToEditor(start);
        return;
      }

      const incomingLength = ctx.engine.getBeforeInputIncomingLength(ev);
      if (incomingLength !== null && incomingLength > available) {
        ev.preventDefault();
        window.Notify.notifyEditor('renderer.editor.alerts.type_limit', { type: 'warn', duration: 5000 });
        ctx.ui.restoreFocusToEditor(start);
      }
    } catch (err) {
      log.error('Text Editor beforeinput guard failed:', err);
    }
  });
}

if (!bootstrapSetupError && editor) {
  editor.addEventListener('input', () => {
    ctx.ui.updateEditorTextDirection();
    ctx.ui.scheduleReadProgressUiUpdate();

    if (ctx.state.suppressLocalUpdate || editor.readOnly) return;

    if (ctx.state.debounceTimer) clearTimeout(ctx.state.debounceTimer);
    if (calcWhileTyping && calcWhileTyping.checked) {
      ctx.state.debounceTimer = setTimeout(() => {
        ctx.engine.sendCurrentTextToMain('typing', {
          onError: (err) => log.warn(
            'setCurrentText typing sync failed (ignored):',
            err
          )
        });
      }, ctx.DEBOUNCE_MS);
    }
  });
}

if (!bootstrapSetupError && editor) {
  editor.addEventListener('scroll', () => {
    ctx.ui.scheduleReadProgressUiUpdate();
  });
}

if (!bootstrapSetupError) {
  window.addEventListener('resize', () => {
    ctx.ui.syncEditorMaximizedLayout();
    ctx.ui.scheduleReadProgressUiUpdate();
  });
}

// =============================================================================
// Buttons and toggles
// =============================================================================
if (!bootstrapSetupError && btnTrash) btnTrash.addEventListener('click', () => {
  editor.value = '';
  ctx.ui.updateEditorTextDirection();
  ctx.ui.scheduleReadProgressUiUpdate();
  if (calcWhileTyping && calcWhileTyping.checked) {
    const didSend = ctx.engine.sendCurrentTextToMain('clear', {
      text: '',
      onError: (err) => log.error('Text Editor clear sync failed:', err),
    });
    if (!didSend) {
      window.Notify.notifyEditor('renderer.editor.alerts.calc_error', { type: 'error', duration: 5000 });
    }
  }
  ctx.ui.restoreFocusToEditor();
});

if (!bootstrapSetupError && btnCalc) btnCalc.addEventListener('click', () => {
  const didSend = ctx.engine.sendCurrentTextToMain('overwrite', {
    text: editor.value || '',
    onError: (err) => log.error('Text Editor apply sync failed:', err),
  });
  if (!didSend) {
    window.Notify.notifyEditor('renderer.editor.alerts.calc_error', { type: 'error', duration: 5000 });
    ctx.ui.restoreFocusToEditor();
  }
});

if (!bootstrapSetupError && calcWhileTyping) calcWhileTyping.addEventListener('change', () => {
  if (calcWhileTyping.checked) {
    btnCalc.disabled = true;
    ctx.engine.sendCurrentTextToMain('typing_toggle_on', {
      text: editor.value || '',
      onError: (err) => log.warn(
        'editorAPI.setCurrentText failed (typing toggle on ignored):',
        err
      )
    });
  } else btnCalc.disabled = false;
});

if (!bootstrapSetupError && spellcheckToggle) {
  spellcheckToggle.addEventListener('change', async () => {
    const previousEnabled = ctx.state.spellcheckEnabled;
    const previousAvailable = ctx.state.spellcheckAvailable;
    const nextEnabled = !!spellcheckToggle.checked;

    if (!previousAvailable) {
      ctx.ui.setLocalSpellcheckState({
        preferenceEnabled: previousEnabled,
        available: previousAvailable,
      });
      return;
    }

    if (!ctx.editorAPI || typeof ctx.editorAPI.setSpellcheckEnabled !== 'function') {
      log.warn(
        'editorAPI.setSpellcheckEnabled missing; spellcheck toggle ignored.'
      );
      ctx.ui.setLocalSpellcheckState({
        preferenceEnabled: previousEnabled,
        available: previousAvailable,
      });
      return;
    }

    ctx.ui.setLocalSpellcheckState({
      preferenceEnabled: nextEnabled,
      available: previousAvailable,
    });

    try {
      const result = await ctx.editorAPI.setSpellcheckEnabled(nextEnabled);
      if (!result || result.ok !== true) {
        throw new Error(result && result.error ? String(result.error) : 'unknown');
      }
    } catch (err) {
      log.error('Text Editor spellcheck update failed:', err);
      ctx.ui.setLocalSpellcheckState({
        preferenceEnabled: previousEnabled,
        available: previousAvailable,
      });
    }
  });
}

if (!bootstrapSetupError && btnTextSizeDecrease) {
  btnTextSizeDecrease.addEventListener('click', () => {
    ctx.ui.decreaseEditorFontSize().catch((err) => {
      log.error('Text Editor font size decrease failed:', err);
    });
  });
}

if (!bootstrapSetupError && btnTextSizeIncrease) {
  btnTextSizeIncrease.addEventListener('click', () => {
    ctx.ui.increaseEditorFontSize().catch((err) => {
      log.error('Text Editor font size increase failed:', err);
    });
  });
}

if (!bootstrapSetupError && btnTextSizeReset) {
  btnTextSizeReset.addEventListener('click', () => {
    ctx.ui.resetEditorFontSize().catch((err) => {
      log.error('Text Editor font size reset failed:', err);
    });
  });
}

if (!bootstrapSetupError) {
  registerEditorMarginGutter(editorLeftGutter, 'left');
  registerEditorMarginGutter(editorRightGutter, 'right');
}

// =============================================================================
// End of public/editor.js
// =============================================================================
