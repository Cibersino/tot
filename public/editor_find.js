// public/editor_find.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Renderer script for the dedicated find window.
// Responsibilities:
// - Keep find controls in sync with native main-process state.
// - Forward query/navigation actions through editorFindAPI.
// - Apply renderer translations and react to language updates.
// - Bootstrap initial language, UI state, and query focus.

// =============================================================================
// Logger and required runtime dependencies
// =============================================================================
if (typeof window.getLogger !== 'function') {
  throw new Error('[editor-find] window.getLogger unavailable; cannot continue.');
}

const log = window.getLogger('editor-find');
log.debug('Editor find window starting...');

function reportEarlyTerminalFindI18nFailure(kind) {
  // The static shell already disables normal Find controls while the required
  // translation surface is being established. At this boundary, the dynamic
  // DOM references below do not exist yet, so report directly through the
  // stable preload surface rather than entering the regular terminal helper.
  const api = window.editorFindAPI;
  if (!api || typeof api.reportRendererI18nFailure !== 'function') {
    log.warn('editorFindAPI.reportRendererI18nFailure unavailable (ignored); closing failed renderer locally.');
    if (typeof window.close === 'function') window.close();
    return;
  }
  try {
    api.reportRendererI18nFailure({ kind });
  } catch (err) {
    log.warn('editorFindAPI.reportRendererI18nFailure failed (ignored); closing failed renderer locally:', err);
    if (typeof window.close === 'function') window.close();
  }
}

const rendererIcons = window.RendererIcons || null;
if (!rendererIcons || typeof rendererIcons.applyIconToElement !== 'function') {
  throw new Error('[editor-find] RendererIcons.applyIconToElement unavailable; cannot continue.');
}

const { AppConstants } = window;
if (!AppConstants) {
  throw new Error('[editor-find] AppConstants unavailable; verify constants.js is loaded.');
}
const {
  DEFAULT_LANG,
  EDITOR_FIND_INPUT_MAX_CHARS,
} = AppConstants;
let findI18nTerminal = false;

const { transitionRendererTranslations, tRenderer } = window.RendererI18n || {};
if (!transitionRendererTranslations || !tRenderer) {
  reportEarlyTerminalFindI18nFailure('startup-api');
  throw new Error('[editor-find] RendererI18n unavailable; cannot continue.');
}

const findApi = window.editorFindAPI;
if (!findApi) {
  throw new Error('[editor-find] editorFindAPI unavailable; verify editor_find_preload.js.');
}
if (
  typeof findApi.setQuery !== 'function' ||
  typeof findApi.next !== 'function' ||
  typeof findApi.prev !== 'function' ||
  typeof findApi.replaceCurrent !== 'function' ||
  typeof findApi.replaceAll !== 'function' ||
  typeof findApi.toggleExpanded !== 'function' ||
  typeof findApi.close !== 'function' ||
  typeof findApi.onInit !== 'function' ||
  typeof findApi.onState !== 'function'
) {
  throw new Error('[editor-find] editorFindAPI required methods unavailable; cannot continue.');
}

// =============================================================================
// DOM references and shared state
// =============================================================================
const wrapEl = document.getElementById('findWrap');
const toggleEl = document.getElementById('findToggle');
const inputEl = document.getElementById('findQuery');
const prevEl = document.getElementById('findPrev');
const nextEl = document.getElementById('findNext');
const closeEl = document.getElementById('findClose');
const statusEl = document.getElementById('findStatus');
const replaceRowEl = document.getElementById('replaceRow');
const replaceInputEl = document.getElementById('findReplace');
const replaceOneEl = document.getElementById('findReplaceOne');
const replaceOneDescriptionEl = document.getElementById('findReplaceOneDescription');
const replaceAllEl = document.getElementById('findReplaceAll');
const replaceAllDescriptionEl = document.getElementById('findReplaceAllDescription');

if (
  !wrapEl ||
  !toggleEl ||
  !inputEl ||
  !prevEl ||
  !nextEl ||
  !closeEl ||
  !statusEl ||
  !replaceRowEl ||
  !replaceInputEl ||
  !replaceOneEl ||
  !replaceOneDescriptionEl ||
  !replaceAllEl ||
  !replaceAllDescriptionEl
) {
  throw new Error('[editor-find] Missing required DOM elements');
}

let idiomaActual = DEFAULT_LANG;
let translationsLoadedFor = null;
let findSemanticQueue = Promise.resolve();
let findSemanticReady = false;

const findInputMaxChars = Number.isFinite(Number(EDITOR_FIND_INPUT_MAX_CHARS))
  ? Math.max(1, Math.floor(Number(EDITOR_FIND_INPUT_MAX_CHARS)))
  : 512;

const findState = {
  query: '',
  matches: 0,
  activeMatchOrdinal: 0,
  finalUpdate: true,
  expanded: false,
  busy: false,
};

