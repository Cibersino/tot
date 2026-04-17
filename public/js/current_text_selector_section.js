// public/js/current_text_selector_section.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own the full current-text selector section UI in the main window.
// - Render the selector title and current-text preview.
// - Own selector-toolbar DOM bindings, lock state, and event wiring.
// - Own clipboard-repeat input normalization and visual state for that section.
// =============================================================================

(() => {
  // =============================================================================
  // Logger / constants / DOM
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[current-text-selector-section] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('current-text-selector-section');
  log.debug('Current text selector section starting...');

  const { AppConstants } = window;
  if (!AppConstants) {
    throw new Error('[current-text-selector-section] AppConstants unavailable; cannot continue');
  }

  const {
    MAX_CLIPBOARD_REPEAT,
    PREVIEW_INLINE_THRESHOLD,
    PREVIEW_START_CHARS,
    PREVIEW_END_CHARS,
  } = AppConstants;

  const selectorTitle = document.getElementById('selector-title');
  const textPreview = document.getElementById('textPreview');
  const btnImportExtract = document.getElementById('btnImportExtract');
  const btnOverwriteClipboard = document.getElementById('btnOverwriteClipboard');
  const btnAppendClipboard = document.getElementById('btnAppendClipboard');
  const clipboardRepeatInput = document.getElementById('clipboardRepeatInput');
  const btnEdit = document.getElementById('btnEdit');
  const btnEmptyMain = document.getElementById('btnEmptyMain');
  const btnLoadSnapshot = document.getElementById('btnLoadSnapshot');
  const btnSaveSnapshot = document.getElementById('btnSaveSnapshot');
  const btnNewTask = document.getElementById('btnNewTask');
  const btnLoadTask = document.getElementById('btnLoadTask');
  const btnReadingSpeedTest = document.getElementById('btnReadingSpeedTest');
  const previewSpoilerToggle = document.getElementById('previewSpoilerToggle');
  const previewSpoilerToggleLabel = document.getElementById('previewSpoilerToggleLabel');
  const previewSpoilerText = document.getElementById('previewSpoilerText');
  const btnImportExtractAbort = document.getElementById('btnImportExtractAbort');

  const selectorControls = [
    btnImportExtract,
    btnOverwriteClipboard,
    btnAppendClipboard,
    clipboardRepeatInput,
    btnEdit,
    btnEmptyMain,
    btnLoadSnapshot,
    btnSaveSnapshot,
    btnNewTask,
    btnLoadTask,
    btnReadingSpeedTest,
    previewSpoilerToggle,
  ].filter(Boolean);

  // =============================================================================
  // Shared state
  // =============================================================================
  let actionsBound = false;
  let selectorInteractionLocked = false;
  let editorLaunchPending = false;
  let lastPreviewText = '';
  let lastPreviewEmptyText = '';

  // =============================================================================
  // Helpers
  // =============================================================================
  function setControlInteractionLocked(element, locked) {
    if (!element) return;
    element.disabled = locked;
    element.setAttribute('aria-disabled', locked ? 'true' : 'false');
  }

  function applyEditControlState() {
    if (!btnEdit) return;
    const locked = selectorInteractionLocked || editorLaunchPending;
    setControlInteractionLocked(btnEdit, locked);
  }

  function updateClipboardRepeatVisualState(rawValue = '') {
    if (!clipboardRepeatInput) return;
    const numericValue = Number(rawValue);
    const isRepeatActive = Number.isFinite(numericValue) && numericValue > 1;
    clipboardRepeatInput.classList.toggle('is-repeat-active', isRepeatActive);
  }

  function normalizeClipboardRepeat(rawValue) {
    const textApplyApi = window.TextApplyCanonical;
    if (textApplyApi && typeof textApplyApi.normalizeRepeat === 'function') {
      return textApplyApi.normalizeRepeat(rawValue, { maxRepeat: MAX_CLIPBOARD_REPEAT });
    }
    log.warn(
      'TextApplyCanonical.normalizeRepeat unavailable; using local repeat normalization fallback.'
    );
    const numericValue = Number(rawValue);
    if (!Number.isInteger(numericValue) || numericValue < 1) return 1;
    return Math.min(numericValue, MAX_CLIPBOARD_REPEAT);
  }

  function bindRequiredAction(element, actionName, handler) {
    if (!element) return;
    if (typeof handler !== 'function') {
      throw new Error(`[current-text-selector-section] Invalid handler for ${actionName}`);
    }
    element.addEventListener('click', handler);
  }

  function normalizePreviewValue(value) {
    if (typeof value === 'string') return value;
    if (value === null || typeof value === 'undefined') return '';
    return String(value);
  }

  function isPreviewSpoilerEnabled() {
    return !previewSpoilerToggle || previewSpoilerToggle.checked;
  }

  function buildPreviewText(text, { emptyText = '', showPreviewEnd = true } = {}) {
    const displayText = normalizePreviewValue(text).replace(/\r?\n/g, '   ');
    const displayLength = displayText.length;

    if (displayLength === 0) return emptyText;

    if (displayLength <= PREVIEW_INLINE_THRESHOLD) {
      return displayText;
    }

    const visibleStartChars = showPreviewEnd
      ? PREVIEW_START_CHARS
      : PREVIEW_START_CHARS + PREVIEW_END_CHARS;
    const start = displayText.slice(0, visibleStartChars);
    if (!showPreviewEnd) return `${start}...`;

    const end = displayText.slice(-PREVIEW_END_CHARS);
    return `${start}... | ...${end}`;
  }

  function renderPreviewFromState() {
    if (!textPreview) return;
    textPreview.textContent = buildPreviewText(lastPreviewText, {
      emptyText: lastPreviewEmptyText,
      showPreviewEnd: isPreviewSpoilerEnabled(),
    });
  }

  function initializeClipboardRepeatInput() {
    if (!clipboardRepeatInput) return;
    clipboardRepeatInput.min = '1';
    clipboardRepeatInput.max = String(MAX_CLIPBOARD_REPEAT);
    updateClipboardRepeatVisualState(clipboardRepeatInput.value);
    clipboardRepeatInput.addEventListener('input', () => {
      updateClipboardRepeatVisualState(clipboardRepeatInput.value);
    });
  }

  function initializePreviewSpoilerToggle() {
    if (!previewSpoilerToggle) return;
    previewSpoilerToggle.checked = true;
    previewSpoilerToggle.addEventListener('change', () => {
      renderPreviewFromState();
    });
  }

  // =============================================================================
  // Public API
  // =============================================================================
  function applyTranslations({ tRenderer } = {}) {
    if (typeof tRenderer !== 'function') {
      log.warnOnce(
        'current_text_selector_section.tRenderer.invalid',
        'tRenderer unavailable; selector translations skipped.'
      );
      return;
    }

    if (selectorTitle) selectorTitle.textContent = tRenderer('renderer.main.selector_title');
    if (btnImportExtract) btnImportExtract.textContent = tRenderer('renderer.main.buttons.import_extract');
    if (btnOverwriteClipboard) btnOverwriteClipboard.textContent = tRenderer('renderer.main.buttons.overwrite_clipboard');
    if (btnAppendClipboard) btnAppendClipboard.textContent = tRenderer('renderer.main.buttons.append_clipboard');
    if (btnEdit) btnEdit.textContent = tRenderer('renderer.main.buttons.edit');
    if (btnEmptyMain) btnEmptyMain.textContent = tRenderer('renderer.main.buttons.clear');
    if (btnLoadSnapshot) btnLoadSnapshot.textContent = tRenderer('renderer.main.buttons.snapshot_load');
    if (btnSaveSnapshot) btnSaveSnapshot.textContent = tRenderer('renderer.main.buttons.snapshot_save');
    if (btnNewTask) btnNewTask.textContent = tRenderer('renderer.main.buttons.task_new');
    if (btnLoadTask) btnLoadTask.textContent = tRenderer('renderer.main.buttons.task_load');

    if (btnImportExtract) btnImportExtract.title = tRenderer('renderer.main.tooltips.import_extract');
    if (btnOverwriteClipboard) btnOverwriteClipboard.title = tRenderer('renderer.main.tooltips.overwrite_clipboard');
    if (btnAppendClipboard) btnAppendClipboard.title = tRenderer('renderer.main.tooltips.append_clipboard');
    if (btnEdit) btnEdit.title = tRenderer('renderer.main.tooltips.edit');
    if (btnEmptyMain) btnEmptyMain.title = tRenderer('renderer.main.tooltips.clear');
    if (btnLoadSnapshot) btnLoadSnapshot.title = tRenderer('renderer.main.tooltips.snapshot_load');
    if (btnSaveSnapshot) btnSaveSnapshot.title = tRenderer('renderer.main.tooltips.snapshot_save');
    if (btnNewTask) btnNewTask.title = tRenderer('renderer.main.tooltips.task_new');
    if (btnLoadTask) btnLoadTask.title = tRenderer('renderer.main.tooltips.task_load');

    if (btnImportExtract) {
      btnImportExtract.setAttribute('aria-label', tRenderer('renderer.main.aria.import_extract'));
    }
    if (clipboardRepeatInput) {
      clipboardRepeatInput.title = tRenderer('renderer.main.tooltips.clipboard_repeat_count');
      clipboardRepeatInput.setAttribute('aria-label', tRenderer('renderer.main.aria.clipboard_repeat_count'));
    }
    if (btnReadingSpeedTest) {
      const label = tRenderer('renderer.main.reading_tools.reading_speed_test');
      btnReadingSpeedTest.textContent = label;
      if (label) {
        btnReadingSpeedTest.title = label;
        btnReadingSpeedTest.setAttribute('aria-label', label);
      }
    }
    if (previewSpoilerText) {
      const label = tRenderer('renderer.main.reading_tools.preview_spoiler');
      previewSpoilerText.textContent = label;
      if (previewSpoilerToggleLabel) previewSpoilerToggleLabel.title = label;
      if (previewSpoilerToggle) {
        previewSpoilerToggle.title = label;
        previewSpoilerToggle.setAttribute('aria-label', label);
      }
    }
  }

  function bindActions({
    onImportExtract,
    onImportExtractAbort,
    onOverwriteClipboard,
    onAppendClipboard,
    onOpenEditor,
    onClearText,
    onLoadSnapshot,
    onSaveSnapshot,
    onNewTask,
    onLoadTask,
    onReadingSpeedTest,
  } = {}) {
    if (actionsBound) return;

    bindRequiredAction(btnImportExtract, 'import-extract', onImportExtract);
    bindRequiredAction(btnImportExtractAbort, 'import-extract-abort', onImportExtractAbort);
    bindRequiredAction(btnOverwriteClipboard, 'clipboard-overwrite', onOverwriteClipboard);
    bindRequiredAction(btnAppendClipboard, 'clipboard-append', onAppendClipboard);
    bindRequiredAction(btnEdit, 'open-editor', onOpenEditor);
    bindRequiredAction(btnEmptyMain, 'clear-text', onClearText);
    bindRequiredAction(btnLoadSnapshot, 'snapshot-load', onLoadSnapshot);
    bindRequiredAction(btnSaveSnapshot, 'snapshot-save', onSaveSnapshot);
    bindRequiredAction(btnNewTask, 'task-new', onNewTask);
    bindRequiredAction(btnLoadTask, 'task-load', onLoadTask);
    bindRequiredAction(btnReadingSpeedTest, 'reading-speed-test', onReadingSpeedTest);

    actionsBound = true;
  }

  function setInteractionLocked(locked) {
    selectorInteractionLocked = !!locked;
    selectorControls.forEach((control) => {
      if (control === btnEdit) return;
      setControlInteractionLocked(control, selectorInteractionLocked);
    });
    applyEditControlState();
  }

  function setEditorLaunchPending(pending) {
    editorLaunchPending = !!pending;
    applyEditControlState();
  }

  function renderPreview(text, { emptyText = '' } = {}) {
    lastPreviewText = normalizePreviewValue(text);
    lastPreviewEmptyText = normalizePreviewValue(emptyText);
    renderPreviewFromState();
  }

  function getClipboardRepeatCount() {
    if (!clipboardRepeatInput) return 1;
    const normalized = normalizeClipboardRepeat(clipboardRepeatInput.value);
    clipboardRepeatInput.value = String(normalized);
    updateClipboardRepeatVisualState(normalized);
    return normalized;
  }

  initializeClipboardRepeatInput();
  initializePreviewSpoilerToggle();

  window.CurrentTextSelectorSection = {
    applyTranslations,
    bindActions,
    getClipboardRepeatCount,
    renderPreview,
    setEditorLaunchPending,
    setInteractionLocked,
  };
})();

// =============================================================================
// End of public/js/current_text_selector_section.js
// =============================================================================
