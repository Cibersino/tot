'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createElement(tagName = 'div') {
  return {
    tagName,
    attributes: {},
    style: {},
    childNodes: [],
    parentNode: null,
    hidden: false,
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name)
        ? this.attributes[name]
        : null;
    },
    appendChild(node) {
      if (node && typeof node === 'object') {
        node.parentNode = this;
        this.childNodes.push(node);
      }
      return node;
    },
    get textContent() {
      return this._textContent || '';
    },
    set textContent(value) {
      this._textContent = String(value ?? '');
    },
  };
}

function detectDirection(text, fallbackDirection) {
  const value = String(text || '');
  for (const ch of value) {
    if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z')) {
      return 'ltr';
    }
    const code = ch.charCodeAt(0);
    if ((code >= 0x0590 && code <= 0x08FF) || (code >= 0xFB1D && code <= 0xFEFC)) {
      return 'rtl';
    }
  }
  return fallbackDirection === 'rtl' ? 'rtl' : 'ltr';
}

function collectLeafPaths(value, prefix = '', paths = []) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    Object.entries(value).forEach(([key, nestedValue]) => {
      collectLeafPaths(nestedValue, prefix ? `${prefix}.${key}` : key, paths);
    });
    return paths;
  }
  paths.push(prefix);
  return paths;
}

function getPath(value, pathText) {
  return pathText.split('.').reduce(
    (current, key) => (current && Object.prototype.hasOwnProperty.call(current, key)
      ? current[key]
      : undefined),
    value
  );
}

function createHarness(uiDirection = 'ltr', { fetchImpl = null, defaultLang = 'en' } = {}) {
  const body = createElement('body');
  const logEntries = [];
  const documentElement = {
    attributes: {
      lang: defaultLang,
      dir: 'ltr',
      'data-language-direction': uiDirection,
    },
    dataset: { languageDirection: uiDirection },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name)
        ? this.attributes[name]
        : null;
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (name === 'data-language-direction') this.dataset.languageDirection = String(value);
    },
    removeAttribute(name) {
      delete this.attributes[name];
      if (name === 'data-language-direction') delete this.dataset.languageDirection;
    },
  };
  Object.defineProperties(documentElement, {
    lang: {
      get() { return this.getAttribute('lang') || ''; },
      set(value) { this.setAttribute('lang', value); },
    },
    dir: {
      get() { return this.getAttribute('dir') || ''; },
      set(value) { this.setAttribute('dir', value); },
    },
  });

  const effectiveFetch = fetchImpl || (async () => ({ ok: false, text: async () => '' }));
  const sandbox = {
    window: {
      getLogger() {
        return {
          debug() {},
          warn() {},
          warnOnce(...args) { logEntries.push(args); },
          error() {},
          errorOnce(...args) { logEntries.push(args); },
        };
      },
      AppConstants: {
        DEFAULT_LANG: defaultLang,
      },
      getComputedStyle(node) {
        const fallbackDirection = node && node.parentNode
          ? node.parentNode.getAttribute('dir')
          : 'ltr';
        return {
          direction: detectDirection(node && node.textContent, fallbackDirection),
        };
      },
      fetch: effectiveFetch,
    },
    document: {
      body,
      documentElement,
      createElement,
    },
    fetch: effectiveFetch,
    console,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/i18n.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/i18n.js' });

  return { i18n: sandbox.window.RendererI18n, documentElement, logEntries };
}

test('resolveUserTextDirection uses UI fallback for empty and neutral-only text', () => {
  const { i18n: ltrI18n } = createHarness('ltr');
  const { i18n: rtlI18n } = createHarness('rtl');

  assert.equal(ltrI18n.resolveUserTextDirection(''), 'ltr');
  assert.equal(ltrI18n.resolveUserTextDirection('  ... 250 '), 'ltr');
  assert.equal(rtlI18n.resolveUserTextDirection(''), 'rtl');
  assert.equal(rtlI18n.resolveUserTextDirection('  ... 250 '), 'rtl');
});

test('resolveUserTextDirection resolves strong RTL and LTR content', () => {
  const { i18n } = createHarness('ltr');

  assert.equal(i18n.resolveUserTextDirection('שלום עולם'), 'rtl');
  assert.equal(i18n.resolveUserTextDirection('hello world'), 'ltr');
});

test('resolveUserTextDirection follows first-strong behavior for mixed text', () => {
  const { i18n } = createHarness('rtl');

  assert.equal(i18n.resolveUserTextDirection('שלום Google OCR'), 'rtl');
  assert.equal(i18n.resolveUserTextDirection('Google OCR שלום'), 'ltr');
});

test('localized document resources resolve requested tag, base tag, then DEFAULT_LANG in RendererI18n', async () => {
  const requestedPaths = [];
  const { i18n } = createHarness('ltr', {
    defaultLang: 'es',
    async fetchImpl(pathname) {
      requestedPaths.push(pathname);
      if (pathname === './info/instrucciones.es.html') {
        return { ok: true, text: async () => '<main>Instrucciones en español</main>' };
      }
      return { ok: false, text: async () => '' };
    },
  });

  const result = await i18n.loadLocalizedDocument('renderer.info.instructions', 'fr-CA');

  assert.deepEqual(requestedPaths, [
    './info/instrucciones.fr-ca.html',
    './info/instrucciones.fr.html',
    './info/instrucciones.es.html',
  ]);
  assert.equal(result.html, '<main>Instrucciones en español</main>');
  assert.equal(result.language, 'es');
});

