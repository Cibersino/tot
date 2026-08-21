'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadNotify({
  document: documentOverride = {},
  logger = null,
  setTimeoutHandler = (handler) => {
    if (typeof handler === 'function') handler();
    return 0;
  },
  windowOverrides = {},
} = {}) {
  const sandbox = {
    window: {
      getLogger() {
        return logger || {
          debug() {},
          info() {},
          warn() {},
          warnOnce() {},
          error() {},
          errorOnce() {},
        };
      },
      RendererI18n: {
        msgRenderer(key) {
          return key;
        },
      },
      ...windowOverrides,
    },
    document: documentOverride,
    alert() {},
    confirm() {
      return true;
    },
    setTimeout: setTimeoutHandler,
    clearTimeout() {},
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/notify.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/notify.js' });
  return sandbox.window.Notify;
}

function createRendererLoggerHarness() {
  const warnings = [];
  const sandbox = {
    window: {},
    localStorage: {
      getItem() {
        return 'warn';
      },
      setItem() {},
    },
    console: {
      debug() {},
      error() {},
      info() {},
      warn(...args) {
        warnings.push(args);
      },
    },
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/log.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/log.js' });

  return {
    logger: sandbox.window.getLogger('notify'),
    warnings,
  };
}

function createToastHarness() {
  const elementsById = new Map();
  const pendingTimers = [];

  function createElement() {
    const children = [];
    return {
      children,
      className: '',
      dataset: {},
      id: '',
      parentNode: null,
      style: {},
      textContent: '',
      appendChild(child) {
        child.parentNode = this;
        children.push(child);
        if (child.id) elementsById.set(child.id, child);
        return child;
      },
      removeChild(child) {
        const index = children.indexOf(child);
        if (index >= 0) children.splice(index, 1);
        child.parentNode = null;
        return child;
      },
    };
  }

  const body = createElement();
  const document = {
    body,
    createElement,
    getElementById(id) {
      return elementsById.get(id) || null;
    },
  };
  const notify = loadNotify({
    document,
    setTimeoutHandler(handler) {
      pendingTimers.push(handler);
      return pendingTimers.length;
    },
    windowOverrides: {
      requestAnimationFrame(handler) {
        handler();
      },
    },
  });

  return { body, notify, pendingTimers };
}

function createModalFocusHarness({ logger = null } = {}) {
  const documentListeners = new Map();
  const document = {
    activeElement: null,
    addEventListener(type, handler) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      if (!documentListeners.has(type)) return;
      documentListeners.set(
        type,
        documentListeners.get(type).filter((candidate) => candidate !== handler)
      );
    },
    contains(element) {
      return !!element && element.connected !== false;
    },
  };

  function createElement(id, { tabIndex = -1, disabled = false, hidden = false } = {}) {
    const attributes = {};
    const children = [];
    const element = {
      id,
      tabIndex,
      disabled,
      hidden,
      inert: false,
      connected: true,
      parentElement: null,
      parentNode: null,
      children,
      focusCount: 0,
      styleState: { display: 'block', visibility: 'visible' },
      appendChild(child) {
        child.parentElement = this;
        child.parentNode = this;
        child.connected = this.connected;
        children.push(child);
        return child;
      },
      removeChild(child) {
        const index = children.indexOf(child);
        if (index >= 0) children.splice(index, 1);
        child.parentElement = null;
        child.parentNode = null;
        child.connected = false;
        return child;
      },
      contains(candidate) {
        if (candidate === this) return true;
        return children.some((child) => child.contains(candidate));
      },
      querySelectorAll() {
        const descendants = [];
        const visit = (node) => {
          node.children.forEach((child) => {
            descendants.push(child);
            visit(child);
          });
        };
        visit(this);
        return descendants;
      },
      setAttribute(name, value) {
        attributes[name] = String(value);
        if (name === 'tabindex') this.tabIndex = Number(value);
      },
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(attributes, name)
          ? attributes[name]
          : null;
      },
      removeAttribute(name) {
        delete attributes[name];
        if (name === 'tabindex') this.tabIndex = -1;
      },
      focus() {
        this.focusCount += 1;
        document.activeElement = this;
      },
    };
    return element;
  }

  function dispatchTab({ shiftKey = false } = {}) {
    const event = {
      key: 'Tab',
      shiftKey,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };
    const handlers = documentListeners.get('keydown') || [];
    handlers.slice().forEach((handler) => handler(event));
    return event;
  }

  const warnings = [];
  const errors = [];
  const defaultLogger = {
    debug() {},
    info() {},
    warn(...args) { warnings.push(args); },
    warnOnce() {},
    error(...args) { errors.push(args); },
    errorOnce() {},
  };
  const notify = loadNotify({
    document,
    logger: logger || defaultLogger,
    windowOverrides: {
      getComputedStyle(element) {
        return element.styleState;
      },
    },
  });

  return {
    createElement,
    dispatchTab,
    document,
    errors,
    notify,
    warnings,
    getKeydownListenerCount() {
      return (documentListeners.get('keydown') || []).length;
    },
  };
}

