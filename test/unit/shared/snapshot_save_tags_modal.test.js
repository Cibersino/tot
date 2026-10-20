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

  const classValues = new Set();
  const element = {
    id,
    tagName,
    hidden: false,
    disabled: false,
    checked: false,
    value: '',
    placeholder: '',
    className: '',
    dataset: {},
    parentNode: null,
    style: {},
    _children: children,
    get children() {
      return children;
    },
    get firstElementChild() {
      return children[0] || null;
    },
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
    replaceChildren(...nodes) {
      children.splice(0, children.length);
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
    contains(node) {
      let current = node;
      while (current) {
        if (current === this) return true;
        current = current.parentNode;
      }
      return false;
    },
    querySelector(selector) {
      if (typeof selector !== 'string' || !selector.startsWith('.')) return null;
      const className = selector.slice(1);
      const pending = children.slice();
      while (pending.length) {
        const candidate = pending.shift();
        const classNames = String(candidate.className || '').split(/\s+/);
        if (classNames.includes(className)) return candidate;
        pending.push(...candidate._children);
      }
      return null;
    },
    scrollIntoView() {},
  };
  element.classList = {
    add(...names) {
      names.forEach((name) => classValues.add(name));
    },
    remove(...names) {
      names.forEach((name) => classValues.delete(name));
    },
    contains(name) {
      return classValues.has(name);
    },
  };
  return element;
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
  getSnapshotTagPreferencesImpl = null,
  setSnapshotTagPreferencesImpl = null,
  includeSnapshotTagPreferencesBridge = true,
} = {}) {
  activeElementRef = null;

  const elements = {
    snapshotSaveTagsModal: createElement('snapshotSaveTagsModal'),
    snapshotSaveTagsModalBackdrop: createElement('snapshotSaveTagsModalBackdrop'),
    snapshotSaveTagsModalPanel: createElement('snapshotSaveTagsModalPanel'),
    snapshotSaveTagsModalTitle: createElement('snapshotSaveTagsModalTitle'),
    snapshotSaveTagsModalMessage: createElement('snapshotSaveTagsModalMessage'),
    snapshotSaveTagsManageButton: createElement('snapshotSaveTagsManageButton', 'button'),
    snapshotSaveTagsLanguageLabel: createElement('snapshotSaveTagsLanguageLabel', 'span'),
    snapshotSaveTagsLanguageSelected: createElement('snapshotSaveTagsLanguageSelected', 'ul'),
    snapshotSaveTagsLanguageControl: createElement('snapshotSaveTagsLanguageControl'),
    snapshotSaveTagsLanguagePicker: createElement('snapshotSaveTagsLanguagePicker'),
    snapshotSaveTagsLanguageInput: createElement('snapshotSaveTagsLanguageInput', 'input'),
    snapshotSaveTagsLanguageListbox: createElement('snapshotSaveTagsLanguageListbox'),
    snapshotSaveTagsTypeLabel: createElement('snapshotSaveTagsTypeLabel', 'span'),
    snapshotSaveTagsTypeSelected: createElement('snapshotSaveTagsTypeSelected', 'ul'),
    snapshotSaveTagsTypeControl: createElement('snapshotSaveTagsTypeControl'),
    snapshotSaveTagsTypePicker: createElement('snapshotSaveTagsTypePicker'),
    snapshotSaveTagsTypeInput: createElement('snapshotSaveTagsTypeInput', 'input'),
    snapshotSaveTagsTypeListbox: createElement('snapshotSaveTagsTypeListbox'),
    snapshotSaveTagsDifficultyLabel: createElement('snapshotSaveTagsDifficultyLabel', 'span'),
    snapshotSaveTagsDifficultySelected: createElement('snapshotSaveTagsDifficultySelected', 'ul'),
    snapshotSaveTagsDifficultyControl: createElement('snapshotSaveTagsDifficultyControl'),
    snapshotSaveTagsDifficultyPicker: createElement('snapshotSaveTagsDifficultyPicker'),
    snapshotSaveTagsDifficultyInput: createElement('snapshotSaveTagsDifficultyInput', 'input'),
    snapshotSaveTagsDifficultyListbox: createElement('snapshotSaveTagsDifficultyListbox'),
    snapshotSaveTagsModalConfirm: createElement('snapshotSaveTagsModalConfirm', 'button'),
    snapshotSaveTagsModalCancel: createElement('snapshotSaveTagsModalCancel', 'button'),
    snapshotSaveTagsModalClose: createElement('snapshotSaveTagsModalClose', 'button'),
    snapshotSaveMetadataFields: createElement('snapshotSaveMetadataFields'),
    snapshotSaveName: createElement('snapshotSaveName', 'input'),
    snapshotSaveNameLabel: createElement('snapshotSaveNameLabel', 'span'),
    snapshotSaveSourceComment: createElement('snapshotSaveSourceComment', 'input'),
    snapshotSaveSourceCommentLabel: createElement('snapshotSaveSourceCommentLabel', 'span'),
    snapshotSaveMetricsOptions: createElement('snapshotSaveMetricsOptions'),
    snapshotSaveIncludeCount: createElement('snapshotSaveIncludeCount', 'input'),
    snapshotSaveIncludeCountLabel: createElement('snapshotSaveIncludeCountLabel', 'span'),
    snapshotSaveIncludeReading: createElement('snapshotSaveIncludeReading', 'input'),
    snapshotSaveIncludeReadingLabel: createElement('snapshotSaveIncludeReadingLabel', 'span'),
    snapshotTagManagerModal: createElement('snapshotTagManagerModal'),
    snapshotTagManagerModalBackdrop: createElement('snapshotTagManagerModalBackdrop'),
    snapshotTagManagerModalTitle: createElement('snapshotTagManagerModalTitle'),
    snapshotTagManagerModalMessage: createElement('snapshotTagManagerModalMessage'),
    snapshotTagManagerModalContent: createElement('snapshotTagManagerModalContent'),
    snapshotTagManagerModalDone: createElement('snapshotTagManagerModalDone', 'button'),
    snapshotTagManagerModalClose: createElement('snapshotTagManagerModalClose', 'button'),
  };

  const windowListeners = new Map();
  const documentListeners = new Map();
  const translations = {
    'renderer.snapshots.title': 'Save text snapshot',
    'renderer.snapshots.message': 'Optionally name, describe the source of, and tag this text snapshot before choosing where to save it.',
    'renderer.snapshots.search.placeholder': 'Type to filter options',
    'renderer.snapshots.search.no_results': 'No matching options',
    'renderer.snapshots.search.create': 'Create "{label}"',
    'renderer.snapshots.buttons.manage': 'Manage tags',
    'renderer.snapshots.labels.language': 'Language',
    'renderer.snapshots.labels.name': 'Name (optional)',
    'renderer.snapshots.labels.source_comment': 'Origin (optional)',
    'renderer.snapshots.labels.type': 'Type',
    'renderer.snapshots.labels.difficulty': 'Difficulty',
    'renderer.snapshots.metrics.include_count': 'Include word count',
    'renderer.snapshots.metrics.include_reading': 'Include reading estimate and WPM',
    'renderer.snapshots.placeholders.name': 'Reading',
    'renderer.snapshots.placeholders.source_comment': 'chapter-1.pdf, Unit 1, or imported text',
    'renderer.snapshots.chips.remove_aria': 'Remove tag "{label}"',
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
    'renderer.snapshots.manager.restore_hidden_defaults': 'Restore hidden defaults',
    'renderer.snapshots.manager.empty_category': 'No visible tags',
    'renderer.snapshots.manager.move_up': 'Move {label} up',
    'renderer.snapshots.manager.move_down': 'Move {label} down',
    'renderer.snapshots.manager.hide_default': 'Hide {label}',
    'renderer.snapshots.manager.delete_custom': 'Delete {label}',
    'renderer.snapshots.manager.confirm_hide_default': 'Hide {label} from the visible catalog?',
    'renderer.snapshots.manager.confirm_delete_custom': 'Delete {label} permanently?',
    'renderer.snapshots.manager.validation.empty': 'Enter a tag label.',
    'renderer.snapshots.manager.validation.control_characters': 'Control characters are not allowed.',
    'renderer.snapshots.manager.validation.too_long': 'Tag labels must be {max} characters or shorter.',
    'renderer.snapshots.manager.validation.duplicate': 'That tag already exists in this category.',
    'renderer.snapshots.alerts.catalog_update_error': 'Could not update the tag catalog.',
  };

  let currentStoredPreferences = snapshotTagCatalog.normalizeSnapshotTagPreferences(storedPreferences);
  const savedPreferences = [];
  const confirmCalls = [];
  const notifications = [];
  const diagnostics = [];
  const warningOnceKeys = new Set();
  const registeredPromptNames = [];
  const modalOpeners = new Map();

  const sandbox = {
    window: {
      Notify: {
        activateModalFocus(modal, { initialFocus }) {
          modalOpeners.set(modal, activeElementRef);
          initialFocus.focus();
        },
        deactivateModalFocus(modal) {
          const opener = modalOpeners.get(modal);
          modalOpeners.delete(modal);
          if (opener) opener.focus();
        },
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
          debug(...args) {
            diagnostics.push({ level: 'debug', args });
          },
          info(...args) {
            diagnostics.push({ level: 'info', args });
          },
          warn(...args) {
            diagnostics.push({ level: 'warn', args });
          },
          warnOnce(key, ...args) {
            if (warningOnceKeys.has(key)) return;
            warningOnceKeys.add(key);
            diagnostics.push({ level: 'warnOnce', args: [key, ...args] });
          },
          error(...args) {
            diagnostics.push({ level: 'error', args });
          },
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
      AppConstants: {
        SNAPSHOT_TAG_LABEL_MAX_CHARS: 36,
        SNAPSHOT_NAME_MAX_CHARS: 120,
        SNAPSHOT_SOURCE_COMMENT_MAX_CHARS: 65_536,
      },
      SnapshotTagCatalog: snapshotTagCatalog,
      RendererIcons: {
        applyIconToElement(element, iconName) {
          element.setAttribute('data-tot-icon', iconName);
        },
        createIconButton({ iconName = '', className = '', ariaLabel = '' } = {}) {
          const button = createElement('', 'button');
          button.className = className;
          if (iconName) button.setAttribute('data-tot-icon', iconName);
          if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
          return button;
        },
      },
      electronAPI: includeSnapshotTagPreferencesBridge ? {
        async getSnapshotTagPreferences() {
          if (typeof getSnapshotTagPreferencesImpl === 'function') {
            return getSnapshotTagPreferencesImpl();
          }
          return { ok: true, snapshotTags: currentStoredPreferences };
        },
        async setSnapshotTagPreferences(payload) {
          if (typeof setSnapshotTagPreferencesImpl === 'function') {
            return setSnapshotTagPreferencesImpl(payload);
          }
          currentStoredPreferences = snapshotTagCatalog.normalizeSnapshotTagPreferences(payload);
          savedPreferences.push(JSON.parse(JSON.stringify(currentStoredPreferences)));
          return { ok: true, snapshotTags: currentStoredPreferences };
        },
      } : undefined,
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
      setTimeout(handler) {
        if (typeof handler === 'function') handler();
        return 0;
      },
      clearTimeout() {},
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
  const comboboxSource = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/combobox.js'),
    'utf8'
  );
  vm.runInContext(comboboxSource, sandbox, { filename: 'public/js/combobox.js' });
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/snapshot_save_tags_modal.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/snapshot_save_tags_modal.js' });

  function syncComboboxElementAliases() {
    const mappings = [
      ['Language', elements.snapshotSaveTagsLanguagePicker],
      ['Type', elements.snapshotSaveTagsTypePicker],
      ['Difficulty', elements.snapshotSaveTagsDifficultyPicker],
    ];
    mappings.forEach(([name, control]) => {
      elements[`snapshotSaveTags${name}Input`] = control._children[0];
      elements[`snapshotSaveTags${name}Listbox`] = control._children[1];
    });
  }

  function getOptionTexts(listboxId) {
    syncComboboxElementAliases();
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
    translations,
    applyTranslations: sandbox.window.SnapshotSaveTagsModal.applyTranslations,
    prompt(...args) {
      const result = sandbox.window.Notify.promptSnapshotSave(...args);
      syncComboboxElementAliases();
      return result;
    },
    promptTags(...args) {
      const result = sandbox.window.Notify.promptSnapshotTags(...args);
      syncComboboxElementAliases();
      return result;
    },
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
    diagnostics,
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
    'promptSnapshotSave',
    'promptSnapshotTags',
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
  assert.equal(harness.elements.snapshotSaveSourceCommentLabel.textContent, 'Origin (optional)');
  assert.equal(harness.elements.snapshotSaveName.placeholder, 'Reading');
  assert.equal(
    harness.elements.snapshotSaveSourceComment.placeholder,
    'chapter-1.pdf, Unit 1, or imported text'
  );
  assert.equal(harness.elements.snapshotSaveTagsManageButton.textContent, 'Manage tags');
  assert.equal(harness.elements.snapshotSaveTagsManageButton.title, undefined);
  assert.equal(
    harness.elements.snapshotSaveTagsManageButton.getAttribute('aria-label'),
    null
  );
  assert.equal(harness.elements.snapshotSaveIncludeCountLabel.textContent, 'Include word count');
  assert.equal(
    harness.elements.snapshotSaveIncludeReadingLabel.textContent,
    'Include reading estimate and WPM'
  );

  harness.elements.snapshotSaveTagsModalCancel.dispatch('click');
  const result = await promptPromise;
  assert.equal(result, null);
});

test('snapshot tag prompt stays usable with default tags after a non-ok preference read', async () => {
  const harness = createHarness({
    getSnapshotTagPreferencesImpl() {
      return { ok: false, error: 'storage unavailable' };
    },
  });

  const promptPromise = harness.promptTags({ initialTags: null });
  await flushMicrotasks();

  harness.elements.snapshotSaveTagsModalConfirm.dispatch('click');
  assert.deepEqual(JSON.parse(JSON.stringify(await promptPromise)), { tags: {} });
});

test('missing snapshot-tag preference bridge warns for each prompt', async () => {
  const harness = createHarness({ includeSnapshotTagPreferencesBridge: false });

  const firstPrompt = harness.promptTags({ initialTags: null });
  await flushMicrotasks();
  harness.elements.snapshotSaveTagsModalCancel.dispatch('click');
  await firstPrompt;

  const secondPrompt = harness.promptTags({ initialTags: null });
  await flushMicrotasks();
  harness.elements.snapshotSaveTagsModalCancel.dispatch('click');
  await secondPrompt;

  const bridgeWarnings = harness.diagnostics.filter(({ level, args }) => {
    return level === 'warn'
      && args[0] === 'Snapshot-tag preference bridge unavailable; using empty preferences.';
  });
  assert.equal(bridgeWarnings.length, 2);
});

test('snapshot save modal returns optional name and source-comment fields', async () => {
  const harness = createHarness();

  const promptPromise = harness.prompt({ initialTags: null });
  await flushMicrotasks();

  assert.equal(harness.elements.snapshotSaveMetadataFields.hidden, false);
  assert.equal(harness.elements.snapshotSaveMetricsOptions.hidden, false);
  assert.equal(harness.elements.snapshotSaveName.maxLength, 120);
  assert.equal(harness.elements.snapshotSaveSourceComment.maxLength, 65_536);

  harness.elements.snapshotSaveName.value = 'Reading';
  harness.elements.snapshotSaveSourceComment.value = 'chapter-1.pdf, Unit 1';
  harness.elements.snapshotSaveTagsModalConfirm.dispatch('click');

  const result = await promptPromise;
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    tags: {},
    includeCount: true,
    includeReading: true,
    name: 'Reading',
    sourceComment: 'chapter-1.pdf, Unit 1',
  });
});

