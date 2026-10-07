// public/language_window.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Render a language list with search and keyboard navigation.
// - Fetch available languages via the preload-exposed API.
// - Apply a selected language and close the window on success.
// - Maintain busy/disabled UI state during async actions.
// - Fall back to a local list when IPC data is unavailable.

// =============================================================================
// Logger and DOM references
// =============================================================================
const locationSearch = window.location && typeof window.location.search === 'string'
  ? window.location.search
  : '';
const isFirstRunLanguageChooser = /(?:^|[?&])languageChooserFirstRun=1(?:&|$)/.test(locationSearch);

const closeFirstRunChooserAfterBootstrapFailure = () => {
  if (!isFirstRunLanguageChooser) return;
  try {
    window.close();
  } catch (closeError) {
    console.error('[language] failed to close first-run chooser after bootstrap failure:', closeError);
  }
};

if (typeof window.getLogger !== 'function') {
  const error = new Error('[language] window.getLogger unavailable; cannot continue');
  console.error(error);
  closeFirstRunChooserAfterBootstrapFailure();
  throw error;
}
let log;
try {
  log = window.getLogger('language');
} catch (error) {
  console.error('[language] window.getLogger failed; cannot continue:', error);
  closeFirstRunChooserAfterBootstrapFailure();
  throw error;
}
log.debug('Language window starting...');
const langFilter = document.getElementById('langFilter');
const langList = document.getElementById('langList');
const statusLine = document.getElementById('statusLine');
const statusNodes = Object.freeze({
  noMatches: document.getElementById('languageStatusNoMatches'),
  applying: document.getElementById('languageStatusApplying'),
  selectionError: document.getElementById('languageStatusSelectionError'),
});

if (!langFilter || !langList) {
  const error = new Error('[language] required language chooser controls unavailable; cannot continue');
  log.error('Language chooser bootstrap failed:', error);
  closeFirstRunChooserAfterBootstrapFailure();
  throw error;
}

// =============================================================================
// Constants and shared state
// =============================================================================
// Minimal local Spanish/English autonym fallback used when the manifest cannot provide a valid language list.
const FALLBACK_LANGUAGES = Object.freeze([
  Object.freeze({ tag: 'es', label: 'Español' }),
  Object.freeze({ tag: 'en', label: 'English' }),
]);
const STATUS_IDS = Object.freeze({
  NONE: '',
  NO_MATCHES: 'noMatches',
  APPLYING: 'applying',
  SELECTION_ERROR: 'selectionError',
});

let languages = [];
let filteredLanguages = [];
let focusedIndex = -1;
let isBusy = false;
let selectedLanguageTag = '';

// =============================================================================
// Helpers
// =============================================================================
const getItems = () => Array.from(langList.querySelectorAll('.lang-item'));

const normalizeLanguageTag = (value) => {
  return String(value || '').trim().toLowerCase().replace(/_/g, '-');
};

const setStatus = (statusId = STATUS_IDS.NONE, isError = false) => {
  if (statusId && !Object.prototype.hasOwnProperty.call(statusNodes, statusId)) {
    throw new Error(`[language] Unknown status identifier: ${statusId}`);
  }
  Object.entries(statusNodes).forEach(([id, node]) => {
    node.hidden = id !== statusId;
  });
  statusLine.classList.toggle('is-error', isError);
};

const setBusy = (busy, statusId) => {
  isBusy = busy;
  langFilter.disabled = busy;
  langList.classList.toggle('is-disabled', busy);
  langList.setAttribute('aria-disabled', busy ? 'true' : 'false');
  if (statusId !== undefined) {
    setStatus(statusId, false);
  }
};

const setRovingIndex = (index, shouldFocus = true) => {
  const items = getItems();
  if (!items.length) {
    focusedIndex = -1;
    return;
  }
  const bounded = Math.max(0, Math.min(index, items.length - 1));
  items.forEach((item, i) => {
    item.setAttribute('tabindex', i === bounded ? '0' : '-1');
  });
  focusedIndex = bounded;
  if (shouldFocus) {
    items[bounded].focus();
  }
};

const renderList = () => {
  const query = langFilter.value.trim().toLowerCase();
  filteredLanguages = languages.filter((lang) => {
    return lang.label.toLowerCase().includes(query) || lang.tag.toLowerCase().includes(query);
  });

  langList.innerHTML = '';
  focusedIndex = -1;

  if (!filteredLanguages.length) {
    setStatus(STATUS_IDS.NO_MATCHES);
    return;
  }

  filteredLanguages.forEach((lang, index) => {
    const item = document.createElement('div');
    item.className = 'lang-item';
    item.setAttribute('role', 'option');
    item.setAttribute('tabindex', '-1');
    item.setAttribute(
      'aria-selected',
      normalizeLanguageTag(lang.tag) === selectedLanguageTag ? 'true' : 'false'
    );
    item.dataset.tag = lang.tag;
    item.dataset.index = String(index);

    const label = document.createElement('span');
    label.className = 'lang-label';
    label.setAttribute('lang', lang.tag);
    label.setAttribute('dir', 'auto');
    label.textContent = lang.label;

    const tag = document.createElement('bdi');
    tag.className = 'lang-tag';
    tag.setAttribute('dir', 'ltr');
    tag.textContent = lang.tag;

    item.append(label, tag);
    langList.appendChild(item);
  });

  const selectedIndex = filteredLanguages.findIndex((lang) => {
    return normalizeLanguageTag(lang.tag) === selectedLanguageTag;
  });
  setRovingIndex(selectedIndex >= 0 ? selectedIndex : 0, false);
};

