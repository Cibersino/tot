// electron/import_extract_platform/ocr_google_drive_provider_failure.js
'use strict';

const Log = require('../log');

const log = Log.get('ocr-google-drive-provider-failure');

const PROVIDER_API_DISABLED_CODE = 'provider_api_disabled';
const OTHER_REASON_CATEGORY = 'other';

const ERRORS_REASON_TO_CATEGORY = Object.freeze({
  accessNotConfigured: PROVIDER_API_DISABLED_CODE,
});

const ERROR_INFO_REASON_TO_CATEGORY = Object.freeze({
  API_DISABLED: PROVIDER_API_DISABLED_CODE,
  SERVICE_DISABLED: PROVIDER_API_DISABLED_CODE,
});

function hasNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function normalizeReasonCategory(reason, categoryMap) {
  const normalizedReason = hasNonEmptyString(reason) ? String(reason).trim() : '';
  if (!normalizedReason) return '';
  return categoryMap[normalizedReason] || OTHER_REASON_CATEGORY;
}

function isGoogleErrorInfoType(typeName) {
  const normalizedType = hasNonEmptyString(typeName) ? String(typeName).trim().toLowerCase() : '';
  return normalizedType.includes('google.rpc.errorinfo');
}

function extractErrorInfoSignal(details) {
  if (!Array.isArray(details)) {
    return {
      errorInfoReason: '',
      providerService: '',
      providerConsumer: '',
    };
  }

  for (const detail of details) {
    if (!detail || typeof detail !== 'object') continue;
    if (!isGoogleErrorInfoType(detail['@type'])) continue;

    const metadata = detail.metadata && typeof detail.metadata === 'object' ? detail.metadata : {};
    const errorInfoReason = hasNonEmptyString(detail.reason) ? String(detail.reason).trim() : '';
    const providerService = hasNonEmptyString(metadata.service) ? String(metadata.service).trim() : '';
    const providerConsumer = hasNonEmptyString(metadata.consumer) ? String(metadata.consumer).trim() : '';

    if (!errorInfoReason && !providerService && !providerConsumer) continue;

    return {
      errorInfoReason,
      providerService,
      providerConsumer,
    };
  }

  return {
    errorInfoReason: '',
    providerService: '',
    providerConsumer: '',
  };
}

function parseGoogleProviderFailurePayload(rawBody) {
  if (!rawBody) {
    return {
      errorsReason: '',
      errorInfoReason: '',
      providerMessage: '',
      providerStatus: '',
      providerService: '',
      providerConsumer: '',
    };
  }

  if (typeof rawBody === 'string') {
    if (!hasNonEmptyString(rawBody)) {
      return parseGoogleProviderFailurePayload(null);
    }
    try {
      return parseGoogleProviderFailurePayload(JSON.parse(rawBody));
    } catch {
      return parseGoogleProviderFailurePayload(null);
    }
  }

  if (typeof rawBody !== 'object') {
    return parseGoogleProviderFailurePayload(null);
  }

  const root = rawBody && typeof rawBody.error === 'object'
    ? rawBody.error
    : rawBody;
  if (!root || typeof root !== 'object') {
    return parseGoogleProviderFailurePayload(null);
  }

  const nested = Array.isArray(root.errors) && root.errors.length ? root.errors[0] : null;
  const errorsReason = nested && hasNonEmptyString(nested.reason) ? String(nested.reason).trim() : '';
  const providerMessage = nested && hasNonEmptyString(nested.message)
    ? String(nested.message).trim()
    : (hasNonEmptyString(root.message) ? String(root.message).trim() : '');
  const providerStatus = hasNonEmptyString(root.status) ? String(root.status).trim() : '';
  const errorInfo = extractErrorInfoSignal(root.details);

  return {
    errorsReason,
    errorInfoReason: errorInfo.errorInfoReason,
    providerMessage,
    providerStatus,
    providerService: errorInfo.providerService,
    providerConsumer: errorInfo.providerConsumer,
  };
}

function classifyGoogleProviderReasons({ errorsReason, errorInfoReason } = {}) {
  const errorsCategory = normalizeReasonCategory(errorsReason, ERRORS_REASON_TO_CATEGORY);
  const errorInfoCategory = normalizeReasonCategory(errorInfoReason, ERROR_INFO_REASON_TO_CATEGORY);
  const hasErrorsReason = hasNonEmptyString(errorsReason);
  const hasErrorInfoReason = hasNonEmptyString(errorInfoReason);
  const reasonConflict = hasErrorsReason && hasErrorInfoReason && errorsCategory !== errorInfoCategory;

  let normalizedCategory = '';
  if (errorInfoCategory === PROVIDER_API_DISABLED_CODE) {
    normalizedCategory = PROVIDER_API_DISABLED_CODE;
  } else if (errorsCategory === PROVIDER_API_DISABLED_CODE
    && (!hasErrorInfoReason || errorInfoCategory === OTHER_REASON_CATEGORY)) {
    normalizedCategory = PROVIDER_API_DISABLED_CODE;
  }

  return {
    normalizedCategory,
    reasonConflict,
    errorsCategory,
    errorInfoCategory,
  };
}

function parseGoogleProviderFailure(err, fallbackMessage = '') {
  const statusCode = Number(
    err && err.response && err.response.status
      ? err.response.status
      : (typeof err.code === 'number' ? err.code : 0)
  ) || 0;
  const networkErrorCode = hasNonEmptyString(err && err.code) ? String(err.code).trim() : '';
  const parsed = parseGoogleProviderFailurePayload(err && err.response ? err.response.data : null);
  const classified = classifyGoogleProviderReasons({
    errorsReason: parsed.errorsReason,
    errorInfoReason: parsed.errorInfoReason,
  });

  if (classified.reasonConflict) {
    const conflictKey = `provider_reason_conflict.${classified.errorsCategory || 'none'}.${classified.errorInfoCategory || 'none'}`;
    log.warnOnce(conflictKey, 'Conflicting Google provider failure reasons detected:', {
      errorsReason: parsed.errorsReason,
      errorInfoReason: parsed.errorInfoReason,
      providerStatus: parsed.providerStatus,
      providerService: parsed.providerService,
      providerConsumer: parsed.providerConsumer,
    });
  }

  return {
    statusCode,
    networkErrorCode,
    errorsReason: parsed.errorsReason,
    errorInfoReason: parsed.errorInfoReason,
    providerMessage: hasNonEmptyString(parsed.providerMessage) ? parsed.providerMessage : String(fallbackMessage || ''),
    providerStatus: parsed.providerStatus,
    providerService: parsed.providerService,
    providerConsumer: parsed.providerConsumer,
    normalizedCategory: classified.normalizedCategory,
    reasonConflict: classified.reasonConflict,
  };
}

module.exports = {
  PROVIDER_API_DISABLED_CODE,
  parseGoogleProviderFailure,
};
