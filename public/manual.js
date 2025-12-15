// public/manual.js
console.log('Manual editor starting...');

const { AppConstants } = window;
if (!AppConstants) {
  throw new Error('[manual] AppConstants no disponible; verifica la carga de constants.js');
}
let MAX_TEXT_CHARS = AppConstants.MAX_TEXT_CHARS; // Limite absoluto del tamano del texto en el editor. Si el contenido total supera este valor, se trunca. Previene cuelgues, lags extremos y OOM.
const PASTE_ALLOW_LIMIT = AppConstants.PASTE_ALLOW_LIMIT; // Umbral que determina si se permite que el editor de texto haga la insercion nativa en paste/drop.
const SMALL_UPDATE_THRESHOLD = AppConstants.SMALL_UPDATE_THRESHOLD; // Define cuando una actualizacion externa (desde main) debe aplicarse con mecanismo nativo (rapido, conserva undo/redo) o mediante reemplazo completo del value (mas seguro pero incompatible con undo/redo).

(async () => {
  try {
    const cfg = await window.manualAPI.getAppConfig();
    if (AppConstants && typeof AppConstants.applyConfig === 'function') {
      MAX_TEXT_CHARS = AppConstants.applyConfig(cfg);
    } else if (cfg && cfg.maxTextChars) {
      MAX_TEXT_CHARS = Number(cfg.maxTextChars) || MAX_TEXT_CHARS;
    }
  } catch (e) {
    console.error('manual: failed to get getAppConfig, using defaults:', e);
  }
  try {
    if (window.manualAPI && typeof window.manualAPI.getSettings === 'function') {
      const settings = await window.manualAPI.getSettings();
      if (settings && settings.language) {
        idiomaActual = settings.language || 'es';
      }
    }
    await applyEditorTranslations();
  } catch (e) {
    console.warn('manual: failed to apply initial translations:', e);
  }
  // rest of init (getCurrentText etc.) -ya tienes un init existente, integra con el tuyo
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

// --- i18n loader for modal editor (usa RendererI18n global) ---
let idiomaActual = 'es';
let translationsLoadedFor = null;

const { loadRendererTranslations, tRenderer } = window.RendererI18n || {};
if (!loadRendererTranslations || !tRenderer) {
  throw new Error('[manual] RendererI18n no disponible; no se puede continuar');
}

const tr = (path, fallback) => tRenderer(path, fallback);

async function ensureManualTranslations(lang) {
  const target = (lang || '').toLowerCase() || 'es';
  if (translationsLoadedFor === target) return;
  await loadRendererTranslations(target);
  translationsLoadedFor = target;
}

async function applyEditorTranslations() {
  await ensureManualTranslations(idiomaActual);
  document.title = tr('renderer.modal_editor.title', document.title);
  if (editor) editor.setAttribute('placeholder', tr('renderer.modal_editor.placeholder', editor.getAttribute('placeholder') || ''));
  if (btnCalc) btnCalc.textContent = tr('renderer.modal_editor.calc_button', btnCalc.textContent || '');
  if (calcLabel) {
    const chk = calcLabel.querySelector('input');
    calcLabel.textContent = tr('renderer.modal_editor.calc_while_typing', calcLabel.textContent || '');
    if (chk) calcLabel.prepend(chk);
  }
  if (btnTrash) {
    btnTrash.textContent = tr('renderer.modal_editor.clear', btnTrash.textContent || '');
    btnTrash.title = tr('renderer.modal_editor.clear_title', btnTrash.title || btnTrash.textContent || '');
  }
  if (bottomBar) {
    bottomBar.setAttribute('aria-label', tr('renderer.modal_editor.title', bottomBar.getAttribute('aria-label') || ''));
  }
}

/* ---------- Notices ---------- */
function ensureNoticeContainer() {
  let c = document.getElementById('__manual_notice_container');
  if (!c) {
    c = document.createElement('div');
    c.id = '__manual_notice_container';
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
    n.className = '__manual_notice';
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
    n.addEventListener('click', () => { try { n.remove(); } catch (e) { /* noop */ } });
    setTimeout(() => { try { n.remove(); } catch (e) { /* noop */ } }, duration);
  } catch (e) {
    console.debug('showNotice error:', e);
  }
}

/* ---------- focus helpers ---------- */
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
      } catch (e) {
        console.debug('restoreFocusToEditor error:', e);
      }
    }, 0);
  } catch (e) {
    console.debug('restoreFocusToEditor wrapper error:', e);
  }
}

/* estilos */
try {
  if (editor) {
    editor.wrap = 'soft';
    editor.style.whiteSpace = 'pre-wrap';
    editor.style.wordBreak = 'break-word';
  }
} catch (e) { console.debug('manual: failed to apply wrap styles:', e); }

