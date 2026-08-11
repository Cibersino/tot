'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createStopwatchTimeUtils } = require('../../../public/js/lib/stopwatch_time_core');

function createTaskMeta(name = 'Task') {
  return {
    name,
    createdAt: '2026-01-02T03:04:05.000Z',
    updatedAt: '2026-01-02T03:04:05.000Z',
    savedWith: 'toT (totapp.org)',
  };
}

function createHarness() {
  let activeElement = null;
  let onInit = null;
  let resolveTranslationsLoaded = null;
  const translationsLoaded = new Promise((resolve) => {
    resolveTranslationsLoaded = resolve;
  });
  const modalOpeners = new Map();
  const documentListeners = new Map();
  const windowListeners = new Map();
  const notifications = [];
  const savedLibraryEntries = [];
  const openTaskLinkCalls = [];
  const snapshotInspectionCalls = [];
  let openTaskLinkResult = { ok: true };
  let selectedTaskRowSnapshotResult = { ok: false, code: 'CANCELLED' };
  let taskRowSnapshotInspectionResult = {
    ok: true,
    name: null,
    estimatedSeconds: null,
    wpm: null,
  };

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
      contains(candidate) {
        return candidate === this || children.some((child) => child.contains(candidate));
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
    'commentSnapshotPath', 'snapshotDetailsConfirmModal', 'snapshotDetailsConfirmBackdrop',
    'snapshotDetailsConfirmClose', 'snapshotDetailsConfirmApply', 'snapshotDetailsConfirmKeep',
    'snapshotDetailsConfirmTitle', 'snapshotDetailsConfirmText', 'snapshotDetailsConfirmTextSection',
    'snapshotDetailsConfirmTextChoice', 'snapshotDetailsConfirmApplyText', 'snapshotDetailsConfirmApplyTextLabel',
    'snapshotDetailsConfirmCurrentTextLabel', 'snapshotDetailsConfirmCurrentTextValue',
    'snapshotDetailsConfirmSnapshotNameLabel', 'snapshotDetailsConfirmSnapshotNameValue',
    'snapshotDetailsConfirmTimeSection', 'snapshotDetailsConfirmTimeChoice', 'snapshotDetailsConfirmApplyTime',
    'snapshotDetailsConfirmApplyTimeLabel', 'snapshotDetailsConfirmCurrentTimeLabel',
    'snapshotDetailsConfirmCurrentTimeValue', 'snapshotDetailsConfirmEstimateLabel',
    'snapshotDetailsConfirmEstimateValue', 'snapshotDetailsConfirmWpmLabel',
    'snapshotDetailsConfirmWpmValue', 'libraryModal', 'libraryBackdrop', 'libraryClose',
    'libraryList', 'libraryEmpty', 'libraryTitle', 'librarySearchLabel',
    'librarySearchInput', 'includeCommentModal', 'includeCommentBackdrop',
    'includeCommentClose', 'includeCommentYes', 'includeCommentNo',
    'includeCommentCancel', 'includeCommentTitle', 'includeCommentText',
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, createElement(id)]));
  elements.commentModal.fallbackFocus = elements.commentClose;
  elements.snapshotDetailsConfirmModal.fallbackFocus = elements.snapshotDetailsConfirmClose;
  elements.libraryModal.fallbackFocus = elements.libraryClose;
  elements.includeCommentModal.fallbackFocus = elements.includeCommentClose;
  elements.commentModal.appendChild(elements.commentInput);
  elements.snapshotDetailsConfirmModal.appendChild(elements.snapshotDetailsConfirmApply);
  elements.snapshotDetailsConfirmModal.appendChild(elements.snapshotDetailsConfirmKeep);
  elements.libraryModal.appendChild(elements.librarySearchInput);
  elements.includeCommentModal.appendChild(elements.includeCommentYes);
  elements.commentModal.setAttribute('aria-hidden', 'true');
  elements.snapshotDetailsConfirmModal.setAttribute('aria-hidden', 'true');
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
      WPM_MIN: 10,
      WPM_MAX: 700,
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
    addEventListener(type, handler) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(handler);
    },
    taskEditorAPI: {
      setDirtyState() {},
      onInit(handler) { onInit = handler; },
      onRequestClose() {},
      onSettingsChanged() {},
      async getSettings() { return { language: 'en' }; },
      async saveTaskList() { return { ok: true }; },
      async deleteTaskList() { return { ok: true }; },
      async saveLibraryEntry(entry) {
        savedLibraryEntries.push(JSON.parse(JSON.stringify(entry)));
        return { ok: true };
      },
      async openTaskLink(raw) {
        openTaskLinkCalls.push(raw);
        return openTaskLinkResult;
      },
      async selectTaskRowSnapshot() {
        return selectedTaskRowSnapshotResult;
      },
      async inspectTaskRowSnapshot(snapshotRelPath) {
        snapshotInspectionCalls.push(snapshotRelPath);
        return taskRowSnapshotInspectionResult;
      },
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
    savedLibraryEntries,
    openTaskLinkCalls,
    snapshotInspectionCalls,
    setOpenTaskLinkResult(result) {
      openTaskLinkResult = result;
    },
    setSelectedTaskRowSnapshotResult(result) {
      selectedTaskRowSnapshotResult = result;
    },
    setTaskRowSnapshotInspectionResult(result) {
      taskRowSnapshotInspectionResult = result;
    },
    getActiveElement() { return activeElement; },
    dispatchWindow(type, event = {}) {
      const dispatchedEvent = {
        key: '',
        defaultPrevented: false,
        ...event,
        preventDefault() {
          this.defaultPrevented = true;
        },
      };
      (windowListeners.get(type) || []).forEach((handler) => handler(dispatchedEvent));
      return dispatchedEvent;
    },
    async waitForTranslations() {
      await translationsLoaded;
      for (let attempt = 0; attempt < 10 && !elements.commentInput.getAttribute('placeholder'); attempt += 1) {
        await Promise.resolve();
      }
    },
    initializeTask(payload) {
      onInit(payload);
    },
    initializeRow(overrides = {}) {
      onInit({
        sourcePath: 'task.json',
        task: {
          meta: createTaskMeta(),
          rows: [{
            texto: 'Text',
            tiempoSeconds: 60,
            percentComplete: 0,
            enlace: '',
            comentario: 'Comment',
            snapshotRelPath: '',
            ...overrides,
          }],
        },
      });
    },
  };
}

