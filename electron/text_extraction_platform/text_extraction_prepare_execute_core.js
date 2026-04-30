// electron/text_extraction_platform/text_extraction_prepare_execute_core.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Shared text extraction prepare + execute core for main-process IPC wrappers.
// Responsibilities:
// - Normalize prepare/execute payloads and derive source-file metadata.
// - Classify prepare-time route availability for native vs OCR execution.
// - Build stable prepare-failure and execution-result surfaces for renderer consumers.
// - Enforce execution invariants around cancellation and non-success text output.
// - Keep route-selection and alert-key policy centralized for delegated IPC modules.

// =============================================================================
// Imports
// =============================================================================

const path = require('path');
const { BrowserWindow } = require('electron');

const { PROVIDER_API_DISABLED_CODE } = require('./ocr_google_drive_provider_failure');
const { validateGoogleDriveOcrSetup } = require('./ocr_google_drive_setup_validation');
const { runGoogleDriveOcrRoute } = require('./ocr_google_drive_route');
const { runNativeExtractionRoute } = require('./native_extraction_route');
const { probeNativePdfSelectableText } = require('./native_pdf_selectable_text_probe');
const {
  getNativeParserForExt,
  getOcrSourceMimeTypeForExt,
} = require('./text_extraction_supported_formats');

// =============================================================================
// Boundary normalization + shared metadata helpers
// =============================================================================

function resolvePreparePayload(payload) {
  const raw = payload && typeof payload === 'object' ? payload : {};
  return {
    filePath: typeof raw.filePath === 'string' ? raw.filePath.trim() : '',
    ocrLanguage: typeof raw.ocrLanguage === 'string' ? raw.ocrLanguage.trim() : '',
  };
}

function resolveExecutePayload(payload) {
  const raw = payload && typeof payload === 'object' ? payload : {};
  const routePreference = typeof raw.routePreference === 'string'
    ? raw.routePreference.trim().toLowerCase()
    : '';
  return {
    prepareId: typeof raw.prepareId === 'string' ? raw.prepareId.trim() : '',
    routePreference: routePreference === 'native' || routePreference === 'ocr'
      ? routePreference
      : '',
  };
}

function getFileInfo(filePath) {
  const normalizedPath = typeof filePath === 'string' ? filePath.trim() : '';
  const resolvedPath = path.resolve(normalizedPath || '');
  const fileName = path.basename(resolvedPath);
  const extWithDot = path.extname(resolvedPath).toLowerCase();
  const sourceFileExt = extWithDot.startsWith('.') ? extWithDot.slice(1) : extWithDot;
  const sourceMimeType = getOcrSourceMimeTypeForExt(extWithDot);
  const sourceFileKind = sourceFileExt === 'pdf'
    ? 'pdf'
    : (sourceMimeType.startsWith('image/') ? 'image' : 'text_document');

  return {
    filePath: normalizedPath,
    resolvedPath,
    fileName,
    sourceFileExt,
    sourceFileKind,
  };
}

function isAuthorizedSender(event, mainWin, log, channelName) {
  try {
    const senderWin = event && event.sender
      ? BrowserWindow.fromWebContents(event.sender)
      : null;
    if (!mainWin || senderWin !== mainWin) {
      log.warnOnce(
        `${channelName}.unauthorized`,
        `${channelName} unauthorized (ignored).`
      );
      return false;
    }
    return true;
  } catch (err) {
    log.warn(`${channelName} sender validation failed:`, err);
    return false;
  }
}

function resolveSetupState(validationResult) {
  if (validationResult && validationResult.ok === true) return 'ready';
  const state = validationResult && typeof validationResult.state === 'string'
    ? validationResult.state
    : 'failure';
  if (state === 'ocr_activation_required') return state;
  return 'failure';
}

function resolveSetupCode(validationResult) {
  return validationResult
    && validationResult.error
    && typeof validationResult.error.code === 'string'
    ? validationResult.error.code
    : '';
}

// =============================================================================
// Prepare/build helpers
// =============================================================================

