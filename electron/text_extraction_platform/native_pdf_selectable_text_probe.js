// electron/text_extraction_platform/native_pdf_selectable_text_probe.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Native PDF text-layer probe used during route preparation.
// Responsibilities:
// - Lazily load the PDF.js parser used for selectable-text detection.
// - Probe PDF pages for visible text items without extracting full document text.
// - Return a structured probe result for native-vs-OCR route triage.
// - Classify parser failures into the probe error contract used by text extraction.
// - Release the PDF document handle on exit, with best-effort cleanup logging.

// =============================================================================
// Imports
// =============================================================================

const fs = require('fs');
const path = require('path');

// =============================================================================
// Module-level parser state
// =============================================================================

let PDFJS = null;

// =============================================================================
// Parser loading
// =============================================================================

function getPdfJs() {
  if (!PDFJS) {
    PDFJS = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
    PDFJS.disableWorker = true;
  }
  return PDFJS;
}

// =============================================================================
// Source and error helpers
// =============================================================================

function buildError(code, message, detailsSafeForLogs = {}) {
  return {
    code,
    message,
    detailsSafeForLogs,
  };
}

function getSourceInfo(filePath) {
  const absPath = path.resolve(String(filePath || ''));
  const fileName = path.basename(absPath);
  const fileExtWithDot = path.extname(absPath).toLowerCase();
  const fileExt = fileExtWithDot.replace('.', '');

  return {
    absPath,
    fileName,
    fileExt,
    fileExtWithDot,
  };
}

function isCorruptOrUnreadableParserError(err) {
  if (!err) return false;
  const code = typeof err.code === 'string' ? err.code.trim() : '';
  const message = String(err && err.message ? err.message : '').toLowerCase();

  if (code === 'ENOENT' || code === 'EISDIR' || code === 'EACCES' || code === 'EPERM') {
    return true;
  }

  if (message.includes('invalid pdf')
    || message.includes('bad xref')
    || message.includes('unexpected response')
    || message.includes('formaterror')
    || message.includes('missing pdf')) {
    return true;
  }

  return false;
}

function isPdfPasswordProtectedParserError(err) {
  if (!err) return false;
  const name = String(err && err.name ? err.name : '').toLowerCase();
  const message = String(err && err.message ? err.message : '').toLowerCase();
  const code = String(err && err.code ? err.code : '').trim();

  return (
    name.includes('passwordexception')
    || (name.includes('password') && name.includes('exception'))
    || message.includes('password')
    || message.includes('encrypted')
    || code === '1'
  );
}

// =============================================================================
// Probe flow helpers
// =============================================================================

function ensureNotAborted(isAborted) {
  if (typeof isAborted === 'function' && isAborted()) {
    const abortError = new Error('Native PDF probe cancelled by user.');
    abortError.code = 'aborted_by_user';
    throw abortError;
  }
}

function hasVisibleTextItem(item) {
  const value = item && typeof item.str === 'string' ? item.str : '';
  return value.trim().length > 0;
}

function buildSuccess(selectableText, metadataSafeForLogs) {
  return {
    state: 'success',
    selectableText,
    metadataSafeForLogs,
    error: null,
  };
}

function buildFailure(selectableText, metadataSafeForLogs, error) {
  return {
    state: 'failure',
    selectableText,
    metadataSafeForLogs,
    error,
  };
}

// =============================================================================
// Probe entrypoint
// =============================================================================

