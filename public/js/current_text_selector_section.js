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
  if (
    !window.RendererI18n
    || typeof window.RendererI18n.getUiLanguageDirection !== 'function'
    || typeof window.RendererI18n.resolveUserTextDirection !== 'function'
  ) {
    throw new Error('[current-text-selector-section] RendererI18n direction helpers unavailable; cannot continue');
  }
  const { getUiLanguageDirection, resolveUserTextDirection } = window.RendererI18n;

  const {
    MAX_CLIPBOARD_REPEAT,
    PREVIEW_INLINE_THRESHOLD,
    PREVIEW_START_CHARS,
    PREVIEW_END_CHARS,
  } = AppConstants;
  const selectorTitle = document.getElementById('selector-title');
  const textPreview = document.getElementById('textPreview');
  const btnTextExtraction = document.getElementById('btnTextExtraction');
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
  const previewSpoilerDescription = document.getElementById('previewSpoilerDescription');
  const btnTextExtractionAbort = document.getElementById('btnTextExtractionAbort');

  const selectorControls = [
    btnTextExtraction,
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
  let persistPreviewSpoilerEnabled = null;
  let previewSpoilerSavePending = false;

  // =============================================================================
  // Helpers
  // =============================================================================

  // Control-state helpers

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

  function applyPreviewSpoilerToggleControlState() {
    setControlInteractionLocked(
      previewSpoilerToggle,
      !persistPreviewSpoilerEnabled || selectorInteractionLocked || previewSpoilerSavePending
    );
  }

  // Clipboard repeat helpers

  function updateClipboardRepeatVisualState(rawValue = '') {
    if (!clipboardRepeatInput) return;
    const numericValue = Number(rawValue);
    const isRepeatActive = Number.isFinite(numericValue) && numericValue > 1;
    const isInvalid = !Number.isInteger(numericValue)
      || numericValue < 1
      || numericValue > MAX_CLIPBOARD_REPEAT;
    clipboardRepeatInput.classList.toggle('is-repeat-active', isRepeatActive);
    clipboardRepeatInput.classList.toggle('is-invalid', isInvalid);
    clipboardRepeatInput.setAttribute('aria-invalid', isInvalid ? 'true' : 'false');
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

  function commitClipboardRepeatInput() {
    if (!clipboardRepeatInput) return 1;
    const normalized = normalizeClipboardRepeat(clipboardRepeatInput.value);
    clipboardRepeatInput.value = String(normalized);
    updateClipboardRepeatVisualState(normalized);
    return normalized;
  }

  // Preview rendering helpers

  function normalizePreviewValue(value) {
    if (typeof value === 'string') return value;
    if (value === null || typeof value === 'undefined') return '';
    return String(value);
  }

  function isPreviewSpoilerEnabled() {
    return !previewSpoilerToggle || previewSpoilerToggle.checked;
  }

  function normalizePreviewDisplayText(text) {
    return normalizePreviewValue(text).replace(/\r?\n/g, '   ');
  }

  function buildPreviewRenderModel(text, { emptyText = '', showPreviewEnd = true } = {}) {
    const displayText = normalizePreviewDisplayText(text);
    const displayLength = displayText.length;

    if (displayLength === 0) {
      return {
        direction: getUiLanguageDirection(),
        kind: 'plain',
        isEmpty: true,
        text: emptyText,
      };
    }

    const direction = resolveUserTextDirection(displayText);

    if (displayLength <= PREVIEW_INLINE_THRESHOLD) {
      return {
        direction,
        kind: 'plain',
        text: displayText,
      };
    }

    const visibleStartChars = showPreviewEnd
      ? PREVIEW_START_CHARS
      : PREVIEW_START_CHARS + PREVIEW_END_CHARS;
    const start = displayText.slice(0, visibleStartChars);
    if (!showPreviewEnd) {
      return {
        direction,
        kind: 'leading-fragment',
        start,
        marker: '...',
      };
    }

    const end = displayText.slice(-PREVIEW_END_CHARS);
    return {
      direction,
      kind: 'truncated-pair',
      start,
      separator: '... | ...',
      end,
    };
  }

  function createPreviewTextFragment(text, { isEmpty = false } = {}) {
    const fragment = document.createElement('bdi');
    fragment.className = isEmpty ? 'preview-fragment preview-fragment--empty' : 'preview-fragment';
    fragment.setAttribute('dir', 'auto');
    fragment.textContent = text;
    return fragment;
  }

  function createPreviewStaticPart(text, partType) {
    const part = document.createElement('span');
    part.className = `preview-static preview-static--${partType}`;
    part.setAttribute('dir', 'ltr');
    part.textContent = text;
    return part;
  }

  function createPreviewJoiner() {
    return document.createTextNode('\u2060');
  }

  function createPreviewLeadingCluster(fragmentText, trailingText, trailingType, direction) {
    const cluster = document.createElement('span');
    cluster.className = 'preview-cluster';
    cluster.setAttribute('dir', direction);
    cluster.appendChild(createPreviewTextFragment(fragmentText));
    cluster.appendChild(createPreviewJoiner());
    cluster.appendChild(createPreviewStaticPart(trailingText, trailingType));
    return cluster;
  }

  function renderPreviewFromState() {
    if (!textPreview) return;
    const previewModel = buildPreviewRenderModel(lastPreviewText, {
      emptyText: lastPreviewEmptyText,
      showPreviewEnd: isPreviewSpoilerEnabled(),
    });
    textPreview.setAttribute('dir', previewModel.direction);
    textPreview.textContent = '';

    if (previewModel.kind === 'plain') {
      textPreview.appendChild(createPreviewTextFragment(previewModel.text, { isEmpty: previewModel.isEmpty }));
      return;
    }

    if (previewModel.kind === 'leading-fragment') {
      textPreview.appendChild(
        createPreviewLeadingCluster(
          previewModel.start,
          previewModel.marker,
          'marker',
          previewModel.direction
        )
      );
      return;
    }

    textPreview.appendChild(
      createPreviewLeadingCluster(
        previewModel.start,
        previewModel.separator,
        'separator',
        previewModel.direction
      )
    );
    textPreview.appendChild(createPreviewTextFragment(previewModel.end));
  }

  // Action wiring helpers

  function bindRequiredAction(element, actionName, handler) {
    if (!element) return;
    if (typeof handler !== 'function') {
      throw new Error(`[current-text-selector-section] Invalid handler for ${actionName}`);
    }
    element.addEventListener('click', handler);
  }

  function bindRequiredChangeAction(element, actionName, handler) {
    if (!element) return;
    if (typeof handler !== 'function') {
      throw new Error(`[current-text-selector-section] Invalid handler for ${actionName}`);
    }
    element.addEventListener('change', handler);
  }

  // Initialization helpers

  function initializeClipboardRepeatInput() {
    if (!clipboardRepeatInput) return;
    clipboardRepeatInput.min = '1';
    clipboardRepeatInput.max = String(MAX_CLIPBOARD_REPEAT);
    updateClipboardRepeatVisualState(clipboardRepeatInput.value);
    clipboardRepeatInput.addEventListener('input', () => {
      updateClipboardRepeatVisualState(clipboardRepeatInput.value);
    });
    clipboardRepeatInput.addEventListener('blur', () => {
      commitClipboardRepeatInput();
    });
    clipboardRepeatInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      clipboardRepeatInput.blur();
    });
  }

  function setPreviewSpoilerEnabled(enabled) {
    if (!previewSpoilerToggle || typeof enabled !== 'boolean') return;
    previewSpoilerToggle.checked = enabled;
    renderPreviewFromState();
  }

  // =============================================================================
  // Public API
  // =============================================================================
  function applyTranslations({ tRenderer } = {}) {
    if (typeof tRenderer !== 'function') {
      log.warn('tRenderer unavailable; selector translations skipped.');
      return;
    }

    if (selectorTitle) selectorTitle.textContent = tRenderer('renderer.main.selector_title');
    [
      [btnOverwriteClipboard, 'renderer.main.names.overwrite_clipboard'],
      [btnAppendClipboard, 'renderer.main.names.append_clipboard'],
      [btnEdit, 'renderer.main.names.edit'],
      [btnEmptyMain, 'renderer.main.names.clear'],
      [btnLoadSnapshot, 'renderer.main.names.snapshot_load'],
      [btnSaveSnapshot, 'renderer.main.names.snapshot_save'],
      [btnNewTask, 'renderer.main.names.task_new'],
      [btnLoadTask, 'renderer.main.names.task_load'],
    ].forEach(([element, key]) => {
      if (!element) return;
      const name = tRenderer(key);
      element.setAttribute('aria-label', name);
      element.setAttribute('data-tot-tooltip', name);
    });

    if (btnTextExtraction) {
      btnTextExtraction.setAttribute('aria-label', tRenderer('renderer.main.aria.text_extraction'));
      btnTextExtraction.setAttribute(
        'data-tot-tooltip',
        tRenderer('renderer.main.tooltips.text_extraction')
      );
    }

    if (clipboardRepeatInput) {
      const name = tRenderer('renderer.main.names.clipboard_repeat_count');
      clipboardRepeatInput.setAttribute('aria-label', name);
      clipboardRepeatInput.setAttribute('data-tot-tooltip', name);
    }
    if (btnReadingSpeedTest) {
      const label = tRenderer('renderer.main.reading_tools.reading_speed_test');
      if (label) {
        btnReadingSpeedTest.setAttribute('aria-label', label);
        btnReadingSpeedTest.setAttribute('data-tot-tooltip', label);
      }
    }
    if (previewSpoilerText) {
      const label = tRenderer('renderer.main.reading_tools.preview_spoiler');
      previewSpoilerText.textContent = label;
      const help = tRenderer('renderer.main.help.preview_spoiler');
      if (previewSpoilerToggleLabel) previewSpoilerToggleLabel.setAttribute('data-tot-tooltip', help);
      if (previewSpoilerDescription) previewSpoilerDescription.textContent = help;
    }
  }

  function bindActions({
    onTextExtraction,
    onTextExtractionAbort,
    onOverwriteClipboard,
    onAppendClipboard,
    onOpenEditor,
    onClearText,
    onLoadSnapshot,
    onSaveSnapshot,
    onNewTask,
    onLoadTask,
    onReadingSpeedTest,
    onPreviewSpoilerEnabledChange,
  } = {}) {
    if (actionsBound) return;

    persistPreviewSpoilerEnabled = typeof onPreviewSpoilerEnabledChange === 'function'
      ? onPreviewSpoilerEnabledChange
      : null;
    applyPreviewSpoilerToggleControlState();

    [
      [btnTextExtraction, 'text-extraction', onTextExtraction],
      [btnTextExtractionAbort, 'text-extraction-abort', onTextExtractionAbort],
      [btnOverwriteClipboard, 'clipboard-overwrite', onOverwriteClipboard],
      [btnAppendClipboard, 'clipboard-append', onAppendClipboard],
      [btnEdit, 'open-editor', onOpenEditor],
      [btnEmptyMain, 'clear-text', onClearText],
      [btnLoadSnapshot, 'snapshot-load', onLoadSnapshot],
      [btnSaveSnapshot, 'snapshot-save', onSaveSnapshot],
      [btnNewTask, 'task-new', onNewTask],
      [btnLoadTask, 'task-load', onLoadTask],
      [btnReadingSpeedTest, 'reading-speed-test', onReadingSpeedTest],
    ].forEach(([element, actionName, handler]) => {
      bindRequiredAction(element, actionName, handler);
    });

    bindRequiredChangeAction(
      previewSpoilerToggle,
      'preview-spoiler',
      async () => {
        const nextEnabled = previewSpoilerToggle.checked;
        const previousEnabled = !nextEnabled;
        if (!persistPreviewSpoilerEnabled) {
          previewSpoilerToggle.checked = previousEnabled;
          renderPreviewFromState();
          applyPreviewSpoilerToggleControlState();
          return;
        }
        renderPreviewFromState();
        previewSpoilerSavePending = true;
        applyPreviewSpoilerToggleControlState();
        try {
          await persistPreviewSpoilerEnabled(nextEnabled);
        } catch (err) {
          log.error('Preview spoiler setting persistence failed; restoring previous value:', err);
          previewSpoilerToggle.checked = previousEnabled;
          renderPreviewFromState();
        } finally {
          previewSpoilerSavePending = false;
          applyPreviewSpoilerToggleControlState();
        }
      }
    );

    actionsBound = true;
  }

  function setInteractionLocked(locked) {
    selectorInteractionLocked = !!locked;
    selectorControls.forEach((control) => {
      if (control === btnEdit || control === previewSpoilerToggle) return;
      setControlInteractionLocked(control, selectorInteractionLocked);
    });
    applyEditControlState();
    applyPreviewSpoilerToggleControlState();
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
    return commitClipboardRepeatInput();
  }

  initializeClipboardRepeatInput();

  window.CurrentTextSelectorSection = {
    applyTranslations,
    bindActions,
    getClipboardRepeatCount,
    renderPreview,
    setEditorLaunchPending,
    setInteractionLocked,
    setPreviewSpoilerEnabled,
  };
})();

// =============================================================================
// End of public/js/current_text_selector_section.js
// =============================================================================