test('notify registerCustomPrompt owns public prompt registration and rejects collisions', () => {
  const notify = loadNotify();
  const promptHandler = async () => null;

  notify.registerCustomPrompt('promptExample', promptHandler);

  assert.equal(notify.promptExample, promptHandler);
  assert.throws(
    () => notify.registerCustomPrompt('promptExample', async () => null),
    /duplicate name: promptExample/
  );
});

test('notify registerCustomPrompt validates prompt names and handlers', () => {
  const notify = loadNotify();

  assert.throws(
    () => notify.registerCustomPrompt('example', async () => null),
    /prompt\* method name/
  );
  assert.throws(
    () => notify.registerCustomPrompt('promptExample', null),
    /function handler/
  );
});

test('notify toasts expose semantic state without inline presentation', () => {
  const harness = createToastHarness();

  harness.notify.toastEditorText('Saved', { type: 'info', duration: 4500 });

  const container = harness.body.children[0];
  const toast = container.children[0];
  assert.equal(container.id, 'totEditorToastContainer');
  assert.equal(container.className, 'tot-toast-container');
  assert.equal(container.dataset.position, 'top-right');
  assert.equal(toast.className, 'tot-toast');
  assert.equal(toast.dataset.type, 'info');
  assert.equal(toast.dataset.state, 'visible');
  assert.deepEqual(toast.style, {});
  assert.equal(harness.pendingTimers.length, 1);
});

