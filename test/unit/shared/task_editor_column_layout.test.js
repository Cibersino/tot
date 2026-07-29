'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DEFAULT_RECORD = {
  version: 1,
  widths: {
    tiempo: 88,
    percent: 63,
    falta: 65,
    enlace: 250,
    comentario: 82,
    acciones: 124,
  },
};

function createDeferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail('Timed out waiting for task column layout state');
}

function createClassList() {
  const values = new Set();
  return {
    add(...names) { names.forEach((name) => values.add(name)); },
    remove(...names) { names.forEach((name) => values.delete(name)); },
    contains(name) { return values.has(name); },
  };
}

function createElement({ id = '', columnKey = '' } = {}) {
  const attributes = new Map();
  const listeners = new Map();
  const children = [];
  const captures = new Set();
  return {
    id,
    dataset: columnKey ? { col: columnKey } : {},
    style: {},
    className: '',
    classList: createClassList(),
    tabIndex: -1,
    children,
    appendChild(child) {
      children.push(child);
      return child;
    },
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatch(type, event = {}) {
      const dispatched = {
        button: 0,
        pointerId: 1,
        clientX: 0,
        key: '',
        shiftKey: false,
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
        ...event,
      };
      (listeners.get(type) || []).forEach((listener) => listener(dispatched));
      return dispatched;
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    getAttribute(name) {
      return attributes.has(name) ? attributes.get(name) : null;
    },
    setPointerCapture(pointerId) {
      captures.add(pointerId);
    },
    hasPointerCapture(pointerId) {
      return captures.has(pointerId);
    },
    releasePointerCapture(pointerId) {
      captures.delete(pointerId);
    },
  };
}

function createHarness({ wrapperWidth = 1093, loadResult, saveColumnLayout } = {}) {
  const columnKeys = ['texto', 'tiempo', 'percent', 'falta', 'enlace', 'comentario', 'acciones'];
  const columns = Object.fromEntries(
    columnKeys.map((key) => [key, createElement({ columnKey: key })])
  );
  const utilityKeys = columnKeys.slice(1);
  const headers = Object.fromEntries(
    utilityKeys.map((key) => [key, createElement({ id: `th-${key}` })])
  );
  const wrapper = { clientWidth: wrapperWidth };
  const table = { style: {} };
  const colGroup = {
    querySelectorAll(selector) {
      return selector === 'col' ? Object.values(columns) : [];
    },
  };
  const body = { classList: createClassList() };
  const windowListeners = new Map();
  const notifications = [];
  const diagnostics = [];
  const saveCalls = [];
  const observers = [];

  class ResizeObserverDouble {
    constructor(callback) {
      this.callback = callback;
      this.observed = [];
      observers.push(this);
    }
    observe(element) { this.observed.push(element); }
    disconnect() { this.observed = []; }
    trigger() { this.callback([]); }
  }

  const window = {
    ResizeObserver: ResizeObserverDouble,
    getLogger() {
      return {
        debug() {},
        info() {},
        warn(...args) { diagnostics.push(args); },
        warnOnce(...args) { diagnostics.push(args); },
        error(...args) { diagnostics.push(args); },
        errorOnce(...args) { diagnostics.push(args); },
      };
    },
    Notify: {
      notifyEditor(key, options) { notifications.push({ key, options }); },
    },
    taskEditorAPI: {
      async getColumnLayout() {
        return loadResult === undefined
          ? { ok: true, record: DEFAULT_RECORD }
          : loadResult;
      },
      saveColumnLayout(record) {
        saveCalls.push(record);
        return saveColumnLayout ? saveColumnLayout(record, saveCalls.length) : Promise.resolve({ ok: true });
      },
    },
    addEventListener(type, listener) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(listener);
    },
    removeEventListener(type, listener) {
      const current = windowListeners.get(type) || [];
      windowListeners.set(type, current.filter((candidate) => candidate !== listener));
    },
    dispatch(type) {
      (windowListeners.get(type) || []).forEach((listener) => listener());
    },
  };
  window.window = window;
  const document = {
    body,
    createElement() { return createElement(); },
  };
  const sandbox = { window, document, console, Object, Number, Map, Set, Promise };
  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/task_editor_column_layout.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/task_editor_column_layout.js' });

  const controller = window.TaskEditorColumnLayout.createController({
    wrapper,
    table,
    colGroup,
    utilityHeaders: headers,
  });

  return {
    window,
    wrapper,
    table,
    columns,
    headers,
    body,
    controller,
    observers,
    notifications,
    diagnostics,
    saveCalls,
    getDivider(key) { return headers[key].children[0]; },
  };
}

