// public/js/import_extract_ocr_activation_disclosure_modal.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Host the pre-consent disclosure modal shown before launching Google OAuth.
// - Populate disclosure copy from renderer translations at prompt time.
// - Open the bundled privacy policy through the existing app-doc bridge.
// - Resolve explicit user consent without bloating renderer orchestration.
// =============================================================================

(() => {
  // =============================================================================
  // Imports / logger
  // =============================================================================

  if (typeof window.getLogger !== 'function') {
    throw new Error('[import-extract-ocr-activation-disclosure-modal] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('import-extract-ocr-activation-disclosure-modal');
  log.debug('Import/extract OCR activation disclosure modal starting...');
  if (!window.RendererI18n || typeof window.RendererI18n.tRenderer !== 'function') {
    throw new Error('[import-extract-ocr-activation-disclosure-modal] RendererI18n.tRenderer unavailable; cannot continue');
  }
  const { tRenderer } = window.RendererI18n;

  // =============================================================================
  // UI elements
  // =============================================================================

  const modal = document.getElementById('importExtractOcrActivationDisclosureModal');
  const backdrop = document.getElementById('importExtractOcrActivationDisclosureBackdrop');
  const title = document.getElementById('importExtractOcrActivationDisclosureTitle');
  const intro = document.getElementById('importExtractOcrActivationDisclosureIntro');
  const itemSelectedFiles = document.getElementById('importExtractOcrActivationDisclosureSelectedFiles');
  const itemLocalStorage = document.getElementById('importExtractOcrActivationDisclosureLocalStorage');
  const itemRemoteCleanup = document.getElementById('importExtractOcrActivationDisclosureRemoteCleanup');
  const itemDisconnect = document.getElementById('importExtractOcrActivationDisclosureDisconnect');
  const privacyLink = document.getElementById('importExtractOcrActivationDisclosurePrivacy');
  const btnProceed = document.getElementById('importExtractOcrActivationDisclosureProceed');
  const btnCancel = document.getElementById('importExtractOcrActivationDisclosureCancel');
  const btnClose = document.getElementById('importExtractOcrActivationDisclosureClose');

  // =============================================================================
  // Helpers
  // =============================================================================

  function hasRequiredElements() {
    return !!(modal
      && backdrop
      && title
      && intro
      && itemSelectedFiles
      && itemLocalStorage
      && itemRemoteCleanup
      && itemDisconnect
      && privacyLink
      && btnProceed
      && btnCancel
      && btnClose);
  }

  async function openPrivacyPolicy() {
    const api = window.electronAPI;
    if (!api || typeof api.openAppDoc !== 'function') {
      log.warnOnce(
        'renderer.importExtract.ocrActivationDisclosure.openAppDoc.unavailable',
        'openAppDoc unavailable; OCR activation disclosure privacy link cannot open.'
      );
      return;
    }

    try {
      const result = await api.openAppDoc('privacy-policy');
      if (!result || result.ok !== true) {
        log.warn('OCR activation disclosure privacy doc blocked or failed:', result);
      }
    } catch (err) {
      log.warn('OCR activation disclosure privacy doc request failed:', err);
    }
  }

  function applyModalCopy() {
    title.textContent = tRenderer(
      'renderer.alerts.import_extract_ocr_activation_disclosure_title',
      'Review Google OCR activation'
    );
    intro.textContent = tRenderer(
      'renderer.alerts.import_extract_ocr_activation_disclosure_intro',
      'toT uses Google services for OCR. Continuing will open your browser so you can authorize this app.'
    );
    itemSelectedFiles.textContent = tRenderer(
      'renderer.alerts.import_extract_ocr_activation_disclosure_selected_files',
      'Only files you choose for OCR are sent to Google.'
    );
    itemLocalStorage.textContent = tRenderer(
      'renderer.alerts.import_extract_ocr_activation_disclosure_local_storage',
      'This app stores app-managed Google OAuth credentials for OCR and local Google token state in this app instance.'
    );
    itemRemoteCleanup.textContent = tRenderer(
      'renderer.alerts.import_extract_ocr_activation_disclosure_remote_cleanup',
      'After export, the app attempts to remove the temporary Google document from your Google Drive.'
    );
    itemDisconnect.textContent = tRenderer(
      'renderer.alerts.import_extract_ocr_activation_disclosure_disconnect',
      'You can later disconnect via Preferences > Disconnect Google OCR.'
    );
    privacyLink.textContent = tRenderer(
      'renderer.alerts.import_extract_ocr_activation_disclosure_privacy_link',
      'Open privacy policy'
    );
    btnProceed.textContent = tRenderer(
      'renderer.alerts.import_extract_ocr_activation_disclosure_proceed_button',
      'Continue to Google'
    );
    btnCancel.textContent = tRenderer(
      'renderer.alerts.import_extract_ocr_activation_disclosure_cancel_button',
      'Cancel'
    );
    btnClose.setAttribute(
      'aria-label',
      tRenderer(
        'renderer.alerts.import_extract_ocr_activation_disclosure_close_aria',
        'Close OCR activation disclosure dialog'
      )
    );
  }

  // =============================================================================
  // Public entrypoints
  // =============================================================================

  async function promptDisclosure() {
    if (!hasRequiredElements()) {
      throw new Error('OCR activation disclosure modal DOM elements missing.');
    }

    applyModalCopy();

    return await new Promise((resolve) => {
      let settled = false;

      const cleanup = () => {
        btnProceed.removeEventListener('click', onProceed);
        btnCancel.removeEventListener('click', onCancel);
        btnClose.removeEventListener('click', onCancel);
        backdrop.removeEventListener('click', onCancel);
        privacyLink.removeEventListener('click', onPrivacyClick);
        window.removeEventListener('keydown', onWindowKeyDown);
        modal.setAttribute('aria-hidden', 'true');
      };

      const finish = (accepted) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(accepted);
      };

      const onProceed = () => finish(true);
      const onCancel = () => finish(false);
      const onPrivacyClick = async (ev) => {
        ev.preventDefault();
        await openPrivacyPolicy();
      };
      const onWindowKeyDown = (ev) => {
        if (modal.getAttribute('aria-hidden') !== 'false') return;
        if (ev.key === 'Escape') {
          ev.preventDefault();
          finish(false);
        }
      };

      btnProceed.addEventListener('click', onProceed);
      btnCancel.addEventListener('click', onCancel);
      btnClose.addEventListener('click', onCancel);
      backdrop.addEventListener('click', onCancel);
      privacyLink.addEventListener('click', onPrivacyClick);
      window.addEventListener('keydown', onWindowKeyDown);

      modal.setAttribute('aria-hidden', 'false');
      btnProceed.focus();
    });
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================

  window.ImportExtractOcrActivationDisclosureModal = {
    promptDisclosure,
  };
})();

// =============================================================================
// End of public/js/import_extract_ocr_activation_disclosure_modal.js
// =============================================================================