/* ---------- Insercion local (mejor preservando undo) ---------- */
function tryNativeInsertAtSelection(text) {
  try {
    const start = typeof editor.selectionStart === 'number' ? editor.selectionStart : editor.value.length;
    const end = typeof editor.selectionEnd === 'number' ? editor.selectionEnd : start;

    // intentar execCommand
    try {
      const ok = document.execCommand && document.execCommand('insertText', false, text);
      if (ok) return true;
    } catch (e) {
      // sigue a fallback
    }

    // fallback: setRangeText
    if (typeof editor.setRangeText === 'function') {
      editor.setRangeText(text, start, end, 'end');
      const newCaret = start + text.length;
      if (typeof editor.setSelectionRange === 'function') editor.setSelectionRange(newCaret, newCaret);
      return true;
    }

    // ultima opcion: asignacion directa
    const before = editor.value.slice(0, start);
    const after = editor.value.slice(end);
    editor.value = before + text + after;
    const newCaret = before.length + text.length;
    if (typeof editor.setSelectionRange === 'function') editor.setSelectionRange(newCaret, newCaret);
    return true;
  } catch (e) {
    console.error('tryNativeInsertAtSelection error:', e);
    return false;
  }
}

function sendCurrentTextToMainWithMeta(action = 'insert') {
  try {
    const payload = { text: editor.value, meta: { source: 'editor', action } };
    const res = window.manualAPI.setCurrentText(payload);
    handleTruncationResponse(res);
  } catch (e) {
    try {
      const resFallback = window.manualAPI.setCurrentText(editor.value);
      handleTruncationResponse(resFallback);
    } catch (e2) {
      console.error('Error sending set-current-text (fallback):', e2);
    }
  }
}

function handleTruncationResponse(resPromise) {
  try {
    if (resPromise && typeof resPromise.then === 'function') {
      resPromise.then((r) => {
        if (r && r.truncated) {
          Notify.notifyManual('renderer.editor_alerts.text_truncated', { type: 'warn', duration: 5000 });
        }
      }).catch((err) => {
        console.error('Error handling truncated response:', err);
      });
    }
  } catch (e) {
    console.error('handleTruncationResponse error:', e);
  }
}

function insertTextAtCursor(rawText) {
  try {
    const available = MAX_TEXT_CHARS - editor.value.length;
    if (available <= 0) {
      Notify.notifyManual('renderer.editor_alerts.paste_limit', { type: 'warn' });
      restoreFocusToEditor();
      return { inserted: 0, truncated: false };
    }

    let toInsert = rawText;
    let truncated = false;
    if (rawText.length > available) {
      toInsert = rawText.slice(0, available);
      truncated = true;
    }

    // Insercion nativa preferida
    tryNativeInsertAtSelection(toInsert);

    // Notificar main
    sendCurrentTextToMainWithMeta('paste');

    if (truncated) {
      Notify.notifyManual('renderer.editor_alerts.paste_truncated', { type: 'warn', duration: 5000 });
    }

    restoreFocusToEditor();
    return { inserted: toInsert.length, truncated };
  } catch (e) {
    console.error('insertTextAtCursor error:', e);
    return { inserted: 0, truncated: false };
  }
}

/* ---------- dispatch input nativo cuando hacemos assignment directo ---------- */
function dispatchNativeInputEvent() {
  try {
    const ev = new Event('input', { bubbles: true });
    editor.dispatchEvent(ev);
  } catch (e) {
    console.error('dispatchNativeInputEvent error:', e);
  }
}

