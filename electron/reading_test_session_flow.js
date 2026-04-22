// electron/reading_test_session_flow.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Reading-test session flow helpers.
// Responsibilities:
// - Orchestrate arming/running/questions/preset stages.
// - Compute authoritative WPM and preset payloads.
// - Start/cancel/finish sessions.
// - Reinterpret floating-window commands and close events.
// =============================================================================

// =============================================================================
// Session state helpers
// =============================================================================

function clearSessionTextIfNeeded(selectedEntry, tryClearCurrentText) {
  const shouldClearCurrentText = !selectedEntry || selectedEntry.sourceMode !== 'current_text';
  if (!shouldClearCurrentText) return;

  tryClearCurrentText('Reading-test session current-text clear failed (ignored):');
}

function isArmingOrRunningSession(state) {
  return !!(state.active && (state.stage === 'arming' || state.stage === 'running'));
}

function isArmingEntry(state, entry) {
  return !!(state.active && state.stage === 'arming' && state.selectedEntry === entry);
}

// =============================================================================
// Session flow helpers
// =============================================================================

function failArmingSession(selectedEntry, noticeKey, options = {}) {
  const {
    state,
    resetAndCloseActiveSession,
    emitNotice,
  } = options;

  if (!isArmingEntry(state, selectedEntry)) return;

  resetAndCloseActiveSession(selectedEntry, 'Reading-test arming failure crono reset failed (ignored):');

  if (noticeKey) {
    emitNotice(noticeKey, { type: 'error' });
  }
}

async function continueArmingSession(selectedEntry, options = {}) {
  const {
    state,
    openReadingSessionWindows,
    setActiveSessionWindows,
    showEditorPrestart,
    setArmingReady,
    showEditorWindow,
    waitForWindowVisible,
    failArmingSession,
    log,
  } = options;

  if (!isArmingEntry(state, selectedEntry)) return;

  try {
    const { editorWin, flotanteWin } = await openReadingSessionWindows();
    if (!isArmingEntry(state, selectedEntry)) return;

    setActiveSessionWindows({ editorWin, flotanteWin });
    showEditorPrestart(editorWin, true);
    showEditorWindow({ maximize: true });
    await waitForWindowVisible(editorWin, 'EDITOR');
    if (!isArmingEntry(state, selectedEntry)) return;
    setArmingReady(true);
  } catch (err) {
    log.error('Reading-test session arming failed:', err);
    failArmingSession(selectedEntry, 'renderer.alerts.reading_test_start_failed');
  }
}

function startArmedSession(options = {}) {
  const {
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
  } = options;

  if (!state.active || state.stage !== 'arming' || !state.selectedEntry) return;
  if (state.armingReady !== true) {
    log.warnOnce(
      'reading_test_session.flotante_toggle_arming_not_ready',
      'Reading-test arming toggle ignored: session windows are not ready yet.'
    );
    return;
  }

  const selectedEntry = state.selectedEntry;
  const { editorWin, flotanteWin } = getActiveSessionWindows();
  if (!isAliveWindow(editorWin) || !isAliveWindow(flotanteWin)) {
    log.error('Reading-test start-from-arming failed: session window unavailable.');
    failArmingSession(selectedEntry, 'renderer.alerts.reading_test_start_failed');
    return;
  }

  let poolUsageCommitted = false;

  try {
    if (selectedEntry.sourceMode === 'pool') {
      const writeInfo = readingTestPool.markPoolEntryUsed(selectedEntry.snapshotRelPath, true);
      if (!writeInfo.ok) {
        throw new Error(writeInfo.code || 'POOL_WRITE_FAILED');
      }
      poolUsageCommitted = true;
    }

    showEditorPrestart(editorWin, false);
    startCrono();
    setArmingReady(false);
    setStage('running', { selectedEntry });
  } catch (err) {
    if (poolUsageCommitted && selectedEntry.sourceMode === 'pool') {
      try {
        const rollbackInfo = readingTestPool.markPoolEntryUsed(selectedEntry.snapshotRelPath, false);
        if (!rollbackInfo.ok) {
          log.warn('Reading-test pool usage rollback failed (ignored):', rollbackInfo.code || 'POOL_WRITE_FAILED');
        }
      } catch (rollbackErr) {
        log.warn('Reading-test pool usage rollback failed (ignored):', rollbackErr);
      }
    }
    log.error('Reading-test start-from-arming failed:', err);
    failArmingSession(selectedEntry, 'renderer.alerts.reading_test_start_failed');
  }
}

