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

function createHarness(uiDirection = 'ltr') {
  const body = createElement('body');
  const documentElement = {
    dataset: { languageDirection: uiDirection },
  };

  const sandbox = {
    window: {
      getLogger() {
        return {
          debug() {},
          warn() {},
          warnOnce() {},
          error() {},
          errorOnce() {},
        };
      },
      AppConstants: {
        DEFAULT_LANG: 'en',
      },
      getComputedStyle(node) {
        const fallbackDirection = node && node.parentNode
          ? node.parentNode.getAttribute('dir')
          : 'ltr';
        return {
          direction: detectDirection(node && node.textContent, fallbackDirection),
        };
      },
      fetch: async () => ({ ok: false, text: async () => '' }),
    },
    document: {
      body,
      documentElement,
      createElement,
    },
    console,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/i18n.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/i18n.js' });

  return sandbox.window.RendererI18n;
}

test('resolveUserTextDirection uses UI fallback for empty and neutral-only text', () => {
  const ltrI18n = createHarness('ltr');
  const rtlI18n = createHarness('rtl');

  assert.equal(ltrI18n.resolveUserTextDirection(''), 'ltr');
  assert.equal(ltrI18n.resolveUserTextDirection('  ... 250 '), 'ltr');
  assert.equal(rtlI18n.resolveUserTextDirection(''), 'rtl');
  assert.equal(rtlI18n.resolveUserTextDirection('  ... 250 '), 'rtl');
});

test('resolveUserTextDirection resolves strong RTL and LTR content', () => {
  const i18n = createHarness('ltr');

  assert.equal(i18n.resolveUserTextDirection('שלום עולם'), 'rtl');
  assert.equal(i18n.resolveUserTextDirection('hello world'), 'ltr');
});

test('resolveUserTextDirection follows first-strong behavior for mixed text', () => {
  const i18n = createHarness('rtl');

  assert.equal(i18n.resolveUserTextDirection('שלום Google OCR'), 'rtl');
  assert.equal(i18n.resolveUserTextDirection('Google OCR שלום'), 'ltr');
});