test('Task Editor localizes native field prompts and limits the comment field', async () => {
  const harness = createHarness();
  await harness.waitForTranslations();

  assert.equal(
    harness.elements.taskNameInput.getAttribute('placeholder'),
    'renderer.tasks.name_placeholder'
  );
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

test('every shipped locale and the overriding es-cl bundle define the Task Editor snapshot-details confirmation copy', () => {
  const languages = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../i18n/languages.json'), 'utf8'));
  const expectedKeys = [
    'title',
    'message',
    'replace_reading_name',
    'set_reading_name',
    'current_name',
    'snapshot_name',
    'empty',
    'replace_time',
    'current_time',
    'snapshot_estimate',
    'reading_speed',
    'apply',
    'apply_selected',
    'keep',
    'close_aria',
  ];

  languages.forEach(({ tag }) => {
    const rendererPath = path.resolve(__dirname, `../../../i18n/${tag}/renderer.json`);
    const renderer = JSON.parse(fs.readFileSync(rendererPath, 'utf8'));
    const confirmation = renderer.renderer.tasks.comentario_modal.snapshot_details_confirm;

    assert.deepEqual(Object.keys(confirmation).sort(), expectedKeys.slice().sort(), `${tag} confirmation keys drifted`);
    expectedKeys.forEach((key) => {
      assert.equal(typeof confirmation[key], 'string', `${tag} missing ${key}`);
      assert.ok(confirmation[key].trim(), `${tag} has empty ${key}`);
    });
    if (tag === 'en' || tag === 'es') {
      assert.equal(
        confirmation.title,
        tag === 'es'
          ? '¿Usar la información del snapshot de texto seleccionado?'
          : 'Use data from selected text snapshot?'
      );
      assert.equal(
        confirmation.message,
        tag === 'es'
          ? 'Revisa los datos disponibles del snapshot de texto seleccionado antes de aplicarlos a esta lectura.'
          : 'Review the available data from the selected text snapshot before applying it to this reading.'
      );
    }
  });

  const esClRenderer = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../../../i18n/es/es-cl/renderer.json'),
    'utf8'
  ));
  const esClConfirmation = esClRenderer.renderer.tasks.comentario_modal.snapshot_details_confirm;
  assert.deepEqual(Object.keys(esClConfirmation).sort(), expectedKeys.slice().sort(), 'es-cl confirmation keys drifted');
  expectedKeys.forEach((key) => {
    assert.equal(typeof esClConfirmation[key], 'string', `es-cl missing ${key}`);
    assert.ok(esClConfirmation[key].trim(), `es-cl has empty ${key}`);
  });
});

