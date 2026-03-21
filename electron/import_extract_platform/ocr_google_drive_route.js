// electron/import_extract_platform/ocr_google_drive_route.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Google Drive OCR execution route for import/extract.
// Responsibilities:
// - Read source-file metadata and reject unsupported OCR inputs.
// - Build Google OAuth and Drive clients from stored credentials and token data.
// - Upload/convert source files, export extracted text, and retry rate-limited steps.
// - Classify provider/runtime failures into stable route result codes.
// - Clean up temporary provider and local normalization artifacts after execution.

// =============================================================================
// Imports
// =============================================================================

const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const { readEncryptedTokenFile } = require('./ocr_google_drive_token_storage');
const { normalizeImageForOcrUpload } = require('./ocr_image_normalization');
const {
  buildGoogleOAuthClient,
} = require('./ocr_google_drive_oauth_client');

// =============================================================================
// Constants / config
// =============================================================================

const QUOTA_REASON_CODES = new Set([
  'dailyLimitExceeded',
  'downloadQuotaExceeded',
  'quotaExceeded',
  'rateLimitExceeded',
  'sharingRateLimitExceeded',
  'userRateLimitExceeded',
  'billingNotEnabled',
  'projectBillingNotFound',
]);

const AUTH_REASON_CODES = new Set([
  'authError',
  'forbidden',
  'insufficientPermissions',
  'invalidCredentials',
  'unauthorized',
]);

const SETUP_REASON_CODES = new Set([
  'accessNotConfigured',
  'serviceDisabled',
]);

const NETWORK_ERROR_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ENOTFOUND',
  'ETIMEDOUT',
  'EAI_AGAIN',
  'ERR_SOCKET_TIMEOUT',
  'request_timeout',
]);

const SOURCE_MIME_BY_EXT = Object.freeze({
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.pdf': 'application/pdf',
});

const MAX_RATE_LIMIT_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 300;
const MAX_RETRY_DELAY_MS = 1500;

// =============================================================================
// Helpers
// =============================================================================

function toSafeErrorMessage(err) {
  return String(err && err.message ? err.message : err || '');
}

function toSafeErrorName(err) {
  return String(err && err.name ? err.name : 'Error');
}

function readJsonFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

function getFileInfo(filePath) {
  const absoluteFilePath = path.resolve(String(filePath || ''));
  const extWithDot = path.extname(absoluteFilePath).toLowerCase();
  const sourceMimeType = SOURCE_MIME_BY_EXT[extWithDot] || '';
  const sourceFileKind = extWithDot === '.pdf'
    ? 'pdf'
    : (sourceMimeType.startsWith('image/') ? 'image' : 'unknown');

  return {
    absoluteFilePath,
    sourceFileExt: extWithDot.startsWith('.') ? extWithDot.slice(1) : extWithDot,
    sourceFileName: path.basename(absoluteFilePath),
    sourceMimeType,
    sourceFileKind,
  };
}

function buildError(code, message, detailsSafeForLogs = {}) {
  return {
    code,
    message,
    detailsSafeForLogs,
  };
}

function buildResult({
  state,
  provenance,
  text = '',
  warnings = [],
  summary = '',
  error = null,
}) {
  return {
    state,
    executedRoute: state === 'precondition_rejected' ? null : 'ocr',
    text,
    warnings,
    summary,
    provenance,
    error,
  };
}

function parseProviderFailure(err) {
  const statusCode = Number(
    err && err.response && err.response.status
      ? err.response.status
      : (typeof err.code === 'number' ? err.code : 0)
  ) || 0;

  const networkErrorCode = typeof err.code === 'string' ? err.code.trim() : '';

  let reasonCode = '';
  let providerMessage = '';
  try {
    const responseData = err && err.response ? err.response.data : null;
    const root = responseData && typeof responseData === 'object' ? responseData.error : null;
    const nested = root && Array.isArray(root.errors) && root.errors.length ? root.errors[0] : null;
    reasonCode = typeof (nested && nested.reason) === 'string'
      ? nested.reason.trim()
      : '';
    providerMessage = typeof (nested && nested.message) === 'string'
      ? nested.message.trim()
      : (typeof (root && root.message) === 'string' ? root.message.trim() : '');
  } catch {
    reasonCode = '';
    providerMessage = '';
  }

  return {
    statusCode,
    reasonCode,
    providerMessage,
    networkErrorCode,
  };
}

