// public/js/current_text_snapshots.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Renderer helper for current text snapshots.
// Responsibilities:
// - Call electronAPI save/load snapshot IPC.
// - Map { ok, code } responses to Notify toasts (no DOM wiring).
// =============================================================================

(() => {
  if (typeof window.getLogger !== 'function') {
    throw new Error('[current-text-snapshots] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('current-text-snapshots');
  log.debug('Current text snapshots starting...');

  const TOAST_KEYS = Object.freeze({
    saveSuccess: 'renderer.alerts.snapshot_save_success',
    saveError: 'renderer.alerts.snapshot_save_error',
    loadSuccess: 'renderer.alerts.snapshot_load_success',
    loadError: 'renderer.alerts.snapshot_load_error',
    outside: 'renderer.alerts.snapshot_outside',
    truncated: 'renderer.alerts.snapshot_truncated',
    unavailable: 'renderer.alerts.snapshot_unavailable',
  });

  function toast(key, opts = {}) {
    if (typeof window.Notify?.toastMain === 'function') {
      window.Notify.toastMain(key, opts);
      return;
    }
    if (typeof window.Notify?.notifyMain === 'function') {
      window.Notify.notifyMain(key);
      return;
    }
    log.warn('Notify API unavailable; toast dropped.');
  }

  function handleSaveResult(res) {
    if (!res || res.ok === false) {
      const code = res && res.code ? res.code : 'WRITE_FAILED';
      if (code === 'CANCELLED' || code === 'CONFIRM_DENIED') return;
      if (code === 'PATH_OUTSIDE_SNAPSHOTS') {
        toast(TOAST_KEYS.outside, { type: 'warn' });
        return;
      }
      toast(TOAST_KEYS.saveError, { type: 'error' });
      return;
    }
    toast(TOAST_KEYS.saveSuccess, { type: 'info' });
  }

  function handleLoadResult(res) {
    if (!res || res.ok === false) {
      const code = res && res.code ? res.code : 'READ_FAILED';
      if (code === 'CANCELLED' || code === 'CONFIRM_DENIED') return;
      if (code === 'PATH_OUTSIDE_SNAPSHOTS') {
        toast(TOAST_KEYS.outside, { type: 'warn' });
        return;
      }
      toast(TOAST_KEYS.loadError, { type: 'error' });
      return;
    }
    toast(TOAST_KEYS.loadSuccess, { type: 'info' });
    if (res.truncated) {
      toast(TOAST_KEYS.truncated, { type: 'warn' });
    }
  }

  async function saveSnapshot() {
    try {
      if (!window.electronAPI || typeof window.electronAPI.saveCurrentTextSnapshot !== 'function') {
        log.warn('saveCurrentTextSnapshot unavailable in electronAPI');
        toast(TOAST_KEYS.unavailable, { type: 'error' });
        return { ok: false, code: 'WRITE_FAILED' };
      }
      const res = await window.electronAPI.saveCurrentTextSnapshot();
      handleSaveResult(res);
      return res;
    } catch (err) {
      log.error('snapshot save failed:', err);
      toast(TOAST_KEYS.saveError, { type: 'error' });
      return { ok: false, code: 'WRITE_FAILED', error: String(err) };
    }
  }

  async function loadSnapshot() {
    try {
      if (!window.electronAPI || typeof window.electronAPI.loadCurrentTextSnapshot !== 'function') {
        log.warn('loadCurrentTextSnapshot unavailable in electronAPI');
        toast(TOAST_KEYS.unavailable, { type: 'error' });
        return { ok: false, code: 'READ_FAILED' };
      }
      const res = await window.electronAPI.loadCurrentTextSnapshot();
      handleLoadResult(res);
      return res;
    } catch (err) {
      log.error('snapshot load failed:', err);
      toast(TOAST_KEYS.loadError, { type: 'error' });
      return { ok: false, code: 'READ_FAILED', error: String(err) };
    }
  }

  window.CurrentTextSnapshots = {
    saveSnapshot,
    loadSnapshot,
  };
})();

// =============================================================================
// End of public/js/current_text_snapshots.js
// =============================================================================
