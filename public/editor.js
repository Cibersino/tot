// public/editor.js
console.log('Manual editor starting...');

const { AppConstants } = window;
if (!AppConstants) {
  throw new Error('[editor] AppConstants no disponible; verifica la carga de constants.js');
}
let MAX_TEXT_CHARS = AppConstants.MAX_TEXT_CHARS; // Absolute limit of the text size in the editor. If the total content exceeds this value, it is truncated. Prevents crashes, extreme lags and OOM.
const PASTE_ALLOW_LIMIT = AppConstants.PASTE_ALLOW_LIMIT; // Threshold that determines whether the text editor is allowed to do native paste/drop insertion.
const SMALL_UPDATE_THRESHOLD = AppConstants.SMALL_UPDATE_THRESHOLD; // Defines when an external update (from main) should be applied with native mechanism (fast, preserves undo/redo) or by full value replacement (safer but incompatible with undo/redo).

(async () => {
  try {
    const cfg = await window.editorAPI.getAppConfig();
    if (AppConstants && typeof AppConstants.applyConfig === 'function') {
      MAX_TEXT_CHARS = AppConstants.applyConfig(cfg);
    } else if (cfg && cfg.maxTextChars) {
      MAX_TEXT_CHARS = Number(cfg.maxTextChars) || MAX_TEXT_CHARS;
    }
  } catch (err) {
    console.error('editor: failed to get getAppConfig, using defaults:', err);
  }
  try {
    if (window.editorAPI && typeof window.editorAPI.getSettings === 'function') {
      const settings = await window.editorAPI.getSettings();
      if (settings && settings.language) {
        idiomaActual = settings.language || 'es';
      }
    }
    await applyEditorTranslations();
  } catch (err) {
    console.warn('editor: failed to apply initial translations:', err);
  }
  // rest of init (getCurrentText etc.) -you already have an existing init, integrate with yours
})();

const editor = document.getElementById('editorArea');
const btnTrash = document.getElementById('btnTrash');
const calcWhileTyping = document.getElementById('calcWhileTyping');
const btnCalc = document.getElementById('btnCalc');
const calcLabel = document.querySelector('.calc-label');
const bottomBar = document.getElementById('bottomBar');

let debounceTimer = null;
const DEBOUNCE_MS = 300;
let suppressLocalUpdate = false;

// Visibility helper: warn only once per key (editor scope)
const __WARN_ONCE_EDITOR = new Set();
function warnOnceEditor(key, ...args) {
  if (__WARN_ONCE_EDITOR.has(key)) return;
  __WARN_ONCE_EDITOR.add(key);
  try {
    console.warn('[editor]', key, ...args);
  } catch {
    // ignore console failures
  }
}

// --- i18n loader for editor (uses RendererI18n global) ---
let idiomaActual = 'es';
let translationsLoadedFor = null;

const { loadRendererTranslations, tRenderer } = window.RendererI18n || {};
if (!loadRendererTranslations || !tRenderer) {
  throw new Error('[editor] RendererI18n no disponible; no se puede continuar');
}

const tr = (path, fallback) => tRenderer(path, fallback);

async function ensureEditorTranslations(lang) {
  const target = (lang || '').toLowerCase() || 'es';
  if (translationsLoadedFor === target) return;
  await loadRendererTranslations(target);
  translationsLoadedFor = target;
}

async function applyEditorTranslations() {
  await ensureEditorTranslations(idiomaActual);
  document.title = tr('renderer.editor.title', document.title);
  if (editor) editor.setAttribute('placeholder', tr('renderer.editor.placeholder', editor.getAttribute('placeholder') || ''));
  if (btnCalc) btnCalc.textContent = tr('renderer.editor.calc_button', btnCalc.textContent || '');
  if (calcLabel) {
    const chk = calcLabel.querySelector('input');
    calcLabel.textContent = tr('renderer.editor.calc_while_typing', calcLabel.textContent || '');
    if (chk) calcLabel.prepend(chk);
  }
  if (btnTrash) {
    btnTrash.textContent = tr('renderer.editor.clear', btnTrash.textContent || '');
    btnTrash.title = tr('renderer.editor.clear_title', btnTrash.title || btnTrash.textContent || '');
  }
  if (bottomBar) {
    bottomBar.setAttribute('aria-label', tr('renderer.editor.title', bottomBar.getAttribute('aria-label') || ''));
  }
}

