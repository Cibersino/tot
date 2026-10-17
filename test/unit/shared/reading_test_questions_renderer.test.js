'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(resolve));
}

async function flushRendererWork() {
  for (let index = 0; index < 5; index += 1) {
    await flushAsyncWork();
  }
}

function createDeferred() {
  let resolve;
  const promise = new Promise((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function createDocumentHarness() {
  const elements = new Map();
  const documentListeners = new Map();
  const document = {
    activeElement: null,
    addEventListener(type, listener) {
      documentListeners.set(type, listener);
    },
    createElement(tagName) {
      return createElement(String(tagName || 'div'), document);
    },
    createTextNode(text) {
      return {
        nodeType: 3,
        parentNode: null,
        textContent: String(text ?? ''),
      };
    },
    getElementById(id) {
      return elements.get(id) || null;
    },
    querySelector(selector) {
      if (selector === '.reading-test-questions__meta') {
        return elements.get('summaryRegion') || null;
      }
      if (selector === '.reading-test-questions__actions') {
        return elements.get('actions') || null;
      }
      return null;
    },
  };
  const body = createElement('body', document);
  document.body = body;

  function addElement(id, tagName = 'div') {
    const element = createElement(tagName, document);
    element.id = id;
    elements.set(id, element);
    body.appendChild(element);
    return element;
  }

  const namedElements = {
    title: addElement('readingTestQuestionsTitle', 'h1'),
    intro: addElement('readingTestQuestionsIntro', 'p'),
    randomTitle: addElement('readingTestQuestionsRandomTitle', 'h2'),
    randomValue: addElement('readingTestQuestionsRandomValue', 'p'),
    feedbackTitle: addElement('readingTestQuestionsFeedbackTitle', 'h2'),
    feedbackPrefix: addElement('readingTestQuestionsFeedbackPrefix', 'span'),
    feedbackLink: addElement('readingTestQuestionsFeedbackLink', 'a'),
    summaryRegion: addElement('summaryRegion', 'section'),
    incompleteMessage: addElement('readingTestQuestionsIncomplete', 'div'),
    resultMessage: addElement('readingTestQuestionsResult', 'div'),
    chanceMessage: addElement('readingTestQuestionsChance', 'div'),
    fatalMessage: addElement('readingTestQuestionsFatal', 'div'),
    form: addElement('readingTestQuestionsForm', 'form'),
    btnCheck: addElement('readingTestQuestionsCheck', 'button'),
    btnContinue: addElement('readingTestQuestionsContinue', 'button'),
    actions: addElement('actions', 'div'),
  };

  return {
    document,
    elements: namedElements,
    fireDomContentLoaded() {
      const listener = documentListeners.get('DOMContentLoaded');
      if (listener) listener();
    },
    removeElement(id) {
      elements.delete(id);
    },
  };
}

function createElement(tagName, ownerDocument) {
  const attributes = {};
  const listeners = new Map();
  const childNodes = [];
  let ownText = '';

  function clearChildren() {
    childNodes.forEach((child) => {
      if (child && typeof child === 'object') child.parentNode = null;
    });
    childNodes.length = 0;
  }

  function contains(node) {
    if (node === element) return true;
    return childNodes.some((child) => {
      if (!child || typeof child !== 'object' || child.nodeType !== 1) return false;
      return typeof child.contains === 'function' && child.contains(node);
    });
  }

  function findAll(predicate, node = element, matches = []) {
    (node.childNodes || []).forEach((child) => {
      if (!child || typeof child !== 'object') return;
      if (child.nodeType === 1 && predicate(child)) matches.push(child);
      if (child.nodeType === 1) findAll(predicate, child, matches);
    });
    return matches;
  }

  const element = {
    nodeType: 1,
    tagName: String(tagName || 'div').toUpperCase(),
    childNodes,
    className: '',
    dataset: {},
    disabled: false,
    focusCount: 0,
    hidden: false,
    id: '',
    name: '',
    ownerDocument,
    parentNode: null,
    type: '',
    value: '',
    checked: false,
    clearCount: 0,
    appendChild(child) {
      if (!child || typeof child !== 'object') return child;
      child.parentNode = this;
      childNodes.push(child);
      return child;
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    contains,
    dispatch(type, event = {}) {
      const handlers = listeners.get(type) || [];
      handlers.forEach((listener) => listener(event));
    },
    focus() {
      this.focusCount += 1;
      ownerDocument.activeElement = this;
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    getBoundingClientRect() {
      return { top: 0 };
    },
    querySelector(selector) {
      if (selector === 'input[type="radio"]') {
        return findAll((candidate) => candidate.tagName === 'INPUT' && candidate.type === 'radio')[0] || null;
      }
      return null;
    },
    querySelectorAll(selector) {
      if (selector === 'input[type="radio"]') {
        return findAll((candidate) => candidate.tagName === 'INPUT' && candidate.type === 'radio');
      }
      return [];
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
  };

  Object.defineProperty(element, 'innerHTML', {
    get() {
      return '';
    },
    set(value) {
      element.clearCount += 1;
      ownText = String(value ?? '');
      clearChildren();
    },
  });
  Object.defineProperty(element, 'textContent', {
    get() {
      return ownText + childNodes.map((child) => String(child.textContent || '')).join('');
    },
    set(value) {
      ownText = String(value ?? '');
      clearChildren();
    },
  });

  return element;
}

function createRendererHarness({
  includeI18nFailureReporter = true,
  missingGetSettings = false,
  onInitDataRegistrationError = null,
  onInitDataThrowBeforeRegister = false,
  onSettingsChangedRegistrationError = null,
  rejectBeforeApplyLanguage = '',
  rejectTransitionRequestNumber = 0,
  rejectionHadEstablishedState = true,
  rejectionRestorationFailed = false,
  reporterThrows = false,
  initPayloadOnSubscribe = null,
  messageOverrides = {},
  questionsCoreOverride = null,
  missingRequiredElement = '',
} = {}) {
  const dom = createDocumentHarness();
  if (missingRequiredElement) dom.removeElement(missingRequiredElement);
  const callbacks = {};
  const logEntries = { error: [], warn: [] };
  const translationRequests = [];
  const deferredLoads = new Map();
  let closeCalls = 0;
  let getSettingsCalls = 0;
  let settingsListenerRegistrations = 0;
  let reporterCalls = 0;
  let activeLanguage = 'en';
  const translations = {
    en: {
      'renderer.reading_test.questions.title': 'Questions',
      'renderer.reading_test.questions.intro': 'Answer the questions.',
      'renderer.reading_test.questions.random_title': 'Random chance',
      'renderer.reading_test.questions.feedback_title': 'Feedback',
      'renderer.reading_test.questions.feedback_prefix': 'Feedback:',
      'renderer.reading_test.questions.summary_aria': 'Question summary',
      'renderer.reading_test.questions.check_button': 'Check',
      'renderer.reading_test.questions.continue_button': 'Continue',
      'renderer.reading_test.questions.incomplete_warning': 'Complete every question.',
      'renderer.reading_test.questions.fatal_invalid': 'Invalid questions.',
      'renderer.reading_test.questions.random_value': 'Random chance: {percentage}',
      'renderer.reading_test.questions.result_summary': 'Result: {correct}/{total} ({percentage}%)',
      'renderer.reading_test.questions.chance_at_least_observed': 'Chance: {percentage}%',
      'renderer.reading_test.questions.question_heading': 'Question {number}: {prompt}',
    },
    es: {
      'renderer.reading_test.questions.title': 'Preguntas',
      'renderer.reading_test.questions.intro': 'Responde las preguntas.',
      'renderer.reading_test.questions.random_title': 'Probabilidad al azar',
      'renderer.reading_test.questions.feedback_title': 'Comentarios',
      'renderer.reading_test.questions.feedback_prefix': 'Comentarios:',
      'renderer.reading_test.questions.summary_aria': 'Resumen de preguntas',
      'renderer.reading_test.questions.check_button': 'Comprobar',
      'renderer.reading_test.questions.continue_button': 'Continuar',
      'renderer.reading_test.questions.incomplete_warning': 'Completa todas las preguntas.',
      'renderer.reading_test.questions.fatal_invalid': 'Preguntas inválidas.',
      'renderer.reading_test.questions.random_value': 'Azar: {percentage}',
      'renderer.reading_test.questions.result_summary': 'Resultado: {correct}/{total} ({percentage}%)',
      'renderer.reading_test.questions.chance_at_least_observed': 'Probabilidad: {percentage}%',
      'renderer.reading_test.questions.question_heading': 'Pregunta {number}: {prompt}',
    },
  };

  function renderMessage(key, params = {}) {
    const template = messageOverrides[activeLanguage]?.[key]
      || translations[activeLanguage][key]
      || key;
    return Object.entries(params).reduce(
      (message, [name, value]) => message.replace(`{${name}}`, String(value)),
      template
    );
  }

  const window = {
    AppConstants: { DEFAULT_LANG: 'en' },
    FormatUtils: {
      async obtenerSeparadoresDeNumeros(language, settings) {
        const languageBase = String(language || 'en').split(/[-_]/u)[0];
        const numberFormatting = settings && settings.numberFormatting
          ? settings.numberFormatting
          : { en: { separadorMiles: ',', separadorDecimal: '.' } };
        return numberFormatting[languageBase] || numberFormatting.en;
      },
      formatearNumero(value, thousands, decimal, fractionDigits = 0) {
        return `${Number(value).toFixed(fractionDigits)}[${thousands}${decimal}]`;
      },
    },
    ReadingTestQuestionsCore: questionsCoreOverride || {
      computeRandomGuessPercentage() {
        return 25;
      },
      scoreQuestions() {
        return {
          correct: 1,
          total: 1,
          percentage: 100,
          probabilityAtLeastObserved: 0.25,
        };
      },
      validateQuestionsPayload({ questions }) {
        return { ok: true, questions };
      },
    },
    RendererI18n: {
      async transitionRendererTranslations(language, { applyTranslations } = {}) {
        translationRequests.push(language);
        const deferred = deferredLoads.get(language);
        if (deferred) await deferred.promise;
        if (
          language === rejectBeforeApplyLanguage
          && (!rejectTransitionRequestNumber || translationRequests.length === rejectTransitionRequestNumber)
        ) {
          const err = new Error(`Cannot prepare ${language} translations`);
          err.rendererI18nTransition = {
            hadEstablishedState: rejectionHadEstablishedState,
            restorationFailed: rejectionRestorationFailed,
          };
          throw err;
        }
        activeLanguage = language;
        if (typeof applyTranslations === 'function') {
          await applyTranslations({ language, restoring: false });
        }
      },
      msgRenderer: renderMessage,
      tRenderer(key) {
        return translations[activeLanguage][key] || key;
      },
    },
    getLogger() {
      return {
        debug() {},
        error(...args) {
          logEntries.error.push(args);
        },
        warn(...args) {
          logEntries.warn.push(args);
        },
      };
    },
    readingTestQuestionsAPI: {
      async getSettings() {
        getSettingsCalls += 1;
        return {
          language: 'en',
          numberFormatting: {
            en: { separadorMiles: ',', separadorDecimal: '.' },
          },
        };
      },
      onInitData(callback) {
        if (onInitDataRegistrationError && onInitDataThrowBeforeRegister) {
          throw onInitDataRegistrationError;
        }
        callbacks.initData = callback;
        if (initPayloadOnSubscribe) callback(initPayloadOnSubscribe);
        if (onInitDataRegistrationError) throw onInitDataRegistrationError;
      },
      onSettingsChanged(callback) {
        settingsListenerRegistrations += 1;
        callbacks.settingsChanged = callback;
        if (onSettingsChangedRegistrationError) throw onSettingsChangedRegistrationError;
      },
    },
    requestAnimationFrame(callback) {
      callback();
    },
    scrollBy() {},
    close() {
      closeCalls += 1;
    },
  };
  if (includeI18nFailureReporter) {
    window.readingTestQuestionsAPI.reportRendererI18nFailure = () => {
      reporterCalls += 1;
      if (reporterThrows) {
        throw new Error('renderer i18n failure reporter unavailable');
      }
    };
  }
  if (missingGetSettings) delete window.readingTestQuestionsAPI.getSettings;

  const sandbox = {
    console,
    document: dom.document,
    requestAnimationFrame: window.requestAnimationFrame,
    window,
  };
  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/reading_test_questions.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/reading_test_questions.js' });
  dom.fireDomContentLoaded();

  return {
    callbacks,
    elements: dom.elements,
    getInputs() {
      return dom.elements.form.querySelectorAll('input[type="radio"]');
    },
    getActiveElement() {
      return dom.document.activeElement;
    },
    holdTranslationLoad(language) {
      const deferred = createDeferred();
      deferredLoads.set(language, deferred);
      return deferred;
    },
    translationRequests,
    getCloseCalls() {
      return closeCalls;
    },
    getErrorLogEntries() {
      return logEntries.error;
    },
    getGetSettingsCalls() {
      return getSettingsCalls;
    },
    getReporterCalls() {
      return reporterCalls;
    },
    getSettingsListenerRegistrations() {
      return settingsListenerRegistrations;
    },
    getWarnLogEntries() {
      return logEntries.warn;
    },
  };
}

function createMissingSettingsListenerBootstrapHarness({
  file,
  apiName,
  missingGetSettings = false,
  reporterMode,
}) {
  const errorLogEntries = [];
  const warnLogEntries = [];
  const reporterPayloads = [];
  let closeCalls = 0;
  let domContentLoadedListeners = 0;
  let getSettingsCalls = 0;
  const api = {
    onInitData() {},
  };
  if (!missingGetSettings) {
    api.getSettings = () => {
      getSettingsCalls += 1;
    };
  }
  if (reporterMode !== 'absent') {
    api.reportRendererI18nFailure = (payload) => {
      reporterPayloads.push(payload);
      if (reporterMode === 'throws') throw new Error('reporter failure');
    };
  }
  const window = {
    AppConstants: { DEFAULT_LANG: 'en' },
    FormatUtils: {
      formatearNumero() {},
      obtenerSeparadoresDeNumeros() {},
    },
    RendererI18n: {
      msgRenderer() {},
      renderLocalizedLabelWithInvariantValue() {},
      tRenderer() {},
      transitionRendererTranslations() {},
    },
    ReadingTestQuestionsCore: {
      computeRandomGuessPercentage() {},
      scoreQuestions() {},
      validateQuestionsPayload() {},
    },
    getLogger() {
      return {
        debug() {},
        error(...args) {
          errorLogEntries.push(args);
        },
        warn(...args) {
          warnLogEntries.push(args);
        },
      };
    },
    [apiName]: api,
    close() {
      closeCalls += 1;
    },
  };
  const sandbox = {
    console,
    document: {
      addEventListener() {
        domContentLoadedListeners += 1;
      },
    },
    window,
  };
  vm.createContext(sandbox);
  const source = fs.readFileSync(path.resolve(__dirname, `../../../public/${file}`), 'utf8');

  return {
    getCloseCalls() {
      return closeCalls;
    },
    getDomContentLoadedListeners() {
      return domContentLoadedListeners;
    },
    getErrorLogEntries() {
      return errorLogEntries;
    },
    getGetSettingsCalls() {
      return getSettingsCalls;
    },
    getReporterPayloads() {
      return reporterPayloads;
    },
    getWarnLogEntries() {
      return warnLogEntries;
    },
    run() {
      vm.runInContext(source, sandbox, { filename: `public/${file}` });
    },
  };
}

test('Reading Test renderer scripts close locally when RendererI18n is unavailable at load time', () => {
  const rendererScripts = [
    {
      file: 'reading_test_questions.js',
      apiName: 'readingTestQuestionsAPI',
      errorPattern: /\[reading-test-questions\] RendererI18n unavailable/u,
    },
    {
      file: 'reading_test_result.js',
      apiName: 'readingTestResultAPI',
      errorPattern: /\[reading-test-result\] RendererI18n unavailable/u,
    },
  ];

  rendererScripts.forEach(({ file, apiName, errorPattern }) => {
    let closeCalls = 0;
    const window = {
      getLogger() {
        return {
          debug() {},
          error() {},
          warn() {},
        };
      },
      [apiName]: {
        getSettings() {},
        onInitData() {},
        onSettingsChanged() {},
      },
      close() {
        closeCalls += 1;
      },
    };
    const sandbox = {
      console,
      document: {
        addEventListener() {},
      },
      window,
    };
    vm.createContext(sandbox);
    const source = fs.readFileSync(
      path.resolve(__dirname, `../../../public/${file}`),
      'utf8'
    );

    assert.throws(
      () => vm.runInContext(source, sandbox, { filename: `public/${file}` }),
      errorPattern
    );
    assert.equal(closeCalls, 1);
  });
});

test('Reading Test renderer scripts fail-close direct pre-wiring bootstrap aborts', () => {
  const rendererScripts = [
    {
      file: 'reading_test_questions.js',
      apiName: 'readingTestQuestionsAPI',
      errorPrefix: 'reading-test-questions',
    },
    {
      file: 'reading_test_result.js',
      apiName: 'readingTestResultAPI',
      errorPrefix: 'reading-test-result',
    },
  ];

  function runBootstrap(file, window) {
    const sandbox = {
      console,
      document: {
        addEventListener() {},
      },
      window,
    };
    vm.createContext(sandbox);
    const source = fs.readFileSync(
      path.resolve(__dirname, `../../../public/${file}`),
      'utf8'
    );
    return () => vm.runInContext(source, sandbox, { filename: `public/${file}` });
  }

  rendererScripts.forEach(({ file, apiName, errorPrefix }) => {
    let missingLoggerCloseCalls = 0;
    assert.throws(
      runBootstrap(file, {
        close() {
          missingLoggerCloseCalls += 1;
        },
      }),
      new RegExp(`\\[${errorPrefix}\\] window\\.getLogger unavailable`, 'u')
    );
    assert.equal(missingLoggerCloseCalls, 1);

    let loggerFailureCloseCalls = 0;
    const loggerErrors = [];
    assert.throws(
      runBootstrap(file, {
        getLogger() {
          return {
            debug() {
              throw new Error('logger startup failed');
            },
            error(...args) {
              loggerErrors.push(args);
            },
          };
        },
        close() {
          loggerFailureCloseCalls += 1;
        },
      }),
      /logger startup failed/u
    );
    assert.equal(loggerFailureCloseCalls, 1);
    assert.equal(loggerErrors.length, 1);

    let incompleteApiCloseCalls = 0;
    const apiErrors = [];
    assert.throws(
      runBootstrap(file, {
        getLogger() {
          return {
            debug() {},
            error(...args) {
              apiErrors.push(args);
            },
          };
        },
        [apiName]: {
          getSettings() {},
          onSettingsChanged() {},
        },
        close() {
          incompleteApiCloseCalls += 1;
        },
      }),
      new RegExp(`\\[${errorPrefix}\\] ${apiName}\\.onInitData unavailable or non-callable`, 'u')
    );
    assert.equal(incompleteApiCloseCalls, 1);
    assert.equal(apiErrors.length, 1);
  });
});

test('Reading Test renderer scripts report an unavailable settings listener before DOM wiring', () => {
  const rendererScripts = [
    {
      apiName: 'readingTestQuestionsAPI',
      errorPrefix: 'reading-test-questions',
      file: 'reading_test_questions.js',
    },
    {
      apiName: 'readingTestResultAPI',
      errorPrefix: 'reading-test-result',
      file: 'reading_test_result.js',
    },
  ];

  rendererScripts.forEach(({ apiName, errorPrefix, file }) => {
    ['normal', 'absent', 'throws'].forEach((reporterMode) => {
      const harness = createMissingSettingsListenerBootstrapHarness({
        apiName,
        file,
        reporterMode,
      });

      assert.throws(
        () => harness.run(),
        new RegExp(`\\[${errorPrefix}\\].*onSettingsChanged unavailable`, 'u')
      );
      assert.equal(harness.getDomContentLoadedListeners(), 0);
      assert.match(
        harness.getErrorLogEntries()[0][0],
        /onSettingsChanged unavailable; required settings synchronization/u
      );

      if (reporterMode === 'normal') {
        assert.equal(harness.getCloseCalls(), 0);
        assert.equal(harness.getReporterPayloads().length, 1);
        assert.equal(harness.getReporterPayloads()[0].kind, 'settings-listener');
      } else {
        assert.equal(harness.getCloseCalls(), 1);
        assert.equal(harness.getWarnLogEntries().length, 1);
      }
    });
  });
});

test('missing initial settings does not recover after the settings-listener bootstrap abort', () => {
  const rendererScripts = [
    {
      apiName: 'readingTestQuestionsAPI',
      errorPrefix: 'reading-test-questions',
      file: 'reading_test_questions.js',
    },
    {
      apiName: 'readingTestResultAPI',
      errorPrefix: 'reading-test-result',
      file: 'reading_test_result.js',
    },
  ];

  rendererScripts.forEach(({ apiName, errorPrefix, file }) => {
    const harness = createMissingSettingsListenerBootstrapHarness({
      apiName,
      file,
      missingGetSettings: true,
      reporterMode: 'normal',
    });

    assert.throws(
      () => harness.run(),
      new RegExp(`\\[${errorPrefix}\\].*onSettingsChanged unavailable`, 'u')
    );
    assert.equal(harness.getDomContentLoadedListeners(), 0);
    assert.equal(harness.getGetSettingsCalls(), 0);
    assert.equal(harness.getReporterPayloads().length, 1);
    assert.equal(harness.getReporterPayloads()[0].kind, 'settings-listener');
    assert.equal(harness.getCloseCalls(), 0);
    assert.equal(harness.getWarnLogEntries().length, 0);
  });
});

test('Questions uses defaults when getSettings is unavailable', async () => {
  const harness = createRendererHarness({ missingGetSettings: true });
  await flushRendererWork();

  harness.callbacks.initData({
    developerEmail: 'support@example.test',
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
  await flushRendererWork();

  assert.equal(harness.getGetSettingsCalls(), 0);
  assert.deepEqual(harness.translationRequests, ['en', 'en']);
  assert.equal(harness.getCloseCalls(), 0);
  assert.equal(harness.getReporterCalls(), 0);
  assert.equal(harness.elements.title.textContent, 'Questions');
  assert.match(harness.elements.randomValue.textContent, /25\.00\[,\.\]%/u);
  assert.equal(harness.elements.btnCheck.disabled, false);
  const inputs = harness.getInputs();
  assert.equal(inputs.length, 2);
  assert.ok(inputs.every((input) => input.disabled === false));
  inputs[0].checked = true;
  inputs[0].dispatch('change');
  harness.elements.btnCheck.dispatch('click');
  await flushRendererWork();
  assert.match(harness.elements.resultMessage.textContent, /1\/1 \(100\.00\[,\.\]%\)/u);
  assert.equal(harness.getWarnLogEntries().filter(([message]) => (
    message === 'BOOTSTRAP: readingTestQuestionsAPI.getSettings unavailable; using default renderer settings.'
  )).length, 1);
});

test('Questions continues percentage processing when a translation omits its placeholder', async () => {
  const harness = createRendererHarness({
    messageOverrides: {
      en: {
        'renderer.reading_test.questions.random_value': 'Random',
        'renderer.reading_test.questions.result_summary': '{correct}/{total} complete',
        'renderer.reading_test.questions.chance_at_least_observed': 'Chance',
      },
    },
  });
  await flushRendererWork();

  harness.callbacks.initData({
    developerEmail: 'support@example.test',
    questions: [{
      id: 'q1',
      prompt: 'Question one?',
      options: [
        { id: 'a', text: 'Answer A' },
        { id: 'b', text: 'Answer B' },
      ],
    }],
  });
  await flushRendererWork();

  const [firstInput] = harness.getInputs();
  firstInput.checked = true;
  firstInput.dispatch('change');
  harness.elements.btnCheck.dispatch('click');
  await flushRendererWork();

  const percentageMessages = [
    [harness.elements.randomValue, '25.00[,.]%'],
    [harness.elements.resultMessage, '100.00[,.]%'],
    [harness.elements.chanceMessage, '25.00[,.]%'],
  ];
  percentageMessages.forEach(([element, percentageText]) => {
    const percentageNodes = element.childNodes.filter((node) => (
      node.nodeType === 1 && node.tagName === 'BDI'
    ));
    assert.notEqual(element.textContent, '');
    assert.equal(percentageNodes.length, 1);
    assert.equal(percentageNodes[0].dir, 'ltr');
    assert.equal(percentageNodes[0].textContent, percentageText);
  });

  assert.equal(harness.elements.resultMessage.dataset.visible, 'true');
  assert.equal(harness.elements.chanceMessage.dataset.visible, 'true');
  assert.match(harness.elements.resultMessage.textContent, /1\/1/u);

  const missingPlaceholderTemplates = harness.getWarnLogEntries()
    .filter(([message]) => message === 'reading-test questions template missing {percentage} placeholder:')
    .map(([, template]) => template);
  assert.ok(missingPlaceholderTemplates.includes('Random'));
  assert.ok(missingPlaceholderTemplates.includes('1/1 complete'));
  assert.ok(missingPlaceholderTemplates.includes('Chance'));
});

test('Questions stops replay work when settings-listener registration throws', async () => {
  const questionPayload = {
    developerEmail: 'support@example.test',
    questions: [{
      id: 'q1',
      prompt: 'Question one?',
      options: [{ id: 'a', text: 'Answer A' }],
    }],
  };
  const registrationError = new Error('settings listener registration failed');
  const harness = createRendererHarness({
    initPayloadOnSubscribe: questionPayload,
    onSettingsChangedRegistrationError: registrationError,
  });
  await flushRendererWork();

  assert.equal(harness.getGetSettingsCalls(), 0);
  assert.equal(harness.getReporterCalls(), 1);
  assert.equal(harness.getSettingsListenerRegistrations(), 1);
  assert.ok(harness.getErrorLogEntries().some(([message, error]) => (
    /onSettingsChanged/u.test(message) && error === registrationError
  )));
  assert.equal(harness.elements.btnCheck.disabled, true);
  assert.equal(harness.getInputs().length, 0);
});

test('Questions contains synchronous init-listener registration failures', async () => {
  const questionPayload = {
    developerEmail: 'support@example.test',
    questions: [{
      id: 'q1',
      prompt: 'Question one?',
      options: [{ id: 'a', text: 'Answer A' }],
    }],
  };
  const scenarios = [
    { name: 'before callback acceptance', onInitDataThrowBeforeRegister: true },
    { name: 'after callback retention', deliverPayloadAfterFailure: true },
    { name: 'after replay delivery', replayPayload: true },
  ];

  for (const scenario of scenarios) {
    const registrationError = new Error(`init listener registration failed ${scenario.name}`);
    const harness = createRendererHarness({
      initPayloadOnSubscribe: scenario.replayPayload ? questionPayload : null,
      onInitDataRegistrationError: registrationError,
      onInitDataThrowBeforeRegister: !!scenario.onInitDataThrowBeforeRegister,
    });
    if (scenario.deliverPayloadAfterFailure) harness.callbacks.initData(questionPayload);
    await flushRendererWork();

    assert.equal(harness.getCloseCalls(), 1);
    assert.equal(harness.getGetSettingsCalls(), 0);
    assert.equal(harness.getReporterCalls(), 0);
    assert.equal(harness.getSettingsListenerRegistrations(), 0);
    assert.ok(harness.getErrorLogEntries().some(([message, error]) => (
      /onInitData/u.test(message) && error === registrationError
    )));
    assert.equal(harness.elements.btnCheck.disabled, true);
    assert.equal(harness.getInputs().length, 0);
  }
});

test('Questions closes locally when its required DOM contract is unavailable', () => {
  const harness = createRendererHarness({
    missingRequiredElement: 'readingTestQuestionsForm',
  });

  assert.equal(harness.getCloseCalls(), 1);
  assert.deepEqual(harness.callbacks, {});
});

test('Questions ignores unrelated settings updates and uses current focus at language-driven replacement time', async () => {
  const harness = createRendererHarness();
  await flushRendererWork();

  harness.callbacks.initData({
    developerEmail: 'support@example.test',
    questions: [
      {
        id: 'q1',
        prompt: 'Which option is correct?',
        options: [
          { id: 'a', text: 'First' },
          { id: 'b', text: 'Second' },
        ],
      },
    ],
  });
  await flushRendererWork();

  let inputs = harness.getInputs();
  assert.equal(inputs.length, 2);
  inputs[1].checked = true;
  inputs[1].dispatch('change');
  harness.elements.btnCheck.dispatch('click');
  await flushRendererWork();

  const formClearCount = harness.elements.form.clearCount;
  const randomValueBefore = harness.elements.randomValue.textContent;
  const resultMessageBefore = harness.elements.resultMessage.textContent;
  const chanceMessageBefore = harness.elements.chanceMessage.textContent;
  const translationRequestCount = harness.translationRequests.length;
  inputs[1].focus();
  harness.callbacks.settingsChanged({
    language: 'en',
    modeConteo: 'simple',
    numberFormatting: {
      en: { separadorMiles: ',', separadorDecimal: '.' },
    },
  });
  await flushRendererWork();

  assert.equal(harness.elements.form.clearCount, formClearCount);
  assert.equal(harness.elements.randomValue.textContent, randomValueBefore);
  assert.equal(harness.elements.resultMessage.textContent, resultMessageBefore);
  assert.equal(harness.elements.chanceMessage.textContent, chanceMessageBefore);
  assert.equal(harness.translationRequests.length, translationRequestCount);
  assert.equal(harness.elements.btnContinue.focusCount, 0);
  assert.equal(inputs[1].focusCount, 1);

  const spanishLoad = harness.holdTranslationLoad('es');
  harness.callbacks.settingsChanged({
    language: 'es',
    numberFormatting: {
      es: { separadorMiles: '.', separadorDecimal: ',' },
    },
  });
  await flushAsyncWork();
  assert.equal(harness.translationRequests.at(-1), 'es');
  harness.elements.btnCheck.focus();
  spanishLoad.resolve();
  await flushRendererWork();

  assert.equal(harness.elements.btnContinue.focusCount, 0);
  assert.equal(harness.elements.btnCheck.focusCount, 1);
  inputs = harness.getInputs();
  assert.equal(inputs[1].checked, true);

  const englishLoad = harness.holdTranslationLoad('en');
  inputs[1].focus();
  harness.callbacks.settingsChanged({
    language: 'en',
    numberFormatting: {
      en: { separadorMiles: ',', separadorDecimal: '.' },
    },
  });
  await flushAsyncWork();
  assert.equal(harness.translationRequests.at(-1), 'en');
  englishLoad.resolve();
  await flushRendererWork();

  assert.equal(harness.elements.btnContinue.focusCount, 1);
  assert.equal(harness.getActiveElement(), harness.elements.btnContinue);
  inputs = harness.getInputs();
  assert.equal(inputs[1].checked, true);
});

test('Questions preserves its established language and formatting after translation preparation fails', async () => {
  const harness = createRendererHarness({ rejectBeforeApplyLanguage: 'es' });
  await flushRendererWork();

  harness.callbacks.initData({
    developerEmail: 'support@example.test',
    questions: [
      {
        id: 'q1',
        prompt: 'Which option is correct?',
        options: [
          { id: 'a', text: 'First' },
          { id: 'b', text: 'Second' },
        ],
      },
    ],
  });
  await flushRendererWork();

  harness.callbacks.settingsChanged({
    language: 'es',
    numberFormatting: {
      es: { separadorMiles: '.', separadorDecimal: ',' },
    },
  });
  await flushRendererWork();

  assert.equal(harness.translationRequests.at(-1), 'es');
  assert.equal(harness.elements.title.textContent, 'Questions');

  const [firstInput] = harness.getInputs();
  firstInput.checked = true;
  firstInput.dispatch('change');
  harness.elements.btnCheck.dispatch('click');
  await flushRendererWork();

  assert.match(harness.elements.resultMessage.textContent, /100\.00\[,\.\]/u);
});

test('Questions renders a later valid payload while the language remains unchanged', async () => {
  const harness = createRendererHarness();
  await flushRendererWork();

  harness.callbacks.initData({
    developerEmail: 'support@example.test',
    questions: [{
      id: 'q1',
      prompt: 'Initial question?',
      options: [
        { id: 'a', text: 'Initial A' },
        { id: 'b', text: 'Initial B' },
      ],
    }],
  });
  await flushRendererWork();
  assert.equal(harness.getInputs().length, 2);

  harness.callbacks.initData({
    developerEmail: 'support@example.test',
    questions: [{
      id: 'q2',
      prompt: 'Replacement question?',
      options: [{ id: 'a', text: 'Replacement A' }],
    }],
  });
  await flushRendererWork();

  assert.equal(harness.getInputs().length, 1);
  assert.equal(harness.elements.btnCheck.disabled, false);
  assert.deepEqual(harness.translationRequests, ['en', 'en', 'en']);
});

test('Questions treats an initial-settings failure after replay establishment as recoverable', async () => {
  const harness = createRendererHarness({
    rejectBeforeApplyLanguage: 'en',
    rejectTransitionRequestNumber: 2,
    initPayloadOnSubscribe: {
      developerEmail: 'support@example.test',
      questions: [{
        id: 'q1',
        prompt: 'Question one?',
        correctOptionId: 'a',
        options: [
          { id: 'a', text: 'Answer A' },
          { id: 'b', text: 'Answer B' },
        ],
      }],
    },
  });

  await flushRendererWork();

  assert.deepEqual(harness.translationRequests, ['en', 'en']);
  assert.equal(harness.getReporterCalls(), 0);
  assert.equal(harness.getCloseCalls(), 0);
});

test('Questions closes locally when terminal i18n failure reporting throws', async () => {
  const harness = createRendererHarness({
    rejectBeforeApplyLanguage: 'en',
    rejectionHadEstablishedState: false,
    reporterThrows: true,
  });
  await flushRendererWork();

  assert.equal(harness.getCloseCalls(), 1);
});

test('Questions stops queued init and settings work after terminal i18n failure', async () => {
  const harness = createRendererHarness({
    rejectBeforeApplyLanguage: 'en',
    rejectionHadEstablishedState: false,
  });
  await flushRendererWork();

  harness.callbacks.initData({
    developerEmail: 'support@example.test',
    questions: [{
      id: 'q1',
      prompt: 'Question one?',
      options: [
        { id: 'a', text: 'Answer A' },
        { id: 'b', text: 'Answer B' },
      ],
    }],
  });
  harness.callbacks.settingsChanged({
    language: 'es',
    numberFormatting: {
      es: { separadorMiles: '.', separadorDecimal: ',' },
    },
  });
  await flushRendererWork();

  assert.deepEqual(harness.translationRequests, ['en']);
  assert.equal(harness.getReporterCalls(), 1);
  assert.equal(harness.getInputs().length, 0);
});

test('Questions keeps Check and native answer controls unavailable after terminal failure while Continue remains usable', async () => {
  const harness = createRendererHarness({
    rejectBeforeApplyLanguage: 'es',
    rejectionRestorationFailed: true,
  });
  await flushRendererWork();

  harness.callbacks.initData({
    developerEmail: 'support@example.test',
    questions: [{
      id: 'q1',
      prompt: 'Question one?',
      options: [
        { id: 'a', text: 'Answer A' },
        { id: 'b', text: 'Answer B' },
      ],
    }],
  });
  await flushRendererWork();
  assert.equal(harness.elements.btnCheck.disabled, false);
  assert.ok(harness.getInputs().every((input) => input.disabled === false));

  await harness.callbacks.settingsChanged({ language: 'es' });
  harness.callbacks.initData({
    developerEmail: 'support@example.test',
    questions: [{
      id: 'q2',
      prompt: 'Later question?',
      options: [{ id: 'a', text: 'Later answer' }],
    }],
  });
  await flushRendererWork();

  assert.equal(harness.getReporterCalls(), 1);
  assert.equal(harness.elements.btnCheck.disabled, true);
  assert.ok(harness.getInputs().every((input) => input.disabled === true));
  assert.equal(harness.elements.btnContinue.disabled, false);
});

test('Questions renders the invalid-payload state after a non-i18n initialization failure', async () => {
  const harness = createRendererHarness({
    questionsCoreOverride: {
      computeRandomGuessPercentage() { return 0; },
      scoreQuestions() { return {}; },
      validateQuestionsPayload() {
        throw new Error('invalid payload');
      },
    },
  });
  await flushRendererWork();

  harness.callbacks.initData({ questions: [] });
  await flushRendererWork();

  assert.equal(harness.elements.fatalMessage.textContent, 'Invalid questions.');
  assert.equal(harness.elements.btnCheck.disabled, true);
});

test('Questions can establish translation state when the native i18n diagnostic bridge is unavailable', async () => {
  const harness = createRendererHarness({ includeI18nFailureReporter: false });
  await flushRendererWork();

  assert.deepEqual(harness.translationRequests, ['en']);
  assert.equal(harness.elements.title.textContent, 'Questions');
});
