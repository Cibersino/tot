'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createClassList() {
  const values = new Set();
  return {
    add(...names) {
      names.forEach((name) => values.add(name));
    },
    remove(...names) {
      names.forEach((name) => values.delete(name));
    },
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

function createElement(id = '') {
  const listeners = {};
  return {
    id,
    value: '',
    hidden: false,
    disabled: false,
    checked: false,
    readOnly: false,
    placeholder: '',
    title: '',
    attributes: {},
    style: {
      values: {},
      setProperty(name, value) {
        this.values[name] = value;
      },
    },
    listeners,
    classList: createClassList(),
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name)
        ? this.attributes[name]
        : null;
    },
    addEventListener(type, listener) {
      if (!listeners[type]) listeners[type] = [];
      listeners[type].push(listener);
    },
    dispatch(type, event = {}) {
      const entries = listeners[type] || [];
      entries.forEach((listener) => listener(event));
    },
    focus() {},
    select() {},
  };
}

function createEditorUiHarness({ resolveDirection = () => 'ltr' } = {}) {
  const documentElement = {
    style: {
      values: {},
      setProperty(name, value) {
        this.values[name] = value;
      },
    },
  };
  const body = {
    classList: createClassList(),
  };
  const editor = Object.assign(createElement('editorArea'), {
    value: 'rtl:seed',
    clientHeight: 600,
    scrollHeight: 600,
    scrollTop: 0,
  });

  const sandbox = {
    window: {
      getLogger() {
        return {
          warn() {},
          warnOnce() {},
          error() {},
          debug() {},
        };
      },
      requestAnimationFrame(cb) {
        cb();
        return 1;
      },
      setTimeout,
      clearTimeout,
    },
    document: {
      body,
      documentElement,
    },
  };

  vm.createContext(sandbox);
  const uiSource = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/editor_ui.js'),
    'utf8'
  );
  vm.runInContext(uiSource, sandbox, { filename: 'public/js/editor_ui.js' });

  const ui = sandbox.window.EditorUI.createEditorUI({
    editorAPI: {},
    DEFAULT_LANG: 'en',
    EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX: 960,
    EDITOR_MAXIMIZED_TEXT_WIDTH_MIN_PX: 480,
    EDITOR_MAXIMIZED_TEXT_WIDTH_MAX_PX: 1600,
    EDITOR_MAXIMIZED_GUTTER_MIN_PX: 40,
    EDITOR_FONT_SIZE_DEFAULT_PX: 20,
    EDITOR_FONT_SIZE_MIN_PX: 12,
    EDITOR_FONT_SIZE_MAX_PX: 36,
    EDITOR_FONT_SIZE_STEP_PX: 2,
    editorMaximizedLayoutCore: require('../../../public/js/lib/editor_maximized_layout_core'),
    rendererI18n: {
      tRenderer() { return ''; },
      msgRenderer(_path, params = {}) { return String(params.value ?? ''); },
      resolveUserTextDirection: resolveDirection,
    },
    dom: {
      editorWrap: createElement('editorWrap'),
      editorLayout: { clientWidth: 1600 },
      editorLeftGutter: createElement('editorLeftGutter'),
      editorTextColumn: { clientWidth: 960 },
      editorRightGutter: createElement('editorRightGutter'),
      editor,
      btnTrash: createElement('btnTrash'),
      calcWhileTyping: createElement('calcWhileTyping'),
      spellcheckToggle: createElement('spellcheckToggle'),
      btnCalc: createElement('btnCalc'),
      calcLabel: createElement('calcLabel'),
      spellcheckLabel: createElement('spellcheckLabel'),
      textSizeControls: createElement('textSizeControls'),
      textSizeLabel: createElement('textSizeLabel'),
      btnTextSizeDecrease: createElement('btnTextSizeDecrease'),
      btnTextSizeIncrease: createElement('btnTextSizeIncrease'),
      btnTextSizeReset: createElement('btnTextSizeReset'),
      textSizeValue: createElement('textSizeValue'),
      readProgress: createElement('readProgress'),
      readProgressLabel: createElement('readProgressLabel'),
      readProgressValue: createElement('readProgressValue'),
      bottomBar: createElement('bottomBar'),
      readingTestPrestartOverlay: createElement('readingTestPrestartOverlay'),
      readingTestPrestartMessage: createElement('readingTestPrestartMessage'),
    },
    state: {
      idiomaActual: 'en',
      translationsLoadedFor: null,
      spellcheckEnabled: true,
      spellcheckAvailable: true,
      editorFontSizePx: 20,
      editorWindowMaximized: false,
      maximizedTextWidthPx: 960,
      editorMarginDrag: null,
      readProgressFramePending: false,
    },
    engine: {
      setCaretSafe() {},
      setSelectionSafe() {},
    },
  });

  return {
    ui,
    editor,
  };
}