test('task-editor modals use their reviewed initial targets and restore each opener', () => {
  const harness = createHarness();
  harness.initializeRow();

  const commentOpener = harness.findByIcon('task-comment');
  assert.ok(commentOpener);
  commentOpener.focus();
  commentOpener.dispatch('click');
  assert.equal(harness.getActiveElement(), harness.elements.commentInput);
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

test('Task Editor Escape closes the focused visible dialog through its existing close path', () => {
  const harness = createHarness();
  harness.initializeRow();

  const commentOpener = harness.findByIcon('task-comment');
  commentOpener.focus();
  commentOpener.dispatch('click');
  const commentEscape = harness.dispatchWindow('keydown', { key: 'Escape' });
  assert.equal(commentEscape.defaultPrevented, true);
  assert.equal(harness.elements.commentModal.getAttribute('aria-hidden'), 'true');
  assert.equal(harness.getActiveElement(), commentOpener);

  const librarySaveOpener = harness.findByIcon('task-row-save');
  librarySaveOpener.focus();
  librarySaveOpener.dispatch('click');
  const includeCommentEscape = harness.dispatchWindow('keydown', { key: 'Escape' });
  assert.equal(includeCommentEscape.defaultPrevented, true);
  assert.equal(harness.elements.includeCommentModal.getAttribute('aria-hidden'), 'true');
  assert.equal(harness.getActiveElement(), librarySaveOpener);

  harness.elements.btnTaskLoadLibrary.focus();
  harness.elements.btnTaskLoadLibrary.dispatch('click');
  const libraryEscape = harness.dispatchWindow('keydown', { key: 'Escape' });
  assert.equal(libraryEscape.defaultPrevented, true);
  assert.equal(harness.elements.libraryModal.getAttribute('aria-hidden'), 'true');
  assert.equal(harness.getActiveElement(), harness.elements.btnTaskLoadLibrary);
});

test('Task Editor applies the changed snapshot estimate only after confirmation', async () => {
  const harness = createHarness();
  harness.initializeRow();
  harness.setSelectedTaskRowSnapshotResult({ ok: true, snapshotRelPath: '/estimated.json' });
  harness.setTaskRowSnapshotInspectionResult({
    ok: true,
    name: null,
    estimatedSeconds: 120,
    wpm: 200,
  });

  harness.findByIcon('task-comment').dispatch('click');
  harness.elements.commentSnapshotSelect.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
  harness.elements.commentSave.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(harness.snapshotInspectionCalls, ['/estimated.json']);
  assert.equal(harness.elements.snapshotDetailsConfirmModal.getAttribute('aria-hidden'), 'false');
  assert.equal(harness.elements.snapshotDetailsConfirmTextSection.hidden, true);
  assert.equal(harness.elements.snapshotDetailsConfirmTimeSection.hidden, false);
  assert.equal(harness.elements.snapshotDetailsConfirmTextChoice.hidden, true);
  assert.equal(harness.elements.snapshotDetailsConfirmTimeChoice.hidden, true);
  assert.equal(harness.elements.snapshotDetailsConfirmApplyTime.checked, true);
  assert.equal(harness.elements.snapshotDetailsConfirmApply.textContent, 'renderer.tasks.comentario_modal.snapshot_details_confirm.apply');
  assert.equal(harness.elements.snapshotDetailsConfirmApply.disabled, false);
  assert.equal(harness.getActiveElement(), harness.elements.snapshotDetailsConfirmApply);
  assert.equal(harness.elements.snapshotDetailsConfirmCurrentTimeValue.textContent, '00:01:00');
  assert.equal(harness.elements.snapshotDetailsConfirmEstimateValue.textContent, '00:02:00');
  assert.equal(harness.elements.snapshotDetailsConfirmWpmValue.textContent, '200 WPM');

  harness.elements.snapshotDetailsConfirmApplyTime.checked = false;
  harness.elements.snapshotDetailsConfirmApplyTime.dispatch('change');
  assert.equal(harness.elements.snapshotDetailsConfirmApply.disabled, false);
  harness.elements.snapshotDetailsConfirmApply.dispatch('click');

  const timeInput = harness.findInputByHeaderId('thTiempo');
  assert.equal(harness.elements.commentModal.getAttribute('aria-hidden'), 'true');
  assert.equal(harness.elements.snapshotDetailsConfirmModal.getAttribute('aria-hidden'), 'true');
  assert.equal(timeInput.value, '00:02:00');
  assert.ok(harness.findByIcon('task-text-snapshot-load'));
});

test('Task Editor applies changed snapshot text and time independently', async () => {
  const harness = createHarness();
  harness.initializeRow();
  harness.setSelectedTaskRowSnapshotResult({ ok: true, snapshotRelPath: '/named-estimated.json' });
  harness.setTaskRowSnapshotInspectionResult({
    ok: true,
    name: 'Snapshot title',
    estimatedSeconds: 120,
    wpm: 200,
  });

  harness.findByIcon('task-comment').dispatch('click');
  harness.elements.commentSnapshotSelect.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
  harness.elements.commentSave.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.elements.snapshotDetailsConfirmTextSection.hidden, false);
  assert.equal(harness.elements.snapshotDetailsConfirmTimeSection.hidden, false);
  assert.equal(harness.elements.snapshotDetailsConfirmTextChoice.hidden, false);
  assert.equal(harness.elements.snapshotDetailsConfirmTimeChoice.hidden, false);
  assert.equal(harness.elements.snapshotDetailsConfirmApplyText.checked, true);
  assert.equal(harness.elements.snapshotDetailsConfirmApplyTime.checked, true);
  assert.equal(harness.elements.snapshotDetailsConfirmApply.disabled, false);
  assert.equal(harness.elements.snapshotDetailsConfirmApply.textContent, 'renderer.tasks.comentario_modal.snapshot_details_confirm.apply_selected');
  assert.equal(harness.getActiveElement(), harness.elements.snapshotDetailsConfirmApplyText);
  assert.equal(
    harness.elements.snapshotDetailsConfirmApplyTextLabel.textContent,
    'renderer.tasks.comentario_modal.snapshot_details_confirm.replace_reading_name'
  );
  assert.equal(harness.elements.snapshotDetailsConfirmCurrentTextValue.textContent, 'Text');
  assert.equal(harness.elements.snapshotDetailsConfirmCurrentTextValue.classList.contains('is-empty'), false);
  assert.equal(harness.elements.snapshotDetailsConfirmSnapshotNameValue.textContent, 'Snapshot title');

  harness.elements.snapshotDetailsConfirmApplyTime.checked = false;
  harness.elements.snapshotDetailsConfirmApplyTime.dispatch('change');
  assert.equal(harness.elements.snapshotDetailsConfirmApply.disabled, false);
  harness.elements.snapshotDetailsConfirmApplyText.checked = false;
  harness.elements.snapshotDetailsConfirmApplyText.dispatch('change');
  assert.equal(harness.elements.snapshotDetailsConfirmApply.disabled, true);
  harness.elements.snapshotDetailsConfirmApplyText.checked = true;
  harness.elements.snapshotDetailsConfirmApplyText.dispatch('change');
  assert.equal(harness.elements.snapshotDetailsConfirmApply.disabled, false);
  harness.elements.snapshotDetailsConfirmApply.dispatch('click');

  assert.equal(harness.findInputByHeaderId('thTexto').value, 'Snapshot title');
  assert.equal(harness.findInputByHeaderId('thTiempo').value, '00:01:00');
  assert.ok(harness.findByIcon('task-text-snapshot-load'));
});

test('Task Editor offers a changed snapshot name without a reading estimate', async () => {
  const harness = createHarness();
  harness.initializeRow();
  harness.setSelectedTaskRowSnapshotResult({ ok: true, snapshotRelPath: '/named.json' });
  harness.setTaskRowSnapshotInspectionResult({
    ok: true,
    name: 'Snapshot title',
    estimatedSeconds: null,
    wpm: null,
  });

  harness.findByIcon('task-comment').dispatch('click');
  harness.elements.commentSnapshotSelect.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
  harness.elements.commentSave.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.elements.snapshotDetailsConfirmModal.getAttribute('aria-hidden'), 'false');
  assert.equal(harness.elements.snapshotDetailsConfirmTextSection.hidden, false);
  assert.equal(harness.elements.snapshotDetailsConfirmTimeSection.hidden, true);
  assert.equal(harness.elements.snapshotDetailsConfirmTextChoice.hidden, true);
  assert.equal(harness.elements.snapshotDetailsConfirmTimeChoice.hidden, true);
  assert.equal(harness.elements.snapshotDetailsConfirmApply.textContent, 'renderer.tasks.comentario_modal.snapshot_details_confirm.apply');
  assert.equal(harness.elements.snapshotDetailsConfirmApply.disabled, false);
  assert.equal(harness.getActiveElement(), harness.elements.snapshotDetailsConfirmApply);

  harness.elements.snapshotDetailsConfirmApply.dispatch('click');
  assert.equal(harness.findInputByHeaderId('thTexto').value, 'Snapshot title');
  assert.equal(harness.findInputByHeaderId('thTiempo').value, '00:01:00');
});