test('the DEFAULT_LANG renderer bundle contains the English root schema', () => {
  const defaultBundle = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../../../i18n/es/renderer.json'),
    'utf8'
  ));
  const englishBundle = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../../../i18n/en/renderer.json'),
    'utf8'
  ));
  const missingDefaultPaths = collectLeafPaths(englishBundle)
    .filter((pathText) => typeof getPath(defaultBundle, pathText) !== 'string');

  assert.deepEqual(missingDefaultPaths, []);
});

test('renderer bundles diagnose requested-resource failures and continue through the base bundle', async () => {
  const requestedPaths = [];
  const { i18n, logEntries } = createHarness('ltr', {
    defaultLang: 'en',
    async fetchImpl(pathname) {
      requestedPaths.push(pathname);
      if (pathname === '../i18n/en/renderer.json') {
        return { ok: true, text: async () => JSON.stringify({ renderer: { defaultLabel: 'English' } }) };
      }
      if (pathname === '../i18n/fr/fr-ca/renderer.json') {
        return { ok: true, text: async () => '[]' };
      }
      if (pathname === '../i18n/fr/renderer.json') {
        return { ok: true, text: async () => JSON.stringify({ renderer: { localizedLabel: 'Français' } }) };
      }
      return { ok: false, status: 404, text: async () => '' };
    },
  });

  await i18n.transitionRendererTranslations('fr-CA', {
    applyTranslations() {},
  });

  assert.deepEqual(requestedPaths, [
    '../i18n/en/renderer.json',
    '../i18n/fr/fr-ca/renderer.json',
    '../i18n/fr-ca/renderer.json',
    '../i18n/fr/renderer.json',
  ]);
  assert.equal(i18n.tRenderer('renderer.defaultLabel'), 'English');
  assert.equal(i18n.tRenderer('renderer.localizedLabel'), 'Français');
  assert.ok(logEntries.some(([key]) => key === 'i18n.renderer.bundle.invalidShape:fr-ca:full'));
  assert.ok(logEntries.some(([key]) => key === 'i18n.renderer.bundle.unavailable:fr-ca:base'));
});

test('renderer bundles reject invalid shapes and the default bundle is terminal when unusable', async () => {
  const { i18n } = createHarness('ltr', {
    defaultLang: 'en',
    async fetchImpl(pathname) {
      if (pathname === '../i18n/en/renderer.json') {
        return { ok: true, text: async () => '[]' };
      }
      return { ok: false, status: 404, text: async () => '' };
    },
  });

  await assert.rejects(() => i18n.transitionRendererTranslations('fr', {
    applyTranslations() {},
  }), /Default renderer\.json unavailable/);
  assert.throws(() => i18n.tRenderer('renderer.example'), /before renderer translation state/);
});

test('failed post-bootstrap transition restores the last bundle and root language attributes', async () => {
  const { i18n, documentElement } = createHarness('ltr', {
    defaultLang: 'en',
    async fetchImpl(pathname) {
      if (pathname === '../i18n/en/renderer.json') {
        return { ok: true, text: async () => JSON.stringify({ renderer: { label: 'English' } }) };
      }
      if (pathname === '../i18n/ar/renderer.json') {
        return { ok: true, text: async () => JSON.stringify({ renderer: { label: 'Arabic' } }) };
      }
      return { ok: false, status: 404, text: async () => '' };
    },
  });

  const applied = [];
  await i18n.transitionRendererTranslations('en', {
    applyTranslations: ({ language }) => {
      applied.push(`${language}:${i18n.tRenderer('renderer.label')}`);
    },
  });

  await assert.rejects(() => i18n.transitionRendererTranslations('ar', {
    applyTranslations: ({ language, restoring }) => {
      applied.push(`${language}:${i18n.tRenderer('renderer.label')}`);
      if (!restoring && language === 'ar') {
        documentElement.dir = 'rtl';
        throw new Error('required owner rejected Arabic');
      }
    },
  }), /required owner rejected Arabic/);

  assert.equal(i18n.tRenderer('renderer.label'), 'English');
  assert.equal(documentElement.getAttribute('lang'), 'en');
  assert.equal(documentElement.getAttribute('dir'), 'ltr');
  assert.equal(documentElement.getAttribute('data-language-direction'), 'ltr');
  assert.deepEqual(applied, ['en:English', 'ar:Arabic', 'en:English']);
});

