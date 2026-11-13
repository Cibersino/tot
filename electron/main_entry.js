// electron/main_entry.js
'use strict';

// This entry point deliberately owns only the synchronous evaluation boundary around main.js.
// Later startup failures remain owned by main.js and retain their managed application-quit lifecycle.

const { app, dialog } = require('electron');

const MAIN_ENTRY_FAILURE_TITLE = 'toT no pudo iniciarse';
const MAIN_ENTRY_FAILURE_MESSAGE = 'No se pudo iniciar toT. La aplicación se cerrará.';

function describeError(error) {
  try {
    if (error && typeof error.stack === 'string' && error.stack.trim()) {
      return error.stack.trim();
    }
  } catch {}

  try {
    return String(error);
  } catch {
    return '[unavailable error details]';
  }
}

function writeEarlyDiagnostic(message) {
  try {
    process.stderr.write(`${message}\n`);
  } catch {
    try {
      console.error(message);
    } catch {}
  }
}

function handleMainLoadFailure(error) {
  writeEarlyDiagnostic(`Fatal error while loading Main entry point:\n${describeError(error)}`);

  try {
    dialog.showErrorBox(MAIN_ENTRY_FAILURE_TITLE, MAIN_ENTRY_FAILURE_MESSAGE);
  } catch (noticeError) {
    writeEarlyDiagnostic(`Main entry failure notice could not be displayed:\n${describeError(noticeError)}`);
  }

  try {
    app.exit(1);
  } catch (exitError) {
    writeEarlyDiagnostic(`Main entry failure could not exit through Electron:\n${describeError(exitError)}`);
  }

  process.exit(1);
}

try {
  require('./main');
} catch (error) {
  handleMainLoadFailure(error);
}
