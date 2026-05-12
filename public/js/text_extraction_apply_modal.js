// public/js/text_extraction_apply_modal.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Host text extraction post-extraction apply modal behavior.
// - Populate modal copy, elapsed value composition, and repeat limits before prompting the user.
// - Normalize the final repeat count before returning apply intent (`overwrite`/`append`).
// =============================================================================

(() => {
  // =============================================================================
  // Imports / logger
  // =============================================================================

  if (typeof window.getLogger !== 'function') {
    throw new Error('[text-extraction-apply-modal] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('text-extraction-apply-modal');
  log.debug('Text extraction apply modal starting...');
  if (!window.RendererI18n
    || typeof window.RendererI18n.tRenderer !== 'function'
    || typeof window.RendererI18n.renderLocalizedLabelWithInvariantValue !== 'function') {
    throw new Error('[text-extraction-apply-modal] RendererI18n dependencies unavailable; cannot continue');
  }
  const { tRenderer, renderLocalizedLabelWithInvariantValue } = window.RendererI18n;

  // =============================================================================
  // UI elements
  // =============================================================================

  const modal = document.getElementById('textExtractionApplyModal');
  const backdrop = document.getElementById('textExtractionApplyModalBackdrop');
  const title = document.getElementById('textExtractionApplyModalTitle');
  const message = document.getElementById('textExtractionApplyModalMessage');
  const elapsed = document.getElementById('textExtractionApplyModalElapsed');
  const savedPdf = document.getElementById('textExtractionApplyModalSavedPdf');
  const savedPdfMessage = document.getElementById('textExtractionApplyModalSavedPdfMessage');
  const savedPdfFile = document.getElementById('textExtractionApplyModalSavedPdfFile');
  const btnRevealSavedPdf = document.getElementById('textExtractionApplyModalRevealSavedPdf');
  const repeatLabel = document.getElementById('textExtractionApplyModalRepeatLabel');
  const repeatInput = document.getElementById('textExtractionApplyModalRepeatInput');
  const btnOverwrite = document.getElementById('textExtractionApplyModalOverwrite');
  const btnAppend = document.getElementById('textExtractionApplyModalAppend');
  const btnCancel = document.getElementById('textExtractionApplyModalCancel');
  const btnClose = document.getElementById('textExtractionApplyModalClose');

  // =============================================================================
  // Helpers
  // =============================================================================

  function hasRequiredElements() {
    return !!(modal
      && backdrop
      && title
      && message
      && elapsed
      && savedPdf
      && savedPdfMessage
      && savedPdfFile
      && btnRevealSavedPdf
      && repeatLabel
      && repeatInput
      && btnOverwrite
      && btnAppend
      && btnCancel
      && btnClose);
  }

  function normalizeRepeatForModal(rawValue, maxRepeat) {
    if (window.TextApplyCanonical && typeof window.TextApplyCanonical.normalizeRepeat === 'function') {
      return window.TextApplyCanonical.normalizeRepeat(rawValue, { maxRepeat });
    }
    log.warn('TextApplyCanonical.normalizeRepeat unavailable; using local repeat normalization fallback.');
    const numeric = Number(rawValue);
    if (!Number.isInteger(numeric) || numeric < 1) return 1;
    return Math.min(numeric, maxRepeat);
  }

  function normalizeRetainedGeneratedPdf(rawValue) {
    if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
      return null;
    }
    const fileName = typeof rawValue.fileName === 'string' ? rawValue.fileName.trim() : '';
    if (!fileName) return null;
    return { fileName };
  }

  // =============================================================================
  // Public entrypoints
  // =============================================================================

  async function promptApplyChoice({
    elapsedValueText = '',
    defaultRepeat = 1,
    maxRepeat = 1,
    retainedGeneratedPdf = null,
    onRevealGeneratedPdf = null,
  } = {}) {
    if (!hasRequiredElements()) {
      log.error('Apply modal DOM elements missing.');
      return null;
    }

    const safeMaxRepeat = Number.isInteger(Number(maxRepeat)) && Number(maxRepeat) > 0
      ? Number(maxRepeat)
      : 1;
    const initialRepeat = normalizeRepeatForModal(defaultRepeat, safeMaxRepeat);

    const titleText = tRenderer('renderer.text_extraction.apply_modal.title');
    const messageText = tRenderer('renderer.text_extraction.apply_modal.message');
    const repeatLabelText = tRenderer('renderer.text_extraction.apply_modal.repeat_label');
    const overwriteText = tRenderer('renderer.text_extraction.apply_modal.overwrite_button');
    const appendText = tRenderer('renderer.text_extraction.apply_modal.append_button');
    const cancelText = tRenderer('renderer.text_extraction.apply_modal.cancel_button');
    const closeAriaText = tRenderer('renderer.text_extraction.apply_modal.close_aria');
    const safeRetainedGeneratedPdf = normalizeRetainedGeneratedPdf(retainedGeneratedPdf);
    const canRevealGeneratedPdf = !!(
      safeRetainedGeneratedPdf
      && typeof onRevealGeneratedPdf === 'function'
    );

    title.textContent = titleText;
    message.textContent = messageText;
    const normalizedElapsedValueText = typeof elapsedValueText === 'string' ? elapsedValueText.trim() : '';
    elapsed.hidden = !normalizedElapsedValueText;
    elapsed.setAttribute('aria-hidden', elapsed.hidden ? 'true' : 'false');
    if (normalizedElapsedValueText) {
      renderLocalizedLabelWithInvariantValue(elapsed, {
        labelText: tRenderer('renderer.text_extraction.apply_modal.elapsed'),
        valueText: normalizedElapsedValueText,
        valueDirection: 'ltr',
      });
    } else {
      elapsed.textContent = '';
    }
    repeatLabel.textContent = repeatLabelText;
    btnOverwrite.textContent = overwriteText;
    btnAppend.textContent = appendText;
    btnCancel.textContent = cancelText;
    btnClose.setAttribute('aria-label', closeAriaText);
    savedPdf.hidden = !canRevealGeneratedPdf;
    savedPdf.setAttribute('aria-hidden', savedPdf.hidden ? 'true' : 'false');
    if (canRevealGeneratedPdf) {
      savedPdfMessage.textContent = tRenderer('renderer.text_extraction.apply_modal.saved_pdf_message');
      renderLocalizedLabelWithInvariantValue(savedPdfFile, {
        labelText: tRenderer('renderer.text_extraction.apply_modal.saved_pdf_label'),
        valueText: safeRetainedGeneratedPdf.fileName,
        valueDirection: 'ltr',
      });
      btnRevealSavedPdf.textContent = tRenderer('renderer.text_extraction.apply_modal.reveal_saved_pdf_button');
      btnRevealSavedPdf.disabled = false;
    } else {
      savedPdfMessage.textContent = '';
      savedPdfFile.textContent = '';
      btnRevealSavedPdf.textContent = '';
      btnRevealSavedPdf.disabled = true;
    }

    repeatInput.min = '1';
    repeatInput.max = String(safeMaxRepeat);
    repeatInput.step = '1';
    repeatInput.value = String(initialRepeat);

    return await new Promise((resolve) => {
      let settled = false;
      let revealPending = false;

      const cleanup = () => {
        btnOverwrite.removeEventListener('click', onOverwrite);
        btnAppend.removeEventListener('click', onAppend);
        btnCancel.removeEventListener('click', onCancel);
        btnClose.removeEventListener('click', onCancel);
        btnRevealSavedPdf.removeEventListener('click', onRevealSavedPdf);
        backdrop.removeEventListener('click', onCancel);
        repeatInput.removeEventListener('blur', onRepeatBlur);
        window.removeEventListener('keydown', onWindowKeyDown);
        modal.setAttribute('aria-hidden', 'true');
      };

      const resolveChoice = (mode) => {
        const repetitions = normalizeRepeatForModal(repeatInput.value, safeMaxRepeat);
        repeatInput.value = String(repetitions);
        return { mode, repetitions };
      };

      const finish = (choice) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(choice);
      };

      const onOverwrite = () => finish(resolveChoice('overwrite'));
      const onAppend = () => finish(resolveChoice('append'));
      const onCancel = () => finish(null);
      const onRepeatBlur = () => {
        repeatInput.value = String(normalizeRepeatForModal(repeatInput.value, safeMaxRepeat));
      };
      const onRevealSavedPdf = async () => {
        if (!canRevealGeneratedPdf || revealPending) return;
        revealPending = true;
        btnRevealSavedPdf.disabled = true;
        try {
          await onRevealGeneratedPdf();
        } catch (err) {
          log.error('Reveal saved generated PDF failed:', err);
          window.Notify.notifyMain('renderer.alerts.text_extraction_generated_pdf_reveal_failed');
        } finally {
          revealPending = false;
          btnRevealSavedPdf.disabled = false;
        }
      };
      const onWindowKeyDown = (ev) => {
        if (modal.getAttribute('aria-hidden') !== 'false') return;
        if (ev.key === 'Escape') {
          ev.preventDefault();
          finish(null);
        }
      };

      btnOverwrite.addEventListener('click', onOverwrite);
      btnAppend.addEventListener('click', onAppend);
      btnCancel.addEventListener('click', onCancel);
      btnClose.addEventListener('click', onCancel);
      btnRevealSavedPdf.addEventListener('click', onRevealSavedPdf);
      backdrop.addEventListener('click', onCancel);
      repeatInput.addEventListener('blur', onRepeatBlur);
      window.addEventListener('keydown', onWindowKeyDown);

      modal.setAttribute('aria-hidden', 'false');
      repeatInput.focus();
      repeatInput.select();
    });
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================

  window.Notify.promptTextExtractionApplyChoice = promptApplyChoice;
})();

// =============================================================================
// End of public/js/text_extraction_apply_modal.js
// =============================================================================
