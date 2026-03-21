// electron/import_extract_platform/ocr_image_normalization.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// OCR upload image normalization helper.
// Responsibilities:
// - Pass through already upload-ready image inputs without rewriting them.
// - Convert WEBP inputs into temporary PNG files for OCR upload compatibility.
// - Surface normalization/runtime failures through typed errors for the OCR route.
// - Return upload metadata plus a caller-owned cleanup callback for temp artifacts.

// =============================================================================
// Imports
// =============================================================================

const fs = require('fs');
const os = require('os');
const path = require('path');

// =============================================================================
// Error and filesystem helpers
// =============================================================================

function toSafeErrorName(err) {
  return String(err && err.name ? err.name : 'Error');
}

function toSafeErrorMessage(err) {
  return String(err && err.message ? err.message : err || '');
}

function buildNormalizationError(code, message, detailsSafeForLogs = {}) {
  const err = new Error(message);
  err.code = code;
  err.detailsSafeForLogs = detailsSafeForLogs;
  return err;
}

function createBaseName(sourceFileName) {
  const base = path.basename(
    String(sourceFileName || ''),
    path.extname(String(sourceFileName || ''))
  );
  return base || 'ocr_source';
}

function cleanupTempDir(tempDirPath) {
  if (!tempDirPath) return '';
  try {
    if (fs.existsSync(tempDirPath)) {
      fs.rmSync(tempDirPath, { recursive: true, force: true });
    }
    return '';
  } catch {
    return 'cleanup:webp_normalization_cleanup_failed';
  }
}

// =============================================================================
// Upload result shaping
// =============================================================================

function passthroughUpload(fileInfo) {
  return {
    uploadFilePath: fileInfo.absoluteFilePath,
    uploadFileName: fileInfo.sourceFileName,
    uploadMimeType: fileInfo.sourceMimeType,
    metadataSafeForLogs: {},
    cleanup: () => '',
  };
}

// =============================================================================
// Normalization entrypoint
// =============================================================================

async function normalizeImageForOcrUpload({ fileInfo } = {}) {
  if (!fileInfo || typeof fileInfo !== 'object') {
    throw buildNormalizationError(
      'image_normalizer_unavailable',
      'OCR image normalizer received invalid file context.',
      { reason: 'invalid_file_info' }
    );
  }

  if (fileInfo.sourceFileExt !== 'webp') {
    return passthroughUpload(fileInfo);
  }

  let sharpLib = null;
  try {
    sharpLib = require('sharp');
  } catch (err) {
    throw buildNormalizationError(
      'image_normalizer_unavailable',
      'Sharp dependency is unavailable for WEBP normalization.',
      {
        reason: 'sharp_require_failed',
        errorName: toSafeErrorName(err),
        errorMessage: toSafeErrorMessage(err),
      }
    );
  }

  const tempDirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'tot-ocr-webp-'));
  const uploadFileName = `${createBaseName(fileInfo.sourceFileName)}.png`;
  const uploadFilePath = path.join(tempDirPath, uploadFileName);

  try {
    await sharpLib(fileInfo.absoluteFilePath)
      .rotate()
      .png()
      .toFile(uploadFilePath);

    const stat = fs.statSync(uploadFilePath);
    if (!stat.isFile() || stat.size <= 0) {
      throw new Error('Converted PNG output is missing or empty.');
    }
  } catch (err) {
    cleanupTempDir(tempDirPath);
    throw buildNormalizationError(
      'webp_to_png_conversion_failed',
      'WEBP-to-PNG normalization failed.',
      {
        reason: 'sharp_webp_to_png_failed',
        sourceFileExt: fileInfo.sourceFileExt,
        errorName: toSafeErrorName(err),
        errorMessage: toSafeErrorMessage(err),
      }
    );
  }

  return {
    uploadFilePath,
    uploadFileName,
    uploadMimeType: 'image/png',
    metadataSafeForLogs: {
      normalizedFrom: 'webp',
      uploadFileExt: 'png',
      uploadMimeType: 'image/png',
    },
    cleanup: () => cleanupTempDir(tempDirPath),
  };
}

// =============================================================================
// Exports / module surface
// =============================================================================

module.exports = {
  normalizeImageForOcrUpload,
};

// =============================================================================
// End of electron/import_extract_platform/ocr_image_normalization.js
// =============================================================================
