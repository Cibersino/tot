/* global chrome */
'use strict';

const MESSAGE_GET_SITE_STATE = 'totTextToTime:getSiteState';
const MESSAGE_SET_SITE_ENABLED = 'totTextToTime:setSiteEnabled';

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
  desktopLinkLabel.textContent = getMessage('popupDesktopLink', 'App de escritorio completa');

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
