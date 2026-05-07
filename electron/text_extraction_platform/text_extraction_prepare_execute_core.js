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
  canonicalizeGeneratedPdfArtifactPolicy,
  canonicalizePdfPageSelection,
  inspectPdfFile,
  materializePdfPageSelectionInput,
  resolveProcessingInputFileName,
} = require('./text_extraction_pdf_page_selection');
const {
  getNativeParserForExt,
  getOcrSourceMimeTypeForExt,
} = require('./text_extraction_supported_formats');

// =============================================================================
// Boundary normalization + shared metadata helpers
// =============================================================================

function resolveInspectPayload(payload) {
  const raw = payload && typeof payload === 'object' ? payload : {};
  return {
    filePath: typeof raw.filePath === 'string' ? raw.filePath.trim() : '',
  };
}

function resolvePreparePayload(payload) {
  const raw = payload && typeof payload === 'object' ? payload : {};
  return {
    filePath: typeof raw.filePath === 'string' ? raw.filePath.trim() : '',
    ocrLanguage: typeof raw.ocrLanguage === 'string' ? raw.ocrLanguage.trim() : '',
    pdfPageSelection: raw.pdfPageSelection && typeof raw.pdfPageSelection === 'object' && !Array.isArray(raw.pdfPageSelection)
      ? raw.pdfPageSelection
      : null,
    generatedPdfArtifactPolicy:
      raw.generatedPdfArtifactPolicy
      && typeof raw.generatedPdfArtifactPolicy === 'object'
      && !Array.isArray(raw.generatedPdfArtifactPolicy)
        ? raw.generatedPdfArtifactPolicy
        : null,
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

function getRendererSafeFileInfo(fileInfo) {
  return {
    fileName: fileInfo && typeof fileInfo.fileName === 'string' ? fileInfo.fileName : '',
    sourceFileExt: fileInfo && typeof fileInfo.sourceFileExt === 'string' ? fileInfo.sourceFileExt : '',
    sourceFileKind: fileInfo && typeof fileInfo.sourceFileKind === 'string' ? fileInfo.sourceFileKind : '',
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

function resolvePdfAlertKey(code) {
  if (code === 'native_encrypted_or_password_protected') {
    return 'renderer.alerts.text_extraction_pdf_encrypted_or_password_protected';
  }
  if (code === 'unreadable_or_corrupt') {
    return 'renderer.alerts.text_extraction_pdf_unreadable_or_corrupt';
  }
  if (code === 'pdf_page_count_unavailable') {
    return 'renderer.alerts.text_extraction_pdf_page_count_unavailable';
  }
  if (code === 'pdf_page_selection_invalid') {
    return 'renderer.alerts.text_extraction_pdf_page_selection_invalid';
  }
  if (code === 'pdf_subset_creation_failed') {
    return 'renderer.alerts.text_extraction_pdf_subset_creation_failed';
  }
  return 'renderer.alerts.text_extraction_error';
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
      probedFromPage: Number.isFinite(metadata.probedFromPage) ? metadata.probedFromPage : null,
      probedToPage: Number.isFinite(metadata.probedToPage) ? metadata.probedToPage : null,
      selectedPageCount: Number.isFinite(metadata.selectedPageCount) ? metadata.selectedPageCount : null,
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
      probedFromPage: Number.isFinite(metadata.probedFromPage) ? metadata.probedFromPage : null,
      probedToPage: Number.isFinite(metadata.probedToPage) ? metadata.probedToPage : null,
      selectedPageCount: Number.isFinite(metadata.selectedPageCount) ? metadata.selectedPageCount : null,
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
  pdfPageSelection = null,
  generatedPdfArtifactPolicyMode = '',
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
    pdfPageSelection: pdfPageSelection && typeof pdfPageSelection === 'object'
      ? { ...pdfPageSelection }
      : null,
    generatedPdfArtifactPolicyMode: typeof generatedPdfArtifactPolicyMode === 'string'
      ? generatedPdfArtifactPolicyMode
      : '',
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
  pdfPageSelection = null,
  generatedPdfArtifactPolicy = null,
  processingInputFileName = '',
}) {
  return {
    ok: true,
    prepareFailed: true,
    executionKind,
    routeMetadata,
    primaryAlertKey,
    warningAlertKeys,
    error,
    pdfPageSelection: pdfPageSelection && typeof pdfPageSelection === 'object'
      ? { ...pdfPageSelection }
      : null,
    generatedPdfArtifactPolicy: generatedPdfArtifactPolicy && typeof generatedPdfArtifactPolicy === 'object'
      ? { ...generatedPdfArtifactPolicy }
      : null,
    processingInputFileName: typeof processingInputFileName === 'string' ? processingInputFileName : '',
  };
}

function buildOcrPrepareFailure({
  fileInfo,
  validationResult,
  pdfTriage,
  triageReason,
  pdfPageSelection = null,
  generatedPdfArtifactPolicy = null,
  processingInputFileName = '',
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
      pdfPageSelection,
      generatedPdfArtifactPolicyMode: generatedPdfArtifactPolicy ? generatedPdfArtifactPolicy.mode : '',
    }),
    primaryAlertKey,
    warningAlertKeys: [],
    error: validationResult && validationResult.error ? validationResult.error : null,
    pdfPageSelection,
    generatedPdfArtifactPolicy,
    processingInputFileName,
  });
}

