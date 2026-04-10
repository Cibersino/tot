// electron/reading_test_session_windows.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Reading-test window helpers.
// Responsibilities:
// - Wait for editor/flotante window readiness and visibility.
// - Open the reading session windows.
// - Start the editor countdown handshake.
// - Open the questions modal window.
// =============================================================================

const { BrowserWindow } = require('electron');

function hasLiveWebContents(win) {
  return !!(win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed());
}

function waitForWindowVisible(win, label, log, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (!win || win.isDestroyed()) {
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

function isWindowMainFrameLoading(win) {
  if (!hasLiveWebContents(win)) {
    return false;
  }

  return typeof win.webContents.isLoadingMainFrame === 'function'
    ? win.webContents.isLoadingMainFrame()
    : win.webContents.isLoading();
}

function waitForWindowRendererLoad(win, label, log, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (!hasLiveWebContents(win)) {
      reject(new Error(`READING_TEST_${label}_WINDOW_UNAVAILABLE`));
      return;
    }

    const { webContents } = win;
    if (!isWindowMainFrameLoading(win)) {
      resolve();
      return;
    }

    let settled = false;
    let timeoutId = null;

    const cleanup = () => {
      try {
        webContents.removeListener('did-finish-load', handleDidFinishLoad);
        webContents.removeListener('destroyed', handleDestroyed);
        win.removeListener('closed', handleClosed);
      } catch (err) {
        log.warn(`Reading-test ${label} renderer-load cleanup failed (ignored):`, err);
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

    const handleDidFinishLoad = () => settle();
    const handleDestroyed = () => settle(new Error(`READING_TEST_${label}_WINDOW_WEB_CONTENTS_DESTROYED`));
    const handleClosed = () => settle(new Error(`READING_TEST_${label}_WINDOW_CLOSED`));

    webContents.once('did-finish-load', handleDidFinishLoad);
    webContents.once('destroyed', handleDestroyed);
    win.once('closed', handleClosed);
    timeoutId = setTimeout(() => {
      settle(new Error(`READING_TEST_${label}_WINDOW_LOAD_TIMEOUT`));
    }, timeoutMs);
  });
}

async function openReadingSessionWindows(options = {}) {
  const {
    resetCrono,
    ensureEditorWindow,
    ensureFlotanteWindow,
    log,
    timeoutMs,
  } = options;

  resetCrono();
  const editorWin = ensureEditorWindow({ deferShow: true });
  const flotanteWin = await ensureFlotanteWindow();
  await Promise.all([
    waitForWindowRendererLoad(editorWin, 'EDITOR', log, timeoutMs),
    waitForWindowVisible(flotanteWin, 'FLOTANTE', log, timeoutMs),
  ]);

  return { editorWin, flotanteWin };
}

function startEditorCountdown(editorWin, options = {}) {
  const {
    buildCountdownToken,
    pendingCountdownReadyAcks,
    log,
    countdownReadyTimeoutMs,
    prestartCountdownSeconds,
    prestartCountdownStepMs,
  } = options;

  return new Promise((resolve, reject) => {
    if (!hasLiveWebContents(editorWin)) {
      reject(new Error('READING_TEST_EDITOR_COUNTDOWN_WINDOW_UNAVAILABLE'));
      return;
    }

    const { webContents } = editorWin;
    const token = buildCountdownToken();
    let settled = false;
    let timeoutId = null;

    const cleanup = () => {
      pendingCountdownReadyAcks.delete(token);
      try {
        editorWin.removeListener('closed', handleClosed);
        webContents.removeListener('destroyed', handleDestroyed);
      } catch (err) {
        log.warn('Reading-test countdown ack cleanup failed (ignored):', err);
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

    const handleClosed = () => settle(new Error('READING_TEST_EDITOR_COUNTDOWN_WINDOW_CLOSED'));
    const handleDestroyed = () => settle(new Error('READING_TEST_EDITOR_COUNTDOWN_WEB_CONTENTS_DESTROYED'));

    pendingCountdownReadyAcks.set(token, {
      sender: webContents,
      settle,
    });

    editorWin.once('closed', handleClosed);
    webContents.once('destroyed', handleDestroyed);
    timeoutId = setTimeout(() => {
      settle(new Error('READING_TEST_EDITOR_COUNTDOWN_READY_TIMEOUT'));
    }, countdownReadyTimeoutMs);

    try {
      webContents.send('reading-test-prestart-countdown', {
        seconds: prestartCountdownSeconds,
        stepMs: prestartCountdownStepMs,
        token,
      });
    } catch (err) {
      settle(err);
    }
  });
}

function openQuestionsWindow(questions, options = {}) {
  const {
    resolveMainWindow,
    log,
    questionsWindowPreload,
    questionsWindowHtml,
    developerEmail,
  } = options;

  return new Promise((resolve) => {
    function tryCloseWindowIfAlive(winToClose) {
      try {
        if (!winToClose.isDestroyed()) winToClose.close();
      } catch (closeErr) {
        log.warn('Reading-test questions window forced close failed (ignored):', closeErr);
      }
    }

    const mainWin = resolveMainWindow();
    if (!mainWin || mainWin.isDestroyed()) {
      log.warn('Reading-test questions window unavailable (ignored): main window unavailable.');
      resolve({ ok: false, code: 'MAIN_WINDOW_UNAVAILABLE' });
      return;
    }

    let settled = false;
    let win = null;

    const settle = (result) => {
      if (settled) return false;
      settled = true;
      resolve(result);
      return true;
    };

    try {
      win = new BrowserWindow({
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
          preload: questionsWindowPreload,
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
    } catch (err) {
      log.warn('Reading-test questions window create failed (ignored):', err);
      settle({ ok: false, code: 'QUESTIONS_WINDOW_CREATE_FAILED' });
      return;
    }

    win.setMenu(null);
    win.once('ready-to-show', () => {
      if (settled || win.isDestroyed()) return;
      win.show();
      try {
        win.webContents.send('reading-test-questions-init', {
          developerEmail,
          questions,
        });
      } catch (err) {
        log.warn('Reading-test questions init failed (ignored):', err);
        if (settle({ ok: false, code: 'QUESTIONS_WINDOW_INIT_FAILED' })) {
          tryCloseWindowIfAlive(win);
        }
      }
    });

    win.on('closed', () => {
      if (settled) return;
      settle({ ok: true });
    });

    win.loadFile(questionsWindowHtml).catch((err) => {
      log.warn('Reading-test questions window load failed (ignored):', err);
      if (settle({ ok: false, code: 'QUESTIONS_WINDOW_LOAD_FAILED' })) {
        tryCloseWindowIfAlive(win);
      }
    });
  });
}

module.exports = {
  waitForWindowVisible,
  waitForWindowRendererLoad,
  openReadingSessionWindows,
  startEditorCountdown,
  openQuestionsWindow,
};

// =============================================================================
// End of electron/reading_test_session_windows.js
// =============================================================================
