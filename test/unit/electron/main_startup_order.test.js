'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const mainSource = fs.readFileSync(
  path.resolve(__dirname, '../../../electron/main.js'),
  'utf8'
).replace(/\r\n/g, '\n');

function sourceSection(startMarker, endMarker) {
  const start = mainSource.indexOf(startMarker);
  const end = mainSource.indexOf(endMarker, start);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
  return mainSource.slice(start, end);
}

function countFunctionCalls(source, functionName) {
  const callPattern = new RegExp(`\\b${functionName}\\s*\\(`, 'g');
  return [...source.matchAll(callPattern)].length;
}

test('main startup owns one initial menu installation before main-window construction', () => {
  const createMainWindow = sourceSection(
    'function createMainWindow()',
    '/**\n * Create the Text Editor window'
  );
  const resolveLanguage = sourceSection(
    'function resolveLanguage(reason)',
    '// =============================================================================\n// Floating Stopwatch'
  );

  assert.equal(countFunctionCalls(createMainWindow, 'buildAppMenu'), 0);
  assert.equal(countFunctionCalls(resolveLanguage, 'buildAppMenu'), 1);
  assert.ok(
    resolveLanguage.indexOf('buildAppMenu();') < resolveLanguage.indexOf('createMainWindow();'),
    'initial menu installation must precede main-window construction'
  );
  assert.match(
    resolveLanguage,
    /Initial application-menu installation[\s\S]*startup_menu_installation_failure_message/
  );
  assert.match(
    resolveLanguage,
    /Main BrowserWindow construction[\s\S]*startup_main_window_failure_message/
  );
});

test('first-run selection persists before startup owns its initial menu installation', () => {
  const bootstrap = sourceSection(
    'settingsState.registerIpc(ipcMain, {',
    "app.on('activate', () => {"
  );

  assert.match(bootstrap, /shouldRebuildAppMenu: \(\) => languageResolved/);
  assert.match(bootstrap, /resolveLanguage\('selected'\)/);
});

test('main startup terminates an initial main-document failure after resolving initial current-text processing', () => {
  const createMainWindow = sourceSection(
    'function createMainWindow()',
    '/**\n * Create the Text Editor window'
  );
  const termination = sourceSection(
    'function settleInitialCurrentTextProcessingForStartupFailure()',
    '/**\n * Developer-only global shortcuts'
  );

  assert.match(createMainWindow, /initialMainDocumentLoad\.catch/);
  assert.match(createMainWindow, /startup_main_document_failure_message/);
  assert.match(termination, /action !== 'initial_load'/);
  assert.match(termination, /requestId: processingState\.requestId/);
  assert.match(termination, /ok: false/);
  assert.match(termination, /app\.quit\(\)/);
});

test('macOS activation cannot recreate a window after startup is terminal', () => {
  const activation = sourceSection(
    "app.on('activate', () => {",
    '});\n\n// Windows/Linux behavior'
  );

  assert.match(activation, /startupTerminalFailure/);
  assert.match(activation, /!languageResolved/);
  assert.match(activation, /Main BrowserWindow construction during activation/);
});