function getProbeFailureDetails(probeResult) {
  if (!probeResult || probeResult.state !== 'failure') return null;
  const error = probeResult.error && typeof probeResult.error === 'object'
    ? probeResult.error
    : null;
  if (!error) return null;
  const details = error.detailsSafeForLogs && typeof error.detailsSafeForLogs === 'object'
    ? error.detailsSafeForLogs
    : {};
  const metadata = probeResult.metadataSafeForLogs && typeof probeResult.metadataSafeForLogs === 'object'
    ? probeResult.metadataSafeForLogs
    : {};

  return {
    code: typeof error.code === 'string' ? error.code : '',
    errorName: typeof details.errorName === 'string' ? details.errorName : '',
    errorCode: typeof details.errorCode === 'string' ? details.errorCode : '',
    selectableText: typeof probeResult.selectableText === 'string' ? probeResult.selectableText : 'unknown',
    metadataSafeForLogs: {
      pagesScanned: Number.isFinite(metadata.pagesScanned) ? metadata.pagesScanned : 0,
      totalPages: Number.isFinite(metadata.totalPages) ? metadata.totalPages : 0,
      foundAtPage: Number.isFinite(metadata.foundAtPage) ? metadata.foundAtPage : null,
      elapsedMs: Number.isFinite(metadata.elapsedMs) ? metadata.elapsedMs : 0,
    },
  };
}

function getProbeSuccessDetails(probeResult) {
  if (!probeResult || probeResult.state !== 'success') return null;
  const metadata = probeResult.metadataSafeForLogs && typeof probeResult.metadataSafeForLogs === 'object'
    ? probeResult.metadataSafeForLogs
    : {};
  return {
    selectableText: typeof probeResult.selectableText === 'string' ? probeResult.selectableText : 'unknown',
    metadataSafeForLogs: {
      pagesScanned: Number.isFinite(metadata.pagesScanned) ? metadata.pagesScanned : 0,
      totalPages: Number.isFinite(metadata.totalPages) ? metadata.totalPages : 0,
      foundAtPage: Number.isFinite(metadata.foundAtPage) ? metadata.foundAtPage : null,
      elapsedMs: Number.isFinite(metadata.elapsedMs) ? metadata.elapsedMs : 0,
    },
  };
}

function buildRouteMetadata({
  fileInfo,
  availableRoutes,
  chosenRoute,
  executedRoute = null,
  executionKind = null,
  pdfTriage = 'not_pdf',
  triageReason = '',
  ocrSetupState = 'not_checked',
  ocrSetupCode = '',
  nativeProbeCode = '',
  nativeProbeErrorName = '',
  nativeProbeErrorCode = '',
  nativeProbeSelectableText = '',
  nativeProbeMetadata = null,
}) {
  return {
    fileKind: fileInfo.sourceFileKind,
    availableRoutes: Array.isArray(availableRoutes) ? availableRoutes : [],
    chosenRoute,
    executedRoute,
    executionKind,
    pdfTriage,
    triageReason,
    ocrSetupState,
    ocrSetupCode,
    nativeProbeCode,
    nativeProbeErrorName,
    nativeProbeErrorCode,
    nativeProbeSelectableText,
    nativeProbeMetadata: nativeProbeMetadata && typeof nativeProbeMetadata === 'object'
      ? nativeProbeMetadata
      : null,
  };
}

function buildPrepareFailure({
  executionKind,
  routeMetadata,
  primaryAlertKey,
  warningAlertKeys = [],
  error = null,
}) {
  return {
    ok: true,
    prepareFailed: true,
    executionKind,
    routeMetadata,
    primaryAlertKey,
    warningAlertKeys,
    error,
  };
}

function buildOcrPrepareFailure({
  fileInfo,
  validationResult,
  pdfTriage,
  triageReason,
  availableRoutes = ['ocr'],
  chosenRoute = 'ocr',
}) {
  const state = resolveSetupState(validationResult);
  const code = resolveSetupCode(validationResult) || 'platform_runtime_failed';

  let primaryAlertKey = 'renderer.alerts.text_extraction_ocr_unavailable';
  if (state === 'ocr_activation_required' || code === 'ocr_activation_required') {
    primaryAlertKey = 'renderer.alerts.text_extraction_ocr_activation_required';
  } else if (code === 'credentials_missing') {
    primaryAlertKey = 'renderer.alerts.text_extraction_ocr_setup_missing_credentials';
  } else if (code === 'credentials_invalid') {
    primaryAlertKey = 'renderer.alerts.text_extraction_ocr_setup_invalid_credentials';
  } else if (code === 'ocr_token_state_invalid') {
    primaryAlertKey = 'renderer.alerts.text_extraction_ocr_token_state_invalid';
  } else if (code === 'connectivity_failed') {
    primaryAlertKey = 'renderer.alerts.text_extraction_ocr_connectivity_failed';
  } else if (code === 'quota_or_rate_limited') {
    primaryAlertKey = 'renderer.alerts.text_extraction_ocr_quota_or_rate_limited';
  }

  return buildPrepareFailure({
    executionKind: 'google_drive',
    routeMetadata: buildRouteMetadata({
      fileInfo,
      availableRoutes,
      chosenRoute,
      executionKind: 'google_drive',
      pdfTriage,
      triageReason,
      ocrSetupState: state,
      ocrSetupCode: code,
    }),
    primaryAlertKey,
    warningAlertKeys: [],
    error: validationResult && validationResult.error ? validationResult.error : null,
  });
}

