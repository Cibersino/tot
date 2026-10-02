// electron/text_state.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own in-memory current text, normalize line endings, and enforce size limits.
// - Load persisted current text during init and save it during app shutdown.
// - Accept current-text updates from authorized IPC senders only.
// - Expose current-text IPC handlers, including the Editor bootstrap snapshot with a canonical write revision.
// - Broadcast current-text updates to the main window and Text Editor window.
// - Preserve compatibility behavior for the settings file on quit.

// =============================================================================
// Imports / logger
// =============================================================================
const fs = require('fs');
const { BrowserWindow, clipboard } = require('electron');
const Log = require('./log');
const {
  DEFAULT_LANG,
  MAX_TEXT_CHARS,
  MAX_IPC_MULTIPLIER,
  MAX_IPC_CHARS,
  MAX_META_STR_CHARS,
} = require('./constants_main');

const log = Log.get('text-state');
log.debug('Text state starting...');

// =============================================================================
// Validation / normalization helpers and action policy
// =============================================================================
function isPlainObject(x) {
  if (!x || typeof x !== 'object') return false;
  return Object.getPrototypeOf(x) === Object.prototype;
}

function sanitizeMeta(raw) {
  if (!isPlainObject(raw)) return null;

  const source = typeof raw.source === 'string' ? raw.source.trim() : '';
  const action = typeof raw.action === 'string' ? raw.action.trim() : '';

  if (source && source.length > MAX_META_STR_CHARS) return null;
  if (action && action.length > MAX_META_STR_CHARS) return null;
  if (!source && !action) return null;

  const out = {};
  if (source) out.source = source;
  if (action) out.action = action;
  return out;
}

const ALLOWED_SET_CURRENT_TEXT_ACTIONS = new Set([
  'overwrite',
  'append_newline',
  'typing',
  'typing_toggle_on',
  'clear',
  'paste',
  'drop',
  'set',
]);

function normalizeLineEndings(text) {
  if (typeof text !== 'string') {
    throw new Error('normalizeLineEndings requires a string');
  }
  if (!text.includes('\r')) return text;
  return text.replace(/\r\n?/g, '\n');
}

// =============================================================================
// Shared state and injected dependencies
// =============================================================================
// Default from constants_main.js; effective limit may be injected from main.js via init({ maxTextChars }).
let maxTextChars = MAX_TEXT_CHARS;
let maxIpcChars = MAX_IPC_CHARS;

// Current text held in memory; persisted on quit (also saved during init if it is truncated).
let currentText = '';

// Injected dependencies and file paths (set in init).
let loadJson = null;
let saveJson = null;
let currentTextFile = null;
let settingsFile = null;
let appRef = null;
let currentTextProcessingController = null;
let onCurrentTextDidBecomeEmpty = null;
// Starts after bootstrap and advances on every canonical write for the Editor snapshot/live stream.
let currentTextRevision = 0;

// main.js owns window lifecycle; this module resolves windows only to authorize and notify.
let getWindows = () => ({ mainWin: null, editorWin: null });

// =============================================================================
// Runtime helpers
// =============================================================================
// Best-effort notification: a window race must not change the text-update outcome.
function safeSend(win, channel, payload) {
  if (!win) {
    return;
  }

  if (win.isDestroyed()) {
    log.warnOnce(
      `text_state.safeSend.destroyed:${channel}`,
      `webContents.send('${channel}') failed (ignored): target window destroyed.`
    );
    return;
  }

  try {
    win.webContents.send(channel, payload);
  } catch (err) {
    log.warn(
      `webContents.send('${channel}') failed (ignored):`,
      err
    );
  }
}