function buildNativePrepareFailure({
  fileInfo,
  probeResult,
  triageReason,
  pdfPageSelection = null,
  generatedPdfArtifactPolicy = null,
  processingInputFileName = '',
}) {
  const failure = getProbeFailureDetails(probeResult);
  const code = failure ? failure.code : '';
  const primaryAlertKey = resolvePdfAlertKey(code) === 'renderer.alerts.text_extraction_error'
    ? 'renderer.alerts.text_extraction_native_runtime_error'
    : resolvePdfAlertKey(code);

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
      pdfPageSelection,
      generatedPdfArtifactPolicyMode: generatedPdfArtifactPolicy ? generatedPdfArtifactPolicy.mode : '',
      nativeProbeCode: failure ? failure.code : '',
      nativeProbeErrorName: failure ? failure.errorName : '',
      nativeProbeErrorCode: failure ? failure.errorCode : '',
      nativeProbeSelectableText: failure ? failure.selectableText : '',
      nativeProbeMetadata: failure ? failure.metadataSafeForLogs : null,
    }),
    primaryAlertKey,
    warningAlertKeys: [],
    error: probeResult && probeResult.error ? probeResult.error : null,
    pdfPageSelection,
    generatedPdfArtifactPolicy,
    processingInputFileName,
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
    processingInputFileName: fileInfo.fileName,
  });
}

function buildPdfPrepareFailure({
  fileInfo,
  error,
  triageReason,
  pdfPageSelection = null,
  generatedPdfArtifactPolicy = null,
  processingInputFileName = '',
}) {
  const code = error && typeof error.code === 'string' ? error.code : '';
  return buildPrepareFailure({
    executionKind: null,
    routeMetadata: buildRouteMetadata({
      fileInfo,
      availableRoutes: [],
      chosenRoute: null,
      executionKind: null,
      pdfTriage: 'prepare_failed',
      triageReason,
      ocrSetupState: 'not_checked',
      pdfPageSelection,
      generatedPdfArtifactPolicyMode: generatedPdfArtifactPolicy ? generatedPdfArtifactPolicy.mode : '',
    }),
    primaryAlertKey: resolvePdfAlertKey(code),
    warningAlertKeys: [],
    error,
    pdfPageSelection,
    generatedPdfArtifactPolicy,
    processingInputFileName,
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
  pdfPageSelection = null,
  generatedPdfArtifactPolicy = null,
  processingInputFileName = '',
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
      pdfPageSelection,
      generatedPdfArtifactPolicy,
      processingInputFileName,
      routeMetadata,
      requiresRouteChoice,
      routeChoiceOptions,
    },
    pdfPageSelection,
    generatedPdfArtifactPolicy,
    processingInputFileName,
    routeMetadata,
    requiresRouteChoice,
    routeChoiceOptions,
  };
}