function buildNativePrepareFailure({
  fileInfo,
  probeResult,
  triageReason,
}) {
  const failure = getProbeFailureDetails(probeResult);
  const code = failure ? failure.code : '';
  let primaryAlertKey = 'renderer.alerts.text_extraction_native_runtime_error';
  if (code === 'native_encrypted_or_password_protected') {
    primaryAlertKey = 'renderer.alerts.text_extraction_native_encrypted_or_password_protected';
  } else if (code === 'unreadable_or_corrupt') {
    primaryAlertKey = 'renderer.alerts.text_extraction_native_unreadable_or_corrupt';
  }

  return buildPrepareFailure({
    executionKind: 'native',
    routeMetadata: buildRouteMetadata({
      fileInfo,
      availableRoutes: ['native'],
      chosenRoute: 'native',
      executionKind: 'native',
      pdfTriage: 'native_only',
      triageReason,
      ocrSetupState: 'not_checked',
      nativeProbeCode: failure ? failure.code : '',
      nativeProbeErrorName: failure ? failure.errorName : '',
      nativeProbeErrorCode: failure ? failure.errorCode : '',
      nativeProbeSelectableText: failure ? failure.selectableText : '',
      nativeProbeMetadata: failure ? failure.metadataSafeForLogs : null,
    }),
    primaryAlertKey,
    warningAlertKeys: [],
    error: probeResult && probeResult.error ? probeResult.error : null,
  });
}

function buildUnsupportedFormatPrepareFailure(fileInfo) {
  return buildPrepareFailure({
    executionKind: null,
    routeMetadata: buildRouteMetadata({
      fileInfo,
      availableRoutes: [],
      chosenRoute: null,
      executionKind: null,
      pdfTriage: 'not_pdf',
      triageReason: 'unsupported_format',
      ocrSetupState: 'not_checked',
    }),
    primaryAlertKey: 'renderer.alerts.text_extraction_native_unsupported_format',
    warningAlertKeys: [],
    error: {
      code: 'unsupported_format',
      message: 'Selected file format is not supported by text extraction.',
      detailsSafeForLogs: {
        stage: 'prepare',
        reason: 'unsupported_extension',
        sourceFileExt: fileInfo.sourceFileExt,
        sourceFileKind: fileInfo.sourceFileKind,
      },
    },
  });
}

function buildOcrSetupValidationRuntimeFailure(err) {
  return {
    ok: false,
    state: 'failure',
    summary: 'Google OCR setup validation failed due to a platform/runtime error.',
    error: {
      code: 'platform_runtime_failed',
      message: 'Google OCR setup validation failed due to a platform/runtime error.',
      detailsSafeForLogs: {
        errorMessage: String(err && err.message ? err.message : err || ''),
      },
    },
  };
}

// Keep unexpected resolvePaths()/validation exceptions on the same structured
// OCR-unavailable prepare path instead of letting prepare IPC fall through to
// a generic handler failure.
async function validateOcrSetup(resolvePaths, log) {
  try {
    const paths = resolvePaths();
    return validateGoogleDriveOcrSetup({
      credentialsPath: paths.credentialsPath,
      tokenPath: paths.tokenPath,
      bundledCredentialsFailureCode: paths.bundledCredentialsFailureCode,
      bundledCredentialsFailureReason: paths.bundledCredentialsFailureReason,
      bundledCredentialsFailureDetailsSafeForLogs: paths.bundledCredentialsFailureDetailsSafeForLogs,
      probeApiPath: true,
    });
  } catch (err) {
    log.error('Google OCR setup validation failed unexpectedly:', err);
    return buildOcrSetupValidationRuntimeFailure(err);
  }
}

