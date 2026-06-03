// public/js/text_extraction_ocr_activation_flow.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own the shared main-window Google OCR activation sequence.
// - Resolve the activation IPC bridges and drive the disclosure + OAuth flow.
// - Return structured outcomes without hardcoding caller-specific alert policy.
// =============================================================================

(() => {
  // =============================================================================
  // Logger bootstrap
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[text-extraction-ocr-activation-flow] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('text-extraction-ocr-activation-flow');
  log.debug('Text extraction OCR activation flow starting...');

  // =============================================================================
  // Shared state
  // =============================================================================
  let deps = null;

  function configure({
    getOptionalElectronMethod = null,
  } = {}) {
    if (typeof getOptionalElectronMethod !== 'function') {
      throw new Error('[text-extraction-ocr-activation-flow] configure() requires getOptionalElectronMethod function');
    }
    deps = {
      getOptionalElectronMethod,
    };
  }

  // =============================================================================
  // Helpers
  // =============================================================================
  function requireConfiguredDeps() {
    if (!deps) {
      throw new Error('[text-extraction-ocr-activation-flow] configure() must run before using the activation flow');
    }
    return deps;
  }

  function buildResult({
    ok = false,
    state = 'failure',
    stage = '',
    code = '',
    detailsSafeForLogs = {},
    providerResult = null,
  } = {}) {
    return {
      ok: ok === true,
      state: typeof state === 'string' ? state : 'failure',
      stage: typeof stage === 'string' ? stage : '',
      code: typeof code === 'string' ? code : '',
      detailsSafeForLogs:
        detailsSafeForLogs && typeof detailsSafeForLogs === 'object'
          ? detailsSafeForLogs
          : {},
      providerResult:
        providerResult && typeof providerResult === 'object'
          ? providerResult
          : null,
    };
  }

  function getActivationBridgeMethod(methodName, dedupeKey, unavailableMessage) {
    const { getOptionalElectronMethod } = requireConfiguredDeps();
    if (typeof getOptionalElectronMethod !== 'function') {
      throw new Error('[text-extraction-ocr-activation-flow] getOptionalElectronMethod dependency missing');
    }
    const bridgeMethod = getOptionalElectronMethod(methodName, {
      dedupeKey,
      unavailableMessage,
    });
    if (bridgeMethod == null) {
      return null;
    }
    if (typeof bridgeMethod !== 'function') {
      throw new Error(`[text-extraction-ocr-activation-flow] ${methodName} bridge invalid`);
    }
    return bridgeMethod;
  }

  function getPrepareMethod() {
    return getActivationBridgeMethod(
      'prepareTextExtractionOcrActivation',
      'renderer.ipc.prepareTextExtractionOcrActivation.unavailable',
      'prepareTextExtractionOcrActivation unavailable; OCR activation flow cannot continue.'
    );
  }

  function getLaunchMethod() {
    return getActivationBridgeMethod(
      'launchTextExtractionOcrActivation',
      'renderer.ipc.launchTextExtractionOcrActivation.unavailable',
      'launchTextExtractionOcrActivation unavailable; OCR activation flow cannot continue.'
    );
  }

  // =============================================================================
  // Public entrypoint
  // =============================================================================
  async function startActivationFlow({
    source = 'unknown',
  } = {}) {
    let prepareTextExtractionOcrActivation = null;
    let launchTextExtractionOcrActivation = null;

    try {
      prepareTextExtractionOcrActivation = getPrepareMethod();
      launchTextExtractionOcrActivation = getLaunchMethod();
    } catch (err) {
      log.error('OCR activation bridge resolution failed:', err);
      return buildResult({
        ok: false,
        state: 'unavailable',
        stage: 'bridge',
        code: 'bridge_unavailable',
        detailsSafeForLogs: {
          source,
          reason: 'bridge_resolution_failed',
        },
      });
    }

    if (!prepareTextExtractionOcrActivation || !launchTextExtractionOcrActivation) {
      log.warn('OCR activation bridge unavailable:', {
        source,
        prepareAvailable: !!prepareTextExtractionOcrActivation,
        launchAvailable: !!launchTextExtractionOcrActivation,
      });
      return buildResult({
        ok: false,
        state: 'unavailable',
        stage: 'bridge',
        code: 'bridge_unavailable',
        detailsSafeForLogs: {
          source,
          reason: 'bridge_unavailable',
          prepareAvailable: !!prepareTextExtractionOcrActivation,
          launchAvailable: !!launchTextExtractionOcrActivation,
        },
      });
    }

    let prepareResult = null;
    try {
      prepareResult = await prepareTextExtractionOcrActivation();
    } catch (err) {
      log.error('OCR activation prepare IPC failed:', err);
      return buildResult({
        ok: false,
        state: 'failure',
        stage: 'prepare',
        code: 'platform_runtime_failed',
        detailsSafeForLogs: {
          source,
          reason: 'prepare_ipc_threw',
        },
      });
    }

    if (!prepareResult || prepareResult.ok !== true || prepareResult.ready !== true) {
      log.warn('OCR activation prepare step did not complete:', {
        source,
        ok: prepareResult ? prepareResult.ok : false,
        ready: prepareResult ? prepareResult.ready : false,
        code: prepareResult ? prepareResult.code : '',
      });
      return buildResult({
        ok: false,
        state: 'failure',
        stage: 'prepare',
        code: prepareResult && typeof prepareResult.code === 'string'
          ? prepareResult.code
          : 'platform_runtime_failed',
        detailsSafeForLogs: {
          source,
          reason: 'prepare_not_ready',
        },
        providerResult: prepareResult,
      });
    }

    let disclosureAccepted = false;
    try {
      disclosureAccepted = await window.Notify.promptTextExtractionOcrActivationDisclosure();
    } catch (err) {
      log.error('OCR activation disclosure modal failed:', err);
      return buildResult({
        ok: false,
        state: 'failure',
        stage: 'disclosure',
        code: 'disclosure_failed',
        detailsSafeForLogs: {
          source,
          reason: 'disclosure_failed',
        },
      });
    }

    if (!disclosureAccepted) {
      log.info('OCR activation disclosure declined by user:', {
        source,
        code: 'ocr_activation_disclosure_declined',
      });
      return buildResult({
        ok: false,
        state: 'cancelled',
        stage: 'disclosure',
        code: 'ocr_activation_disclosure_declined',
        detailsSafeForLogs: {
          source,
          reason: 'disclosure_declined',
        },
      });
    }

    let activationResult = null;
    try {
      activationResult = await launchTextExtractionOcrActivation();
    } catch (err) {
      log.error('OCR activation launch IPC failed:', err);
      return buildResult({
        ok: false,
        state: 'failure',
        stage: 'launch',
        code: 'platform_runtime_failed',
        detailsSafeForLogs: {
          source,
          reason: 'launch_ipc_threw',
        },
      });
    }

    if (!activationResult || activationResult.ok !== true) {
      log.warn('OCR activation launch step did not complete:', {
        source,
        ok: activationResult ? activationResult.ok : false,
        state: activationResult ? activationResult.state : '',
        code: activationResult ? activationResult.code : '',
      });
      return buildResult({
        ok: false,
        state: activationResult && activationResult.state === 'cancelled'
          ? 'cancelled'
          : 'failure',
        stage: 'launch',
        code: activationResult && typeof activationResult.code === 'string'
          ? activationResult.code
          : 'platform_runtime_failed',
        detailsSafeForLogs: {
          source,
          reason: 'launch_not_ready',
        },
        providerResult: activationResult,
      });
    }

    log.info('OCR activation completed successfully:', { source });
    return buildResult({
      ok: true,
      state: 'success',
      stage: 'launch',
      code: '',
      detailsSafeForLogs: {
        source,
        reason: 'activation_completed',
      },
      providerResult: activationResult,
    });
  }

  // =============================================================================
  // Module surface
  // =============================================================================
  window.TextExtractionOcrActivationFlow = {
    configure,
    startActivationFlow,
  };
})();

// =============================================================================
// End of public/js/text_extraction_ocr_activation_flow.js
// =============================================================================