let pendingFocusIntent = null;

// =============================================================================
// State and UI helpers
// =============================================================================
function applyIncomingState(payload) {
  if (findI18nTerminal) return;
  normalizeState(payload);
  if (!translationsLoadedFor) return;
  projectMainStateIntoUi();
  applyPendingFocusIntent();
}

function normalizeState(payload) {
  if (!payload || typeof payload !== 'object') return;

  const query = typeof payload.query === 'string' ? payload.query : '';
  const matches = Number(payload.matches);
  const active = Number(payload.activeMatchOrdinal);

  findState.query = query;
  findState.matches = Number.isFinite(matches) && matches > 0 ? Math.floor(matches) : 0;
  findState.activeMatchOrdinal = Number.isFinite(active) && active > 0 ? Math.floor(active) : 0;
  findState.finalUpdate = !!payload.finalUpdate;
  findState.expanded = !!payload.expanded;
  findState.busy = !!payload.busy;
}

function resolveStatusText() {
  if (!findState.query) {
    return tRenderer('renderer.editor.editor_find.status_empty_query');
  }
  if (findState.matches <= 0) {
    return tRenderer('renderer.editor.editor_find.status_no_matches');
  }
  const current = Math.max(1, Math.min(findState.activeMatchOrdinal || 1, findState.matches));
  return `${current}/${findState.matches}`;
}

function synchronizeQueryInputFromMainState() {
  // The editable query is Main-owned state. Translation presentation must not
  // overwrite input that has been submitted but whose state echo is still pending.
  if (inputEl.value !== findState.query) {
    inputEl.value = findState.query;
  }
}

function projectMainStateIntoUi() {
  synchronizeQueryInputFromMainState();
  applyUiState();
}

function applyUiState() {
  document.body.setAttribute('data-expanded', findState.expanded ? 'true' : 'false');
  replaceRowEl.hidden = !findState.expanded;

  const hasQuery = findState.query.length > 0;
  const hasMatches = findState.matches > 0;
  const commandsAvailable = findSemanticReady && !findI18nTerminal;
  inputEl.disabled = !commandsAvailable || findState.busy;
  replaceInputEl.disabled = !commandsAvailable || findState.busy;
  prevEl.disabled = !commandsAvailable || findState.busy || !hasQuery;
  nextEl.disabled = !commandsAvailable || findState.busy || !hasQuery;
  replaceOneEl.disabled = !commandsAvailable || findState.busy || !hasQuery || !hasMatches || !findState.finalUpdate;
  replaceAllEl.disabled = !commandsAvailable || findState.busy || !hasQuery || !hasMatches || !findState.finalUpdate;
  toggleEl.disabled = !commandsAvailable || findState.busy;
  closeEl.disabled = false;
  statusEl.textContent = resolveStatusText();
  rendererIcons.applyIconToElement(toggleEl, findState.expanded ? 'collapse' : 'expand', {
    preserveContent: false,
  });

  const toggleNameKey = findState.expanded
    ? 'renderer.editor.editor_find.names.hide_replace'
    : 'renderer.editor.editor_find.names.show_replace';
  const toggleName = tRenderer(toggleNameKey);
  toggleEl.setAttribute('aria-label', toggleName);
}

async function applyTranslations() {
  const title = tRenderer('renderer.editor.editor_find.input_aria');
  document.title = title;
  wrapEl.setAttribute('aria-label', title);

  inputEl.placeholder = tRenderer('renderer.editor.editor_find.input_placeholder');
  inputEl.setAttribute('aria-label', tRenderer('renderer.editor.editor_find.input_aria'));
  replaceInputEl.placeholder = tRenderer('renderer.editor.editor_find.replace_placeholder');
  replaceInputEl.setAttribute('aria-label', tRenderer('renderer.editor.editor_find.replace_aria'));

  replaceOneEl.textContent = tRenderer('renderer.editor.editor_find.replace');
  replaceAllEl.textContent = tRenderer('renderer.editor.editor_find.replace_all');

  [
    [prevEl, 'renderer.editor.editor_find.names.previous_match'],
    [nextEl, 'renderer.editor.editor_find.names.next_match'],
    [closeEl, 'renderer.editor.editor_find.names.close'],
  ].forEach(([element, key]) => {
    const name = tRenderer(key);
    element.setAttribute('aria-label', name);
  });
  const replaceCurrentHelp = tRenderer('renderer.editor.editor_find.help.replace_current');
  replaceOneDescriptionEl.textContent = replaceCurrentHelp;
  const replaceAllHelp = tRenderer('renderer.editor.editor_find.help.replace_all');
  replaceAllDescriptionEl.textContent = replaceAllHelp;

  findSemanticReady = true;
  applyUiState();
}

