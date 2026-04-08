// electron/link_openers.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Gate external URL opens to a strict allowlist.
// - Resolve and open app documentation files by docKey.
// - Handle dev vs packaged doc locations and copy-to-temp cases.
// - Register IPC handlers that return { ok: true } or { ok: false, reason }.

// =============================================================================
// Imports
// =============================================================================

const fs = require('fs');
const path = require('path');
const os = require('os');
const Log = require('./log');

// =============================================================================
// Constants / config
// =============================================================================

const ALLOWED_EXTERNAL_HOSTS = new Set([
  'github.com',
  'www.github.com',
  'api.github.com',
  'raw.githubusercontent.com',
  'doi.org',
  'totapp.org',
  'www.totapp.org',
  'www.patreon.com',
  'drive.google.com',
]);
const ALLOWED_MAILTO_ADDRESS = 'cibersino@gmail.com';
const APP_DOC_FILES = Object.freeze({
  'license-app': 'LICENSE',
  'license-electron': 'LICENSE.electron.txt',
  'licenses-chromium': 'LICENSES.chromium.html',
  'privacy-policy': 'PRIVACY.md',
});
const APP_DOC_PUBLIC_FILES = Object.freeze({
  'license-baskervville': {
    relativePath: path.join('public', 'fonts', 'LICENSE_Baskervville_OFL.txt'),
    tempName: 'tot_LICENSE_Baskervville_OFL.txt',
  },
  'license-import-extract-google-auth': {
    relativePath: path.join(
      'public',
      'extraction_feature_licenses',
      'LICENSE_@google-cloud_local-auth_3.0.1.txt'
    ),
    tempName: 'tot_LICENSE_@google-cloud_local-auth_3.0.1.txt',
  },
  'license-import-extract-google-apis': {
    relativePath: path.join(
      'public',
      'extraction_feature_licenses',
      'LICENSE_googleapis_171.4.0.txt'
    ),
    tempName: 'tot_LICENSE_googleapis_171.4.0.txt',
  },
  'license-import-extract-docx': {
    relativePath: path.join(
      'public',
      'extraction_feature_licenses',
      'LICENSE_mammoth_1.11.0.txt'
    ),
    tempName: 'tot_LICENSE_mammoth_1.11.0.txt',
  },
  'license-import-extract-pdf': {
    relativePath: path.join(
      'public',
      'extraction_feature_licenses',
      'LICENSE_pdf-parse_1.1.1.txt'
    ),
    tempName: 'tot_LICENSE_pdf-parse_1.1.1.txt',
  },
  'license-import-extract-image-processing': {
    relativePath: path.join(
      'public',
      'extraction_feature_licenses',
      'LICENSE_sharp_0.34.4.txt'
    ),
    tempName: 'tot_LICENSE_sharp_0.34.4.txt',
  },
});
const IMAGE_PROCESSING_RUNTIME_DOC_KEYS = new Set([
  'license-import-extract-image-processing-runtime',
  'license-import-extract-image-processing-win32',
]);
const IMAGE_PROCESSING_RUNTIME_NOTICE_DOC_KEYS = new Set([
  'notice-import-extract-image-processing-runtime',
]);
const IMAGE_PROCESSING_RUNTIME_PUBLIC_FILES = Object.freeze({
  'win32:x64': {
    relativePath: path.join(
      'public',
      'extraction_feature_licenses',
      'LICENSE_@img_sharp-win32-x64_0.34.4.txt'
    ),
    tempName: 'tot_LICENSE_@img_sharp-win32-x64_0.34.4.txt',
  },
  'darwin:x64': {
    relativePath: path.join(
      'public',
      'extraction_feature_licenses',
      'LICENSE_@img_sharp-darwin-x64_0.34.4.txt'
    ),
    tempName: 'tot_LICENSE_@img_sharp-darwin-x64_0.34.4.txt',
  },
  'darwin:arm64': {
    relativePath: path.join(
      'public',
      'extraction_feature_licenses',
      'LICENSE_@img_sharp-darwin-arm64_0.34.4.txt'
    ),
    tempName: 'tot_LICENSE_@img_sharp-darwin-arm64_0.34.4.txt',
  },
  'linux:x64': {
    relativePath: path.join(
      'public',
      'extraction_feature_licenses',
      'LICENSE_@img_sharp-linux-x64_0.34.4.txt'
    ),
    tempName: 'tot_LICENSE_@img_sharp-linux-x64_0.34.4.txt',
  },
});
const IMAGE_PROCESSING_RUNTIME_NOTICE_PUBLIC_FILES = Object.freeze({
  'win32:x64': {
    relativePath: path.join(
      'public',
      'extraction_feature_licenses',
      'NOTICE_@img_sharp-win32-x64_0.34.4.txt'
    ),
    tempName: 'tot_NOTICE_@img_sharp-win32-x64_0.34.4.txt',
  },
  'darwin:x64': {
    relativePath: path.join(
      'public',
      'extraction_feature_licenses',
      'NOTICE_@img_sharp-darwin-x64_0.34.4.txt'
    ),
    tempName: 'tot_NOTICE_@img_sharp-darwin-x64_0.34.4.txt',
  },
  'darwin:arm64': {
    relativePath: path.join(
      'public',
      'extraction_feature_licenses',
      'NOTICE_@img_sharp-darwin-arm64_0.34.4.txt'
    ),
    tempName: 'tot_NOTICE_@img_sharp-darwin-arm64_0.34.4.txt',
  },
  'linux:x64': {
    relativePath: path.join(
      'public',
      'extraction_feature_licenses',
      'NOTICE_@img_sharp-linux-x64_0.34.4.txt'
    ),
    tempName: 'tot_NOTICE_@img_sharp-linux-x64_0.34.4.txt',
  },
});

