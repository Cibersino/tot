'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeFilterState,
} = require('../../../public/js/lib/reading_test_filters_core');

function createEntry({ language, type = 'fiction', difficulty, used = false }) {
  return {
    used,
    tags: {
      language,
      type,
      difficulty,
    },
  };
}

function mapOptionStateByValue(optionStates) {
  return new Map(optionStates.map((optionState) => [optionState.value, optionState]));
}

test('computeFilterState disables values with no compatible real entry under other active categories', () => {
  const entries = [
    createEntry({ language: 'en', difficulty: 'easy' }),
    createEntry({ language: 'en', difficulty: 'normal' }),
    createEntry({ language: 'es', difficulty: 'hard' }),
  ];

  const state = computeFilterState(entries, {
    language: ['en'],
    difficulty: ['normal'],
  });
  const difficultyOptions = mapOptionStateByValue(state.options.difficulty);

  assert.equal(state.eligibleCount, 1);
  assert.deepEqual(state.selection, {
    language: ['en'],
    type: [],
    difficulty: ['normal'],
  });
  assert.equal(difficultyOptions.get('easy').enabled, true);
  assert.equal(difficultyOptions.get('normal').checked, true);
  assert.equal(difficultyOptions.get('normal').enabled, true);
  assert.equal(difficultyOptions.get('hard').enabled, false);
});

test('computeFilterState keeps checked values enabled so the user can uncheck them', () => {
  const entries = [
    createEntry({ language: 'en', difficulty: 'normal' }),
    createEntry({ language: 'es', difficulty: 'hard' }),
  ];

  const state = computeFilterState(entries, {
    language: ['en'],
    difficulty: ['normal', 'hard'],
  });
  const difficultyOptions = mapOptionStateByValue(state.options.difficulty);

  assert.equal(state.eligibleCount, 1);
  assert.equal(difficultyOptions.get('normal').checked, true);
  assert.equal(difficultyOptions.get('normal').enabled, true);
  assert.equal(difficultyOptions.get('hard').checked, true);
  assert.equal(difficultyOptions.get('hard').enabled, true);
});

test('computeFilterState prunes stale selected values that no longer exist in the available option universe', () => {
  const entries = [
    createEntry({ language: 'en', difficulty: 'easy' }),
  ];

  const state = computeFilterState(entries, {
    language: ['en'],
    difficulty: ['hard'],
  });

  assert.deepEqual(state.selection, {
    language: ['en'],
    type: [],
    difficulty: [],
  });
  assert.equal(state.eligibleCount, 1);
});

test('computeFilterState derives custom option values directly from pool-entry tags', () => {
  const customLanguage = 'custom:language:plain-text';
  const customType = 'custom:type:short-story';
  const entries = [
    createEntry({ language: customLanguage, type: customType, difficulty: 'hard' }),
  ];

  const state = computeFilterState(entries, {});

  assert.deepEqual(
    state.options.language.map((optionState) => optionState.value),
    [customLanguage]
  );
  assert.deepEqual(
    state.options.type.map((optionState) => optionState.value),
    [customType]
  );
  assert.equal(state.eligibleCount, 1);
});
