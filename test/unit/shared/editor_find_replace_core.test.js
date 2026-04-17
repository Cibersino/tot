'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  selectionMatchesLiteralQuery,
  computeLiteralReplaceAll,
  isReplaceAllAllowedByLength,
} = require('../../../public/js/lib/editor_find_replace_core');

test('selectionMatchesLiteralQuery uses literal case-insensitive matching by default', () => {
  assert.equal(
    selectionMatchesLiteralQuery({
      value: 'uno Prueba dos',
      selectionStart: 4,
      selectionEnd: 10,
      query: 'prueba',
      matchCase: false,
    }),
    true
  );

  assert.equal(
    selectionMatchesLiteralQuery({
      value: 'uno Prueba dos',
      selectionStart: 4,
      selectionEnd: 10,
      query: 'PRUEBAS',
      matchCase: false,
    }),
    false
  );
});

test('computeLiteralReplaceAll replaces left-to-right with non-overlapping literal matches', () => {
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

test('isReplaceAllAllowedByLength enforces the configured threshold', () => {
  assert.equal(
    isReplaceAllAllowedByLength({
      value: 'abcd',
      smallUpdateThreshold: 4,
    }),
    true
  );

  assert.equal(
    isReplaceAllAllowedByLength({
      value: 'abcde',
      smallUpdateThreshold: 4,
    }),
    false
  );
});

test('isReplaceAllAllowedByLength rejects invalid thresholds', () => {
  assert.throws(
    () => isReplaceAllAllowedByLength({ value: 'abc', smallUpdateThreshold: -1 }),
    /\[editor_find_replace_core\] smallUpdateThreshold must be a non-negative number/
  );
});

