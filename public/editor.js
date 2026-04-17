// public/editor.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Kick off config and i18n bootstrap (async, best-effort).
// - Manage textarea editing and focus behavior.
// - Bridge editor text updates via window.editorAPI.
// - Apply external updates and enforce size limits.
// - Surface recoverable issues to the user.

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
let maxTextChars = AppConstants.MAX_TEXT_CHARS; // Absolute editor limit. Local writes must stay within this bound to prevent lags and OOM.

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

// =============================================================================
// Bootstrap: config and translations (async, best-effort)
// =============================================================================
(async () => {
  try {
    if (typeof window.editorAPI.getAppConfig !== 'function') {
      log.warn('BOOTSTRAP: editorAPI.getAppConfig missing; using defaults.');
    } else {
      const cfg = await window.editorAPI.getAppConfig();
      if (AppConstants && typeof AppConstants.applyConfig === 'function') {
        maxTextChars = AppConstants.applyConfig(cfg);
      } else if (cfg && cfg.maxTextChars) {
        maxTextChars = Number(cfg.maxTextChars) || maxTextChars;
      }
    }
  } catch (err) {
    log.warn('BOOTSTRAP: getAppConfig failed; using defaults:', err);
  }
  try {
    if (typeof window.editorAPI.getSettings === 'function') {
      const settings = await window.editorAPI.getSettings();
      if (settings && settings.language) {
        idiomaActual = settings.language || DEFAULT_LANG;
      }
      spellcheckEnabled = !settings || settings.spellcheckEnabled !== false;
      editorFontSizePx = clampEditorFontSizePx(settings && settings.editorFontSizePx);
    } else {
      log.warn('BOOTSTRAP: editorAPI.getSettings missing; using default language.');
    }
    setLocalSpellcheckEnabled(spellcheckEnabled);
    setLocalEditorFontSizePx(editorFontSizePx);
    await applyEditorTranslations();
  } catch (err) {
    log.warn('BOOTSTRAP: failed to apply initial translations:', err);
  }
})();

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
const bottomBar = document.getElementById('bottomBar');
const readingTestCountdownOverlay = document.getElementById('readingTestCountdownOverlay');
const readingTestCountdownValue = document.getElementById('readingTestCountdownValue');

// =============================================================================
// Module state and limits
// =============================================================================
let debounceTimer = null;
const DEBOUNCE_MS = 300;
let suppressLocalUpdate = false;
let readingTestCountdownRunId = 0;
let readingTestCountdownTimeouts = [];
let spellcheckEnabled = true;
let editorFontSizePx = EDITOR_FONT_SIZE_DEFAULT_PX;

// warnOnce keys are editor-scoped; use log.warnOnce directly.

// =============================================================================
// i18n (RendererI18n)
// =============================================================================
let idiomaActual = DEFAULT_LANG;
let translationsLoadedFor = null;

const { loadRendererTranslations, tRenderer, msgRenderer } = window.RendererI18n || {};
if (!loadRendererTranslations || !tRenderer || !msgRenderer) {
  throw new Error('[editor] RendererI18n unavailable; cannot continue');
}

const tr = (path) => tRenderer(path);
const trMsg = (path, params) => msgRenderer(path, params);

function applyDocumentLanguage() {
  const langTag = (idiomaActual || DEFAULT_LANG).toLowerCase();
  if (document && document.documentElement) {
    document.documentElement.lang = langTag;
  }
  if (editor) {
    editor.setAttribute('lang', langTag);
  }
}

function setLocalSpellcheckEnabled(enabled) {
  spellcheckEnabled = enabled !== false;
  if (spellcheckToggle) spellcheckToggle.checked = spellcheckEnabled;
  if (editor) {
    editor.spellcheck = spellcheckEnabled;
    editor.setAttribute('spellcheck', spellcheckEnabled ? 'true' : 'false');
  }
}

function clampEditorFontSizePx(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return EDITOR_FONT_SIZE_DEFAULT_PX;
  const rounded = Math.round(parsed);
  return Math.min(
    EDITOR_FONT_SIZE_MAX_PX,
    Math.max(EDITOR_FONT_SIZE_MIN_PX, rounded)
  );
}

function updateEditorTextSizeUi() {
  if (textSizeValue) {
    const valueText = trMsg(
      'renderer.editor.text_size_value',
      { value: editorFontSizePx }
    );
    textSizeValue.setAttribute('data-label', valueText);
    textSizeValue.setAttribute('aria-label', valueText);
  }
  if (btnTextSizeDecrease) btnTextSizeDecrease.disabled = editorFontSizePx <= EDITOR_FONT_SIZE_MIN_PX;
  if (btnTextSizeIncrease) btnTextSizeIncrease.disabled = editorFontSizePx >= EDITOR_FONT_SIZE_MAX_PX;
  if (btnTextSizeReset) btnTextSizeReset.disabled = editorFontSizePx === EDITOR_FONT_SIZE_DEFAULT_PX;
}

function setLocalEditorFontSizePx(value) {
  editorFontSizePx = clampEditorFontSizePx(value);
  if (document && document.documentElement) {
    document.documentElement.style.setProperty('--editor-font-size', `${editorFontSizePx}px`);
  }
  updateEditorTextSizeUi();
}

