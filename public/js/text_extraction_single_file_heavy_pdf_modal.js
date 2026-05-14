// public/js/text_extraction_single_file_heavy_pdf_modal.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Host the single-file heavy-PDF blocking UI for Issue 267 Case A/Case B.
// - Keep the full-source automatic split handoff explicit.
// - Expose retained generated-PDF reveal action when available.
// =============================================================================

(() => {
  if (typeof window.getLogger !== 'function') {
    throw new Error('[text-extraction-single-file-heavy-pdf-modal] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('text-extraction-single-file-heavy-pdf-modal');
  log.debug('Text extraction single-file heavy PDF modal starting...');
  if (!window.RendererI18n || typeof window.RendererI18n.tRenderer !== 'function') {
    throw new Error('[text-extraction-single-file-heavy-pdf-modal] RendererI18n.tRenderer unavailable; cannot continue');
  }
  const { tRenderer } = window.RendererI18n;

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

  function escapeHtml(rawValue) {
    return String(rawValue || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatTranslation(key, replacements = {}) {
    let text = tRenderer(key);
    Object.keys(replacements).forEach((name) => {
      text = text.replace(`{${name}}`, String(replacements[name]));
    });
    return text;
  }

  function formatMegabytes(rawBytes) {
    const bytes = Number(rawBytes);
    if (!Number.isFinite(bytes) || bytes <= 0) return '0';
    return `${Math.round((bytes / (1024 * 1024)) * 10) / 10}`;
  }

  async function promptSingleFileHeavyPdf({
    caseKind = 'case_a',
    sourceFileName = '',
    sourceFileSizeBytes = 0,
    totalPages = 0,
    selectedRangeText = '',
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
    message.textContent = isCaseB
      ? formatTranslation('renderer.text_extraction.single_file_heavy.case_b_message', {
        providerLimitMb: formatMegabytes(providerLimitBytes),
      })
      : formatTranslation('renderer.text_extraction.single_file_heavy.case_a_message', {
        providerLimitMb: formatMegabytes(providerLimitBytes),
      });
    details.innerHTML = isCaseB
      ? [
        `<p><strong>${escapeHtml(tRenderer('renderer.text_extraction.single_file_heavy.source_file_label'))}</strong> ${escapeHtml(sourceFileName)}</p>`,
        `<p><strong>${escapeHtml(tRenderer('renderer.text_extraction.single_file_heavy.source_size_label'))}</strong> ${escapeHtml(formatMegabytes(sourceFileSizeBytes))} MB</p>`,
        `<p><strong>${escapeHtml(tRenderer('renderer.text_extraction.single_file_heavy.selected_range_label'))}</strong> ${escapeHtml(selectedRangeText)}</p>`,
        hasRevealableGeneratedPdf
          ? `<p><strong>${escapeHtml(tRenderer('renderer.text_extraction.single_file_heavy.generated_pdf_label'))}</strong> ${escapeHtml(revealableGeneratedPdfFileName)}</p>`
          : '',
        `<p><strong>${escapeHtml(tRenderer('renderer.text_extraction.single_file_heavy.generated_pdf_size_label'))}</strong> ${escapeHtml(formatMegabytes(generatedPdfSizeBytes))} MB</p>`,
      ].join('')
      : [
        `<p><strong>${escapeHtml(tRenderer('renderer.text_extraction.single_file_heavy.source_file_label'))}</strong> ${escapeHtml(sourceFileName)}</p>`,
        `<p><strong>${escapeHtml(tRenderer('renderer.text_extraction.single_file_heavy.source_size_label'))}</strong> ${escapeHtml(formatMegabytes(sourceFileSizeBytes))} MB</p>`,
        `<p><strong>${escapeHtml(tRenderer('renderer.text_extraction.single_file_heavy.total_pages_label'))}</strong> ${escapeHtml(String(totalPages || ''))}</p>`,
      ].join('');

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
          log.error('Single-file heavy modal reveal failed:', err);
          window.Notify.notifyMain('renderer.alerts.text_extraction_generated_pdf_reveal_failed');
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

  window.Notify.promptTextExtractionSingleFileHeavyPdf = promptSingleFileHeavyPdf;
})();

// =============================================================================
// End of public/js/text_extraction_single_file_heavy_pdf_modal.js
// =============================================================================
