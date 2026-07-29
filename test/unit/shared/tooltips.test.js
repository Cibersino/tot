'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHarness({ mutationObserverAvailable = true } = {}) {
  const documentListeners = new Map();
  const windowListeners = new Map();
  const tooltipMeasurementWidths = [];
  const warningCalls = [];
  let observerCallback = null;

  function createElement(tagName = 'div') {
    const attributes = {};
    const children = [];
    return {
      tagName,
      nodeType: 1,
      className: '',
      hidden: false,
      id: '',
      textContent: '',
      style: {},
      parentNode: null,
      get _children() {
        return children;
      },
      appendChild(child) {
        child.parentNode = this;
        children.push(child);
        return child;
      },
      removeChild(child) {
        const index = children.indexOf(child);
        if (index >= 0) children.splice(index, 1);
        child.parentNode = null;
        return child;
      },
      setAttribute(name, value) {
        attributes[name] = String(value);
      },
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
      },
      hasAttribute(name) {
        return Object.prototype.hasOwnProperty.call(attributes, name);
      },
      removeAttribute(name) {
        delete attributes[name];
      },
      contains(candidate) {
        return candidate === this || children.some((child) => child.contains(candidate));
      },
      closest(selector) {
        const attribute = /^\[([^\]]+)\]$/.exec(selector)?.[1];
        let current = this;
        while (current) {
          if (attribute && current.hasAttribute(attribute)) return current;
          current = current.parentNode;
        }
        return null;
      },
      querySelectorAll(selector) {
        const attribute = /^\[([^\]]+)\]$/.exec(selector)?.[1];
        const result = [];
        const visit = (node) => {
          node._children.forEach((child) => {
            if (attribute && child.hasAttribute(attribute)) result.push(child);
            visit(child);
          });
        };
        visit(this);
        return result;
      },
      getBoundingClientRect() {
        if (this.id === 'tot-authored-tooltip') {
          const width = this.style.left ? 70 : 120;
          tooltipMeasurementWidths.push(width);
          return { left: 0, top: 0, bottom: 24, width, height: 24 };
        }
        return tagName === 'button'
          ? { left: 40, top: 40, bottom: 64, width: 24, height: 24 }
          : { left: 0, top: 0, bottom: 24, width: 120, height: 24 };
      },
    };
  }

  const documentElement = createElement('html');
  const body = createElement('body');
  documentElement.appendChild(body);
  const button = createElement('button');
  button.setAttribute('title', 'Open editor');
  body.appendChild(button);

  const document = {
    documentElement,
    body,
    createElement,
    addEventListener(type, listener) {
      documentListeners.set(type, listener);
    },
  };
  const window = {
    innerWidth: 600,
    innerHeight: 400,
    getLogger() {
      return {
        warn(...args) {
          warningCalls.push(args);
        },
        error() {},
      };
    },
    addEventListener(type, listener) {
      windowListeners.set(type, listener);
    },
  };
  class MutationObserver {
    constructor(callback) {
      observerCallback = callback;
    }

    observe() {}
  }

  const sandbox = {
    window,
    document,
    MutationObserver: mutationObserverAvailable ? MutationObserver : undefined,
    Node: { ELEMENT_NODE: 1 },
  };
  vm.createContext(sandbox);
  const source = fs.readFileSync(path.resolve(__dirname, '../../../public/js/tooltips.js'), 'utf8');
  vm.runInContext(source, sandbox, { filename: 'public/js/tooltips.js' });

  return {
    button,
    body,
    tooltipMeasurementWidths,
    warningCalls,
    dispatch(type, event) {
      documentListeners.get(type)(event);
    },
    notifyTitleChange() {
      observerCallback([{ type: 'attributes', attributeName: 'title', target: button }]);
    },
    notifyMutations(records) {
      observerCallback(records);
    },
  };
}

test('authored tooltips replace native titles and follow dynamic title changes', () => {
  const harness = createHarness();

  assert.equal(harness.button.getAttribute('title'), null);
  assert.equal(harness.button.getAttribute('data-tot-tooltip'), 'Open editor');
  assert.equal(harness.button.getAttribute('aria-label'), 'Open editor');

  harness.dispatch('pointerover', { target: harness.button });
  const tooltip = harness.body._children[1];
  assert.equal(tooltip.hidden, false);
  assert.equal(tooltip.textContent, 'Open editor');

  harness.button.setAttribute('title', 'Close editor');
  harness.notifyTitleChange();
  assert.equal(harness.button.getAttribute('title'), null);
  assert.equal(harness.button.getAttribute('data-tot-tooltip'), 'Close editor');
  assert.equal(tooltip.textContent, 'Close editor');

  harness.dispatch('pointerout', { target: harness.button, relatedTarget: null });
  assert.equal(tooltip.hidden, true);
});

test('repeated hovers retain the same tooltip width', () => {
  const harness = createHarness();

  harness.dispatch('pointerover', { target: harness.button });
  const tooltip = harness.body._children[1];
  assert.equal(tooltip.hidden, false);
  assert.deepEqual(harness.tooltipMeasurementWidths, [120]);

  harness.dispatch('pointerout', { target: harness.button, relatedTarget: null });
  harness.dispatch('pointerover', { target: harness.button });

  assert.equal(tooltip.hidden, false);
  assert.deepEqual(harness.tooltipMeasurementWidths, [120, 120]);
});

test('hides the authored tooltip when its hovered target is removed', () => {
  const harness = createHarness();

  harness.dispatch('pointerover', { target: harness.button });
  const tooltip = harness.body._children[1];
  assert.equal(tooltip.hidden, false);

  harness.body.removeChild(harness.button);
  harness.notifyMutations([{
    type: 'childList',
    addedNodes: [],
    removedNodes: [harness.button],
  }]);

  assert.equal(tooltip.hidden, true);
});

test('hides the authored tooltip when its focused target is removed', () => {
  const harness = createHarness();

  harness.dispatch('focusin', { target: harness.button });
  const tooltip = harness.body._children[1];
  assert.equal(tooltip.hidden, false);

  harness.body.removeChild(harness.button);
  harness.notifyMutations([{
    type: 'childList',
    addedNodes: [],
    removedNodes: [harness.button],
  }]);

  assert.equal(tooltip.hidden, true);
});

test('leaves native titles in place and warns when MutationObserver is unavailable', () => {
  const harness = createHarness({ mutationObserverAvailable: false });

  assert.equal(harness.button.getAttribute('title'), 'Open editor');
  assert.equal(harness.button.getAttribute('data-tot-tooltip'), null);
  assert.deepEqual(harness.warningCalls, [[
    'Authored tooltip enhancement unavailable: MutationObserver missing; native title tooltips remain.',
  ]]);
});

test('tooltip stylesheet owns the foreground and background colors', () => {
  const stylesheet = fs.readFileSync(path.resolve(__dirname, '../../../public/tooltips.css'), 'utf8');

  assert.match(stylesheet, /--tot-tooltip-background:\s*#2f2a20/);
  assert.match(stylesheet, /--tot-tooltip-color:\s*#fffaf0/);
  assert.match(stylesheet, /inline-size:\s*max-content/);
  assert.match(stylesheet, /background:\s*var\(--tot-tooltip-background\)/);
  assert.match(stylesheet, /color:\s*var\(--tot-tooltip-color\)/);
});
