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

function createPresetHarness(t, {
  failWrite = false,
  confirmation = 0,
  writeConfiguredDefaults = true,
  initialConfigFiles = null,
  windowResolver = null,
} = {}) {
  const root = createTestTempDir('preset-persistence');
  const modulePaths = ['presets_main', 'settings', 'fs_storage', 'menu_builder']
    .map((name) => path.resolve(__dirname, `../../../electron/${name}.js`));
  const originals = new Map(modulePaths.map((modulePath) => [modulePath, require.cache[modulePath]]));
  const sent = [];
  const dialogCalls = [];
  const mainWin = { isDestroyed: () => false, webContents: { send: (channel, payload) => sent.push({ channel, payload }) } };
  const presetWin = { isDestroyed: () => false, webContents: { send: (channel, payload) => sent.push({ channel, payload }) } };
  const otherWin = { isDestroyed: () => false, webContents: { send: (channel, payload) => sent.push({ channel, payload }) } };
  const restoreElectron = installElectronModuleMock({
    BrowserWindow: {
      fromWebContents: (sender) => {
        if (sender === mainWin.webContents) return mainWin;
        if (sender === presetWin.webContents) return presetWin;
        if (sender === otherWin.webContents) return otherWin;
        return null;
      },
    },
    dialog: {
      showMessageBox: async (...args) => {
        dialogCalls.push(args);
        return { response: confirmation };
      },
    },
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
  if (initialConfigFiles) {
    storage.ensureConfigPresetsDir();
    Object.entries(initialConfigFiles).forEach(([name, content]) => {
      fs.writeFileSync(path.join(storage.getConfigPresetsDir(), name), content);
    });
  }
  const presets = require(modulePaths[0]);
  const getWindows = typeof windowResolver === 'function'
    ? () => windowResolver({ mainWin, presetWin, otherWin })
    : () => ({ mainWin, presetWin });
  presets.registerIpc({ handle: (channel, handler) => handlers.set(channel, handler) }, { getWindows });
  if (writeConfiguredDefaults) {
    fs.writeFileSync(path.join(storage.getConfigPresetsDir(), 'defaults_presets.json'), JSON.stringify([{ name: 'Default', wpm: 210 }, { name: 'Default2', wpm: 220 }, { name: 'Default3', wpm: 230 }]));
    fs.writeFileSync(path.join(storage.getConfigPresetsDir(), 'defaults_presets_en.json'), '[]');
  }
  const initialDisk = fs.readFileSync(settingsFile, 'utf8');

  return {
    sent,
    dialogCalls,
    windows: { mainWin, presetWin, otherWin },
    configPresetsDir: storage.getConfigPresetsDir(),
    initialDisk,
    getDisk: () => fs.readFileSync(settingsFile, 'utf8'),
    getLastRead: () => lastRead,
    invoke: (channel, payload) => handlers.get(channel)({ sender: (channel === 'create-preset' || channel === 'edit-preset' ? presetWin : mainWin).webContents }, payload),
    invokeFrom: (channel, sender, payload) => handlers.get(channel)({ sender }, payload),
  };
}

async function captureWarnings(action) {
  const Log = require('../../../electron/log');
  const previousLevel = Log.getLevel();
  const originalWarn = console.warn;
  const warnings = [];

  Log.setLevel('warn');
  console.warn = (...args) => warnings.push(args);
  try {
    return { result: await action(), warnings };
  } finally {
    console.warn = originalWarn;
    Log.setLevel(previousLevel);
  }
}

function writeActiveAndMalformedOtherLanguageDefaults(harness) {
  fs.writeFileSync(
    path.join(harness.configPresetsDir, 'defaults_presets.json'),
    '[]'
  );
  fs.writeFileSync(
    path.join(harness.configPresetsDir, 'defaults_presets_en.json'),
    JSON.stringify([{ name: 'Default', wpm: 240, description: 'English default' }])
  );
  const otherLanguagePath = path.join(
    harness.configPresetsDir,
    'defaults_presets_es.json'
  );
  fs.writeFileSync(otherLanguagePath, '{');
  return otherLanguagePath;
}

function makeDefaultPresetCatalogUnavailable(harness) {
  fs.rmSync(harness.configPresetsDir, { recursive: true, force: true });
  fs.writeFileSync(harness.configPresetsDir, 'not a directory');
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

const protectedPresetIpcCases = [
  {
    name: 'create',
    channel: 'create-preset',
    owner: 'presetWin',
    payload: { name: 'New', wpm: 300, description: 'New text' },
  },
  {
    name: 'delete',
    channel: 'request-delete-preset',
    owner: 'mainWin',
    payload: 'Default',
  },
  {
    name: 'restore',
    channel: 'request-restore-defaults',
    owner: 'mainWin',
  },
  {
    name: 'edit',
    channel: 'edit-preset',
    owner: 'presetWin',
    payload: {
      originalName: 'Default',
      newPreset: { name: 'New', wpm: 300, description: 'New text' },
    },
  },
];

function assertRejectedPresetMutation(harness, result) {
  assert.deepEqual(result, { ok: false, code: 'UNAUTHORIZED' });
  assert.equal(harness.getDisk(), harness.initialDisk);
  assert.deepEqual(harness.sent, []);
  assert.deepEqual(harness.dialogCalls, []);
}

for (const scenario of protectedPresetIpcCases) {
  test(`${scenario.name} rejects a mismatched sender before side effects`, async (t) => {
    const harness = createPresetHarness(t);
    const result = await harness.invokeFrom(
      scenario.channel,
      harness.windows.otherWin.webContents,
      scenario.payload
    );

    assertRejectedPresetMutation(harness, result);
  });

  test(`${scenario.name} rejects requests when its expected owner is unavailable`, async (t) => {
    const harness = createPresetHarness(t, {
      windowResolver(windows) {
        return { ...windows, [scenario.owner]: null };
      },
    });
    const result = await harness.invokeFrom(
      scenario.channel,
      harness.windows[scenario.owner].webContents,
      scenario.payload
    );

    assertRejectedPresetMutation(harness, result);
  });
}

test('create rejects an unmappable sender before side effects', async (t) => {
  const harness = createPresetHarness(t);
  const result = await harness.invokeFrom(
    'create-preset',
    {},
    { name: 'New', wpm: 300, description: 'New text' }
  );

  assertRejectedPresetMutation(harness, result);
});

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

test('registerIpc seeds missing configured default-preset files from bundled sources', (t) => {
  const harness = createPresetHarness(t, { writeConfiguredDefaults: false });

  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(harness.configPresetsDir, 'defaults_presets.json'), 'utf8')),
    [{ name: 'default', wpm: 250, description: 'Default preset.' }]
  );
  assert.equal(
    fs.existsSync(path.join(harness.configPresetsDir, 'defaults_presets_en.json')),
    true
  );
  assert.equal(
    fs.existsSync(path.join(harness.configPresetsDir, 'defaults_presets_es.json')),
    true
  );
});