// ---------- Notices ---------- //
function ensureNoticeContainer() {
  let c = document.getElementById('__editor_notice_container');
  if (!c) {
    c = document.createElement('div');
    c.id = '__editor_notice_container';
    Object.assign(c.style, {
      position: 'fixed',
      top: '12px',
      right: '12px',
      zIndex: 2147483647,
      maxWidth: 'min(560px, calc(100% - 24px))',
      pointerEvents: 'none',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    });
    document.body.appendChild(c);
  }
  return c;
}

function showNotice(msg, { duration = 4500, type = 'info' } = {}) {
  try {
    const container = ensureNoticeContainer();
    const n = document.createElement('div');
    n.className = '__editor_notice';
    n.textContent = msg;
    n.style.pointerEvents = 'auto';
    const base = {
      padding: '10px 14px',
      borderRadius: '8px',
      boxShadow: '0 6px 18px rgba(0,0,0,0.14)',
      fontSize: '13px',
      lineHeight: '1.2',
      color: '#0b0b0b',
      maxWidth: '100%',
      wordBreak: 'break-word',
      background: '#e6f4ff'
    };
    if (type === 'warn') base.background = '#fff4e6';
    if (type === 'error') base.background = '#ffe6e6';
    Object.assign(n.style, base);
    container.appendChild(n);
    n.addEventListener('click', () => {
      try { n.remove(); }
      catch (err) { warnOnceEditor('notice.remove.click', 'failed to remove notice on click (ignored):', err); }
    });
    setTimeout(() => {
      try { n.remove(); }
      catch (err) { warnOnceEditor('notice.remove.timeout', 'failed to remove notice on timeout (ignored):', err); }
    }, duration);
  } catch (err) {
    console.debug('showNotice error:', err);
  }
}

// Expose for cross-script notifications (used by public/js/notify.js)
window.showNotice = showNotice;

// ---------- focus helpers ---------- //
function restoreFocusToEditor(pos = null) {
  try {
    setTimeout(() => {
      try {
        if (!editor) return;
        editor.focus();
        if (pos === null) {
          const p = editor.value ? editor.value.length : 0;
          if (typeof editor.setSelectionRange === 'function') editor.setSelectionRange(p, p);
        } else {
          if (typeof editor.setSelectionRange === 'function') editor.setSelectionRange(pos, pos);
        }
      } catch (err) {
        console.debug('restoreFocusToEditor error:', err);
      }
    }, 0);
  } catch (err) {
    console.debug('restoreFocusToEditor wrapper error:', err);
  }
}

// styles //
try {
  if (editor) {
    editor.wrap = 'soft';
    editor.style.whiteSpace = 'pre-wrap';
    editor.style.wordBreak = 'break-word';
  }
} catch (err) { console.debug('editor: failed to apply wrap styles:', err); }

// ---------- Local insertion (best preserving undo) ---------- //
function tryNativeInsertAtSelection(text) {
  try {
    const start = typeof editor.selectionStart === 'number' ? editor.selectionStart : editor.value.length;
    const end = typeof editor.selectionEnd === 'number' ? editor.selectionEnd : start;

    // try execCommand
    try {
      const ok = document.execCommand && document.execCommand('insertText', false, text);
      if (ok) return true;
    } catch {
      // follow fallback
    }

    // fallback: setRangeText
    if (typeof editor.setRangeText === 'function') {
      editor.setRangeText(text, start, end, 'end');
      const newCaret = start + text.length;
      if (typeof editor.setSelectionRange === 'function') editor.setSelectionRange(newCaret, newCaret);
      return true;
    }

    // last option: direct assignment
    const before = editor.value.slice(0, start);
    const after = editor.value.slice(end);
    editor.value = before + text + after;
    const newCaret = before.length + text.length;
    if (typeof editor.setSelectionRange === 'function') editor.setSelectionRange(newCaret, newCaret);
    return true;
  } catch (err) {
    console.error('tryNativeInsertAtSelection error:', err);
    return false;
  }
}

