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

test('canonical text snapshots use exact nearest-second reading estimates', () => {
  const baseMetrics = {
    count: {
      words: 123,
      mode: 'simple',
    },
    reading: {
      estimatedSeconds: 62,
      wpm: 120,
    },
  };

  assert.equal(snapshotSchema.validateSnapshotDocument(createSnapshot({ metrics: baseMetrics })).ok, true);
  assert.equal(snapshotSchema.validateSnapshotDocument(createSnapshot({
    metrics: {
      ...baseMetrics,
      reading: { estimatedSeconds: 61, wpm: 120 },
    },
  })).ok, false);
});

test('canonical text snapshots accept optional name and single-line source comments', () => {
  const info = snapshotSchema.validateSnapshotDocument(createSnapshot({
    name: 'Reading',
    sourceComment: 'chapter-1.pdf, Unit 1',
  }));

  assert.equal(info.ok, true);
  assert.equal(info.snapshot.name, 'Reading');
  assert.equal(info.snapshot.sourceComment, 'chapter-1.pdf, Unit 1');
});

test('canonical text snapshots reject invalid name and source-comment values', () => {
  const invalidOverrides = [
    { name: '' },
    { name: 'x'.repeat(121) },
    { name: 'Reading\nnotes' },
    { sourceComment: '' },
    { sourceComment: 'source\nnotes' },
    { sourceComment: 'x'.repeat(65_537) },
  ];

  invalidOverrides.forEach((overrides) => {
    const info = snapshotSchema.validateSnapshotDocument(createSnapshot(overrides));
    assert.equal(info.ok, false);
    assert.equal(info.code, 'INVALID_SCHEMA');
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
        mode: 'simple',
        locale: 'en',
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

test('simple count metrics do not require Intl locale canonicalization', (t) => {
  const originalGetCanonicalLocales = Intl.getCanonicalLocales;
  Intl.getCanonicalLocales = undefined;
  t.after(() => {
    Intl.getCanonicalLocales = originalGetCanonicalLocales;
  });

  const simpleInfo = snapshotSchema.validateSnapshotDocument(createSnapshot({
    metrics: {
      count: {
        words: 100,
        mode: 'simple',
      },
    },
  }));
  const preciseInfo = snapshotSchema.validateSnapshotDocument(createSnapshot({
    metrics: {
      count: {
        words: 100,
        mode: 'preciso',
        locale: 'en',
      },
    },
  }));

  assert.equal(simpleInfo.ok, true);
  assert.equal(preciseInfo.ok, false);
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
