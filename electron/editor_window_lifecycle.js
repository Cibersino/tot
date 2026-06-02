// electron/editor_window_lifecycle.js
'use strict';

// Product rule override:
// hidden editor startup is capped at 60 seconds even if bootstrap is still progressing.
const EDITOR_HIDDEN_STARTUP_TIMEOUT_MS = 60000;

function isAliveWindow(win) {
  return !!(win && !win.isDestroyed());
}

function hasLiveWebContents(win) {
  return !!(isAliveWindow(win) && win.webContents && !win.webContents.isDestroyed());
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

function buildWaiterError(code) {
  const err = new Error(code);
  err.code = code;
  return err;
}

function requireCreateEditorWindow(createEditorWindow, logContext) {
  if (typeof createEditorWindow === 'function') {
    return createEditorWindow;
  }
  throw new Error(`[editor_window_lifecycle] createEditorWindow required from ${logContext}`);
}

function createController({ log, editorState }) {
  if (!log || typeof log.warn !== 'function' || typeof log.error !== 'function') {
    throw new Error('[editor_window_lifecycle] createController requires log');
  }
  if (!editorState || typeof editorState.notifyWindowState !== 'function') {
    throw new Error('[editor_window_lifecycle] createController requires editorState.notifyWindowState');
  }

  let nextFirstShowGeneration = 1;
  let hiddenStartupCycle = null;
  let pendingLifecycleOwnedCloseWindow = null;
  const startupCycleWaiters = new Map();

  function createStartupCycleWaiter(generation) {
    let resolvePromise;
    let rejectPromise;

    const waiter = {
      settled: false,
      promise: new Promise((resolve, reject) => {
        resolvePromise = resolve;
        rejectPromise = reject;
      }),
      resolve(value) {
        if (this.settled) return;
        this.settled = true;
        resolvePromise(value);
        startupCycleWaiters.delete(generation);
      },
      reject(err) {
        if (this.settled) return;
        this.settled = true;
        rejectPromise(err);
        startupCycleWaiters.delete(generation);
      },
    };

    startupCycleWaiters.set(generation, waiter);
    return waiter;
  }

  function getStartupCycleWaiter(generation) {
    return startupCycleWaiters.get(generation) || null;
  }

  function resolveStartupCycleReady(generation) {
    const waiter = getStartupCycleWaiter(generation);
    if (!waiter) return;
    waiter.resolve({ generation });
  }

  function rejectStartupCycle(generation, errorCode) {
    const waiter = getStartupCycleWaiter(generation);
    if (!waiter) return;
    waiter.reject(buildWaiterError(errorCode));
  }

  function notifyMainEditorFirstShowState(mainWin, payload, logContext) {
    if (!hasLiveWebContents(mainWin)) {
      log.warn('editor-first-show-state notification skipped (ignored): main window unavailable.', logContext);
      return false;
    }

    try {
      mainWin.webContents.send('editor-first-show-state', payload);
      return true;
    } catch (err) {
      log.warn(`Unable to notify editor-first-show-state from ${logContext}:`, err);
      return false;
    }
  }

  function resolveHiddenStartupCycle(cycle) {
    if (!cycle || cycle.resolved) return;

    cycle.resolved = true;

    if (cycle.timeoutId) {
      clearTimeout(cycle.timeoutId);
      cycle.timeoutId = null;
    }

    if (hiddenStartupCycle && hiddenStartupCycle.generation === cycle.generation) {
      hiddenStartupCycle = null;
    }
  }

  function disposeHiddenStartupWindow(editorWin, logContext) {
    if (!isAliveWindow(editorWin)) return;

    pendingLifecycleOwnedCloseWindow = editorWin;

    try {
      if (typeof editorWin.destroy === 'function') {
        editorWin.destroy();
        return;
      }
      editorWin.close();
    } catch (err) {
      if (pendingLifecycleOwnedCloseWindow === editorWin) {
        pendingLifecycleOwnedCloseWindow = null;
      }
      log.warn(`Hidden editor disposal failed from ${logContext} (ignored):`, err);
    }
  }

  function focusEditorWindow(editorWin) {
    if (typeof editorWin.focus === 'function') {
      editorWin.focus();
    }
    if (editorWin.webContents && typeof editorWin.webContents.focus === 'function') {
      editorWin.webContents.focus();
    }
  }

  function showEditorWindow(editorWin, options = {}) {
    if (!isAliveWindow(editorWin)) return null;

    const shouldMaximize = !!(
      options.maximize === true
      || (options.useSavedMaximized !== false && editorWin.__totSavedMaximized === true)
    );

    if (typeof editorWin.isMinimized === 'function' && editorWin.isMinimized()) {
      if (typeof editorWin.restore === 'function') {
        editorWin.restore();
      }
    }

    if (shouldMaximize && typeof editorWin.maximize === 'function' && !editorWin.isMaximized()) {
      editorWin.maximize();
    }

    if (typeof editorWin.show === 'function' && !editorWin.isVisible()) {
      editorWin.show();
    }

    focusEditorWindow(editorWin);
    editorState.notifyWindowState(editorWin, 'showEditorWindow');
    return editorWin;
  }

  function applyHiddenStartupMaximize(editorWin, logContext) {
    if (!isAliveWindow(editorWin)) {
      throw new Error('EDITOR_WINDOW_UNAVAILABLE');
    }
    if (typeof editorWin.maximize === 'function' && !editorWin.isMaximized()) {
      try {
        editorWin.maximize();
      } catch (err) {
        log.error(`Hidden editor maximize failed from ${logContext}:`, err);
        throw err;
      }
    }
  }

  function attemptLateOrdinaryFallback(editorWin, logContext) {
    if (!isAliveWindow(editorWin)) return false;

    try {
      if (typeof editorWin.isMinimized === 'function' && editorWin.isMinimized() && typeof editorWin.restore === 'function') {
        editorWin.restore();
      }
      if (typeof editorWin.show === 'function' && !editorWin.isVisible()) {
        editorWin.show();
      }
      focusEditorWindow(editorWin);
      editorState.notifyWindowState(editorWin, logContext);
      return true;
    } catch (err) {
      log.warn(`Late ordinary editor fallback failed from ${logContext} (ignored):`, err);
      return false;
    }
  }

  function emitOrdinaryFirstShowState(mainWin, cycle, payload, logContext) {
    notifyMainEditorFirstShowState(
      mainWin,
      {
        generation: cycle.generation,
        ...payload,
      },
      logContext
    );
  }

  function finalizeOrdinaryFirstShow(editorWin, mainWin, cycle, logContext) {
    try {
      showEditorWindow(editorWin, {
        maximize: cycle.initialPresentationMode === 'maximized',
        useSavedMaximized: false,
      });

      if (!isAliveWindow(editorWin)) {
        resolveHiddenStartupCycle(cycle);
        emitOrdinaryFirstShowState(mainWin, cycle, {
          state: 'closed',
          reason: 'window-closed-before-first-show',
        }, logContext);
        return false;
      }

      resolveHiddenStartupCycle(cycle);
      emitOrdinaryFirstShowState(mainWin, cycle, { state: 'ready' }, logContext);
      return true;
    } catch (err) {
      log.error('Text Editor ordinary first-show finalization failed:', err);

      const fallbackSucceeded = attemptLateOrdinaryFallback(
        editorWin,
        'ordinaryLateFinalizationFallback'
      );

      resolveHiddenStartupCycle(cycle);

      if (!fallbackSucceeded) {
        emitOrdinaryFirstShowState(mainWin, cycle, {
          state: 'failed',
          reason: 'late-finalization-failed',
        }, logContext);
        return false;
      }

      emitOrdinaryFirstShowState(mainWin, cycle, {
        state: 'ready',
        fallback: true,
        reason: 'late-finalization-fallback',
      }, logContext);
      return true;
    }
  }

  function armHiddenStartupTimeout(cycle, editorWin, mainWin, logContext) {
    cycle.timeoutId = setTimeout(() => {
      if (!hiddenStartupCycle || hiddenStartupCycle.generation !== cycle.generation || cycle.resolved) {
        return;
      }

      log.error('Text Editor hidden startup timed out at the product cap:', {
        generation: cycle.generation,
        owner: cycle.owner,
        timeoutMs: EDITOR_HIDDEN_STARTUP_TIMEOUT_MS,
      });

      cycle.waitingForBaseReady = false;
      rejectStartupCycle(cycle.generation, 'EDITOR_STARTUP_TIMEOUT');
      resolveHiddenStartupCycle(cycle);

      if (cycle.owner === 'ordinary') {
        emitOrdinaryFirstShowState(mainWin, cycle, {
          state: 'failed',
          reason: 'startup-timeout',
        }, logContext);
      }

      disposeHiddenStartupWindow(editorWin, `${logContext}.timeout`);
    }, EDITOR_HIDDEN_STARTUP_TIMEOUT_MS);
  }

  function beginFreshHiddenStartup({
    owner,
    initialPresentationMode,
    mainWin,
    createEditorWindow,
    options,
    logContext,
  }) {
    const cycle = {
      generation: nextFirstShowGeneration++,
      owner,
      initialPresentationMode,
      waitingForBaseReady: true,
      resolved: false,
      timeoutId: null,
    };
    const waiter = createStartupCycleWaiter(cycle.generation);

    hiddenStartupCycle = cycle;

    let freshEditorWin = null;

    try {
      const createWindow = requireCreateEditorWindow(createEditorWindow, logContext);
      freshEditorWin = createWindow({
        ...options,
        deferShow: true,
        waitForBasePresentationReady: true,
        initialPresentationMode,
        firstShowGeneration: cycle.generation,
      });

      if (initialPresentationMode === 'maximized') {
        applyHiddenStartupMaximize(freshEditorWin, `${logContext}.hiddenMaximize`);
      }

      armHiddenStartupTimeout(cycle, freshEditorWin, mainWin, logContext);

      return {
        ok: true,
        editorWin: freshEditorWin,
        baseReadyPromise: waiter.promise,
      };
    } catch (err) {
      rejectStartupCycle(cycle.generation, 'EDITOR_STARTUP_CREATE_FAILED');
      resolveHiddenStartupCycle(cycle);
      disposeHiddenStartupWindow(freshEditorWin, `${logContext}.createFailure`);
      throw err;
    }
  }

  function handleOpenEditor({ guardOpenEditor, editorWin, mainWin, createEditorWindow, startupState, logContext }) {
    if (typeof guardOpenEditor === 'function' && guardOpenEditor() !== true) {
      return { ok: false, error: 'not ready' };
    }

    const initialPresentationMode = startupState && startupState.maximized === true
      ? 'maximized'
      : 'reduced';

    const openResult = ensureEditorWindowOpen({
      editorWin,
      mainWin,
      createEditorWindow,
      options: {
        deferShow: true,
        waitForBasePresentationReady: true,
        startupOwner: 'ordinary',
        initialPresentationMode,
        startupState: isPlainObject(startupState) ? startupState : null,
      },
      logContext,
    });

    if (!openResult || openResult.ok !== true) {
      return {
        ok: false,
        error: openResult && openResult.error ? String(openResult.error) : 'open-editor failed',
      };
    }

    return {
      ok: true,
      launchDisposition: openResult.baseReadyPromise
        ? 'first-show-pending'
        : 'reused-visible',
    };
  }

  function handleEditorWindowReady({
    editorWin,
    deferShow = false,
    waitForBasePresentationReady = false,
  }) {
    if (!isAliveWindow(editorWin)) return null;

    if (!deferShow && !waitForBasePresentationReady) {
      showEditorWindow(editorWin);
    }

    return editorWin;
  }

  function ensureEditorWindowOpen({ editorWin, mainWin, createEditorWindow, options = {}, logContext }) {
    const deferShow = !!(options && options.deferShow);
    const waitForBasePresentationReady = !!(options && options.waitForBasePresentationReady);
    const startupOwner = options && options.startupOwner === 'reading-test'
      ? 'reading-test'
      : 'ordinary';
    const initialPresentationMode = options && options.initialPresentationMode === 'maximized'
      ? 'maximized'
      : 'reduced';

    if (hiddenStartupCycle && !hiddenStartupCycle.resolved && !isAliveWindow(editorWin)) {
      log.warn('Hidden editor startup cycle found without a live editor window; resolving stale cycle.');
      rejectStartupCycle(hiddenStartupCycle.generation, 'EDITOR_WINDOW_UNAVAILABLE');
      resolveHiddenStartupCycle(hiddenStartupCycle);
    }

    if (!isAliveWindow(editorWin)) {
      if (waitForBasePresentationReady) {
        return beginFreshHiddenStartup({
          owner: startupOwner,
          initialPresentationMode,
          mainWin,
          createEditorWindow,
          options,
          logContext,
        });
      }

      const createWindow = requireCreateEditorWindow(createEditorWindow, logContext);
      return {
        ok: true,
        editorWin: createWindow(options),
        baseReadyPromise: null,
      };
    }

    if (hiddenStartupCycle && !hiddenStartupCycle.resolved) {
      if (hiddenStartupCycle.owner !== startupOwner) {
        log.warn('Editor hidden startup owner conflict (ignored):', {
          requestedOwner: startupOwner,
          activeOwner: hiddenStartupCycle.owner,
          generation: hiddenStartupCycle.generation,
        });
        return {
          ok: false,
          error: 'EDITOR_STARTUP_OWNER_CONFLICT',
          editorWin,
        };
      }

      return {
        ok: true,
        editorWin,
        baseReadyPromise: getStartupCycleWaiter(hiddenStartupCycle.generation)
          ? getStartupCycleWaiter(hiddenStartupCycle.generation).promise
          : null,
      };
    }

    const wasVisible = typeof editorWin.isVisible === 'function' && editorWin.isVisible();

    if (wasVisible) {
      showEditorWindow(editorWin, {
        maximize: options && options.maximize === true,
        useSavedMaximized: false,
      });
      return {
        ok: true,
        editorWin,
        baseReadyPromise: null,
      };
    }

    if (!deferShow || startupOwner === 'ordinary') {
      showEditorWindow(editorWin, {
        maximize: options && options.maximize === true,
        useSavedMaximized: false,
      });
      return {
        ok: true,
        editorWin,
        baseReadyPromise: null,
      };
    }

    return {
      ok: true,
      editorWin,
      baseReadyPromise: null,
    };
  }

  function handleBasePresentationStateReport({ event, editorWin, mainWin, payload, logContext }) {
    if (!isPlainObject(payload)) {
      log.warn('editor-report-base-presentation-state ignored: invalid payload.', payload);
      return false;
    }

    const cycle = hiddenStartupCycle;
    if (!cycle || cycle.resolved) {
      log.warn('editor-report-base-presentation-state ignored: no unresolved startup cycle.', payload);
      return false;
    }

    if (!hasLiveWebContents(editorWin)) {
      log.warn('editor-report-base-presentation-state ignored: editor window unavailable.', payload);
      return false;
    }

    if (!event || event.sender !== editorWin.webContents) {
      log.warn('editor-report-base-presentation-state ignored: sender is not the live editor window.', payload);
      return false;
    }

    if (payload.generation !== cycle.generation) {
      log.warn('editor-report-base-presentation-state ignored: stale generation.', payload);
      return false;
    }

    if (payload.status !== 'ready' && payload.status !== 'failed') {
      log.warn('editor-report-base-presentation-state ignored: invalid status.', payload);
      return false;
    }

    if (payload.status === 'failed') {
      cycle.waitingForBaseReady = false;
      rejectStartupCycle(cycle.generation, 'EDITOR_BOOTSTRAP_FAILED');
      resolveHiddenStartupCycle(cycle);

      if (cycle.owner === 'ordinary') {
        emitOrdinaryFirstShowState(mainWin, cycle, {
          state: 'failed',
          reason: 'bootstrap-failed',
        }, logContext);
      }

      disposeHiddenStartupWindow(editorWin, `${logContext}.bootstrapFailed`);
      return true;
    }

    cycle.waitingForBaseReady = false;
    resolveStartupCycleReady(cycle.generation);

    if (cycle.owner === 'reading-test') {
      resolveHiddenStartupCycle(cycle);
      return true;
    }

    finalizeOrdinaryFirstShow(editorWin, mainWin, cycle, logContext);
    return true;
  }

  function handleEditorWindowClosed({ editorWin, mainWin, logContext }) {
    if (editorWin && pendingLifecycleOwnedCloseWindow === editorWin) {
      pendingLifecycleOwnedCloseWindow = null;
      return true;
    }

    const cycle = hiddenStartupCycle;
    if (!cycle || cycle.resolved) {
      return false;
    }

    if (cycle.waitingForBaseReady) {
      rejectStartupCycle(cycle.generation, 'EDITOR_WINDOW_CLOSED_BEFORE_BASE_READY');
      resolveHiddenStartupCycle(cycle);

      if (cycle.owner === 'ordinary') {
        emitOrdinaryFirstShowState(mainWin, cycle, {
          state: 'closed',
          reason: 'window-closed-before-base-ready',
        }, logContext);
      }

      return true;
    }

    resolveHiddenStartupCycle(cycle);

    if (cycle.owner === 'ordinary') {
      emitOrdinaryFirstShowState(mainWin, cycle, {
        state: 'closed',
        reason: 'window-closed-before-first-show',
      }, logContext);
    }

    return true;
  }

  return {
    handleOpenEditor,
    showEditorWindow,
    handleEditorWindowReady,
    ensureEditorWindowOpen,
    handleBasePresentationStateReport,
    handleEditorWindowClosed,
  };
}

module.exports = {
  EDITOR_HIDDEN_STARTUP_TIMEOUT_MS,
  isAliveWindow,
  hasLiveWebContents,
  createController,
};