test('snapshot save translation refresh preserves the active metadata, metrics, and tag draft', async () => {
  const harness = createHarness();

  const promptPromise = harness.prompt({ initialTags: { language: ['es'] } });
  await flushMicrotasks();
  harness.elements.snapshotSaveName.value = 'Lectura';
  harness.elements.snapshotSaveSourceComment.value = 'capitulo-1.pdf';
  harness.elements.snapshotSaveIncludeCount.checked = false;
  harness.elements.snapshotSaveIncludeCount.dispatch('change');
  harness.translations['renderer.snapshots.title'] = 'Guardar instantánea de texto';
  harness.translations['renderer.snapshots.labels.name'] = 'Nombre opcional';

  harness.applyTranslations();
  harness.getOptionTexts('snapshotSaveTagsLanguageListbox');

  assert.equal(harness.elements.snapshotSaveTagsModal.getAttribute('aria-hidden'), 'false');
  assert.equal(harness.elements.snapshotSaveTagsModalTitle.textContent, 'Guardar instantánea de texto');
  assert.equal(harness.elements.snapshotSaveNameLabel.textContent, 'Nombre opcional');
  assert.equal(harness.elements.snapshotSaveName.value, 'Lectura');
  assert.equal(harness.elements.snapshotSaveSourceComment.value, 'capitulo-1.pdf');
  assert.equal(harness.elements.snapshotSaveIncludeCount.checked, false);
  assert.equal(harness.elements.snapshotSaveIncludeReading.checked, false);
  assert.equal(harness.elements.snapshotSaveTagsLanguageInput.value, '');
  assert.equal(
    harness.elements.snapshotSaveTagsLanguageSelected._children[0]._children[0].textContent,
    'Spanish'
  );

  harness.elements.snapshotSaveTagsModalConfirm.dispatch('click');
  const result = await promptPromise;
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    tags: { language: ['es'] },
    includeCount: false,
    includeReading: false,
    name: 'Lectura',
    sourceComment: 'capitulo-1.pdf',
  });
});