function buildPrepareReadyResult({
  fileInfo,
  ocrLanguage,
  executionKind = null,
  routeMetadata,
  requiresRouteChoice = false,
  routeChoiceOptions = [],
}) {
  return {
    ok: true,
    prepareReady: true,
    executionKind,
    preparedPayload: {
      fileInfo,
      ocrLanguage,
      routeMetadata,
      requiresRouteChoice,
      routeChoiceOptions,
    },
    routeMetadata,
    requiresRouteChoice,
    routeChoiceOptions,
  };
}

function resolveNonPdfNativePreparation(fileInfo, ocrLanguage) {
  const routeMetadata = buildRouteMetadata({
    fileInfo,
    availableRoutes: ['native'],
    chosenRoute: 'native',
    executionKind: 'native',
    pdfTriage: 'not_pdf',
    triageReason: 'non_pdf',
    ocrSetupState: 'not_checked',
  });

  return buildPrepareReadyResult({
    fileInfo,
    ocrLanguage,
    executionKind: 'native',
    routeMetadata,
  });
}

async function resolveNonPdfOcrPreparation({
  fileInfo,
  ocrLanguage,
  resolvePaths,
  log,
}) {
  const validation = await validateOcrSetup(resolvePaths, log);
  if (!validation || validation.ok !== true) {
    return buildOcrPrepareFailure({
      fileInfo,
      validationResult: validation,
      pdfTriage: 'not_pdf',
      triageReason: 'non_pdf_ocr_unavailable',
    });
  }

  const routeMetadata = buildRouteMetadata({
    fileInfo,
    availableRoutes: ['ocr'],
    chosenRoute: 'ocr',
    executionKind: 'google_drive',
    pdfTriage: 'not_pdf',
    triageReason: 'non_pdf',
    ocrSetupState: 'ready',
  });

  return buildPrepareReadyResult({
    fileInfo,
    ocrLanguage,
    executionKind: 'google_drive',
    routeMetadata,
  });
}

async function resolvePdfPreparation({
  fileInfo,
  ocrLanguage,
  resolvePaths,
  log,
}) {
  const nativeProbeResult = await probeNativePdfSelectableText({
    filePath: fileInfo.filePath,
    isAborted: () => false,
    log,
  });

  const nativeProbeFailure = getProbeFailureDetails(nativeProbeResult);
  if (nativeProbeFailure) {
    const triageReason = nativeProbeFailure.code === 'native_encrypted_or_password_protected'
      ? 'native_pdf_password_protected'
      : (nativeProbeFailure.code === 'unreadable_or_corrupt'
        ? 'native_pdf_corrupt_or_unreadable'
        : 'native_pdf_probe_failed');

    return buildNativePrepareFailure({
      fileInfo,
      probeResult: nativeProbeResult,
      triageReason,
    });
  }

  const nativeProbeSuccess = getProbeSuccessDetails(nativeProbeResult);
  const nativeAvailable = !!(nativeProbeSuccess && nativeProbeSuccess.selectableText === 'present');

  const ocrValidation = await validateOcrSetup(resolvePaths, log);
  const ocrReady = !!(ocrValidation && ocrValidation.ok === true);
  const ocrSetupState = resolveSetupState(ocrValidation);
  const ocrSetupCode = resolveSetupCode(ocrValidation);

  let pdfTriage = 'ocr_only';
  let triageReason = 'no_native_text_layer_detected';
  let availableRoutes = ['ocr'];
  let chosenRoute = 'ocr';
  let requiresRouteChoice = false;
  let routeChoiceOptions = [];

  if (nativeAvailable) {
    pdfTriage = 'both';
    triageReason = ocrReady
      ? 'native_text_detected_and_ocr_ready_choice_required'
      : 'native_text_detected_choice_required_ocr_not_ready';
    availableRoutes = ['native', 'ocr'];
    chosenRoute = null;
    requiresRouteChoice = true;
    routeChoiceOptions = ['native', 'ocr'];
  } else if (!nativeAvailable && ocrReady) {
    pdfTriage = 'ocr_only';
    triageReason = 'no_native_text_layer_detected';
    availableRoutes = ['ocr'];
    chosenRoute = 'ocr';
  } else {
    return buildOcrPrepareFailure({
      fileInfo,
      validationResult: ocrValidation,
      pdfTriage: 'ocr_only',
      triageReason: 'no_native_text_layer_and_ocr_unavailable',
    });
  }

  const routeMetadata = buildRouteMetadata({
    fileInfo,
    availableRoutes,
    chosenRoute,
    executionKind: chosenRoute === 'native'
      ? 'native'
      : (chosenRoute === 'ocr' ? 'google_drive' : null),
    pdfTriage,
    triageReason,
    ocrSetupState,
    ocrSetupCode,
    nativeProbeSelectableText: nativeProbeSuccess ? nativeProbeSuccess.selectableText : '',
    nativeProbeMetadata: nativeProbeSuccess ? nativeProbeSuccess.metadataSafeForLogs : null,
  });

  return buildPrepareReadyResult({
    fileInfo,
    ocrLanguage,
    executionKind: routeMetadata.executionKind,
    routeMetadata,
    requiresRouteChoice,
    routeChoiceOptions,
  });
}

