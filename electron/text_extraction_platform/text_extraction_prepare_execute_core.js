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

const fs = require('fs');
const path = require('path');
const { BrowserWindow } = require('electron');

const Log = require('../log');
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
  OCR_PROVIDER_LIMIT_BYTES,
  buildHeavyPdfSplitPlan,
  bytesToMegabytes,
  isHeavyPdfBySourceSize,
} = require('./text_extraction_heavy_pdf_split_core');
const {
  getNativeParserForExt,
  getOcrSourceMimeTypeForExt,
} = require('./text_extraction_supported_formats');

const log = Log.get('text-extraction-prepare-execute-core');

// =============================================================================
// IPC wrapper boundary helpers
// =============================================================================

function resolveInspectPayload(payload) {
  const raw = payload && typeof payload === 'object' ? payload : {};
  return {
    filePath: typeof raw.filePath === 'string' ? raw.filePath.trim() : '',
  };
}

function resolvePreparePayload(payload) {
  const raw = payload && typeof payload === 'object' ? payload : {};
  const planningMode = typeof raw.planningMode === 'string'
    ? raw.planningMode.trim().toLowerCase()
    : '';
  return {
    filePath: typeof raw.filePath === 'string' ? raw.filePath.trim() : '',
    ocrLanguage: typeof raw.ocrLanguage === 'string' ? raw.ocrLanguage.trim() : '',
    planningMode: planningMode === 'batch' ? 'batch' : 'single',
    forceHeavySplitFullSource: raw.forceHeavySplitFullSource === true,
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
  const heavySplitFailurePolicy = typeof raw.heavySplitFailurePolicy === 'string'
    ? raw.heavySplitFailurePolicy.trim()
    : '';
  return {
    prepareId: typeof raw.prepareId === 'string' ? raw.prepareId.trim() : '',
    routePreference: routePreference === 'native' || routePreference === 'ocr'
      ? routePreference
      : '',
    processingContext:
      raw.processingContext && typeof raw.processingContext === 'object' && !Array.isArray(raw.processingContext)
        ? raw.processingContext
        : null,
    reuseActiveProcessingLock: raw.reuseActiveProcessingLock === true,
    heavySplitFailurePolicy: heavySplitFailurePolicy === 'omit_failed_and_continue'
      ? 'omit_failed_and_continue'
      : 'finish_unit_after_last_success',
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

// =============================================================================
// Shared file/setup metadata helpers
// =============================================================================

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
  let sourceFileSizeBytes = 0;
  try {
    const stats = fs.statSync(resolvedPath);
    sourceFileSizeBytes = Number.isFinite(stats.size) ? Math.floor(stats.size) : 0;
  } catch (_err) {
    sourceFileSizeBytes = 0;
  }

  return {
    filePath: normalizedPath,
    resolvedPath,
    fileName,
    sourceFileExt,
    sourceFileKind,
    sourceFileSizeBytes,
  };
}

function getRendererSafeFileInfo(fileInfo) {
  return {
    fileName: fileInfo && typeof fileInfo.fileName === 'string' ? fileInfo.fileName : '',
    sourceFileExt: fileInfo && typeof fileInfo.sourceFileExt === 'string' ? fileInfo.sourceFileExt : '',
    sourceFileKind: fileInfo && typeof fileInfo.sourceFileKind === 'string' ? fileInfo.sourceFileKind : '',
    sourceFileSizeBytes: Number.isFinite(fileInfo && fileInfo.sourceFileSizeBytes)
      ? Math.floor(fileInfo.sourceFileSizeBytes)
      : 0,
  };
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

function getGeneratedPdfArtifactPolicyMode(generatedPdfArtifactPolicy) {
  return generatedPdfArtifactPolicy && typeof generatedPdfArtifactPolicy.mode === 'string'
    ? generatedPdfArtifactPolicy.mode
    : '';
}

// =============================================================================
// Prepare/build helpers
// =============================================================================

function getProbeMetadataSafeForLogs(probeResult) {
  const metadata = probeResult && probeResult.metadataSafeForLogs && typeof probeResult.metadataSafeForLogs === 'object'
    ? probeResult.metadataSafeForLogs
    : {};
  return {
    pagesScanned: Number.isFinite(metadata.pagesScanned) ? metadata.pagesScanned : 0,
    totalPages: Number.isFinite(metadata.totalPages) ? metadata.totalPages : 0,
    foundAtPage: Number.isFinite(metadata.foundAtPage) ? metadata.foundAtPage : null,
    probedFromPage: Number.isFinite(metadata.probedFromPage) ? metadata.probedFromPage : null,
    probedToPage: Number.isFinite(metadata.probedToPage) ? metadata.probedToPage : null,
    selectedPageCount: Number.isFinite(metadata.selectedPageCount) ? metadata.selectedPageCount : null,
    elapsedMs: Number.isFinite(metadata.elapsedMs) ? metadata.elapsedMs : 0,
  };
}

function getProbeFailureDetails(probeResult) {
  if (!probeResult || probeResult.state !== 'failure') return null;
  const error = probeResult.error && typeof probeResult.error === 'object'
    ? probeResult.error
    : null;
  if (!error) return null;
  const details = error.detailsSafeForLogs && typeof error.detailsSafeForLogs === 'object'
    ? error.detailsSafeForLogs
    : {};

  return {
    code: typeof error.code === 'string' ? error.code : '',
    errorName: typeof details.errorName === 'string' ? details.errorName : '',
    errorCode: typeof details.errorCode === 'string' ? details.errorCode : '',
    selectableText: typeof probeResult.selectableText === 'string' ? probeResult.selectableText : 'unknown',
    metadataSafeForLogs: getProbeMetadataSafeForLogs(probeResult),
  };
}

function getProbeSuccessDetails(probeResult) {
  if (!probeResult || probeResult.state !== 'success') return null;
  return {
    selectableText: typeof probeResult.selectableText === 'string' ? probeResult.selectableText : 'unknown',
    metadataSafeForLogs: getProbeMetadataSafeForLogs(probeResult),
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
  sourceFileSizeBytes = 0,
  sourceFileSizeMB = 0,
  pdfTotalPages = null,
  ocrProviderLimitBytes = OCR_PROVIDER_LIMIT_BYTES,
  heavySplitEligible = false,
  heavySplitPreview = null,
}) {
  return {
    fileKind: fileInfo.sourceFileKind,
    sourceFileSizeBytes: Number.isFinite(sourceFileSizeBytes) ? Math.floor(sourceFileSizeBytes) : 0,
    sourceFileSizeMB: Number.isFinite(sourceFileSizeMB) ? sourceFileSizeMB : 0,
    pdfTotalPages: Number.isFinite(pdfTotalPages) ? Math.floor(pdfTotalPages) : null,
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
    ocrProviderLimitBytes: Number.isFinite(ocrProviderLimitBytes)
      ? Math.floor(ocrProviderLimitBytes)
      : OCR_PROVIDER_LIMIT_BYTES,
    heavySplitEligible: heavySplitEligible === true,
    heavySplitPreview:
      heavySplitPreview && typeof heavySplitPreview === 'object'
        ? {
          ...heavySplitPreview,
          generatedInputs: Array.isArray(heavySplitPreview.generatedInputs)
            ? heavySplitPreview.generatedInputs.map((generatedInput) => ({ ...generatedInput }))
            : [],
        }
        : null,
  };
}

function buildPrepareFailure({
  fileInfo = null,
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
    fileInfo: fileInfo && typeof fileInfo === 'object' ? { ...fileInfo } : null,
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
    fileInfo,
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
      generatedPdfArtifactPolicyMode: getGeneratedPdfArtifactPolicyMode(generatedPdfArtifactPolicy),
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
  const pdfAlertKey = resolvePdfAlertKey(code);
  const primaryAlertKey = pdfAlertKey === 'renderer.alerts.text_extraction_error'
    ? 'renderer.alerts.text_extraction_native_runtime_error'
    : pdfAlertKey;

  return buildPrepareFailure({
    fileInfo,
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
      generatedPdfArtifactPolicyMode: getGeneratedPdfArtifactPolicyMode(generatedPdfArtifactPolicy),
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
    fileInfo,
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
    fileInfo,
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
      generatedPdfArtifactPolicyMode: getGeneratedPdfArtifactPolicyMode(generatedPdfArtifactPolicy),
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
async function validateOcrSetup(resolvePaths) {
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
  planningMode = 'single',
  forceHeavySplitFullSource = false,
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
      planningMode,
      forceHeavySplitFullSource,
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
    fileInfo,
    planningMode,
    forceHeavySplitFullSource,
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
}) {
  const processingInputFileName = fileInfo.fileName;
  const validation = await validateOcrSetup(resolvePaths);
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
  planningMode = 'single',
  forceHeavySplitFullSource = false,
  requestedPdfPageSelection,
  requestedGeneratedPdfArtifactPolicy,
  resolvePaths,
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

  const requestedExecutionScope = forceHeavySplitFullSource === true
    ? { mode: 'all' }
    : requestedPdfPageSelection;
  const canonicalPdfPageSelection = canonicalizePdfPageSelection(requestedExecutionScope, {
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
  const probePageRange = planningMode === 'batch'
    ? {
      fromPage: 1,
      toPage: pdfInspection.totalPages,
    }
    : {
      fromPage: pdfPageSelection.fromPage,
      toPage: pdfPageSelection.toPage,
    };
  const heavySplitPreview = isHeavyPdfBySourceSize(fileInfo.sourceFileSizeBytes, OCR_PROVIDER_LIMIT_BYTES)
    ? buildHeavyPdfSplitPlan({
      fileInfo,
      sourceTotalPages: pdfInspection.totalPages,
      sourceFileSizeBytes: fileInfo.sourceFileSizeBytes,
      providerLimitBytes: OCR_PROVIDER_LIMIT_BYTES,
    })
    : null;
  const nativeProbeResult = await probeNativePdfSelectableText({
    filePath: fileInfo.filePath,
    pageRange: probePageRange,
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

  const ocrValidation = await validateOcrSetup(resolvePaths);
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
    generatedPdfArtifactPolicyMode: getGeneratedPdfArtifactPolicyMode(generatedPdfArtifactPolicy),
    sourceFileSizeBytes: fileInfo.sourceFileSizeBytes,
    sourceFileSizeMB: bytesToMegabytes(fileInfo.sourceFileSizeBytes),
    pdfTotalPages: pdfInspection.totalPages,
    ocrProviderLimitBytes: OCR_PROVIDER_LIMIT_BYTES,
    heavySplitEligible: !!(heavySplitPreview && heavySplitPreview.ok === true),
    heavySplitPreview: heavySplitPreview && heavySplitPreview.ok === true ? heavySplitPreview : null,
    nativeProbeSelectableText: nativeProbeSuccess ? nativeProbeSuccess.selectableText : '',
    nativeProbeMetadata: nativeProbeSuccess ? nativeProbeSuccess.metadataSafeForLogs : null,
  });

  if (forceHeavySplitFullSource === true && !(heavySplitPreview && heavySplitPreview.ok === true)) {
    return buildPrepareFailure({
      fileInfo,
      executionKind: routeMetadata.executionKind,
      routeMetadata,
      primaryAlertKey: 'renderer.alerts.text_extraction_error',
      warningAlertKeys: [],
      error: {
        code: 'heavy_split_plan_invalid',
        message: 'Heavy PDF full-source split is no longer valid for this source PDF.',
        detailsSafeForLogs: {
          stage: 'prepare',
          reason: 'force_full_source_split_not_required',
          sourceFileSizeBytes: fileInfo.sourceFileSizeBytes,
          providerLimitBytes: OCR_PROVIDER_LIMIT_BYTES,
        },
      },
      pdfPageSelection,
      generatedPdfArtifactPolicy,
      processingInputFileName,
    });
  }

  return buildPrepareReadyResult({
    fileInfo,
    ocrLanguage,
    planningMode,
    forceHeavySplitFullSource,
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
  planningMode = 'single',
  forceHeavySplitFullSource = false,
  pdfPageSelection,
  generatedPdfArtifactPolicy,
  resolvePaths,
}) {
  const fileInfo = getFileInfo(filePath);
  const nativeParser = getNativeParserForExt(fileInfo.sourceFileExt);
  const driveSourceMimeType = getOcrSourceMimeTypeForExt(fileInfo.sourceFileExt);

  if (fileInfo.sourceFileKind === 'pdf') {
    return resolvePdfPreparation({
      fileInfo,
      ocrLanguage,
      planningMode,
      forceHeavySplitFullSource,
      requestedPdfPageSelection: pdfPageSelection,
      requestedGeneratedPdfArtifactPolicy: generatedPdfArtifactPolicy,
      resolvePaths,
    });
  }

  if (fileInfo.sourceFileKind === 'image' || (!nativeParser && driveSourceMimeType)) {
    return resolveNonPdfOcrPreparation({
      fileInfo,
      ocrLanguage,
      resolvePaths,
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
    if (state === 'success') return '';
    if (state === 'cancelled' || code === 'aborted_by_user') return 'renderer.alerts.text_extraction_native_cancelled';
    if (code === 'unsupported_format') return 'renderer.alerts.text_extraction_native_unsupported_format';
    if (code === 'native_encrypted_or_password_protected') {
      return 'renderer.alerts.text_extraction_native_encrypted_or_password_protected';
    }
    if (code === 'unreadable_or_corrupt') return 'renderer.alerts.text_extraction_native_unreadable_or_corrupt';
    return 'renderer.alerts.text_extraction_native_runtime_error';
  }

  if (state === 'success') return '';
  if (code === 'ocr_input_too_large') return '';
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

function getControllerStateSnapshot(controller) {
  if (!controller || typeof controller.getState !== 'function') return null;
  const state = controller.getState();
  return state && typeof state === 'object' ? state : null;
}

function getControllerLockId(state) {
  const lockId = Number(state && state.lockId);
  return Number.isInteger(lockId) && lockId > 0 ? lockId : null;
}

function isExecutionStillOwned(controller, executionLockId) {
  if (!controller || typeof controller.isActive !== 'function' || !controller.isActive()) {
    return false;
  }
  if (!Number.isInteger(executionLockId) || executionLockId < 1) {
    return false;
  }
  const currentLockId = getControllerLockId(getControllerStateSnapshot(controller));
  return currentLockId === executionLockId;
}

function enforceFailureAbortInvariants({
  routeKind,
  fileInfo,
  isExecutionOwned,
  result,
}) {
  const safeResult = result && typeof result === 'object' ? { ...result } : null;
  if (!safeResult) return result;

  if (safeResult.state === 'success'
    && typeof isExecutionOwned === 'function'
    && !isExecutionOwned()) {
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
        reason: 'execution_ownership_lost',
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

function buildPreparedCancelledResult({
  preparedRecord,
  productRoute,
  executionKind,
  routeMetadata,
  processingInputContext,
  detailsSafeForLogs,
  heavySplitExecution = null,
  summary,
  message,
}) {
  return {
    executionKind,
    result: decorateExecutionResultForPreparedInput({
      preparedRecord,
      routeKind: productRoute,
      processingInputContext,
      result: {
        state: 'cancelled',
        executedRoute: productRoute,
        text: '',
        warnings: [],
        summary,
        heavySplitExecution:
          heavySplitExecution && typeof heavySplitExecution === 'object'
            ? { ...heavySplitExecution }
            : null,
        provenance: {
          sourceFileName: preparedRecord.fileInfo.fileName,
          sourceFileExt: preparedRecord.fileInfo.sourceFileExt,
          sourceFileKind: preparedRecord.fileInfo.sourceFileKind,
          ocrProvider: executionKind === 'google_drive'
            ? 'google_drive_docs_conversion'
            : null,
          metadataSafeForLogs: {},
        },
        error: {
          code: 'aborted_by_user',
          message,
          detailsSafeForLogs,
        },
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
        generatedPdfArtifactPolicyMode: getGeneratedPdfArtifactPolicyMode(generatedPdfArtifactPolicy),
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

function normalizePositiveInteger(rawValue) {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value < 1) return null;
  return value;
}

function normalizeProcessingContext(rawContext = {}, defaults = {}) {
  const context = rawContext && typeof rawContext === 'object' ? rawContext : {};
  const fallback = defaults && typeof defaults === 'object' ? defaults : {};
  const processingInputFileName = typeof context.processingInputFileName === 'string'
    ? context.processingInputFileName.trim()
    : '';
  const processingInputSource = typeof context.processingInputSource === 'string'
    ? context.processingInputSource.trim()
    : '';
  const selectedRoute = typeof context.selectedRoute === 'string'
    ? context.selectedRoute.trim().toLowerCase()
    : '';

  return {
    unitIndex: normalizePositiveInteger(context.unitIndex) || normalizePositiveInteger(fallback.unitIndex),
    unitCount: normalizePositiveInteger(context.unitCount) || normalizePositiveInteger(fallback.unitCount),
    inputIndex: normalizePositiveInteger(context.inputIndex) || normalizePositiveInteger(fallback.inputIndex),
    inputCount: normalizePositiveInteger(context.inputCount) || normalizePositiveInteger(fallback.inputCount),
    selectedRoute: selectedRoute === 'native' || selectedRoute === 'ocr'
      ? selectedRoute
      : (typeof fallback.selectedRoute === 'string' ? fallback.selectedRoute : ''),
    processingInputFileName: processingInputFileName || (typeof fallback.processingInputFileName === 'string'
      ? fallback.processingInputFileName
      : ''),
    processingInputSource: processingInputSource || (typeof fallback.processingInputSource === 'string'
      ? fallback.processingInputSource
      : ''),
  };
}

function buildControllerExecutionContext({
  fileInfo,
  productRoute,
  processingContext,
}) {
  const normalized = normalizeProcessingContext(processingContext, {
    selectedRoute: productRoute,
    processingInputFileName: fileInfo && typeof fileInfo.fileName === 'string' ? fileInfo.fileName : '',
    processingInputSource: 'original_selected_file',
  });
  return {
    source: 'text_extraction_execution',
    reason: fileInfo && fileInfo.sourceFileKind === 'pdf' ? 'run_pdf_route' : 'run_route',
    unitIndex: normalized.unitIndex,
    unitCount: normalized.unitCount,
    inputIndex: normalized.inputIndex,
    inputCount: normalized.inputCount,
    selectedRoute: normalized.selectedRoute,
    processingInputFileName: normalized.processingInputFileName,
    processingInputSource: normalized.processingInputSource,
  };
}

function updateControllerProcessingContext(controller, nextContext) {
  if (!controller || typeof controller.update !== 'function') return;
  try {
    controller.update(nextContext);
  } catch (err) {
    log.warn('Processing-mode metadata update failed (ignored):', err);
  }
}

function appendUnitText(baseText, nextText) {
  const base = String(baseText || '');
  const incoming = String(nextText || '');
  if (!base) return incoming;
  if (!incoming) return base;
  const baseEndsWithNewline = base.endsWith('\n') || base.endsWith('\r');
  return `${base}${baseEndsWithNewline ? '\n' : '\n\n'}${incoming}`;
}

function buildHeavySplitChildStatus({
  generatedInput,
  state,
  errorCode = '',
  uploadStatus = '',
  generatedPdfArtifact = null,
}) {
  return {
    inputIndex: generatedInput.inputIndex,
    fromPage: generatedInput.fromPage,
    toPage: generatedInput.toPage,
    fileName: generatedInput.processingInputFileName,
    state,
    errorCode,
    uploadStatus,
    generatedPdfArtifact:
      generatedPdfArtifact && typeof generatedPdfArtifact === 'object'
        ? { ...generatedPdfArtifact }
        : null,
  };
}

function appendHeavySplitOmittedStatuses(childStatuses, generatedInputs, startIndex) {
  for (let omittedIndex = startIndex; omittedIndex < generatedInputs.length; omittedIndex += 1) {
    childStatuses.push(buildHeavySplitChildStatus({
      generatedInput: generatedInputs[omittedIndex],
      state: 'omitted',
    }));
  }
}

async function executePreparedHeavySplitUnit({
  preparedRecord,
  routeMetadata,
  productRoute,
  resolvePaths,
  controller,
  executionOwnsController,
  heavySplitFailurePolicy,
  processingContext,
}) {
  const heavySplitPreview = routeMetadata && routeMetadata.heavySplitPreview && routeMetadata.heavySplitPreview.ok === true
    ? routeMetadata.heavySplitPreview
    : null;
  const generatedInputs = heavySplitPreview && Array.isArray(heavySplitPreview.generatedInputs)
    ? heavySplitPreview.generatedInputs.map((generatedInput) => ({ ...generatedInput }))
    : [];
  if (generatedInputs.length < 1) {
    return buildPreparedExecutionFailureResult({
      preparedRecord,
      productRoute,
      executionKind: 'google_drive',
      routeMetadata,
      processingInputContext: {
        processingInputFileName: preparedRecord.processingInputFileName || preparedRecord.fileInfo.fileName,
        processingInputSource: 'original_selected_file',
        generatedPdfArtifact: null,
      },
      summary: 'Heavy PDF OCR split could not start because generated input planning metadata is missing.',
      error: {
        code: 'heavy_split_plan_invalid',
        message: 'Heavy PDF OCR split planning metadata is missing or invalid.',
        detailsSafeForLogs: {
          stage: 'heavy_split_plan',
          reason: 'missing_generated_inputs',
        },
      },
    });
  }

  const normalizedProcessingContext = normalizeProcessingContext(processingContext, {
    selectedRoute: 'ocr',
    unitIndex: 1,
    unitCount: 1,
  });
  const unitProcessingInputContext = {
    processingInputFileName: preparedRecord.processingInputFileName || preparedRecord.fileInfo.fileName,
    processingInputSource: 'original_selected_file',
    generatedPdfArtifact: null,
  };
  const childStatuses = [];
  const cleanupWarnings = [];
  let aggregatedText = '';
  let producedText = false;
  let lastFailureError = null;

  for (let index = 0; index < generatedInputs.length; index += 1) {
    const generatedInput = generatedInputs[index];
    const childProcessingContext = {
      ...normalizedProcessingContext,
      inputIndex: generatedInput.inputIndex,
      inputCount: generatedInputs.length,
      selectedRoute: 'ocr',
      processingInputFileName: generatedInput.processingInputFileName,
      processingInputSource: 'generated_pdf_split_input',
    };
    updateControllerProcessingContext(controller, childProcessingContext);

    const paths = resolvePaths();
    const materializedInput = await materializePdfPageSelectionInput({
      fileInfo: preparedRecord.fileInfo,
      pdfPageSelection: generatedInput.pdfPageSelection,
      generatedPdfArtifactPolicy: preparedRecord.generatedPdfArtifactPolicy,
      retainedArtifactsDir: paths.generatedPdfArtifactsDir,
    });

    if (!materializedInput || materializedInput.ok !== true) {
      const error = materializedInput && materializedInput.error
        ? materializedInput.error
        : {
          code: 'pdf_subset_creation_failed',
          message: 'Generated split PDF could not be created.',
          detailsSafeForLogs: {
            stage: 'heavy_split_materialize',
            reason: 'invalid_result_shape',
          },
        };
      lastFailureError = error;
      childStatuses.push(buildHeavySplitChildStatus({
        generatedInput,
        state: 'failed',
        errorCode: error.code || 'pdf_subset_creation_failed',
      }));
      if (heavySplitFailurePolicy !== 'omit_failed_and_continue') {
        appendHeavySplitOmittedStatuses(childStatuses, generatedInputs, index + 1);
        break;
      }
      continue;
    }

    let cleanupGeneratedArtifact = materializedInput.cleanupGeneratedArtifact;
    const generatedPdfArtifact = materializedInput.generatedPdfArtifact
      && typeof materializedInput.generatedPdfArtifact === 'object'
      ? { ...materializedInput.generatedPdfArtifact }
      : null;
    updateControllerProcessingContext(controller, {
      ...childProcessingContext,
      processingInputFileName: materializedInput.processingInputFileName,
      processingInputSource: 'generated_pdf_split_input',
    });

    if (!executionOwnsController()) {
      const cleanupWarning = typeof cleanupGeneratedArtifact === 'function'
        ? cleanupGeneratedArtifact()
        : null;
      if (cleanupWarning) {
        log.warn(
          'Generated PDF subset cleanup failed (ignored):',
          cleanupWarning.detailsSafeForLogs || cleanupWarning
        );
        cleanupWarnings.push(cleanupWarning.warningCode || String(cleanupWarning));
      }
      childStatuses.push(buildHeavySplitChildStatus({
        generatedInput,
        state: 'cancelled_before_route_dispatch',
        generatedPdfArtifact,
      }));
      appendHeavySplitOmittedStatuses(childStatuses, generatedInputs, index + 1);
      const cancelledExecution = buildPreparedCancelledResult({
        preparedRecord,
        productRoute,
        executionKind: 'google_drive',
        routeMetadata,
        processingInputContext: unitProcessingInputContext,
        heavySplitExecution: {
          generatedInputs: childStatuses,
        },
        summary: 'Heavy PDF OCR split cancelled by user before OCR upload.',
        message: 'Heavy PDF OCR split was cancelled by user before OCR upload.',
        detailsSafeForLogs: {
          stage: 'pre_route_dispatch',
          reason: 'execution_ownership_lost',
          generatedInputFileName: materializedInput.processingInputFileName,
          heavySplitExecution: {
            generatedInputs: childStatuses,
          },
        },
      });
      return {
        ok: true,
        executionKind: 'google_drive',
        result: cancelledExecution.result,
        routeMetadata: cancelledExecution.routeMetadata,
        primaryAlertKey: resolvePrimaryAlertKey('ocr', cancelledExecution.result),
        warningAlertKeys: resolveWarningAlertKeys('ocr', cancelledExecution.result),
      };
    }

    let childResult = null;
    try {
      childResult = await runGoogleDriveOcrRoute({
        filePath: materializedInput.effectiveFilePath,
        credentialsPath: paths.credentialsPath,
        tokenPath: paths.tokenPath,
        bundledCredentialsFailureCode: paths.bundledCredentialsFailureCode,
        bundledCredentialsFailureReason: paths.bundledCredentialsFailureReason,
        bundledCredentialsFailureDetailsSafeForLogs: paths.bundledCredentialsFailureDetailsSafeForLogs,
        ocrLanguage: preparedRecord.ocrLanguage,
        isAborted: () => !executionOwnsController(),
      });
      childResult = enforceFailureAbortInvariants({
        routeKind: 'ocr',
        fileInfo: preparedRecord.fileInfo,
        isExecutionOwned: executionOwnsController,
        result: childResult,
      });
    } finally {
      const cleanupWarning = typeof cleanupGeneratedArtifact === 'function'
        ? cleanupGeneratedArtifact()
        : null;
      if (cleanupWarning) {
        log.warn(
          'Generated PDF subset cleanup failed (ignored):',
          cleanupWarning.detailsSafeForLogs || cleanupWarning
        );
        cleanupWarnings.push(cleanupWarning.warningCode || String(cleanupWarning));
      }
    }

    if (childResult && childResult.state === 'success') {
      childStatuses.push(buildHeavySplitChildStatus({
        generatedInput,
        state: 'success',
        generatedPdfArtifact,
      }));
      if (typeof childResult.text === 'string' && childResult.text.length > 0) {
        aggregatedText = appendUnitText(aggregatedText, childResult.text);
        producedText = true;
      }
      continue;
    }

    if (childResult && childResult.state === 'cancelled') {
      childStatuses.push(buildHeavySplitChildStatus({
        generatedInput,
        state: 'cancelled_before_route_dispatch',
        errorCode: childResult.error && childResult.error.code ? childResult.error.code : 'aborted_by_user',
        uploadStatus:
          childResult.error
          && childResult.error.detailsSafeForLogs
          && typeof childResult.error.detailsSafeForLogs.uploadStatus === 'string'
            ? childResult.error.detailsSafeForLogs.uploadStatus
            : '',
        generatedPdfArtifact,
      }));
      appendHeavySplitOmittedStatuses(childStatuses, generatedInputs, index + 1);
      const cancelledExecution = buildPreparedCancelledResult({
        preparedRecord,
        productRoute,
        executionKind: 'google_drive',
        routeMetadata,
        processingInputContext: unitProcessingInputContext,
        heavySplitExecution: {
          generatedInputs: childStatuses,
        },
        summary: 'Heavy PDF OCR split cancelled by user.',
        message: 'Heavy PDF OCR split was cancelled by user.',
        detailsSafeForLogs: {
          stage: 'runtime',
          reason: 'user_abort',
          heavySplitExecution: {
            generatedInputs: childStatuses,
          },
        },
      });
      return {
        ok: true,
        executionKind: 'google_drive',
        result: cancelledExecution.result,
        routeMetadata: cancelledExecution.routeMetadata,
        primaryAlertKey: resolvePrimaryAlertKey('ocr', cancelledExecution.result),
        warningAlertKeys: resolveWarningAlertKeys('ocr', cancelledExecution.result),
      };
    }

    const failureCode = childResult && childResult.error && typeof childResult.error.code === 'string'
      ? childResult.error.code
      : 'ocr_conversion_failed';
    const uploadStatus = childResult
      && childResult.error
      && childResult.error.detailsSafeForLogs
      && typeof childResult.error.detailsSafeForLogs.uploadStatus === 'string'
      ? childResult.error.detailsSafeForLogs.uploadStatus
      : '';
    lastFailureError = childResult && childResult.error ? childResult.error : {
      code: failureCode,
      message: 'Generated OCR split input failed.',
      detailsSafeForLogs: {
        stage: 'heavy_split_runtime',
      },
    };
    childStatuses.push(buildHeavySplitChildStatus({
      generatedInput,
      state: 'failed',
      errorCode: failureCode,
      uploadStatus,
      generatedPdfArtifact,
    }));
    if (heavySplitFailurePolicy !== 'omit_failed_and_continue') {
      appendHeavySplitOmittedStatuses(childStatuses, generatedInputs, index + 1);
      break;
    }
  }

  const topLevelWarnings = [];
  cleanupWarnings.forEach((warning) => {
    if (typeof warning === 'string' && warning.trim()) {
      topLevelWarnings.push(warning);
    }
  });

  if (producedText) {
    const result = decorateExecutionResultForPreparedInput({
      preparedRecord,
      routeKind: 'ocr',
      processingInputContext: unitProcessingInputContext,
      result: {
        state: 'success',
        executedRoute: 'ocr',
        text: aggregatedText,
        warnings: topLevelWarnings,
        summary: topLevelWarnings.length > 0
          ? 'Heavy PDF OCR split succeeded with cleanup warning.'
          : 'Heavy PDF OCR split succeeded.',
        heavySplitExecution: {
          generatedInputs: childStatuses,
        },
        provenance: {
          sourceFileName: preparedRecord.fileInfo.fileName,
          sourceFileExt: preparedRecord.fileInfo.sourceFileExt,
          sourceFileKind: preparedRecord.fileInfo.sourceFileKind,
          ocrProvider: 'google_drive_docs_conversion',
          metadataSafeForLogs: {},
        },
        error: null,
      },
    });
    return {
      ok: true,
      executionKind: 'google_drive',
      result,
      routeMetadata: {
        ...(routeMetadata && typeof routeMetadata === 'object' ? routeMetadata : {}),
        executionKind: 'google_drive',
        chosenRoute: 'ocr',
        executedRoute: 'ocr',
      },
      primaryAlertKey: resolvePrimaryAlertKey('ocr', result),
      warningAlertKeys: resolveWarningAlertKeys('ocr', result),
    };
  }

  const failureResult = decorateExecutionResultForPreparedInput({
    preparedRecord,
    routeKind: 'ocr',
    processingInputContext: unitProcessingInputContext,
    result: {
      state: 'failure',
      executedRoute: 'ocr',
      text: '',
      warnings: topLevelWarnings,
      summary: 'Heavy PDF OCR split did not produce extracted text.',
      heavySplitExecution: {
        generatedInputs: childStatuses,
      },
      provenance: {
        sourceFileName: preparedRecord.fileInfo.fileName,
        sourceFileExt: preparedRecord.fileInfo.sourceFileExt,
        sourceFileKind: preparedRecord.fileInfo.sourceFileKind,
        ocrProvider: 'google_drive_docs_conversion',
        metadataSafeForLogs: {},
      },
      error: lastFailureError || {
        code: 'ocr_conversion_failed',
        message: 'Heavy PDF OCR split did not produce extracted text.',
        detailsSafeForLogs: {
          stage: 'heavy_split_runtime',
          reason: 'no_generated_input_succeeded',
        },
      },
    },
  });
  return {
    ok: true,
    executionKind: 'google_drive',
    result: failureResult,
    routeMetadata: {
      ...(routeMetadata && typeof routeMetadata === 'object' ? routeMetadata : {}),
      executionKind: 'google_drive',
      chosenRoute: 'ocr',
      executedRoute: 'ocr',
    },
    primaryAlertKey: resolvePrimaryAlertKey('ocr', failureResult),
    warningAlertKeys: resolveWarningAlertKeys('ocr', failureResult),
  };
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
  processingContext = null,
  reuseActiveProcessingLock = false,
  heavySplitFailurePolicy = 'finish_unit_after_last_success',
  resolvePaths,
  controller,
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
  const executionKind = productRoute === 'native' ? 'native' : 'google_drive';
  const fileInfo = preparedRecord.fileInfo;
  const controllerExecutionContext = buildControllerExecutionContext({
    fileInfo,
    productRoute,
    processingContext,
  });
  let ownsControllerTransition = false;
  let executionState = null;

  if (reuseActiveProcessingLock) {
    if (!controller.isActive()) {
      return {
        ok: false,
        code: 'ACTIVE_SESSION_REQUIRED',
        state: controller.getState(),
      };
    }
    updateControllerProcessingContext(controller, controllerExecutionContext);
    executionState = getControllerStateSnapshot(controller);
  } else {
    const enterTransition = controller.enter(controllerExecutionContext);
    if (!enterTransition.changed && controller.isActive()) {
      return {
        ok: false,
        code: 'ALREADY_ACTIVE',
        state: controller.getState(),
      };
    }
    ownsControllerTransition = enterTransition.changed === true;
    executionState = enterTransition && enterTransition.state && typeof enterTransition.state === 'object'
      ? enterTransition.state
      : getControllerStateSnapshot(controller);
  }

  const executionLockId = getControllerLockId(executionState);
  const executionOwnsController = () => isExecutionStillOwned(controller, executionLockId);
  let executionResult = null;
  let processingInputContext = {
    processingInputFileName: typeof preparedRecord.processingInputFileName === 'string'
      ? preparedRecord.processingInputFileName
      : fileInfo.fileName,
    processingInputSource: 'original_selected_file',
    generatedPdfArtifact: null,
  };
  let cleanupGeneratedArtifact = null;
  const heavySplitActive = productRoute === 'ocr'
    && preparedRecord
    && preparedRecord.routeMetadata
    && preparedRecord.routeMetadata.heavySplitEligible === true
    && preparedRecord.forceHeavySplitFullSource === true;

  try {
    if (heavySplitActive) {
      executionResult = await executePreparedHeavySplitUnit({
        preparedRecord,
        routeMetadata: preparedRecord.routeMetadata,
        productRoute,
        resolvePaths,
        controller,
        executionOwnsController,
        heavySplitFailurePolicy,
        processingContext,
      });
      return executionResult;
    }

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
        executionKind,
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
      updateControllerProcessingContext(controller, {
        ...controllerExecutionContext,
        processingInputFileName: materializedInput.processingInputFileName,
        processingInputSource: materializedInput.processingInputSource,
      });
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

      if (!executionOwnsController()) {
        const ownershipState = getControllerStateSnapshot(controller);
        log.info('text extraction route dispatch skipped because execution ownership was lost:', {
          chosenRoute: productRoute,
          executionLockId,
          currentLockId: getControllerLockId(ownershipState),
          processingActive: !!(ownershipState && ownershipState.active === true),
          processingInputFileName: materializedInput.processingInputFileName,
        });
        executionResult = buildPreparedCancelledResult({
          preparedRecord,
          productRoute,
          executionKind,
          routeMetadata: preparedRecord.routeMetadata,
          processingInputContext,
          summary: `Text extraction ${productRoute} route cancelled before route execution.`,
          message: `Text extraction ${productRoute} route was cancelled before route execution.`,
          detailsSafeForLogs: {
            stage: 'pre_route_dispatch',
            reason: 'execution_ownership_lost',
            executionLockId,
            currentLockId: getControllerLockId(ownershipState),
          },
        });
      } else if (productRoute === 'native') {
        const nativeResult = await runNativeExtractionRoute({
          filePath: materializedInput.effectiveFilePath,
          isAborted: () => !executionOwnsController(),
        });
        const safeNativeResult = enforceFailureAbortInvariants({
          routeKind: 'native',
          fileInfo,
          isExecutionOwned: executionOwnsController,
          result: nativeResult,
        });
        executionResult = {
          executionKind,
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
          isAborted: () => !executionOwnsController(),
        });
        const safeOcrResult = enforceFailureAbortInvariants({
          routeKind: 'ocr',
          fileInfo,
          isExecutionOwned: executionOwnsController,
          result: ocrResult,
        });
        executionResult = {
          executionKind,
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
      executionKind,
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

    if (ownsControllerTransition && executionOwnsController()) {
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
