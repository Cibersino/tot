// public/js/import_drop.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Resolve dropped file paths across Electron versions.
// - Install file drag/drop handlers on a target element/window.
// - Delegate business logic to callbacks provided by renderer.js.
// =============================================================================
(function initImportDropModule(globalObj) {
  function normalizeDroppedPath(rawValue) {
    if (typeof rawValue !== 'string') return '';
    let normalized = rawValue.trim();
    if (!normalized) return '';
    if (
      (normalized.startsWith('"') && normalized.endsWith('"'))
      || (normalized.startsWith('\'') && normalized.endsWith('\''))
    ) {
      normalized = normalized.slice(1, -1).trim();
    }
    return normalized;
  }

  function decodeFileUrlToLocalPath(rawUrl) {
    const normalizedUrl = normalizeDroppedPath(rawUrl);
    if (!normalizedUrl || !/^file:\/\//i.test(normalizedUrl)) return '';
    try {
      const parsed = new URL(normalizedUrl);
      if (String(parsed.protocol || '').toLowerCase() !== 'file:') return '';
      const host = String(parsed.hostname || '').trim();
      let pathname = decodeURIComponent(String(parsed.pathname || ''));
      if (host) {
        return `\\\\${host}${pathname.replace(/\//g, '\\')}`;
      }
      if (/^\/[a-zA-Z]:\//.test(pathname)) pathname = pathname.slice(1);
      return pathname.replace(/\//g, '\\');
    } catch {
      return '';
    }
  }

  function hasFileDragPayload(event) {
    const dt = event && event.dataTransfer;
    if (!dt) return false;
    if (dt.files && dt.files.length > 0) return true;
    const types = dt.types ? Array.from(dt.types).map((item) => String(item || '')) : [];
    return types.includes('Files') || types.includes('text/uri-list');
  }

  function resolveDroppedFilePathFromBridge(fileObj, electronAPI, logger) {
    if (!electronAPI || typeof electronAPI.getPathForDroppedFile !== 'function') return '';
    try {
      return normalizeDroppedPath(electronAPI.getPathForDroppedFile(fileObj));
    } catch (err) {
      if (logger && typeof logger.warnOnce === 'function') {
        logger.warnOnce(
          'import-drop.resolvePath.bridge.failed',
          'Failed to resolve dropped file path from preload bridge (falling back):',
          err
        );
      }
      return '';
    }
  }

  function extractPathFromUriList(rawUriList) {
    const uriList = typeof rawUriList === 'string' ? rawUriList : '';
    if (!uriList.trim()) return '';
    const lines = uriList
      .split(/\r?\n/)
      .map((line) => normalizeDroppedPath(line))
      .filter((line) => line && !line.startsWith('#'));
    for (let i = 0; i < lines.length; i += 1) {
      const candidate = lines[i];
      const fromFileUrl = decodeFileUrlToLocalPath(candidate);
      if (fromFileUrl) return fromFileUrl;
      if (/^[a-zA-Z]:[\\/]/.test(candidate) || /^\\\\/.test(candidate)) return candidate;
    }
    return '';
  }

  function extractPathFromTextPayload(rawText) {
    const text = typeof rawText === 'string' ? rawText : '';
    if (!text.trim()) return '';
    const firstLine = normalizeDroppedPath(text.split(/\r?\n/)[0] || '');
    if (!firstLine) return '';
    const fromFileUrl = decodeFileUrlToLocalPath(firstLine);
    if (fromFileUrl) return fromFileUrl;
    if (/^[a-zA-Z]:[\\/]/.test(firstLine) || /^\\\\/.test(firstLine)) return firstLine;
    return '';
  }

  function extractDroppedFilePath(event, { electronAPI, logger } = {}) {
    const dt = event && event.dataTransfer;
    if (!dt) return '';

    if (dt.files && dt.files.length > 0) {
      const firstFile = dt.files[0];
      const firstPath = firstFile && typeof firstFile.path === 'string' ? firstFile.path.trim() : '';
      if (firstPath) return firstPath;
      const bridgePath = resolveDroppedFilePathFromBridge(firstFile, electronAPI, logger);
      if (bridgePath) return bridgePath;
    }

    if (dt.items && dt.items.length > 0) {
      for (let i = 0; i < dt.items.length; i += 1) {
        const item = dt.items[i];
        if (!item || item.kind !== 'file' || typeof item.getAsFile !== 'function') continue;
        const file = item.getAsFile();
        const candidatePath = file && typeof file.path === 'string' ? file.path.trim() : '';
        if (candidatePath) return candidatePath;
        const bridgePath = resolveDroppedFilePathFromBridge(file, electronAPI, logger);
        if (bridgePath) return bridgePath;
      }
    }

    const uriListPath = extractPathFromUriList(
      (dt.getData && typeof dt.getData === 'function')
        ? dt.getData('text/uri-list')
        : ''
    );
    if (uriListPath) return uriListPath;

    const textPath = extractPathFromTextPayload(
      (dt.getData && typeof dt.getData === 'function')
        ? dt.getData('text/plain')
        : ''
    );
    if (textPath) return textPath;

    return '';
  }

  function installFileDropHandler(options = {}) {
    const opts = options && typeof options === 'object' ? options : {};
    const target = opts.target && typeof opts.target.addEventListener === 'function'
      ? opts.target
      : globalObj;
    if (!target || typeof target.addEventListener !== 'function') {
      return () => {};
    }

    const guardUserAction = typeof opts.guardUserAction === 'function'
      ? opts.guardUserAction
      : (() => true);
    const onResolvedPath = typeof opts.onResolvedPath === 'function'
      ? opts.onResolvedPath
      : null;
    if (!onResolvedPath) {
      throw new Error('[import-drop] onResolvedPath callback is required');
    }
    const onInvalidPath = typeof opts.onInvalidPath === 'function'
      ? opts.onInvalidPath
      : (() => {});
    const onUnhandledError = typeof opts.onUnhandledError === 'function'
      ? opts.onUnhandledError
      : (() => {});
    const electronAPI = opts.electronAPI && typeof opts.electronAPI === 'object'
      ? opts.electronAPI
      : globalObj.electronAPI;
    const logger = opts.logger || null;

    const onDragOver = (event) => {
      if (!hasFileDragPayload(event)) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
    };

    const onDrop = async (event) => {
      if (!hasFileDragPayload(event)) return;
      event.preventDefault();
      event.stopPropagation();
      if (!guardUserAction()) return;

      try {
        const droppedPath = extractDroppedFilePath(event, { electronAPI, logger });
        if (!droppedPath) {
          onInvalidPath();
          return;
        }
        await onResolvedPath(droppedPath, event);
      } catch (err) {
        onUnhandledError(err);
      }
    };

    target.addEventListener('dragover', onDragOver);
    target.addEventListener('drop', onDrop);

    return () => {
      try {
        target.removeEventListener('dragover', onDragOver);
        target.removeEventListener('drop', onDrop);
      } catch {
        // no-op
      }
    };
  }

  globalObj.ImportDrop = Object.freeze({
    installFileDropHandler,
  });
})(window);
