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

const { AppConstants } = window;
if (!AppConstants) {
  throw new Error('[editor-find] AppConstants unavailable; verify constants.js is loaded.');
}
const { DEFAULT_LANG } = AppConstants;

const { loadRendererTranslations, tRenderer } = window.RendererI18n || {};
if (!loadRendererTranslations || !tRenderer) {
  throw new Error('[editor-find] RendererI18n unavailable; cannot continue.');
}

const tr = (path, fallback) => tRenderer(path, fallback);
const findApi = window.editorFindAPI;
if (!findApi) {
  throw new Error('[editor-find] editorFindAPI unavailable; verify editor_find_preload.js.');
}
if (
  typeof findApi.setQuery !== 'function' ||
  typeof findApi.next !== 'function' ||
  typeof findApi.prev !== 'function' ||
  typeof findApi.close !== 'function' ||
  typeof findApi.onInit !== 'function' ||
  typeof findApi.onState !== 'function'
) {
  throw new Error('[editor-find] editorFindAPI required methods unavailable; cannot continue.');
}

// =============================================================================
// DOM references and shared state
// =============================================================================
const labelEl = document.getElementById('findLabel');
const inputEl = document.getElementById('findQuery');
const prevEl = document.getElementById('findPrev');
const nextEl = document.getElementById('findNext');
const closeEl = document.getElementById('findClose');
const statusEl = document.getElementById('findStatus');

if (!labelEl || !inputEl || !prevEl || !nextEl || !closeEl || !statusEl) {
  throw new Error('[editor-find] Missing required DOM elements');
}

let idiomaActual = DEFAULT_LANG;
let translationsLoadedFor = null;

const findState = {
  query: '',
  matches: 0,
  activeMatchOrdinal: 0,
  finalUpdate: true,
};

// =============================================================================
// State and UI helpers
// =============================================================================
function applyIncomingState(payload) {
  normalizeState(payload);
  applyUiState();
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
}

async function ensureTranslations(lang) {
  const target = (lang || '').toLowerCase() || DEFAULT_LANG;
  if (translationsLoadedFor === target) return;
  await loadRendererTranslations(target);
  translationsLoadedFor = target;
}

function resolveStatusText() {
  if (!findState.query) {
    return tr('renderer.editor_find.status_empty_query', statusEl.textContent || '');
  }
  if (findState.matches <= 0) {
    return tr('renderer.editor_find.status_no_matches', statusEl.textContent || '');
  }
  const current = Math.max(1, Math.min(findState.activeMatchOrdinal || 1, findState.matches));
  return `${current}/${findState.matches}`;
}

function applyUiState() {
  if (inputEl.value !== findState.query) {
    inputEl.value = findState.query;
  }

  const hasQuery = findState.query.length > 0;
  prevEl.disabled = !hasQuery;
  nextEl.disabled = !hasQuery;
  statusEl.textContent = resolveStatusText();
}

async function applyTranslations() {
  await ensureTranslations(idiomaActual);

  const title = tr('renderer.editor_find.label', document.title || 'Find');
  document.title = title;
  labelEl.textContent = title;

  inputEl.placeholder = tr('renderer.editor_find.input_placeholder', inputEl.placeholder || '');
  inputEl.setAttribute('aria-label', tr('renderer.editor_find.input_aria', inputEl.getAttribute('aria-label') || ''));

  prevEl.textContent = tr('renderer.editor_find.prev', prevEl.textContent || '');
  nextEl.textContent = tr('renderer.editor_find.next', nextEl.textContent || '');
  closeEl.textContent = tr('renderer.editor_find.close', closeEl.textContent || '');

  prevEl.title = tr('renderer.editor_find.prev_title', prevEl.title || prevEl.textContent || '');
  nextEl.title = tr('renderer.editor_find.next_title', nextEl.title || nextEl.textContent || '');
  closeEl.title = tr('renderer.editor_find.close_title', closeEl.title || closeEl.textContent || '');

  applyUiState();
}

// =============================================================================
// Focus and bridge command helpers
// =============================================================================
function focusQuery(selectAll = false) {
  try {
    inputEl.focus();
    if (selectAll && typeof inputEl.select === 'function') {
      inputEl.select();
    }
  } catch (err) {
    log.warnOnce(
      'editor-find.focusQuery.failed',
      'Unable to focus/select find query input (ignored):',
      err
    );
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

// =============================================================================
// Language bootstrap helper
// =============================================================================
async function initLanguage() {
  try {
    if (typeof findApi.getSettings !== 'function') {
      log.warnOnce(
        'BOOTSTRAP:editor-find.getSettings.missing',
        'BOOTSTRAP: [editor-find] editorFindAPI.getSettings missing; using default language.'
      );
      return;
    }

    const settings = await findApi.getSettings();
    if (settings && settings.language) {
      idiomaActual = settings.language || idiomaActual;
    }
  } catch (err) {
    log.warnOnce(
      'BOOTSTRAP:editor-find.getSettings.failed',
      'BOOTSTRAP: [editor-find] editorFindAPI.getSettings failed; using default language.',
      err
    );
  }
}

// =============================================================================
// UI event wiring
// =============================================================================
inputEl.addEventListener('input', () => {
  pushQuery();
});

inputEl.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  if (event.shiftKey) {
    findApi.prev().catch((err) => log.error('Error on Shift+Enter prev:', err));
  } else {
    findApi.next().catch((err) => log.error('Error on Enter next:', err));
  }
});

prevEl.addEventListener('click', () => {
  findApi.prev().catch((err) => log.error('Error navigating to previous match:', err));
});

nextEl.addEventListener('click', () => {
  findApi.next().catch((err) => log.error('Error navigating to next match:', err));
});

closeEl.addEventListener('click', () => {
  findApi.close().catch((err) => log.error('Error closing find window:', err));
});

// =============================================================================
// Bridge subscriptions
// =============================================================================
findApi.onInit((payload) => {
  applyIncomingState(payload);
});

findApi.onState(applyIncomingState);

if (typeof findApi.onFocusQuery === 'function') {
  findApi.onFocusQuery((payload) => {
    const selectAll = !!(payload && payload.selectAll);
    focusQuery(selectAll);
  });
} else {
  log.warnOnce(
    'BOOTSTRAP:editor-find.onFocusQuery.missing',
    'BOOTSTRAP: [editor-find] editorFindAPI.onFocusQuery missing; focus-sync capability disabled.'
  );
}

if (typeof findApi.onSettingsChanged === 'function') {
  findApi.onSettingsChanged(async (settings) => {
    try {
      const nextLang = settings && settings.language ? settings.language : '';
      if (!nextLang || nextLang === idiomaActual) return;
      idiomaActual = nextLang;
      await applyTranslations();
    } catch (err) {
      log.warn('editor-find: failed to apply settings update:', err);
    }
  });
} else {
  log.warnOnce(
    'BOOTSTRAP:editor-find.onSettingsChanged.missing',
    'BOOTSTRAP: [editor-find] editorFindAPI.onSettingsChanged missing; live language updates disabled.'
  );
}

// =============================================================================
// Bootstrap sequence
// =============================================================================
(async () => {
  await initLanguage();
  await applyTranslations();
  applyUiState();
  focusQuery(true);
})().catch((err) => {
  log.error('editor-find bootstrap failed:', err);
});

// =============================================================================
// End of public/editor_find.js
// =============================================================================
