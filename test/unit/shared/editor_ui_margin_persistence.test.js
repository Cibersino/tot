'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createClassList() {
  const values = new Set();
  return {
    add(...names) {
      for (const name of names) values.add(name);
    },
    remove(...names) {
      for (const name of names) values.delete(name);
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
    contains(name) {
      return values.has(name);
    },
  };
}

function createStyleRecorder() {
  return {
    values: {},
    setProperty(name, value) {
      this.values[name] = value;
    },
  };
}

function createElementDouble() {
  return {
    attributes: {},
    style: createStyleRecorder(),
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
  };
}

function createHarness({ editorAPI } = {}) {
  const editorApiCalls = [];
  const editorToastCalls = [];
  const windowListeners = new Map();
  const documentElement = { style: createStyleRecorder(), lang: 'es' };
  const body = { classList: createClassList() };
  const windowObj = {
    getLogger() {
      return {
        warn() {},
        warnOnce() {},
        error() {},
        debug() {},
      };
    },
    Notify: {
      notifyEditor(...args) {
        editorToastCalls.push(args);
      },
    },
    addEventListener(eventName, listener) {
      windowListeners.set(eventName, listener);
    },
    removeEventListener(eventName, listener) {
      if (windowListeners.get(eventName) === listener) {
        windowListeners.delete(eventName);
      }
    },
    requestAnimationFrame(cb) {
      cb();
      return 1;
    },
    setTimeout,
    clearTimeout,
  };
  const sandbox = {
    window: windowObj,
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

  const editor = Object.assign(createElementDouble(), {
    clientHeight: 600,
    scrollHeight: 600,
    scrollTop: 0,
  });
  const editorWrap = createElementDouble();
  const editorLayout = {
    clientWidth: 1600,
  };
  const editorTextColumn = {
    clientWidth: 960,
  };
  const textSizeValue = createElementDouble();
  const readProgressValue = createElementDouble();
  const textSizeControls = createElementDouble();
  const readProgress = createElementDouble();
  const bottomBar = createElementDouble();
  const spellcheckToggle = createElementDouble();
  const state = {
    idiomaActual: 'es',
    translationsLoadedFor: null,
    spellcheckEnabled: true,
    spellcheckAvailable: true,
    editorFontSizePx: 20,
    editorWindowMaximized: true,
    maximizedTextWidthPx: 960,
    editorMarginDrag: null,
    readProgressFramePending: false,
  };

  const ui = sandbox.window.EditorUI.createEditorUI({
    editorAPI: editorAPI || {
      async setMaximizedTextWidthPx(value) {
        editorApiCalls.push(value);
        return { ok: true, maximizedTextWidthPx: value };
      },
    },
    DEFAULT_LANG: 'es',
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
      resolveUserTextDirection() { return 'ltr'; },
      getLocaleTag(language) { return String(language || 'es'); },
    },
    dom: {
      editorWrap,
      editorLayout,
      editorLeftGutter: createElementDouble(),
      editorTextColumn,
      editorRightGutter: createElementDouble(),
      editor,
      btnTrash: createElementDouble(),
      calcWhileTyping: createElementDouble(),
      spellcheckToggle,
      btnCalc: createElementDouble(),
      calcLabel: createElementDouble(),
      spellcheckLabel: createElementDouble(),
      textSizeControls,
      textSizeLabel: createElementDouble(),
      btnTextSizeDecrease: createElementDouble(),
      btnTextSizeIncrease: createElementDouble(),
      btnTextSizeReset: createElementDouble(),
      textSizeValue,
      readProgress,
      readProgressLabel: createElementDouble(),
      readProgressValue,
      bottomBar,
      readingTestPrestartOverlay: createElementDouble(),
      readingTestPrestartMessage: createElementDouble(),
    },
    state,
    engine: {
      setCaretSafe() {},
      setSelectionSafe() {},
    },
  });

  return {
    ui,
    state,
    editorApiCalls,
    editorToastCalls,
    windowListeners,
    documentElement,
    editorWrap,
    editor,
    textSizeValue,
    spellcheckToggle,
  };
}

test('setLocalSpellcheckState keeps the saved preference checked while disabling unavailable spellcheck', () => {
  const harness = createHarness();

  harness.ui.setLocalSpellcheckState({
    preferenceEnabled: true,
    available: false,
  });

  assert.equal(harness.state.spellcheckEnabled, true);
  assert.equal(harness.state.spellcheckAvailable, false);
  assert.equal(harness.spellcheckToggle.checked, true);
  assert.equal(harness.spellcheckToggle.disabled, true);
  assert.equal(harness.editor.spellcheck, false);
  assert.equal(harness.editor.attributes.spellcheck, 'false');
});