function createDefaultAppConstants() {
  return {
    DEFAULT_LANG: 'en',
    PASTE_ALLOW_LIMIT: 100000,
    SMALL_UPDATE_THRESHOLD: 100,
    EDITOR_FONT_SIZE_MIN_PX: 12,
    EDITOR_FONT_SIZE_MAX_PX: 36,
    EDITOR_FONT_SIZE_DEFAULT_PX: 20,
    EDITOR_FONT_SIZE_STEP_PX: 2,
    EDITOR_MAXIMIZED_TEXT_WIDTH_MIN_PX: 480,
    EDITOR_MAXIMIZED_TEXT_WIDTH_MAX_PX: 1600,
    EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX: 960,
    EDITOR_MAXIMIZED_GUTTER_MIN_PX: 40,
    MAX_TEXT_CHARS: 100000,
    applyConfig(cfg = {}) {
      const max = Number(cfg.maxTextChars);
      return Number.isFinite(max) && max > 0 ? max : 100000;
    },
  };
}

function createEditorScriptHarness({
  appConfig = {},
  getAppConfigImpl = async () => appConfig,
  getSettingsImpl = async () => ({
    language: 'en',
    spellcheckEnabled: true,
    spellcheckAvailable: true,
    editorFontSizePx: 20,
  }),
  getInitialCurrentTextSnapshotImpl = async () => ({ ok: true, text: '', revision: 1 }),
  includeInitialCurrentTextSnapshot = true,
  includeAppConstants = true,
  appConstantsOverrides = {},
  omittedAppConstants = [],
  omitStartupPresentation = false,
  initialTextApplyResult = true,
  initialTextApplyThrows = false,
  rejectTransitionLanguage = '',
  transitionFailure = null,
  holdTransitionLanguage = '',
} = {}) {
  const subscriptions = {};
  const updateDirectionCalls = [];
  const transitionLanguages = [];
  const replaceResponses = [];
  const basePresentationReports = [];
  const bootstrapApplyCalls = [];
  const sendCurrentTextCalls = [];
  const errorLogs = [];
  const warnLogs = [];
  const spellcheckStateCalls = [];
  const fontSizeCalls = [];
  const normalInteractionCalls = [];
  let getInitialCurrentTextSnapshotCallCount = 0;
  let releaseHeldTransition = null;
  let resolveHeldTransitionReached = null;
  const heldTransition = holdTransitionLanguage
    ? new Promise((resolve) => { releaseHeldTransition = resolve; })
    : null;
  const heldTransitionReached = holdTransitionLanguage
    ? new Promise((resolve) => { resolveHeldTransitionReached = resolve; })
    : null;

  const elements = {
    editorWrap: createElement('editorWrap'),
    editorLayout: createElement('editorLayout'),
    editorLeftGutter: createElement('editorLeftGutter'),
    editorTextColumn: createElement('editorTextColumn'),
    editorRightGutter: createElement('editorRightGutter'),
    editorArea: createElement('editorArea'),
    btnTrash: createElement('btnTrash'),
    calcWhileTyping: Object.assign(createElement('calcWhileTyping'), { checked: true }),
    spellcheckToggle: createElement('spellcheckToggle'),
    btnCalc: createElement('btnCalc'),
    calcLabel: createElement('calcLabel'),
    spellcheckLabel: createElement('spellcheckLabel'),
    editorTextSizeControls: createElement('editorTextSizeControls'),
    editorTextSizeLabel: createElement('editorTextSizeLabel'),
    btnTextSizeDecrease: createElement('btnTextSizeDecrease'),
    btnTextSizeIncrease: createElement('btnTextSizeIncrease'),
    btnTextSizeReset: createElement('btnTextSizeReset'),
    editorTextSizeValue: createElement('editorTextSizeValue'),
    editorReadProgress: createElement('editorReadProgress'),
    editorReadProgressLabel: createElement('editorReadProgressLabel'),
    editorReadProgressValue: createElement('editorReadProgressValue'),
    bottomBar: createElement('bottomBar'),
    readingTestPrestartOverlay: createElement('readingTestPrestartOverlay'),
    readingTestPrestartMessage: createElement('readingTestPrestartMessage'),
  };

  const document = {
    title: '',
    body: {
      classList: createClassList(),
      addEventListener() {},
    },
    documentElement: {
      style: {
        setProperty() {},
      },
    },
    getElementById(id) {
      return elements[id] || null;
    },
    querySelector(selector) {
      if (selector === '.calc-label') return elements.calcLabel;
      if (selector === '.spellcheck-label') return elements.spellcheckLabel;
      return null;
    },
  };

  const appConstants = createDefaultAppConstants();
  Object.assign(appConstants, appConstantsOverrides);
  for (const name of omittedAppConstants) {
    delete appConstants[name];
  }

  const sandbox = {
    window: {
      location: {
        search: '?firstShowGeneration=1',
      },
      getLogger() {
        return {
          debug() {},
          warn(...args) {
            warnLogs.push(args);
          },
          warnOnce(...args) {
            warnLogs.push(args);
          },
          error(...args) {
            errorLogs.push(args);
          },
          errorOnce(...args) {
            errorLogs.push(args);
          },
        };
      },
      AppConstants: includeAppConstants ? appConstants : undefined,
      EditorMaximizedLayoutCore: {
        clampPreferredTextWidthPx(value, options = {}) {
          return Number(value) || options.defaultPx || 960;
        },
        computeNextPreferredTextWidthPxFromDrag() {
          return 960;
        },
      },
      EditorFindReplaceCore: {
        resolveLiteralMatchByOrdinal() { return null; },
        computeLiteralReplaceAll() {
          return { replacements: 0, nextValue: '' };
        },
      },
      EditorStartupPresentation: {
        parseStartupQuery() {
          return {};
        },
        createStartupPresentationController() {
          return {
            firstShowGeneration: 1,
            isInitiallyMaximized() { return false; },
            captureActualWindowState(windowState) { return windowState || null; },
            releaseStartupLock() { return null; },
          };
        },
      },
      RendererI18n: {
        tRenderer(key) {
          return key;
        },
        resolveUserTextDirection() {
          return 'ltr';
        },
        async transitionRendererTranslations(lang, { applyTranslations } = {}) {
          transitionLanguages.push(lang);
          if (lang === rejectTransitionLanguage) {
            throw transitionFailure || new Error(`Cannot apply ${lang} translations`);
          }
          if (lang === holdTransitionLanguage) {
            resolveHeldTransitionReached();
            await heldTransition;
          }
          if (typeof applyTranslations === 'function') {
            await applyTranslations({ language: lang, restoring: false });
          }
        },
      },
      EditorUI: {
        createEditorUI(editorCtx) {
          return {
            clampEditorFontSizePx(value) { return Number(value) || 20; },
            clampEditorMaximizedTextWidthPx(value) { return Number(value) || 960; },
            setLocalSpellcheckState(value) {
              editorCtx.state.spellcheckEnabled = value.preferenceEnabled !== false;
              editorCtx.state.spellcheckAvailable = value.available !== false;
              spellcheckStateCalls.push(value);
            },
            setLocalEditorFontSizePx(value) {
              const normalizedValue = Number(value) || 20;
              editorCtx.state.editorFontSizePx = normalizedValue;
              fontSizeCalls.push(normalizedValue);
            },
            setLocalEditorMaximizedTextWidthPx() {},
            setLocalEditorWindowMaximized() {},
            setNormalInteractionAvailable(available) {
              normalInteractionCalls.push(available === true);
            },
            async applyEditorTranslations() {},
            applyTextareaDefaults() {},
            applyEditorLanguage() {},
            updateReadProgressUi() {},
            scheduleReadProgressUiUpdate() {},
            restoreFocusToEditor() {},
            updateEditorTextDirection() {
              updateDirectionCalls.push(elements.editorArea.value);
            },
            applyReadingTestPrestartState() {},
            updateEditorTextSizeUi() {},
            syncEditorMaximizedLayout() {},
            async decreaseEditorFontSize() {},
            async increaseEditorFontSize() {},
            async resetEditorFontSize() {},
            handleEditorMarginPointerDown() {},
            async resetEditorMaximizedTextWidth() {},
          };
        },
      },
      EditorEngine: {
        createEditorEngine(engineCtx) {
          return {
            getSelectionRange() { return { start: 0, end: 0 }; },
            getInsertionCapacity() { return 100000; },
            getBeforeInputIncomingLength() { return null; },
            async applyInitialText(payload) {
              bootstrapApplyCalls.push({
                payload,
                maxTextCharsAtApply: engineCtx.state.maxTextChars,
              });
              if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'text')) {
                elements.editorArea.value = String(payload.text || '');
              } else {
                elements.editorArea.value = String(payload || '');
              }
              if (initialTextApplyThrows) {
                throw new Error('initial text application failed');
              }
              return initialTextApplyResult;
            },
            async applyExternalUpdate(payload) {
              bootstrapApplyCalls.push({
                payload,
                maxTextCharsAtApply: engineCtx.state.maxTextChars,
              });
              if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'text')) {
                elements.editorArea.value = String(payload.text || '');
              } else {
                elements.editorArea.value = String(payload || '');
              }
            },
            sendCurrentTextToMain(action, options) {
              sendCurrentTextCalls.push({ action, options });
              return true;
            },
            handleTextTransferInsert(event, transferConfig) {
              const text = transferConfig.getText(event);
              elements.editorArea.value = String(text || '');
              elements.editorArea.dispatch('input');
            },
            handleReplaceRequest(payload) {
              elements.editorArea.value = String(payload && payload.replacement || '');
              elements.editorArea.dispatch('input');
              return {
                requestId: Number(payload && payload.requestId),
                operation: payload && payload.operation === 'replace-all' ? 'replace-all' : 'replace-current',
                ok: true,
                status: 'replaced',
                replacements: 1,
                finalTextLength: elements.editorArea.value.length,
                error: '',
              };
            },
            handleTruncationResponse() {},
            setCaretSafe() {},
            setSelectionSafe() {},
          };
        },
      },
      Notify: {
        notifyEditor() {},
      },
      addEventListener() {},
      removeEventListener() {},
    },
    document,
    console,
    Event: class Event {
      constructor(type) {
        this.type = type;
      }
    },
    URLSearchParams,
    setTimeout,
    clearTimeout,
  };

  sandbox.window.editorAPI = {
    setCurrentText() { return { ok: true }; },
    onExternalUpdate(cb) {
      subscriptions.externalUpdate = cb;
    },
    onReplaceRequest(cb) {
      subscriptions.replaceRequest = cb;
    },
    sendReplaceResponse(response) {
      replaceResponses.push(response);
    },
    async getAppConfig() { return getAppConfigImpl(); },
    async getSettings() {
      return getSettingsImpl();
    },
    async getWindowState() { return { maximized: false, maximizedTextWidthPx: 960 }; },
    reportBasePresentationState(payload) {
      basePresentationReports.push(payload);
    },
    reportRendererI18nFailure() {},
    onSettingsChanged(cb) {
      subscriptions.settingsChanged = cb;
    },
    onWindowStateChanged(cb) {
      subscriptions.windowStateChanged = cb;
    },
    onReadingTestPrestartStateChanged(cb) {
      subscriptions.prestartChanged = cb;
    },
    async setSpellcheckEnabled() { return { ok: true }; },
  };
  if (includeInitialCurrentTextSnapshot) {
    sandbox.window.editorAPI.getInitialCurrentTextSnapshot = async () => {
      getInitialCurrentTextSnapshotCallCount += 1;
      return getInitialCurrentTextSnapshotImpl();
    };
  }

  // contextBridge exposes this API as a Window global. Model its non-configurable
  // global binding so a top-level lexical declaration with the same name fails
  // exactly as it does in the Electron renderer.
  Object.defineProperty(sandbox, 'editorAPI', {
    value: sandbox.window.editorAPI,
    configurable: false,
    enumerable: true,
  });

  vm.createContext(sandbox);
  const startupPresentationSource = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/editor_startup_presentation.js'),
    'utf8'
  );
  vm.runInContext(startupPresentationSource, sandbox, {
    filename: 'public/js/editor_startup_presentation.js'
  });
  if (omitStartupPresentation) {
    delete sandbox.window.EditorStartupPresentation;
  }
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/editor.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/editor.js' });

  return {
    elements,
    subscriptions,
    updateDirectionCalls,
    transitionLanguages,
    replaceResponses,
    basePresentationReports,
    bootstrapApplyCalls,
    sendCurrentTextCalls,
    errorLogs,
    warnLogs,
    spellcheckStateCalls,
    fontSizeCalls,
    normalInteractionCalls,
    getInitialCurrentTextSnapshotCallCount: () => getInitialCurrentTextSnapshotCallCount,
    releaseHeldTransition() {
      if (releaseHeldTransition) releaseHeldTransition();
    },
    waitForHeldTransition() {
      return heldTransitionReached || Promise.resolve();
    },
  };
}