test('Task Editor presents an empty current name explicitly and in muted style', async () => {
  const harness = createHarness();
  await harness.waitForTranslations();
  harness.initializeRow({ texto: '' });
  harness.setSelectedTaskRowSnapshotResult({ ok: true, snapshotRelPath: '/named.json' });
  harness.setTaskRowSnapshotInspectionResult({
    ok: true,
    name: 'Snapshot title',
    estimatedSeconds: null,
    wpm: null,
  });

  harness.findByIcon('task-comment').dispatch('click');
  harness.elements.commentSnapshotSelect.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
  harness.elements.commentSave.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(
    harness.elements.snapshotDetailsConfirmApplyTextLabel.textContent,
    'renderer.tasks.comentario_modal.snapshot_details_confirm.set_reading_name'
  );
  assert.equal(
    harness.elements.snapshotDetailsConfirmCurrentTextLabel.textContent,
    'renderer.tasks.comentario_modal.snapshot_details_confirm.current_name'
  );
  assert.equal(
    harness.elements.snapshotDetailsConfirmCurrentTextValue.textContent,
    'renderer.tasks.comentario_modal.snapshot_details_confirm.empty'
  );
  assert.equal(harness.elements.snapshotDetailsConfirmCurrentTextValue.classList.contains('is-empty'), true);
});