test('updateEditorTextSizeUi composes the technical font-size value at the consumer boundary', () => {
  const harness = createHarness();

  harness.ui.updateEditorTextSizeUi();

  assert.equal(harness.textSizeValue.attributes['data-label'], '20');
  assert.equal(harness.textSizeValue.attributes['aria-label'], '20');
});

test('persistEditorFontSizePx restores the optimistic size and shows one failure toast', async () => {
  const harness = createHarness({
    editorAPI: {
      async setEditorFontSizePx() {
        return { ok: false, error: 'write failed' };
      },
    },
  });

  const ok = await harness.ui.persistEditorFontSizePx(24);

  assert.equal(ok, false);
  assert.equal(harness.state.editorFontSizePx, 20);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.editorToastCalls)), [[
    'renderer.editor.alerts.font_size_save_failed',
    { type: 'error' },
  ]]);
});

test('persistEditorMaximizedTextWidthPx persists drag-updated width when local state was already updated optimistically', async () => {
  const harness = createHarness();

  harness.ui.setLocalEditorMaximizedTextWidthPx(880);

  const ok = await harness.ui.persistEditorMaximizedTextWidthPx(880, {
    previousTextWidthPx: 960,
    skipLocalApply: true,
  });

  assert.equal(ok, true);
  assert.deepEqual(harness.editorApiCalls, [880]);
  assert.equal(harness.documentElement.style.values['--editor-maximized-text-width'], '880px');
  assert.equal(harness.editorWrap.attributes['data-maximized-layout'], 'true');
});

test('persistEditorMaximizedTextWidthPx restores a drag preview when its persistence method is unavailable', async () => {
  const harness = createHarness({ editorAPI: {} });

  harness.ui.setLocalEditorMaximizedTextWidthPx(880);

  const ok = await harness.ui.persistEditorMaximizedTextWidthPx(880, {
    previousTextWidthPx: 960,
    skipLocalApply: true,
  });

  assert.equal(ok, false);
  assert.equal(harness.state.maximizedTextWidthPx, 960);
  assert.equal(harness.documentElement.style.values['--editor-maximized-text-width'], '960px');
});

test('persistEditorMaximizedTextWidthPx retains a reset width and warns when Main reports failed durability', async () => {
  let attempts = 0;
  const harness = createHarness({
    editorAPI: {
      async setMaximizedTextWidthPx() {
        attempts += 1;
        return {
          ok: true,
          maximizedTextWidthPx: 960,
          persisted: attempts === 1 ? false : true,
        };
      },
    },
  });

  harness.ui.setLocalEditorMaximizedTextWidthPx(880);

  const ok = await harness.ui.resetEditorMaximizedTextWidth();

  assert.equal(ok, true);
  assert.equal(harness.state.maximizedTextWidthPx, 960);
  assert.equal(harness.documentElement.style.values['--editor-maximized-text-width'], '960px');
  assert.deepEqual(JSON.parse(JSON.stringify(harness.editorToastCalls)), [[
    'renderer.editor.alerts.maximized_text_width_not_persisted',
    { type: 'warn' },
  ]]);

  assert.equal(await harness.ui.resetEditorMaximizedTextWidth(), true);
  assert.equal(attempts, 2);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.editorToastCalls)), [[
    'renderer.editor.alerts.maximized_text_width_not_persisted',
    { type: 'warn' },
  ]]);
});

test('gutter dragging retains its new width and warns when Main reports failed durability', async () => {
  const persistedValues = [];
  const harness = createHarness({
    editorAPI: {
      async setMaximizedTextWidthPx(value) {
        persistedValues.push(value);
        return { ok: true, maximizedTextWidthPx: value, persisted: false };
      },
    },
  });

  harness.ui.handleEditorMarginPointerDown({
    clientX: 100,
    pointerId: 7,
    preventDefault() {},
  }, 'right');
  harness.windowListeners.get('pointermove')({ clientX: 180, pointerId: 7 });
  const draggedWidth = harness.state.maximizedTextWidthPx;
  harness.windowListeners.get('pointerup')({ pointerId: 7, type: 'pointerup' });

  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.notEqual(draggedWidth, 960);
  assert.deepEqual(persistedValues, [draggedWidth]);
  assert.equal(harness.state.maximizedTextWidthPx, draggedWidth);
  assert.deepEqual(JSON.parse(JSON.stringify(harness.editorToastCalls)), [[
    'renderer.editor.alerts.maximized_text_width_not_persisted',
    { type: 'warn' },
  ]]);
});
