'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadEditorStartupPresentation() {
  const sandbox = {
    window: {},
    URLSearchParams,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/editor_startup_presentation.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/editor_startup_presentation.js' });
  return sandbox.window.EditorStartupPresentation;
}

const editorStartupPresentation = loadEditorStartupPresentation();

function normalizeVmValue(value) {
  return JSON.parse(JSON.stringify(value));
}

test('parseStartupQuery normalizes initial presentation mode and generation', () => {
  assert.deepEqual(
    normalizeVmValue(
      editorStartupPresentation.parseStartupQuery('?initialPresentationMode=maximized&firstShowGeneration=12')
    ),
    {
      initialPresentationMode: 'maximized',
      firstShowGeneration: 12,
    }
  );

  assert.deepEqual(
    normalizeVmValue(
      editorStartupPresentation.parseStartupQuery('?initialPresentationMode=bogus&firstShowGeneration=0')
    ),
    {
      initialPresentationMode: 'reduced',
      firstShowGeneration: null,
    }
  );
});

test('startup presentation controller keeps actual editor state buffered until the startup lock releases', () => {
  const controller = editorStartupPresentation.createStartupPresentationController({
    initialPresentationMode: 'maximized',
    firstShowGeneration: 3,
  });

  assert.equal(controller.isInitiallyMaximized(), true);

  const bufferedWhileLocked = controller.captureActualEditorState({
    maximized: false,
    spellcheckEnabled: false,
    editorFontSizePx: 24,
    maximizedTextWidthPx: 920,
  });
  assert.equal(bufferedWhileLocked, null);

  const releasedState = controller.releaseStartupLock();
  assert.deepEqual(normalizeVmValue(releasedState), {
    maximized: false,
    spellcheckEnabled: false,
    editorFontSizePx: 24,
    maximizedTextWidthPx: 920,
  });

  const liveState = controller.captureActualEditorState({
    maximized: true,
    spellcheckEnabled: true,
    editorFontSizePx: 22,
    maximizedTextWidthPx: 1200,
  });
  assert.deepEqual(normalizeVmValue(liveState), {
    maximized: true,
    spellcheckEnabled: true,
    editorFontSizePx: 22,
    maximizedTextWidthPx: 1200,
  });
});
