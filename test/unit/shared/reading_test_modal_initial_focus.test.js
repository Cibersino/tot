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
      contains(node) {
        if (node === this) return true;
        return children.some((child) => child.contains(node));
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
      querySelectorAll(selector) {
        if (selector !== 'input[type="radio"]') return [];
        const radios = [];
        const pending = children.slice();
        while (pending.length) {
          const candidate = pending.shift();
          if (candidate.tagName === 'input' && candidate.type === 'radio') radios.push(candidate);
          pending.push(...candidate._children);
        }
        return radios;
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
    documentElement: { dataset: { languageDirection: 'ltr' } },
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
  const translations = {
    'renderer.reading_test.questions.summary_aria': 'Question summary',
    'renderer.reading_test.result.summary_aria': 'Result summary',
  };
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
      async transitionRendererTranslations(language, { applyTranslations } = {}) {
        if (typeof applyTranslations === 'function') {
          await applyTranslations({ language, restoring: false });
        }
      },
      tRenderer(key) { return translations[key] || key; },
      msgRenderer(key) {
        if (key === 'renderer.reading_test.questions.random_value') {
          return 'Random probability: {percentage}';
        }
        return key;
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
  for (let index = 0; index < 5; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
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
    'readingTestQuestionsSummary',
  ], {
    '.reading-test-questions__actions': 'readingTestQuestionsActions',
    '.reading-test-questions__meta': 'readingTestQuestionsSummary',
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
      onSettingsChanged() {
        return () => {};
      },
      reportRendererI18nFailure() {},
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
  assert.equal(
    dom.elements.readingTestQuestionsSummary.getAttribute('aria-label'),
    'Question summary'
  );

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
    'readingTestResultSummaryRegion',
  ], {
    '.reading-test-result__meta': 'readingTestResultSummaryRegion',
  });
  let onInitData = null;
  let onSettingsChanged = null;
  const window = {
    ...createBaseWindow(),
    readingTestResultAPI: {
      async getSettings() {
        return { language: 'en' };
      },
      onInitData(handler) {
        onInitData = handler;
      },
      onSettingsChanged(handler) {
        onSettingsChanged = handler;
        return () => {};
      },
      reportRendererI18nFailure() {},
    },
  };

  runRendererScript('../../../public/reading_test_result.js', window, dom.document);
  dom.start();
  onInitData({ measuredWpm: 240, elapsedMs: 60000, wordCount: 240 });
  await flushAsyncWork();

  assert.equal(dom.elements.readingTestResultWpmValue.textContent, '240');
  assert.equal(dom.getActiveElement(), dom.elements.readingTestResultContinue);
  assert.equal(
    dom.elements.readingTestResultSummaryRegion.getAttribute('aria-label'),
    'Result summary'
  );

  const originalSummaryRow = dom.elements.readingTestResultSummary._children[0];
  onSettingsChanged({ language: 'en', modeConteo: 'simple' });
  await flushAsyncWork();

  assert.equal(dom.elements.readingTestResultSummary._children[0], originalSummaryRow);
  assert.equal(dom.getActiveElement(), dom.elements.readingTestResultContinue);
});

test('reading-test result closes locally when its required DOM contract is unavailable', () => {
  const dom = createDomHarness([
    'readingTestResultTitle',
    'readingTestResultWpmLabel',
    'readingTestResultSummary',
    'readingTestResultContinue',
    'readingTestResultSummaryRegion',
  ], {
    '.reading-test-result__meta': 'readingTestResultSummaryRegion',
  });
  let closeCalls = 0;
  let settingsReads = 0;
  let initSubscriptions = 0;
  let settingsSubscriptions = 0;
  const window = {
    ...createBaseWindow(),
    readingTestResultAPI: {
      async getSettings() {
        settingsReads += 1;
        return { language: 'en' };
      },
      onInitData() {
        initSubscriptions += 1;
      },
      onSettingsChanged() {
        settingsSubscriptions += 1;
      },
      reportRendererI18nFailure() {},
    },
    close() {
      closeCalls += 1;
    },
  };

  runRendererScript('../../../public/reading_test_result.js', window, dom.document);
  dom.start();

  assert.equal(closeCalls, 1);
  assert.equal(settingsReads, 0);
  assert.equal(initSubscriptions, 0);
  assert.equal(settingsSubscriptions, 0);
});

