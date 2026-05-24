'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

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

function createHarness() {
  const warnings = [];
  const errors = [];
  const previewCalls = [];
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
  let baseTotalSeconds = null;

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
        getExactTotalSeconds(words, currentWpm) {
          return (words * 100) + currentWpm;
        },
        getDisplayTimeParts(totalSeconds) {
          return {
            hours: 0,
            minutes: 0,
            seconds: totalSeconds,
          };
        },
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
      clearBaseTotalSeconds() {
        baseTotalSeconds = null;
      },
      setBaseTotalSeconds(value) {
        baseTotalSeconds = value;
      },
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
    async resolveCurrentTextProcessing() {
      return { ok: true };
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
    warnings,
    get baseTotalSeconds() {
      return baseTotalSeconds;
    },
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

  harness.api.installCurrentTextState('uno dos tres');
  harness.api.requestDerivedRefresh('mode toggle');

  assert.equal(harness.countCalls.length, 0);
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

  assert.equal(harness.countCalls.length, 1);
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

  harness.api.installCurrentTextState('uno dos tres');
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
  harness.setWpm(350);
  harness.api.requestTimeOnlyRefresh('wpm change');

  assert.equal(harness.countCalls.length, countCallsBefore);
  assert.equal(harness.elements.resChars.textContent, charsBefore);
  assert.equal(harness.elements.resTime.textContent, 'Time|0h 0m 550s');
  assert.equal(harness.baseTotalSeconds, 550);
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
