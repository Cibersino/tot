// electron/import_ocr/platform/process_control.js
'use strict';

const { spawn } = require('child_process');

function normalizePid(child) {
  if (!child || typeof child.pid !== 'number' || child.pid <= 0) return 0;
  return child.pid;
}

function terminateProcessGracefully(child) {
  const pid = normalizePid(child);
  if (!pid || typeof child.kill !== 'function') {
    return { ok: false, code: 'OCR_PROCESS_INVALID', message: 'Invalid child process.' };
  }
  try {
    const sent = child.kill('SIGTERM');
    return { ok: !!sent, pid };
  } catch (err) {
    return { ok: false, code: 'OCR_PROCESS_TERMINATE_FAILED', message: String(err), pid };
  }
}

function killProcessTree(child) {
  const pid = normalizePid(child);
  if (!pid) {
    return { ok: false, code: 'OCR_PROCESS_INVALID', message: 'Invalid child process.' };
  }

  if (process.platform === 'win32') {
    try {
      const killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore',
      });
      return { ok: true, pid, via: 'taskkill', child: killer };
    } catch (err) {
      return { ok: false, code: 'OCR_PROCESS_KILL_FAILED', message: String(err), pid };
    }
  }

  try {
    // Negative PID targets the process group when available.
    process.kill(-pid, 'SIGKILL');
    return { ok: true, pid, via: 'group' };
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
      return { ok: true, pid, via: 'pid' };
    } catch (err) {
      return { ok: false, code: 'OCR_PROCESS_KILL_FAILED', message: String(err), pid };
    }
  }
}

function waitForProcessExit(child, timeoutMs = 0) {
  return new Promise((resolve) => {
    if (!child) {
      resolve(false);
      return;
    }

    if (child.exitCode !== null || child.signalCode !== null) {
      resolve(true);
      return;
    }

    let done = false;
    const finish = (exited) => {
      if (done) return;
      done = true;
      resolve(!!exited);
    };

    const onExit = () => finish(true);
    child.once('exit', onExit);

    if (timeoutMs > 0) {
      setTimeout(() => {
        try {
          child.removeListener('exit', onExit);
        } catch {
          // no-op
        }
        finish(false);
      }, timeoutMs);
    }
  });
}

async function terminateWithEscalation(
  child,
  {
    gracefulWaitMs = 2000,
    forceWaitMs = 5000,
  } = {}
) {
  const graceful = terminateProcessGracefully(child);
  const exitedAfterGrace = await waitForProcessExit(child, gracefulWaitMs);
  if (exitedAfterGrace) {
    return {
      ok: true,
      code: 'OCR_CANCELED',
      stage: graceful.ok ? 'graceful' : 'already_exited',
      graceful,
    };
  }

  const forced = killProcessTree(child);
  const exitedAfterForce = await waitForProcessExit(child, forceWaitMs);
  if (exitedAfterForce) {
    return {
      ok: true,
      code: 'OCR_CANCELED',
      stage: 'forced',
      graceful,
      forced,
    };
  }

  return {
    ok: false,
    code: 'OCR_CANCEL_KILL_TIMEOUT',
    message: 'Process did not exit after graceful terminate + forced kill.',
    graceful,
    forced,
  };
}

module.exports = {
  terminateProcessGracefully,
  killProcessTree,
  waitForProcessExit,
  terminateWithEscalation,
};

// =============================================================================
// End of electron/import_ocr/platform/process_control.js
// =============================================================================
