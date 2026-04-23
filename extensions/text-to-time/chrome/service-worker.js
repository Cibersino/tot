/* global chrome */
'use strict';

const MESSAGE_GET_TAB_STATE = 'totTextToTime:getTabState';
const MESSAGE_SET_TAB_ENABLED = 'totTextToTime:setTabEnabled';
const MESSAGE_TOGGLE_TAB_ENABLED = 'totTextToTime:toggleTabEnabled';
const MESSAGE_TAB_STATE_CHANGED = 'totTextToTime:tabStateChanged';
const COMMAND_TOGGLE_CURRENT_TAB = 'toggle-current-tab';
const TAB_STATE_KEY_PREFIX = 'totTextToTime.tabEnabled.';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') {
    return false;
  }

  if (message.type === MESSAGE_GET_TAB_STATE) {
    respondAsync(sendResponse, async () => {
      const tabId = await resolveTabId(message, sender);
      return { ok: true, enabled: await getTabEnabled(tabId), tabId };
    });
    return true;
  }

  if (message.type === MESSAGE_SET_TAB_ENABLED) {
    respondAsync(sendResponse, async () => {
      const tabId = await resolveTabId(message, sender);
      const enabled = message.enabled !== false;
      await setTabEnabled(tabId, enabled);
      notifyTabState(tabId, enabled);
      return { ok: true, enabled, tabId };
    });
    return true;
  }

  if (message.type === MESSAGE_TOGGLE_TAB_ENABLED) {
    respondAsync(sendResponse, async () => {
      const tabId = await resolveTabId(message, sender);
      const enabled = !(await getTabEnabled(tabId));
      await setTabEnabled(tabId, enabled);
      notifyTabState(tabId, enabled);
      return { ok: true, enabled, tabId };
    });
    return true;
  }

  return false;
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== COMMAND_TOGGLE_CURRENT_TAB) {
    return;
  }

  toggleCommandTab(tab).catch((err) => {
    console.error('Failed to toggle toT reading-time extension:', err);
  });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  removeTabState(tabId).catch((err) => {
    console.error('Failed to remove toT tab state:', err);
  });
});

async function toggleCommandTab(tab) {
  const tabId = tab && Number.isInteger(tab.id) ? tab.id : await getActiveTabId();
  if (!Number.isInteger(tabId)) {
    return;
  }

  const enabled = !(await getTabEnabled(tabId));
  await setTabEnabled(tabId, enabled);
  notifyTabState(tabId, enabled);
}

async function resolveTabId(message, sender) {
  if (sender && sender.tab && Number.isInteger(sender.tab.id)) {
    return sender.tab.id;
  }

  if (Number.isInteger(message.tabId)) {
    return message.tabId;
  }

  return getActiveTabId();
}

async function getActiveTabId() {
  const tabs = await tabsQuery({ active: true, currentWindow: true });
  const [activeTab] = tabs;
  return activeTab && Number.isInteger(activeTab.id) ? activeTab.id : null;
}

async function getTabEnabled(tabId) {
  if (!Number.isInteger(tabId)) {
    return true;
  }

  const key = tabStateKey(tabId);
  const result = await storageSessionGet({ [key]: true });
  return result[key] !== false;
}

async function setTabEnabled(tabId, enabled) {
  if (!Number.isInteger(tabId)) {
    return;
  }

  await storageSessionSet({ [tabStateKey(tabId)]: enabled !== false });
}

async function removeTabState(tabId) {
  if (!Number.isInteger(tabId)) {
    return;
  }

  await storageSessionRemove(tabStateKey(tabId));
}

function notifyTabState(tabId, enabled) {
  if (!Number.isInteger(tabId)) {
    return;
  }

  chrome.tabs.sendMessage(
    tabId,
    { type: MESSAGE_TAB_STATE_CHANGED, enabled: enabled !== false },
    () => {
      void chrome.runtime.lastError;
    }
  );
}

function tabStateKey(tabId) {
  return `${TAB_STATE_KEY_PREFIX}${tabId}`;
}

function respondAsync(sendResponse, task) {
  task()
    .then(sendResponse)
    .catch((err) => {
      console.error('toT extension message failed:', err);
      sendResponse({ ok: false });
    });
}

function storageSessionGet(defaults) {
  return new Promise((resolve, reject) => {
    chrome.storage.session.get(defaults, (result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(result || defaults);
    });
  });
}

function storageSessionSet(values) {
  return new Promise((resolve, reject) => {
    chrome.storage.session.set(values, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve();
    });
  });
}

function storageSessionRemove(key) {
  return new Promise((resolve, reject) => {
    chrome.storage.session.remove(key, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve();
    });
  });
}

function tabsQuery(queryInfo) {
  return new Promise((resolve, reject) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(tabs || []);
    });
  });
}