// Persist current text and preserve the historical settings-file side effect on quit.
function persistCurrentTextOnQuit() {
  try {
    if (saveJson && currentTextFile) {
      saveJson(currentTextFile, { text: currentText });
    }

    // Maintain previous behavior: ensure settings file exists.
    if (loadJson && saveJson && settingsFile) {
      const settingsDefaults = {
        language: DEFAULT_LANG,
        presets_by_language: {},
        disabled_default_presets: {},
      };
      const settings = loadJson(settingsFile, settingsDefaults);
      if (!fs.existsSync(settingsFile)) {
        saveJson(settingsFile, settings);
      }
    }
  } catch (err) {
    log.error('Error persisting text in quit:', err);
  }
}

function beginCurrentTextProcessing(rawMeta) {
  if (!currentTextProcessingController || typeof currentTextProcessingController.begin !== 'function') {
    log.warnOnce(
      'text_state.current_text_processing.unavailable',
      'Current-text processing controller unavailable; pending lifecycle begin skipped.'
    );
    return null;
  }
  try {
    return currentTextProcessingController.begin(rawMeta);
  } catch (err) {
    log.error('Current-text processing begin failed:', err);
    return null;
  }
}

function getProcessingRequestId(processingState) {
  return processingState && Number.isInteger(processingState.requestId)
    ? processingState.requestId
    : null;
}

function getEditorCurrentTextSnapshot() {
  // Both reads occur in this synchronous main-process turn, so the text and
  // revision describe the same canonical write. This is independent from the
  // optional processing lifecycle and its requestId.
  return { ok: true, text: currentText, revision: currentTextRevision };
}

function isAllowedSenderWindow(targetWin, senderWin) {
  return !!(targetWin && !targetWin.isDestroyed() && senderWin && senderWin === targetWin);
}

function getNormalizedSetCurrentTextAction(incomingMeta) {
  const incomingAction = incomingMeta && typeof incomingMeta.action === 'string'
    ? incomingMeta.action
    : '';
  const normalizedAction = ALLOWED_SET_CURRENT_TEXT_ACTIONS.has(incomingAction)
    ? incomingAction
    : 'set';

  if (incomingAction && normalizedAction === 'set' && incomingAction !== 'set') {
    log.warn(
      `set-current-text invalid action '${incomingAction}'; using 'set'.`
    );
  }

  return normalizedAction;
}

function notifyCurrentTextDidBecomeEmpty({ previousText, nextText, requestId, meta } = {}) {
  if (typeof onCurrentTextDidBecomeEmpty !== 'function') {
    return;
  }
  try {
    onCurrentTextDidBecomeEmpty({
      previousText,
      nextText,
      requestId: Number.isInteger(requestId) ? requestId : null,
      meta: sanitizeMeta(meta),
    });
  } catch (err) {
    log.error('onCurrentTextDidBecomeEmpty callback failed:', err);
  }
}

// =============================================================================
// Text application / bootstrap load
// =============================================================================
function applyCurrentText(rawText, rawMeta) {
  const incomingMeta = sanitizeMeta(rawMeta);
  const processingState = beginCurrentTextProcessing(incomingMeta);
  const requestId = getProcessingRequestId(processingState);
  const previousText = currentText;
  let text = normalizeLineEndings(rawText);
  let truncated = false;

  if (text.length > maxTextChars) {
    text = text.slice(0, maxTextChars);
    truncated = true;
    log.warn(
      'text_state.applyCurrentText.truncated',
      'applyCurrentText: entry truncated to effective hard cap of ' + maxTextChars + ' chars.'
    );
  }

  currentText = text;
  currentTextRevision += 1;

  const { mainWin, editorWin } = getWindows() || {};
  const broadcastMeta = incomingMeta || { source: 'main', action: 'set' };

  // Main renderer uses live updates to refresh derived views.
  safeSend(mainWin, 'current-text-updated', {
    text: currentText,
    requestId,
    meta: broadcastMeta,
  });

  // Text Editor bootstraps independently; its live stream carries this canonical write revision.
  safeSend(editorWin, 'editor-text-updated', {
    text: currentText,
    revision: currentTextRevision,
    requestId,
    meta: broadcastMeta,
  });

  if (previousText !== currentText && currentText.length === 0) {
    notifyCurrentTextDidBecomeEmpty({
      previousText,
      nextText: currentText,
      requestId,
      meta: broadcastMeta,
    });
  }

  return {
    ok: true,
    requestId,
    truncated,
    length: currentText.length,
    text: currentText,
  };
}

