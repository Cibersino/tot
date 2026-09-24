'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createStopwatchTimeUtils } = require('../../../public/js/lib/stopwatch_time_core');
const { createTaskDurationUtils } = require('../../../public/js/lib/task_duration_core');

function createTaskMeta(name = 'Task') {
  return {
    name,
    createdAt: '2026-01-02T03:04:05.000Z',
    updatedAt: '2026-01-02T03:04:05.000Z',
    savedWith: 'toT (totapp.org)',
  };
}

function createHarness(options = {}) {
  const bootstrapProbe = options.bootstrapProbe || null;
  const focusCalls = Array.isArray(options.focusCalls) ? options.focusCalls : null;
  const failInitialI18nTransition = options.failInitialI18nTransition === true;
  const terminalTransitionLanguage = options.terminalTransitionLanguage || '';
  const terminalReporterThrows = options.terminalReporterThrows === true;
  let activeElement = null;
  let onInit = null;
  let onSettingsChanged = null;
  let resolveTranslationsLoaded = null;
  const translationsLoaded = new Promise((resolve) => {
    resolveTranslationsLoaded = resolve;
  });
  const modalOpeners = new Map();
  const documentListeners = new Map();
  const windowListeners = new Map();
  const notifications = [];
  const errorLogs = [];
  const dirtyStateCalls = [];
  const terminalStateCalls = options.terminalStateCalls || [];
  const closeResponseCalls = [];
  const savedLibraryEntries = [];
  const openTaskLinkCalls = [];
  const snapshotInspectionCalls = [];
  const taskFileSelectionCalls = [];
  let nextInitId = 1;
  let openTaskLinkResult = { ok: true };
  let selectedTaskRowSnapshotResult = { ok: false, code: 'CANCELLED' };
  let taskFileSelectionResult = { ok: false, code: 'CANCELLED' };
  let libraryListResult = { ok: true, items: [] };
  let taskRowSnapshotInspectionResult = {
    ok: true,
    name: null,
    sourceComment: null,
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
        if (bootstrapProbe) bootstrapProbe.elementListeners.push({ id, type });
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
      removeAttribute(name) {
        delete attributes[name];
      },
      toggleAttribute(name, force) {
        if (force) attributes[name] = '';
        else delete attributes[name];
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
        if (focusCalls) focusCalls.push(this);
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
    'thComentario', 'thAcciones', 'thTextoLabel', 'thTiempoLabel', 'thPercentLabel',
    'thFaltaLabel', 'thEnlaceLabel', 'thComentarioLabel', 'thAccionesLabel',
    'taskTable', 'taskColGroup',
    'commentModal', 'commentBackdrop', 'commentClose', 'commentCancel', 'commentSave',
    'commentInput', 'commentTitle', 'commentSnapshotSelect', 'commentSnapshotClear',
    'commentSnapshotPath', 'snapshotSourceReminderModal', 'snapshotSourceReminderBackdrop',
    'snapshotSourceReminderClose', 'snapshotSourceReminderCancel', 'snapshotSourceReminderSelectFile',
    'snapshotSourceReminderTitle', 'snapshotSourceReminderText', 'snapshotSourceReminderCommentLabel',
    'snapshotSourceReminderCommentValue', 'snapshotDetailsConfirmModal', 'snapshotDetailsConfirmBackdrop',
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
  [
    ['thTexto', 'thTextoLabel'],
    ['thTiempo', 'thTiempoLabel'],
    ['thPercent', 'thPercentLabel'],
    ['thFalta', 'thFaltaLabel'],
    ['thEnlace', 'thEnlaceLabel'],
    ['thComentario', 'thComentarioLabel'],
    ['thAcciones', 'thAccionesLabel'],
  ].forEach(([headerId, labelId]) => elements[headerId].appendChild(elements[labelId]));
  elements.commentModal.fallbackFocus = elements.commentClose;
  elements.snapshotSourceReminderModal.fallbackFocus = elements.snapshotSourceReminderClose;
  elements.snapshotDetailsConfirmModal.fallbackFocus = elements.snapshotDetailsConfirmClose;
  elements.libraryModal.fallbackFocus = elements.libraryClose;
  elements.includeCommentModal.fallbackFocus = elements.includeCommentClose;
  elements.commentModal.appendChild(elements.commentInput);
  elements.snapshotSourceReminderModal.appendChild(elements.snapshotSourceReminderCancel);
  elements.snapshotSourceReminderModal.appendChild(elements.snapshotSourceReminderSelectFile);
  elements.snapshotDetailsConfirmModal.appendChild(elements.snapshotDetailsConfirmApply);
  elements.snapshotDetailsConfirmModal.appendChild(elements.snapshotDetailsConfirmKeep);
  elements.libraryModal.appendChild(elements.librarySearchInput);
  elements.includeCommentModal.appendChild(elements.includeCommentYes);
  elements.commentModal.setAttribute('aria-hidden', 'true');
  elements.snapshotSourceReminderModal.setAttribute('aria-hidden', 'true');
  elements.snapshotDetailsConfirmModal.setAttribute('aria-hidden', 'true');
  elements.libraryModal.setAttribute('aria-hidden', 'true');
  elements.includeCommentModal.setAttribute('aria-hidden', 'true');
  elements.libraryEmpty.hidden = true;

  const body = createElement('body', 'body');
  const taskEditorRoot = createElement('task-editor-root');
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
      if (selector === '.task-editor') return taskEditorRoot;
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
        debug() {}, info() {}, warn() {}, warnOnce() {},
        error(...args) { errorLogs.push(args); },
        errorOnce() {},
      };
    },
    AppConstants: {
      DEFAULT_LANG: 'en',
      WPM_MIN: 10,
      WPM_MAX: 700,
      SNAPSHOT_SOURCE_COMMENT_MAX_CHARS: 65_536,
      TASK_NAME_MAX_CHARS: 100,
      TASK_ROW_TEXT_MAX_CHARS: 1000,
      TASK_ROW_COMMENT_MAX_CHARS: 1200,
      TASK_ROW_LINK_MAX_CHARS: 1000,
    },
    StopwatchTimeCore: {
      createStopwatchTimeUtils,
    },
    TaskDurationCore: {
      createTaskDurationUtils,
    },
    RendererI18n: {
      async transitionRendererTranslations(language, { applyTranslations } = {}) {
        resolveTranslationsLoaded();
        if (failInitialI18nTransition) {
          const err = new Error('Cannot establish initial renderer translation state');
          err.rendererI18nTransition = {
            hadEstablishedState: false,
            restorationFailed: false,
          };
          throw err;
        }
        if (language === terminalTransitionLanguage) {
          const err = new Error('Cannot restore Task Editor translations');
          err.rendererI18nTransition = {
            hadEstablishedState: true,
            restorationFailed: true,
          };
          throw err;
        }
        if (typeof applyTranslations === 'function') await applyTranslations({ language, restoring: false });
      },
      tRenderer(key) {
        if (key === 'renderer.tasks.columns.descriptions.snapshot_path') {
          return 'Associated text snapshot path: {path}';
        }
        return key;
      },
      msgRenderer(key, params = {}) {
        const template = key === 'renderer.tasks.columns.tooltips.snapshot_load_with_path'
          ? 'Load text snapshot as current text · Associated path: {path}'
          : key;
        return Object.entries(params).reduce(
          (text, [name, value]) => text.replace(`{${name}}`, String(value)),
          template
        );
      },
    },
    RendererIcons: {
      createIconButton({ iconName = '', className = '', ariaLabel = '' } = {}) {
        const button = createElement('', 'button');
        button.className = className;
        if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
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
    TaskEditorColumnLayout: options.taskEditorColumnLayout === undefined
      ? {
        createController() {
          if (bootstrapProbe) bootstrapProbe.columnLayoutCreateCalls += 1;
          return {
            async initialize() {
              if (bootstrapProbe) bootstrapProbe.columnLayoutInitializeCalls += 1;
            },
            cancelActiveResize() {},
          };
        },
      }
      : options.taskEditorColumnLayout,
    addEventListener(type, handler) {
      if (bootstrapProbe) bootstrapProbe.windowListeners.push(type);
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(handler);
    },
    taskEditorAPI: {
      setDirtyState(value) { dirtyStateCalls.push(value); },
      onInit(handler) {
        if (bootstrapProbe) bootstrapProbe.bridgeSubscriptions.push('onInit');
        onInit = handler;
      },
      onRequestClose(handler) {
        if (bootstrapProbe) bootstrapProbe.bridgeSubscriptions.push('onRequestClose');
        void handler;
      },
      onSettingsChanged(handler) {
        if (bootstrapProbe) bootstrapProbe.bridgeSubscriptions.push('onSettingsChanged');
        onSettingsChanged = handler;
      },
      async getSettings() { return { language: 'en' }; },
      reportTerminalState(payload) {
        terminalStateCalls.push(payload);
        if (terminalReporterThrows) {
          throw new Error('task editor terminal reporter unavailable');
        }
      },
      respondToClose(payload) {
        closeResponseCalls.push(payload);
      },
      async saveTaskList() {
        return {
          ok: true,
          path: 'saved-task.json',
          meta: createTaskMeta(),
        };
      },
      async deleteTaskList() { return { ok: true }; },
      async saveLibraryEntry(entry) {
        savedLibraryEntries.push(JSON.parse(JSON.stringify(entry)));
        return { ok: true };
      },
      async openTaskLink(raw) {
        openTaskLinkCalls.push(raw);
        return openTaskLinkResult;
      },
      async selectTaskFile() {
        taskFileSelectionCalls.push(true);
        return taskFileSelectionResult;
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
      async listLibrary() { return libraryListResult; },
    },
  };

  const sandbox = { window, document, console, setTimeout, clearTimeout };
  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/task_editor.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/task_editor.js' });

  function findByIconIn(container, iconName) {
    const pending = container._children.slice();
    while (pending.length) {
      const candidate = pending.shift();
      if (candidate.getAttribute('data-tot-icon') === iconName) return candidate;
      pending.push(...candidate._children);
    }
    return null;
  }

  function findByIcon(iconName) {
    return findByIconIn(elements.taskTableBody, iconName);
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

  async function settleTaskSemanticWork() {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      await Promise.resolve();
    }
  }

  async function initializeTask(payload) {
    await translationsLoaded;
    await settleTaskSemanticWork();
    onInit(withInitId(payload));
    await settleTaskSemanticWork();
  }

  function withInitId(payload) {
    if (Number.isInteger(payload && payload.initId) && payload.initId > 0) return payload;
    return { ...payload, initId: nextInitId++ };
  }

  return {
    elements,
    dirtyStateCalls,
    terminalStateCalls,
    closeResponseCalls,
    findByIcon,
    findByIconIn,
    findInputByHeaderId,
    notifications,
    errorLogs,
    savedLibraryEntries,
    openTaskLinkCalls,
    snapshotInspectionCalls,
    taskFileSelectionCalls,
    setOpenTaskLinkResult(result) {
      openTaskLinkResult = result;
    },
    setSelectedTaskRowSnapshotResult(result) {
      selectedTaskRowSnapshotResult = result;
    },
    setTaskFileSelectionResult(result) {
      taskFileSelectionResult = result;
    },
    setLibraryListResult(result) {
      libraryListResult = result;
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
      for (
        let attempt = 0;
        attempt < 10 && (
          !elements.commentInput.getAttribute('placeholder')
          || (bootstrapProbe && bootstrapProbe.columnLayoutInitializeCalls === 0)
        );
        attempt += 1
      ) {
        await Promise.resolve();
      }
    },
    async waitForI18nFailure() {
      await translationsLoaded;
      for (let attempt = 0; attempt < 10 && terminalStateCalls.length === 0; attempt += 1) {
        await Promise.resolve();
      }
    },
    async waitForTaskSemanticWork() {
      await settleTaskSemanticWork();
    },
    queueTaskInit(payload) {
      onInit(withInitId(payload));
    },
    queueSettings(settings) {
      return onSettingsChanged(settings);
    },
    initializeTask(payload) {
      return initializeTask(payload);
    },
    initializeRow(overrides = {}) {
      return initializeTask({
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

test('Task Editor fails fast before wiring when TaskEditorColumnLayout is unavailable or invalid', () => {
  const scenarios = [
    {
      name: 'unavailable',
      taskEditorColumnLayout: null,
      error: /TaskEditorColumnLayout unavailable; cannot continue/,
    },
    {
      name: 'missing createController',
      taskEditorColumnLayout: {},
      error: /TaskEditorColumnLayout unavailable; cannot continue/,
    },
    {
      name: 'invalid controller',
      taskEditorColumnLayout: {
        createController() {
          return {};
        },
      },
      error: /TaskEditorColumnLayout controller unavailable; cannot continue/,
    },
    {
      name: 'controller construction failure',
      taskEditorColumnLayout: {
        createController() {
          throw new Error('TaskEditorColumnLayout controller construction failed');
        },
      },
      error: /TaskEditorColumnLayout controller construction failed/,
    },
  ];

  scenarios.forEach(({ name, taskEditorColumnLayout, error }) => {
    const bootstrapProbe = {
      bridgeSubscriptions: [],
      columnLayoutCreateCalls: 0,
      columnLayoutInitializeCalls: 0,
      elementListeners: [],
      windowListeners: [],
    };
    const terminalStateCalls = [];

    assert.throws(
      () => createHarness({ taskEditorColumnLayout, bootstrapProbe, terminalStateCalls }),
      error,
      name
    );
    assert.deepEqual(bootstrapProbe.elementListeners, [], `${name} must not wire element listeners`);
    assert.deepEqual(bootstrapProbe.windowListeners, [], `${name} must not wire window listeners`);
    assert.deepEqual(bootstrapProbe.bridgeSubscriptions, [], `${name} must not subscribe to taskEditorAPI`);
    assert.equal(bootstrapProbe.columnLayoutInitializeCalls, 0, `${name} must not initialize a controller`);
    assert.equal(terminalStateCalls.length, 1, `${name} must report a no-draft terminal outcome`);
    assert.equal(terminalStateCalls[0].phase, 'no-draft', `${name} must not imply a draft exists`);
    assert.equal(terminalStateCalls[0].dirty, null, `${name} must not infer dirty state`);
  });
});

test('Task Editor initializes its validated TaskEditorColumnLayout controller on the normal path', async () => {
  const bootstrapProbe = {
    bridgeSubscriptions: [],
    columnLayoutCreateCalls: 0,
    columnLayoutInitializeCalls: 0,
    elementListeners: [],
    windowListeners: [],
  };
  const harness = createHarness({ bootstrapProbe });

  await harness.waitForTranslations();

  assert.equal(bootstrapProbe.columnLayoutCreateCalls, 1);
  assert.equal(bootstrapProbe.columnLayoutInitializeCalls, 1);
  assert.deepEqual(
    bootstrapProbe.bridgeSubscriptions,
    ['onInit', 'onRequestClose', 'onSettingsChanged']
  );
  assert.ok(bootstrapProbe.elementListeners.length > 0);
  assert.deepEqual(bootstrapProbe.windowListeners, ['keydown']);
});

test('Task Editor materializes replayed init data only after translations and column layout are ready', async () => {
  const harness = createHarness();
  harness.queueTaskInit({
    sourcePath: 'task.json',
    task: {
      meta: createTaskMeta(),
      rows: [{
        texto: 'Queued task',
        tiempoSeconds: 60,
        percentComplete: 0,
        enlace: '',
        comentario: '',
        snapshotRelPath: '',
      }],
    },
  });

  assert.equal(harness.elements.taskTableBody._children.length, 0);
  await harness.waitForTranslations();
  await harness.waitForTaskSemanticWork();
  assert.equal(harness.elements.taskTableBody._children.length, 1);
});

test('Task Editor New and Load initialization make no programmatic DOM focus call', async () => {
  const cases = [
    {
      mode: 'new',
      expectedName: '',
      expectedRowCount: 0,
      payload: {
        mode: 'new',
        sourcePath: null,
        task: {
          type: 'task',
          meta: createTaskMeta(''),
          rows: [],
        },
      },
    },
    {
      mode: 'load',
      expectedName: 'Loaded task',
      expectedRowCount: 1,
      payload: {
        mode: 'load',
        sourcePath: 'loaded-task.json',
        task: {
          type: 'task',
          meta: createTaskMeta('Loaded task'),
          summary: {
            estimatedTotalSeconds: 60,
            estimatedRemainingSeconds: 60,
          },
          rows: [{
            texto: 'Loaded text',
            tiempoSeconds: 60,
            percentComplete: 0,
            enlace: '',
            comentario: '',
            snapshotRelPath: '',
          }],
        },
      },
    },
  ];

  for (const { mode, expectedName, expectedRowCount, payload } of cases) {
    const focusCalls = [];
    const harness = createHarness({ focusCalls });

    await harness.initializeTask(payload);

    assert.equal(harness.elements.taskNameInput.value, expectedName, `${mode} task name`);
    assert.equal(harness.elements.taskTableBody._children.length, expectedRowCount, `${mode} row count`);
    assert.deepEqual(focusCalls, [], `${mode} initialization must not call focus()`);
    assert.equal(harness.getActiveElement(), null, `${mode} initialization must leave DOM focus untouched`);
  }
});

test('Task Editor stops its buffered bootstrap FIFO after initial payload failure terminalizes it', async () => {
  const harness = createHarness();
  harness.queueTaskInit({
    sourcePath: false,
    task: {
      meta: createTaskMeta('Invalid first task'),
      rows: [],
    },
  });
  harness.queueTaskInit({
    sourcePath: 'later-valid-task.json',
    task: {
      meta: createTaskMeta('Later valid task'),
      rows: [{
        texto: 'Must not materialize after terminal startup failure',
        tiempoSeconds: 60,
        percentComplete: 0,
        enlace: '',
        comentario: '',
        snapshotRelPath: '',
      }],
    },
  });

  await harness.waitForTranslations();
  await harness.waitForTaskSemanticWork();

  assert.equal(harness.elements.taskNameInput.value, '');
  assert.equal(harness.elements.taskTableBody._children.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.dirtyStateCalls)), []);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.terminalStateCalls)), [{
    kind: 'task-payload-application',
    phase: 'no-draft',
    initId: 2,
    dirty: null,
  }]);
});

test('Task Editor reports terminal i18n state even when the terminal reporter throws', async () => {
  const harness = createHarness({
    failInitialI18nTransition: true,
    terminalReporterThrows: true,
  });
  await harness.waitForI18nFailure();

  assert.deepEqual(JSON.parse(JSON.stringify(harness.terminalStateCalls)), [{
    kind: 'startup',
    phase: 'no-draft',
    initId: null,
    dirty: null,
  }]);
});

test('Task Editor does not apply an already-queued init payload after terminal i18n failure', async () => {
  const harness = createHarness({ terminalTransitionLanguage: 'es' });
  await harness.waitForTranslations();
  await harness.waitForTaskSemanticWork();

  const terminalSettingsUpdate = harness.queueSettings({ language: 'es' });
  harness.queueTaskInit({
    sourcePath: 'task.json',
    task: {
      meta: createTaskMeta(),
      rows: [{
        texto: 'Must not render after terminal i18n failure',
        tiempoSeconds: 60,
        percentComplete: 0,
        enlace: '',
        comentario: '',
        snapshotRelPath: '',
      }],
    },
  });

  await terminalSettingsUpdate;
  await harness.waitForTaskSemanticWork();

  assert.equal(harness.elements.taskTableBody._children.length, 0);
});

test('Task Editor rejects noncanonical initialized row data instead of coercing it', async () => {
  const invalidDurationHarness = createHarness();

  await invalidDurationHarness.initializeRow({ tiempoSeconds: 12.5 });
  assert.equal(invalidDurationHarness.elements.taskTableBody._children.length, 0);
  assert.match(
    String(invalidDurationHarness.errorLogs.at(-1)),
    /copyTaskRowData requires canonical tiempoSeconds/
  );

  const malformedTextHarness = createHarness();
  await malformedTextHarness.initializeRow({ texto: 42 });
  assert.equal(malformedTextHarness.elements.taskTableBody._children.length, 0);
  assert.match(
    String(malformedTextHarness.errorLogs.at(-1)),
    /copyTaskRowData requires string task fields/
  );
});

test('Task Editor does not replace a rendered task when a successful init payload breaks the main-process summary contract', async () => {
  const harness = createHarness();
  await harness.initializeRow();

  await harness.initializeTask({
    sourcePath: 'overflow.json',
    task: {
      meta: createTaskMeta('Overflow'),
      rows: [
        {
          texto: 'Long reading',
          tiempoSeconds: Number.MAX_SAFE_INTEGER,
          percentComplete: 0,
          enlace: '',
          comentario: '',
          snapshotRelPath: '',
        },
        {
          texto: 'One second reading',
          tiempoSeconds: 1,
          percentComplete: 0,
          enlace: '',
          comentario: '',
          snapshotRelPath: '',
        },
      ],
    },
  });

  assert.equal(harness.elements.taskNameInput.value, 'Task');
  assert.equal(harness.findInputByHeaderId('thTiempo').value, '00:01:00');
  assert.equal(harness.elements.taskSummaryTotalValue.textContent, '00:01:00');
  assert.match(String(harness.errorLogs.at(-1)), /task-editor-init summary invalid: INVALID_SUMMARY/);
});

test('Task Editor rejects a malformed init source path before committing candidate state', async () => {
  const harness = createHarness();
  await harness.initializeRow();

  await harness.initializeTask({
    sourcePath: false,
    task: {
      meta: createTaskMeta('Replacement'),
      rows: [],
    },
  });

  assert.equal(harness.elements.taskNameInput.value, 'Task');
  assert.equal(harness.elements.taskTableBody._children.length, 1);
  assert.equal(harness.elements.taskSummaryTotalValue.textContent, '00:01:00');
  assert.match(String(harness.errorLogs.at(-1)), /task-editor-init payload has invalid sourcePath/);
});

test('Task Editor reports a malformed successful library response instead of rendering an empty library', async () => {
  const harness = createHarness();
  harness.setLibraryListResult({ ok: true, items: null });

  harness.elements.btnTaskLoadLibrary.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(harness.notifications, ['renderer.tasks.alerts.library_load_error']);
  assert.equal(harness.elements.libraryEmpty.hidden, true);
});

test('Task Editor materializes absent optional library fields only at the library-to-row boundary', async () => {
  const harness = createHarness();
  harness.setLibraryListResult({
    ok: true,
    items: [{
      texto: 'Read chapter',
      tiempoSeconds: 60,
      enlace: '',
    }],
  });

  harness.elements.btnTaskLoadLibrary.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));

  const libraryLoadButton = harness.findByIconIn(harness.elements.libraryList, 'task-row-load');
  assert.ok(libraryLoadButton);
  libraryLoadButton.dispatch('click');

  assert.equal(harness.elements.taskTableBody._children.length, 1);
  assert.equal(harness.elements.libraryModal.getAttribute('aria-hidden'), 'true');
});

