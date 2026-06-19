'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const snapshotTagCatalog = require('../../../public/js/lib/snapshot_tag_catalog');

function loadFreshSnapshotTagSettingsModule() {
  const modulePath = path.resolve(__dirname, '../../../electron/snapshot_tag_settings.js');
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function createSnapshotTagSettingsHarness(initialStoredValue) {
  let storedValue = initialStoredValue;
  const writes = [];

  return {
    loadJson(_filePath, fallbackValue) {
      return typeof storedValue === 'undefined' ? fallbackValue : storedValue;
    },
    saveJson(filePath, nextValue) {
      storedValue = nextValue;
      writes.push({ filePath, value: nextValue });
    },
    getStoredValue() {
      return storedValue;
    },
    setStoredValue(nextValue) {
      storedValue = nextValue;
    },
    getWrites() {
      return writes.slice();
    },
  };
}

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

test('init normalizes invalid stored snapshot-tag preferences and persists safe defaults', () => {
  const snapshotTagSettings = loadFreshSnapshotTagSettingsModule();
  const harness = createSnapshotTagSettingsHarness(null);

  const normalized = snapshotTagSettings.init({
    loadJson: harness.loadJson,
    saveJson: harness.saveJson,
    snapshotTagsFile: 'C:\\fake\\snapshot_tags.json',
  });

  assert.deepEqual(
    normalized,
    snapshotTagCatalog.createEmptySnapshotTagPreferences()
  );

  const writes = harness.getWrites();
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].value, normalized);
});

test('registerIpc persists snapshot-tag preferences and requests settings publish on success', async () => {
  const snapshotTagSettings = loadFreshSnapshotTagSettingsModule();
  const harness = createSnapshotTagSettingsHarness({});
  const ipcMain = createIpcMainDouble();
  let publishCount = 0;

  snapshotTagSettings.init({
    loadJson: harness.loadJson,
    saveJson: harness.saveJson,
    snapshotTagsFile: 'C:\\fake\\snapshot_tags.json',
  });

  snapshotTagSettings.registerIpc(ipcMain, {
    publishSettingsUpdate() {
      publishCount += 1;
    },
  });

  const customType = snapshotTagCatalog.buildCustomTagValue('type', 'Short story');
  const result = await ipcMain.invoke('set-snapshot-tag-preferences', {
    type: {
      custom: [{ value: customType, label: '  Short   story  ' }],
      hiddenDefaults: ['fiction'],
      order: [customType, 'fiction'],
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.snapshotTags.type.custom, [{
    value: customType,
    label: 'Short story',
  }]);
  assert.deepEqual(result.snapshotTags.type.hiddenDefaults, ['fiction']);
  assert.deepEqual(result.snapshotTags.type.order, [customType]);
  assert.deepEqual(harness.getStoredValue().type.order, [customType]);
  assert.equal(publishCount, 1);
  assert.deepEqual(snapshotTagSettings.getSnapshotTagPreferences().type.order, [customType]);
});

test('getSnapshotTagPreferences reloads external snapshot-tag file edits from disk', () => {
  const snapshotTagSettings = loadFreshSnapshotTagSettingsModule();
  const harness = createSnapshotTagSettingsHarness({});
  const customType = snapshotTagCatalog.buildCustomTagValue('type', 'Short story');

  snapshotTagSettings.init({
    loadJson: harness.loadJson,
    saveJson: harness.saveJson,
    snapshotTagsFile: 'C:\\fake\\snapshot_tags.json',
  });

  harness.setStoredValue({
    type: {
      custom: [{ value: customType, label: '  Short   story ' }],
      hiddenDefaults: ['fiction'],
      order: [customType, 'fiction'],
    },
  });

  const reloaded = snapshotTagSettings.getSnapshotTagPreferences();

  assert.deepEqual(reloaded.type.custom, [{
    value: customType,
    label: 'Short story',
  }]);
  assert.deepEqual(reloaded.type.hiddenDefaults, ['fiction']);
  assert.deepEqual(reloaded.type.order, [customType]);
});
