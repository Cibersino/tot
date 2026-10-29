// electron/text_extraction_platform/pdfjs_direct_text_engine.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Direct PDF.js adapter for text-extraction preparation and native execution.
// Owns PDF.js ESM loading, parser-input byte ownership, PDF.js resources, and
// raw text-item serialization. Callers retain application-stage error/result
// contracts, page-selection ownership, and route coordination.

// =============================================================================
// Imports
// =============================================================================

const fs = require('fs');
const path = require('path');
const Log = require('../log');

const log = Log.get('text-extraction-pdfjs');

// =============================================================================
// Constants / module state
// =============================================================================

const PDFJS_DIST_ROOT = path.dirname(require.resolve('pdfjs-dist/package.json'));
const PDFJS_STANDARD_FONTS_DIR = `${path.join(PDFJS_DIST_ROOT, 'standard_fonts').replace(/\\/g, '/')}/`;

let pdfjsModulePromise = null;

// =============================================================================
// PDF.js loading and input ownership
// =============================================================================

function loadPdfjs() {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = import('pdfjs-dist/legacy/build/pdf.mjs').catch((err) => {
      pdfjsModulePromise = null;
      throw err;
    });
  }

  return pdfjsModulePromise;
}

function buildInputReadError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function readPdfFileToOwnedBytes(filePath, operation) {
  const absPath = path.resolve(String(filePath || ''));
  let fileHandle = null;

  try {
    fileHandle = await fs.promises.open(absPath, 'r');
    const stats = await fileHandle.stat();
    const byteLength = stats ? stats.size : null;

    if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
      throw buildInputReadError(
        'PDFJS_INVALID_FILE_SIZE',
        'PDF input has an invalid file size for direct PDF.js loading.'
      );
    }

    const data = new Uint8Array(byteLength);
    let offset = 0;

    while (offset < data.byteLength) {
      const remainingBytes = data.byteLength - offset;
      const readResult = await fileHandle.read(data, offset, remainingBytes, offset);
      const bytesRead = readResult ? readResult.bytesRead : 0;

      if (!Number.isInteger(bytesRead) || bytesRead < 0 || bytesRead > remainingBytes) {
        throw buildInputReadError(
          'PDFJS_INVALID_READ_RESULT',
          'PDF input read returned an invalid byte count.'
        );
      }

      if (bytesRead === 0) {
        throw buildInputReadError(
          'PDFJS_PREMATURE_EOF',
          'PDF input ended before the expected file length was read.'
        );
      }

      offset += bytesRead;
    }

    return data;
  } finally {
    if (fileHandle) {
      try {
        await fileHandle.close();
      } catch (error) {
        log.warn('PDF.js input file handle close failed (ignored):', {
          operation,
          errorName: String(error && error.name ? error.name : 'Error'),
          errorCode: String(error && error.code ? error.code : ''),
        });
      }
    }
  }
}

// =============================================================================
// PDF.js resource lifetime
// =============================================================================

async function runWithPdfjsDocument({ filePath, operation, runDocument } = {}) {
  const pdfjs = await loadPdfjs();
  const data = await readPdfFileToOwnedBytes(filePath, operation);
  let loadingTask = null;

  try {
    loadingTask = pdfjs.getDocument({
      data,
      standardFontDataUrl: PDFJS_STANDARD_FONTS_DIR,
      stopAtErrors: false,
      verbosity: pdfjs.VerbosityLevel.WARNINGS,
    });

    const documentHandle = await loadingTask.promise;
    return await runDocument({
      documentHandle,
      getTextContent: async (pageNumber) => {
        let page = null;

        try {
          page = await documentHandle.getPage(pageNumber);
          return await page.getTextContent();
        } finally {
          if (page) {
            try {
              page.cleanup();
            } catch (error) {
              log.warn('PDF.js page cleanup failed (ignored):', {
                operation,
                pageNumber,
                errorName: String(error && error.name ? error.name : 'Error'),
                errorCode: String(error && error.code ? error.code : ''),
              });
            }
          }
        }
      },
    });
  } finally {
    if (loadingTask) {
      try {
        await loadingTask.destroy();
      } catch (error) {
        log.warn('PDF.js loading task destroy failed (ignored):', {
          operation,
          errorName: String(error && error.name ? error.name : 'Error'),
          errorCode: String(error && error.code ? error.code : ''),
        });
      }
    }
  }
}