test('fresh layout uses the conservative fitted budget and persists only the utility defaults', async () => {
  const harness = createHarness({
    wrapperWidth: 1093,
    loadResult: { ok: true, record: null },
  });
  await harness.controller.initialize();
  await waitFor(() => harness.saveCalls.length === 1);

  assert.equal(harness.columns.texto.style.width, '420px');
  assert.equal(harness.columns.tiempo.style.width, '88px');
  assert.equal(harness.columns.comentario.style.width, '82px');
  assert.equal(harness.columns.acciones.style.width, '124px');
  assert.equal(harness.table.style.width, '1092px');
  assert.equal(harness.table.style.minWidth, '');
  assert.deepEqual(JSON.parse(JSON.stringify(harness.saveCalls[0])), DEFAULT_RECORD);
  assert.equal(Object.hasOwn(harness.saveCalls[0].widths, 'texto'), false);

  assert.equal(Object.values(harness.headers).reduce((sum, header) => sum + header.children.length, 0), 6);
  const divider = harness.getDivider('tiempo');
  assert.equal(divider.getAttribute('role'), 'separator');
  assert.equal(divider.getAttribute('aria-orientation'), 'vertical');
  assert.equal(divider.getAttribute('aria-labelledby'), 'th-tiempo');
  assert.equal(divider.tabIndex, 0);
});

test('wrapper changes recalculate texto and disable dividers only while overflowing', async () => {
  const harness = createHarness({ wrapperWidth: 1077 });
  await harness.controller.initialize();
  assert.equal(harness.columns.texto.style.width, '404px');
  assert.equal(harness.table.style.width, '1076px');

  harness.wrapper.clientWidth = 786;
  harness.observers[0].trigger();
  const constrainedDivider = harness.getDivider('tiempo');
  assert.equal(constrainedDivider.getAttribute('aria-disabled'), 'true');
  assert.equal(constrainedDivider.tabIndex, -1);
  constrainedDivider.dispatch('keydown', { key: 'ArrowLeft' });
  constrainedDivider.dispatch('keydown', { key: 'ArrowRight' });
  assert.equal(harness.columns.texto.style.width, '250px');
  assert.equal(harness.columns.tiempo.style.width, '88px');
  assert.equal(harness.saveCalls.length, 0);

  harness.wrapper.clientWidth = 700;
  harness.observers[0].trigger();
  assert.equal(harness.columns.texto.style.width, '250px');
  assert.equal(harness.table.style.width, '922px');
  Object.keys(harness.headers).forEach((key) => {
    assert.equal(harness.getDivider(key).getAttribute('aria-disabled'), 'true');
    assert.equal(harness.getDivider(key).tabIndex, -1);
  });

  harness.wrapper.clientWidth = 923;
  harness.observers[0].trigger();
  assert.equal(harness.columns.texto.style.width, '250px');
  assert.equal(harness.table.style.width, '922px');
  assert.equal(harness.getDivider('tiempo').getAttribute('aria-disabled'), 'false');
  assert.equal(harness.getDivider('tiempo').tabIndex, 0);
  assert.equal(harness.saveCalls.length, 0);

  harness.wrapper.clientWidth = 922;
  harness.observers[0].trigger();
  assert.equal(harness.columns.texto.style.width, '250px');
  assert.equal(harness.table.style.width, '922px');
  assert.equal(harness.getDivider('tiempo').getAttribute('aria-disabled'), 'true');
  assert.equal(harness.getDivider('tiempo').tabIndex, -1);
});

