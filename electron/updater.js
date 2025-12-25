// electron/updater.js
// update system: version comparison, remote query, and native update dialogs
// and native update dialogs.

const { dialog, shell } = require('electron');
const https = require('https');
const path = require('path');
const fs = require('fs');

const menuBuilder = require('./menu_builder');

// Version/download paths and URLs
const VERSION_FILE = path.join(__dirname, '..', 'VERSION');
const VERSION_REMOTE_URL = 'https://raw.githubusercontent.com/Cibersino/tot-readingmeter/main/VERSION';
const DOWNLOAD_URL = 'https://github.com/Cibersino/tot-readingmeter/releases/latest';

// Lazy references to external state
let mainWinRef = () => null;
let currentLanguageRef = () => 'es';

// Avoid multiple checks in the same life cycle
let updateCheckDone = false;

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
    } catch (e) {
      resolve(null);
    }
  });
}

async function checkForUpdates({ lang, manual = false } = {}) {
  try {
    const effectiveLang =
      (lang && String(lang).trim()) ||
      (typeof currentLanguageRef === 'function' && currentLanguageRef()) ||
      'es';

    const mainWin = typeof mainWinRef === 'function' ? mainWinRef() : null;
    const dlg = menuBuilder.getDialogTexts(effectiveLang) || {};

    let localVer = null;
    try {
      localVer = fs.readFileSync(VERSION_FILE, 'utf8').trim();
    } catch (e) {
      // no local VERSION, continue without warning
      return;
    }

    const remoteVer = await fetchRemoteVersion(VERSION_REMOTE_URL);
    if (!remoteVer) {
      if (manual && mainWin && !mainWin.isDestroyed()) {
        const title = dlg.update_failed_title || 'FALLBACK: Update check failed';
        const message = dlg.update_failed_message || 'FALLBACK: Could not check for updates. Please check your connection and try again.';
        await dialog.showMessageBox(mainWin, {
          type: 'none',
          buttons: [dlg.ok || 'OK'],
          defaultId: 0,
          title,
          message,
        });
      }
      return;
    }

    if (compareVersions(remoteVer, localVer) <= 0) {
      if (manual && mainWin && !mainWin.isDestroyed()) {
        const title = dlg.update_up_to_date_title || 'FALLBACK: You are up to date';
        const message = (dlg.update_up_to_date_message || 'FALLBACK: You already have the latest version.')
          .replace('{local}', localVer);
        await dialog.showMessageBox(mainWin, {
          type: 'none',
          buttons: [dlg.ok || 'OK'],
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

    const title = dlg.update_title || 'FALLBACK: Update available';
    const message = (dlg.update_message || 'FALLBACK: A new version is available. Download now?')
      .replace('{remote}', remoteVer)
      .replace('{local}', localVer);
    const btnDownload = dlg.update_download || 'FALLBACK: Download';
    const btnLater = dlg.update_later || 'FALLBACK: Later';

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
    console.warn('checkForUpdates failed:', err);
  }
}

// Automatic, one-time check
function scheduleInitialCheck() {
  if (updateCheckDone) return;
  updateCheckDone = true;
  // we do not check manual: if it fails, the user is not informed
  checkForUpdates({ manual: false }).catch((err) => {
    console.warn('initial checkForUpdates failed:', err);
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
          lang: typeof currentLanguageRef === 'function' ? currentLanguageRef() : 'es',
          manual: true,
        });
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    });
  }
}

module.exports = {
  registerIpc,
  scheduleInitialCheck,
};