async function bootstrapEditorScriptHarness(options = {}) {
  const harness = createEditorScriptHarness(options);
  await tick();
  await tick();
  harness.updateDirectionCalls.length = 0;
  harness.transitionLanguages.length = 0;
  harness.spellcheckStateCalls.length = 0;
  harness.fontSizeCalls.length = 0;
  return harness;
}

test('editor UI applies resolved direction to the textarea surface', () => {
  const harness = createEditorUiHarness({
    resolveDirection(value) {
      return String(value || '').startsWith('rtl:') ? 'rtl' : 'ltr';
    },
  });

  harness.ui.applyTextareaDefaults();
  assert.equal(harness.editor.getAttribute('dir'), 'rtl');
  assert.equal(harness.editor.wrap, 'soft');
  assert.equal(harness.editor.style.whiteSpace, 'pre-wrap');
  assert.equal(harness.editor.style.wordBreak, 'break-word');

  harness.editor.value = 'ltr:Testing';
  const direction = harness.ui.updateEditorTextDirection();
  assert.equal(direction, 'ltr');
  assert.equal(harness.editor.getAttribute('dir'), 'ltr');
});

test('editor script bootstraps initial text once through the versioned snapshot with init meta', async () => {
  const harness = await bootstrapEditorScriptHarness({
    getInitialCurrentTextSnapshotImpl: async () => ({
      ok: true,
      text: 'bootstrap text',
      revision: 1,
    }),
  });

  assert.equal(harness.getInitialCurrentTextSnapshotCallCount(), 1);
  assert.equal(harness.bootstrapApplyCalls.length, 1);
  assert.equal(harness.bootstrapApplyCalls[0].payload.text, 'bootstrap text');
  assert.equal(harness.bootstrapApplyCalls[0].payload.meta.source, 'main');
  assert.equal(harness.bootstrapApplyCalls[0].payload.meta.action, 'init');
});

