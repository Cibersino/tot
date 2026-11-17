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

test('required pre-i18n startup failures disclose in fixed Spanish and quit before later startup work', () => {
  const earlyTermination = sourceSection(
    'function showEarlyRequiredStartupFailureNotice()',
    'function showStartupFailureDisclosure('
  );
  const bootstrap = sourceSection(
    'app.whenReady().then(() => {',
    "app.on('window-all-closed', () => {"
  );

  assert.match(earlyTermination, /title: 'Problema de la aplicación'/);
  assert.match(earlyTermination, /message: 'No se pudo iniciar toT\. La aplicación se cerrará\.'/);
  assert.match(earlyTermination, /buttons: \['Aceptar'\]/);
  assert.match(earlyTermination, /Early required startup failure native notice failed:/);
  assert.match(earlyTermination, /app\.quit\(\)/);
  assert.match(bootstrap, /logMessage: 'Storage init failed:'/);
  assert.match(bootstrap, /logMessage: 'Required language catalog initialization failed:'/);
  assert.match(bootstrap, /logMessage: 'Required default main translations unavailable; startup terminated:'/);
  assert.ok(
    bootstrap.indexOf('initStorage(app)') < bootstrap.indexOf('settingsState.init({'),
    'storage initialization must occur before settings initialization'
  );
  assert.ok(
    bootstrap.indexOf('initializeDefaultMainTranslations()') < bootstrap.indexOf('textState.init({'),
    'default main translations must be established before current-text initialization'
  );
});

test('main startup lifecycle diagnostics follow the ready and interaction boundaries', () => {
  const readyAuthorization = sourceSection(
    'function maybeAuthorizeStartupReady() {',
    'function handleRendererStartupFailure('
  );
  const splashAcknowledgment = sourceSection(
    'function handleSplashRemoved(event) {',
    'function showEditorStartupFailureDisclosure('
  );
  const bootstrap = sourceSection(
    'app.whenReady().then(() => {',
    "app.on('window-all-closed', () => {"
  );

  const electronReadyLog = "log.info('Main startup: Electron ready; initializing required services.');";
  const servicesReadyLog = "log.info('Main startup: required services initialized and IPC registration complete.');";
  const rendererReadyLog = "log.info('Main startup: READY granted to initial renderer; awaiting splash acknowledgment.');";
  const interactiveLog = "log.info('Main startup: initial splash acknowledged; main interaction enabled.');";

  assert.notEqual(bootstrap.indexOf(electronReadyLog), -1);
  assert.notEqual(bootstrap.indexOf(servicesReadyLog), -1);
  assert.notEqual(readyAuthorization.indexOf(rendererReadyLog), -1);
  assert.notEqual(splashAcknowledgment.indexOf(interactiveLog), -1);
  assert.ok(bootstrap.indexOf(electronReadyLog) < bootstrap.indexOf('initStorage(app)'));
  assert.ok(bootstrap.indexOf('textState.init({') < bootstrap.indexOf(servicesReadyLog));
  assert.ok(readyAuthorization.indexOf('mainReadyState = \'READY\';') < readyAuthorization.indexOf(rendererReadyLog));
  assert.ok(splashAcknowledgment.indexOf('menuEnabled = true;') < splashAcknowledgment.indexOf(interactiveLog));
});

test('first-run selection defers settings-side menu rebuilding to the startup resolver', () => {
  const settingsRegistration = sourceSection(
    'settingsState.registerIpc(ipcMain, {',
    "startupRegistrationOperation = 'snapshot-tag settings IPC registration';"
  );
  const firstRunSelection = sourceSection(
    '  // First run: show language picker before creating the main window.',
    '  // macOS behavior: recreate a window when clicking the dock icon and none are open.'
  );
  const languageSelectionHandler = sourceSection(
    '    languageSelectionHandler = () => {',
    "    ipcMain.once('language-selected', languageSelectionHandler);"
  );

  assert.match(
    settingsRegistration,
    /settingsState\.registerIpc\(ipcMain, \{\s*buildAppMenu,\s*shouldRebuildAppMenu: \(\) => languageResolved,\s*\}\);/
  );
  assert.match(
    firstRunSelection,
    /ipcMain\.once\('language-selected', languageSelectionHandler\);/
  );
  assert.match(languageSelectionHandler, /resolveLanguage\('selected'\)/);
  assert.doesNotMatch(languageSelectionHandler, /\bbuildAppMenu\s*\(/);
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

test('initial main-renderer i18n failure uses managed startup termination before READY', () => {
  const rendererI18nFailure = sourceSection(
    'function closeRendererAfterI18nFailure(event, payload)',
    'function resolveLanguage(reason)'
  );

  assert.match(rendererI18nFailure, /sourceWindow === mainWin/);
  assert.match(rendererI18nFailure, /failureKind === 'startup'/);
  assert.match(rendererI18nFailure, /failureKind === 'startup-api'/);
  assert.match(rendererI18nFailure, /mainReadyState === 'PRE_READY'/);
  assert.match(rendererI18nFailure, /terminateAfterRequiredStartupFailure/);
  assert.match(rendererI18nFailure, /startup_renderer_i18n_failure_message/);
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
