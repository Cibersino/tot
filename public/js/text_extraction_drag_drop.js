// public/js/text_extraction_drag_drop.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own main-window drag/drop affordance for text extraction.
// - Show a visible full-window drop target while a valid file drag is active.
// - Forward accepted single-file drops into the shared text extraction entry flow.
// - Keep drag/drop availability aligned with renderer-level interaction guards.
// =============================================================================

(() => {
  // =============================================================================
  // Imports / logger
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[text-extraction-drag-drop] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('text-extraction-drag-drop');
  log.debug('Text extraction drag/drop module starting...');
  if (!window.RendererI18n || typeof window.RendererI18n.tRenderer !== 'function') {
    throw new Error('[text-extraction-drag-drop] RendererI18n.tRenderer unavailable; cannot continue');
  }
  const { tRenderer } = window.RendererI18n;

  // =============================================================================
  // Shared state
  // =============================================================================
  let deps = null;
  let dragDepth = 0;
  let listenersAttached = false;
  let overlay = null;
  let overlayTitle = null;

  // =============================================================================
  // Helpers
  // =============================================================================
  function requireConfiguredDeps() {
    if (!deps) {
      throw new Error('[text-extraction-drag-drop] configure() must run before drag/drop handling');
    }
    return deps;
  }

  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'textExtractionDropOverlay';
    overlay.className = 'text-extraction-drop-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = [
      '<div class="text-extraction-drop-overlay__panel" aria-hidden="true">',
      '  <div class="text-extraction-drop-overlay__title"></div>',
      '</div>',
    ].join('');
    document.body.appendChild(overlay);

    overlayTitle = overlay.querySelector('.text-extraction-drop-overlay__title');
    syncOverlayText();
  }

  function syncOverlayText() {
    ensureOverlay();
    if (overlayTitle) {
      overlayTitle.textContent = tRenderer('renderer.main.processing.text_extraction_drop_here');
    }
  }

  function setOverlayVisible(visible) {
    ensureOverlay();
    overlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (document.body) {
      document.body.classList.toggle('text-extraction-drop-active', visible);
    }
  }

  function resetDragState() {
    dragDepth = 0;
    setOverlayVisible(false);
  }

  function canAcceptDrop() {
    const { canAcceptDrop: predicate } = requireConfiguredDeps();
    if (typeof predicate !== 'function') {
      log.warnOnce(
        'textExtractionDragDrop.canAcceptDrop.missing',
        'canAcceptDrop dependency missing; drag/drop disabled.'
      );
      return false;
    }
    return predicate() === true;
  }

  function setDropEffect(event, effect) {
    const dt = event && event.dataTransfer;
    if (!dt) return;
    try {
      dt.dropEffect = effect;
    } catch (err) {
      log.warnOnce(
        'textExtractionDragDrop.dropEffect',
        'Unable to update drag/drop effect (ignored):',
        err
      );
    }
  }

  function hasFilePayload(event) {
    const dt = event && event.dataTransfer;
    if (!dt || !dt.types) return false;
    return Array.from(dt.types).includes('Files');
  }

  function getDroppedFiles(event) {
    const dt = event && event.dataTransfer;
    if (!dt || !dt.files) return [];
    return Array.from(dt.files);
  }

  async function resolveDroppedFilePath(file) {
    const { resolveDroppedFilePath: resolver } = requireConfiguredDeps();
    if (typeof resolver !== 'function') {
      log.warn(
        'resolveDroppedFilePath dependency missing; dropped file path cannot be resolved.'
      );
      return '';
    }
    try {
      return String(await resolver(file) || '').trim();
    } catch (err) {
      log.error('Failed to resolve dropped file path:', err);
      return '';
    }
  }

  // =============================================================================
  // Window wiring
  // =============================================================================
  function attachListeners() {
    if (listenersAttached) return;
    listenersAttached = true;
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
  }

  function prepareFileDrag(event) {
    if (!hasFilePayload(event)) return false;
    event.preventDefault();

    if (!canAcceptDrop()) {
      resetDragState();
      setDropEffect(event, 'none');
      return false;
    }

    setDropEffect(event, 'copy');
    setOverlayVisible(true);
    return true;
  }

  function onDragEnter(event) {
    if (!prepareFileDrag(event)) return;
    dragDepth += 1;
  }

  function onDragOver(event) {
    if (!prepareFileDrag(event)) return;
    if (dragDepth === 0) {
      dragDepth = 1;
    }
  }

  function onDragLeave(event) {
    if (!hasFilePayload(event)) return;
    event.preventDefault();

    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      setOverlayVisible(false);
    }
  }

  async function onDrop(event) {
    if (!hasFilePayload(event)) return;
    event.preventDefault();
    event.stopPropagation();

    const acceptDrop = canAcceptDrop();
    const files = getDroppedFiles(event);
    resetDragState();

    if (!acceptDrop) {
      log.info('text extraction drop ignored because the entrypoint is currently blocked.');
      return;
    }
    if (files.length !== 1) {
      window.Notify.notifyMain('renderer.alerts.text_extraction_drop_single_file_only');
      return;
    }

    const filePath = await resolveDroppedFilePath(files[0]);
    if (!filePath) {
      window.Notify.notifyMain('renderer.alerts.text_extraction_drop_invalid_file');
      return;
    }

    const { startFromFilePath } = requireConfiguredDeps();
    if (typeof startFromFilePath !== 'function') {
      log.error('startFromFilePath dependency missing; cannot continue dropped text extraction flow.');
      window.Notify.notifyMain('renderer.alerts.text_extraction_error');
      return;
    }

    try {
      await startFromFilePath({
        filePath,
        source: 'drop',
      });
    } catch (err) {
      log.error('Dropped text extraction flow failed unexpectedly:', err);
      window.Notify.notifyMain('renderer.alerts.text_extraction_error');
    }
  }

  // =============================================================================
  // Public entrypoints
  // =============================================================================
  function configure(nextDeps = {}) {
    deps = {
      canAcceptDrop: null,
      resolveDroppedFilePath: null,
      startFromFilePath: null,
      ...nextDeps,
    };
    ensureOverlay();
    attachListeners();
  }

  function applyTranslations() {
    syncOverlayText();
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================
  window.TextExtractionDragDrop = {
    applyTranslations,
    configure,
  };
})();

// =============================================================================
// End of public/js/text_extraction_drag_drop.js
// =============================================================================


