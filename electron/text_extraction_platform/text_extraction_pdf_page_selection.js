'use strict';

// =============================================================================
// Overview
// =============================================================================
// Shared PDF page-selection helpers for text extraction.
// Responsibilities:
// - Inspect one PDF to obtain page-count metadata before prepare.
// - Canonicalize renderer-provided PDF selection and artifact-policy payloads.
// - Derive stable processing-input filenames for status/UI/reporting.
// - Materialize selected-page subset PDFs for execute-time native/OCR parity.

// =============================================================================
// Imports
// =============================================================================

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const {
  isPdfPasswordProtectedError,
  isUnreadableOrCorruptPdfError,
} = require('./text_extraction_pdf_error_detection');

// =============================================================================
// Constants / config
// =============================================================================

const GENERATED_PDF_TEMP_ROOT_NAME = 'tot-generated-pdfs';

// =============================================================================
// Error / normalization helpers
// =============================================================================

function buildError(code, message, detailsSafeForLogs = {}) {
  return {
    code,
    message,
    detailsSafeForLogs,
  };
}

function toSafeFilePath(fileInfo) {
  return fileInfo && typeof fileInfo.filePath === 'string'
    ? fileInfo.filePath
    : '';
}

function toSafeFileName(fileInfo) {
  return fileInfo && typeof fileInfo.fileName === 'string'
    ? fileInfo.fileName
    : '';
}

function toPositiveIntegerOrNull(rawValue) {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1) return null;
  return value;
}

function classifyPdfLoadError(err, stage) {
  if (isPdfPasswordProtectedError(err)) {
    return buildError(
      'native_encrypted_or_password_protected',
      'Selected PDF is encrypted or password-protected.',
      {
        stage,
        errorName: String(err && err.name ? err.name : 'Error'),
        errorCode: String(err && err.code ? err.code : ''),
        errorMessage: String(err && err.message ? err.message : err || ''),
      }
    );
  }

  if (isUnreadableOrCorruptPdfError(err)) {
    return buildError(
      'unreadable_or_corrupt',
      'Selected PDF is unreadable or corrupt.',
      {
        stage,
        errorName: String(err && err.name ? err.name : 'Error'),
        errorCode: String(err && err.code ? err.code : ''),
        errorMessage: String(err && err.message ? err.message : err || ''),
      }
    );
  }

  return buildError(
    stage === 'inspect' ? 'pdf_page_count_unavailable' : 'pdf_subset_creation_failed',
    stage === 'inspect'
      ? 'PDF page count could not be inspected.'
      : 'Selected-page PDF subset could not be created.',
    {
      stage,
      errorName: String(err && err.name ? err.name : 'Error'),
      errorCode: String(err && err.code ? err.code : ''),
      errorMessage: String(err && err.message ? err.message : err || ''),
    }
  );
}