test('editor keeps a newer live current-text update over an older bootstrap snapshot', async () => {
  let resolveSnapshot;
  let markSnapshotRequested;
  const snapshotPending = new Promise((resolve) => { resolveSnapshot = resolve; });
  const snapshotRequested = new Promise((resolve) => { markSnapshotRequested = resolve; });
  const harness = createEditorScriptHarness({
    getInitialCurrentTextSnapshotImpl: async () => {
      markSnapshotRequested();
      return snapshotPending;
    },
  });

  await snapshotRequested;
  await harness.subscriptions.externalUpdate({
    text: 'live newer text',
    revision: 2,
    meta: { source: 'main-window', action: 'overwrite' },
  });
  resolveSnapshot({ ok: true, text: 'bootstrap older text', revision: 1 });
  await tick();
  await tick();

  assert.equal(harness.elements.editorArea.value, 'live newer text');
  assert.deepEqual(
    harness.bootstrapApplyCalls.map(({ payload }) => payload.text),
    ['live newer text']
  );
});

test('editor accepts a revisioned live update when the processing requestId is absent', async () => {
  const harness = await bootstrapEditorScriptHarness();

  await harness.subscriptions.externalUpdate({
    text: 'committed without processing request',
    revision: 2,
    requestId: null,
    meta: { source: 'main-window', action: 'overwrite' },
  });

  assert.equal(harness.elements.editorArea.value, 'committed without processing request');
});

