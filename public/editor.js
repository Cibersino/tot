// public/editor.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Validate required renderer surfaces before Text Editor bootstrap continues.
// - Wire Text Editor UI and Text Editor engine modules together through shared context.
// - Bootstrap config, settings, translations, and initial Text Editor text state.
// - Register editorAPI listeners and DOM event handlers for Text Editor interactions.
// - Coordinate local Text Editor actions with main-process text synchronization.
// =============================================================================

// =============================================================================
// Logger
// =============================================================================
if (typeof window.getLogger !== 'function') {
  throw new Error('[editor] window.getLogger unavailable; cannot continue');
}
const log = window.getLogger('editor');

log.debug('Text Editor starting...');

// =============================================================================
// Constants / config
// =============================================================================
const { AppConstants } = window;
if (!AppConstants) {
  throw new Error('[editor] AppConstants unavailable; verify constants.js load order');
}
if (typeof AppConstants.DEFAULT_LANG !== 'string' || AppConstants.DEFAULT_LANG.trim() === '') {
  throw new Error('[editor] AppConstants.DEFAULT_LANG unavailable; cannot continue');
}
const {
  DEFAULT_LANG,
  PASTE_ALLOW_LIMIT,
  SMALL_UPDATE_THRESHOLD,
  EDITOR_FONT_SIZE_MIN_PX,
  EDITOR_FONT_SIZE_MAX_PX,
  EDITOR_FONT_SIZE_DEFAULT_PX,
  EDITOR_FONT_SIZE_STEP_PX,
  EDITOR_MAXIMIZED_TEXT_WIDTH_MIN_PX,
  EDITOR_MAXIMIZED_TEXT_WIDTH_MAX_PX,
  EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX,
  EDITOR_MAXIMIZED_GUTTER_MIN_PX,
} = AppConstants;

const editorMaximizedLayoutCore = window.EditorMaximizedLayoutCore;
if (
  !editorMaximizedLayoutCore
  || typeof editorMaximizedLayoutCore.clampPreferredTextWidthPx !== 'function'
  || typeof editorMaximizedLayoutCore.computeNextPreferredTextWidthPxFromDrag !== 'function'
) {
  throw new Error('[editor] EditorMaximizedLayoutCore unavailable; cannot continue');
}

const editorFindReplaceCore = window.EditorFindReplaceCore;
if (
  !editorFindReplaceCore ||
  typeof editorFindReplaceCore.selectionMatchesLiteralQuery !== 'function' ||
  typeof editorFindReplaceCore.computeLiteralReplaceAll !== 'function'
) {
  throw new Error('[editor] EditorFindReplaceCore unavailable; cannot continue');
}

const editorStartupPresentation = window.EditorStartupPresentation;
if (
  !editorStartupPresentation
  || typeof editorStartupPresentation.parseStartupQuery !== 'function'
  || typeof editorStartupPresentation.createStartupPresentationController !== 'function'
) {
  throw new Error('[editor] EditorStartupPresentation unavailable; cannot continue');
}

if (!window.editorAPI) {
  throw new Error('[editor] editorAPI unavailable; cannot continue');
}
if (typeof window.editorAPI.setCurrentText !== 'function') {
  throw new Error('[editor] editorAPI.setCurrentText unavailable; cannot continue');
}
if (typeof window.editorAPI.getCurrentText !== 'function') {
  throw new Error('[editor] editorAPI.getCurrentText unavailable; cannot continue');
}
if (typeof window.editorAPI.onExternalUpdate !== 'function') {
  throw new Error('[editor] editorAPI.onExternalUpdate unavailable; cannot continue');
}
if (typeof window.editorAPI.onReplaceRequest !== 'function') {
  throw new Error('[editor] editorAPI.onReplaceRequest unavailable; cannot continue');
}
if (typeof window.editorAPI.sendReplaceResponse !== 'function') {
  throw new Error('[editor] editorAPI.sendReplaceResponse unavailable; cannot continue');
}
if (typeof window.editorAPI.getWindowState !== 'function') {
  throw new Error('[editor] editorAPI.getWindowState unavailable; cannot continue');
}
if (typeof window.editorAPI.reportBasePresentationState !== 'function') {
  throw new Error('[editor] editorAPI.reportBasePresentationState unavailable; cannot continue');
}

