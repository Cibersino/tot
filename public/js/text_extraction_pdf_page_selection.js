// public/js/text_extraction_pdf_page_selection.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Shared renderer helper for PDF page-selection state used by text extraction UI.
// Responsibilities:
// - Own the shared renderer-side PDF page-selection model for text extraction.
// - Keep batch and single-file page-range UI on one validation/defaulting path.
// - Provide shared selection summary formatting for renderer consumers.

(() => {
  // =============================================================================
  // Imports / logger
  // =============================================================================

  if (typeof window.getLogger !== 'function') {
    throw new Error('[text-extraction-pdf-page-selection] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('text-extraction-pdf-page-selection');
  log.debug('Text extraction PDF page selection helper starting...');
  if (!window.RendererI18n
    || typeof window.RendererI18n.msgRenderer !== 'function'
    || typeof window.RendererI18n.tRenderer !== 'function') {
    throw new Error('[text-extraction-pdf-page-selection] RendererI18n dependencies unavailable; cannot continue');
  }
  const { msgRenderer, tRenderer } = window.RendererI18n;

  // =============================================================================
  // Constants / config
  // =============================================================================

  const INVALID_RANGE_KEY = 'renderer.text_extraction.pdf_options.invalid_range';
  const SELECTED_COUNT_LABEL_KEY = 'renderer.text_extraction.pdf_options.selected_page_count_label';

  // =============================================================================
  // Helpers
  // =============================================================================

  function toPositiveIntegerOrNull(rawValue) {
    const value = Number(rawValue);
    if (!Number.isInteger(value) || value < 1) return null;
    return value;
  }

  function getSafeTotalPages(totalPages) {
    return toPositiveIntegerOrNull(totalPages);
  }

  function buildInvalidRangeText(totalPages) {
    return msgRenderer(INVALID_RANGE_KEY, {
      totalPages: String(totalPages),
    });
  }

  function buildAllPagesSelection(totalPages) {
    const safeTotalPages = getSafeTotalPages(totalPages) || 1;
    return {
      mode: 'all',
      fromPage: 1,
      toPage: safeTotalPages,
      selectedPageCount: safeTotalPages,
      totalPages: safeTotalPages,
    };
  }

  function canonicalizePageSelection(requestedSelection, { totalPages } = {}) {
    const safeTotalPages = getSafeTotalPages(totalPages);
    if (!safeTotalPages) {
      return null;
    }

    const rawSelection = requestedSelection && typeof requestedSelection === 'object' && !Array.isArray(requestedSelection)
      ? requestedSelection
      : {};
    const requestedMode = typeof rawSelection.mode === 'string'
      ? rawSelection.mode.trim().toLowerCase()
      : '';

    if (!requestedMode || requestedMode === 'all') {
      return buildAllPagesSelection(safeTotalPages);
    }

    if (requestedMode !== 'range') {
      return null;
    }

    const fromPage = toPositiveIntegerOrNull(rawSelection.fromPage);
    const toPage = toPositiveIntegerOrNull(rawSelection.toPage);
    if (!fromPage || !toPage || fromPage > toPage || toPage > safeTotalPages) {
      return null;
    }

    return {
      mode: 'range',
      fromPage,
      toPage,
      selectedPageCount: (toPage - fromPage) + 1,
      totalPages: safeTotalPages,
    };
  }

  function buildPageSelectionDraft({ pdfPageSelection = null, totalPages } = {}) {
    const safeTotalPages = getSafeTotalPages(totalPages)
      || getSafeTotalPages(pdfPageSelection && pdfPageSelection.totalPages)
      || 1;
    const canonicalSelection = canonicalizePageSelection(pdfPageSelection, {
      totalPages: safeTotalPages,
    });
    if (canonicalSelection && canonicalSelection.mode === 'range') {
      return {
        mode: 'range',
        fromPage: String(canonicalSelection.fromPage),
        toPage: String(canonicalSelection.toPage),
        totalPages: safeTotalPages,
      };
    }

    return {
      mode: 'all',
      fromPage: '1',
      toPage: String(safeTotalPages),
      totalPages: safeTotalPages,
    };
  }

  function getInvalidInputKey(pageSelectionDraft, totalPages) {
    const fromPage = toPositiveIntegerOrNull(pageSelectionDraft && pageSelectionDraft.fromPage);
    const toPage = toPositiveIntegerOrNull(pageSelectionDraft && pageSelectionDraft.toPage);
    if (!fromPage) {
      return 'fromPage';
    }
    if (!toPage || fromPage > toPage || toPage > totalPages) {
      return 'toPage';
    }
    return '';
  }

  function getPageSelectionUiState(pageSelectionDraft) {
    const safeDraft = pageSelectionDraft && typeof pageSelectionDraft === 'object' && !Array.isArray(pageSelectionDraft)
      ? pageSelectionDraft
      : {};
    const totalPages = getSafeTotalPages(safeDraft.totalPages) || 1;
    const draftMode = typeof safeDraft.mode === 'string'
      ? safeDraft.mode.trim().toLowerCase()
      : 'all';

    if (draftMode !== 'range') {
      const allPagesSelection = buildAllPagesSelection(totalPages);
      return {
        showRange: false,
        isValid: true,
        submitDisabled: false,
        selectedCountText: '',
        validationText: '',
        invalidInputKey: '',
        selectedPageCount: allPagesSelection.selectedPageCount,
        totalPages,
        pdfPageSelection: allPagesSelection,
      };
    }

    const canonicalSelection = canonicalizePageSelection(
      {
        mode: 'range',
        fromPage: safeDraft.fromPage,
        toPage: safeDraft.toPage,
      },
      { totalPages }
    );
    if (!canonicalSelection) {
      return {
        showRange: true,
        isValid: false,
        submitDisabled: true,
        selectedCountText: '',
        validationText: buildInvalidRangeText(totalPages),
        invalidInputKey: getInvalidInputKey(safeDraft, totalPages),
        selectedPageCount: 0,
        totalPages,
        pdfPageSelection: null,
      };
    }

    return {
      showRange: true,
      isValid: true,
      submitDisabled: false,
      selectedCountText: `${tRenderer(SELECTED_COUNT_LABEL_KEY)}${String(canonicalSelection.selectedPageCount)}`,
      validationText: '',
      invalidInputKey: '',
      selectedPageCount: canonicalSelection.selectedPageCount,
      totalPages,
      pdfPageSelection: canonicalSelection,
    };
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================

  window.TextExtractionPdfPageSelection = {
    buildAllPagesSelection,
    buildPageSelectionDraft,
    canonicalizePageSelection,
    getPageSelectionUiState,
  };
})();

// =============================================================================
// End of public/js/text_extraction_pdf_page_selection.js
// =============================================================================