async function transitionFindTranslations(language) {
  await transitionRendererTranslations(language || DEFAULT_LANG, {
    applyTranslations: ({ language: appliedLanguage }) => {
      idiomaActual = appliedLanguage;
      return applyTranslations();
    },
  });
  translationsLoadedFor = idiomaActual;
}

function reportFindI18nFailure(err, { startup = false } = {}) {
  const transition = err && err.rendererI18nTransition;
  if (!transition) {
    return;
  }
  if (!startup && transition && transition.hadEstablishedState && !transition.restorationFailed) {
    log.error('Editor Find language transition failed; previous translation state remains authoritative:', err);
    return;
  }
  log.error('Editor Find i18n failure requires window closure:', err);
  reportTerminalFindI18nFailure(startup ? 'startup' : 'transition-restoration');
}

function reportTerminalFindI18nFailure(kind) {
  if (findI18nTerminal) return;
  findI18nTerminal = true;
  pendingFocusIntent = null;
  inputEl.disabled = true;
  replaceInputEl.disabled = true;
  prevEl.disabled = true;
  nextEl.disabled = true;
  replaceOneEl.disabled = true;
  replaceAllEl.disabled = true;
  toggleEl.disabled = true;
  closeEl.disabled = false;
  if (!window.editorFindAPI || typeof window.editorFindAPI.reportRendererI18nFailure !== 'function') {
    log.warn('editorFindAPI.reportRendererI18nFailure unavailable (ignored); closing failed renderer locally.');
    if (typeof window.close === 'function') window.close();
    return;
  }
  try {
    window.editorFindAPI.reportRendererI18nFailure({ kind });
  } catch (reportErr) {
    log.warn('editorFindAPI.reportRendererI18nFailure failed (ignored); closing failed renderer locally:', reportErr);
    if (typeof window.close === 'function') window.close();
  }
}

// =============================================================================
// Bridge command helpers
// =============================================================================
function focusRequestedTarget(target, selectAll = false) {
  const targetEl = target === 'replace' ? replaceInputEl : inputEl;
  if (!targetEl) return;

  try {
    targetEl.focus();
    if (selectAll && typeof targetEl.select === 'function') {
      targetEl.select();
    }
  } catch (err) {
    log.warnOnce(
      'editor-find.focusTarget.failed',
      'Unable to focus requested editor-find target (ignored):',
      err
    );
  }
}

function isFocusTargetUsable(target) {
  const targetEl = target === 'replace' ? replaceInputEl : inputEl;
  if (!targetEl || targetEl.disabled || targetEl.hidden) return false;
  if (target === 'replace' && (!findState.expanded || replaceRowEl.hidden)) {
    return false;
  }
  return true;
}

function applyPendingFocusIntent() {
  if (!pendingFocusIntent) return;
  if (!translationsLoadedFor || !findSemanticReady || findI18nTerminal) return;

  const { target, selectAll } = pendingFocusIntent;
  if (!isFocusTargetUsable(target)) return;

  pendingFocusIntent = null;
  focusRequestedTarget(target, selectAll);
}

function notifyReplaceTimeout() {
  if (findI18nTerminal) return;
  try {
    window.Notify.notifyEditor('renderer.editor.editor_find.replace_timeout', {
      type: 'error',
      duration: 5000,
    });
  } catch (err) {
    log.warn('editor-find: failed to show replace-timeout toast:', err);
  }
}

function handleReplaceResult(result) {
  if (findI18nTerminal) return;
  if (!result || typeof result !== 'object') return;
  if (result.status === 'timeout') {
    notifyReplaceTimeout();
  }
}

async function pushQuery() {
  try {
    await findApi.setQuery(inputEl.value || '');
  } catch (err) {
    log.errorOnce(
      'editor-find.setQuery.failed',
      'Error sending find query to main process:',
      err
    );
  }
}

async function runReplaceCurrent() {
  try {
    const result = await findApi.replaceCurrent(replaceInputEl.value || '');
    handleReplaceResult(result);
  } catch (err) {
    log.error('Error sending replace-current request to main process:', err);
  }
}

async function runReplaceAll() {
  try {
    const result = await findApi.replaceAll(replaceInputEl.value || '');
    handleReplaceResult(result);
  } catch (err) {
    log.error('Error sending replace-all request to main process:', err);
  }
}

// =============================================================================
// Language bootstrap helper
// =============================================================================
async function getInitialFindLanguage() {
  let language = DEFAULT_LANG;
  try {
    if (typeof findApi.getSettings !== 'function') {
      log.warn(
        'BOOTSTRAP: [editor-find] editorFindAPI.getSettings missing; using default language.'
      );
      return language;
    }

    const settings = await findApi.getSettings();
    if (settings && settings.language) {
      language = settings.language || language;
    }
  } catch (err) {
    log.warn(
      'BOOTSTRAP: [editor-find] editorFindAPI.getSettings failed; using default language.',
      err
    );
  }
  return language;
}

