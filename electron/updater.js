// electron/updater.js
// update system: version comparison, remote query, and native update dialogs and native update dialogs.
'use strict';

const { dialog, shell } = require('electron');
const https = require('https');
const path = require('path');
const fs = require('fs');
const Log = require('./log');

const log = Log.get('updater');
const menuBuilder = require('./menu_builder');
const { DEFAULT_LANG } = require('./constants_main');

// Version/download paths and URLs
const VERSION_FILE = path.join(__dirname, '..', 'VERSION');
const VERSION_REMOTE_URL = 'https://raw.githubusercontent.com/Cibersino/tot-readingmeter/main/VERSION';
const DOWNLOAD_URL = 'https://github.com/Cibersino/tot-readingmeter/releases/latest';

// Lazy references to external state
let mainWinRef = () => null;
let currentLanguageRef = () => DEFAULT_LANG;

// Avoid multiple checks in the same life cycle
let updateCheckDone = false;

const resolveDialogText = (dialogTexts, key, fallback) =>
  menuBuilder.resolveDialogText(dialogTexts, key, fallback, {
    log,
    warnPrefix: 'updater.dialog.missing'
  });

function compareVersions(a, b) {
  const pa = String(a || '').trim().split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b || '').trim().split('.').map(n => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

function fetchRemoteVersion(url) {
  return new Promise((resolve) => {
    try {
      https.get(url, (res) => {
        if (res.statusCode !== 200) return resolve(null);
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve(String(data || '').trim()));
      }).on('error', () => resolve(null));
    } catch {
      resolve(null);
    }
  });
}

async function checkForUpdates({ lang, manual = false } = {}) {
  try {
    const effectiveLang =
      (lang && String(lang).trim()) ||
      (typeof currentLanguageRef === 'function' && currentLanguageRef()) ||
      DEFAULT_LANG;

    const mainWin = typeof mainWinRef === 'function' ? mainWinRef() : null;
    const dlg = menuBuilder.getDialogTexts(effectiveLang) || {};

    let localVer = null;
    try {
      localVer = fs.readFileSync(VERSION_FILE, 'utf8').trim();
    } catch {
      // no local VERSION, continue without warning
      return;
    }

    const remoteVer = await fetchRemoteVersion(VERSION_REMOTE_URL);
    if (!remoteVer) {
      if (manual && mainWin && !mainWin.isDestroyed()) {
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
      }
      return;
    }

    if (compareVersions(remoteVer, localVer) <= 0) {
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

// Automatic, one-time check
function scheduleInitialCheck() {
  if (updateCheckDone) return;
  updateCheckDone = true;
  // we do not check manual: if it fails, the user is not informed
  checkForUpdates({ manual: false }).catch((err) => {
    log.warn('initial checkForUpdates failed:', err);
  });
}

// IPC register and window/language references
function registerIpc(ipcMain, { mainWinRef: mainRef, currentLanguageRef: langRef } = {}) {
  if (typeof mainRef === 'function') {
    mainWinRef = mainRef;
  }
  if (typeof langRef === 'function') {
    currentLanguageRef = langRef;
  }

  if (ipcMain && typeof ipcMain.handle === 'function') {
    ipcMain.handle('check-for-updates', async () => {
      try {
        await checkForUpdates({
          lang: typeof currentLanguageRef === 'function' ? currentLanguageRef() : DEFAULT_LANG,
          manual: true,
        });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    });
  }
}

module.exports = {
  registerIpc,
  scheduleInitialCheck,
};
