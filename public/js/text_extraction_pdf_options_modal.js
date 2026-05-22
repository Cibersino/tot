// public/js/text_extraction_pdf_options_modal.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Host the PDF options modal used before text extraction prepare.
// - Collect all-pages vs contiguous-range intent for a single selected PDF.
// - Expose the maintained public prompt through window.Notify.
// - Return raw user intent while leaving final canonicalization to main prepare.

(() => {
  // =============================================================================
  // Imports / logger
  // =============================================================================

  if (typeof window.getLogger !== 'function') {
    throw new Error('[text-extraction-pdf-options-modal] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('text-extraction-pdf-options-modal');
  log.debug('Text extraction PDF options modal starting...');
  if (!window.RendererI18n
    || typeof window.RendererI18n.renderLocalizedLabelWithInvariantValue !== 'function'
    || typeof window.RendererI18n.tRenderer !== 'function') {
    throw new Error('[text-extraction-pdf-options-modal] RendererI18n dependencies unavailable; cannot continue');
  }
  const pdfPageSelectionHelper = window.TextExtractionPdfPageSelection || null;
  if (!pdfPageSelectionHelper
    || typeof pdfPageSelectionHelper.buildPageSelectionDraft !== 'function'
    || typeof pdfPageSelectionHelper.getPageSelectionUiState !== 'function') {
    throw new Error('[text-extraction-pdf-options-modal] TextExtractionPdfPageSelection dependencies unavailable; cannot continue');
  }
  const {
    renderLocalizedLabelWithInvariantValue,
    tRenderer,
  } = window.RendererI18n;

  // =============================================================================
  // UI elements
  // =============================================================================

  const modal = document.getElementById('textExtractionPdfOptionsModal');
  const backdrop = document.getElementById('textExtractionPdfOptionsModalBackdrop');
  const title = document.getElementById('textExtractionPdfOptionsModalTitle');
  const message = document.getElementById('textExtractionPdfOptionsModalMessage');
  const fileLabel = document.getElementById('textExtractionPdfOptionsModalFileLabel');
  const fileName = document.getElementById('textExtractionPdfOptionsModalFileName');
  const totalPagesSummary = document.getElementById('textExtractionPdfOptionsModalTotalPages');
  const selectionLegend = document.getElementById('textExtractionPdfOptionsModalSelectionLegend');
  const allPagesRadio = document.getElementById('textExtractionPdfOptionsModalAllPages');
  const allPagesLabel = document.getElementById('textExtractionPdfOptionsModalAllPagesLabel');
  const rangeRadio = document.getElementById('textExtractionPdfOptionsModalRange');
  const rangeLabel = document.getElementById('textExtractionPdfOptionsModalRangeLabel');
  const rangeFields = document.getElementById('textExtractionPdfOptionsModalRangeFields');
  const fromLabel = document.getElementById('textExtractionPdfOptionsModalFromLabel');
  const fromInput = document.getElementById('textExtractionPdfOptionsModalFromInput');
  const toLabel = document.getElementById('textExtractionPdfOptionsModalToLabel');
  const toInput = document.getElementById('textExtractionPdfOptionsModalToInput');
  const selectedCountSummary = document.getElementById('textExtractionPdfOptionsModalSelectedCount');
  const keepWrap = document.getElementById('textExtractionPdfOptionsModalKeepWrap');
  const keepCheckbox = document.getElementById('textExtractionPdfOptionsModalKeepGeneratedPdf');
  const keepLabel = document.getElementById('textExtractionPdfOptionsModalKeepLabel');
  const validation = document.getElementById('textExtractionPdfOptionsModalValidation');
  const btnContinue = document.getElementById('textExtractionPdfOptionsModalContinue');
  const btnCancel = document.getElementById('textExtractionPdfOptionsModalCancel');
  const btnClose = document.getElementById('textExtractionPdfOptionsModalClose');

  // =============================================================================
  // Helpers
  // =============================================================================

  function hasRequiredElements() {
    return !!(modal
      && backdrop
      && title
      && message
      && fileLabel
      && fileName
      && totalPagesSummary
      && selectionLegend
      && allPagesRadio
      && allPagesLabel
      && rangeRadio
      && rangeLabel
      && rangeFields
      && fromLabel
      && fromInput
      && toLabel
      && toInput
      && selectedCountSummary
      && keepWrap
      && keepCheckbox
      && keepLabel
      && validation
      && btnContinue
      && btnCancel
      && btnClose);
  }

  function setValidationText(text) {
    const safeText = typeof text === 'string' ? text.trim() : '';
    validation.hidden = !safeText;
    validation.setAttribute('aria-hidden', safeText ? 'false' : 'true');
    validation.textContent = safeText;
  }

  function setSelectedCountText(text) {
    const safeText = typeof text === 'string' ? text.trim() : '';
    selectedCountSummary.hidden = !safeText;
    selectedCountSummary.setAttribute('aria-hidden', safeText ? 'false' : 'true');
    selectedCountSummary.textContent = safeText;
  }

  function renderSummaryValue(element, labelKey, valueText) {
    renderLocalizedLabelWithInvariantValue(element, {
      labelText: tRenderer(labelKey),
      valueText,
      valueDirection: 'ltr',
    });
  }

  function syncStaticFieldConstraints(totalPages) {
    fromInput.min = '1';
    fromInput.max = String(totalPages);
    fromInput.step = '1';
    toInput.min = '1';
    toInput.max = String(totalPages);
    toInput.step = '1';
  }

  function syncPageSelectionControls(uiState, { preserveTypedValues = false } = {}) {
    allPagesRadio.checked = uiState.showRange !== true;
    rangeRadio.checked = uiState.showRange === true;
    rangeFields.hidden = uiState.showRange !== true;
    rangeFields.setAttribute('aria-hidden', uiState.showRange === true ? 'false' : 'true');
    keepWrap.hidden = uiState.showRange !== true;
    keepWrap.setAttribute('aria-hidden', uiState.showRange === true ? 'false' : 'true');
    if (!preserveTypedValues && pageSelectionDraft) {
      fromInput.value = String(pageSelectionDraft.fromPage || '1');
      toInput.value = String(pageSelectionDraft.toPage || uiState.totalPages || 1);
    }
    setSelectedCountText(uiState.selectedCountText);
    setValidationText(uiState.validationText);
    btnContinue.disabled = uiState.submitDisabled === true;
  }

  function syncDynamicState({ preserveTypedValues = false } = {}) {
    const uiState = pdfPageSelectionHelper.getPageSelectionUiState(pageSelectionDraft);
    syncPageSelectionControls(uiState, { preserveTypedValues });
    return uiState;
  }

  let pageSelectionDraft = null;

  function buildModalResult() {
    const uiState = pdfPageSelectionHelper.getPageSelectionUiState(pageSelectionDraft);
    if (!uiState.pdfPageSelection) {
      return null;
    }

    return {
      pdfPageSelection: uiState.pdfPageSelection,
      generatedPdfArtifactPolicy: {
        mode: uiState.showRange === true && keepCheckbox.checked === true ? 'keep' : 'delete',
      },
    };
  }

  function renderModalText(totalPages, inspectedFileName) {
    title.textContent = tRenderer('renderer.text_extraction.pdf_options.title');
    message.textContent = tRenderer('renderer.text_extraction.pdf_options.message');
    fileLabel.textContent = tRenderer('renderer.text_extraction.pdf_options.file_label');
    fileName.textContent = inspectedFileName;
    fileName.title = inspectedFileName;
    renderSummaryValue(
      totalPagesSummary,
      'renderer.text_extraction.pdf_options.total_pages_label',
      String(totalPages)
    );
    selectionLegend.textContent = tRenderer('renderer.text_extraction.pdf_options.selection_legend');
    allPagesLabel.textContent = tRenderer('renderer.text_extraction.pdf_options.all_pages_label');
    rangeLabel.textContent = tRenderer('renderer.text_extraction.pdf_options.range_label');
    fromLabel.textContent = tRenderer('renderer.text_extraction.pdf_options.from_page_label');
    toLabel.textContent = tRenderer('renderer.text_extraction.pdf_options.to_page_label');
    keepLabel.textContent = tRenderer('renderer.text_extraction.pdf_options.keep_generated_pdf_label');
    btnContinue.textContent = tRenderer('renderer.text_extraction.pdf_options.continue_button');
    btnCancel.textContent = tRenderer('renderer.text_extraction.pdf_options.cancel_button');
    btnClose.setAttribute(
      'aria-label',
      tRenderer('renderer.text_extraction.pdf_options.close_aria')
    );
  }

  function resetModalState(totalPages) {
    pageSelectionDraft = pdfPageSelectionHelper.buildPageSelectionDraft({ totalPages });
    syncStaticFieldConstraints(totalPages);
    keepCheckbox.checked = false;
    syncDynamicState({ preserveTypedValues: false });
  }

  function updateDraftRangeValues() {
    if (!pageSelectionDraft) return;
    pageSelectionDraft.fromPage = String(fromInput.value || '');
    pageSelectionDraft.toPage = String(toInput.value || '');
  }

  function updateDraftMode(nextMode) {
    if (!pageSelectionDraft) return;
    if (nextMode === 'range') {
      pageSelectionDraft.mode = 'range';
      return;
    }

    pageSelectionDraft = pdfPageSelectionHelper.buildPageSelectionDraft({
      totalPages: pageSelectionDraft.totalPages,
    });
  }

  function focusInvalidInput(uiState) {
    const target = uiState && uiState.invalidInputKey === 'fromPage'
      ? fromInput
      : toInput;
    if (target && typeof target.focus === 'function') {
      target.focus();
    }
  }

  // =============================================================================
  // Public entrypoint
  // =============================================================================

  async function promptPdfOptions({ inspection } = {}) {
    if (!hasRequiredElements()) {
      log.error('PDF options modal DOM elements missing.');
      return null;
    }

    const totalPages = Number(inspection && inspection.totalPages);
    if (!Number.isInteger(totalPages) || totalPages < 1) {
      log.error('PDF options modal received invalid totalPages:', inspection);
      return null;
    }

    const inspectedFileName = inspection
      && inspection.fileInfo
      && typeof inspection.fileInfo.fileName === 'string'
      ? inspection.fileInfo.fileName
      : '';

    renderModalText(totalPages, inspectedFileName);
    resetModalState(totalPages);

    return await new Promise((resolve) => {
      let settled = false;

      const cleanup = () => {
        allPagesRadio.removeEventListener('change', onModeChange);
        rangeRadio.removeEventListener('change', onModeChange);
        fromInput.removeEventListener('input', onRangeInput);
        toInput.removeEventListener('input', onRangeInput);
        btnContinue.removeEventListener('click', onContinue);
        btnCancel.removeEventListener('click', onCancel);
        btnClose.removeEventListener('click', onCancel);
        backdrop.removeEventListener('click', onCancel);
        window.removeEventListener('keydown', onWindowKeyDown);
        modal.setAttribute('aria-hidden', 'true');
      };

      const finish = (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };

      const onModeChange = () => {
        updateDraftMode(rangeRadio.checked === true ? 'range' : 'all');
        if (pageSelectionDraft && pageSelectionDraft.mode !== 'range') {
          keepCheckbox.checked = false;
        }
        syncDynamicState({ preserveTypedValues: false });
      };
      const onRangeInput = () => {
        updateDraftRangeValues();
        syncDynamicState({ preserveTypedValues: true });
      };
      const onContinue = () => {
        const uiState = syncDynamicState({ preserveTypedValues: true });
        const result = buildModalResult();
        if (!result) {
          focusInvalidInput(uiState);
          return;
        }
        finish(result);
      };
      const onCancel = () => finish(null);
      const onWindowKeyDown = (ev) => {
        if (modal.getAttribute('aria-hidden') !== 'false') return;
        if (ev.key === 'Escape') {
          ev.preventDefault();
          finish(null);
        }
      };

      allPagesRadio.addEventListener('change', onModeChange);
      rangeRadio.addEventListener('change', onModeChange);
      fromInput.addEventListener('input', onRangeInput);
      toInput.addEventListener('input', onRangeInput);
      btnContinue.addEventListener('click', onContinue);
      btnCancel.addEventListener('click', onCancel);
      btnClose.addEventListener('click', onCancel);
      backdrop.addEventListener('click', onCancel);
      window.addEventListener('keydown', onWindowKeyDown);

      modal.setAttribute('aria-hidden', 'false');
      allPagesRadio.focus();
    });
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================

  window.Notify.promptTextExtractionPdfOptions = promptPdfOptions;
})();

// =============================================================================
// End of public/js/text_extraction_pdf_options_modal.js
// =============================================================================
