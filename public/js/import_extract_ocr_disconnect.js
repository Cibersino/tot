// public/js/import_extract_ocr_disconnect.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own the main-window Google OCR disconnect action flow.
// - Keep renderer.js limited to wiring and shared app-level helpers.
// - Request the main-process disconnect IPC and surface user feedback.
// =============================================================================

(() => {
  // =============================================================================
  // Logger bootstrap
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[import-extract-ocr-disconnect] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('import-extract-ocr-disconnect');
  log.debug('Import/extract OCR disconnect helper starting...');

  // =============================================================================
  // Shared state
  // =============================================================================
  let deps = null;

  function configure({
    getOptionalElectronMethod = null,
  } = {}) {
    deps = {
      getOptionalElectronMethod,
    };
  }

  // =============================================================================
  // Helpers
  // =============================================================================
  function requireConfiguredDeps() {
    if (!deps) {
      throw new Error('[import-extract-ocr-disconnect] configure() must run before using the disconnect flow');
    }
    return deps;
  }

  function getDisconnectMethod() {
    const { getOptionalElectronMethod } = requireConfiguredDeps();
    if (typeof getOptionalElectronMethod !== 'function') {
      throw new Error('[import-extract-ocr-disconnect] getOptionalElectronMethod dependency missing');
    }

    return getOptionalElectronMethod('disconnectImportExtractOcr', {
      dedupeKey: 'renderer.ipc.disconnectImportExtractOcr.unavailable',
      unavailableMessage: 'disconnectImportExtractOcr unavailable; OCR disconnect action skipped.'
    });
  }

  // =============================================================================
  // Public entrypoint
  // =============================================================================
  async function startFromPreferencesMenu() {
    const failureAlertKey = 'renderer.alerts.import_extract_ocr_disconnect_failed';

    let disconnectImportExtractOcr = null;
    try {
      disconnectImportExtractOcr = getDisconnectMethod();
    } catch (err) {
      log.error('Error requesting disconnectImportExtractOcr:', err);
      window.Notify.notifyMain(failureAlertKey);
      return;
    }

    if (!disconnectImportExtractOcr) {
      window.Notify.notifyMain(failureAlertKey);
      return;
    }

    let result = null;
    try {
      result = await disconnectImportExtractOcr({
        source: 'preferences_menu',
        reason: 'user_disconnect_google_ocr',
      });
    } catch (err) {
      log.error('Error requesting disconnectImportExtractOcr:', err);
      window.Notify.notifyMain(failureAlertKey);
      return;
    }

    if (!result || typeof result !== 'object') {
      log.error('disconnectImportExtractOcr returned invalid result:', result);
      window.Notify.notifyMain(failureAlertKey);
      return;
    }

    if (result.cancelled === true) {
      return;
    }

    const alertKey = typeof result.alertKey === 'string'
      ? result.alertKey.trim()
      : '';
    if (!alertKey) {
      log.warn('disconnectImportExtractOcr returned invalid alertKey; using fallback alert key:', result);
    }

    window.Notify.notifyMain(alertKey || (result.ok === true
      ? 'renderer.alerts.import_extract_ocr_disconnect_success'
      : failureAlertKey));
  }

  // =============================================================================
  // Module surface
  // =============================================================================
  window.ImportExtractOcrDisconnect = {
    configure,
    startFromPreferencesMenu,
  };
})();

// =============================================================================
// End of public/js/import_extract_ocr_disconnect.js
// =============================================================================