test('snapshot tags prompt hides save-only metadata and metric controls', async () => {
  const harness = createHarness();

  const promptPromise = harness.promptTags({ initialTags: null });
  await flushMicrotasks();

  assert.equal(harness.elements.snapshotSaveMetadataFields.hidden, true);
  assert.equal(harness.elements.snapshotSaveMetricsOptions.hidden, true);

  harness.elements.snapshotSaveTagsModalConfirm.dispatch('click');
  const result = await promptPromise;
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { tags: {} });
});

test('snapshot tag prompts reset the modal panel scroll position on each opening', async () => {
  const harness = createHarness();
  const panel = harness.elements.snapshotSaveTagsModalPanel;

  const firstSavePrompt = harness.prompt({ initialTags: null });
  await flushMicrotasks();
  panel.scrollTop = 72;
  assert.equal(panel.scrollTop, 72);
  harness.elements.snapshotSaveTagsModalCancel.dispatch('click');
  await firstSavePrompt;

  const reopenedSavePrompt = harness.prompt({ initialTags: null });
  await flushMicrotasks();
  assert.equal(panel.scrollTop, 0);
  panel.scrollTop = 48;
  harness.elements.snapshotSaveTagsModalCancel.dispatch('click');
  await reopenedSavePrompt;

  const tagOnlyPrompt = harness.promptTags({ initialTags: null });
  await flushMicrotasks();
  assert.equal(panel.scrollTop, 0);
  harness.elements.snapshotSaveTagsModalCancel.dispatch('click');
  await tagOnlyPrompt;
});

