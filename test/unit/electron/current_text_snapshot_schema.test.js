'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const snapshotSchema = require('../../../electron/current_text_snapshot_schema');

function createSnapshot(overrides = {}) {
  return {
    type: 'text snapshot',
    meta: {
      savedAt: '2026-08-03T00:00:00.000Z',
      savedWith: 'toT (totapp.org)',
    },
    text: 'Snapshot text.',
    tags: {},
    ...overrides,
  };
}

test('canonical text snapshots accept the optional readingTest field', () => {
  const readingTest = {
    questions: [
      {
        id: 'q1',
        prompt: 'Which snapshot is this?',
        correctOptionId: 'a',
        options: [
          { id: 'a', text: 'The canonical one' },
          { id: 'b', text: 'Another one' },
        ],
      },
    ],
  };

  const baseInfo = snapshotSchema.validateSnapshotDocument(createSnapshot());
  const readingTestInfo = snapshotSchema.validateSnapshotDocument(createSnapshot({ readingTest }));

  assert.equal(baseInfo.ok, true);
  assert.equal(readingTestInfo.ok, true);
  assert.deepEqual(readingTestInfo.snapshot.readingTest, readingTest);
});

test('canonical text snapshots reject legacy and unknown root fields', () => {
  const legacyInfo = snapshotSchema.validateSnapshotDocument({
    text: 'Former snapshot shape.',
    tags: {},
  });
  const unknownFieldInfo = snapshotSchema.validateSnapshotDocument(createSnapshot({ extra: true }));

  assert.deepEqual(legacyInfo, {
    ok: false,
    code: 'INVALID_SCHEMA',
    message: 'invalid snapshot schema',
  });
  assert.deepEqual(unknownFieldInfo, {
    ok: false,
    code: 'INVALID_SCHEMA',
    message: 'invalid snapshot schema',
  });
});
