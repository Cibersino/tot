// public/js/import_ocr_ui_choice_modal.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Build the import choice modal controller for overwrite/append decisions.
// - Manage repeat-count state, normalization, and optional repeat callbacks.
// - Provide fallback resolutions when modal controls are unavailable.
// - Resolve active choice promises and keep modal visibility/state in sync.
// - Expose window.createImportOcrUiChoiceModal for facade composition.

// =============================================================================
// Factory and dependency contract
// =============================================================================

(() => {
  function createImportOcrUiChoiceModal({ refs, state, appMaxPasteRepeat }) {
    if (!refs || !state || !Number.isFinite(appMaxPasteRepeat) || appMaxPasteRepeat < 1) {
      throw new Error('[import-ocr-ui.choice] missing dependencies');
    }

    // =============================================================================
    // Logger and shared refs
    // =============================================================================

    const log = window.getLogger('import-ocr-ui.choice');

    const {
      importApplyModal,
      importApplyTitle,
      importApplyContext,
      importApplyRepeatRow,
      importApplyRepeatLabel,
      importApplyRepeatInput,
      btnImportApplyOverwrite,
      btnImportApplyAppend,
    } = refs;

    // =============================================================================
    // Modal visibility helpers
    // =============================================================================

    function showChoiceModal() {
      if (!importApplyModal) return;
      importApplyModal.setAttribute('aria-hidden', 'false');
      if (btnImportApplyOverwrite && typeof btnImportApplyOverwrite.focus === 'function') {
        btnImportApplyOverwrite.focus();
      }
    }

    function hideChoiceModal() {
      if (!importApplyModal) return;
      importApplyModal.setAttribute('aria-hidden', 'true');
    }

    // =============================================================================
    // Repeat value normalization helpers
    // =============================================================================

    function parsePositiveInt(raw, fallback) {
      const n = Number(raw);
      if (!Number.isFinite(n)) return fallback;
      const floored = Math.floor(n);
      if (floored < 1) return fallback;
      return floored;
    }

    function normalizeChoiceRepeatValue(rawValue) {
      const n = Number(rawValue);
      if (!Number.isFinite(n)) return state.choiceRepeatMin;
      const floored = Math.floor(n);
      return Math.min(state.choiceRepeatMax, Math.max(state.choiceRepeatMin, floored));
    }

    function normalizeChoiceRepeatConfig(opts = {}) {
      const minCandidate = parsePositiveInt(opts.repeatMin, 1);
      const maxCandidate = parsePositiveInt(opts.repeatMax, appMaxPasteRepeat);
      state.choiceRepeatMin = Math.max(1, minCandidate);
      state.choiceRepeatMax = Math.max(state.choiceRepeatMin, maxCandidate);
      state.choiceRepeatStep = parsePositiveInt(opts.repeatStep, 1);
    }

    // =============================================================================
    // Repeat callback and repeat UI state handling
    // =============================================================================

    function notifyChoiceRepeatChange(repeatCount) {
      if (typeof state.choiceRepeatChangeHandler !== 'function') return;
      try {
        state.choiceRepeatChangeHandler(repeatCount);
      } catch (err) {
        log.warnOnce(
          'import-ocr-ui.choice-repeat-callback.failed',
          'choice repeat callback failed (ignored):',
          err
        );
      }
    }

    function resetChoiceRepeatState() {
      state.choiceRepeatEnabled = false;
      state.choiceRepeatMin = 1;
      state.choiceRepeatMax = appMaxPasteRepeat;
      state.choiceRepeatStep = 1;
      state.choiceRepeatChangeHandler = null;
      if (importApplyRepeatRow) importApplyRepeatRow.hidden = true;
    }

    function applyChoiceRepeatOptions(opts = {}) {
      const repeatEnabled = !!(
        opts.showRepeatInput
        && importApplyRepeatRow
        && importApplyRepeatInput
      );

      state.choiceRepeatEnabled = repeatEnabled;
      state.choiceRepeatChangeHandler = typeof opts.onRepeatChange === 'function'
        ? opts.onRepeatChange
        : null;

      if (!repeatEnabled) {
        resetChoiceRepeatState();
        return;
      }

      normalizeChoiceRepeatConfig(opts);
      const normalizedInitialValue = normalizeChoiceRepeatValue(
        Object.prototype.hasOwnProperty.call(opts, 'repeatValue')
          ? opts.repeatValue
          : state.choiceRepeatMin
      );

      importApplyRepeatInput.min = String(state.choiceRepeatMin);
      importApplyRepeatInput.max = String(state.choiceRepeatMax);
      importApplyRepeatInput.step = String(state.choiceRepeatStep);
      importApplyRepeatInput.value = String(normalizedInitialValue);
      importApplyRepeatInput.setAttribute(
        'aria-label',
        String(opts.repeatAriaLabel || opts.repeatLabel || importApplyRepeatInput.getAttribute('aria-label') || 'Repeat count')
      );
      if (importApplyRepeatLabel) {
        importApplyRepeatLabel.textContent = String(opts.repeatLabel || importApplyRepeatLabel.textContent || '').trim();
      }
      importApplyRepeatRow.hidden = false;
      notifyChoiceRepeatChange(normalizedInitialValue);
    }

    // =============================================================================
    // Choice settle/prompt flow
    // =============================================================================

    function normalizeExternalRepeatValue(rawValue, rawMin, rawMax) {
      const min = parsePositiveInt(rawMin, 1);
      const max = Math.max(min, parsePositiveInt(rawMax, appMaxPasteRepeat));
      const n = Number(rawValue);
      if (!Number.isFinite(n)) return min;
      return Math.min(max, Math.max(min, Math.floor(n)));
    }

    function settleChoice(rawValue) {
      const resolve = state.choiceResolve;
      state.choiceResolve = null;
      state.choiceDismissValue = '';
      const selectedValue = String(rawValue || '');
      let nextPayload = selectedValue;
      if (state.choiceRepeatEnabled) {
        const repeatCount = normalizeChoiceRepeatValue(
          importApplyRepeatInput ? importApplyRepeatInput.value : state.choiceRepeatMin
        );
        if (importApplyRepeatInput) {
          importApplyRepeatInput.value = String(repeatCount);
        }
        notifyChoiceRepeatChange(repeatCount);
        nextPayload = {
          value: selectedValue,
          repeatCount,
        };
      }
      resetChoiceRepeatState();
      hideChoiceModal();
      if (typeof resolve === 'function') resolve(nextPayload);
    }

    function promptChoice(options = {}) {
      const opts = (options && typeof options === 'object') ? options : {};
      const dismissValue = String(opts.dismissValue || '');
      if (
        !importApplyModal
        || !importApplyTitle
        || !btnImportApplyOverwrite
        || !btnImportApplyAppend
      ) {
        if (opts.showRepeatInput) {
          log.warnOnce(
            'import-ocr-ui.choice.modal-unavailable.fallback-with-repeat',
            'Import choice modal unavailable; returning dismissValue with normalized repeatCount fallback.'
          );
          return Promise.resolve({
            value: dismissValue,
            repeatCount: normalizeExternalRepeatValue(opts.repeatValue, opts.repeatMin, opts.repeatMax),
          });
        }
        log.warnOnce(
          'import-ocr-ui.choice.modal-unavailable.fallback-dismiss',
          'Import choice modal unavailable; returning dismissValue fallback.'
        );
        return Promise.resolve(dismissValue);
      }

      const titleText = String(opts.title || importApplyTitle.textContent || '').trim();
      const contextText = String(opts.context || '').trim();
      const primaryLabel = String(opts.primaryLabel || btnImportApplyOverwrite.textContent || '').trim();
      const secondaryLabel = String(opts.secondaryLabel || btnImportApplyAppend.textContent || '').trim();
      const primaryValue = String(opts.primaryValue || '');
      const secondaryValue = String(opts.secondaryValue || '');

      if (state.choiceResolve) settleChoice(state.choiceDismissValue);
      state.choiceDismissValue = dismissValue;

      importApplyTitle.textContent = titleText;
      if (importApplyContext) {
        importApplyContext.textContent = contextText;
        importApplyContext.hidden = !contextText;
      }

      btnImportApplyOverwrite.textContent = primaryLabel;
      btnImportApplyOverwrite.dataset.returnValue = primaryValue;
      btnImportApplyAppend.textContent = secondaryLabel;
      btnImportApplyAppend.dataset.returnValue = secondaryValue;
      applyChoiceRepeatOptions(opts);

      return new Promise((resolve) => {
        state.choiceResolve = resolve;
        showChoiceModal();
      });
    }

    // =============================================================================
    // Module surface
    // =============================================================================

    return {
      promptChoice,
      settleChoice,
      normalizeChoiceRepeatValue,
      notifyChoiceRepeatChange,
    };
  }

  // =============================================================================
  // Export
  // =============================================================================

  window.createImportOcrUiChoiceModal = createImportOcrUiChoiceModal;
})();

// =============================================================================
// End of public/js/import_ocr_ui_choice_modal.js
// =============================================================================
