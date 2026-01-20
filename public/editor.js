// public/editor.js
/* global Notify */
'use strict';

const log = window.getLogger('editor');

log.debug('Manual editor starting...');

const { AppConstants } = window;
if (!AppConstants) {
  throw new Error('[editor] AppConstants no disponible; verifica la carga de constants.js');
}
const { DEFAULT_LANG, PASTE_ALLOW_LIMIT, SMALL_UPDATE_THRESHOLD } = AppConstants;
let maxTextChars = AppConstants.MAX_TEXT_CHARS; // Absolute limit of the text size in the editor. If the total content exceeds this value, it is truncated. Prevents crashes, extreme lags and OOM.

(async () => {
  try {
    const cfg = await window.editorAPI.getAppConfig();
    if (AppConstants && typeof AppConstants.applyConfig === 'function') {
      maxTextChars = AppConstants.applyConfig(cfg);
    } else if (cfg && cfg.maxTextChars) {
      maxTextChars = Number(cfg.maxTextChars) || maxTextChars;
    }
  } catch (err) {
    log.error('editor: failed to get getAppConfig, using defaults:', err);
  }
  try {
    if (window.editorAPI && typeof window.editorAPI.getSettings === 'function') {
      const settings = await window.editorAPI.getSettings();
      if (settings && settings.language) {
        idiomaActual = settings.language || DEFAULT_LANG;
      }
    }
    await applyEditorTranslations();
  } catch (err) {
    log.warn('editor: failed to apply initial translations:', err);
  }
  // rest of init (getCurrentText etc.) -you already have an existing init, integrate with yours
})();

const editor = document.getElementById('editorArea');
const btnTrash = document.getElementById('btnTrash');
const calcWhileTyping = document.getElementById('calcWhileTyping');
const btnCalc = document.getElementById('btnCalc');
const calcLabel = document.querySelector('.calc-label');
const bottomBar = document.getElementById('bottomBar');
const findBar = document.getElementById('findBar');
const findInput = document.getElementById('findInput');
const findPrev = document.getElementById('findPrev');
const findNext = document.getElementById('findNext');
const findClose = document.getElementById('findClose');
const findCount = document.getElementById('findCount');
const findStatus = document.getElementById('findStatus');

let debounceTimer = null;
const DEBOUNCE_MS = 300;
let suppressLocalUpdate = false;
let findOpen = false;
let findSelectionChanged = false;
let findSelectionBeforeOpen = null;
let lastFindQuery = '';
let lastFindMatch = { index: -1, length: 0 };
let findCountState = { query: '', total: null, limited: false, textLen: 0 };
let findCountTimer = null;
const FIND_COUNT_THRESHOLD = 200000;
const FIND_COUNT_LIMIT = 2000;
const FIND_COUNT_DEBOUNCE_MS = 150;

// Visibility helper: warn only once per key (editor scope)
const warnOnceEditor = (...args) => log.warnOnce(...args);

// --- i18n loader for editor (uses RendererI18n global) ---
let idiomaActual = DEFAULT_LANG;
let translationsLoadedFor = null;

const { loadRendererTranslations, tRenderer } = window.RendererI18n || {};
if (!loadRendererTranslations || !tRenderer) {
  throw new Error('[editor] RendererI18n no disponible; no se puede continuar');
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
  if (findBar) {
    findBar.setAttribute('aria-label', tr('renderer.editor_find.label', findBar.getAttribute('aria-label') || 'Find'));
  }
  if (findInput) {
    findInput.setAttribute('placeholder', tr('renderer.editor_find.input_placeholder', findInput.getAttribute('placeholder') || 'Find...'));
    findInput.setAttribute('aria-label', tr('renderer.editor_find.input_aria', findInput.getAttribute('aria-label') || 'Find in text'));
  }
  if (findPrev) {
    findPrev.textContent = tr('renderer.editor_find.prev', findPrev.textContent || 'Prev');
    const prevTitle = tr('renderer.editor_find.prev_title', findPrev.title || findPrev.textContent || 'Prev');
    findPrev.title = prevTitle;
    findPrev.setAttribute('aria-label', prevTitle);
  }
  if (findNext) {
    findNext.textContent = tr('renderer.editor_find.next', findNext.textContent || 'Next');
    const nextTitle = tr('renderer.editor_find.next_title', findNext.title || findNext.textContent || 'Next');
    findNext.title = nextTitle;
    findNext.setAttribute('aria-label', nextTitle);
  }
  if (findClose) {
    findClose.textContent = tr('renderer.editor_find.close', findClose.textContent || 'Close');
    const closeTitle = tr('renderer.editor_find.close_title', findClose.title || findClose.textContent || 'Close');
    findClose.title = closeTitle;
    findClose.setAttribute('aria-label', closeTitle);
  }
}