test('snapshot save tags modal creates and selects a custom tag from the inline create option', async () => {
  const harness = createHarness();

  const promptPromise = harness.prompt({ initialTags: null });
  await flushMicrotasks();
  const typeInput = harness.elements.snapshotSaveTagsTypeInput;
  typeInput.focus();
  typeInput.value = 'Short story';
  typeInput.dispatch('input');

  assert.deepEqual(
    harness.getOptionTexts('snapshotSaveTagsTypeListbox'),
    ['Create "Short story"']
  );
  const panel = harness.elements.snapshotSaveTagsModalPanel;
  panel.scrollTop = 0;
  panel.getBoundingClientRect = () => ({ bottom: 100 });
  harness.elements.snapshotSaveTagsTypeListbox.getBoundingClientRect = () => ({ bottom: 140 });

  harness.elements.snapshotSaveTagsTypeListbox._children[0].dispatch('click');
  await flushMicrotasks();
  await flushMicrotasks();

  const customValue = snapshotTagCatalog.buildCustomTagValue('type', 'Short story');
  assert.equal(typeInput.value, '');
  assert.equal(typeInput.getAttribute('aria-expanded'), 'true');
  assert.equal(harness.getActiveElement(), typeInput);
  assert.equal(panel.scrollTop, 40);
  assert.deepEqual(
    harness.getOptionTexts('snapshotSaveTagsTypeListbox'),
    ['Ficción', 'No ficción']
  );
  const customChip = harness.elements.snapshotSaveTagsTypeSelected._children[0]._children[0];
  assert.equal(customChip.textContent, 'Short story');
  assert.equal(customChip.getAttribute('aria-label'), 'Remove tag "Short story"');
  assert.equal(customChip.getAttribute('data-tot-icon'), 'close');
  assert.equal(harness.getStoredPreferences().type.order.at(-1), customValue);

  harness.elements.snapshotSaveTagsModalConfirm.dispatch('click');
  const result = await promptPromise;
  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    {
      tags: { type: [customValue] },
      includeCount: true,
      includeReading: true,
    }
  );
});

