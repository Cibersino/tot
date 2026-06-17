'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let activeElementRef = null;

function createEvent(event = {}) {
  return {
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
    ...event,
  };
}

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
    placeholder: '',
    className: '',
    dataset: {},
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
    get innerHTML() {
      return textContent;
    },
    set innerHTML(value) {
      textContent = String(value || '');
      children.splice(0, children.length);
    },
    appendChild(child) {
      if (!child) return child;
      child.parentNode = this;
      children.push(child);
      return child;
    },
    append(...nodes) {
      nodes.forEach((node) => this.appendChild(node));
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
      const safeEvent = createEvent({ target: this, ...event });
      handlers.forEach((handler) => handler(safeEvent));
      return safeEvent;
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    removeAttribute(name) {
      delete attributes[name];
    },
    focus() {
      activeElementRef = this;
      this.dispatch('focus');
    },
    blur() {
      if (activeElementRef === this) {
        activeElementRef = null;
      }
      this.dispatch('blur');
    },
    select() {
      this._selected = true;
    },
  };
}

function createHarness({ omitIds = [] } = {}) {
  activeElementRef = null;
  const elements = {
    snapshotSaveTagsModal: createElement('snapshotSaveTagsModal'),
    snapshotSaveTagsModalBackdrop: createElement('snapshotSaveTagsModalBackdrop'),
    snapshotSaveTagsModalTitle: createElement('snapshotSaveTagsModalTitle'),
    snapshotSaveTagsModalMessage: createElement('snapshotSaveTagsModalMessage'),
    snapshotSaveTagsLanguageLabel: createElement('snapshotSaveTagsLanguageLabel', 'span'),
    snapshotSaveTagsLanguageControl: createElement('snapshotSaveTagsLanguageControl'),
    snapshotSaveTagsLanguageInput: createElement('snapshotSaveTagsLanguageInput', 'input'),
    snapshotSaveTagsLanguageListbox: createElement('snapshotSaveTagsLanguageListbox'),
    snapshotSaveTagsTypeLabel: createElement('snapshotSaveTagsTypeLabel', 'span'),
    snapshotSaveTagsTypeControl: createElement('snapshotSaveTagsTypeControl'),
    snapshotSaveTagsTypeInput: createElement('snapshotSaveTagsTypeInput', 'input'),
    snapshotSaveTagsTypeListbox: createElement('snapshotSaveTagsTypeListbox'),
    snapshotSaveTagsDifficultyLabel: createElement('snapshotSaveTagsDifficultyLabel', 'span'),
    snapshotSaveTagsDifficultyControl: createElement('snapshotSaveTagsDifficultyControl'),
    snapshotSaveTagsDifficultyInput: createElement('snapshotSaveTagsDifficultyInput', 'input'),
    snapshotSaveTagsDifficultyListbox: createElement('snapshotSaveTagsDifficultyListbox'),
    snapshotSaveTagsModalConfirm: createElement('snapshotSaveTagsModalConfirm'),
    snapshotSaveTagsModalCancel: createElement('snapshotSaveTagsModalCancel'),
    snapshotSaveTagsModalClose: createElement('snapshotSaveTagsModalClose'),
  };

  elements.snapshotSaveTagsLanguageControl.append(
    elements.snapshotSaveTagsLanguageInput,
    elements.snapshotSaveTagsLanguageListbox
  );
  elements.snapshotSaveTagsTypeControl.append(
    elements.snapshotSaveTagsTypeInput,
    elements.snapshotSaveTagsTypeListbox
  );
  elements.snapshotSaveTagsDifficultyControl.append(
    elements.snapshotSaveTagsDifficultyInput,
    elements.snapshotSaveTagsDifficultyListbox
  );

  const windowListeners = new Map();
  const documentListeners = new Map();
  const translations = {
    'renderer.snapshots.title': 'Save text snapshot',
    'renderer.snapshots.message': 'Optionally tag this text snapshot before choosing where to save it.',
    'renderer.snapshots.search.placeholder': 'Type to filter options',
    'renderer.snapshots.search.no_results': 'No matching options',
    'renderer.snapshots.labels.language': 'Language',
    'renderer.snapshots.labels.type': 'Type',
    'renderer.snapshots.labels.difficulty': 'Difficulty',
    'renderer.snapshots.empty.language': 'No language tag',
    'renderer.snapshots.empty.type': 'No type tag',
    'renderer.snapshots.empty.difficulty': 'No difficulty tag',
    'renderer.snapshots.buttons.confirm': 'Save Text Snapshot',
    'renderer.snapshots.buttons.cancel': 'Cancel',
    'renderer.snapshots.close_aria': 'Close save text snapshot dialog',
    'renderer.text_extraction.batch_plan.tags_modal.title': 'Unit tags',
    'renderer.text_extraction.batch_plan.tags_modal.message': 'Choose optional tags for snapshots created from this unit during batch extraction.',
    'renderer.text_extraction.batch_plan.tags_modal.confirm_button': 'Apply tags',
    'renderer.text_extraction.batch_plan.tags_modal.close_aria': 'Close unit tags dialog',
    'renderer.snapshots.options.language.en': 'English',
    'renderer.snapshots.options.language.es': 'Spanish',
    'renderer.snapshots.options.language.mi': 'Māori',
    'renderer.snapshots.options.type.fiction': 'Fiction',
    'renderer.snapshots.options.type.non_fiction': 'Non-fiction',
    'renderer.snapshots.options.difficulty.easy': 'Easy',
    'renderer.snapshots.options.difficulty.hard': 'Hard',
  };

  omitIds.forEach((id) => {
    delete elements[id];
  });

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
        LANGUAGE_OPTIONS: [
          { value: 'en', labelKey: 'renderer.snapshots.options.language.en' },
          { value: 'es', labelKey: 'renderer.snapshots.options.language.es' },
          { value: 'mi', labelKey: 'renderer.snapshots.options.language.mi' },
        ],
        TYPE_OPTIONS: [
          { value: 'fiction', labelKey: 'renderer.snapshots.options.type.fiction' },
          { value: 'non_fiction', labelKey: 'renderer.snapshots.options.type.non_fiction' },
        ],
        DIFFICULTY_OPTIONS: [
          { value: 'easy', labelKey: 'renderer.snapshots.options.difficulty.easy' },
          { value: 'hard', labelKey: 'renderer.snapshots.options.difficulty.hard' },
        ],
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
      addEventListener(type, handler) {
        if (!documentListeners.has(type)) {
          documentListeners.set(type, []);
        }
        documentListeners.get(type).push(handler);
      },
      removeEventListener(type, handler) {
        if (!documentListeners.has(type)) return;
        documentListeners.set(type, documentListeners.get(type).filter((candidate) => candidate !== handler));
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

  function dispatchDocument(type, event = {}) {
    const handlers = documentListeners.get(type) || [];
    const safeEvent = createEvent(event);
    handlers.forEach((handler) => handler(safeEvent));
    return safeEvent;
  }

  function dispatchWindow(type, event = {}) {
    const handlers = windowListeners.get(type) || [];
    const safeEvent = createEvent(event);
    handlers.forEach((handler) => handler(safeEvent));
    return safeEvent;
  }

  function dispatchWithWindowBubble(element, type, event = {}) {
    const safeEvent = element.dispatch(type, event);
    if (!safeEvent.propagationStopped) {
      const handlers = windowListeners.get(type) || [];
      handlers.forEach((handler) => handler(safeEvent));
    }
    return safeEvent;
  }

  function getOptionTexts(listboxId) {
    return elements[listboxId]._children.map((child) => child.textContent);
  }

  return {
    elements,
    prompt: sandbox.window.Notify.promptSnapshotSaveTags,
    dispatchDocument,
    dispatchWindow,
    dispatchWithWindowBubble,
    getOptionTexts,
  };
}

test('snapshot save tags modal keeps snapshot-save wording by default', async () => {
  const harness = createHarness();

  const promptPromise = harness.prompt({ initialTags: null });

  assert.equal(harness.elements.snapshotSaveTagsModalTitle.textContent, 'Save text snapshot');
  assert.match(harness.elements.snapshotSaveTagsModalMessage.textContent, /text snapshot/);
  assert.equal(harness.elements.snapshotSaveTagsModalConfirm.textContent, 'Save Text Snapshot');
  assert.equal(
    harness.elements.snapshotSaveTagsModalClose.getAttribute('aria-label'),
    'Close save text snapshot dialog'
  );
  assert.equal(harness.elements.snapshotSaveTagsLanguageInput.placeholder, 'Type to filter options');

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
  assert.match(harness.elements.snapshotSaveTagsModalMessage.textContent, /batch extraction/);
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

test('snapshot save tags modal opens with the first field focused and all selectors closed', async () => {
  const harness = createHarness();

  const promptPromise = harness.prompt({ initialTags: null });

  assert.equal(activeElementRef, harness.elements.snapshotSaveTagsLanguageInput);
  assert.equal(harness.elements.snapshotSaveTagsLanguageListbox.hidden, true);
  assert.equal(harness.elements.snapshotSaveTagsTypeListbox.hidden, true);
  assert.equal(harness.elements.snapshotSaveTagsDifficultyListbox.hidden, true);

  harness.elements.snapshotSaveTagsModalCancel.dispatch('click');
  await promptPromise;
});

test('snapshot save tags modal opens a selector only on direct control click', async () => {
  const harness = createHarness();

  const promptPromise = harness.prompt({ initialTags: null });

  harness.elements.snapshotSaveTagsLanguageInput.dispatch('click');
  assert.equal(harness.elements.snapshotSaveTagsLanguageListbox.hidden, false);
  assert.deepEqual(
    harness.getOptionTexts('snapshotSaveTagsLanguageListbox'),
    ['No language tag', 'English', 'Māori', 'Spanish']
  );

  harness.elements.snapshotSaveTagsModalCancel.dispatch('click');
  await promptPromise;
});

test('snapshot save tags modal keeps label clicks non-interactive', async () => {
  const harness = createHarness();

  const promptPromise = harness.prompt({ initialTags: null });

  harness.elements.snapshotSaveTagsTypeInput.focus();
  harness.elements.snapshotSaveTagsLanguageLabel.dispatch('click');
  assert.equal(activeElementRef, harness.elements.snapshotSaveTagsTypeInput);
  assert.equal(harness.elements.snapshotSaveTagsLanguageListbox.hidden, true);

  harness.elements.snapshotSaveTagsModalCancel.dispatch('click');
  await promptPromise;
});

test('snapshot save tags modal opens and filters when typing', async () => {
  const harness = createHarness();

  const promptPromise = harness.prompt({ initialTags: null });

  harness.elements.snapshotSaveTagsLanguageInput.value = 'span';
  harness.elements.snapshotSaveTagsLanguageInput.dispatch('input');
  assert.equal(harness.elements.snapshotSaveTagsLanguageListbox.hidden, false);
  assert.deepEqual(harness.getOptionTexts('snapshotSaveTagsLanguageListbox'), ['Spanish']);

  harness.elements.snapshotSaveTagsModalCancel.dispatch('click');
  await promptPromise;
});

test('snapshot save tags modal opens on ArrowDown and commits with Enter', async () => {
  const harness = createHarness();

  const promptPromise = harness.prompt({ initialTags: null });

  harness.elements.snapshotSaveTagsDifficultyInput.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(harness.elements.snapshotSaveTagsDifficultyListbox.hidden, false);
  harness.elements.snapshotSaveTagsDifficultyInput.dispatch('keydown', { key: 'ArrowDown' });
  harness.elements.snapshotSaveTagsDifficultyInput.dispatch('keydown', { key: 'Enter' });
  harness.elements.snapshotSaveTagsModalConfirm.dispatch('click');

  const result = await promptPromise;
  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    { tags: { difficulty: 'easy' } }
  );
});

test('snapshot save tags modal shows committed labels in closed fields and normalizes invalid initial tags away', async () => {
  const harness = createHarness();

  let promptPromise = harness.prompt({
    initialTags: {
      language: 'es',
      type: 'fiction',
      difficulty: 'hard',
    },
  });

  assert.equal(harness.elements.snapshotSaveTagsLanguageInput.value, 'Spanish');
  assert.equal(harness.elements.snapshotSaveTagsTypeInput.value, 'Fiction');
  assert.equal(harness.elements.snapshotSaveTagsDifficultyInput.value, 'Hard');
  harness.elements.snapshotSaveTagsModalCancel.dispatch('click');
  await promptPromise;

  promptPromise = harness.prompt({
    initialTags: {
      type: 'legacy_unknown',
    },
  });
  assert.equal(harness.elements.snapshotSaveTagsTypeInput.value, '');
  harness.elements.snapshotSaveTagsModalConfirm.dispatch('click');
  const result = await promptPromise;
  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    { tags: null }
  );
});

test('snapshot save tags modal replaces the visible committed label when typing', async () => {
  const harness = createHarness();

  const promptPromise = harness.prompt({
    initialTags: {
      type: 'fiction',
    },
  });

  harness.elements.snapshotSaveTagsTypeInput.dispatch('keydown', { key: 'n' });
  harness.elements.snapshotSaveTagsTypeInput.value = 'non';
  harness.elements.snapshotSaveTagsTypeInput.dispatch('input');
  assert.equal(harness.elements.snapshotSaveTagsTypeInput.value, 'non');
  assert.deepEqual(harness.getOptionTexts('snapshotSaveTagsTypeListbox'), ['Non-fiction']);

  harness.elements.snapshotSaveTagsModalCancel.dispatch('click');
  await promptPromise;
});

test('snapshot save tags modal filters by localized label and canonical value, accent-insensitively', async () => {
  const harness = createHarness();

  const promptPromise = harness.prompt({ initialTags: null });

  harness.elements.snapshotSaveTagsTypeInput.value = 'non_fiction';
  harness.elements.snapshotSaveTagsTypeInput.dispatch('input');
  assert.deepEqual(harness.getOptionTexts('snapshotSaveTagsTypeListbox'), ['Non-fiction']);

  harness.elements.snapshotSaveTagsLanguageInput.value = 'maori';
  harness.elements.snapshotSaveTagsLanguageInput.dispatch('input');
  assert.deepEqual(harness.getOptionTexts('snapshotSaveTagsLanguageListbox'), ['Māori']);

  harness.elements.snapshotSaveTagsModalCancel.dispatch('click');
  await promptPromise;
});

test('snapshot save tags modal keeps the clear option and returns canonical tags only', async () => {
  const harness = createHarness();

  const promptPromise = harness.prompt({
    initialTags: {
      type: 'fiction',
      language: 'en',
    },
  });

  harness.elements.snapshotSaveTagsTypeInput.dispatch('click');
  harness.elements.snapshotSaveTagsTypeListbox._children[0].dispatch('click');
  harness.elements.snapshotSaveTagsModalConfirm.dispatch('click');

  const result = await promptPromise;
  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    { tags: { language: 'en' } }
  );
});

