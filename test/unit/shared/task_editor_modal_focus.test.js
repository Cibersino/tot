'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHarness() {
  let activeElement = null;
  let onInit = null;
  const modalOpeners = new Map();
  const documentListeners = new Map();

  function createElement(id = '', tagName = 'div') {
    const attributes = {};
    const children = [];
    const listeners = new Map();
    const classes = new Set();
    let textContent = '';

    return {
      id,
      tagName,
      dataset: {},
      style: {},
      hidden: false,
      disabled: false,
      value: '',
      title: '',
      type: '',
      maxLength: 0,
      parentNode: null,
      fallbackFocus: null,
      get _children() {
        return children;
      },
      get className() {
        return [...classes].join(' ');
      },
      set className(value) {
        classes.clear();
        String(value || '').split(/\s+/).filter(Boolean).forEach((name) => classes.add(name));
      },
      classList: {
        add(...names) { names.forEach((name) => classes.add(name)); },
        remove(...names) { names.forEach((name) => classes.delete(name)); },
        contains(name) { return classes.has(name); },
      },
      get textContent() {
        if (children.length) return children.map((child) => child.textContent).join('');
        return textContent;
      },
      set textContent(value) {
        textContent = String(value);
        children.splice(0, children.length);
      },
      set innerHTML(value) {
        textContent = String(value || '');
        children.splice(0, children.length);
      },
      appendChild(child) {
        child.parentNode = this;
        children.push(child);
        return child;
      },
      addEventListener(type, handler) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(handler);
      },
      dispatch(type, event = {}) {
        const safeEvent = {
          target: this,
          preventDefault() {},
          ...event,
        };
        (listeners.get(type) || []).forEach((handler) => handler(safeEvent));
      },
      setAttribute(name, value) {
        attributes[name] = String(value);
      },
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(attributes, name)
          ? attributes[name]
          : null;
      },
      querySelector(selector) {
        if (selector === '.modal-header button') return this.fallbackFocus;
        return null;
      },
      querySelectorAll() {
        return [];
      },
      focus() {
        activeElement = this;
      },
      blur() {
        if (activeElement === this) activeElement = null;
      },
      getBoundingClientRect() {
        return { width: 100, top: 0 };
      },
    };
  }

  const ids = [
    'taskNameLabel', 'taskNameInput', 'btnTaskSave', 'btnTaskDelete',
    'taskSummaryTotalLabel', 'taskSummaryTotalValue', 'taskSummaryLeftLabel',
    'taskSummaryLeftValue', 'btnTaskAddRow', 'btnTaskAddFiles', 'btnTaskLoadLibrary',
    'taskTableBody', 'thTexto', 'thTiempo', 'thPercent', 'thFalta', 'thEnlace',
    'thComentario', 'thAcciones', 'taskTable', 'taskColGroup',
    'commentModal', 'commentBackdrop', 'commentClose', 'commentCancel', 'commentSave',
    'commentInput', 'commentTitle', 'commentSnapshotSelect', 'commentSnapshotClear',
    'commentSnapshotPath', 'libraryModal', 'libraryBackdrop', 'libraryClose',
    'libraryList', 'libraryEmpty', 'libraryTitle', 'librarySearchLabel',
    'librarySearchInput', 'includeCommentModal', 'includeCommentBackdrop',
    'includeCommentClose', 'includeCommentYes', 'includeCommentNo',
    'includeCommentCancel', 'includeCommentTitle', 'includeCommentText',
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, createElement(id)]));
  elements.commentModal.fallbackFocus = elements.commentClose;
  elements.libraryModal.fallbackFocus = elements.libraryClose;
  elements.includeCommentModal.fallbackFocus = elements.includeCommentClose;
  elements.commentModal.setAttribute('aria-hidden', 'true');
  elements.libraryModal.setAttribute('aria-hidden', 'true');
  elements.includeCommentModal.setAttribute('aria-hidden', 'true');

  const body = createElement('body', 'body');
  const document = {
    body,
    get activeElement() {
      return activeElement;
    },
    getElementById(id) {
      return elements[id] || null;
    },
    createElement(tagName) {
      return createElement('', tagName);
    },
    addEventListener(type, handler) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(handler);
    },
  };

  const window = {
    getLogger() {
      return {
        debug() {}, info() {}, warn() {}, warnOnce() {}, error() {}, errorOnce() {},
      };
    },
    AppConstants: {
      DEFAULT_LANG: 'en',
      TASK_NAME_MAX_CHARS: 100,
      TASK_ROW_TEXT_MAX_CHARS: 1000,
      TASK_ROW_LINK_MAX_CHARS: 1000,
    },
    RendererI18n: {
      async loadRendererTranslations() {},
      tRenderer(key) { return key; },
      applyWindowLanguageAttributes() {},
    },
    RendererIcons: {
      createIconButton({ iconName = '', className = '', title = '', ariaLabel = '' } = {}) {
        const button = createElement('', 'button');
        button.className = className;
        button.title = title;
        button.setAttribute('aria-label', ariaLabel);
        button.setAttribute('data-tot-icon', iconName);
        return button;
      },
      applyIconToElement(element, iconName) {
        element.setAttribute('data-tot-icon', iconName);
      },
    },
    Notify: {
      activateModalFocus(modal, { initialFocus }) {
        modalOpeners.set(modal, activeElement);
        initialFocus.focus();
      },
      deactivateModalFocus(modal) {
        const opener = modalOpeners.get(modal);
        modalOpeners.delete(modal);
        if (opener) opener.focus();
      },
      confirmMain() { return true; },
      notifyEditor() {},
    },
    taskEditorAPI: {
      setDirtyState() {},
      onInit(handler) { onInit = handler; },
      onRequestClose() {},
      onSettingsChanged() {},
      async getSettings() { return { language: 'en' }; },
      async getColumnWidths() { return { ok: true, widths: {} }; },
      async saveColumnWidths() { return { ok: true }; },
      async listLibrary() { return { ok: true, items: [] }; },
    },
  };

  const sandbox = { window, document, console, setTimeout, clearTimeout };
  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/task_editor.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/task_editor.js' });

  function findByIcon(iconName) {
    const pending = elements.taskTableBody._children.slice();
    while (pending.length) {
      const candidate = pending.shift();
      if (candidate.getAttribute('data-tot-icon') === iconName) return candidate;
      pending.push(...candidate._children);
    }
    return null;
  }

  return {
    elements,
    findByIcon,
    getActiveElement() { return activeElement; },
    initializeRow() {
      onInit({
        sourcePath: 'task.json',
        task: {
          meta: { name: 'Task' },
          rows: [{
            texto: 'Text',
            tiempoSeconds: 60,
            percentComplete: 0,
            enlace: '',
            comentario: 'Comment',
            snapshotRelPath: '',
          }],
        },
      });
    },
  };
}

test('task-editor modals use their reviewed initial targets and restore each opener', () => {
  const harness = createHarness();
  harness.initializeRow();

  const commentOpener = harness.findByIcon('task-comment');
  assert.ok(commentOpener);
  commentOpener.focus();
  commentOpener.dispatch('click');
  assert.equal(harness.getActiveElement(), harness.elements.commentSnapshotSelect);
  harness.elements.commentCancel.dispatch('click');
  assert.equal(harness.getActiveElement(), commentOpener);

  const librarySaveOpener = harness.findByIcon('task-row-save');
  assert.ok(librarySaveOpener);
  librarySaveOpener.focus();
  librarySaveOpener.dispatch('click');
  assert.equal(harness.getActiveElement(), harness.elements.includeCommentYes);
  harness.elements.includeCommentCancel.dispatch('click');
  assert.equal(harness.getActiveElement(), librarySaveOpener);

  harness.elements.btnTaskLoadLibrary.focus();
  harness.elements.btnTaskLoadLibrary.dispatch('click');
  assert.equal(harness.getActiveElement(), harness.elements.librarySearchInput);
  harness.elements.libraryClose.dispatch('click');
  assert.equal(harness.getActiveElement(), harness.elements.btnTaskLoadLibrary);
});
