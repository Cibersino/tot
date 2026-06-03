// public/js/text_extraction_single_file_heavy_pdf_modal.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Host the blocking modal used for single-file heavy-PDF decisions.
// - Resolve case-specific copy and detail rows for Case A and Case B.
// - Wire the modal actions that return split, page-selection, native, or cancel.
// - Expose retained generated-PDF reveal behavior when the callback is available.
// =============================================================================

(() => {
  // =============================================================================
  // Runtime Dependencies
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[text-extraction-single-file-heavy-pdf-modal] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('text-extraction-single-file-heavy-pdf-modal');
  log.debug('Text extraction single-file heavy PDF modal starting...');
  if (!window.RendererI18n || typeof window.RendererI18n.tRenderer !== 'function') {
    throw new Error('[text-extraction-single-file-heavy-pdf-modal] RendererI18n.tRenderer unavailable; cannot continue');
  }
  const { tRenderer } = window.RendererI18n;

  // =============================================================================
  // DOM Bindings
  // =============================================================================
  const modal = document.getElementById('textExtractionSingleFileHeavyPdfModal');
  const backdrop = document.getElementById('textExtractionSingleFileHeavyPdfModalBackdrop');
  const title = document.getElementById('textExtractionSingleFileHeavyPdfModalTitle');
  const message = document.getElementById('textExtractionSingleFileHeavyPdfModalMessage');
  const details = document.getElementById('textExtractionSingleFileHeavyPdfModalDetails');
  const btnSplit = document.getElementById('textExtractionSingleFileHeavyPdfModalSplit');
  const btnReturnToPages = document.getElementById('textExtractionSingleFileHeavyPdfModalReturnToPages');
  const btnUseNative = document.getElementById('textExtractionSingleFileHeavyPdfModalUseNative');
  const btnReveal = document.getElementById('textExtractionSingleFileHeavyPdfModalReveal');
  const btnCancel = document.getElementById('textExtractionSingleFileHeavyPdfModalCancel');
  const btnClose = document.getElementById('textExtractionSingleFileHeavyPdfModalClose');

  // =============================================================================
  // Rendering Helpers
  // =============================================================================
  function hasRequiredElements() {
    return !!(modal
      && backdrop
      && title
      && message
      && details
      && btnSplit
      && btnReturnToPages
      && btnUseNative
      && btnReveal
      && btnCancel
      && btnClose);
  }

  function formatMegabytes(rawBytes) {
    const bytes = Number(rawBytes);
    if (!Number.isFinite(bytes) || bytes <= 0) return '0';
    return `${Math.round((bytes / (1024 * 1024)) * 10) / 10}`;
  }

  function createTextNode(text) {
    return document.createTextNode(String(text ?? ''));
  }

  function createValueNode(text, direction = 'ltr') {
    const valueNode = document.createElement('bdi');
    valueNode.dir = direction === 'rtl' || direction === 'ltr' ? direction : 'auto';
    valueNode.textContent = String(text ?? '');
    return valueNode;
  }

  function formatPageRangeValue(fromPage, toPage) {
    const safeFromPage = Number(fromPage);
    const safeToPage = Number(toPage);
    if (!Number.isFinite(safeFromPage) || safeFromPage < 1 || !Number.isFinite(safeToPage) || safeToPage < 1) {
      return '';
    }
    return `${Math.floor(safeFromPage)}-${Math.floor(safeToPage)}`;
  }

  function renderTranslationWithIsolatedValue(container, {
    key = '',
    placeholderName = '',
    tokenSuffix = '',
    valueText = '',
    valueDirection = 'ltr',
  } = {}) {
    const template = tRenderer(key);
    const placeholderToken = `{${placeholderName}}`;
    const fullToken = `${placeholderToken}${tokenSuffix}`;
    const splitToken = template.includes(fullToken)
      ? fullToken
      : placeholderToken;
    const parts = template.split(splitToken);

    container.textContent = '';
    if (parts.length < 2) {
      log.warn(
        'Single-file heavy PDF modal translation placeholder missing; rendering template without isolated value:',
        { key, placeholderToken, tokenSuffix }
      );
      container.textContent = template;
      return;
    }

    parts.forEach((part, index) => {
      if (part) {
        container.appendChild(createTextNode(part));
      }
      if (index < parts.length - 1) {
        container.appendChild(createValueNode(valueText, valueDirection));
      }
    });
  }

  function appendLabeledValueRow(container, {
    labelKey = '',
    valueText = '',
    valueDirection = 'ltr',
  } = {}) {
    const row = document.createElement('p');
    const label = document.createElement('strong');
    label.textContent = tRenderer(labelKey);
    row.appendChild(label);
    row.appendChild(createTextNode(' '));
    row.appendChild(createValueNode(valueText, valueDirection));
    container.appendChild(row);
  }

  function renderDetails({
    isCaseB = false,
    sourceFileName = '',
    sourceFileSizeBytes = 0,
    totalPages = 0,
    selectedRangeFromPage = 0,
    selectedRangeToPage = 0,
    revealableGeneratedPdfFileName = '',
    hasRevealableGeneratedPdf = false,
    generatedPdfSizeBytes = 0,
  } = {}) {
    details.textContent = '';

    appendLabeledValueRow(details, {
      labelKey: 'renderer.text_extraction.single_file_heavy.source_file_label',
      valueText: sourceFileName,
      valueDirection: 'ltr',
    });
    appendLabeledValueRow(details, {
      labelKey: 'renderer.text_extraction.single_file_heavy.source_size_label',
      valueText: `${formatMegabytes(sourceFileSizeBytes)} MB`,
      valueDirection: 'ltr',
    });

    if (isCaseB) {
      appendLabeledValueRow(details, {
        labelKey: 'renderer.text_extraction.single_file_heavy.selected_range_label',
        valueText: formatPageRangeValue(selectedRangeFromPage, selectedRangeToPage),
        valueDirection: 'ltr',
      });
      if (hasRevealableGeneratedPdf) {
        appendLabeledValueRow(details, {
          labelKey: 'renderer.text_extraction.single_file_heavy.generated_pdf_label',
          valueText: revealableGeneratedPdfFileName,
          valueDirection: 'ltr',
        });
      }
      appendLabeledValueRow(details, {
        labelKey: 'renderer.text_extraction.single_file_heavy.generated_pdf_size_label',
        valueText: `${formatMegabytes(generatedPdfSizeBytes)} MB`,
        valueDirection: 'ltr',
      });
      return;
    }

    appendLabeledValueRow(details, {
      labelKey: 'renderer.text_extraction.single_file_heavy.total_pages_label',
      valueText: String(totalPages || ''),
      valueDirection: 'ltr',
    });
  }

  // =============================================================================
  // Modal Flow
  // =============================================================================
  async function promptSingleFileHeavyPdf({
    caseKind = 'case_a',
    sourceFileName = '',
    sourceFileSizeBytes = 0,
    totalPages = 0,
    selectedRangeFromPage = 0,
    selectedRangeToPage = 0,
    generatedPdfFileName = '',
    generatedPdfSizeBytes = 0,
    providerLimitBytes = 0,
    canUseNative = false,
    retainedGeneratedPdf = null,
    onRevealGeneratedPdf = null,
  } = {}) {
    if (!hasRequiredElements()) {
      log.error('Single-file heavy PDF modal DOM elements missing.');
      return 'cancel';
    }

    const isCaseB = caseKind === 'case_b';
    const retainedGeneratedPdfFileName = retainedGeneratedPdf
      && typeof retainedGeneratedPdf.fileName === 'string'
      ? retainedGeneratedPdf.fileName.trim()
      : '';
    const retainedGeneratedPdfArtifactPath = retainedGeneratedPdf
      && typeof retainedGeneratedPdf.artifactPath === 'string'
      ? retainedGeneratedPdf.artifactPath.trim()
      : '';
    const revealableGeneratedPdfFileName = retainedGeneratedPdfFileName || String(generatedPdfFileName || '').trim();
    const hasRevealableGeneratedPdf = !!(
      isCaseB
      && revealableGeneratedPdfFileName
      && retainedGeneratedPdfArtifactPath
    );
    title.textContent = isCaseB
      ? tRenderer('renderer.text_extraction.single_file_heavy.case_b_title')
      : tRenderer('renderer.text_extraction.single_file_heavy.case_a_title');
    renderTranslationWithIsolatedValue(message, {
      key: isCaseB
        ? 'renderer.text_extraction.single_file_heavy.case_b_message'
        : 'renderer.text_extraction.single_file_heavy.case_a_message',
      placeholderName: 'providerLimitMb',
      tokenSuffix: ' MB',
      valueText: `${formatMegabytes(providerLimitBytes)} MB`,
      valueDirection: 'ltr',
    });
    renderDetails({
      isCaseB,
      sourceFileName,
      sourceFileSizeBytes,
      totalPages,
      selectedRangeFromPage,
      selectedRangeToPage,
      revealableGeneratedPdfFileName,
      hasRevealableGeneratedPdf,
      generatedPdfSizeBytes,
    });

    btnSplit.textContent = tRenderer('renderer.text_extraction.single_file_heavy.split_button');
    btnReturnToPages.textContent = tRenderer('renderer.text_extraction.single_file_heavy.return_to_pages_button');
    btnUseNative.textContent = tRenderer('renderer.text_extraction.single_file_heavy.use_native_button');
    btnReveal.textContent = tRenderer('renderer.text_extraction.single_file_heavy.reveal_generated_pdf_button');
    btnCancel.textContent = tRenderer('renderer.text_extraction.single_file_heavy.cancel_button');
    btnClose.setAttribute('aria-label', tRenderer('renderer.text_extraction.single_file_heavy.close_aria'));

    btnReturnToPages.hidden = false;
    btnReturnToPages.setAttribute('aria-hidden', btnReturnToPages.hidden ? 'true' : 'false');
    btnUseNative.hidden = !canUseNative;
    btnUseNative.setAttribute('aria-hidden', btnUseNative.hidden ? 'true' : 'false');
    const canRevealGeneratedPdf = hasRevealableGeneratedPdf && typeof onRevealGeneratedPdf === 'function';
    btnReveal.hidden = !canRevealGeneratedPdf;
    btnReveal.setAttribute('aria-hidden', btnReveal.hidden ? 'true' : 'false');

    return new Promise((resolve) => {
      let settled = false;

      const cleanup = () => {
        btnSplit.removeEventListener('click', onSplit);
        btnReturnToPages.removeEventListener('click', onReturnToPages);
        btnUseNative.removeEventListener('click', onUseNative);
        btnReveal.removeEventListener('click', onReveal);
        btnCancel.removeEventListener('click', onCancel);
        btnClose.removeEventListener('click', onCancel);
        backdrop.removeEventListener('click', onCancel);
        window.removeEventListener('keydown', onWindowKeyDown);
        modal.setAttribute('aria-hidden', 'true');
      };

      const finish = (action) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(action);
      };

      const onSplit = () => finish('split');
      const onReturnToPages = () => finish('return_to_pages');
      const onUseNative = () => finish('use_native');
      const onCancel = () => finish('cancel');
      const onReveal = async () => {
        if (!canRevealGeneratedPdf) return;
        try {
          await onRevealGeneratedPdf();
        } catch (err) {
          log.warn('Single-file heavy modal reveal failed (ignored):', err);
          window.Notify.notifyMain('renderer.text_extraction.alerts.generated_pdf_reveal_failed');
        }
      };
      const onWindowKeyDown = (event) => {
        if (modal.getAttribute('aria-hidden') !== 'false') return;
        if (event.key === 'Escape') {
          event.preventDefault();
          finish('cancel');
        }
      };

      btnSplit.addEventListener('click', onSplit);
      btnReturnToPages.addEventListener('click', onReturnToPages);
      btnUseNative.addEventListener('click', onUseNative);
      btnReveal.addEventListener('click', onReveal);
      btnCancel.addEventListener('click', onCancel);
      btnClose.addEventListener('click', onCancel);
      backdrop.addEventListener('click', onCancel);
      window.addEventListener('keydown', onWindowKeyDown);

      modal.setAttribute('aria-hidden', 'false');
      btnSplit.focus();
    });
  }

  // =============================================================================
  // Module Surface
  // =============================================================================
  window.Notify.promptTextExtractionSingleFileHeavyPdf = promptSingleFileHeavyPdf;
})();

// =============================================================================
// End of public/js/text_extraction_single_file_heavy_pdf_modal.js
// =============================================================================
