'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createStopwatchTimeUtils } = require('../../../public/js/lib/stopwatch_time_core');

function createHarness() {
  let activeElement = null;
  let onInit = null;
  let resolveTranslationsLoaded = null;
  const translationsLoaded = new Promise((resolve) => {
    resolveTranslationsLoaded = resolve;
  });
  const modalOpeners = new Map();
  const documentListeners = new Map();
  const notifications = [];

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
        toggle(name, force) {
          if (force) classes.add(name);
          else classes.delete(name);
        },
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
  const taskTableWrap = createElement('taskTableWrap');
  const document = {
    body,
    get activeElement() {
      return activeElement;
    },
    getElementById(id) {
      return elements[id] || null;
    },
    querySelector(selector) {
      return selector === '.task-table-wrap' ? taskTableWrap : null;
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
      TASK_ROW_COMMENT_MAX_CHARS: 1200,
      TASK_ROW_LINK_MAX_CHARS: 1000,
    },
    StopwatchTimeCore: {
      createStopwatchTimeUtils,
    },
    RendererI18n: {
      async loadRendererTranslations() { resolveTranslationsLoaded(); },
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
      notifyEditor(key) { notifications.push(key); },
    },
    TaskEditorColumnLayout: {
      createController() {
        return {
          async initialize() {},
          cancelActiveResize() {},
        };
      },
    },
    taskEditorAPI: {
      setDirtyState() {},
      onInit(handler) { onInit = handler; },
      onRequestClose() {},
      onSettingsChanged() {},
      async getSettings() { return { language: 'en' }; },
      async saveTaskList() { return { ok: true }; },
      async deleteTaskList() { return { ok: true }; },
      async getColumnLayout() { return { ok: true, record: null }; },
      async saveColumnLayout() { return { ok: true }; },
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

  function findInputByHeaderId(headerId) {
    const pending = elements.taskTableBody._children.slice();
    while (pending.length) {
      const candidate = pending.shift();
      if (candidate.tagName === 'input' && candidate.getAttribute('aria-labelledby') === headerId) {
        return candidate;
      }
      pending.push(...candidate._children);
    }
    return null;
  }

  return {
    elements,
    findByIcon,
    findInputByHeaderId,
    notifications,
    getActiveElement() { return activeElement; },
    async waitForTranslations() {
      await translationsLoaded;
      for (let attempt = 0; attempt < 10 && !elements.commentInput.getAttribute('placeholder'); attempt += 1) {
        await Promise.resolve();
      }
    },
    initializeTask(payload) {
      onInit(payload);
    },
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

test('Task Editor localizes and limits the comment field', async () => {
  const harness = createHarness();
  await harness.waitForTranslations();

  assert.equal(
    harness.elements.commentInput.getAttribute('placeholder'),
    'renderer.tasks.comentario_modal.comment_placeholder'
  );
  assert.equal(harness.elements.commentInput.maxLength, 1200);
});

test('Task Editor assigns localized tooltips only to abbreviated time headers', async () => {
  const harness = createHarness();
  await harness.waitForTranslations();

  assert.equal(harness.elements.thTexto.title, '');
  assert.equal(harness.elements.thTiempo.title, 'renderer.tasks.columns.header_tooltips.tiempo');
  assert.equal(harness.elements.thPercent.title, 'renderer.tasks.columns.header_tooltips.percent');
  assert.equal(harness.elements.thFalta.title, 'renderer.tasks.columns.header_tooltips.falta');
  assert.equal(harness.elements.thEnlace.title, '');
  assert.equal(harness.elements.thComentario.title, '');
  assert.equal(harness.elements.thAcciones.title, '');
});

test('every shipped locale defines the Task Editor time header tooltips', () => {
  const languages = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../i18n/languages.json'), 'utf8'));

  languages.forEach(({ tag }) => {
    const rendererPath = path.resolve(__dirname, `../../../i18n/${tag.toLowerCase()}/renderer.json`);
    const renderer = JSON.parse(fs.readFileSync(rendererPath, 'utf8'));
    const tooltips = renderer.renderer.tasks.columns.header_tooltips;

    assert.equal(typeof tooltips.tiempo, 'string', `${tag} missing time tooltip`);
    assert.equal(typeof tooltips.percent, 'string', `${tag} missing percentage tooltip`);
    assert.equal(typeof tooltips.falta, 'string', `${tag} missing remaining-time tooltip`);
    assert.ok(tooltips.tiempo.trim(), `${tag} has an empty time tooltip`);
    assert.ok(tooltips.percent.trim(), `${tag} has an empty percentage tooltip`);
    assert.ok(tooltips.falta.trim(), `${tag} has an empty remaining-time tooltip`);
  });
});

test('every shipped locale defines the Task Editor comment-or-snapshot button tooltip', () => {
  const languages = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../i18n/languages.json'), 'utf8'));
  const expectedBaseCopy = {
    en: 'Add a comment or a text snapshot',
    es: 'Agregar un comentario o un snapshot de texto',
  };

  languages.forEach(({ tag }) => {
    const rendererPath = path.resolve(__dirname, `../../../i18n/${tag.toLowerCase()}/renderer.json`);
    const renderer = JSON.parse(fs.readFileSync(rendererPath, 'utf8'));
    const tooltip = renderer.renderer.tasks.columns.tooltips.comment;

    assert.equal(typeof tooltip, 'string', `${tag} missing comment-or-snapshot tooltip`);
    assert.ok(tooltip.trim(), `${tag} has an empty comment-or-snapshot tooltip`);
    if (expectedBaseCopy[tag]) assert.equal(tooltip, expectedBaseCopy[tag]);
  });
});

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

test('Task Editor time and percentage inputs show invalid chrome while editing and restore canonical values', () => {
  const harness = createHarness();
  harness.initializeRow();

  const readingInput = harness.findInputByHeaderId('thTexto');
  const timeInput = harness.findInputByHeaderId('thTiempo');
  const linkInput = harness.findInputByHeaderId('thEnlace');
  assert.ok(readingInput);
  assert.ok(timeInput);
  assert.ok(linkInput);
  assert.equal(readingInput.getAttribute('aria-label'), null);
  assert.equal(timeInput.getAttribute('aria-label'), null);
  assert.equal(linkInput.getAttribute('aria-label'), null);
  timeInput.value = '1:2:03';
  timeInput.dispatch('input');
  assert.equal(timeInput.classList.contains('is-invalid'), true);
  assert.equal(timeInput.getAttribute('aria-invalid'), 'true');
  timeInput.dispatch('blur');
  assert.equal(timeInput.value, '00:01:00');
  assert.equal(timeInput.classList.contains('is-invalid'), false);
  assert.equal(timeInput.getAttribute('aria-invalid'), 'false');

  timeInput.value = '1:02:03';
  timeInput.dispatch('input');
  assert.equal(timeInput.classList.contains('is-invalid'), false);
  timeInput.dispatch('blur');
  assert.equal(timeInput.value, '01:02:03');

  const percentInput = harness.findInputByHeaderId('thPercent');
  assert.ok(percentInput);
  assert.equal(percentInput.getAttribute('aria-label'), null);
  percentInput.value = '101%';
  percentInput.dispatch('input');
  assert.equal(percentInput.classList.contains('is-invalid'), true);
  assert.equal(percentInput.getAttribute('aria-invalid'), 'true');
  percentInput.dispatch('blur');
  assert.equal(percentInput.value, '0%');
  assert.equal(percentInput.classList.contains('is-invalid'), false);

  percentInput.value = '25';
  percentInput.dispatch('input');
  percentInput.dispatch('blur');
  assert.equal(percentInput.value, '25%');
});

test('Task Editor save highlights and focuses the first empty reading field', () => {
  const harness = createHarness();
  harness.initializeRow();

  const readingInput = harness.findInputByHeaderId('thTexto');
  assert.ok(readingInput);
  readingInput.value = '   ';
  readingInput.dispatch('input');
  harness.elements.btnTaskSave.dispatch('click');

  assert.equal(readingInput.classList.contains('is-invalid'), true);
  assert.equal(readingInput.getAttribute('aria-invalid'), 'true');
  assert.equal(harness.getActiveElement(), readingInput);
  assert.deepEqual(harness.notifications, ['renderer.tasks.alerts.row_text_required']);
});

test('Task Editor resets persistent task-name validation only at successful session boundaries', async () => {
  const harness = createHarness();
  harness.initializeRow();

  harness.elements.taskNameInput.value = '   ';
  harness.elements.taskNameInput.dispatch('input');
  harness.elements.btnTaskSave.dispatch('click');
  assert.equal(harness.elements.taskNameInput.classList.contains('is-invalid'), true);
  assert.equal(harness.elements.taskNameInput.getAttribute('aria-invalid'), 'true');

  harness.initializeTask({
    sourcePath: 'loaded-task.json',
    task: {
      meta: { name: 'Loaded task' },
      rows: [],
    },
  });
  assert.equal(harness.elements.taskNameInput.value, 'Loaded task');
  assert.equal(harness.elements.taskNameInput.classList.contains('is-invalid'), false);
  assert.equal(harness.elements.taskNameInput.getAttribute('aria-invalid'), 'false');

  harness.elements.taskNameInput.value = '   ';
  harness.elements.taskNameInput.dispatch('input');
  harness.elements.btnTaskSave.dispatch('click');
  harness.initializeTask({});
  assert.equal(harness.elements.taskNameInput.classList.contains('is-invalid'), true);
  assert.equal(harness.elements.taskNameInput.getAttribute('aria-invalid'), 'true');

  harness.elements.btnTaskDelete.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.elements.taskNameInput.value, '');
  assert.equal(harness.elements.taskNameInput.classList.contains('is-invalid'), false);
  assert.equal(harness.elements.taskNameInput.getAttribute('aria-invalid'), 'false');
});
