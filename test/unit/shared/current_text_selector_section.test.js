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
    contains(name) {
      return values.has(name);
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
    blur() {
      if (listeners.blur) listeners.blur({});
    },
    dispatch(type, event = {}) {
      if (listeners[type]) return listeners[type](event);
      return undefined;
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
    previewSpoilerDescription: createElement('previewSpoilerDescription'),
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

function bindSelectorActions(api, onPreviewSpoilerEnabledChange) {
  const noop = () => {};
  api.bindActions({
    onTextExtraction: noop,
    onTextExtractionAbort: noop,
    onOverwriteClipboard: noop,
    onAppendClipboard: noop,
    onOpenEditor: noop,
    onClearText: noop,
    onLoadSnapshot: noop,
    onSaveSnapshot: noop,
    onNewTask: noop,
    onLoadTask: noop,
    onReadingSpeedTest: noop,
    onPreviewSpoilerEnabledChange,
  });
}

test('empty preview direction follows UI fallback instead of placeholder script', () => {
  const harness = createHarness({ languageDirection: 'rtl' });

  harness.api.renderPreview('', { emptyText: 'ltr:placeholder' });

  assert.deepEqual(harness.resolveCalls, []);
  assert.equal(harness.elements.textPreview.getAttribute('dir'), 'rtl');
  const fragment = harness.elements.textPreview.childNodes[0];
  assert.equal(fragment.tagName, 'bdi');
  assert.equal(fragment.className, 'preview-fragment preview-fragment--empty');
  assert.equal(fragment.getAttribute('dir'), 'auto');
  assert.equal(fragment.textContent, 'ltr:placeholder');
});

test('inline preview direction resolves from normalized source text', () => {
  const harness = createHarness();

  harness.api.renderPreview('rtl:ab\ncd');

  assert.deepEqual(harness.resolveCalls, ['rtl:ab   cd']);
  assert.equal(harness.elements.textPreview.getAttribute('dir'), 'rtl');
  assert.equal(harness.elements.textPreview.childNodes[0].childNodes[0].className, 'preview-fragment');
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

test('clipboard repeat commits the canonical value on blur and Enter', () => {
  const harness = createHarness();
  const input = harness.elements.clipboardRepeatInput;

  input.value = '100';
  input.dispatch('input');
  assert.equal(input.classList.contains('is-invalid'), true);
  assert.equal(input.getAttribute('aria-invalid'), 'true');
  input.dispatch('blur');
  assert.equal(input.value, '99');
  assert.equal(input.classList.contains('is-invalid'), false);
  assert.equal(input.getAttribute('aria-invalid'), 'false');

  let prevented = false;
  input.value = '0';
  input.dispatch('input');
  assert.equal(input.classList.contains('is-invalid'), true);
  input.dispatch('keydown', {
    key: 'Enter',
    preventDefault() {
      prevented = true;
    },
  });

  assert.equal(prevented, true);
  assert.equal(input.value, '1');
  assert.equal(input.classList.contains('is-invalid'), false);
});

test('Spoiler updates its visible name and shared description/visual-tooltip source', () => {
  const harness = createHarness();

  harness.api.applyTranslations({
    tRenderer(key) {
      if (key === 'renderer.main.reading_tools.preview_spoiler') return 'Spoiler';
      if (key === 'renderer.main.help.preview_spoiler') {
        return 'Show or hide the end of the preview';
      }
      return key;
    },
  });

  assert.equal(
    harness.elements.previewSpoilerToggleLabel.getAttribute('data-tot-tooltip'),
    'Show or hide the end of the preview',
  );
  assert.equal(
    harness.elements.previewSpoilerDescription.textContent,
    'Show or hide the end of the preview',
  );
  assert.equal(harness.elements.previewSpoilerText.textContent, 'Spoiler');
  assert.equal(harness.elements.previewSpoilerToggle.getAttribute('aria-label'), null);
});

test('Spoiler applies saved state and restores the saved state when persistence fails', async () => {
  const harness = createHarness();
  const toggle = harness.elements.previewSpoilerToggle;

  harness.api.renderPreview('abcdefghij');
  harness.api.setPreviewSpoilerEnabled(false);
  assert.equal(toggle.checked, false);
  assert.equal(harness.elements.textPreview.childNodes.length, 1);
  assert.equal(harness.elements.textPreview.childNodes[0].childNodes[0].textContent, 'abcdefg');
  assert.equal(harness.elements.textPreview.childNodes[0].childNodes[2].textContent, '...');

  let persistCalls = 0;
  let rejectSave;
  bindSelectorActions(harness.api, () => new Promise((_resolve, reject) => {
    persistCalls += 1;
    rejectSave = reject;
  }));

  toggle.checked = true;
  const pendingChange = toggle.dispatch('change');
  assert.equal(toggle.disabled, true);
  rejectSave(new Error('disk full'));
  await pendingChange;

  assert.equal(toggle.checked, false);
  assert.equal(toggle.disabled, false);
  assert.equal(harness.elements.textPreview.childNodes.length, 1);
  assert.equal(harness.elements.textPreview.childNodes[0].childNodes[0].textContent, 'abcdefg');
  assert.equal(harness.elements.textPreview.childNodes[0].childNodes[2].textContent, '...');

  toggle.checked = true;
  const retryChange = toggle.dispatch('change');
  assert.equal(toggle.disabled, true);
  rejectSave(new Error('disk full'));
  await retryChange;

  assert.equal(persistCalls, 2);
  assert.equal(toggle.checked, false);
  assert.equal(toggle.disabled, false);
  assert.equal(harness.elements.textPreview.childNodes.length, 1);
  assert.equal(harness.elements.textPreview.childNodes[0].childNodes[0].textContent, 'abcdefg');
  assert.equal(harness.elements.textPreview.childNodes[0].childNodes[2].textContent, '...');
});

test('Spoiler remains disabled when persistence capability is unavailable', async () => {
  const harness = createHarness();
  const toggle = harness.elements.previewSpoilerToggle;

  harness.api.renderPreview('abcdefghij');
  harness.api.setPreviewSpoilerEnabled(false);
  bindSelectorActions(harness.api, null);

  assert.equal(toggle.checked, false);
  assert.equal(toggle.disabled, true);
  assert.equal(toggle.getAttribute('aria-disabled'), 'true');
  assert.equal(harness.elements.textPreview.childNodes.length, 1);

  toggle.checked = true;
  await toggle.dispatch('change');

  assert.equal(toggle.checked, false);
  assert.equal(toggle.disabled, true);
  assert.equal(toggle.getAttribute('aria-disabled'), 'true');
  assert.equal(harness.elements.textPreview.childNodes.length, 1);

  harness.api.setInteractionLocked(true);
  harness.api.setInteractionLocked(false);
  harness.api.setPreviewSpoilerEnabled(true);

  assert.equal(toggle.checked, true);
  assert.equal(toggle.disabled, true);
  assert.equal(toggle.getAttribute('aria-disabled'), 'true');
});

test('Spanish and English define the Spoiler shared help source', () => {
  const expectedBaseCopy = {
    en: 'Show or hide the end of the preview',
    es: 'Mostrar u ocultar el final de la vista previa',
  };
  Object.entries(expectedBaseCopy).forEach(([tag, expected]) => {
    const rendererPath = path.resolve(__dirname, `../../../i18n/${tag.toLowerCase()}/renderer.json`);
    const renderer = JSON.parse(fs.readFileSync(rendererPath, 'utf8'));
    const help = renderer.renderer.main.help.preview_spoiler;

    assert.equal(help, expected, `${tag} has unexpected Spoiler help`);
  });
});