// Load the canonical { text: ... } storage form and a raw-string root only as
// defensive recovery for noncanonical data; writers remain object-form only.
function loadInitialCurrentText() {
  try {
    let raw = loadJson
      ? loadJson(currentTextFile, { text: '' })
      : { text: '' };

    const isRawObject = raw && typeof raw === 'object';
    const hasTextProp = isRawObject && Object.prototype.hasOwnProperty.call(raw, 'text');
    const isRawString = typeof raw === 'string';
    let txt = hasTextProp ? String(raw.text || '') : '';
    if (!hasTextProp && isRawString) {
      log.warn(
        'BOOTSTRAP: Current text file uses noncanonical root-string form; recovering text.'
      );
      txt = raw;
    }
    if (!hasTextProp && !isRawString && typeof raw !== 'undefined') {
      log.warn(
        'BOOTSTRAP: Current text file has unexpected shape; using empty string.'
      );
    }

    const normalizedTxt = normalizeLineEndings(txt);
    const lineEndingsNormalized = normalizedTxt !== txt;
    txt = normalizedTxt;

    let shouldPersistNormalized = lineEndingsNormalized;
    if (txt.length > maxTextChars) {
      log.warn(
        `Initial text exceeds effective hard cap (${txt.length} > ${maxTextChars}); truncated and saved.`
      );
      txt = txt.slice(0, maxTextChars);
      shouldPersistNormalized = true;
    }

    if (lineEndingsNormalized) {
      log.warn(
        'BOOTSTRAP: Current text line endings normalized to LF and saved.'
      );
    }
    if (shouldPersistNormalized && saveJson && currentTextFile) {
      saveJson(currentTextFile, { text: txt });
    }

    currentText = txt;
  } catch (err) {
    log.error('Error loading current text file:', err);
    currentText = '';
  }
}

// =============================================================================
// Initialization / lifecycle
// =============================================================================
/**
 * Initialize module state, load persisted text, start processing tracking, and
 * attach before-quit persistence if an app instance was provided.
 */
function init(options) {
  const opts = options || {};

  loadJson = opts.loadJson;
  saveJson = opts.saveJson;
  currentTextFile = opts.currentTextFile;
  settingsFile = opts.settingsFile;
  appRef = opts.app || null;
  currentTextProcessingController = opts.currentTextProcessingController || null;
  onCurrentTextDidBecomeEmpty = typeof opts.onCurrentTextDidBecomeEmpty === 'function'
    ? opts.onCurrentTextDidBecomeEmpty
    : null;

  if (typeof opts.maxTextChars === 'number' && opts.maxTextChars > 0) {
    maxTextChars = opts.maxTextChars;
  }
  maxIpcChars = maxTextChars * MAX_IPC_MULTIPLIER;

  loadInitialCurrentText();
  currentTextRevision = 1;

  beginCurrentTextProcessing({
    source: 'main',
    action: 'initial_load',
  });

  if (appRef && typeof appRef.on === 'function') {
    appRef.on('before-quit', persistCurrentTextOnQuit);
  }
}

// =============================================================================
// IPC registration / handlers
// =============================================================================
/**
 * Register the text-related IPC handlers and capture the window resolver used
 * for sender authorization and best-effort update broadcasts.
 */