async function prepareSelectedFile({
  filePath,
  ocrLanguage,
  resolvePaths,
  log,
}) {
  const fileInfo = getFileInfo(filePath);
  const nativeParser = getNativeParserForExt(fileInfo.sourceFileExt);
  const driveSourceMimeType = getOcrSourceMimeTypeForExt(fileInfo.sourceFileExt);

  if (fileInfo.sourceFileKind === 'pdf') {
    return resolvePdfPreparation({
      fileInfo,
      ocrLanguage,
      resolvePaths,
      log,
    });
  }

  if (fileInfo.sourceFileKind === 'image') {
    return resolveNonPdfOcrPreparation({
      fileInfo,
      ocrLanguage,
      resolvePaths,
      log,
    });
  }

  if (!nativeParser && driveSourceMimeType) {
    return resolveNonPdfOcrPreparation({
      fileInfo,
      ocrLanguage,
      resolvePaths,
      log,
    });
  }

  if (!nativeParser) {
    return buildUnsupportedFormatPrepareFailure(fileInfo);
  }

  return resolveNonPdfNativePreparation(fileInfo, ocrLanguage);
}

// =============================================================================
// Execute/result helpers
// =============================================================================

function resolvePrimaryAlertKey(routeKind, result) {
  const state = result && typeof result.state === 'string' ? result.state : 'failure';
  const code = result && result.error && typeof result.error.code === 'string'
    ? result.error.code
    : '';

  if (routeKind === 'native') {
    if (state === 'success') return 'renderer.alerts.text_extraction_native_apply_pending';
    if (state === 'cancelled' || code === 'aborted_by_user') return 'renderer.alerts.text_extraction_native_cancelled';
    if (code === 'unsupported_format') return 'renderer.alerts.text_extraction_native_unsupported_format';
    if (code === 'native_encrypted_or_password_protected') {
      return 'renderer.alerts.text_extraction_native_encrypted_or_password_protected';
    }
    if (code === 'unreadable_or_corrupt') return 'renderer.alerts.text_extraction_native_unreadable_or_corrupt';
    return 'renderer.alerts.text_extraction_native_runtime_error';
  }

  if (state === 'success') return 'renderer.alerts.text_extraction_ocr_apply_pending';
  if (state === 'cancelled' || code === 'aborted_by_user') return 'renderer.alerts.text_extraction_ocr_cancelled';
  if (code === 'ocr_activation_required') return 'renderer.alerts.text_extraction_ocr_activation_required';
  if (code === 'credentials_missing') return 'renderer.alerts.text_extraction_ocr_setup_missing_credentials';
  if (code === 'credentials_invalid') return 'renderer.alerts.text_extraction_ocr_setup_invalid_credentials';
  if (code === 'ocr_token_state_invalid') return 'renderer.alerts.text_extraction_ocr_token_state_invalid';
  if (code === 'connectivity_failed') return 'renderer.alerts.text_extraction_ocr_connectivity_failed';
  if (code === 'quota_or_rate_limited') return 'renderer.alerts.text_extraction_ocr_quota_or_rate_limited';
  if (code === PROVIDER_API_DISABLED_CODE
    || code === 'auth_failed'
    || code === 'platform_runtime_failed'
    || code === 'ocr_unavailable') {
    return 'renderer.alerts.text_extraction_ocr_unavailable';
  }
  return 'renderer.alerts.text_extraction_ocr_runtime_error';
}