test('snapshot save tags modal keeps each selector open for consecutive selections and removes chips individually', async () => {
  const harness = createHarness();

  const promptPromise = harness.promptTags({ initialTags: {} });
  await flushMicrotasks();
  const input = harness.elements.snapshotSaveTagsLanguageInput;
  input.dispatch('click');
  let englishOption = harness.elements.snapshotSaveTagsLanguageListbox._children.find(
    (option) => option.textContent === 'English'
  );
  const panel = harness.elements.snapshotSaveTagsModalPanel;
  panel.scrollTop = 0;
  panel.getBoundingClientRect = () => ({ bottom: 100 });
  harness.elements.snapshotSaveTagsLanguageListbox.getBoundingClientRect = () => ({ bottom: 140 });
  englishOption.dispatch('click');

  assert.equal(input.value, '');
  assert.equal(input.getAttribute('aria-expanded'), 'true');
  assert.equal(panel.scrollTop, 40);
  assert.equal(harness.elements.snapshotSaveTagsLanguageSelected._children.length, 1);
  assert.equal(harness.getOptionTexts('snapshotSaveTagsLanguageListbox').includes('English'), false);

  const spanishOption = harness.elements.snapshotSaveTagsLanguageListbox._children.find(
    (option) => option.textContent === 'Spanish'
  );
  spanishOption.dispatch('click');

  assert.equal(harness.elements.snapshotSaveTagsLanguageSelected._children.length, 2);
  const englishChip = harness.elements.snapshotSaveTagsLanguageSelected._children[0]._children[0];
  englishChip.dispatch('click');

  assert.equal(harness.elements.snapshotSaveTagsLanguageSelected._children.length, 1);
  assert.equal(harness.getActiveElement(), input);
  assert.equal(harness.getOptionTexts('snapshotSaveTagsLanguageListbox').includes('English'), true);

  harness.elements.snapshotSaveTagsModalConfirm.dispatch('click');
  const result = await promptPromise;
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { tags: { language: ['es'] } });
});

