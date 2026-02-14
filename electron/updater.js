// electron/updater.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Update helper for the main process.
// Responsibilities:
// - Fetch the latest release tag and compare SemVer.
// - Show update dialogs for manual checks.
// - Open the download URL when the user confirms.
// - Expose IPC registration and a one-time auto check.

// =============================================================================
// Imports / logger
// =============================================================================

const { dialog, shell, app } = require('electron');
const https = require('https');
const Log = require('./log');

const log = Log.get('updater');
log.debug('Updater starting...');
const menuBuilder = require('./menu_builder');
const { DEFAULT_LANG } = require('./constants_main');

// =============================================================================
// Constants / config (paths, defaults)
// =============================================================================
const RELEASES_API_URL = 'https://api.github.com/repos/Cibersino/tot/releases/latest';
const DOWNLOAD_URL = 'https://github.com/Cibersino/tot/releases/latest';

// =============================================================================
// Shared state (window refs, lifecycle guard)
// =============================================================================
let mainWinRef = () => null;
let currentLanguageRef = () => DEFAULT_LANG;

let updateCheckDone = false;

// =============================================================================
// Helpers (i18n, SemVer, network)
// =============================================================================
const resolveDialogText = (dialogTexts, key, fallback) =>
  menuBuilder.resolveDialogText(dialogTexts, key, fallback, {
    log,
    warnPrefix: 'updater.dialog.missing'
  });

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/;

function parseSemVer(version) {
  const raw = String(version || '').trim();
  const match = SEMVER_RE.exec(raw);
  if (!match) return null;

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) return null;

  const prerelease = match[4] ? match[4].split('.').filter(Boolean) : [];
  return { major, minor, patch, prerelease, raw };
}

function comparePrerelease(aIds, bIds) {
  const aLen = aIds.length;
  const bLen = bIds.length;

  if (aLen === 0 && bLen === 0) return 0;
  if (aLen === 0) return 1;
  if (bLen === 0) return -1;

  const max = Math.max(aLen, bLen);
  for (let i = 0; i < max; i++) {
    if (i >= aLen) return -1;
    if (i >= bLen) return 1;

    const aId = aIds[i];
    const bId = bIds[i];
    const aNum = /^[0-9]+$/.test(aId);
    const bNum = /^[0-9]+$/.test(bId);

    if (aNum && bNum) {
      const aVal = Number(aId);
      const bVal = Number(bId);
      if (aVal > bVal) return 1;
      if (aVal < bVal) return -1;
      continue;
    }

    if (aNum && !bNum) return -1;
    if (!aNum && bNum) return 1;

    if (aId > bId) return 1;
    if (aId < bId) return -1;
  }

  return 0;
}

function compareSemVer(a, b) {
  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;
  return comparePrerelease(a.prerelease, b.prerelease);
}

function fetchLatestReleaseTag(url) {
  return new Promise((resolve) => {
    try {
      https.get(url, {
        headers: {
          'User-Agent': 'tot-updater',
          'Accept': 'application/vnd.github+json',
        }
      }, (res) => {
        if (res.statusCode !== 200) {
          log.warn('Latest release fetch failed with status:', res.statusCode);
          res.resume();
          return resolve(null);
        }
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(String(data || '').trim() || '{}');
            const tag = parsed && typeof parsed.tag_name === 'string' ? parsed.tag_name.trim() : '';
            if (!tag) {
              log.warn('Latest release payload missing tag_name.');
              return resolve(null);
            }
            resolve(tag);
          } catch (err) {
            log.warn('Failed to parse latest release JSON:', err);
            resolve(null);
          }
        });
      }).on('error', (err) => {
        log.warn('Latest release fetch error:', err);
        resolve(null);
      });
    } catch (err) {
      log.warn('Latest release fetch failed:', err);
      resolve(null);
    }
  });
}

