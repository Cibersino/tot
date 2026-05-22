'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let activeElementRef = null;

function escapeHtml(rawValue) {
  return String(rawValue || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function matchesAttributeSelector(element, selector) {
  const match = /^\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]$/.exec(selector);
  if (!match) return false;
  const [, attributeName, expectedValue] = match;
  const actualValue = element.getAttribute(attributeName);
  if (actualValue === null) return false;
  return expectedValue === undefined || actualValue === expectedValue;
}

function serializeAttributes(element) {
  const attributes = [];
  if (element.id) {
    attributes.push(`id="${escapeHtml(element.id)}"`);
  }
  if (element.className) {
    attributes.push(`class="${escapeHtml(element.className)}"`);
  }
  if (element.type) {
    attributes.push(`type="${escapeHtml(element.type)}"`);
  }
  if (element.name) {
    attributes.push(`name="${escapeHtml(element.name)}"`);
  }
  if (element.value !== '') {
    attributes.push(`value="${escapeHtml(element.value)}"`);
  }
  if (element.checked) {
    attributes.push('checked');
  }
  if (element.selected) {
    attributes.push('selected');
  }
  if (element.disabled) {
    attributes.push('disabled');
  }
  if (element.hidden) {
    attributes.push('hidden');
  }
  if (element.title) {
    attributes.push(`title="${escapeHtml(element.title)}"`);
  }
  Object.entries(element._attributes).forEach(([name, value]) => {
    if (name === 'id' || name === 'class') return;
    attributes.push(`${name}="${escapeHtml(value)}"`);
  });
  return attributes.length ? ` ${attributes.join(' ')}` : '';
}

function serializeNode(element) {
  const tagName = String(element.tagName || 'div').toLowerCase();
  const attributes = serializeAttributes(element);
  const childrenHtml = element._children.map((child) => serializeNode(child)).join('');
  const textHtml = childrenHtml ? '' : escapeHtml(element._textContent);
  if (tagName === 'input') {
    return `<input${attributes}>`;
  }
  return `<${tagName}${attributes}>${childrenHtml || textHtml}</${tagName}>`;
}

function createElement(id, tagName = 'div') {
  let textContent = '';
  let manualInnerHtml = null;
  const listeners = new Map();
  const attributes = {};
  const children = [];

  return {
    id,
    tagName,
    hidden: false,
    disabled: false,
    checked: false,
    selected: false,
    value: '',
    title: '',
    type: '',
    name: '',
    className: '',
    scrollTop: 0,
    selectionStart: null,
    selectionEnd: null,
    parentNode: null,
    _attributes: attributes,
    _children: children,
    _textContent: '',
    get children() {
      return children;
    },
    get textContent() {
      if (children.length) {
        return children.map((child) => child.textContent).join('');
      }
      return textContent;
    },
    set textContent(value) {
      textContent = String(value);
      manualInnerHtml = null;
      children.splice(0, children.length);
      this._textContent = textContent;
    },
    get innerHTML() {
      if (manualInnerHtml !== null) {
        return manualInnerHtml;
      }
      if (children.length) {
        return children.map((child) => serializeNode(child)).join('');
      }
      return escapeHtml(textContent);
    },
    set innerHTML(value) {
      manualInnerHtml = String(value);
      textContent = '';
      this._textContent = '';
      children.splice(0, children.length);
    },
    appendChild(child) {
      if (!child) return child;
      manualInnerHtml = null;
      textContent = '';
      this._textContent = '';
      child.parentNode = this;
      children.push(child);
      return child;
    },
    replaceChildren(...nextChildren) {
      manualInnerHtml = null;
      textContent = '';
      this._textContent = '';
      children.splice(0, children.length);
      nextChildren.forEach((child) => {
        if (!child) return;
        child.parentNode = this;
        children.push(child);
      });
    },
    addEventListener(type, handler) {
      if (!listeners.has(type)) {
        listeners.set(type, []);
      }
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      if (!listeners.has(type)) return;
      listeners.set(type, listeners.get(type).filter((candidate) => candidate !== handler));
    },
    dispatch(type, event = {}) {
      const handlers = listeners.get(type) || [];
      handlers.forEach((handler) => handler(event));
    },
    setAttribute(name, value) {
      attributes[name] = String(value);
      if (name === 'id') {
        this.id = String(value);
      }
      if (name === 'class') {
        this.className = String(value);
      }
    },
    getAttribute(name) {
      if (name === 'id' && this.id) return this.id;
      if (name === 'class' && this.className) return this.className;
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    closest(selector) {
      let current = this;
      while (current) {
        if (matchesAttributeSelector(current, selector)) {
          return current;
        }
        current = current.parentNode;
      }
      return null;
    },
    focus() {
      activeElementRef = this;
    },
    setSelectionRange(start, end) {
      this.selectionStart = start;
      this.selectionEnd = end;
    },
  };
}

function createEventTarget(attributes, extra = {}) {
  return {
    closest() {
      return this;
    },
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null;
    },
    ...extra,
  };
}

function findNodeByAttribute(node, attributeName, expectedValue) {
  if (!node) return null;
  if (typeof node.getAttribute === 'function' && node.getAttribute(attributeName) === expectedValue) {
    return node;
  }
  const children = Array.isArray(node._children) ? node._children : [];
  for (const child of children) {
    const match = findNodeByAttribute(child, attributeName, expectedValue);
    if (match) return match;
  }
  return null;
}

function findNodeByAttributes(node, expectedAttributes = {}) {
  if (!node) return null;
  if (typeof node.getAttribute === 'function') {
    const matches = Object.entries(expectedAttributes).every(([name, value]) => node.getAttribute(name) === value);
    if (matches) {
      return node;
    }
  }
  const children = Array.isArray(node._children) ? node._children : [];
  for (const child of children) {
    const match = findNodeByAttributes(child, expectedAttributes);
    if (match) return match;
  }
  return null;
}

function createHarness() {
  activeElementRef = null;
  const elements = {
    outsideLauncher: createElement('outsideLauncher'),
    textExtractionBatchPlanModal: createElement('textExtractionBatchPlanModal'),
    textExtractionBatchPlanModalBackdrop: createElement('textExtractionBatchPlanModalBackdrop'),
    textExtractionBatchPlanModalPanel: createElement('textExtractionBatchPlanModalPanel'),
    textExtractionBatchPlanModalTitle: createElement('textExtractionBatchPlanModalTitle'),
    textExtractionBatchPlanUnits: createElement('textExtractionBatchPlanUnits'),
    textExtractionBatchPlanPresetAll: createElement('textExtractionBatchPlanPresetAll'),
    textExtractionBatchPlanPresetSeparate: createElement('textExtractionBatchPlanPresetSeparate'),
    textExtractionBatchPlanFailureLegend: createElement('textExtractionBatchPlanFailureLegend'),
    textExtractionBatchPlanFailureDefault: createElement('textExtractionBatchPlanFailureDefault'),
    textExtractionBatchPlanFailureContinue: createElement('textExtractionBatchPlanFailureContinue'),
    textExtractionBatchPlanFailureDefaultLabel: createElement('textExtractionBatchPlanFailureDefaultLabel'),
    textExtractionBatchPlanFailureContinueLabel: createElement('textExtractionBatchPlanFailureContinueLabel'),
    textExtractionBatchPlanStart: createElement('textExtractionBatchPlanStart'),
    textExtractionBatchPlanCancel: createElement('textExtractionBatchPlanCancel'),
    textExtractionBatchPlanClose: createElement('textExtractionBatchPlanClose'),
  };

  const windowListeners = new Map();
  const translations = {
    'renderer.text_extraction.batch_plan.title': 'Plan batch extraction',
    'renderer.text_extraction.batch_plan.single_file_title': 'Plan automatic PDF split',
    'renderer.text_extraction.batch_plan.preset_all': 'All together',
    'renderer.text_extraction.batch_plan.preset_separate': 'One file per unit',
    'renderer.text_extraction.batch_plan.failure_default': 'Close unit after last success',
    'renderer.text_extraction.batch_plan.failure_continue': 'Continue inside unit',
    'renderer.text_extraction.batch_plan.start_button': 'Start extraction',
    'renderer.text_extraction.batch_plan.cancel_button': 'Cancel',
    'renderer.text_extraction.batch_plan.close_aria': 'Close batch planning',
    'renderer.text_extraction.batch_plan.move_up': 'Move up',
    'renderer.text_extraction.batch_plan.move_down': 'Move down',
    'renderer.text_extraction.batch_plan.remove_input': 'Remove',
    'renderer.text_extraction.batch_plan.keep_generated_pdf': 'Keep generated PDF',
    'renderer.text_extraction.batch_plan.edit_tags': 'Tags',
    'renderer.text_extraction.batch_plan.new_unit_option': 'Create new unit',
    'renderer.text_extraction.batch_plan.unit_label': 'Unit {index}',
    'renderer.text_extraction.batch_plan.unit_counter': 'Unit {index}/{count}',
    'renderer.text_extraction.batch_plan.unit_name_placeholder': 'Optional unit name',
    'renderer.text_extraction.batch_plan.single_unit_no_snapshot': 'Single unit',
    'renderer.text_extraction.batch_plan.generated_inputs_preview': 'Planned generated PDFs',
    'renderer.text_extraction.batch_plan.failure_legend': 'Failure behavior',
    'renderer.text_extraction.batch_plan.pages_all': 'All pages',
    'renderer.text_extraction.pdf_options.all_pages_label': 'All pages',
    'renderer.text_extraction.pdf_options.range_label': 'Page range',
    'renderer.text_extraction.pdf_options.from_page_label': 'From page',
    'renderer.text_extraction.pdf_options.to_page_label': 'To page',
    'renderer.text_extraction.pdf_options.selected_page_count_label': 'Selected pages: ',
    'renderer.text_extraction.pdf_options.invalid_range': 'Enter a contiguous page range between 1 and {totalPages}.',
  };

  function toPositiveIntegerOrNull(rawValue) {
    const value = Number(rawValue);
    if (!Number.isInteger(value) || value < 1) return null;
    return value;
  }

  function buildAllPagesSelection(totalPages) {
    const safeTotalPages = toPositiveIntegerOrNull(totalPages) || 1;
    return {
      mode: 'all',
      fromPage: 1,
      toPage: safeTotalPages,
      selectedPageCount: safeTotalPages,
      totalPages: safeTotalPages,
    };
  }

  function canonicalizePageSelection(selection, totalPages) {
    const safeTotalPages = toPositiveIntegerOrNull(totalPages) || 1;
    if (!selection || selection.mode !== 'range') {
      return buildAllPagesSelection(safeTotalPages);
    }
    const fromPage = toPositiveIntegerOrNull(selection.fromPage);
    const toPage = toPositiveIntegerOrNull(selection.toPage);
    if (!fromPage || !toPage || fromPage > toPage || toPage > safeTotalPages) {
      return null;
    }
    return {
      mode: 'range',
      fromPage,
      toPage,
      selectedPageCount: (toPage - fromPage) + 1,
      totalPages: safeTotalPages,
    };
  }

  const sandbox = {
    window: {
      Notify: {},
      getLogger() {
        return {
          debug() {},
          info() {},
          warn() {},
          warnOnce() {},
          error() {},
        };
      },
      RendererI18n: {
        tRenderer(key) {
          return translations[key] || key;
        },
      },
      TextExtractionPdfPageSelection: {
        buildAllPagesSelection,
        buildPageSelectionDraft({ pdfPageSelection = null, totalPages } = {}) {
          const safeTotalPages = toPositiveIntegerOrNull(totalPages)
            || toPositiveIntegerOrNull(pdfPageSelection && pdfPageSelection.totalPages)
            || 1;
          const canonicalSelection = canonicalizePageSelection(pdfPageSelection, safeTotalPages);
          if (canonicalSelection && canonicalSelection.mode === 'range') {
            return {
              mode: 'range',
              fromPage: String(canonicalSelection.fromPage),
              toPage: String(canonicalSelection.toPage),
              totalPages: safeTotalPages,
            };
          }
          return {
            mode: 'all',
            fromPage: '1',
            toPage: String(safeTotalPages),
            totalPages: safeTotalPages,
          };
        },
        getPageSelectionUiState(pageSelectionDraft) {
          const safeDraft = pageSelectionDraft && typeof pageSelectionDraft === 'object' ? pageSelectionDraft : {};
          const totalPages = toPositiveIntegerOrNull(safeDraft.totalPages) || 1;
          const draftMode = typeof safeDraft.mode === 'string' ? safeDraft.mode.trim().toLowerCase() : 'all';
          if (draftMode !== 'range') {
            const allPagesSelection = buildAllPagesSelection(totalPages);
            return {
              showRange: false,
              isValid: true,
              submitDisabled: false,
              selectedCountText: '',
              validationText: '',
              invalidInputKey: '',
              selectedPageCount: allPagesSelection.selectedPageCount,
              totalPages,
              pdfPageSelection: allPagesSelection,
            };
          }

          const canonicalSelection = canonicalizePageSelection({
            mode: 'range',
            fromPage: safeDraft.fromPage,
            toPage: safeDraft.toPage,
          }, totalPages);
          if (!canonicalSelection) {
            const fromPage = toPositiveIntegerOrNull(safeDraft.fromPage);
            const toPage = toPositiveIntegerOrNull(safeDraft.toPage);
            return {
              showRange: true,
              isValid: false,
              submitDisabled: true,
              selectedCountText: '',
              validationText: translations['renderer.text_extraction.pdf_options.invalid_range']
                .replace('{totalPages}', String(totalPages)),
              invalidInputKey: !fromPage
                ? 'fromPage'
                : ((!toPage || fromPage > toPage || toPage > totalPages) ? 'toPage' : ''),
              selectedPageCount: 0,
              totalPages,
              pdfPageSelection: null,
            };
          }
          return {
            showRange: true,
            isValid: true,
            submitDisabled: false,
            selectedCountText: `${translations['renderer.text_extraction.pdf_options.selected_page_count_label']}${canonicalSelection.selectedPageCount}`,
            validationText: '',
            invalidInputKey: '',
            selectedPageCount: canonicalSelection.selectedPageCount,
            totalPages,
            pdfPageSelection: canonicalSelection,
          };
        },
      },
      addEventListener(type, handler) {
        if (!windowListeners.has(type)) {
          windowListeners.set(type, []);
        }
        windowListeners.get(type).push(handler);
      },
      removeEventListener(type, handler) {
        if (!windowListeners.has(type)) return;
        windowListeners.set(type, windowListeners.get(type).filter((candidate) => candidate !== handler));
      },
    },
    document: {
      get activeElement() {
        return activeElementRef;
      },
      getElementById(id) {
        return elements[id] || null;
      },
      createElement(tagName) {
        return createElement('', tagName);
      },
    },
    console,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../../public/js/text_extraction_batch_planning_modal.js'),
    'utf8'
  );
  vm.runInContext(source, sandbox, { filename: 'public/js/text_extraction_batch_planning_modal.js' });

  return {
    elements,
    getActiveElement() {
      return activeElementRef;
    },
    prompt: sandbox.window.Notify.promptTextExtractionBatchPlan,
  };
}

test('batch planning modal exposes direct all-pages and range controls for ordinary PDFs', async () => {
  const harness = createHarness();
  const applyActionCalls = [];

  const model = {
    flowKind: 'batch',
    failurePolicy: 'finish_unit_after_last_success',
    startDisabled: false,
    unitCount: 1,
    units: [
      {
        unitKey: 'unit-1',
        title: 'unit_1',
        tagsSummary: 'No tags',
        exclusiveHeavy: false,
        canConfigureTags: false,
        canMoveUp: false,
        canMoveDown: false,
        generatedInputsPreview: [],
        inputs: [
          {
            inputId: 'input-1',
            fileName: 'sample.pdf',
            alertCode: '',
            activeRoute: 'native',
            routeOptions: ['native'],
            pagesSummary: '',
            canEditPages: true,
            pdfPageSelection: {
              mode: 'all',
              fromPage: 1,
              toPage: 12,
              selectedPageCount: 12,
              totalPages: 12,
            },
            pdfTotalPages: 12,
            canToggleKeep: false,
            keepGeneratedPdf: false,
            groupKey: 'unit-1',
            canMoveUp: false,
            canMoveDown: false,
            groupOptions: [
              {
                unitKey: 'unit-1',
                label: 'unit_1',
              },
            ],
            heavySplitActive: false,
          },
        ],
      },
    ],
  };

  const controller = {
    getViewModel() {
      return model;
    },
    applyAction(action) {
      applyActionCalls.push(action);
      if (action.type !== 'set_pdf_page_selection') return;
      const input = model.units[0].inputs[0];
      if (action.pdfPageSelection.mode === 'all') {
        input.pdfPageSelection = {
          mode: 'all',
          fromPage: 1,
          toPage: 12,
          selectedPageCount: 12,
          totalPages: 12,
        };
        input.canToggleKeep = false;
        return;
      }
      input.pdfPageSelection = {
        mode: 'range',
        fromPage: action.pdfPageSelection.fromPage,
        toPage: action.pdfPageSelection.toPage,
        selectedPageCount: (action.pdfPageSelection.toPage - action.pdfPageSelection.fromPage) + 1,
        totalPages: 12,
      };
      input.canToggleKeep = true;
    },
  };

  const promptPromise = harness.prompt({ controller });

  assert.doesNotMatch(
    harness.elements.textExtractionBatchPlanUnits.innerHTML,
    /edit-pages/
  );
  assert.match(
    harness.elements.textExtractionBatchPlanUnits.innerHTML,
    /data-action="set-page-mode"/
  );
  assert.match(
    harness.elements.textExtractionBatchPlanUnits.innerHTML,
    /All pages/
  );
  assert.match(
    harness.elements.textExtractionBatchPlanUnits.innerHTML,
    /Page range/
  );
  assert.doesNotMatch(
    harness.elements.textExtractionBatchPlanUnits.innerHTML,
    /Keep generated PDF/
  );
  assert.equal(
    harness.elements.textExtractionBatchPlanFailureLegend.textContent,
    'Failure behavior'
  );

  harness.elements.textExtractionBatchPlanUnits.dispatch('change', {
    target: createEventTarget(
      {
        'data-action': 'set-page-mode',
        'data-input-id': 'input-1',
      },
      { value: 'range' }
    ),
  });

  assert.match(
    harness.elements.textExtractionBatchPlanUnits.innerHTML,
    /data-action="set-page-from"/
  );
  assert.match(
    harness.elements.textExtractionBatchPlanUnits.innerHTML,
    /data-action="set-page-to"/
  );
  assert.match(
    harness.elements.textExtractionBatchPlanUnits.innerHTML,
    /Keep generated PDF/
  );

  harness.elements.textExtractionBatchPlanUnits.dispatch('input', {
    target: createEventTarget(
      {
        'data-action': 'set-page-from',
        'data-input-id': 'input-1',
      },
      { value: '4' }
    ),
  });
  harness.elements.textExtractionBatchPlanUnits.dispatch('input', {
    target: createEventTarget(
      {
        'data-action': 'set-page-to',
        'data-input-id': 'input-1',
      },
      { value: '6' }
    ),
  });

  assert.match(
    harness.elements.textExtractionBatchPlanUnits.innerHTML,
    /Selected pages:\s*3/
  );

  const pageSelectionActions = applyActionCalls.filter((action) => action.type === 'set_pdf_page_selection');
  assert.deepEqual(
    JSON.parse(JSON.stringify(pageSelectionActions[pageSelectionActions.length - 1])),
    {
      type: 'set_pdf_page_selection',
      inputId: 'input-1',
      pdfPageSelection: {
        mode: 'range',
        fromPage: 4,
        toPage: 6,
        selectedPageCount: 3,
        totalPages: 12,
      },
    }
  );

  harness.elements.textExtractionBatchPlanUnits.dispatch('change', {
    target: createEventTarget(
      {
        'data-action': 'set-page-mode',
        'data-input-id': 'input-1',
      },
      { value: 'all' }
    ),
  });
  assert.doesNotMatch(
    harness.elements.textExtractionBatchPlanUnits.innerHTML,
    /Keep generated PDF/
  );

  harness.elements.textExtractionBatchPlanCancel.dispatch('click');
  const result = await promptPromise;
  assert.equal(result, null);
});

test('batch planning modal shows keep control when page inputs auto-promote selection to range', async () => {
  const harness = createHarness();
  const applyActionCalls = [];

  const model = {
    flowKind: 'batch',
    failurePolicy: 'finish_unit_after_last_success',
    startDisabled: false,
    unitCount: 1,
    units: [
      {
        unitKey: 'unit-1',
        title: 'unit_1',
        tagsSummary: 'No tags',
        exclusiveHeavy: false,
        canConfigureTags: false,
        canMoveUp: false,
        canMoveDown: false,
        generatedInputsPreview: [],
        inputs: [
          {
            inputId: 'input-1',
            fileName: 'sample.pdf',
            alertCode: '',
            activeRoute: 'native',
            routeOptions: ['native'],
            pagesSummary: '',
            canEditPages: true,
            pdfPageSelection: {
              mode: 'all',
              fromPage: 1,
              toPage: 12,
              selectedPageCount: 12,
              totalPages: 12,
            },
            pdfTotalPages: 12,
            canToggleKeep: false,
            keepGeneratedPdf: false,
            groupKey: 'unit-1',
            canMoveUp: false,
            canMoveDown: false,
            groupOptions: [
              {
                unitKey: 'unit-1',
                label: 'unit_1',
              },
            ],
            heavySplitActive: false,
          },
        ],
      },
    ],
  };

  const controller = {
    getViewModel() {
      return model;
    },
    applyAction(action) {
      applyActionCalls.push(action);
      if (action.type !== 'set_pdf_page_selection') return;
      const input = model.units[0].inputs[0];
      if (action.pdfPageSelection.mode === 'all') {
        input.pdfPageSelection = {
          mode: 'all',
          fromPage: 1,
          toPage: 12,
          selectedPageCount: 12,
          totalPages: 12,
        };
        input.canToggleKeep = false;
        return;
      }
      input.pdfPageSelection = {
        mode: 'range',
        fromPage: action.pdfPageSelection.fromPage,
        toPage: action.pdfPageSelection.toPage,
        selectedPageCount: (action.pdfPageSelection.toPage - action.pdfPageSelection.fromPage) + 1,
        totalPages: 12,
      };
      input.canToggleKeep = true;
    },
  };

  const promptPromise = harness.prompt({ controller });

  assert.doesNotMatch(
    harness.elements.textExtractionBatchPlanUnits.innerHTML,
    /Keep generated PDF/
  );

  harness.elements.textExtractionBatchPlanUnits.dispatch('input', {
    target: createEventTarget(
      {
        'data-action': 'set-page-from',
        'data-input-id': 'input-1',
      },
      { value: '4' }
    ),
  });

  assert.match(
    harness.elements.textExtractionBatchPlanUnits.innerHTML,
    /Keep generated PDF/
  );

  const pageSelectionActions = applyActionCalls.filter((action) => action.type === 'set_pdf_page_selection');
  assert.deepEqual(
    JSON.parse(JSON.stringify(pageSelectionActions[pageSelectionActions.length - 1])),
    {
      type: 'set_pdf_page_selection',
      inputId: 'input-1',
      pdfPageSelection: {
        mode: 'range',
        fromPage: 4,
        toPage: 12,
        selectedPageCount: 9,
        totalPages: 12,
      },
    }
  );

  harness.elements.textExtractionBatchPlanCancel.dispatch('click');
  const result = await promptPromise;
  assert.equal(result, null);
});

test('batch planning modal preserves typed invalid to-page drafts while editing', async () => {
  const harness = createHarness();
  const applyActionCalls = [];

  const model = {
    flowKind: 'batch',
    failurePolicy: 'finish_unit_after_last_success',
    startDisabled: false,
    unitCount: 1,
    units: [
      {
        unitKey: 'unit-1',
        title: 'unit_1',
        tagsSummary: 'No tags',
        exclusiveHeavy: false,
        canConfigureTags: false,
        canMoveUp: false,
        canMoveDown: false,
        generatedInputsPreview: [],
        inputs: [
          {
            inputId: 'input-1',
            fileName: 'sample.pdf',
            alertCode: '',
            activeRoute: 'native',
            routeOptions: ['native'],
            pagesSummary: '',
            canEditPages: true,
            pdfPageSelection: {
              mode: 'range',
              fromPage: 10,
              toPage: 12,
              selectedPageCount: 3,
              totalPages: 12,
            },
            pdfTotalPages: 12,
            canToggleKeep: true,
            keepGeneratedPdf: false,
            groupKey: 'unit-1',
            canMoveUp: false,
            canMoveDown: false,
            groupOptions: [
              {
                unitKey: 'unit-1',
                label: 'unit_1',
              },
            ],
            heavySplitActive: false,
          },
        ],
      },
    ],
  };

  const controller = {
    getViewModel() {
      return model;
    },
    applyAction(action) {
      applyActionCalls.push(action);
      if (action.type !== 'set_pdf_page_selection') return;
      const input = model.units[0].inputs[0];
      input.pdfPageSelection = {
        mode: 'range',
        fromPage: action.pdfPageSelection.fromPage,
        toPage: action.pdfPageSelection.toPage,
        selectedPageCount: (action.pdfPageSelection.toPage - action.pdfPageSelection.fromPage) + 1,
        totalPages: 12,
      };
      input.canToggleKeep = true;
    },
  };

  const promptPromise = harness.prompt({ controller });

  const toInput = findNodeByAttribute(
    harness.elements.textExtractionBatchPlanUnits,
    'data-action',
    'set-page-to'
  );
  assert.ok(toInput);
  toInput.value = '';
  harness.elements.textExtractionBatchPlanUnits.dispatch('input', { target: toInput });
  assert.equal(toInput.value, '');
  assert.match(
    harness.elements.textExtractionBatchPlanUnits.innerHTML,
    /Enter a contiguous page range between 1 and 12\./
  );

  const pageSelectionActions = applyActionCalls.filter((action) => action.type === 'set_pdf_page_selection');
  assert.equal(pageSelectionActions.length, 0);

  harness.elements.textExtractionBatchPlanCancel.dispatch('click');
  const result = await promptPromise;
  assert.equal(result, null);
});

test('batch planning modal blocks start while a visible page-range draft is invalid', async () => {
  const harness = createHarness();
  const applyActionCalls = [];

  const model = {
    flowKind: 'batch',
    failurePolicy: 'finish_unit_after_last_success',
    startDisabled: false,
    unitCount: 1,
    units: [
      {
        unitKey: 'unit-1',
        title: 'unit_1',
        tagsSummary: 'No tags',
        exclusiveHeavy: false,
        canConfigureTags: false,
        canMoveUp: false,
        canMoveDown: false,
        generatedInputsPreview: [],
        inputs: [
          {
            inputId: 'input-1',
            fileName: 'sample.pdf',
            alertCode: '',
            activeRoute: 'native',
            routeOptions: ['native'],
            pagesSummary: '',
            canEditPages: true,
            pdfPageSelection: {
              mode: 'range',
              fromPage: 10,
              toPage: 12,
              selectedPageCount: 3,
              totalPages: 12,
            },
            pdfTotalPages: 12,
            canToggleKeep: true,
            keepGeneratedPdf: false,
            groupKey: 'unit-1',
            canMoveUp: false,
            canMoveDown: false,
            groupOptions: [
              {
                unitKey: 'unit-1',
                label: 'unit_1',
              },
            ],
            heavySplitActive: false,
          },
        ],
      },
    ],
  };

  const controller = {
    getViewModel() {
      return model;
    },
    applyAction(action) {
      applyActionCalls.push(action);
      if (action.type !== 'set_pdf_page_selection') return;
      const input = model.units[0].inputs[0];
      input.pdfPageSelection = {
        mode: 'range',
        fromPage: action.pdfPageSelection.fromPage,
        toPage: action.pdfPageSelection.toPage,
        selectedPageCount: (action.pdfPageSelection.toPage - action.pdfPageSelection.fromPage) + 1,
        totalPages: 12,
      };
      input.canToggleKeep = true;
    },
  };

  const promptPromise = harness.prompt({ controller });

  const toInput = findNodeByAttribute(
    harness.elements.textExtractionBatchPlanUnits,
    'data-action',
    'set-page-to'
  );
  assert.ok(toInput);

  toInput.value = '';
  harness.elements.textExtractionBatchPlanUnits.dispatch('input', { target: toInput });

  assert.equal(harness.elements.textExtractionBatchPlanStart.disabled, true);
  harness.elements.textExtractionBatchPlanStart.dispatch('click');
  assert.equal(
    harness.elements.textExtractionBatchPlanModal.getAttribute('aria-hidden'),
    'false'
  );

  toInput.value = '11';
  harness.elements.textExtractionBatchPlanUnits.dispatch('input', { target: toInput });

  assert.equal(harness.elements.textExtractionBatchPlanStart.disabled, false);
  harness.elements.textExtractionBatchPlanStart.dispatch('click');
  const result = await promptPromise;
  assert.deepEqual(
    JSON.parse(JSON.stringify(result)),
    { action: 'start' }
  );

  const pageSelectionActions = applyActionCalls.filter((action) => action.type === 'set_pdf_page_selection');
  assert.deepEqual(
    JSON.parse(JSON.stringify(pageSelectionActions[pageSelectionActions.length - 1])),
    {
      type: 'set_pdf_page_selection',
      inputId: 'input-1',
      pdfPageSelection: {
        mode: 'range',
        fromPage: 10,
        toPage: 11,
        selectedPageCount: 2,
        totalPages: 12,
      },
    }
  );
});

test('batch planning modal preserves panel scroll and control focus across rerenders', async () => {
  const harness = createHarness();

  const model = {
    flowKind: 'batch',
    failurePolicy: 'finish_unit_after_last_success',
    startDisabled: false,
    unitCount: 2,
    units: [
      {
        unitKey: 'unit-1',
        title: 'unit_1',
        tagsSummary: 'No tags',
        exclusiveHeavy: false,
        canConfigureTags: true,
        canMoveUp: false,
        canMoveDown: true,
        generatedInputsPreview: [],
        inputs: [
          {
            inputId: 'input-1',
            fileName: 'sample-a.pdf',
            alertCode: '',
            activeRoute: 'native',
            routeOptions: ['native'],
            pagesSummary: '',
            canEditPages: true,
            pdfPageSelection: {
              mode: 'all',
              fromPage: 1,
              toPage: 12,
              selectedPageCount: 12,
              totalPages: 12,
            },
            pdfTotalPages: 12,
            canToggleKeep: false,
            keepGeneratedPdf: false,
            groupKey: 'unit-1',
            canMoveUp: false,
            canMoveDown: false,
            groupOptions: [
              { unitKey: 'unit-1', label: 'unit_1' },
              { unitKey: 'unit-2', label: 'unit_2' },
            ],
            heavySplitActive: false,
          },
        ],
      },
      {
        unitKey: 'unit-2',
        title: 'unit_2',
        tagsSummary: 'No tags',
        exclusiveHeavy: false,
        canConfigureTags: true,
        canMoveUp: true,
        canMoveDown: false,
        generatedInputsPreview: [],
        inputs: [
          {
            inputId: 'input-2',
            fileName: 'sample-b.pdf',
            alertCode: '',
            activeRoute: 'native',
            routeOptions: ['native'],
            pagesSummary: '',
            canEditPages: true,
            pdfPageSelection: {
              mode: 'all',
              fromPage: 1,
              toPage: 8,
              selectedPageCount: 8,
              totalPages: 8,
            },
            pdfTotalPages: 8,
            canToggleKeep: false,
            keepGeneratedPdf: false,
            groupKey: 'unit-2',
            canMoveUp: false,
            canMoveDown: false,
            groupOptions: [
              { unitKey: 'unit-1', label: 'unit_1' },
              { unitKey: 'unit-2', label: 'unit_2' },
            ],
            heavySplitActive: false,
          },
        ],
      },
    ],
  };

  const controller = {
    getViewModel() {
      return model;
    },
    applyAction(action) {
      if (action.type !== 'assign_input_group') return;
      model.units[0].inputs[0].groupKey = 'unit-2';
      model.units[1].inputs.push(model.units[0].inputs[0]);
      model.units[0].inputs = [];
      model.unitCount = 1;
      model.units = [
        {
          ...model.units[1],
          unitKey: 'unit-2',
          title: 'unit_2',
          canMoveUp: false,
          canMoveDown: false,
        },
      ];
      model.units[0].inputs[0].groupOptions = [
        { unitKey: 'unit-2', label: 'unit_2' },
      ];
      model.units[0].inputs[1].groupOptions = [
        { unitKey: 'unit-2', label: 'unit_2' },
      ];
    },
  };

  const promptPromise = harness.prompt({ controller });
  harness.elements.textExtractionBatchPlanModalPanel.scrollTop = 135;

  const unitSelect = findNodeByAttributes(
    harness.elements.textExtractionBatchPlanUnits,
    {
      'data-action': 'assign-input-group',
      'data-input-id': 'input-1',
    }
  );
  assert.ok(unitSelect);
  unitSelect.focus();

  harness.elements.textExtractionBatchPlanUnits.dispatch('change', {
    target: createEventTarget(
      {
        'data-action': 'assign-input-group',
        'data-input-id': 'input-1',
      },
      { value: '__new__' }
    ),
  });

  assert.equal(harness.elements.textExtractionBatchPlanModalPanel.scrollTop, 135);
  const activeElement = harness.getActiveElement();
  assert.ok(activeElement);
  assert.equal(activeElement.getAttribute('data-action'), 'assign-input-group');
  assert.equal(activeElement.getAttribute('data-input-id'), 'input-1');

  harness.elements.textExtractionBatchPlanCancel.dispatch('click');
  const result = await promptPromise;
  assert.equal(result, null);
});

test('batch planning modal focuses the top close button on open and restores prior focus on close', async () => {
  const harness = createHarness();
  const controller = {
    getViewModel() {
      return {
        flowKind: 'batch',
        failurePolicy: 'finish_unit_after_last_success',
        startDisabled: false,
        unitCount: 1,
        units: [],
      };
    },
    applyAction() {},
  };

  harness.elements.outsideLauncher.focus();
  harness.elements.textExtractionBatchPlanModalPanel.scrollTop = 155;

  const promptPromise = harness.prompt({ controller });

  assert.equal(harness.getActiveElement(), harness.elements.textExtractionBatchPlanClose);
  assert.equal(harness.elements.textExtractionBatchPlanModalPanel.scrollTop, 0);

  harness.elements.textExtractionBatchPlanCancel.dispatch('click');
  const result = await promptPromise;
  assert.equal(result, null);
  assert.equal(harness.getActiveElement(), harness.elements.outsideLauncher);
});

test('batch planning modal updates unit assignment dropdown labels immediately after renaming a unit', async () => {
  const harness = createHarness();

  const model = {
    flowKind: 'batch',
    failurePolicy: 'finish_unit_after_last_success',
    startDisabled: false,
    unitCount: 2,
    units: [
      {
        unitKey: 'unit-1',
        title: 'Unit 1',
        customName: '',
        displayLabel: 'Unit 1',
        tagsSummary: 'No tags',
        exclusiveHeavy: false,
        canConfigureTags: true,
        canMoveUp: false,
        canMoveDown: true,
        generatedInputsPreview: [],
        inputs: [
          {
            inputId: 'input-1',
            fileName: 'sample-a.pdf',
            alertCode: '',
            activeRoute: 'native',
            routeOptions: ['native'],
            pagesSummary: '',
            canEditPages: true,
            pdfPageSelection: {
              mode: 'all',
              fromPage: 1,
              toPage: 12,
              selectedPageCount: 12,
              totalPages: 12,
            },
            pdfTotalPages: 12,
            canToggleKeep: false,
            keepGeneratedPdf: false,
            groupKey: 'unit-1',
            canMoveUp: false,
            canMoveDown: false,
            groupOptions: [
              { unitKey: 'unit-1', label: 'Unit 1' },
              { unitKey: 'unit-2', label: 'Unit 2' },
            ],
            heavySplitActive: false,
          },
        ],
      },
      {
        unitKey: 'unit-2',
        title: 'Unit 2',
        customName: '',
        displayLabel: 'Unit 2',
        tagsSummary: 'No tags',
        exclusiveHeavy: false,
        canConfigureTags: true,
        canMoveUp: true,
        canMoveDown: false,
        generatedInputsPreview: [],
        inputs: [
          {
            inputId: 'input-2',
            fileName: 'sample-b.pdf',
            alertCode: '',
            activeRoute: 'native',
            routeOptions: ['native'],
            pagesSummary: '',
            canEditPages: true,
            pdfPageSelection: {
              mode: 'all',
              fromPage: 1,
              toPage: 8,
              selectedPageCount: 8,
              totalPages: 8,
            },
            pdfTotalPages: 8,
            canToggleKeep: false,
            keepGeneratedPdf: false,
            groupKey: 'unit-2',
            canMoveUp: false,
            canMoveDown: false,
            groupOptions: [
              { unitKey: 'unit-1', label: 'Unit 1' },
              { unitKey: 'unit-2', label: 'Unit 2' },
            ],
            heavySplitActive: false,
          },
        ],
      },
    ],
  };

  const controller = {
    getViewModel() {
      return model;
    },
    applyAction(action) {
      if (action.type !== 'rename_unit') return;
      model.units[0].customName = action.name;
      model.units[0].title = action.name ? `Unit 1 - ${action.name}` : 'Unit 1';
      model.units[0].inputs[0].groupOptions = [
        { unitKey: 'unit-1', label: action.name ? `Unit 1 - ${action.name}` : 'Unit 1' },
        { unitKey: 'unit-2', label: 'Unit 2' },
      ];
      model.units[1].inputs[0].groupOptions = [
        { unitKey: 'unit-1', label: action.name ? `Unit 1 - ${action.name}` : 'Unit 1' },
        { unitKey: 'unit-2', label: 'Unit 2' },
      ];
    },
  };

  const promptPromise = harness.prompt({ controller });

  const renameInput = findNodeByAttributes(
    harness.elements.textExtractionBatchPlanUnits,
    {
      'data-action': 'rename-unit',
      'data-unit-key': 'unit-1',
    }
  );
  assert.ok(renameInput);
  renameInput.value = 'Essays';
  harness.elements.textExtractionBatchPlanUnits.dispatch('input', { target: renameInput });

  assert.match(
    harness.elements.textExtractionBatchPlanUnits.innerHTML,
    /Unit 1 - Essays/
  );
  assert.equal(renameInput.maxLength, 60);

  harness.elements.textExtractionBatchPlanCancel.dispatch('click');
  const result = await promptPromise;
  assert.equal(result, null);
});

test('batch planning modal uses icon buttons for move/remove actions and normal size for tags', async () => {
  const harness = createHarness();

  const model = {
    flowKind: 'batch',
    failurePolicy: 'finish_unit_after_last_success',
    startDisabled: false,
    unitCount: 2,
    units: [
      {
        unitKey: 'unit-1',
        title: 'Unit 1',
        customName: '',
        displayLabel: 'Unit 1',
        tagsSummary: 'No tags',
        exclusiveHeavy: false,
        canConfigureTags: true,
        canMoveUp: false,
        canMoveDown: true,
        generatedInputsPreview: [],
        inputs: [
          {
            inputId: 'input-1',
            fileName: 'sample-a.pdf',
            alertCode: '',
            activeRoute: 'native',
            routeOptions: ['native'],
            pagesSummary: '',
            canEditPages: true,
            pdfPageSelection: {
              mode: 'all',
              fromPage: 1,
              toPage: 12,
              selectedPageCount: 12,
              totalPages: 12,
            },
            pdfTotalPages: 12,
            canToggleKeep: false,
            keepGeneratedPdf: false,
            groupKey: 'unit-1',
            canMoveUp: false,
            canMoveDown: true,
            groupOptions: [
              { unitKey: 'unit-1', label: 'Unit 1' },
              { unitKey: 'unit-2', label: 'Unit 2' },
            ],
            heavySplitActive: false,
          },
          {
            inputId: 'input-2',
            fileName: 'sample-b.pdf',
            alertCode: '',
            activeRoute: 'native',
            routeOptions: ['native'],
            pagesSummary: '',
            canEditPages: true,
            pdfPageSelection: {
              mode: 'all',
              fromPage: 1,
              toPage: 8,
              selectedPageCount: 8,
              totalPages: 8,
            },
            pdfTotalPages: 8,
            canToggleKeep: false,
            keepGeneratedPdf: false,
            groupKey: 'unit-1',
            canMoveUp: true,
            canMoveDown: false,
            groupOptions: [
              { unitKey: 'unit-1', label: 'Unit 1' },
              { unitKey: 'unit-2', label: 'Unit 2' },
            ],
            heavySplitActive: false,
          },
        ],
      },
      {
        unitKey: 'unit-2',
        title: 'Unit 2',
        customName: '',
        displayLabel: 'Unit 2',
        tagsSummary: 'No tags',
        exclusiveHeavy: false,
        canConfigureTags: true,
        canMoveUp: true,
        canMoveDown: false,
        generatedInputsPreview: [],
        inputs: [],
      },
    ],
  };

  const controller = {
    getViewModel() {
      return model;
    },
    applyAction() {},
  };

  const promptPromise = harness.prompt({ controller });

  const moveUpButton = findNodeByAttributes(
    harness.elements.textExtractionBatchPlanUnits,
    {
      'data-action': 'move-input-up',
      'data-input-id': 'input-2',
    }
  );
  assert.ok(moveUpButton);
  assert.equal(moveUpButton.textContent, '🡩');
  assert.equal(moveUpButton.title, 'Move up');
  assert.equal(moveUpButton.getAttribute('aria-label'), 'Move up');
  assert.match(moveUpButton.className, /btn-standard--square/);

  const removeButton = findNodeByAttributes(
    harness.elements.textExtractionBatchPlanUnits,
    {
      'data-action': 'remove-input',
      'data-input-id': 'input-1',
    }
  );
  assert.ok(removeButton);
  assert.equal(removeButton.textContent, '🗑');
  assert.equal(removeButton.title, 'Remove');
  assert.equal(removeButton.getAttribute('aria-label'), 'Remove');
  assert.match(removeButton.className, /btn-standard--square/);

  const tagsButton = findNodeByAttributes(
    harness.elements.textExtractionBatchPlanUnits,
    {
      'data-action': 'edit-tags',
      'data-unit-key': 'unit-1',
    }
  );
  assert.ok(tagsButton);
  assert.equal(tagsButton.textContent, 'Tags');
  assert.equal(tagsButton.title, 'Tags');
  assert.doesNotMatch(tagsButton.className, /btn-standard--square/);

  harness.elements.textExtractionBatchPlanCancel.dispatch('click');
  const result = await promptPromise;
  assert.equal(result, null);
});

test('batch planning modal hides the non-editable pages summary for non-PDF inputs', async () => {
  const harness = createHarness();

  const model = {
    flowKind: 'batch',
    failurePolicy: 'finish_unit_after_last_success',
    startDisabled: false,
    unitCount: 2,
    units: [
      {
        unitKey: 'unit-1',
        title: 'Unit 1',
        customName: '',
        displayLabel: 'Unit 1',
        tagsSummary: 'No tags',
        exclusiveHeavy: false,
        canConfigureTags: true,
        canMoveUp: false,
        canMoveDown: true,
        generatedInputsPreview: [],
        inputs: [
          {
            inputId: 'input-pdf',
            fileName: 'heavy.pdf',
            alertCode: '',
            activeRoute: 'ocr',
            routeOptions: ['native', 'ocr'],
            pagesSummary: 'All pages',
            canEditPages: false,
            pdfPageSelection: {
              mode: 'all',
              fromPage: 1,
              toPage: 12,
              selectedPageCount: 12,
              totalPages: 12,
            },
            pdfTotalPages: 12,
            canToggleKeep: true,
            keepGeneratedPdf: false,
            groupKey: 'unit-1',
            canMoveUp: false,
            canMoveDown: false,
            groupOptions: [
              { unitKey: 'unit-1', label: 'Unit 1' },
            ],
            heavySplitActive: true,
          },
          {
            inputId: 'input-text',
            fileName: 'notes.txt',
            alertCode: '',
            activeRoute: 'native',
            routeOptions: ['native'],
            pagesSummary: '',
            canEditPages: false,
            pdfPageSelection: null,
            pdfTotalPages: 1,
            canToggleKeep: false,
            keepGeneratedPdf: false,
            groupKey: 'unit-1',
            canMoveUp: false,
            canMoveDown: false,
            groupOptions: [
              { unitKey: 'unit-1', label: 'Unit 1' },
            ],
            heavySplitActive: false,
          },
        ],
      },
      {
        unitKey: 'unit-2',
        title: 'Unit 2',
        customName: '',
        displayLabel: 'Unit 2',
        tagsSummary: 'No tags',
        exclusiveHeavy: false,
        canConfigureTags: true,
        canMoveUp: true,
        canMoveDown: false,
        generatedInputsPreview: [],
        inputs: [],
      },
    ],
  };

  const controller = {
    getViewModel() {
      return model;
    },
    applyAction() {},
  };

  const promptPromise = harness.prompt({ controller });

  const heavyRemoveButton = findNodeByAttributes(
    harness.elements.textExtractionBatchPlanUnits,
    {
      'data-action': 'remove-input',
      'data-input-id': 'input-pdf',
    }
  );
  const textRemoveButton = findNodeByAttributes(
    harness.elements.textExtractionBatchPlanUnits,
    {
      'data-action': 'remove-input',
      'data-input-id': 'input-text',
    }
  );
  assert.ok(heavyRemoveButton);
  assert.ok(textRemoveButton);

  const heavyRow = heavyRemoveButton.parentNode.parentNode.parentNode.parentNode;
  const textRow = textRemoveButton.parentNode.parentNode.parentNode.parentNode;

  assert.match(heavyRow.innerHTML, /All pages/);
  assert.doesNotMatch(textRow.innerHTML, /All pages/);

  harness.elements.textExtractionBatchPlanCancel.dispatch('click');
  const result = await promptPromise;
  assert.equal(result, null);
});
