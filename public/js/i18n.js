// public/js/i18n.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Renderer i18n helper for UI bundles.
// Responsibilities:
// - Normalize language tags and derive base tags.
// - Load renderer.json bundles with a fallback chain.
// - Merge default bundle with optional overlay data.
// - Resolve translation keys and parameterized messages.
// - Expose the RendererI18n API on window.

(() => {
  // =============================================================================
  // Logger / constants
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[i18n] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('i18n');
  log.debug('Renderer i18n starting...');
  const { AppConstants } = window;
  if (!AppConstants || typeof AppConstants.DEFAULT_LANG !== 'string' || !AppConstants.DEFAULT_LANG.trim()) {
    throw new Error('[i18n] AppConstants.DEFAULT_LANG unavailable; cannot continue');
  }
  const { DEFAULT_LANG } = AppConstants;
  const RTL_LANGUAGE_BASES = new Set(['ar', 'fa', 'he', 'ur']);
  const FIXED_DOCUMENT_DIRECTION = 'ltr';
  const LOCALIZED_DOCUMENT_RESOURCES = Object.freeze({
    'renderer.info.acerca_de': './info/acerca_de.{lang}.html',
    'renderer.info.instructions': './info/instrucciones.{lang}.html',
  });

  // =============================================================================
  // Shared state
  // =============================================================================
  let rendererTranslations = null;
  let rendererTranslationsLang = null;
  let rendererDefaultTranslations = null;
  let rendererTransitionQueue = Promise.resolve();
  let userTextDirectionProbeHost = null;
  let userTextDirectionProbe = null;

  // =============================================================================
  // Helpers (pure utilities)
  // =============================================================================
  const normalizeLangTag = (lang) => (lang || '').trim().toLowerCase().replace(/_/g, '-');
  const getLangBase = (lang) => {
    const tag = normalizeLangTag(lang);
    if (!tag) return '';
    const idx = tag.indexOf('-');
    return idx > 0 ? tag.slice(0, idx) : tag;
  };
  const getLanguageDirection = (lang) => {
    const base = getLangBase(lang) || normalizeLangTag(lang);
    return RTL_LANGUAGE_BASES.has(base) ? 'rtl' : 'ltr';
  };

  function getUiLanguageDirection() {
    const languageDirection = document && document.documentElement
      ? document.documentElement.dataset.languageDirection
      : '';
    return languageDirection === 'rtl' ? 'rtl' : 'ltr';
  }

  function applyWindowLanguageAttributes(lang) {
    const langTag = normalizeLangTag(lang) || DEFAULT_LANG;
    const languageDirection = getLanguageDirection(langTag);
    if (document && document.documentElement) {
      document.documentElement.lang = langTag;
      document.documentElement.dir = FIXED_DOCUMENT_DIRECTION;
      document.documentElement.dataset.languageDirection = languageDirection;
    }
    return {
      lang: langTag,
      dir: FIXED_DOCUMENT_DIRECTION,
      languageDirection,
    };
  }

  function captureWindowLanguageAttributes() {
    if (!document || !document.documentElement) return null;
    const root = document.documentElement;
    return {
      lang: root.getAttribute('lang'),
      dir: root.getAttribute('dir'),
      languageDirection: root.getAttribute('data-language-direction'),
    };
  }

  function restoreWindowLanguageAttributes(snapshot) {
    if (!snapshot || !document || !document.documentElement) return;
    const root = document.documentElement;
    [
      ['lang', snapshot.lang],
      ['dir', snapshot.dir],
      ['data-language-direction', snapshot.languageDirection],
    ].forEach(([name, value]) => {
      if (value === null) {
        root.removeAttribute(name);
      } else {
        root.setAttribute(name, value);
      }
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
    const normalizedValue = typeof value === 'string'
      ? value
      : value === null || typeof value === 'undefined'
        ? ''
        : String(value);

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

  const isPlainObject = (value) => value && typeof value === 'object' && !Array.isArray(value);

  const deepMerge = (base, overlay) => {
    const result = Object.assign({}, base || {});
    if (!overlay) return result;
    Object.keys(overlay).forEach((key) => {
      if (isPlainObject(result[key]) && isPlainObject(overlay[key])) {
        result[key] = deepMerge(result[key], overlay[key]);
      } else {
        result[key] = overlay[key];
      }
    });
    return result;
  };

  const getPath = (obj, path) => {
    if (!obj || !path) return undefined;
    const parts = path.split('.');
    let cur = obj;
    for (const p of parts) {
      if (cur && Object.prototype.hasOwnProperty.call(cur, p)) {
        cur = cur[p];
      } else {
        return undefined;
      }
    }
    return cur;
  };

  // =============================================================================
  // Bundle loading (renderer.json)
  // =============================================================================
  async function loadBundle(langCode, requested, required) {
    const targetBase = getLangBase(langCode) || langCode;
    const paths = [];
    if (langCode.includes('-')) {
      paths.push(`../i18n/${targetBase}/${langCode}/renderer.json`);
    }
    paths.push(`../i18n/${langCode}/renderer.json`);

    for (let idx = 0; idx < paths.length; idx += 1) {
      const p = paths[idx];
      const variant = (idx === 0 && langCode.includes('-')) ? 'full' : 'base';
      try {
        const resp = await fetch(p);
        if (!resp || !resp.ok) {
          log.warnOnce(
            `i18n.renderer.bundle.unavailable:${langCode || 'unknown'}:${variant}`,
            'renderer.json unavailable (trying fallback):',
            { requested, langCode, path: p, status: resp && resp.status }
          );
          continue;
        }
        const raw = await resp.text();
        const cleaned = raw.replace(/^\uFEFF/, ''); // strip BOM if present
        if (!cleaned.trim()) {
          log.warnOnce(
            `i18n.renderer.bundle.empty:${langCode || 'unknown'}:${variant}`,
            'renderer.json is empty (trying fallback):',
            { requested, langCode, path: p }
          );
          continue;
        }
        try {
          const parsed = JSON.parse(cleaned);
          if (!isPlainObject(parsed)) {
            log.warnOnce(
              `i18n.renderer.bundle.invalidShape:${langCode || 'unknown'}:${variant}`,
              'renderer.json root must be a JSON object (trying fallback):',
              { requested, langCode, path: p }
            );
            continue;
          }
          return parsed;
        } catch (err) {
          log.warnOnce(
            `i18n.renderer.bundle.parse:${langCode || 'unknown'}:${variant}`,
            'Failed to parse renderer.json (trying fallback):',
            { requested, langCode, path: p },
            err
          );
        }
      } catch (err) {
        log.warnOnce(
          `i18n.renderer.bundle.fetch:${langCode || 'unknown'}:${variant}`,
          'Failed to fetch renderer.json (trying fallback):',
          { requested, langCode, path: p },
          err
        );
      }
    }

    if (required) {
      log.errorOnce(
        `i18n.loadRendererTranslations.requiredMissing:${langCode}`,
        'Required renderer.json missing/invalid:',
        { langCode, paths }
      );
    }

    return null;
  }

  async function loadOverlay(requested, base) {
    const candidates = [];
    if (requested) candidates.push(requested);
    if (base && base !== requested) candidates.push(base);

    for (const target of candidates) {
      if (target === DEFAULT_LANG) continue;
      const data = await loadBundle(target, requested, false);
      if (data) return data;
    }

    return null;
  }

  async function prepareRendererTranslations(lang) {
    const requested = normalizeLangTag(lang);
    if (!requested) {
      log.warnOnce(
        'i18n.loadRendererTranslations.emptyLang',
        'Invalid language tag; using default bundle only.'
      );
    }

    const selected = requested || DEFAULT_LANG;

    if (!rendererDefaultTranslations) {
      const defaults = await loadBundle(DEFAULT_LANG, DEFAULT_LANG, true);
      if (!defaults) {
        log.errorOnce(
          `i18n.loadRendererTranslations.defaultMissing:${DEFAULT_LANG}`,
          'Default renderer.json missing or invalid; renderer translation state cannot be established:',
          DEFAULT_LANG
        );
        throw new Error(`[i18n] Default renderer.json unavailable or invalid: ${DEFAULT_LANG}`);
      }
      rendererDefaultTranslations = defaults;
    }

    let overlay = null;
    if (selected && selected !== DEFAULT_LANG) {
      overlay = await loadOverlay(selected, getLangBase(selected));
      if (!overlay) {
        log.warnOnce(
          `i18n.loadRendererTranslations.overlayMissing:${selected}`,
          'No overlay renderer.json found (using default only):',
          { selected }
        );
      }
    }

    return {
      language: selected,
      translations: deepMerge(rendererDefaultTranslations, overlay || {}),
    };
  }

  function commitRendererTranslations(candidate) {
    rendererTranslations = candidate.translations;
    rendererTranslationsLang = candidate.language;
    return rendererTranslations;
  }

  function captureRendererTranslationState() {
    return {
      translations: rendererTranslations,
      language: rendererTranslationsLang,
      windowAttributes: captureWindowLanguageAttributes(),
    };
  }

  async function restoreRendererTranslationState(snapshot, applyTranslations) {
    rendererTranslations = snapshot.translations;
    rendererTranslationsLang = snapshot.language;
    restoreWindowLanguageAttributes(snapshot.windowAttributes);
    if (rendererTranslations) {
      await applyTranslations({ language: snapshot.language, restoring: true });
    }
  }

  function markRendererTransitionError(error, { hadEstablishedState, restorationFailed = false } = {}) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    normalized.rendererI18nTransition = {
      hadEstablishedState: !!hadEstablishedState,
      restorationFailed: !!restorationFailed,
    };
    return normalized;
  }

  function isTerminalRendererTransitionFailure(error) {
    const transition = error && error.rendererI18nTransition;
    return !!transition && (!transition.hadEstablishedState || transition.restorationFailed);
  }

  function transitionRendererTranslations(lang, { applyTranslations } = {}) {
    if (typeof applyTranslations !== 'function') {
      return Promise.reject(new Error('[i18n] transitionRendererTranslations requires applyTranslations'));
    }

    const runTransition = async () => {
      let candidate;
      try {
        candidate = await prepareRendererTranslations(lang);
      } catch (err) {
        throw markRendererTransitionError(err, {
          hadEstablishedState: !!rendererTranslations,
        });
      }

      const previousState = captureRendererTranslationState();
      commitRendererTranslations(candidate);
      applyWindowLanguageAttributes(candidate.language);

      try {
        await applyTranslations({ language: candidate.language, restoring: false });
      } catch (err) {
        try {
          await restoreRendererTranslationState(previousState, applyTranslations);
        } catch (restoreErr) {
          log.error(
            'Renderer translation transition restoration failed:',
            { requestedLanguage: candidate.language, previousLanguage: previousState.language },
            restoreErr
          );
          throw markRendererTransitionError(restoreErr, {
            hadEstablishedState: !!previousState.translations,
            restorationFailed: true,
          });
        }
        throw markRendererTransitionError(err, {
          hadEstablishedState: !!previousState.translations,
        });
      }

    };

    const scheduled = rendererTransitionQueue.then(runTransition);
    rendererTransitionQueue = scheduled.catch((err) => {
      if (isTerminalRendererTransitionFailure(err)) {
        throw err;
      }
    });
    // Observe a terminal queue rejection without converting it back into a
    // resolved queue. Later transitions must not run after fail-closed state.
    rendererTransitionQueue.catch(() => {});
    return scheduled;
  }

  // =============================================================================
  // Localized full-document resources
  // =============================================================================
  function getLocalizedDocumentCandidates(documentId, lang) {
    const pathTemplate = LOCALIZED_DOCUMENT_RESOURCES[documentId];
    if (typeof pathTemplate !== 'string' || !pathTemplate.includes('{lang}')) {
      throw new Error(`[i18n] Unknown localized document resource: ${documentId}`);
    }

    const candidates = [];
    const requested = normalizeLangTag(lang);
    const base = getLangBase(requested);
    const defaultLang = normalizeLangTag(DEFAULT_LANG);
    if (requested) candidates.push(requested);
    if (base && base !== requested) candidates.push(base);
    if (defaultLang && !candidates.includes(defaultLang)) candidates.push(defaultLang);

    return candidates.map((language) => ({
      language,
      path: pathTemplate.replace('{lang}', language),
    }));
  }

  async function loadLocalizedDocument(documentId, lang) {
    const candidates = getLocalizedDocumentCandidates(documentId, lang);

    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate.path, { cache: 'no-store' });
        if (!response || !response.ok) {
          log.warnOnce(
            `i18n.localizedDocument.unavailable:${documentId}:${candidate.language}`,
            'Localized document unavailable (trying fallback):',
            { documentId, language: candidate.language, path: candidate.path }
          );
          continue;
        }

        const html = await response.text();
        if (!html.trim()) {
          log.warnOnce(
            `i18n.localizedDocument.empty:${documentId}:${candidate.language}`,
            'Localized document is empty (trying fallback):',
            { documentId, language: candidate.language, path: candidate.path }
          );
          continue;
        }

        return {
          html,
          language: candidate.language,
        };
      } catch (err) {
        log.warnOnce(
          `i18n.localizedDocument.fetch:${documentId}:${candidate.language}`,
          'Localized document fetch failed (trying fallback):',
          { documentId, language: candidate.language, path: candidate.path },
          err
        );
      }
    }

    log.errorOnce(
      `i18n.localizedDocument.requiredMissing:${documentId}`,
      'Required localized document missing or invalid:',
      { documentId, candidates }
    );
    return { html: null, language: '' };
  }

  // =============================================================================
  // Translation helpers
  // =============================================================================
  function tRenderer(path) {
    if (!rendererTranslations) {
      throw new Error('[i18n] tRenderer called before renderer translation state was established');
    }
    const value = getPath(rendererTranslations, path);
    if (typeof value === 'string') return value;
    log.warn(
      'Missing translation key (using key path):',
      { path, lang: rendererTranslationsLang }
    );
    return path;
  }

  function msgRenderer(path, params = {}) {
    let str = tRenderer(path);
    Object.keys(params || {}).forEach(k => {
      const val = params[k];
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(val));
    });
    return str;
  }

  function renderLocalizedLabelWithInvariantValue(container, {
    labelText = '',
    valueText = '',
    valueDirection = 'ltr',
  } = {}) {
    if (!container || typeof container.appendChild !== 'function') {
      throw new Error('[i18n] renderLocalizedLabelWithInvariantValue requires a container element');
    }

    container.textContent = '';

    if (labelText) {
      container.appendChild(document.createTextNode(String(labelText)));
    }

    const valueNode = document.createElement('bdi');
    valueNode.dir = valueDirection === 'rtl' ? 'rtl' : 'ltr';
    valueNode.textContent = String(valueText ?? '');
    container.appendChild(valueNode);
    return valueNode;
  }

  function getRendererValue(path) {
    if (!rendererTranslations) {
      throw new Error('[i18n] getRendererValue called before renderer translation state was established');
    }
    return getPath(rendererTranslations, path);
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================
  window.RendererI18n = {
    transitionRendererTranslations,
    loadLocalizedDocument,
    tRenderer,
    msgRenderer,
    getRendererValue,
    normalizeLangTag,
    getLangBase,
    getLanguageDirection,
    getUiLanguageDirection,
    resolveUserTextDirection,
    renderLocalizedLabelWithInvariantValue,
  };
})();

// =============================================================================
// End of public/js/i18n.js
// =============================================================================
