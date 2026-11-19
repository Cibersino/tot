'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const {
  installElectronModuleMock,
} = require('../../helpers/electron_module_mock');

function loadFreshMenuBuilder(t, electronOverrides = {}) {
  const modulePath = path.resolve(__dirname, '../../../electron/menu_builder.js');
  const baseMenu = {
    buildFromTemplate() {
      return {};
    },
    setApplicationMenu() {},
  };
  const baseBrowserWindow = {
    getFocusedWindow() {
      return null;
    },
  };
  t.after(installElectronModuleMock({
    ...electronOverrides,
    app: {
      isPackaged: true,
      ...(electronOverrides.app || {}),
    },
    Menu: {
      ...baseMenu,
      ...(electronOverrides.Menu || {}),
    },
    BrowserWindow: {
      ...baseBrowserWindow,
      ...(electronOverrides.BrowserWindow || {}),
    },
  }));
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function createLogDouble() {
  return {
    warnCalls: [],
    warn(...args) {
      this.warnCalls.push(args);
    },
  };
}

function withPlatform(t, platform) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
    enumerable: originalDescriptor.enumerable,
    writable: false,
  });
  t.after(() => {
    Object.defineProperty(process, 'platform', originalDescriptor);
  });
}

test('resolveDialogText uses the caller-injected logger for missing dialog keys', (t) => {
  const menuBuilder = loadFreshMenuBuilder(t);
  const log = createLogDouble();

  const result = menuBuilder.resolveDialogText({}, 'continue_button', 'Continue', {
    log,
  });

  assert.equal(result, 'Continue');
  assert.deepEqual(log.warnCalls, [
    ['Missing dialog translation key (using fallback):', 'continue_button'],
  ]);
});

test('resolveDialogText requires caller-injected warn logging', (t) => {
  const menuBuilder = loadFreshMenuBuilder(t);

  assert.throws(
    () => menuBuilder.resolveDialogText({}, 'continue_button', 'Continue'),
    /\[menu_builder\] resolveDialogText requires opts\.log\.warn/
  );
});

test('getDialogTexts provides distinct terminal copy for settings-listener failure', (t) => {
  const menuBuilder = loadFreshMenuBuilder(t);

  const dialogTexts = menuBuilder.getDialogTexts('en');

  assert.equal(dialogTexts.interface_problem_title, 'Interface problem');

  assert.equal(
    dialogTexts.renderer_settings_listener_failure_message,
    'The interface could not establish the required settings synchronization. The window will close.'
  );
  assert.equal(
    dialogTexts.renderer_i18n_failure_message,
    'The interface could not load its required language resources. The window will close.'
  );
});

test('getDialogTexts provides generic context titles with self-contained update and editor messages', (t) => {
  const menuBuilder = loadFreshMenuBuilder(t);

  const dialogTexts = menuBuilder.getDialogTexts('en');

  assert.equal(dialogTexts.update_title, 'Update');
  assert.equal(
    dialogTexts.update_failed_message,
    'toT could not check for updates. Check your connection and try again.'
  );
  assert.equal(dialogTexts.text_editor_problem_title, 'Text Editor problem');
  assert.equal(
    dialogTexts.editor_startup_timeout_message,
    'The Text Editor did not complete startup in time and will close.'
  );
  assert.equal(dialogTexts.window_problem_title, 'Window problem');
});

test('getDialogTexts provides Calculator initial-document failure copy', (t) => {
  const menuBuilder = loadFreshMenuBuilder(t);

  const dialogTexts = menuBuilder.getDialogTexts('en');

  assert.equal(
    dialogTexts.text_time_calculator_initial_document_failure_message,
    'The quick calculator could not load and will close.'
  );
});

test('getDialogTexts provides Preset modal initial-document failure copy', (t) => {
  const menuBuilder = loadFreshMenuBuilder(t);

  const dialogTexts = menuBuilder.getDialogTexts('en');

  assert.equal(
    dialogTexts.preset_modal_initial_document_failure_message,
    'The preset window could not load and will close.'
  );
});

test('getDialogTexts provides first-run Language chooser failure copy', (t) => {
  const menuBuilder = loadFreshMenuBuilder(t);

  const dialogTexts = menuBuilder.getDialogTexts('en');

  assert.equal(
    dialogTexts.language_chooser_first_run_initial_document_failure_message,
    'The language chooser could not load. Startup will continue with the fallback language.'
  );
  assert.equal(
    dialogTexts.language_selection_problem_title,
    'Language selection problem'
  );
  assert.equal(
    dialogTexts.language_chooser_initial_document_failure_message,
    'The language chooser could not load.'
  );
  assert.equal(
    dialogTexts.language_chooser_first_run_bootstrap_failure_message,
    'toT could not complete language selection. It will try to continue with the fallback language.'
  );
  assert.equal(
    dialogTexts.startup_language_fallback_persistence_failure_message,
    'toT could not save the fallback language needed to start. The application will close.'
  );
  assert.equal(dialogTexts.application_problem_title, 'Application problem');
  assert.equal(
    dialogTexts.startup_language_chooser_setup_failure_message,
    'toT could not prepare the language selection needed to start. The application will close.'
  );
});