if (!window.EditorUI || typeof window.EditorUI.createEditorUI !== 'function') {
  throw new Error('[editor] EditorUI unavailable; cannot continue');
}
if (!window.EditorEngine || typeof window.EditorEngine.createEditorEngine !== 'function') {
  throw new Error('[editor] EditorEngine unavailable; cannot continue');
}
if (!window.RendererI18n || typeof window.RendererI18n.applyWindowLanguageAttributes !== 'function') {
  throw new Error('[editor] RendererI18n.applyWindowLanguageAttributes unavailable; cannot continue');
}

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
const startupQuery = editorStartupPresentation.parseStartupQuery(window.location.search || '');
const startupPresentation = editorStartupPresentation.createStartupPresentationController(startupQuery);

// =============================================================================
// Shared context
// =============================================================================
const ctx = {
  log,
  AppConstants,
  DEFAULT_LANG,
  PASTE_ALLOW_LIMIT,
  SMALL_UPDATE_THRESHOLD,
  EDITOR_FONT_SIZE_MIN_PX,
  EDITOR_FONT_SIZE_MAX_PX,
  EDITOR_FONT_SIZE_DEFAULT_PX,
  EDITOR_FONT_SIZE_STEP_PX,
  EDITOR_MAXIMIZED_TEXT_WIDTH_MIN_PX,
  EDITOR_MAXIMIZED_TEXT_WIDTH_MAX_PX,
  EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX,
  EDITOR_MAXIMIZED_GUTTER_MIN_PX,
  DEBOUNCE_MS: 300,
  editorAPI: window.editorAPI,
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
    maxTextChars: AppConstants.MAX_TEXT_CHARS,
    debounceTimer: null,
    suppressLocalUpdate: false,
    spellcheckEnabled: true,
    spellcheckAvailable: true,
    editorFontSizePx: EDITOR_FONT_SIZE_DEFAULT_PX,
    editorWindowMaximized: startupPresentation.isInitiallyMaximized(),
    maximizedTextWidthPx: EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX,
    editorMarginDrag: null,
    readProgressFramePending: false,
    idiomaActual: DEFAULT_LANG,
    translationsLoadedFor: null,
    startupFirstShowGeneration: startupPresentation.firstShowGeneration,
    startupPresentation,
  },
  ui: null,
  engine: null,
};

ctx.ui = window.EditorUI.createEditorUI(ctx);
ctx.engine = window.EditorEngine.createEditorEngine(ctx);

function applyActualWindowState(windowState) {
  ctx.state.editorWindowMaximized = !!(windowState && windowState.maximized === true);
  ctx.state.maximizedTextWidthPx = ctx.ui.clampEditorMaximizedTextWidthPx(
    windowState && windowState.maximizedTextWidthPx
  );
  ctx.ui.setLocalEditorMaximizedTextWidthPx(ctx.state.maximizedTextWidthPx);
  ctx.ui.setLocalEditorWindowMaximized(ctx.state.editorWindowMaximized);
}

