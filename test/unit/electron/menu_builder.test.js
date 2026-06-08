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
    warnOnceCalls: [],
    warnOnce(key, ...args) {
      this.warnOnceCalls.push({ key, args });
    },
  };
}

test('resolveDialogText uses the caller-injected logger for missing dialog keys', (t) => {
  const menuBuilder = loadFreshMenuBuilder(t);
  const log = createLogDouble();

  const result = menuBuilder.resolveDialogText({}, 'continue_button', 'Continue', {
    log,
    warnPrefix: 'updater.dialog.missing',
  });

  assert.equal(result, 'Continue');
  assert.deepEqual(log.warnOnceCalls, [
    {
      key: 'updater.dialog.missing:continue_button',
      args: ['Missing dialog translation key (using fallback):', 'continue_button'],
    },
  ]);
});

test('resolveDialogText requires caller-injected warnOnce logging', (t) => {
  const menuBuilder = loadFreshMenuBuilder(t);

  assert.throws(
    () => menuBuilder.resolveDialogText({}, 'continue_button', 'Continue'),
    /\[menu_builder\] resolveDialogText requires opts\.log\.warnOnce/
  );
});

test('buildAppMenu keeps the shared top-level menu structure and links submenu', (t) => {
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