if (window.editorAPI && typeof window.editorAPI.onSettingsChanged === 'function') {
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
}

// ---------- Notices ---------- //
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
    if (typeof Notify?.toastEditorText === 'function') {
      Notify.toastEditorText(text, { type, duration });
      return;
    }
    log.error('showNotice unavailable: Notify.toastEditorText missing.');
    if (typeof Notify?.notifyMain === 'function') {
      Notify.notifyMain(text);
    } else {
      log.error('showNotice fallback unavailable: Notify.notifyMain missing.');
    }
  } catch (err) {
    log.error('showNotice failed:', err);
    try {
      if (typeof Notify?.notifyMain === 'function') {
        Notify.notifyMain(text);
      } else {
        log.error('showNotice fallback unavailable: Notify.notifyMain missing.');
      }
    } catch (fallbackErr) {
      log.error('showNotice fallback failed:', fallbackErr);
    }
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
    catch (err) { warnOnceEditor('editor.select', 'editor.select() failed (ignored):', err); }
    return;
  }
  setSelectionSafe(0, editor.value.length);
}

// ---------- Find bar (manual search on textarea.value) ---------- //
const findCache = { text: '', lower: '' };

function isFindReady() {
  return !!(findBar && findInput && findPrev && findNext && findClose && editor);
}

function refreshFindCache() {
  if (!editor) return;
  const text = String(editor.value || '');
  if (findCache.text !== text) {
    findCache.text = text;
    findCache.lower = text.toLowerCase();
  }
}

function setFindStatusText(text) {
  if (!findStatus) return;
  findStatus.textContent = text || '';
}

function setFindCountText(text) {
  if (!findCount) return;
  findCount.textContent = text || '';
}

function updateFindIdleStatus() {
  if (!findInput) return;
  const q = String(findInput.value || '');
  if (!q) {
    setFindStatusText(tr('renderer.editor_find.status_empty_query', 'Type to search'));
  } else {
    setFindStatusText('');
  }
}

function openFindBar({ focusInput = true } = {}) {
  if (!isFindReady()) return;
  if (!findOpen) {
    findOpen = true;
    findBar.hidden = false;
    findSelectionChanged = false;
    findSelectionBeforeOpen = getSelectionRange();
  }
  updateFindIdleStatus();
  scheduleFindCountUpdate();
  if (focusInput) {
    findInput.focus();
    findInput.select();
  }
}

function closeFindBar({ restoreSelection = true } = {}) {
  if (!isFindReady() || !findOpen) return;
  findOpen = false;
  findBar.hidden = true;
  if (findCountTimer) {
    clearTimeout(findCountTimer);
    findCountTimer = null;
  }
  setFindStatusText('');
  setFindCountText('');
  const prevSelection = findSelectionBeforeOpen;
  const restore = restoreSelection && prevSelection && !findSelectionChanged;
  findSelectionBeforeOpen = null;
  findSelectionChanged = false;
  if (restore) {
    const { start, end } = prevSelection;
    editor.focus();
    setSelectionSafe(start, end);
  } else if (editor) {
    editor.focus();
  }
}

function countMatches(haystack, needle) {
  if (!needle) return { total: 0, limited: false };
  let count = 0;
  let idx = 0;
  const step = Math.max(needle.length, 1);
  let limited = false;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count += 1;
    if (count >= FIND_COUNT_LIMIT) {
      limited = true;
      break;
    }
    idx += step;
  }
  return { total: count, limited };
}

function countMatchesUpTo(haystack, needle, endIndex) {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  const step = Math.max(needle.length, 1);
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    if (idx > endIndex) break;
    count += 1;
    idx += step;
  }
  return count;
}

function maybeUpdateFindCount(query) {
  if (!findCount || !query) {
    findCountState = { query: '', total: null, limited: false, textLen: 0 };
    setFindCountText('');
    return;
  }

  refreshFindCache();
  const textLen = findCache.text.length;
  if (textLen > FIND_COUNT_THRESHOLD) {
    findCountState = { query: '', total: null, limited: false, textLen };
    setFindCountText('');
    return;
  }

  if (findCountState.query === query && findCountState.textLen === textLen && findCountState.total !== null) {
    return;
  }

  const needle = query.toLowerCase();
  const haystack = findCache.lower;
  const { total, limited } = countMatches(haystack, needle);
  findCountState = { query, total, limited, textLen };
}