function classifyCommonFailure(parsedFailure) {
  const reasonCode = String(parsedFailure.reasonCode || '').trim();
  const statusCode = Number(parsedFailure.statusCode || 0);
  const networkErrorCode = String(parsedFailure.networkErrorCode || '').trim();

  if (networkErrorCode && NETWORK_ERROR_CODES.has(networkErrorCode)) {
    return 'connectivity_failed';
  }
  if (statusCode === 429 || QUOTA_REASON_CODES.has(reasonCode)) {
    return 'quota_or_rate_limited';
  }
  if (SETUP_REASON_CODES.has(reasonCode)) {
    return 'setup_incomplete';
  }
  if (statusCode === 401 || AUTH_REASON_CODES.has(reasonCode)) {
    return 'auth_failed';
  }
  if (statusCode >= 500) {
    return 'connectivity_failed';
  }
  return '';
}

function isRetryableRateLimit(parsedFailure) {
  const reasonCode = String(parsedFailure.reasonCode || '').trim();
  const statusCode = Number(parsedFailure.statusCode || 0);
  return statusCode === 429 || QUOTA_REASON_CODES.has(reasonCode);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function ensureNotAborted(isAborted) {
  if (typeof isAborted === 'function' && isAborted()) {
    const abortError = new Error('Extraction cancelled by user.');
    abortError.code = 'aborted_by_user';
    throw abortError;
  }
}

async function runWithRateLimitRetry({ operationName, log, isAborted, fn }) {
  let attempt = 0;

  while (attempt < MAX_RATE_LIMIT_ATTEMPTS) {
    attempt += 1;
    ensureNotAborted(isAborted);

    try {
      return await fn();
    } catch (err) {
      const parsedFailure = parseProviderFailure(err);
      const retryable = isRetryableRateLimit(parsedFailure);
      if (retryable && attempt < MAX_RATE_LIMIT_ATTEMPTS) {
        const waitMs = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * (2 ** (attempt - 1)));
        log.warn('Retrying OCR operation after rate-limit response:', {
          operationName,
          attempt,
          nextAttemptInMs: waitMs,
          statusCode: parsedFailure.statusCode,
          reasonCode: parsedFailure.reasonCode,
        });
        await sleep(waitMs);
        continue;
      }
      throw err;
    }
  }

  throw new Error(`OCR operation retries exhausted: ${operationName}`);
}

function buildFailureResult({ stage, provenance, parsedFailure, error }) {
  const commonCode = classifyCommonFailure(parsedFailure);
  if (commonCode) {
    return buildResult({
      state: 'failure',
      summary: 'OCR route failed due to provider/runtime constraints.',
      provenance,
      error: buildError(
        commonCode,
        'OCR extraction failed due to auth/quota/connectivity constraints.',
        {
          stage,
          statusCode: parsedFailure.statusCode,
          reasonCode: parsedFailure.reasonCode,
          networkErrorCode: parsedFailure.networkErrorCode,
          providerMessagePresent: !!parsedFailure.providerMessage,
        }
      ),
    });
  }

  return buildResult({
    state: 'failure',
    summary: 'OCR route failed during provider workflow.',
    provenance,
    error: buildError(
      stage === 'export' ? 'ocr_export_failed' : 'ocr_conversion_failed',
      stage === 'export'
        ? 'OCR failed while exporting converted text.'
        : 'OCR failed while uploading/converting source file.',
      {
        stage,
        errorName: toSafeErrorName(error),
        errorMessage: toSafeErrorMessage(error),
      }
    ),
  });
}

// =============================================================================
// Route execution
// =============================================================================