test('snapshot save tags modal preserves a selected tag absent from the visible catalog as a removable chip', async () => {
  const harness = createHarness();
  const missingCustomValue = 'custom:type:removed-tag';

  const promptPromise = harness.promptTags({ initialTags: { type: [missingCustomValue] } });
  await flushMicrotasks();
  const chip = harness.elements.snapshotSaveTagsTypeSelected._children[0]._children[0];

  assert.equal(chip.textContent, 'removed tag');
  assert.equal(chip.getAttribute('aria-label'), 'Remove tag "removed tag"');
  chip.dispatch('click');

  harness.elements.snapshotSaveTagsModalConfirm.dispatch('click');
  const result = await promptPromise;
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { tags: {} });
});

test('inline creation can restore an assigned absent custom tag without duplicating its draft value', async () => {
  const harness = createHarness();
  const customValue = 'custom:type:removed-entry';
  const promptPromise = harness.promptTags({ initialTags: { type: [customValue] } });
  await flushMicrotasks();

  const input = harness.elements.snapshotSaveTagsTypeInput;
  input.value = 'Removed entry';
  input.dispatch('input');
  assert.deepEqual(harness.getOptionTexts('snapshotSaveTagsTypeListbox'), ['Create "Removed entry"']);
  harness.elements.snapshotSaveTagsTypeListbox._children[0].dispatch('click');
  await flushMicrotasks();
  await flushMicrotasks();

  assert.equal(harness.elements.snapshotSaveTagsTypeSelected._children.length, 1);
  assert.equal(harness.getStoredPreferences().type.order.includes(customValue), true);

  harness.elements.snapshotSaveTagsModalConfirm.dispatch('click');
  const result = await promptPromise;
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { tags: { type: [customValue] } });
});

test('snapshot save tags modal serializes inline catalog saves and honors the latest deferred action', async () => {
  const saves = [];
  const harness = createHarness({
    setSnapshotTagPreferencesImpl(payload) {
      return new Promise((resolve) => {
        saves.push({ payload, resolve });
      });
    },
  });

  const promptPromise = harness.promptTags({ initialTags: {} });
  await flushMicrotasks();
  const input = harness.elements.snapshotSaveTagsTypeInput;
  input.value = 'Essay';
  input.dispatch('input');
  harness.elements.snapshotSaveTagsTypeListbox._children[0].dispatch('click');
  await flushMicrotasks();
  assert.equal(saves.length, 1);

  input.value = 'Article';
  input.dispatch('input');
  harness.elements.snapshotSaveTagsTypeListbox._children[0].dispatch('click');
  await flushMicrotasks();
  assert.equal(saves.length, 1);

  harness.elements.snapshotSaveTagsModalConfirm.dispatch('click');
  harness.elements.snapshotSaveTagsModalCancel.dispatch('click');
  saves[0].resolve({ ok: true, snapshotTags: saves[0].payload });
  await flushMicrotasks();
  await flushMicrotasks();
  assert.equal(saves.length, 2);
  saves[1].resolve({ ok: true, snapshotTags: saves[1].payload });

  assert.equal(await promptPromise, null);
});