test('editor applies a newer bootstrap snapshot after an older live update arrives while it is pending', async () => {
  let resolveSnapshot;
  let markSnapshotRequested;
  const snapshotPending = new Promise((resolve) => { resolveSnapshot = resolve; });
  const snapshotRequested = new Promise((resolve) => { markSnapshotRequested = resolve; });
  const harness = createEditorScriptHarness({
    getInitialCurrentTextSnapshotImpl: async () => {
      markSnapshotRequested();
      return snapshotPending;
    },
  });

  await snapshotRequested;
  await harness.subscriptions.externalUpdate({
    text: 'older live text',
    revision: 1,
    meta: { source: 'main-window', action: 'overwrite' },
  });
  resolveSnapshot({ ok: true, text: 'newer snapshot text', revision: 2 });
  await tick();
  await tick();

  assert.equal(harness.elements.editorArea.value, 'newer snapshot text');
  assert.deepEqual(
    harness.bootstrapApplyCalls.map(({ payload }) => payload.text),
    ['older live text', 'newer snapshot text']
  );

  await harness.subscriptions.externalUpdate({
    text: 'older delayed text',
    revision: 1,
    meta: { source: 'main-window', action: 'overwrite' },
  });
  assert.equal(harness.elements.editorArea.value, 'newer snapshot text');
  assert.equal(harness.bootstrapApplyCalls.length, 2);
});

test('editor reports a bootstrap failure when the initial current-text snapshot is missing', async () => {
  const harness = await bootstrapEditorScriptHarness({ includeInitialCurrentTextSnapshot: false });

  assert.match(
    String(harness.errorLogs.at(-1)),
    /\[editor\] editorAPI\.getInitialCurrentTextSnapshot unavailable; cannot continue/
  );
  assert.deepEqual(JSON.parse(JSON.stringify(harness.basePresentationReports)), [
    { generation: 1, status: 'failed', reason: 'bootstrap-failed' },
  ]);
});

test('editor reports missing AppConstants through the established base-presentation boundary', async () => {
  const harness = await bootstrapEditorScriptHarness({ includeAppConstants: false });

  assert.deepEqual(JSON.parse(JSON.stringify(harness.basePresentationReports)), [
    { generation: 1, status: 'failed', reason: 'bootstrap-failed' },
  ]);
  assert.match(
    String(harness.errorLogs.at(-1)),
    /AppConstants unavailable; verify constants\.js load order/
  );
});

