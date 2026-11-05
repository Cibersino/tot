// public/js/i18n.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Renderer i18n owner for shared renderer surfaces
// Renderer translation owner. The graph is required metadata: application IDs
// are resolved only through it, while locale tags are used at standards-facing
// boundaries such as document.lang and Intl consumers.

(() => {
  if (typeof window.getLogger !== 'function') throw new Error('[i18n] window.getLogger unavailable; cannot continue');
  const log = window.getLogger('i18n');
  const { AppConstants, LanguageResourceGraph: graphApi } = window;
  if (!AppConstants || typeof AppConstants.DEFAULT_LANG !== 'string' || !AppConstants.DEFAULT_LANG.trim()) throw new Error('[i18n] AppConstants.DEFAULT_LANG unavailable; cannot continue');
  if (!graphApi || typeof graphApi.validateCatalog !== 'function') throw new Error('[i18n] LanguageResourceGraph unavailable; cannot continue');

  const { DEFAULT_LANG } = AppConstants;
  const FIXED_DOCUMENT_DIRECTION = 'ltr';
  const LOCALIZED_DOCUMENT_RESOURCES = Object.freeze({
    'renderer.info.acerca_de': './info/acerca_de.{locale}.html',
    'renderer.info.instructions': './info/instrucciones.{locale}.html',
  });

  let languageGraph = null;
  let languageGraphPromise = null;
  let rendererTranslations = null;
  let rendererTranslationsLang = null;
  let rendererTranslationsDescriptor = null;
  let rendererDefaultTranslations = null;
  let rendererTransitionQueue = Promise.resolve();
  let userTextDirectionProbeHost = null;
  let userTextDirectionProbe = null;

  const getLanguageDirection = (localeTag) => graphApi.getLocaleDirection(localeTag);

  async function loadLanguageGraph() {
    if (languageGraph) return languageGraph;
    if (!languageGraphPromise) {
      languageGraphPromise = (async () => {
        let response;
        try {
          response = await fetch('../i18n/languages.json', { cache: 'no-store' });
        } catch (error) {
          throw new Error(`[i18n] required language catalog fetch failed: ${error.message}`);
        }
        if (!response || !response.ok) throw new Error(`[i18n] required language catalog unavailable: ${response && response.status}`);
        let rawCatalog;
        try {
          rawCatalog = JSON.parse((await response.text()).replace(/^\uFEFF/, ''));
        } catch (error) {
          throw new Error(`[i18n] required language catalog parse failed: ${error.message}`);
        }
        languageGraph = graphApi.validateCatalog(rawCatalog, { defaultLanguage: DEFAULT_LANG });
        return languageGraph;
      })();
    }
    return languageGraphPromise;
  }

  function getLanguageDescriptor(languageId) {
    if (!languageGraph) throw new Error('[i18n] language catalog not established');
    const descriptor = graphApi.getDescriptor(languageGraph, languageId);
    if (!descriptor) throw new Error(`[i18n] unsupported application language: ${String(languageId)}`);
    return descriptor;
  }

  function getPreferenceScope(languageId) {
    return getLanguageDescriptor(languageId).preferenceScopeId;
  }

  function getLocaleTag(languageId) {
    return getLanguageDescriptor(languageId).localeTag;
  }

  function getOcrLocaleTag(languageId) {
    return getLanguageDescriptor(languageId).ocrLocaleTag;
  }

  function getUiLanguageDirection() {
    const direction = document && document.documentElement ? document.documentElement.dataset.languageDirection : '';
    return direction === 'rtl' ? 'rtl' : 'ltr';
  }

  function applyWindowLanguageAttributes(descriptor) {
    if (!descriptor) throw new Error('[i18n] descriptor required for document language attributes');
    const languageDirection = getLanguageDirection(descriptor.localeTag);
    if (document && document.documentElement) {
      document.documentElement.lang = descriptor.localeTag;
      document.documentElement.dir = FIXED_DOCUMENT_DIRECTION;
      document.documentElement.dataset.languageDirection = languageDirection;
    }
    return { lang: descriptor.localeTag, dir: FIXED_DOCUMENT_DIRECTION, languageDirection };
  }

  function captureWindowLanguageAttributes() {
    if (!document || !document.documentElement) return null;
    const root = document.documentElement;
    return { lang: root.getAttribute('lang'), dir: root.getAttribute('dir'), languageDirection: root.getAttribute('data-language-direction') };
  }

  function restoreWindowLanguageAttributes(snapshot) {
    if (!snapshot || !document || !document.documentElement) return;
    const root = document.documentElement;
    [['lang', snapshot.lang], ['dir', snapshot.dir], ['data-language-direction', snapshot.languageDirection]].forEach(([name, value]) => {
      if (value === null) root.removeAttribute(name);
      else root.setAttribute(name, value);
    });
  }

  function ensureUserTextDirectionProbe() {
    if (userTextDirectionProbeHost || !document || !document.body) return;
    userTextDirectionProbeHost = document.createElement('div');
    userTextDirectionProbeHost.setAttribute('aria-hidden', 'true');
    userTextDirectionProbeHost.hidden = true;
    userTextDirectionProbeHost.style.position = 'absolute';
    userTextDirectionProbeHost.style.width = '0';
    userTextDirectionProbeHost.style.height = '0';
    userTextDirectionProbeHost.style.overflow = 'hidden';
    userTextDirectionProbeHost.style.visibility = 'hidden';
    userTextDirectionProbeHost.style.pointerEvents = 'none';
    userTextDirectionProbe = document.createElement('span');
    userTextDirectionProbe.setAttribute('dir', 'auto');
    userTextDirectionProbeHost.appendChild(userTextDirectionProbe);
    document.body.appendChild(userTextDirectionProbeHost);
  }

  function resolveUserTextDirection(value) {
    const fallbackDirection = getUiLanguageDirection();
    const normalizedValue = value === null || typeof value === 'undefined' ? '' : String(value);
    if (!normalizedValue) return fallbackDirection;
    ensureUserTextDirectionProbe();
    if (!userTextDirectionProbeHost || !userTextDirectionProbe) {
      log.warnOnce(
        'i18n.resolveUserTextDirection.probeUnavailable',
        'resolveUserTextDirection probe unavailable; using UI fallback direction.'
      );
      return fallbackDirection;
    }
    if (typeof window.getComputedStyle !== 'function') {
      log.warnOnce(
        'i18n.resolveUserTextDirection.getComputedStyle.missing',
        'window.getComputedStyle unavailable; using UI fallback direction.'
      );
      return fallbackDirection;
    }
    userTextDirectionProbeHost.setAttribute('dir', fallbackDirection);
    userTextDirectionProbe.textContent = normalizedValue;
    const computedDirection = window.getComputedStyle(userTextDirectionProbe).direction;
    userTextDirectionProbe.textContent = '';
    return computedDirection === 'rtl' ? 'rtl' : 'ltr';
  }

  const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
  const deepMerge = (base, overlay) => {
    const result = Object.assign({}, base || {});
    Object.keys(overlay || {}).forEach((key) => {
      result[key] = isPlainObject(result[key]) && isPlainObject(overlay[key]) ? deepMerge(result[key], overlay[key]) : overlay[key];
    });
    return result;
  };
  const getPath = (obj, path) => String(path || '').split('.').reduce((current, key) => (current && Object.prototype.hasOwnProperty.call(current, key) ? current[key] : undefined), obj);

  async function loadBundle(descriptor, requestedLanguageId, { required = false } = {}) {
    const resourcePath = `../i18n/${descriptor.resourceDirectory}/renderer.json`;
    try {
      const response = await fetch(resourcePath, { cache: 'no-store' });
      if (!response || !response.ok) throw new Error(`HTTP ${response && response.status}`);
      const parsed = JSON.parse((await response.text()).replace(/^\uFEFF/, ''));
      if (!isPlainObject(parsed)) throw new Error('root is not a JSON object');
      return parsed;
    } catch (error) {
      const details = { requestedLanguageId, languageId: descriptor.id, resourceDirectory: descriptor.resourceDirectory, resourcePath };
      if (required) log.error('Required default renderer.json unavailable:', details, error);
      else log.warn('renderer.json unavailable; continuing through declared graph chain:', details, error);
      return null;
    }
  }

  async function prepareRendererTranslations(languageId) {
    const graph = await loadLanguageGraph();
    const selectedId = languageId ? graphApi.resolveLanguageId(graph, languageId) : DEFAULT_LANG;
    if (!selectedId) throw new Error(`[i18n] unsupported application language: ${String(languageId)}`);
    const descriptor = graphApi.getDescriptor(graph, selectedId);
    const defaultDescriptor = graphApi.getDescriptor(graph, DEFAULT_LANG);
    if (!rendererDefaultTranslations) {
      rendererDefaultTranslations = await loadBundle(defaultDescriptor, selectedId, { required: true });
      if (!rendererDefaultTranslations) throw new Error(`[i18n] default renderer.json unavailable: ${DEFAULT_LANG}`);
    }
    let translations = rendererDefaultTranslations;
    const chain = graphApi.getMergeChain(graph, selectedId);
    for (const node of chain) {
      if (node.id === DEFAULT_LANG) continue;
      const bundle = await loadBundle(node, selectedId);
      if (bundle) translations = deepMerge(translations, bundle);
    }
    return { language: selectedId, descriptor, translations };
  }

  function commitRendererTranslations(candidate) {
    rendererTranslations = candidate.translations;
    rendererTranslationsLang = candidate.language;
    rendererTranslationsDescriptor = candidate.descriptor;
    return candidate;
  }

  function captureRendererTranslationState() {
    return { translations: rendererTranslations, language: rendererTranslationsLang, descriptor: rendererTranslationsDescriptor, windowAttributes: captureWindowLanguageAttributes() };
  }

  async function restoreRendererTranslationState(snapshot, applyTranslations, { restoreConsumerSemantics = true } = {}) {
    rendererTranslations = snapshot.translations;
    rendererTranslationsLang = snapshot.language;
    rendererTranslationsDescriptor = snapshot.descriptor;
    restoreWindowLanguageAttributes(snapshot.windowAttributes);
    if (restoreConsumerSemantics && rendererTranslations) await applyTranslations({ language: snapshot.language, descriptor: snapshot.descriptor, restoring: true });
  }

  function markRendererTransitionError(error, { hadEstablishedState, restorationFailed = false } = {}) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    normalized.rendererI18nTransition = { hadEstablishedState: !!hadEstablishedState, restorationFailed: !!restorationFailed };
    return normalized;
  }

  function isTerminalRendererTransitionFailure(error) {
    const transition = error && error.rendererI18nTransition;
    return !!transition && (!transition.hadEstablishedState || transition.restorationFailed);
  }

  function transitionRendererTranslations(languageId, { applyTranslations } = {}) {
    if (typeof applyTranslations !== 'function') return Promise.reject(new Error('[i18n] transitionRendererTranslations requires applyTranslations'));
    const runTransition = async () => {
      let candidate;
      try {
        candidate = await prepareRendererTranslations(languageId);
      } catch (error) {
        throw markRendererTransitionError(error, { hadEstablishedState: !!rendererTranslations });
      }
      let previousState;
      try {
        previousState = captureRendererTranslationState();
      } catch (error) {
        throw markRendererTransitionError(error, { hadEstablishedState: !!rendererTranslations });
      }
      try {
        const committed = commitRendererTranslations(candidate);
        applyWindowLanguageAttributes(committed.descriptor);
      } catch (error) {
        try {
          await restoreRendererTranslationState(previousState, applyTranslations, { restoreConsumerSemantics: false });
        } catch (restoreError) {
          log.error('Renderer translation transition restoration failed:', { requestedLanguage: candidate.language, previousLanguage: previousState.language }, restoreError);
          throw markRendererTransitionError(restoreError, { hadEstablishedState: !!previousState.translations, restorationFailed: true });
        }
        throw markRendererTransitionError(error, { hadEstablishedState: !!previousState.translations });
      }
      try {
        await applyTranslations({ language: candidate.language, descriptor: candidate.descriptor, restoring: false });
      } catch (error) {
        try {
          await restoreRendererTranslationState(previousState, applyTranslations);
        } catch (restoreError) {
          log.error('Renderer translation transition restoration failed:', { requestedLanguage: candidate.language, previousLanguage: previousState.language }, restoreError);
          throw markRendererTransitionError(restoreError, { hadEstablishedState: !!previousState.translations, restorationFailed: true });
        }
        throw markRendererTransitionError(error, { hadEstablishedState: !!previousState.translations });
      }
    };
    const scheduled = rendererTransitionQueue.then(runTransition);
    rendererTransitionQueue = scheduled.catch((error) => { if (isTerminalRendererTransitionFailure(error)) throw error; });
    rendererTransitionQueue.catch(() => {});
    return scheduled;
  }

  async function loadLocalizedDocument(documentId, languageId) {
    const pathTemplate = LOCALIZED_DOCUMENT_RESOURCES[documentId];
    if (typeof pathTemplate !== 'string') throw new Error(`[i18n] unknown localized document resource: ${documentId}`);
    const graph = await loadLanguageGraph();
    const selectedId = graphApi.resolveLanguageId(graph, languageId || DEFAULT_LANG);
    if (!selectedId) throw new Error(`[i18n] unsupported application language: ${String(languageId)}`);
    const candidates = graphApi.getCompleteResourceCandidates(graph, selectedId);
    for (const descriptor of candidates) {
      const resourcePath = pathTemplate.replace('{locale}', descriptor.localeTag);
      try {
        const response = await fetch(resourcePath, { cache: 'no-store' });
        if (!response || !response.ok) throw new Error(`HTTP ${response && response.status}`);
        const html = await response.text();
        if (!html.trim()) throw new Error('empty document');
        return { html, descriptor };
      } catch (error) {
        log.warn('Localized document unavailable; continuing through declared graph chain:', { documentId, languageId: descriptor.id, resourcePath }, error);
      }
    }
    log.error('Required localized document missing or invalid:', { documentId, languageId: selectedId });
    return { html: null, descriptor: null };
  }

  function tRenderer(path) {
    if (!rendererTranslations) throw new Error('[i18n] tRenderer called before renderer translation state was established');
    const value = getPath(rendererTranslations, path);
    if (typeof value === 'string') return value;
    log.warn('Missing translation key (using key path):', { path, languageId: rendererTranslationsLang });
    return path;
  }

  function msgRenderer(path, params = {}) {
    return Object.keys(params || {}).reduce((text, key) => text.replace(new RegExp(`\\{${key}\\}`, 'g'), String(params[key])), tRenderer(path));
  }

  function renderLocalizedLabelWithInvariantValue(container, { labelText = '', valueText = '', valueDirection = 'ltr' } = {}) {
    if (!container || typeof container.appendChild !== 'function') throw new Error('[i18n] renderLocalizedLabelWithInvariantValue requires a container element');
    container.textContent = '';
    if (labelText) container.appendChild(document.createTextNode(String(labelText)));
    const valueNode = document.createElement('bdi');
    valueNode.dir = valueDirection === 'rtl' ? 'rtl' : 'ltr';
    valueNode.textContent = String(valueText ?? '');
    container.appendChild(valueNode);
    return valueNode;
  }

  function getRendererValue(path) {
    if (!rendererTranslations) throw new Error('[i18n] getRendererValue called before renderer translation state was established');
    return getPath(rendererTranslations, path);
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================
  window.RendererI18n = {
    getLanguageDescriptor,
    getLanguageDirection,
    getLocaleTag,
    getOcrLocaleTag,
    getPreferenceScope,
    getRendererValue,
    getUiLanguageDirection,
    loadLocalizedDocument,
    msgRenderer,
    renderLocalizedLabelWithInvariantValue,
    resolveUserTextDirection,
    tRenderer,
    transitionRendererTranslations,
  };
})();
// =============================================================================
// End of public/js/i18n.js
// =============================================================================