function sendCurrentTextToMainWithMeta(action = 'insert') {
  try {
    const payload = { text: editor.value, meta: { source: 'editor', action } };
    const res = window.editorAPI.setCurrentText(payload);
    handleTruncationResponse(res);
  } catch {
    try {
      const resFallback = window.editorAPI.setCurrentText(editor.value);
      handleTruncationResponse(resFallback);
    } catch (err) {
      console.error('Error sending set-current-text (fallback):', err);
    }
  }
}

function handleTruncationResponse(resPromise) {
  try {
    if (resPromise && typeof resPromise.then === 'function') {
      resPromise.then((r) => {
        if (r && r.truncated) {
          Notify.notifyEditor('renderer.editor_alerts.text_truncated', { type: 'warn', duration: 5000 });
        }
      }).catch((err) => {
        console.error('Error handling truncated response:', err);
      });
    }
  } catch (err) {
    console.error('handleTruncationResponse error:', err);
  }
}

function insertTextAtCursor(rawText) {
  try {
    const available = MAX_TEXT_CHARS - editor.value.length;
    if (available <= 0) {
      Notify.notifyEditor('renderer.editor_alerts.paste_limit', { type: 'warn' });
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
    sendCurrentTextToMainWithMeta('paste');

    if (truncated) {
      Notify.notifyEditor('renderer.editor_alerts.paste_truncated', { type: 'warn', duration: 5000 });
    }

    restoreFocusToEditor();
    return { inserted: toInsert.length, truncated };
  } catch (err) {
    console.error('insertTextAtCursor error:', err);
    return { inserted: 0, truncated: false };
  }
}

// ---------- dispatch native input when doing direct assignment ---------- //
function dispatchNativeInputEvent() {
  try {
    const ev = new Event('input', { bubbles: true });
    editor.dispatchEvent(ev);
  } catch (err) {
    console.error('dispatchNativeInputEvent error:', err);
  }
}

// ---------- receive external updates (main -> editor) ---------- //
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
    if (newText.length > MAX_TEXT_CHARS) {
      newText = newText.slice(0, MAX_TEXT_CHARS);
      truncated = true;
    }

    // IGNORE echo when it came from local publisher
    if (incomingMeta && incomingMeta.source === 'editor') {
      return;
    }

    if (editor.value === newText) {
      if (truncated) {
        Notify.notifyEditor('renderer.editor_alerts.text_truncated', { type: 'warn', duration: 5000 })
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
            if (typeof editor.setSelectionRange === 'function') editor.setSelectionRange(tpos, tpos);
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
            catch (err) { warnOnceEditor('focus.prevActive.append_newline.native', 'prevActive.focus() failed (ignored):', err); }
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
            catch (err) { warnOnceEditor('focus.prevActive.append_newline.full', 'prevActive.focus() failed (ignored):', err); }
          }
          if (truncated) {
            Notify.notifyEditor('renderer.editor_alerts.text_truncated', { type: 'warn', duration: 5000 })
          }
          return;
        }
      }
    }

    if (metaSource === 'main' || metaSource === 'main-window' || !metaSource) {
      if (useNative) {
        try {
          editor.focus();
          if (typeof editor.select === 'function') {
            try { editor.select(); }
            catch (err) { warnOnceEditor('editor.select', 'editor.select() failed (ignored):', err); }
          }
          else if (typeof editor.setSelectionRange === 'function') editor.setSelectionRange(0, editor.value.length);
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
          catch (err) { warnOnceEditor('focus.prevActive.main.native', 'prevActive.focus() failed (ignored):', err); }
        }
        if (truncated) {
          Notify.notifyEditor('renderer.editor_alerts.text_truncated', { type: 'warn', duration: 5000 })
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
          catch (err) { warnOnceEditor('focus.prevActive.main.full', 'prevActive.focus() failed (ignored):', err); }
        }
        if (truncated)
          if (truncated) {
            Notify.notifyEditor('renderer.editor_alerts.text_truncated', { type: 'warn', duration: 5000 })
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
      Notify.notifyEditor('renderer.editor_alerts.text_truncated', { type: 'warn', duration: 5000 })
    }
  } catch (err) {
    console.error('applyExternalUpdate error:', err);
  }
}

