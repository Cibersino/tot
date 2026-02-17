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

const log = window.getLogger('editor-find');
log.debug('Editor find window starting...');

const { AppConstants } = window;
if (!AppConstants) {
  throw new Error('[editor-find] AppConstants no disponible; verifica la carga de constants.js');
}
const { DEFAULT_LANG } = AppConstants;

const { loadRendererTranslations, tRenderer } = window.RendererI18n || {};
if (!loadRendererTranslations || !tRenderer) {
  throw new Error('[editor-find] RendererI18n no disponible; no se puede continuar');
}

const tr = (path, fallback) => tRenderer(path, fallback);
const editorFindAPI = window.editorFindAPI;
if (!editorFindAPI) {
  throw new Error('[editor-find] editorFindAPI no disponible; verifica editor_find_preload.js');
}

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
    await editorFindAPI.setQuery(inputEl.value || '');
  } catch (err) {
    log.error('Error sending find query to main process:', err);
  }
}

async function initLanguage() {
  try {
    if (typeof editorFindAPI.getSettings !== 'function') {
      log.warnOnce(
        'editor-find.getSettings.missing',
        '[editor-find] editorFindAPI.getSettings missing; using default language.'
      );
      return;
    }

    const settings = await editorFindAPI.getSettings();
    if (settings && settings.language) {
      idiomaActual = settings.language || idiomaActual;
    }
  } catch (err) {
    log.warnOnce(
      'editor-find.getSettings.failed',
      '[editor-find] editorFindAPI.getSettings failed; using default language.',
      err
    );
  }
}

inputEl.addEventListener('input', () => {
  pushQuery();
});

inputEl.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  if (event.shiftKey) {
    editorFindAPI.prev().catch((err) => log.error('Error on Shift+Enter prev:', err));
  } else {
    editorFindAPI.next().catch((err) => log.error('Error on Enter next:', err));
  }
});

prevEl.addEventListener('click', () => {
  editorFindAPI.prev().catch((err) => log.error('Error navigating to previous match:', err));
});

nextEl.addEventListener('click', () => {
  editorFindAPI.next().catch((err) => log.error('Error navigating to next match:', err));
});

closeEl.addEventListener('click', () => {
  editorFindAPI.close().catch((err) => log.error('Error closing find window:', err));
});

editorFindAPI.onInit((payload) => {
  applyIncomingState(payload);
});

editorFindAPI.onState(applyIncomingState);

editorFindAPI.onFocusQuery((payload) => {
  const selectAll = !!(payload && payload.selectAll);
  focusQuery(selectAll);
});

editorFindAPI.onSettingsChanged(async (settings) => {
  try {
    const nextLang = settings && settings.language ? settings.language : '';
    if (!nextLang || nextLang === idiomaActual) return;
    idiomaActual = nextLang;
    await applyTranslations();
  } catch (err) {
    log.warn('editor-find: failed to apply settings update:', err);
  }
});

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