// =============================================================================
// Preparation probe
// =============================================================================

function ensureNotAborted(isAborted) {
  if (typeof isAborted === 'function' && isAborted()) {
    const abortError = new Error('Native PDF probe cancelled by user.');
    abortError.code = 'aborted_by_user';
    throw abortError;
  }
}

function resolveProbePageRange(pageRange, totalPages) {
  const requestedFromPage = pageRange && Number.isInteger(pageRange.fromPage)
    ? pageRange.fromPage
    : 1;
  const requestedToPage = pageRange && Number.isInteger(pageRange.toPage)
    ? pageRange.toPage
    : totalPages;

  if (requestedFromPage < 1
    || requestedToPage < requestedFromPage
    || requestedToPage > totalPages) {
    return {
      ok: false,
      requestedFromPage,
      requestedToPage,
    };
  }

  return {
    ok: true,
    requestedFromPage,
    requestedToPage,
    selectedPageCount: (requestedToPage - requestedFromPage) + 1,
  };
}

function hasVisibleTextItem(item) {
  const value = item && typeof item.str === 'string' ? item.str : '';
  return value.trim().length > 0;
}

async function probePdfSelectableText({ filePath, pageRange, isAborted } = {}) {
  ensureNotAborted(isAborted);

  return runWithPdfjsDocument({
    filePath,
    operation: 'preparation_probe',
    runDocument: async ({ documentHandle, getTextContent }) => {
      const totalPages = Number.isFinite(documentHandle.numPages) ? documentHandle.numPages : 0;
      const resolvedPageRange = resolveProbePageRange(pageRange, totalPages);

      if (!resolvedPageRange.ok) {
        return {
          state: 'invalid_page_range',
          totalPages,
          requestedFromPage: resolvedPageRange.requestedFromPage,
          requestedToPage: resolvedPageRange.requestedToPage,
        };
      }

      const {
        requestedFromPage,
        requestedToPage,
        selectedPageCount,
      } = resolvedPageRange;
      let pagesScanned = 0;

      for (let pageNumber = requestedFromPage; pageNumber <= requestedToPage; pageNumber += 1) {
        ensureNotAborted(isAborted);
        const textContent = await getTextContent(pageNumber);
        pagesScanned += 1;

        if (Array.isArray(textContent && textContent.items)
          && textContent.items.some((item) => hasVisibleTextItem(item))) {
          return {
            state: 'success',
            selectableText: 'present',
            totalPages,
            pagesScanned,
            foundAtPage: pageNumber,
            requestedFromPage,
            requestedToPage,
            selectedPageCount,
          };
        }
      }

      return {
        state: 'success',
        selectableText: 'absent',
        totalPages,
        pagesScanned,
        foundAtPage: null,
        requestedFromPage,
        requestedToPage,
        selectedPageCount,
      };
    },
  });
}

// =============================================================================
// Native extraction
// =============================================================================

function serializeTextContent(textContent) {
  if (!Array.isArray(textContent && textContent.items)) return '';

  return textContent.items.reduce((text, item) => {
    if (!item || typeof item.str !== 'string') return text;
    return `${text}${item.str}${item.hasEOL === true ? '\n' : ''}`;
  }, '');
}

async function extractPdfText({ filePath } = {}) {
  return runWithPdfjsDocument({
    filePath,
    operation: 'native_extraction',
    runDocument: async ({ documentHandle, getTextContent }) => {
      const totalPages = Number.isFinite(documentHandle.numPages) ? documentHandle.numPages : 0;
      const pageTexts = [];

      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        const textContent = await getTextContent(pageNumber);
        pageTexts.push(serializeTextContent(textContent));
      }

      return {
        text: pageTexts.join('\n\n'),
        numPages: totalPages,
      };
    },
  });
}

// =============================================================================
// Exports
// =============================================================================

module.exports = {
  probePdfSelectableText,
  extractPdfText,
};

// =============================================================================
// End of electron/text_extraction_platform/pdfjs_direct_text_engine.js
// =============================================================================