async function ensureEditorTranslations(lang) {
  const target = (lang || '').toLowerCase() || DEFAULT_LANG;
  if (translationsLoadedFor === target) return;
  await loadRendererTranslations(target);
  translationsLoadedFor = target;
}

async function applyEditorTranslations() {
  await ensureEditorTranslations(idiomaActual);
  applyDocumentLanguage();
  document.title = tr('renderer.editor.title');
  if (editor) editor.setAttribute('placeholder', tr('renderer.editor.placeholder'));
  if (btnCalc) {
    const calcText = tr('renderer.editor.calc_button');
    btnCalc.setAttribute('data-label', calcText);
    btnCalc.setAttribute('aria-label', calcText);
  }
  if (calcLabel) {
    const calcWhileTypingText = tr('renderer.editor.calc_while_typing');
    calcLabel.setAttribute('data-label', calcWhileTypingText);
    if (calcWhileTyping) calcWhileTyping.setAttribute('aria-label', calcWhileTypingText);
  }
  if (spellcheckLabel) {
    const spellcheckText = tr('renderer.editor.spellcheck');
    spellcheckLabel.setAttribute('data-label', spellcheckText);
    if (spellcheckToggle) spellcheckToggle.setAttribute('aria-label', spellcheckText);
  }
  if (textSizeControls) {
    const textSizeGroupText = tr('renderer.editor.text_size_label');
    textSizeControls.setAttribute('aria-label', textSizeGroupText);
    if (textSizeLabel) textSizeLabel.setAttribute('data-label', textSizeGroupText);
  }
  if (btnTextSizeDecrease) {
    const decreaseText = tr('renderer.editor.decrease_text_size');
    btnTextSizeDecrease.setAttribute('aria-label', decreaseText);
    btnTextSizeDecrease.title = decreaseText;
  }
  if (btnTextSizeIncrease) {
    const increaseText = tr('renderer.editor.increase_text_size');
    btnTextSizeIncrease.setAttribute('aria-label', increaseText);
    btnTextSizeIncrease.title = increaseText;
  }
  if (btnTextSizeReset) {
    const resetText = tr('renderer.editor.reset_text_size');
    btnTextSizeReset.setAttribute('aria-label', resetText);
    btnTextSizeReset.title = resetText;
  }
  if (btnTrash) {
    const clearText = tr('renderer.editor.clear');
    btnTrash.setAttribute('data-label', clearText);
    btnTrash.setAttribute('aria-label', clearText);
    btnTrash.title = tr('renderer.editor.clear_title');
  }
  if (bottomBar) {
    bottomBar.setAttribute('aria-label', tr('renderer.editor.title'));
  }
  updateEditorTextSizeUi();
}