test('Task Editor treats Keep and confirmation dismissal as keeping current values', async () => {
  const noHarness = createHarness();
  noHarness.initializeRow();
  noHarness.setSelectedTaskRowSnapshotResult({ ok: true, snapshotRelPath: '/estimated.json' });
  noHarness.setTaskRowSnapshotInspectionResult({
    ok: true,
    name: null,
    estimatedSeconds: 120,
    wpm: 200,
  });

  noHarness.findByIcon('task-comment').dispatch('click');
  noHarness.elements.commentSnapshotSelect.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
  noHarness.elements.commentSave.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
  noHarness.elements.snapshotDetailsConfirmKeep.dispatch('click');

  assert.equal(noHarness.findInputByHeaderId('thTiempo').value, '00:01:00');
  assert.ok(noHarness.findByIcon('task-text-snapshot-load'));

  const dismissHarness = createHarness();
  dismissHarness.initializeRow();
  dismissHarness.setSelectedTaskRowSnapshotResult({ ok: true, snapshotRelPath: '/estimated.json' });
  dismissHarness.setTaskRowSnapshotInspectionResult({
    ok: true,
    name: null,
    estimatedSeconds: 120,
    wpm: 200,
  });

  dismissHarness.findByIcon('task-comment').dispatch('click');
  dismissHarness.elements.commentSnapshotSelect.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
  dismissHarness.elements.commentSave.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
  const escape = dismissHarness.dispatchWindow('keydown', { key: 'Escape' });

  assert.equal(escape.defaultPrevented, true);
  assert.equal(dismissHarness.findInputByHeaderId('thTiempo').value, '00:01:00');
  assert.equal(dismissHarness.elements.commentModal.getAttribute('aria-hidden'), 'true');
  assert.ok(dismissHarness.findByIcon('task-text-snapshot-load'));
});