test('renderer language transitions serialize overlapping requests and converge to the newest successful request', async () => {
  const { i18n } = createHarness('ltr', {
    defaultLang: 'en',
    async fetchImpl(pathname) {
      if (pathname === '../i18n/en/renderer.json') {
        return { ok: true, text: async () => JSON.stringify({ renderer: { label: 'English' } }) };
      }
      if (pathname === '../i18n/de/renderer.json') {
        return { ok: true, text: async () => JSON.stringify({ renderer: { label: 'German' } }) };
      }
      if (pathname === '../i18n/fr/renderer.json') {
        return { ok: true, text: async () => JSON.stringify({ renderer: { label: 'French' } }) };
      }
      return { ok: false, status: 404, text: async () => '' };
    },
  });

  const applied = [];
  const older = i18n.transitionRendererTranslations('fr', {
    applyTranslations: ({ language }) => applied.push(language),
  });
  const newer = i18n.transitionRendererTranslations('de', {
    applyTranslations: ({ language }) => applied.push(language),
  });

  const [olderResult, newerResult] = await Promise.all([older, newer]);
  assert.equal(olderResult, undefined);
  assert.equal(newerResult, undefined);
  assert.deepEqual(applied, ['fr', 'de']);
  assert.equal(i18n.tRenderer('renderer.label'), 'German');
});

test('a failed later renderer transition preserves the last successfully applied state', async () => {
  const { i18n, documentElement } = createHarness('ltr', {
    defaultLang: 'en',
    async fetchImpl(pathname) {
      const labels = {
        '../i18n/en/renderer.json': 'English',
        '../i18n/fr/renderer.json': 'French',
        '../i18n/de/renderer.json': 'German',
      };
      if (labels[pathname]) {
        return { ok: true, text: async () => JSON.stringify({ renderer: { label: labels[pathname] } }) };
      }
      return { ok: false, status: 404, text: async () => '' };
    },
  });

  const applied = [];
  await i18n.transitionRendererTranslations('en', {
    applyTranslations: ({ language }) => applied.push(language),
  });

  await i18n.transitionRendererTranslations('fr', {
    applyTranslations: ({ language }) => applied.push(language),
  });

  await assert.rejects(() => i18n.transitionRendererTranslations('de', {
    applyTranslations: ({ language, restoring }) => {
      applied.push(language);
      if (!restoring && language === 'de') {
        throw new Error('required owner rejected German');
      }
    },
  }), /required owner rejected German/);

  assert.equal(i18n.tRenderer('renderer.label'), 'French');
  assert.equal(documentElement.getAttribute('lang'), 'fr');
  assert.deepEqual(applied, ['en', 'fr', 'de', 'fr']);
});

test('a terminal renderer transition prevents already-queued work from applying', async () => {
  let defaultBundleRequests = 0;
  const { i18n } = createHarness('ltr', {
    defaultLang: 'en',
    async fetchImpl(pathname) {
      if (pathname === '../i18n/en/renderer.json') {
        defaultBundleRequests += 1;
        return { ok: false, status: 404, text: async () => '' };
      }
      if (pathname === '../i18n/de/renderer.json') {
        return { ok: true, text: async () => JSON.stringify({ renderer: { label: 'German' } }) };
      }
      return { ok: false, status: 404, text: async () => '' };
    },
  });

  const applied = [];
  const terminal = i18n.transitionRendererTranslations('fr', {
    applyTranslations: ({ language }) => applied.push(language),
  });
  const queued = i18n.transitionRendererTranslations('de', {
    applyTranslations: ({ language }) => applied.push(language),
  });

  await assert.rejects(terminal, /Default renderer\.json unavailable/);
  await assert.rejects(queued, /Default renderer\.json unavailable/);
  assert.equal(defaultBundleRequests, 1);
  assert.deepEqual(applied, []);
  assert.throws(() => i18n.tRenderer('renderer.label'), /before renderer translation state/);
});

test('a recoverable renderer transition failure allows queued work to continue', async () => {
  const { i18n } = createHarness('ltr', {
    defaultLang: 'en',
    async fetchImpl(pathname) {
      const labels = {
        '../i18n/en/renderer.json': 'English',
        '../i18n/fr/renderer.json': 'French',
        '../i18n/de/renderer.json': 'German',
      };
      if (labels[pathname]) {
        return { ok: true, text: async () => JSON.stringify({ renderer: { label: labels[pathname] } }) };
      }
      return { ok: false, status: 404, text: async () => '' };
    },
  });

  const applied = [];
  await i18n.transitionRendererTranslations('en', {
    applyTranslations: ({ language }) => applied.push(language),
  });

  const failed = i18n.transitionRendererTranslations('fr', {
    applyTranslations: ({ language, restoring }) => {
      applied.push(language);
      if (!restoring && language === 'fr') {
        throw new Error('required owner rejected French');
      }
    },
  });
  const queued = i18n.transitionRendererTranslations('de', {
    applyTranslations: ({ language }) => applied.push(language),
  });

  await assert.rejects(failed, /required owner rejected French/);
  await queued;
  assert.deepEqual(applied, ['en', 'fr', 'en', 'de']);
  assert.equal(i18n.tRenderer('renderer.label'), 'German');
});

test('RendererI18n exposes no direct renderer-state commit or root-attribute mutation API', () => {
  const { i18n } = createHarness('ltr');

  assert.equal(i18n.loadRendererTranslations, undefined);
  assert.equal(i18n.applyWindowLanguageAttributes, undefined);
});
