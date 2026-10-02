// public/js/text_extraction_apply_modal.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Host text extraction post-extraction apply modal behavior.
// - Populate modal copy, elapsed value composition, and repeat limits before prompting the user.
// - Normalize the final repeat count before returning apply intent (`overwrite`/`append`).

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
  let activePromptTranslations = null;

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
    const numeric = Number(rawValue);
    if (!Number.isInteger(numeric) || numeric < 1) return 1;
    return Math.min(numeric, maxRepeat);
  }

  function updateRepeatInvalidState(rawValue, maxRepeat) {
    const numericValue = Number(rawValue);
    const isInvalid = !Number.isInteger(numericValue)
      || numericValue < 1
      || numericValue > maxRepeat;
    repeatInput.classList.toggle('is-invalid', isInvalid);
    repeatInput.setAttribute('aria-invalid', isInvalid ? 'true' : 'false');
  }

  function normalizeRetainedGeneratedPdf(rawValue) {
    if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) {
      return null;
    }
    const fileName = typeof rawValue.fileName === 'string' ? rawValue.fileName.trim() : '';
    if (!fileName) return null;
    return { fileName };
  }

  function applyTranslations() {
    if (activePromptTranslations) activePromptTranslations();
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
    if (!window.TextApplyCanonical || typeof window.TextApplyCanonical.normalizeRepeat !== 'function') {
      log.warn('TextApplyCanonical.normalizeRepeat unavailable; using local repeat normalization fallback.');
    }
    const initialRepeat = normalizeRepeatForModal(defaultRepeat, safeMaxRepeat);

    const safeRetainedGeneratedPdf = normalizeRetainedGeneratedPdf(retainedGeneratedPdf);
    const canRevealGeneratedPdf = !!(
      safeRetainedGeneratedPdf
      && typeof onRevealGeneratedPdf === 'function'
    );
    const normalizedElapsedValueText = typeof elapsedValueText === 'string' ? elapsedValueText.trim() : '';
    let revealPending = false;

    function renderModalCopy() {
      title.textContent = tRenderer('renderer.text_extraction.apply_modal.title');
      message.textContent = tRenderer('renderer.text_extraction.apply_modal.message');
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
      repeatLabel.textContent = tRenderer('renderer.text_extraction.apply_modal.repeat_label');
      btnOverwrite.textContent = tRenderer('renderer.text_extraction.apply_modal.overwrite_button');
      btnAppend.textContent = tRenderer('renderer.text_extraction.apply_modal.append_button');
      btnCancel.textContent = tRenderer('renderer.text_extraction.apply_modal.cancel_button');
      btnClose.setAttribute('aria-label', tRenderer('renderer.text_extraction.apply_modal.close_aria'));
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
        btnRevealSavedPdf.disabled = revealPending;
      } else {
        savedPdfMessage.textContent = '';
        savedPdfFile.textContent = '';
        btnRevealSavedPdf.textContent = '';
        btnRevealSavedPdf.disabled = true;
      }
    }

    renderModalCopy();

    repeatInput.min = '1';
    repeatInput.max = String(safeMaxRepeat);
    repeatInput.step = '1';
    repeatInput.value = String(initialRepeat);
    updateRepeatInvalidState(repeatInput.value, safeMaxRepeat);

    return await new Promise((resolve) => {
      let settled = false;

      const cleanup = () => {
        activePromptTranslations = null;
        btnOverwrite.removeEventListener('click', onOverwrite);
        btnAppend.removeEventListener('click', onAppend);
        btnCancel.removeEventListener('click', onCancel);
        btnClose.removeEventListener('click', onCancel);
        btnRevealSavedPdf.removeEventListener('click', onRevealSavedPdf);
        backdrop.removeEventListener('click', onCancel);
        repeatInput.removeEventListener('input', onRepeatInput);
        repeatInput.removeEventListener('blur', onRepeatBlur);
        repeatInput.removeEventListener('keydown', onRepeatKeyDown);
        window.removeEventListener('keydown', onWindowKeyDown);
        modal.setAttribute('aria-hidden', 'true');
        window.Notify.deactivateModalFocus(modal);
      };

      const resolveChoice = (mode) => {
        const repetitions = normalizeRepeatForModal(repeatInput.value, safeMaxRepeat);
        repeatInput.value = String(repetitions);
        updateRepeatInvalidState(repetitions, safeMaxRepeat);
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
      const onRepeatInput = () => {
        updateRepeatInvalidState(repeatInput.value, safeMaxRepeat);
      };
      const onRepeatBlur = () => {
        repeatInput.value = String(normalizeRepeatForModal(repeatInput.value, safeMaxRepeat));
        updateRepeatInvalidState(repeatInput.value, safeMaxRepeat);
      };
      const onRepeatKeyDown = (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        repeatInput.blur();
      };
      const onRevealSavedPdf = async () => {
        if (!canRevealGeneratedPdf || revealPending) return;
        revealPending = true;
        btnRevealSavedPdf.disabled = true;
        try {
          await onRevealGeneratedPdf();
        } catch (err) {
          log.error('Reveal saved generated PDF failed:', err);
          window.Notify.notifyMain('renderer.text_extraction.alerts.generated_pdf_reveal_failed');
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
      repeatInput.addEventListener('input', onRepeatInput);
      repeatInput.addEventListener('blur', onRepeatBlur);
      repeatInput.addEventListener('keydown', onRepeatKeyDown);
      window.addEventListener('keydown', onWindowKeyDown);
      activePromptTranslations = renderModalCopy;

      modal.setAttribute('aria-hidden', 'false');
      window.Notify.activateModalFocus(modal, {
        initialFocus: btnOverwrite,
        fallbackFocus: btnClose,
      });
    });
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================

  window.Notify.registerCustomPrompt('promptTextExtractionApplyChoice', promptApplyChoice);
  window.TextExtractionApplyModal = { applyTranslations };
})();

// =============================================================================
// End of public/js/text_extraction_apply_modal.js
// =============================================================================