test('getDialogTexts provides Floating Stopwatch initial-document failure copy', (t) => {
  const menuBuilder = loadFreshMenuBuilder(t);

  const dialogTexts = menuBuilder.getDialogTexts('en');

  assert.equal(
    dialogTexts.floating_stopwatch_initial_document_failure_message,
    'The Floating Stopwatch could not load and will close.'
  );
});

test('getDialogTexts provides Editor Find initial-document failure copy', (t) => {
  const menuBuilder = loadFreshMenuBuilder(t);

  const dialogTexts = menuBuilder.getDialogTexts('en');

  assert.equal(
    dialogTexts.editor_find_initial_document_failure_message,
    'The find bar could not load and will close.'
  );
});

test('getDialogTexts provides terminal startup copy for required main-startup failures', (t) => {
  const menuBuilder = loadFreshMenuBuilder(t);

  const dialogTexts = menuBuilder.getDialogTexts('en');

  assert.equal(dialogTexts.application_problem_title, 'Application problem');

  assert.equal(
    dialogTexts.startup_menu_installation_failure_message,
    'The application menu could not be installed and the application will close.'
  );
  assert.equal(
    dialogTexts.startup_main_window_failure_message,
    'The main window could not be created and the application will close.'
  );
  assert.equal(
    dialogTexts.startup_settings_admission_failure_message,
    'toT cannot start because it cannot use the saved settings without changing them. The application will close.'
  );
  assert.equal(
    dialogTexts.startup_main_document_failure_message,
    'The main window could not load its initial document and the application will close.'
  );
  assert.equal(
    dialogTexts.startup_renderer_i18n_failure_message,
    'toT could not complete the language setup needed to start the interface. The application will close.'
  );
  assert.equal(
    dialogTexts.startup_registration_failure_message,
    'toT could not complete the setup needed to start. The application will close.'
  );

  for (const language of ['es', 'en']) {
    const localizedDialogTexts = menuBuilder.getDialogTexts(language);
    for (const key of [
      'application_problem_title',
      'startup_menu_installation_failure_message',
      'startup_main_window_failure_message',
      'startup_main_document_failure_message',
      'startup_renderer_i18n_failure_message',
      'startup_registration_failure_message',
    ]) {
      assert.equal(typeof localizedDialogTexts[key], 'string', `${language} ${key}`);
      assert.ok(localizedDialogTexts[key].trim(), `${language} ${key}`);
    }
  }
});

test('getDialogTexts resolves F-09 startup notices through the selected language or DEFAULT_LANG', (t) => {
  const menuBuilder = loadFreshMenuBuilder(t);

  const englishDialogTexts = menuBuilder.getDialogTexts('en');
  assert.equal(englishDialogTexts.application_problem_title, 'Application problem');
  assert.equal(
    englishDialogTexts.startup_snapshot_tags_initial_write_failure_message,
    'toT could not save the snapshot-tag preferences needed to start. The application will close.'
  );

  const defaultDialogTexts = menuBuilder.getDialogTexts('');
  assert.equal(defaultDialogTexts.application_problem_title, 'Problema de la aplicación');
  assert.equal(
    defaultDialogTexts.startup_snapshot_tags_admission_failure_message,
    'toT no puede recuperar de forma segura las preferencias de etiquetas de snapshots guardadas. La aplicación se cerrará sin modificarlas.'
  );
});

test('missing required default main bundle is terminal and does not use a selected root bundle', (t) => {
  let selectedRootRead = false;
  const menuBuilder = loadFreshMenuBuilder(t, {
    Menu: {
      buildFromTemplate() {
        throw new Error('Menu must not be built when default main translations are unavailable');
      },
    },
  });
  const defaultMainPath = path.resolve(__dirname, '../../../i18n/es/main.json');
  const selectedRootPath = path.resolve(__dirname, '../../../i18n/en/main.json');
  const originalReadFileSync = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', (filePath, ...args) => {
    const resolvedPath = path.resolve(String(filePath));
    if (resolvedPath === defaultMainPath) {
      const error = new Error('default main bundle unavailable');
      error.code = 'ENOENT';
      throw error;
    }
    if (resolvedPath === selectedRootPath) selectedRootRead = true;
    return originalReadFileSync.call(fs, filePath, ...args);
  });

  assert.throws(
    () => menuBuilder.buildAppMenu('en'),
    /required default main\.json unavailable: es/
  );
  assert.equal(selectedRootRead, false);
});

test('a missing non-default root main bundle falls through to the established default bundle', (t) => {
  const menuBuilder = loadFreshMenuBuilder(t);
  const defaultDialogTexts = menuBuilder.getDialogTexts('es');
  const selectedRootPath = path.resolve(__dirname, '../../../i18n/en/main.json');
  const originalReadFileSync = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', (filePath, ...args) => {
    if (path.resolve(String(filePath)) === selectedRootPath) {
      const error = new Error('selected root main bundle unavailable');
      error.code = 'ENOENT';
      throw error;
    }
    return originalReadFileSync.call(fs, filePath, ...args);
  });

  assert.deepEqual(menuBuilder.getDialogTexts('en'), defaultDialogTexts);
});