// =============================================================================
// Settings integration
// =============================================================================
if (typeof window.editorAPI.onSettingsChanged === 'function') {
  window.editorAPI.onSettingsChanged(async (settings) => {
    try {
      const nextLang = settings && settings.language ? settings.language : '';
      const nextSpellcheckEnabled = !settings || settings.spellcheckEnabled !== false;
      const nextEditorFontSizePx = clampEditorFontSizePx(settings && settings.editorFontSizePx);
      const languageChanged = !!(nextLang && nextLang !== idiomaActual);
      const spellcheckChanged = nextSpellcheckEnabled !== spellcheckEnabled;
      const fontSizeChanged = nextEditorFontSizePx !== editorFontSizePx;

      if (!languageChanged && !spellcheckChanged && !fontSizeChanged) return;

      if (languageChanged) {
        idiomaActual = nextLang;
        await applyEditorTranslations();
      }
      if (spellcheckChanged) {
        setLocalSpellcheckEnabled(nextSpellcheckEnabled);
      }
      if (fontSizeChanged) {
        setLocalEditorFontSizePx(nextEditorFontSizePx);
      } else if (languageChanged) {
        updateEditorTextSizeUi();
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
// Focus and selection helpers
// =============================================================================
function restoreFocusToEditor(pos = null) {
  try {
    setTimeout(() => {
      try {
        if (!editor) return;
        editor.focus();
        setCaretSafe(pos);
      } catch (err) {
        log.warnOnce('editor:restoreFocus:inner_catch', 'restoreFocusToEditor failed (ignored):', err);
      }
    }, 0);
  } catch (err) {
    log.warnOnce('editor:restoreFocus:outer_catch', 'restoreFocusToEditor wrapper failed (ignored):', err);
  }
}

function clearReadingTestCountdownTimeouts() {
  for (const timeoutId of readingTestCountdownTimeouts) {
    clearTimeout(timeoutId);
  }
  readingTestCountdownTimeouts = [];
}

function notifyReadingTestCountdownReady(token) {
  if (!token) return;
  if (!window.editorAPI || typeof window.editorAPI.notifyReadingTestCountdownReady !== 'function') {
    log.warnOnce(
      'editor.readingTestCountdown.readyAckMissing',
      'editorAPI.notifyReadingTestCountdownReady missing; reading-test countdown ready ack skipped.'
    );
    return;
  }

  try {
    window.editorAPI.notifyReadingTestCountdownReady({ token });
  } catch (err) {
    log.warnOnce(
      'editor.readingTestCountdown.readyAckFailed',
      'Reading-test countdown ready ack failed (ignored):',
      err
    );
  }
}

function positionEditorAtTop() {
  if (!editor) return;

  try {
    setSelectionSafe(0, 0);
  } catch (err) {
    log.warnOnce('editor.readingTestCountdown.selectionTop', 'Failed to set editor selection to top (ignored):', err);
  }

  try {
    editor.scrollTop = 0;
    editor.scrollLeft = 0;
  } catch (err) {
    log.warnOnce('editor.readingTestCountdown.scrollTop', 'Failed to scroll editor to top (ignored):', err);
  }
}

function setReadingTestCountdownVisible(visible) {
  if (!readingTestCountdownOverlay) return;
  document.body.classList.toggle('reading-test-countdown-active', !!visible);
  readingTestCountdownOverlay.setAttribute('aria-hidden', visible ? 'false' : 'true');

  if (visible) {
    positionEditorAtTop();
    try {
      readingTestCountdownOverlay.focus();
    } catch (err) {
      log.warnOnce(
        'editor.readingTestCountdown.focus',
        'reading-test countdown focus failed (ignored):',
        err
      );
    }
    return;
  }
  setTimeout(() => {
    positionEditorAtTop();
  }, 0);
}

function startReadingTestCountdown(payload = {}) {
  if (!readingTestCountdownOverlay || !readingTestCountdownValue) {
    log.warnOnce(
      'editor.readingTestCountdown.missingDom',
      'Reading-test countdown DOM missing; overlay countdown skipped.'
    );
    return;
  }

  const secondsRaw = Number(payload.seconds);
  const stepMsRaw = Number(payload.stepMs);
  const seconds = Number.isFinite(secondsRaw) && secondsRaw >= 1
    ? Math.floor(secondsRaw)
    : 5;
  const stepMs = Number.isFinite(stepMsRaw) && stepMsRaw >= 250
    ? Math.floor(stepMsRaw)
    : 1000;
  const token = payload && typeof payload.token === 'string'
    ? payload.token
    : '';

  const runId = ++readingTestCountdownRunId;
  clearReadingTestCountdownTimeouts();

  readingTestCountdownValue.textContent = String(seconds);
  setReadingTestCountdownVisible(true);
  notifyReadingTestCountdownReady(token);

  for (let index = 1; index < seconds; index += 1) {
    const nextValue = seconds - index;
    readingTestCountdownTimeouts.push(setTimeout(() => {
      if (runId !== readingTestCountdownRunId) return;
      readingTestCountdownValue.textContent = String(nextValue);
    }, index * stepMs));
  }

  readingTestCountdownTimeouts.push(setTimeout(() => {
    if (runId !== readingTestCountdownRunId) return;
    clearReadingTestCountdownTimeouts();
    setReadingTestCountdownVisible(false);
  }, seconds * stepMs));
}

function getSelectionRange() {
  const start = typeof editor.selectionStart === 'number' ? editor.selectionStart : editor.value.length;
  const end = typeof editor.selectionEnd === 'number' ? editor.selectionEnd : start;
  return { start, end };
}

function getInsertionCapacity() {
  const { start, end } = getSelectionRange();
  const selectedLength = Math.max(0, end - start);
  return maxTextChars - (editor.value.length - selectedLength);
}

function getBeforeInputIncomingLength(ev) {
  const inputType = (ev && typeof ev.inputType === 'string') ? ev.inputType : '';
  if (ev && typeof ev.data === 'string') {
    return ev.data.length;
  }
  if (inputType === 'insertLineBreak' || inputType === 'insertParagraph') {
    return 1;
  }
  return null;
}

function setSelectionSafe(start, end) {
  if (typeof editor.setSelectionRange === 'function') editor.setSelectionRange(start, end);
}

function setCaretSafe(pos) {
  if (typeof pos === 'number' && !Number.isNaN(pos)) {
    setSelectionSafe(pos, pos);
  }
}

function selectAllEditor() {
  if (typeof editor.select === 'function') {
    try { editor.select(); }
    catch (err) { log.warnOnce('editor.select', 'editor.select() failed (ignored):', err); }
    return;
  }
  setSelectionSafe(0, editor.value.length);
}

// =============================================================================
// Editor textarea defaults
// =============================================================================
try {
  if (editor) {
    editor.wrap = 'soft';
    editor.style.whiteSpace = 'pre-wrap';
    editor.style.wordBreak = 'break-word';
  }
} catch (err) { log.warnOnce('editor:wrapStyles:apply_failed', 'editor wrap styles failed (ignored):', err); }
applyDocumentLanguage();
setLocalSpellcheckEnabled(spellcheckEnabled);
setLocalEditorFontSizePx(editorFontSizePx);

// =============================================================================
// Local insertion (best preserving undo)
// =============================================================================
function tryNativeInsertAtSelection(text) {
  try {
    const { start, end } = getSelectionRange();

    try {
      const ok = document.execCommand && document.execCommand('insertText', false, text);
      if (ok) return true;
    } catch {
      // follow fallback
    }

    if (typeof editor.setRangeText === 'function') {
      editor.setRangeText(text, start, end, 'end');
      const newCaret = start + text.length;
      setCaretSafe(newCaret);
      return true;
    }

    const before = editor.value.slice(0, start);
    const after = editor.value.slice(end);
    editor.value = before + text + after;
    const newCaret = before.length + text.length;
    setCaretSafe(newCaret);
    return true;
  } catch (err) {
    log.error('tryNativeInsertAtSelection error:', err);
    return false;
  }
}

function selectionMatchesCurrentEditorSelection(query, matchCase = false) {
  const { start, end } = getSelectionRange();
  return editorFindReplaceCore.selectionMatchesLiteralQuery({
    value: editor.value,
    selectionStart: start,
    selectionEnd: end,
    query,
    matchCase,
  });
}

function tryNativeReplaceCurrentSelectionWithoutSync(replacementText) {
  try {
    const { start, end } = getSelectionRange();

    try {
      const ok = document.execCommand && document.execCommand('insertText', false, replacementText);
      if (ok) return true;
    } catch {
      // follow fallback
    }

    if (typeof editor.setRangeText === 'function') {
      editor.setRangeText(replacementText, start, end, 'end');
      dispatchNativeInputEvent();
      return true;
    }

    const before = editor.value.slice(0, start);
    const after = editor.value.slice(end);
    editor.value = before + replacementText + after;
    const newCaret = before.length + replacementText.length;
    setCaretSafe(newCaret);
    dispatchNativeInputEvent();
    return true;
  } catch (err) {
    log.error('tryNativeReplaceCurrentSelectionWithoutSync error:', err);
    return false;
  }
}

function tryNativeReplaceWholeValueWithoutSync(nextValue) {
  const previousActiveElement = document.activeElement;

  try {
    editor.focus();
    selectAllEditor();
    let execOk = false;

    try {
      execOk = !!(document.execCommand && document.execCommand('insertText', false, nextValue));
    } catch {
      execOk = false;
    }

    if (execOk) {
      return true;
    }

    if (typeof editor.setRangeText === 'function') {
      editor.setRangeText(nextValue, 0, editor.value.length, 'end');
      dispatchNativeInputEvent();
      return true;
    }

    editor.value = nextValue;
    dispatchNativeInputEvent();
    return true;
  } catch (err) {
    log.error('tryNativeReplaceWholeValueWithoutSync error:', err);
    return false;
  } finally {
    restorePreviousActiveElement(previousActiveElement, 'focus.prevActive.replaceAll.native');
  }
}

function publishReplaceStatus() {
  try {
    window.editorAPI.sendReplaceStatus({
      replaceAllAllowedByLength: editorFindReplaceCore.isReplaceAllAllowedByLength({
        value: editor.value,
        smallUpdateThreshold: SMALL_UPDATE_THRESHOLD,
      }),
    });
  } catch (err) {
    log.errorOnce(
      'editor.replaceStatus.send',
      'Error sending editor replace status:',
      err
    );
  }
}

function buildReplaceResponse(operation, requestId, fields = {}) {
  return {
    requestId,
    operation: operation === 'replace-all' ? 'replace-all' : 'replace-current',
    ok: fields.ok !== false,
    status: fields.status || 'noop',
    replacements: Number.isFinite(fields.replacements) ? fields.replacements : 0,
    finalTextLength: Number.isFinite(fields.finalTextLength) ? fields.finalTextLength : editor.value.length,
    error: fields.error || '',
  };
}

function handleReplaceCurrentRequest(payload) {
  const requestId = Number(payload && payload.requestId);
  const query = typeof payload?.query === 'string' ? payload.query : '';
  const replacement = typeof payload?.replacement === 'string' ? payload.replacement : '';
  const matchCase = !!(payload && payload.matchCase);

  if (!query) {
    return buildReplaceResponse('replace-current', requestId, {
      status: 'noop-empty-query',
      replacements: 0,
    });
  }

  if (!selectionMatchesCurrentEditorSelection(query, matchCase)) {
    return buildReplaceResponse('replace-current', requestId, {
      status: 'selection-mismatch',
      replacements: 0,
    });
  }

  const replaced = tryNativeReplaceCurrentSelectionWithoutSync(replacement);
  if (!replaced) {
    return buildReplaceResponse('replace-current', requestId, {
      ok: false,
      status: 'internal-error',
      error: 'replace-current failed',
      replacements: 0,
    });
  }

  return buildReplaceResponse('replace-current', requestId, {
    status: 'replaced',
    replacements: 1,
  });
}

function handleReplaceAllRequest(payload) {
  const requestId = Number(payload && payload.requestId);
  const query = typeof payload?.query === 'string' ? payload.query : '';
  const replacement = typeof payload?.replacement === 'string' ? payload.replacement : '';
  const matchCase = !!(payload && payload.matchCase);
  const currentValue = editor.value;

  if (!query) {
    return buildReplaceResponse('replace-all', requestId, {
      status: 'noop-empty-query',
      replacements: 0,
      finalTextLength: currentValue.length,
    });
  }

  if (currentValue.length > SMALL_UPDATE_THRESHOLD) {
    return buildReplaceResponse('replace-all', requestId, {
      status: 'noop-length-disallowed',
      replacements: 0,
      finalTextLength: currentValue.length,
    });
  }

  const computed = editorFindReplaceCore.computeLiteralReplaceAll({
    value: currentValue,
    query,
    replacement,
    matchCase,
  });
  if (!computed.replacements || computed.nextValue === currentValue) {
    return buildReplaceResponse('replace-all', requestId, {
      status: 'noop-unchanged',
      replacements: 0,
      finalTextLength: currentValue.length,
    });
  }

  if (computed.nextValue.length > SMALL_UPDATE_THRESHOLD) {
    return buildReplaceResponse('replace-all', requestId, {
      status: 'noop-length-disallowed',
      replacements: 0,
      finalTextLength: currentValue.length,
    });
  }

  if (computed.nextValue.length > maxTextChars) {
    return buildReplaceResponse('replace-all', requestId, {
      ok: false,
      status: 'max-text-exceeded',
      replacements: 0,
      finalTextLength: currentValue.length,
      error: 'replace-all projected text exceeds max text chars',
    });
  }

  const replaced = tryNativeReplaceWholeValueWithoutSync(computed.nextValue);
  if (!replaced) {
    return buildReplaceResponse('replace-all', requestId, {
      ok: false,
      status: 'internal-error',
      error: 'replace-all failed',
      replacements: 0,
      finalTextLength: currentValue.length,
    });
  }

  return buildReplaceResponse('replace-all', requestId, {
    status: 'replaced',
    replacements: computed.replacements,
    finalTextLength: computed.nextValue.length,
  });
}

function handleReplaceRequest(payload) {
  const operation = payload && payload.operation === 'replace-all'
    ? 'replace-all'
    : 'replace-current';

  if (operation === 'replace-all') {
    return handleReplaceAllRequest(payload);
  }

  return handleReplaceCurrentRequest(payload);
}

// =============================================================================
// Main-process sync helpers
// =============================================================================
function sendCurrentTextToMain(action, options = {}) {
  const hasText = Object.prototype.hasOwnProperty.call(options, 'text');
  const text = hasText ? options.text : editor.value;
  const onPrimaryError = typeof options.onPrimaryError === 'function' ? options.onPrimaryError : null;
  const onFallbackError = typeof options.onFallbackError === 'function' ? options.onFallbackError : null;

  try {
    const payload = { text, meta: { source: 'editor', action } };
    const res = window.editorAPI.setCurrentText(payload);
    handleTruncationResponse(res);
    return true;
  } catch (err) {
    if (onPrimaryError) {
      onPrimaryError(err);
    } else {
      log.warnOnce(
        'editor.setCurrentText.payload_failed',
        'setCurrentText payload failed (ignored); using fallback:',
        err
      );
    }
    try {
      const resFallback = window.editorAPI.setCurrentText(text);
      handleTruncationResponse(resFallback);
      return true;
    } catch (fallbackErr) {
      if (onFallbackError) {
        onFallbackError(fallbackErr);
      } else {
        log.error('Error sending set-current-text (fallback):', fallbackErr);
      }
      return false;
    }
  }
}

// =============================================================================
// Truncation notifications
// =============================================================================
function notifyTextTruncated() {
  window.Notify.notifyEditor('renderer.editor_alerts.text_truncated', { type: 'warn', duration: 5000 });
}

// =============================================================================
// Truncation response handling
// =============================================================================
function handleTruncationResponse(resPromise) {
  try {
    if (resPromise && typeof resPromise.then === 'function') {
      resPromise.then((r) => {
        if (r && r.truncated) {
          notifyTextTruncated();
        }
      }).catch((err) => {
        log.error('setCurrentText response handling failed:', err);
      });
    }
  } catch (err) {
    log.error('handleTruncationResponse error:', err);
  }
}

function insertTextAtCursor(rawText, options = {}) {
  try {
    const action = (options && typeof options.action === 'string') ? options.action : 'paste';
    const limitAlertKey = (options && typeof options.limitAlertKey === 'string')
      ? options.limitAlertKey
      : 'renderer.editor_alerts.paste_limit';
    const truncatedAlertKey = (options && typeof options.truncatedAlertKey === 'string')
      ? options.truncatedAlertKey
      : 'renderer.editor_alerts.paste_truncated';
    const syncOptions = {};
    if (options && typeof options.onPrimaryError === 'function') {
      syncOptions.onPrimaryError = options.onPrimaryError;
    }
    if (options && typeof options.onFallbackError === 'function') {
      syncOptions.onFallbackError = options.onFallbackError;
    }
    const available = getInsertionCapacity();
    if (available <= 0) {
      window.Notify.notifyEditor(limitAlertKey, { type: 'warn' });
      restoreFocusToEditor();
      return { inserted: 0, truncated: false };
    }

    let toInsert = rawText;
    let truncated = false;
    if (rawText.length > available) {
      toInsert = rawText.slice(0, available);
      truncated = true;
    }

    // Preferred native insert
    tryNativeInsertAtSelection(toInsert);

    // Notify main
    sendCurrentTextToMain(action, syncOptions);

    if (truncated) {
      window.Notify.notifyEditor(truncatedAlertKey, { type: 'warn', duration: 5000 });
    }

    restoreFocusToEditor();
    return { inserted: toInsert.length, truncated };
  } catch (err) {
    log.error('insertTextAtCursor error:', err);
    return { inserted: 0, truncated: false };
  }
}

// =============================================================================
// dispatch native input when doing direct assignment
// =============================================================================
function dispatchNativeInputEvent() {
  try {
    const ev = new Event('input', { bubbles: true });
    editor.dispatchEvent(ev);
  } catch (err) {
    log.error('dispatchNativeInputEvent error:', err);
  }
}

function restorePreviousActiveElement(prevActive, warnKey) {
  try {
    if (prevActive && prevActive !== editor) prevActive.focus();
  } catch (err) {
    log.warnOnce(warnKey, 'prevActive.focus() failed (ignored):', err);
  }
}

function replaceEditorValueHidden(nextValue) {
  try {
    editor.style.visibility = 'hidden';
    editor.value = nextValue;
    dispatchNativeInputEvent();
  } catch {
    editor.value = nextValue;
    dispatchNativeInputEvent();
  } finally {
    editor.style.visibility = '';
  }
}

function handleTextTransferInsert(ev, transferConfig) {
  const source = transferConfig && transferConfig.source ? transferConfig.source : 'transfer';
  const noTextAlertKey = transferConfig && transferConfig.noTextAlertKey
    ? transferConfig.noTextAlertKey
    : 'renderer.editor_alerts.paste_no_text';
  const tooBigAlertKey = transferConfig && transferConfig.tooBigAlertKey
    ? transferConfig.tooBigAlertKey
    : 'renderer.editor_alerts.paste_too_big';
  const insertOptions = transferConfig && transferConfig.insertOptions ? transferConfig.insertOptions : {};
  const getText = transferConfig && typeof transferConfig.getText === 'function'
    ? transferConfig.getText
    : () => '';

  try {
    if (editor.readOnly) {
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }

    ev.preventDefault();
    ev.stopPropagation();

    const text = String(getText(ev) || '');
    if (!text) {
      window.Notify.notifyEditor(noTextAlertKey, { type: 'warn' });
      restoreFocusToEditor();
      return;
    }

    if (text.length > PASTE_ALLOW_LIMIT) {
      window.Notify.notifyEditor(tooBigAlertKey, { type: 'warn', duration: 5000 });
      restoreFocusToEditor();
      return;
    }

    insertTextAtCursor(text, insertOptions);
  } catch (err) {
    log.error(`${source} handler error:`, err);
    restoreFocusToEditor();
  }
}

// =============================================================================
// Receive external updates (main -> editor)
// =============================================================================
async function applyExternalUpdate(payload) {
  try {
    let incomingMeta = null;
    let newText = '';

    if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'text')) {
      newText = String(payload.text || '');
      incomingMeta = payload.meta || null;
    } else {
      newText = String(payload || '');
    }

    let truncated = false;
    if (newText.length > maxTextChars) {
      newText = newText.slice(0, maxTextChars);
      truncated = true;
    }

    // IGNORE echo when it came from local publisher
    if (incomingMeta && incomingMeta.source === 'editor') {
      return;
    }

    if (editor.value === newText) {
      if (truncated) {
        notifyTextTruncated()
      }
      return;
    }

    const prevSuppressLocalUpdate = suppressLocalUpdate;
    suppressLocalUpdate = true;
    try {
      const useNative = newText.length <= SMALL_UPDATE_THRESHOLD;
      const prevActive = document.activeElement;

      const metaSource = incomingMeta && incomingMeta.source ? incomingMeta.source : null;
      const metaAction = incomingMeta && incomingMeta.action ? incomingMeta.action : null;

      if (metaSource === 'main-window' && metaAction === 'append_newline') {
        if (newText.startsWith(editor.value)) {
          let toInsert = newText.slice(editor.value.length);
          if (!toInsert) return;
          if (toInsert.length <= SMALL_UPDATE_THRESHOLD) {
            try {
              editor.focus();
              const tpos = editor.value.length;
              setCaretSafe(tpos);
              const ok = document.execCommand && document.execCommand('insertText', false, toInsert);
              if (!ok && typeof editor.setRangeText === 'function') {
                editor.setRangeText(toInsert, tpos, tpos, 'end');
                dispatchNativeInputEvent();
              } else if (!ok) {
                editor.value = editor.value + toInsert;
                dispatchNativeInputEvent();
              }
            } catch {
              editor.value = editor.value + toInsert;
              dispatchNativeInputEvent();
            } finally {
              restorePreviousActiveElement(prevActive, 'focus.prevActive.append_newline.native');
            }
            return;
          } else {
            replaceEditorValueHidden(newText);
            restorePreviousActiveElement(prevActive, 'focus.prevActive.append_newline.full');
            if (truncated) {
              notifyTextTruncated()
            }
            return;
          }
        }
      }

      if (metaSource === 'main' || metaSource === 'main-window' || !metaSource) {
        if (useNative) {
          try {
            editor.focus();
            selectAllEditor();
            let execOK = false;
            try { execOK = document.execCommand && document.execCommand('insertText', false, newText); } catch { execOK = false; }
            if (!execOK) {
              if (typeof editor.setRangeText === 'function') {
                editor.setRangeText(newText, 0, editor.value.length, 'end');
                dispatchNativeInputEvent();
              } else {
                editor.value = newText;
                dispatchNativeInputEvent();
              }
            }
          } catch {
            editor.value = newText;
            dispatchNativeInputEvent();
          } finally {
            restorePreviousActiveElement(prevActive, 'focus.prevActive.main.native');
          }
          if (truncated) {
            notifyTextTruncated()
          }
          return;
        } else {
          replaceEditorValueHidden(newText);
          restorePreviousActiveElement(prevActive, 'focus.prevActive.main.full');
          if (truncated) {
            notifyTextTruncated()
          }
          return;
        }
      }

      // fallback
      replaceEditorValueHidden(newText);
      if (truncated) {
        notifyTextTruncated()
      }
    } finally {
      suppressLocalUpdate = prevSuppressLocalUpdate;
    }
  } catch (err) {
    log.error('applyExternalUpdate error:', err);
  }
}

// =============================================================================
// Initialization
// =============================================================================
(async () => {
  try {
    const t = await window.editorAPI.getCurrentText();
    await applyExternalUpdate({ text: t || '', meta: { source: 'main', action: 'init' } });
    // initial state of CALCULATE button
    btnCalc.disabled = !!(calcWhileTyping && calcWhileTyping.checked);
    publishReplaceStatus();
  } catch (err) {
    log.error('Error initializing editor:', err);
  }
})();

// =============================================================================
// IPC bridge listeners
// =============================================================================
window.editorAPI.onInitText((p) => { applyExternalUpdate(p); });
window.editorAPI.onExternalUpdate((p) => { applyExternalUpdate(p); });
// If main forces clear editor (explicit), always clear regardless of focus
window.editorAPI.onForceClear(() => {
  try {
    suppressLocalUpdate = true;
    editor.value = '';
    // Update main too (keep state consistent)
    sendCurrentTextToMain('clear', { text: '' });
  } catch (err) {
    log.error('Error in onForceClear:', err);
  } finally {
    publishReplaceStatus();
    suppressLocalUpdate = false;
    restoreFocusToEditor();
  }
});

window.editorAPI.onReplaceRequest((payload) => {
  const requestId = Number(payload && payload.requestId);

  Promise.resolve()
    .then(() => handleReplaceRequest(payload || {}))
    .catch((err) => {
      log.error('handleReplaceRequest error:', err);
      return buildReplaceResponse(
        payload && payload.operation === 'replace-all' ? 'replace-all' : 'replace-current',
        requestId,
        {
        ok: false,
        status: 'internal-error',
        error: String(err),
        replacements: 0,
        }
      );
    })
    .then((response) => {
      try {
        window.editorAPI.sendReplaceResponse(response);
      } catch (err) {
        log.error('sendReplaceResponse error:', err);
      }
    });
});

if (typeof window.editorAPI.onReadingTestCountdown === 'function') {
  window.editorAPI.onReadingTestCountdown((payload) => {
    startReadingTestCountdown(payload);
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

  editor.addEventListener('paste', (ev) => { handleTextTransferInsert(ev, pasteTransferConfig); });
  editor.addEventListener('drop', (ev) => { handleTextTransferInsert(ev, dropTransferConfig); });
}

// =============================================================================
// Local input (typing)
// =============================================================================
if (editor) {
  editor.addEventListener('beforeinput', (ev) => {
    try {
      if (suppressLocalUpdate || editor.readOnly) return;
      const inputType = (typeof ev.inputType === 'string') ? ev.inputType : '';
      if (!inputType || !inputType.startsWith('insert')) return;

      // Paste/drop already have dedicated handlers with custom notifications.
      if (inputType === 'insertFromPaste' || inputType === 'insertFromDrop') return;

      const { start } = getSelectionRange();
      const available = getInsertionCapacity();
      if (available <= 0) {
        ev.preventDefault();
        window.Notify.notifyEditor('renderer.editor_alerts.type_limit', { type: 'warn', duration: 5000 });
        restoreFocusToEditor(start);
        return;
      }

      const incomingLength = getBeforeInputIncomingLength(ev);
      if (incomingLength !== null && incomingLength > available) {
        ev.preventDefault();
        window.Notify.notifyEditor('renderer.editor_alerts.type_limit', { type: 'warn', duration: 5000 });
        restoreFocusToEditor(start);
      }
    } catch (err) {
      log.error('beforeinput guard error:', err);
    }
  });
}

editor.addEventListener('input', () => {
  publishReplaceStatus();

  if (suppressLocalUpdate || editor.readOnly) return;

  if (!suppressLocalUpdate) {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (calcWhileTyping && calcWhileTyping.checked) {
      debounceTimer = setTimeout(() => {
        sendCurrentTextToMain('typing', {
          onFallbackError: (err) => log.errorOnce(
            'editor.setCurrentText.typing.fallback',
            'Error sending set-current-text typing:',
            err
          )
        });
      }, DEBOUNCE_MS);
    }
  }
});

async function persistEditorFontSizePx(nextFontSizePx) {
  const previousFontSizePx = editorFontSizePx;
  const normalizedNextFontSizePx = clampEditorFontSizePx(nextFontSizePx);

  if (!window.editorAPI || typeof window.editorAPI.setEditorFontSizePx !== 'function') {
    log.warnOnce(
      'editor.fontSize.apiMissing',
      'editorAPI.setEditorFontSizePx missing; editor text-size update ignored.'
    );
    return false;
  }

  if (normalizedNextFontSizePx === previousFontSizePx) {
    updateEditorTextSizeUi();
    return true;
  }

  setLocalEditorFontSizePx(normalizedNextFontSizePx);

  try {
    const result = await window.editorAPI.setEditorFontSizePx(normalizedNextFontSizePx);
    if (!result || result.ok !== true) {
      throw new Error(result && result.error ? String(result.error) : 'unknown');
    }
    return true;
  } catch (err) {
    log.error('Error updating editor font size setting:', err);
    setLocalEditorFontSizePx(previousFontSizePx);
    return false;
  }
}

function decreaseEditorFontSize() {
  return persistEditorFontSizePx(editorFontSizePx - EDITOR_FONT_SIZE_STEP_PX);
}

function increaseEditorFontSize() {
  return persistEditorFontSizePx(editorFontSizePx + EDITOR_FONT_SIZE_STEP_PX);
}

function resetEditorFontSize() {
  return persistEditorFontSizePx(EDITOR_FONT_SIZE_DEFAULT_PX);
}

// =============================================================================
// Buttons and toggles
// =============================================================================
// Trash button empties textarea and updates main
btnTrash.addEventListener('click', () => {
  editor.value = '';
  publishReplaceStatus();
  // immediately update main
  sendCurrentTextToMain('clear', {
    text: '',
    onFallbackError: (err) => log.warnOnce(
      'setCurrentText.trash.clear.fallback',
      'editorAPI.setCurrentText fallback failed (ignored):',
      err
    )
  });
  restoreFocusToEditor();
});

// CALC/SAVE button behavior: only active when automatic save and calculation is disabled
if (btnCalc) btnCalc.addEventListener('click', () => {
  try {
    const res = window.editorAPI.setCurrentText({ text: editor.value || '', meta: { source: 'editor', action: 'overwrite' } });
    handleTruncationResponse(res);
    // Do not close the modal or ask anything -per spec
  } catch (err) {
    log.error('Error executing CALC/SAVE:', err);
    window.Notify.notifyEditor('renderer.editor_alerts.calc_error', { type: 'error', duration: 5000 });
    restoreFocusToEditor();
  }
});

// Checkbox toggles whether CALC/SAVE is enabled (when unchecked) or disabled (when checked)
if (calcWhileTyping) calcWhileTyping.addEventListener('change', () => {
  if (calcWhileTyping.checked) {
    // enable automatic sending; disable CALC/SAVE
    btnCalc.disabled = true;
    // Also send current content once to keep sync
    sendCurrentTextToMain('typing_toggle_on', {
      text: editor.value || '',
      onFallbackError: (err) => log.warnOnce(
        'setCurrentText.typing_toggle_on.fallback',
        'editorAPI.setCurrentText fallback failed (typing toggle on ignored):',
        err
      )
    });
    // disable automatic sending; enable CALC/SAVE
  } else btnCalc.disabled = false;
});

if (spellcheckToggle) {
  spellcheckToggle.addEventListener('change', async () => {
    const previousEnabled = spellcheckEnabled;
    const nextEnabled = !!spellcheckToggle.checked;

    if (!window.editorAPI || typeof window.editorAPI.setSpellcheckEnabled !== 'function') {
      log.warnOnce(
        'editor.spellcheck.apiMissing',
        'editorAPI.setSpellcheckEnabled missing; spellcheck toggle ignored.'
      );
      setLocalSpellcheckEnabled(previousEnabled);
      return;
    }

    setLocalSpellcheckEnabled(nextEnabled);

    try {
      const result = await window.editorAPI.setSpellcheckEnabled(nextEnabled);
      if (!result || result.ok !== true) {
        throw new Error(result && result.error ? String(result.error) : 'unknown');
      }
    } catch (err) {
      log.error('Error updating spellcheck setting:', err);
      setLocalSpellcheckEnabled(previousEnabled);
    }
  });
}

if (btnTextSizeDecrease) {
  btnTextSizeDecrease.addEventListener('click', () => {
    decreaseEditorFontSize().catch((err) => {
      log.error('Error decreasing editor font size:', err);
    });
  });
}

if (btnTextSizeIncrease) {
  btnTextSizeIncrease.addEventListener('click', () => {
    increaseEditorFontSize().catch((err) => {
      log.error('Error increasing editor font size:', err);
    });
  });
}

if (btnTextSizeReset) {
  btnTextSizeReset.addEventListener('click', () => {
    resetEditorFontSize().catch((err) => {
      log.error('Error resetting editor font size:', err);
    });
  });
}

// =============================================================================
// End of public/editor.js
// =============================================================================
