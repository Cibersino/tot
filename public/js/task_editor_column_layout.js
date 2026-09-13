// public/js/task_editor_column_layout.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own utility-column widths while keeping the text column readable across wrapper sizes.
// - Build accessible pointer and keyboard dividers for the Task Editor table.
// - Validate and persist versioned width records without blocking resize interaction.
// - Coalesce saves so the newest completed resize is retained and failures remain visible.
// - Expose the narrow controller surface consumed by public/task_editor.js.

(() => {
  // =============================================================================
  // Logger
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[task-editor-columns] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('task-editor-columns');

  // =============================================================================
  // Constants / column schema
  // =============================================================================
  const LAYOUT_VERSION = 1;
  const TEXT_COLUMN_KEY = 'texto';
  const TEXT_MIN_WIDTH_PX = 250;
  const FITTED_WIDTH_SAFETY_PX = 1;
  const WIDTH_MAX_PX = 100_000;
  const KEYBOARD_STEP_PX = 10;
  const KEYBOARD_FINE_STEP_PX = 1;
  const UTILITY_COLUMNS = Object.freeze([
    Object.freeze({ key: 'comentario', minWidth: 82 }),
    Object.freeze({ key: 'tiempo', minWidth: 88 }),
    Object.freeze({ key: 'percent', minWidth: 63 }),
    Object.freeze({ key: 'falta', minWidth: 65 }),
    Object.freeze({ key: 'enlace', minWidth: 250 }),
    Object.freeze({ key: 'acciones', minWidth: 124 }),
  ]);

  // =============================================================================
  // Record validation
  // =============================================================================
  function isPlainObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === null || Object.prototype.toString.call(value) === '[object Object]';
  }

  function hasExactKeys(value, expectedKeys) {
    if (!isPlainObject(value)) return false;
    const actualKeys = Object.keys(value);
    return actualKeys.length === expectedKeys.length
      && expectedKeys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
  }

  function copyValidRecord(raw) {
    if (!hasExactKeys(raw, ['version', 'widths']) || raw.version !== LAYOUT_VERSION) return null;
    const widthKeys = UTILITY_COLUMNS.map(({ key }) => key);
    if (!hasExactKeys(raw.widths, widthKeys)) return null;

    const widths = {};
    for (const { key, minWidth } of UTILITY_COLUMNS) {
      const width = raw.widths[key];
      if (!Number.isSafeInteger(width) || width < minWidth || width > WIDTH_MAX_PX) return null;
      widths[key] = width;
    }
    return { version: LAYOUT_VERSION, widths };
  }

  function createDefaultWidths() {
    const widths = {};
    UTILITY_COLUMNS.forEach(({ key, minWidth }) => {
      widths[key] = minWidth;
    });
    return widths;
  }

  function freezeRecord(widths) {
    return Object.freeze({
      version: LAYOUT_VERSION,
      widths: Object.freeze({ ...widths }),
    });
  }

  function isStrictSaveSuccess(result) {
    return hasExactKeys(result, ['ok']) && result.ok === true;
  }

  // =============================================================================
  // Controller factory / DOM contract
  // =============================================================================
  function createController({ wrapper, table, colGroup, utilityHeaders }) {
    if (!wrapper || !table || !colGroup || !isPlainObject(utilityHeaders)) {
      throw new Error('[task-editor-columns] createController requires table layout DOM owners');
    }
    if (typeof window.ResizeObserver !== 'function') {
      throw new Error('[task-editor-columns] ResizeObserver unavailable; responsive layout cannot continue');
    }

    const columns = new Map();
    colGroup.querySelectorAll('col').forEach((col) => {
      const key = col && col.dataset ? col.dataset.col : '';
      if (key) columns.set(key, col);
    });
    if (!columns.has(TEXT_COLUMN_KEY)) {
      throw new Error('[task-editor-columns] texto column unavailable');
    }
    UTILITY_COLUMNS.forEach(({ key }) => {
      if (!columns.has(key) || !utilityHeaders[key]) {
        throw new Error(`[task-editor-columns] column owner unavailable: ${key}`);
      }
    });

    // =============================================================================
    // Controller state
    // =============================================================================
    let utilityWidths = createDefaultWidths();
    let renderedTextWidth = TEXT_MIN_WIDTH_PX;
    let activeResize = null;
    let completedRevision = 0;
    let pendingSave = null;
    let saveInFlight = false;
    let saveWarningActive = false;
    let destroyed = false;
    const dividers = new Map();

    // =============================================================================
    // Layout calculations and divider state
    // =============================================================================
    function sumUtilityWidths() {
      return UTILITY_COLUMNS.reduce((sum, { key }) => sum + utilityWidths[key], 0);
    }

    function getWrapperWidth() {
      const width = Number(wrapper.clientWidth);
      return Number.isFinite(width) && width > 0 ? Math.floor(width) : 0;
    }

    function getFittedWidthBudget() {
      return Math.max(0, getWrapperWidth() - FITTED_WIDTH_SAFETY_PX);
    }

    function isOverflowing() {
      return getFittedWidthBudget() < sumUtilityWidths() + TEXT_MIN_WIDTH_PX;
    }

    function getTargetMaximum(key) {
      return Math.max(
        utilityWidths[key],
        Math.min(WIDTH_MAX_PX, utilityWidths[key] + renderedTextWidth - TEXT_MIN_WIDTH_PX)
      );
    }

    function updateDividerState(overflowing) {
      UTILITY_COLUMNS.forEach(({ key, minWidth }) => {
        const divider = dividers.get(key);
        if (!divider) return;
        divider.setAttribute('aria-disabled', overflowing ? 'true' : 'false');
        divider.setAttribute('aria-valuemin', String(minWidth));
        divider.setAttribute('aria-valuemax', String(getTargetMaximum(key)));
        divider.setAttribute('aria-valuenow', String(utilityWidths[key]));
        divider.tabIndex = overflowing ? -1 : 0;
      });
    }

    function applyLayout() {
      const utilityTotal = sumUtilityWidths();
      renderedTextWidth = Math.max(TEXT_MIN_WIDTH_PX, getFittedWidthBudget() - utilityTotal);
      columns.get(TEXT_COLUMN_KEY).style.width = `${renderedTextWidth}px`;
      UTILITY_COLUMNS.forEach(({ key }) => {
        columns.get(key).style.width = `${utilityWidths[key]}px`;
      });
      table.style.width = `${utilityTotal + renderedTextWidth}px`;
      table.style.minWidth = '';
      updateDividerState(isOverflowing());
    }

    // =============================================================================
    // Persistence queue
    // =============================================================================
    function showSaveFailureWarning() {
      if (saveWarningActive) return;
      saveWarningActive = true;
      window.Notify.notifyEditor('renderer.tasks.alerts.column_layout_save_error', {
        type: 'warn',
        duration: 6000,
      });
    }

    async function persistSnapshot(snapshot) {
      const api = window.taskEditorAPI;
      if (!api || typeof api.saveColumnLayout !== 'function') {
        return { ok: false, code: 'API_UNAVAILABLE' };
      }
      try {
        const result = await api.saveColumnLayout(snapshot.record);
        return isStrictSaveSuccess(result)
          ? { ok: true }
          : { ok: false, code: 'INVALID_OR_FAILED_RESULT', result };
      } catch (err) {
        return { ok: false, code: 'INVOKE_REJECTED', error: err };
      }
    }

    async function drainSaveQueue() {
      if (saveInFlight || destroyed) return;
      saveInFlight = true;
      try {
        while (pendingSave && !destroyed) {
          const snapshot = pendingSave;
          pendingSave = null;
          const result = await persistSnapshot(snapshot);
          const superseded = Boolean(pendingSave && pendingSave.revision > snapshot.revision);
          if (result.ok) {
            saveWarningActive = false;
          } else {
            log.warn('Task column layout save failed:', {
              revision: snapshot.revision,
              superseded,
              code: result.code,
              result: result.result || null,
              error: result.error || null,
            });
            if (!superseded) showSaveFailureWarning();
          }
        }
      } finally {
        saveInFlight = false;
        if (pendingSave && !destroyed) void drainSaveQueue();
      }
    }

    function enqueueSnapshot(revision) {
      pendingSave = Object.freeze({
        revision,
        record: freezeRecord(utilityWidths),
      });
      void drainSaveQueue();
    }

    function completeResize() {
      completedRevision += 1;
      enqueueSnapshot(completedRevision);
    }

    // =============================================================================
    // Resize interaction
    // =============================================================================
    function clampTargetWidth(key, requestedWidth) {
      const column = UTILITY_COLUMNS.find((candidate) => candidate.key === key);
      if (!column) return utilityWidths[key];
      return Math.max(
        column.minWidth,
        Math.min(getTargetMaximum(key), WIDTH_MAX_PX, Math.round(requestedWidth))
      );
    }

    function setTargetWidth(key, requestedWidth) {
      const nextWidth = clampTargetWidth(key, requestedWidth);
      if (nextWidth === utilityWidths[key]) return false;
      utilityWidths = { ...utilityWidths, [key]: nextWidth };
      applyLayout();
      return true;
    }

    function releaseActivePointerCapture(resize) {
      if (!resize || !resize.handle || typeof resize.handle.releasePointerCapture !== 'function') return;
      if (
        typeof resize.handle.hasPointerCapture === 'function'
        && !resize.handle.hasPointerCapture(resize.pointerId)
      ) return;
      try {
        resize.handle.releasePointerCapture(resize.pointerId);
      } catch (err) {
        log.warn('Task column divider releasePointerCapture failed (ignored):', err);
      }
    }

    function cancelActiveResize() {
      if (!activeResize) return false;
      const resize = activeResize;
      activeResize = null;
      utilityWidths = { ...resize.startWidths };
      document.body.classList.remove('is-resizing');
      releaseActivePointerCapture(resize);
      applyLayout();
      return true;
    }

    function cancelPointerResize(event) {
      if (!activeResize || event.pointerId !== activeResize.pointerId) return false;
      return cancelActiveResize();
    }

    function beginPointerResize(event, key, handle) {
      if (activeResize) return;
      if (event.button !== undefined && event.button !== 0) return;
      if (handle.getAttribute('aria-disabled') === 'true') return;
      try {
        handle.setPointerCapture(event.pointerId);
      } catch (err) {
        log.error('Task column divider setPointerCapture failed:', err);
        return;
      }
      event.preventDefault();
      activeResize = {
        key,
        handle,
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: utilityWidths[key],
        startWidths: { ...utilityWidths },
      };
      document.body.classList.add('is-resizing');
    }

    function movePointerResize(event) {
      if (!activeResize || event.pointerId !== activeResize.pointerId) return;
      const requestedWidth = activeResize.startWidth + activeResize.startX - event.clientX;
      setTargetWidth(activeResize.key, requestedWidth);
    }

    function finishPointerResize(event) {
      if (!activeResize || event.pointerId !== activeResize.pointerId) return;
      const resize = activeResize;
      const changed = UTILITY_COLUMNS.some(
        ({ key }) => utilityWidths[key] !== resize.startWidths[key]
      );
      activeResize = null;
      document.body.classList.remove('is-resizing');
      releaseActivePointerCapture(resize);
      if (changed) completeResize();
    }

    function handleDividerKeydown(event, key, handle) {
      if (handle.getAttribute('aria-disabled') === 'true') return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      if (activeResize) return;
      const step = event.shiftKey ? KEYBOARD_FINE_STEP_PX : KEYBOARD_STEP_PX;
      const direction = event.key === 'ArrowLeft' ? 1 : -1;
      if (setTargetWidth(key, utilityWidths[key] + direction * step)) completeResize();
    }

    // =============================================================================
    // Divider wiring
    // =============================================================================
    function createDividers() {
      UTILITY_COLUMNS.forEach(({ key }) => {
        const header = utilityHeaders[key];
        const handle = document.createElement('div');
        handle.className = 'col-resizer';
        handle.setAttribute('role', 'separator');
        handle.setAttribute('aria-orientation', 'vertical');
        handle.setAttribute('aria-labelledby', header.id);
        handle.dataset.targetColumn = key;
        handle.addEventListener('pointerdown', (event) => beginPointerResize(event, key, handle));
        handle.addEventListener('pointermove', movePointerResize);
        handle.addEventListener('pointerup', finishPointerResize);
        handle.addEventListener('pointercancel', cancelPointerResize);
        handle.addEventListener('lostpointercapture', cancelPointerResize);
        handle.addEventListener('keydown', (event) => handleDividerKeydown(event, key, handle));
        header.appendChild(handle);
        dividers.set(key, handle);
      });
    }

    // =============================================================================
    // Controller lifecycle
    // =============================================================================
    function handleWrapperResize() {
      cancelActiveResize();
      applyLayout();
    }

    function handleWindowBlur() {
      cancelActiveResize();
    }

    const resizeObserver = new window.ResizeObserver(handleWrapperResize);

    async function loadInitialWidths() {
      const api = window.taskEditorAPI;
      if (!api || typeof api.getColumnLayout !== 'function') {
        log.warn('BOOTSTRAP: Task column layout load unavailable; using session defaults.');
        return false;
      }

      let result = null;
      try {
        result = await api.getColumnLayout();
      } catch (err) {
        log.warn('BOOTSTRAP: Task column layout load rejected; using session defaults:', err);
        return false;
      }

      // A null record is the main-side fresh-layout signal; persist defaults after setup.
      if (
        hasExactKeys(result, ['ok', 'record'])
        && result.ok === true
        && result.record === null
      ) return true;

      if (hasExactKeys(result, ['ok', 'record']) && result.ok === true) {
        const record = copyValidRecord(result.record);
        if (record) {
          utilityWidths = record.widths;
          return false;
        }
      }

      if (hasExactKeys(result, ['ok', 'code']) && result.ok === false) {
        log.warn('BOOTSTRAP: Task column layout load failed; using session defaults:', result.code);
        return false;
      }

      log.warn('BOOTSTRAP: Task column layout response invalid; using session defaults:', result);
      return false;
    }

    async function initialize() {
      const shouldPersistDefaults = await loadInitialWidths();
      if (destroyed) return;
      createDividers();
      applyLayout();
      resizeObserver.observe(wrapper);
      window.addEventListener('blur', handleWindowBlur);
      window.addEventListener('beforeunload', cancelActiveResize);
      if (shouldPersistDefaults) enqueueSnapshot(0);
    }

    function destroy() {
      cancelActiveResize();
      destroyed = true;
      pendingSave = null;
      resizeObserver.disconnect();
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('beforeunload', cancelActiveResize);
    }

    return Object.freeze({
      initialize,
      cancelActiveResize,
      destroy,
    });
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================
  window.TaskEditorColumnLayout = Object.freeze({ createController });
})();

// =============================================================================
// End of public/js/task_editor_column_layout.js
// =============================================================================
