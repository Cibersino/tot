// public/language_window.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Render shipped language autonyms with filtering and keyboard navigation.
// - Read the current selection and available languages through languageAPI.
// - Keep the selected language separate from roving keyboard focus.
// - Apply a selection and close after the preload operation succeeds.
// - Attempt local closure after a first-run bootstrap failure so main can resolve startup language.

// =============================================================================
// Startup context, logger, and DOM references
// =============================================================================
const locationSearch = window.location && typeof window.location.search === 'string'
  ? window.location.search
  : '';
const isFirstRunLanguageChooser = /(?:^|[?&])languageChooserFirstRun=1(?:&|$)/.test(locationSearch);

// First-run bootstrap failure attempts to close this window so main can finish language resolution.
// See createLanguageWindow() in electron/main.js.
const closeFirstRunChooserAfterBootstrapFailure = () => {
  if (!isFirstRunLanguageChooser) return;
  try {
    window.close();
  } catch (error) {
    console.error('[language] failed to close first-run chooser after bootstrap failure:', error);
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
// Status IDs select pre-authored bilingual nodes in language_window.html.
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
let selectedLanguageId = '';

// =============================================================================
// Language list rendering and selection
// =============================================================================
const getItems = () => Array.from(langList.querySelectorAll('.lang-item'));

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
    return lang.label.toLowerCase().includes(query) || lang.id.toLowerCase().includes(query);
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
      lang.id === selectedLanguageId ? 'true' : 'false'
    );
    item.dataset.languageId = lang.id;
    item.dataset.index = String(index);

    const label = document.createElement('span');
    label.className = 'lang-label';
    label.setAttribute('lang', lang.localeTag);
    label.setAttribute('dir', 'auto');
    label.textContent = lang.label;

    const tag = document.createElement('bdi');
    tag.className = 'lang-tag';
    tag.setAttribute('dir', 'ltr');
    tag.textContent = lang.id;

    item.append(label, tag);
    langList.appendChild(item);
  });

  const selectedIndex = filteredLanguages.findIndex((lang) => {
    return lang.id === selectedLanguageId;
  });
  setRovingIndex(selectedIndex >= 0 ? selectedIndex : 0, false);
};

const selectLanguage = async (lang) => {
  if (!lang || isBusy) return;
  if (!window.languageAPI || typeof window.languageAPI.setLanguage !== 'function') {
    log.warn('setLanguage unavailable; language selection ignored.');
    setStatus(STATUS_IDS.SELECTION_ERROR, true);
    return;
  }

  setBusy(true, STATUS_IDS.APPLYING);
  try {
    const result = await window.languageAPI.setLanguage(lang);
    if (result && result.ok === true) window.close();
    else {
      setBusy(false);
      setStatus(STATUS_IDS.SELECTION_ERROR, true);
    }
  } catch (error) {
    log.error('Language selection request or window close failed:', error);
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
  selectLanguage(item.dataset.languageId);
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
      selectLanguage(items[currentIndex].dataset.languageId);
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
// Language data loading and bootstrap
// =============================================================================
const loadLanguages = async () => {
  try {
    if (!window.languageAPI || typeof window.languageAPI.getAvailableLanguages !== 'function') throw new Error('[language] getAvailableLanguages unavailable');
    const available = await window.languageAPI.getAvailableLanguages();
    if (!Array.isArray(available) || !available.length || available.some((language) => !language || typeof language.id !== 'string' || typeof language.label !== 'string' || typeof language.localeTag !== 'string')) throw new Error('[language] required language catalog list is invalid');
    languages = available;
  } catch (error) {
    log.error('BOOTSTRAP: required language catalog list unavailable; chooser cannot offer selections:', error);
    throw error;
  }

  if (selectedLanguageId && !languages.some((lang) => lang.id === selectedLanguageId)) {
    log.warn(
      'BOOTSTRAP: current language is not present in the available list; no option will be identified as selected:',
      selectedLanguageId
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
    const value = await window.languageAPI.getCurrentLanguage();
    return typeof value === 'string' ? value : '';
  } catch (error) {
    log.warn('BOOTSTRAP: getCurrentLanguage failed; current selection will not be identified:', error);
    return '';
  }
};

(async () => {
  try {
    selectedLanguageId = await loadCurrentLanguage();
    await loadLanguages();
    langFilter.focus();
  } catch (error) {
    log.error('BOOTSTRAP: language window initialization failed; closing because the required catalog is unavailable:', error);
    closeFirstRunChooserAfterBootstrapFailure();
  }
})();
// Main owns no-selection fallback during first-run startup; see createLanguageWindow() in electron/main.js.
// =============================================================================
// End of public/language_window.js
// =============================================================================