function sanitizePdfBaseName(rawFileName) {
  const original = String(rawFileName || '').trim();
  const parsed = path.parse(original);
  const candidate = (parsed.name || '').trim();
  const sanitized = candidate.replace(/[<>:"/\\|?*\u0000-\u001F]+/g, '_').replace(/\s+/g, ' ').trim();
  return sanitized || 'document';
}

function cleanupMaterializationFailure(runDir) {
  const safeRunDir = typeof runDir === 'string' ? runDir.trim() : '';
  if (!safeRunDir || !fs.existsSync(safeRunDir)) return;
  try {
    fs.rmSync(safeRunDir, { recursive: true, force: true });
  } catch (_err) {
    // Keep the original materialization failure primary; cleanup is best-effort here.
  }
}

// =============================================================================
// Inspect / canonical state helpers
// =============================================================================

async function inspectPdfFile({ fileInfo } = {}) {
  const safeFileInfo = fileInfo && typeof fileInfo === 'object' ? fileInfo : {};
  if (safeFileInfo.sourceFileKind !== 'pdf') {
    return {
      ok: true,
      isPdf: false,
      totalPages: null,
      error: null,
    };
  }

  const sourceFilePath = toSafeFilePath(safeFileInfo);
  const resolvedPath = path.resolve(sourceFilePath || '');

  try {
    const stats = fs.statSync(resolvedPath);
    if (!stats.isFile()) {
      return {
        ok: true,
        isPdf: true,
        totalPages: null,
        error: buildError(
          'unreadable_or_corrupt',
          'Selected PDF path is not a readable file.',
          {
            stage: 'inspect_preflight',
            reason: 'not_a_file',
          }
        ),
      };
    }
  } catch (err) {
    return {
      ok: true,
      isPdf: true,
      totalPages: null,
      error: buildError(
        'unreadable_or_corrupt',
        'Selected PDF is missing or unreadable.',
        {
          stage: 'inspect_preflight',
          reason: 'stat_failed',
          errorName: String(err && err.name ? err.name : 'Error'),
          errorCode: String(err && err.code ? err.code : ''),
        }
      ),
    };
  }

  try {
    const pdfBytes = fs.readFileSync(resolvedPath);
    const pdfDocument = await PDFDocument.load(pdfBytes, { ignoreEncryption: false });
    const totalPages = pdfDocument.getPageCount();
    if (!Number.isInteger(totalPages) || totalPages < 1) {
      return {
        ok: true,
        isPdf: true,
        totalPages: null,
        error: buildError(
          'pdf_page_count_unavailable',
          'PDF page count could not be inspected.',
          {
            stage: 'inspect',
            reason: 'invalid_page_count',
          }
        ),
      };
    }

    return {
      ok: true,
      isPdf: true,
      totalPages,
      error: null,
    };
  } catch (err) {
    return {
      ok: true,
      isPdf: true,
      totalPages: null,
      error: classifyPdfLoadError(err, 'inspect'),
    };
  }
}

function canonicalizePdfPageSelection(requestedSelection, { totalPages } = {}) {
  const safeTotalPages = toPositiveIntegerOrNull(totalPages);
  if (!safeTotalPages) {
    return {
      ok: false,
      error: buildError(
        'pdf_page_count_unavailable',
        'PDF page count could not be inspected.',
        {
          stage: 'prepare',
          reason: 'missing_total_pages',
        }
      ),
    };
  }

  const rawSelection = requestedSelection && typeof requestedSelection === 'object'
    ? requestedSelection
    : {};
  const requestedMode = typeof rawSelection.mode === 'string'
    ? rawSelection.mode.trim().toLowerCase()
    : '';

  if (!requestedMode || requestedMode === 'all') {
    return {
      ok: true,
      pdfPageSelection: {
        mode: 'all',
        fromPage: 1,
        toPage: safeTotalPages,
        selectedPageCount: safeTotalPages,
        totalPages: safeTotalPages,
      },
    };
  }

  if (requestedMode !== 'range') {
    return {
      ok: false,
      error: buildError(
        'pdf_page_selection_invalid',
        'Selected PDF page range is invalid.',
        {
          stage: 'prepare',
          reason: 'invalid_mode',
          requestedMode,
        }
      ),
    };
  }

  const fromPage = toPositiveIntegerOrNull(rawSelection.fromPage);
  const toPage = toPositiveIntegerOrNull(rawSelection.toPage);
  if (!fromPage || !toPage) {
    return {
      ok: false,
      error: buildError(
        'pdf_page_selection_invalid',
        'Selected PDF page range is invalid.',
        {
          stage: 'prepare',
          reason: 'non_integer_bounds',
          fromPage: rawSelection.fromPage,
          toPage: rawSelection.toPage,
        }
      ),
    };
  }

  if (fromPage > toPage) {
    return {
      ok: false,
      error: buildError(
        'pdf_page_selection_invalid',
        'Selected PDF page range is invalid.',
        {
          stage: 'prepare',
          reason: 'from_page_after_to_page',
          fromPage,
          toPage,
          totalPages: safeTotalPages,
        }
      ),
    };
  }

  if (fromPage < 1 || toPage > safeTotalPages) {
    return {
      ok: false,
      error: buildError(
        'pdf_page_selection_invalid',
        'Selected PDF page range is invalid.',
        {
          stage: 'prepare',
          reason: 'bounds_out_of_range',
          fromPage,
          toPage,
          totalPages: safeTotalPages,
        }
      ),
    };
  }

  return {
    ok: true,
    pdfPageSelection: {
      mode: 'range',
      fromPage,
      toPage,
      selectedPageCount: (toPage - fromPage) + 1,
      totalPages: safeTotalPages,
    },
  };
}

function canonicalizeGeneratedPdfArtifactPolicy(requestedPolicy) {
  const rawPolicy = requestedPolicy && typeof requestedPolicy === 'object'
    ? requestedPolicy
    : {};
  const requestedMode = typeof rawPolicy.mode === 'string'
    ? rawPolicy.mode.trim().toLowerCase()
    : '';

  return {
    mode: requestedMode === 'keep' ? 'keep' : 'delete',
  };
}

function isRangePdfPageSelection(pdfPageSelection) {
  return !!(pdfPageSelection
    && pdfPageSelection.mode === 'range'
    && Number.isInteger(pdfPageSelection.fromPage)
    && Number.isInteger(pdfPageSelection.toPage)
    && pdfPageSelection.fromPage >= 1
    && pdfPageSelection.toPage >= pdfPageSelection.fromPage);
}

function buildGeneratedSubsetFileName(fileInfo, pdfPageSelection) {
  const safeBaseName = sanitizePdfBaseName(toSafeFileName(fileInfo));
  return `${safeBaseName}_pages_${pdfPageSelection.fromPage}_${pdfPageSelection.toPage}.pdf`;
}

function resolveProcessingInputFileName({ fileInfo, pdfPageSelection } = {}) {
  if (isRangePdfPageSelection(pdfPageSelection)) {
    return buildGeneratedSubsetFileName(fileInfo, pdfPageSelection);
  }
  return toSafeFileName(fileInfo);
}

// =============================================================================
// Execute-time subset materialization
// =============================================================================

async function materializePdfPageSelectionInput({
  fileInfo,
  pdfPageSelection,
  generatedPdfArtifactPolicy,
  retainedArtifactsDir = '',
} = {}) {
  const safeFileInfo = fileInfo && typeof fileInfo === 'object' ? fileInfo : {};
  const safeSelection = pdfPageSelection && typeof pdfPageSelection === 'object'
    ? pdfPageSelection
    : null;
  const safePolicy = canonicalizeGeneratedPdfArtifactPolicy(generatedPdfArtifactPolicy);
  const processingInputFileName = resolveProcessingInputFileName({
    fileInfo: safeFileInfo,
    pdfPageSelection: safeSelection,
  });

  if (!isRangePdfPageSelection(safeSelection)) {
    return {
      ok: true,
      materialized: false,
      effectiveFilePath: toSafeFilePath(safeFileInfo),
      processingInputFileName,
      processingInputSource: 'original_selected_file',
      generatedPdfArtifact: null,
      retainedArtifactPath: '',
      cleanupGeneratedArtifact: () => null,
    };
  }

  const sourceFilePath = path.resolve(toSafeFilePath(safeFileInfo) || '');
  const runId = crypto.randomUUID();
  const retainedArtifactsDirRaw = String(retainedArtifactsDir || '').trim();
  const runRoot = safePolicy.mode === 'keep'
    ? (retainedArtifactsDirRaw ? path.resolve(retainedArtifactsDirRaw) : '')
    : path.join(os.tmpdir(), GENERATED_PDF_TEMP_ROOT_NAME);
  if (safePolicy.mode === 'keep' && !runRoot) {
    return {
      ok: false,
      error: buildError(
        'pdf_subset_creation_failed',
        'Selected-page PDF subset could not be created.',
        {
          stage: 'materialize_subset',
          reason: 'retained_artifacts_dir_missing',
          policyMode: safePolicy.mode,
        }
      ),
    };
  }

  const runDir = path.join(runRoot, `run-${runId}`);
  const subsetFileName = processingInputFileName;
  const subsetFilePath = path.join(runDir, subsetFileName);

  try {
    fs.mkdirSync(runDir, { recursive: true });

    const sourceBytes = fs.readFileSync(sourceFilePath);
    const sourcePdf = await PDFDocument.load(sourceBytes, { ignoreEncryption: false });
    const sourceTotalPages = sourcePdf.getPageCount();
    if (!Number.isInteger(sourceTotalPages)
      || sourceTotalPages < 1
      || safeSelection.toPage > sourceTotalPages) {
      cleanupMaterializationFailure(runDir);
      return {
        ok: false,
        error: buildError(
          'pdf_page_selection_invalid',
          'Selected PDF page range is invalid.',
          {
            stage: 'materialize_subset',
            reason: 'bounds_out_of_range',
            fromPage: safeSelection.fromPage,
            toPage: safeSelection.toPage,
            totalPages: sourceTotalPages,
          }
        ),
      };
    }

    const subsetPdf = await PDFDocument.create();
    const zeroBasedIndices = [];
    for (let pageNumber = safeSelection.fromPage; pageNumber <= safeSelection.toPage; pageNumber += 1) {
      zeroBasedIndices.push(pageNumber - 1);
    }

    const copiedPages = await subsetPdf.copyPages(sourcePdf, zeroBasedIndices);
    copiedPages.forEach((page) => {
      subsetPdf.addPage(page);
    });

    const subsetBytes = await subsetPdf.save();
    fs.writeFileSync(subsetFilePath, subsetBytes);

    return {
      ok: true,
      materialized: true,
      effectiveFilePath: subsetFilePath,
      processingInputFileName: subsetFileName,
      processingInputSource: 'generated_pdf_subset',
      generatedPdfArtifact: {
        fileName: subsetFileName,
        policyMode: safePolicy.mode,
        retained: safePolicy.mode === 'keep',
      },
      retainedArtifactPath: safePolicy.mode === 'keep' ? subsetFilePath : '',
      cleanupGeneratedArtifact: () => {
        if (safePolicy.mode !== 'delete') return null;
        if (!fs.existsSync(runDir)) return null;
        try {
          fs.rmSync(runDir, { recursive: true, force: false });
          return null;
        } catch (err) {
          return {
            warningCode: 'cleanup:pdf_subset_cleanup_failed',
            detailsSafeForLogs: {
              stage: 'cleanup_generated_subset',
              runDir,
              fileName: subsetFileName,
              errorName: String(err && err.name ? err.name : 'Error'),
              errorCode: String(err && err.code ? err.code : ''),
              errorMessage: String(err && err.message ? err.message : err || ''),
            },
          };
        }
      },
    };
  } catch (err) {
    cleanupMaterializationFailure(runDir);
    const classifiedError = classifyPdfLoadError(err, 'materialize_subset');
    return {
      ok: false,
      error: {
        ...classifiedError,
        detailsSafeForLogs: {
          ...classifiedError.detailsSafeForLogs,
          policyMode: safePolicy.mode,
          fromPage: safeSelection.fromPage,
          toPage: safeSelection.toPage,
          processingInputFileName: subsetFileName,
        },
      },
    };
  }
}

// =============================================================================
// Exports / module surface
// =============================================================================

module.exports = {
  canonicalizeGeneratedPdfArtifactPolicy,
  canonicalizePdfPageSelection,
  inspectPdfFile,
  materializePdfPageSelectionInput,
  resolveProcessingInputFileName,
};

// =============================================================================
// End of electron/text_extraction_platform/text_extraction_pdf_page_selection.js
// =============================================================================
