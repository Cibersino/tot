'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHarness() {
  let activeElement = null;
  const windowListeners = new Map();
  const modalOpeners = new Map();

  function createElement(tagName = 'div') {
    const attributes = {};
    const listeners = new Map();
    const children = [];
    const element = {
      tagName,
      className: '',
      dataset: {},
      alt: '',
      src: '',
      currentSrc: '',
      parentNode: null,
      scrollTop: 0,
      get _children() {
        return children;
      },
      appendChild(child) {
        child.parentNode = this;
        children.push(child);
        return child;
      },
      addEventListener(type, handler) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(handler);
      },
      dispatch(type, event = {}) {
        const safeEvent = {
          target: this,
          preventDefault() {},
          stopImmediatePropagation() {},
          ...event,
        };
        (listeners.get(type) || []).forEach((handler) => handler(safeEvent));
      },
      setAttribute(name, value) {
        attributes[name] = String(value);
      },
      getAttribute(name) {
        return Object.prototype.hasOwnProperty.call(attributes, name)
          ? attributes[name]
          : null;
      },
      removeAttribute(name) {
        delete attributes[name];
      },
      contains(candidate) {
        if (candidate === this) return true;
        return children.some((child) => child.contains(candidate));
      },
      closest(selector) {
        let current = this;
        while (current) {
          if (selector === '.instrucciones-media img' && current === screenshot) return current;
          current = current.parentNode;
        }
        return null;
      },
      querySelector(selector) {
        const className = selector.startsWith('.') ? selector.slice(1) : '';
        const pending = children.slice();
        while (pending.length) {
          const candidate = pending.shift();
          if (className && String(candidate.className).split(/\s+/).includes(className)) {
            return candidate;
          }
          pending.push(...candidate._children);
        }
        return null;
      },
      querySelectorAll(selector) {
        return selector === '.instrucciones-media img' ? [screenshot] : [];
      },
      focus() {
        activeElement = this;
      },
    };
    return element;
  }

  const body = createElement('body');
  const infoModal = createElement();
  infoModal.setAttribute('aria-hidden', 'false');
  const container = createElement();
  const screenshot = createElement('img');
  screenshot.currentSrc = './example.png';
  screenshot.alt = 'Example screenshot';
  container.appendChild(screenshot);

  const document = {
    body,
    get activeElement() {
      return activeElement;
    },
    getElementById(id) {
      return id === 'infoModal' ? infoModal : null;
    },
    createElement,
  };

  const window = {
    getLogger() {
      return {
        debug() {},
        info() {},
        warn() {},
        warnOnce() {},
        error() {},
        errorOnce() {},
      };
    },
    RendererIcons: {
      createIconButton({ className = '', title = '', ariaLabel = '' } = {}) {
        const button = createElement('button');
        button.className = className;
        button.title = title;
        button.setAttribute('aria-label', ariaLabel);
        return button;
      },
    },
    Notify: {
      activateModalFocus(modal, { initialFocus }) {
        modalOpeners.set(modal, activeElement);
        initialFocus.focus();
      },
      deactivateModalFocus(modal) {
        const opener = modalOpeners.get(modal);
        modalOpeners.delete(modal);
        if (opener) opener.focus();
      },
      notifyMain() {},
    },
    addEventListener(type, handler) {
      if (!windowListeners.has(type)) windowListeners.set(type, []);
      windowListeners.get(type).push(handler);
    },
  };

  class MutationObserver {
    observe() {}
  }

  const sandbox = {
    window,
    document,
    MutationObserver,
    console,
  };
  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/info_modal_links.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/info_modal_links.js' });

  return {
    body,
    container,
    getActiveElement() {
      return activeElement;
    },
    screenshot,
    bind() {
      window.InfoModalLinks.bindInfoModalLinks(container);
    },
    pressEscape() {
      const event = {
        key: 'Escape',
        preventDefault() {},
        stopImmediatePropagation() {},
      };
      (windowListeners.get('keydown') || []).forEach((handler) => handler(event));
    },
  };
}

test('Info screenshot lightbox is keyboard-openable, focuses Close, and restores its screenshot opener', () => {
  const harness = createHarness();
  harness.bind();

  assert.equal(harness.screenshot.getAttribute('tabindex'), '0');
  assert.equal(harness.screenshot.getAttribute('role'), 'button');
  assert.equal(harness.screenshot.getAttribute('aria-haspopup'), 'dialog');

  harness.container.dispatch('keydown', {
    key: 'Enter',
    target: harness.screenshot,
    preventDefault() {},
  });

  const lightbox = harness.body._children[0];
  const closeButton = lightbox.querySelector('.info-media-lightbox-close');
  assert.equal(lightbox.getAttribute('aria-hidden'), 'false');
  assert.equal(harness.getActiveElement(), closeButton);

  harness.pressEscape();
  assert.equal(lightbox.getAttribute('aria-hidden'), 'true');
  assert.equal(harness.getActiveElement(), harness.screenshot);
});
