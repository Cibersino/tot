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
const { DEFAULT_LANG, PASTE_ALLOW_LIMIT, SMALL_UPDATE_THRESHOLD } = AppConstants;
let maxTextChars = AppConstants.MAX_TEXT_CHARS; // Absolute limit of the text size in the editor. If the total content exceeds this value, it is truncated. Prevents crashes, extreme lags and OOM.

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

// =============================================================================
// Bootstrap: config and translations (async, best-effort)
// =============================================================================
(async () => {
  try {
    const cfg = await window.editorAPI.getAppConfig();
    if (AppConstants && typeof AppConstants.applyConfig === 'function') {
      maxTextChars = AppConstants.applyConfig(cfg);
    } else if (cfg && cfg.maxTextChars) {
      maxTextChars = Number(cfg.maxTextChars) || maxTextChars;
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
    } else {
      log.warn('BOOTSTRAP: editorAPI.getSettings missing; using default language.');
    }
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
const btnCalc = document.getElementById('btnCalc');
const calcLabel = document.querySelector('.calc-label');
const bottomBar = document.getElementById('bottomBar');

// =============================================================================
// Module state and limits
// =============================================================================
let debounceTimer = null;
const DEBOUNCE_MS = 300;
let suppressLocalUpdate = false;

// warnOnce keys are editor-scoped; use log.warnOnce directly.

// =============================================================================
// i18n (RendererI18n)
// =============================================================================
let idiomaActual = DEFAULT_LANG;
let translationsLoadedFor = null;

const { loadRendererTranslations, tRenderer } = window.RendererI18n || {};
if (!loadRendererTranslations || !tRenderer) {
  throw new Error('[editor] RendererI18n unavailable; cannot continue');
}

const tr = (path, fallback) => tRenderer(path, fallback);

async function ensureEditorTranslations(lang) {
  const target = (lang || '').toLowerCase() || DEFAULT_LANG;
  if (translationsLoadedFor === target) return;
  await loadRendererTranslations(target);
  translationsLoadedFor = target;
}

async function applyEditorTranslations() {
  await ensureEditorTranslations(idiomaActual);
  document.title = tr('renderer.editor.title', document.title);
  if (editor) editor.setAttribute('placeholder', tr('renderer.editor.placeholder', editor.getAttribute('placeholder') || ''));
  if (btnCalc) {
    const calcText = tr('renderer.editor.calc_button', btnCalc.getAttribute('data-label') || '');
    btnCalc.setAttribute('data-label', calcText);
    btnCalc.setAttribute('aria-label', calcText);
  }
  if (calcLabel) {
    const calcWhileTypingText = tr('renderer.editor.calc_while_typing', calcLabel.getAttribute('data-label') || '');
    calcLabel.setAttribute('data-label', calcWhileTypingText);
    if (calcWhileTyping) calcWhileTyping.setAttribute('aria-label', calcWhileTypingText);
  }
  if (btnTrash) {
    const clearText = tr('renderer.editor.clear', btnTrash.getAttribute('data-label') || '');
    btnTrash.setAttribute('data-label', clearText);
    btnTrash.setAttribute('aria-label', clearText);
    btnTrash.title = tr('renderer.editor.clear_title', btnTrash.title || clearText || '');
  }
  if (bottomBar) {
    bottomBar.setAttribute('aria-label', tr('renderer.editor.title', bottomBar.getAttribute('aria-label') || ''));
  }
}

// =============================================================================
// Settings integration
// =============================================================================
if (typeof window.editorAPI.onSettingsChanged === 'function') {
  window.editorAPI.onSettingsChanged(async (settings) => {
    try {
      const nextLang = settings && settings.language ? settings.language : '';
      if (!nextLang || nextLang === idiomaActual) return;
      idiomaActual = nextLang;
      await applyEditorTranslations();
    } catch (err) {
      log.warn('editor: failed to apply settings update:', err);
    }
  });
} else {
  log.warn('editorAPI.onSettingsChanged missing; live language updates disabled.');
}

// =============================================================================
// Notices
// =============================================================================
function showNotice(msg, opts = {}) {
  const text = (typeof msg === 'string') ? msg : String(msg);
  let type = 'info';
  let duration = 4500;

  if (typeof opts === 'number') {
    duration = opts;
  } else if (opts && typeof opts === 'object') {
    if (Object.prototype.hasOwnProperty.call(opts, 'type')) {
      type = opts.type || 'info';
    }
    if (Object.prototype.hasOwnProperty.call(opts, 'duration')) {
      duration = opts.duration;
    }
  }

  try {
    if (typeof window.Notify?.toastEditorText === 'function') {
      window.Notify.toastEditorText(text, { type, duration });
      return;
    }
    log.warnOnce(
      'editor.showNotice.toastEditorText.missing',
      'showNotice: window.Notify.toastEditorText missing; falling back to window.Notify.notifyMain.'
    );
    if (typeof window.Notify?.notifyMain === 'function') {
      window.Notify.notifyMain(text);
    } else {
      log.errorOnce(
        'editor.showNotice.notifyMain.missing',
        'showNotice fallback unavailable: window.Notify.notifyMain missing; notice dropped.'
      );
    }
  } catch (err) {
    log.warn('showNotice failed; attempting fallback:', err);
    try {
      if (typeof window.Notify?.notifyMain === 'function') {
        window.Notify.notifyMain(text);
      } else {
        log.errorOnce(
          'editor.showNotice.notifyMain.missing',
          'showNotice fallback unavailable: window.Notify.notifyMain missing; notice dropped.'
        );
      }
    } catch (fallbackErr) {
      log.error('showNotice fallback failed:', fallbackErr);
    }
  }
}

// Expose for cross-script notifications (used by public/js/notify.js)
window.showNotice = showNotice;

function notifyEditor(key, opts = {}) {
  if (typeof window.Notify?.notifyEditor === 'function') {
    window.Notify.notifyEditor(key, opts);
    return;
  }
  log.warnOnce(
    'editor.notifyEditor.missing',
    '[editor] window.Notify.notifyEditor missing; falling back to showNotice.'
  );
  showNotice(tr(key, key), opts);
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

function getSelectionRange() {
  const start = typeof editor.selectionStart === 'number' ? editor.selectionStart : editor.value.length;
  const end = typeof editor.selectionEnd === 'number' ? editor.selectionEnd : start;
  return { start, end };
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
  notifyEditor('renderer.editor_alerts.text_truncated', { type: 'warn', duration: 5000 });
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
        log.error('Error handling truncated response:', err);
      });
    }
  } catch (err) {
    log.error('handleTruncationResponse error:', err);
  }
}

