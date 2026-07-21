'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadNotify({ document: documentOverride = {}, logger = null, windowOverrides = {} } = {}) {
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
    setTimeout(handler) {
      if (typeof handler === 'function') {
        handler();
      }
      return 0;
    },
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

function createModalFocusHarness() {
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
  const logger = {
    debug() {},
    info() {},
    warn(...args) { warnings.push(args); },
    warnOnce() {},
    error(...args) { errors.push(args); },
    errorOnce() {},
  };
  const notify = loadNotify({
    document,
    logger,
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
