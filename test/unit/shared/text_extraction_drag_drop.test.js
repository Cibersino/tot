'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHarness() {
  let translationsEstablished = false;
  let translationCalls = 0;
  const listeners = new Map();
  const overlayMessage = { textContent: '' };
  let overlay = null;

  const document = {
    body: {
      appendChild(element) {
        overlay = element;
      },
      classList: {
        toggle() {},
      },
    },
    createElement() {
      return {
        className: '',
        id: '',
        innerHTML: '',
        setAttribute() {},
        querySelector(selector) {
          return selector === '.text-extraction-drop-overlay__message'
            ? overlayMessage
            : null;
        },
      };
    },
  };

  const sandbox = {
    document,
    window: {
      Notify: {
        notifyMain() {},
      },
      RendererI18n: {
        tRenderer(key) {
          translationCalls += 1;
          if (!translationsEstablished) {
            throw new Error('renderer translation state is not established');
          }
          return key === 'renderer.main.processing.text_extraction_drop_here'
            ? 'Drop files here'
            : key;
        },
      },
      addEventListener(type, listener) {
        listeners.set(type, listener);
      },
      getLogger() {
        return {
          debug() {},
          error() {},
          info() {},
          warn() {},
          warnOnce() {},
        };
      },
    },
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/text_extraction_drag_drop.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/text_extraction_drag_drop.js' });

  return {
    dragDrop: sandbox.window.TextExtractionDragDrop,
    getOverlay() {
      return overlay;
    },
    getOverlayMessage() {
      return overlayMessage;
    },
    getTranslationCalls() {
      return translationCalls;
    },
    getListenerCount() {
      return listeners.size;
    },
    getListener(type) {
      return listeners.get(type);
    },
    establishTranslations() {
      translationsEstablished = true;
    },
  };
}

test('drag/drop configuration wires an untranslated overlay until Main applies translations', () => {
  const harness = createHarness();

  assert.doesNotThrow(() => {
    harness.dragDrop.configure({
      canAcceptDrop() {
        return false;
      },
      async startFromDroppedFiles() {},
    });
  });
  assert.ok(harness.getOverlay());
  assert.equal(harness.getListenerCount(), 4);
  assert.equal(harness.getTranslationCalls(), 0);

  harness.establishTranslations();
  harness.dragDrop.applyTranslations();

  assert.equal(harness.getTranslationCalls(), 1);
  assert.equal(harness.getOverlayMessage().textContent, 'Drop files here');
});

test('drag/drop forwards raw files to the admitted Entry root', async () => {
  const harness = createHarness();
  const droppedFiles = [{ name: 'first.pdf' }, { name: 'second.pdf' }];
  const starts = [];
  harness.dragDrop.configure({
    canAcceptDrop() {
      return true;
    },
    async startFromDroppedFiles(payload) {
      starts.push(payload);
    },
  });

  let prevented = false;
  let propagationStopped = false;
  await harness.getListener('drop')({
    dataTransfer: {
      types: ['Files'],
      files: droppedFiles,
    },
    preventDefault() {
      prevented = true;
    },
    stopPropagation() {
      propagationStopped = true;
    },
  });

  assert.equal(prevented, true);
  assert.equal(propagationStopped, true);
  assert.equal(starts.length, 1);
  assert.equal(starts[0].source, 'drop');
  assert.equal(starts[0].files.length, 2);
  assert.equal(starts[0].files[0], droppedFiles[0]);
  assert.equal(starts[0].files[1], droppedFiles[1]);
});
