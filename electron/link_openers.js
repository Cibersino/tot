// electron/link_openers.js
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const ALLOWED_EXTERNAL_HOSTS = new Set([
  'github.com',
  'www.github.com',
  'api.github.com',
  'raw.githubusercontent.com',
  'doi.org',
]);
const APP_DOC_FILES = Object.freeze({
  'license-app': 'LICENSE',
  'license-electron': 'LICENSE.electron.txt',
  'licenses-chromium': 'LICENSES.chromium.html',
  'privacy-policy': 'PRIVACY.md',
});
const APP_DOC_BASKERVVILLE = 'license-baskervville';

async function fileExists(filePath) {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function getTempDir(app) {
  try {
    return app.getPath('temp');
  } catch {
    return os.tmpdir();
  }
}

async function copyToTemp(app, srcPath, tempName) {
  const tempPath = path.join(getTempDir(app), tempName);
  const data = await fs.promises.readFile(srcPath);
  await fs.promises.writeFile(tempPath, data);
  return tempPath;
}

async function openPathWithLog(shell, log, rawKey, filePath) {
  const openResult = await shell.openPath(filePath);
  if (openResult) {
    log.warn('open-app-doc open failed:', rawKey, openResult);
    return { ok: false, reason: 'open_failed' };
  }
  return { ok: true };
}

function registerLinkIpc({ ipcMain, app, shell, log }) {
  ipcMain.handle('open-external-url', async (_e, url) => {
    try {
      const raw = typeof url === 'string' ? url.trim() : '';
      if (!raw) {
        log.warn('open-external-url blocked: empty or invalid URL:', url);
        return { ok: false, reason: 'blocked' };
      }

      let parsed;
      try {
        parsed = new URL(raw);
      } catch (err) {
        log.warn('open-external-url blocked: invalid URL:', raw);
        return { ok: false, reason: 'blocked' };
      }

      if (parsed.protocol !== 'https:' || !ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname)) {
        log.warn('open-external-url blocked: disallowed URL:', parsed.toString());
        return { ok: false, reason: 'blocked' };
      }

      await shell.openExternal(parsed.toString());
      return { ok: true };
    } catch (err) {
      log.error('Error processing open-external-url:', err);
      return { ok: false, reason: 'error' };
    }
  });

  ipcMain.handle('open-app-doc', async (_e, docKey) => {
    try {
      const rawKey = typeof docKey === 'string' ? docKey.trim() : '';
      if (!rawKey) {
        log.warn('open-app-doc blocked: empty or invalid docKey:', docKey);
        return { ok: false, reason: 'blocked' };
      }

      if (!app.isPackaged && (rawKey === 'license-electron' || rawKey === 'licenses-chromium')) {
        log.warn('open-app-doc not available in dev; requires packaged build:', rawKey);
        return { ok: false, reason: 'not_available_in_dev' };
      }

      if (!app.isPackaged && (rawKey === 'license-app' || rawKey === 'privacy-policy')) {
        const fileName = APP_DOC_FILES[rawKey];
        if (!fileName) {
          log.warn('open-app-doc blocked: unknown doc key:', rawKey);
          return { ok: false, reason: 'blocked' };
        }

        const devCandidates = [
          path.join(process.cwd(), fileName),
          path.join(app.getAppPath(), fileName),
        ];

        for (const candidate of devCandidates) {
          if (!(await fileExists(candidate))) continue;
          return openPathWithLog(shell, log, rawKey, candidate);
        }

        log.warn('open-app-doc not found (dev doc):', rawKey, fileName);
        return { ok: false, reason: 'not_found' };
      }

      if (rawKey === APP_DOC_BASKERVVILLE) {
        const srcPath = path.join(app.getAppPath(), 'public', 'fonts', 'LICENSE_Baskervville_OFL.txt');
        if (!(await fileExists(srcPath))) {
          log.warn('open-app-doc not found:', rawKey);
          return { ok: false, reason: 'not_found' };
        }

        const tempPath = await copyToTemp(app, srcPath, 'tot-readingmeter_LICENSE_Baskervville_OFL.txt');
        return openPathWithLog(shell, log, rawKey, tempPath);
      }

      if (!Object.prototype.hasOwnProperty.call(APP_DOC_FILES, rawKey)) {
        log.warn('open-app-doc blocked: unknown doc key:', rawKey);
        return { ok: false, reason: 'blocked' };
      }

      const fileName = APP_DOC_FILES[rawKey];
      const candidates = [];
      if (process.resourcesPath) {
        candidates.push(path.join(process.resourcesPath, '..', fileName));
        candidates.push(path.join(process.resourcesPath, fileName));
      }

      for (const candidate of candidates) {
        if (!(await fileExists(candidate))) continue;
        return openPathWithLog(shell, log, rawKey, candidate);
      }

      const fallbackPath = path.join(app.getAppPath(), fileName);
      if (!(await fileExists(fallbackPath))) {
        log.warn('open-app-doc not found:', rawKey);
        return { ok: false, reason: 'not_found' };
      }

      const tempPath = await copyToTemp(app, fallbackPath, `tot-readingmeter_${fileName}`);
      return openPathWithLog(shell, log, rawKey, tempPath);
    } catch (err) {
      log.error('Error processing open-app-doc:', err);
      return { ok: false, reason: 'error' };
    }
  });
}

module.exports = { registerLinkIpc };
