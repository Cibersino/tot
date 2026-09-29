'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  createReadingDurationUtils,
} = require('../../../public/js/lib/reading_duration_core');
const {
  createStopwatchTimeUtils,
} = require('../../../public/js/lib/stopwatch_time_core');

function createClassList() {
  const values = new Set();
  return {
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

function createElement(id) {
  const attributes = {};
  return {
    id,
    textContent: '',
    attributes,
    classList: createClassList(),
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
  };
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setImmediate(resolve));
  await Promise.resolve();
}

function createHarness({
  readingDurationUtils = createReadingDurationUtils(),
  resolveCurrentTextProcessing = async () => ({ ok: true }),
} = {}) {
  const warnings = [];
  const errors = [];
  const previewCalls = [];
  const resolveCalls = [];
  const countCalls = [];
  const standalonePendingCalls = [];
  const separatorQueue = [];
  let separatorCalls = 0;
  const elements = {
    resChars: createElement('resChars'),
    resCharsNoSpace: createElement('resCharsNoSpace'),
    resWords: createElement('resWords'),
    resTime: createElement('resTime'),
    selectorSection: createElement('selectorSection'),
    resultsSection: createElement('resultsSection'),
    preview: createElement('textPreview'),
  };

  let emptyPreviewText = '(empty:es)';
  let wpm = 200;
  let countContext = {
    modoConteo: 'simple',
    idioma: 'es',
  };
  let settingsCache = {
    numberFormatting: {
      es: { separadorMiles: '.', separadorDecimal: ',' },
      en: { separadorMiles: ',', separadorDecimal: '.' },
    },
  };
  let baseReadingDuration = null;
  const stopwatchTimeUtils = createStopwatchTimeUtils();

  const sandbox = {
    window: {
      getLogger() {
        return {
          debug() {},
          info() {},
          warn(...args) {
            warnings.push(args);
          },
          warnOnce(...args) {
            warnings.push(args);
          },
          error(...args) {
            errors.push(args);
          },
        };
      },
      CountUtils: {
        contarTexto(text, options) {
          const normalizedText = String(text || '');
          countCalls.push({
            text: normalizedText,
            options,
          });
          return {
            conEspacios: normalizedText.length,
            sinEspacios: normalizedText.replace(/\s/g, '').length,
            palabras: normalizedText.trim() ? normalizedText.trim().split(/\s+/).length : 0,
          };
        },
      },
      FormatUtils: {
        async obtenerSeparadoresDeNumeros(_idioma, settings) {
          separatorCalls += 1;
          if (separatorQueue.length > 0) {
            const resolver = separatorQueue.shift();
            return resolver(settings);
          }
          const langBase = String(countContext.idioma || 'es').split(/[-_]/)[0] || 'es';
          const entry = settings && settings.numberFormatting ? settings.numberFormatting[langBase] : null;
          return {
            separadorMiles: entry && entry.separadorMiles ? entry.separadorMiles : '.',
            separadorDecimal: entry && entry.separadorDecimal ? entry.separadorDecimal : ',',
          };
        },
        formatearNumero(value, separadorMiles, separadorDecimal) {
          return `${value}[${separadorMiles}${separadorDecimal}]`;
        },
      },
      ReadingDurationUtils: readingDurationUtils,
      StopwatchTimeCore: {
        createStopwatchTimeUtils() {
          return stopwatchTimeUtils;
        },
      },
      RendererI18n: {
        tRenderer(key) {
          if (key === 'renderer.main.selector_empty') return emptyPreviewText;
          if (key === 'renderer.main.results.time_label') return 'Time';
          if (key === 'renderer.main.results.value_pending') return '[pending]';
          if (key === 'renderer.main.results.value_unavailable') return '[unavailable]';
          return key;
        },
        msgRenderer(key, params = {}) {
          return `${key}:${params.n}`;
        },
        renderLocalizedLabelWithInvariantValue(el, { labelText, valueText }) {
          el.textContent = `${labelText}|${valueText}`;
        },
      },
    },
    document: {
      getElementById(id) {
        return elements[id] || null;
      },
      querySelector(selector) {
        if (selector === '.selector-text') return elements.selectorSection;
        if (selector === '.results') return elements.resultsSection;
        return null;
      },
    },
    console,
    performance,
    setTimeout,
    clearTimeout,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/current_text_runtime.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/current_text_runtime.js' });

  const api = sandbox.window.CurrentTextRuntime;
  api.configure({
    currentTextSelectorSection: {
      renderPreview(text, { emptyText } = {}) {
        previewCalls.push({
          text,
          emptyText,
        });
        elements.preview.textContent = text || emptyText || '';
      },
    },
    resultsTimeMultiplier: {
      clearBaseReadingDuration() {
        baseReadingDuration = null;
      },
      setBaseReadingDuration(value) {
        baseReadingDuration = value;
      },
    },
    countText(text, options) {
      const normalizedText = String(text || '');
      countCalls.push({ text: normalizedText, options });
      return {
        conEspacios: normalizedText.length,
        sinEspacios: normalizedText.replace(/\s/g, '').length,
        palabras: normalizedText.trim() ? normalizedText.trim().split(/\s+/).length : 0,
      };
    },
    getCountContext() {
      return countContext;
    },
    getSettingsCache() {
      return settingsCache;
    },
    getWpm() {
      return wpm;
    },
    async resolveCurrentTextProcessing(payload) {
      resolveCalls.push({ ...payload });
      return resolveCurrentTextProcessing(payload);
    },
    applyStandaloneFullRefreshPendingState(state, context = {}) {
      standalonePendingCalls.push({
        state: { ...state },
        context: { ...context },
      });
    },
  });

  return {
    api,
    countCalls,
    elements,
    errors,
    previewCalls,
    resolveCalls,
    warnings,
    get baseReadingDuration() {
      return baseReadingDuration;
    },
    readingDurationUtils,
    get separatorCalls() {
      return separatorCalls;
    },
    standalonePendingCalls,
    setCountContext(nextContext) {
      countContext = { ...countContext, ...nextContext };
    },
    setEmptyPreviewText(nextText) {
      emptyPreviewText = String(nextText);
    },
    setSettingsCache(nextSettingsCache) {
      settingsCache = nextSettingsCache;
    },
    setWpm(nextWpm) {
      wpm = nextWpm;
    },
    queueSeparatorResolver(resolver) {
      separatorQueue.push(resolver);
    },
  };
}

test('standalone full refresh enters pending before deferred recount starts and settles afterward', async () => {
  const harness = createHarness();

  harness.api.handleCurrentTextUpdated({ text: 'uno dos tres' });
  await flushAsyncWork();
  const countCallsBeforeRefresh = harness.countCalls.length;
  harness.api.requestDerivedRefresh('mode toggle');

  assert.equal(harness.countCalls.length, countCallsBeforeRefresh);
  assert.equal(harness.standalonePendingCalls.length, 1);
  assert.equal(harness.standalonePendingCalls[0].state.active, true);
  assert.equal(
    harness.elements.resChars.textContent,
    'renderer.main.results.chars:[pending]'
  );
  assert.equal(
    harness.elements.selectorSection.classList.contains('current-text-status--pending'),
    true
  );
  assert.equal(harness.elements.selectorSection.getAttribute('aria-busy'), 'true');

  await flushAsyncWork();

  assert.equal(harness.countCalls.length, countCallsBeforeRefresh + 1);
  assert.equal(harness.standalonePendingCalls.at(-1).state.active, false);
  assert.equal(
    harness.elements.selectorSection.classList.contains('current-text-status--pending'),
    false
  );
  assert.equal(harness.elements.selectorSection.getAttribute('aria-busy'), 'false');
});

test('display-only refreshes queue behind a standalone full refresh before counting starts', async () => {
  const harness = createHarness();

  harness.api.handleCurrentTextUpdated({ text: 'uno dos tres' });
  await flushAsyncWork();

  harness.api.requestDerivedRefresh('mode toggle');
  harness.setSettingsCache({
    numberFormatting: {
      es: { separadorMiles: ' ', separadorDecimal: ';' },
      en: { separadorMiles: ',', separadorDecimal: '.' },
    },
  });
  harness.api.requestStatsDisplayRefresh('formatting change');

  assert.equal(harness.countCalls.length, 1);
  assert.equal(
    harness.elements.resChars.textContent,
    'renderer.main.results.chars:[pending]'
  );

  await flushAsyncWork();

  assert.equal(harness.countCalls.length, 2);
  assert.equal(harness.elements.resChars.textContent, 'renderer.main.results.chars:12[ ;]');
});

test('standalone full refresh failure clears pending and leaves degraded values visible', async () => {
  const harness = createHarness();

  harness.api.handleCurrentTextUpdated({ text: 'uno dos tres' });
  await flushAsyncWork();
  harness.queueSeparatorResolver(() => Promise.reject(new Error('separator failure')));
  harness.api.requestDerivedRefresh('mode toggle');

  await flushAsyncWork();

  assert.equal(harness.standalonePendingCalls.at(-1).state.active, false);
  assert.equal(
    harness.elements.selectorSection.classList.contains('current-text-status--pending'),
    false
  );
  assert.equal(
    harness.elements.selectorSection.classList.contains('current-text-status--degraded'),
    true
  );
  assert.equal(
    harness.elements.resChars.textContent,
    'renderer.main.results.chars:[unavailable]'
  );
  assert.equal(harness.errors.length > 0, true);
});

test('stats_display refresh reuses cached stats without recounting or rerendering a non-empty preview', async () => {
  const harness = createHarness();

  harness.api.handleCurrentTextUpdated({ text: 'uno dos tres' });
  await flushAsyncWork();

  const countCallsBefore = harness.countCalls.length;
  const previewCallsBefore = harness.previewCalls.length;
  harness.setSettingsCache({
    numberFormatting: {
      es: { separadorMiles: ' ', separadorDecimal: ';' },
      en: { separadorMiles: ',', separadorDecimal: '.' },
    },
  });

  harness.api.requestStatsDisplayRefresh('stats display');
  await flushAsyncWork();

  assert.equal(harness.countCalls.length, countCallsBefore);
  assert.equal(harness.previewCalls.length, previewCallsBefore);
  assert.equal(harness.elements.resChars.textContent, 'renderer.main.results.chars:12[ ;]');
  assert.equal(harness.elements.resWords.textContent, 'renderer.main.results.words:3[ ;]');
});

test('stats_display refresh rerenders the localized empty preview without recounting', async () => {
  const harness = createHarness();

  harness.api.handleCurrentTextUpdated({ text: '' });
  await flushAsyncWork();

  const countCallsBefore = harness.countCalls.length;
  const previewCallsBefore = harness.previewCalls.length;
  harness.setEmptyPreviewText('(empty:en)');

  harness.api.requestStatsDisplayRefresh('empty preview display');
  await flushAsyncWork();

  assert.equal(harness.countCalls.length, countCallsBefore);
  assert.equal(harness.previewCalls.length, previewCallsBefore + 1);
  assert.equal(harness.elements.preview.textContent, '(empty:en)');
});

test('time_only refresh preserves cached stats and avoids recounting', async () => {
  const harness = createHarness();

  harness.api.handleCurrentTextUpdated({ text: 'uno dos' });
  await flushAsyncWork();

  const countCallsBefore = harness.countCalls.length;
  const charsBefore = harness.elements.resChars.textContent;
  harness.setWpm(40);
  harness.api.requestTimeOnlyRefresh('wpm change');

  assert.equal(harness.countCalls.length, countCallsBefore);
  assert.equal(harness.elements.resChars.textContent, charsBefore);
  assert.equal(harness.elements.resTime.textContent, 'Time|0h 0m 3s');
  assert.equal(
    harness.readingDurationUtils.getRoundedReadingSeconds(harness.baseReadingDuration),
    3
  );
});

test('time_only refresh treats a failed reading-duration calculation as an invariant violation', async () => {
  const exactReadingDurationUtils = createReadingDurationUtils();
  let shouldFailDurationCalculation = false;
  const harness = createHarness({
    readingDurationUtils: {
      ...exactReadingDurationUtils,
      getRoundedReadingSeconds(duration, multiplier) {
        return shouldFailDurationCalculation
          ? null
          : exactReadingDurationUtils.getRoundedReadingSeconds(duration, multiplier);
      },
    },
  });

  harness.api.handleCurrentTextUpdated({ text: 'uno dos' });
  await flushAsyncWork();
  const timeBeforeFailure = harness.elements.resTime.textContent;

  shouldFailDurationCalculation = true;
  assert.throws(
    () => harness.api.requestTimeOnlyRefresh('duration invariant test'),
    /estimated reading duration unavailable/
  );
  assert.equal(harness.elements.resTime.textContent, timeBeforeFailure);
});

test('current-text runtime rejects malformed authoritative text before it can become an empty estimate', async () => {
  const harness = createHarness();

  harness.api.handleCurrentTextUpdated({ text: 'uno dos' });
  await flushAsyncWork();
  const textBeforeFailure = harness.api.getCurrentText();
  const timeBeforeFailure = harness.elements.resTime.textContent;

  assert.throws(
    () => harness.api.handleCurrentTextUpdated({ text: false }),
    /current-text-updated requires an object with string text/
  );
  assert.equal(harness.api.getCurrentText(), textBeforeFailure);
  assert.equal(harness.elements.resTime.textContent, timeBeforeFailure);
});

test('current-text runtime validates request IDs through the live update path', async () => {
  const harness = createHarness();

  harness.api.handleCurrentTextUpdated({ text: 'uno dos', requestId: 7 });
  await flushAsyncWork();
  assert.equal(harness.api.getCurrentText(), 'uno dos');

  assert.throws(
    () => harness.api.handleCurrentTextUpdated({ text: 'tres cuatro', requestId: '8' }),
    /requestId must be a positive safe integer/
  );
  assert.equal(harness.api.getCurrentText(), 'uno dos');
});

test('current-text runtime rejects malformed processing state without replacing canonical state', () => {
  const harness = createHarness();
  const canonicalState = {
    active: true,
    requestId: 1,
    sinceEpochMs: Date.now(),
    source: 'main',
    action: 'overwrite',
  };

  harness.api.applyCurrentTextProcessingState(canonicalState);
  assert.deepEqual({ ...harness.api.copyCurrentTextProcessingState(canonicalState) }, canonicalState);
  assert.throws(
    () => harness.api.applyCurrentTextProcessingState({
      ...canonicalState,
      requestId: '1',
    }),
    /current-text processing state is invalid/
  );
  assert.doesNotThrow(() => harness.api.applyCurrentTextProcessingState(canonicalState));
});

test('stats_display requests queue behind an in-flight standalone full derive when stats are not ready yet', async () => {
  const harness = createHarness();
  const deferredSeparators = createDeferred();

  harness.queueSeparatorResolver((capturedSettings) => deferredSeparators.promise.then(() => ({
    separadorMiles: capturedSettings.numberFormatting.es.separadorMiles,
    separadorDecimal: capturedSettings.numberFormatting.es.separadorDecimal,
  })));

  harness.api.handleCurrentTextUpdated({ text: 'uno dos tres' });
  assert.equal(harness.countCalls.length, 1);

  harness.setSettingsCache({
    numberFormatting: {
      es: { separadorMiles: ' ', separadorDecimal: ';' },
      en: { separadorMiles: ',', separadorDecimal: '.' },
    },
  });
  harness.api.requestStatsDisplayRefresh('number formatting change');

  deferredSeparators.resolve();
  await flushAsyncWork();

  assert.equal(harness.countCalls.length, 1);
  assert.equal(harness.elements.resChars.textContent, 'renderer.main.results.chars:12[ ;]');
  assert.equal(harness.elements.resWords.textContent, 'renderer.main.results.words:3[ ;]');
});

test('stats_display merges into pending current-text settling without an extra preview rerender', async () => {
  const harness = createHarness();
  const deferredSeparators = createDeferred();

  harness.queueSeparatorResolver(() => deferredSeparators.promise.then(() => ({
    separadorMiles: '.',
    separadorDecimal: ',',
  })));

  harness.api.syncBootstrapState({
    initialText: 'uno dos tres',
    processingState: {
      active: true,
      requestId: 1,
      sinceEpochMs: Date.now(),
      source: 'main',
      action: 'initial_load',
    },
  });

  const previewCallsBefore = harness.previewCalls.length;
  harness.api.requestStatsDisplayRefresh('pending merge');
  assert.equal(harness.previewCalls.length, previewCallsBefore);
  assert.equal(harness.countCalls.length, 0);

  harness.api.startDeferredBootstrapSettle();
  deferredSeparators.resolve();
  await flushAsyncWork();
});

test('syncBootstrapState with active startup pending installs placeholders without starting settle inline', async () => {
  const harness = createHarness();

  harness.api.syncBootstrapState({
    initialText: 'uno dos tres',
    processingState: {
      active: true,
      requestId: 1,
      sinceEpochMs: Date.now(),
      source: 'main',
      action: 'initial_load',
    },
  });

  assert.equal(harness.countCalls.length, 0);
  assert.equal(
    harness.elements.resChars.textContent,
    'renderer.main.results.chars:[pending]'
  );

  await flushAsyncWork();

  assert.equal(harness.countCalls.length, 0);

  harness.api.startDeferredBootstrapSettle();
  await flushAsyncWork();

  assert.equal(harness.countCalls.length, 1);
});

test('deferred bootstrap settle starts only once', async () => {
  const harness = createHarness();

  harness.api.syncBootstrapState({
    initialText: 'uno dos tres',
    processingState: {
      active: true,
      requestId: 1,
      sinceEpochMs: Date.now(),
      source: 'main',
      action: 'initial_load',
    },
  });

  harness.api.startDeferredBootstrapSettle();
  harness.api.startDeferredBootstrapSettle();
  await flushAsyncWork();

  assert.equal(harness.countCalls.length, 1);
});

test('deferred bootstrap settle cancels silently when startup request is no longer active at kickoff', async () => {
  const harness = createHarness();

  harness.api.syncBootstrapState({
    initialText: 'uno dos tres',
    processingState: {
      active: true,
      requestId: 1,
      sinceEpochMs: Date.now(),
      source: 'main',
      action: 'initial_load',
    },
  });
  harness.api.applyCurrentTextProcessingState({
    active: false,
    requestId: 0,
    sinceEpochMs: null,
    source: '',
    action: '',
  });

  harness.api.startDeferredBootstrapSettle();
  await flushAsyncWork();

  assert.equal(harness.countCalls.length, 0);
});

test('non-startup current-text pending paths still settle without deferred bootstrap kickoff', async () => {
  const harness = createHarness();

  harness.api.applyCurrentTextProcessingState({
    active: true,
    requestId: 2,
    sinceEpochMs: Date.now(),
    source: 'main',
    action: 'overwrite',
  });
  harness.api.handleCurrentTextUpdated({
    text: 'uno dos tres',
    requestId: 2,
  });

  await flushAsyncWork();

  assert.equal(harness.countCalls.length, 1);
});

test('terminal presentation fencing preserves successful settlement of admitted current-text work', async () => {
  const harness = createHarness();
  const deferredSeparators = createDeferred();
  harness.queueSeparatorResolver(() => deferredSeparators.promise.then(() => ({
    separadorMiles: '.',
    separadorDecimal: ',',
  })));

  harness.api.applyCurrentTextProcessingState({
    active: true,
    requestId: 3,
    sinceEpochMs: Date.now(),
    source: 'main',
    action: 'overwrite',
  });
  harness.api.handleCurrentTextUpdated({ text: 'uno dos tres', requestId: 3 });
  const previewCallsBeforeTerminal = harness.previewCalls.length;
  const charsBeforeTerminal = harness.elements.resChars.textContent;
  harness.api.setTerminalPresentationUnavailable();

  deferredSeparators.resolve();
  await flushAsyncWork();

  assert.deepEqual(harness.resolveCalls, [{ requestId: 3, ok: true }]);
  assert.equal(harness.previewCalls.length, previewCallsBeforeTerminal);
  assert.equal(harness.elements.resChars.textContent, charsBeforeTerminal);
  assert.equal(harness.baseReadingDuration, null);
});

test('terminal Runtime processes a later authoritative active request with its matching text', async () => {
  const harness = createHarness();
  harness.api.setTerminalPresentationUnavailable();

  harness.api.applyCurrentTextProcessingState({
    active: true,
    requestId: 4,
    sinceEpochMs: Date.now(),
    source: 'main',
    action: 'overwrite',
  });
  harness.api.handleCurrentTextUpdated({ text: 'cuatro cinco', requestId: 4 });
  await flushAsyncWork();

  assert.equal(harness.api.getCurrentText(), 'cuatro cinco');
  assert.equal(harness.countCalls.length, 1);
  assert.deepEqual(harness.resolveCalls, [{ requestId: 4, ok: true }]);
  assert.equal(harness.previewCalls.length, 0);
  assert.equal(harness.elements.resChars.textContent, '');
});

test('terminal presentation fencing preserves genuine current-text failure settlement', async () => {
  const harness = createHarness();
  const deferredSeparators = createDeferred();
  harness.queueSeparatorResolver(() => deferredSeparators.promise);
  harness.api.setTerminalPresentationUnavailable();

  harness.api.applyCurrentTextProcessingState({
    active: true,
    requestId: 5,
    sinceEpochMs: Date.now(),
    source: 'main',
    action: 'overwrite',
  });
  harness.api.handleCurrentTextUpdated({ text: 'seis siete', requestId: 5 });
  deferredSeparators.reject(new Error('separator failure'));
  await flushAsyncWork();

  assert.deepEqual(harness.resolveCalls, [{ requestId: 5, ok: false }]);
  assert.equal(harness.previewCalls.length, 0);
  assert.equal(harness.elements.resChars.textContent, '');
});

test('stale queued standalone follow-up does not leak into a later successful full derive', async () => {
  const harness = createHarness();
  const firstDeferredSeparators = createDeferred();

  harness.queueSeparatorResolver(() => firstDeferredSeparators.promise.then(() => ({
    separadorMiles: '.',
    separadorDecimal: ',',
  })));

  harness.api.handleCurrentTextUpdated({ text: 'uno dos tres' });
  assert.equal(harness.separatorCalls, 1);

  harness.setSettingsCache({
    numberFormatting: {
      es: { separadorMiles: ' ', separadorDecimal: ';' },
      en: { separadorMiles: ',', separadorDecimal: '.' },
    },
  });
  harness.api.requestStatsDisplayRefresh('queued under obsolete derive');

  harness.api.handleCurrentTextUpdated({ text: 'cuatro cinco' });
  await flushAsyncWork();

  assert.equal(harness.separatorCalls, 2);
  assert.equal(harness.elements.resChars.textContent, 'renderer.main.results.chars:12[ ;]');

  firstDeferredSeparators.resolve();
  await flushAsyncWork();

  assert.equal(harness.separatorCalls, 2);
});

test('failed queued standalone follow-up does not leak into a later successful full derive', async () => {
  const harness = createHarness();
  const failedSeparators = createDeferred();

  harness.queueSeparatorResolver(() => failedSeparators.promise);

  harness.api.handleCurrentTextUpdated({ text: 'uno dos tres' });
  assert.equal(harness.separatorCalls, 1);

  harness.setSettingsCache({
    numberFormatting: {
      es: { separadorMiles: ' ', separadorDecimal: ';' },
      en: { separadorMiles: ',', separadorDecimal: '.' },
    },
  });
  harness.api.requestStatsDisplayRefresh('queued under failed derive');

  failedSeparators.reject(new Error('separator failure'));
  await flushAsyncWork();

  harness.api.handleCurrentTextUpdated({ text: 'cuatro cinco' });
  await flushAsyncWork();

  assert.equal(harness.separatorCalls, 2);
  assert.equal(harness.elements.resChars.textContent, 'renderer.main.results.chars:12[ ;]');
});
