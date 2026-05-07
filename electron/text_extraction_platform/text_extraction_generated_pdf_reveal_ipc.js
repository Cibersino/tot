// electron/text_extraction_platform/text_extraction_generated_pdf_reveal_ipc.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-process IPC wrapper for revealing retained generated PDF artifacts.
// Responsibilities:
// - Authorize the sender against the main window before revealing any file.
// - Restrict reveal requests to files inside the app-owned generated-PDF root.
// - Reject missing or invalid retained-artifact paths with structured responses.
// - Delegate the actual reveal action to the injected shell API.

// =============================================================================
// Imports / logger
// =============================================================================

const fs = require('fs');
const path = require('path');
const Log = require('../log');
const {
  isAuthorizedSender,
} = require('./text_extraction_prepare_execute_core');

const log = Log.get('text-extraction-generated-pdf-reveal-ipc');

// =============================================================================
// Helpers
// =============================================================================

function resolveRevealPayload(rawPayload = {}) {
  const payload = rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
    ? rawPayload
    : {};
  return {
    artifactPath: typeof payload.artifactPath === 'string' ? payload.artifactPath.trim() : '',
  };
}

function isPathInsideRoot(targetPath, rootPath) {
  const relativePath = path.relative(rootPath, targetPath);
  return !!relativePath
    && !relativePath.startsWith('..')
    && !path.isAbsolute(relativePath);
}

function resolveRealPathOrFallback(candidatePath) {
  try {
    return fs.realpathSync(candidatePath);
  } catch (_err) {
    return path.resolve(candidatePath);
  }
}

// =============================================================================
// IPC registration / handler
// =============================================================================

function registerIpc(ipcMain, { getWindows, resolvePaths, shellApi } = {}) {
  if (!ipcMain || typeof ipcMain.handle !== 'function') {
    throw new Error('[text_extraction_generated_pdf_reveal_ipc] registerIpc requires ipcMain');
  }
  if (typeof getWindows !== 'function') {
    throw new Error('[text_extraction_generated_pdf_reveal_ipc] registerIpc requires getWindows()');
  }
  if (typeof resolvePaths !== 'function') {
    throw new Error('[text_extraction_generated_pdf_reveal_ipc] registerIpc requires resolvePaths()');
  }
  if (!shellApi || typeof shellApi.showItemInFolder !== 'function') {
    throw new Error('[text_extraction_generated_pdf_reveal_ipc] registerIpc requires shellApi.showItemInFolder()');
  }

  const resolveMainWin = () => {
    const windows = getWindows() || {};
    return windows.mainWin || null;
  };

  ipcMain.handle('text-extraction-reveal-generated-pdf', async (event, rawPayload = {}) => {
    const payload = resolveRevealPayload(rawPayload);

    try {
      const mainWin = resolveMainWin();
      if (!isAuthorizedSender(event, mainWin, log, 'text-extraction-reveal-generated-pdf')) {
        return { ok: false, code: 'UNAUTHORIZED' };
      }

      if (!payload.artifactPath) {
        return { ok: false, code: 'INVALID_ARTIFACT_PATH' };
      }

      const paths = resolvePaths() || {};
      const generatedPdfArtifactsDir = typeof paths.generatedPdfArtifactsDir === 'string'
        ? paths.generatedPdfArtifactsDir.trim()
        : '';
      if (!generatedPdfArtifactsDir) {
        log.error('Generated PDF artifacts root unavailable; reveal request rejected.');
        return { ok: false, code: 'REVEAL_GENERATED_PDF_FAILED' };
      }

      const resolvedAllowedRoot = resolveRealPathOrFallback(generatedPdfArtifactsDir);
      const resolvedArtifactPath = resolveRealPathOrFallback(payload.artifactPath);
      if (!isPathInsideRoot(resolvedArtifactPath, resolvedAllowedRoot)) {
        log.warn('Generated PDF reveal rejected for path outside allowed root:', {
          allowedRoot: resolvedAllowedRoot,
          artifactPath: resolvedArtifactPath,
        });
        return { ok: false, code: 'ARTIFACT_OUTSIDE_ALLOWED_ROOT' };
      }

      let artifactStats = null;
      try {
        artifactStats = fs.statSync(resolvedArtifactPath);
      } catch (_err) {
        return { ok: false, code: 'ARTIFACT_MISSING' };
      }
      if (!artifactStats.isFile()) {
        return { ok: false, code: 'ARTIFACT_MISSING' };
      }

      shellApi.showItemInFolder(resolvedArtifactPath);
      return { ok: true };
    } catch (err) {
      log.error('text-extraction-reveal-generated-pdf failed unexpectedly:', err);
      return { ok: false, code: 'REVEAL_GENERATED_PDF_FAILED' };
    }
  });
}

// =============================================================================
// Module surface
// =============================================================================

module.exports = {
  registerIpc,
};

// =============================================================================
// End of electron/text_extraction_platform/text_extraction_generated_pdf_reveal_ipc.js
// =============================================================================
