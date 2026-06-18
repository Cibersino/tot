'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const snapshotTagCatalog = require('../../../public/js/lib/snapshot_tag_catalog');

function getDefaultLabel(option) {
  const labels = {
    'renderer.snapshots.options.language.en': 'Zulu',
    'renderer.snapshots.options.language.es': 'Alpha',
    'renderer.snapshots.options.language.mi': 'Mike',
    'renderer.snapshots.options.type.fiction': 'Ficción',
    'renderer.snapshots.options.type.non_fiction': 'No ficción',
    'renderer.snapshots.options.difficulty.easy': 'Easy',
    'renderer.snapshots.options.difficulty.normal': 'Normal',
    'renderer.snapshots.options.difficulty.hard': 'Hard',
  };
  return labels[option.labelKey] || option.value;
}

test('buildCustomTagValue uses a category namespace and normalized slug', () => {
  assert.equal(
    snapshotTagCatalog.buildCustomTagValue('type', '  Short   story  '),
    'custom:type:short-story'
  );
});

test('normalizeLanguageTag keeps valid non-catalog language tags open', () => {
  const customLanguage = snapshotTagCatalog.buildCustomTagValue('language', 'Plain text');

  assert.equal(snapshotTagCatalog.normalizeLanguageTag('es-cl'), 'es-cl');
  assert.equal(snapshotTagCatalog.normalizeLanguageTag('fr_CA'), 'fr-CA');
  assert.equal(snapshotTagCatalog.normalizeLanguageTag('zh-hans'), 'zh-Hans');
  assert.equal(snapshotTagCatalog.normalizeLanguageTag(customLanguage), customLanguage);
});

test('createCustomTag rejects normalized duplicates against localized default labels', () => {
  const result = snapshotTagCatalog.createCustomTag(
    snapshotTagCatalog.createEmptySnapshotTagPreferences(),
    'type',
    'ficcion',
    { getDefaultLabel }
  );

  assert.equal(result.ok, false);
  assert.equal(result.code, 'duplicate');
  assert.equal(result.existingOption.value, 'fiction');
});

test('createCustomTag appends to the end and restored hidden defaults append in baseline order', () => {
  const createInfo = snapshotTagCatalog.createCustomTag(
    snapshotTagCatalog.createEmptySnapshotTagPreferences(),
    'type',
    'Essay',
    { getDefaultLabel }
  );
  assert.equal(createInfo.ok, true);

  const hideFictionInfo = snapshotTagCatalog.hideDefaultTag(
    createInfo.preferences,
    'type',
    'fiction',
    { getDefaultLabel }
  );
  assert.equal(hideFictionInfo.ok, true);

  const hideNonFictionInfo = snapshotTagCatalog.hideDefaultTag(
    hideFictionInfo.preferences,
    'type',
    'non_fiction',
    { getDefaultLabel }
  );
  assert.equal(hideNonFictionInfo.ok, true);

  const restoreInfo = snapshotTagCatalog.restoreHiddenDefaultTags(
    hideNonFictionInfo.preferences,
    'type',
    { getDefaultLabel }
  );
  assert.equal(restoreInfo.ok, true);

  const customValue = snapshotTagCatalog.buildCustomTagValue('type', 'Essay');
  assert.deepEqual(
    snapshotTagCatalog.resolveCategoryCatalog('type', restoreInfo.preferences, { getDefaultLabel })
      .visibleOptions
      .map((option) => option.value),
    [customValue, 'fiction', 'non_fiction']
  );
});

test('alphabetical sort uses the current labels when invoked and later label changes do not reshuffle saved order', () => {
  const hiddenDefaults = snapshotTagCatalog.LANGUAGE_OPTIONS
    .map((option) => option.value)
    .filter((value) => !['en', 'es', 'mi'].includes(value));
  const sortedInfo = snapshotTagCatalog.sortVisibleTagValuesAlphabetically(
    {
      language: {
        custom: [],
        hiddenDefaults,
        order: ['en', 'mi', 'es'],
      },
    },
    'language',
    { getDefaultLabel }
  );
  assert.equal(sortedInfo.ok, true);

  assert.deepEqual(
    sortedInfo.preferences.language.order.slice(0, 3),
    ['es', 'mi', 'en']
  );

  const resolvedWithDifferentLabels = snapshotTagCatalog.resolveCategoryCatalog(
    'language',
    sortedInfo.preferences,
    {
      getDefaultLabel(option) {
        const labels = {
          'renderer.snapshots.options.language.en': 'English',
          'renderer.snapshots.options.language.es': 'Spanish',
          'renderer.snapshots.options.language.mi': 'Māori',
        };
        return labels[option.labelKey] || option.value;
      },
    }
  );

  assert.deepEqual(
    resolvedWithDifferentLabels.visibleOptions.slice(0, 3).map((option) => option.value),
    ['es', 'mi', 'en']
  );
});
