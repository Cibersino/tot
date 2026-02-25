// electron/import_ocr/platform/resolve_sidecar.js
'use strict';

const fs = require('fs');
const path = require('path');
const {
  getProfileKey,
  getProfileByKey,
} = require('./profile_registry');

function fail(code, message, extra = {}) {
  return Object.assign({ ok: false, code, message }, extra);
}

function resolveCurrentProfile({ platform = process.platform, arch = process.arch } = {}) {
  const key = getProfileKey(platform, arch);
  if (!key) {
    return fail(
      'OCR_UNAVAILABLE_PLATFORM',
      'Current platform/arch is not supported for OCR sidecars.',
      { platform, arch }
    );
  }

  const profile = getProfileByKey(key);
  if (!profile) {
    return fail(
      'OCR_UNAVAILABLE_PLATFORM',
      'Current platform/arch has no OCR sidecar profile.',
      { platform, arch, profileKey: key }
    );
  }

  return {
    ok: true,
    profileKey: key,
    profile,
  };
}

function normalizeBaseDir(rawPath) {
  const value = String(rawPath || '').trim();
  if (!value) return '';
  try {
    return path.resolve(value);
  } catch {
    return '';
  }
}

function detectPackagedRuntime(explicitFlag) {
  if (typeof explicitFlag === 'boolean') return explicitFlag;
  return process.defaultApp !== true;
}

function resolveSidecarRootBase({
  resourcesPath = process.resourcesPath,
  appPath = process.cwd(),
  env = process.env,
  isPackaged,
  explicitBaseDir = '',
} = {}) {
  const packaged = detectPackagedRuntime(isPackaged);
  const explicit = normalizeBaseDir(explicitBaseDir);
  if (explicit) {
    return { ok: true, isPackaged: packaged, source: 'explicit', baseDir: explicit };
  }

  const envRoot = normalizeBaseDir(env && env.TOT_OCR_SIDECAR_ROOT);
  if (envRoot && !packaged) {
    return { ok: true, isPackaged: packaged, source: 'env:tot_ocr_sidecar_root', baseDir: envRoot };
  }

  if (packaged) {
    const packagedBase = normalizeBaseDir(resourcesPath);
    if (!packagedBase) {
      return fail('OCR_RUNTIME_PATH_INVALID', 'process.resourcesPath is invalid for OCR sidecar resolution.');
    }
    return { ok: true, isPackaged: true, source: 'resourcesPath', baseDir: packagedBase };
  }

  const devBase = normalizeBaseDir(appPath);
  if (!devBase) {
    return fail('OCR_RUNTIME_PATH_INVALID', 'appPath is invalid for OCR sidecar resolution.');
  }
  return { ok: true, isPackaged: false, source: 'appPath', baseDir: devBase };
}

function resolveSidecarPaths({
  resourcesPath = process.resourcesPath,
  appPath = process.cwd(),
  env = process.env,
  isPackaged,
  sidecarRootBase = '',
  platform = process.platform,
  arch = process.arch,
} = {}) {
  const profileRes = resolveCurrentProfile({ platform, arch });
  if (!profileRes.ok) return profileRes;

  const rootRes = resolveSidecarRootBase({
    resourcesPath,
    appPath,
    env,
    isPackaged,
    explicitBaseDir: sidecarRootBase,
  });
  if (!rootRes.ok) return rootRes;

  const { profileKey, profile } = profileRes;
  const sidecarBaseDir = path.resolve(String(rootRes.baseDir || ''), profile.sidecarDir);
  const tesseractPath = path.join(sidecarBaseDir, profile.binaries.tesseract);
  const pdftoppmPath = path.join(sidecarBaseDir, profile.binaries.pdftoppm);
  const tessdataPath = path.join(sidecarBaseDir, profile.tessdataDir);

  return {
    ok: true,
    profileKey,
    source: rootRes.source,
    isPackaged: rootRes.isPackaged,
    rootBaseDir: rootRes.baseDir,
    sidecarBaseDir,
    tesseractPath,
    pdftoppmPath,
    tessdataPath,
  };
}

function pathExists(targetPath) {
  try {
    return fs.existsSync(targetPath);
  } catch {
    return false;
  }
}

function validateSidecarRuntime({
  resourcesPath = process.resourcesPath,
  appPath = process.cwd(),
  env = process.env,
  isPackaged,
  sidecarRootBase = '',
  platform = process.platform,
  arch = process.arch,
  requiredLanguages = ['eng', 'spa', 'fra', 'deu', 'ita', 'por'],
} = {}) {
  const resolved = resolveSidecarPaths({
    resourcesPath,
    appPath,
    env,
    isPackaged,
    sidecarRootBase,
    platform,
    arch,
  });
  if (!resolved.ok) return resolved;

  const missing = [];
  const addMissing = (kind, targetPath, detail = '') => {
    missing.push({
      kind,
      path: String(targetPath || ''),
      detail: detail ? String(detail) : '',
    });
  };

  if (!pathExists(resolved.sidecarBaseDir)) {
    addMissing('sidecar_dir', resolved.sidecarBaseDir);
  }
  if (!pathExists(resolved.tesseractPath)) {
    addMissing('binary', resolved.tesseractPath, 'tesseract');
  }
  if (!pathExists(resolved.pdftoppmPath)) {
    addMissing('binary', resolved.pdftoppmPath, 'pdftoppm');
  }
  if (!pathExists(resolved.tessdataPath)) {
    addMissing('dir', resolved.tessdataPath, 'tessdata');
  }

  const normalizedLangs = Array.isArray(requiredLanguages)
    ? requiredLanguages
      .map((lang) => String(lang || '').trim().toLowerCase())
      .filter(Boolean)
    : [];
  const languageFiles = {};
  normalizedLangs.forEach((lang) => {
    const trainedDataPath = path.join(resolved.tessdataPath, `${lang}.traineddata`);
    languageFiles[lang] = trainedDataPath;
    if (!pathExists(trainedDataPath)) {
      addMissing('langdata', trainedDataPath, lang);
    }
  });

  if (missing.length > 0) {
    const missSummary = missing.map((item) => {
      if (item.detail) return `${item.detail}:${item.path}`;
      return item.path;
    }).join('; ');
    return fail(
      'OCR_BINARY_MISSING',
      `OCR sidecar runtime is incomplete for '${resolved.profileKey}' (${resolved.source}). Missing: ${missSummary}`,
      {
        profileKey: resolved.profileKey,
        source: resolved.source,
        isPackaged: resolved.isPackaged,
        rootBaseDir: resolved.rootBaseDir,
        sidecarBaseDir: resolved.sidecarBaseDir,
        tesseractPath: resolved.tesseractPath,
        pdftoppmPath: resolved.pdftoppmPath,
        tessdataPath: resolved.tessdataPath,
        languageFiles,
        missing,
      }
    );
  }

  return Object.assign({}, resolved, {
    languageFiles,
    requiredLanguages: normalizedLangs,
  });
}

module.exports = {
  resolveCurrentProfile,
  resolveSidecarRootBase,
  resolveSidecarPaths,
  validateSidecarRuntime,
};

// =============================================================================
// End of electron/import_ocr/platform/resolve_sidecar.js
// =============================================================================
