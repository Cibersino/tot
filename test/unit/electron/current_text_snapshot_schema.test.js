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

test('canonical text snapshots accept count-only and count-plus-reading metrics', () => {
  const countOnlyInfo = snapshotSchema.validateSnapshotDocument(createSnapshot({
    metrics: {
      count: {
        words: 100,
        mode: 'simple',
        locale: 'en',
      },
    },
  }));
  const countAndReadingInfo = snapshotSchema.validateSnapshotDocument(createSnapshot({
    metrics: {
      count: {
        words: 100,
        mode: 'preciso',
        locale: 'es-cl',
      },
      reading: {
        estimatedSeconds: 30,
        wpm: 200,
      },
    },
  }));

  assert.deepEqual(countOnlyInfo, {
    ok: true,
    snapshot: createSnapshot({
      metrics: {
        count: {
          words: 100,
          mode: 'simple',
          locale: 'en',
        },
      },
    }),
    questions: [],
  });
  assert.equal(countAndReadingInfo.ok, true);
  assert.deepEqual(countAndReadingInfo.snapshot.metrics, {
    count: {
      words: 100,
      mode: 'preciso',
      locale: 'es-CL',
    },
    reading: {
      estimatedSeconds: 30,
      wpm: 200,
    },
  });
});

test('canonical text snapshots reject incomplete or inconsistent metrics', () => {
  const invalidMetrics = [
    {},
    {
      reading: {
        estimatedSeconds: 30,
        wpm: 200,
      },
    },
    {
      count: {
        words: 100,
        mode: 'precise',
        locale: 'en',
      },
    },
    {
      count: {
        words: 100,
        mode: 'preciso',
        locale: 'invalid_locale!',
      },
    },
    {
      count: {
        words: -1,
        mode: 'preciso',
        locale: 'en',
      },
    },
    {
      count: {
        words: 1.5,
        mode: 'preciso',
        locale: 'en',
      },
    },
    {
      count: {
        words: Number.MAX_SAFE_INTEGER + 1,
        mode: 'preciso',
        locale: 'en',
      },
    },
    {
      count: {
        words: 100,
        mode: 'preciso',
        locale: 'en',
      },
      reading: {
        estimatedSeconds: 31,
        wpm: 200,
      },
    },
    {
      count: {
        words: 100,
        mode: 'preciso',
        locale: 'en',
      },
      reading: {
        estimatedSeconds: 30.5,
        wpm: 200,
      },
    },
    {
      count: {
        words: 100,
        mode: 'preciso',
        locale: 'en',
      },
      reading: {
        estimatedSeconds: 30,
        wpm: 9,
      },
    },
    {
      count: {
        words: 100,
        mode: 'preciso',
        locale: 'en',
      },
      reading: {
        estimatedSeconds: 30,
        wpm: 200.5,
      },
    },
    {
      count: {
        words: 100,
        mode: 'preciso',
        locale: 'en',
      },
      reading: {
        estimatedSeconds: 30,
        wpm: Number.MAX_SAFE_INTEGER + 1,
      },
    },
    {
      count: {
        words: 100,
        mode: 'preciso',
        locale: 'en',
        extra: true,
      },
    },
  ];

  invalidMetrics.forEach((metrics) => {
    const info = snapshotSchema.validateSnapshotDocument(createSnapshot({ metrics }));
    assert.equal(info.ok, false);
    assert.equal(info.code, 'INVALID_SCHEMA');
  });
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
