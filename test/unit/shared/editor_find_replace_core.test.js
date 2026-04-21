'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  selectionMatchesLiteralQuery,
  computeLiteralReplaceAll,
} = require('../../../public/js/lib/editor_find_replace_core');

test('selectionMatchesLiteralQuery uses case-insensitive matching by default', () => {
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

test('selectionMatchesLiteralQuery folds accents when matchCase is off', () => {
  assert.equal(
    selectionMatchesLiteralQuery({
      value: 'uno canción dos',
      selectionStart: 4,
      selectionEnd: 11,
      query: 'cancion',
      matchCase: false,
    }),
    true
  );

  assert.equal(
    selectionMatchesLiteralQuery({
      value: 'uno cancion dos',
      selectionStart: 4,
      selectionEnd: 11,
      query: 'canción',
      matchCase: false,
    }),
    true
  );

  assert.equal(
    selectionMatchesLiteralQuery({
      value: 'uno canción dos',
      selectionStart: 4,
      selectionEnd: 11,
      query: 'cancion',
      matchCase: true,
    }),
    false
  );
});

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
