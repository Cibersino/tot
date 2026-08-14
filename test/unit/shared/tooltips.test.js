'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const tooltipSource = fs.readFileSync(
  path.resolve(__dirname, '../../../public/js/tooltips.js'),
  'utf8'
);

function createHarness({ mutationObserverAvailable = true } = {}) {
  const documentListeners = new Map();
  const windowListeners = new Map();
  const tooltipMeasurementWidths = [];
  const warningCalls = [];
  const observerCallbacks = [];

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
  button.setAttribute('aria-label', 'Edit text');
  button.setAttribute('aria-describedby', 'edit-description');
  button.setAttribute('data-tot-tooltip', 'Open editor');
  button.setAttribute('title', 'Unrelated native title');
  body.appendChild(button);

  const document = {
    documentElement,
    body,
    createElement,
    addEventListener(type, listener) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(listener);
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
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(listener);
    },
  };
  class MutationObserver {
    constructor(callback) {
      observerCallbacks.push(callback);
    }

    observe() {}
  }

  const sandbox = {
    window,
    document,
    MutationObserver: mutationObserverAvailable ? MutationObserver : undefined,
  };
  vm.createContext(sandbox);

  function runPresenter() {
    vm.runInContext(tooltipSource, sandbox, { filename: 'public/js/tooltips.js' });
  }

  runPresenter();

  return {
    button,
    body,
    tooltipMeasurementWidths,
    warningCalls,
    createElement,
    dispatch(type, event) {
      (documentListeners.get(type) || []).forEach((listener) => listener(event));
    },
    listenerCount(type) {
      return (documentListeners.get(type) || []).length;
    },
    notifyTooltipChange(target = button) {
      observerCallbacks.forEach((callback) => callback([{
        type: 'attributes',
        attributeName: 'data-tot-tooltip',
        target,
      }]));
    },
    notifyMutations(records) {
      observerCallbacks.forEach((callback) => callback(records));
    },
    runPresenter,
  };
}

function appendTooltipTarget(harness, text) {
  const target = harness.createElement('button');
  target.setAttribute('data-tot-tooltip', text);
  harness.body.appendChild(target);
  return target;
}

function getTooltip(harness) {
  return harness.body._children.find((element) => element.id === 'tot-authored-tooltip');
}

test('visual tooltip values stay independent from name, description, and native title state', () => {
  const harness = createHarness();

  harness.dispatch('pointerover', { target: harness.button });
  const tooltip = harness.body._children[1];
  assert.equal(tooltip.hidden, false);
  assert.equal(tooltip.textContent, 'Open editor');
  assert.equal(tooltip.getAttribute('aria-hidden'), 'true');
  assert.equal(tooltip.getAttribute('role'), null);
  assert.equal(harness.button.getAttribute('aria-label'), 'Edit text');
  assert.equal(harness.button.getAttribute('aria-describedby'), 'edit-description');
  assert.equal(harness.button.getAttribute('title'), 'Unrelated native title');

  harness.button.setAttribute('data-tot-tooltip', 'Open full editor');
  harness.notifyTooltipChange();
  assert.equal(tooltip.textContent, 'Open full editor');
  assert.equal(harness.button.getAttribute('aria-label'), 'Edit text');
  assert.equal(harness.button.getAttribute('aria-describedby'), 'edit-description');
  assert.equal(harness.button.getAttribute('title'), 'Unrelated native title');
});

test('pointer and keyboard focus independently show and hide the visual bubble', () => {
  const harness = createHarness();

  harness.dispatch('pointerover', { target: harness.button });
  const tooltip = harness.body._children[1];
  assert.equal(tooltip.hidden, false);
  harness.dispatch('pointerout', { target: harness.button, relatedTarget: null });
  assert.equal(tooltip.hidden, true);

  harness.dispatch('focusin', { target: harness.button });
  assert.equal(tooltip.hidden, false);
  harness.dispatch('focusout', { target: harness.button, relatedTarget: null });
  assert.equal(tooltip.hidden, true);
});

test('focused tooltip dismissal survives hover activity on subordinate targets', () => {
  const harness = createHarness();
  const hoverB = appendTooltipTarget(harness, 'Hover B');
  const hoverC = appendTooltipTarget(harness, 'Hover C');

  harness.dispatch('focusin', { target: harness.button });
  const tooltip = getTooltip(harness);
  harness.dispatch('pointerover', { target: hoverB });
  assert.equal(tooltip.hidden, false);
  assert.equal(tooltip.textContent, 'Open editor');

  harness.dispatch('keydown', {
    key: 'Escape',
    preventDefault() {},
    stopImmediatePropagation() {},
  });
  assert.equal(tooltip.hidden, true);

  harness.dispatch('pointerout', { target: hoverB, relatedTarget: null });
  harness.dispatch('pointerover', { target: hoverB });
  assert.equal(tooltip.hidden, true);

  harness.dispatch('pointerout', { target: hoverB, relatedTarget: hoverC });
  harness.dispatch('pointerover', { target: hoverC });
  assert.equal(tooltip.hidden, true);
});