// ---------- initialization ---------- //
(async () => {
  try {
    const t = await window.editorAPI.getCurrentText();
    await applyExternalUpdate({ text: t || '', meta: { source: 'main', action: 'init' } });
    // initial state of CALCULATE button
    btnCalc.disabled = !!(calcWhileTyping && calcWhileTyping.checked);
  } catch (err) {
    console.error('Error initializing editor:', err);
  }
})();

// ---------- IPC listeners ---------- //
window.editorAPI.onInitText((p) => { applyExternalUpdate(p); });
window.editorAPI.onExternalUpdate((p) => { applyExternalUpdate(p); });
// If main forces clear editor (explicit), always clear regardless of focus
window.editorAPI.onForceClear(() => {
  try {
    suppressLocalUpdate = true;
    editor.value = '';
    // Update main too (keep state consistent)
    try { window.editorAPI.setCurrentText({ text: '', meta: { source: 'editor', action: 'clear' } }); } catch { window.editorAPI.setCurrentText(''); }
  } catch (err) {
    console.error('Error in onForceClear:', err);
  } finally {
    suppressLocalUpdate = false;
    restoreFocusToEditor();
  }
});

// ---------- paste / drop handlers ---------- //
if (editor) {
  editor.addEventListener('paste', (ev) => {
    try {
      ev.preventDefault();
      ev.stopPropagation();
      const text = (ev.clipboardData && ev.clipboardData.getData('text/plain')) || '';
      if (!text) {
        Notify.notifyEditor('renderer.editor_alerts.clipboard_no_text', { type: 'warn' });
        restoreFocusToEditor();
        return;
      }

      if (text.length <= PASTE_ALLOW_LIMIT) {
        insertTextAtCursor(text);
        return;
      }

      Notify.notifyEditor('renderer.editor_alerts.clipboard_too_big', { type: 'warn', duration: 5000 });
      restoreFocusToEditor();
    } catch (err) {
      console.error('paste handler error:', err);
      restoreFocusToEditor();
    }
  });

  // DROP: if small, allow native browser insertion and then notify main.
  editor.addEventListener('drop', (ev) => {
    try {
      const dt = ev.dataTransfer;
      const text = (dt && dt.getData && dt.getData('text/plain')) || '';
      if (!text) {
        ev.preventDefault();
        ev.stopPropagation();
        Notify.notifyEditor('renderer.editor_alerts.drop_no_text', { type: 'warn' });
        restoreFocusToEditor();
        return;
      }

      if (text.length > PASTE_ALLOW_LIMIT) {
        ev.preventDefault();
        ev.stopPropagation();
        Notify.notifyEditor('renderer.editor_alerts.drop_too_big', { type: 'warn', duration: 5000 });
        restoreFocusToEditor();
        return;
      }

      // For small sizes we let the browser do the native insertion (not prevent default).
      // Subsequently, on the next tick, we notify the main that the editor has changed.
      setTimeout(() => {
        try {
          // Ensure maximum truncation
          if (editor.value.length > MAX_TEXT_CHARS) {
            editor.value = editor.value.slice(0, MAX_TEXT_CHARS);
            dispatchNativeInputEvent();
            Notify.notifyEditor('renderer.editor_alerts.drop_truncated', { type: 'warn', duration: 5000 });
          }
          // Notifying the main-mark coming from the editor to avoid eco-back.
          try {
            const res = window.editorAPI.setCurrentText({ text: editor.value, meta: { source: 'editor', action: 'drop' } });
            handleTruncationResponse(res);
          } catch {
            try {
              const resFallback = window.editorAPI.setCurrentText(editor.value);
              handleTruncationResponse(resFallback);
            } catch (err) {
              warnOnceEditor('setCurrentText.drop.fallback', 'editorAPI.setCurrentText fallback failed (ignored):', err);
            }
          }
        } catch (err) {
          console.error('drop postprocess error:', err);
        }
      }, 0);

      // NO preventDefault: allow native insertion
    } catch (err) {
      console.error('drop handler error:', err);
      restoreFocusToEditor();
    }
  });
}

