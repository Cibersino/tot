// electron/text_extraction_platform/ocr_jp2_normalization.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// JP2-specific OCR upload normalization helper.
// Responsibilities:
// - Load the bundled OpenJPEG WASM runtime only when JP2 normalization is needed.
// - Decode JP2 sources into raw pixels and materialize a temporary PNG upload input.
// - Reuse the OCR image-normalization error taxonomy and cleanup-warning shape.

// =============================================================================
// Imports
// =============================================================================

const fs = require('fs');
const path = require('path');
const {
  cleanupRuntimeTempRunDir,
  createRuntimeTempRunDir,
} = require('../app_temp_paths');

// =============================================================================
// Constants / runtime cache
// =============================================================================

const SUPPORTED_RAW_CHANNEL_COUNTS = new Set([1, 2, 3, 4]);
let cachedOpenJpegRuntimePromise = null;

// =============================================================================
// Error and cleanup helpers
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

function buildCleanupFailureWarning(cleanupWarning, tempDirPath) {
  if (!cleanupWarning || typeof cleanupWarning.warningCode !== 'string') {
    return null;
  }
  return {
    warningCode: 'cleanup:image_normalization_cleanup_failed',
    detailsSafeForLogs: {
      stage: 'cleanup_image_normalization',
      tempDirPath: String(tempDirPath || '').trim(),
      cleanupWarningCode: cleanupWarning.warningCode,
      cleanupWarningDetails:
        cleanupWarning.detailsSafeForLogs && typeof cleanupWarning.detailsSafeForLogs === 'object'
          ? { ...cleanupWarning.detailsSafeForLogs }
          : {},
    },
  };
}

function cleanupTempDir(tempDirPath) {
  const cleanupWarning = cleanupRuntimeTempRunDir(tempDirPath, { force: true });
  return buildCleanupFailureWarning(cleanupWarning, tempDirPath);
}

function createBaseName(sourceFileName) {
  const base = path.basename(
    String(sourceFileName || ''),
    path.extname(String(sourceFileName || ''))
  );
  return base || 'ocr_source';
}

// =============================================================================
// Runtime helpers
// =============================================================================

function loadSharpLib(sourceFileExt) {
  try {
    return require('sharp');
  } catch (err) {
    throw buildNormalizationError(
      'image_normalizer_unavailable',
      'Sharp dependency is unavailable for JP2 normalization.',
      {
        reason: 'sharp_require_failed',
        sourceFileExt,
        errorName: toSafeErrorName(err),
        errorMessage: toSafeErrorMessage(err),
      }
    );
  }
}

function loadOpenJpegRuntime(sourceFileExt) {
  if (!cachedOpenJpegRuntimePromise) {
    cachedOpenJpegRuntimePromise = (async () => {
      let OpenJPEGWASM = null;

      try {
        OpenJPEGWASM = require('./openjpeg_wasm_runtime');
      } catch (err) {
        throw buildNormalizationError(
          'image_normalizer_unavailable',
          'JP2 decoder runtime is unavailable in this app build.',
          {
            reason: 'openjpeg_require_failed',
            sourceFileExt,
            errorName: toSafeErrorName(err),
            errorMessage: toSafeErrorMessage(err),
          }
        );
      }

      if (typeof OpenJPEGWASM !== 'function') {
        throw buildNormalizationError(
          'image_normalizer_unavailable',
          'JP2 decoder runtime entrypoint is unavailable in this app build.',
          {
            reason: 'openjpeg_missing_runtime_factory',
            sourceFileExt,
          }
        );
      }

      try {
        const runtime = await OpenJPEGWASM();
        if (!runtime || typeof runtime.J2KDecoder !== 'function') {
          throw new Error('OpenJPEG runtime did not expose J2KDecoder.');
        }
        return runtime;
      } catch (err) {
        throw buildNormalizationError(
          'image_normalizer_unavailable',
          'JP2 decoder runtime could not initialize in this app build.',
          {
            reason: 'openjpeg_runtime_init_failed',
            sourceFileExt,
            errorName: toSafeErrorName(err),
            errorMessage: toSafeErrorMessage(err),
          }
        );
      }
    })().catch((err) => {
      cachedOpenJpegRuntimePromise = null;
      throw err;
    });
  }

  return cachedOpenJpegRuntimePromise;
}

function toNodeBuffer(value) {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }
  throw new Error('Decoded JP2 buffer has an unsupported shape.');
}

function getRawDepth(bitsPerSample) {
  if (bitsPerSample === 8) return 'uchar';
  if (bitsPerSample === 16) return 'ushort';
  return '';
}