test('registerIpc does not overwrite an existing configured default-preset file', (t) => {
  const harness = createPresetHarness(t, {
    writeConfiguredDefaults: false,
    initialConfigFiles: { 'defaults_presets.json': '[]' },
  });

  assert.equal(
    fs.readFileSync(path.join(harness.configPresetsDir, 'defaults_presets.json'), 'utf8'),
    '[]'
  );
});

test('get-default-presets keeps an existing catalog empty when no configured entry is valid', async (t) => {
  const harness = createPresetHarness(t);
  const configDefaults = path.join(
    harness.configPresetsDir,
    'defaults_presets.json'
  );
  fs.writeFileSync(configDefaults, JSON.stringify([null, { name: 'Missing WPM' }]));

  const defaults = await harness.invoke('get-default-presets');

  assert.deepEqual(defaults.general, []);
});

test('get-default-presets keeps explicit empty, malformed, and non-array configured catalogs empty', async (t) => {
  const harness = createPresetHarness(t);
  const configDefaults = path.join(harness.configPresetsDir, 'defaults_presets.json');
  const englishDefaults = path.join(harness.configPresetsDir, 'defaults_presets_en.json');

  fs.writeFileSync(configDefaults, '[]');
  fs.writeFileSync(englishDefaults, '{');
  let defaults = await harness.invoke('get-default-presets');
  assert.deepEqual(defaults.general, []);
  assert.deepEqual(defaults.languagePresets.en, []);

  fs.writeFileSync(configDefaults, '{}');
  fs.writeFileSync(englishDefaults, '[]');
  defaults = await harness.invoke('get-default-presets');
  assert.deepEqual(defaults.general, []);
  assert.deepEqual(defaults.languagePresets.en, []);
});