test('Task Editor rejects malformed optional library fields before they can become task-row defaults', async () => {
  const harness = createHarness();
  harness.setLibraryListResult({
    ok: true,
    items: [{
      texto: 'Read chapter',
      tiempoSeconds: 60,
      enlace: '',
      comentario: false,
    }],
  });

  harness.elements.btnTaskLoadLibrary.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(harness.notifications, ['renderer.tasks.alerts.library_load_error']);
  assert.equal(harness.elements.taskTableBody._children.length, 0);
  assert.equal(harness.findByIconIn(harness.elements.libraryList, 'task-row-load'), null);
});

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

test('Task Editor displays a canonical Snapshot path in the second table column', async () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../../../public/task_editor.html'), 'utf8');
  const styles = fs.readFileSync(path.resolve(__dirname, '../../../public/task_editor.css'), 'utf8');
  const colGroup = markup.match(/<colgroup id="taskColGroup">([\s\S]*?)<\/colgroup>/);
  const tableHeader = markup.match(/<thead>([\s\S]*?)<\/thead>/);

  assert.ok(colGroup);
  assert.ok(tableHeader);
  assert.deepEqual(
    [...colGroup[1].matchAll(/<col data-col="([^"]+)"/g)].map((match) => match[1]),
    ['texto', 'comentario', 'tiempo', 'percent', 'falta', 'enlace', 'acciones']
  );
  assert.deepEqual(
    [...tableHeader[1].matchAll(/<th\b[^>]*\bid="([^"]+)"/g)].map((match) => match[1]),
    ['thTexto', 'thComentario', 'thTiempo', 'thPercent', 'thFalta', 'thEnlace', 'thAcciones']
  );

  const harness = createHarness();
  await harness.initializeRow({ snapshotRelPath: '/canonical-target.txt' });
  const cells = harness.elements.taskTableBody._children[0]._children;

  assert.equal(cells[1].className, 'task-cell--comment');
  assert.equal(cells[2].className, 'task-cell--time');
  const commentControls = cells[1]._children[0]._children;
  assert.deepEqual(
    commentControls.map((element) => element.getAttribute('data-tot-icon')).filter(Boolean),
    ['task-text-snapshot-load', 'task-comment']
  );
  const snapshotButton = commentControls[0];
  const snapshotDescription = commentControls[1];
  assert.equal(snapshotButton.getAttribute('aria-describedby'), snapshotDescription.id);
  assert.equal(snapshotDescription.className, 'task-editor-accessible-description');
  assert.equal(snapshotDescription._children[1].tagName, 'bdi');
  assert.equal(snapshotDescription._children[1].getAttribute('dir'), 'ltr');
  assert.equal(snapshotDescription._children[1].textContent, '/canonical-target.txt');
  assert.equal(
    snapshotButton.getAttribute('data-tot-tooltip'),
    'Load text snapshot as current text · Associated path: \u2068/canonical-target.txt\u2069'
  );
  assert.equal(cells[2]._children[0].getAttribute('aria-labelledby'), 'thTiempo');
  assert.match(styles, /\.task-table \.task-cell--comment > \.cell-actions\s*\{\s*justify-content: center;\s*\}/);
  assert.match(styles, /\.task-table \.task-cell--remaining\s*\{\s*white-space: nowrap;\s*text-align: right;\s*\}/);
  assert.doesNotMatch(styles, /\.task-table td:nth-child\(/);
});