/* ---------- recibir actualizaciones externas (main -> editor) ---------- */
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

    // IGNORAR eco cuando vino del editor local
    if (incomingMeta && incomingMeta.source === 'editor') {
      return;
    }

    if (editor.value === newText) {
      if (truncated) {
        Notify.notifyManual('renderer.editor_alerts.text_truncated', { type: 'warn', duration: 5000 })
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
          } catch (t) {
            editor.value = editor.value + toInsert;
            dispatchNativeInputEvent();
          } finally {
            try { if (prevActive && prevActive !== editor) prevActive.focus(); } catch (e) { /* noop */ }
          }
          return;
        } else {
          try {
            editor.style.visibility = 'hidden';
            editor.value = newText;
            dispatchNativeInputEvent();
          } catch (e) {
            editor.value = newText;
            dispatchNativeInputEvent();
          } finally {
            editor.style.visibility = '';
            try { if (prevActive && prevActive !== editor) prevActive.focus(); } catch (e) { /* noop */ }
          }
          if (truncated) {
            Notify.notifyManual('renderer.editor_alerts.text_truncated', { type: 'warn', duration: 5000 })
          }
          return;
        }
      }
    }

    if (metaSource === 'main' || metaSource === 'main-window' || !metaSource) {
      if (useNative) {
        try {
          editor.focus();
          if (typeof editor.select === 'function') { try { editor.select(); } catch (e) { /* noop */ } }
          else if (typeof editor.setSelectionRange === 'function') editor.setSelectionRange(0, editor.value.length);
          let execOK = false;
          try { execOK = document.execCommand && document.execCommand('insertText', false, newText); } catch (t) { execOK = false; }
          if (!execOK) {
            if (typeof editor.setRangeText === 'function') {
              editor.setRangeText(newText, 0, editor.value.length, 'end');
              dispatchNativeInputEvent();
            } else {
              editor.value = newText;
              dispatchNativeInputEvent();
            }
          }
        } catch (e) {
          editor.value = newText;
          dispatchNativeInputEvent();
        } finally {
          try { if (prevActive && prevActive !== editor) prevActive.focus(); } catch (e) { /* noop */ }
        }
        if (truncated) {
          Notify.notifyManual('renderer.editor_alerts.text_truncated', { type: 'warn', duration: 5000 })
        }
        return;
      } else {
        try {
          editor.style.visibility = 'hidden';
          editor.value = newText;
          dispatchNativeInputEvent();
        } catch (e) {
          editor.value = newText;
          dispatchNativeInputEvent();
        } finally {
          editor.style.visibility = '';
          try { if (prevActive && prevActive !== editor) prevActive.focus(); } catch (e) { /* noop */ }
        }
        if (truncated)
          if (truncated) {
            Notify.notifyManual('renderer.editor_alerts.text_truncated', { type: 'warn', duration: 5000 })
          }
        return;
      }
    }

    // fallback
    try {
      editor.style.visibility = 'hidden';
      editor.value = newText;
      dispatchNativeInputEvent();
    } catch (e) {
      editor.value = newText;
      dispatchNativeInputEvent();
    } finally {
      editor.style.visibility = '';
    }
    if (truncated) {
      Notify.notifyManual('renderer.editor_alerts.text_truncated', { type: 'warn', duration: 5000 })
    }
  } catch (e) {
    console.error('applyExternalUpdate error:', e);
  }
}

/* ---------- inicializacion ---------- */
(async () => {
  try {
    const t = await window.manualAPI.getCurrentText();
    await applyExternalUpdate({ text: t || '', meta: { source: 'main', action: 'init' } });
    // initial state of CALCULAR button
    btnCalc.disabled = !!(calcWhileTyping && calcWhileTyping.checked);
  } catch (e) {
    console.error('Error initializing editor:', e);
  }
})();

/* ---------- IPC listeners ---------- */
window.manualAPI.onInitText((p) => { applyExternalUpdate(p); });
window.manualAPI.onExternalUpdate((p) => { applyExternalUpdate(p); });
// If main forces clear editor (explicit), always clear regardless of focus
window.manualAPI.onForceClear(() => {
  try {
    suppressLocalUpdate = true;
    editor.value = '';
    // Update main too (keep state consistent)
    try { window.manualAPI.setCurrentText({ text: '', meta: { source: 'editor', action: 'clear' } }); } catch (e) { window.manualAPI.setCurrentText(''); }
  } catch (e) {
    console.error('Error in onForceClear:', e);
  } finally {
    suppressLocalUpdate = false;
    restoreFocusToEditor();
  }
});

/* ---------- paste / drop handlers ---------- */
if (editor) {
  editor.addEventListener('paste', (ev) => {
    try {
      ev.preventDefault();
      ev.stopPropagation();
      const text = (ev.clipboardData && ev.clipboardData.getData('text/plain')) || '';
      if (!text) {
        Notify.notifyManual('renderer.editor_alerts.clipboard_no_text', { type: 'warn' });
        restoreFocusToEditor();
        return;
      }

      if (text.length <= PASTE_ALLOW_LIMIT) {
        insertTextAtCursor(text);
        return;
      }

      Notify.notifyManual('renderer.editor_alerts.clipboard_too_big', { type: 'warn', duration: 5000 });
      restoreFocusToEditor();
    } catch (e) {
      console.error('paste handler error:', e);
      restoreFocusToEditor();
    }
  });

  // DROP: si es pequeno, permitir la insercion nativa del navegador y luego notificar al main.
  editor.addEventListener('drop', (ev) => {
    try {
      const dt = ev.dataTransfer;
      const text = (dt && dt.getData && dt.getData('text/plain')) || '';
      if (!text) {
        ev.preventDefault();
        ev.stopPropagation();
        Notify.notifyManual('renderer.editor_alerts.drop_no_text', { type: 'warn' });
        restoreFocusToEditor();
        return;
      }

      if (text.length > PASTE_ALLOW_LIMIT) {
        ev.preventDefault();
        ev.stopPropagation();
        Notify.notifyManual('renderer.editor_alerts.drop_too_big', { type: 'warn', duration: 5000 });
        restoreFocusToEditor();
        return;
      }

      // Para tamanos pequenos dejamos que el navegador haga la insercion nativa (no prevenir default).
      // Posteriormente, en la siguiente tick, notificamos al main que el editor cambio.
      setTimeout(() => {
        try {
          // Asegurar truncado maximo
          if (editor.value.length > MAX_TEXT_CHARS) {
            editor.value = editor.value.slice(0, MAX_TEXT_CHARS);
            dispatchNativeInputEvent();
            Notify.notifyManual('renderer.editor_alerts.drop_truncated', { type: 'warn', duration: 5000 });
          }
          // Notificar al main -marca que viene del editor para evitar eco-back.
          try {
            const res = window.manualAPI.setCurrentText({ text: editor.value, meta: { source: 'editor', action: 'drop' } });
            handleTruncationResponse(res);
          } catch (e) {
            try { const resFallback = window.manualAPI.setCurrentText(editor.value); handleTruncationResponse(resFallback); } catch (e2) { /* noop */ }
          }
        } catch (e) {
          console.error('drop postprocess error:', e);
        }
      }, 0);

      // NO preventDefault: permitimos insercion nativa
    } catch (e) {
      console.error('drop handler error:', e);
      restoreFocusToEditor();
    }
  });
}