function updateFindCountDisplay(matchIndex, query) {
  if (!findCount) return;
  const q = typeof query === 'string' ? query : String(findInput ? findInput.value || '' : '');
  if (!q || findCountState.query !== q || findCountState.total === null || findCountState.total === 0) {
    setFindCountText('');
    return;
  }
  refreshFindCache();
  const needle = q.toLowerCase();
  const current = typeof matchIndex === 'number' && matchIndex >= 0
    ? countMatchesUpTo(findCache.lower, needle, matchIndex)
    : null;
  const totalLabel = findCountState.limited ? `${findCountState.total}+` : `${findCountState.total}`;
  setFindCountText(current ? `${current}/${totalLabel}` : totalLabel);
}

function scheduleFindCountUpdate() {
  if (!isFindReady()) return;
  if (findCountTimer) clearTimeout(findCountTimer);
  const q = String(findInput.value || '');
  if (!q) {
    findCountState = { query: '', total: null, limited: false, textLen: 0 };
    setFindCountText('');
    return;
  }
  findCountTimer = setTimeout(() => {
    maybeUpdateFindCount(q);
    const matchIndex = lastFindQuery === q ? lastFindMatch.index : -1;
    updateFindCountDisplay(matchIndex, q);
  }, FIND_COUNT_DEBOUNCE_MS);
}

function focusEditorSelection(start, end) {
  try {
    editor.focus();
    setSelectionSafe(start, end);
  } catch (err) {
    log.error('focusEditorSelection failed:', err);
  }
}

function performFind(direction) {
  if (!isFindReady()) return false;
  const query = String(findInput.value || '');
  if (!query) {
    setFindStatusText(tr('renderer.editor_find.status_empty_query', 'Type to search'));
    setFindCountText('');
    return false;
  }

  refreshFindCache();
  const haystack = findCache.lower;
  const needle = query.toLowerCase();

  if (!needle) {
    setFindStatusText(tr('renderer.editor_find.status_empty_query', 'Type to search'));
    setFindCountText('');
    return false;
  }

  const { start, end } = getSelectionRange();
  const forward = direction !== -1;
  let startIndex = forward ? end : (start - 1);
  if (startIndex < 0) startIndex = forward ? 0 : -1;

  let idx = forward
    ? haystack.indexOf(needle, startIndex)
    : haystack.lastIndexOf(needle, startIndex);

  let wrapped = false;
  if (idx === -1) {
    wrapped = true;
    idx = forward
      ? haystack.indexOf(needle, 0)
      : haystack.lastIndexOf(needle, haystack.length);
  }

  if (idx === -1) {
    setFindStatusText(tr('renderer.editor_find.status_no_matches', 'No matches'));
    lastFindQuery = query;
    lastFindMatch = { index: -1, length: 0 };
    updateFindCountDisplay(-1, query);
    return false;
  }

  lastFindQuery = query;
  lastFindMatch = { index: idx, length: needle.length };
  findSelectionChanged = true;

  if (wrapped) {
    setFindStatusText(tr(
      forward ? 'renderer.editor_find.status_wrap_start' : 'renderer.editor_find.status_wrap_end',
      forward ? 'Wrapped to start' : 'Wrapped to end'
    ));
  } else {
    setFindStatusText('');
  }

  maybeUpdateFindCount(query);
  updateFindCountDisplay(idx, query);
  focusEditorSelection(idx, idx + needle.length);
  return true;
}

if (isFindReady()) {
  findInput.addEventListener('input', () => {
    updateFindIdleStatus();
    scheduleFindCountUpdate();
  });

  findInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      performFind(e.shiftKey ? -1 : 1);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeFindBar();
    }
  });

  findPrev.addEventListener('click', () => performFind(-1));
  findNext.addEventListener('click', () => performFind(1));
  findClose.addEventListener('click', () => closeFindBar());

  document.addEventListener('keydown', (e) => {
    const key = String(e.key || '');
    const isAccelF = (key === 'f' || key === 'F') && (e.ctrlKey || e.metaKey) && !e.altKey;
    if (isAccelF) {
      e.preventDefault();
      openFindBar({ focusInput: true });
      return;
    }

    const isF3 = key === 'F3';
    if (isF3) {
      if (!findOpen) {
        const hasQuery = String(findInput.value || '');
        if (hasQuery) {
          e.preventDefault();
          openFindBar({ focusInput: false });
          performFind(e.shiftKey ? -1 : 1);
        }
        return;
      }
      e.preventDefault();
      performFind(e.shiftKey ? -1 : 1);
      return;
    }

    if (findOpen && key === 'Escape') {
      e.preventDefault();
      closeFindBar();
    }
  });
}