function validateDecodedFrame({ frameInfo, decodedBuffer }) {
  const width = Number(frameInfo && frameInfo.width);
  const height = Number(frameInfo && frameInfo.height);
  const bitsPerSample = Number(frameInfo && frameInfo.bitsPerSample);
  const componentCount = Number(frameInfo && frameInfo.componentCount);
  const isSigned = !!(frameInfo && frameInfo.isSigned);
  const rawDepth = getRawDepth(bitsPerSample);

  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    throw new Error('Decoded JP2 frame dimensions are invalid.');
  }
  if (!Number.isInteger(componentCount) || !SUPPORTED_RAW_CHANNEL_COUNTS.has(componentCount)) {
    throw new Error(`Decoded JP2 component count is unsupported: ${componentCount}.`);
  }
  if (!rawDepth) {
    throw new Error(`Decoded JP2 bit depth is unsupported: ${bitsPerSample}.`);
  }
  if (isSigned) {
    throw new Error('Decoded JP2 signed sample output is unsupported.');
  }

  const bytesPerSample = bitsPerSample / 8;
  const expectedByteLength = width * height * componentCount * bytesPerSample;
  const decodedByteLength = toNodeBuffer(decodedBuffer).byteLength;
  if (!Number.isSafeInteger(expectedByteLength) || decodedByteLength !== expectedByteLength) {
    throw new Error('Decoded JP2 buffer size does not match frame metadata.');
  }

  return {
    width,
    height,
    channels: componentCount,
    bitsPerSample,
    rawDepth,
  };
}

// =============================================================================
// Normalization entrypoint
// =============================================================================

async function normalizeJp2ForOcrUpload({ fileInfo } = {}) {
  if (!fileInfo || typeof fileInfo !== 'object') {
    throw buildNormalizationError(
      'image_normalizer_unavailable',
      'JP2 normalizer received invalid file context.',
      { reason: 'invalid_file_info' }
    );
  }

  const sharpLib = loadSharpLib(fileInfo.sourceFileExt);
  const openjpeg = await loadOpenJpegRuntime(fileInfo.sourceFileExt);

  const tempDirPath = createRuntimeTempRunDir('ocr-image');
  const uploadFileName = `${createBaseName(fileInfo.sourceFileName)}.png`;
  const uploadFilePath = path.join(tempDirPath, uploadFileName);
  let decoder = null;
  let validatedFrame = null;

  try {
    const sourceBuffer = fs.readFileSync(fileInfo.absoluteFilePath);
    if (sourceBuffer.byteLength <= 0) {
      throw new Error('JP2 source file is empty.');
    }

    decoder = new openjpeg.J2KDecoder();
    const encodedBuffer = decoder.getEncodedBuffer(sourceBuffer.byteLength);
    encodedBuffer.set(sourceBuffer);
    decoder.decodeSubResolution(0, 0);

    const decodedBuffer = decoder.getDecodedBuffer();
    const frameInfo = decoder.getFrameInfo();
    validatedFrame = validateDecodedFrame({ frameInfo, decodedBuffer });
    const decodedPixelBuffer = toNodeBuffer(decodedBuffer);

    await sharpLib(decodedPixelBuffer, {
      raw: {
        width: validatedFrame.width,
        height: validatedFrame.height,
        channels: validatedFrame.channels,
        depth: validatedFrame.rawDepth,
      },
    })
      .removeAlpha()
      .grayscale()
      .png({ palette: true })
      .toFile(uploadFilePath);

    const stat = fs.statSync(uploadFilePath);
    if (!stat.isFile() || stat.size <= 0) {
      throw new Error('Converted PNG output is missing or empty.');
    }
  } catch (err) {
    const cleanupWarning = cleanupTempDir(tempDirPath);
    throw buildNormalizationError(
      'source_to_png_conversion_failed',
      'JP2-to-PNG normalization failed.',
      {
        reason: 'jp2_source_to_png_failed',
        sourceFileExt: fileInfo.sourceFileExt,
        errorName: toSafeErrorName(err),
        errorMessage: toSafeErrorMessage(err),
        ...(cleanupWarning
          ? {
            cleanupWarningCode: cleanupWarning.warningCode,
            cleanupFailure: cleanupWarning.detailsSafeForLogs,
          }
          : {}),
      }
    );
  } finally {
    if (decoder && typeof decoder.delete === 'function') {
      try {
        decoder.delete();
      } catch (_err) {
        // Decoder teardown errors are ignored because upload-materialization outcome is already decided.
      }
    }
  }

  return {
    uploadFilePath,
    uploadFileName,
    uploadMimeType: 'image/png',
    metadataSafeForLogs: {
      normalizedFrom: 'jp2',
      decodedWidth: validatedFrame.width,
      decodedHeight: validatedFrame.height,
      decodedComponentCount: validatedFrame.channels,
      decodedBitsPerSample: validatedFrame.bitsPerSample,
      normalizedColorMode: 'grayscale_palette_png',
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
  normalizeJp2ForOcrUpload,
};

// =============================================================================
// End of electron/text_extraction_platform/ocr_jp2_normalization.js
// =============================================================================
