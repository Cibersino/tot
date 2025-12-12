// electron/updater.js
// Sistema de actualizaciones: comparacion de versiones, consulta remota
// y dialogos nativos de actualizacion.

const { dialog, shell } = require('electron');
const https = require('https');
const path = require('path');
const fs = require('fs');

const menuBuilder = require('./menu_builder');

// Rutas y URLs de version / descarga
const VERSION_FILE = path.join(__dirname, '..', 'VERSION');
const VERSION_REMOTE_URL = 'https://raw.githubusercontent.com/Cibersino/tot-readingmeter/main/VERSION';
const DOWNLOAD_URL = 'https://github.com/Cibersino/tot-readingmeter/releases/latest';

// Referencias perezosas a estado externo
let mainWinRef = () => null;
let currentLanguageRef = () => 'es';

// Evitar checks multiples en el mismo ciclo de vida
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
      // sin VERSION local, continuar sin avisar
      return;
    }

    const remoteVer = await fetchRemoteVersion(VERSION_REMOTE_URL);
    if (!remoteVer) {
      if (manual && mainWin && !mainWin.isDestroyed()) {
        const title = dlg.update_failed_title || 'Update check failed';
        const message = dlg.update_failed_message || 'Could n...check for updates. Please check your connection and try again.';
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
        const title = dlg.update_up_to_date_title || 'You are up to date';
        const message = (dlg.update_up_to_date_message || 'You already have the latest version ({local}).')
          .replace('{local}', localVer);
        await dialog.showMessageBox(mainWin, {
          type: 'none',
          buttons: [dlg.ok || 'OK'],
          defaultId: 0,
          title,
          message,
        });
      }
      return; // nada nuevo
    }

    if (!mainWin || mainWin.isDestroyed()) {
      // No hay ventana principal visible: no tiene sentido mostrar dialogos
      return;
    }

    const title = dlg.update_title || 'Actualizacion disponible';
    const message = (dlg.update_message || 'Hay una version nueva {remote}. Actual: {local}. Descargar ahora?')
      .replace('{remote}', remoteVer)
      .replace('{local}', localVer);
    const btnDownload = dlg.update_download || 'Descargar';
    const btnLater = dlg.update_later || 'Mas tarde';

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

// Check automatico, una sola vez
function scheduleInitialCheck() {
  if (updateCheckDone) return;
  updateCheckDone = true;
  // no marcamos manual: si falla, no se informa al usuario
  checkForUpdates({ manual: false }).catch((err) => {
    console.warn('initial checkForUpdates failed:', err);
  });
}

// Registro de IPC y referencias de ventanas/idioma
function register(ipcMain, { mainWinRef: mainRef, currentLanguageRef: langRef } = {}) {
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
  register,
  checkForUpdates,
  scheduleInitialCheck,
};