const log = Log.get('link-openers');
log.debug('Link openers starting...');

// =============================================================================
// Helpers
// =============================================================================

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
  } catch (err) {
    log.warnOnce(
      'link_openers.tempPath.fallback',
      'open-app-doc temp path fallback: app.getPath("temp") failed; using os.tmpdir().',
      err
    );
    return os.tmpdir();
  }
}

async function copyToTemp(app, srcPath, tempName) {
  const tempPath = path.join(getTempDir(app), tempName);
  const data = await fs.promises.readFile(srcPath);
  await fs.promises.writeFile(tempPath, data);
  return tempPath;
}

async function openPathWithLog(shell, rawKey, filePath) {
  const openResult = await shell.openPath(filePath);
  if (openResult) {
    log.warn('open-app-doc open failed:', rawKey, openResult);
    return { ok: false, reason: 'open_failed' };
  }
  return { ok: true };
}

async function openBundledPublicDoc(app, shell, rawKey, relativePath, tempName) {
  const srcPath = path.join(app.getAppPath(), relativePath);
  if (!(await fileExists(srcPath))) {
    log.warn('open-app-doc not found:', rawKey);
    return { ok: false, reason: 'not_found' };
  }

  const tempPath = await copyToTemp(app, srcPath, tempName);
  return openPathWithLog(shell, rawKey, tempPath);
}

function getImageProcessingRuntimeKey(platform = process.platform, arch = process.arch) {
  const normalizedPlatform = typeof platform === 'string' ? platform.trim() : '';
  const normalizedArch = typeof arch === 'string' ? arch.trim() : '';
  if (!normalizedPlatform || !normalizedArch) {
    return '';
  }
  return `${normalizedPlatform}:${normalizedArch}`;
}

function getImageProcessingRuntimePublicDoc(platform = process.platform, arch = process.arch) {
  const runtimeKey = getImageProcessingRuntimeKey(platform, arch);
  if (!runtimeKey) {
    return null;
  }
  return IMAGE_PROCESSING_RUNTIME_PUBLIC_FILES[runtimeKey] || null;
}

function getImageProcessingRuntimeNoticePublicDoc(platform = process.platform, arch = process.arch) {
  const runtimeKey = getImageProcessingRuntimeKey(platform, arch);
  if (!runtimeKey) {
    return null;
  }
  return IMAGE_PROCESSING_RUNTIME_NOTICE_PUBLIC_FILES[runtimeKey] || null;
}

