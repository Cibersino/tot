'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createTestTempDir } = require('../../helpers/test_temp_paths');
const { installElectronModuleMock } = require('../../helpers/electron_module_mock');

const { sanitizePresetInput } = require('../../../electron/presets_main');

test('preset persistence enforces the shared name and description limits', () => {
  const valid = sanitizePresetInput({
    name: 'n'.repeat(20),
    description: 'd'.repeat(120),
    wpm: 200,
  });
  assert.equal(valid.ok, true);

  assert.deepEqual(
    sanitizePresetInput({ name: 'n'.repeat(21), description: '', wpm: 200 }),
    { ok: false, error: 'preset name too long', code: 'PRESET_NAME_TOO_LONG' }
  );
  assert.deepEqual(
    sanitizePresetInput({ name: 'Valid', description: 'd'.repeat(121), wpm: 200 }),
    { ok: false, error: 'preset description too long', code: 'PRESET_DESCRIPTION_TOO_LONG' }
  );
});

function createPresetHarness(t, { failWrite = false, confirmation = 0 } = {}) {
  const root = createTestTempDir('preset-persistence');
  const modulePaths = ['presets_main', 'settings', 'fs_storage', 'menu_builder']
    .map((name) => path.resolve(__dirname, `../../../electron/${name}.js`));
  const originals = new Map(modulePaths.map((modulePath) => [modulePath, require.cache[modulePath]]));
  const sent = [];
  const mainWin = { isDestroyed: () => false, webContents: { send: (channel, payload) => sent.push({ channel, payload }) } };
  const presetWin = { isDestroyed: () => false, webContents: { send: (channel, payload) => sent.push({ channel, payload }) } };
  const restoreElectron = installElectronModuleMock({
    BrowserWindow: { fromWebContents: (sender) => sender === mainWin.webContents ? mainWin : sender === presetWin.webContents ? presetWin : null },
    dialog: { showMessageBox: async () => ({ response: confirmation }) },
    shell: {},
  });

  for (const modulePath of modulePaths) delete require.cache[modulePath];
  const menuPath = modulePaths[3];
  require.cache[menuPath] = {
    id: menuPath,
    filename: menuPath,
    loaded: true,
    exports: {
      getDialogTexts: () => ({ delete_preset_confirm: 'Delete {name}', edit_preset_confirm: 'Edit {name}', restore_defaults_confirm: 'Restore {lang}' }),
      resolveDialogText: (_texts, key) => key,
    },
  };

  t.after(() => {
    for (const modulePath of modulePaths) {
      const original = originals.get(modulePath);
      if (original) require.cache[modulePath] = original;
      else delete require.cache[modulePath];
    }
    restoreElectron();
    fs.rmSync(root, { recursive: true, force: true });
  });

  const storage = require(modulePaths[2]);
  storage.initStorage({ isReady: () => true, getPath: () => root, getAppPath: () => root });
  const settingsFile = storage.getSettingsFile();
  storage.saveJsonStrict(settingsFile, {
    language: 'en',
    presets_by_language: {
      en: [{ name: 'Custom', wpm: 200, description: 'Custom text' }, { name: 'Default', wpm: 250, description: 'Override' }],
      es: [{ name: 'Otro', wpm: 180, description: '' }],
    },
    disabled_default_presets: { en: ['Default2', 'Other'], es: ['Otro'] },
  });
  const settings = require(modulePaths[1]);
  settings.init({
    loadJson: storage.loadJson,
    saveJson: storage.saveJson,
    saveJsonStrict(file, value) {
      if (failWrite) throw new Error('disk full');
      storage.saveJsonStrict(file, value);
    },
    settingsFile,
  });
  settings.configurePublication({ getWindows: () => ({ mainWin, presetWin }), decorateSettings: (value) => value, onSettingsUpdated: () => {} });
  let lastRead;
  const getSettings = settings.getSettings;
  settings.getSettings = () => {
    lastRead = getSettings();
    return lastRead;
  };

  const handlers = new Map();
  const presets = require(modulePaths[0]);
  presets.registerIpc({ handle: (channel, handler) => handlers.set(channel, handler) }, { getWindows: () => ({ mainWin, presetWin }) });
  fs.writeFileSync(path.join(storage.getConfigPresetsDir(), 'defaults_presets.json'), JSON.stringify([{ name: 'Default', wpm: 210 }, { name: 'Default2', wpm: 220 }, { name: 'Default3', wpm: 230 }]));
  fs.writeFileSync(path.join(storage.getConfigPresetsDir(), 'defaults_presets_en.json'), '[]');
  const initialDisk = fs.readFileSync(settingsFile, 'utf8');

  return {
    sent,
    configPresetsDir: storage.getConfigPresetsDir(),
    initialDisk,
    getDisk: () => fs.readFileSync(settingsFile, 'utf8'),
    getLastRead: () => lastRead,
    invoke: (channel, payload) => handlers.get(channel)({ sender: (channel === 'create-preset' || channel === 'edit-preset' ? presetWin : mainWin).webContents }, payload),
  };
}

const presetMutationCases = [
  { name: 'create', channel: 'create-preset', payload: { name: 'New', wpm: 300, description: 'New text' }, action: null },
  { name: 'overwrite', channel: 'create-preset', payload: { name: 'Custom', wpm: 300, description: 'Updated' }, action: null },
  { name: 'edit default override', channel: 'edit-preset', payload: { originalName: 'Default', newPreset: { name: 'New', wpm: 300, description: 'New text' } }, action: 'edited' },
  { name: 'delete custom', channel: 'request-delete-preset', payload: 'Custom', action: 'deleted_custom' },
  { name: 'delete default override', channel: 'request-delete-preset', payload: 'Default', action: 'deleted_and_ignored' },
  { name: 'disable default', channel: 'request-delete-preset', payload: 'Default3', action: 'ignored_default' },
  { name: 'restore defaults', channel: 'request-restore-defaults', action: 'restored' },
];