test('read failures use session defaults without overwriting the stored layout', async () => {
  const harness = createHarness({
    loadResult: { ok: false, code: 'READ_FAILED' },
  });
  await harness.controller.initialize();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(harness.columns.texto.style.width, '420px');
  assert.equal(harness.table.style.width, '1092px');
  assert.equal(harness.saveCalls.length, 0);
});

test('pointer and keyboard resizing preserve the paired-width model and cancellation restores state', async () => {
  const harness = createHarness();
  await harness.controller.initialize();
  const divider = harness.getDivider('tiempo');

  divider.dispatch('pointerdown', { clientX: 500, pointerId: 7 });
  divider.dispatch('pointermove', { clientX: 480, pointerId: 7 });
  assert.equal(harness.columns.tiempo.style.width, '108px');
  assert.equal(harness.columns.texto.style.width, '400px');
  assert.equal(harness.columns.percent.style.width, '63px');
  assert.equal(harness.table.style.width, '1092px');
  divider.dispatch('pointerup', { clientX: 480, pointerId: 7 });
  await waitFor(() => harness.saveCalls.length === 1);

  divider.dispatch('pointerdown', { clientX: 500, pointerId: 8 });
  divider.dispatch('pointermove', { clientX: 470, pointerId: 8 });
  divider.dispatch('pointercancel', { pointerId: 8 });
  assert.equal(harness.columns.tiempo.style.width, '108px');
  assert.equal(harness.columns.texto.style.width, '400px');
  assert.equal(harness.saveCalls.length, 1);

  const leftEvent = divider.dispatch('keydown', { key: 'ArrowLeft' });
  await waitFor(() => harness.saveCalls.length === 2);
  assert.equal(leftEvent.defaultPrevented, true);
  assert.equal(harness.columns.tiempo.style.width, '118px');
  assert.equal(harness.columns.texto.style.width, '390px');

  divider.dispatch('keydown', { key: 'ArrowRight', shiftKey: true });
  await waitFor(() => harness.saveCalls.length === 3);
  assert.equal(harness.columns.tiempo.style.width, '117px');
  assert.equal(harness.columns.texto.style.width, '391px');

  divider.dispatch('pointerdown', { clientX: 500, pointerId: 9 });
  divider.dispatch('pointermove', { clientX: 450, pointerId: 9 });
  harness.wrapper.clientWidth = 1080;
  harness.observers[0].trigger();
  assert.equal(harness.columns.tiempo.style.width, '117px');
  assert.equal(harness.columns.texto.style.width, '378px');
  assert.equal(harness.saveCalls.length, 3);
  assert.equal(harness.body.classList.contains('is-resizing'), false);

  divider.dispatch('pointerdown', { clientX: 500, pointerId: 10 });
  divider.dispatch('pointermove', { clientX: 450, pointerId: 10 });
  harness.window.dispatch('blur');
  assert.equal(harness.columns.tiempo.style.width, '117px');
  assert.equal(harness.saveCalls.length, 3);

  divider.dispatch('pointerdown', { clientX: 500, pointerId: 11 });
  divider.dispatch('pointermove', { clientX: 450, pointerId: 11 });
  divider.dispatch('lostpointercapture', { pointerId: 11 });
  assert.equal(harness.columns.tiempo.style.width, '117px');
  assert.equal(harness.saveCalls.length, 3);
});