test('get-default-presets reads the complete catalog, including malformed unrelated languages', async (t) => {
  const harness = createPresetHarness(t);
  const otherLanguagePath = writeActiveAndMalformedOtherLanguageDefaults(harness);

  const { result: defaults, warnings } = await captureWarnings(() =>
    harness.invoke('get-default-presets')
  );

  assert.deepEqual(defaults.general, []);
  assert.deepEqual(defaults.languagePresets.en, [
    { name: 'Default', wpm: 240, description: 'English default' },
  ]);
  assert.deepEqual(defaults.languagePresets.es, []);
  assert.equal(
    warnings.some((args) => args.includes(otherLanguagePath)),
    true
  );
});

test('get-default-presets preserves its empty public result when the catalog is unavailable', async (t) => {
  const harness = createPresetHarness(t);
  makeDefaultPresetCatalogUnavailable(harness);

  assert.deepEqual(
    await harness.invoke('get-default-presets'),
    { general: [], languagePresets: {} }
  );
});

for (const scenario of [
  { name: 'delete', channel: 'request-delete-preset', payload: 'Default' },
  {
    name: 'edit',
    channel: 'edit-preset',
    payload: {
      originalName: 'Default',
      newPreset: { name: 'Edited', wpm: 275, description: 'Edited default' },
    },
  },
  { name: 'restore', channel: 'request-restore-defaults' },
]) {
  test(`main ${scenario.name} preserves settings when the catalog is unavailable`, async (t) => {
    const harness = createPresetHarness(t);
    makeDefaultPresetCatalogUnavailable(harness);

    assert.deepEqual(
      await harness.invoke(scenario.channel, scenario.payload),
      { ok: false, code: 'DEFAULT_CATALOG_UNAVAILABLE' }
    );
    assert.equal(harness.getDisk(), harness.initialDisk);
    assert.deepEqual(harness.sent, []);
  });
}

for (const scenario of [
  {
    name: 'delete',
    channel: 'request-delete-preset',
    payload: 'Default',
    assertResult: (result) => assert.equal(result.action, 'deleted_and_ignored'),
  },
  {
    name: 'edit',
    channel: 'edit-preset',
    payload: {
      originalName: 'Default',
      newPreset: { name: 'Edited', wpm: 275, description: 'Edited default' },
    },
    assertResult: (result) => assert.equal(result.deletedAction, 'deleted_and_ignored'),
  },
  {
    name: 'restore',
    channel: 'request-restore-defaults',
    assertResult: (result) => assert.deepEqual(result.removedCustom, ['Default']),
  },
]) {
  test(`main ${scenario.name} uses the active-language catalog without reading unrelated languages`, async (t) => {
    const harness = createPresetHarness(t);
    const otherLanguagePath = writeActiveAndMalformedOtherLanguageDefaults(harness);

    const { result, warnings } = await captureWarnings(() =>
      harness.invoke(scenario.channel, scenario.payload)
    );

    scenario.assertResult(result);
    assert.equal(
      warnings.some((args) => args.includes(otherLanguagePath)),
      false
    );
  });
}