test('an established default main bundle is retained for later selected-language menu builds', (t) => {
  const menuBuilder = loadFreshMenuBuilder(t);
  menuBuilder.initializeDefaultMainTranslations();

  const defaultMainPath = path.resolve(__dirname, '../../../i18n/es/main.json');
  const originalReadFileSync = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', (filePath, ...args) => {
    if (path.resolve(String(filePath)) === defaultMainPath) {
      throw new Error('default main bundle should not be read after establishment');
    }
    return originalReadFileSync.call(fs, filePath, ...args);
  });

  assert.doesNotThrow(() => menuBuilder.buildAppMenu('en'));
});

test('buildAppMenu prepends a localized macOS app menu while preserving shared menus', (t) => {
  withPlatform(t, 'darwin');

  let capturedTemplate = null;
  let installedMenu = null;
  const builtMenu = { tag: 'menu' };
  const menuBuilder = loadFreshMenuBuilder(t, {
    app: {
      isPackaged: true,
      name: 'toT',
      getName() {
        return 'toT';
      },
    },
    Menu: {
      buildFromTemplate(template) {
        capturedTemplate = template;
        return builtMenu;
      },
      setApplicationMenu(menu) {
        installedMenu = menu;
      },
    },
  });

  menuBuilder.buildAppMenu('es');

  assert.equal(installedMenu, builtMenu);
  assert.ok(Array.isArray(capturedTemplate));
  assert.equal(capturedTemplate[0].label, 'toT');
  assert.deepEqual(capturedTemplate[0].submenu, [
    { role: 'services', label: 'Servicios' },
    { type: 'separator' },
    { role: 'hide', label: 'Ocultar toT' },
    { role: 'hideOthers', label: 'Ocultar otros' },
    { role: 'unhide', label: 'Mostrar todo' },
    { type: 'separator' },
    { role: 'quit', label: 'Salir de toT' },
  ]);
  assert.equal(capturedTemplate[1].label, '¿Cómo usar la app?');
  assert.equal(capturedTemplate[2].label, 'Preferencias');
  assert.equal(capturedTemplate[3].label, 'Enlaces de interés');
  assert.deepEqual(
    capturedTemplate[3].submenu.map((item) => item.label),
    ['Enlaces generales']
  );
  assert.equal(capturedTemplate[4].label, '?');
});

test('buildAppMenu keeps the shared top-level menu structure and links submenu outside macOS', (t) => {
  let capturedTemplate = null;
  let installedMenu = null;
  const builtMenu = { tag: 'menu' };
  const menuBuilder = loadFreshMenuBuilder(t, {
    Menu: {
      buildFromTemplate(template) {
        capturedTemplate = template;
        return builtMenu;
      },
      setApplicationMenu(menu) {
        installedMenu = menu;
      },
    },
  });

  menuBuilder.buildAppMenu('en');

  assert.equal(installedMenu, builtMenu);
  assert.ok(Array.isArray(capturedTemplate));
  assert.equal(capturedTemplate[0].label, 'How to use');
  assert.equal(capturedTemplate[1].label, 'Preferences');
  assert.equal(capturedTemplate[2].label, 'Useful links');
  assert.deepEqual(
    capturedTemplate[2].submenu.map((item) => item.label),
    ['General links']
  );
  assert.equal(capturedTemplate[3].label, '?');
});

test('development menu actions preserve their target operations', (t) => {
  const originalShowDevMenu = process.env.SHOW_DEV_MENU;
  process.env.SHOW_DEV_MENU = '1';
  t.after(() => {
    if (originalShowDevMenu === undefined) {
      delete process.env.SHOW_DEV_MENU;
      return;
    }
    process.env.SHOW_DEV_MENU = originalShowDevMenu;
  });

  const operations = [];
  const target = {
    isDestroyed() {
      return false;
    },
    webContents: {
      reload() {
        operations.push('reload');
      },
      reloadIgnoringCache() {
        operations.push('forceReload');
      },
      toggleDevTools() {
        operations.push('toggleDevTools');
      },
    },
  };
  let capturedTemplate = null;
  const menuBuilder = loadFreshMenuBuilder(t, {
    app: { isPackaged: false },
    BrowserWindow: {
      getFocusedWindow() {
        return target;
      },
    },
    Menu: {
      buildFromTemplate(template) {
        capturedTemplate = template;
        return {};
      },
    },
  });

  menuBuilder.buildAppMenu('en');

  const developmentMenu = capturedTemplate.at(-1);
  assert.deepEqual(
    developmentMenu.submenu.map(({ accelerator, label }) => ({ accelerator, label })),
    [
      { accelerator: 'CommandOrControl+R', label: 'Reload' },
      { accelerator: 'CommandOrControl+Shift+R', label: 'Force reload' },
      { accelerator: 'Ctrl+Shift+I', label: 'Toggle DevTools' },
    ]
  );

  developmentMenu.submenu.forEach(({ click }) => click());

  assert.deepEqual(operations, ['reload', 'forceReload', 'toggleDevTools']);
});
