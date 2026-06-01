'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  findLiteralMatchRanges,
  resolveLiteralMatchByOrdinal,
  computeLiteralReplaceAll,
} = require('../../../public/js/lib/editor_find_replace_core');

test('computeLiteralReplaceAll replaces left-to-right with non-overlapping matches', () => {
  const result = computeLiteralReplaceAll({
    value: 'aaaa',
    query: 'aa',
    replacement: 'b',
    matchCase: false,
  });

  assert.deepEqual(result, {
    replacements: 2,
    nextValue: 'bb',
  });
});

test('computeLiteralReplaceAll folds accents when matchCase is off', () => {
  const result = computeLiteralReplaceAll({
    value: 'canción y cancion',
    query: 'cancion',
    replacement: 'tema',
    matchCase: false,
  });

  assert.deepEqual(result, {
    replacements: 2,
    nextValue: 'tema y tema',
  });
});

test('computeLiteralReplaceAll returns unchanged text when there are no matches or query is empty', () => {
  assert.deepEqual(
    computeLiteralReplaceAll({
      value: 'alpha beta',
      query: '',
      replacement: 'z',
      matchCase: false,
    }),
    {
      replacements: 0,
      nextValue: 'alpha beta',
    }
  );

  assert.deepEqual(
    computeLiteralReplaceAll({
      value: 'alpha beta',
      query: 'gamma',
      replacement: 'z',
      matchCase: false,
    }),
    {
      replacements: 0,
      nextValue: 'alpha beta',
    }
  );
});

test('findLiteralMatchRanges returns non-overlapping literal ranges left-to-right', () => {
  assert.deepEqual(
    findLiteralMatchRanges({
      value: 'uno cancion dos canción tres',
      query: 'cancion',
      matchCase: false,
    }),
    [
      { start: 4, end: 11 },
      { start: 16, end: 23 },
    ]
  );
});

test('resolveLiteralMatchByOrdinal returns the requested match range', () => {
  assert.deepEqual(
    resolveLiteralMatchByOrdinal({
      value: 'alpha beta alpha beta',
      query: 'beta',
      ordinal: 2,
      matchCase: false,
    }),
    { start: 17, end: 21 }
  );

  assert.equal(
    resolveLiteralMatchByOrdinal({
      value: 'alpha beta',
      query: 'beta',
      ordinal: 3,
      matchCase: false,
    }),
    null
  );
});