function computeCurrentWpm(options = {}) {
  const {
    getCronoState,
    getCurrentText,
    getSettingsSnapshot,
    countUtils,
    DEFAULT_LANG,
    PRESET_WPM_MIN,
    PRESET_WPM_MAX,
    log,
  } = options;

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

function buildPrefilledPresetPayload(wpm, options = {}) {
  const {
    getSettingsSnapshot,
    settingsState,
    DEFAULT_LANG,
  } = options;

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

function beginPresetStep(wpm, options = {}) {
  const {
    applyMainWindowWpm,
    setStage,
    openPresetWindow,
    buildPrefilledPresetPayload,
    emitNotice,
    clearSession,
    log,
  } = options;

  applyMainWindowWpm(wpm);
  setStage('preset');

  let presetWin = null;
  try {
    presetWin = openPresetWindow(buildPrefilledPresetPayload(wpm));
  } catch (err) {
    log.warn('Reading-test preset window open failed (ignored):', err);
    emitNotice('renderer.alerts.reading_test_preset_unavailable', { type: 'error' });
    clearSession();
    return;
  }
  if (!presetWin || presetWin.isDestroyed()) {
    log.warn('Reading-test preset window unavailable (ignored): openPresetWindow returned no live window.');
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

async function finishRunningSession(options = {}) {
  const {
    state,
    stopCrono,
    closeReadingWindows,
    computeCurrentWpm,
    emitNotice,
    clearSession,
    setStage,
    openQuestionsWindow,
    beginPresetStep,
    log,
  } = options;

  if (!state.active || state.stage !== 'running' || !state.selectedEntry) return;

  const selectedEntry = state.selectedEntry;

  try {
    stopCrono();
    closeReadingWindows();

    const wpmInfo = computeCurrentWpm();
    if (!wpmInfo.ok) {
      emitNotice(wpmInfo.guidanceKey, { type: 'error' });
      clearSession();
      return;
    }

    if (selectedEntry.hasValidQuestions) {
      setStage('questions');
      const questionsWindowInfo = await openQuestionsWindow(selectedEntry.questions);
      if (!questionsWindowInfo.ok) {
        emitNotice('renderer.alerts.reading_test_questions_unavailable', { type: 'warn' });
      }
    }

    beginPresetStep(wpmInfo.wpm);
  } catch (err) {
    log.error('Reading-test session finish failed:', err);
    options.resetAndCloseActiveSession(
      selectedEntry,
      'Reading-test finish failure crono reset failed (ignored):'
    );
  }
}

function resetAndCloseActiveSession(selectedEntry, resetWarningMessage, options = {}) {
  const {
    tryResetCrono,
    closeReadingWindows,
    clearSessionTextIfNeeded,
    clearSession,
  } = options;

  tryResetCrono(resetWarningMessage);
  closeReadingWindows();
  clearSessionTextIfNeeded(selectedEntry);
  clearSession();
}

function cancelActiveSession(noticeKey, notifyOptions = {}, options = {}) {
  const {
    state,
    resetAndCloseActiveSession,
    emitNotice,
  } = options;

  if (!isArmingOrRunningSession(state)) return;

  const selectedEntry = state.selectedEntry;

  resetAndCloseActiveSession(selectedEntry, 'Reading-test cancel crono reset failed (ignored):');

  if (noticeKey) {
    emitNotice(noticeKey, notifyOptions);
  }
}

function handleUnexpectedWindowClosed(flagName, options = {}) {
  const {
    state,
    runtimeFlags,
    cancelActiveSession,
  } = options;

  if (!isArmingOrRunningSession(state)) return;
  if (runtimeFlags[flagName]) {
    runtimeFlags[flagName] = false;
    return;
  }
  cancelActiveSession('renderer.alerts.reading_test_cancelled_window_closed', { type: 'warn' });
}

async function startPoolSession(selection, options = {}) {
  const {
    state,
    ensureEligibleSelection,
    chooseRandomEntry,
    applyCurrentText,
    buildSessionEntry,
    setStage,
    continueArmingSession,
    log,
  } = options;

  try {
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

    const sessionEntry = buildSessionEntry('pool', selectedEntry);
    setStage('arming', { selectedEntry: sessionEntry });
    void continueArmingSession(sessionEntry);
    return { ok: true };
  } catch (err) {
    log.error('Reading-test pool session start failed:', err);
    throw err;
  }
}

async function startCurrentTextSession(options = {}) {
  const {
    state,
    hasCurrentText,
    buildSessionEntry,
    setStage,
    continueArmingSession,
    log,
  } = options;

  try {
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
  } catch (err) {
    log.error('Reading-test current-text session start failed:', err);
    throw err;
  }
}

function handleFlotanteCommand(cmd, options = {}) {
  const {
    state,
    startArmedSession,
    cancelActiveSession,
    finishRunningSession,
    log,
  } = options;

  if (!isArmingOrRunningSession(state)) return false;
  if (!cmd || typeof cmd.cmd !== 'string') return true;

  if (state.stage === 'arming') {
    if (cmd.cmd === 'toggle') {
      startArmedSession();
      return true;
    }
    if (cmd.cmd === 'reset') {
      cancelActiveSession('renderer.alerts.reading_test_cancelled', { type: 'warn' });
      return true;
    }
    if (cmd.cmd === 'set') {
      log.warnOnce(
        'reading_test_session.flotante_set_blocked',
        'Reading-test floating set command ignored while session is active.'
      );
    }
    return true;
  }

  if (cmd.cmd === 'toggle') {
    void finishRunningSession();
    return true;
  }

  if (cmd.cmd === 'reset') {
    cancelActiveSession('renderer.alerts.reading_test_cancelled', { type: 'warn' });
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

function handleEditorClosed(options = {}) {
  handleUnexpectedWindowClosed('suppressUnexpectedEditorClose', options);
}

function handleFlotanteClosed(options = {}) {
  handleUnexpectedWindowClosed('suppressUnexpectedFlotanteClose', options);
}

// =============================================================================
// Exports / module surface
// =============================================================================

module.exports = {
  clearSessionTextIfNeeded,
  failArmingSession,
  continueArmingSession,
  startArmedSession,
  computeCurrentWpm,
  buildPrefilledPresetPayload,
  beginPresetStep,
  finishRunningSession,
  resetAndCloseActiveSession,
  cancelActiveSession,
  startPoolSession,
  startCurrentTextSession,
  handleFlotanteCommand,
  handleEditorClosed,
  handleFlotanteClosed,
};

// =============================================================================
// End of electron/reading_test_session_flow.js
// =============================================================================