test('reading-test result treats an initial-settings failure after replay establishment as recoverable', async () => {
  const dom = createDomHarness([
    'readingTestResultTitle',
    'readingTestResultWpmLabel',
    'readingTestResultWpmValue',
    'readingTestResultSummary',
    'readingTestResultContinue',
    'readingTestResultSummaryRegion',
  ], {
    '.reading-test-result__meta': 'readingTestResultSummaryRegion',
  });
  let transitionCount = 0;
  let reporterCalls = 0;
  let closeCalls = 0;
  const baseWindow = createBaseWindow();
  const window = {
    ...baseWindow,
    RendererI18n: {
      ...baseWindow.RendererI18n,
      async transitionRendererTranslations(language, { applyTranslations } = {}) {
        transitionCount += 1;
        if (transitionCount === 2) {
          const err = new Error('Cannot prepare replayed initial settings');
          err.rendererI18nTransition = {
            hadEstablishedState: true,
            restorationFailed: false,
          };
          throw err;
        }
        if (typeof applyTranslations === 'function') {
          await applyTranslations({ language, restoring: false });
        }
      },
    },
    readingTestResultAPI: {
      async getSettings() {
        return { language: 'en' };
      },
      onInitData(handler) {
        handler({ measuredWpm: 240, elapsedMs: 60000, wordCount: 240 });
      },
      onSettingsChanged() {
        return () => {};
      },
      reportRendererI18nFailure() {
        reporterCalls += 1;
      },
    },
    close() {
      closeCalls += 1;
    },
  };

  runRendererScript('../../../public/reading_test_result.js', window, dom.document);
  dom.start();
  await flushAsyncWork();

  assert.equal(transitionCount, 2);
  assert.equal(reporterCalls, 0);
  assert.equal(closeCalls, 0);
});

test('reading-test result stops queued init and settings work after terminal i18n failure', async () => {
  const dom = createDomHarness([
    'readingTestResultTitle',
    'readingTestResultWpmLabel',
    'readingTestResultWpmValue',
    'readingTestResultSummary',
    'readingTestResultContinue',
    'readingTestResultSummaryRegion',
  ], {
    '.reading-test-result__meta': 'readingTestResultSummaryRegion',
  });
  let transitionCount = 0;
  let reporterCalls = 0;
  let onInitData = null;
  let onSettingsChanged = null;
  const baseWindow = createBaseWindow();
  const window = {
    ...baseWindow,
    RendererI18n: {
      ...baseWindow.RendererI18n,
      async transitionRendererTranslations() {
        transitionCount += 1;
        const err = new Error('Cannot establish renderer translation state');
        err.rendererI18nTransition = {
          hadEstablishedState: false,
          restorationFailed: false,
        };
        throw err;
      },
    },
    readingTestResultAPI: {
      async getSettings() {
        return { language: 'en' };
      },
      onInitData(handler) {
        onInitData = handler;
      },
      onSettingsChanged(handler) {
        onSettingsChanged = handler;
        return () => {};
      },
      reportRendererI18nFailure() {
        reporterCalls += 1;
      },
    },
  };

  runRendererScript('../../../public/reading_test_result.js', window, dom.document);
  dom.start();
  await flushAsyncWork();

  onInitData({ measuredWpm: 240, elapsedMs: 60000, wordCount: 240 });
  onSettingsChanged({ language: 'es' });
  await flushAsyncWork();

  assert.equal(transitionCount, 1);
  assert.equal(reporterCalls, 1);
  assert.equal(dom.elements.readingTestResultWpmValue.textContent, '');
});

test('reading-test result preserves its established language and formatting after preparation fails', async () => {
  const dom = createDomHarness([
    'readingTestResultTitle',
    'readingTestResultWpmLabel',
    'readingTestResultWpmValue',
    'readingTestResultSummary',
    'readingTestResultContinue',
    'readingTestResultSummaryRegion',
  ], {
    '.reading-test-result__meta': 'readingTestResultSummaryRegion',
  });
  let onInitData = null;
  let onSettingsChanged = null;
  let rejectSpanishPreparation = true;
  const baseWindow = createBaseWindow();
  const window = {
    ...baseWindow,
    FormatUtils: {
      async obtenerSeparadoresDeNumeros(language, settings) {
        return settings.numberFormatting[language] || settings.numberFormatting.en;
      },
      formatearNumero(value, thousands, decimal) {
        return `${value}[${thousands}${decimal}]`;
      },
    },
    RendererI18n: {
      ...baseWindow.RendererI18n,
      async transitionRendererTranslations(language, options) {
        if (language === 'es' && rejectSpanishPreparation) {
          rejectSpanishPreparation = false;
          const err = new Error('Cannot prepare Spanish translations');
          err.rendererI18nTransition = {
            hadEstablishedState: true,
            restorationFailed: false,
          };
          throw err;
        }
        return baseWindow.RendererI18n.transitionRendererTranslations(language, options);
      },
    },
    readingTestResultAPI: {
      async getSettings() {
        return {
          language: 'en',
          numberFormatting: {
            en: { separadorMiles: ',', separadorDecimal: '.' },
          },
        };
      },
      onInitData(handler) {
        onInitData = handler;
      },
      onSettingsChanged(handler) {
        onSettingsChanged = handler;
        return () => {};
      },
      reportRendererI18nFailure() {},
    },
  };

  runRendererScript('../../../public/reading_test_result.js', window, dom.document);
  dom.start();
  await flushAsyncWork();

  onSettingsChanged({
    language: 'es',
    numberFormatting: {
      es: { separadorMiles: '.', separadorDecimal: ',' },
    },
  });
  await flushAsyncWork();

  onInitData({ measuredWpm: 240, elapsedMs: 60000, wordCount: 240 });
  await flushAsyncWork();

  assert.equal(dom.elements.readingTestResultWpmValue.textContent, '240[,.]');
});
