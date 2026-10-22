'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const snapshotTagCatalog = require('../../../public/js/lib/snapshot_tag_catalog');

function loadSnapshotsModule({
  promptResult,
  promptSnapshotSaveImpl = null,
  getCurrentWpm = null,
  saveResult = { ok: true },
  loadResult = { ok: true },
} = {}) {
  const saveCalls = [];
  const toastCalls = [];
  const logCalls = [];
  const sandbox = {
    window: {
      getLogger() {
        return {
          debug(...args) {
            logCalls.push({ level: 'debug', args });
          },
          warn(...args) {
            logCalls.push({ level: 'warn', args });
          },
          error(...args) {
            logCalls.push({ level: 'error', args });
          },
        };
      },
      SnapshotTagCatalog: snapshotTagCatalog,
      Notify: {
        async promptSnapshotSave() {
          if (typeof promptSnapshotSaveImpl === 'function') {
            return promptSnapshotSaveImpl();
          }
          return promptResult;
        },
        toastMain(key, options) {
          toastCalls.push({ key, options });
        },
      },
      electronAPI: {
        async saveCurrentTextSnapshot(payload) {
          saveCalls.push(payload);
          return saveResult;
        },
        async loadCurrentTextSnapshot() {
          return loadResult;
        },
      },
    },
    console,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/current_text_snapshots.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/current_text_snapshots.js' });

  const snapshots = sandbox.window.CurrentTextSnapshots;
  if (typeof getCurrentWpm === 'function') {
    snapshots.configure({ getCurrentWpm });
  }
  return { snapshots, saveCalls, toastCalls, logCalls };
}

test('manual snapshot save forwards selected count and reading metadata with active WPM', async () => {
  const { snapshots, saveCalls } = loadSnapshotsModule({
    promptResult: {
      tags: { language: ['es'] },
      includeCount: true,
      includeReading: true,
    },
    getCurrentWpm: () => 240,
  });

  const result = await snapshots.saveSnapshot();

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(JSON.parse(JSON.stringify(saveCalls)), [{
    includeCount: true,
    includeReading: true,
    tags: { language: ['es'] },
    wpm: 240,
  }]);
});

test('manual snapshot prompt failure reports save failure instead of cancellation', async () => {
  const { snapshots, saveCalls, toastCalls, logCalls } = loadSnapshotsModule({
    promptSnapshotSaveImpl() {
      throw new Error('Snapshot prompt DOM elements missing.');
    },
  });

  const result = await snapshots.saveSnapshot();

  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    ok: false,
    code: 'WRITE_FAILED',
    error: 'Error: Snapshot prompt DOM elements missing.',
  });
  assert.deepEqual(saveCalls, []);
  assert.deepEqual(JSON.parse(JSON.stringify(toastCalls)), [{
    key: 'renderer.snapshots.alerts.save_error',
    options: { type: 'error' },
  }]);
  assert.equal(logCalls.filter(({ level }) => level === 'error').length, 1);
});

test('manual snapshot save forwards an intentional no-metrics selection without WPM', async () => {
  const { snapshots, saveCalls } = loadSnapshotsModule({
    promptResult: {
      tags: {},
      includeCount: false,
      includeReading: false,
    },
  });

  const result = await snapshots.saveSnapshot();

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(JSON.parse(JSON.stringify(saveCalls)), [{
    includeCount: false,
    includeReading: false,
    tags: {},
  }]);
});

test('manual snapshot save forwards optional snapshot name and source comment', async () => {
  const { snapshots, saveCalls } = loadSnapshotsModule({
    promptResult: {
      name: 'Reading',
      sourceComment: 'chapter-1.pdf, Unit 1',
      tags: {},
      includeCount: false,
      includeReading: false,
    },
  });

  const result = await snapshots.saveSnapshot();

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(JSON.parse(JSON.stringify(saveCalls)), [{
    name: 'Reading',
    sourceComment: 'chapter-1.pdf, Unit 1',
    includeCount: false,
    includeReading: false,
    tags: {},
  }]);
});

test('manual snapshot save logs an invalid falsey IPC result while preserving the error response', async () => {
  const { snapshots, toastCalls, logCalls } = loadSnapshotsModule({
    promptResult: {
      tags: {},
      includeCount: false,
      includeReading: false,
    },
    saveResult: null,
  });

  const result = await snapshots.saveSnapshot();

  assert.equal(result, null);
  assert.deepEqual(JSON.parse(JSON.stringify(toastCalls)), [{
    key: 'renderer.snapshots.alerts.save_error',
    options: { type: 'error' },
  }]);
  assert.deepEqual(logCalls.filter(({ level }) => level === 'error'), [{
    level: 'error',
    args: ['Snapshot save IPC returned an invalid result:', null],
  }]);
});