// styles //
try {
  if (editor) {
    editor.wrap = 'soft';
    editor.style.whiteSpace = 'pre-wrap';
    editor.style.wordBreak = 'break-word';
  }
} catch (err) { log.warnOnce('editor:wrapStyles:apply_failed', 'editor wrap styles failed (ignored):', err); }

// ---------- Local insertion (best preserving undo) ---------- //
function tryNativeInsertAtSelection(text) {
  try {
    const { start, end } = getSelectionRange();

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
      setCaretSafe(newCaret);
      return true;
    }

    // last option: direct assignment
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
    if (onPrimaryError) onPrimaryError(err);
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

function sendCurrentTextToMainWithMeta(action = 'insert') {
  sendCurrentTextToMain(action);
}

function handleTruncationResponse(resPromise) {
  try {
    if (resPromise && typeof resPromise.then === 'function') {
      resPromise.then((r) => {
        if (r && r.truncated) {
          Notify.notifyEditor('renderer.editor_alerts.text_truncated', { type: 'warn', duration: 5000 });
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
    log.error('insertTextAtCursor error:', err);
    return { inserted: 0, truncated: false };
  }
}

// ---------- dispatch native input when doing direct assignment ---------- //
function dispatchNativeInputEvent() {
  try {
    const ev = new Event('input', { bubbles: true });
    editor.dispatchEvent(ev);
  } catch (err) {
    log.error('dispatchNativeInputEvent error:', err);
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
    log.error('applyExternalUpdate error:', err);
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
    log.error('Error initializing editor:', err);
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
    sendCurrentTextToMain('clear', { text: '' });
  } catch (err) {
    log.error('Error in onForceClear:', err);
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
        Notify.notifyEditor('renderer.editor_alerts.paste_no_text', { type: 'warn' });
        restoreFocusToEditor();
        return;
      }

      if (text.length <= PASTE_ALLOW_LIMIT) {
        insertTextAtCursor(text);
        return;
      }

      Notify.notifyEditor('renderer.editor_alerts.paste_too_big', { type: 'warn', duration: 5000 });
      restoreFocusToEditor();
    } catch (err) {
      log.error('paste handler error:', err);
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
          if (editor.value.length > maxTextChars) {
            editor.value = editor.value.slice(0, maxTextChars);
            dispatchNativeInputEvent();
            Notify.notifyEditor('renderer.editor_alerts.drop_truncated', { type: 'warn', duration: 5000 });
          }
          // Notifying the main-mark coming from the editor to avoid eco-back.
          sendCurrentTextToMain('drop', {
            onFallbackError: (err) => warnOnceEditor(
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

// ---------- local input (typing) ---------- //
editor.addEventListener('input', () => {
  if (suppressLocalUpdate) return;

  if (editor.value && editor.value.length > maxTextChars) {
    editor.value = editor.value.slice(0, maxTextChars);
    Notify.notifyEditor('renderer.editor_alerts.type_limit', { type: 'warn', duration: 5000 });
    sendCurrentTextToMain('truncated', {
      onPrimaryError: (err) => log.error('editor: error sending set-current-text after truncate:', err),
      onFallbackError: (err) => warnOnceEditor(
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

// Trash button empties textarea and updates main
btnTrash.addEventListener('click', () => {
  editor.value = '';
  // immediately update main
  sendCurrentTextToMain('clear', {
    text: '',
    onFallbackError: (err) => warnOnceEditor(
      'setCurrentText.trash.clear.fallback',
      'editorAPI.setCurrentText fallback failed (ignored):',
      err
    )
  });
  restoreFocusToEditor();
});

// CALCULATE button behavior: only active when automatic calculation is disabled
if (btnCalc) btnCalc.addEventListener('click', () => {
  try {
    const res = window.editorAPI.setCurrentText({ text: editor.value || '', meta: { source: 'editor', action: 'overwrite' } });
    handleTruncationResponse(res);
    // Do not close the modal or ask anything -per spec
  } catch (err) {
    log.error('Error executing CALCULAR:', err);
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
    sendCurrentTextToMain('typing_toggle_on', {
      text: editor.value || '',
      onFallbackError: (err) => warnOnceEditor(
        'setCurrentText.typing_toggle_on.fallback',
        'editorAPI.setCurrentText fallback failed (typing toggle on ignored):',
        err
      )
    });
    // disable automatic sending; enable CALCULATE
  } else btnCalc.disabled = false;
});
