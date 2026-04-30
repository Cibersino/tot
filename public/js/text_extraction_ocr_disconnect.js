// public/js/text_extraction_ocr_disconnect.js
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
    throw new Error('[text-extraction-ocr-disconnect] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('text-extraction-ocr-disconnect');
  log.debug('Text extraction OCR disconnect helper starting...');

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
      throw new Error('[text-extraction-ocr-disconnect] configure() must run before using the disconnect flow');
    }
    return deps;
  }

  function getDisconnectMethod() {
    const { getOptionalElectronMethod } = requireConfiguredDeps();
    if (typeof getOptionalElectronMethod !== 'function') {
      throw new Error('[text-extraction-ocr-disconnect] getOptionalElectronMethod dependency missing');
    }

    return getOptionalElectronMethod('disconnectTextExtractionOcr', {
      dedupeKey: 'renderer.ipc.disconnectTextExtractionOcr.unavailable',
      unavailableMessage: 'disconnectTextExtractionOcr unavailable; OCR disconnect action skipped.'
    });
  }

  // =============================================================================
  // Public entrypoint
  // =============================================================================
  async function startFromPreferencesMenu() {
    const failureAlertKey = 'renderer.alerts.text_extraction_ocr_disconnect_failed';

    let disconnectTextExtractionOcr = null;
    try {
      disconnectTextExtractionOcr = getDisconnectMethod();
    } catch (err) {
      log.error('Error resolving disconnectTextExtractionOcr bridge:', err);
      window.Notify.notifyMain(failureAlertKey);
      return;
    }

    if (!disconnectTextExtractionOcr) {
      window.Notify.notifyMain(failureAlertKey);
      return;
    }

    let result = null;
    try {
      result = await disconnectTextExtractionOcr({
        source: 'preferences_menu',
        reason: 'user_disconnect_google_ocr',
      });
    } catch (err) {
      log.error('Error invoking disconnectTextExtractionOcr:', err);
      window.Notify.notifyMain(failureAlertKey);
      return;
    }

    if (!result || typeof result !== 'object') {
      log.error('disconnectTextExtractionOcr returned invalid result:', result);
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
      log.warn('disconnectTextExtractionOcr returned invalid alertKey; using fallback alert key:', result);
    }

    window.Notify.notifyMain(alertKey || (result.ok === true
      ? 'renderer.alerts.text_extraction_ocr_disconnect_success'
      : failureAlertKey));
  }

  // =============================================================================
  // Module surface
  // =============================================================================
  window.TextExtractionOcrDisconnect = {
    configure,
    startFromPreferencesMenu,
  };
})();

// =============================================================================
// End of public/js/text_extraction_ocr_disconnect.js
// =============================================================================


