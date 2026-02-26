// electron/import_ocr/platform/profile_registry.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// OCR sidecar target profile registry.
// Responsibilities:
// - Define immutable sidecar metadata by "platform-arch" key.
// - Normalize platform/arch inputs used for profile lookup.
// - Provide profile lookup helpers with explicit miss fallbacks.
// - Validate registry shape and required fields for startup checks.

// =============================================================================
// Constants / config (registry data)
// =============================================================================

const TARGET_PROFILE_REGISTRY = Object.freeze({
  'win32-x64': Object.freeze({
    sidecarDir: 'ocr/win32-x64',
    binaries: Object.freeze({
      tesseract: 'tesseract/tesseract.exe',
      pdftoppm: 'poppler/pdftoppm.exe',
    }),
    tessdataDir: 'tesseract/tessdata',
  }),
  'linux-x64': Object.freeze({
    sidecarDir: 'ocr/linux-x64',
    binaries: Object.freeze({
      tesseract: 'tesseract',
      pdftoppm: 'pdftoppm',
    }),
    tessdataDir: 'tessdata',
  }),
  'darwin-arm64': Object.freeze({
    sidecarDir: 'ocr/darwin-arm64',
    binaries: Object.freeze({
      tesseract: 'tesseract',
      pdftoppm: 'pdftoppm',
    }),
    tessdataDir: 'tessdata',
  }),
  'darwin-x64': Object.freeze({
    sidecarDir: 'ocr/darwin-x64',
    binaries: Object.freeze({
      tesseract: 'tesseract',
      pdftoppm: 'pdftoppm',
    }),
    tessdataDir: 'tessdata',
  }),
});

function normalizeKeyPart(value) {
  return String(value || '').trim().toLowerCase();
}

// =============================================================================
// Helpers (lookup and key derivation)
// =============================================================================

function getProfileKey(platform = process.platform, arch = process.arch) {
  const p = normalizeKeyPart(platform);
  const a = normalizeKeyPart(arch);
  if (!p || !a) return '';
  return `${p}-${a}`;
}

function getProfileByKey(profileKey) {
  const key = normalizeKeyPart(profileKey);
  if (!key) return null;
  return TARGET_PROFILE_REGISTRY[key] || null;
}

function listProfileKeys() {
  return Object.keys(TARGET_PROFILE_REGISTRY);
}

// =============================================================================
// Validation
// =============================================================================

function validateRegistry() {
  const errors = [];
  const keys = listProfileKeys();

  keys.forEach((key) => {
    const profile = TARGET_PROFILE_REGISTRY[key];
    if (!profile || typeof profile !== 'object') {
      errors.push(`Invalid profile object for key '${key}'.`);
      return;
    }

    const sidecarDir = typeof profile.sidecarDir === 'string'
      ? profile.sidecarDir.trim()
      : '';
    if (!sidecarDir) {
      errors.push(`Profile '${key}' is missing sidecarDir.`);
    }

    const tessdataDir = typeof profile.tessdataDir === 'string'
      ? profile.tessdataDir.trim()
      : '';
    if (!tessdataDir) {
      errors.push(`Profile '${key}' is missing tessdataDir.`);
    }

    const binaries = profile.binaries && typeof profile.binaries === 'object'
      ? profile.binaries
      : null;
    if (!binaries) {
      errors.push(`Profile '${key}' is missing binaries map.`);
      return;
    }

    const tesseractBin = typeof binaries.tesseract === 'string'
      ? binaries.tesseract.trim()
      : '';
    if (!tesseractBin) {
      errors.push(`Profile '${key}' is missing binaries.tesseract.`);
    }

    const pdftoppmBin = typeof binaries.pdftoppm === 'string'
      ? binaries.pdftoppm.trim()
      : '';
    if (!pdftoppmBin) {
      errors.push(`Profile '${key}' is missing binaries.pdftoppm.`);
    }
  });

  return {
    ok: errors.length === 0,
    errors,
    profileCount: keys.length,
  };
}

// =============================================================================
// Exports / module surface
// =============================================================================

module.exports = {
  TARGET_PROFILE_REGISTRY,
  getProfileKey,
  getProfileByKey,
  listProfileKeys,
  validateRegistry,
};

// =============================================================================
// End of electron/import_ocr/platform/profile_registry.js
// =============================================================================
