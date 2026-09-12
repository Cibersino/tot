'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createClassList() {
  const values = new Set();
  return {
    add(...names) { names.forEach((name) => values.add(name)); },
    contains(name) { return values.has(name); },
  };
}

function createElement(tagName = 'div') {
  const attributes = {};
  const children = [];
  const element = {
    tagName,
    type: '',
    className: '',
    classList: createClassList(),
    parentNode: null,
    textContent: '',
    appendChild(child) {
      child.parentNode = this;
      children.push(child);
      return child;
    },
    setAttribute(name, value) { attributes[name] = String(value); },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    removeAttribute(name) { delete attributes[name]; },
    querySelectorAll(selector) {
      if (selector !== '[data-tot-icon-slot="true"]') return [];
      return children.filter((child) => child.getAttribute('data-tot-icon-slot') === 'true');
    },
    remove() {
      if (!this.parentNode) return;
      const siblings = this.parentNode._children;
      const index = siblings.indexOf(this);
      if (index >= 0) siblings.splice(index, 1);
      this.parentNode = null;
    },
    get _children() { return children; },
  };
  return element;
}

function createSvg() {
  const svg = createElement('svg');
  svg.cloneNode = () => createSvg();
  svg.querySelectorAll = () => [];
  return svg;
}

function createHarness() {
  const document = {
    readyState: 'complete',
    createElement(tagName) {
      if (tagName === 'template') {
        const template = createElement('template');
        template.content = { firstElementChild: null };
        Object.defineProperty(template, 'innerHTML', {
          set() { template.content.firstElementChild = createSvg(); },
        });
        return template;
      }
      return createElement(tagName);
    },
    querySelectorAll() { return []; },
  };
  const sandbox = {
    window: {
      GeneratedRendererIcons: {
        icons: { close: '<svg viewBox="0 0 10 10"></svg>' },
      },
      getLogger() {
        return { error() {} };
      },
    },
    document,
  };
  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/renderer_icons.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/renderer_icons.js' });
  return { api: sandbox.window.RendererIcons };
}

test('renderer icon helpers never infer accessible names or visual tooltips from title-like input', () => {
  const harness = createHarness();
  const unnamed = createElement('button');

  harness.api.applyIconToElement(unnamed, 'close', { title: 'Close legacy' });

  assert.equal(unnamed.getAttribute('aria-label'), null);
  assert.equal(unnamed.getAttribute('title'), null);
  assert.equal(unnamed.getAttribute('data-tot-tooltip'), null);

  const created = harness.api.createIconButton({
    iconName: 'close',
    title: 'Close legacy',
  });
  assert.equal(created.getAttribute('aria-label'), null);
  assert.equal(created.getAttribute('title'), null);
  assert.equal(created.getAttribute('data-tot-tooltip'), null);
});

test('renderer icon helpers apply only an explicitly supplied accessible name', () => {
  const harness = createHarness();
  const button = createElement('button');
  button.setAttribute('aria-describedby', 'close-description');
  button.setAttribute('data-tot-tooltip', 'Visual close hint');

  harness.api.applyIconToElement(button, 'close', { ariaLabel: 'Close dialog' });

  assert.equal(button.getAttribute('aria-label'), 'Close dialog');
  assert.equal(button.getAttribute('aria-describedby'), 'close-description');
  assert.equal(button.getAttribute('data-tot-tooltip'), 'Visual close hint');
  assert.equal(button.getAttribute('title'), null);
});