// ---------- local input (typing) ---------- //
editor.addEventListener('input', () => {
  if (suppressLocalUpdate) return;

  if (editor.value && editor.value.length > MAX_TEXT_CHARS) {
    editor.value = editor.value.slice(0, MAX_TEXT_CHARS);
    Notify.notifyEditor('renderer.editor_alerts.type_limit', { type: 'warn', duration: 5000 });
    try {
      const res = window.editorAPI.setCurrentText({ text: editor.value, meta: { source: 'editor', action: 'truncated' } });
      handleTruncationResponse(res);
    } catch (err) {
      console.error('editor: error sending set-current-text after truncate:', err);
      try {
        const resFallback = window.editorAPI.setCurrentText(editor.value);
        handleTruncationResponse(resFallback);
      } catch (innerErr) {
        warnOnceEditor('setCurrentText.truncate.fallback', 'editorAPI.setCurrentText fallback failed (ignored):', innerErr);
      }
    }
    restoreFocusToEditor();
    return;
  }

  if (!suppressLocalUpdate) {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (calcWhileTyping && calcWhileTyping.checked) {
      debounceTimer = setTimeout(() => {
        try {
          const res = window.editorAPI.setCurrentText({ text: editor.value, meta: { source: 'editor', action: 'typing' } });
          handleTruncationResponse(res);
        } catch {
          try { const resFallback = window.editorAPI.setCurrentText(editor.value); handleTruncationResponse(resFallback); } catch (err) { console.error('Error sending set-current-text typing:', err); }
        }
      }, DEBOUNCE_MS);
    }
  }
});

// Trash button empties textarea and updates main
btnTrash.addEventListener('click', () => {
  editor.value = '';
  // immediately update main
  try {
    const res = window.editorAPI.setCurrentText({ text: '', meta: { source: 'editor', action: 'clear' } });
    handleTruncationResponse(res);
  } catch {
    try {
      const resFallback = window.editorAPI.setCurrentText('');
      handleTruncationResponse(resFallback);
    } catch (err) {
      warnOnceEditor('setCurrentText.trash.clear.fallback', 'editorAPI.setCurrentText fallback failed (ignored):', err);
    }
  }
  restoreFocusToEditor();
});

// CALCULATE button behavior: only active when automatic calculation is disabled
if (btnCalc) btnCalc.addEventListener('click', () => {
  try {
    const res = window.editorAPI.setCurrentText({ text: editor.value || '', meta: { source: 'editor', action: 'overwrite' } });
    handleTruncationResponse(res);
    // Do not close the modal or ask anything -per spec
  } catch (err) {
    console.error('Error executing CALCULAR:', err);
    Notify.notifyEditor('renderer.editor_alerts.calc_error', { type: 'error', duration: 5000 });
    restoreFocusToEditor();
  }
});

// Checkbox toggles whether CALCULAR is enabled (when unchecked) or disabled (when checked)
if (calcWhileTyping) calcWhileTyping.addEventListener('change', () => {
  if (calcWhileTyping.checked) {
    // enable automatic sending; disable CALCULATE
    btnCalc.disabled = true;
    // Also send current content once to keep sync
    try {
      const res = window.editorAPI.setCurrentText({ text: editor.value || '', meta: { source: 'editor', action: 'typing_toggle_on' } });
      handleTruncationResponse(res);
    } catch {
      try {
        const resFallback = window.editorAPI.setCurrentText(editor.value || '');
        handleTruncationResponse(resFallback);
      } catch (err) {
        warnOnceEditor(
          'setCurrentText.typing_toggle_on.fallback',
          'editorAPI.setCurrentText fallback failed (typing toggle on ignored):',
          err
        );
      }
    }
    // disable automatic sending; enable CALCULATE
  } else btnCalc.disabled = false;
});