test('a completed inline save does not reclaim focus or overwrite another category draft', async () => {
  const saves = [];
  const harness = createHarness({
    setSnapshotTagPreferencesImpl(payload) {
      return new Promise((resolve) => {
        saves.push({ payload, resolve });
      });
    },
  });

  const promptPromise = harness.promptTags({ initialTags: {} });
  await flushMicrotasks();
  const typeInput = harness.elements.snapshotSaveTagsTypeInput;
  typeInput.focus();
  typeInput.value = 'Essay';
  typeInput.dispatch('input');
  harness.elements.snapshotSaveTagsTypeListbox._children[0].dispatch('click');
  await flushMicrotasks();
  assert.equal(saves.length, 1);

  const languageInput = harness.elements.snapshotSaveTagsLanguageInput;
  languageInput.focus();
  languageInput.value = 'Span';
  languageInput.dispatch('input');
  typeInput.dispatch('keydown', { key: 'Escape' });
  saves[0].resolve({ ok: true, snapshotTags: saves[0].payload });
  await flushMicrotasks();
  await flushMicrotasks();

  assert.equal(harness.getActiveElement(), languageInput);
  assert.equal(languageInput.value, 'Span');
  assert.equal(typeInput.getAttribute('aria-expanded'), 'false');
  assert.equal(harness.elements.snapshotSaveTagsTypeSelected._children.length, 1);

  harness.elements.snapshotSaveTagsModalCancel.dispatch('click');
  assert.equal(await promptPromise, null);
});

test('a failed inline catalog save prevents a deferred confirm from committing the tag draft', async () => {
  const harness = createHarness({
    async setSnapshotTagPreferencesImpl() {
      return { ok: false, code: 'WRITE_FAILED' };
    },
  });

  const promptPromise = harness.promptTags({ initialTags: {} });
  await flushMicrotasks();
  const input = harness.elements.snapshotSaveTagsTypeInput;
  input.value = 'Essay';
  input.dispatch('input');
  harness.elements.snapshotSaveTagsTypeListbox._children[0].dispatch('click');
  harness.elements.snapshotSaveTagsModalConfirm.dispatch('click');
  await flushMicrotasks();
  await flushMicrotasks();

  assert.equal(harness.elements.snapshotSaveTagsModal.getAttribute('aria-hidden'), 'false');
  assert.equal(harness.elements.snapshotSaveTagsTypeSelected._children.length, 0);

  harness.elements.snapshotSaveTagsModalCancel.dispatch('click');
  assert.equal(await promptPromise, null);
});

test('a repeated deferred confirm cannot clear an earlier inline-save failure', async () => {
  const saves = [];
  const harness = createHarness({
    setSnapshotTagPreferencesImpl(payload) {
      return new Promise((resolve) => {
        saves.push({ payload, resolve });
      });
    },
  });

  const promptPromise = harness.promptTags({ initialTags: {} });
  await flushMicrotasks();
  const input = harness.elements.snapshotSaveTagsTypeInput;
  input.value = 'Essay';
  input.dispatch('input');
  harness.elements.snapshotSaveTagsTypeListbox._children[0].dispatch('click');
  await flushMicrotasks();
  assert.equal(saves.length, 1);

  input.value = 'Article';
  input.dispatch('input');
  harness.elements.snapshotSaveTagsTypeListbox._children[0].dispatch('click');
  await flushMicrotasks();
  assert.equal(saves.length, 1);

  harness.elements.snapshotSaveTagsModalConfirm.dispatch('click');
  saves[0].resolve({ ok: false, code: 'WRITE_FAILED' });
  await flushMicrotasks();
  await flushMicrotasks();
  assert.equal(saves.length, 2);

  harness.elements.snapshotSaveTagsModalConfirm.dispatch('click');
  saves[1].resolve({ ok: true, snapshotTags: saves[1].payload });
  await flushMicrotasks();
  await flushMicrotasks();

  assert.equal(harness.elements.snapshotSaveTagsModal.getAttribute('aria-hidden'), 'false');
  assert.equal(harness.elements.snapshotSaveTagsTypeSelected._children.length, 1);

  harness.elements.snapshotSaveTagsModalCancel.dispatch('click');
  assert.equal(await promptPromise, null);
});

