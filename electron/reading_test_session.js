// electron/reading_test_session.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Main-owned reading-test session controller.
// Responsibilities:
// - Gate entry based on current app state and pool availability.
// - Own guided reading-test session state across running/questions/preset stages.
// - Reinterpret floating-window controls while a session is active.
// - Compute authoritative WPM in main and coordinate preset handoff.
// =============================================================================

// =============================================================================
// Imports / logger
// =============================================================================

const path = require('path');
const { BrowserWindow } = require('electron');
const Log = require('./log');
const settingsState = require('./settings');
const { DEFAULT_LANG, PRESET_WPM_MIN, PRESET_WPM_MAX } = require('./constants_main');
const countCore = require('../public/js/lib/count_core');
const readingTestFiltersCore = require('../public/js/lib/reading_test_filters_core');
const readingTestPool = require('./reading_test_pool');
const readingTestSessionWindows = require('./reading_test_session_windows');
const readingTestSessionFlow = require('./reading_test_session_flow');

const log = Log.get('reading-test-session');
log.debug('Reading test session starting...');

// =============================================================================
// Constants / config
// =============================================================================

const QUESTIONS_WINDOW_PRELOAD = path.join(__dirname, 'reading_test_questions_preload.js');
const QUESTIONS_WINDOW_HTML = path.join(__dirname, '../public/reading_test_questions.html');
const RESULT_WINDOW_PRELOAD = path.join(__dirname, 'reading_test_result_preload.js');
const RESULT_WINDOW_HTML = path.join(__dirname, '../public/reading_test_result.html');
const DEVELOPER_EMAIL = 'cibersino@gmail.com';
const WINDOW_VISIBLE_TIMEOUT_MS = 5000;

// =============================================================================
// Controller factory
// =============================================================================