test('editor rejects each required AppConstants value before startup work is admitted', async () => {
  const invalidCases = [
    { label: 'blank default language', overrides: { DEFAULT_LANG: '  ' } },
    { label: 'non-positive maximum text', overrides: { MAX_TEXT_CHARS: 0 } },
    { label: 'negative paste allowance', overrides: { PASTE_ALLOW_LIMIT: -1 } },
    { label: 'non-finite small update threshold', overrides: { SMALL_UPDATE_THRESHOLD: Number.NaN } },
    { label: 'negative font minimum', overrides: { EDITOR_FONT_SIZE_MIN_PX: -1 } },
    { label: 'non-finite font maximum', overrides: { EDITOR_FONT_SIZE_MAX_PX: Number.POSITIVE_INFINITY } },
    { label: 'non-finite font default', overrides: { EDITOR_FONT_SIZE_DEFAULT_PX: Number.NaN } },
    {
      label: 'reversed font range',
      overrides: { EDITOR_FONT_SIZE_MIN_PX: 37, EDITOR_FONT_SIZE_MAX_PX: 36 },
    },
    {
      label: 'font default outside range',
      overrides: { EDITOR_FONT_SIZE_DEFAULT_PX: 37 },
    },
    { label: 'non-positive font step', overrides: { EDITOR_FONT_SIZE_STEP_PX: 0 } },
    { label: 'negative maximized width minimum', overrides: { EDITOR_MAXIMIZED_TEXT_WIDTH_MIN_PX: -1 } },
    {
      label: 'non-finite maximized width maximum',
      overrides: { EDITOR_MAXIMIZED_TEXT_WIDTH_MAX_PX: Number.POSITIVE_INFINITY },
    },
    {
      label: 'non-finite maximized width default',
      overrides: { EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX: Number.NaN },
    },
    {
      label: 'reversed maximized width range',
      overrides: {
        EDITOR_MAXIMIZED_TEXT_WIDTH_MIN_PX: 1601,
        EDITOR_MAXIMIZED_TEXT_WIDTH_MAX_PX: 1600,
      },
    },
    {
      label: 'maximized width default outside range',
      overrides: { EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX: 1601 },
    },
    { label: 'negative maximized gutter minimum', overrides: { EDITOR_MAXIMIZED_GUTTER_MIN_PX: -1 } },
  ];
  const requiredNames = [
    'DEFAULT_LANG',
    'MAX_TEXT_CHARS',
    'PASTE_ALLOW_LIMIT',
    'SMALL_UPDATE_THRESHOLD',
    'EDITOR_FONT_SIZE_MIN_PX',
    'EDITOR_FONT_SIZE_MAX_PX',
    'EDITOR_FONT_SIZE_DEFAULT_PX',
    'EDITOR_FONT_SIZE_STEP_PX',
    'EDITOR_MAXIMIZED_TEXT_WIDTH_MIN_PX',
    'EDITOR_MAXIMIZED_TEXT_WIDTH_MAX_PX',
    'EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX',
    'EDITOR_MAXIMIZED_GUTTER_MIN_PX',
  ];

  for (const testCase of invalidCases) {
    const harness = await bootstrapEditorScriptHarness({
      appConstantsOverrides: testCase.overrides,
    });
    assert.deepEqual(JSON.parse(JSON.stringify(harness.basePresentationReports)), [
      { generation: 1, status: 'failed', reason: 'bootstrap-failed' },
    ], testCase.label);
    assert.equal(harness.getInitialCurrentTextSnapshotCallCount(), 0, testCase.label);
    assert.equal(harness.bootstrapApplyCalls.length, 0, testCase.label);
    assert.equal(harness.normalInteractionCalls.includes(true), false, testCase.label);
    assert.match(String(harness.errorLogs.at(-1)), /AppConstants\./, testCase.label);
  }

  for (const name of requiredNames) {
    const harness = await bootstrapEditorScriptHarness({ omittedAppConstants: [name] });
    assert.deepEqual(JSON.parse(JSON.stringify(harness.basePresentationReports)), [
      { generation: 1, status: 'failed', reason: 'bootstrap-failed' },
    ], `${name} missing`);
    assert.equal(harness.getInitialCurrentTextSnapshotCallCount(), 0, `${name} missing`);
    assert.equal(harness.bootstrapApplyCalls.length, 0, `${name} missing`);
    assert.equal(harness.normalInteractionCalls.includes(true), false, `${name} missing`);
    assert.match(String(harness.errorLogs.at(-1)), /AppConstants\./, `${name} missing`);
  }
});

test('editor reports a missing startup-presentation core through the base-presentation boundary', async () => {
  const harness = await bootstrapEditorScriptHarness({ omitStartupPresentation: true });

  assert.deepEqual(JSON.parse(JSON.stringify(harness.basePresentationReports)), [
    { generation: 1, status: 'failed', reason: 'bootstrap-failed' },
  ]);
  assert.deepEqual(harness.normalInteractionCalls, []);
  assert.equal(harness.bootstrapApplyCalls.length, 0);
  assert.match(
    String(harness.errorLogs.at(-1)),
    /EditorStartupPresentation\.parseStartupQuery unavailable/
  );
});

test('editor script logs a startup failure when the initial current-text snapshot rejects', async () => {
  const harness = await bootstrapEditorScriptHarness({
    getInitialCurrentTextSnapshotImpl: async () => {
      throw new Error('bootstrap failed');
    },
  });

  assert.equal(harness.getInitialCurrentTextSnapshotCallCount(), 1);
  assert.equal(harness.bootstrapApplyCalls.length, 0);
  assert.equal(harness.errorLogs.length, 1);
  assert.match(String(harness.errorLogs[0][0]), /BOOTSTRAP: Text Editor startup failed:/);
  assert.match(String(harness.errorLogs[0][1]), /editorAPI\.getInitialCurrentTextSnapshot failed during bootstrap/);
});

test('editor script resolves config before applying the initial text seed', async () => {
  const callOrder = [];
  const harness = await bootstrapEditorScriptHarness({
    getAppConfigImpl: async () => {
      callOrder.push('getAppConfig');
      return { maxTextChars: 7 };
    },
    getInitialCurrentTextSnapshotImpl: async () => {
      callOrder.push('getInitialCurrentTextSnapshot');
      return { ok: true, text: '123456789', revision: 1 };
    },
  });

  assert.deepEqual(callOrder, ['getAppConfig', 'getInitialCurrentTextSnapshot']);
  assert.equal(harness.bootstrapApplyCalls.length, 1);
  assert.equal(harness.bootstrapApplyCalls[0].maxTextCharsAtApply, 7);
});

