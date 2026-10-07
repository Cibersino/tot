'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const languageWindowSource = fs.readFileSync(
  path.resolve(__dirname, '../../../public/language_window.js'),
  'utf8'
);

function createEventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(listener);
    },
    dispatch(type, event = {}) {
      const safeEvent = {
        target: this,
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        ...event,
      };
      (listeners.get(type) || []).slice().forEach((listener) => listener(safeEvent));
      return safeEvent;
    },
  };
}

function createClassList(element) {
  const read = () => new Set(String(element.className || '').split(/\s+/).filter(Boolean));
  const write = (values) => {
    element.className = [...values].join(' ');
  };
  return {
    contains(name) {
      return read().has(name);
    },
    toggle(name, force) {
      const values = read();
      const enabled = force === undefined ? !values.has(name) : Boolean(force);
      if (enabled) values.add(name);
      else values.delete(name);
      write(values);
      return enabled;
    },
  };
}

function createElement(document, tagName = 'div') {
  const element = createEventTarget();
  const attributes = {};
  const children = [];
  let innerHtml = '';

  Object.assign(element, {
    tagName,
    id: '',
    className: '',
    dataset: {},
    value: '',
    textContent: '',
    hidden: false,
    disabled: false,
    parentNode: null,
    children,
    appendChild(child) {
      child.parentNode = this;
      children.push(child);
      return child;
    },
    append(...nextChildren) {
      nextChildren.forEach((child) => this.appendChild(child));
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    querySelectorAll(selector) {
      if (selector !== '.lang-item') return [];
      return children.filter((child) => child.classList.contains('lang-item'));
    },
    closest(selector) {
      let current = this;
      while (current) {
        if (selector === '.lang-item' && current.classList.contains('lang-item')) {
          return current;
        }
        current = current.parentNode;
      }
      return null;
    },
    focus() {
      document.activeElement = this;
    },
  });

  Object.defineProperty(element, 'innerHTML', {
    get() {
      return innerHtml;
    },
    set(value) {
      innerHtml = String(value);
      if (innerHtml === '') {
        children.forEach((child) => {
          child.parentNode = null;
        });
        children.splice(0, children.length);
      }
    },
  });

  element.classList = createClassList(element);
  return element;
}

async function createHarness({
  availableLanguages = [
    { tag: 'ar', label: 'العربية' },
    { tag: 'en', label: 'English' },
    { tag: 'es', label: 'Español' },
  ],
  currentLanguage = 'en',
  availableLanguagesError = null,
  currentLanguageError = null,
  setLanguageError = null,
  currentLanguageApiAvailable = true,
  setLanguageApiAvailable = true,
} = {}) {
  const document = { activeElement: null };
  const elements = new Map();
  const register = (id, tagName = 'div') => {
    const element = createElement(document, tagName);
    element.id = id;
    elements.set(id, element);
    return element;
  };

  const langFilter = register('langFilter', 'input');
  const langList = register('langList');
  langList.className = 'lang-list';
  const statusLine = register('statusLine');
  statusLine.className = 'status';
  const statusNoMatches = register('languageStatusNoMatches', 'span');
  const statusApplying = register('languageStatusApplying', 'span');
  const statusSelectionError = register('languageStatusSelectionError', 'span');
  statusNoMatches.hidden = true;
  statusApplying.hidden = true;
  statusSelectionError.hidden = true;

  document.getElementById = (id) => elements.get(id) || null;
  document.createElement = (tagName) => createElement(document, tagName);

  const warnings = [];
  const errors = [];
  const selectedLanguages = [];
  let closeCount = 0;
  const logger = {
    debug() {},
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
  const languageAPI = {
    async getAvailableLanguages() {
      if (availableLanguagesError) throw availableLanguagesError;
      return availableLanguages;
    },
  };
  if (currentLanguageApiAvailable) {
    languageAPI.getCurrentLanguage = async () => {
      if (currentLanguageError) throw currentLanguageError;
      return currentLanguage;
    };
  }
  if (setLanguageApiAvailable) {
    languageAPI.setLanguage = async (language) => {
      selectedLanguages.push(language);
      if (setLanguageError) throw setLanguageError;
      return { ok: true, language };
    };
  }

  const window = {
    getLogger() {
      return logger;
    },
    languageAPI,
    close() {
      closeCount += 1;
    },
  };

  const sandbox = { window, document, console };
  vm.createContext(sandbox);
  vm.runInContext(languageWindowSource, sandbox, { filename: 'public/language_window.js' });
  await new Promise((resolve) => setImmediate(resolve));

  return {
    document,
    langFilter,
    langList,
    statusLine,
    statusNoMatches,
    statusApplying,
    statusSelectionError,
    warnings,
    errors,
    selectedLanguages,
    getCloseCount() {
      return closeCount;
    },
    async settle() {
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}

function runBootstrapFailureHarness({ failureKind, firstRun }) {
  const document = { activeElement: null };
  const elements = new Map();
  const register = (id, tagName = 'div') => {
    const element = createElement(document, tagName);
    element.id = id;
    elements.set(id, element);
    return element;
  };

  if (failureKind !== 'missingLangFilter') register('langFilter', 'input');
  if (failureKind !== 'missingLangList') register('langList');
  register('statusLine');
  register('languageStatusNoMatches', 'span');
  register('languageStatusApplying', 'span');
  register('languageStatusSelectionError', 'span');
  document.getElementById = (id) => elements.get(id) || null;
  document.createElement = (tagName) => createElement(document, tagName);

  const loggedErrors = [];
  const logger = {
    debug() {},
    error(...args) {
      loggedErrors.push(args);
    },
  };
  let closeCount = 0;
  const window = {
    location: {
      search: firstRun ? '?languageChooserFirstRun=1' : '',
    },
    languageAPI: {},
    close() {
      closeCount += 1;
    },
  };
  if (failureKind === 'throwingLogger') {
    window.getLogger = () => {
      throw new Error('logger unavailable');
    };
  } else if (failureKind !== 'missingLogger') {
    window.getLogger = () => logger;
  }

  const consoleErrors = [];
  const sandbox = {
    window,
    document,
    console: {
      error(...args) {
        consoleErrors.push(args);
      },
    },
  };
  vm.createContext(sandbox);

  let bootstrapError = null;
  try {
    vm.runInContext(languageWindowSource, sandbox, { filename: 'public/language_window.js' });
  } catch (error) {
    bootstrapError = error;
  }

  return { bootstrapError, closeCount, consoleErrors, loggedErrors };
}

test('first-run bootstrap guards close locally without changing later chooser behavior', () => {
  const failureKinds = [
    'missingLogger',
    'throwingLogger',
    'missingLangFilter',
    'missingLangList',
  ];

  failureKinds.forEach((failureKind) => {
    const firstRun = runBootstrapFailureHarness({ failureKind, firstRun: true });
    assert.ok(firstRun.bootstrapError, `${failureKind} should remain fail-fast`);
    assert.equal(
      firstRun.consoleErrors.length + firstRun.loggedErrors.length,
      1,
      `${failureKind} should retain a bootstrap diagnostic`
    );
    assert.equal(firstRun.closeCount, 1, `${failureKind} should close the first-run chooser`);

    const laterOpen = runBootstrapFailureHarness({ failureKind, firstRun: false });
    assert.ok(laterOpen.bootstrapError, `${failureKind} should remain fail-fast`);
    assert.equal(
      laterOpen.consoleErrors.length + laterOpen.loggedErrors.length,
      1,
      `${failureKind} should retain a bootstrap diagnostic`
    );
    assert.equal(laterOpen.closeCount, 0, `${failureKind} must not change F25 behavior`);
  });
});

test('current language selection remains separate from roving keyboard focus', async () => {
  const harness = await createHarness();
  const items = harness.langList.children;

  assert.equal(harness.document.activeElement, harness.langFilter);
  assert.equal(items.length, 3);
  assert.equal(items[1].dataset.tag, 'en');
  assert.equal(items[1].getAttribute('aria-selected'), 'true');
  assert.equal(items[1].getAttribute('tabindex'), '0');
  assert.equal(items[0].getAttribute('aria-selected'), 'false');
  assert.equal(items[1].children[0].getAttribute('lang'), 'en');
  assert.equal(items[1].children[0].getAttribute('dir'), 'auto');
  assert.equal(items[1].children[1].tagName, 'bdi');
  assert.equal(items[1].children[1].getAttribute('dir'), 'ltr');

  harness.langFilter.dispatch('keydown', { key: 'ArrowDown' });
  assert.equal(harness.document.activeElement, items[1]);

  harness.langList.dispatch('keydown', { key: 'ArrowDown', target: items[1] });
  assert.equal(harness.document.activeElement, items[2]);
  assert.equal(items[1].getAttribute('aria-selected'), 'true');
  assert.equal(items[2].getAttribute('aria-selected'), 'false');
  assert.equal(items[2].getAttribute('tabindex'), '0');

  harness.langList.dispatch('keydown', { key: 'Home', target: items[2] });
  assert.equal(harness.document.activeElement, items[0]);
  harness.langList.dispatch('keydown', { key: 'End', target: items[0] });
  assert.equal(harness.document.activeElement, items[2]);
  harness.langList.dispatch('keydown', { key: 'ArrowUp', target: items[2] });
  assert.equal(harness.document.activeElement, items[1]);
  harness.langList.dispatch('keydown', { key: 'End', target: items[1] });
  assert.equal(harness.document.activeElement, items[2]);

  harness.langList.dispatch('keydown', { key: ' ', target: items[2] });
  assert.equal(harness.statusApplying.hidden, false);
  await harness.settle();
  assert.deepEqual(harness.selectedLanguages, ['es']);
  assert.equal(harness.getCloseCount(), 1);
});

test('first run has no selected option and empty filtering uses the external live status', async () => {
  const harness = await createHarness({ currentLanguage: '' });

  assert.equal(
    harness.langList.children.some((item) => item.getAttribute('aria-selected') === 'true'),
    false
  );
  assert.equal(harness.langList.children[0].getAttribute('tabindex'), '0');

  harness.langFilter.value = 'missing-language';
  harness.langFilter.dispatch('input');
  assert.equal(harness.langList.children.length, 0);
  assert.equal(harness.statusNoMatches.hidden, false);

  harness.langFilter.value = '';
  harness.langFilter.dispatch('input');
  assert.equal(harness.langList.children.length, 3);
  assert.equal(harness.statusNoMatches.hidden, true);
});

test('an unavailable persisted tag does not falsely select a different language option', async () => {
  const harness = await createHarness({ currentLanguage: 'es-cl' });

  assert.equal(
    harness.langList.children.some((item) => item.getAttribute('aria-selected') === 'true'),
    false
  );
  assert.equal(harness.langList.children[0].getAttribute('tabindex'), '0');
  assert.equal(harness.warnings.length, 1);
  assert.match(String(harness.warnings[0][0]), /not present in the available list/);
});

test('bootstrap fallbacks stay usable and selection failure shows pre-authored error state', async () => {
  const harness = await createHarness({
    availableLanguagesError: new Error('manifest unavailable'),
    currentLanguageError: new Error('settings unavailable'),
    setLanguageError: new Error('write failed'),
  });

  assert.deepEqual(harness.langList.children.map((item) => item.dataset.tag), ['es', 'en']);
  assert.equal(
    harness.langList.children.some((item) => item.getAttribute('aria-selected') === 'true'),
    false
  );
  assert.equal(harness.warnings.length, 2);

  harness.langFilter.dispatch('keydown', { key: 'ArrowDown' });
  harness.langList.dispatch('keydown', {
    key: 'Enter',
    target: harness.document.activeElement,
  });
  await harness.settle();

  assert.deepEqual(harness.selectedLanguages, ['es']);
  assert.equal(harness.getCloseCount(), 0);
  assert.equal(harness.langFilter.disabled, false);
  assert.equal(harness.langList.getAttribute('aria-disabled'), 'false');
  assert.equal(harness.statusSelectionError.hidden, false);
  assert.equal(harness.statusLine.classList.contains('is-error'), true);
  assert.equal(harness.errors.length, 1);
});

test('missing optional current read and required selection bridge degrade explicitly', async () => {
  const harness = await createHarness({
    currentLanguageApiAvailable: false,
    setLanguageApiAvailable: false,
  });

  assert.equal(
    harness.langList.children.some((item) => item.getAttribute('aria-selected') === 'true'),
    false
  );
  assert.equal(harness.warnings.length, 1);

  harness.langFilter.dispatch('keydown', { key: 'ArrowDown' });
  harness.langList.dispatch('keydown', {
    key: 'Enter',
    target: harness.document.activeElement,
  });

  assert.deepEqual(harness.selectedLanguages, []);
  assert.equal(harness.statusSelectionError.hidden, false);
  assert.equal(harness.statusLine.classList.contains('is-error'), true);
  assert.equal(harness.warnings.length, 2);
});

test('markup owns bilingual semantics without adding a visible filter label or changing layout', () => {
  const html = fs.readFileSync(
    path.resolve(__dirname, '../../../public/language_window.html'),
    'utf8'
  );
  const stylesheet = fs.readFileSync(
    path.resolve(__dirname, '../../../public/language_window.css'),
    'utf8'
  );

  assert.match(html, /<html lang="es">/);
  assert.match(html, /id="lang-title"[^>]*><span lang="es">Seleccione idioma<\/span> \/ <span lang="en">Select language<\/span>/);
  assert.match(html, /id="lang-filter-label"[^>]*class="language-visually-hidden"/);
  assert.match(html, /id="langFilter"[^>]*placeholder="Buscar \/ Search"[\s\S]*?aria-labelledby="lang-filter-label"[^>]*aria-controls="langList"/);
  assert.match(html, /id="langList"[^>]*role="listbox"[\s\S]*?aria-labelledby="lang-list-label"/);
  assert.match(html, /id="statusLine"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"/);
  assert.match(html, /<span lang="es">Sin coincidencias<\/span> \/ <span lang="en">No matches<\/span>/);
  assert.doesNotMatch(html, /<label\b/);
  assert.doesNotMatch(html, /tooltips\.(?:css|js)/);
  assert.doesNotMatch(html, /id="langFilter"[^>]*aria-label=/);
  assert.doesNotMatch(html, /id="langList"[^>]*aria-label=/);
  assert.doesNotMatch(languageWindowSource, /Applying language|Unable to change language|No matches/);

  assert.match(stylesheet, /body\s*{[\s\S]*?padding:\s*16px;/);
  assert.match(stylesheet, /\.center\s*{[\s\S]*?padding:\s*16px;[\s\S]*?gap:\s*12px;/);
  assert.match(stylesheet, /\.langs\s*{[\s\S]*?gap:\s*8px;/);
  assert.match(stylesheet, /\.lang-list\s*{[\s\S]*?height:\s*140px;/);
  assert.match(stylesheet, /\.language-visually-hidden\s*{/);
  assert.doesNotMatch(stylesheet, /\.lang-item\[aria-selected=/);
  assert.doesNotMatch(stylesheet, /\.lang-empty/);
});
