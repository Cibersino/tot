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
    log: {
      warn() {},
      warnOnce() {},
      error() {},
      debug() {},
    },
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
      async loadRendererTranslations() {},
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

function createEditorScriptHarness({
  appConfig = {},
  getAppConfigImpl = async () => appConfig,
  getCurrentTextImpl = async () => '',
  includeGetCurrentText = true,
} = {}) {
  const subscriptions = {};
  const updateDirectionCalls = [];
  const applyWindowLanguageAttributesCalls = [];
  const replaceResponses = [];
  const bootstrapApplyCalls = [];
  const sendCurrentTextCalls = [];
  const errorLogs = [];
  const warnLogs = [];
  let getCurrentTextCallCount = 0;

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

  const sandbox = {
    window: {
      location: {
        search: '',
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
      AppConstants: {
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
      },
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
        applyWindowLanguageAttributes(lang) {
          applyWindowLanguageAttributesCalls.push(lang);
          return { lang, dir: 'ltr', languageDirection: lang === 'ar' ? 'rtl' : 'ltr' };
        },
      },
      EditorUI: {
        createEditorUI() {
          return {
            clampEditorFontSizePx(value) { return Number(value) || 20; },
            clampEditorMaximizedTextWidthPx(value) { return Number(value) || 960; },
            setLocalSpellcheckState() {},
            setLocalEditorFontSizePx() {},
            setLocalEditorMaximizedTextWidthPx() {},
            setLocalEditorWindowMaximized() {},
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
      return { language: 'en', spellcheckEnabled: true, spellcheckAvailable: true, editorFontSizePx: 20 };
    },
    async getWindowState() { return { maximized: false, maximizedTextWidthPx: 960 }; },
    reportBasePresentationState() {},
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
  if (includeGetCurrentText) {
    sandbox.window.editorAPI.getCurrentText = async () => {
      getCurrentTextCallCount += 1;
      return getCurrentTextImpl();
    };
  }

  vm.createContext(sandbox);
  const startupPresentationSource = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/editor_startup_presentation.js'),
    'utf8'
  );
  vm.runInContext(startupPresentationSource, sandbox, {
    filename: 'public/js/editor_startup_presentation.js'
  });
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/editor.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/editor.js' });

  return {
    elements,
    subscriptions,
    updateDirectionCalls,
    applyWindowLanguageAttributesCalls,
    replaceResponses,
    bootstrapApplyCalls,
    sendCurrentTextCalls,
    errorLogs,
    warnLogs,
    getCurrentTextCallCount: () => getCurrentTextCallCount,
  };
}

async function bootstrapEditorScriptHarness(options = {}) {
  const harness = createEditorScriptHarness(options);
  await tick();
  await tick();
  harness.updateDirectionCalls.length = 0;
  harness.applyWindowLanguageAttributesCalls.length = 0;
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

test('editor script bootstraps initial text once through getCurrentText with init meta', async () => {
  const harness = await bootstrapEditorScriptHarness({
    getCurrentTextImpl: async () => 'bootstrap text',
  });

  assert.equal(harness.getCurrentTextCallCount(), 1);
  assert.equal(harness.bootstrapApplyCalls.length, 1);
  assert.equal(harness.bootstrapApplyCalls[0].payload.text, 'bootstrap text');
  assert.equal(harness.bootstrapApplyCalls[0].payload.meta.source, 'main');
  assert.equal(harness.bootstrapApplyCalls[0].payload.meta.action, 'init');
});

test('editor script fails fast when getCurrentText is missing', () => {
  assert.throws(
    () => createEditorScriptHarness({ includeGetCurrentText: false }),
    /\[editor\] editorAPI\.getCurrentText unavailable; cannot continue/
  );
});

test('editor script logs a startup failure when getCurrentText bootstrap rejects', async () => {
  const harness = await bootstrapEditorScriptHarness({
    getCurrentTextImpl: async () => {
      throw new Error('bootstrap failed');
    },
  });

  assert.equal(harness.getCurrentTextCallCount(), 1);
  assert.equal(harness.bootstrapApplyCalls.length, 0);
  assert.equal(harness.errorLogs.length, 1);
  assert.match(String(harness.errorLogs[0][0]), /BOOTSTRAP: Text Editor startup failed:/);
  assert.match(String(harness.errorLogs[0][1]), /editorAPI\.getCurrentText failed during bootstrap/);
});

test('editor script resolves config before applying the initial text seed', async () => {
  const callOrder = [];
  const harness = await bootstrapEditorScriptHarness({
    getAppConfigImpl: async () => {
      callOrder.push('getAppConfig');
      return { maxTextChars: 7 };
    },
    getCurrentTextImpl: async () => {
      callOrder.push('getCurrentText');
      return '123456789';
    },
  });

  assert.deepEqual(callOrder, ['getAppConfig', 'getCurrentText']);
  assert.equal(harness.bootstrapApplyCalls.length, 1);
  assert.equal(harness.bootstrapApplyCalls[0].maxTextCharsAtApply, 7);
});

test('editor script recomputes textarea direction on local input, external updates, and language changes', async () => {
  const harness = await bootstrapEditorScriptHarness();

  harness.elements.editorArea.value = 'typed text';
  harness.elements.editorArea.dispatch('input');
  assert.deepEqual(harness.updateDirectionCalls, ['typed text']);

  harness.updateDirectionCalls.length = 0;
  await harness.subscriptions.externalUpdate({ text: 'שלום', meta: { source: 'main' } });
  assert.deepEqual(harness.updateDirectionCalls, ['שלום']);

  harness.updateDirectionCalls.length = 0;
  harness.elements.editorArea.value = '  250  ';
  await harness.subscriptions.settingsChanged({
    language: 'ar',
    spellcheckEnabled: true,
    spellcheckAvailable: true,
    editorFontSizePx: 20,
  });
  assert.deepEqual(harness.applyWindowLanguageAttributesCalls, ['ar']);
  assert.deepEqual(harness.updateDirectionCalls, ['  250  ']);
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