async function getAppDocAvailability(app, rawKey) {
  const normalizedKey = typeof rawKey === 'string' ? rawKey.trim() : '';
  if (!normalizedKey) {
    return { ok: false, available: false, reason: 'blocked' };
  }

  if (IMAGE_PROCESSING_RUNTIME_DOC_KEYS.has(normalizedKey)) {
    const runtimeDoc = getImageProcessingRuntimePublicDoc(process.platform, process.arch);
    if (!runtimeDoc) {
      return { ok: true, available: false, reason: 'not_available_on_platform' };
    }
    const srcPath = path.join(app.getAppPath(), runtimeDoc.relativePath);
    const available = await fileExists(srcPath);
    return { ok: true, available, reason: available ? '' : 'not_found' };
  }

  if (IMAGE_PROCESSING_RUNTIME_NOTICE_DOC_KEYS.has(normalizedKey)) {
    const runtimeNoticeDoc = getImageProcessingRuntimeNoticePublicDoc(process.platform, process.arch);
    if (!runtimeNoticeDoc) {
      return { ok: true, available: false, reason: 'not_available_on_platform' };
    }
    const srcPath = path.join(app.getAppPath(), runtimeNoticeDoc.relativePath);
    const available = await fileExists(srcPath);
    return { ok: true, available, reason: available ? '' : 'not_found' };
  }

  return { ok: false, available: false, reason: 'unsupported_doc' };
}

// =============================================================================
// IPC registration / handlers
// =============================================================================

function registerLinkIpc({ ipcMain, app, shell }) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[link_openers] registerLinkIpc requires ipcMain');
  }

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

      const isAllowedHttps = parsed.protocol === 'https:' && ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname);

      const mailtoAddress = decodeURIComponent((parsed.pathname || '').trim()).toLowerCase();
      const isAllowedMailto = parsed.protocol === 'mailto:'
        && mailtoAddress === ALLOWED_MAILTO_ADDRESS
        && !parsed.search
        && !parsed.hash;

      if (!isAllowedHttps && !isAllowedMailto) {
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
          return openPathWithLog(shell, rawKey, candidate);
        }

        log.warn('open-app-doc not found (dev doc):', rawKey, fileName);
        return { ok: false, reason: 'not_found' };
      }

      if (IMAGE_PROCESSING_RUNTIME_DOC_KEYS.has(rawKey)) {
        const runtimeDoc = getImageProcessingRuntimePublicDoc(process.platform);
        if (!runtimeDoc) {
          log.warn('open-app-doc not available on current platform:', rawKey, process.platform);
          return { ok: false, reason: 'not_available_on_platform' };
        }

        return openBundledPublicDoc(
          app,
          shell,
          rawKey,
          runtimeDoc.relativePath,
          runtimeDoc.tempName
        );
      }

      if (IMAGE_PROCESSING_RUNTIME_NOTICE_DOC_KEYS.has(rawKey)) {
        const runtimeNoticeDoc = getImageProcessingRuntimeNoticePublicDoc(process.platform);
        if (!runtimeNoticeDoc) {
          log.warn('open-app-doc not available on current platform:', rawKey, process.platform);
          return { ok: false, reason: 'not_available_on_platform' };
        }

        return openBundledPublicDoc(
          app,
          shell,
          rawKey,
          runtimeNoticeDoc.relativePath,
          runtimeNoticeDoc.tempName
        );
      }

      if (Object.prototype.hasOwnProperty.call(APP_DOC_PUBLIC_FILES, rawKey)) {
        const publicDoc = APP_DOC_PUBLIC_FILES[rawKey];
        return openBundledPublicDoc(
          app,
          shell,
          rawKey,
          publicDoc.relativePath,
          publicDoc.tempName
        );
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
        return openPathWithLog(shell, rawKey, candidate);
      }

      const fallbackPath = path.join(app.getAppPath(), fileName);
      if (!(await fileExists(fallbackPath))) {
        log.warn('open-app-doc not found:', rawKey);
        return { ok: false, reason: 'not_found' };
      }

      const tempPath = await copyToTemp(app, fallbackPath, `tot_${fileName}`);
      return openPathWithLog(shell, rawKey, tempPath);
    } catch (err) {
      log.error('Error processing open-app-doc:', err);
      return { ok: false, reason: 'error' };
    }
  });

  ipcMain.handle('get-app-doc-availability', async (_e, docKey) => {
    try {
      return await getAppDocAvailability(app, docKey);
    } catch (err) {
      log.error('Error processing get-app-doc-availability:', err);
      return { ok: false, available: false, reason: 'error' };
    }
  });
}

// =============================================================================
// Exports / module surface
// =============================================================================

module.exports = { registerLinkIpc };

// =============================================================================
// End of electron/link_openers.js
// =============================================================================
