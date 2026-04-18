// public/editor.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Kick off config and i18n bootstrap (async, best-effort).
// - Wire editor UI and editor engine modules together.
// - Register DOM and IPC event listeners for the editor renderer.
// =============================================================================

// =============================================================================
// Logger
// =============================================================================
if (typeof window.getLogger !== 'function') {
  throw new Error('[editor] window.getLogger unavailable; cannot continue');
}
const log = window.getLogger('editor');

log.debug('Manual editor starting...');

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
} = AppConstants;

const editorFindReplaceCore = window.EditorFindReplaceCore;
if (
  !editorFindReplaceCore ||
  typeof editorFindReplaceCore.selectionMatchesLiteralQuery !== 'function' ||
  typeof editorFindReplaceCore.computeLiteralReplaceAll !== 'function' ||
  typeof editorFindReplaceCore.isReplaceAllAllowedByLength !== 'function'
) {
  throw new Error('[editor] EditorFindReplaceCore unavailable; cannot continue');
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
if (typeof window.editorAPI.onInitText !== 'function') {
  throw new Error('[editor] editorAPI.onInitText unavailable; cannot continue');
}
if (typeof window.editorAPI.onExternalUpdate !== 'function') {
  throw new Error('[editor] editorAPI.onExternalUpdate unavailable; cannot continue');
}
if (typeof window.editorAPI.onForceClear !== 'function') {
  throw new Error('[editor] editorAPI.onForceClear unavailable; cannot continue');
}
if (typeof window.editorAPI.onReplaceRequest !== 'function') {
  throw new Error('[editor] editorAPI.onReplaceRequest unavailable; cannot continue');
}
if (typeof window.editorAPI.sendReplaceResponse !== 'function') {
  throw new Error('[editor] editorAPI.sendReplaceResponse unavailable; cannot continue');
}
if (typeof window.editorAPI.sendReplaceStatus !== 'function') {
  throw new Error('[editor] editorAPI.sendReplaceStatus unavailable; cannot continue');
}

if (!window.EditorUI || typeof window.EditorUI.createEditorUI !== 'function') {
  throw new Error('[editor] EditorUI unavailable; cannot continue');
}
if (!window.EditorEngine || typeof window.EditorEngine.createEditorEngine !== 'function') {
  throw new Error('[editor] EditorEngine unavailable; cannot continue');
}

// =============================================================================
// DOM references
// =============================================================================
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
const readingTestCountdownOverlay = document.getElementById('readingTestCountdownOverlay');
const readingTestCountdownValue = document.getElementById('readingTestCountdownValue');

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
  DEBOUNCE_MS: 300,
  editorAPI: window.editorAPI,
  editorFindReplaceCore,
  rendererI18n: window.RendererI18n || {},
  dom: {
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
    readingTestCountdownOverlay,
    readingTestCountdownValue,
  },
  state: {
    maxTextChars: AppConstants.MAX_TEXT_CHARS,
    debounceTimer: null,
    suppressLocalUpdate: false,
    readingTestCountdownRunId: 0,
    readingTestCountdownTimeouts: [],
    spellcheckEnabled: true,
    editorFontSizePx: EDITOR_FONT_SIZE_DEFAULT_PX,
    readProgressFramePending: false,
    idiomaActual: DEFAULT_LANG,
    translationsLoadedFor: null,
  },
  ui: null,
  engine: null,
};

ctx.ui = window.EditorUI.createEditorUI(ctx);
ctx.engine = window.EditorEngine.createEditorEngine(ctx);

// =============================================================================
// Bootstrap: config and translations (async, best-effort)
// =============================================================================
(async () => {
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
      ctx.state.editorFontSizePx = ctx.ui.clampEditorFontSizePx(settings && settings.editorFontSizePx);
    } else {
      log.warn('BOOTSTRAP: editorAPI.getSettings missing; using default language.');
    }
    ctx.ui.setLocalSpellcheckEnabled(ctx.state.spellcheckEnabled);
    ctx.ui.setLocalEditorFontSizePx(ctx.state.editorFontSizePx);
    await ctx.ui.applyEditorTranslations();
  } catch (err) {
    log.warn('BOOTSTRAP: failed to apply initial translations:', err);
  }
})();

// warnOnce keys are editor-scoped; use log.warnOnce directly.
ctx.ui.applyTextareaDefaults();
ctx.ui.applyDocumentLanguage();
ctx.ui.setLocalSpellcheckEnabled(ctx.state.spellcheckEnabled);
ctx.ui.setLocalEditorFontSizePx(ctx.state.editorFontSizePx);
ctx.ui.updateReadProgressUi();

// =============================================================================
// Settings integration
// =============================================================================
if (typeof ctx.editorAPI.onSettingsChanged === 'function') {
  ctx.editorAPI.onSettingsChanged(async (settings) => {
    try {
      const nextLang = settings && settings.language ? settings.language : '';
      const nextSpellcheckEnabled = !settings || settings.spellcheckEnabled !== false;
      const nextEditorFontSizePx = ctx.ui.clampEditorFontSizePx(settings && settings.editorFontSizePx);
      const languageChanged = !!(nextLang && nextLang !== ctx.state.idiomaActual);
      const spellcheckChanged = nextSpellcheckEnabled !== ctx.state.spellcheckEnabled;
      const fontSizeChanged = nextEditorFontSizePx !== ctx.state.editorFontSizePx;

      if (!languageChanged && !spellcheckChanged && !fontSizeChanged) return;

      if (languageChanged) {
        ctx.state.idiomaActual = nextLang;
        await ctx.ui.applyEditorTranslations();
      }
      if (spellcheckChanged) {
        ctx.ui.setLocalSpellcheckEnabled(nextSpellcheckEnabled);
      }
      if (fontSizeChanged) {
        ctx.ui.setLocalEditorFontSizePx(nextEditorFontSizePx);
      } else if (languageChanged) {
        ctx.ui.updateEditorTextSizeUi();
      }
    } catch (err) {
      log.warn('editor: failed to apply settings update:', err);
    }
  });
} else {
  log.warn('editorAPI.onSettingsChanged missing; live language updates disabled.');
}