/* ---------- input local (typing) ---------- */
editor.addEventListener('input', () => {
  if (suppressLocalUpdate) return;

  if (editor.value && editor.value.length > MAX_TEXT_CHARS) {
    editor.value = editor.value.slice(0, MAX_TEXT_CHARS);
    Notify.notifyManual('renderer.editor_alerts.write_limit', { type: 'warn', duration: 5000 });
    try {
      const res = window.manualAPI.setCurrentText({ text: editor.value, meta: { source: 'editor', action: 'truncated' } });
      handleTruncationResponse(res);
    } catch (e) {
      console.error('manual: error sending set-current-text after truncate:', e);
      try { const resFallback = window.manualAPI.setCurrentText(editor.value); handleTruncationResponse(resFallback); } catch (e2) { /* noop */ }
    }
    restoreFocusToEditor();
    return;
  }

  if (!suppressLocalUpdate) {
    if (debounceTimer) clearTimeout(debounceTimer);
    if (calcWhileTyping && calcWhileTyping.checked) {
      debounceTimer = setTimeout(() => {
        try {
          const res = window.manualAPI.setCurrentText({ text: editor.value, meta: { source: 'editor', action: 'typing' } });
          handleTruncationResponse(res);
        } catch (e) {
          try { const resFallback = window.manualAPI.setCurrentText(editor.value); handleTruncationResponse(resFallback); } catch (e2) { console.error('Error sending set-current-text typing:', e2); }
        }
      }, DEBOUNCE_MS);
    }
  }
});

// Trash button empties textarea and updates main
btnTrash.addEventListener('click', () => {
  editor.value = '';
  // immediately update main
  try { const res = window.manualAPI.setCurrentText({ text: '', meta: { source: 'editor', action: 'clear' } }); handleTruncationResponse(res); } catch (e) { try { const resFallback = window.manualAPI.setCurrentText(''); handleTruncationResponse(resFallback); } catch (e2) { /* noop */ } }
  restoreFocusToEditor();
});

// CALCULAR button behavior: only active when automatic calculation is disabled
if (btnCalc) btnCalc.addEventListener('click', () => {
  try {
    const res = window.manualAPI.setCurrentText({ text: editor.value || '', meta: { source: 'editor', action: 'overwrite' } });
    handleTruncationResponse(res);
    // Do not close the modal or ask anything -per spec
  } catch (e) {
    console.error('Error executing CALCULAR:', e);
    Notify.notifyManual('renderer.editor_alerts.calc_error', { type: 'error', duration: 5000 });
    restoreFocusToEditor();
  }
});

// Checkbox toggles whether CALCULAR is enabled (when unchecked) or disabled (when checked)
if (calcWhileTyping) calcWhileTyping.addEventListener('change', () => {
  if (calcWhileTyping.checked) {
    // enable automatic sending; disable CALCULAR
    btnCalc.disabled = true;
    // Also send current content once to keep sync
    try {
      const res = window.manualAPI.setCurrentText({ text: editor.value || '', meta: { source: 'editor', action: 'typing_toggle_on' } });
      handleTruncationResponse(res);
    } catch (e) {
      try { const resFallback = window.manualAPI.setCurrentText(editor.value || ''); handleTruncationResponse(resFallback); } catch (e2) { /* noop */ }
    }
    // disable automatic sending; enable CALCULAR
  } else btnCalc.disabled = false;
});
