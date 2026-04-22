'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const editorFindReplaceCore = require('../../../public/js/lib/editor_find_replace_core');

class FakeEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = !!init.bubbles;
  }
}

function createVisibilityStyleRecorder() {
  const style = { history: [] };
  let visibility = '';

  Object.defineProperty(style, 'visibility', {
    enumerable: true,
    configurable: true,
    get() {
      return visibility;
    },
    set(value) {
      visibility = String(value);
      style.history.push(visibility);
    },
  });

  return style;
}

function createHarness({
  initialValue = '',
  smallUpdateThreshold = 10,
  maxTextChars = 1_000_000,
  execCommandBehavior = 'success',
} = {}) {
  const execCalls = [];
  const setRangeTextCalls = [];
  const dispatchedEvents = [];
  const style = createVisibilityStyleRecorder();

  const editor = {
    value: String(initialValue),
    selectionStart: String(initialValue).length,
    selectionEnd: String(initialValue).length,
    style,
    focusCount: 0,
    selectCount: 0,
    focus() {
      this.focusCount += 1;
      document.activeElement = editor;
    },
    select() {
      this.selectCount += 1;
      this.selectionStart = 0;
      this.selectionEnd = this.value.length;
    },
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
    setRangeText(text, start, end, mode) {
      setRangeTextCalls.push({ text, start, end, mode });
      this.value = this.value.slice(0, start) + String(text) + this.value.slice(end);
      if (mode === 'end') {
        const nextPos = start + String(text).length;
        this.selectionStart = nextPos;
        this.selectionEnd = nextPos;
      }
    },
    dispatchEvent(event) {
      dispatchedEvents.push(event && event.type ? event.type : 'unknown');
      return true;
    },
  };

  const previousActiveElement = {
    focusCount: 0,
    focus() {
      this.focusCount += 1;
      document.activeElement = previousActiveElement;
    },
  };

  const document = {
    activeElement: previousActiveElement,
    execCommand(command, _showUi, text) {
      execCalls.push({
        command,
        text: String(text),
        selectionStart: editor.selectionStart,
        selectionEnd: editor.selectionEnd,
      });

      if (execCommandBehavior !== 'success' || command !== 'insertText') {
        return false;
      }

      const start = typeof editor.selectionStart === 'number' ? editor.selectionStart : editor.value.length;
      const end = typeof editor.selectionEnd === 'number' ? editor.selectionEnd : start;
      editor.value = editor.value.slice(0, start) + String(text) + editor.value.slice(end);
      const nextPos = start + String(text).length;
      editor.selectionStart = nextPos;
      editor.selectionEnd = nextPos;
      return true;
    },
  };

  const sandbox = {
    window: {
      Notify: {
        notifyEditor() {},
      },
    },
    document,
    Event: FakeEvent,
  };

  vm.createContext(sandbox);
  const engineSource = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/editor_engine.js'),
    'utf8'
  );
  vm.runInContext(engineSource, sandbox, { filename: 'public/js/editor_engine.js' });

  const log = {
    warnOnce() {},
    warn() {},
    error() {},
    debug() {},
  };

  const engine = sandbox.window.EditorEngine.createEditorEngine({
    log,
    editorAPI: {},
    editorFindReplaceCore,
    dom: { editor },
    state: {
      maxTextChars,
      suppressLocalUpdate: false,
    },
    SMALL_UPDATE_THRESHOLD: smallUpdateThreshold,
    PASTE_ALLOW_LIMIT: 10_000,
    ui: {
      restoreFocusToEditor() {},
    },
  });

  return {
    engine,
    editor,
    execCalls,
    setRangeTextCalls,
    dispatchedEvents,
    previousActiveElement,
    visibilityHistory: style.history,
  };
}

test('replace-all uses the direct hidden whole-text commit path when the final text is above the threshold', () => {
  const {
    engine,
    editor,
    execCalls,
    setRangeTextCalls,
    visibilityHistory,
  } = createHarness({
    initialValue: 'aaaaaa',
    smallUpdateThreshold: 5,
  });

  const result = engine.handleReplaceRequest({
    operation: 'replace-all',
    requestId: 1,
    query: 'a',
    replacement: 'b',
    matchCase: false,
  });

  assert.equal(result.status, 'replaced');
  assert.equal(result.replacements, 6);
  assert.equal(editor.value, 'bbbbbb');
  assert.equal(execCalls.length, 0);
  assert.equal(setRangeTextCalls.length, 0);
  assert.deepEqual(visibilityHistory, ['hidden', '']);
});

test('replace-all uses the native whole-text commit path when the final text stays within the threshold', () => {
  const {
    engine,
    editor,
    execCalls,
    setRangeTextCalls,
    visibilityHistory,
  } = createHarness({
    initialValue: 'aaaaa',
    smallUpdateThreshold: 10,
  });

  const result = engine.handleReplaceRequest({
    operation: 'replace-all',
    requestId: 2,
    query: 'a',
    replacement: 'b',
    matchCase: false,
  });

  assert.equal(result.status, 'replaced');
  assert.equal(result.replacements, 5);
  assert.equal(editor.value, 'bbbbb');
  assert.equal(execCalls.length, 1);
  assert.equal(execCalls[0].text, 'bbbbb');
  assert.equal(setRangeTextCalls.length, 0);
  assert.deepEqual(visibilityHistory, []);
});

test('overwrite-like external updates use the direct hidden whole-text commit path above the threshold', async () => {
  const {
    engine,
    editor,
    execCalls,
    setRangeTextCalls,
    visibilityHistory,
  } = createHarness({
    initialValue: 'old',
    smallUpdateThreshold: 5,
  });

  await engine.applyExternalUpdate({
    text: '123456',
    meta: { source: 'main-window', action: 'overwrite' },
  });

  assert.equal(editor.value, '123456');
  assert.equal(execCalls.length, 0);
  assert.equal(setRangeTextCalls.length, 0);
  assert.deepEqual(visibilityHistory, ['hidden', '']);
});

test('overwrite-like external updates use the native whole-text commit path within the threshold', async () => {
  const {
    engine,
    editor,
    execCalls,
    setRangeTextCalls,
    visibilityHistory,
  } = createHarness({
    initialValue: 'old',
    smallUpdateThreshold: 10,
  });

  await engine.applyExternalUpdate({
    text: 'tiny',
    meta: { source: 'main-window', action: 'overwrite' },
  });

  assert.equal(editor.value, 'tiny');
  assert.equal(execCalls.length, 1);
  assert.equal(execCalls[0].text, 'tiny');
  assert.equal(setRangeTextCalls.length, 0);
  assert.deepEqual(visibilityHistory, []);
});

test('append_newline keeps its suffix fast path for small suffixes', async () => {
  const {
    engine,
    editor,
    execCalls,
    setRangeTextCalls,
    visibilityHistory,
  } = createHarness({
    initialValue: 'alpha',
    smallUpdateThreshold: 10,
  });

  await engine.applyExternalUpdate({
    text: 'alpha\n\nbeta',
    meta: { source: 'main-window', action: 'append_newline' },
  });

  assert.equal(editor.value, 'alpha\n\nbeta');
  assert.equal(execCalls.length, 1);
  assert.equal(execCalls[0].text, '\n\nbeta');
  assert.equal(setRangeTextCalls.length, 0);
  assert.deepEqual(visibilityHistory, []);
});
