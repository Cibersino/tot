'use strict';

const { BrowserWindow } = require('electron');
const Log = require('../log');
const { validateGoogleDriveOcrSetup } = require('./ocr_google_drive_setup_validation');

const log = Log.get('import-extract-ocr-gate');

const OCR_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp']);
const OCR_ELIGIBLE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'bmp', 'pdf']);

function getFileExtensionLowercase(filePath) {
  const normalizedPath = typeof filePath === 'string' ? filePath.trim() : '';
  if (!normalizedPath) return '';
  const lastSeparator = Math.max(normalizedPath.lastIndexOf('/'), normalizedPath.lastIndexOf('\\'));
  const fileName = lastSeparator >= 0 ? normalizedPath.slice(lastSeparator + 1) : normalizedPath;
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === (fileName.length - 1)) return '';
  return fileName.slice(lastDot + 1).toLowerCase();
}

function classifyFileForOcr(filePath) {
  const ext = getFileExtensionLowercase(filePath);
  if (ext === 'pdf') {
    return {
      sourceFileExt: ext,
      sourceFileKind: 'pdf',
      ocrEligible: true,
    };
  }
  if (OCR_IMAGE_EXTENSIONS.has(ext)) {
    return {
      sourceFileExt: ext,
      sourceFileKind: 'image',
      ocrEligible: true,
    };
  }
  return {
    sourceFileExt: ext,
    sourceFileKind: 'text_document',
    ocrEligible: OCR_ELIGIBLE_EXTENSIONS.has(ext),
  };
}

function resolvePayload(payload) {
  const raw = payload && typeof payload === 'object' ? payload : {};
  return {
    filePath: typeof raw.filePath === 'string' ? raw.filePath.trim() : '',
  };
}

function buildRestrictedResult(fileInfo) {
  return {
    ok: true,
    canProceed: false,
    ocrSetupState: 'not_checked',
    blockCategory: 'restricted',
    alertKey: 'renderer.alerts.import_extract_ocr_restricted',
    sourceFileExt: fileInfo.sourceFileExt,
    sourceFileKind: fileInfo.sourceFileKind,
    code: 'ocr_unavailable',
    issueType: 'restriction',
  };
}

function mapValidationBlock(validationResult, fileInfo) {
  const state = validationResult && typeof validationResult.state === 'string'
    ? validationResult.state
    : 'failure';
  const code = validationResult && validationResult.error && typeof validationResult.error.code === 'string'
    ? validationResult.error.code
    : 'unknown';
  const issueType = validationResult && validationResult.error && typeof validationResult.error.issueType === 'string'
    ? validationResult.error.issueType
    : 'unknown';

  if (state === 'ocr_activation_required' || code === 'ocr_activation_required') {
    return {
      ok: true,
      canProceed: false,
      ocrSetupState: 'ocr_activation_required',
      blockCategory: 'not_activated',
      alertKey: 'renderer.alerts.import_extract_ocr_activation_required',
      sourceFileExt: fileInfo.sourceFileExt,
      sourceFileKind: fileInfo.sourceFileKind,
      code,
      issueType,
    };
  }

  if (code === 'quota_or_rate_limited') {
    return {
      ok: true,
      canProceed: false,
      ocrSetupState: state,
      blockCategory: 'quota_or_rate',
      alertKey: 'renderer.alerts.import_extract_ocr_quota_or_rate_limited',
      sourceFileExt: fileInfo.sourceFileExt,
      sourceFileKind: fileInfo.sourceFileKind,
      code,
      issueType,
    };
  }

  return {
    ok: true,
    canProceed: false,
    ocrSetupState: state,
    blockCategory: 'unavailable',
    alertKey: 'renderer.alerts.import_extract_ocr_unavailable',
    sourceFileExt: fileInfo.sourceFileExt,
    sourceFileKind: fileInfo.sourceFileKind,
    code,
    issueType,
  };
}

function buildUnexpectedFailureResult(fileInfo, errorMessage) {
  return {
    ok: false,
    canProceed: false,
    ocrSetupState: 'failure',
    blockCategory: 'unavailable',
    alertKey: 'renderer.alerts.import_extract_ocr_unavailable',
    sourceFileExt: fileInfo.sourceFileExt,
    sourceFileKind: fileInfo.sourceFileKind,
    code: 'platform_runtime_failed',
    issueType: 'platform_runtime',
    errorMessage,
  };
}

function isAuthorizedSender(event, mainWin) {
  try {
    const senderWin = event && event.sender
      ? BrowserWindow.fromWebContents(event.sender)
      : null;
    if (!mainWin || senderWin !== mainWin) {
      log.warnOnce(
        'import_extract_ocr_gate.unauthorized',
        'import-extract-evaluate-ocr-gate unauthorized (ignored).'
      );
      return false;
    }
    return true;
  } catch (err) {
    log.warn('import-extract-evaluate-ocr-gate sender validation failed:', err);
    return false;
  }
}

function registerIpc(ipcMain, { getWindows, resolvePaths } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[import_extract_ocr_gate] registerIpc requires ipcMain');
  }
  if (typeof resolvePaths !== 'function') {
    throw new Error('[import_extract_ocr_gate] registerIpc requires resolvePaths()');
  }

  const resolveMainWin = () => {
    if (typeof getWindows === 'function') {
      const windows = getWindows() || {};
      return windows.mainWin || null;
    }
    return null;
  };

  ipcMain.handle('import-extract-evaluate-ocr-gate', async (event, payload = {}) => {
    const { filePath } = resolvePayload(payload);
    const fileInfo = classifyFileForOcr(filePath);

    try {
      const mainWin = resolveMainWin();
      if (!isAuthorizedSender(event, mainWin)) {
        return {
          ok: false,
          canProceed: false,
          ocrSetupState: 'failure',
          blockCategory: 'unavailable',
          alertKey: 'renderer.alerts.import_extract_ocr_unavailable',
          sourceFileExt: fileInfo.sourceFileExt,
          sourceFileKind: fileInfo.sourceFileKind,
          code: 'unauthorized',
          issueType: 'platform_runtime',
        };
      }

      if (!fileInfo.ocrEligible) {
        const restricted = buildRestrictedResult(fileInfo);
        log.warn('import/extract OCR gate blocked:', restricted);
        return restricted;
      }

      const paths = resolvePaths();
      const validation = await validateGoogleDriveOcrSetup({
        credentialsPath: paths.credentialsPath,
        tokenPath: paths.tokenPath,
        probeApiPath: true,
      });

      if (validation && validation.ok === true) {
        const ready = {
          ok: true,
          canProceed: true,
          ocrSetupState: 'ready',
          blockCategory: '',
          alertKey: '',
          sourceFileExt: fileInfo.sourceFileExt,
          sourceFileKind: fileInfo.sourceFileKind,
          code: '',
          issueType: '',
        };
        log.info('import/extract OCR gate ready:', ready);
        return ready;
      }

      const blocked = mapValidationBlock(validation, fileInfo);
      log.warn('import/extract OCR gate blocked:', blocked);
      return blocked;
    } catch (err) {
      const failure = buildUnexpectedFailureResult(
        fileInfo,
        String(err && err.message ? err.message : err || '')
      );
      log.error('import/extract OCR gate failed unexpectedly:', {
        ...failure,
      });
      return failure;
    }
  });
}

module.exports = {
  registerIpc,
};
