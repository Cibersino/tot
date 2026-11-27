// electron/application_termination.js
'use strict';

// Coordinates the normal interactive exit while Main still owns its windows.
function createController({
  isReady,
  getMainWindow,
  getTaskWindow,
  requestTaskClose,
  extractionCommand,
  abortExtraction,
  terminateReadingTest,
  getDependentWindows,
  closeDependentWindow = (win) => win.close(),
  setInteractionHeld,
  quit,
  reportFailure,
  log,
  closeTimeoutMs = 5000,
}) {
  let attempt = null;
  let handoff = false;

  function isAlive(win) {
    return !!(win && !win.isDestroyed());
  }

  function observeClosed(win) {
    let resolveClosed;
    const closed = new Promise((resolve) => { resolveClosed = resolve; });
    const onClosed = () => resolveClosed(true);
    win.once('closed', onClosed);
    if (!isAlive(win)) onClosed();
    return { closed, dispose: () => win.removeListener('closed', onClosed) };
  }

  async function waitForClose(win, observation) {
    if (!isAlive(win)) return true;
    let timer;
    try {
      return await Promise.race([
        observation.closed,
        new Promise((resolve) => { timer = setTimeout(() => resolve(false), closeTimeoutMs); }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async function closeWindow(win) {
    if (!isAlive(win)) return;
    const observation = observeClosed(win);
    try {
      closeDependentWindow(win);
      if (!(await waitForClose(win, observation)) || isAlive(win)) {
        throw new Error('Dependent window did not close');
      }
    } finally {
      observation.dispose();
    }
  }

  async function runAttempt() {
    let admitted = false;
    try {
      await extractionCommand('begin');
      const task = getTaskWindow();
      if (isAlive(task)) {
        const observation = observeClosed(task);
        try {
          const allowed = await requestTaskClose(getMainWindow());
          if (!allowed) return;
          if (!(await waitForClose(task, observation)) || isAlive(task)) {
            throw new Error('Task Editor approved close but did not close');
          }
        } finally {
          observation.dispose();
        }
      }
      admitted = true;
      setInteractionHeld(true);
      await extractionCommand('admit');
      const abortResult = abortExtraction();
      if (abortResult && abortResult.ok === false) {
        throw new Error('Extraction cancellation could not be requested');
      }
      await extractionCommand('settle');
      terminateReadingTest();
      for (const win of getDependentWindows()) await closeWindow(win);
      if (getDependentWindows().some(isAlive)) {
        throw new Error('Dependent window remained open after termination');
      }
      handoff = true;
      quit();
    } catch (error) {
      handoff = false;
      log.error('Application termination failed:', error);
      reportFailure(error, { admitted });
    } finally {
      if (!handoff) {
        setInteractionHeld(false);
        try {
          await extractionCommand('release');
        } catch (error) {
          log.error('Could not restore extraction communication:', error);
        }
      }
    }
  }

  function handleEvent(event) {
    if (handoff || !isReady() || !isAlive(getMainWindow())) return;
    event.preventDefault();
    if (attempt) return;
    attempt = runAttempt().finally(() => { attempt = null; });
  }

  return { handleEvent, isHandedOff: () => handoff };
}

module.exports = { createController };

// =============================================================================
// End of electron/application_termination.js
// =============================================================================
