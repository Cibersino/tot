'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let activeElementRef = null;

function createElement(id, tagName = 'div') {
  let textContent = '';
  const listeners = new Map();
  const attributes = {};
  const children = [];

  return {
    id,
    tagName,
    hidden: false,
    disabled: false,
    value: '',
    className: '',
    parentNode: null,
    _children: children,
    get textContent() {
      if (children.length) {
        return children.map((child) => child.textContent).join('');
      }
      return textContent;
    },
    set textContent(value) {
      textContent = String(value);
      children.splice(0, children.length);
    },
    appendChild(child) {
      if (!child) return child;
      child.parentNode = this;
      children.push(child);
      return child;
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      if (!listeners.has(type)) return;
      listeners.set(type, listeners.get(type).filter((candidate) => candidate !== handler));
    },
    dispatch(type, event = {}) {
      const handlers = listeners.get(type) || [];
      handlers.forEach((handler) => handler(event));
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    focus() {
      activeElementRef = this;
    },
  };
}

function createHarness() {
  activeElementRef = null;
  const elements = {
    snapshotSaveTagsModal: createElement('snapshotSaveTagsModal'),
    snapshotSaveTagsModalBackdrop: createElement('snapshotSaveTagsModalBackdrop'),
    snapshotSaveTagsModalTitle: createElement('snapshotSaveTagsModalTitle'),
    snapshotSaveTagsModalMessage: createElement('snapshotSaveTagsModalMessage'),
    snapshotSaveTagsLanguageLabel: createElement('snapshotSaveTagsLanguageLabel'),
    snapshotSaveTagsLanguage: createElement('snapshotSaveTagsLanguage', 'select'),
    snapshotSaveTagsTypeLabel: createElement('snapshotSaveTagsTypeLabel'),
    snapshotSaveTagsType: createElement('snapshotSaveTagsType', 'select'),
    snapshotSaveTagsDifficultyLabel: createElement('snapshotSaveTagsDifficultyLabel'),
    snapshotSaveTagsDifficulty: createElement('snapshotSaveTagsDifficulty', 'select'),
    snapshotSaveTagsModalConfirm: createElement('snapshotSaveTagsModalConfirm'),
    snapshotSaveTagsModalCancel: createElement('snapshotSaveTagsModalCancel'),
    snapshotSaveTagsModalClose: createElement('snapshotSaveTagsModalClose'),
  };

  const windowListeners = new Map();
  const translations = {
    'renderer.snapshot_save_tags.title': 'Save text snapshot',
    'renderer.snapshot_save_tags.message': 'Optionally tag this text snapshot before choosing where to save it.',
    'renderer.snapshot_save_tags.labels.language': 'Language',
    'renderer.snapshot_save_tags.labels.type': 'Type',
    'renderer.snapshot_save_tags.labels.difficulty': 'Difficulty',
    'renderer.snapshot_save_tags.empty.language': 'No language tag',
    'renderer.snapshot_save_tags.empty.type': 'No type tag',
    'renderer.snapshot_save_tags.empty.difficulty': 'No difficulty tag',
    'renderer.snapshot_save_tags.buttons.confirm': 'Save Text Snapshot',
    'renderer.snapshot_save_tags.buttons.cancel': 'Cancel',
    'renderer.snapshot_save_tags.close_aria': 'Close save text snapshot dialog',
    'renderer.text_extraction.batch_plan.tags_modal.title': 'Unit tags',
    'renderer.text_extraction.batch_plan.tags_modal.message': 'Choose optional tags for snapshots created from this unit during batch extraction.',
    'renderer.text_extraction.batch_plan.tags_modal.confirm_button': 'Apply tags',
    'renderer.text_extraction.batch_plan.tags_modal.close_aria': 'Close unit tags dialog',
    'renderer.snapshot_save_tags.options.language.en': 'English',
    'renderer.snapshot_save_tags.options.type.fiction': 'Fiction',
    'renderer.snapshot_save_tags.options.difficulty.easy': 'Easy',
  };

  const sandbox = {
    window: {
      Notify: {},
      getLogger() {
        return {
          debug() {},
          info() {},
          warn() {},
          warnOnce() {},
          error() {},
        };
      },
      RendererI18n: {
        tRenderer(key) {
          return translations[key] || key;
        },
      },
      SnapshotTagCatalog: {
        LANGUAGE_OPTIONS: [{ value: 'en', labelKey: 'renderer.snapshot_save_tags.options.language.en' }],
        TYPE_OPTIONS: [{ value: 'fiction', labelKey: 'renderer.snapshot_save_tags.options.type.fiction' }],
        DIFFICULTY_OPTIONS: [{ value: 'easy', labelKey: 'renderer.snapshot_save_tags.options.difficulty.easy' }],
      },
      addEventListener(type, handler) {
        if (!windowListeners.has(type)) {
          windowListeners.set(type, []);
        }
        windowListeners.get(type).push(handler);
      },
      removeEventListener(type, handler) {
        if (!windowListeners.has(type)) return;
        windowListeners.set(type, windowListeners.get(type).filter((candidate) => candidate !== handler));
      },
    },
    document: {
      get activeElement() {
        return activeElementRef;
      },
      getElementById(id) {
        return elements[id] || null;
      },
      createElement(tagName) {
        return createElement('', tagName);
      },
      contains(node) {
        return !!node;
      },
    },
    console,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/snapshot_save_tags_modal.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/snapshot_save_tags_modal.js' });

  return {
    elements,
    prompt: sandbox.window.Notify.promptSnapshotSaveTags,
  };
}

test('snapshot save tags modal keeps snapshot-save wording by default', async () => {
  const harness = createHarness();

  const promptPromise = harness.prompt({ initialTags: null });

  assert.equal(harness.elements.snapshotSaveTagsModalTitle.textContent, 'Save text snapshot');
  assert.match(
    harness.elements.snapshotSaveTagsModalMessage.textContent,
    /text snapshot/
  );
  assert.equal(harness.elements.snapshotSaveTagsModalConfirm.textContent, 'Save Text Snapshot');
  assert.equal(
    harness.elements.snapshotSaveTagsModalClose.getAttribute('aria-label'),
    'Close save text snapshot dialog'
  );

  harness.elements.snapshotSaveTagsModalCancel.dispatch('click');
  const result = await promptPromise;
  assert.equal(result, null);
});

test('snapshot save tags modal supports caller-provided contextual copy', async () => {
  const harness = createHarness();

  const promptPromise = harness.prompt({
    initialTags: null,
    copy: {
      titleKey: 'renderer.text_extraction.batch_plan.tags_modal.title',
      messageKey: 'renderer.text_extraction.batch_plan.tags_modal.message',
      confirmKey: 'renderer.text_extraction.batch_plan.tags_modal.confirm_button',
      closeAriaKey: 'renderer.text_extraction.batch_plan.tags_modal.close_aria',
    },
  });

  assert.equal(harness.elements.snapshotSaveTagsModalTitle.textContent, 'Unit tags');
  assert.match(
    harness.elements.snapshotSaveTagsModalMessage.textContent,
    /batch extraction/
  );
  assert.equal(harness.elements.snapshotSaveTagsModalConfirm.textContent, 'Apply tags');
  assert.equal(harness.elements.snapshotSaveTagsModalCancel.textContent, 'Cancel');
  assert.equal(
    harness.elements.snapshotSaveTagsModalClose.getAttribute('aria-label'),
    'Close unit tags dialog'
  );

  harness.elements.snapshotSaveTagsModalCancel.dispatch('click');
  const result = await promptPromise;
  assert.equal(result, null);
});
