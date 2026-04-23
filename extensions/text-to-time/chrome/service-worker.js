/* global chrome */
'use strict';

const MESSAGE_GET_SITE_STATE = 'totTextToTime:getSiteState';
const MESSAGE_SET_SITE_ENABLED = 'totTextToTime:setSiteEnabled';
const MESSAGE_SITE_STATE_CHANGED = 'totTextToTime:siteStateChanged';
const MESSAGE_GET_PAGE_ORIGIN = 'totTextToTime:getPageOrigin';
const COMMAND_TOGGLE_CURRENT_TAB = 'toggle-current-tab';
const DISABLED_ORIGINS_STORAGE_KEY = 'totTextToTime.disabledOrigins';
const ORIGIN_RESOLVE_TIMEOUT_MS = 1000;
const ORIGIN_RESOLVE_RETRY_DELAY_MS = 100;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message.type !== 'string') {
    return false;
  }

  if (message.type === MESSAGE_GET_SITE_STATE) {
    respondAsync(sendResponse, async () => {
      const tabId = await resolveTabId(message, sender);
      return getSiteState(tabId);
    });
    return true;
  }

  if (message.type === MESSAGE_SET_SITE_ENABLED) {
    respondAsync(sendResponse, async () => {
      const tabId = await resolveTabId(message, sender);
      const origin = await resolveTabOrigin(tabId);
      if (!origin) {
        return unavailableSiteState();
      }

      const enabled = message.enabled !== false;
      await setSiteEnabled(origin, enabled);
      await notifyOriginState(origin, enabled);
      return { ok: true, available: true, enabled };
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

async function toggleCommandTab(tab) {
  const tabId = tab && Number.isInteger(tab.id) ? tab.id : await getActiveTabId();
  if (!Number.isInteger(tabId)) {
    return;
  }

  const origin = await resolveTabOrigin(tabId);
  if (!origin) {
    return;
  }

  const enabled = !(await isSiteEnabled(origin));
  await setSiteEnabled(origin, enabled);
  await notifyOriginState(origin, enabled);
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

async function getSiteState(tabId) {
  if (!Number.isInteger(tabId)) {
    return unavailableSiteState();
  }

  const origin = await resolveTabOrigin(tabId);
  if (!origin) {
    return unavailableSiteState();
  }

  return {
    ok: true,
    available: true,
    enabled: await isSiteEnabled(origin),
  };
}

function unavailableSiteState() {
  return {
    ok: true,
    available: false,
    enabled: true,
  };
}

async function resolveTabOrigin(tabId) {
  if (!Number.isInteger(tabId)) {
    return null;
  }

  const deadline = Date.now() + ORIGIN_RESOLVE_TIMEOUT_MS;
  while (true) {
    const origin = await requestTabOrigin(tabId);
    if (origin) {
      return origin;
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      return null;
    }

    // Top-frame content script startup can race site-state requests during navigation.
    await delay(Math.min(ORIGIN_RESOLVE_RETRY_DELAY_MS, remainingMs));
  }
}

async function requestTabOrigin(tabId) {
  try {
    const response = await tabsSendMessage(
      tabId,
      { type: MESSAGE_GET_PAGE_ORIGIN },
      { frameId: 0 }
    );
    return normalizeOrigin(response && response.origin);
  } catch (_err) {
    return null;
  }
}

async function notifyOriginState(origin, enabled) {
  if (!origin) {
    return;
  }

  const tabs = await tabsQuery({});
  const candidateTabs = tabs.filter((tab) => Number.isInteger(tab && tab.id));
  const resolvedTabs = await Promise.all(
    candidateTabs.map(async (tab) => ({
      tabId: tab.id,
      origin: await resolveTabOrigin(tab.id),
    }))
  );

  await Promise.all(
    resolvedTabs
      .filter((tab) => tab.origin === origin)
      .map((tab) => notifyTabSiteState(tab.tabId, enabled))
  );
}

function notifyTabSiteState(tabId, enabled) {
  if (!Number.isInteger(tabId)) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: MESSAGE_SITE_STATE_CHANGED, enabled: enabled !== false },
      () => {
        void chrome.runtime.lastError;
        resolve();
      }
    );
  });
}

async function isSiteEnabled(origin) {
  if (!origin) {
    return true;
  }

  const disabledOrigins = await getDisabledOrigins();
  return disabledOrigins[origin] !== true;
}

async function setSiteEnabled(origin, enabled) {
  if (!origin) {
    return;
  }

  const disabledOrigins = await getDisabledOrigins();
  if (enabled !== false) {
    if (disabledOrigins[origin] !== true) {
      return;
    }

    delete disabledOrigins[origin];
  } else {
    disabledOrigins[origin] = true;
  }

  await storageLocalSet({ [DISABLED_ORIGINS_STORAGE_KEY]: disabledOrigins });
}

async function getDisabledOrigins() {
  const result = await storageLocalGet({ [DISABLED_ORIGINS_STORAGE_KEY]: {} });
  const storedOrigins = result[DISABLED_ORIGINS_STORAGE_KEY];
  if (!storedOrigins || typeof storedOrigins !== 'object' || Array.isArray(storedOrigins)) {
    return {};
  }

  const disabledOrigins = {};
  for (const [origin, value] of Object.entries(storedOrigins)) {
    const normalizedOrigin = normalizeOrigin(origin);
    if (normalizedOrigin && value === true) {
      disabledOrigins[normalizedOrigin] = true;
    }
  }

  return disabledOrigins;
}

function normalizeOrigin(origin) {
  const text = String(origin || '').trim();
  if (!text) {
    return null;
  }

  try {
    const parsed = new URL(text);
    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || parsed.origin !== text) {
      return null;
    }

    return parsed.origin;
  } catch (_err) {
    return null;
  }
}

function respondAsync(sendResponse, task) {
  task()
    .then(sendResponse)
    .catch((err) => {
      console.error('toT extension message failed:', err);
      sendResponse({ ok: false });
    });
}

function storageLocalGet(defaults) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(defaults, (result) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(result || defaults);
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

function tabsSendMessage(tabId, message, options) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, options || {}, (response) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve(response || null);
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

function delay(timeoutMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
}
