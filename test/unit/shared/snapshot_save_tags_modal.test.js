'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const snapshotTagCatalog = require('../../../public/js/lib/snapshot_tag_catalog');

let activeElementRef = null;

function flushMicrotasks() {
  return Promise.resolve().then(() => Promise.resolve());
}

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
    style: {},
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

function walk(node, visit) {
  if (!node) return;
  visit(node);
  if (!Array.isArray(node._children)) return;
  node._children.forEach((child) => walk(child, visit));
}

function findDescendant(root, predicate) {
  let match = null;
  walk(root, (node) => {
    if (!match && predicate(node)) {
      match = node;
    }
  });
  return match;
}

function interpolate(template, params = {}) {
  return String(template || '').replace(/\{(\w+)\}/g, (_match, key) => {
    return Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : '';
  });
}

function createHarness({
  storedPreferences = snapshotTagCatalog.createEmptySnapshotTagPreferences(),
  confirmResult = true,
} = {}) {
  activeElementRef = null;

  const elements = {
    snapshotSaveTagsModal: createElement('snapshotSaveTagsModal'),
    snapshotSaveTagsModalBackdrop: createElement('snapshotSaveTagsModalBackdrop'),
    snapshotSaveTagsModalTitle: createElement('snapshotSaveTagsModalTitle'),
    snapshotSaveTagsModalMessage: createElement('snapshotSaveTagsModalMessage'),
    snapshotSaveTagsManageButton: createElement('snapshotSaveTagsManageButton', 'button'),
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
    snapshotSaveTagsModalConfirm: createElement('snapshotSaveTagsModalConfirm', 'button'),
    snapshotSaveTagsModalCancel: createElement('snapshotSaveTagsModalCancel', 'button'),
    snapshotSaveTagsModalClose: createElement('snapshotSaveTagsModalClose', 'button'),
    snapshotTagManagerModal: createElement('snapshotTagManagerModal'),
    snapshotTagManagerModalBackdrop: createElement('snapshotTagManagerModalBackdrop'),
    snapshotTagManagerModalTitle: createElement('snapshotTagManagerModalTitle'),
    snapshotTagManagerModalMessage: createElement('snapshotTagManagerModalMessage'),
    snapshotTagManagerModalContent: createElement('snapshotTagManagerModalContent'),
    snapshotTagManagerModalDone: createElement('snapshotTagManagerModalDone', 'button'),
    snapshotTagManagerModalClose: createElement('snapshotTagManagerModalClose', 'button'),
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
    'renderer.snapshots.search.create': 'Create "{label}"',
    'renderer.snapshots.buttons.manage': 'Manage tags',
    'renderer.snapshots.labels.language': 'Language',
    'renderer.snapshots.labels.type': 'Type',
    'renderer.snapshots.labels.difficulty': 'Difficulty',
    'renderer.snapshots.empty.language': 'No language tag',
    'renderer.snapshots.empty.type': 'No type tag',
    'renderer.snapshots.empty.difficulty': 'No difficulty tag',
    'renderer.snapshots.buttons.confirm': 'Save Text Snapshot',
    'renderer.snapshots.buttons.cancel': 'Cancel',
    'renderer.snapshots.close_aria': 'Close save text snapshot dialog',
    'renderer.snapshots.options.language.en': 'English',
    'renderer.snapshots.options.language.es': 'Spanish',
    'renderer.snapshots.options.language.mi': 'Māori',
    'renderer.snapshots.options.type.fiction': 'Ficción',
    'renderer.snapshots.options.type.non_fiction': 'No ficción',
    'renderer.snapshots.options.difficulty.easy': 'Easy',
    'renderer.snapshots.options.difficulty.normal': 'Normal',
    'renderer.snapshots.options.difficulty.hard': 'Hard',
    'renderer.snapshots.manager.title': 'Manage snapshot tags',
    'renderer.snapshots.manager.message': 'Edit the visible tag catalog for future snapshot prompts.',
    'renderer.snapshots.manager.done': 'Done',
    'renderer.snapshots.manager.close_aria': 'Close tag manager',
    'renderer.snapshots.manager.new_tag': 'New tag',
    'renderer.snapshots.manager.new_tag_placeholder': 'Type a new tag label',
    'renderer.snapshots.manager.add_tag': 'Add tag',
    'renderer.snapshots.manager.cancel_draft': 'Cancel',
    'renderer.snapshots.manager.sort_alphabetically': 'Sort alphabetically',
    'renderer.snapshots.manager.restore_hidden_defaults': 'Restore {count} hidden defaults',
    'renderer.snapshots.manager.empty_category': 'No visible tags',
    'renderer.snapshots.manager.move_up': 'Move {label} up',
    'renderer.snapshots.manager.move_down': 'Move {label} down',
    'renderer.snapshots.manager.hide_default': 'Hide {label}',
    'renderer.snapshots.manager.delete_custom': 'Delete {label}',
    'renderer.snapshots.manager.confirm_hide_default': 'Hide {label} from the visible catalog?',
    'renderer.snapshots.manager.confirm_delete_custom': 'Delete {label} permanently?',
    'renderer.snapshots.manager.validation.empty': 'Enter a tag label.',
    'renderer.snapshots.manager.validation.control_characters': 'Control characters are not allowed.',
    'renderer.snapshots.manager.validation.too_long': 'Tag labels must be 48 characters or shorter.',
    'renderer.snapshots.manager.validation.duplicate': 'That tag already exists in this category.',
    'renderer.snapshots.alerts.catalog_update_error': 'Could not update the tag catalog.',
  };

  let currentStoredPreferences = snapshotTagCatalog.normalizeSnapshotTagPreferences(storedPreferences);
  const savedPreferences = [];
  const confirmCalls = [];
  const notifications = [];
  const registeredPromptNames = [];

  const sandbox = {
    window: {
      Notify: {
        confirmMain(key, params) {
          confirmCalls.push({ key, params });
          return confirmResult;
        },
        notifyMain(key) {
          notifications.push(key);
        },
        registerCustomPrompt(name, handler) {
          registeredPromptNames.push(name);
          this[name] = handler;
        },
      },
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
        msgRenderer(key, params) {
          return interpolate(translations[key] || key, params);
        },
      },
      SnapshotTagCatalog: snapshotTagCatalog,
      RendererIcons: {
        createIconButton({ className = '', title = '', ariaLabel = '' } = {}) {
          const button = createElement('', 'button');
          button.className = className;
          if (title) button.title = title;
          if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
          return button;
        },
      },
      electronAPI: {
        async getSnapshotTagPreferences() {
          return { ok: true, snapshotTags: currentStoredPreferences };
        },
        async setSnapshotTagPreferences(payload) {
          currentStoredPreferences = snapshotTagCatalog.normalizeSnapshotTagPreferences(payload);
          savedPreferences.push(JSON.parse(JSON.stringify(currentStoredPreferences)));
          return { ok: true, snapshotTags: currentStoredPreferences };
        },
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
    setTimeout(handler) {
      if (typeof handler === 'function') {
        handler();
      }
      return 0;
    },
    clearTimeout() {},
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/snapshot_save_tags_modal.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/snapshot_save_tags_modal.js' });

  function getOptionTexts(listboxId) {
    return elements[listboxId]._children.map((child) => child.textContent);
  }

  function findInManagerByAriaLabel(label) {
    return findDescendant(
      elements.snapshotTagManagerModalContent,
      (node) => typeof node.getAttribute === 'function' && node.getAttribute('aria-label') === label
    );
  }

  function findInManagerByText(text) {
    return findDescendant(
      elements.snapshotTagManagerModalContent,
      (node) => typeof node.textContent === 'string' && node.textContent === text
    );
  }

  function findInManagerByClassName(className) {
    return findDescendant(
      elements.snapshotTagManagerModalContent,
      (node) => typeof node.className === 'string' && node.className === className
    );
  }

  function dispatchWindowEvent(type, event = {}) {
    const handlers = windowListeners.get(type) || [];
    const safeEvent = createEvent(event);
    handlers.forEach((handler) => handler(safeEvent));
    return safeEvent;
  }

  return {
    elements,
    prompt: sandbox.window.Notify.promptSnapshotSaveTags,
    promptManager: sandbox.window.Notify.promptSnapshotTagManager,
    getRegisteredPromptNames() {
      return registeredPromptNames.slice();
    },
    getOptionTexts,
    getStoredPreferences() {
      return JSON.parse(JSON.stringify(currentStoredPreferences));
    },
    getSavedPreferences() {
      return savedPreferences.slice();
    },
    getConfirmCalls() {
      return confirmCalls.slice();
    },
    getActiveElement() {
      return activeElementRef;
    },
    notifications,
    findInManagerByAriaLabel,
    findInManagerByText,
    findInManagerByClassName,
    dispatchWindowEvent,
  };
}

test('snapshot save tags modal registers public prompts through window.Notify.registerCustomPrompt', () => {
  const harness = createHarness();

  assert.deepEqual(harness.getRegisteredPromptNames(), [
    'promptSnapshotTagManager',
    'promptSnapshotSaveTags',
  ]);
  assert.equal(typeof harness.prompt, 'function');
  assert.equal(typeof harness.promptManager, 'function');
});

test('snapshot save tags modal keeps snapshot-save wording by default', async () => {
  const harness = createHarness();

  const promptPromise = harness.prompt({ initialTags: null });
  await flushMicrotasks();

  assert.equal(harness.elements.snapshotSaveTagsModalTitle.textContent, 'Save text snapshot');
  assert.match(harness.elements.snapshotSaveTagsModalMessage.textContent, /text snapshot/);
  assert.equal(harness.elements.snapshotSaveTagsModalConfirm.textContent, 'Save Text Snapshot');
  assert.equal(harness.elements.snapshotSaveTagsLanguageInput.placeholder, 'Type to filter options');
  assert.equal(harness.elements.snapshotSaveTagsManageButton.textContent, 'Manage tags');
  assert.equal(harness.elements.snapshotSaveTagsManageButton.title, 'Manage tags');
  assert.equal(
    harness.elements.snapshotSaveTagsManageButton.getAttribute('aria-label'),
    'Manage snapshot tags'
  );

  harness.elements.snapshotSaveTagsModalCancel.dispatch('click');
  const result = await promptPromise;
  assert.equal(result, null);
});

test('snapshot save tags modal creates and selects a custom tag from the inline create option', async () => {
  const harness = createHarness();

  const promptPromise = harness.prompt({ initialTags: null });
  await flushMicrotasks();
  harness.elements.snapshotSaveTagsTypeInput.value = 'Short story';
  harness.elements.snapshotSaveTagsTypeInput.dispatch('input');

  assert.deepEqual(
    harness.getOptionTexts('snapshotSaveTagsTypeListbox'),
    ['Create "Short story"']
  );

  harness.elements.snapshotSaveTagsTypeListbox._children[0].dispatch('click');
  await flushMicrotasks();

  const customValue = snapshotTagCatalog.buildCustomTagValue('type', 'Short story');
  assert.equal(harness.elements.snapshotSaveTagsTypeInput.value, 'Short story');
  assert.equal(harness.getStoredPreferences().type.order.at(-1), customValue);

  harness.elements.snapshotSaveTagsModalConfirm.dispatch('click');
  const result = await promptPromise;
  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    { tags: { type: customValue } }
  );
});

test('snapshot save tags modal shows the inline create option before matching catalog options', async () => {
  const harness = createHarness();

  const promptPromise = harness.prompt({ initialTags: null });
  await flushMicrotasks();
  harness.elements.snapshotSaveTagsLanguageInput.value = 'Span';
  harness.elements.snapshotSaveTagsLanguageInput.dispatch('input');

  assert.deepEqual(
    harness.getOptionTexts('snapshotSaveTagsLanguageListbox'),
    ['Create "Span"', 'Spanish']
  );

  harness.elements.snapshotSaveTagsModalCancel.dispatch('click');
  await promptPromise;
});

test('snapshot save tags modal suppresses inline create when a normalized match already exists', async () => {
  const harness = createHarness();

  const promptPromise = harness.prompt({ initialTags: null });
  await flushMicrotasks();
  harness.elements.snapshotSaveTagsTypeInput.value = 'ficcion';
  harness.elements.snapshotSaveTagsTypeInput.dispatch('input');

  const optionTexts = harness.getOptionTexts('snapshotSaveTagsTypeListbox');
  assert.equal(optionTexts.includes('Ficción'), true);
  assert.equal(optionTexts.some((text) => text.startsWith('Create "')), false);

  harness.elements.snapshotSaveTagsModalCancel.dispatch('click');
  await promptPromise;
});

test('snapshot tag manager hides defaults through window.Notify.confirmMain and persists the result', async () => {
  const harness = createHarness();

  const managerPromise = harness.promptManager({ initialPreferences: null });
  await flushMicrotasks();
  const hideEnglishButton = harness.findInManagerByAriaLabel('Hide English');
  assert.ok(hideEnglishButton);

  hideEnglishButton.dispatch('click');
  await flushMicrotasks();

  const confirmCalls = JSON.parse(JSON.stringify(harness.getConfirmCalls()));
  assert.deepEqual(confirmCalls, [{
    key: 'renderer.snapshots.manager.confirm_hide_default',
    params: { label: 'English' },
  }]);
  assert.equal(harness.getStoredPreferences().language.hiddenDefaults.includes('en'), true);

  harness.elements.snapshotTagManagerModalDone.dispatch('click');
  await managerPromise;
});

test('snapshot tag manager moves focus into the modal on open', async () => {
  const harness = createHarness();

  const managerPromise = harness.promptManager({ initialPreferences: null });
  await flushMicrotasks();

  assert.equal(harness.getActiveElement(), harness.elements.snapshotTagManagerModalClose);

  harness.elements.snapshotTagManagerModalDone.dispatch('click');
  await managerPromise;
});

test('snapshot tag manager renders text action buttons at normal size', async () => {
  const harness = createHarness();

  const managerPromise = harness.promptManager({ initialPreferences: null });
  await flushMicrotasks();

  assert.equal(harness.findInManagerByText('New tag').className, 'btn-standard');
  assert.equal(harness.findInManagerByText('Sort alphabetically').className, 'btn-standard');
  assert.equal(harness.findInManagerByText('Restore 0 hidden defaults').className, 'btn-standard');

  harness.elements.snapshotTagManagerModalDone.dispatch('click');
  await managerPromise;
});

test('snapshot tag manager escape in new-tag input cancels only the draft', async () => {
  const harness = createHarness();

  const managerPromise = harness.promptManager({ initialPreferences: null });
  await flushMicrotasks();

  harness.findInManagerByText('New tag').dispatch('click');
  await flushMicrotasks();

  const draftInput = harness.findInManagerByClassName('snapshot-tag-manager-draft-input');
  assert.ok(draftInput);

  const keyEvent = draftInput.dispatch('keydown', { key: 'Escape' });
  if (!keyEvent.propagationStopped) {
    harness.dispatchWindowEvent('keydown', { key: 'Escape' });
  }
  await flushMicrotasks();

  assert.equal(harness.findInManagerByClassName('snapshot-tag-manager-draft-input'), null);
  assert.equal(harness.elements.snapshotTagManagerModal.getAttribute('aria-hidden'), 'false');

  harness.elements.snapshotTagManagerModalDone.dispatch('click');
  await managerPromise;
});
