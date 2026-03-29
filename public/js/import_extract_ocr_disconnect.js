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

  function configure(nextDeps = {}) {
    deps = {
      getOptionalElectronMethod: null,
      ...nextDeps,
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
    try {
      const disconnectImportExtractOcr = getDisconnectMethod();
      if (!disconnectImportExtractOcr) {
        window.Notify.notifyMain('renderer.alerts.import_extract_ocr_disconnect_failed');
        return;
      }

      const result = await disconnectImportExtractOcr({
        source: 'preferences_menu',
        reason: 'user_disconnect_google_ocr',
      });

      if (!result || typeof result !== 'object') {
        window.Notify.notifyMain('renderer.alerts.import_extract_ocr_disconnect_failed');
        return;
      }

      if (result.cancelled === true) {
        return;
      }

      const alertKey = typeof result.alertKey === 'string' && result.alertKey.trim()
        ? result.alertKey.trim()
        : (result.ok === true
          ? 'renderer.alerts.import_extract_ocr_disconnect_success'
          : 'renderer.alerts.import_extract_ocr_disconnect_failed');
      window.Notify.notifyMain(alertKey);
    } catch (err) {
      log.error('Error requesting disconnectImportExtractOcr:', err);
      window.Notify.notifyMain('renderer.alerts.import_extract_ocr_disconnect_failed');
    }
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
