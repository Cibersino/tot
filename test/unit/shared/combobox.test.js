'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createClassList(element) {
  const values = new Set();
  return {
    add(...names) {
      names.forEach((name) => values.add(name));
      element.className = [...values].join(' ');
    },
    remove(...names) {
      names.forEach((name) => values.delete(name));
      element.className = [...values].join(' ');
    },
    contains(name) {
      return values.has(name);
    },
  };
}

function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    removeEventListener(type, listener) {
      const entries = listeners.get(type) || [];
      listeners.set(type, entries.filter((entry) => entry !== listener));
    },
    dispatch(type, event = {}) {
      const safeEvent = {
        target: this,
        defaultPrevented: false,
        propagationStopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.propagationStopped = true; },
        ...event,
      };
      (listeners.get(type) || []).slice().forEach((listener) => listener(safeEvent));
      return safeEvent;
    },
  };
}

function createElement(tagName = 'div') {
  const element = createEventTarget();
  const attributes = {};
  const children = [];
  Object.assign(element, {
    tagName,
    id: '',
    className: '',
    dataset: {},
    value: '',
    textContent: '',
    hidden: false,
    disabled: false,
    readOnly: false,
    parentNode: null,
    children,
    appendChild(child) {
      child.parentNode = this;
      children.push(child);
      return child;
    },
    replaceChildren(...nextChildren) {
      children.splice(0, children.length);
      nextChildren.forEach((child) => this.appendChild(child));
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    removeAttribute(name) {
      delete attributes[name];
    },
    contains(node) {
      let current = node;
      while (current) {
        if (current === this) return true;
        current = current.parentNode;
      }
      return false;
    },
    focus() {
      this.focused = true;
    },
    select() {
      this.selected = true;
    },
    scrollIntoView(options) {
      this.scrollOptions = options;
    },
  });
  element.classList = createClassList(element);
  return element;
}

function createHarness() {
  const document = createEventTarget();
  document.createElement = (tagName) => createElement(tagName);
  const window = {
    setTimeout,
    clearTimeout,
  };
  const sandbox = { window, document, console };
  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/combobox.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/combobox.js' });
  return { document, create: window.RendererCombobox.create };
}

test('select mode renders ARIA state, skips disabled options, and commits through keyboard', () => {
  const harness = createHarness();
  const host = createElement();
  const changes = [];
  const controller = harness.create({
    host,
    mode: 'select',
    options: [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta', disabled: true },
      { value: 'c', label: 'Charlie' },
    ],
    value: 'a',
    ariaLabel: 'Choice',
    onChange(value, option) {
      changes.push([value, option.label]);
    },
  });
  const [input, listbox] = host.children;

  assert.equal(input.readOnly, true);
  assert.equal(input.value, 'Alpha');
  assert.equal(input.getAttribute('role'), 'combobox');
  assert.equal(input.getAttribute('aria-label'), 'Choice');
  assert.equal(input.getAttribute('aria-expanded'), 'false');

  input.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(input.getAttribute('aria-expanded'), 'true');
  assert.equal(listbox.hidden, false);
  input.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(input.getAttribute('aria-activedescendant').endsWith('-option-2'), true);
  input.dispatch('keydown', { key: 'Enter' });

  assert.equal(controller.getValue(), 'c');
  assert.equal(input.value, 'Charlie');
  assert.equal(input.getAttribute('aria-expanded'), 'false');
  assert.deepEqual(changes, [['c', 'Charlie']]);
});

test('select type-ahead, Home/End, updates, focus, and disabled state follow the controller contract', () => {
  const harness = createHarness();
  const host = createElement();
  let changeCount = 0;
  const controller = harness.create({
    host,
    mode: 'select',
    options: [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Bravo' },
      { value: 'c', label: 'Charlie' },
    ],
    value: 'a',
    onChange() { changeCount += 1; },
  });
  const input = host.children[0];

  controller.update({ value: 'b' });
  assert.equal(controller.getValue(), 'b');
  assert.equal(changeCount, 0);
  input.dispatch('keydown', { key: 'c' });
  input.dispatch('keydown', { key: 'Enter' });
  assert.equal(controller.getValue(), 'c');

  controller.open();
  input.dispatch('keydown', { key: 'Home' });
  assert.equal(input.getAttribute('aria-activedescendant').endsWith('-option-0'), true);
  input.dispatch('keydown', { key: 'End' });
  assert.equal(input.getAttribute('aria-activedescendant').endsWith('-option-2'), true);
  controller.close();
  controller.focus();
  assert.equal(input.focused, true);
  controller.update({ disabled: true });
  assert.equal(input.disabled, true);
  controller.open();
  assert.equal(input.getAttribute('aria-expanded'), 'false');
});

test('editable mode filters, restores committed text, and leaves actions non-committing and open', () => {
  const harness = createHarness();
  const host = createElement();
  const actions = [];
  const changes = [];
  const controller = harness.create({
    host,
    mode: 'editable',
    options: [
      { value: '', label: 'None', variant: 'clear' },
      { value: 'easy', label: 'Easy' },
    ],
    value: 'easy',
    placeholder: 'Search',
    noResultsLabel: 'No results',
    resolveOptions(query, options) {
      if (query === 'New') return [{ action: 'create', label: 'Create New', variant: 'create' }];
      if (query === 'blocked') return [{ action: 'create', label: 'Blocked', disabled: true }];
      if (query === 'missing') return [];
      return options;
    },
    onChange(value) {
      changes.push(value);
    },
    onAction(option, owner) {
      actions.push([option.action, owner === controller]);
    },
  });
  const [input, listbox] = host.children;

  input.dispatch('click');
  input.value = 'New';
  input.dispatch('input');
  assert.equal(listbox.children[0].dataset.variant, 'create');
  input.dispatch('keydown', { key: 'Enter' });
  assert.deepEqual(actions, [['create', true]]);
  assert.equal(controller.getValue(), 'easy');
  assert.equal(input.getAttribute('aria-expanded'), 'true');

  input.value = 'blocked';
  input.dispatch('input');
  input.dispatch('keydown', { key: 'Enter' });
  assert.deepEqual(actions, [['create', true]]);

  input.dispatch('keydown', { key: 'Escape' });
  assert.equal(input.value, 'Easy');
  controller.update({ value: '' });
  assert.equal(input.value, '');
  controller.update({ value: 'easy' });
  input.dispatch('click');
  input.value = 'missing';
  input.dispatch('input');
  assert.equal(listbox.children[0].textContent, 'No results');
  input.dispatch('keydown', { key: 'Tab' });
  assert.equal(input.value, 'Easy');
  input.dispatch('click');
  listbox.children[0].dispatch('click');
  assert.equal(controller.getValue(), '');
  assert.equal(input.value, '');
  assert.deepEqual(changes, ['']);
});

test('only one popup stays open; outside clicks close it; destroy removes generated DOM', () => {
  const harness = createHarness();
  const firstHost = createElement();
  const secondHost = createElement();
  const first = harness.create({ host: firstHost, mode: 'select', options: [], value: '' });
  const second = harness.create({ host: secondHost, mode: 'select', options: [], value: '' });

  first.open();
  second.open();
  assert.equal(firstHost.children[0].getAttribute('aria-expanded'), 'false');
  assert.equal(secondHost.children[0].getAttribute('aria-expanded'), 'true');

  harness.document.dispatch('mousedown', { target: createElement() });
  assert.equal(secondHost.children[0].getAttribute('aria-expanded'), 'false');
  second.destroy();
  assert.equal(secondHost.children.length, 0);
  assert.equal(secondHost.classList.contains('renderer-combobox'), false);
  first.destroy();
});