test('editor reports bootstrap failure when startup-specific initial text application returns false or throws', async () => {
  for (const options of [
    { initialTextApplyResult: false },
    { initialTextApplyThrows: true },
  ]) {
    const harness = await bootstrapEditorScriptHarness(options);

    assert.deepEqual(JSON.parse(JSON.stringify(harness.basePresentationReports)), [
      { generation: 1, status: 'failed', reason: 'bootstrap-failed' },
    ]);
    assert.deepEqual(harness.normalInteractionCalls, [false, false]);
    assert.match(String(harness.errorLogs.at(-1)), /initial current-text application failed|initial text application failed/);
  }
});

test('editor script recomputes textarea direction on local input, external updates, and language changes', async () => {
  const harness = await bootstrapEditorScriptHarness();

  harness.elements.editorArea.value = 'typed text';
  harness.elements.editorArea.dispatch('input');
  assert.deepEqual(harness.updateDirectionCalls, ['typed text']);

  harness.updateDirectionCalls.length = 0;
  await harness.subscriptions.externalUpdate({
    text: 'שלום',
    revision: 2,
    meta: { source: 'main' },
  });
  assert.deepEqual(harness.updateDirectionCalls, ['שלום']);

  harness.updateDirectionCalls.length = 0;
  harness.elements.editorArea.value = '  250  ';
  await harness.subscriptions.settingsChanged({
    language: 'ar',
    spellcheckEnabled: true,
    spellcheckAvailable: true,
    editorFontSizePx: 20,
  });
  assert.deepEqual(harness.transitionLanguages, ['ar']);
  assert.deepEqual(harness.updateDirectionCalls, ['  250  ']);
});

test('editor applies independent settings from a full settings update after a recoverable language failure', async () => {
  const transitionFailure = new Error('Cannot prepare Spanish translations');
  transitionFailure.rendererI18nTransition = {
    hadEstablishedState: true,
    restorationFailed: false,
  };
  const harness = await bootstrapEditorScriptHarness({
    rejectTransitionLanguage: 'es',
    transitionFailure,
  });

  await harness.subscriptions.settingsChanged({
    language: 'es',
    spellcheckEnabled: false,
    spellcheckAvailable: false,
    editorFontSizePx: 24,
  });

  assert.deepEqual(harness.transitionLanguages, ['es']);
  assert.equal(harness.spellcheckStateCalls.length, 1);
  assert.equal(harness.spellcheckStateCalls[0].preferenceEnabled, false);
  assert.equal(harness.spellcheckStateCalls[0].available, false);
  assert.deepEqual(harness.fontSizeCalls, [24]);
});

test('editor does not admit later settings semantics after a terminal language failure', async () => {
  const transitionFailure = new Error('Cannot restore editor translations');
  transitionFailure.rendererI18nTransition = {
    hadEstablishedState: true,
    restorationFailed: true,
  };
  const harness = await bootstrapEditorScriptHarness({
    rejectTransitionLanguage: 'es',
    transitionFailure,
  });

  await harness.subscriptions.settingsChanged({
    language: 'es',
    spellcheckEnabled: false,
    spellcheckAvailable: false,
    editorFontSizePx: 24,
  });
  await harness.subscriptions.settingsChanged({
    language: 'en',
    spellcheckEnabled: false,
    spellcheckAvailable: false,
    editorFontSizePx: 24,
  });
  const externalUpdateCallCount = harness.bootstrapApplyCalls.length;
  await harness.subscriptions.externalUpdate({ text: 'ignored after terminal failure', revision: 2 });

  assert.deepEqual(harness.spellcheckStateCalls, []);
  assert.deepEqual(harness.fontSizeCalls, []);
  assert.equal(harness.bootstrapApplyCalls.length, externalUpdateCallCount);
});

test('editor serializes overlapping full settings updates with their language transitions', async () => {
  const harness = await bootstrapEditorScriptHarness({ holdTransitionLanguage: 'es' });

  const spanishUpdate = harness.subscriptions.settingsChanged({
    language: 'es',
    spellcheckEnabled: false,
    spellcheckAvailable: false,
    editorFontSizePx: 24,
  });
  await harness.waitForHeldTransition();
  const englishUpdate = harness.subscriptions.settingsChanged({
    language: 'en',
    spellcheckEnabled: true,
    spellcheckAvailable: true,
    editorFontSizePx: 30,
  });
  harness.releaseHeldTransition();

  await Promise.all([spanishUpdate, englishUpdate]);

  assert.deepEqual(harness.transitionLanguages, ['es', 'en']);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.spellcheckStateCalls)), [
    { preferenceEnabled: false, available: false },
    { preferenceEnabled: true, available: true },
  ]);
  assert.deepEqual(harness.fontSizeCalls, [24, 30]);
});