async function runGoogleDriveOcrRoute({
  filePath,
  credentialsPath,
  tokenPath,
  ocrLanguage = '',
  log,
  isAborted,
} = {}) {
  const fileInfo = getFileInfo(filePath);
  const provenance = {
    sourceFileName: fileInfo.sourceFileName,
    sourceFileExt: fileInfo.sourceFileExt,
    sourceFileKind: fileInfo.sourceFileKind,
    ocrProvider: 'google_drive_docs_conversion',
    metadataSafeForLogs: {},
  };

  if (!fileInfo.absoluteFilePath || !fs.existsSync(fileInfo.absoluteFilePath)) {
    return buildResult({
      state: 'failure',
      summary: 'OCR route failed before upload: source file is missing.',
      provenance,
      error: buildError(
        'unreadable_or_corrupt',
        'Selected file is missing or unreadable.',
        {
          stage: 'preflight',
          reason: 'missing_source_file',
        }
      ),
    });
  }

  if (!fileInfo.sourceMimeType) {
    return buildResult({
      state: 'failure',
      summary: 'OCR route blocked: unsupported source format.',
      provenance,
      error: buildError(
        'unsupported_format',
        'Selected file format is not supported by OCR route.',
        {
          stage: 'preflight',
          reason: 'unsupported_extension',
          sourceFileExt: fileInfo.sourceFileExt,
        }
      ),
    });
  }

  let credentialsJson = null;
  let tokenJson = null;

  try {
    credentialsJson = readJsonFile(credentialsPath);
  } catch (err) {
    return buildResult({
      state: 'failure',
      summary: 'OCR route failed before upload: credentials missing or invalid.',
      provenance,
      error: buildError(
        'setup_incomplete',
        'OCR credentials are missing or invalid.',
        {
          stage: 'preflight',
          reason: 'credentials_read_failed',
          errorName: toSafeErrorName(err),
        }
      ),
    });
  }

  try {
    tokenJson = readEncryptedTokenFile(tokenPath);
  } catch (err) {
    return buildResult({
      state: 'failure',
      summary: 'OCR route failed before upload: token missing or invalid.',
      provenance,
      error: buildError(
        'ocr_activation_required',
        'OCR activation is required before running extraction.',
        {
          stage: 'preflight',
          reason: 'token_read_failed',
          tokenReadCode: String(err && err.code ? err.code : ''),
          errorName: toSafeErrorName(err),
        }
      ),
    });
  }

  let oauthClient = null;
  try {
    oauthClient = buildGoogleOAuthClient(credentialsJson, tokenJson);
  } catch (err) {
    return buildResult({
      state: 'failure',
      summary: 'OCR route failed before upload: OAuth client initialization failed.',
      provenance,
      error: buildError(
        'auth_failed',
        'OCR authentication is invalid. Reconnect your account.',
        {
          stage: 'preflight',
          reason: 'oauth_client_init_failed',
          errorName: toSafeErrorName(err),
        }
      ),
    });
  }

  const drive = google.drive({ version: 'v3', auth: oauthClient });
  let tempDocumentId = '';
  let result = null;
  const cleanupWarnings = [];
  let uploadInput = null;

  try {
    ensureNotAborted(isAborted);
    uploadInput = await normalizeImageForOcrUpload({ fileInfo });
    if (uploadInput && uploadInput.metadataSafeForLogs && typeof uploadInput.metadataSafeForLogs === 'object') {
      provenance.metadataSafeForLogs = {
        ...provenance.metadataSafeForLogs,
        ...uploadInput.metadataSafeForLogs,
      };
    }

    const createRequest = {
      requestBody: {
        name: uploadInput && uploadInput.uploadFileName
          ? uploadInput.uploadFileName
          : fileInfo.sourceFileName,
        mimeType: 'application/vnd.google-apps.document',
      },
      media: {
        mimeType: uploadInput && uploadInput.uploadMimeType
          ? uploadInput.uploadMimeType
          : fileInfo.sourceMimeType,
        body: fs.createReadStream(
          uploadInput && uploadInput.uploadFilePath
            ? uploadInput.uploadFilePath
            : fileInfo.absoluteFilePath
        ),
      },
      fields: 'id,name',
    };
    if (typeof ocrLanguage === 'string' && ocrLanguage.trim()) {
      createRequest.ocrLanguage = ocrLanguage.trim();
    }

    const createResponse = await runWithRateLimitRetry({
      operationName: 'upload_convert',
      log,
      isAborted,
      fn: async () => drive.files.create(createRequest),
    });

    tempDocumentId = createResponse && createResponse.data && createResponse.data.id
      ? String(createResponse.data.id)
      : '';
    if (!tempDocumentId) {
      throw new Error('Missing temporary converted document ID.');
    }

    ensureNotAborted(isAborted);

    const exportResponse = await runWithRateLimitRetry({
      operationName: 'export_text',
      log,
      isAborted,
      fn: async () => drive.files.export(
        {
          fileId: tempDocumentId,
          mimeType: 'text/plain',
        },
        { responseType: 'arraybuffer' }
      ),
    });

    ensureNotAborted(isAborted);

    const extractedText = Buffer.from(exportResponse.data || '').toString('utf8');
    const warnings = [];
    if (!extractedText.trim()) {
      warnings.push('empty_extraction');
    }

    result = buildResult({
      state: 'success',
      text: extractedText,
      warnings,
      summary: 'OCR route succeeded.',
      provenance,
      error: null,
    });
  } catch (err) {
    if (String(err && err.code || '') === 'aborted_by_user') {
      result = buildResult({
        state: 'cancelled',
        summary: 'OCR route cancelled by user.',
        provenance,
        error: buildError(
          'aborted_by_user',
          'OCR extraction was cancelled by user.',
          {
            stage: 'runtime',
            reason: 'user_abort',
          }
        ),
      });
    } else if (String(err && err.code || '') === 'image_normalizer_unavailable') {
      result = buildResult({
        state: 'failure',
        summary: 'OCR route failed before upload: image normalizer is unavailable.',
        provenance,
        error: buildError(
          'platform_runtime_failed',
          'OCR preprocessing runtime is unavailable in this app build.',
          {
            stage: 'preflight',
            reason: 'image_normalizer_unavailable',
            errorName: toSafeErrorName(err),
            errorMessage: toSafeErrorMessage(err),
            ...(err && err.detailsSafeForLogs && typeof err.detailsSafeForLogs === 'object'
              ? err.detailsSafeForLogs
              : {}),
          }
        ),
      });
    } else if (String(err && err.code || '') === 'webp_to_png_conversion_failed') {
      result = buildResult({
        state: 'failure',
        summary: 'OCR route failed before upload: WEBP normalization failed.',
        provenance,
        error: buildError(
          'unreadable_or_corrupt',
          'Selected WEBP file could not be converted for OCR upload.',
          {
            stage: 'preflight',
            reason: 'webp_to_png_conversion_failed',
            errorName: toSafeErrorName(err),
            errorMessage: toSafeErrorMessage(err),
            ...(err && err.detailsSafeForLogs && typeof err.detailsSafeForLogs === 'object'
              ? err.detailsSafeForLogs
              : {}),
          }
        ),
      });
    } else {
      const stage = tempDocumentId ? 'export' : 'upload_convert';
      const parsedFailure = parseProviderFailure(err);
      result = buildFailureResult({
        stage,
        provenance,
        parsedFailure,
        error: err,
      });
    }
  } finally {
    if (tempDocumentId) {
      try {
        await runWithRateLimitRetry({
          operationName: 'cleanup_delete_temp_doc',
          log,
          isAborted: () => false,
          fn: async () => drive.files.delete({ fileId: tempDocumentId }),
        });
      } catch (cleanupErr) {
        const parsedCleanupFailure = parseProviderFailure(cleanupErr);
        const cleanupCode = classifyCommonFailure(parsedCleanupFailure) || 'ocr_cleanup_failed';
        cleanupWarnings.push(`cleanup:${cleanupCode}`);
        log.warn('OCR cleanup failed:', {
          tempDocumentId,
          warning: `cleanup:${cleanupCode}`,
          statusCode: parsedCleanupFailure.statusCode,
          reasonCode: parsedCleanupFailure.reasonCode,
          networkErrorCode: parsedCleanupFailure.networkErrorCode,
        });
      }
    }

    if (uploadInput && typeof uploadInput.cleanup === 'function') {
      const warning = uploadInput.cleanup();
      if (warning) {
        cleanupWarnings.push(String(warning));
        log.warn('OCR upload cleanup failed (ignored):', {
          warning: String(warning),
        });
      }
    }
  }

  if (!result) {
    result = buildResult({
      state: 'failure',
      summary: 'OCR route failed unexpectedly.',
      provenance,
      error: buildError(
        'unknown',
        'OCR extraction failed due to an unknown runtime error.',
        {
          stage: 'runtime',
          reason: 'missing_result',
        }
      ),
    });
  }

  if (cleanupWarnings.length > 0) {
    result.warnings = Array.isArray(result.warnings) ? result.warnings : [];
    result.warnings.push(...cleanupWarnings);
    if (result.state === 'success') {
      result.summary = 'OCR route succeeded with cleanup warning.';
    }
  }

  return result;
}

// =============================================================================
// Exports / module surface
// =============================================================================

module.exports = {
  runGoogleDriveOcrRoute,
};

// =============================================================================
// End of electron/import_extract_platform/ocr_google_drive_route.js
// =============================================================================
