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

const path = require('path');
const { BrowserWindow } = require('electron');
const Log = require('./log');
const settingsState = require('./settings');
const { DEFAULT_LANG, PRESET_WPM_MIN, PRESET_WPM_MAX } = require('./constants_main');
const countCore = require('../public/js/lib/count_core');
const readingTestFiltersCore = require('../public/js/lib/reading_test_filters_core');
const readingTestPool = require('./reading_test_pool');

const log = Log.get('reading-test-session');
log.debug('Reading test session starting...');

const QUESTIONS_WINDOW_PRELOAD = path.join(__dirname, 'reading_test_questions_preload.js');
const QUESTIONS_WINDOW_HTML = path.join(__dirname, '../public/reading_test_questions.html');
const DEVELOPER_EMAIL = 'cibersino@gmail.com';
const PRESTART_COUNTDOWN_SECONDS = 5;
const PRESTART_COUNTDOWN_STEP_MS = 1000;
const WINDOW_VISIBLE_TIMEOUT_MS = 5000;

function createController(options = {}) {
  const {
    resolveMainWindow,
    getPreconditionContext,
    isProcessingModeActive,
    ensureEditorWindow,
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

  if (typeof resolveMainWindow !== 'function') {
    throw new Error('[reading-test-session] createController requires resolveMainWindow()');
  }
  if (typeof getPreconditionContext !== 'function') {
    throw new Error('[reading-test-session] createController requires getPreconditionContext()');
  }
  if (typeof isProcessingModeActive !== 'function') {
    throw new Error('[reading-test-session] createController requires isProcessingModeActive()');
  }
  if (typeof ensureEditorWindow !== 'function') {
    throw new Error('[reading-test-session] createController requires ensureEditorWindow()');
  }
  if (typeof ensureFlotanteWindow !== 'function') {
    throw new Error('[reading-test-session] createController requires ensureFlotanteWindow()');
  }
  if (typeof closeEditorWindow !== 'function') {
    throw new Error('[reading-test-session] createController requires closeEditorWindow()');
  }
  if (typeof closeFlotanteWindow !== 'function') {
    throw new Error('[reading-test-session] createController requires closeFlotanteWindow()');
  }
  if (typeof startCrono !== 'function') {
    throw new Error('[reading-test-session] createController requires startCrono()');
  }
  if (typeof resetCrono !== 'function') {
    throw new Error('[reading-test-session] createController requires resetCrono()');
  }
  if (typeof stopCrono !== 'function') {
    throw new Error('[reading-test-session] createController requires stopCrono()');
  }
  if (typeof getCronoState !== 'function') {
    throw new Error('[reading-test-session] createController requires getCronoState()');
  }
  if (typeof getCurrentText !== 'function') {
    throw new Error('[reading-test-session] createController requires getCurrentText()');
  }
  if (typeof applyCurrentText !== 'function') {
    throw new Error('[reading-test-session] createController requires applyCurrentText()');
  }
  if (typeof openPresetWindow !== 'function') {
    throw new Error('[reading-test-session] createController requires openPresetWindow()');
  }

  const countUtils = countCore.createCountUtils({
    DEFAULT_LANG,
    log,
    intlObject: typeof Intl !== 'undefined' ? Intl : null,
  });

  let state = {
    active: false,
    stage: 'idle',
    selectedEntry: null,
  };

  let suppressUnexpectedEditorClose = false;
  let suppressUnexpectedFlotanteClose = false;

  function isAliveWindow(win) {
    return !!(win && !win.isDestroyed());
  }

  function wait(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  function waitForWindowVisible(win, label, timeoutMs = WINDOW_VISIBLE_TIMEOUT_MS) {
    return new Promise((resolve, reject) => {
      if (!isAliveWindow(win)) {
        reject(new Error(`READING_TEST_${label}_WINDOW_UNAVAILABLE`));
        return;
      }

      if (typeof win.isVisible === 'function' && win.isVisible()) {
        resolve();
        return;
      }

      let settled = false;
      let timeoutId = null;

      const cleanup = () => {
        try {
          win.removeListener('show', handleShow);
          win.removeListener('closed', handleClosed);
        } catch (err) {
          log.warn(`Reading-test ${label} window visibility cleanup failed (ignored):`, err);
        }
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      const settle = (err) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (err) {
          reject(err);
          return;
        }
        resolve();
      };

      const handleShow = () => settle();
      const handleClosed = () => settle(new Error(`READING_TEST_${label}_WINDOW_CLOSED`));

      win.once('show', handleShow);
      win.once('closed', handleClosed);
      timeoutId = setTimeout(() => {
        settle(new Error(`READING_TEST_${label}_WINDOW_VISIBLE_TIMEOUT`));
      }, timeoutMs);
    });
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

  function getState() {
    return {
      active: !!state.active,
      stage: String(state.stage || 'idle'),
      blocked: !!state.active,
    };
  }

  function safeSendToMain(channel, payload) {
    const mainWin = resolveMainWindow();
    if (!mainWin || mainWin.isDestroyed()) return;
    try {
      mainWin.webContents.send(channel, payload);
    } catch (err) {
      log.warnOnce(
        `reading_test_session.send.${channel}`,
        `reading-test main notify failed (ignored): ${channel}`,
        err
      );
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
    state = {
      active: stage !== 'idle',
      stage,
      selectedEntry: selectedEntry || null,
    };
    broadcastState();
  }

  function clearSession() {
    state = {
      active: false,
      stage: 'idle',
      selectedEntry: null,
    };
    suppressUnexpectedEditorClose = false;
    suppressUnexpectedFlotanteClose = false;
    broadcastState();
  }

  function getSettingsSnapshot() {
    try {
      return settingsState.getSettings();
    } catch (err) {
      log.warn('Reading-test settings fallback applied (ignored):', err);
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

  function checkEntryAvailability() {
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

    return { ok: true, poolEntries: poolInfo.entries, eligibleEntries };
  }

  function chooseRandomEntry(entries) {
    const list = Array.isArray(entries) ? entries : [];
    if (!list.length) return null;
    const index = Math.floor(Math.random() * list.length);
    return list[index] || null;
  }

  function buildPrefilledPresetPayload(wpm) {
    const settings = getSettingsSnapshot();
    const langBase = settingsState.deriveLangKey(settings.language || DEFAULT_LANG);
    const userPresets = settings && settings.presets_by_language && Array.isArray(settings.presets_by_language[langBase])
      ? settings.presets_by_language[langBase]
      : [];

    let nextNumber = 1;
    for (const preset of userPresets) {
      const name = preset && typeof preset.name === 'string' ? preset.name.trim() : '';
      const match = /^Test\s+(\d+)$/i.exec(name);
      if (!match) continue;
      const n = Number(match[1]);
      if (Number.isFinite(n) && n >= nextNumber) {
        nextNumber = n + 1;
      }
    }

    const name = `Test ${nextNumber}`;
    const description = langBase === 'en'
      ? `User tested speed (${name}).`
      : `Velocidad testeada del usuario (${name}).`;

    return {
      wpm,
      preset: {
        name,
        wpm,
        description,
      },
    };
  }

  function computeCurrentWpm() {
    const cronoState = getCronoState();
    const elapsed = cronoState && typeof cronoState.elapsed === 'number'
      ? cronoState.elapsed
      : 0;
    if (!(elapsed > 0)) {
      return { ok: false, guidanceKey: 'renderer.alerts.reading_test_result_invalid', code: 'ELAPSED_INVALID' };
    }

    const currentText = String(getCurrentText() || '');
    const settings = getSettingsSnapshot();
    const stats = countUtils.contarTexto(currentText, {
      modoConteo: settings.modeConteo === 'simple' ? 'simple' : 'preciso',
      idioma: settings.language || DEFAULT_LANG,
    });
    const wordCount = stats && typeof stats.palabras === 'number' ? stats.palabras : 0;
    if (!(wordCount > 0)) {
      return { ok: false, guidanceKey: 'renderer.alerts.reading_test_result_invalid', code: 'WORD_COUNT_INVALID' };
    }

    const rawWpm = (wordCount / (elapsed / 1000)) * 60;
    if (!Number.isFinite(rawWpm)) {
      return { ok: false, guidanceKey: 'renderer.alerts.reading_test_result_invalid', code: 'WPM_INVALID' };
    }

    const roundedWpm = Math.round(rawWpm);
    const clampedWpm = Math.min(Math.max(roundedWpm, PRESET_WPM_MIN), PRESET_WPM_MAX);

    if (clampedWpm !== roundedWpm) {
      log.debug(
        'Reading-test WPM clamped to preset range:',
        { rawWpm, roundedWpm, clampedWpm, min: PRESET_WPM_MIN, max: PRESET_WPM_MAX }
      );
    }

    return {
      ok: true,
      wpm: clampedWpm,
      rawWpm,
      elapsed,
      wordCount,
      clamped: clampedWpm !== roundedWpm,
    };
  }

  function closeReadingWindows() {
    suppressUnexpectedEditorClose = true;
    suppressUnexpectedFlotanteClose = true;
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

  async function openReadingSessionWindows() {
    resetCrono();
    const editorWin = ensureEditorWindow();
    if (isAliveWindow(editorWin) && !editorWin.isMaximized()) {
      editorWin.maximize();
    }
    const flotanteWin = await ensureFlotanteWindow();
    await Promise.all([
      waitForWindowVisible(editorWin, 'EDITOR'),
      waitForWindowVisible(flotanteWin, 'FLOTANTE'),
    ]);

    return { editorWin, flotanteWin };
  }

  function cleanupStartFailure({ clearCurrentText = false } = {}) {
    try {
      resetCrono();
    } catch (err) {
      log.warn('Reading-test start-failure crono reset failed (ignored):', err);
    }

    closeReadingWindows();

    try {
      if (clearCurrentText) {
        applyCurrentText('', { source: 'main-window', action: 'clear' });
      }
    } catch (err) {
      log.warn('Reading-test start-failure current-text clear failed (ignored):', err);
    } finally {
      suppressUnexpectedEditorClose = false;
      suppressUnexpectedFlotanteClose = false;
    }
  }

  function isArmingEntry(entry) {
    return !!(state.active && state.stage === 'arming' && state.selectedEntry === entry);
  }

  function startEditorCountdown(editorWin) {
    if (!isAliveWindow(editorWin) || !editorWin.webContents || editorWin.webContents.isDestroyed()) {
      throw new Error('READING_TEST_EDITOR_COUNTDOWN_WINDOW_UNAVAILABLE');
    }

    editorWin.webContents.send('reading-test-prestart-countdown', {
      seconds: PRESTART_COUNTDOWN_SECONDS,
      stepMs: PRESTART_COUNTDOWN_STEP_MS,
    });
  }

  function clearSessionTextIfNeeded(selectedEntry) {
    const shouldClearCurrentText = !selectedEntry || selectedEntry.sourceMode !== 'current_text';
    if (!shouldClearCurrentText) return;

    try {
      applyCurrentText('', { source: 'main-window', action: 'clear' });
    } catch (err) {
      log.warn('Reading-test session current-text clear failed (ignored):', err);
    }
  }

  function failArmingSession(selectedEntry, noticeKey) {
    if (!isArmingEntry(selectedEntry)) return;

    try {
      resetCrono();
    } catch (err) {
      log.warn('Reading-test arming failure crono reset failed (ignored):', err);
    }

    closeReadingWindows();
    clearSessionTextIfNeeded(selectedEntry);
    clearSession();

    if (noticeKey) {
      emitNotice(noticeKey, { type: 'error' });
    }
  }

  async function continueArmingSession(selectedEntry) {
    if (!isArmingEntry(selectedEntry)) return;

    try {
      const { editorWin, flotanteWin } = await openReadingSessionWindows();
      if (!isArmingEntry(selectedEntry)) return;

      startEditorCountdown(editorWin);
      await wait(PRESTART_COUNTDOWN_SECONDS * PRESTART_COUNTDOWN_STEP_MS);

      if (!isArmingEntry(selectedEntry)) return;
      if (!isAliveWindow(editorWin) || !isAliveWindow(flotanteWin)) {
        throw new Error('READING_TEST_PRESTART_WINDOW_LOST');
      }

      startCrono();
      setStage('running', { selectedEntry });
    } catch (err) {
      log.error('Reading-test session arming failed:', err);
      failArmingSession(selectedEntry, 'renderer.alerts.reading_test_start_failed');
    }
  }

  function openQuestionsWindow(questions) {
    return new Promise((resolve) => {
      const mainWin = resolveMainWindow();
      if (!mainWin || mainWin.isDestroyed()) {
        resolve({ ok: false, code: 'MAIN_WINDOW_UNAVAILABLE' });
        return;
      }

      let closed = false;
      const win = new BrowserWindow({
        width: 760,
        height: 464,
        minWidth: 680,
        minHeight: 360,
        parent: mainWin,
        modal: true,
        resizable: true,
        minimizable: false,
        maximizable: false,
        show: false,
        webPreferences: {
          preload: QUESTIONS_WINDOW_PRELOAD,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });

      win.setMenu(null);
      win.once('ready-to-show', () => {
        if (win.isDestroyed()) return;
        win.show();
        try {
          win.webContents.send('reading-test-questions-init', {
            developerEmail: DEVELOPER_EMAIL,
            questions,
          });
        } catch (err) {
          log.error('Reading-test questions init failed:', err);
        }
      });

      win.on('closed', () => {
        if (closed) return;
        closed = true;
        resolve({ ok: true });
      });

      win.loadFile(QUESTIONS_WINDOW_HTML).catch((err) => {
        log.error('Reading-test questions window load failed:', err);
        if (!closed) {
          closed = true;
          try {
            if (!win.isDestroyed()) win.close();
          } catch (closeErr) {
            log.warn('Reading-test questions window forced close failed (ignored):', closeErr);
          }
          resolve({ ok: false, code: 'QUESTIONS_WINDOW_LOAD_FAILED' });
        }
      });
    });
  }

  function beginPresetStep(wpm) {
    applyMainWindowWpm(wpm);
    setStage('preset');

    const presetWin = openPresetWindow(buildPrefilledPresetPayload(wpm));
    if (!presetWin || presetWin.isDestroyed()) {
      emitNotice('renderer.alerts.reading_test_preset_unavailable', { type: 'error' });
      clearSession();
      return;
    }

    const onClosed = () => {
      try {
        presetWin.removeListener('closed', onClosed);
      } catch (err) {
        log.warn('Reading-test preset close listener detach failed (ignored):', err);
      }
      clearSession();
    };

    presetWin.on('closed', onClosed);
  }

  async function finishRunningSession() {
    if (!state.active || state.stage !== 'running' || !state.selectedEntry) return;

    stopCrono();
    closeReadingWindows();

    const wpmInfo = computeCurrentWpm();
    if (!wpmInfo.ok) {
      emitNotice(wpmInfo.guidanceKey, { type: 'error' });
      clearSession();
      return;
    }

    if (state.selectedEntry.hasValidQuestions) {
      setStage('questions');
      const questionsWindowInfo = await openQuestionsWindow(state.selectedEntry.questions);
      if (!questionsWindowInfo.ok) {
        emitNotice('renderer.alerts.reading_test_questions_unavailable', { type: 'error' });
        clearSession();
        return;
      }
    }

    beginPresetStep(wpmInfo.wpm);
  }

  function cancelActiveSession(noticeKey, { type = 'warn' } = {}) {
    if (!state.active || (state.stage !== 'arming' && state.stage !== 'running')) return;

    const selectedEntry = state.selectedEntry;

    try {
      resetCrono();
    } catch (err) {
      log.warn('Reading-test cancel crono reset failed (ignored):', err);
    }

    closeReadingWindows();
    clearSessionTextIfNeeded(selectedEntry);
    clearSession();

    if (noticeKey) {
      emitNotice(noticeKey, { type });
    }
  }

  async function startPoolSession(selection) {
    if (state.active) {
      return { ok: false, guidanceKey: 'renderer.alerts.reading_test_precondition_blocked', code: 'SESSION_ACTIVE' };
    }

    const selectionInfo = ensureEligibleSelection(selection);
    if (!selectionInfo.ok) return selectionInfo;

    const selectedEntry = chooseRandomEntry(selectionInfo.eligibleEntries);
    if (!selectedEntry) {
      return { ok: false, guidanceKey: 'renderer.alerts.reading_test_no_matching_files', code: 'NO_MATCHING_FILES' };
    }

    const applyResult = applyCurrentText(selectedEntry.text, {
      source: 'main-window',
      action: 'overwrite',
    });
    if (!applyResult || applyResult.ok !== true) {
      return { ok: false, guidanceKey: 'renderer.alerts.reading_test_start_failed', code: 'TEXT_APPLY_FAILED' };
    }

    const writeInfo = readingTestPool.markPoolEntryUsed(selectedEntry.snapshotRelPath, true);
    if (!writeInfo.ok) {
      cleanupStartFailure({ clearCurrentText: true });
      return { ok: false, guidanceKey: 'renderer.alerts.reading_test_start_failed', code: writeInfo.code || 'POOL_WRITE_FAILED' };
    }

    const sessionEntry = buildSessionEntry('pool', selectedEntry);
    setStage('arming', { selectedEntry: sessionEntry });
    void continueArmingSession(sessionEntry);
    return { ok: true };
  }

  async function startCurrentTextSession() {
    if (state.active) {
      return { ok: false, guidanceKey: 'renderer.alerts.reading_test_precondition_blocked', code: 'SESSION_ACTIVE' };
    }
    if (!hasCurrentText()) {
      return { ok: false, guidanceKey: 'renderer.alerts.reading_test_current_text_empty', code: 'CURRENT_TEXT_EMPTY' };
    }

    const sessionEntry = buildSessionEntry('current_text');
    setStage('arming', {
      selectedEntry: sessionEntry,
    });
    void continueArmingSession(sessionEntry);
    return { ok: true };
  }

  function isInteractionLocked() {
    return !!state.active;
  }

  function getInteractionBlockReason() {
    return state.active ? 'reading_test_session' : '';
  }

  function handleFlotanteCommand(cmd) {
    if (!state.active || (state.stage !== 'arming' && state.stage !== 'running')) return false;
    if (!cmd || typeof cmd.cmd !== 'string') return true;

    if (state.stage === 'arming') {
      if (cmd.cmd === 'reset') {
        cancelActiveSession('renderer.alerts.reading_test_cancelled');
      }
      return true;
    }

    if (cmd.cmd === 'toggle') {
      void finishRunningSession();
      return true;
    }

    if (cmd.cmd === 'reset') {
      cancelActiveSession('renderer.alerts.reading_test_cancelled');
      return true;
    }

    if (cmd.cmd === 'set') {
      log.warnOnce(
        'reading_test_session.flotante_set_blocked',
        'Reading-test floating set command ignored while session is active.'
      );
      return true;
    }

    return false;
  }

  function handleEditorClosed() {
    if (!state.active || (state.stage !== 'arming' && state.stage !== 'running')) return;
    if (suppressUnexpectedEditorClose) {
      suppressUnexpectedEditorClose = false;
      return;
    }
    cancelActiveSession('renderer.alerts.reading_test_cancelled_window_closed');
  }

  function handleFlotanteClosed() {
    if (!state.active || (state.stage !== 'arming' && state.stage !== 'running')) return;
    if (suppressUnexpectedFlotanteClose) {
      suppressUnexpectedFlotanteClose = false;
      return;
    }
    cancelActiveSession('renderer.alerts.reading_test_cancelled_window_closed');
  }

  function registerIpc(ipcMain) {
    if (!ipcMain || typeof ipcMain.handle !== 'function') {
      throw new Error('[reading-test-session] registerIpc requires ipcMain');
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
