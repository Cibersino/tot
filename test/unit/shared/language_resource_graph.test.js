'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const languageResourceGraph = require('../../../public/js/lib/language_resource_graph');
const languageCatalog = require('../../../i18n/languages.json');

const graph = languageResourceGraph.validateCatalog(languageCatalog, {
  defaultLanguage: 'en',
});

test('declares Chinese script languages as independent roots rather than syntax-derived variants', () => {
  assert.deepEqual(
    languageResourceGraph.getParentChain(graph, 'zh-Hans').map((node) => node.id),
    ['zh-Hans']
  );
  assert.deepEqual(
    languageResourceGraph.getMergeChain(graph, 'zh-Hans').map((node) => node.id),
    ['en', 'zh-Hans']
  );
  assert.equal(languageResourceGraph.getDescriptor(graph, 'zh-Hans').resourceDirectory, 'zh-hans');
  assert.equal(languageResourceGraph.getDescriptor(graph, 'zh-Hans-CN'), null);
  assert.equal(languageResourceGraph.getDescriptor(graph, 'zh-hans'), null);
});

test('declares es-CL as a non-selectable Spanish overlay with explicit inheritance', () => {
  assert.deepEqual(
    languageResourceGraph.getParentChain(graph, 'es-CL').map((node) => node.id),
    ['es-CL', 'es']
  );
  assert.deepEqual(
    languageResourceGraph.getMergeChain(graph, 'es-CL').map((node) => node.id),
    ['en', 'es', 'es-CL']
  );
  assert.deepEqual(
    languageResourceGraph.getCompleteResourceCandidates(graph, 'es-CL').map((node) => node.id),
    ['es-CL', 'es', 'en']
  );
  assert.equal(languageResourceGraph.getDescriptor(graph, 'es-CL').selectable, false);
  assert.equal(
    languageResourceGraph.getSelectableLanguages(graph).some((node) => node.id === 'es-CL'),
    false
  );
});

test('resolves only declared identifiers and declared aliases', () => {
  assert.equal(languageResourceGraph.resolveLanguageId(graph, 'zh-Hant'), 'zh-Hant');
  assert.equal(languageResourceGraph.resolveLanguageId(graph, 'ZH-Hant'), null);
  assert.equal(languageResourceGraph.resolveLanguageId(graph, 'es-cl'), null);
  assert.equal(languageResourceGraph.resolveLanguageId(graph, 'fr-CA'), null);
});

test('retains independently declared application, locale, OCR, scope, and resource identities', () => {
  const catalog = structuredClone(languageCatalog);
  catalog.languages.push({
    id: 'app-french-canada',
    kind: 'overlay',
    parentId: 'fr',
    resourceDirectory: 'app-fr-ca',
    localeTag: 'fr-CA',
    ocrLocaleTag: 'fr',
    preferenceScopeId: 'fr',
    selectable: false,
    label: 'Français (Canada)',
    aliases: [],
  });

  const catalogGraph = languageResourceGraph.validateCatalog(catalog, {
    defaultLanguage: 'en',
  });
  const descriptor = languageResourceGraph.getDescriptor(catalogGraph, 'app-french-canada');

  assert.deepEqual(descriptor, {
    id: 'app-french-canada',
    kind: 'overlay',
    parentId: 'fr',
    resourceDirectory: 'app-fr-ca',
    localeTag: 'fr-CA',
    ocrLocaleTag: 'fr',
    preferenceScopeId: 'fr',
    selectable: false,
    label: 'Français (Canada)',
    aliases: [],
  });
  assert.deepEqual(
    languageResourceGraph.getParentChain(catalogGraph, descriptor.id).map((node) => node.id),
    ['app-french-canada', 'fr']
  );
});

test('rejects unsafe directories, parent cycles, and identifier/alias collisions', () => {
  const unsafe = structuredClone(languageCatalog);
  unsafe.languages[0].resourceDirectory = '../ar';
  assert.throws(
    () => languageResourceGraph.validateCatalog(unsafe, { defaultLanguage: 'en' }),
    /unsafe resource directory/
  );

  const cyclic = structuredClone(languageCatalog);
  cyclic.languages.push(
    {
      id: 'fr-CA',
      kind: 'overlay',
      parentId: 'de-CH',
      resourceDirectory: 'fr-ca',
      localeTag: 'fr-CA',
      ocrLocaleTag: 'fr-CA',
      preferenceScopeId: 'fr',
      selectable: false,
      label: 'Français (Canada)',
      aliases: [],
    },
    {
      id: 'de-CH',
      kind: 'overlay',
      parentId: 'fr-CA',
      resourceDirectory: 'de-ch',
      localeTag: 'de-CH',
      ocrLocaleTag: 'de-CH',
      preferenceScopeId: 'de',
      selectable: false,
      label: 'Deutsch (Schweiz)',
      aliases: [],
    }
  );
  assert.throws(
    () => languageResourceGraph.validateCatalog(cyclic, { defaultLanguage: 'en' }),
    /parent cycle/
  );

  const aliasCollision = structuredClone(languageCatalog);
  aliasCollision.languages[0].aliases = ['en'];
  assert.throws(
    () => languageResourceGraph.validateCatalog(aliasCollision, { defaultLanguage: 'en' }),
    /conflicts with an alias/
  );
});