test('Task Editor skips confirmation without changed details and retains an invalid snapshot draft', async () => {
  const noDetailsHarness = createHarness();
  noDetailsHarness.initializeRow();
  noDetailsHarness.setSelectedTaskRowSnapshotResult({ ok: true, snapshotRelPath: '/without-details.json' });
  noDetailsHarness.setTaskRowSnapshotInspectionResult({
    ok: true,
    name: null,
    estimatedSeconds: null,
    wpm: null,
  });

  noDetailsHarness.findByIcon('task-comment').dispatch('click');
  noDetailsHarness.elements.commentSnapshotSelect.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
  noDetailsHarness.elements.commentSave.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(noDetailsHarness.elements.snapshotDetailsConfirmModal.getAttribute('aria-hidden'), 'true');
  assert.equal(noDetailsHarness.elements.commentModal.getAttribute('aria-hidden'), 'true');
  assert.ok(noDetailsHarness.findByIcon('task-text-snapshot-load'));

  const noChangeHarness = createHarness();
  noChangeHarness.initializeRow();
  noChangeHarness.setSelectedTaskRowSnapshotResult({ ok: true, snapshotRelPath: '/unchanged.json' });
  noChangeHarness.setTaskRowSnapshotInspectionResult({
    ok: true,
    name: 'Text',
    estimatedSeconds: 60,
    wpm: 200,
  });

  noChangeHarness.findByIcon('task-comment').dispatch('click');
  noChangeHarness.elements.commentSnapshotSelect.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
  noChangeHarness.elements.commentSave.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(noChangeHarness.elements.snapshotDetailsConfirmModal.getAttribute('aria-hidden'), 'true');
  assert.equal(noChangeHarness.elements.commentModal.getAttribute('aria-hidden'), 'true');
  assert.equal(noChangeHarness.findInputByHeaderId('thTexto').value, 'Text');
  assert.equal(noChangeHarness.findInputByHeaderId('thTiempo').value, '00:01:00');
  assert.ok(noChangeHarness.findByIcon('task-text-snapshot-load'));

  const invalidHarness = createHarness();
  invalidHarness.initializeRow();
  invalidHarness.setSelectedTaskRowSnapshotResult({ ok: true, snapshotRelPath: '/invalid.json' });
  invalidHarness.setTaskRowSnapshotInspectionResult({ ok: false, code: 'INVALID_SCHEMA' });

  invalidHarness.findByIcon('task-comment').dispatch('click');
  invalidHarness.elements.commentSnapshotSelect.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
  invalidHarness.elements.commentSave.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(invalidHarness.elements.commentModal.getAttribute('aria-hidden'), 'false');
  assert.equal(invalidHarness.findInputByHeaderId('thTiempo').value, '00:01:00');
  assert.equal(invalidHarness.findByIcon('task-text-snapshot-load'), null);
  assert.deepEqual(invalidHarness.notifications, ['renderer.tasks.alerts.snapshot_invalid']);
});