function resolveNonPdfNativePreparation(fileInfo, ocrLanguage) {
  const processingInputFileName = fileInfo.fileName;
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
    pdfPageSelection: null,
    generatedPdfArtifactPolicy: null,
    processingInputFileName,
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
  const processingInputFileName = fileInfo.fileName;
  const validation = await validateOcrSetup(resolvePaths, log);
  if (!validation || validation.ok !== true) {
    return buildOcrPrepareFailure({
      fileInfo,
      validationResult: validation,
      pdfTriage: 'not_pdf',
      triageReason: 'non_pdf_ocr_unavailable',
      processingInputFileName,
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
    pdfPageSelection: null,
    generatedPdfArtifactPolicy: null,
    processingInputFileName,
    executionKind: 'google_drive',
    routeMetadata,
  });
}

async function resolvePdfPreparation({
  fileInfo,
  ocrLanguage,
  requestedPdfPageSelection,
  requestedGeneratedPdfArtifactPolicy,
  resolvePaths,
  log,
}) {
  const pdfInspection = await inspectPdfFile({ fileInfo });
  if (!pdfInspection || pdfInspection.ok !== true || pdfInspection.isPdf !== true) {
    return buildPdfPrepareFailure({
      fileInfo,
      triageReason: 'pdf_page_count_unavailable',
      error: {
        code: 'pdf_page_count_unavailable',
        message: 'PDF page count could not be inspected.',
        detailsSafeForLogs: {
          stage: 'prepare',
          reason: 'inspect_shape_invalid',
        },
      },
      processingInputFileName: fileInfo.fileName,
    });
  }
  if (pdfInspection.error) {
    return buildPdfPrepareFailure({
      fileInfo,
      triageReason: pdfInspection.error.code || 'pdf_page_count_unavailable',
      error: pdfInspection.error,
      processingInputFileName: fileInfo.fileName,
    });
  }

  const canonicalPdfPageSelection = canonicalizePdfPageSelection(requestedPdfPageSelection, {
    totalPages: pdfInspection.totalPages,
  });
  if (!canonicalPdfPageSelection.ok) {
    return buildPdfPrepareFailure({
      fileInfo,
      triageReason: 'pdf_page_selection_invalid',
      error: canonicalPdfPageSelection.error,
      processingInputFileName: fileInfo.fileName,
    });
  }

  const pdfPageSelection = canonicalPdfPageSelection.pdfPageSelection;
  const generatedPdfArtifactPolicy = canonicalizeGeneratedPdfArtifactPolicy(requestedGeneratedPdfArtifactPolicy);
  const processingInputFileName = resolveProcessingInputFileName({
    fileInfo,
    pdfPageSelection,
  });
  const nativeProbeResult = await probeNativePdfSelectableText({
    filePath: fileInfo.filePath,
    pageRange: {
      fromPage: pdfPageSelection.fromPage,
      toPage: pdfPageSelection.toPage,
    },
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
      pdfPageSelection,
      generatedPdfArtifactPolicy,
      processingInputFileName,
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
      pdfPageSelection,
      generatedPdfArtifactPolicy,
      processingInputFileName,
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
    pdfPageSelection,
    generatedPdfArtifactPolicyMode: generatedPdfArtifactPolicy.mode,
    nativeProbeSelectableText: nativeProbeSuccess ? nativeProbeSuccess.selectableText : '',
    nativeProbeMetadata: nativeProbeSuccess ? nativeProbeSuccess.metadataSafeForLogs : null,
  });

  return buildPrepareReadyResult({
    fileInfo,
    ocrLanguage,
    pdfPageSelection,
    generatedPdfArtifactPolicy,
    processingInputFileName,
    executionKind: routeMetadata.executionKind,
    routeMetadata,
    requiresRouteChoice,
    routeChoiceOptions,
  });
}

async function inspectSelectedFile({ filePath } = {}) {
  const fileInfo = getFileInfo(filePath);
  const rendererSafeFileInfo = getRendererSafeFileInfo(fileInfo);

  if (fileInfo.sourceFileKind !== 'pdf') {
    return {
      ok: true,
      isPdf: false,
      fileInfo: rendererSafeFileInfo,
      totalPages: null,
      primaryAlertKey: '',
      error: null,
    };
  }

  const inspection = await inspectPdfFile({ fileInfo });
  return {
    ok: inspection && inspection.ok === true,
    isPdf: inspection && inspection.isPdf === true,
    fileInfo: rendererSafeFileInfo,
    totalPages: Number.isFinite(inspection && inspection.totalPages) ? inspection.totalPages : null,
    primaryAlertKey: inspection && inspection.error ? resolvePdfAlertKey(inspection.error.code) : '',
    error: inspection && inspection.error ? inspection.error : null,
  };
}

async function prepareSelectedFile({
  filePath,
  ocrLanguage,
  pdfPageSelection,
  generatedPdfArtifactPolicy,
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
      requestedPdfPageSelection: pdfPageSelection,
      requestedGeneratedPdfArtifactPolicy: generatedPdfArtifactPolicy,
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

  if (code === 'pdf_page_count_unavailable') {
    return 'renderer.alerts.text_extraction_pdf_page_count_unavailable';
  }
  if (code === 'pdf_page_selection_invalid') {
    return 'renderer.alerts.text_extraction_pdf_page_selection_invalid';
  }
  if (code === 'pdf_subset_creation_failed') {
    return 'renderer.alerts.text_extraction_pdf_subset_creation_failed';
  }

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
  const alertKeys = [];

  if (warnings.some((warning) => warning === 'cleanup:pdf_subset_cleanup_failed')) {
    alertKeys.push('renderer.alerts.text_extraction_generated_pdf_cleanup_warning');
  }

  if (routeKind === 'ocr'
    && warnings.some((warning) => (
      typeof warning === 'string'
      && warning.startsWith('cleanup:')
      && warning !== 'cleanup:pdf_subset_cleanup_failed'
    ))) {
    alertKeys.push('renderer.alerts.text_extraction_ocr_cleanup_warning');
  }

  return alertKeys;
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

function decorateExecutionResultForPreparedInput({
  preparedRecord,
  routeKind,
  result,
  processingInputContext,
}) {
  const safeResult = result && typeof result === 'object' ? { ...result } : result;
  if (!safeResult) return result;

  const originalFileInfo = preparedRecord && preparedRecord.fileInfo && typeof preparedRecord.fileInfo === 'object'
    ? preparedRecord.fileInfo
    : {};
  const existingProvenance = safeResult.provenance && typeof safeResult.provenance === 'object'
    ? safeResult.provenance
    : {};
  const existingMetadata = existingProvenance.metadataSafeForLogs
    && typeof existingProvenance.metadataSafeForLogs === 'object'
    ? existingProvenance.metadataSafeForLogs
    : {};
  const pdfPageSelection = preparedRecord && preparedRecord.pdfPageSelection && typeof preparedRecord.pdfPageSelection === 'object'
    ? preparedRecord.pdfPageSelection
    : null;
  const generatedPdfArtifactPolicy = preparedRecord
    && preparedRecord.generatedPdfArtifactPolicy
    && typeof preparedRecord.generatedPdfArtifactPolicy === 'object'
      ? preparedRecord.generatedPdfArtifactPolicy
      : null;
  const processingInputFileName =
    processingInputContext
    && typeof processingInputContext.processingInputFileName === 'string'
    && processingInputContext.processingInputFileName.trim()
      ? processingInputContext.processingInputFileName.trim()
      : (typeof preparedRecord.processingInputFileName === 'string'
        ? preparedRecord.processingInputFileName
        : (typeof originalFileInfo.fileName === 'string' ? originalFileInfo.fileName : ''));

  return {
    ...safeResult,
    processingInputFileName,
    pdfPageSelection: pdfPageSelection ? { ...pdfPageSelection } : null,
    generatedPdfArtifactPolicy: generatedPdfArtifactPolicy ? { ...generatedPdfArtifactPolicy } : null,
    generatedPdfArtifact:
      processingInputContext
      && processingInputContext.generatedPdfArtifact
      && typeof processingInputContext.generatedPdfArtifact === 'object'
        ? { ...processingInputContext.generatedPdfArtifact }
        : null,
    provenance: {
      sourceFileName: typeof originalFileInfo.fileName === 'string'
        ? originalFileInfo.fileName
        : (typeof existingProvenance.sourceFileName === 'string' ? existingProvenance.sourceFileName : ''),
      sourceFileExt: typeof originalFileInfo.sourceFileExt === 'string'
        ? originalFileInfo.sourceFileExt
        : (typeof existingProvenance.sourceFileExt === 'string' ? existingProvenance.sourceFileExt : ''),
      sourceFileKind: typeof originalFileInfo.sourceFileKind === 'string'
        ? originalFileInfo.sourceFileKind
        : (typeof existingProvenance.sourceFileKind === 'string' ? existingProvenance.sourceFileKind : ''),
      ocrProvider: existingProvenance.ocrProvider || (routeKind === 'ocr' ? 'google_drive_docs_conversion' : null),
      metadataSafeForLogs: {
        ...existingMetadata,
        processingInputFileName,
        processingInputSource:
          processingInputContext
          && typeof processingInputContext.processingInputSource === 'string'
            ? processingInputContext.processingInputSource
            : 'original_selected_file',
        pdfPageSelectionMode: pdfPageSelection ? pdfPageSelection.mode : '',
        selectedRangeFromPage: pdfPageSelection ? pdfPageSelection.fromPage : null,
        selectedRangeToPage: pdfPageSelection ? pdfPageSelection.toPage : null,
        selectedPageCount: pdfPageSelection ? pdfPageSelection.selectedPageCount : null,
        pdfTotalPages: pdfPageSelection ? pdfPageSelection.totalPages : null,
        generatedPdfArtifactPolicyMode: generatedPdfArtifactPolicy ? generatedPdfArtifactPolicy.mode : '',
        generatedPdfArtifactRetained: !!(
          processingInputContext
          && processingInputContext.generatedPdfArtifact
          && processingInputContext.generatedPdfArtifact.retained
        ),
      },
    },
  };
}

function buildPreparedExecutionFailureResult({
  preparedRecord,
  productRoute,
  executionKind,
  routeMetadata,
  summary,
  error,
  processingInputContext,
}) {
  return {
    executionKind,
    result: decorateExecutionResultForPreparedInput({
      preparedRecord,
      routeKind: productRoute,
      processingInputContext,
      result: {
        state: 'failure',
        executedRoute: productRoute,
        text: '',
        warnings: [],
        summary,
        provenance: {
          sourceFileName: preparedRecord.fileInfo.fileName,
          sourceFileExt: preparedRecord.fileInfo.sourceFileExt,
          sourceFileKind: preparedRecord.fileInfo.sourceFileKind,
          ocrProvider: executionKind === 'google_drive'
            ? 'google_drive_docs_conversion'
            : null,
          metadataSafeForLogs: {},
        },
        error,
      },
    }),
    routeMetadata: {
      ...(routeMetadata && typeof routeMetadata === 'object' ? routeMetadata : {}),
      executionKind,
      chosenRoute: productRoute,
      executedRoute: productRoute,
    },
  };
}

function buildUnexpectedRuntimeResult(
  preparedRecord,
  productRoute,
  executionKind,
  routeMetadata,
  err,
  processingInputContext
) {
  return buildPreparedExecutionFailureResult({
    preparedRecord,
    productRoute,
    executionKind,
    routeMetadata,
    processingInputContext,
    summary: 'Text extraction route failed due to an unexpected runtime error.',
    error: {
      code: 'platform_runtime_failed',
      message: 'Text extraction route failed due to a platform/runtime error.',
      detailsSafeForLogs: {
        errorMessage: String(err && err.message ? err.message : err || ''),
      },
    },
  });
}

function resolvePreRouteFailureSummary(errorCode) {
  if (errorCode === 'pdf_page_selection_invalid') {
    return 'Text extraction blocked before route execution: selected PDF page range is invalid.';
  }
  if (errorCode === 'unreadable_or_corrupt') {
    return 'Text extraction failed before route execution: selected PDF is unreadable or corrupt.';
  }
  if (errorCode === 'native_encrypted_or_password_protected') {
    return 'Text extraction failed before route execution: selected PDF is encrypted or password-protected.';
  }
  return 'Text extraction failed before route execution: selected-page PDF subset could not be created.';
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
  let processingInputContext = {
    processingInputFileName: typeof preparedRecord.processingInputFileName === 'string'
      ? preparedRecord.processingInputFileName
      : fileInfo.fileName,
    processingInputSource: 'original_selected_file',
    generatedPdfArtifact: null,
  };
  let cleanupGeneratedArtifact = null;

  try {
    const paths = resolvePaths();
    const materializedInput = await materializePdfPageSelectionInput({
      fileInfo,
      pdfPageSelection: preparedRecord.pdfPageSelection,
      generatedPdfArtifactPolicy: preparedRecord.generatedPdfArtifactPolicy,
      retainedArtifactsDir: paths.generatedPdfArtifactsDir,
    });

    if (!materializedInput || materializedInput.ok !== true) {
      const error = materializedInput && materializedInput.error
        ? materializedInput.error
        : {
          code: 'pdf_subset_creation_failed',
          message: 'Selected-page PDF subset could not be created.',
          detailsSafeForLogs: {
            stage: 'materialize_subset',
            reason: 'invalid_result_shape',
          },
        };
      executionResult = buildPreparedExecutionFailureResult({
        preparedRecord,
        productRoute,
        executionKind: productRoute === 'native' ? 'native' : 'google_drive',
        routeMetadata: preparedRecord.routeMetadata,
        processingInputContext,
        summary: resolvePreRouteFailureSummary(error.code),
        error,
      });
    } else {
      processingInputContext = {
        processingInputFileName: materializedInput.processingInputFileName,
        processingInputSource: materializedInput.processingInputSource,
        generatedPdfArtifact: materializedInput.generatedPdfArtifact,
      };
      cleanupGeneratedArtifact = typeof materializedInput.cleanupGeneratedArtifact === 'function'
        ? materializedInput.cleanupGeneratedArtifact
        : null;

      if (materializedInput.retainedArtifactPath) {
        log.info('text extraction retained generated PDF artifact:', {
          retainedArtifactPath: materializedInput.retainedArtifactPath,
          processingInputFileName: materializedInput.processingInputFileName,
          generatedPdfArtifactPolicyMode:
            materializedInput.generatedPdfArtifact
            && materializedInput.generatedPdfArtifact.policyMode
              ? materializedInput.generatedPdfArtifact.policyMode
              : '',
        });
      }

      if (productRoute === 'native') {
        const nativeResult = await runNativeExtractionRoute({
          filePath: materializedInput.effectiveFilePath,
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
          result: decorateExecutionResultForPreparedInput({
            preparedRecord,
            routeKind: 'native',
            result: safeNativeResult,
            processingInputContext,
          }),
          routeMetadata: {
            ...preparedRecord.routeMetadata,
            chosenRoute: productRoute,
            executedRoute: productRoute,
            executionKind: 'native',
          },
        };
      } else {
        const ocrResult = await runGoogleDriveOcrRoute({
          filePath: materializedInput.effectiveFilePath,
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
          result: decorateExecutionResultForPreparedInput({
            preparedRecord,
            routeKind: 'ocr',
            result: safeOcrResult,
            processingInputContext,
          }),
          routeMetadata: {
            ...preparedRecord.routeMetadata,
            chosenRoute: productRoute,
            executedRoute: productRoute,
            executionKind: 'google_drive',
          },
        };
      }
    }
  } catch (err) {
    log.error('text extraction execution failed unexpectedly:', err);
    executionResult = buildUnexpectedRuntimeResult(
      preparedRecord,
      productRoute,
      productRoute === 'native' ? 'native' : 'google_drive',
      preparedRecord.routeMetadata,
      err,
      processingInputContext
    );
  } finally {
    if (cleanupGeneratedArtifact) {
      const cleanupWarning = cleanupGeneratedArtifact();
      if (cleanupWarning && typeof cleanupWarning.warningCode === 'string') {
        log.warn('Generated PDF subset cleanup failed (ignored):', cleanupWarning.detailsSafeForLogs || {});
        if (executionResult && executionResult.result) {
          executionResult.result.warnings = Array.isArray(executionResult.result.warnings)
            ? executionResult.result.warnings
            : [];
          executionResult.result.warnings.push(cleanupWarning.warningCode);
        }
      }
    }

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
  inspectSelectedFile,
  isAuthorizedSender,
  prepareSelectedFile,
  resolveInspectPayload,
  resolvePreparedRoute,
  resolveExecutePayload,
  resolvePreparePayload,
};

// =============================================================================
// End of electron/text_extraction_platform/text_extraction_prepare_execute_core.js
// =============================================================================
