// public/language_window.js
'use strict';

const log = window.getLogger ? window.getLogger('language') : console;
const langFilter = document.getElementById('langFilter');
const langList = document.getElementById('langList');
const statusLine = document.getElementById('statusLine');

// Local fallback duplicates the manifest list in case IPC fails.
const fallbackLanguages = [
  { tag: 'es', label: 'Español' },
  { tag: 'en', label: 'English' },
];

let languages = [];
let filteredLanguages = [];
let focusedIndex = -1;
let isBusy = false;

const getItems = () => Array.from(langList.querySelectorAll('.lang-item'));

const setStatus = (message, isError = false) => {
  statusLine.textContent = message || '';
  statusLine.classList.toggle('is-error', isError);
};

const setBusy = (busy, message) => {
  isBusy = busy;
  langFilter.disabled = busy;
  langList.classList.toggle('is-disabled', busy);
  langList.setAttribute('aria-disabled', busy ? 'true' : 'false');
  if (message !== undefined) {
    setStatus(message, false);
  }
};

const setFocusedIndex = (index, shouldFocus = true) => {
  const items = getItems();
  if (!items.length) {
    focusedIndex = -1;
    return;
  }
  const bounded = Math.max(0, Math.min(index, items.length - 1));
  items.forEach((item, i) => {
    const selected = i === bounded;
    item.setAttribute('tabindex', selected ? '0' : '-1');
    item.setAttribute('aria-selected', selected ? 'true' : 'false');
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
    const empty = document.createElement('div');
    empty.className = 'lang-empty';
    empty.setAttribute('role', 'option');
    empty.setAttribute('aria-disabled', 'true');
    empty.textContent = 'No matches';
    langList.appendChild(empty);
    return;
  }

  filteredLanguages.forEach((lang, index) => {
    const item = document.createElement('div');
    item.className = 'lang-item';
    item.setAttribute('role', 'option');
    item.setAttribute('tabindex', '-1');
    item.setAttribute('aria-selected', 'false');
    item.dataset.tag = lang.tag;
    item.dataset.index = String(index);

    const label = document.createElement('span');
    label.className = 'lang-label';
    label.textContent = lang.label;

    const tag = document.createElement('span');
    tag.className = 'lang-tag';
    tag.textContent = lang.tag;

    item.append(label, tag);
    langList.appendChild(item);
  });
};

const selectLanguage = async (lang) => {
  if (!lang || isBusy) return;

  setBusy(true, 'Applying language...');
  try {
    await window.languageAPI.setLanguage(lang);
    window.close();
  } catch (e) {
    log.error('Error setLanguage:', e);
    setBusy(false);
    setStatus('Unable to set language. Try again.', true);
  }
};

langFilter.addEventListener('input', () => {
  if (isBusy) return;
  setStatus('');
  renderList();
});

langFilter.addEventListener('keydown', (event) => {
  if (event.key === 'ArrowDown') {
    const items = getItems();
    if (!items.length || isBusy) return;
    event.preventDefault();
    setFocusedIndex(0);
  }
});

langList.addEventListener('click', (event) => {
  if (isBusy) return;
  const item = event.target.closest('.lang-item');
  if (!item) return;
  const index = Number(item.dataset.index);
  setFocusedIndex(index, false);
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
    setFocusedIndex(nextIndex);
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    nextIndex = Math.max((currentIndex >= 0 ? currentIndex - 1 : 0), 0);
    setFocusedIndex(nextIndex);
  } else if (event.key === 'Enter') {
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
    focusedIndex = index;
  }
});

const loadLanguages = async () => {
  let available = [];
  let fallbackLogged = false;

  try {
    if (window.languageAPI && typeof window.languageAPI.getAvailableLanguages === 'function') {
      available = await window.languageAPI.getAvailableLanguages();
    } else {
      throw new Error('getAvailableLanguages unavailable');
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
    languages = fallbackLanguages.slice();
  }

  filteredLanguages = languages.slice();
  renderList();
};

(async () => {
  try {
    await loadLanguages();
  } catch (e) {
    log.error('BOOTSTRAP: loadLanguages failed; falling back to local list:', e);
    languages = fallbackLanguages.slice();
    filteredLanguages = languages.slice();
    renderList();
  }
})();
// Note: If the user closes the window without selecting anything, main applies fallback only if settings.language is empty.