function resolveWarningAlertKeys(routeKind, result) {
  const warnings = Array.isArray(result && result.warnings) ? result.warnings : [];
  if (routeKind === 'ocr'
    && warnings.some((warning) => typeof warning === 'string' && warning.startsWith('cleanup:'))) {
    return ['renderer.alerts.text_extraction_ocr_cleanup_warning'];
  }
  return [];
}

function resolveExitReason(routeKind, result) {
  if (!result || typeof result.state !== 'string') {
    return `text_extraction_${routeKind}_finished`;
  }
  if (result.state === 'success') return `text_extraction_${routeKind}_success`;
  if (result.state === 'cancelled') return `text_extraction_${routeKind}_cancelled`;
  return `text_extraction_${routeKind}_failed`;
}

function enforceFailureAbortInvariants({
  routeKind,
  fileInfo,
  controller,
  result,
  log,
}) {
  const safeResult = result && typeof result === 'object' ? { ...result } : null;
  if (!safeResult) return result;

  if (safeResult.state === 'success'
    && controller
    && typeof controller.isActive === 'function'
    && !controller.isActive()) {
    log.warn('text extraction success discarded after cancellation request:', {
      routeKind,
      sourceFileExt: fileInfo.sourceFileExt,
      sourceFileKind: fileInfo.sourceFileKind,
    });
    safeResult.state = 'cancelled';
    safeResult.text = '';
    safeResult.summary = `Text extraction ${routeKind} route cancelled by user.`;
    safeResult.error = {
      code: 'aborted_by_user',
      message: `Text extraction ${routeKind} route was cancelled by user.`,
      detailsSafeForLogs: {
        stage: 'post_route_result',
        reason: 'processing_mode_inactive',
      },
    };
    return safeResult;
  }

  if (safeResult.state !== 'success' && typeof safeResult.text === 'string' && safeResult.text.length > 0) {
    log.warn('text extraction non-success result carried text; output dropped to enforce invariant:', {
      routeKind,
      state: safeResult.state,
      sourceFileExt: fileInfo.sourceFileExt,
      sourceFileKind: fileInfo.sourceFileKind,
    });
    safeResult.text = '';
  }

  return safeResult;
}

function resolvePreparedRoute(preparedRecord, routePreference) {
  const availableRoutes = Array.isArray(preparedRecord && preparedRecord.routeChoiceOptions)
    ? preparedRecord.routeChoiceOptions
    : [];
  const chosenRoute = preparedRecord
    && preparedRecord.routeMetadata
    && typeof preparedRecord.routeMetadata.chosenRoute === 'string'
    ? preparedRecord.routeMetadata.chosenRoute
    : null;

  if (chosenRoute === 'native' || chosenRoute === 'ocr') {
    return { ok: true, productRoute: chosenRoute };
  }

  if (routePreference === 'native' || routePreference === 'ocr') {
    if (availableRoutes.includes(routePreference)) {
      return { ok: true, productRoute: routePreference };
    }
    return { ok: false, reason: 'requested_route_unavailable' };
  }

  if (preparedRecord && preparedRecord.requiresRouteChoice === true) {
    return { ok: false, reason: 'route_choice_required' };
  }

  return { ok: false, reason: 'route_resolution_failed' };
}

function buildUnexpectedRuntimeResult(fileInfo, productRoute, executionKind, routeMetadata, err) {
  return {
    executionKind,
    result: {
      state: 'failure',
      executedRoute: productRoute,
      text: '',
      warnings: [],
      summary: 'Text extraction route failed due to an unexpected runtime error.',
      provenance: {
        sourceFileName: fileInfo.fileName,
        sourceFileExt: fileInfo.sourceFileExt,
        sourceFileKind: fileInfo.sourceFileKind,
        ocrProvider: executionKind === 'google_drive'
          ? 'google_drive_docs_conversion'
          : null,
        metadataSafeForLogs: {},
      },
      error: {
        code: 'platform_runtime_failed',
        message: 'Text extraction route failed due to a platform/runtime error.',
        detailsSafeForLogs: {
          errorMessage: String(err && err.message ? err.message : err || ''),
        },
      },
    },
    routeMetadata: {
      ...routeMetadata,
      chosenRoute: productRoute,
      executedRoute: productRoute,
      executionKind,
    },
  };
}

// =============================================================================
// Execute entrypoint
// =============================================================================

