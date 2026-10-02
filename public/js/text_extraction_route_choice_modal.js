// public/js/text_extraction_route_choice_modal.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Host text extraction route-choice modal behavior.
// - Prompt only when both `native` and `ocr` routes are available for the prepared file.
// - Resolve user route selection (`native` / `ocr`) without renderer orchestration bloat.

(() => {
  // =============================================================================
  // Imports / logger
  // =============================================================================

  if (typeof window.getLogger !== 'function') {
    throw new Error('[text-extraction-route-choice-modal] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('text-extraction-route-choice-modal');
  log.debug('Text extraction route-choice modal starting...');
  if (!window.RendererI18n || typeof window.RendererI18n.tRenderer !== 'function') {
    throw new Error('[text-extraction-route-choice-modal] RendererI18n.tRenderer unavailable; cannot continue');
  }
  const { tRenderer } = window.RendererI18n;

  // =============================================================================
  // UI elements
  // =============================================================================

  const modal = document.getElementById('textExtractionRouteModal');
  const backdrop = document.getElementById('textExtractionRouteModalBackdrop');
  const title = document.getElementById('textExtractionRouteModalTitle');
  const message = document.getElementById('textExtractionRouteModalMessage');
  const btnNative = document.getElementById('textExtractionRouteModalNative');
  const btnOcr = document.getElementById('textExtractionRouteModalOcr');
  const btnCancel = document.getElementById('textExtractionRouteModalCancel');
  const btnClose = document.getElementById('textExtractionRouteModalClose');
  let activePromptTranslations = null;

  // =============================================================================
  // Helpers
  // =============================================================================

  function hasRequiredElements() {
    return !!(modal
      && backdrop
      && title
      && message
      && btnNative
      && btnOcr
      && btnCancel
      && btnClose);
  }

  function hasDualRouteOptions(preparation) {
    const options = Array.isArray(preparation && preparation.routeChoiceOptions)
      ? preparation.routeChoiceOptions
      : [];
    return options.includes('native') && options.includes('ocr');
  }

  function applyModalCopy() {
    title.textContent = tRenderer('renderer.text_extraction.route_choice.title');
    message.textContent = tRenderer('renderer.text_extraction.route_choice.message');
    btnNative.textContent = tRenderer('renderer.text_extraction.route_choice.native_button');
    btnOcr.textContent = tRenderer('renderer.text_extraction.route_choice.ocr_button');
    btnCancel.textContent = tRenderer('renderer.text_extraction.route_choice.cancel_button');
    btnClose.setAttribute('aria-label', tRenderer('renderer.text_extraction.route_choice.close_aria'));
  }

  function applyTranslations() {
    if (activePromptTranslations) activePromptTranslations();
  }

  // =============================================================================
  // Public entrypoints
  // =============================================================================

  async function promptRouteChoice({ preparation } = {}) {
    if (!hasDualRouteOptions(preparation)) {
      return '';
    }
    if (!hasRequiredElements()) {
      log.error('Route-choice modal DOM elements missing.');
      return '';
    }

    applyModalCopy();

    return await new Promise((resolve) => {
      let settled = false;

      const cleanup = () => {
        activePromptTranslations = null;
        btnNative.removeEventListener('click', onNative);
        btnOcr.removeEventListener('click', onOcr);
        btnCancel.removeEventListener('click', onCancel);
        btnClose.removeEventListener('click', onCancel);
        backdrop.removeEventListener('click', onCancel);
        window.removeEventListener('keydown', onWindowKeyDown);
        modal.setAttribute('aria-hidden', 'true');
        window.Notify.deactivateModalFocus(modal);
      };

      const finish = (choice) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(choice);
      };

      const onNative = () => finish('native');
      const onOcr = () => finish('ocr');
      const onCancel = () => finish('');
      const onWindowKeyDown = (ev) => {
        if (modal.getAttribute('aria-hidden') !== 'false') return;
        if (ev.key === 'Escape') {
          ev.preventDefault();
          finish('');
        }
      };

      btnNative.addEventListener('click', onNative);
      btnOcr.addEventListener('click', onOcr);
      btnCancel.addEventListener('click', onCancel);
      btnClose.addEventListener('click', onCancel);
      backdrop.addEventListener('click', onCancel);
      window.addEventListener('keydown', onWindowKeyDown);
      activePromptTranslations = applyModalCopy;

      modal.setAttribute('aria-hidden', 'false');
      window.Notify.activateModalFocus(modal, {
        initialFocus: btnOcr,
        fallbackFocus: btnClose,
      });
    });
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================

  window.Notify.registerCustomPrompt('promptTextExtractionRouteChoice', promptRouteChoice);
  window.TextExtractionRouteChoiceModal = { applyTranslations };
})();

// =============================================================================
// End of public/js/text_extraction_route_choice_modal.js
// =============================================================================
