/* global chrome */
'use strict';

const Logic = globalThis.TotTextToTimeLogic;
const { CONSTANTS, parseWpm } = Logic;

const MESSAGE_GET_SITE_STATE = 'totTextToTime:getSiteState';
const MESSAGE_SET_SITE_ENABLED = 'totTextToTime:setSiteEnabled';
const STORAGE_WPM_KEY = 'totTextToTime.wpm';

let activeTabId = null;
let lastKnownEnabled = false;

document.addEventListener('DOMContentLoaded', () => {
  initPopup();
});

async function initPopup() {
  const toggle = document.getElementById('tab-toggle');
  const subtitle = document.getElementById('subtitle');
  const toggleLabel = document.getElementById('toggle-label');
  const hint = document.getElementById('hint');
  const wpmLabel = document.getElementById('wpm-label');
  const wpmHint = document.getElementById('wpm-hint');
  const wpmInput = document.getElementById('wpm-input');
  const wpmStatus = document.getElementById('wpm-status');
  const desktopLinkLabel = document.getElementById('desktop-link-label');
  const status = document.getElementById('status');
  const siteStateUnavailableStatus = getMessage(
    'popupSiteStateUnavailableStatus',
    'No se pudo resolver el estado de este sitio.'
  );

  document.documentElement.lang = chrome.i18n.getUILanguage().split('-')[0] || 'es';
  subtitle.textContent = getMessage('popupSubtitle', 'Tiempo de lectura');
  toggleLabel.textContent = getMessage('popupToggleLabel', 'Activado en este sitio');
  hint.textContent = getMessage(
    'popupHint',
    'Selecciona texto en una página para ver el tiempo estimado.'
  );
  wpmLabel.textContent = getMessage('popupWpmLabel', 'WPM');
  wpmHint.textContent = getMessage(
    'popupWpmHint',
    'Cambia tu velocidad de lectura para futuros cálculos.'
  );
  desktopLinkLabel.textContent = getMessage('popupDesktopLink', 'App de escritorio completa');
  wpmInput.value = String(await readStoredWpm());
  bindWpmEditor(wpmInput, wpmStatus);

  setStatus(status, getMessage('popupLoadingStatus', 'Cargando...'));
  toggle.disabled = true;

  activeTabId = await getActiveTabId();
  if (!Number.isInteger(activeTabId)) {
    applyUnresolvedState(
      toggle,
      status,
      getMessage('popupNoActiveTabStatus', 'No hay sitio activo.')
    );
    return;
  }

  const state = await sendRuntimeMessage({
    type: MESSAGE_GET_SITE_STATE,
    tabId: activeTabId,
  });

  if (!state || state.ok !== true || state.available !== true) {
    applyUnresolvedState(toggle, status, siteStateUnavailableStatus);
    return;
  }

  lastKnownEnabled = state.enabled !== false;
  applyResolvedState(toggle, lastKnownEnabled);
  setStatus(status, '');

  toggle.addEventListener('change', async () => {
    const previousEnabled = lastKnownEnabled;
    toggle.disabled = true;
    setStatus(status, getMessage('popupUpdatingStatus', 'Actualizando...'));

    const response = await sendRuntimeMessage({
      type: MESSAGE_SET_SITE_ENABLED,
      tabId: activeTabId,
      enabled: toggle.checked,
    });

    if (response && response.ok && response.available === true) {
      lastKnownEnabled = response.enabled !== false;
      applyResolvedState(toggle, lastKnownEnabled);
      setStatus(status, '');
      return;
    }

    if (response && response.available === false) {
      applyUnresolvedState(toggle, status, siteStateUnavailableStatus);
      return;
    }

    applyResolvedState(toggle, previousEnabled);
    setStatus(
      status,
      getMessage('popupUpdateFailedStatus', 'No se pudo actualizar este sitio.')
    );
  });
}

function applyResolvedState(toggle, enabled) {
  toggle.indeterminate = false;
  toggle.checked = enabled === true;
  toggle.disabled = false;
}

