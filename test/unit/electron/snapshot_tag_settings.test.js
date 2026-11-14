'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('path');
const snapshotTagCatalog = require('../../../public/js/lib/snapshot_tag_catalog');
const {
  createTestTempDir,
} = require('../../helpers/test_temp_paths');

function loadFreshSnapshotTagSettingsModule() {
  const modulePath = path.resolve(__dirname, '../../../electron/snapshot_tag_settings.js');
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function createSnapshotTagSettingsHarness(
  initialStoredValue,
  {
    loadJsonWithStatusImpl = null,
    initialSaveJsonStrictImpl = null,
    saveJsonStrictImpl = null,
  } = {}
) {
  let storedValue = initialStoredValue;
  let initialPersistencePending = true;
  const writes = [];

  return {
    loadJsonWithStatus(filePath, fallbackValue) {
      if (typeof loadJsonWithStatusImpl === 'function') {
        return loadJsonWithStatusImpl(filePath, fallbackValue);
      }
      return {
        status: typeof storedValue === 'undefined' ? 'missing' : 'loaded',
        value: typeof storedValue === 'undefined' ? fallbackValue : storedValue,
      };
    },
    saveJsonStrict(filePath, nextValue) {
      if (initialPersistencePending) {
        initialPersistencePending = false;
        if (typeof initialSaveJsonStrictImpl === 'function') {
          return initialSaveJsonStrictImpl(filePath, nextValue);
        }
        storedValue = nextValue;
        writes.push({ filePath, value: nextValue });
        return undefined;
      }
      if (typeof saveJsonStrictImpl === 'function') {
        return saveJsonStrictImpl(filePath, nextValue);
      }
      storedValue = nextValue;
      writes.push({ filePath, value: nextValue });
      return undefined;
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

test('init rejects structurally unrecoverable snapshot-tag preferences before persistence', () => {
  const snapshotTagSettings = loadFreshSnapshotTagSettingsModule();
  const harness = createSnapshotTagSettingsHarness(null);

  assert.throws(
    () => snapshotTagSettings.init({
      loadJsonWithStatus: harness.loadJsonWithStatus,
      saveJsonStrict: harness.saveJsonStrict,
      snapshotTagsFile: 'C:\\fake\\snapshot_tags.json',
    }),
    { code: 'SNAPSHOT_TAGS_STARTUP_ADMISSION_FAILED' }
  );
  assert.equal(harness.getStoredValue(), null);
  assert.deepEqual(harness.getWrites(), []);
  assert.throws(() => snapshotTagSettings.getSnapshotTagPreferences(), /called before init/);
});

test('init admits conservative snapshot-tag normalization and retains custom tags, visibility, and ordering', () => {
  const snapshotTagSettings = loadFreshSnapshotTagSettingsModule();
  const customType = snapshotTagCatalog.buildCustomTagValue('type', 'Short story');
  const harness = createSnapshotTagSettingsHarness({
    type: {
      custom: [{ value: customType, label: '  Short   story  ' }],
      hiddenDefaults: ['fiction'],
      order: [customType],
    },
  });

  const normalized = snapshotTagSettings.init({
    loadJsonWithStatus: harness.loadJsonWithStatus,
    saveJsonStrict: harness.saveJsonStrict,
    snapshotTagsFile: 'C:\\fake\\snapshot_tags.json',
  });

  const writes = harness.getWrites();
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0].value, normalized);
  assert.deepEqual(normalized.type, {
    custom: [{ value: customType, label: 'Short story' }],
    hiddenDefaults: ['fiction'],
    order: [customType],
  });
});

test('init creates default snapshot-tag preferences when the file is missing', () => {
  const snapshotTagSettings = loadFreshSnapshotTagSettingsModule();
  const harness = createSnapshotTagSettingsHarness(undefined);

  const normalized = snapshotTagSettings.init({
    loadJsonWithStatus: harness.loadJsonWithStatus,
    saveJsonStrict: harness.saveJsonStrict,
    snapshotTagsFile: 'C:\\fake\\snapshot_tags.json',
  });

  assert.deepEqual(
    normalized,
    snapshotTagCatalog.createEmptySnapshotTagPreferences()
  );
  assert.equal(harness.getWrites().length, 1);
  assert.deepEqual(harness.getStoredValue(), normalized);
});

test('init strictly persists admitted preferences even when they need no normalization', () => {
  const snapshotTagSettings = loadFreshSnapshotTagSettingsModule();
  const preferences = snapshotTagCatalog.createEmptySnapshotTagPreferences();
  const harness = createSnapshotTagSettingsHarness(preferences);

  const initialized = snapshotTagSettings.init({
    loadJsonWithStatus: harness.loadJsonWithStatus,
    saveJsonStrict: harness.saveJsonStrict,
    snapshotTagsFile: 'C:\\fake\\snapshot_tags.json',
  });

  assert.deepEqual(initialized, preferences);
  assert.deepEqual(harness.getWrites(), [{
    filePath: 'C:\\fake\\snapshot_tags.json',
    value: preferences,
  }]);
});

test('init rejects unreadable, empty, malformed, and incompatible existing preferences without writes', () => {
  const customType = snapshotTagCatalog.buildCustomTagValue('type', 'Short story');
  const cases = [
    { name: 'failed read', result: { status: 'failed', value: {} } },
    { name: 'empty file', result: { status: 'empty', value: {} } },
    { name: 'array root', result: { status: 'loaded', value: [] } },
    { name: 'invalid category', result: { status: 'loaded', value: { type: [] } } },
    { name: 'invalid custom collection', result: { status: 'loaded', value: { type: { custom: {} } } } },
    {
      name: 'unrecoverable custom entry',
      result: { status: 'loaded', value: { type: { custom: [{ value: customType, label: '' }] } } },
    },
  ];

  for (const scenario of cases) {
    const snapshotTagSettings = loadFreshSnapshotTagSettingsModule();
    const originalValue = { type: { custom: [{ value: customType, label: 'Short story' }] } };
    const harness = createSnapshotTagSettingsHarness(originalValue, {
      loadJsonWithStatusImpl() {
        return scenario.result;
      },
    });

    assert.throws(
      () => snapshotTagSettings.init({
        loadJsonWithStatus: harness.loadJsonWithStatus,
        saveJsonStrict: harness.saveJsonStrict,
        snapshotTagsFile: 'C:\\fake\\snapshot_tags.json',
      }),
      { code: 'SNAPSHOT_TAGS_STARTUP_ADMISSION_FAILED' },
      scenario.name
    );
    assert.equal(harness.getStoredValue(), originalValue, scenario.name);
    assert.deepEqual(harness.getWrites(), [], scenario.name);
  }
});

test('init leaves a rejected malformed snapshot-tag file byte-for-byte intact', (t) => {
  const tempDir = createTestTempDir('snapshot-tag-startup-admission');
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const snapshotTagsFile = path.join(tempDir, 'snapshot_tags.json');
  const originalBytes = Buffer.from('\uFEFF{"type":', 'utf8');
  fs.writeFileSync(snapshotTagsFile, originalBytes);

  const fsStorage = require('../../../electron/fs_storage');
  const snapshotTagSettings = loadFreshSnapshotTagSettingsModule();
  assert.throws(
    () => snapshotTagSettings.init({
      loadJsonWithStatus: fsStorage.loadJsonWithStatus,
      saveJsonStrict: fsStorage.saveJsonStrict,
      snapshotTagsFile,
    }),
    { code: 'SNAPSHOT_TAGS_STARTUP_ADMISSION_FAILED' }
  );
  assert.deepEqual(fs.readFileSync(snapshotTagsFile), originalBytes);
});

test('init reports a required initial snapshot-tag write failure without caching preferences', () => {
  const snapshotTagSettings = loadFreshSnapshotTagSettingsModule();
  const writeFailure = new Error('disk full');
  writeFailure.code = 'ENOSPC';
  const harness = createSnapshotTagSettingsHarness({}, {
    initialSaveJsonStrictImpl() {
      throw writeFailure;
    },
  });

  assert.throws(
    () => snapshotTagSettings.init({
      loadJsonWithStatus: harness.loadJsonWithStatus,
      saveJsonStrict: harness.saveJsonStrict,
      snapshotTagsFile: 'C:\\fake\\snapshot_tags.json',
    }),
    (error) => error.code === 'SNAPSHOT_TAGS_STARTUP_INITIAL_WRITE_FAILED'
      && error.cause === writeFailure
  );
  assert.deepEqual(harness.getWrites(), []);
  assert.throws(() => snapshotTagSettings.getSnapshotTagPreferences(), /called before init/);
});

test('snapshot-tag IPC preserves stored preferences after a later shared JSON reader failure', async () => {
  const snapshotTagSettings = loadFreshSnapshotTagSettingsModule();
  const existingType = snapshotTagCatalog.buildCustomTagValue('type', 'Short story');
  const existingPreferences = {
    type: {
      custom: [{ value: existingType, label: 'Short story' }],
      hiddenDefaults: ['fiction'],
      order: [existingType],
    },
  };
  let loadCount = 0;
  const harness = createSnapshotTagSettingsHarness(existingPreferences, {
    loadJsonWithStatusImpl(_filePath, fallbackValue) {
      loadCount += 1;
      if (loadCount === 1) {
        return { status: 'loaded', value: existingPreferences };
      }
      return { status: 'failed', value: fallbackValue };
    },
  });
  const ipcMain = createIpcMainDouble();
  let publishCount = 0;

  snapshotTagSettings.init({
    loadJsonWithStatus: harness.loadJsonWithStatus,
    saveJsonStrict: harness.saveJsonStrict,
    snapshotTagsFile: 'C:\\fake\\snapshot_tags.json',
  });
  snapshotTagSettings.registerIpc(ipcMain, {
    publishSettingsUpdate() {
      publishCount += 1;
    },
  });

  assert.equal(harness.getWrites().length, 1);
  const admittedPreferences = harness.getStoredValue();

  const readResult = await ipcMain.invoke('get-snapshot-tag-preferences');
  assert.equal(readResult.ok, false);
  assert.deepEqual(
    readResult.snapshotTags,
    snapshotTagCatalog.createEmptySnapshotTagPreferences()
  );

  const updatedType = snapshotTagCatalog.buildCustomTagValue('type', 'Essay');
  const saveResult = await ipcMain.invoke('set-snapshot-tag-preferences', {
    type: {
      custom: [{ value: updatedType, label: 'Essay' }],
      hiddenDefaults: ['fiction'],
      order: [updatedType],
    },
  });

  assert.equal(saveResult.ok, false);
  assert.equal(publishCount, 0);
  assert.deepEqual(harness.getStoredValue(), admittedPreferences);
  assert.equal(harness.getWrites().length, 1);
});

test('registerIpc persists snapshot-tag preferences and requests settings publish on success', async () => {
  const snapshotTagSettings = loadFreshSnapshotTagSettingsModule();
  const harness = createSnapshotTagSettingsHarness({});
  const ipcMain = createIpcMainDouble();
  let publishCount = 0;

  snapshotTagSettings.init({
    loadJsonWithStatus: harness.loadJsonWithStatus,
    saveJsonStrict: harness.saveJsonStrict,
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

test('registerIpc does not publish snapshot-tag updates or mutate persisted preferences when strict save fails', async () => {
  const snapshotTagSettings = loadFreshSnapshotTagSettingsModule();
  const customType = snapshotTagCatalog.buildCustomTagValue('type', 'Short story');
  const harness = createSnapshotTagSettingsHarness({
    type: {
      custom: [{ value: customType, label: 'Short story' }],
      hiddenDefaults: ['fiction'],
      order: [customType],
    },
  }, {
    saveJsonStrictImpl() {
      throw new Error('disk full');
    },
  });
  const ipcMain = createIpcMainDouble();
  let publishCount = 0;

  snapshotTagSettings.init({
    loadJsonWithStatus: harness.loadJsonWithStatus,
    saveJsonStrict: harness.saveJsonStrict,
    snapshotTagsFile: 'C:\\fake\\snapshot_tags.json',
  });

  snapshotTagSettings.registerIpc(ipcMain, {
    publishSettingsUpdate() {
      publishCount += 1;
    },
  });

  const updatedType = snapshotTagCatalog.buildCustomTagValue('type', 'Essay');
  const result = await ipcMain.invoke('set-snapshot-tag-preferences', {
    type: {
      custom: [{ value: updatedType, label: 'Essay' }],
      hiddenDefaults: ['fiction'],
      order: [updatedType, 'fiction'],
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /disk full/i);
  assert.equal(publishCount, 0);
  assert.deepEqual(harness.getStoredValue().type.custom, [{
    value: customType,
    label: 'Short story',
  }]);
  assert.deepEqual(
    snapshotTagSettings.getSnapshotTagPreferences().type.custom,
    [{ value: customType, label: 'Short story' }]
  );
});

test('getSnapshotTagPreferences reloads external snapshot-tag file edits from disk', () => {
  const snapshotTagSettings = loadFreshSnapshotTagSettingsModule();
  const harness = createSnapshotTagSettingsHarness({});
  const customType = snapshotTagCatalog.buildCustomTagValue('type', 'Short story');

  snapshotTagSettings.init({
    loadJsonWithStatus: harness.loadJsonWithStatus,
    saveJsonStrict: harness.saveJsonStrict,
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

test('registerIpc logs each invalid snapshot-tag preference request', async (t) => {
  const modulePath = path.resolve(__dirname, '../../../electron/snapshot_tag_settings.js');
  const logModulePath = path.resolve(__dirname, '../../../electron/log.js');
  const originalLogLevel = process.env.TOT_LOG_LEVEL;
  const originalWarn = console.warn;
  const warnings = [];

  process.env.TOT_LOG_LEVEL = 'warn';
  delete require.cache[require.resolve(modulePath)];
  delete require.cache[require.resolve(logModulePath)];
  console.warn = (...args) => warnings.push(args);
  t.after(() => {
    console.warn = originalWarn;
    if (originalLogLevel === undefined) {
      delete process.env.TOT_LOG_LEVEL;
    } else {
      process.env.TOT_LOG_LEVEL = originalLogLevel;
    }
    delete require.cache[require.resolve(modulePath)];
    delete require.cache[require.resolve(logModulePath)];
  });

  const snapshotTagSettings = require(modulePath);
  const harness = createSnapshotTagSettingsHarness({});
  const ipcMain = createIpcMainDouble();
  snapshotTagSettings.init({
    loadJsonWithStatus: harness.loadJsonWithStatus,
    saveJsonStrict: harness.saveJsonStrict,
    snapshotTagsFile: 'C:\\fake\\snapshot_tags.json',
  });
  snapshotTagSettings.registerIpc(ipcMain);

  await ipcMain.invoke('set-snapshot-tag-preferences', null);
  await ipcMain.invoke('set-snapshot-tag-preferences', []);

  const invalidRequestWarnings = warnings.filter((args) => args.includes(
    'set-snapshot-tag-preferences called with invalid payload (ignored).'
  ));
  assert.equal(invalidRequestWarnings.length, 2);
});
