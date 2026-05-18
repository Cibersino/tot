'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createClassList() {
  const values = new Set();
  return {
    toggle(name, force) {
      if (force === true) {
        values.add(name);
        return true;
      }
      if (force === false) {
        values.delete(name);
        return false;
      }
      if (values.has(name)) {
        values.delete(name);
        return false;
      }
      values.add(name);
      return true;
    },
  };
}

function createElement(id, tagName = 'div') {
  const listeners = {};
  const attributes = {};
  const childNodes = [];

  function appendChild(node) {
    if (node && typeof node === 'object') {
      node.parentNode = element;
    }
    childNodes.push(node);
    return node;
  }

  function clearChildren() {
    childNodes.length = 0;
  }

  function getNodeText(node) {
    if (!node) return '';
    if (node.nodeType === 3) return node.textContent;
    return (node.childNodes || []).map(getNodeText).join('');
  }

  const element = {
    id,
    tagName,
    attributes,
    childNodes,
    classList: createClassList(),
    checked: true,
    value: '',
    addEventListener(type, listener) {
      listeners[type] = listener;
    },
    dispatch(type, event = {}) {
      if (listeners[type]) listeners[type](event);
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    appendChild,
    get textContent() {
      return childNodes.map(getNodeText).join('');
    },
    set textContent(value) {
      clearChildren();
      const normalizedValue = String(value ?? '');
      if (!normalizedValue) return;
      appendChild({
        nodeType: 3,
        textContent: normalizedValue,
      });
    },
  };

  return element;
}

function createHarness({ languageDirection = 'ltr' } = {}) {
  const resolveCalls = [];
  const elements = {
    'selector-title': createElement('selector-title'),
    textPreview: createElement('textPreview', 'pre'),
    btnTextExtraction: createElement('btnTextExtraction'),
    btnOverwriteClipboard: createElement('btnOverwriteClipboard'),
    btnAppendClipboard: createElement('btnAppendClipboard'),
    clipboardRepeatInput: createElement('clipboardRepeatInput', 'input'),
    btnEdit: createElement('btnEdit'),
    btnEmptyMain: createElement('btnEmptyMain'),
    btnLoadSnapshot: createElement('btnLoadSnapshot'),
    btnSaveSnapshot: createElement('btnSaveSnapshot'),
    btnNewTask: createElement('btnNewTask'),
    btnLoadTask: createElement('btnLoadTask'),
    btnReadingSpeedTest: createElement('btnReadingSpeedTest'),
    previewSpoilerToggle: createElement('previewSpoilerToggle', 'input'),
    previewSpoilerToggleLabel: createElement('previewSpoilerToggleLabel', 'label'),
    previewSpoilerText: createElement('previewSpoilerText'),
    btnTextExtractionAbort: createElement('btnTextExtractionAbort'),
  };

  const sandbox = {
    window: {
      getLogger() {
        return {
          debug() {},
          warn() {},
          warnOnce() {},
          error() {},
        };
      },
      RendererI18n: {
        getUiLanguageDirection() {
          return languageDirection;
        },
        resolveUserTextDirection(text) {
          const normalizedText = String(text ?? '');
          resolveCalls.push(normalizedText);
          return normalizedText.startsWith('rtl:') ? 'rtl' : 'ltr';
        },
      },
    },
    document: {
      documentElement: {
        dataset: { languageDirection },
      },
      getElementById(id) {
        return elements[id] || null;
      },
      createElement(tagName) {
        return createElement('', String(tagName || 'div').toLowerCase());
      },
      createTextNode(text) {
        return {
          nodeType: 3,
          textContent: String(text ?? ''),
        };
      },
    },
    console,
  };

  sandbox.window.AppConstants = {
    MAX_CLIPBOARD_REPEAT: 99,
    PREVIEW_INLINE_THRESHOLD: 8,
    PREVIEW_START_CHARS: 4,
    PREVIEW_END_CHARS: 3,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/current_text_selector_section.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/current_text_selector_section.js' });

  return {
    api: sandbox.window.CurrentTextSelectorSection,
    elements,
    resolveCalls,
  };
}

test('empty preview direction follows UI fallback instead of placeholder script', () => {
  const harness = createHarness({ languageDirection: 'rtl' });

  harness.api.renderPreview('', { emptyText: 'ltr:placeholder' });

  assert.deepEqual(harness.resolveCalls, []);
  assert.equal(harness.elements.textPreview.getAttribute('dir'), 'rtl');
  const fragment = harness.elements.textPreview.childNodes[0];
  assert.equal(fragment.tagName, 'bdi');
  assert.equal(fragment.getAttribute('dir'), 'auto');
  assert.equal(fragment.textContent, 'ltr:placeholder');
});

test('inline preview direction resolves from normalized source text', () => {
  const harness = createHarness();

  harness.api.renderPreview('rtl:ab\ncd');

  assert.deepEqual(harness.resolveCalls, ['rtl:ab   cd']);
  assert.equal(harness.elements.textPreview.getAttribute('dir'), 'rtl');
});

test('truncated preview resolves direction from full source text and keeps synthetic parts isolated', () => {
  const harness = createHarness();

  harness.api.renderPreview('rtl:abcdefghij');

  assert.deepEqual(harness.resolveCalls, ['rtl:abcdefghij']);
  assert.equal(harness.elements.textPreview.getAttribute('dir'), 'rtl');

  const cluster = harness.elements.textPreview.childNodes[0];
  const endFragment = harness.elements.textPreview.childNodes[1];
  assert.equal(cluster.tagName, 'span');
  assert.equal(cluster.getAttribute('dir'), 'rtl');
  assert.equal(cluster.childNodes[0].tagName, 'bdi');
  assert.equal(cluster.childNodes[0].getAttribute('dir'), 'auto');
  assert.equal(cluster.childNodes[2].tagName, 'span');
  assert.equal(cluster.childNodes[2].getAttribute('dir'), 'ltr');
  assert.equal(cluster.childNodes[2].textContent, '... | ...');
  assert.equal(endFragment.tagName, 'bdi');
  assert.equal(endFragment.getAttribute('dir'), 'auto');
  assert.equal(endFragment.textContent, 'hij');
});
