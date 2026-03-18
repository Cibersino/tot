// public/js/import_extract_route_choice_modal.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Host import/extract route-choice modal behavior.
// - Resolve user route selection (`native` / `ocr`) without renderer orchestration bloat.
// =============================================================================

(() => {
  if (typeof window.getLogger !== 'function') {
    throw new Error('[import-extract-route-choice-modal] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('import-extract-route-choice-modal');
  log.debug('Import/extract route-choice modal starting...');

  const modal = document.getElementById('importExtractRouteModal');
  const backdrop = document.getElementById('importExtractRouteModalBackdrop');
  const title = document.getElementById('importExtractRouteModalTitle');
  const message = document.getElementById('importExtractRouteModalMessage');
  const btnNative = document.getElementById('importExtractRouteModalNative');
  const btnOcr = document.getElementById('importExtractRouteModalOcr');
  const btnCancel = document.getElementById('importExtractRouteModalCancel');
  const btnClose = document.getElementById('importExtractRouteModalClose');

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

  function translate(tRenderer, key, fallback) {
    if (typeof tRenderer === 'function') {
      return tRenderer(key, fallback);
    }
    return fallback;
  }

  async function promptRouteChoice({ preparation, tRenderer } = {}) {
    if (!hasDualRouteOptions(preparation)) {
      return '';
    }
    if (!hasRequiredElements()) {
      log.error('Route-choice modal DOM elements missing.');
      return '';
    }

    const titleText = translate(
      tRenderer,
      'renderer.alerts.import_extract_route_choice_title',
      'Choose extraction route'
    );
    const messageText = translate(
      tRenderer,
      'renderer.alerts.import_extract_route_choice_message',
      'Both extraction routes are available for this PDF. Choose one to continue.'
    );
    const nativeText = translate(
      tRenderer,
      'renderer.alerts.import_extract_route_choice_native_button',
      'Use native'
    );
    const ocrText = translate(
      tRenderer,
      'renderer.alerts.import_extract_route_choice_ocr_button',
      'Use OCR'
    );
    const cancelText = translate(
      tRenderer,
      'renderer.alerts.import_extract_route_choice_cancel_button',
      'Cancel'
    );

    title.textContent = titleText;
    message.textContent = messageText;
    btnNative.textContent = nativeText;
    btnOcr.textContent = ocrText;
    btnCancel.textContent = cancelText;
    btnClose.setAttribute('aria-label', cancelText);

    return await new Promise((resolve) => {
      let settled = false;

      const cleanup = () => {
        btnNative.removeEventListener('click', onNative);
        btnOcr.removeEventListener('click', onOcr);
        btnCancel.removeEventListener('click', onCancel);
        btnClose.removeEventListener('click', onCancel);
        backdrop.removeEventListener('click', onCancel);
        window.removeEventListener('keydown', onWindowKeyDown);
        modal.setAttribute('aria-hidden', 'true');
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

      modal.setAttribute('aria-hidden', 'false');
      btnNative.focus();
    });
  }

  window.ImportExtractRouteChoiceModal = {
    promptRouteChoice,
  };
})();

// =============================================================================
// End of public/js/import_extract_route_choice_modal.js
// =============================================================================
