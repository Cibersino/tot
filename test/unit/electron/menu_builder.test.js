'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  installElectronModuleMock,
} = require('../../helpers/electron_module_mock');

function loadFreshMenuBuilder(t) {
  const modulePath = path.resolve(__dirname, '../../../electron/menu_builder.js');
  t.after(installElectronModuleMock({
    app: {
      isPackaged: true,
    },
    Menu: {
      buildFromTemplate() {
        return {};
      },
      setApplicationMenu() {},
    },
    BrowserWindow: {
      getFocusedWindow() {
        return null;
      },
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