const selectLanguage = async (lang) => {
  if (!lang || isBusy) return;
  if (!window.languageAPI || typeof window.languageAPI.setLanguage !== 'function') {
    log.warnOnce('language_window.api.setLanguage.unavailable', 'setLanguage unavailable; language selection ignored.');
    setStatus(STATUS_IDS.SELECTION_ERROR, true);
    return;
  }

  setBusy(true, STATUS_IDS.APPLYING);
  try {
    await window.languageAPI.setLanguage(lang);
    window.close();
  } catch (e) {
    log.error('Error setLanguage:', e);
    setBusy(false);
    setStatus(STATUS_IDS.SELECTION_ERROR, true);
  }
};

// =============================================================================
// Event wiring
// =============================================================================
langFilter.addEventListener('input', () => {
  if (isBusy) return;
  setStatus(STATUS_IDS.NONE);
  renderList();
});

langFilter.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown') {
    const items = getItems();
    if (!items.length || isBusy) return;
    event.preventDefault();
    setRovingIndex(focusedIndex >= 0 ? focusedIndex : 0);
  }
});

langList.addEventListener('click', (event) => {
  if (isBusy) return;
  const item = event.target.closest('.lang-item');
  if (!item) return;
  const index = Number(item.dataset.index);
  setRovingIndex(index, false);
  selectLanguage(item.dataset.tag);
});

langList.addEventListener('keydown', (event) => {
  if (isBusy) return;
  const items = getItems();
  if (!items.length) return;

  const currentIndex = focusedIndex >= 0 ? focusedIndex : items.indexOf(document.activeElement);
  let nextIndex = currentIndex;

  if (event.key === 'ArrowDown') {
    event.preventDefault();
    nextIndex = Math.min((currentIndex >= 0 ? currentIndex + 1 : 0), items.length - 1);
    setRovingIndex(nextIndex);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    nextIndex = Math.max((currentIndex >= 0 ? currentIndex - 1 : 0), 0);
    setRovingIndex(nextIndex);
  } else if (event.key === 'Home') {
    event.preventDefault();
    setRovingIndex(0);
  } else if (event.key === 'End') {
    event.preventDefault();
    setRovingIndex(items.length - 1);
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    if (currentIndex >= 0 && items[currentIndex]) {
      selectLanguage(items[currentIndex].dataset.tag);
    }
  }
});

langList.addEventListener('focusin', (event) => {
  const item = event.target.closest('.lang-item');
  if (!item) return;
  const index = Number(item.dataset.index);
  if (!Number.isNaN(index)) {
    setRovingIndex(index, false);
  }
});

// =============================================================================
// Data loading and bootstrap
// =============================================================================
const loadLanguages = async () => {
  let available = [];
  let fallbackLogged = false;

  try {
    if (window.languageAPI && typeof window.languageAPI.getAvailableLanguages === 'function') {
      available = await window.languageAPI.getAvailableLanguages();
    } else {
      throw new Error('[language] getAvailableLanguages unavailable');
    }
  } catch (e) {
    fallbackLogged = true;
    log.warn('BOOTSTRAP: getAvailableLanguages failed; falling back to local list:', e);
  }

  if (Array.isArray(available) && available.length) {
    languages = available;
  } else {
    if (!fallbackLogged) {
      log.warn('BOOTSTRAP: getAvailableLanguages returned empty/invalid; falling back to local list.');
    }
    languages = FALLBACK_LANGUAGES.slice();
  }

  if (selectedLanguageTag && !languages.some((lang) => {
    return normalizeLanguageTag(lang.tag) === selectedLanguageTag;
  })) {
    log.warn(
      'BOOTSTRAP: current language is not present in the available list; no option will be identified as selected:',
      selectedLanguageTag
    );
  }

  filteredLanguages = languages.slice();
  renderList();
};

const loadCurrentLanguage = async () => {
  if (!window.languageAPI || typeof window.languageAPI.getCurrentLanguage !== 'function') {
    log.warn('BOOTSTRAP: getCurrentLanguage unavailable; current selection will not be identified.');
    return '';
  }

  try {
    return normalizeLanguageTag(await window.languageAPI.getCurrentLanguage());
  } catch (e) {
    log.warn('BOOTSTRAP: getCurrentLanguage failed; current selection will not be identified:', e);
    return '';
  }
};

(async () => {
  try {
    selectedLanguageTag = await loadCurrentLanguage();
    await loadLanguages();
    langFilter.focus();
  } catch (e) {
    log.error('BOOTSTRAP: loadLanguages failed; falling back to local list:', e);
    languages = FALLBACK_LANGUAGES.slice();
    selectedLanguageTag = '';
    filteredLanguages = languages.slice();
    renderList();
    langFilter.focus();
  }
})();
// Note: If the user closes the window without selecting anything, main applies fallback only if settings.language is empty.
// =============================================================================
// End of public/language_window.js
// =============================================================================