test('snapshot save metrics choices default to both selected and enforce count before reading', async () => {
  const harness = createHarness();

  const promptPromise = harness.prompt({ initialTags: null });
  await flushMicrotasks();

  assert.equal(harness.elements.snapshotSaveIncludeCount.checked, true);
  assert.equal(harness.elements.snapshotSaveIncludeReading.checked, true);
  assert.equal(harness.elements.snapshotSaveIncludeReading.disabled, false);

  harness.elements.snapshotSaveIncludeCount.checked = false;
  harness.elements.snapshotSaveIncludeCount.dispatch('change');
  assert.equal(harness.elements.snapshotSaveIncludeReading.checked, false);
  assert.equal(harness.elements.snapshotSaveIncludeReading.disabled, true);

  harness.elements.snapshotSaveIncludeCount.checked = true;
  harness.elements.snapshotSaveIncludeCount.dispatch('change');
  assert.equal(harness.elements.snapshotSaveIncludeReading.checked, false);
  assert.equal(harness.elements.snapshotSaveIncludeReading.disabled, false);

  harness.elements.snapshotSaveTagsModalConfirm.dispatch('click');
  const result = await promptPromise;
  assert.deepEqual(JSON.parse(JSON.stringify(result)), {
    tags: {},
    includeCount: true,
    includeReading: false,
  });
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

test('snapshot tag manager translation refresh retains its draft and uses the modal fallback only for replaced focus', async () => {
  const harness = createHarness();

  const managerPromise = harness.promptManager({ initialPreferences: null });
  await flushMicrotasks();
  harness.findInManagerByText('New tag').dispatch('click');
  await flushMicrotasks();
  let draftInput = harness.findInManagerByClassName('snapshot-tag-manager-draft-input');
  assert.ok(draftInput);
  draftInput.value = 'Whodunit';
  draftInput.dispatch('input');
  harness.elements.snapshotTagManagerModalDone.focus();
  harness.translations['renderer.snapshots.manager.new_tag_placeholder'] = 'Escribe una etiqueta nueva';

  harness.applyTranslations();
  draftInput = harness.findInManagerByClassName('snapshot-tag-manager-draft-input');

  assert.equal(harness.elements.snapshotTagManagerModal.getAttribute('aria-hidden'), 'false');
  assert.equal(draftInput.value, 'Whodunit');
  assert.equal(draftInput.placeholder, 'Escribe una etiqueta nueva');
  assert.equal(harness.getActiveElement(), harness.elements.snapshotTagManagerModalDone);

  draftInput.focus();
  harness.applyTranslations();
  assert.equal(harness.getActiveElement(), harness.elements.snapshotTagManagerModalClose);

  harness.elements.snapshotTagManagerModalDone.dispatch('click');
  await managerPromise;
});

test('snapshot tag manager renders the restore action as a reset icon with its hidden-default count', async () => {
  const storedPreferences = snapshotTagCatalog.createEmptySnapshotTagPreferences();
  storedPreferences.language.hiddenDefaults = ['en'];
  const harness = createHarness({ storedPreferences });

  const managerPromise = harness.promptManager({ initialPreferences: null });
  await flushMicrotasks();

  assert.equal(harness.findInManagerByText('New tag').className, 'btn-standard');
  assert.equal(harness.findInManagerByText('Sort alphabetically').className, 'btn-standard');
  const restoreButton = harness.findInManagerByAriaLabel('Restore hidden defaults (1)');
  assert.ok(restoreButton);
  assert.equal(restoreButton.className, 'btn-standard snapshot-tag-manager-restore-button');
  assert.equal(restoreButton.getAttribute('data-tot-icon'), 'reset-small');
  assert.equal(
    restoreButton.getAttribute('data-tot-tooltip'),
    'Restore hidden defaults'
  );
  assert.equal(restoreButton.title, undefined);
  assert.equal(restoreButton.textContent, '(1)');

  restoreButton.dispatch('click');
  await flushMicrotasks();
  assert.equal(harness.getStoredPreferences().language.hiddenDefaults.includes('en'), false);

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
  assert.equal(draftInput.maxLength, 36);

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

test('snapshot tag manager reports the shared custom-label cap', async () => {
  const harness = createHarness();

  const managerPromise = harness.promptManager({ initialPreferences: null });
  await flushMicrotasks();
  harness.findInManagerByText('New tag').dispatch('click');
  await flushMicrotasks();

  const draftInput = harness.findInManagerByClassName('snapshot-tag-manager-draft-input');
  assert.ok(draftInput);
  draftInput.value = 'a'.repeat(37);
  draftInput.dispatch('input');
  harness.findInManagerByText('Add tag').dispatch('click');
  await flushMicrotasks();

  assert.equal(
    harness.findInManagerByClassName('snapshot-tag-manager-validation').textContent,
    'Tag labels must be 36 characters or shorter.'
  );

  harness.elements.snapshotTagManagerModalDone.dispatch('click');
  await managerPromise;
});