async function probeNativePdfSelectableText({
  filePath,
  isAborted,
  log,
} = {}) {
  const source = getSourceInfo(filePath);
  const startedAt = Date.now();
  const baseMetadata = {
    pagesScanned: 0,
    totalPages: 0,
    foundAtPage: null,
    elapsedMs: 0,
  };

  if (!source.absPath || !fs.existsSync(source.absPath)) {
    return buildFailure(
      'unknown',
      {
        ...baseMetadata,
        elapsedMs: Date.now() - startedAt,
      },
      buildError(
        'unreadable_or_corrupt',
        'Selected file is missing or unreadable.',
        { stage: 'preflight', reason: 'missing_source_file' }
      )
    );
  }

  try {
    const stats = fs.statSync(source.absPath);
    if (!stats.isFile()) {
      return buildFailure(
        'unknown',
        {
          ...baseMetadata,
          elapsedMs: Date.now() - startedAt,
        },
        buildError(
          'unreadable_or_corrupt',
          'Selected path is not a readable file.',
          { stage: 'preflight', reason: 'not_a_file', sourceFileExt: source.fileExt }
        )
      );
    }
  } catch (err) {
    return buildFailure(
      'unknown',
      {
        ...baseMetadata,
        elapsedMs: Date.now() - startedAt,
      },
      buildError(
        'unreadable_or_corrupt',
        'Selected file is missing or unreadable.',
        {
          stage: 'preflight',
          reason: 'stat_failed',
          errorName: String(err && err.name ? err.name : 'Error'),
          errorCode: String(err && err.code ? err.code : ''),
        }
      )
    );
  }

  let documentHandle = null;

  try {
    ensureNotAborted(isAborted);

    const pdfBuffer = fs.readFileSync(source.absPath);
    const pdfjs = getPdfJs();
    documentHandle = await pdfjs.getDocument(pdfBuffer);

    const totalPages = Number.isFinite(documentHandle.numPages) ? documentHandle.numPages : 0;
    let pagesScanned = 0;
    let foundAtPage = null;

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      ensureNotAborted(isAborted);

      const page = await documentHandle.getPage(pageNumber);
      const textContent = await page.getTextContent({
        normalizeWhitespace: false,
        disableCombineTextItems: false,
      });

      pagesScanned = pageNumber;

      if (Array.isArray(textContent && textContent.items)
        && textContent.items.some((item) => hasVisibleTextItem(item))) {
        foundAtPage = pageNumber;
        return buildSuccess(
          'present',
          {
            pagesScanned,
            totalPages,
            foundAtPage,
            elapsedMs: Date.now() - startedAt,
          }
        );
      }
    }

    return buildSuccess(
      'absent',
      {
        pagesScanned: totalPages,
        totalPages,
        foundAtPage,
        elapsedMs: Date.now() - startedAt,
      }
    );
  } catch (err) {
    if (String(err && err.code || '') === 'aborted_by_user') {
      return buildFailure(
        'unknown',
        {
          ...baseMetadata,
          elapsedMs: Date.now() - startedAt,
        },
        buildError(
          'aborted_by_user',
          'Native PDF probe was cancelled by user.',
          { stage: 'runtime', reason: 'user_abort' }
        )
      );
    }

    log.warn('Native PDF selectable-text probe failed:', {
      sourceFileExt: source.fileExt,
      errorName: String(err && err.name ? err.name : 'Error'),
      errorCode: String(err && err.code ? err.code : ''),
    });

    let errorCode = 'native_extraction_failed';
    let errorMessage = 'Native PDF probe failed due to parser/runtime error.';
    let failureType = 'parser_runtime_error';

    if (isPdfPasswordProtectedParserError(err)) {
      errorCode = 'native_encrypted_or_password_protected';
      errorMessage = 'Selected PDF is encrypted or password-protected for native extraction.';
      failureType = 'pdf_password_protected';
    } else if (isCorruptOrUnreadableParserError(err)) {
      errorCode = 'unreadable_or_corrupt';
      errorMessage = 'Selected PDF is unreadable or corrupt for native extraction.';
      failureType = 'corrupt_or_unreadable';
    }

    return buildFailure(
      'unknown',
      {
        ...baseMetadata,
        elapsedMs: Date.now() - startedAt,
      },
      buildError(
        errorCode,
        errorMessage,
        {
          stage: 'parse',
          nativeFailureType: failureType,
          sourceFileExt: source.fileExt,
          errorName: String(err && err.name ? err.name : 'Error'),
          errorCode: String(err && err.code ? err.code : ''),
          errorMessage: String(err && err.message ? err.message : err || ''),
        }
      )
    );
  } finally {
    if (documentHandle && typeof documentHandle.destroy === 'function') {
      try {
        documentHandle.destroy();
      } catch (err) {
        log.warn('Native PDF selectable-text probe cleanup failed (ignored):', {
          sourceFileExt: source.fileExt,
          errorName: String(err && err.name ? err.name : 'Error'),
        });
      }
    }
  }
}

// =============================================================================
// Exports / module surface
// =============================================================================

module.exports = {
  probeNativePdfSelectableText,
};

// =============================================================================
// End of electron/text_extraction_platform/native_pdf_selectable_text_probe.js
// =============================================================================