function applyUnresolvedState(toggle, status, message) {
  toggle.indeterminate = true;
  toggle.checked = false;
  toggle.disabled = true;
  setStatus(status, message);
}

function setStatus(status, message) {
  status.textContent = message;
}

function bindWpmEditor(wpmInput, wpmStatus) {
  const invalidText = getMessage(
    'popupWpmInvalid',
    'WPM debe ser un entero entre 10 y 700.'
  );
  const savedText = getMessage('popupWpmSaved', 'WPM guardado.');
  const saveFailedText = getMessage(
    'popupWpmSaveFailed',
    'No se pudo guardar este WPM.'
  );

  let lastPersistedWpm = wpmInput.value;

  wpmInput.addEventListener('input', async () => {
    const rawValue = wpmInput.value;
    const parsed = parseWpm(rawValue);

    if (!rawValue.trim()) {
      setWpmStatus(wpmStatus, invalidText, true);
      wpmInput.classList.add('is-invalid');
      return;
    }

    if (!parsed.ok) {
      setWpmStatus(wpmStatus, invalidText, true);
      wpmInput.classList.add('is-invalid');
      return;
    }

    wpmInput.classList.remove('is-invalid');

    if (String(parsed.value) === String(lastPersistedWpm)) {
      setWpmStatus(wpmStatus, '', false);
      return;
    }

    const nextWpm = String(parsed.value);

    try {
      await storageLocalSet({ [STORAGE_WPM_KEY]: parsed.value });
      lastPersistedWpm = nextWpm;
      setWpmStatus(wpmStatus, savedText, false);
    } catch (_err) {
      setWpmStatus(wpmStatus, saveFailedText, true);
    }
  });

  wpmInput.addEventListener('blur', async () => {
    const parsed = parseWpm(wpmInput.value);
    if (!parsed.ok) {
      const storedWpm = await readStoredWpm();
      lastPersistedWpm = String(storedWpm);
      wpmInput.value = lastPersistedWpm;
      wpmInput.classList.remove('is-invalid');
      setWpmStatus(wpmStatus, '', false);
      return;
    }

    wpmInput.value = String(parsed.value);
  });

  wpmInput.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter') {
      const parsed = parseWpm(wpmInput.value);
      if (!parsed.ok) {
        event.preventDefault();
        return;
      }

      wpmInput.value = String(parsed.value);
      wpmInput.blur();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      const storedWpm = await readStoredWpm();
      lastPersistedWpm = String(storedWpm);
      wpmInput.value = lastPersistedWpm;
      wpmInput.classList.remove('is-invalid');
      setWpmStatus(wpmStatus, '', false);
      wpmInput.select();
    }
  });
}

function setWpmStatus(statusElement, message, isInvalid) {
  statusElement.textContent = message;
  statusElement.classList.toggle('is-invalid', isInvalid === true);
}

function getActiveTabId() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      const [activeTab] = tabs || [];
      resolve(activeTab && Number.isInteger(activeTab.id) ? activeTab.id : null);
    });
  });
}

function readStoredWpm() {
  return new Promise((resolve) => {
    chrome.storage.local.get({ [STORAGE_WPM_KEY]: CONSTANTS.DEFAULT_WPM }, (result) => {
      if (chrome.runtime.lastError) {
        resolve(CONSTANTS.DEFAULT_WPM);
        return;
      }

      const parsed = parseWpm(result[STORAGE_WPM_KEY]);
      resolve(parsed.ok ? parsed.value : CONSTANTS.DEFAULT_WPM);
    });
  });
}

function storageLocalSet(values) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(values, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve();
    });
  });
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }

      resolve(response || null);
    });
  });
}

function getMessage(key, fallback) {
  if (!chrome.i18n || typeof chrome.i18n.getMessage !== 'function') {
    return fallback;
  }

  return chrome.i18n.getMessage(key) || fallback;
}