test('manual snapshot load logs an invalid falsey IPC result while preserving the error response', async () => {
  const { snapshots, toastCalls, logCalls } = loadSnapshotsModule({ loadResult: null });

  const result = await snapshots.loadSnapshot();

  assert.equal(result, null);
  assert.deepEqual(JSON.parse(JSON.stringify(toastCalls)), [{
    key: 'renderer.snapshots.alerts.load_error',
    options: { type: 'error' },
  }]);
  assert.deepEqual(logCalls.filter(({ level }) => level === 'error'), [{
    level: 'error',
    args: ['Snapshot load IPC returned an invalid result:', null],
  }]);
});

test('manual snapshot operations reject malformed responses with operation-specific error feedback', async () => {
  const promptResult = {
    tags: {},
    includeCount: false,
    includeReading: false,
  };
  const saveHarness = loadSnapshotsModule({
    promptResult,
    saveResult: { code: 'CANCELLED' },
  });
  const loadHarness = loadSnapshotsModule({
    loadResult: { code: 'CONFIRM_DENIED' },
  });

  const saveResult = await saveHarness.snapshots.saveSnapshot();
  const loadResult = await loadHarness.snapshots.loadSnapshot();

  assert.deepEqual(saveResult, { code: 'CANCELLED' });
  assert.deepEqual(loadResult, { code: 'CONFIRM_DENIED' });
  assert.deepEqual(JSON.parse(JSON.stringify(saveHarness.toastCalls)), [{
    key: 'renderer.snapshots.alerts.save_error',
    options: { type: 'error' },
  }]);
  assert.deepEqual(JSON.parse(JSON.stringify(loadHarness.toastCalls)), [{
    key: 'renderer.snapshots.alerts.load_error',
    options: { type: 'error' },
  }]);
  assert.deepEqual(JSON.parse(JSON.stringify(saveHarness.logCalls.filter(({ level }) => level === 'error'))), [{
    level: 'error',
    args: ['Snapshot save IPC returned an invalid result:', { code: 'CANCELLED' }],
  }]);
  assert.deepEqual(JSON.parse(JSON.stringify(loadHarness.logCalls.filter(({ level }) => level === 'error'))), [{
    level: 'error',
    args: ['Snapshot load IPC returned an invalid result:', { code: 'CONFIRM_DENIED' }],
  }]);
});

test('manual snapshot operations log malformed failure envelopes while using generic error feedback', async () => {
  const promptResult = {
    tags: {},
    includeCount: false,
    includeReading: false,
  };
  const saveHarness = loadSnapshotsModule({
    promptResult,
    saveResult: { ok: false },
  });
  const loadHarness = loadSnapshotsModule({
    loadResult: { ok: false, code: 123 },
  });

  const saveResult = await saveHarness.snapshots.saveSnapshot();
  const loadResult = await loadHarness.snapshots.loadSnapshot();

  assert.deepEqual(saveResult, { ok: false });
  assert.deepEqual(loadResult, { ok: false, code: 123 });
  assert.deepEqual(JSON.parse(JSON.stringify(saveHarness.toastCalls)), [{
    key: 'renderer.snapshots.alerts.save_error',
    options: { type: 'error' },
  }]);
  assert.deepEqual(JSON.parse(JSON.stringify(loadHarness.toastCalls)), [{
    key: 'renderer.snapshots.alerts.load_error',
    options: { type: 'error' },
  }]);
  assert.deepEqual(JSON.parse(JSON.stringify(saveHarness.logCalls.filter(({ level }) => level === 'error'))), [{
    level: 'error',
    args: ['Snapshot save IPC returned an invalid result:', { ok: false }],
  }]);
  assert.deepEqual(JSON.parse(JSON.stringify(loadHarness.logCalls.filter(({ level }) => level === 'error'))), [{
    level: 'error',
    args: ['Snapshot load IPC returned an invalid result:', { ok: false, code: 123 }],
  }]);
});

test('manual snapshot operations preserve valid caller-specific cancellation responses', async () => {
  const promptResult = {
    tags: {},
    includeCount: false,
    includeReading: false,
  };
  const saveHarness = loadSnapshotsModule({
    promptResult,
    saveResult: { ok: false, code: 'CANCELLED' },
  });
  const loadHarness = loadSnapshotsModule({
    loadResult: { ok: false, code: 'CONFIRM_DENIED' },
  });

  await saveHarness.snapshots.saveSnapshot();
  await loadHarness.snapshots.loadSnapshot();

  assert.deepEqual(saveHarness.toastCalls, []);
  assert.deepEqual(loadHarness.toastCalls, []);
});