if (readingTestCountdownOverlay) {
  readingTestCountdownOverlay.addEventListener('keydown', (event) => {
    if (readingTestCountdownOverlay.getAttribute('aria-hidden') === 'false') {
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

// =============================================================================
// Initialization
// =============================================================================
(async () => {
  try {
    const t = await ctx.editorAPI.getCurrentText();
    await ctx.engine.applyExternalUpdate({ text: t || '', meta: { source: 'main', action: 'init' } });
    btnCalc.disabled = !!(calcWhileTyping && calcWhileTyping.checked);
    ctx.engine.publishReplaceStatus();
  } catch (err) {
    log.error('Error initializing editor:', err);
  }
})();

// =============================================================================
// IPC bridge listeners
// =============================================================================
ctx.editorAPI.onInitText((p) => { ctx.engine.applyExternalUpdate(p); });
ctx.editorAPI.onExternalUpdate((p) => { ctx.engine.applyExternalUpdate(p); });
ctx.editorAPI.onForceClear(() => {
  try {
    ctx.state.suppressLocalUpdate = true;
    editor.value = '';
    ctx.ui.scheduleReadProgressUiUpdate();
    ctx.engine.sendCurrentTextToMain('clear', { text: '' });
  } catch (err) {
    log.error('Error in onForceClear:', err);
  } finally {
    ctx.engine.publishReplaceStatus();
    ctx.state.suppressLocalUpdate = false;
    ctx.ui.restoreFocusToEditor();
  }
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

if (typeof ctx.editorAPI.onReadingTestCountdown === 'function') {
  ctx.editorAPI.onReadingTestCountdown((payload) => {
    ctx.ui.startReadingTestCountdown(payload);
  });
} else {
  log.warn('editorAPI.onReadingTestCountdown missing; reading-test countdown overlay disabled.');
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
  ctx.engine.publishReplaceStatus();
  ctx.ui.scheduleReadProgressUiUpdate();

  if (ctx.state.suppressLocalUpdate || editor.readOnly) return;

  if (!ctx.state.suppressLocalUpdate) {
    if (ctx.state.debounceTimer) clearTimeout(ctx.state.debounceTimer);
    if (calcWhileTyping && calcWhileTyping.checked) {
      ctx.state.debounceTimer = setTimeout(() => {
        ctx.engine.sendCurrentTextToMain('typing', {
          onFallbackError: (err) => log.errorOnce(
            'editor.setCurrentText.typing.fallback',
            'Error sending set-current-text typing:',
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
  ctx.ui.scheduleReadProgressUiUpdate();
});

// =============================================================================
// Buttons and toggles
// =============================================================================
btnTrash.addEventListener('click', () => {
  editor.value = '';
  ctx.engine.publishReplaceStatus();
  ctx.ui.scheduleReadProgressUiUpdate();
  ctx.engine.sendCurrentTextToMain('clear', {
    text: '',
    onFallbackError: (err) => log.warnOnce(
      'setCurrentText.trash.clear.fallback',
      'editorAPI.setCurrentText fallback failed (ignored):',
      err
    )
  });
  ctx.ui.restoreFocusToEditor();
});

if (btnCalc) btnCalc.addEventListener('click', () => {
  try {
    const res = ctx.editorAPI.setCurrentText({ text: editor.value || '', meta: { source: 'editor', action: 'overwrite' } });
    ctx.engine.handleTruncationResponse(res);
  } catch (err) {
    log.error('Error executing CALC/SAVE:', err);
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
    const nextEnabled = !!spellcheckToggle.checked;

    if (!ctx.editorAPI || typeof ctx.editorAPI.setSpellcheckEnabled !== 'function') {
      log.warnOnce(
        'editor.spellcheck.apiMissing',
        'editorAPI.setSpellcheckEnabled missing; spellcheck toggle ignored.'
      );
      ctx.ui.setLocalSpellcheckEnabled(previousEnabled);
      return;
    }

    ctx.ui.setLocalSpellcheckEnabled(nextEnabled);

    try {
      const result = await ctx.editorAPI.setSpellcheckEnabled(nextEnabled);
      if (!result || result.ok !== true) {
        throw new Error(result && result.error ? String(result.error) : 'unknown');
      }
    } catch (err) {
      log.error('Error updating spellcheck setting:', err);
      ctx.ui.setLocalSpellcheckEnabled(previousEnabled);
    }
  });
}

if (btnTextSizeDecrease) {
  btnTextSizeDecrease.addEventListener('click', () => {
    ctx.ui.decreaseEditorFontSize().catch((err) => {
      log.error('Error decreasing editor font size:', err);
    });
  });
}

if (btnTextSizeIncrease) {
  btnTextSizeIncrease.addEventListener('click', () => {
    ctx.ui.increaseEditorFontSize().catch((err) => {
      log.error('Error increasing editor font size:', err);
    });
  });
}

if (btnTextSizeReset) {
  btnTextSizeReset.addEventListener('click', () => {
    ctx.ui.resetEditorFontSize().catch((err) => {
      log.error('Error resetting editor font size:', err);
    });
  });
}
