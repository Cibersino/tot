'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');

const editorTextSize = require('../../../electron/editor_text_size');

function createIpcMainDouble() {
  const handlers = new Map();
  return {
    handle(channel, handler) {
      handlers.set(channel, handler);
    },
    async invoke(channel, ...args) {
      const handler = handlers.get(channel);
      if (typeof handler !== 'function') {
        throw new Error(`Missing IPC handler: ${channel}`);
      }
      return handler({}, ...args);
    },
  };
}

function createSettingsState({ initialFontSizePx = 20, saveError = null } = {}) {
  let currentSettings = { editorFontSizePx: initialFontSizePx };
  const savedSettings = [];
  const publishedSettings = [];

  return {
    getSettings() {
      return currentSettings;
    },
    normalizeEditorFontSizePx(value) {
      const rounded = Math.round(Number(value));
      return Math.min(36, Math.max(12, rounded));
    },
    saveSettingsStrict(nextSettings) {
      if (saveError) throw saveError;
      currentSettings = { ...nextSettings };
      savedSettings.push(currentSettings);
      return currentSettings;
    },
    publishSettingsUpdated(settings) {
      publishedSettings.push(settings);
    },
    getSavedSettings() {
      return savedSettings.slice();
    },
    getPublishedSettings() {
      return publishedSettings.slice();
    },
  };
}

test('font-size IPC and shortcut actions use the same strict feature action', async () => {
  const settingsState = createSettingsState();
  const controller = editorTextSize.createController({ settingsState });
  const ipcMain = createIpcMainDouble();
  controller.registerIpc(ipcMain);

  assert.deepEqual(
    await ipcMain.invoke('set-editor-font-size-px', 20),
    { ok: true, editorFontSizePx: 20 }
  );
  assert.deepEqual(
    await ipcMain.invoke('set-editor-font-size-px', 'invalid'),
    { ok: false, error: 'invalid' }
  );
  assert.deepEqual(settingsState.getSavedSettings(), []);
  assert.deepEqual(settingsState.getPublishedSettings(), []);

  assert.deepEqual(
    await ipcMain.invoke('set-editor-font-size-px', 22),
    { ok: true, editorFontSizePx: 22 }
  );
  assert.deepEqual(
    controller.getShortcutActions().onIncreaseTextSize(),
    { ok: true, editorFontSizePx: 24 }
  );
  assert.deepEqual(
    settingsState.getSavedSettings().map((settings) => settings.editorFontSizePx),
    [22, 24]
  );
  assert.deepEqual(
    settingsState.getPublishedSettings().map((settings) => settings.editorFontSizePx),
    [22, 24]
  );
});

test('font-size IPC and shortcut actions fail before publication when strict persistence fails', async () => {
  const settingsState = createSettingsState({ saveError: new Error('disk full') });
  const controller = editorTextSize.createController({ settingsState });
  const ipcMain = createIpcMainDouble();
  controller.registerIpc(ipcMain);

  await assert.rejects(
    ipcMain.invoke('set-editor-font-size-px', 22),
    /disk full/i
  );
  assert.throws(
    () => controller.getShortcutActions().onIncreaseTextSize(),
    /disk full/i
  );
  assert.deepEqual(settingsState.getSavedSettings(), []);
  assert.deepEqual(settingsState.getPublishedSettings(), []);
});