test('toast stylesheet owns the modal-safe visual contract and the Arial font change', () => {
  const stylesheet = fs.readFileSync(path.resolve(__dirname, '../../../public/toasts.css'), 'utf8');

  assert.match(stylesheet, /--tot-toast-background:\s*#fff2cf/);
  assert.match(stylesheet, /--tot-toast-color:\s*#111111/);
  assert.match(stylesheet, /--tot-toast-border:\s*1px solid rgba\(0, 0, 0, 0\.15\)/);
  assert.match(stylesheet, /--tot-toast-shadow:\s*0 6px 16px rgba\(0, 0, 0, 0\.18\)/);
  assert.match(stylesheet, /--tot-toast-font:\s*13px\/1\.35 Arial, sans-serif/);
  assert.match(stylesheet, /--tot-toast-offset:\s*16px/);
  assert.match(stylesheet, /--tot-toast-gap:\s*8px/);
  assert.match(stylesheet, /--tot-toast-max-width:\s*320px/);
  assert.match(stylesheet, /--tot-toast-padding:\s*10px 12px/);
  assert.match(stylesheet, /--tot-toast-radius:\s*8px/);
  assert.match(stylesheet, /--tot-toast-transition:\s*0\.2s/);
  assert.match(stylesheet, /--tot-toast-translate-y:\s*6px/);
  assert.match(stylesheet, /--tot-toast-z-index:\s*1111/);
  assert.doesNotMatch(stylesheet, /Segoe UI|Tahoma/);
  assert.match(stylesheet, /\.tot-toast\[data-state="visible"\]/);
});

test('toast stylesheet loads only in the current toast-rendering windows', () => {
  const toastRenderingPages = [
    'index.html',
    'editor.html',
    'editor_find.html',
    'task_editor.html',
  ];
  const nonToastPages = [
    'preset_modal.html',
    'reading_test_questions.html',
  ];

  toastRenderingPages.forEach((page) => {
    const html = fs.readFileSync(path.resolve(__dirname, '../../../public', page), 'utf8');
    assert.match(html, /<link rel="stylesheet" href="toasts\.css" \/>/);
  });
  nonToastPages.forEach((page) => {
    const html = fs.readFileSync(path.resolve(__dirname, '../../../public', page), 'utf8');
    assert.doesNotMatch(html, /<link rel="stylesheet" href="toasts\.css" \/>/);
  });
});

test('notify modal focus falls back to plain focus and lets warnOnce deduplicate the diagnostic', () => {
  const rendererLogger = createRendererLoggerHarness();
  const harness = createModalFocusHarness({ logger: rendererLogger.logger });
  const modal = harness.createElement('modal');
  const only = harness.createElement('only', { tabIndex: 0 });
  const focusFailure = new Error('preventScroll is unsupported');
  const focusCalls = [];
  only.focus = (options) => {
    focusCalls.push(options);
    if (options) throw focusFailure;
    harness.document.activeElement = only;
  };
  modal.appendChild(only);

  harness.notify.activateModalFocus(modal, { initialFocus: only, fallbackFocus: modal });
  assert.equal(harness.document.activeElement, only);
  assert.equal(focusCalls.length, 2);
  assert.equal(focusCalls[0].preventScroll, true);
  assert.equal(focusCalls[1], undefined);

  assert.equal(harness.dispatchTab().defaultPrevented, true);
  assert.equal(focusCalls.length, 4);
  assert.equal(focusCalls[2].preventScroll, true);
  assert.equal(focusCalls[3], undefined);
  assert.equal(rendererLogger.warnings.length, 1);
  assert.equal(rendererLogger.warnings[0][0], '[WARN][notify]');
  assert.equal(
    rendererLogger.warnings[0][1],
    'focus({ preventScroll: true }) failed; falling back to focus().'
  );
  assert.equal(rendererLogger.warnings[0][2], focusFailure);
});

test('notify modal focus wraps forward and backward and re-enters from outside', () => {
  const harness = createModalFocusHarness();
  const opener = harness.createElement('opener', { tabIndex: 0 });
  const outside = harness.createElement('outside', { tabIndex: 0 });
  const modal = harness.createElement('modal');
  const first = harness.createElement('first', { tabIndex: 0 });
  const middle = harness.createElement('middle', { tabIndex: 0 });
  const last = harness.createElement('last', { tabIndex: 0 });
  modal.appendChild(first);
  modal.appendChild(middle);
  modal.appendChild(last);
  opener.focus();

  harness.notify.activateModalFocus(modal, { initialFocus: middle, fallbackFocus: modal });
  assert.equal(harness.document.activeElement, middle);

  last.focus();
  assert.equal(harness.dispatchTab().defaultPrevented, true);
  assert.equal(harness.document.activeElement, first);

  first.focus();
  assert.equal(harness.dispatchTab({ shiftKey: true }).defaultPrevented, true);
  assert.equal(harness.document.activeElement, last);

  outside.focus();
  harness.dispatchTab();
  assert.equal(harness.document.activeElement, first);

  outside.focus();
  harness.dispatchTab({ shiftKey: true });
  assert.equal(harness.document.activeElement, last);
});

test('notify modal focus excludes unavailable targets and recomputes dynamic controls', () => {
  const harness = createModalFocusHarness();
  const modal = harness.createElement('modal');
  const first = harness.createElement('first', { tabIndex: 0 });
  const disabled = harness.createElement('disabled', { tabIndex: 0, disabled: true });
  const hiddenParent = harness.createElement('hidden-parent');
  hiddenParent.hidden = true;
  const hiddenChild = harness.createElement('hidden-child', { tabIndex: 0 });
  const inertParent = harness.createElement('inert-parent');
  inertParent.inert = true;
  const inertChild = harness.createElement('inert-child', { tabIndex: 0 });
  const nonSequential = harness.createElement('non-sequential', { tabIndex: -1 });
  const last = harness.createElement('last', { tabIndex: 0 });
  modal.appendChild(first);
  modal.appendChild(disabled);
  hiddenParent.appendChild(hiddenChild);
  modal.appendChild(hiddenParent);
  inertParent.appendChild(inertChild);
  modal.appendChild(inertParent);
  modal.appendChild(nonSequential);
  modal.appendChild(last);

  harness.notify.activateModalFocus(modal, { initialFocus: first, fallbackFocus: modal });
  last.focus();
  harness.dispatchTab();
  assert.equal(harness.document.activeElement, first);

  const dynamic = harness.createElement('dynamic', { tabIndex: 0 });
  modal.appendChild(dynamic);
  last.focus();
  const normalTraversal = harness.dispatchTab();
  assert.equal(normalTraversal.defaultPrevented, false);

  dynamic.focus();
  harness.dispatchTab();
  assert.equal(harness.document.activeElement, first);

  modal.removeChild(dynamic);
  last.focus();
  harness.dispatchTab();
  assert.equal(harness.document.activeElement, first);
});

test('notify modal focus uses a programmatic fallback when no sequential target exists', () => {
  const harness = createModalFocusHarness();
  const opener = harness.createElement('opener', { tabIndex: 0 });
  const modal = harness.createElement('modal');
  opener.focus();

  harness.notify.activateModalFocus(modal, { fallbackFocus: modal });

  assert.equal(harness.document.activeElement, modal);
  assert.equal(modal.getAttribute('tabindex'), '-1');
  const event = harness.dispatchTab();
  assert.equal(event.defaultPrevented, true);
  assert.equal(harness.document.activeElement, modal);

  harness.notify.deactivateModalFocus(modal);
  assert.equal(modal.getAttribute('tabindex'), null);
  assert.equal(harness.document.activeElement, opener);
  assert.deepEqual(harness.errors, []);
});

test('notify modal focus gives nested children precedence and restores each per-open opener', () => {
  const harness = createModalFocusHarness();
  const topOpener = harness.createElement('top-opener', { tabIndex: 0 });
  const parent = harness.createElement('parent');
  const parentFirst = harness.createElement('parent-first', { tabIndex: 0 });
  const childOpener = harness.createElement('child-opener', { tabIndex: 0 });
  const parentLast = harness.createElement('parent-last', { tabIndex: 0 });
  const child = harness.createElement('child');
  const childFirst = harness.createElement('child-first', { tabIndex: 0 });
  const childLast = harness.createElement('child-last', { tabIndex: 0 });
  parent.appendChild(parentFirst);
  parent.appendChild(childOpener);
  parent.appendChild(parentLast);
  child.appendChild(childFirst);
  child.appendChild(childLast);
  parent.appendChild(child);
  child.setAttribute('aria-hidden', 'true');
  topOpener.focus();

  harness.notify.activateModalFocus(parent, { initialFocus: parentFirst, fallbackFocus: parent });
  childOpener.focus();
  child.setAttribute('aria-hidden', 'false');
  harness.notify.activateModalFocus(child, { initialFocus: childFirst, fallbackFocus: child });

  childLast.focus();
  harness.dispatchTab();
  assert.equal(harness.document.activeElement, childFirst);

  child.setAttribute('aria-hidden', 'true');
  harness.notify.deactivateModalFocus(child);
  assert.equal(harness.document.activeElement, childOpener);

  parentLast.focus();
  harness.dispatchTab();
  assert.equal(harness.document.activeElement, parentFirst);

  parent.setAttribute('aria-hidden', 'true');
  harness.notify.deactivateModalFocus(parent);
  assert.equal(harness.document.activeElement, topOpener);
});

test('notify modal focus activation is idempotent and does not duplicate handling', () => {
  const harness = createModalFocusHarness();
  const opener = harness.createElement('opener', { tabIndex: 0 });
  const modal = harness.createElement('modal');
  const only = harness.createElement('only', { tabIndex: 0 });
  modal.appendChild(only);
  opener.focus();

  harness.notify.activateModalFocus(modal, { initialFocus: only, fallbackFocus: modal });
  harness.notify.activateModalFocus(modal, { initialFocus: only, fallbackFocus: modal });
  assert.equal(harness.getKeydownListenerCount(), 1);

  const focusCountBeforeTab = only.focusCount;
  const event = harness.dispatchTab();
  assert.equal(event.defaultPrevented, true);
  assert.equal(only.focusCount, focusCountBeforeTab + 1);

  modal.setAttribute('aria-hidden', 'true');
  harness.notify.deactivateModalFocus(modal);
  harness.notify.deactivateModalFocus(modal);
  assert.equal(harness.getKeydownListenerCount(), 0);
  assert.equal(harness.document.activeElement, opener);
});