// =============================================================================
// UI event wiring
// =============================================================================
inputEl.maxLength = findInputMaxChars;
replaceInputEl.maxLength = findInputMaxChars;

inputEl.addEventListener('input', () => {
  if (!findSemanticReady || findI18nTerminal) return;
  pushQuery();
});

inputEl.addEventListener('keydown', (event) => {
  if (!findSemanticReady || findI18nTerminal) return;
  if (event.key !== 'Enter') return;
  event.preventDefault();
  if (event.shiftKey) {
    findApi.prev().catch((err) => log.error('Error on Shift+Enter prev:', err));
  } else {
    findApi.next().catch((err) => log.error('Error on Enter next:', err));
  }
});

toggleEl.addEventListener('click', () => {
  if (!findSemanticReady || findI18nTerminal) return;
  findApi.toggleExpanded().catch((err) => log.error('Error toggling find window mode:', err));
});

prevEl.addEventListener('click', () => {
  if (!findSemanticReady || findI18nTerminal) return;
  findApi.prev().catch((err) => log.error('Error navigating to previous match:', err));
});

nextEl.addEventListener('click', () => {
  if (!findSemanticReady || findI18nTerminal) return;
  findApi.next().catch((err) => log.error('Error navigating to next match:', err));
});

replaceOneEl.addEventListener('click', () => {
  if (!findSemanticReady || findI18nTerminal) return;
  runReplaceCurrent();
});

replaceAllEl.addEventListener('click', () => {
  if (!findSemanticReady || findI18nTerminal) return;
  runReplaceAll();
});

closeEl.addEventListener('click', () => {
  findApi.close().catch((err) => log.error('Error closing find window:', err));
});

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  findApi.close().catch((err) => log.error('Error closing find window:', err));
});

// =============================================================================
// Language transition serialization
// =============================================================================
function enqueueFindSemanticWork(work) {
  const run = async () => {
    // Window closure is coordinated asynchronously through the main process.
    // Do not admit queued Editor Find semantic work after terminal i18n failure.
    if (findI18nTerminal) return;
    return work();
  };
  findSemanticQueue = findSemanticQueue.then(run, run);
  return findSemanticQueue;
}

async function applyFindLanguage(language, { startup = false } = {}) {
  try {
    await transitionFindTranslations(language);
    return true;
  } catch (err) {
    reportFindI18nFailure(err, { startup });
    return false;
  }
}

function enqueueFindSettingsApplication(settings) {
  const run = async () => {
    const nextLang = settings && settings.language ? settings.language : '';
    if (!nextLang || nextLang === idiomaActual) return;
    await applyFindLanguage(nextLang);
  };
  // Preload listeners do not await async callbacks. Admit full settings
  // snapshots after the preceding root semantic operation has settled.
  return enqueueFindSemanticWork(run);
}

// =============================================================================
// Bridge subscriptions
// =============================================================================
findApi.onInit((payload) => {
  applyIncomingState(payload);
});

findApi.onState(applyIncomingState);

if (typeof findApi.onFocusTarget === 'function') {
  findApi.onFocusTarget((payload) => {
    if (findI18nTerminal) return;
    const target = payload && payload.target === 'replace' ? 'replace' : 'query';
    const selectAll = !!(payload && payload.selectAll);
    pendingFocusIntent = { target, selectAll };
    applyPendingFocusIntent();
  });
} else {
  log.warn(
    'BOOTSTRAP: [editor-find] editorFindAPI.onFocusTarget missing; focus-sync capability disabled.'
  );
}

if (typeof findApi.onSettingsChanged !== 'function') {
  log.error('BOOTSTRAP: editorFindAPI.onSettingsChanged unavailable; closing window before normal interaction.');
  reportTerminalFindI18nFailure('settings-listener');
} else {
  try {
    findApi.onSettingsChanged((settings) => enqueueFindSettingsApplication(settings));
  } catch (err) {
    log.error('BOOTSTRAP: editorFindAPI.onSettingsChanged registration failed; closing window before normal interaction:', err);
    reportTerminalFindI18nFailure('settings-listener');
  }
}

// =============================================================================
// Bootstrap sequence
// =============================================================================
(async () => {
  await enqueueFindSemanticWork(async () => {
    const language = await getInitialFindLanguage();
    if (!await applyFindLanguage(language, { startup: true })) {
      throw new Error('[editor-find] required renderer translation state could not be established during bootstrap');
    }
    projectMainStateIntoUi();
    applyPendingFocusIntent();
  });
})().catch((err) => {
  log.error('editor-find bootstrap failed:', err);
  reportFindI18nFailure(err, { startup: true });
});

// =============================================================================
// End of public/editor_find.js
// =============================================================================