test('get-default-presets omits invalid configured entries and retains valid entries', async (t) => {
  const harness = createPresetHarness(t);
  const configDefaults = path.join(
    harness.configPresetsDir,
    'defaults_presets.json'
  );
  fs.writeFileSync(configDefaults, JSON.stringify([
    null,
    { name: 'Valid', wpm: 210, description: 'Configured default' },
    { name: 'Missing WPM' },
  ]));

  const defaults = await harness.invoke('get-default-presets');

  assert.deepEqual(defaults.general, [
    { name: 'Valid', wpm: 210, description: 'Configured default' },
  ]);
  assert.deepEqual(defaults.languagePresets.en, []);
});

test('get-default-presets uses bundled general defaults when no configured entry is valid', async (t) => {
  const harness = createPresetHarness(t);
  const configDefaults = path.join(
    harness.configPresetsDir,
    'defaults_presets.json'
  );
  fs.writeFileSync(configDefaults, JSON.stringify([null, { name: 'Missing WPM' }]));

  const defaults = await harness.invoke('get-default-presets');

  assert.deepEqual(defaults.general, [
    { name: 'default', wpm: 250, description: 'Default preset.' },
  ]);
});

test('request-delete-preset still resolves a valid default beside invalid configured entries', async (t) => {
  const harness = createPresetHarness(t);
  const configDefaults = path.join(
    harness.configPresetsDir,
    'defaults_presets.json'
  );
  fs.writeFileSync(configDefaults, JSON.stringify([
    null,
    { name: 'Default', wpm: 210 },
  ]));

  const result = await harness.invoke('request-delete-preset', 'Default');

  assert.equal(result.ok, true);
  assert.equal(result.action, 'deleted_and_ignored');
});

for (const scenario of presetMutationCases) {
  test(`preset ${scenario.name} reports a write failure without publishing or mutating the loaded settings`, async (t) => {
    const harness = createPresetHarness(t, { failWrite: true });
    const result = await harness.invoke(scenario.channel, scenario.payload);

    assert.equal(result.ok, false);
    assert.match(result.error, /disk full/);
    assert.equal(harness.getDisk(), harness.initialDisk);
    assert.deepEqual(harness.getLastRead(), JSON.parse(harness.initialDisk));
    assert.deepEqual(harness.sent, []);
  });

  test(`preset ${scenario.name} saves and publishes its successful mutation`, async (t) => {
    const harness = createPresetHarness(t);
    const result = await harness.invoke(scenario.channel, scenario.payload);
    const saved = JSON.parse(harness.getDisk());

    assert.equal(result.ok, true);
    if (scenario.action) assert.equal(result.action, scenario.action);
    assert.deepEqual(saved.presets_by_language.es, [{ name: 'Otro', wpm: 180, description: '' }]);
    assert.deepEqual(saved.disabled_default_presets.es, ['Otro']);
    if (scenario.name === 'create' || scenario.name === 'edit default override') {
      assert.deepEqual(saved.presets_by_language.en.find((preset) => preset.name === 'New'), { name: 'New', wpm: 300, description: 'New text' });
    }
    if (scenario.name === 'overwrite') assert.equal(saved.presets_by_language.en.find((preset) => preset.name === 'Custom').wpm, 300);
    if (scenario.name === 'delete custom') assert.equal(saved.presets_by_language.en.some((preset) => preset.name === 'Custom'), false);
    if (scenario.name === 'edit default override' || scenario.name === 'delete default override') {
      assert.equal(saved.presets_by_language.en.some((preset) => preset.name === 'Default'), false);
      assert.equal(saved.disabled_default_presets.en.includes('Default'), true);
    }
    if (scenario.name === 'disable default') assert.equal(saved.disabled_default_presets.en.includes('Default3'), true);
    if (scenario.name === 'restore defaults') {
      assert.equal(saved.presets_by_language.en.some((preset) => preset.name === 'Default'), false);
      assert.deepEqual(saved.disabled_default_presets.en, ['Other']);
      assert.deepEqual(result.removedCustom, ['Default']);
      assert.deepEqual(result.unignored, ['Default2']);
    }
    assert.equal(harness.sent.some((message) => message.channel === 'settings-updated'), true);
    assert.equal(harness.sent.some((message) => message.channel === 'preset-created'), scenario.channel === 'create-preset' || scenario.channel === 'edit-preset');
    const created = harness.sent.find((message) => message.channel === 'preset-created');
    const reconciliation = created ? created.payload : result;
    assert.equal(reconciliation.language, 'en');
    assert.deepEqual(reconciliation.settingsSnapshot, saved);
    if (created) {
      const expectedPreset = scenario.channel === 'edit-preset' ? scenario.payload.newPreset : scenario.payload;
      assert.deepEqual(reconciliation.preset, expectedPreset);
    }
  });
}

for (const scenario of presetMutationCases.filter((entry) => entry.channel !== 'create-preset')) {
  test(`preset ${scenario.name} leaves settings unchanged when confirmation is cancelled`, async (t) => {
    const harness = createPresetHarness(t, { confirmation: 1 });
    assert.deepEqual(await harness.invoke(scenario.channel, scenario.payload), { ok: false, code: 'CANCELLED' });
    assert.equal(harness.getDisk(), harness.initialDisk);
    assert.deepEqual(harness.sent, []);
  });
}
