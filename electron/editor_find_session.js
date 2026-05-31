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

  function coercePreferredOrdinal(rawOrdinal, fallback = 1) {
    const preferred = Number(rawOrdinal);
    if (!Number.isFinite(preferred) || preferred < 1) {
      return fallback;
    }
    return Math.floor(preferred);
  }

  function clampOrdinalToMatches(rawOrdinal, matchCount = state.matches) {
    const safeMatchCount = Number(matchCount);
    if (!Number.isFinite(safeMatchCount) || safeMatchCount < 1) {
      return 0;
    }

    const preferred = coercePreferredOrdinal(rawOrdinal, 1);
    return Math.min(preferred, Math.floor(safeMatchCount));
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
        'runFind ignored: Text Editor window unavailable.'
      );
      return { ok: false, error: 'Text Editor window unavailable' };
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

  async function navigateToMatchOrdinal(rawTargetOrdinal) {
    const targetOrdinal = clampOrdinalToMatches(rawTargetOrdinal);
    if (!targetOrdinal) {
      return {
        ok: true,
        status: 'noop-no-matches',
        matches: 0,
        activeMatchOrdinal: 0,
      };
    }

    let currentOrdinal = clampOrdinalToMatches(state.activeMatchOrdinal);
    if (!currentOrdinal) {
      currentOrdinal = 1;
    }

    const stepsRemaining = Math.abs(targetOrdinal - currentOrdinal);
    if (stepsRemaining === 0) {
      return {
        ok: true,
        status: 'completed',
        matches: state.matches,
        activeMatchOrdinal: currentOrdinal,
      };
    }

    const forward = targetOrdinal > currentOrdinal;

    for (let stepIndex = 0; stepIndex < stepsRemaining; stepIndex += 1) {
      const res = runFind({
        forward,
        findNext: false,
        matchCase: false,
      });
      if (!res.ok || !res.requestId) {
        return {
          ok: false,
          status: 'navigate-start-failed',
          error: res.error || 'find navigation start failed',
          matches: state.matches,
          activeMatchOrdinal: state.activeMatchOrdinal,
        };
      }

      const navigationResult = await waitForSearchCompletion(res.requestId);
      if (!navigationResult.ok) {
        return {
          ok: false,
          status: navigationResult.status || 'navigate-failed',
          matches: state.matches,
          activeMatchOrdinal: state.activeMatchOrdinal,
        };
      }
    }

    return {
      ok: true,
      status: 'completed',
      matches: state.matches,
      activeMatchOrdinal: clampOrdinalToMatches(state.activeMatchOrdinal),
    };
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
      log.warn('editor-replace-request skipped (ignored): Text Editor window unavailable.', operation);
      return Promise.resolve({
        ok: false,
        status: 'editor-window-unavailable',
        operation,
        replacements: 0,
        error: 'Text Editor window unavailable',
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
          error: 'Text Editor replace request timed out',
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
          activeMatchOrdinal: coercePreferredOrdinal(payload && payload.activeMatchOrdinal, 1),
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

  async function rerunCurrentQueryAndRestoreOrdinal(rawPreferredOrdinal) {
    const preferredOrdinal = coercePreferredOrdinal(rawPreferredOrdinal, state.activeMatchOrdinal || 1);
    const refresh = rerunCurrentQueryOnCurrentText();
    if (!refresh.ok || !refresh.requestId) {
      return {
        ok: false,
        status: 'resync-start-failed',
        error: refresh.error || 'find re-sync start failed',
        matches: state.matches,
        activeMatchOrdinal: state.activeMatchOrdinal,
      };
    }

    const refreshResult = await waitForSearchCompletion(refresh.requestId);
    if (!refreshResult.ok) {
      return {
        ok: false,
        status: refreshResult.status || 'resync-failed',
        matches: state.matches,
        activeMatchOrdinal: state.activeMatchOrdinal,
      };
    }

    if (!Number.isFinite(refreshResult.matches) || refreshResult.matches <= 0) {
      return {
        ok: true,
        status: 'completed',
        matches: 0,
        activeMatchOrdinal: 0,
      };
    }

    const targetOrdinal = clampOrdinalToMatches(preferredOrdinal, refreshResult.matches);
    if (targetOrdinal <= 1) {
      return {
        ok: true,
        status: 'completed',
        matches: refreshResult.matches,
        activeMatchOrdinal: clampOrdinalToMatches(state.activeMatchOrdinal, refreshResult.matches),
      };
    }

    return navigateToMatchOrdinal(targetOrdinal);
  }

  async function refreshFindAfterReplaceAction(warnKey, warnLabel, preferredOrdinal = 1) {
    if (!hasQuery()) return;

    const refreshResult = await rerunCurrentQueryAndRestoreOrdinal(preferredOrdinal);
    if (!refreshResult.ok) {
      log.warnOnce(
        warnKey,
        `${warnLabel} refresh search did not complete cleanly (ignored):`,
        refreshResult.status
      );
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
      log.warn('replace-current ignored: Text Editor window unavailable.');
      return {
        ok: false,
        status: 'editor-window-unavailable',
        operation: 'replace-current',
        replacements: 0,
        error: 'Text Editor window unavailable',
      };
    }

    const preferredTargetOrdinal = coercePreferredOrdinal(state.activeMatchOrdinal, 1);
    let shouldRefresh = false;
    setBusy(true);

    try {
      const resyncResult = await rerunCurrentQueryAndRestoreOrdinal(preferredTargetOrdinal);
      if (!resyncResult.ok) {
        return {
          ok: false,
          status: resyncResult.status || 'resync-failed',
          operation: 'replace-current',
          replacements: 0,
          error: resyncResult.error || '',
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

      const replaceResult = await requestEditorReplace('replace-current', {
        query: state.query,
        replacement,
        matchCase: false,
        activeMatchOrdinal: clampOrdinalToMatches(preferredTargetOrdinal, resyncResult.matches),
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
          'editorFind.replaceCurrent.refresh',
          'replace-current',
          preferredTargetOrdinal
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

    const replacement = clampFindInputText(rawReplacement);
    if (!resolveEditorWindow()) {
      log.warn('replace-all ignored: Text Editor window unavailable.');
      return {
        ok: false,
        status: 'editor-window-unavailable',
        operation: 'replace-all',
        replacements: 0,
        error: 'Text Editor window unavailable',
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
        error: 'invalid Text Editor replace response',
      });
  }

  return {
    clearPendingEditorReplace,
    clearPendingResyncRequest,
    clearPendingSearchWait,
    clearSearch,
    clearStateOnly,
    handleEditorReplaceResponse,
    handleFoundInPage,
    hasQuery,
    navigate,
    refreshCurrentQueryKeepingActiveMatch: () => rerunCurrentQueryAndRestoreOrdinal(state.activeMatchOrdinal),
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