test('Task Editor assigns expanded names and visual tooltips to abbreviated headers', async () => {
  const harness = createHarness();
  await harness.waitForTranslations();

  assert.equal(harness.elements.thTexto.title, '');
  assert.equal(harness.elements.thComentario.textContent, 'renderer.tasks.columns.comentario');
  ['comentario', 'tiempo', 'percent', 'falta'].forEach((column) => {
    const headerId = {
      comentario: 'thComentario',
      tiempo: 'thTiempo',
      percent: 'thPercent',
      falta: 'thFalta',
    }[column];
    const header = harness.elements[headerId];
    const expandedNameKey = `renderer.tasks.columns.header_names.${column}`;
    assert.equal(header.getAttribute('aria-label'), expandedNameKey);
    assert.equal(header.getAttribute('data-tot-tooltip'), expandedNameKey);
    assert.equal(header.title, '');
  });
  assert.equal(harness.elements.thTexto.getAttribute('aria-label'), null);
  assert.equal(harness.elements.thTexto.getAttribute('data-tot-tooltip'), null);
  assert.equal(harness.elements.thEnlace.title, '');
  assert.equal(harness.elements.thEnlace.getAttribute('aria-label'), null);
  assert.equal(harness.elements.thAcciones.title, '');
  assert.equal(harness.elements.thAcciones.getAttribute('aria-label'), null);
});

