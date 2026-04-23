/* global chrome */
'use strict';

const MESSAGE_GET_TAB_STATE = 'totTextToTime:getTabState';
const MESSAGE_SET_TAB_ENABLED = 'totTextToTime:setTabEnabled';

let activeTabId = null;

document.addEventListener('DOMContentLoaded', () => {
  initPopup();
});

async function initPopup() {
  const toggle = document.getElementById('tab-toggle');
  const status = document.getElementById('status');

  setStatus(status, 'Cargando...');
  toggle.disabled = true;

  activeTabId = await getActiveTabId();
  if (!Number.isInteger(activeTabId)) {
    setStatus(status, 'No hay pestana activa.');
    return;
  }

  const state = await sendRuntimeMessage({
    type: MESSAGE_GET_TAB_STATE,
    tabId: activeTabId,
  });

  toggle.checked = !state || state.enabled !== false;
  toggle.disabled = false;
  setStatus(status, '');

  toggle.addEventListener('change', async () => {
    toggle.disabled = true;
    setStatus(status, 'Actualizando...');

    const response = await sendRuntimeMessage({
      type: MESSAGE_SET_TAB_ENABLED,
      tabId: activeTabId,
      enabled: toggle.checked,
    });

    if (response && response.ok) {
      toggle.checked = response.enabled !== false;
      setStatus(status, '');
    } else {
      setStatus(status, 'No se pudo actualizar esta pestana.');
    }

    toggle.disabled = false;
  });
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
