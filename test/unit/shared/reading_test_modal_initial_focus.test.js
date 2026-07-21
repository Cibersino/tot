'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const questionsCore = require('../../../public/js/lib/reading_test_questions_core');

function createDomHarness(requiredIds, queryElements = {}) {
  let activeElement = null;
  let domContentLoaded = null;

  function createElement(id = '', tagName = 'div') {
    const attributes = {};
    const children = [];
    const listeners = new Map();
    let textContent = '';

    return {
      id,
      tagName,
      className: '',
      dataset: {},
      dir: '',
      href: '',
      type: '',
      name: '',
      value: '',
      checked: false,
      disabled: false,
      parentNode: null,
      get _children() {
        return children;
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
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(handler);
      },
      dispatch(type, event = {}) {
        (listeners.get(type) || []).forEach((handler) => handler(event));
      },
      setAttribute(name, value) {
        attributes[name] = String(value);
      },
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(attributes, name)
          ? attributes[name]
          : null;
      },
      querySelector(selector) {
        if (selector !== 'input[type="radio"]') return null;
        const pending = children.slice();
        while (pending.length) {
          const candidate = pending.shift();
          if (candidate.tagName === 'input' && candidate.type === 'radio') return candidate;
          pending.push(...candidate._children);
        }
        return null;
      },
      focus() {
        activeElement = this;
      },
      getBoundingClientRect() {
        return { top: 0 };
      },
    };
  }

  const elements = {};
  requiredIds.forEach((id) => {
    elements[id] = createElement(id);
  });
  Object.entries(queryElements).forEach(([selector, id]) => {
    elements[id] = elements[id] || createElement(id);
    queryElements[selector] = elements[id];
  });

  const document = {
    title: '',
    get activeElement() {
      return activeElement;
    },
    addEventListener(type, handler) {
      if (type === 'DOMContentLoaded') domContentLoaded = handler;
    },
    getElementById(id) {
      return elements[id] || null;
    },
    querySelector(selector) {
      return queryElements[selector] || null;
    },
    createElement(tagName) {
      return createElement('', tagName);
    },
    createTextNode(text) {
      const node = createElement('', '#text');
      node.textContent = text;
      return node;
    },
  };

  return {
    createElement,
    document,
    elements,
    getActiveElement() {
      return activeElement;
    },
    start() {
      domContentLoaded();
    },
  };
}

function createBaseWindow() {
  return {
    getLogger() {
      return {
        debug() {},
        info() {},
        warn() {},
        warnOnce() {},
        error() {},
        errorOnce() {},
      };
    },
    AppConstants: { DEFAULT_LANG: 'en' },
    RendererI18n: {
      async loadRendererTranslations() {},
      tRenderer(key) { return key; },
      msgRenderer(key) {
        if (key === 'renderer.reading_test.questions.random_value') {
          return 'Random probability: {percentage}';
        }
        return key;
      },
      applyWindowLanguageAttributes() {
        return { languageDirection: 'ltr' };
      },
      renderLocalizedLabelWithInvariantValue(element, { labelText, valueText }) {
        element.textContent = `${labelText}${valueText}`;
      },
    },
    FormatUtils: {
      async obtenerSeparadoresDeNumeros() {
        return { separadorMiles: ',', separadorDecimal: '.' };
      },
      formatearNumero(value) {
        return String(value);
      },
    },
    close() {},
    scrollBy() {},
  };
}

function runRendererScript(relativePath, window, document) {
  const sandbox = {
    window,
    document,
    console,
    requestAnimationFrame(handler) {
      handler();
    },
    setTimeout,
    clearTimeout,
  };
  vm.createContext(sandbox);
  const source = fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
  vm.runInContext(source, sandbox, { filename: relativePath });
}

async function flushAsyncWork() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

test('reading-test questions focuses the first answer and uses Continue when no answer exists', async () => {
  const dom = createDomHarness([
    'readingTestQuestionsTitle',
    'readingTestQuestionsIntro',
    'readingTestQuestionsRandomTitle',
    'readingTestQuestionsRandomValue',
    'readingTestQuestionsFeedbackTitle',
    'readingTestQuestionsFeedbackPrefix',
    'readingTestQuestionsFeedbackLink',
    'readingTestQuestionsIncomplete',
    'readingTestQuestionsResult',
    'readingTestQuestionsChance',
    'readingTestQuestionsFatal',
    'readingTestQuestionsForm',
    'readingTestQuestionsCheck',
    'readingTestQuestionsContinue',
    'readingTestQuestionsActions',
  ], {
    '.reading-test-questions__actions': 'readingTestQuestionsActions',
  });
  let onInitData = null;
  const window = {
    ...createBaseWindow(),
    ReadingTestQuestionsCore: questionsCore,
    readingTestQuestionsAPI: {
      async getSettings() {
        return { language: 'en' };
      },
      onInitData(handler) {
        onInitData = handler;
      },
    },
  };

  runRendererScript('../../../public/reading_test_questions.js', window, dom.document);
  dom.start();
  onInitData({
    questions: [{
      id: 'q1',
      prompt: 'Question one?',
      correctOptionId: 'a',
      options: [
        { id: 'a', text: 'Answer A' },
        { id: 'b', text: 'Answer B' },
      ],
    }],
  });
  await flushAsyncWork();

  const firstAnswer = dom.elements.readingTestQuestionsForm.querySelector('input[type="radio"]');
  assert.ok(firstAnswer);
  assert.equal(firstAnswer.checked, false);
  assert.equal(dom.getActiveElement(), firstAnswer);

  onInitData({ questions: [] });
  await flushAsyncWork();
  assert.equal(dom.getActiveElement(), dom.elements.readingTestQuestionsContinue);
});

test('reading-test result focuses Continue after result data renders', async () => {
  const dom = createDomHarness([
    'readingTestResultTitle',
    'readingTestResultWpmLabel',
    'readingTestResultWpmValue',
    'readingTestResultSummary',
    'readingTestResultContinue',
  ]);
  let onInitData = null;
  const window = {
    ...createBaseWindow(),
    readingTestResultAPI: {
      async getSettings() {
        return { language: 'en' };
      },
      onInitData(handler) {
        onInitData = handler;
      },
    },
  };

  runRendererScript('../../../public/reading_test_result.js', window, dom.document);
  dom.start();
  onInitData({ measuredWpm: 240, elapsedMs: 60000, wordCount: 240 });
  await flushAsyncWork();

  assert.equal(dom.elements.readingTestResultWpmValue.textContent, '240');
  assert.equal(dom.getActiveElement(), dom.elements.readingTestResultContinue);
});