function registerIpc(ipcMain, windowsResolver) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[text_state] registerIpc requires ipcMain');
  }

  if (typeof windowsResolver === 'function') {
    getWindows = windowsResolver;
  } else if (windowsResolver && typeof windowsResolver === 'object') {
    getWindows = () => windowsResolver;
  }

  // The main-owned current-text value is always a canonical string.
  ipcMain.handle('get-current-text', async () => {
    return currentText;
  });
  ipcMain.handle('get-editor-current-text-snapshot', (event) => {
    const { editorWin } = getWindows() || {};
    const senderWin = event && event.sender
      ? BrowserWindow.fromWebContents(event.sender)
      : null;
    if (!isAllowedSenderWindow(editorWin, senderWin)) {
      log.warn('get-editor-current-text-snapshot unauthorized (ignored).');
      return { ok: false, error: 'unauthorized' };
    }
    return getEditorCurrentTextSnapshot();
  });
  ipcMain.handle('clipboard-read-text', (event) => {
    const { mainWin } = getWindows() || {};
    const senderWin = BrowserWindow.fromWebContents(event.sender);
    if (!isAllowedSenderWindow(mainWin, senderWin)) {
      log.warn(
        'clipboard-read-text unauthorized (ignored).'
      );
      return { ok: false, error: 'unauthorized', text: '', length: 0 };
    }
    const text = clipboard.readText();
    if (typeof text !== 'string') {
      log.warn('clipboard-read-text returned a non-string value.');
      return { ok: false, error: 'clipboard read returned a non-string value' };
    }
    if (text.length > maxIpcChars) {
      log.warn(
        'clipboard-read-text too large; rejecting (ignored):',
        text.length,
        '>',
        maxIpcChars
      );
      return { ok: false, tooLarge: true, length: text.length, text: '' };
    }
    return { ok: true, length: text.length, text };
  });

  // set-current-text: accept canonical payload { text, meta }
  ipcMain.handle('set-current-text', (_event, payload) => {
    try {
      const { mainWin, editorWin } = getWindows() || {};
      const senderWin = _event && _event.sender
        ? BrowserWindow.fromWebContents(_event.sender)
        : null;

      const mainAllowed = isAllowedSenderWindow(mainWin, senderWin);
      const editorAllowed = isAllowedSenderWindow(editorWin, senderWin);

      if (!mainAllowed && !editorAllowed) {
        log.warn(
          'set-current-text unauthorized (ignored).'
        );
        return { ok: false, error: 'unauthorized' };
      }

      const isPayloadObject = isPlainObject(payload);
      const hasTextProp = isPayloadObject && Object.prototype.hasOwnProperty.call(payload, 'text');
      if (!hasTextProp) {
        log.warn(
          'set-current-text requires payload { text, meta }; rejecting.'
        );
        return { ok: false, error: 'invalid payload' };
      }
      if (typeof payload.text !== 'string') {
        log.warn(
          'set-current-text payload text must be a string; rejecting.'
        );
        return { ok: false, error: 'invalid payload' };
      }
      const text = payload.text;

      if (text.length > maxIpcChars) {
        log.warn(
          `set-current-text payload too large (${text.length} > ${maxIpcChars}); rejecting.`
        );
        throw new Error('set-current-text payload too large');
      }
      const incomingMeta = sanitizeMeta(payload.meta);
      const normalizedAction = getNormalizedSetCurrentTextAction(incomingMeta);

      const normalizedMeta = {
        source: editorAllowed ? 'editor' : 'main-window',
        action: normalizedAction,
      };
      return applyCurrentText(text, normalizedMeta);
    } catch (err) {
      const msg = err && typeof err.message === 'string' ? err.message : '';
      if (msg !== 'set-current-text payload too large') {
        log.error('Error in set-current-text:', err);
      }
      return { ok: false, error: String(err) };
    }
  });
}

function getCurrentText() {
  return currentText;
}

// =============================================================================
// Exports / module surface
// =============================================================================
module.exports = {
  init,
  registerIpc,
  getCurrentText,
  applyCurrentText,
};

// =============================================================================
// End of electron/text_state.js
// =============================================================================
