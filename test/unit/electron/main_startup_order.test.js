'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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

function createMainDecoratorHarness({ decorateSpellcheck, getSnapshotTagPreferences, onSend = () => undefined }) {
  const sentEvents = [];
  let publicationOptions = null;
  const noop = () => undefined;
  const logger = {
    debug: noop,
    error: noop,
    info: noop,
    warn: noop,
    warnOnce: noop,
  };

  class MockBrowserWindow {
    constructor() {
      this.webContents = {
        on: noop,
        removeListener: noop,
        reload: noop,
        reloadIgnoringCache: noop,
        send: (...args) => {
          onSend(...args);
          sentEvents.push(args);
        },
        toggleDevTools: noop,
      };
    }

    isDestroyed() {
      return false;
    }

    loadFile() {
      return {
        catch: noop,
        then: noop,
      };
    }

    on() {
      return this;
    }
  }

  const noopModule = new Proxy({}, {
    get: () => noop,
  });
  const app = {
    getAppPath: () => 'test-app-path',
    isPackaged: true,
    on: noop,
    quit: noop,
    whenReady: () => ({
      then: (callback) => {
        callback();
        return { catch: noop };
      },
    }),
  };
  const modules = new Map([
    ['electron', {
      app,
      BrowserWindow: MockBrowserWindow,
      dialog: {},
      globalShortcut: {},
      ipcMain: { handle: noop, on: noop, once: noop },
      screen: {},
      shell: {},
    }],
    ['path', path],
    ['./log', { get: () => logger }],
    ['./app_temp_paths', { cleanupRuntimeTempRoot: noop }],
    ['./constants_main', {
      DEFAULT_LANG: 'es',
      MAX_IPC_CHARS: 1,
      MAX_META_STR_CHARS: 1,
      MAX_TEXT_CHARS: 1,
    }],
    ['./fs_storage', {
      createJsonStrict: noop,
      createSettingsStartupBackup: noop,
      ensureConfigDir: noop,
      getBundledOcrGoogleDriveCredentialsFile: noop,
      getCurrentTextFile: noop,
      getOcrGoogleDriveCredentialsFile: noop,
      getOcrGoogleDriveTokenFile: noop,
      getSettingsFile: noop,
      getSnapshotTagsFile: noop,
      initStorage: noop,
      loadJson: noop,
      loadJsonWithStatus: noop,
      saveJson: noop,
      saveJsonDirect: noop,
      saveJsonStrict: noop,
    }],
    ['./language_resources', { initialize: noop }],
    ['./menu_builder', {
      buildAppMenu: noop,
      initializeDefaultMainTranslations: noop,
    }],
    ['./settings', {
      configurePublication: (options) => {
        publicationOptions = options;
      },
      getSettings: () => ({ language: 'en' }),
      init: () => ({ language: 'en' }),
      registerIpc: noop,
    }],
    ['./snapshot_tag_settings', {
      getSnapshotTagPreferences,
      init: noop,
      registerIpc: noop,
    }],
    ['./editor_window_lifecycle', {
      createController: () => ({
        hasLiveWebContents: (window) => !!window && !window.isDestroyed(),
        isAliveWindow: (window) => !!window && !window.isDestroyed(),
      }),
      hasLiveWebContents: (window) => !!window && !window.isDestroyed(),
      isAliveWindow: (window) => !!window && !window.isDestroyed(),
    }],
    ['./reading_test_pool', { synchronizeBundledPoolContent: () => ({ ok: true }) }],
    ['./reading_test_session', {
      createController: () => ({
        isInteractionLocked: () => false,
        registerIpc: noop,
      }),
    }],
    ['./spellcheck', {
      createController: () => ({
        apply: noop,
        decorateSettings: decorateSpellcheck,
      }),
    }],
    ['./link_openers', { registerLinkIpc: noop }],
    ['../public/js/lib/stopwatch_time_core', {
      createStopwatchTimeUtils: () => ({ formatStopwatchMs: noop }),
    }],
    ['./text_extraction_platform/ocr_google_drive_bundled_credentials', {
      materializeBundledCredentials: noop,
    }],
  ]);

  for (const request of [
    './text_state',
    './current_text_processing_state_ipc',
    './current_text_processing_main_bridge',
    './editor_state',
    './editor_find_main',
    './task_editor_state',
    './task_editor_window_lifecycle',
    './presets_main',
    './current_text_snapshots_main',
    './tasks_main',
    './reading_test_pool_import',
    './updater',
    './text_extraction_platform/text_extraction_file_picker_ipc',
    './text_extraction_platform/text_extraction_preconditions_ipc',
    './text_extraction_platform/text_extraction_processing_mode_ipc',
    './text_extraction_platform/text_extraction_ocr_activation_ipc',
    './text_extraction_platform/text_extraction_ocr_disconnect_ipc',
    './text_extraction_platform/text_extraction_pdf_inspect_ipc',
    './text_extraction_platform/text_extraction_prepare_ipc',
    './text_extraction_platform/text_extraction_execute_prepared_ipc',
    './text_extraction_platform/text_extraction_generated_pdf_reveal_ipc',
  ]) {
    modules.set(request, noopModule);
  }

  vm.runInNewContext(mainSource, {
    __dirname: path.resolve(__dirname, '../../../electron'),
    __filename: path.resolve(__dirname, '../../../electron/main.js'),
    clearInterval,
    console,
    process: { env: {}, platform: 'win32' },
    require: (request) => {
      assert.ok(modules.has(request), `Unexpected main.js dependency: ${request}`);
      return modules.get(request);
    },
    setInterval,
    setTimeout,
  }, { filename: 'electron/main.js' });

  assert.ok(publicationOptions, 'main startup must configure settings publication');
  return {
    decorateSettings: publicationOptions.decorateSettings,
    sentEvents,
  };
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
    '// Windows/Linux behavior: quit when the last window is closed.'
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

test('renderer settings decoration isolates spellcheck availability without weakening required snapshot-tag delivery', () => {
  const decoration = sourceSection(
    'function decorateRendererSettings(settingsPayload) {',
    '/**\n * Rebuild the application menu'
  );

  assert.match(decoration, /try \{[\s\S]*?spellcheckController\.decorateSettings\(settingsPayload\)/);
  assert.match(decoration, /spellcheckAvailable: false/);
  assert.match(decoration, /snapshotTags: snapshotTagSettings\.getSnapshotTagPreferences\(\)/);
  assert.match(decoration, /if \(spellcheckAvailabilityFailed\) notifySpellcheckAvailabilityFailure\(\)/);
  assert.ok(
    decoration.indexOf('snapshotTags: snapshotTagSettings.getSnapshotTagPreferences()')
      < decoration.indexOf('if (spellcheckAvailabilityFailed) notifySpellcheckAvailabilityFailure()'),
    'notification follows complete aggregate composition'
  );
});

test('configured settings publication dynamically contains spellcheck availability failures', () => {
  const settings = { language: 'en', theme: 'default' };
  const snapshotTags = { source: 'manual', tags: ['focus'] };

  {
    const harness = createMainDecoratorHarness({
      decorateSpellcheck: (payload) => ({ ...payload, spellcheckAvailable: false }),
      getSnapshotTagPreferences: () => snapshotTags,
    });

    assert.deepEqual({ ...harness.decorateSettings(settings) }, {
      ...settings,
      spellcheckAvailable: false,
      snapshotTags,
    });
    assert.deepEqual(harness.sentEvents, []);
  }

  {
    let snapshotTagsRead = false;
    const harness = createMainDecoratorHarness({
      decorateSpellcheck: () => {
        throw new Error('spellcheck service failed');
      },
      getSnapshotTagPreferences: () => {
        snapshotTagsRead = true;
        return snapshotTags;
      },
      onSend: () => assert.equal(snapshotTagsRead, true),
    });

    assert.deepEqual({ ...harness.decorateSettings(settings) }, {
      ...settings,
      spellcheckAvailable: false,
      snapshotTags,
    });
    assert.equal(snapshotTagsRead, true);
    assert.deepEqual(harness.sentEvents, [['spellcheck-availability-failed']]);
  }

  {
    const snapshotFailure = new Error('snapshot-tag settings unavailable');
    const harness = createMainDecoratorHarness({
      decorateSpellcheck: () => {
        throw new Error('spellcheck service failed');
      },
      getSnapshotTagPreferences: () => {
        throw snapshotFailure;
      },
    });

    assert.throws(
      () => harness.decorateSettings(settings),
      (error) => error === snapshotFailure
    );
    assert.deepEqual(harness.sentEvents, []);
  }
});

test('Main Window lifecycle has no activation-based replacement generation', () => {
  assert.doesNotMatch(mainSource, /app\.on\('activate'/);
  assert.match(mainSource, /mainWin\.on\('closed',[\s\S]*?app\.quit\(\)/);
});

test('first-run Language Window startup disclosures explicitly use the default presentation language', () => {
  const languageWindow = sourceSection(
    'function createLanguageWindow() {',
    'function maybeMarkMainInvariantsReady() {'
  );

  assert.match(
    languageWindow,
    /const dialogLanguage = isFirstRunLanguageChooser\s*\? DEFAULT_LANG\s*:\s*getSelectedLanguage\(\);/
  );
  assert.match(
    languageWindow,
    /Initial fallback-language persistence[\s\S]*?language: DEFAULT_LANG/
  );
  assert.match(
    languageWindow,
    /Initial Language Window structural setup[\s\S]*?language: DEFAULT_LANG/
  );
});