async function executePreparedImport({
  preparedRecord,
  routePreference,
  resolvePaths,
  controller,
  log,
}) {
  const resolvedRoute = resolvePreparedRoute(preparedRecord, routePreference);
  if (!resolvedRoute.ok) {
    return {
      ok: false,
      code: resolvedRoute.reason === 'route_choice_required'
        ? 'ROUTE_CHOICE_REQUIRED'
        : 'ROUTE_RESOLUTION_FAILED',
      primaryAlertKey: 'renderer.alerts.text_extraction_route_choice_required',
    };
  }

  const productRoute = resolvedRoute.productRoute;
  const fileInfo = preparedRecord.fileInfo;
  const enterTransition = controller.enter({
    source: 'text_extraction_execution',
    reason: fileInfo.sourceFileKind === 'pdf' ? 'run_pdf_route' : 'run_route',
  });

  if (!enterTransition.changed && controller.isActive()) {
    return {
      ok: false,
      code: 'ALREADY_ACTIVE',
      state: controller.getState(),
    };
  }

  let executionResult = null;

  try {
    if (productRoute === 'native') {
      const nativeResult = await runNativeExtractionRoute({
        filePath: fileInfo.filePath,
        isAborted: () => !controller.isActive(),
        log,
      });
      const safeNativeResult = enforceFailureAbortInvariants({
        routeKind: 'native',
        fileInfo,
        controller,
        result: nativeResult,
        log,
      });
      executionResult = {
        executionKind: 'native',
        result: safeNativeResult,
        routeMetadata: {
          ...preparedRecord.routeMetadata,
          chosenRoute: productRoute,
          executedRoute: productRoute,
          executionKind: 'native',
        },
      };
    } else {
      const paths = resolvePaths();
      const ocrResult = await runGoogleDriveOcrRoute({
        filePath: fileInfo.filePath,
        credentialsPath: paths.credentialsPath,
        tokenPath: paths.tokenPath,
        bundledCredentialsFailureCode: paths.bundledCredentialsFailureCode,
        bundledCredentialsFailureReason: paths.bundledCredentialsFailureReason,
        bundledCredentialsFailureDetailsSafeForLogs: paths.bundledCredentialsFailureDetailsSafeForLogs,
        ocrLanguage: preparedRecord.ocrLanguage,
        log,
        isAborted: () => !controller.isActive(),
      });
      const safeOcrResult = enforceFailureAbortInvariants({
        routeKind: 'ocr',
        fileInfo,
        controller,
        result: ocrResult,
        log,
      });
      executionResult = {
        executionKind: 'google_drive',
        result: safeOcrResult,
        routeMetadata: {
          ...preparedRecord.routeMetadata,
          chosenRoute: productRoute,
          executedRoute: productRoute,
          executionKind: 'google_drive',
        },
      };
    }
  } catch (err) {
    log.error('text extraction execution failed unexpectedly:', err);
    executionResult = buildUnexpectedRuntimeResult(
      fileInfo,
      productRoute,
      productRoute === 'native' ? 'native' : 'google_drive',
      preparedRecord.routeMetadata,
      err
    );
  } finally {
    if (controller.isActive()) {
      controller.exit({
        source: 'text_extraction_execution',
        reason: resolveExitReason(
          executionResult && executionResult.routeMetadata
            ? executionResult.routeMetadata.executedRoute
            : productRoute,
          executionResult ? executionResult.result : null
        ),
      });
    }
  }

  const primaryAlertKey = resolvePrimaryAlertKey(
    executionResult.routeMetadata ? executionResult.routeMetadata.executedRoute : productRoute,
    executionResult.result
  );
  const warningAlertKeys = resolveWarningAlertKeys(
    executionResult.routeMetadata ? executionResult.routeMetadata.executedRoute : productRoute,
    executionResult.result
  );

  return {
    ok: true,
    executionKind: executionResult.executionKind,
    result: executionResult.result,
    routeMetadata: executionResult.routeMetadata || null,
    primaryAlertKey,
    warningAlertKeys,
  };
}

// =============================================================================
// Module surface
// =============================================================================

module.exports = {
  executePreparedImport,
  getFileInfo,
  isAuthorizedSender,
  prepareSelectedFile,
  resolvePreparedRoute,
  resolveExecutePayload,
  resolvePreparePayload,
};

// =============================================================================
// End of electron/text_extraction_platform/text_extraction_prepare_execute_core.js
// =============================================================================


