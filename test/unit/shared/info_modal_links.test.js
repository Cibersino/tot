'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createHarness() {
  let activeElement = null;
  let screenshots = [];
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
      getListenerCount(type) {
        return (listeners.get(type) || []).length;
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
          if (selector === '.instrucciones-media img' && screenshots.includes(current)) return current;
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
        return selector === '.instrucciones-media img' ? screenshots.slice() : [];
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
  const createScreenshot = () => {
    const screenshot = createElement('img');
    screenshot.currentSrc = './example.png';
    screenshot.alt = 'Example screenshot';
    return screenshot;
  };
  screenshots = [createScreenshot()];
  container.appendChild(screenshots[0]);

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
      createIconButton({ className = '', ariaLabel = '' } = {}) {
        const button = createElement('button');
        button.className = className;
        button.setAttribute('aria-label', ariaLabel);
        return button;
      },
    },
    RendererI18n: {
      tRenderer(key) {
        const translations = {
          'renderer.info.media_lightbox.title': 'Expanded screenshot',
          'renderer.info.media_lightbox.close_aria': 'Close expanded screenshot',
        };
        return translations[key] || key;
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
    getScreenshot() {
      return screenshots[0];
    },
    replaceScreenshot() {
      const replacement = createScreenshot();
      container._children.splice(0, container._children.length, replacement);
      replacement.parentNode = container;
      screenshots = [replacement];
      return replacement;
    },
    enhance() {
      window.InfoModalLinks.enhanceInfoModalScreenshots(container);
    },
    bind() {
      window.InfoModalLinks.bindInfoModalLinks(container);
    },
    getContainerListenerCount(type) {
      return container.getListenerCount(type);
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

test('Info screenshot enhancements survive content replacement without duplicating delegated listeners', () => {
  const harness = createHarness();
  const firstScreenshot = harness.getScreenshot();
  harness.enhance();
  harness.bind();

  assert.equal(firstScreenshot.getAttribute('tabindex'), '0');
  assert.equal(firstScreenshot.getAttribute('role'), 'button');
  assert.equal(firstScreenshot.getAttribute('aria-haspopup'), 'dialog');

  harness.bind();
  assert.equal(harness.getContainerListenerCount('click'), 1);
  assert.equal(harness.getContainerListenerCount('keydown'), 1);

  harness.container.dispatch('keydown', {
    key: 'Enter',
    target: firstScreenshot,
    preventDefault() {},
  });

  const lightbox = harness.body._children[0];
  const panel = lightbox.querySelector('.info-media-lightbox-panel');
  const closeButton = lightbox.querySelector('.info-media-lightbox-close');
  assert.equal(lightbox.getAttribute('aria-hidden'), 'false');
  assert.equal(panel.getAttribute('aria-label'), 'Expanded screenshot');
  assert.equal(closeButton.getAttribute('aria-label'), 'Close expanded screenshot');
  assert.equal(closeButton.getAttribute('data-tot-tooltip'), null);
  assert.equal(harness.getActiveElement(), closeButton);

  harness.pressEscape();
  assert.equal(lightbox.getAttribute('aria-hidden'), 'true');
  assert.equal(harness.getActiveElement(), firstScreenshot);

  const replacementScreenshot = harness.replaceScreenshot();
  harness.enhance();
  harness.bind();

  assert.equal(replacementScreenshot.getAttribute('tabindex'), '0');
  assert.equal(replacementScreenshot.getAttribute('role'), 'button');
  assert.equal(replacementScreenshot.getAttribute('aria-haspopup'), 'dialog');
  assert.equal(harness.getContainerListenerCount('click'), 1);
  assert.equal(harness.getContainerListenerCount('keydown'), 1);

  harness.container.dispatch('keydown', {
    key: ' ',
    target: replacementScreenshot,
    preventDefault() {},
  });

  assert.equal(lightbox.getAttribute('aria-hidden'), 'false');
  assert.equal(harness.getActiveElement(), closeButton);

  harness.pressEscape();
  assert.equal(lightbox.getAttribute('aria-hidden'), 'true');
  assert.equal(harness.getActiveElement(), replacementScreenshot);
});
