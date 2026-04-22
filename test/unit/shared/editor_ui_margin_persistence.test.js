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

function createHarness() {
  const editorApiCalls = [];
  const documentElement = { style: createStyleRecorder(), lang: 'es' };
  const body = { classList: createClassList() };
  const windowObj = {
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

  const editor = {
    setAttribute() {},
    clientHeight: 600,
    scrollHeight: 600,
    scrollTop: 0,
  };
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

  const ui = sandbox.window.EditorUI.createEditorUI({
    log: {
      warn() {},
      warnOnce() {},
      error() {},
      debug() {},
    },
    editorAPI: {
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
      async loadRendererTranslations() {},
      tRenderer() { return ''; },
      msgRenderer(_path, params = {}) { return String(params.value ?? ''); },
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
      spellcheckToggle: createElementDouble(),
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
    state: {
      idiomaActual: 'es',
      translationsLoadedFor: null,
      spellcheckEnabled: true,
      editorFontSizePx: 20,
      editorWindowMaximized: true,
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
    state: ui ? undefined : undefined,
    editorApiCalls,
    documentElement,
    editorWrap,
  };
}

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