function insertTextAtCursor(rawText) {
  try {
    const available = maxTextChars - editor.value.length;
    if (available <= 0) {
      notifyEditor('renderer.editor_alerts.paste_limit', { type: 'warn' });
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
    sendCurrentTextToMain('paste');

    if (truncated) {
      notifyEditor('renderer.editor_alerts.paste_truncated', { type: 'warn', duration: 5000 });
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
            try { if (prevActive && prevActive !== editor) prevActive.focus(); }
            catch (err) { log.warnOnce('focus.prevActive.append_newline.native', 'prevActive.focus() failed (ignored):', err); }
          }
          return;
        } else {
          try {
            editor.style.visibility = 'hidden';
            editor.value = newText;
            dispatchNativeInputEvent();
          } catch {
            editor.value = newText;
            dispatchNativeInputEvent();
          } finally {
            editor.style.visibility = '';
            try { if (prevActive && prevActive !== editor) prevActive.focus(); }
            catch (err) { log.warnOnce('focus.prevActive.append_newline.full', 'prevActive.focus() failed (ignored):', err); }
          }
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
          try { if (prevActive && prevActive !== editor) prevActive.focus(); }
          catch (err) { log.warnOnce('focus.prevActive.main.native', 'prevActive.focus() failed (ignored):', err); }
        }
        if (truncated) {
          notifyTextTruncated()
        }
        return;
      } else {
        try {
          editor.style.visibility = 'hidden';
          editor.value = newText;
          dispatchNativeInputEvent();
        } catch {
          editor.value = newText;
          dispatchNativeInputEvent();
        } finally {
          editor.style.visibility = '';
          try { if (prevActive && prevActive !== editor) prevActive.focus(); }
          catch (err) { log.warnOnce('focus.prevActive.main.full', 'prevActive.focus() failed (ignored):', err); }
        }
        if (truncated) {
          notifyTextTruncated()
        }
        return;
      }
    }

    // fallback
    try {
      editor.style.visibility = 'hidden';
      editor.value = newText;
      dispatchNativeInputEvent();
    } catch {
      editor.value = newText;
      dispatchNativeInputEvent();
    } finally {
      editor.style.visibility = '';
    }
    if (truncated) {
      notifyTextTruncated()
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
    suppressLocalUpdate = false;
    restoreFocusToEditor();
  }
});

