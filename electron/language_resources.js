// electron/language_resources.js
'use strict';

const fs = require('fs');
const path = require('path');
const { DEFAULT_LANG } = require('./constants_main');
const graphApi = require('../public/js/lib/language_resource_graph');

let graph = null;

function initialize({ appPath } = {}) {
  if (graph) return graph;
  if (typeof appPath !== 'string' || !appPath.trim()) throw new Error('[language-resources] initialize requires appPath');
  const catalogPath = path.join(appPath, 'i18n', 'languages.json');
  let rawCatalog;
  try {
    rawCatalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8').replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new Error(`[language-resources] unable to load required catalog ${catalogPath}: ${error.message}`);
  }
  graph = graphApi.validateCatalog(rawCatalog, { defaultLanguage: DEFAULT_LANG });
  return graph;
}

function getGraph() {
  // Main initializes explicitly before settings and other language consumers.
  // This keeps the module usable by isolated main-process owners and tests while
  // still loading the same required packaged catalog, never a fallback list.
  if (!graph) initialize({ appPath: path.join(__dirname, '..') });
  return graph;
}

function getDescriptor(languageId) {
  return graphApi.getDescriptor(getGraph(), languageId);
}

function getSelectableLanguages() {
  return graphApi.getSelectableLanguages(getGraph());
}

module.exports = { getDescriptor, getGraph, getSelectableLanguages, initialize };