// =============================================================================
// Update flow (manual vs auto)
// =============================================================================
async function checkForUpdates({ lang, manual = false } = {}) {
  try {
    const effectiveLang =
      (lang && String(lang).trim()) ||
      (typeof currentLanguageRef === 'function' && currentLanguageRef()) ||
      DEFAULT_LANG;

    const mainWin = typeof mainWinRef === 'function' ? mainWinRef() : null;
    const dlg = menuBuilder.getDialogTexts(effectiveLang) || {};

    const shouldShowManualDialog = () =>
      manual && mainWin && !mainWin.isDestroyed();

    const showUpdateFailureDialog = async () => {
      const title = resolveDialogText(dlg, 'update_failed_title', 'Update check failed');
      const message = resolveDialogText(
        dlg,
        'update_failed_message',
        'Could not check for updates. Please check your connection and try again.'
      );
      await dialog.showMessageBox(mainWin, {
        type: 'none',
        buttons: [resolveDialogText(dlg, 'ok', 'OK')],
        defaultId: 0,
        title,
        message,
      });
    };

    let localVer = null;
    try {
      localVer = String(app.getVersion() || '').trim();
    } catch (err) {
      log.warn('Could not read local app version:', err);
      localVer = '';
    }

    const localParsed = parseSemVer(localVer);
    if (!localParsed) {
      log.warn('Local version is not valid SemVer:', localVer);
      if (shouldShowManualDialog()) {
        await showUpdateFailureDialog();
      }
      return;
    }

    const remoteTag = await fetchLatestReleaseTag(RELEASES_API_URL);
    if (!remoteTag) {
      if (shouldShowManualDialog()) {
        await showUpdateFailureDialog();
      }
      return;
    }

    if (!remoteTag.startsWith('v')) {
      log.warn('Latest release tag is missing required "v" prefix:', remoteTag);
      if (shouldShowManualDialog()) {
        await showUpdateFailureDialog();
      }
      return;
    }

    const remoteVer = remoteTag.slice(1).trim();
    const remoteParsed = parseSemVer(remoteVer);
    if (!remoteParsed) {
      log.warn('Remote version is not valid SemVer:', remoteVer);
      if (shouldShowManualDialog()) {
        await showUpdateFailureDialog();
      }
      return;
    }

    if (compareSemVer(remoteParsed, localParsed) <= 0) {
      if (manual && mainWin && !mainWin.isDestroyed()) {
        const title = resolveDialogText(dlg, 'update_up_to_date_title', 'You are up to date');
        const message = resolveDialogText(
          dlg,
          'update_up_to_date_message',
          'You already have the latest version.'
        )
          .replace('{local}', localVer);
        await dialog.showMessageBox(mainWin, {
          type: 'none',
          buttons: [resolveDialogText(dlg, 'ok', 'OK')],
          defaultId: 0,
          title,
          message,
        });
      }
      return;
    }

    if (!mainWin || mainWin.isDestroyed()) {
      // No main window visible: no sense in showing dialogs
      return;
    }

    const title = resolveDialogText(dlg, 'update_title', 'Update available');
    const message = resolveDialogText(
      dlg,
      'update_message',
      'A new version is available. Download now?'
    )
      .replace('{remote}', remoteVer)
      .replace('{local}', localVer);
    const btnDownload = resolveDialogText(dlg, 'update_download', 'Download');
    const btnLater = resolveDialogText(dlg, 'update_later', 'Later');

    const res = await dialog.showMessageBox(mainWin, {
      type: 'none',
      buttons: [btnDownload, btnLater],
      defaultId: 0,
      cancelId: 1,
      title,
      message,
    });
    if (res.response === 0) {
      shell.openExternal(DOWNLOAD_URL);
    }
  } catch (err) {
    log.warn('checkForUpdates failed:', err);
  }
}

// =============================================================================
// App lifecycle / bootstrapping
// =============================================================================
function scheduleInitialCheck() {
  if (updateCheckDone) return;
  updateCheckDone = true;
  // we do not check manual: if it fails, the user is not informed
  checkForUpdates({ manual: false }).catch((err) => {
    log.warn('initial checkForUpdates failed:', err);
  });
}

// =============================================================================
// IPC registration / handlers
// =============================================================================
function registerIpc(ipcMain, { mainWinRef: mainRef, currentLanguageRef: langRef } = {}) {
  if (typeof mainRef === 'function') {
    mainWinRef = mainRef;
  }
  if (typeof langRef === 'function') {
    currentLanguageRef = langRef;
  }

  if (ipcMain && typeof ipcMain.handle === 'function') {
    ipcMain.handle('check-for-updates', async (_event, payload = {}) => {
      try {
        const manual =
          payload && typeof payload.manual === 'boolean' ? payload.manual : false;
        await checkForUpdates({
          lang: typeof currentLanguageRef === 'function' ? currentLanguageRef() : DEFAULT_LANG,
          manual,
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    });
  }
}

// =============================================================================
// Exports / module surface
// =============================================================================
module.exports = {
  registerIpc,
  scheduleInitialCheck,
};

// =============================================================================
// End of electron/updater.js
// =============================================================================
