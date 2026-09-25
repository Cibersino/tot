// public/js/current_text_snapshots.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Renderer helper for current text snapshots.
// Responsibilities:
// - Prompt the pre-save snapshot metadata modal before saving.
// - Forward optional name/source metadata, metrics choices, and active WPM to IPC.
// - Call electronAPI save/load snapshot IPC.
// - Map { ok, code } responses to Notify toasts (no DOM wiring).

(() => {
  // =============================================================================
  // Imports / logger
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[current-text-snapshots] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('current-text-snapshots');
  log.debug('Current text snapshots starting...');
  const snapshotTagCatalog = window.SnapshotTagCatalog || null;
  if (!snapshotTagCatalog || typeof snapshotTagCatalog.normalizeTags !== 'function') {
    throw new Error('[current-text-snapshots] SnapshotTagCatalog unavailable; cannot continue');
  }
  let getCurrentWpm = null;

  // =============================================================================
  // Constants / config
  // =============================================================================
  const TOAST_KEYS = Object.freeze({
    saveSuccess: 'renderer.snapshots.alerts.save_success',
    saveError: 'renderer.snapshots.alerts.save_error',
    loadSuccess: 'renderer.snapshots.alerts.load_success',
    loadError: 'renderer.snapshots.alerts.load_error',
    outside: 'renderer.snapshots.alerts.outside',
    truncated: 'renderer.snapshots.alerts.truncated',
    unavailable: 'renderer.snapshots.alerts.unavailable',
  });

  // =============================================================================
  // Helpers
  // =============================================================================
  function handleSaveResult(result) {
    if (!result || result.ok === false) {
      const code = result && result.code ? result.code : 'WRITE_FAILED';
      if (code === 'CANCELLED' || code === 'CONFIRM_DENIED') return;
      if (code === 'PATH_OUTSIDE_SNAPSHOTS') {
        window.Notify.toastMain(TOAST_KEYS.outside, { type: 'warn' });
        return;
      }
      window.Notify.toastMain(TOAST_KEYS.saveError, { type: 'error' });
      return;
    }
    window.Notify.toastMain(TOAST_KEYS.saveSuccess, { type: 'info', duration: 2500 });
  }

  function handleLoadResult(result) {
    if (!result || result.ok === false) {
      const code = result && result.code ? result.code : 'READ_FAILED';
      if (code === 'CANCELLED' || code === 'CONFIRM_DENIED') return;
      if (code === 'PATH_OUTSIDE_SNAPSHOTS') {
        window.Notify.toastMain(TOAST_KEYS.outside, { type: 'warn' });
        return;
      }
      window.Notify.toastMain(TOAST_KEYS.loadError, { type: 'error' });
      return;
    }
    window.Notify.toastMain(TOAST_KEYS.loadSuccess, { type: 'info', duration: 2500 });
    if (result.truncated) {
      window.Notify.toastMain(TOAST_KEYS.truncated, { type: 'warn', duration: 3500 });
    }
  }

  async function saveSnapshot() {
    try {
      if (!window.electronAPI || typeof window.electronAPI.saveCurrentTextSnapshot !== 'function') {
        log.warn('saveCurrentTextSnapshot unavailable in electronAPI');
        window.Notify.toastMain(TOAST_KEYS.unavailable, { type: 'error' });
        return { ok: false, code: 'WRITE_FAILED' };
      }

      const payload = await window.Notify.promptSnapshotSave();
      if (!payload) {
        return { ok: false, code: 'CANCELLED' };
      }

      const normalizedTags = snapshotTagCatalog.normalizeTags(payload.tags);
      const includeCount = payload.includeCount === true;
      const includeReading = payload.includeReading === true;
      const savePayload = {
        includeCount,
        includeReading,
        ...(normalizedTags ? { tags: normalizedTags } : {}),
      };
      if (typeof payload.name === 'string' && payload.name.trim()) {
        savePayload.name = payload.name;
      }
      if (typeof payload.sourceComment === 'string' && payload.sourceComment.trim()) {
        savePayload.sourceComment = payload.sourceComment;
      }
      if (includeReading) {
        if (typeof getCurrentWpm !== 'function') {
          log.error('Current WPM provider unavailable for snapshot reading metadata.');
          window.Notify.toastMain(TOAST_KEYS.saveError, { type: 'error' });
          return { ok: false, code: 'WRITE_FAILED' };
        }
        savePayload.wpm = getCurrentWpm();
      }

      const saveResult = await window.electronAPI.saveCurrentTextSnapshot(savePayload);
      handleSaveResult(saveResult);
      return saveResult;
    } catch (err) {
      log.error('snapshot save failed:', err);
      window.Notify.toastMain(TOAST_KEYS.saveError, { type: 'error' });
      return { ok: false, code: 'WRITE_FAILED', error: String(err) };
    }
  }

  async function loadSnapshot() {
    try {
      if (!window.electronAPI || typeof window.electronAPI.loadCurrentTextSnapshot !== 'function') {
        log.warn('loadCurrentTextSnapshot unavailable in electronAPI');
        window.Notify.toastMain(TOAST_KEYS.unavailable, { type: 'error' });
        return { ok: false, code: 'READ_FAILED' };
      }
      const loadResult = await window.electronAPI.loadCurrentTextSnapshot();
      handleLoadResult(loadResult);
      return loadResult;
    } catch (err) {
      log.error('snapshot load failed:', err);
      window.Notify.toastMain(TOAST_KEYS.loadError, { type: 'error' });
      return { ok: false, code: 'READ_FAILED', error: String(err) };
    }
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================
  function configure({ getCurrentWpm: nextGetCurrentWpm } = {}) {
    if (typeof nextGetCurrentWpm !== 'function') {
      throw new Error('[current-text-snapshots] configure requires getCurrentWpm()');
    }
    getCurrentWpm = nextGetCurrentWpm;
  }

  window.CurrentTextSnapshots = {
    configure,
    saveSnapshot,
    loadSnapshot,
  };
})();

// =============================================================================
// End of public/js/current_text_snapshots.js
// =============================================================================