// =============================================================================
// Paste / drop handlers
// =============================================================================
if (editor) {
  editor.addEventListener('paste', (ev) => {
    try {
      if (editor.readOnly) {
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      const text = (ev.clipboardData && ev.clipboardData.getData('text/plain')) || '';
      if (!text) {
        notifyEditor('renderer.editor_alerts.paste_no_text', { type: 'warn' });
        restoreFocusToEditor();
        return;
      }

      if (text.length <= PASTE_ALLOW_LIMIT) {
        insertTextAtCursor(text);
        return;
      }

      notifyEditor('renderer.editor_alerts.paste_too_big', { type: 'warn', duration: 5000 });
      restoreFocusToEditor();
    } catch (err) {
      log.error('paste handler error:', err);
      restoreFocusToEditor();
    }
  });

  // DROP: if small, allow native browser insertion and then notify main.
  editor.addEventListener('drop', (ev) => {
    try {
      if (editor.readOnly) {
        ev.preventDefault();
        ev.stopPropagation();
        return;
      }
      const dt = ev.dataTransfer;
      const text = (dt && dt.getData && dt.getData('text/plain')) || '';
      if (!text) {
        ev.preventDefault();
        ev.stopPropagation();
        notifyEditor('renderer.editor_alerts.drop_no_text', { type: 'warn' });
        restoreFocusToEditor();
        return;
      }

      if (text.length > PASTE_ALLOW_LIMIT) {
        ev.preventDefault();
        ev.stopPropagation();
        notifyEditor('renderer.editor_alerts.drop_too_big', { type: 'warn', duration: 5000 });
        restoreFocusToEditor();
        return;
      }

      // For small sizes we let the browser do the native insertion (not prevent default).
      // Subsequently, on the next tick, we notify the main that the editor has changed.
      setTimeout(() => {
        try {
          // Ensure maximum truncation
          if (editor.value.length > maxTextChars) {
            editor.value = editor.value.slice(0, maxTextChars);
            dispatchNativeInputEvent();
            notifyEditor('renderer.editor_alerts.drop_truncated', { type: 'warn', duration: 5000 });
          }
          // Notifying the main-mark coming from the editor to avoid eco-back.
          sendCurrentTextToMain('drop', {
            onFallbackError: (err) => log.warnOnce(
              'setCurrentText.drop.fallback',
              'editorAPI.setCurrentText fallback failed (ignored):',
              err
            )
          });
        } catch (err) {
          log.error('drop postprocess error:', err);
        }
      }, 0);

      // NO preventDefault: allow native insertion
    } catch (err) {
      log.error('drop handler error:', err);
      restoreFocusToEditor();
    }
  });
}

// =============================================================================
// Local input (typing)
// =============================================================================
editor.addEventListener('input', () => {
  if (suppressLocalUpdate || editor.readOnly) return;

  if (editor.value && editor.value.length > maxTextChars) {
    editor.value = editor.value.slice(0, maxTextChars);
    notifyEditor('renderer.editor_alerts.type_limit', { type: 'warn', duration: 5000 });
    sendCurrentTextToMain('truncated', {
      onPrimaryError: (err) => log.error('editor: error sending set-current-text after truncate:', err),
      onFallbackError: (err) => log.warnOnce(
        'setCurrentText.truncate.fallback',
        'editorAPI.setCurrentText fallback failed (ignored):',
        err
      )
    });
    restoreFocusToEditor();
    return;
  }

  if (!suppressLocalUpdate) {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (calcWhileTyping && calcWhileTyping.checked) {
      debounceTimer = setTimeout(() => {
        sendCurrentTextToMain('typing', {
          onFallbackError: (err) => log.error('Error sending set-current-text typing:', err)
        });
      }, DEBOUNCE_MS);
    }
  }
});

// =============================================================================
// Buttons and toggles
// =============================================================================
// Trash button empties textarea and updates main
btnTrash.addEventListener('click', () => {
  editor.value = '';
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
    notifyEditor('renderer.editor_alerts.calc_error', { type: 'error', duration: 5000 });
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

// =============================================================================
// End of public/editor.js
// =============================================================================
