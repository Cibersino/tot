'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createEditorDouble() {
  const listeners = new Map();
  return {
    value: '',
    selectionStart: 0,
    selectionEnd: 0,
    style: {},
    addEventListener(type, listener) {
      const registered = listeners.get(type) || [];
      registered.push(listener);
      listeners.set(type, registered);
    },
    dispatchEvent(event) {
      (listeners.get(event.type) || []).forEach((listener) => listener(event));
      return true;
    },
    select() {
      this.selectionStart = 0;
      this.selectionEnd = this.value.length;
    },
    focus() {},
  };
}

test('initial Text Editor seed uses the suppressed whole-value application path and refreshes input-side presentation', async () => {
  const editor = createEditorDouble();
  const state = {
    maxTextChars: 100,
    suppressLocalUpdate: false,
  };
  const inputSuppressStates = [];
  let readProgress = '100%';
  let localSyncAttempts = 0;

  editor.addEventListener('input', () => {
    inputSuppressStates.push(state.suppressLocalUpdate);
    readProgress = editor.value.length > 10 ? '20%' : '100%';
    if (!state.suppressLocalUpdate) {
      localSyncAttempts += 1;
    }
  });

  const sandbox = {
    window: {
      getLogger() {
        return {
          warn() {},
          warnOnce() {},
          error() {},
          errorOnce() {},
        };
      },
      Notify: {
        notifyEditor() {},
      },
    },
    document: {
      activeElement: null,
      execCommand() {
        return false;
      },
    },
    Event: class Event {
      constructor(type) {
        this.type = type;
      }
    },
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/editor_engine.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/editor_engine.js' });

  const engine = sandbox.window.EditorEngine.createEditorEngine({
    SMALL_UPDATE_THRESHOLD: 5,
    editorAPI: {
      setCurrentText() {},
    },
    editorFindReplaceCore: {},
    dom: {
      editor,
      calcWhileTyping: { checked: true },
    },
    state,
    ui: {
      restoreFocusToEditor() {},
    },
  });

  const applied = await engine.applyInitialText({ text: 'initial document text' });

  assert.equal(applied, true);
  assert.equal(editor.value, 'initial document text');
  assert.deepEqual(inputSuppressStates, [true]);
  assert.equal(readProgress, '20%');
  assert.equal(localSyncAttempts, 0);
  assert.equal(state.suppressLocalUpdate, false);
});