test('an active pointer resize ignores competing pointer ownership and cancellation events', async () => {
  const harness = createHarness();
  await harness.controller.initialize();
  const tiempoDivider = harness.getDivider('tiempo');
  const percentDivider = harness.getDivider('percent');

  tiempoDivider.dispatch('pointerdown', { clientX: 500, pointerId: 21 });
  tiempoDivider.dispatch('pointermove', { clientX: 480, pointerId: 21 });
  assert.equal(harness.columns.tiempo.style.width, '108px');
  assert.equal(harness.columns.percent.style.width, '63px');

  percentDivider.dispatch('pointerdown', { clientX: 400, pointerId: 22 });
  percentDivider.dispatch('pointermove', { clientX: 360, pointerId: 22 });
  percentDivider.dispatch('pointercancel', { pointerId: 22 });
  percentDivider.dispatch('lostpointercapture', { pointerId: 22 });
  assert.equal(harness.columns.tiempo.style.width, '108px');
  assert.equal(harness.columns.percent.style.width, '63px');
  assert.equal(harness.body.classList.contains('is-resizing'), true);
  assert.equal(harness.saveCalls.length, 0);

  tiempoDivider.dispatch('pointermove', { clientX: 470, pointerId: 21 });
  tiempoDivider.dispatch('pointerup', { clientX: 470, pointerId: 21 });
  await waitFor(() => harness.saveCalls.length === 1);
  assert.equal(harness.columns.tiempo.style.width, '118px');
  assert.equal(harness.columns.percent.style.width, '63px');
  assert.equal(harness.body.classList.contains('is-resizing'), false);
  assert.equal(harness.saveCalls[0].widths.tiempo, 118);
  assert.equal(harness.saveCalls[0].widths.percent, 63);
});

test('keyboard resizing cannot commit provisional pointer widths', async () => {
  const harness = createHarness();
  await harness.controller.initialize();
  const tiempoDivider = harness.getDivider('tiempo');
  const percentDivider = harness.getDivider('percent');

  tiempoDivider.dispatch('pointerdown', { clientX: 500, pointerId: 23 });
  tiempoDivider.dispatch('pointermove', { clientX: 480, pointerId: 23 });
  const keyEvent = percentDivider.dispatch('keydown', { key: 'ArrowLeft' });
  assert.equal(keyEvent.defaultPrevented, true);
  assert.equal(harness.columns.tiempo.style.width, '108px');
  assert.equal(harness.columns.percent.style.width, '63px');
  assert.equal(harness.saveCalls.length, 0);

  tiempoDivider.dispatch('pointercancel', { pointerId: 23 });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.columns.tiempo.style.width, '88px');
  assert.equal(harness.columns.percent.style.width, '63px');
  assert.equal(harness.columns.texto.style.width, '420px');
  assert.equal(harness.body.classList.contains('is-resizing'), false);
  assert.equal(harness.saveCalls.length, 0);
});

test('save queue coalesces revisions and warns once per continuous newest-failure episode', async () => {
  const deferredSaves = [];
  const harness = createHarness({
    saveColumnLayout() {
      const deferred = createDeferred();
      deferredSaves.push(deferred);
      return deferred.promise;
    },
  });
  await harness.controller.initialize();
  const divider = harness.getDivider('tiempo');

  divider.dispatch('keydown', { key: 'ArrowLeft' });
  divider.dispatch('keydown', { key: 'ArrowLeft' });
  divider.dispatch('keydown', { key: 'ArrowLeft' });
  assert.equal(harness.saveCalls.length, 1);
  assert.equal(harness.saveCalls[0].widths.tiempo, 98);

  deferredSaves[0].resolve({ ok: false, code: 'WRITE_FAILED' });
  await waitFor(() => harness.saveCalls.length === 2);
  assert.equal(harness.saveCalls[1].widths.tiempo, 118);
  assert.equal(harness.notifications.length, 0);

  deferredSaves[1].resolve({ ok: false, code: 'WRITE_FAILED' });
  await waitFor(() => harness.notifications.length === 1);

  divider.dispatch('keydown', { key: 'ArrowLeft' });
  await waitFor(() => harness.saveCalls.length === 3);
  deferredSaves[2].resolve({ ok: false, code: 'WRITE_FAILED' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.notifications.length, 1);

  divider.dispatch('keydown', { key: 'ArrowLeft' });
  await waitFor(() => harness.saveCalls.length === 4);
  deferredSaves[3].resolve({ ok: true });
  await new Promise((resolve) => setImmediate(resolve));

  divider.dispatch('keydown', { key: 'ArrowLeft' });
  await waitFor(() => harness.saveCalls.length === 5);
  deferredSaves[4].resolve({ ok: false, code: 'WRITE_FAILED' });
  await waitFor(() => harness.notifications.length === 2);
  assert.equal(harness.notifications[0].key, 'renderer.tasks.alerts.column_layout_save_error');
  assert.equal(harness.notifications[0].options.type, 'warn');
});
