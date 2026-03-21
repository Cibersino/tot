// public/js/import_extract_drag_drop.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own main-window drag/drop affordance for import/extract.
// - Show a visible full-window drop target while a valid file drag is active.
// - Forward accepted single-file drops into the shared import/extract entry flow.
// =============================================================================

(() => {
  if (typeof window.getLogger !== 'function') {
    throw new Error('[import-extract-drag-drop] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('import-extract-drag-drop');
  log.debug('Import/extract drag/drop module starting...');

  let deps = null;
  let dragDepth = 0;
  let listenersAttached = false;
  let overlay = null;
  let overlayTitle = null;
  let tRendererRef = null;

  function configure(nextDeps = {}) {
    deps = {
      canAcceptDrop: null,
      notifyMain: null,
      resolveDroppedFilePath: null,
      startFromFilePath: null,
      ...nextDeps,
    };
    ensureOverlay();
    attachListeners();
  }

  function applyTranslations({ tRenderer } = {}) {
    tRendererRef = typeof tRenderer === 'function' ? tRenderer : null;
    syncOverlayText();
  }

  function requireConfiguredDeps() {
    if (!deps) {
      throw new Error('[import-extract-drag-drop] configure() must run before drag/drop handling');
    }
    return deps;
  }

  function translate(key, fallback) {
    if (typeof tRendererRef === 'function') {
      return tRendererRef(key, fallback);
    }
    return fallback;
  }

  function ensureOverlay() {
    if (overlay) return;
    overlay = document.createElement('div');
    overlay.id = 'importExtractDropOverlay';
    overlay.className = 'import-extract-drop-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = [
      '<div class="import-extract-drop-overlay__panel" aria-hidden="true">',
      '  <div class="import-extract-drop-overlay__title"></div>',
      '</div>',
    ].join('');
    document.body.appendChild(overlay);

    overlayTitle = overlay.querySelector('.import-extract-drop-overlay__title');
    syncOverlayText();
  }

  function syncOverlayText() {
    ensureOverlay();
    if (overlayTitle) {
      overlayTitle.textContent = translate(
        'renderer.main.processing.import_extract_drop_here',
        'Drop file to import/extract text'
      );
    }
  }

  function setOverlayVisible(visible) {
    ensureOverlay();
    overlay.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (document.body) {
      document.body.classList.toggle('import-extract-drop-active', visible);
    }
  }

  function resetDragState() {
    dragDepth = 0;
    setOverlayVisible(false);
  }

  function canAcceptDrop() {
    const { canAcceptDrop: predicate } = requireConfiguredDeps();
    return typeof predicate === 'function' && predicate() === true;
  }

  function notifyMain(alertKey) {
    const { notifyMain: notify } = requireConfiguredDeps();
    if (typeof notify === 'function') {
      notify(alertKey);
    }
  }

  function setDropEffect(event, effect) {
    const dt = event && event.dataTransfer;
    if (!dt) return;
    try {
      dt.dropEffect = effect;
    } catch (err) {
      log.warnOnce(
        'importExtractDragDrop.dropEffect',
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
    if (typeof resolver !== 'function') return '';
    try {
      return String(await resolver(file) || '').trim();
    } catch (err) {
      log.error('Failed to resolve dropped file path:', err);
      return '';
    }
  }

  function attachListeners() {
    if (listenersAttached) return;
    listenersAttached = true;
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
  }

  function onDragEnter(event) {
    if (!hasFilePayload(event)) return;
    event.preventDefault();

    if (!canAcceptDrop()) {
      resetDragState();
      setDropEffect(event, 'none');
      return;
    }

    dragDepth += 1;
    setDropEffect(event, 'copy');
    setOverlayVisible(true);
  }

  function onDragOver(event) {
    if (!hasFilePayload(event)) return;
    event.preventDefault();

    if (!canAcceptDrop()) {
      resetDragState();
      setDropEffect(event, 'none');
      return;
    }

    if (dragDepth === 0) {
      dragDepth = 1;
    }
    setDropEffect(event, 'copy');
    setOverlayVisible(true);
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
      log.info('import/extract drop ignored because the entrypoint is currently blocked.');
      return;
    }
    if (files.length !== 1) {
      notifyMain('renderer.alerts.import_extract_drop_single_file_only');
      return;
    }

    const filePath = await resolveDroppedFilePath(files[0]);
    if (!filePath) {
      notifyMain('renderer.alerts.import_extract_drop_invalid_file');
      return;
    }

    const { startFromFilePath } = requireConfiguredDeps();
    if (typeof startFromFilePath !== 'function') {
      log.error('startFromFilePath dependency missing; cannot continue dropped import/extract flow.');
      notifyMain('renderer.alerts.import_extract_error');
      return;
    }

    try {
      await startFromFilePath({
        filePath,
        source: 'drop',
      });
    } catch (err) {
      log.error('Dropped import/extract flow failed unexpectedly:', err);
      notifyMain('renderer.alerts.import_extract_error');
    }
  }

  window.ImportExtractDragDrop = {
    applyTranslations,
    configure,
  };
})();

// =============================================================================
// End of public/js/import_extract_drag_drop.js
// =============================================================================
