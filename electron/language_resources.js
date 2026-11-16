// electron/language_resources.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Loads and caches the required application-language catalog for main-process consumers.
// Responsibilities:
// - Read and validate `i18n/languages.json` using the declared `DEFAULT_LANG`.
// - Keep one validated graph for main-process language consumers.
// - Expose graph, descriptor, and selectable-language accessors.
// - Support isolated main-process owners that need the same required catalog before startup initializes it.

// =============================================================================
// Imports
// =============================================================================

const fs = require('fs');
const path = require('path');
const { DEFAULT_LANG } = require('./constants_main');
const graphApi = require('../public/js/lib/language_resource_graph');

// =============================================================================
// Shared state
// =============================================================================

let graph = null;

// =============================================================================
// Catalog initialization
// =============================================================================

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

// =============================================================================
// Graph access
// =============================================================================

function getGraph() {
  // Main initializes this module before settings and other language consumers.
  // The lazy path supports isolated main-process owners and tests, but still loads the same required packaged catalog rather than a fallback list.
  if (!graph) initialize({ appPath: path.join(__dirname, '..') });
  return graph;
}

function getDescriptor(languageId) {
  return graphApi.getDescriptor(getGraph(), languageId);
}

function getSelectableLanguages() {
  return graphApi.getSelectableLanguages(getGraph());
}

// =============================================================================
// Module surface
// =============================================================================

module.exports = { getDescriptor, getGraph, getSelectableLanguages, initialize };

// =============================================================================
// End of electron/language_resources.js
// =============================================================================
