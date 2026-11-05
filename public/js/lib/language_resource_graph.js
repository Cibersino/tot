// public/js/lib/language_resource_graph.js
'use strict';

// Shared application-language graph. Application IDs, resource directories,
// preference scopes, and standards-facing locale tags are deliberately
// separate values; no relationship is inferred from ID spelling or paths.
(function initLanguageResourceGraph(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.LanguageResourceGraph = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  const RESOURCE_DIRECTORY_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function requireString(value, name) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`[language-resource-graph] ${name} must be a non-empty string`);
    }
    return value.trim();
  }

  function validateLocaleTag(value, name) {
    const localeTag = requireString(value, name);
    if (!globalThis.Intl || typeof globalThis.Intl.getCanonicalLocales !== 'function') {
      throw new Error('[language-resource-graph] Intl.getCanonicalLocales is unavailable');
    }
    let canonical;
    try {
      [canonical] = globalThis.Intl.getCanonicalLocales(localeTag);
    } catch (error) {
      throw new Error(`[language-resource-graph] ${name} is not a valid locale tag: ${localeTag}`);
    }
    if (canonical !== localeTag) {
      throw new Error(`[language-resource-graph] ${name} must be canonical: ${localeTag}`);
    }
    return localeTag;
  }

  function validateCatalog(rawCatalog, { defaultLanguage } = {}) {
    if (!isPlainObject(rawCatalog) || rawCatalog.schemaVersion !== 1 || !Array.isArray(rawCatalog.languages)) {
      throw new Error('[language-resource-graph] catalog must be a schemaVersion 1 object with a languages array');
    }
    const defaultId = requireString(defaultLanguage, 'defaultLanguage');
    const nodesById = new Map();
    const aliasesToId = new Map();
    const resourceDirectories = new Set();
    const localeTags = new Set();

    rawCatalog.languages.forEach((rawNode, index) => {
      if (!isPlainObject(rawNode)) throw new Error(`[language-resource-graph] language at index ${index} must be an object`);
      const id = requireString(rawNode.id, `languages[${index}].id`);
      if (nodesById.has(id)) throw new Error(`[language-resource-graph] duplicate language ID: ${id}`);
      if (aliasesToId.has(id)) throw new Error(`[language-resource-graph] language ID conflicts with an alias: ${id}`);
      const kind = requireString(rawNode.kind, `languages[${index}].kind`);
      if (kind !== 'root' && kind !== 'overlay') throw new Error(`[language-resource-graph] language ${id} has invalid kind: ${kind}`);
      const parentId = rawNode.parentId === null ? null : requireString(rawNode.parentId, `languages[${index}].parentId`);
      if ((kind === 'root') !== (parentId === null)) throw new Error(`[language-resource-graph] ${kind} ${id} has an invalid parent declaration`);
      const resourceDirectory = requireString(rawNode.resourceDirectory, `languages[${index}].resourceDirectory`);
      if (!RESOURCE_DIRECTORY_RE.test(resourceDirectory)) throw new Error(`[language-resource-graph] unsafe resource directory for ${id}: ${resourceDirectory}`);
      if (resourceDirectories.has(resourceDirectory)) throw new Error(`[language-resource-graph] duplicate resource directory: ${resourceDirectory}`);
      const localeTag = validateLocaleTag(rawNode.localeTag, `languages[${index}].localeTag`);
      if (localeTags.has(localeTag)) throw new Error(`[language-resource-graph] duplicate locale tag: ${localeTag}`);
      const ocrLocaleTag = validateLocaleTag(rawNode.ocrLocaleTag, `languages[${index}].ocrLocaleTag`);
      const preferenceScopeId = requireString(rawNode.preferenceScopeId, `languages[${index}].preferenceScopeId`);
      if (typeof rawNode.selectable !== 'boolean') throw new Error(`[language-resource-graph] selectable must be boolean for ${id}`);
      const label = requireString(rawNode.label, `languages[${index}].label`);
      if (!Array.isArray(rawNode.aliases) || rawNode.aliases.some((alias) => typeof alias !== 'string' || !alias.trim())) throw new Error(`[language-resource-graph] aliases must be an array of non-empty strings for ${id}`);
      rawNode.aliases.forEach((rawAlias) => {
        const alias = rawAlias.trim();
        if (alias === id || nodesById.has(alias) || aliasesToId.has(alias)) throw new Error(`[language-resource-graph] duplicate language alias: ${alias}`);
        aliasesToId.set(alias, id);
      });
      resourceDirectories.add(resourceDirectory);
      localeTags.add(localeTag);
      nodesById.set(id, Object.freeze({ id, kind, parentId, resourceDirectory, localeTag, ocrLocaleTag, preferenceScopeId, selectable: rawNode.selectable, label, aliases: Object.freeze(rawNode.aliases.map((alias) => alias.trim())) }));
    });

    nodesById.forEach((node) => {
      if (node.parentId && !nodesById.has(node.parentId)) throw new Error(`[language-resource-graph] ${node.id} has an undeclared parent: ${node.parentId}`);
      if (!nodesById.has(node.preferenceScopeId)) throw new Error(`[language-resource-graph] ${node.id} has an undeclared preference scope: ${node.preferenceScopeId}`);
    });
    const defaultNode = nodesById.get(defaultId);
    if (!defaultNode || defaultNode.kind !== 'root') throw new Error(`[language-resource-graph] default language must name a declared root: ${defaultId}`);
    nodesById.forEach((node) => {
      const visited = new Set();
      let current = node;
      while (current.parentId) {
        if (visited.has(current.id)) throw new Error(`[language-resource-graph] parent cycle at ${current.id}`);
        visited.add(current.id);
        current = nodesById.get(current.parentId);
      }
    });
    return Object.freeze({ defaultId, nodesById, aliasesToId, languages: Object.freeze(Array.from(nodesById.values())) });
  }

  function resolveLanguageId(graph, input) {
    if (!graph || typeof input !== 'string') return null;
    if (graph.nodesById.has(input)) return input;
    return graph.aliasesToId.get(input) || null;
  }

  function getDescriptor(graph, input) {
    const id = resolveLanguageId(graph, input);
    return id ? graph.nodesById.get(id) : null;
  }

  function getParentChain(graph, input) {
    const descriptor = getDescriptor(graph, input);
    if (!descriptor) return null;
    const chain = [];
    let current = descriptor;
    while (current) {
      chain.push(current);
      current = current.parentId ? graph.nodesById.get(current.parentId) : null;
    }
    return Object.freeze(chain);
  }

  function getMergeChain(graph, input) {
    const parentChain = getParentChain(graph, input);
    if (!parentChain) return null;
    const ordered = [graph.nodesById.get(graph.defaultId)];
    parentChain.slice().reverse().forEach((node) => {
      if (!ordered.some((existing) => existing.id === node.id)) ordered.push(node);
    });
    return Object.freeze(ordered);
  }

  function getCompleteResourceCandidates(graph, input) {
    const parentChain = getParentChain(graph, input);
    if (!parentChain) return null;
    const ordered = parentChain.slice();
    if (!ordered.some((node) => node.id === graph.defaultId)) ordered.push(graph.nodesById.get(graph.defaultId));
    return Object.freeze(ordered);
  }

  function getSelectableLanguages(graph) {
    return Object.freeze(graph.languages.filter((node) => node.selectable));
  }

  function getLocaleDirection(localeTag) {
    return new Set(['ar', 'fa', 'he', 'ur']).has(String(localeTag || '').split('-')[0].toLowerCase()) ? 'rtl' : 'ltr';
  }

  return { getCompleteResourceCandidates, getDescriptor, getLocaleDirection, getMergeChain, getParentChain, getSelectableLanguages, resolveLanguageId, validateCatalog };
});