test('Task Editor modal markup gives every dialog an accessible name and describes its confirmation question', () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../../../public/task_editor.html'), 'utf8');
  const styles = fs.readFileSync(path.resolve(__dirname, '../../../public/task_editor.css'), 'utf8');

  assert.match(markup, /id="commentModal"[^>]*aria-labelledby="commentTitle"/);
  assert.match(markup, /id="libraryModal"[^>]*aria-labelledby="libraryTitle"/);
  assert.match(markup, /id="includeCommentModal"[^>]*aria-labelledby="includeCommentTitle"[^>]*aria-describedby="includeCommentText"/);
  assert.match(markup, /id="snapshotDetailsConfirmModal"[^>]*aria-labelledby="snapshotDetailsConfirmTitle"[^>]*aria-describedby="snapshotDetailsConfirmText"/);
  assert.match(markup, /<legend id="snapshotDetailsConfirmTextChoice">/);
  assert.match(markup, /<legend id="snapshotDetailsConfirmTimeChoice">/);
  assert.equal(
    (markup.match(/class="snapshot-details-confirm-toggle native-checkbox-option"/g) || []).length,
    2
  );
  assert.match(markup, /id="snapshotDetailsConfirmApplyText" type="checkbox" checked/);
  assert.match(markup, /id="snapshotDetailsConfirmApplyTime" type="checkbox" checked/);
  assert.match(markup, /id="snapshotDetailsConfirmWpmLabel">Velocidad de lectura<\/dt>/);
  assert.match(markup, /id="snapshotDetailsConfirmWpmValue" dir="ltr"><\/dd>/);
  assert.match(markup, /<dl class="snapshot-details-confirm-name-values">/);
  assert.match(markup, /<dl class="snapshot-details-confirm-time-values">/);
  assert.match(styles, /\.modal-actions\s*\{\s*display: flex;\s*justify-content: flex-end;\s*gap: 12px;\s*flex-wrap: wrap;\s*\}/);
  assert.match(styles, /\.btn-standard:disabled\s*\{\s*opacity: 0\.5;\s*cursor: not-allowed;\s*\}/);
  assert.match(styles, /#snapshotDetailsConfirmText\s*\{\s*font-size: var\(--font-size-9\);\s*\}/);
  assert.match(styles, /\.snapshot-details-confirm-section\s*\{[^}]*font-size: var\(--font-size-9\);/);
  assert.match(styles, /\.snapshot-details-confirm-time-values > div\s*\{\s*display: contents;\s*\}/);
  assert.match(styles, /\.snapshot-details-confirm-time-values\s*\{\s*grid-template-columns: max-content max-content;\s*justify-content: center;\s*align-items: baseline;\s*column-gap: 12px;\s*\}/);
  assert.match(styles, /\.snapshot-details-confirm-time-values dt\s*\{\s*justify-self: end;\s*\}/);
  assert.match(styles, /\.native-checkbox-option > input\[type="checkbox"\]\s*\{\s*flex: 0 0 auto;\s*margin: 0;\s*accent-color: var\(--control-accent\);\s*cursor: inherit;\s*\}/);
  assert.match(styles, /\.snapshot-details-confirm-section legend\[hidden\]\s*\{\s*display: none;\s*\}/);
  assert.match(styles, /\.snapshot-details-confirm-name-values dd\.is-empty\s*\{\s*color: var\(--text-soft\);/);
});

test('Task Editor projects a live row into an exact library entry before IPC', async () => {
  const harness = createHarness();
  harness.initializeTask({
    sourcePath: 'task.json',
    task: {
      meta: createTaskMeta(),
      rows: [{
        texto: 'Text',
        tiempoSeconds: 60,
        percentComplete: 25,
        enlace: 'https://example.com/read',
        comentario: 'Comment',
        snapshotRelPath: '/snapshots/selected.json',
      }],
    },
  });

  const librarySaveOpener = harness.findByIcon('task-row-save');
  assert.ok(librarySaveOpener);

  librarySaveOpener.dispatch('click');
  harness.elements.includeCommentYes.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));

  librarySaveOpener.dispatch('click');
  harness.elements.includeCommentNo.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(harness.savedLibraryEntries, [
    {
      texto: 'Text',
      tiempoSeconds: 60,
      enlace: 'https://example.com/read',
      comentario: 'Comment',
      snapshotRelPath: '/snapshots/selected.json',
    },
    {
      texto: 'Text',
      tiempoSeconds: 60,
      enlace: 'https://example.com/read',
      snapshotRelPath: '/snapshots/selected.json',
    },
  ]);
});