test('delete resolves an empty configured catalog the same way as get-default-presets', async (t) => {
  const harness = createPresetHarness(t);
  fs.writeFileSync(path.join(harness.configPresetsDir, 'defaults_presets.json'), '[]');

  assert.deepEqual((await harness.invoke('get-default-presets')).general, []);
  assert.equal((await harness.invoke('create-preset', {
    name: 'default',
    wpm: 250,
    description: 'User preset',
  })).ok, true);

  const result = await harness.invoke('request-delete-preset', 'default');
  const saved = JSON.parse(harness.getDisk());

  assert.equal(result.action, 'deleted_custom');
  assert.equal(saved.disabled_default_presets.en.includes('default'), false);
});

test('edit resolves an empty configured catalog the same way as get-default-presets', async (t) => {
  const harness = createPresetHarness(t);
  fs.writeFileSync(path.join(harness.configPresetsDir, 'defaults_presets.json'), '[]');

  assert.deepEqual((await harness.invoke('get-default-presets')).general, []);
  assert.equal((await harness.invoke('create-preset', {
    name: 'default',
    wpm: 250,
    description: 'User preset',
  })).ok, true);

  const result = await harness.invoke('edit-preset', {
    originalName: 'default',
    newPreset: { name: 'Edited', wpm: 275, description: 'Edited user preset' },
  });
  const saved = JSON.parse(harness.getDisk());

  assert.equal(result.deletedAction, 'deleted_custom');
  assert.equal(saved.disabled_default_presets.en.includes('default'), false);
});

test('restore resolves an empty configured catalog the same way as get-default-presets', async (t) => {
  const harness = createPresetHarness(t);
  fs.writeFileSync(path.join(harness.configPresetsDir, 'defaults_presets.json'), '[]');

  assert.deepEqual((await harness.invoke('get-default-presets')).general, []);
  assert.equal((await harness.invoke('create-preset', {
    name: 'default',
    wpm: 250,
    description: 'User preset',
  })).ok, true);

  const result = await harness.invoke('request-restore-defaults');
  const saved = JSON.parse(harness.getDisk());

  assert.deepEqual(result.removedCustom, []);
  assert.equal(
    saved.presets_by_language.en.some((preset) => preset.name === 'default'),
    true
  );
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

for (const scenario of [
  {
    name: 'create',
    channel: 'create-preset',
    payload: { name: 'New', wpm: 300, description: 'New text' },
    notificationResolutionCall: 2,
  },
  {
    name: 'edit',
    channel: 'edit-preset',
    payload: {
      originalName: 'Default',
      newPreset: { name: 'New', wpm: 300, description: 'New text' },
    },
    notificationResolutionCall: 3,
  },
]) {
  test(`${scenario.name} reports success when post-save preset-created notification window resolution fails`, async (t) => {
    let resolutionCount = 0;
    const harness = createPresetHarness(t, {
      windowResolver(windows) {
        resolutionCount += 1;
        if (resolutionCount === scenario.notificationResolutionCall) {
          throw new Error('notification window lookup failed');
        }
        return windows;
      },
    });

    const { result, warnings } = await captureWarnings(() =>
      harness.invoke(scenario.channel, scenario.payload)
    );
    const saved = JSON.parse(harness.getDisk());

    assert.equal(result.ok, true);
    assert.deepEqual(
      saved.presets_by_language.en.find((preset) => preset.name === 'New'),
      { name: 'New', wpm: 300, description: 'New text' }
    );
    assert.equal(
      harness.sent.some((message) => message.channel === 'settings-updated'),
      true
    );
    assert.equal(
      harness.sent.some((message) => message.channel === 'preset-created'),
      false
    );
    assert.equal(
      warnings.some((args) => args.includes('[presets_main] preset-created notify failed (ignored):')),
      true
    );
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