function createController(options = {}) {
  // Injected main-process bridges keep session logic local while main.js owns concrete window/runtime wiring.
  const {
    resolveMainWindow,
    getPreconditionContext,
    isProcessingModeActive,
    ensureEditorWindow,
    showEditorWindow,
    ensureFlotanteWindow,
    closeEditorWindow,
    closeFlotanteWindow,
    startCrono,
    resetCrono,
    stopCrono,
    getCronoState,
    getCurrentText,
    applyCurrentText,
    openPresetWindow,
  } = options;

  const requiredOptionFns = [
    ['resolveMainWindow', resolveMainWindow],
    ['getPreconditionContext', getPreconditionContext],
    ['isProcessingModeActive', isProcessingModeActive],
    ['ensureEditorWindow', ensureEditorWindow],
    ['showEditorWindow', showEditorWindow],
    ['ensureFlotanteWindow', ensureFlotanteWindow],
    ['closeEditorWindow', closeEditorWindow],
    ['closeFlotanteWindow', closeFlotanteWindow],
    ['startCrono', startCrono],
    ['resetCrono', resetCrono],
    ['stopCrono', stopCrono],
    ['getCronoState', getCronoState],
    ['getCurrentText', getCurrentText],
    ['applyCurrentText', applyCurrentText],
    ['openPresetWindow', openPresetWindow],
  ];

  for (const [name, fn] of requiredOptionFns) {
    if (typeof fn !== 'function') {
      throw new Error(`[reading-test-session] createController requires ${name}()`);
    }
  }

  const countUtils = countCore.createCountUtils({
    DEFAULT_LANG,
    log,
    intlObject: typeof Intl !== 'undefined' ? Intl : null,
  });

  // =============================================================================
  // Shared state
  // =============================================================================
  // All mutable session coordination stays inside the controller; callers see only derived state/methods.
  const state = {
    active: false,
    stage: 'idle',
    selectedEntry: null,
    armingReady: false,
  };

  const runtimeFlags = {
    suppressUnexpectedEditorClose: false,
    suppressUnexpectedFlotanteClose: false,
  };
  const activeSessionWindows = {
    editorWin: null,
    flotanteWin: null,
  };

  // =============================================================================
  // Helpers
  // =============================================================================

  // Session state / main-window signaling
  function getState() {
    return {
      active: !!state.active,
      stage: String(state.stage || 'idle'),
      blocked: !!state.active,
    };
  }

  function isInteractionLocked() {
    return !!state.active;
  }

  function getInteractionBlockReason() {
    return state.active ? 'reading_test_session' : '';
  }

  function safeSendToMain(channel, payload) {
    const mainWin = resolveMainWindow();
    if (!mainWin || mainWin.isDestroyed()) {
      log.warn(`Reading-test main notify failed (ignored): ${channel} main window unavailable.`);
      return;
    }
    try {
      mainWin.webContents.send(channel, payload);
    } catch (err) {
      log.warn(`Reading-test main notify failed (ignored): ${channel}`, err);
    }
  }

  function broadcastState() {
    safeSendToMain('reading-test-state-changed', getState());
  }

  function emitNotice(key, { params = {}, type = 'info' } = {}) {
    safeSendToMain('reading-test-notice', { key, params, type });
  }

  function applyMainWindowWpm(wpm) {
    safeSendToMain('reading-test-apply-wpm', { wpm });
  }

  function setStage(stage, { selectedEntry = state.selectedEntry } = {}) {
    state.active = stage !== 'idle';
    state.stage = stage;
    state.selectedEntry = selectedEntry || null;
    state.armingReady = false;
    broadcastState();
  }

  function clearSession() {
    state.active = false;
    state.stage = 'idle';
    state.selectedEntry = null;
    state.armingReady = false;
    activeSessionWindows.editorWin = null;
    activeSessionWindows.flotanteWin = null;
    runtimeFlags.suppressUnexpectedEditorClose = false;
    runtimeFlags.suppressUnexpectedFlotanteClose = false;
    broadcastState();
  }

  // General utilities
  function isAliveWindow(win) {
    return !!(win && !win.isDestroyed());
  }

  function setArmingReady(ready) {
    state.armingReady = ready === true;
  }

  function setActiveSessionWindows({ editorWin = null, flotanteWin = null } = {}) {
    activeSessionWindows.editorWin = editorWin;
    activeSessionWindows.flotanteWin = flotanteWin;
  }

  function getActiveSessionWindows() {
    return {
      editorWin: activeSessionWindows.editorWin,
      flotanteWin: activeSessionWindows.flotanteWin,
    };
  }

  function tryResetCrono(warningMessage) {
    try {
      resetCrono();
    } catch (err) {
      log.warn(warningMessage, err);
    }
  }

  function tryClearCurrentText(warningMessage) {
    try {
      applyCurrentText('', { source: 'main-window', action: 'clear' });
    } catch (err) {
      log.warn(warningMessage, err);
    }
  }

  function hasCurrentText() {
    return String(getCurrentText() || '').trim().length > 0;
  }

  function buildSessionEntry(sourceMode, entry = {}) {
    return {
      ...entry,
      sourceMode,
      hasValidQuestions: sourceMode === 'pool' && entry.hasValidQuestions === true,
      questions: Array.isArray(entry.questions) ? entry.questions : [],
    };
  }

  function getSettingsSnapshot() {
    try {
      return settingsState.getSettings();
    } catch (err) {
      log.warn('Reading-test settings read failed; using fallback settings.', err);
      return { language: DEFAULT_LANG, modeConteo: 'preciso', presets_by_language: {} };
    }
  }

  function buildBlockedResult(guidanceKey, code) {
    return {
      ok: true,
      canOpen: false,
      guidanceKey,
      code,
    };
  }

  function chooseRandomEntry(entries) {
    const list = Array.isArray(entries) ? entries : [];
    if (!list.length) return null;
    const index = Math.floor(Math.random() * list.length);
    return list[index] || null;
  }

  // Availability / selection helpers
  function checkEntryAvailability() {
    try {
      if (state.active) {
        return buildBlockedResult('renderer.alerts.reading_test_precondition_blocked', 'SESSION_ACTIVE');
      }
      if (isProcessingModeActive()) {
        return buildBlockedResult('renderer.alerts.reading_test_precondition_blocked', 'PROCESSING_ACTIVE');
      }

      const context = getPreconditionContext();
      const openSecondaryWindows = Array.isArray(context && context.openSecondaryWindows)
        ? context.openSecondaryWindows.filter((item) => item && item.isOpen)
        : [];
      const cronoState = getCronoState();
      const stopwatchRunning = !!(context && context.stopwatchRunning);
      const stopwatchElapsed = cronoState && typeof cronoState.elapsed === 'number'
        ? cronoState.elapsed
        : 0;
      const stopwatchAtZero = stopwatchElapsed === 0;
      if (openSecondaryWindows.length > 0 || stopwatchRunning || !stopwatchAtZero) {
        return buildBlockedResult('renderer.alerts.reading_test_precondition_blocked', 'PRECONDITION_BLOCKED');
      }

      const poolInfo = readingTestPool.listPoolEntries();
      if (!poolInfo.ok) {
        return buildBlockedResult('renderer.alerts.reading_test_pool_error', poolInfo.code || 'POOL_SCAN_FAILED');
      }

      const entries = poolInfo.entries;
      const hasUnusedEntries = entries.some((entry) => entry.used === false);

      return {
        ok: true,
        canOpen: true,
        currentTextAvailable: hasCurrentText(),
        poolExhausted: !hasUnusedEntries,
        entries: entries.map(readingTestPool.serializePoolEntryMeta),
        poolDirName: readingTestPool.POOL_DIR_NAME,
      };
    } catch (err) {
      log.error('Reading-test entry availability check failed:', err);
      throw err;
    }
  }

  function ensureEligibleSelection(selection) {
    const poolInfo = readingTestPool.listPoolEntries();
    if (!poolInfo.ok) {
      return { ok: false, guidanceKey: 'renderer.alerts.reading_test_pool_error', code: poolInfo.code };
    }

    const eligibleEntries = readingTestFiltersCore.getEligibleEntries(
      poolInfo.entries,
      readingTestFiltersCore.normalizeSelection(selection)
    );
    if (!eligibleEntries.length) {
      return { ok: false, guidanceKey: 'renderer.alerts.reading_test_no_matching_files', code: 'NO_MATCHING_FILES' };
    }

    return { ok: true, eligibleEntries };
  }

  // Window helpers
  function waitForWindowVisible(win, label) {
    return readingTestSessionWindows.waitForWindowVisible(win, label, log, WINDOW_VISIBLE_TIMEOUT_MS);
  }

  function openReadingSessionWindows() {
    return readingTestSessionWindows.openReadingSessionWindows({
      resetCrono,
      ensureEditorWindow,
      ensureFlotanteWindow,
      log,
      timeoutMs: WINDOW_VISIBLE_TIMEOUT_MS,
    });
  }

  function closeReadingWindows() {
    runtimeFlags.suppressUnexpectedEditorClose = true;
    runtimeFlags.suppressUnexpectedFlotanteClose = true;
    setArmingReady(false);
    setActiveSessionWindows();
    try {
      closeEditorWindow();
    } catch (err) {
      log.warn('Reading-test editor close failed (ignored):', err);
    }
    try {
      closeFlotanteWindow();
    } catch (err) {
      log.warn('Reading-test floating window close failed (ignored):', err);
    }
  }

  function showEditorPrestart(editorWin, visible) {
    return readingTestSessionWindows.setEditorPrestartVisible(editorWin, visible);
  }

  function openQuestionsWindow(questions) {
    return readingTestSessionWindows.openQuestionsWindow(questions, {
      resolveMainWindow,
      log,
      questionsWindowPreload: QUESTIONS_WINDOW_PRELOAD,
      questionsWindowHtml: QUESTIONS_WINDOW_HTML,
      developerEmail: DEVELOPER_EMAIL,
    });
  }

  function openResultWindow(resultInfo) {
    return readingTestSessionWindows.openResultWindow(resultInfo, {
      resolveMainWindow,
      log,
      resultWindowPreload: RESULT_WINDOW_PRELOAD,
      resultWindowHtml: RESULT_WINDOW_HTML,
    });
  }

  // Flow helpers
  function clearSessionTextIfNeeded(selectedEntry) {
    return readingTestSessionFlow.clearSessionTextIfNeeded(selectedEntry, tryClearCurrentText);
  }

  function computeCurrentWpm() {
    return readingTestSessionFlow.computeCurrentWpm({
      getCronoState,
      getCurrentText,
      getSettingsSnapshot,
      countUtils,
      DEFAULT_LANG,
      PRESET_WPM_MIN,
      PRESET_WPM_MAX,
      log,
    });
  }

  function buildPrefilledPresetPayload(wpm) {
    return readingTestSessionFlow.buildPrefilledPresetPayload(wpm, {
      getSettingsSnapshot,
      settingsState,
      DEFAULT_LANG,
    });
  }

  function beginPresetStep(wpm) {
    return readingTestSessionFlow.beginPresetStep(wpm, {
      applyMainWindowWpm,
      setStage,
      openPresetWindow,
      buildPrefilledPresetPayload,
      emitNotice,
      clearSession,
      log,
    });
  }

  function resetAndCloseActiveSession(selectedEntry, resetWarningMessage) {
    return readingTestSessionFlow.resetAndCloseActiveSession(selectedEntry, resetWarningMessage, {
      tryResetCrono,
      closeReadingWindows,
      clearSessionTextIfNeeded,
      clearSession,
    });
  }

  function failArmingSession(selectedEntry, noticeKey) {
    return readingTestSessionFlow.failArmingSession(selectedEntry, noticeKey, {
      state,
      resetAndCloseActiveSession,
      emitNotice,
    });
  }

  function continueArmingSession(selectedEntry) {
    return readingTestSessionFlow.continueArmingSession(selectedEntry, {
      state,
      openReadingSessionWindows,
      setActiveSessionWindows,
      showEditorPrestart,
      setArmingReady,
      showEditorWindow,
      waitForWindowVisible,
      failArmingSession,
      log,
    });
  }

  function startArmedSession() {
    return readingTestSessionFlow.startArmedSession({
      state,
      getActiveSessionWindows,
      isAliveWindow,
      readingTestPool,
      showEditorPrestart,
      startCrono,
      setStage,
      setArmingReady,
      failArmingSession,
      log,
    });
  }

  function finishRunningSession() {
    return readingTestSessionFlow.finishRunningSession({
      state,
      stopCrono,
      closeReadingWindows,
      computeCurrentWpm,
      emitNotice,
      clearSession,
      setStage,
      openResultWindow,
      openQuestionsWindow,
      beginPresetStep,
      resetAndCloseActiveSession,
      log,
    });
  }

  function cancelActiveSession(noticeKey, noticeOptions = { type: 'warn' }) {
    return readingTestSessionFlow.cancelActiveSession(noticeKey, noticeOptions, {
      state,
      resetAndCloseActiveSession,
      emitNotice,
    });
  }

  function startPoolSession(selection) {
    return readingTestSessionFlow.startPoolSession(selection, {
      state,
      ensureEligibleSelection,
      chooseRandomEntry,
      applyCurrentText,
      buildSessionEntry,
      setStage,
      continueArmingSession,
      log,
    });
  }

  function startCurrentTextSession() {
    return readingTestSessionFlow.startCurrentTextSession({
      state,
      hasCurrentText,
      buildSessionEntry,
      setStage,
      continueArmingSession,
      log,
    });
  }

  function handleFlotanteCommand(cmd) {
    return readingTestSessionFlow.handleFlotanteCommand(cmd, {
      state,
      startArmedSession,
      cancelActiveSession,
      finishRunningSession,
      log,
    });
  }

  function handleEditorClosed() {
    return readingTestSessionFlow.handleEditorClosed({
      state,
      runtimeFlags,
      cancelActiveSession,
    });
  }

  function handleFlotanteClosed() {
    return readingTestSessionFlow.handleFlotanteClosed({
      state,
      runtimeFlags,
      cancelActiveSession,
    });
  }

  // =============================================================================
  // IPC registration
  // =============================================================================

  function registerIpc(ipcMain) {
    if (!ipcMain || typeof ipcMain.handle !== 'function') {
      throw new Error('[reading-test-session] registerIpc requires ipcMain.handle()');
    }

    function isAuthorizedMainSender(event) {
      try {
        const senderWin = event && event.sender
          ? BrowserWindow.fromWebContents(event.sender)
          : null;
        const mainWin = resolveMainWindow();
        return !!(mainWin && senderWin && senderWin === mainWin);
      } catch (err) {
        log.warn('Reading-test sender validation failed:', err);
        return false;
      }
    }

    ipcMain.handle('reading-test-get-entry-data', async (event) => {
      if (!isAuthorizedMainSender(event)) {
        return { ok: false, code: 'UNAUTHORIZED' };
      }
      return checkEntryAvailability();
    });

    ipcMain.handle('reading-test-reset-pool', async (event) => {
      if (!isAuthorizedMainSender(event)) {
        return { ok: false, code: 'UNAUTHORIZED' };
      }
      if (state.active) {
        return { ok: false, code: 'SESSION_ACTIVE', guidanceKey: 'renderer.alerts.reading_test_precondition_blocked' };
      }

      const resetInfo = readingTestPool.resetPoolUsageState();
      if (!resetInfo.ok) {
        return { ok: false, code: resetInfo.code || 'POOL_RESET_FAILED', guidanceKey: 'renderer.alerts.reading_test_pool_error' };
      }

      return checkEntryAvailability();
    });

    ipcMain.handle('reading-test-start', async (event, payload) => {
      if (!isAuthorizedMainSender(event)) {
        return { ok: false, code: 'UNAUTHORIZED' };
      }
      const entryInfo = checkEntryAvailability();
      if (!entryInfo.ok || !entryInfo.canOpen) {
        return { ok: false, code: entryInfo.code || 'PRECONDITION_BLOCKED', guidanceKey: entryInfo.guidanceKey };
      }
      if (payload && payload.sourceMode === 'current_text') {
        return startCurrentTextSession();
      }
      return startPoolSession(payload && payload.selection);
    });

    ipcMain.handle('reading-test-get-state', async () => getState());
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================

  return {
    clearSession,
    getState,
    isInteractionLocked,
    getInteractionBlockReason,
    handleFlotanteCommand,
    handleEditorClosed,
    handleFlotanteClosed,
    registerIpc,
  };
}

module.exports = {
  createController,
};

// =============================================================================
// End of electron/reading_test_session.js
// =============================================================================
