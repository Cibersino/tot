// electron/text_extraction_platform/text_extraction_heavy_pdf_split_core.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Shared heavy-PDF split planning helpers for text extraction.
// Responsibilities:
// - Own the provider size limit used by heavy OCR split planning.
// - Detect when a source PDF exceeds the OCR provider input limit.
// - Build ordered generated-input preview metadata from source PDF metadata only.
// =============================================================================

// =============================================================================
// Imports
// =============================================================================

const {
  OCR_PROVIDER_LIMIT_MB,
  HEAVY_SPLIT_SAFETY_FACTOR,
} = require('../constants_main');
const {
  resolveProcessingInputFileName,
} = require('./text_extraction_pdf_selection_pipeline');

// =============================================================================
// Constants / config
// =============================================================================

const OCR_PROVIDER_LIMIT_BYTES = OCR_PROVIDER_LIMIT_MB * 1024 * 1024;

// =============================================================================
// Helpers
// =============================================================================

function toPositiveIntegerOrZero(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function roundToOneDecimal(rawValue) {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round(value * 10) / 10;
}

function bytesToMegabytes(bytes) {
  const safeBytes = toPositiveIntegerOrZero(bytes);
  if (safeBytes < 1) return 0;
  return safeBytes / (1024 * 1024);
}

function isHeavyPdfBySourceSize(sourceFileSizeBytes, providerLimitBytes = OCR_PROVIDER_LIMIT_BYTES) {
  const safeSizeBytes = toPositiveIntegerOrZero(sourceFileSizeBytes);
  const safeLimitBytes = toPositiveIntegerOrZero(providerLimitBytes);
  if (safeSizeBytes < 1 || safeLimitBytes < 1) return false;
  return safeSizeBytes > safeLimitBytes;
}

function buildHeavyPdfSplitPlan({
  fileInfo,
  sourceTotalPages,
  sourceFileSizeBytes,
  providerLimitBytes = OCR_PROVIDER_LIMIT_BYTES,
  safetyFactor = HEAVY_SPLIT_SAFETY_FACTOR,
} = {}) {
  const safeTotalPages = toPositiveIntegerOrZero(sourceTotalPages);
  const safeSourceBytes = toPositiveIntegerOrZero(sourceFileSizeBytes);
  const safeProviderLimitBytes = toPositiveIntegerOrZero(providerLimitBytes) || OCR_PROVIDER_LIMIT_BYTES;
  const safeSafetyFactor = Number.isFinite(Number(safetyFactor)) && Number(safetyFactor) > 0
    ? Number(safetyFactor)
    : HEAVY_SPLIT_SAFETY_FACTOR;
  const sourceFileMB = bytesToMegabytes(safeSourceBytes);
  const providerLimitMB = bytesToMegabytes(safeProviderLimitBytes);
  const targetPartBytes = Math.floor(safeProviderLimitBytes * safeSafetyFactor);
  const targetPartMB = bytesToMegabytes(targetPartBytes);

  if (safeTotalPages < 1 || safeSourceBytes < 1 || targetPartBytes < 1) {
    return {
      ok: false,
      sourceTotalPages: safeTotalPages,
      sourceFileSizeBytes: safeSourceBytes,
      sourceFileMB: roundToOneDecimal(sourceFileMB),
      providerLimitBytes: safeProviderLimitBytes,
      providerLimitMB: roundToOneDecimal(providerLimitMB),
      safetyFactor: safeSafetyFactor,
      targetPartBytes,
      targetPartMB: roundToOneDecimal(targetPartMB),
      pagesPerGeneratedInput: 0,
      generatedInputs: [],
    };
  }

  const pagesPerGeneratedInput = Math.max(
    1,
    Math.floor((safeTotalPages * targetPartBytes) / safeSourceBytes)
  );
  const generatedInputs = [];

  let inputIndex = 1;
  for (let fromPage = 1; fromPage <= safeTotalPages; fromPage += pagesPerGeneratedInput) {
    const toPage = Math.min(safeTotalPages, fromPage + pagesPerGeneratedInput - 1);
    const pdfPageSelection = {
      mode: 'range',
      fromPage,
      toPage,
      selectedPageCount: (toPage - fromPage) + 1,
      totalPages: safeTotalPages,
    };
    generatedInputs.push({
      inputIndex,
      fromPage,
      toPage,
      pdfPageSelection,
      processingInputFileName: resolveProcessingInputFileName({
        fileInfo,
        pdfPageSelection,
      }),
    });
    inputIndex += 1;
  }

  return {
    ok: true,
    sourceTotalPages: safeTotalPages,
    sourceFileSizeBytes: safeSourceBytes,
    sourceFileMB: roundToOneDecimal(sourceFileMB),
    providerLimitBytes: safeProviderLimitBytes,
    providerLimitMB: roundToOneDecimal(providerLimitMB),
    safetyFactor: safeSafetyFactor,
    targetPartBytes,
    targetPartMB: roundToOneDecimal(targetPartMB),
    pagesPerGeneratedInput,
    generatedInputs,
  };
}

// =============================================================================
// Exports / module surface
// =============================================================================

module.exports = {
  OCR_PROVIDER_LIMIT_BYTES,
  OCR_PROVIDER_LIMIT_MB,
  HEAVY_SPLIT_SAFETY_FACTOR,
  buildHeavyPdfSplitPlan,
  bytesToMegabytes,
  isHeavyPdfBySourceSize,
};

// =============================================================================
// End of electron/text_extraction_platform/text_extraction_heavy_pdf_split_core.js
// =============================================================================