function captureActualWindowState(windowState) {
  if (windowState && windowState.ok === false) {
    log.warn(
      'BOOTSTRAP: editorAPI.getWindowState returned a non-ok result; keeping startup presentation until a live window-state update arrives.',
      windowState.error || 'unknown'
    );
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
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function reportBasePresentationState(payload) {
  const generation = ctx.state.startupFirstShowGeneration;
  if (!Number.isInteger(generation) || generation <= 0) {
    log.warn('BOOTSTRAP: startup firstShowGeneration missing; base presentation report skipped.');
    return;
  }
  try {
    ctx.editorAPI.reportBasePresentationState({
      generation,
      status: payload && payload.status === 'failed' ? 'failed' : 'ready',
      ...(payload && typeof payload.reason === 'string' && payload.reason.trim()
        ? { reason: payload.reason.trim() }
        : {}),
    });
  } catch (err) {
    log.error('BOOTSTRAP: reportBasePresentationState failed:', err);
  }
}

async function bootstrapEditorEnvironment() {
  try {
    if (typeof ctx.editorAPI.getAppConfig !== 'function') {
      log.warn('BOOTSTRAP: editorAPI.getAppConfig missing; using defaults.');
    } else {
      const cfg = await ctx.editorAPI.getAppConfig();
      if (AppConstants && typeof AppConstants.applyConfig === 'function') {
        ctx.state.maxTextChars = AppConstants.applyConfig(cfg);
      } else if (cfg && cfg.maxTextChars) {
        ctx.state.maxTextChars = Number(cfg.maxTextChars) || ctx.state.maxTextChars;
      }
    }
  } catch (err) {
    log.warn('BOOTSTRAP: getAppConfig failed; using defaults:', err);
  }
  try {
    if (typeof ctx.editorAPI.getSettings === 'function') {
      const settings = await ctx.editorAPI.getSettings();
      if (settings && settings.language) {
        ctx.state.idiomaActual = settings.language || DEFAULT_LANG;
      }
      ctx.state.spellcheckEnabled = !settings || settings.spellcheckEnabled !== false;
      ctx.state.spellcheckAvailable = !settings || settings.spellcheckAvailable !== false;
      ctx.state.editorFontSizePx = ctx.ui.clampEditorFontSizePx(settings && settings.editorFontSizePx);
    } else {
      log.warn('BOOTSTRAP: editorAPI.getSettings missing; using default language.');
    }
    captureActualWindowState(await ctx.editorAPI.getWindowState());
    ctx.ui.setLocalSpellcheckState({
      preferenceEnabled: ctx.state.spellcheckEnabled,
      available: ctx.state.spellcheckAvailable,
    });
    ctx.ui.setLocalEditorFontSizePx(ctx.state.editorFontSizePx);
    window.RendererI18n.applyWindowLanguageAttributes(ctx.state.idiomaActual);
    await ctx.ui.applyEditorTranslations();
    ctx.ui.updateEditorTextDirection();
  } catch (err) {
    log.warn('BOOTSTRAP: failed to apply initial translations:', err);
  }
}

// warnOnce keys are editor-scoped; use log.warnOnce directly.
ctx.ui.applyTextareaDefaults();
window.RendererI18n.applyWindowLanguageAttributes(ctx.state.idiomaActual);
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

// =============================================================================
// Settings integration
// =============================================================================
if (typeof ctx.editorAPI.onSettingsChanged === 'function') {
  ctx.editorAPI.onSettingsChanged(async (settings) => {
    try {
      const nextLang = settings && settings.language ? settings.language : '';
      const nextSpellcheckEnabled = !settings || settings.spellcheckEnabled !== false;
      const nextSpellcheckAvailable = !settings || settings.spellcheckAvailable !== false;
      const nextEditorFontSizePx = ctx.ui.clampEditorFontSizePx(settings && settings.editorFontSizePx);
      const languageChanged = !!(nextLang && nextLang !== ctx.state.idiomaActual);
      const spellcheckChanged = (
        nextSpellcheckEnabled !== ctx.state.spellcheckEnabled
        || nextSpellcheckAvailable !== ctx.state.spellcheckAvailable
      );
      const fontSizeChanged = nextEditorFontSizePx !== ctx.state.editorFontSizePx;

      if (!languageChanged && !spellcheckChanged && !fontSizeChanged) return;

      if (languageChanged) {
        ctx.state.idiomaActual = nextLang;
        window.RendererI18n.applyWindowLanguageAttributes(ctx.state.idiomaActual);
        await ctx.ui.applyEditorTranslations();
        ctx.ui.updateEditorTextDirection();
      }
      if (spellcheckChanged) {
        ctx.ui.setLocalSpellcheckState({
          preferenceEnabled: nextSpellcheckEnabled,
          available: nextSpellcheckAvailable,
        });
      }
      if (fontSizeChanged) {
        ctx.ui.setLocalEditorFontSizePx(nextEditorFontSizePx);
      } else if (languageChanged) {
        ctx.ui.updateEditorTextSizeUi();
      }
    } catch (err) {
      log.warn('Text Editor: failed to apply settings update:', err);
    }
  });
} else {
  log.warn('BOOTSTRAP: editorAPI.onSettingsChanged missing; live settings updates disabled.');
}

if (typeof ctx.editorAPI.onWindowStateChanged === 'function') {
  ctx.editorAPI.onWindowStateChanged((windowState) => {
    captureActualWindowState(windowState);
  });
} else {
  log.warn('BOOTSTRAP: editorAPI.onWindowStateChanged missing; live maximized layout updates disabled.');
}

if (readingTestPrestartOverlay) {
  readingTestPrestartOverlay.addEventListener('keydown', (event) => {
    if (readingTestPrestartOverlay.getAttribute('aria-hidden') === 'false') {
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

async function bootstrapInitialEditorText() {
  let initialText = '';

  try {
    initialText = String(await ctx.editorAPI.getCurrentText() || '');
  } catch (err) {
    throw new Error(`[editor] editorAPI.getCurrentText failed during bootstrap: ${String(err)}`);
  }

  await ctx.engine.applyExternalUpdate({
    text: initialText,
    meta: { source: 'main', action: 'init' },
  });
  ctx.ui.updateEditorTextDirection();
  btnCalc.disabled = !!(calcWhileTyping && calcWhileTyping.checked);
}

// =============================================================================
// Bootstrap: config, settings, and initial text
// =============================================================================
Promise.resolve()
  .then(async () => {
    await bootstrapEditorEnvironment();
    await bootstrapInitialEditorText();
    releaseStartupPresentationLock();
    await nextAnimationFrame();
    reportBasePresentationState({ status: 'ready' });
  })
  .catch((err) => {
    log.error('BOOTSTRAP: Text Editor startup failed:', err);
    reportBasePresentationState({ status: 'failed', reason: 'bootstrap-failed' });
  });

// =============================================================================
// Bridge listeners
// =============================================================================
ctx.editorAPI.onExternalUpdate(async (p) => {
  await ctx.engine.applyExternalUpdate(p);
  ctx.ui.updateEditorTextDirection();
});

ctx.editorAPI.onReplaceRequest((payload) => {
  const requestId = Number(payload && payload.requestId);

  Promise.resolve()
    .then(() => ctx.engine.handleReplaceRequest(payload || {}))
    .catch((err) => {
      log.error('handleReplaceRequest error:', err);
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
        log.error('sendReplaceResponse error:', err);
      }
    });
});

if (typeof ctx.editorAPI.onReadingTestPrestartStateChanged === 'function') {
  ctx.editorAPI.onReadingTestPrestartStateChanged((payload) => {
    ctx.ui.applyReadingTestPrestartState(payload);
  });
} else {
  log.warn(
    'BOOTSTRAP: editorAPI.onReadingTestPrestartStateChanged missing; reading-test prestart overlay disabled.'
  );
}

// =============================================================================
// Paste / drop handlers
// =============================================================================
if (editor) {
  const pasteTransferConfig = {
    source: 'paste',
    noTextAlertKey: 'renderer.editor_alerts.paste_no_text',
    tooBigAlertKey: 'renderer.editor_alerts.paste_too_big',
    getText: (event) => (event.clipboardData && event.clipboardData.getData('text/plain')) || '',
    insertOptions: {
      action: 'paste',
      limitAlertKey: 'renderer.editor_alerts.paste_limit',
      truncatedAlertKey: 'renderer.editor_alerts.paste_truncated'
    }
  };

  const dropTransferConfig = {
    source: 'drop',
    noTextAlertKey: 'renderer.editor_alerts.drop_no_text',
    tooBigAlertKey: 'renderer.editor_alerts.drop_too_big',
    getText: (event) => {
      const dt = event.dataTransfer;
      return (dt && dt.getData && dt.getData('text/plain')) || '';
    },
    insertOptions: {
      action: 'drop',
      limitAlertKey: 'renderer.editor_alerts.drop_limit',
      truncatedAlertKey: 'renderer.editor_alerts.drop_truncated',
      onFallbackError: (err) => log.warnOnce(
        'setCurrentText.drop.fallback',
        'editorAPI.setCurrentText fallback failed (ignored):',
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
if (editor) {
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
        window.Notify.notifyEditor('renderer.editor_alerts.type_limit', { type: 'warn', duration: 5000 });
        ctx.ui.restoreFocusToEditor(start);
        return;
      }

      const incomingLength = ctx.engine.getBeforeInputIncomingLength(ev);
      if (incomingLength !== null && incomingLength > available) {
        ev.preventDefault();
        window.Notify.notifyEditor('renderer.editor_alerts.type_limit', { type: 'warn', duration: 5000 });
        ctx.ui.restoreFocusToEditor(start);
      }
    } catch (err) {
      log.error('beforeinput guard error:', err);
    }
  });
}

editor.addEventListener('input', () => {
  ctx.ui.updateEditorTextDirection();
  ctx.ui.scheduleReadProgressUiUpdate();

  if (ctx.state.suppressLocalUpdate || editor.readOnly) return;

  if (!ctx.state.suppressLocalUpdate) {
    if (ctx.state.debounceTimer) clearTimeout(ctx.state.debounceTimer);
    if (calcWhileTyping && calcWhileTyping.checked) {
      ctx.state.debounceTimer = setTimeout(() => {
        ctx.engine.sendCurrentTextToMain('typing', {
          onFallbackError: (err) => log.warnOnce(
            'editor.setCurrentText.typing.fallback',
            'setCurrentText typing sync failed (ignored):',
            err
          )
        });
      }, ctx.DEBOUNCE_MS);
    }
  }
});

editor.addEventListener('scroll', () => {
  ctx.ui.scheduleReadProgressUiUpdate();
});

window.addEventListener('resize', () => {
  ctx.ui.syncEditorMaximizedLayout();
  ctx.ui.scheduleReadProgressUiUpdate();
});

// =============================================================================
// Buttons and toggles
// =============================================================================
btnTrash.addEventListener('click', () => {
  editor.value = '';
  ctx.ui.updateEditorTextDirection();
  ctx.ui.scheduleReadProgressUiUpdate();
  ctx.ui.restoreFocusToEditor();
});

if (btnCalc) btnCalc.addEventListener('click', () => {
  try {
    const res = ctx.editorAPI.setCurrentText({ text: editor.value || '', meta: { source: 'editor', action: 'overwrite' } });
    ctx.engine.handleTruncationResponse(res);
  } catch (err) {
    log.error('Error executing Apply:', err);
    window.Notify.notifyEditor('renderer.editor_alerts.calc_error', { type: 'error', duration: 5000 });
    ctx.ui.restoreFocusToEditor();
  }
});

if (calcWhileTyping) calcWhileTyping.addEventListener('change', () => {
  if (calcWhileTyping.checked) {
    btnCalc.disabled = true;
    ctx.engine.sendCurrentTextToMain('typing_toggle_on', {
      text: editor.value || '',
      onFallbackError: (err) => log.warnOnce(
        'setCurrentText.typing_toggle_on.fallback',
        'editorAPI.setCurrentText fallback failed (typing toggle on ignored):',
        err
      )
    });
  } else btnCalc.disabled = false;
});

if (spellcheckToggle) {
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
      log.warnOnce(
        'editor.spellcheck.apiMissing',
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
      log.error('Error updating spellcheck setting:', err);
      ctx.ui.setLocalSpellcheckState({
        preferenceEnabled: previousEnabled,
        available: previousAvailable,
      });
    }
  });
}

if (btnTextSizeDecrease) {
  btnTextSizeDecrease.addEventListener('click', () => {
    ctx.ui.decreaseEditorFontSize().catch((err) => {
      log.error('Error decreasing Text Editor font size:', err);
    });
  });
}

if (btnTextSizeIncrease) {
  btnTextSizeIncrease.addEventListener('click', () => {
    ctx.ui.increaseEditorFontSize().catch((err) => {
      log.error('Error increasing Text Editor font size:', err);
    });
  });
}

if (btnTextSizeReset) {
  btnTextSizeReset.addEventListener('click', () => {
    ctx.ui.resetEditorFontSize().catch((err) => {
      log.error('Error resetting Text Editor font size:', err);
    });
  });
}

if (editorLeftGutter) {
  editorLeftGutter.addEventListener('pointerdown', (event) => {
    ctx.ui.handleEditorMarginPointerDown(event, 'left');
  });
  editorLeftGutter.addEventListener('dblclick', () => {
    ctx.ui.resetEditorMaximizedTextWidth().catch((err) => {
      log.error('Error resetting Text Editor maximized text width:', err);
    });
  });
}

if (editorRightGutter) {
  editorRightGutter.addEventListener('pointerdown', (event) => {
    ctx.ui.handleEditorMarginPointerDown(event, 'right');
  });
  editorRightGutter.addEventListener('dblclick', () => {
    ctx.ui.resetEditorMaximizedTextWidth().catch((err) => {
      log.error('Error resetting Text Editor maximized text width:', err);
    });
  });
}

// =============================================================================
// End of public/editor.js
// =============================================================================
