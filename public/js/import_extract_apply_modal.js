// public/js/import_extract_apply_modal.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Host import/extract post-extraction apply modal behavior.
// - Return user apply intent (`overwrite`/`append`) + repetitions.
// =============================================================================

(() => {
  if (typeof window.getLogger !== 'function') {
    throw new Error('[import-extract-apply-modal] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('import-extract-apply-modal');
  log.debug('Import/extract apply modal starting...');

  const modal = document.getElementById('importExtractApplyModal');
  const backdrop = document.getElementById('importExtractApplyModalBackdrop');
  const title = document.getElementById('importExtractApplyModalTitle');
  const message = document.getElementById('importExtractApplyModalMessage');
  const elapsed = document.getElementById('importExtractApplyModalElapsed');
  const repeatLabel = document.getElementById('importExtractApplyModalRepeatLabel');
  const repeatInput = document.getElementById('importExtractApplyModalRepeatInput');
  const btnOverwrite = document.getElementById('importExtractApplyModalOverwrite');
  const btnAppend = document.getElementById('importExtractApplyModalAppend');
  const btnCancel = document.getElementById('importExtractApplyModalCancel');
  const btnClose = document.getElementById('importExtractApplyModalClose');

  function hasRequiredElements() {
    return !!(modal
      && backdrop
      && title
      && message
      && elapsed
      && repeatLabel
      && repeatInput
      && btnOverwrite
      && btnAppend
      && btnCancel
      && btnClose);
  }

  function translate(tRenderer, key, fallback) {
    if (typeof tRenderer === 'function') {
      return tRenderer(key, fallback);
    }
    return fallback;
  }

  function normalizeRepeatForModal(rawValue, maxRepeat) {
    if (window.TextApplyCanonical && typeof window.TextApplyCanonical.normalizeRepeat === 'function') {
      return window.TextApplyCanonical.normalizeRepeat(rawValue, { maxRepeat });
    }
    const numeric = Number(rawValue);
    if (!Number.isInteger(numeric) || numeric < 1) return 1;
    return Math.min(numeric, maxRepeat);
  }

  async function promptApplyChoice({
    tRenderer,
    elapsedText = '',
    defaultRepeat = 1,
    maxRepeat = 1,
  } = {}) {
    if (!hasRequiredElements()) {
      log.error('Apply modal DOM elements missing.');
      return null;
    }

    const safeMaxRepeat = Number.isInteger(Number(maxRepeat)) && Number(maxRepeat) > 0
      ? Number(maxRepeat)
      : 1;
    const initialRepeat = normalizeRepeatForModal(defaultRepeat, safeMaxRepeat);

    const titleText = translate(
      tRenderer,
      'renderer.alerts.import_extract_apply_modal_title',
      'Apply extracted text'
    );
    const messageText = translate(
      tRenderer,
      'renderer.alerts.import_extract_apply_modal_message',
      'Choose how to apply the extracted text.'
    );
    const repeatLabelText = translate(
      tRenderer,
      'renderer.alerts.import_extract_apply_modal_repeat_label',
      'Repetitions'
    );
    const overwriteText = translate(
      tRenderer,
      'renderer.alerts.import_extract_apply_modal_overwrite_button',
      'Overwrite'
    );
    const appendText = translate(
      tRenderer,
      'renderer.alerts.import_extract_apply_modal_append_button',
      'Append'
    );
    const cancelText = translate(
      tRenderer,
      'renderer.alerts.import_extract_apply_modal_cancel_button',
      'Cancel'
    );
    const closeAriaText = translate(
      tRenderer,
      'renderer.alerts.import_extract_apply_modal_close_aria',
      'Close apply extracted text dialog'
    );

    title.textContent = titleText;
    message.textContent = messageText;
    elapsed.textContent = typeof elapsedText === 'string' ? elapsedText.trim() : '';
    elapsed.hidden = !elapsed.textContent;
    elapsed.setAttribute('aria-hidden', elapsed.hidden ? 'true' : 'false');
    repeatLabel.textContent = repeatLabelText;
    btnOverwrite.textContent = overwriteText;
    btnAppend.textContent = appendText;
    btnCancel.textContent = cancelText;
    btnClose.setAttribute('aria-label', closeAriaText);

    repeatInput.min = '1';
    repeatInput.max = String(safeMaxRepeat);
    repeatInput.step = '1';
    repeatInput.value = String(initialRepeat);

    return await new Promise((resolve) => {
      let settled = false;

      const cleanup = () => {
        btnOverwrite.removeEventListener('click', onOverwrite);
        btnAppend.removeEventListener('click', onAppend);
        btnCancel.removeEventListener('click', onCancel);
        btnClose.removeEventListener('click', onCancel);
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
      backdrop.addEventListener('click', onCancel);
      repeatInput.addEventListener('blur', onRepeatBlur);
      window.addEventListener('keydown', onWindowKeyDown);

      modal.setAttribute('aria-hidden', 'false');
      repeatInput.focus();
      repeatInput.select();
    });
  }

  window.ImportExtractApplyModal = {
    promptApplyChoice,
  };
})();

// =============================================================================
// End of public/js/import_extract_apply_modal.js
// =============================================================================