test('Task Editor library save highlights and focuses an empty reading field', async () => {
  const harness = createHarness();
  harness.initializeRow();

  const readingInput = harness.findInputByHeaderId('thTexto');
  const librarySaveOpener = harness.findByIcon('task-row-save');
  assert.ok(readingInput);
  assert.ok(librarySaveOpener);

  readingInput.value = '   ';
  readingInput.dispatch('input');
  librarySaveOpener.dispatch('click');
  harness.elements.includeCommentNo.dispatch('click');

  assert.equal(harness.savedLibraryEntries.length, 0);
  assert.equal(readingInput.classList.contains('is-invalid'), true);
  assert.equal(readingInput.getAttribute('aria-invalid'), 'true');
  assert.equal(harness.getActiveElement(), readingInput);
  assert.deepEqual(harness.notifications, ['renderer.tasks.alerts.row_text_required']);
});

test('Task Editor Link failures use invalid state only for correctable link values', async () => {
  const harness = createHarness();
  harness.initializeRow();

  const linkInput = harness.findInputByHeaderId('thEnlace');
  const linkOpenButton = harness.findByIcon('open-target');
  assert.ok(linkInput);
  assert.ok(linkOpenButton);

  linkInput.value = 'C:\\missing.txt';
  linkInput.dispatch('input');
  harness.setOpenTaskLinkResult({ ok: false, code: 'LINK_MISSING' });
  linkOpenButton.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(harness.openTaskLinkCalls, ['C:\\missing.txt']);
  assert.equal(linkInput.classList.contains('is-invalid'), true);
  assert.equal(linkInput.getAttribute('aria-invalid'), 'true');
  assert.equal(harness.getActiveElement(), linkInput);
  assert.deepEqual(harness.notifications, ['renderer.tasks.alerts.link_missing']);

  linkInput.dispatch('blur');
  assert.equal(linkInput.classList.contains('is-invalid'), false);
  assert.equal(linkInput.getAttribute('aria-invalid'), 'false');

  linkInput.value = 'https://example.com/read';
  linkInput.dispatch('input');
  assert.equal(linkInput.classList.contains('is-invalid'), false);
  assert.equal(linkInput.getAttribute('aria-invalid'), 'false');

  harness.setOpenTaskLinkResult({ ok: false, code: 'LINK_BLOCKED' });
  linkOpenButton.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(linkInput.classList.contains('is-invalid'), true);
  assert.equal(linkInput.getAttribute('aria-invalid'), 'true');
  assert.equal(harness.getActiveElement(), linkInput);
  assert.deepEqual(harness.notifications, [
    'renderer.tasks.alerts.link_missing',
    'renderer.tasks.alerts.link_blocked',
  ]);

  linkInput.value = 'https://example.com/other';
  linkInput.dispatch('input');
  harness.setOpenTaskLinkResult({ ok: false, code: 'CONFIRM_DENIED' });
  linkOpenButton.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(linkInput.classList.contains('is-invalid'), false);
  assert.equal(linkInput.getAttribute('aria-invalid'), 'false');

  harness.setOpenTaskLinkResult({ ok: false, code: 'OPEN_FAILED' });
  linkOpenButton.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(linkInput.classList.contains('is-invalid'), false);
  assert.equal(linkInput.getAttribute('aria-invalid'), 'false');
  assert.deepEqual(harness.notifications, [
    'renderer.tasks.alerts.link_missing',
    'renderer.tasks.alerts.link_blocked',
    'renderer.tasks.alerts.link_error',
  ]);
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
      meta: createTaskMeta('Loaded task'),
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