test('English and Spanish define Task Editor expanded header names and icon-control names', () => {
  const expectedCopy = {
    en: {
      label: 'C+S',
      headerName: 'Comment and text snapshot',
      commentName: 'Add a comment or a text snapshot',
    },
    es: {
      label: 'C+S',
      headerName: 'Comentario y snapshot de texto',
      commentName: 'Agregar un comentario o un snapshot de texto',
    },
  };

  Object.entries(expectedCopy).forEach(([tag, copy]) => {
    const rendererPath = path.resolve(__dirname, `../../../i18n/${tag}/renderer.json`);
    const renderer = JSON.parse(fs.readFileSync(rendererPath, 'utf8'));
    const columns = renderer.renderer.tasks.columns;

    assert.equal(columns.comentario, copy.label, `${tag} C+S header label mismatch`);
    assert.equal(columns.header_names.comentario, copy.headerName, `${tag} expanded header mismatch`);
    assert.equal(columns.names.comment, copy.commentName, `${tag} comment-control name mismatch`);
    assert.match(columns.descriptions.snapshot_path, /\{path\}/);
    assert.match(columns.tooltips.snapshot_load_with_path, /\{path\}/);
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

test('every shipped locale and the overriding es-cl bundle define the Task Editor duration-overflow notice', () => {
  const languages = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../i18n/languages.json'), 'utf8'));
  const getNotice = (renderer) => renderer.renderer.tasks.alerts.task_duration_too_large;

  languages.forEach(({ tag }) => {
    const renderer = JSON.parse(fs.readFileSync(
      path.resolve(__dirname, `../../../i18n/${tag}/renderer.json`),
      'utf8'
    ));
    const notice = getNotice(renderer);
    assert.equal(typeof notice, 'string', `${tag} duration-overflow notice missing`);
    assert.ok(notice.trim(), `${tag} duration-overflow notice empty`);
  });

  const esClRenderer = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../../../i18n/es/es-cl/renderer.json'),
    'utf8'
  ));
  const esClNotice = getNotice(esClRenderer);
  assert.equal(typeof esClNotice, 'string', 'es-cl duration-overflow notice missing');
  assert.ok(esClNotice.trim(), 'es-cl duration-overflow notice empty');
});

test('English and Spanish define the Task Editor snapshot-source reminder copy', () => {
  const expectedCopy = {
    en: {
      title: 'Snapshot source reminder',
      message: 'This row is associated with a text snapshot. Check its source comment before selecting a local file.',
      source_comment: 'Snapshot source comment:',
      select_file: 'Select local file',
      cancel: 'Cancel',
      close_aria: 'Close snapshot source reminder',
    },
    es: {
      title: 'Recordatorio del origen del snapshot',
      message: 'Esta fila está asociada a un snapshot de texto. Revisa su comentario de origen antes de seleccionar un archivo local.',
      source_comment: 'Comentario de origen del snapshot:',
      select_file: 'Seleccionar archivo local',
      cancel: 'Cancelar',
      close_aria: 'Cerrar el recordatorio del origen del snapshot',
    },
  };

  Object.entries(expectedCopy).forEach(([tag, expected]) => {
    const renderer = JSON.parse(fs.readFileSync(
      path.resolve(__dirname, `../../../i18n/${tag}/renderer.json`),
      'utf8'
    ));
    assert.deepEqual(renderer.renderer.tasks.comentario_modal.snapshot_source_reminder, expected);
  });
});

test('task-editor modals use their reviewed initial targets and restore each opener', async () => {
  const harness = createHarness();
  await harness.initializeRow();

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

test('Task Editor Escape closes the focused visible dialog through its existing close path', async () => {
  const harness = createHarness();
  await harness.initializeRow();

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

test('Task Editor shows a selected snapshot source comment before local-file selection', async () => {
  const harness = createHarness();
  await harness.initializeRow({ snapshotRelPath: '/chapter-1.json' });
  harness.setTaskRowSnapshotInspectionResult({
    ok: true,
    name: null,
    sourceComment: 'chapter-1.pdf',
    estimatedSeconds: null,
    wpm: null,
  });
  harness.setTaskFileSelectionResult({ ok: true, filePath: 'C:\\Books\\chapter-1.pdf' });

  const fileSelectOpener = harness.findByIcon('folder');
  const linkInput = harness.findInputByHeaderId('thEnlace');
  assert.ok(fileSelectOpener);
  assert.ok(linkInput);
  fileSelectOpener.focus();
  fileSelectOpener.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(harness.snapshotInspectionCalls, ['/chapter-1.json']);
  assert.equal(harness.elements.snapshotSourceReminderModal.getAttribute('aria-hidden'), 'false');
  assert.equal(harness.elements.snapshotSourceReminderCommentValue.textContent, 'chapter-1.pdf');
  assert.equal(harness.getActiveElement(), harness.elements.snapshotSourceReminderSelectFile);
  assert.deepEqual(harness.taskFileSelectionCalls, []);

  harness.elements.snapshotSourceReminderCancel.dispatch('click');
  assert.equal(harness.elements.snapshotSourceReminderModal.getAttribute('aria-hidden'), 'true');
  assert.equal(harness.getActiveElement(), fileSelectOpener);
  assert.deepEqual(harness.taskFileSelectionCalls, []);

  fileSelectOpener.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
  harness.elements.snapshotSourceReminderSelectFile.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.elements.snapshotSourceReminderModal.getAttribute('aria-hidden'), 'true');
  assert.deepEqual(harness.taskFileSelectionCalls, [true]);
  assert.equal(linkInput.value, 'C:\\Books\\chapter-1.pdf');
});

test('Task Editor selects a local file directly when snapshot-source inspection has no usable comment', async () => {
  const noCommentHarness = createHarness();
  await noCommentHarness.initializeRow({ snapshotRelPath: '/no-comment.json' });
  noCommentHarness.setTaskRowSnapshotInspectionResult({
    ok: true,
    name: null,
    sourceComment: null,
    estimatedSeconds: null,
    wpm: null,
  });
  noCommentHarness.setTaskFileSelectionResult({ ok: true, filePath: 'C:\\Books\\no-comment.pdf' });

  const noCommentLinkInput = noCommentHarness.findInputByHeaderId('thEnlace');
  noCommentHarness.findByIcon('folder').dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(noCommentHarness.elements.snapshotSourceReminderModal.getAttribute('aria-hidden'), 'true');
  assert.deepEqual(noCommentHarness.taskFileSelectionCalls, [true]);
  assert.equal(noCommentLinkInput.value, 'C:\\Books\\no-comment.pdf');

  const invalidSnapshotHarness = createHarness();
  await invalidSnapshotHarness.initializeRow({ snapshotRelPath: '/invalid.json' });
  invalidSnapshotHarness.setTaskRowSnapshotInspectionResult({ ok: false, code: 'INVALID_SCHEMA' });
  invalidSnapshotHarness.setTaskFileSelectionResult({ ok: true, filePath: 'C:\\Books\\replacement.pdf' });

  const invalidSnapshotLinkInput = invalidSnapshotHarness.findInputByHeaderId('thEnlace');
  invalidSnapshotHarness.findByIcon('folder').dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(invalidSnapshotHarness.elements.snapshotSourceReminderModal.getAttribute('aria-hidden'), 'true');
  assert.deepEqual(invalidSnapshotHarness.taskFileSelectionCalls, [true]);
  assert.equal(invalidSnapshotLinkInput.value, 'C:\\Books\\replacement.pdf');
});

test('Task Editor applies the changed snapshot estimate only after confirmation', async () => {
  const harness = createHarness();
  await harness.initializeRow();
  harness.setSelectedTaskRowSnapshotResult({ ok: true, snapshotRelPath: '/estimated.txt' });
  harness.setTaskRowSnapshotInspectionResult({
    ok: true,
    name: null,
    sourceComment: null,
    estimatedSeconds: 120,
    wpm: 200,
  });

  harness.findByIcon('task-comment').dispatch('click');
  harness.elements.commentSnapshotSelect.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
  harness.elements.commentSave.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(harness.snapshotInspectionCalls, ['/estimated.txt']);
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
  await harness.initializeRow();
  harness.setSelectedTaskRowSnapshotResult({ ok: true, snapshotRelPath: '/named-estimated.json' });
  harness.setTaskRowSnapshotInspectionResult({
    ok: true,
    name: 'Snapshot title',
    sourceComment: null,
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
  await harness.initializeRow();
  harness.setSelectedTaskRowSnapshotResult({ ok: true, snapshotRelPath: '/named.json' });
  harness.setTaskRowSnapshotInspectionResult({
    ok: true,
    name: 'Snapshot title',
    sourceComment: null,
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
  await harness.initializeRow({ texto: '' });
  harness.setSelectedTaskRowSnapshotResult({ ok: true, snapshotRelPath: '/named.json' });
  harness.setTaskRowSnapshotInspectionResult({
    ok: true,
    name: 'Snapshot title',
    sourceComment: null,
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
  await noHarness.initializeRow();
  noHarness.setSelectedTaskRowSnapshotResult({ ok: true, snapshotRelPath: '/estimated.json' });
  noHarness.setTaskRowSnapshotInspectionResult({
    ok: true,
    name: null,
    sourceComment: null,
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
  await dismissHarness.initializeRow();
  dismissHarness.setSelectedTaskRowSnapshotResult({ ok: true, snapshotRelPath: '/estimated.json' });
  dismissHarness.setTaskRowSnapshotInspectionResult({
    ok: true,
    name: null,
    sourceComment: null,
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
  await noDetailsHarness.initializeRow();
  noDetailsHarness.setSelectedTaskRowSnapshotResult({ ok: true, snapshotRelPath: '/without-details.json' });
  noDetailsHarness.setTaskRowSnapshotInspectionResult({
    ok: true,
    name: null,
    sourceComment: null,
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
  await noChangeHarness.initializeRow();
  noChangeHarness.setSelectedTaskRowSnapshotResult({ ok: true, snapshotRelPath: '/unchanged.json' });
  noChangeHarness.setTaskRowSnapshotInspectionResult({
    ok: true,
    name: 'Text',
    sourceComment: null,
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
  await invalidHarness.initializeRow();
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
  assert.match(markup, /<p id="includeCommentText">¿Incluir el comentario\? Si esta lectura tiene un snapshot de texto seleccionado, su asociación se guardará de todos modos\.<\/p>/);
  assert.match(markup, /id="snapshotSourceReminderModal"[^>]*aria-labelledby="snapshotSourceReminderTitle"[^>]*aria-describedby="snapshotSourceReminderText"/);
  assert.match(markup, /<dl class="snapshot-source-reminder-values">\s*<dt\b[^>]*\bid="snapshotSourceReminderCommentLabel"[^>]*>Comentario de origen del snapshot:<\/dt>\s*<dd\b[^>]*\bid="snapshotSourceReminderCommentValue"[^>]*\bdir="auto"[^>]*><\/dd>\s*<\/dl>/);
  assert.match(markup, /id="snapshotDetailsConfirmModal"[^>]*aria-labelledby="snapshotDetailsConfirmTitle"[^>]*aria-describedby="snapshotDetailsConfirmText"/);
  assert.match(markup, /<dd\b[^>]*\bid="snapshotSourceReminderCommentValue"[^>]*\bdir="auto"[^>]*><\/dd>/);
  assert.match(markup, /<legend id="snapshotDetailsConfirmTextChoice">/);
  assert.match(markup, /<legend id="snapshotDetailsConfirmTimeChoice">/);
  assert.equal(
    (markup.match(/class="snapshot-details-confirm-toggle native-checkbox-option"/g) || []).length,
    2
  );
  assert.match(markup, /<input\b[^>]*\bid="snapshotDetailsConfirmApplyText"[^>]*\btype="checkbox"[^>]*\bchecked\b[^>]*\/>/);
  assert.match(markup, /<input\b[^>]*\bid="snapshotDetailsConfirmApplyTime"[^>]*\btype="checkbox"[^>]*\bchecked\b[^>]*\/>/);
  assert.match(markup, /<dt\b[^>]*\bid="snapshotDetailsConfirmWpmLabel"[^>]*>Velocidad de lectura<\/dt>/);
  assert.match(markup, /<dd\b[^>]*\bid="snapshotDetailsConfirmWpmValue"[^>]*\bdir="ltr"[^>]*><\/dd>/);
  assert.match(markup, /<dl class="snapshot-details-confirm-name-values">/);
  assert.match(markup, /<dl class="snapshot-details-confirm-time-values">/);
  assert.match(styles, /\.modal-actions\s*\{\s*display: flex;\s*justify-content: flex-end;\s*gap: 12px;\s*flex-wrap: wrap;\s*\}/);
  assert.match(styles, /\.btn-standard:disabled\s*\{\s*opacity: 0\.5;\s*cursor: not-allowed;\s*\}/);
  assert.match(styles, /#snapshotDetailsConfirmText\s*\{\s*font-size: var\(--font-size-9\);\s*\}/);
  assert.match(styles, /\.snapshot-source-reminder-values\s*\{\s*display: grid;\s*gap: 4px;\s*margin: 0;\s*\}/);
  assert.match(styles, /\.snapshot-source-reminder-values dd\s*\{\s*max-height: 132px;\s*box-sizing: border-box;\s*overflow: auto;\s*overflow-wrap: anywhere;\s*padding: 10px 12px;\s*border: 1px solid var\(--group-border-color\);\s*border-radius: 8px;\s*background: var\(--app-primary-bg\);\s*\}/);
  assert.match(styles, /\.snapshot-details-confirm-section\s*\{[^}]*font-size: var\(--font-size-9\);/);
  assert.match(styles, /\.snapshot-details-confirm-time-values > div\s*\{\s*display: contents;\s*\}/);
  assert.match(styles, /\.snapshot-details-confirm-time-values\s*\{\s*grid-template-columns: max-content max-content;\s*justify-content: center;\s*align-items: baseline;\s*column-gap: 12px;\s*\}/);
  assert.match(styles, /\.snapshot-details-confirm-time-values dt\s*\{\s*justify-self: end;\s*\}/);
  assert.match(styles, /\.native-checkbox-option > input\[type="checkbox"\]\s*\{\s*flex: 0 0 auto;\s*margin: 0;\s*accent-color: var\(--control-accent\);\s*cursor: inherit;\s*\}/);
  assert.match(styles, /\.snapshot-details-confirm-section legend\[hidden\]\s*\{\s*display: none;\s*\}/);
  assert.match(styles, /\.snapshot-details-confirm-name-values dd\.is-empty\s*\{\s*color: var\(--text-soft\);/);
});

test('every shipped locale explains that a selected text snapshot association is always saved', () => {
  const expectedRootCopy = {
    ar: 'هل تريد تضمين التعليق؟ إذا كانت لهذه القراءة لقطة نصية محددة، فسيُحفظ ارتباطها في كلتا الحالتين.',
    arn: '¿Müleael nütram? Tüfa chi ruka mew textu snapshot mülelu, ñi trawün rume elkünuay.',
    ay: 'Comentario uchañati? Aka siqitaki qillqata snapshot ajllitächi ukhaxa, ukamp chikt’atapaxa kunjamäkipansa imatäniwa.',
    bn: 'মন্তব্য অন্তর্ভুক্ত করবেন? এই পাঠের জন্য কোনো টেক্সট স্ন্যাপশট নির্বাচিত থাকলে, তার সংযোগ উভয় ক্ষেত্রেই সংরক্ষিত হবে।',
    ca: 'Incloure el comentari? Si aquesta lectura té un snapshot de text seleccionat, la seva associació es desarà en qualsevol cas.',
    de: 'Kommentar einbeziehen? Wenn für diese Lektüre ein Text-Snapshot ausgewählt ist, wird die Verknüpfung in jedem Fall gespeichert.',
    en: 'Include the comment? If this reading has a selected text snapshot, its association will be saved either way.',
    es: '¿Incluir el comentario? Si esta lectura tiene un snapshot de texto seleccionado, su asociación se guardará de todos modos.',
    eu: 'Iruzkina sartu? Irakurketa honek testu-snapshot bat hautatuta badu, haren lotura edonola ere gordeko da.',
    fa: 'نظر هم ذخیره شود؟ اگر برای این خواندنی یک اسنپ‌شات متن انتخاب شده باشد، پیوند آن در هر صورت ذخیره می‌شود.',
    fr: 'Inclure le commentaire ? Si cette lecture a un snapshot de texte sélectionné, son association sera enregistrée dans tous les cas.',
    gn: '¿Emoĩ ñe’ẽjoapy? Ko tysýi oguerekóramo peteĩ jehai ra’ãnga ñongatupy ojeporavóva, upe ojoajuha oñeñongatúta taha’e ha’éva.',
    hi: 'क्या टिप्पणी शामिल करनी है? अगर इस पठन के लिए टेक्स्ट स्नैपशॉट चुना गया है, तो उसका संबंध हर स्थिति में सहेजा जाएगा।',
    ht: 'Mete kòmantè a ladan? Si lekti sa a gen yon snapshot tèks ki chwazi, lyen li ap toujou sove.',
    id: 'Sertakan komentar? Jika ada snapshot teks yang dipilih untuk bacaan ini, kaitannya akan tetap disimpan.',
    it: 'Includere il commento? Se per questa lettura è selezionato uno snapshot di testo, la relativa associazione verrà salvata comunque.',
    ja: 'コメントを含めますか？この読書項目にテキストスナップショットが選択されている場合、その関連付けはどちらの場合も保存されます。',
    ko: '댓글을 포함할까요? 이 읽기 항목에 텍스트 스냅샷이 선택되어 있으면, 어느 쪽을 선택해도 연결 정보가 저장됩니다.',
    mi: 'Whakaurua te kōrero? Mēnā he hopunga kuputuhi kua tīpakohia mō tēnei pānuitanga, ka tiakina tōna hononga ahakoa te kōwhiringa.',
    pcm: 'Include comment? If dis reading get selected text snapshot, di link go save whether you include am or not.',
    pt: 'Incluir o comentário? Se houver um snapshot de texto selecionado para esta leitura, a associação será salva de qualquer forma.',
    qu: 'Rimayta churaychu? Kay siqipi qillqa snapshot akllasqa kaptinqa, tinkisqan imayna kaptinpas waqaychasqa kanqa.',
    ru: 'Включить комментарий? Если для этой записи выбран текстовый снапшот, его связь будет сохранена в любом случае.',
    sv: 'Inkludera kommentar? Om en textsnapshot är vald för den här läsningen sparas kopplingen oavsett vilket alternativ du väljer.',
    sw: 'Jumuisha maoni? Ikiwa somo hili lina snapshot ya maandishi iliyochaguliwa, uhusiano wake utahifadhiwa kwa vyovyote.',
    tr: 'Yorum dahil edilsin mi? Bu okuma için bir metin snapshot\'ı seçilmişse, bağlantısı her durumda kaydedilir.',
    ur: 'تبصرہ شامل کریں؟ اگر اس مطالعے کے لیے متن کا اسنیپ شاٹ منتخب ہے تو اس کا تعلق ہر صورت محفوظ ہو جائے گا۔',
    vi: 'Bao gồm bình luận? Nếu có bản lưu văn bản được chọn cho mục đọc này, liên kết của bản đó vẫn sẽ được lưu trong mọi trường hợp.',
    'zh-Hans': '包含评论？如果此阅读条目已选择文本快照，无论选择哪一项，关联都会保存。',
    'zh-Hant': '包含註解？如果此閱讀項目已選取文字快照，無論選擇哪一項，關聯都會儲存。',
    zu: 'Faka ukuphawula? Uma kukhethwe i-snapshot yombhalo yalokhu kufunda, ukuxhumana kwayo kuzolondolozwa noma ngabe ukhetha ini.',
  };
  const languages = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../i18n/languages.json'), 'utf8'));

  assert.deepEqual(
    Object.keys(expectedRootCopy).sort(),
    languages.map(({ tag }) => tag).sort(),
    'snapshot-persistence copy must cover every shipped root locale'
  );

  Object.entries(expectedRootCopy).forEach(([tag, expected]) => {
    const rendererPath = path.resolve(__dirname, '../../../i18n/' + tag.toLowerCase() + '/renderer.json');
    const renderer = JSON.parse(fs.readFileSync(rendererPath, 'utf8'));
    assert.equal(
      renderer.renderer.tasks.guardar_lectura_modal.library_save_question,
      expected,
      tag + ' snapshot-persistence copy mismatch'
    );
  });

  const chile = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, '../../../i18n/es/es-cl/renderer.json'),
    'utf8'
  ));
  assert.equal(
    chile.renderer.tasks.guardar_lectura_modal.library_save_question,
    '¿Incluir opinión? Si esta lectura tiene un coso de texto seleccionado, la asociación se salva igual.'
  );
});

test('Task Editor projects a live row into an exact library entry before IPC', async () => {
  const harness = createHarness();
  await harness.initializeTask({
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
  await harness.initializeRow();

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
  await harness.initializeRow();

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

test('Task Editor time and percentage inputs show invalid chrome while editing and restore canonical values', async () => {
  const harness = createHarness();
  await harness.initializeRow();

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

test('Task Editor displays exact row and aggregate remaining whole seconds', async () => {
  const harness = createHarness();
  await harness.initializeRow({ tiempoSeconds: 5, percentComplete: 80 });

  const cells = harness.elements.taskTableBody._children[0]._children;
  const remainingCell = cells.find((cell) => cell.className === 'task-cell--remaining');
  assert.ok(remainingCell);
  assert.equal(remainingCell._children[0].textContent, '00:00:01');
  assert.equal(harness.elements.taskSummaryTotalValue.textContent, '00:00:05');
  assert.equal(harness.elements.taskSummaryLeftValue.textContent, '00:00:01');
});

test('Task Editor rejects a manual duration edit that would overflow the aggregate summary atomically', async () => {
  const harness = createHarness();
  const stopwatchUtils = createStopwatchTimeUtils();
  const previousSeconds = Number.MAX_SAFE_INTEGER - 1;
  await harness.initializeTask({
    sourcePath: 'task.json',
    task: {
      meta: createTaskMeta(),
      rows: [
        {
          texto: 'Long reading',
          tiempoSeconds: previousSeconds,
          percentComplete: 0,
          enlace: '',
          comentario: '',
          snapshotRelPath: '',
        },
        {
          texto: 'One second reading',
          tiempoSeconds: 1,
          percentComplete: 0,
          enlace: '',
          comentario: '',
          snapshotRelPath: '',
        },
      ],
    },
  });

  const timeInput = harness.findInputByHeaderId('thTiempo');
  const previousDirtyStateCalls = harness.dirtyStateCalls.slice();
  const expectedSummary = stopwatchUtils.formatClockSeconds(Number.MAX_SAFE_INTEGER);
  assert.ok(timeInput);
  assert.equal(harness.elements.taskSummaryTotalValue.textContent, expectedSummary);

  timeInput.value = expectedSummary;
  timeInput.dispatch('input');
  timeInput.dispatch('blur');

  assert.equal(timeInput.value, stopwatchUtils.formatClockSeconds(previousSeconds));
  assert.equal(harness.elements.taskSummaryTotalValue.textContent, expectedSummary);
  assert.deepEqual(harness.notifications, ['renderer.tasks.alerts.task_duration_too_large']);
  assert.deepEqual(harness.dirtyStateCalls, previousDirtyStateCalls);
});

test('Task Editor keeps a snapshot confirmation open when its selected estimate would overflow the aggregate summary', async () => {
  const harness = createHarness();
  const stopwatchUtils = createStopwatchTimeUtils();
  const previousSeconds = Number.MAX_SAFE_INTEGER - 1;
  await harness.initializeTask({
    sourcePath: 'task.json',
    task: {
      meta: createTaskMeta(),
      rows: [
        {
          texto: 'Long reading',
          tiempoSeconds: previousSeconds,
          percentComplete: 0,
          enlace: '',
          comentario: '',
          snapshotRelPath: '',
        },
        {
          texto: 'One second reading',
          tiempoSeconds: 1,
          percentComplete: 0,
          enlace: '',
          comentario: '',
          snapshotRelPath: '',
        },
      ],
    },
  });
  harness.setSelectedTaskRowSnapshotResult({ ok: true, snapshotRelPath: '/overflow.json' });
  harness.setTaskRowSnapshotInspectionResult({
    ok: true,
    name: null,
    sourceComment: null,
    estimatedSeconds: Number.MAX_SAFE_INTEGER,
    wpm: 200,
  });

  harness.findByIcon('task-comment').dispatch('click');
  harness.elements.commentSnapshotSelect.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
  harness.elements.commentSave.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
  harness.elements.snapshotDetailsConfirmApply.dispatch('click');

  assert.equal(harness.elements.snapshotDetailsConfirmModal.getAttribute('aria-hidden'), 'false');
  assert.equal(harness.elements.commentModal.getAttribute('aria-hidden'), 'false');
  assert.equal(
    harness.findInputByHeaderId('thTiempo').value,
    stopwatchUtils.formatClockSeconds(previousSeconds)
  );
  assert.equal(
    harness.elements.taskSummaryTotalValue.textContent,
    stopwatchUtils.formatClockSeconds(Number.MAX_SAFE_INTEGER)
  );
  assert.equal(harness.findByIcon('task-text-snapshot-load'), null);
  assert.deepEqual(harness.notifications, ['renderer.tasks.alerts.task_duration_too_large']);
});

test('Task Editor keeps the library open when loading its row would overflow the aggregate summary', async () => {
  const harness = createHarness();
  const stopwatchUtils = createStopwatchTimeUtils();
  await harness.initializeTask({
    sourcePath: 'task.json',
    task: {
      meta: createTaskMeta(),
      rows: [{
        texto: 'Long reading',
        tiempoSeconds: Number.MAX_SAFE_INTEGER,
        percentComplete: 0,
        enlace: '',
        comentario: '',
        snapshotRelPath: '',
      }],
    },
  });
  harness.setLibraryListResult({
    ok: true,
    items: [{
      texto: 'One second reading',
      tiempoSeconds: 1,
      enlace: '',
    }],
  });

  harness.elements.btnTaskLoadLibrary.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
  const libraryLoadButton = harness.findByIconIn(harness.elements.libraryList, 'task-row-load');
  assert.ok(libraryLoadButton);
  libraryLoadButton.dispatch('click');

  assert.equal(harness.elements.libraryModal.getAttribute('aria-hidden'), 'false');
  assert.equal(harness.elements.taskTableBody._children.length, 1);
  assert.equal(
    harness.elements.taskSummaryTotalValue.textContent,
    stopwatchUtils.formatClockSeconds(Number.MAX_SAFE_INTEGER)
  );
  assert.deepEqual(harness.notifications, ['renderer.tasks.alerts.task_duration_too_large']);
});

test('Task Editor save highlights and focuses the first empty reading field', async () => {
  const harness = createHarness();
  await harness.initializeRow();

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
  await harness.initializeRow();

  harness.elements.taskNameInput.value = '   ';
  harness.elements.taskNameInput.dispatch('input');
  harness.elements.btnTaskSave.dispatch('click');
  assert.equal(harness.elements.taskNameInput.classList.contains('is-invalid'), true);
  assert.equal(harness.elements.taskNameInput.getAttribute('aria-invalid'), 'true');

  await harness.initializeTask({
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
  await harness.initializeTask({});
  assert.equal(harness.elements.taskNameInput.classList.contains('is-invalid'), true);
  assert.equal(harness.elements.taskNameInput.getAttribute('aria-invalid'), 'true');
  assert.match(String(harness.errorLogs.at(-1)), /task-editor-init payload missing operational task state/);

  harness.elements.btnTaskDelete.dispatch('click');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.elements.taskNameInput.value, '');
  assert.equal(harness.elements.taskNameInput.classList.contains('is-invalid'), false);
  assert.equal(harness.elements.taskNameInput.getAttribute('aria-invalid'), 'false');
});