test('focused tooltip dismissal ends when focus leaves for a still-hovered target', () => {
  const harness = createHarness();
  const hoverB = appendTooltipTarget(harness, 'Hover B');

  harness.dispatch('focusin', { target: harness.button });
  harness.dispatch('pointerover', { target: hoverB });
  const tooltip = getTooltip(harness);
  harness.dispatch('keydown', {
    key: 'Escape',
    preventDefault() {},
    stopImmediatePropagation() {},
  });

  harness.dispatch('focusout', { target: harness.button, relatedTarget: null });
  assert.equal(tooltip.hidden, false);
  assert.equal(tooltip.textContent, 'Hover B');
});

test('focused tooltip dismissal ends when focus moves to another target', () => {
  const harness = createHarness();
  const focusC = appendTooltipTarget(harness, 'Focus C');

  harness.dispatch('focusin', { target: harness.button });
  const tooltip = getTooltip(harness);
  harness.dispatch('keydown', {
    key: 'Escape',
    preventDefault() {},
    stopImmediatePropagation() {},
  });

  harness.dispatch('focusout', { target: harness.button, relatedTarget: focusC });
  harness.dispatch('focusin', { target: focusC });
  assert.equal(tooltip.hidden, false);
  assert.equal(tooltip.textContent, 'Focus C');
});

test('first Escape dismisses a visible bubble and a second Escape remains unconsumed', () => {
  const harness = createHarness();
  let prevented = false;
  let propagationStopped = false;

  harness.dispatch('focusin', { target: harness.button });
  const tooltip = harness.body._children[1];
  harness.dispatch('keydown', {
    key: 'Escape',
    preventDefault() { prevented = true; },
    stopImmediatePropagation() { propagationStopped = true; },
  });

  assert.equal(tooltip.hidden, true);
  assert.equal(prevented, true);
  assert.equal(propagationStopped, true);
  assert.equal(harness.button.getAttribute('aria-label'), 'Edit text');
  assert.equal(harness.button.getAttribute('aria-describedby'), 'edit-description');

  prevented = false;
  propagationStopped = false;
  harness.dispatch('keydown', {
    key: 'Escape',
    preventDefault() { prevented = true; },
    stopImmediatePropagation() { propagationStopped = true; },
  });
  assert.equal(prevented, false);
  assert.equal(propagationStopped, false);

  harness.dispatch('focusout', { target: harness.button, relatedTarget: null });
  harness.dispatch('focusin', { target: harness.button });
  assert.equal(tooltip.hidden, false);
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

test('delegated events support dynamically added explicit targets', () => {
  const harness = createHarness();
  const dynamicButton = harness.createElement('button');
  dynamicButton.setAttribute('data-tot-tooltip', 'Dynamic action');
  harness.body.appendChild(dynamicButton);

  harness.dispatch('pointerover', { target: dynamicButton });
  const tooltip = harness.body._children[2];
  assert.equal(tooltip.hidden, false);
  assert.equal(tooltip.textContent, 'Dynamic action');
});

test('removing a hovered or focused target hides the visual bubble', () => {
  ['pointerover', 'focusin'].forEach((activationType) => {
    const harness = createHarness();
    harness.dispatch(activationType, { target: harness.button });
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
});

test('repeated initialization does not duplicate presenter listeners or bubbles', () => {
  const harness = createHarness();
  const initialPointerListeners = harness.listenerCount('pointerover');

  harness.runPresenter();
  harness.dispatch('pointerover', { target: harness.button });

  assert.equal(harness.listenerCount('pointerover'), initialPointerListeners);
  assert.equal(harness.body._children.filter((element) => element.id === 'tot-authored-tooltip').length, 1);
});

test('pointer and focus presentation remain available without MutationObserver', () => {
  const harness = createHarness({ mutationObserverAvailable: false });

  harness.dispatch('pointerover', { target: harness.button });
  const tooltip = harness.body._children[1];
  assert.equal(tooltip.hidden, false);
  assert.equal(tooltip.textContent, 'Open editor');
  assert.deepEqual(harness.warningCalls, [[
    'Visual tooltip mutation refresh and detached-target cleanup unavailable: MutationObserver missing.',
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
