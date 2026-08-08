'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const snapshotTagCatalog = require('../../../public/js/lib/snapshot_tag_catalog');

function loadSnapshotsModule({ promptResult, getCurrentWpm = null } = {}) {
  const saveCalls = [];
  const toastCalls = [];
  const sandbox = {
    window: {
      getLogger() {
        return {
          debug() {},
          warn() {},
          error() {},
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
          return { ok: true };
        },
        async loadCurrentTextSnapshot() {
          return { ok: true };
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
  return { snapshots, saveCalls, toastCalls };
}

test('manual snapshot save forwards selected count and reading metadata with active WPM', async () => {
  const { snapshots, saveCalls } = loadSnapshotsModule({
    promptResult: {
      tags: { language: 'es' },
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
    tags: { language: 'es' },
    wpm: 240,
  }]);
});

test('manual snapshot save forwards an intentional no-metrics selection without WPM', async () => {
  const { snapshots, saveCalls } = loadSnapshotsModule({
    promptResult: {
      tags: null,
      includeCount: false,
      includeReading: false,
    },
  });

  const result = await snapshots.saveSnapshot();

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(JSON.parse(JSON.stringify(saveCalls)), [{
    includeCount: false,
    includeReading: false,
  }]);
});

test('manual snapshot save forwards optional snapshot name and source comment', async () => {
  const { snapshots, saveCalls } = loadSnapshotsModule({
    promptResult: {
      name: 'Reading',
      sourceComment: 'chapter-1.pdf, Unit 1',
      tags: null,
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
  }]);
});
