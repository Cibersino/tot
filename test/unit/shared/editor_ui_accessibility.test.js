'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createElement() {
  const attributes = {};
  return {
    textContent: '',
    disabled: false,
    clientHeight: 600,
    scrollHeight: 600,
    scrollTop: 0,
    setAttribute(name, value) { attributes[name] = String(value); },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
  };
}

function readRendererValue(language, key) {
  const bundle = JSON.parse(fs.readFileSync(
    path.resolve(__dirname, `../../../i18n/${language}/renderer.json`),
    'utf8'
  ));
  return key.split('.').reduce((value, segment) => value?.[segment], bundle);
}

function createHarness() {
  let activeLanguage = 'en';
  const dom = Object.fromEntries([
    'editorWrap', 'editorLayout', 'editorLeftGutter', 'editorTextColumn', 'editorRightGutter',
    'editor', 'btnTrash', 'calcWhileTyping', 'spellcheckToggle', 'btnCalc', 'calcLabel',
    'spellcheckLabel', 'applyDescription', 'autoApplyDescription', 'spellcheckDescription',
    'textSizeControls', 'textSizeLabel', 'btnTextSizeDecrease', 'btnTextSizeIncrease',
    'btnTextSizeReset', 'textSizeValue', 'readProgress', 'readProgressLabel',
    'readProgressValue', 'bottomBar', 'readingTestPrestartOverlay', 'readingTestPrestartMessage',
  ].map((name) => [name, createElement()]));
  const state = {
    idiomaActual: 'en',
    translationsLoadedFor: null,
    editorFontSizePx: 20,
    editorWindowMaximized: false,
    maximizedTextWidthPx: 960,
    readProgressFramePending: false,
  };
  const sandbox = {
    window: {
      getLogger() {
        return { warn() {}, warnOnce() {}, error() {} };
      },
      requestAnimationFrame(callback) { callback(); },
    },
    document: {
      title: '',
      documentElement: { style: { setProperty() {} } },
      body: { classList: { toggle() {} } },
    },
    setTimeout,
    clearTimeout,
  };
  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/editor_ui.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/editor_ui.js' });
  const ui = sandbox.window.EditorUI.createEditorUI({
    editorAPI: {},
    DEFAULT_LANG: 'en',
    EDITOR_FONT_SIZE_DEFAULT_PX: 20,
    EDITOR_FONT_SIZE_MIN_PX: 12,
    EDITOR_FONT_SIZE_MAX_PX: 36,
    rendererI18n: {
      tRenderer(key) { return readRendererValue(activeLanguage, key) || key; },
      resolveUserTextDirection() { return 'ltr'; },
    },
    dom,
    state,
    engine: {},
  });
  return {
    dom,
    state,
    ui,
    setActiveLanguage(language) { activeLanguage = language; },
  };
}

test('Editor translation updates keep compact control names separate from shared description/tooltip help', async () => {
  const harness = createHarness();

  await harness.ui.applyEditorTranslations();

  assert.equal(harness.dom.btnCalc.getAttribute('aria-label'), 'Apply');
  assert.equal(
    harness.dom.btnCalc.getAttribute('data-tot-tooltip'),
    'Apply the editor text as the current text'
  );
  assert.equal(
    harness.dom.applyDescription.textContent,
    'Apply the editor text as the current text'
  );
  assert.equal(harness.dom.calcWhileTyping.getAttribute('aria-label'), 'Auto');
  assert.equal(
    harness.dom.calcLabel.getAttribute('data-tot-tooltip'),
    'Automatically apply editor changes to the current text while typing'
  );
  assert.equal(
    harness.dom.autoApplyDescription.textContent,
    'Automatically apply editor changes to the current text while typing'
  );
  assert.equal(harness.dom.spellcheckToggle.getAttribute('aria-label'), 'Spellcheck');
  assert.equal(
    harness.dom.spellcheckLabel.getAttribute('data-tot-tooltip'),
    'Turn spellcheck on or off for the editor text'
  );
  assert.equal(
    harness.dom.spellcheckDescription.textContent,
    'Turn spellcheck on or off for the editor text'
  );

  harness.state.idiomaActual = 'es';
  harness.setActiveLanguage('es');
  await harness.ui.applyEditorTranslations();
  assert.equal(harness.dom.btnCalc.getAttribute('aria-label'), 'Aplicar');
  assert.equal(
    harness.dom.btnCalc.getAttribute('data-tot-tooltip'),
    'Aplicar el texto del editor como texto actual'
  );
  assert.equal(
    harness.dom.applyDescription.textContent,
    'Aplicar el texto del editor como texto actual'
  );
  assert.equal(harness.dom.spellcheckToggle.getAttribute('aria-label'), 'Ortografía');
  assert.equal(
    harness.dom.spellcheckDescription.textContent,
    'Activar o desactivar el corrector ortográfico en el texto del editor'
  );
});

test('Editor markup relates each compact control to its stable description node', () => {
  const markup = fs.readFileSync(path.resolve(__dirname, '../../../public/editor.html'), 'utf8');

  assert.match(markup, /id="btnCalc"[^>]*aria-describedby="editorApplyDescription"/);
  assert.match(markup, /id="calcWhileTyping"[^>]*aria-describedby="editorAutoApplyDescription"/);
  assert.match(markup, /id="spellcheckToggle"[^>]*aria-describedby="editorSpellcheckDescription"/);
});
