'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
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

  assert.equal(
    dialogTexts.renderer_settings_listener_failure_message,
    'The interface could not establish the required settings synchronization. The window will close.'
  );
  assert.equal(
    dialogTexts.renderer_i18n_failure_message,
    'The interface could not load its required language resources. The window will close.'
  );
});

test('getDialogTexts provides Calculator initial-document failure copy', (t) => {
  const menuBuilder = loadFreshMenuBuilder(t);

  const dialogTexts = menuBuilder.getDialogTexts('en');

  assert.equal(
    dialogTexts.text_time_calculator_initial_document_failure_title,
    'The quick calculator could not open'
  );
  assert.equal(
    dialogTexts.text_time_calculator_initial_document_failure_message,
    'The quick calculator could not load and will close.'
  );
});

test('getDialogTexts provides Preset modal initial-document failure copy', (t) => {
  const menuBuilder = loadFreshMenuBuilder(t);

  const dialogTexts = menuBuilder.getDialogTexts('en');

  assert.equal(
    dialogTexts.preset_modal_initial_document_failure_title,
    'The preset window could not open'
  );
  assert.equal(
    dialogTexts.preset_modal_initial_document_failure_message,
    'The preset window could not load and will close.'
  );
});

test('getDialogTexts provides first-run and later Language chooser load-failure copy', (t) => {
  const menuBuilder = loadFreshMenuBuilder(t);

  const dialogTexts = menuBuilder.getDialogTexts('en');

  assert.equal(
    dialogTexts.language_chooser_first_run_initial_document_failure_message,
    'The language chooser could not load. Startup will continue with the fallback language.'
  );
  assert.equal(
    dialogTexts.language_chooser_initial_document_failure_title,
    'The language chooser could not open'
  );
  assert.equal(
    dialogTexts.language_chooser_initial_document_failure_message,
    'The language chooser could not load.'
  );
});

test('getDialogTexts provides Floating Stopwatch initial-document failure copy', (t) => {
  const menuBuilder = loadFreshMenuBuilder(t);

  const dialogTexts = menuBuilder.getDialogTexts('en');

  assert.equal(
    dialogTexts.floating_stopwatch_initial_document_failure_title,
    'The Floating Stopwatch could not open'
  );
  assert.equal(
    dialogTexts.floating_stopwatch_initial_document_failure_message,
    'The Floating Stopwatch could not load and will close.'
  );
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