test('snapshot save tags modal applies Escape and Tab semantics correctly', async () => {
  const harness = createHarness();

  let promptPromise = harness.prompt({ initialTags: null });

  harness.elements.snapshotSaveTagsLanguageInput.dispatch('click');
  harness.elements.snapshotSaveTagsLanguageInput.dispatch('keydown', { key: 'Escape' });
  assert.equal(harness.elements.snapshotSaveTagsLanguageListbox.hidden, true);
  assert.equal(harness.elements.snapshotSaveTagsModal.getAttribute('aria-hidden'), 'false');
  harness.elements.snapshotSaveTagsModalCancel.dispatch('click');
  await promptPromise;

  promptPromise = harness.prompt({ initialTags: { language: 'en' } });
  harness.elements.snapshotSaveTagsLanguageInput.dispatch('click');
  harness.elements.snapshotSaveTagsLanguageInput.value = 'es';
  harness.elements.snapshotSaveTagsLanguageInput.dispatch('input');
  harness.elements.snapshotSaveTagsLanguageInput.dispatch('keydown', { key: 'Tab' });
  harness.elements.snapshotSaveTagsModalConfirm.dispatch('click');
  const result = await promptPromise;
  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    { tags: { language: 'en' } }
  );
});

test('snapshot save tags modal stops Escape from bubbling to the modal close handler', async () => {
  const harness = createHarness();

  const promptPromise = harness.prompt({ initialTags: null });

  harness.elements.snapshotSaveTagsLanguageInput.dispatch('click');
  const bubbledEscapeEvent = harness.dispatchWithWindowBubble(
    harness.elements.snapshotSaveTagsLanguageInput,
    'keydown',
    { key: 'Escape' }
  );

  assert.equal(bubbledEscapeEvent.defaultPrevented, true);
  assert.equal(bubbledEscapeEvent.propagationStopped, true);
  assert.equal(harness.elements.snapshotSaveTagsLanguageListbox.hidden, true);
  assert.equal(harness.elements.snapshotSaveTagsModal.getAttribute('aria-hidden'), 'false');

  harness.elements.snapshotSaveTagsModalCancel.dispatch('click');
  await promptPromise;
});

test('snapshot save tags modal closes open selectors on outside click', async () => {
  const harness = createHarness();

  const promptPromise = harness.prompt({ initialTags: null });

  harness.elements.snapshotSaveTagsLanguageInput.dispatch('click');
  harness.dispatchDocument('mousedown', { target: createElement('outsideTarget') });
  assert.equal(harness.elements.snapshotSaveTagsLanguageListbox.hidden, true);

  harness.elements.snapshotSaveTagsModalCancel.dispatch('click');
  await promptPromise;
});

test('snapshot save tags modal keeps the missing-DOM guard at prompt time', async () => {
  const harness = createHarness({ omitIds: ['snapshotSaveTagsLanguageInput'] });

  const result = await harness.prompt({ initialTags: null });
  assert.equal(result, null);
});