test('editor admits live full settings after the bootstrap settings snapshot applies', async () => {
  let releaseBootstrapSettings;
  let markBootstrapSettingsRequested;
  const bootstrapSettings = new Promise((resolve) => {
    releaseBootstrapSettings = resolve;
  });
  const bootstrapSettingsRequested = new Promise((resolve) => {
    markBootstrapSettingsRequested = resolve;
  });
  const harness = createEditorScriptHarness({
    getSettingsImpl: async () => {
      markBootstrapSettingsRequested();
      return bootstrapSettings;
    },
  });

  await bootstrapSettingsRequested;
  const liveUpdate = harness.subscriptions.settingsChanged({
    language: 'es',
    spellcheckEnabled: false,
    spellcheckAvailable: false,
    editorFontSizePx: 24,
  });
  releaseBootstrapSettings({
    language: 'en',
    spellcheckEnabled: true,
    spellcheckAvailable: true,
    editorFontSizePx: 20,
  });

  await liveUpdate;

  assert.deepEqual(harness.transitionLanguages, ['en', 'es']);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.spellcheckStateCalls)), [
    { preferenceEnabled: true, available: true },
    { preferenceEnabled: false, available: false },
  ]);
  assert.deepEqual(harness.fontSizeCalls, [20, 24]);
});

test('editor script recomputes direction for paste, drop, replace, append updates, and trash clear', async () => {
  const harness = await bootstrapEditorScriptHarness();

  harness.elements.editorArea.dispatch('paste', {
    clipboardData: {
      getData(type) {
        return type === 'text/plain' ? 'שלום paste' : '';
      },
    },
    preventDefault() {},
    stopPropagation() {},
  });
  assert.deepEqual(harness.updateDirectionCalls, ['שלום paste']);

  harness.updateDirectionCalls.length = 0;
  harness.elements.editorArea.dispatch('drop', {
    dataTransfer: {
      getData(type) {
        return type === 'text/plain' ? 'drop Latin token' : '';
      },
    },
    preventDefault() {},
    stopPropagation() {},
  });
  assert.deepEqual(harness.updateDirectionCalls, ['drop Latin token']);

  harness.updateDirectionCalls.length = 0;
  harness.subscriptions.replaceRequest({
    requestId: 1,
    operation: 'replace-current',
    replacement: 'שלום replace',
  });
  await tick();
  assert.deepEqual(harness.updateDirectionCalls, ['שלום replace']);
  assert.equal(harness.replaceResponses[0].status, 'replaced');

  harness.updateDirectionCalls.length = 0;
  harness.subscriptions.replaceRequest({
    requestId: 2,
    operation: 'replace-all',
    replacement: 'Latin replace all',
  });
  await tick();
  assert.deepEqual(harness.updateDirectionCalls, ['Latin replace all']);
  assert.equal(harness.replaceResponses[1].operation, 'replace-all');

  harness.updateDirectionCalls.length = 0;
  await harness.subscriptions.externalUpdate({
    text: 'alpha\n\nbeta',
    revision: 2,
    meta: { source: 'main-window', action: 'append_newline' },
  });
  assert.deepEqual(harness.updateDirectionCalls, ['alpha\n\nbeta']);

  harness.updateDirectionCalls.length = 0;
  harness.elements.editorArea.value = 'trash me';
  harness.elements.btnTrash.dispatch('click');
  assert.deepEqual(harness.updateDirectionCalls, ['']);
});

test('editor Apply action uses the shared editor commit path with overwrite semantics', async () => {
  const harness = await bootstrapEditorScriptHarness();

  harness.elements.calcWhileTyping.checked = false;
  harness.elements.calcWhileTyping.dispatch('change');
  harness.elements.editorArea.value = 'apply me';
  harness.elements.btnCalc.dispatch('click');

  assert.equal(harness.sendCurrentTextCalls.length, 1);
  assert.equal(harness.sendCurrentTextCalls[0].action, 'overwrite');
  assert.equal(harness.sendCurrentTextCalls[0].options.text, 'apply me');
});

test('editor Clear action commits empty text through the shared engine path when auto is on', async () => {
  const harness = await bootstrapEditorScriptHarness();

  harness.elements.editorArea.value = 'trash me';
  harness.elements.btnTrash.dispatch('click');

  assert.equal(harness.elements.editorArea.value, '');
  assert.equal(harness.sendCurrentTextCalls.length, 1);
  assert.equal(harness.sendCurrentTextCalls[0].action, 'clear');
  assert.equal(harness.sendCurrentTextCalls[0].options.text, '');
});

test('editor Clear action does not commit when auto is off', async () => {
  const harness = await bootstrapEditorScriptHarness();

  harness.elements.calcWhileTyping.checked = false;
  harness.elements.calcWhileTyping.dispatch('change');
  harness.elements.editorArea.value = 'trash me';
  harness.elements.btnTrash.dispatch('click');

  assert.equal(harness.elements.editorArea.value, '');
  assert.equal(harness.sendCurrentTextCalls.length, 0);
});
