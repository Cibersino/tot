'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const snapshotTagCatalog = require('../../../public/js/lib/snapshot_tag_catalog');

function loadSnapshotsModule({
  promptResult,
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
    args: ['Snapshot save IPC returned a falsey result.'],
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
    args: ['Snapshot load IPC returned a falsey result.'],
  }]);
});
