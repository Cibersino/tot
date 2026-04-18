// electron/editor_find_session.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Stateful find/search session for the editor native find UI.

// =============================================================================
// Constants
// =============================================================================
const REPLACE_PIPELINE_TIMEOUT_MS = 4000;

// =============================================================================
// Factory
// =============================================================================
function createSession({
  log,
  state,
  clampFindInputText,
  resolveEditorWindow,
  publishState,
} = {}) {
  if (!log) {
    throw new Error('[editor-find-session] createSession requires log');
  }
  if (!state || typeof state !== 'object') {
    throw new Error('[editor-find-session] createSession requires state');
  }
  if (typeof clampFindInputText !== 'function') {
    throw new Error('[editor-find-session] createSession requires clampFindInputText');
  }
  if (typeof resolveEditorWindow !== 'function') {
    throw new Error('[editor-find-session] createSession requires resolveEditorWindow');
  }
  if (typeof publishState !== 'function') {
    throw new Error('[editor-find-session] createSession requires publishState');
  }

  let pendingResyncRequestId = null;
  let pendingSearchWait = null;
  let pendingEditorReplace = null;

  function hasQuery() {
    return state.query.length > 0;
  }

  function clearPendingResyncRequest() {
    pendingResyncRequestId = null;
  }

  function clearStateOnly() {
    state.query = '';
    state.requestId = null;
    state.matches = 0;
    state.activeMatchOrdinal = 0;
    state.finalUpdate = true;
    state.busy = false;
    pendingResyncRequestId = null;
  }

  function clearSearch({ clearSelection = true } = {}) {
    const editorWin = resolveEditorWindow();
    if (clearSelection && editorWin) {
      try {
        editorWin.webContents.stopFindInPage('clearSelection');
      } catch (err) {
        log.warnOnce(
          'editorFind.stopFind.clearSelection',
          "stopFindInPage('clearSelection') failed (ignored):",
          err
        );
      }
    }

    clearStateOnly();
    publishState();
  }

  function runFind(options) {
    const editorWin = resolveEditorWindow();
    if (!editorWin) {
      log.warnOnce(
        'editorFind.runFind.noEditor',
        'runFind ignored: editor window unavailable.'
      );
      return { ok: false, error: 'editor window unavailable' };
    }

    try {
      const requestId = editorWin.webContents.findInPage(state.query, options);
      state.requestId = requestId;
      return { ok: true, requestId };
    } catch (err) {
      log.error('Error calling webContents.findInPage:', err);
      return { ok: false, error: String(err) };
    }
  }

  function setQuery(rawQuery) {
    if (state.busy) {
      return { ok: true, skipped: 'busy' };
    }

    const nextQuery = clampFindInputText(rawQuery);
    state.query = nextQuery;

    if (!hasQuery()) {
      clearSearch({ clearSelection: true });
      return { ok: true };
    }

    state.matches = 0;
    state.activeMatchOrdinal = 0;
    state.finalUpdate = false;
    publishState();

    const res = runFind({
      forward: true,
      findNext: true,
      matchCase: false,
    });
    if (!res.ok) return res;
    return { ok: true, requestId: res.requestId };
  }

  function navigate(forward) {
    if (state.busy) {
      return { ok: true, skipped: 'busy' };
    }

    if (!hasQuery()) {
      return { ok: true, skipped: 'empty query' };
    }

    pendingResyncRequestId = null;
    state.finalUpdate = false;
    publishState();

    const res = runFind({
      forward: !!forward,
      findNext: false,
      matchCase: false,
    });
    if (!res.ok) return res;
    return { ok: true, requestId: res.requestId };
  }

  function handleFoundInPage(result) {
    if (!result || typeof result !== 'object') return;

    const requestId = Number(result.requestId);
    if (state.requestId !== null && Number.isFinite(requestId) && requestId !== state.requestId) {
      return;
    }

    const matches = Number(result.matches);
    const active = Number(result.activeMatchOrdinal);
    state.matches = Number.isFinite(matches) && matches > 0 ? Math.floor(matches) : 0;
    state.activeMatchOrdinal = Number.isFinite(active) && active > 0 ? Math.floor(active) : 0;
    state.finalUpdate = !!result.finalUpdate;
    if (
      pendingResyncRequestId !== null &&
      Number.isFinite(requestId) &&
      requestId === pendingResyncRequestId &&
      result.finalUpdate === true
    ) {
      pendingResyncRequestId = null;
    }

    if (
      pendingSearchWait &&
      Number.isFinite(requestId) &&
      requestId === pendingSearchWait.requestId &&
      result.finalUpdate === true
    ) {
      const { timeoutId, resolve } = pendingSearchWait;
      pendingSearchWait = null;
      clearTimeout(timeoutId);
      resolve({
        ok: true,
        status: 'completed',
        requestId,
        matches: state.matches,
        activeMatchOrdinal: state.activeMatchOrdinal,
      });
    }

    publishState();
  }

  function setBusy(busy, { publish = true } = {}) {
    const nextBusy = !!busy;
    const changed = state.busy !== nextBusy;
    state.busy = nextBusy;

    if (changed && publish) {
      publishState();
    }

    return changed;
  }

  function clearPendingSearchWait(status = 'aborted') {
    if (!pendingSearchWait) return;

    const { timeoutId, resolve } = pendingSearchWait;
    pendingSearchWait = null;

    try {
      clearTimeout(timeoutId);
    } catch {
      // ignore timeout cleanup failure
    }

    try {
      resolve({ ok: false, status });
    } catch {
      // ignore resolve failure
    }
  }

  function waitForSearchCompletion(requestId, timeoutMs = REPLACE_PIPELINE_TIMEOUT_MS) {
    clearPendingSearchWait('superseded');

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        if (!pendingSearchWait || pendingSearchWait.requestId !== requestId) return;
        pendingSearchWait = null;
        log.warn('findInPage completion timed out (ignored):', requestId);
        resolve({ ok: false, status: 'timeout' });
      }, timeoutMs);

      pendingSearchWait = { requestId, resolve, timeoutId };
    });
  }

  function clearPendingEditorReplace(status = 'aborted') {
    if (!pendingEditorReplace) return;

    const { timeoutId, resolve, operation } = pendingEditorReplace;
    pendingEditorReplace = null;

    try {
      clearTimeout(timeoutId);
    } catch {
      // ignore timeout cleanup failure
    }

    try {
      resolve({
        ok: false,
        status,
        operation: operation || 'replace-current',
        replacements: 0,
        error: '',
      });
    } catch {
      // ignore resolve failure
    }
  }

  function requestEditorReplace(operation, payload) {
    clearPendingEditorReplace('superseded');

    const editorWin = resolveEditorWindow();
    if (!editorWin) {
      log.warn('editor-replace-request skipped (ignored): editor window unavailable.', operation);
      return Promise.resolve({
        ok: false,
        status: 'editor-window-unavailable',
        operation,
        replacements: 0,
        error: 'editor window unavailable',
      });
    }

    return new Promise((resolve) => {
      const requestId = Date.now() + Math.floor(Math.random() * 1000);
      const timeoutId = setTimeout(() => {
        if (!pendingEditorReplace || pendingEditorReplace.requestId !== requestId) return;
        pendingEditorReplace = null;
        log.warn('editor-replace-request timed out (ignored):', operation);
        resolve({
          ok: false,
          status: 'timeout',
          operation,
          replacements: 0,
          error: 'editor replace request timed out',
        });
      }, REPLACE_PIPELINE_TIMEOUT_MS);

      pendingEditorReplace = {
        requestId,
        operation,
        resolve,
        timeoutId,
      };

      try {
        editorWin.webContents.send('editor-replace-request', {
          requestId,
          operation,
          query: String(payload && payload.query ? payload.query : ''),
          replacement: String(payload && payload.replacement ? payload.replacement : ''),
          matchCase: !!(payload && payload.matchCase),
        });
      } catch (err) {
        pendingEditorReplace = null;
        clearTimeout(timeoutId);
        log.warn('editor-replace-request send failed (ignored):', operation, err);
        resolve({
          ok: false,
          status: 'send-failed',
          operation,
          replacements: 0,
          error: String(err),
        });
      }
    });
  }

  function rerunCurrentQueryOnCurrentText() {
    if (!hasQuery()) {
      pendingResyncRequestId = null;
      return { ok: true, skipped: 'empty query' };
    }

    state.matches = 0;
    state.activeMatchOrdinal = 0;
    state.finalUpdate = false;
    publishState();

    const res = runFind({
      forward: true,
      findNext: true,
      matchCase: false,
    });
    if (!res.ok) {
      state.finalUpdate = true;
      publishState();
      pendingResyncRequestId = null;
      return res;
    }

    pendingResyncRequestId = res.requestId;
    return { ok: true, requestId: res.requestId };
  }

  async function refreshFindAfterReplaceAction(warnKey, warnLabel) {
    if (!hasQuery()) return;

    const refresh = rerunCurrentQueryOnCurrentText();
    if (refresh.ok && refresh.requestId) {
      const refreshResult = await waitForSearchCompletion(refresh.requestId);
      if (!refreshResult.ok) {
        log.warnOnce(
          warnKey,
          `${warnLabel} refresh search did not complete cleanly (ignored):`,
          refreshResult.status
        );
      }
    }
  }

  async function replaceCurrent(rawReplacement) {
    if (state.busy) {
      return {
        ok: true,
        status: 'busy',
        operation: 'replace-current',
        replacements: 0,
      };
    }

    if (!hasQuery()) {
      return {
        ok: true,
        status: 'noop-empty-query',
        operation: 'replace-current',
        replacements: 0,
      };
    }

    const replacement = clampFindInputText(rawReplacement);
    const editorWin = resolveEditorWindow();
    if (!editorWin) {
      log.warn('replace-current ignored: editor window unavailable.');
      return {
        ok: false,
        status: 'editor-window-unavailable',
        operation: 'replace-current',
        replacements: 0,
        error: 'editor window unavailable',
      };
    }

    let stoppedFindSelection = false;
    setBusy(true);

    try {
      const resync = rerunCurrentQueryOnCurrentText();
      if (!resync.ok || !resync.requestId) {
        return {
          ok: false,
          status: 'resync-start-failed',
          operation: 'replace-current',
          replacements: 0,
          error: resync.error || 'replace re-sync start failed',
        };
      }

      const resyncResult = await waitForSearchCompletion(resync.requestId);
      if (!resyncResult.ok) {
        return {
          ok: false,
          status: resyncResult.status || 'resync-failed',
          operation: 'replace-current',
          replacements: 0,
          error: '',
        };
      }

      if (!Number.isFinite(resyncResult.matches) || resyncResult.matches <= 0) {
        return {
          ok: true,
          status: 'noop-no-matches',
          operation: 'replace-current',
          replacements: 0,
        };
      }

      try {
        editorWin.webContents.stopFindInPage('keepSelection');
        stoppedFindSelection = true;
      } catch (err) {
        log.warn("replace-current stopFindInPage('keepSelection') failed (ignored):", err);
        return {
          ok: false,
          status: 'keep-selection-failed',
          operation: 'replace-current',
          replacements: 0,
          error: String(err),
        };
      }

      return requestEditorReplace('replace-current', {
        query: state.query,
        replacement,
        matchCase: false,
      });
    } finally {
      if (stoppedFindSelection) {
        await refreshFindAfterReplaceAction(
          'editorFind.replaceCurrent.refresh',
          'replace-current'
        );
      }

      setBusy(false);
    }
  }

  async function replaceAll(rawReplacement) {
    if (state.busy) {
      return {
        ok: true,
        status: 'busy',
        operation: 'replace-all',
        replacements: 0,
      };
    }

    if (!hasQuery()) {
      return {
        ok: true,
        status: 'noop-empty-query',
        operation: 'replace-all',
        replacements: 0,
      };
    }

    if (!state.replaceAllAllowedByLength) {
      return {
        ok: true,
        status: 'noop-length-disallowed',
        operation: 'replace-all',
        replacements: 0,
      };
    }

    const replacement = clampFindInputText(rawReplacement);
    if (!resolveEditorWindow()) {
      log.warn('replace-all ignored: editor window unavailable.');
      return {
        ok: false,
        status: 'editor-window-unavailable',
        operation: 'replace-all',
        replacements: 0,
        error: 'editor window unavailable',
      };
    }

    let shouldRefresh = false;
    setBusy(true);

    try {
      const resync = rerunCurrentQueryOnCurrentText();
      if (!resync.ok || !resync.requestId) {
        return {
          ok: false,
          status: 'resync-start-failed',
          operation: 'replace-all',
          replacements: 0,
          error: resync.error || 'replace-all re-sync start failed',
        };
      }

      const resyncResult = await waitForSearchCompletion(resync.requestId);
      if (!resyncResult.ok) {
        return {
          ok: false,
          status: resyncResult.status || 'resync-failed',
          operation: 'replace-all',
          replacements: 0,
          error: '',
        };
      }

      if (!Number.isFinite(resyncResult.matches) || resyncResult.matches <= 0) {
        return {
          ok: true,
          status: 'noop-no-matches',
          operation: 'replace-all',
          replacements: 0,
        };
      }

      const replaceResult = await requestEditorReplace('replace-all', {
        query: state.query,
        replacement,
        matchCase: false,
      });

      shouldRefresh = !!(
        replaceResult &&
        replaceResult.ok !== false &&
        Number(replaceResult.replacements) > 0
      );

      return replaceResult;
    } finally {
      if (shouldRefresh) {
        await refreshFindAfterReplaceAction(
          'editorFind.replaceAll.refresh',
          'replace-all'
        );
      }

      setBusy(false);
    }
  }

  function handleEditorReplaceResponse(payload) {
    if (!pendingEditorReplace) {
      log.warnOnce(
        'editorFind.editorReplaceResponse.unexpected',
        'editor-replace-response without a pending request (ignored).'
      );
      return;
    }

    const responseRequestId = Number(payload && payload.requestId);
    if (!Number.isFinite(responseRequestId) || responseRequestId !== pendingEditorReplace.requestId) {
      log.warnOnce(
        'editorFind.editorReplaceResponse.mismatch',
        'editor-replace-response requestId mismatch (ignored).'
      );
      return;
    }

    const { timeoutId, resolve, operation } = pendingEditorReplace;
    pendingEditorReplace = null;
    clearTimeout(timeoutId);
    resolve(payload && typeof payload === 'object'
      ? payload
      : {
        ok: false,
        status: 'invalid-response',
        operation: operation || 'replace-current',
        replacements: 0,
        error: 'invalid editor replace response',
      });
  }

  function handleEditorReplaceStatus(payload) {
    if (!payload || typeof payload !== 'object' || typeof payload.replaceAllAllowedByLength !== 'boolean') {
      log.warnOnce(
        'editorFind.editorReplaceStatus.invalid',
        'editor-replace-status invalid payload (ignored).'
      );
      return;
    }

    const nextAllowed = !!(
      payload &&
      typeof payload === 'object' &&
      payload.replaceAllAllowedByLength
    );

    if (state.replaceAllAllowedByLength === nextAllowed) {
      return;
    }

    state.replaceAllAllowedByLength = nextAllowed;
    publishState();
  }

  return {
    clearPendingEditorReplace,
    clearPendingResyncRequest,
    clearPendingSearchWait,
    clearSearch,
    clearStateOnly,
    handleEditorReplaceResponse,
    handleEditorReplaceStatus,
    handleFoundInPage,
    hasQuery,
    navigate,
    replaceAll,
    replaceCurrent,
    rerunCurrentQueryOnCurrentText,
    setQuery,
  };
}

// =============================================================================
// Exports
// =============================================================================
module.exports = {
  createSession,
};

// =============================================================================
// End of electron/editor_find_session.js
// =============================================================================
