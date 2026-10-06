// electron/task_editor_window_lifecycle.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own Main-side Task window identity, initialization currentness, dirty evidence,
//   and bounded no-draft startup-failure decisions.
// - Authenticate Task renderer lifecycle/close transports without owning renderer draft data.
// - Resolve terminal disposal through Main-native disclosure or explicit discard authorization.
// - Coalesce pending native close requests while one terminal outcome is being resolved.
// - Preserve Task-first parent/application-close ordering through the controller contract.

// =============================================================================
// Imports and logger
// =============================================================================

const Log = require('./log');

const log = Log.get('task-editor-window-lifecycle');

// =============================================================================
// Helpers
// =============================================================================

function isAliveWindow(win) {
  return !!(win && typeof win.isDestroyed === 'function' && !win.isDestroyed());
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

// =============================================================================
// Controller factory / Task lifecycle coordination
// =============================================================================

function createController({ dialog, getDialogTexts }) {
  if (!dialog || typeof dialog.showMessageBox !== 'function') {
    throw new Error('[task_editor_window_lifecycle] dialog.showMessageBox required');
  }

  let taskWindow = null;
  let currentInitId = 0;
  let dirtyEvidence = { state: 'unknown', initId: 0 };
  let terminalOutcome = null;
  let terminalResolutionPromise = null;
  let forceCloseAuthorized = false;
  let initialPresentationBlocked = false;
  let closeRequestPending = false;
  let closeRequestResolver = null;

  // A pending native-close request waits for the one controller-owned terminal
  // resolution; it is not independent authority to dispose the Task window.
  function settleCloseRequest(authorized) {
    const resolve = closeRequestResolver;
    closeRequestResolver = null;
    closeRequestPending = false;
    if (resolve) resolve(authorized === true);
  }

  function getDialogTextsSafely() {
    try {
      return typeof getDialogTexts === 'function' ? getDialogTexts() : null;
    } catch (err) {
      log.error('Task Editor native dialog copy acquisition failed:', err);
      return null;
    }
  }

  function getCopy(texts, key) {
    return texts && typeof texts[key] === 'string' ? texts[key] : '';
  }

  // Main evidence is valid only for the initialization identity it accepted.
  function resetEvidence() {
    dirtyEvidence = { state: 'unknown', initId: currentInitId };
  }

  function resetWindowLifecycleState() {
    currentInitId = 0;
    terminalOutcome = null;
    terminalResolutionPromise = null;
    forceCloseAuthorized = false;
    initialPresentationBlocked = false;
    closeRequestPending = false;
    resetEvidence();
  }

  function isCurrentWindow(win) {
    return isAliveWindow(taskWindow) && taskWindow === win;
  }

  function isCurrentSender(event) {
    return !!(event && event.sender && isCurrentWindow(taskWindow) && event.sender === taskWindow.webContents);
  }

  function forceCloseCurrentWindow() {
    if (!isCurrentWindow(taskWindow)) return false;
    forceCloseAuthorized = true;
    try {
      taskWindow.close();
      settleCloseRequest(true);
      return true;
    } catch (err) {
      forceCloseAuthorized = false;
      settleCloseRequest(false);
      log.error('Task Editor force close failed:', err);
      return false;
    }
  }

  // =============================================================================
  // Main-native Task disclosure and terminal disposition
  // =============================================================================

  async function showTerminalDisclosure(messageKey, ownerWin) {
    const dialogTexts = getDialogTextsSafely();
    const title = getCopy(dialogTexts, 'task_terminal_title');
    const message = getCopy(dialogTexts, messageKey);
    const ok = getCopy(dialogTexts, 'ok');
    if (!title || !message || !ok) {
      log.error('Task Editor terminal disclosure copy unavailable:', { messageKey });
      return false;
    }
    try {
      await dialog.showMessageBox(ownerWin || taskWindow || null, {
        type: 'error',
        title,
        message,
        buttons: [ok],
        defaultId: 0,
        noLink: true,
      });
      return true;
    } catch (err) {
      log.error('Task Editor terminal disclosure failed:', { messageKey }, err);
      return false;
    }
  }

  async function requestDiscardDecision(ownerWin) {
    const dialogTexts = getDialogTextsSafely();
    const title = getCopy(dialogTexts, 'task_terminal_title');
    const message = getCopy(dialogTexts, 'task_terminal_dirty_message');
    const discard = getCopy(dialogTexts, 'task_discard_and_close');
    const keep = getCopy(dialogTexts, 'task_keep_open');
    if (!title || !message || !discard || !keep) {
      log.error('Task Editor terminal discard-decision copy unavailable.');
      return false;
    }
    try {
      const result = await dialog.showMessageBox(ownerWin || taskWindow || null, {
        type: 'warning',
        title,
        message,
        buttons: [discard, keep],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      });
      return !!result && result.response === 0;
    } catch (err) {
      log.error('Task Editor terminal discard decision failed:', err);
      return false;
    }
  }

  function getTerminalDisposition(snapshot) {
    const mainDirty = dirtyEvidence.initId === currentInitId ? dirtyEvidence.state : 'unknown';
    const rendererDirty = snapshot && snapshot.initId === currentInitId && typeof snapshot.dirty === 'boolean'
      ? snapshot.dirty
      : 'unknown';
    if (mainDirty === true || rendererDirty === true) return 'dirty';
    if (mainDirty === false && rendererDirty === false) return 'clean';
    return 'potentially-dirty';
  }

  // A terminal resolution is shared so duplicate close attempts cannot create
  // competing native decisions or force-close authorizations.
  async function resolveTerminalOutcome(outcome, ownerWin) {
    if (!outcome || !isCurrentWindow(taskWindow)) return false;
    if (outcome.phase === 'no-draft') {
      await showTerminalDisclosure('task_terminal_startup_message', ownerWin);
      return forceCloseCurrentWindow();
    }

    const disposition = getTerminalDisposition(outcome);
    if (disposition === 'clean') {
      await showTerminalDisclosure('task_terminal_clean_message', ownerWin);
      return forceCloseCurrentWindow();
    }

    const discard = await requestDiscardDecision(ownerWin);
    if (!discard) return false;
    return forceCloseCurrentWindow();
  }

  function startTerminalResolution(outcome, ownerWin) {
    if (terminalResolutionPromise) return terminalResolutionPromise;

    const resolutionPromise = (async () => {
      try {
        const didClose = await resolveTerminalOutcome(outcome, ownerWin);
        if (!didClose) settleCloseRequest(false);
        return didClose;
      } catch (err) {
        log.error('Task Editor terminal resolution failed:', err);
        settleCloseRequest(false);
        return false;
      }
    })();

    terminalResolutionPromise = resolutionPromise;
    void resolutionPromise.finally(() => {
      if (terminalResolutionPromise === resolutionPromise) {
        terminalResolutionPromise = null;
      }
    });
    return resolutionPromise;
  }

  // =============================================================================
  // Window identity and initialization evidence
  // =============================================================================

  function attachWindow(win) {
    taskWindow = win;
    resetWindowLifecycleState();
  }

  function handleWindowClosed(win) {
    if (taskWindow !== win) return;
    settleCloseRequest(forceCloseAuthorized);
    taskWindow = null;
    resetWindowLifecycleState();
  }

  function prepareInitialization(win, payload) {
    if (!isCurrentWindow(win) || terminalOutcome || terminalResolutionPromise) return null;
    const initId = currentInitId + 1;
    return {
      ...payload,
      initId,
    };
  }

  function acceptInitializationIssued(win, initId) {
    if (!isCurrentWindow(win)
      || terminalOutcome
      || terminalResolutionPromise
      || !Number.isInteger(initId)
      || initId !== currentInitId + 1) {
      log.error('Task Editor initialization issue could not be accepted:', { initId });
      return false;
    }
    currentInitId = initId;
    terminalOutcome = null;
    terminalResolutionPromise = null;
    resetEvidence();
    return true;
  }

  function acceptDirtyState(event, payload) {
    if (!isCurrentSender(event)) {
      log.warn('task-editor-dirty-state unauthorized (ignored).');
      return false;
    }
    if (!isPlainObject(payload)
      || typeof payload.dirty !== 'boolean'
      || !Number.isInteger(payload.initId)
      || payload.initId !== currentInitId) {
      log.warn('task-editor-dirty-state stale or invalid (ignored):', payload);
      return false;
    }
    dirtyEvidence = { state: payload.dirty, initId: payload.initId };
    return true;
  }

  // The Main-side BrowserWindow adapter can establish these two bounded startup
  // failures before a Task renderer can report them. A sent initId is not draft
  // admission; current dirty evidence is the Main-side fact that proves a draft
  // was actually established and must remain protected.
  function acceptKnownNoDraftStartupFailure({ taskEditorWin, kind, error, logContext, preloadPath }) {
    if (!isCurrentWindow(taskEditorWin) || forceCloseAuthorized) return false;
    if (terminalOutcome || terminalResolutionPromise) return false;

    if (dirtyEvidence.initId === currentInitId && typeof dirtyEvidence.state === 'boolean') {
      log.error('Task Editor initial startup failure ignored after renderer draft evidence:', {
        kind,
        currentInitId,
        logContext,
      }, error);
      return false;
    }

    const diagnostic = kind === 'initial-preload-before-bridge'
      ? 'Task Editor initial preload failed before taskEditorAPI exposure:'
      : 'Task Editor required initial document load failed:';
    log.error(diagnostic, {
      logContext,
      ...(preloadPath ? { preloadPath } : {}),
    }, error);
    initialPresentationBlocked = true;
    terminalOutcome = {
      kind,
      phase: 'no-draft',
      initId: null,
      dirty: null,
    };
    void startTerminalResolution(terminalOutcome);
    return true;
  }

  function handleInitialPreloadFailure({ taskEditorWin, preloadPath, error, logContext }) {
    return acceptKnownNoDraftStartupFailure({
      taskEditorWin,
      kind: 'initial-preload-before-bridge',
      error,
      logContext,
      preloadPath,
    });
  }

  function handleInitialDocumentLoadFailure({ taskEditorWin, error, logContext }) {
    return acceptKnownNoDraftStartupFailure({
      taskEditorWin,
      kind: 'initial-document-load',
      error,
      logContext,
    });
  }

  // An authenticated initialized renderer can be terminal while its snapshot
  // is stale or missing. That establishes no current clean/dirty fact, so the
  // controller retains it as unknown evidence for conservative disposition.
  function acceptTerminalOutcome(event, payload) {
    if (!isCurrentSender(event)) {
      log.warn('task-editor-terminal unauthorized (ignored).');
      return false;
    }
    if (!isPlainObject(payload)
      || typeof payload.kind !== 'string'
      || (payload.phase !== 'no-draft' && payload.phase !== 'initialized')) {
      log.warn('task-editor-terminal invalid payload (ignored):', payload);
      return false;
    }
    const isNoDraftOutcome = payload.phase === 'no-draft';
    const hasCurrentInitializedSnapshot = Number.isInteger(payload.initId)
      && payload.initId > 0
      && payload.initId === currentInitId
      && typeof payload.dirty === 'boolean';
    const hasStaleInitializedSnapshot = Number.isInteger(payload.initId)
      && payload.initId > 0
      && payload.initId !== currentInitId
      && typeof payload.dirty === 'boolean';
    const hasMissingInitializedSnapshot = payload.initId === null && payload.dirty === null;
    // A renderer that fails before it can consume the replayed initial payload
    // has no local initialization identity to echo. Its authenticated no-draft
    // report is still current while Main has no post-application dirty evidence.
    const hasUncorrelatedNoDraftAttempt = payload.initId === null
      && (currentInitId === 0
        || (dirtyEvidence.initId === currentInitId && dirtyEvidence.state === 'unknown'));
    const hasCurrentNoDraftAttempt = hasUncorrelatedNoDraftAttempt
      || (Number.isInteger(payload.initId) && payload.initId > 0 && payload.initId === currentInitId);
    const hasValidDirtySnapshot = hasCurrentInitializedSnapshot;

    if ((isNoDraftOutcome
      && (!hasCurrentNoDraftAttempt || payload.dirty !== null))
      || (!isNoDraftOutcome
        && !hasCurrentInitializedSnapshot
        && !hasStaleInitializedSnapshot
        && !hasMissingInitializedSnapshot)) {
      log.warn('task-editor-terminal stale or invalid lifecycle payload (ignored):', payload);
      return false;
    }
    const hasCurrentDraft = !isNoDraftOutcome;
    terminalOutcome = {
      kind: payload.kind,
      phase: hasCurrentDraft ? 'initialized' : 'no-draft',
      initId: hasCurrentDraft && hasCurrentInitializedSnapshot ? payload.initId : null,
      dirty: hasValidDirtySnapshot ? payload.dirty : null,
    };
    void startTerminalResolution(terminalOutcome);
    return true;
  }

  // =============================================================================
  // Close transport and parent-close coordination
  // =============================================================================

  function handleCloseResponse(event, payload) {
    if (!isCurrentSender(event) || !isPlainObject(payload)) {
      log.warn('task-editor-close-response unauthorized or invalid (ignored).');
      return false;
    }
    if (terminalOutcome || terminalResolutionPromise) {
      if (payload.kind === 'terminal') {
        return acceptTerminalOutcome(event, payload);
      }
      log.warn('task-editor-close-response ignored while terminal resolution is active.');
      return false;
    }
    if (payload.kind === 'normal' && payload.allow === true) {
      return forceCloseCurrentWindow();
    }
    if (payload.kind === 'terminal') {
      return acceptTerminalOutcome(event, payload);
    }
    if (payload.kind !== 'normal') {
      log.warn('task-editor-close-response unsupported payload (ignored):', payload);
    }
    settleCloseRequest(false);
    return false;
  }

  function requestNativeClose(ownerWin) {
    if (!isCurrentWindow(taskWindow)) return Promise.resolve(true);
    if (forceCloseAuthorized) return Promise.resolve(true);
    if (terminalResolutionPromise) return terminalResolutionPromise;
    if (closeRequestPending) {
      if (!closeRequestResolver) {
        log.error('Task Editor close request is pending without a resolver.');
        return Promise.resolve(false);
      }
      return new Promise((resolve) => {
        const priorResolve = closeRequestResolver;
        closeRequestResolver = (authorized) => {
          priorResolve(authorized);
          resolve(authorized);
        };
      });
    }
    closeRequestPending = true;

    if (terminalOutcome) {
      closeRequestPending = false;
      return startTerminalResolution(terminalOutcome, ownerWin);
    }

    const closeRequestResult = new Promise((resolve) => {
      closeRequestResolver = resolve;
    });
    try {
      taskWindow.webContents.send('task-editor-request-close');
      return closeRequestResult;
    } catch (err) {
      log.warn('Task Editor close request failed (ignored); requiring native discard decision:', err);
      if (currentInitId === 0) {
        settleCloseRequest(false);
        return Promise.resolve(false);
      }
      terminalOutcome = {
        kind: 'close-response-unavailable',
        phase: currentInitId > 0 ? 'initialized' : 'no-draft',
        initId: currentInitId,
        dirty: null,
      };
      return startTerminalResolution(terminalOutcome, ownerWin);
    }
  }

  // Replacement never reuses an earlier discard action after lifecycle state
  // changes while the native decision is pending.
  async function confirmReplacement(ownerWin) {
    if (!isCurrentWindow(taskWindow)) return true;
    if (terminalOutcome || terminalResolutionPromise) return false;
    const replacementWindow = taskWindow;
    if (dirtyEvidence.initId !== currentInitId || dirtyEvidence.state !== false) {
      const dialogTexts = getDialogTextsSafely();
      const title = getCopy(dialogTexts, 'task_discard_changes_title');
      const message = getCopy(dialogTexts, 'task_discard_changes_confirm');
      const discard = getCopy(dialogTexts, 'task_discard_and_close');
      const keep = getCopy(dialogTexts, 'task_keep_open');
      if (!title || !message || !discard || !keep) {
        log.error('Task Editor replacement discard copy unavailable.');
        return false;
      }
      try {
        const result = await dialog.showMessageBox(ownerWin || taskWindow, {
          type: 'warning',
          title,
          message,
          buttons: [discard, keep],
          defaultId: 1,
          cancelId: 1,
          noLink: true,
        });
        // The user action that opened this dialog is not authority to initialize
        // a replacement after this window has become terminal or been disposed.
        // A later explicit New/Load action may start from the fresh lifecycle.
        if (!isCurrentWindow(replacementWindow) || terminalOutcome || terminalResolutionPromise) {
          return false;
        }
        return !!result && result.response === 0;
      } catch (err) {
        log.error('Task Editor replacement discard decision failed:', err);
        return false;
      }
    }
    return true;
  }

  // =============================================================================
  // Public controller contract
  // =============================================================================

  return {
    attachWindow,
    handleWindowClosed,
    prepareInitialization,
    acceptInitializationIssued,
    acceptDirtyState,
    handleInitialPreloadFailure,
    handleInitialDocumentLoadFailure,
    acceptTerminalOutcome,
    handleCloseResponse,
    requestNativeClose,
    confirmReplacement,
    isForceCloseAuthorized() {
      return forceCloseAuthorized;
    },
    isInitialPresentationAllowed(win) {
      return isCurrentWindow(win) && !initialPresentationBlocked;
    },
  };
}

// =============================================================================
// Module exports
// =============================================================================

module.exports = {
  createController,
  isAliveWindow,
};

// =============================================================================
// End of electron/task_editor_window_lifecycle.js
// =============================================================================
