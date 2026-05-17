// public/js/text_extraction_batch_planning_modal.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Host the shared Issue 266 batch planning surface.
// - Render planner-controlled units/inputs without moving batch business logic
//   into renderer.js.
// - Expose the maintained public prompt through window.Notify.
// =============================================================================

(() => {
  const UNIT_NAME_MAX_LENGTH = 60;

  // =============================================================================
  // Imports / logger
  // =============================================================================

  if (typeof window.getLogger !== 'function') {
    throw new Error('[text-extraction-batch-planning-modal] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('text-extraction-batch-planning-modal');
  log.debug('Text extraction batch planning modal starting...');
  if (!window.RendererI18n || typeof window.RendererI18n.tRenderer !== 'function') {
    throw new Error('[text-extraction-batch-planning-modal] RendererI18n.tRenderer unavailable; cannot continue');
  }
  const { tRenderer } = window.RendererI18n;
  const pdfPageSelectionHelper = window.TextExtractionPdfPageSelection || null;
  if (!pdfPageSelectionHelper
    || typeof pdfPageSelectionHelper.buildAllPagesSelection !== 'function'
    || typeof pdfPageSelectionHelper.buildPageSelectionDraft !== 'function'
    || typeof pdfPageSelectionHelper.getPageSelectionUiState !== 'function') {
    throw new Error('[text-extraction-batch-planning-modal] TextExtractionPdfPageSelection dependencies unavailable; cannot continue');
  }

  // =============================================================================
  // DOM references
  // =============================================================================

  const modal = document.getElementById('textExtractionBatchPlanModal');
  const backdrop = document.getElementById('textExtractionBatchPlanModalBackdrop');
  const panel = document.getElementById('textExtractionBatchPlanModalPanel');
  const title = document.getElementById('textExtractionBatchPlanModalTitle');
  const body = document.getElementById('textExtractionBatchPlanUnits');
  const btnPresetAll = document.getElementById('textExtractionBatchPlanPresetAll');
  const btnPresetSeparate = document.getElementById('textExtractionBatchPlanPresetSeparate');
  const failureLegend = document.getElementById('textExtractionBatchPlanFailureLegend');
  const failurePolicyDefault = document.getElementById('textExtractionBatchPlanFailureDefault');
  const failurePolicyContinue = document.getElementById('textExtractionBatchPlanFailureContinue');
  const failurePolicyDefaultLabel = document.getElementById('textExtractionBatchPlanFailureDefaultLabel');
  const failurePolicyContinueLabel = document.getElementById('textExtractionBatchPlanFailureContinueLabel');
  const btnStart = document.getElementById('textExtractionBatchPlanStart');
  const btnCancel = document.getElementById('textExtractionBatchPlanCancel');
  const btnClose = document.getElementById('textExtractionBatchPlanClose');

  // =============================================================================
  // Helpers
  // =============================================================================

  function hasRequiredElements() {
    return !!(modal
      && backdrop
      && title
      && body
      && btnPresetAll
      && btnPresetSeparate
      && failureLegend
      && failurePolicyDefault
      && failurePolicyContinue
      && failurePolicyDefaultLabel
      && failurePolicyContinueLabel
      && btnStart
      && btnCancel
      && btnClose);
  }

  function buildPageSelectionDraft(input) {
    return pdfPageSelectionHelper.buildPageSelectionDraft({
      pdfPageSelection: input && input.pdfPageSelection ? input.pdfPageSelection : null,
      totalPages: input && input.pdfTotalPages,
    });
  }

  function createDomElement(tagName, options = {}) {
    const element = document.createElement(tagName);
    if (options.className) {
      element.className = options.className;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'textContent')) {
      element.textContent = String(options.textContent);
    }
    if (options.type) {
      element.type = options.type;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'value')) {
      element.value = String(options.value);
    }
    if (options.name) {
      element.name = options.name;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'checked')) {
      element.checked = options.checked === true;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'disabled')) {
      element.disabled = options.disabled === true;
    }
    if (Object.prototype.hasOwnProperty.call(options, 'hidden')) {
      element.hidden = options.hidden === true;
    }
    if (options.attributes && typeof options.attributes === 'object') {
      Object.keys(options.attributes).forEach((name) => {
        const value = options.attributes[name];
        if (value === undefined || value === null) return;
        element.setAttribute(name, String(value));
      });
    }
    return element;
  }

  function appendChildren(parent, children) {
    children.forEach((child) => {
      if (!child) return;
      parent.appendChild(child);
    });
    return parent;
  }

  function setElementVisibility(element, isVisible) {
    element.hidden = isVisible !== true;
    element.setAttribute('aria-hidden', isVisible === true ? 'false' : 'true');
  }

  function getElementChildren(element) {
    if (!element) return [];
    if (element.children && typeof element.children.length === 'number') {
      return Array.from(element.children);
    }
    if (element.childNodes && typeof element.childNodes.length === 'number') {
      return Array.from(element.childNodes).filter((node) => node && node.nodeType === 1);
    }
    return [];
  }

  function findDescendantByDescriptor(root, descriptor) {
    if (!root || !descriptor) return null;
    const pending = [root];
    while (pending.length) {
      const element = pending.shift();
      if (!element || typeof element.getAttribute !== 'function') {
        continue;
      }
      const id = descriptor.id || '';
      const action = descriptor.action || '';
      const inputId = descriptor.inputId || '';
      const unitKey = descriptor.unitKey || '';
      const matches = id
        ? element.id === id
        : (
          element.getAttribute('data-action') === action
          && element.getAttribute('data-input-id') === inputId
          && element.getAttribute('data-unit-key') === unitKey
        );
      if (matches) {
        return element;
      }
      pending.push(...getElementChildren(element));
    }
    return null;
  }

  function captureFocusableDescriptor(element) {
    if (!element || typeof element.getAttribute !== 'function') {
      return null;
    }
    const action = element.getAttribute('data-action') || '';
    const inputId = element.getAttribute('data-input-id') || '';
    const unitKey = element.getAttribute('data-unit-key') || '';
    const id = typeof element.id === 'string' ? element.id : '';
    if (!id && !action) {
      return null;
    }
    return {
      id,
      action,
      inputId,
      unitKey,
      selectionStart: typeof element.selectionStart === 'number' ? element.selectionStart : null,
      selectionEnd: typeof element.selectionEnd === 'number' ? element.selectionEnd : null,
    };
  }

  function restoreFocusFromDescriptor(descriptor) {
    if (!descriptor) return;
    const target = descriptor.id
      ? document.getElementById(descriptor.id)
      : findDescendantByDescriptor(body, descriptor);
    if (!target || typeof target.focus !== 'function') {
      return;
    }
    try {
      target.focus({ preventScroll: true });
    } catch (_err) {
      target.focus();
    }
    if (typeof target.setSelectionRange === 'function'
      && typeof descriptor.selectionStart === 'number'
      && typeof descriptor.selectionEnd === 'number') {
      try {
        target.setSelectionRange(descriptor.selectionStart, descriptor.selectionEnd);
      } catch (_err) {
        // Ignore unsupported selection restoration.
      }
    }
  }

  function focusElementWithoutScroll(element) {
    if (!element || typeof element.focus !== 'function') {
      return;
    }
    try {
      element.focus({ preventScroll: true });
    } catch (_err) {
      element.focus();
    }
  }

  function createActionButton({
    labelKey,
    action,
    inputId = '',
    unitKey = '',
    disabled = false,
    visibleText = '',
    className = 'btn-standard',
  }) {
    const button = createDomElement('button', {
      className,
      textContent: visibleText || tRenderer(labelKey),
      type: 'button',
      disabled,
    });
    const accessibleLabel = tRenderer(labelKey);
    button.setAttribute('data-action', action);
    button.setAttribute('aria-label', accessibleLabel);
    button.title = accessibleLabel;
    if (inputId) {
      button.setAttribute('data-input-id', inputId);
    }
    if (unitKey) {
      button.setAttribute('data-unit-key', unitKey);
    }
    return button;
  }

  function syncPageSelectionControls(root, pageSelectionDraft, { preserveTypedValues = false } = {}) {
    if (!root) return;
    const safeDraft = pageSelectionDraft || {
      mode: 'all',
      fromPage: '1',
      toPage: String(root._totalPages || 1),
      totalPages: root._totalPages || 1,
    };
    const uiState = pdfPageSelectionHelper.getPageSelectionUiState(safeDraft);

    root._allRadio.checked = uiState.showRange !== true;
    root._rangeRadio.checked = uiState.showRange === true;
    root._fromInput.max = String(root._totalPages || 1);
    root._toInput.max = String(root._totalPages || 1);
    if (!preserveTypedValues) {
      root._fromInput.value = String(safeDraft.fromPage || 1);
      root._toInput.value = String(safeDraft.toPage || root._totalPages || 1);
    }
    setElementVisibility(root._rangeGrid, uiState.showRange === true);
    root._countEl.textContent = uiState.selectedCountText;
    setElementVisibility(root._countEl, !!uiState.selectedCountText);
    root._validationEl.textContent = uiState.validationText;
    setElementVisibility(root._validationEl, !!uiState.validationText);
  }

  function createPageSelectionControls(input, pageSelectionDraft, pageSelectionRoots) {
    const safeDraft = pageSelectionDraft || buildPageSelectionDraft(input);
    const totalPages = Number(safeDraft.totalPages) || 1;
    const root = createDomElement('div', {
      className: 'text-extraction-batch-plan-page-scope',
    });
    root.setAttribute('data-page-selection-root', 'true');
    root.setAttribute('data-input-id', input.inputId);

    const options = createDomElement('div', {
      className: 'text-extraction-batch-plan-page-scope-options',
    });
    const modeName = `textExtractionBatchPlanPageMode_${input.inputId}`;
    const allLabel = createDomElement('label', {
      className: 'text-extraction-batch-plan-page-scope-option',
    });
    const allRadio = createDomElement('input', {
      type: 'radio',
      name: modeName,
      value: 'all',
    });
    allRadio.setAttribute('data-action', 'set-page-mode');
    allRadio.setAttribute('data-input-id', input.inputId);
    const allText = createDomElement('span', {
      textContent: tRenderer('renderer.text_extraction.pdf_options.all_pages_label'),
    });
    appendChildren(allLabel, [allRadio, allText]);

    const rangeLabel = createDomElement('label', {
      className: 'text-extraction-batch-plan-page-scope-option',
    });
    const rangeRadio = createDomElement('input', {
      type: 'radio',
      name: modeName,
      value: 'range',
    });
    rangeRadio.setAttribute('data-action', 'set-page-mode');
    rangeRadio.setAttribute('data-input-id', input.inputId);
    const rangeText = createDomElement('span', {
      textContent: tRenderer('renderer.text_extraction.pdf_options.range_label'),
    });
    appendChildren(rangeLabel, [rangeRadio, rangeText]);
    appendChildren(options, [allLabel, rangeLabel]);

    const rangeGrid = createDomElement('div', {
      className: 'text-extraction-batch-plan-page-scope-range-grid',
    });
    const fromField = createDomElement('label', {
      className: 'text-extraction-batch-plan-page-scope-field',
    });
    const fromText = createDomElement('span', {
      textContent: tRenderer('renderer.text_extraction.pdf_options.from_page_label'),
    });
    const fromInput = createDomElement('input', {
      className: 'text-extraction-batch-plan-page-scope-input',
      type: 'number',
      value: safeDraft.fromPage,
    });
    fromInput.min = '1';
    fromInput.max = String(totalPages);
    fromInput.step = '1';
    fromInput.setAttribute('data-action', 'set-page-from');
    fromInput.setAttribute('data-input-id', input.inputId);
    appendChildren(fromField, [fromText, fromInput]);

    const toField = createDomElement('label', {
      className: 'text-extraction-batch-plan-page-scope-field',
    });
    const toText = createDomElement('span', {
      textContent: tRenderer('renderer.text_extraction.pdf_options.to_page_label'),
    });
    const toInput = createDomElement('input', {
      className: 'text-extraction-batch-plan-page-scope-input',
      type: 'number',
      value: safeDraft.toPage,
    });
    toInput.min = '1';
    toInput.max = String(totalPages);
    toInput.step = '1';
    toInput.setAttribute('data-action', 'set-page-to');
    toInput.setAttribute('data-input-id', input.inputId);
    appendChildren(toField, [toText, toInput]);
    appendChildren(rangeGrid, [fromField, toField]);

    const countEl = createDomElement('div', {
      className: 'text-extraction-batch-plan-page-scope-count',
      hidden: true,
      attributes: { 'aria-hidden': 'true' },
    });
    const validationEl = createDomElement('div', {
      className: 'text-extraction-batch-plan-page-scope-validation',
      hidden: true,
      attributes: { 'aria-hidden': 'true' },
    });

    appendChildren(root, [options, rangeGrid, countEl, validationEl]);
    root._totalPages = totalPages;
    root._allRadio = allRadio;
    root._rangeRadio = rangeRadio;
    root._rangeGrid = rangeGrid;
    root._fromInput = fromInput;
    root._toInput = toInput;
    root._countEl = countEl;
    root._validationEl = validationEl;
    pageSelectionRoots.set(input.inputId, root);
    syncPageSelectionControls(root, safeDraft);
    return root;
  }

  function createRouteControl(input) {
    const routeOptions = Array.isArray(input.routeOptions) ? input.routeOptions : [];
    if (routeOptions.length <= 1) {
      return createDomElement('span', {
        className: 'text-extraction-batch-plan-route-fixed',
        textContent: (input.activeRoute || routeOptions[0] || '').toUpperCase(),
      });
    }

    const select = createDomElement('select', {
      className: 'text-extraction-batch-plan-route-select',
    });
    select.setAttribute('data-action', 'set-input-route');
    select.setAttribute('data-input-id', input.inputId);
    routeOptions.forEach((route) => {
      const option = createDomElement('option', {
        textContent: route.toUpperCase(),
        value: route,
      });
      option.value = route;
      option.selected = route === input.activeRoute;
      select.appendChild(option);
    });
    return select;
  }

  function populateUnitSelectOptions(select, input) {
    if (!select) return;
    if (typeof select.replaceChildren === 'function') {
      select.replaceChildren();
    } else {
      select.innerHTML = '';
    }
    (Array.isArray(input.groupOptions) ? input.groupOptions : []).forEach((option) => {
      const optionEl = createDomElement('option', {
        textContent: option.label,
        value: option.unitKey,
      });
      optionEl.value = option.unitKey;
      optionEl.selected = option.unitKey === input.groupKey;
      select.appendChild(optionEl);
    });
    const newUnitOption = createDomElement('option', {
      textContent: tRenderer('renderer.text_extraction.batch_plan.new_unit_option'),
      value: '__new__',
    });
    newUnitOption.value = '__new__';
    select.appendChild(newUnitOption);
  }

  function createUnitSelect(unit, input) {
    if (unit.exclusiveHeavy) {
      return null;
    }

    const select = createDomElement('select', {
      className: 'text-extraction-batch-plan-unit-select',
    });
    select.setAttribute('data-action', 'assign-input-group');
    select.setAttribute('data-input-id', input.inputId);
    populateUnitSelectOptions(select, input);
    return select;
  }

  function createKeepControl(input) {
    if (input.canToggleKeep !== true) {
      return null;
    }

    const label = createDomElement('label', {
      className: 'text-extraction-batch-plan-keep-toggle',
    });
    const checkbox = createDomElement('input', {
      type: 'checkbox',
      checked: input.keepGeneratedPdf === true,
    });
    checkbox.setAttribute('data-action', 'toggle-keep');
    checkbox.setAttribute('data-input-id', input.inputId);
    const text = createDomElement('span', {
      textContent: tRenderer('renderer.text_extraction.batch_plan.keep_generated_pdf'),
    });
    appendChildren(label, [checkbox, text]);
    return label;
  }

  function renderInputRow(unit, input, pageSelectionDraft = null, pageSelectionRoots, keepControlRoots, unitSelectRoots) {
    const row = createDomElement('div', {
      className: 'text-extraction-batch-plan-input-row',
    });
    const middleRow = createDomElement('div', {
      className: 'text-extraction-batch-plan-input-row-middle',
    });
    const bottomRow = createDomElement('div', {
      className: 'text-extraction-batch-plan-input-row-bottom',
    });
    const bottomControls = createDomElement('div', {
      className: 'text-extraction-batch-plan-input-row-bottom-controls',
    });

    const main = createDomElement('div', {
      className: 'text-extraction-batch-plan-input-main',
    });
    main.appendChild(createDomElement('strong', { textContent: input.fileName }));
    if (input.heavySplitActive) {
      main.appendChild(createDomElement('span', {
        className: 'text-extraction-batch-plan-heavy-badge',
        textContent: tRenderer('renderer.text_extraction.batch_plan.heavy_pdf_badge'),
      }));
    }
    if (input.alertCode) {
      main.appendChild(createDomElement('span', {
        className: 'text-extraction-batch-plan-input-code',
        textContent: `(${input.alertCode})`,
      }));
    }

    const routeWrap = createDomElement('div', {
      className: 'text-extraction-batch-plan-input-route',
    });
    routeWrap.appendChild(createRouteControl(input));

    const pagesWrap = createDomElement('div', {
      className: 'text-extraction-batch-plan-input-pages',
    });
    if (input.canEditPages === true) {
      pagesWrap.appendChild(createPageSelectionControls(input, pageSelectionDraft, pageSelectionRoots));
    } else if (input.pagesSummary) {
      pagesWrap.appendChild(createDomElement('span', {
        className: 'text-extraction-batch-plan-pages-summary',
        textContent: input.pagesSummary,
      }));
    }

    const keepWrap = createDomElement('div', {
      className: 'text-extraction-batch-plan-input-keep',
    });
    keepControlRoots.set(input.inputId, keepWrap);
    const keepControl = createKeepControl(input);
    if (keepControl) {
      keepWrap.appendChild(keepControl);
    }

    const unitWrap = createDomElement('div', {
      className: 'text-extraction-batch-plan-input-unit',
    });
    const unitSelect = createUnitSelect(unit, input);
    if (unitSelect) {
      unitSelectRoots.set(input.inputId, unitSelect);
      unitWrap.appendChild(unitSelect);
    }

    const actionsWrap = createDomElement('div', {
      className: 'text-extraction-batch-plan-input-actions',
    });
    appendChildren(actionsWrap, [
      createActionButton({
        labelKey: 'renderer.text_extraction.batch_plan.move_up',
        action: 'move-input-up',
        inputId: input.inputId,
        disabled: input.canMoveUp !== true,
        visibleText: '🡩',
        className: 'btn-standard btn-standard--square text-extraction-batch-plan-icon-button',
      }),
      createActionButton({
        labelKey: 'renderer.text_extraction.batch_plan.move_down',
        action: 'move-input-down',
        inputId: input.inputId,
        disabled: input.canMoveDown !== true,
        visibleText: '🡫',
        className: 'btn-standard btn-standard--square text-extraction-batch-plan-icon-button',
      }),
      createActionButton({
        labelKey: 'renderer.text_extraction.batch_plan.remove_input',
        action: 'remove-input',
        inputId: input.inputId,
        visibleText: '🗑',
        className: 'btn-standard btn-standard--square text-extraction-batch-plan-icon-button',
      }),
    ]);

    appendChildren(middleRow, [routeWrap, pagesWrap]);
    appendChildren(bottomControls, [unitWrap, actionsWrap]);
    appendChildren(bottomRow, [keepWrap, bottomControls]);
    appendChildren(row, [main, middleRow, bottomRow]);
    return row;
  }

  function renderUnit(unit, unitIndex, unitCount, pageSelectionDrafts, pageSelectionRoots, keepControlRoots, unitSelectRoots) {
    const section = createDomElement('section', {
      className: 'text-extraction-batch-plan-unit',
    });

    const header = createDomElement('div', {
      className: 'text-extraction-batch-plan-unit-header',
    });
    const headingWrap = createDomElement('div', {
      className: 'text-extraction-batch-plan-unit-heading',
    });
    const unitHeading = createDomElement('div', {
      className: 'text-extraction-batch-plan-unit-heading-label',
      textContent: unit.displayLabel || tRenderer('renderer.text_extraction.batch_plan.unit_counter')
        .replace('{index}', String(unitIndex + 1))
        .replace('{count}', String(unitCount)),
    });
    const unitNameInput = createDomElement('input', {
      className: 'text-extraction-batch-plan-unit-name',
      value: typeof unit.customName === 'string' ? unit.customName : '',
      type: 'text',
    });
    unitNameInput.setAttribute('data-action', 'rename-unit');
    unitNameInput.setAttribute('data-unit-key', unit.unitKey);
    unitNameInput.maxLength = UNIT_NAME_MAX_LENGTH;
    unitNameInput.setAttribute('placeholder', tRenderer('renderer.text_extraction.batch_plan.unit_name_placeholder'));
    unitNameInput.setAttribute('aria-label', `${unitHeading.textContent} ${tRenderer('renderer.text_extraction.batch_plan.unit_name_placeholder')}`);
    appendChildren(headingWrap, [unitHeading, unitNameInput]);
    const headerActions = createDomElement('div', {
      className: 'text-extraction-batch-plan-unit-actions',
    });
    appendChildren(headerActions, [
      createActionButton({
        labelKey: 'renderer.text_extraction.batch_plan.move_up',
        action: 'move-unit-up',
        unitKey: unit.unitKey,
        disabled: unit.canMoveUp !== true,
        visibleText: '🡩',
        className: 'btn-standard btn-standard--square text-extraction-batch-plan-icon-button',
      }),
      createActionButton({
        labelKey: 'renderer.text_extraction.batch_plan.move_down',
        action: 'move-unit-down',
        unitKey: unit.unitKey,
        disabled: unit.canMoveDown !== true,
        visibleText: '🡫',
        className: 'btn-standard btn-standard--square text-extraction-batch-plan-icon-button',
      }),
    ]);
    appendChildren(header, [headingWrap, headerActions]);

    const inputsWrap = createDomElement('div', {
      className: 'text-extraction-batch-plan-unit-inputs',
    });
    (Array.isArray(unit.inputs) ? unit.inputs : []).forEach((input) => {
      inputsWrap.appendChild(renderInputRow(
        unit,
        input,
        pageSelectionDrafts.get(input.inputId) || null,
        pageSelectionRoots,
        keepControlRoots,
        unitSelectRoots
      ));
    });

    section.appendChild(header);
    section.appendChild(inputsWrap);

    if (unit.exclusiveHeavy && Array.isArray(unit.generatedInputsPreview) && unit.generatedInputsPreview.length) {
      section.appendChild(createDomElement('p', {
        className: 'text-extraction-batch-plan-heavy-preview-label',
        textContent: tRenderer('renderer.text_extraction.batch_plan.generated_inputs_preview'),
      }));
      const previewList = createDomElement('ul', {
        className: 'text-extraction-batch-plan-heavy-preview-list',
      });
      unit.generatedInputsPreview.forEach((generatedInput) => {
        previewList.appendChild(createDomElement('li', {
          textContent: generatedInput.processingInputFileName,
        }));
      });
      section.appendChild(previewList);
    }

    if (unit.canConfigureTags) {
      const tagsRow = createDomElement('div', {
        className: 'text-extraction-batch-plan-unit-tags',
      });
      appendChildren(tagsRow, [
        createDomElement('span', { textContent: unit.tagsSummary }),
        createActionButton({
          labelKey: 'renderer.text_extraction.batch_plan.edit_tags',
          action: 'edit-tags',
          unitKey: unit.unitKey,
          className: 'btn-standard',
        }),
      ]);
      section.appendChild(tagsRow);
    } else {
      section.appendChild(createDomElement('div', {
        className: 'text-extraction-batch-plan-unit-tags text-extraction-batch-plan-unit-tags--disabled',
        textContent: tRenderer('renderer.text_extraction.batch_plan.single_unit_no_snapshot'),
      }));
    }

    return section;
  }

  function replaceBodyUnits(units, unitCount, pageSelectionDrafts, pageSelectionRoots, keepControlRoots, unitSelectRoots) {
    const unitNodes = (Array.isArray(units) ? units : []).map((unit, unitIndex) => renderUnit(
      unit,
      unitIndex,
      unitCount,
      pageSelectionDrafts,
      pageSelectionRoots,
      keepControlRoots,
      unitSelectRoots
    ));
    if (typeof body.replaceChildren === 'function') {
      body.replaceChildren(...unitNodes);
      return;
    }
    body.innerHTML = '';
    unitNodes.forEach((node) => body.appendChild(node));
  }

  function renderCopy(model) {
    title.textContent = model.flowKind === 'single_file_split'
      ? tRenderer('renderer.text_extraction.batch_plan.single_file_title')
      : tRenderer('renderer.text_extraction.batch_plan.title');
    btnPresetAll.textContent = tRenderer('renderer.text_extraction.batch_plan.preset_all');
    btnPresetSeparate.textContent = tRenderer('renderer.text_extraction.batch_plan.preset_separate');
    failureLegend.textContent = tRenderer('renderer.text_extraction.batch_plan.failure_legend');
    failurePolicyDefaultLabel.textContent = tRenderer('renderer.text_extraction.batch_plan.failure_default');
    failurePolicyContinueLabel.textContent = tRenderer('renderer.text_extraction.batch_plan.failure_continue');
    btnStart.textContent = tRenderer('renderer.text_extraction.batch_plan.start_button');
    btnCancel.textContent = tRenderer('renderer.text_extraction.batch_plan.cancel_button');
    btnClose.setAttribute('aria-label', tRenderer('renderer.text_extraction.batch_plan.close_aria'));
  }

  // =============================================================================
  // Public prompt
  // =============================================================================

  async function promptBatchPlan({ controller } = {}) {
    if (!hasRequiredElements()) {
      log.error('Batch planning modal DOM elements missing.');
      return null;
    }
    if (!controller || typeof controller.getViewModel !== 'function' || typeof controller.applyAction !== 'function') {
      log.error('Batch planning modal controller missing.');
      return null;
    }

    return new Promise((resolve) => {
      let settled = false;
      const previousActiveElement = document.activeElement || null;
      let currentModel = controller.getViewModel();
      let rootListenerBound = false;
      let startValidationInFlight = false;
      const pageSelectionDrafts = new Map();
      const pageSelectionRoots = new Map();
      const keepControlRoots = new Map();
      const unitSelectRoots = new Map();

      const findInputById = (inputId) => {
        for (const unit of Array.isArray(currentModel.units) ? currentModel.units : []) {
          const input = Array.isArray(unit.inputs)
            ? unit.inputs.find((candidate) => candidate.inputId === inputId)
            : null;
          if (input) return input;
        }
        return null;
      };

      const syncPageSelectionDrafts = () => {
        for (const inputId of [...pageSelectionDrafts.keys()]) {
          const input = findInputById(inputId);
          if (!input || input.canEditPages !== true) {
            pageSelectionDrafts.delete(inputId);
            continue;
          }
          const draft = pageSelectionDrafts.get(inputId) || {};
          pageSelectionDrafts.set(inputId, {
            ...buildPageSelectionDraft(input),
            ...draft,
          });
        }
      };

      const refreshPageSelectionControl = (inputId, options = {}) => {
        const root = pageSelectionRoots.get(inputId);
        if (!root) return;
        const input = findInputById(inputId);
        if (!input || input.canEditPages !== true) return;
        const draft = pageSelectionDrafts.get(inputId) || buildPageSelectionDraft(input);
        syncPageSelectionControls(root, draft, {
          preserveTypedValues: options.preserveTypedValues === true,
        });
      };

      const refreshKeepControl = (inputId) => {
        const root = keepControlRoots.get(inputId);
        if (!root) return;
        const input = findInputById(inputId);
        if (!input) return;
        const keepControl = createKeepControl(input);
        if (typeof root.replaceChildren === 'function') {
          if (keepControl) {
            root.replaceChildren(keepControl);
          } else {
            root.replaceChildren();
          }
          return;
        }
        root.innerHTML = '';
        if (keepControl) {
          root.appendChild(keepControl);
        }
      };

      const refreshAllUnitSelectControls = () => {
        for (const [inputId, select] of unitSelectRoots.entries()) {
          const input = findInputById(inputId);
          if (!input || !select) continue;
          populateUnitSelectOptions(select, input);
        }
      };

      const hasInvalidPageSelectionDrafts = () => {
        for (const [inputId, draft] of pageSelectionDrafts.entries()) {
          const input = findInputById(inputId);
          if (!input || input.canEditPages !== true) continue;
          const uiState = pdfPageSelectionHelper.getPageSelectionUiState(draft);
          if (uiState.showRange === true && uiState.isValid !== true) {
            return true;
          }
        }
        return false;
      };

      const getFirstInvalidPageSelectionTarget = () => {
        for (const [inputId, draft] of pageSelectionDrafts.entries()) {
          const input = findInputById(inputId);
          const root = pageSelectionRoots.get(inputId);
          if (!input || input.canEditPages !== true || !root) continue;
          const uiState = pdfPageSelectionHelper.getPageSelectionUiState(draft);
          if (uiState.showRange !== true || uiState.isValid === true) continue;
          if (uiState.invalidInputKey === 'fromPage') {
            return root._fromInput || null;
          }
          if (uiState.invalidInputKey === 'toPage') {
            return root._toInput || root._fromInput || null;
          }
        }
        return null;
      };

      const syncStartButtonState = () => {
        btnStart.disabled = startValidationInFlight === true
          || currentModel.startDisabled === true
          || hasInvalidPageSelectionDrafts();
      };

      const captureRerenderUiState = () => ({
        scrollTop: panel && typeof panel.scrollTop === 'number'
          ? panel.scrollTop
          : (body && typeof body.scrollTop === 'number' ? body.scrollTop : 0),
        focusedElement: captureFocusableDescriptor(document.activeElement),
      });

      const restoreRerenderUiState = (uiState) => {
        if (!uiState) return;
        if (panel && typeof panel.scrollTop === 'number') {
          panel.scrollTop = uiState.scrollTop;
        } else if (body && typeof body.scrollTop === 'number') {
          body.scrollTop = uiState.scrollTop;
        }
        restoreFocusFromDescriptor(uiState.focusedElement);
        if (panel && typeof panel.scrollTop === 'number') {
          panel.scrollTop = uiState.scrollTop;
        } else if (body && typeof body.scrollTop === 'number') {
          body.scrollTop = uiState.scrollTop;
        }
      };

      const rerender = () => {
        const uiState = captureRerenderUiState();
        currentModel = controller.getViewModel();
        syncPageSelectionDrafts();
        renderCopy(currentModel);
        pageSelectionRoots.clear();
        keepControlRoots.clear();
        unitSelectRoots.clear();
        replaceBodyUnits(
          currentModel.units,
          currentModel.unitCount,
          pageSelectionDrafts,
          pageSelectionRoots,
          keepControlRoots,
          unitSelectRoots
        );
        failurePolicyDefault.checked = currentModel.failurePolicy !== 'omit_failed_and_continue';
        failurePolicyContinue.checked = currentModel.failurePolicy === 'omit_failed_and_continue';
        syncStartButtonState();
        restoreRerenderUiState(uiState);
      };

      const finish = (result) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      const cleanup = () => {
        if (rootListenerBound) {
          body.removeEventListener('click', onBodyClick);
          body.removeEventListener('change', onBodyChange);
          body.removeEventListener('input', onBodyInput);
          rootListenerBound = false;
        }
        btnPresetAll.removeEventListener('click', onPresetAll);
        btnPresetSeparate.removeEventListener('click', onPresetSeparate);
        failurePolicyDefault.removeEventListener('change', onFailurePolicyChanged);
        failurePolicyContinue.removeEventListener('change', onFailurePolicyChanged);
        btnStart.removeEventListener('click', onStart);
        btnCancel.removeEventListener('click', onCancel);
        btnClose.removeEventListener('click', onCancel);
        backdrop.removeEventListener('click', onCancel);
        window.removeEventListener('keydown', onWindowKeyDown);
        modal.setAttribute('aria-hidden', 'true');
        if (previousActiveElement && previousActiveElement !== document.activeElement) {
          focusElementWithoutScroll(previousActiveElement);
        }
      };

      const onPresetAll = () => {
        controller.applyAction({ type: 'apply_preset_all' });
        rerender();
      };
      const onPresetSeparate = () => {
        controller.applyAction({ type: 'apply_preset_separate' });
        rerender();
      };
      const onFailurePolicyChanged = () => {
        controller.applyAction({
          type: 'set_failure_policy',
          failurePolicy: failurePolicyContinue.checked === true
            ? 'omit_failed_and_continue'
            : 'finish_unit_after_last_success',
        });
        currentModel = controller.getViewModel();
        syncStartButtonState();
      };
      const onStart = async () => {
        if (hasInvalidPageSelectionDrafts()) {
          syncStartButtonState();
          const invalidTarget = getFirstInvalidPageSelectionTarget();
          if (invalidTarget && typeof invalidTarget.focus === 'function') {
            invalidTarget.focus();
          }
          return;
        }

        if (typeof controller.validateStart === 'function') {
          startValidationInFlight = true;
          syncStartButtonState();
          let canStart = false;
          try {
            canStart = await controller.validateStart();
          } catch (err) {
            log.error('Batch planning start validation failed unexpectedly:', err);
            window.Notify.notifyMain('renderer.alerts.text_extraction_error');
            canStart = false;
          } finally {
            startValidationInFlight = false;
            if (!settled) {
              currentModel = controller.getViewModel();
              syncStartButtonState();
            }
          }
          if (canStart !== true) {
            return;
          }
        }

        finish({ action: 'start' });
      };
      const onCancel = () => finish(null);
      const onWindowKeyDown = (event) => {
        if (modal.getAttribute('aria-hidden') !== 'false') return;
        if (event.key === 'Escape') {
          event.preventDefault();
          finish(null);
        }
      };

      const onBodyClick = async (event) => {
        const target = event.target && event.target.closest ? event.target.closest('[data-action]') : null;
        if (!target) return;
        const action = target.getAttribute('data-action') || '';
        const inputId = target.getAttribute('data-input-id') || '';
        const unitKey = target.getAttribute('data-unit-key') || '';
        if (action === 'move-unit-up') {
          controller.applyAction({ type: 'move_unit', unitKey, direction: 'up' });
          rerender();
          return;
        }
        if (action === 'move-unit-down') {
          controller.applyAction({ type: 'move_unit', unitKey, direction: 'down' });
          rerender();
          return;
        }
        if (action === 'move-input-up') {
          controller.applyAction({ type: 'move_input', inputId, direction: 'up' });
          rerender();
          return;
        }
        if (action === 'move-input-down') {
          controller.applyAction({ type: 'move_input', inputId, direction: 'down' });
          rerender();
          return;
        }
        if (action === 'remove-input') {
          controller.applyAction({ type: 'remove_input', inputId });
          rerender();
          return;
        }
        if (action === 'edit-tags' && typeof controller.editUnitTags === 'function') {
          await controller.editUnitTags(unitKey);
          rerender();
        }
      };

      const onBodyChange = (event) => {
        const target = event.target;
        if (!target || !target.getAttribute) return;
        const action = target.getAttribute('data-action') || '';
        const inputId = target.getAttribute('data-input-id') || '';
        if (action === 'set-input-route') {
          controller.applyAction({
            type: 'set_input_route',
            inputId,
            route: target.value,
          });
          rerender();
          return;
        }
        if (action === 'assign-input-group') {
          controller.applyAction({
            type: 'assign_input_group',
            inputId,
            groupKey: target.value,
          });
          rerender();
          return;
        }
        if (action === 'toggle-keep') {
          controller.applyAction({
            type: 'set_generated_pdf_policy',
            inputId,
            keepGeneratedPdf: target.checked === true,
          });
          currentModel = controller.getViewModel();
          syncStartButtonState();
          return;
        }
        if (action === 'set-page-mode') {
          const input = findInputById(inputId);
          if (!input || input.canEditPages !== true) return;
          if (target.value === 'all') {
            pageSelectionDrafts.delete(inputId);
            controller.applyAction({
              type: 'set_pdf_page_selection',
              inputId,
              pdfPageSelection: pdfPageSelectionHelper.buildAllPagesSelection(input.pdfTotalPages),
            });
            currentModel = controller.getViewModel();
            refreshPageSelectionControl(inputId, { preserveTypedValues: false });
            refreshKeepControl(inputId);
            syncStartButtonState();
            return;
          }
          const nextDraft = pageSelectionDrafts.get(inputId) || buildPageSelectionDraft(input);
          nextDraft.mode = 'range';
          pageSelectionDrafts.set(inputId, nextDraft);
          const uiState = pdfPageSelectionHelper.getPageSelectionUiState(nextDraft);
          if (uiState.pdfPageSelection) {
            controller.applyAction({
              type: 'set_pdf_page_selection',
              inputId,
              pdfPageSelection: uiState.pdfPageSelection,
            });
            currentModel = controller.getViewModel();
            refreshKeepControl(inputId);
          }
          refreshPageSelectionControl(inputId, { preserveTypedValues: false });
          syncStartButtonState();
        }
      };

      const onBodyInput = (event) => {
        const target = event.target;
        if (!target || !target.getAttribute) return;
        const action = target.getAttribute('data-action') || '';
        if (action === 'rename-unit') {
          controller.applyAction({
            type: 'rename_unit',
            unitKey: target.getAttribute('data-unit-key') || '',
            name: target.value,
          });
          currentModel = controller.getViewModel();
          refreshAllUnitSelectControls();
          return;
        }
        if (action === 'set-page-from' || action === 'set-page-to') {
          const inputId = target.getAttribute('data-input-id') || '';
          const input = findInputById(inputId);
          if (!input || input.canEditPages !== true) return;
          const nextDraft = pageSelectionDrafts.get(inputId) || buildPageSelectionDraft(input);
          nextDraft.mode = 'range';
          nextDraft[action === 'set-page-from' ? 'fromPage' : 'toPage'] = String(target.value || '');
          pageSelectionDrafts.set(inputId, nextDraft);
          const uiState = pdfPageSelectionHelper.getPageSelectionUiState(nextDraft);
          if (uiState.pdfPageSelection) {
            controller.applyAction({
              type: 'set_pdf_page_selection',
              inputId,
              pdfPageSelection: uiState.pdfPageSelection,
            });
            currentModel = controller.getViewModel();
            refreshKeepControl(inputId);
          }
          refreshPageSelectionControl(inputId, { preserveTypedValues: true });
          syncStartButtonState();
        }
      };

      btnPresetAll.addEventListener('click', onPresetAll);
      btnPresetSeparate.addEventListener('click', onPresetSeparate);
      failurePolicyDefault.addEventListener('change', onFailurePolicyChanged);
      failurePolicyContinue.addEventListener('change', onFailurePolicyChanged);
      btnStart.addEventListener('click', onStart);
      btnCancel.addEventListener('click', onCancel);
      btnClose.addEventListener('click', onCancel);
      backdrop.addEventListener('click', onCancel);
      window.addEventListener('keydown', onWindowKeyDown);
      body.addEventListener('click', onBodyClick);
      body.addEventListener('change', onBodyChange);
      body.addEventListener('input', onBodyInput);
      rootListenerBound = true;

      rerender();
      modal.setAttribute('aria-hidden', 'false');
      focusElementWithoutScroll(btnClose || btnPresetAll || btnStart);
      if (panel && typeof panel.scrollTop === 'number') {
        panel.scrollTop = 0;
      } else if (body && typeof body.scrollTop === 'number') {
        body.scrollTop = 0;
      }
    });
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================

  window.Notify.promptTextExtractionBatchPlan = promptBatchPlan;
})();

// =============================================================================
// End of public/js/text_extraction_batch_planning_modal.js
// =============================================================================
