// electron/import_ocr/platform/resolve_sidecar.js
'use strict';

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

function resolveSidecarPaths({
  resourcesPath = process.resourcesPath,
  platform = process.platform,
  arch = process.arch,
} = {}) {
  const profileRes = resolveCurrentProfile({ platform, arch });
  if (!profileRes.ok) return profileRes;

  const { profileKey, profile } = profileRes;
  const sidecarBaseDir = path.resolve(String(resourcesPath || ''), profile.sidecarDir);
  const tesseractPath = path.join(sidecarBaseDir, profile.binaries.tesseract);
  const pdftoppmPath = path.join(sidecarBaseDir, profile.binaries.pdftoppm);
  const tessdataPath = path.join(sidecarBaseDir, profile.tessdataDir);

  return {
    ok: true,
    profileKey,
    sidecarBaseDir,
    tesseractPath,
    pdftoppmPath,
    tessdataPath,
  };
}

module.exports = {
  resolveCurrentProfile,
  resolveSidecarPaths,
};

