// public/js/text_extraction_batch_flow.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own batch text-extraction planning/execution state in the renderer.
// - Reuse the existing prepare/execute/apply/snapshot contracts for multi-file work.
// - Reuse the shared Issue 266 planner/final-report surfaces and the single-file
//   heavy-PDF synthetic one-unit handoff.
// =============================================================================

(() => {
  // =============================================================================
  // Imports / logger
  // =============================================================================

  if (typeof window.getLogger !== 'function') {
    throw new Error('[text-extraction-batch-flow] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('text-extraction-batch-flow');
  log.debug('Text extraction batch flow starting...');
  if (!window.RendererI18n || typeof window.RendererI18n.tRenderer !== 'function') {
    throw new Error('[text-extraction-batch-flow] RendererI18n.tRenderer unavailable; cannot continue');
  }
  const { tRenderer } = window.RendererI18n;
  const pdfPageSelectionHelper = window.TextExtractionPdfPageSelection || null;
  if (!pdfPageSelectionHelper
    || typeof pdfPageSelectionHelper.buildAllPagesSelection !== 'function'
    || typeof pdfPageSelectionHelper.canonicalizePageSelection !== 'function'
    || typeof pdfPageSelectionHelper.formatPageSelectionSummary !== 'function') {
    throw new Error('[text-extraction-batch-flow] TextExtractionPdfPageSelection dependencies unavailable; cannot continue');
  }
  const snapshotTagCatalog = window.SnapshotTagCatalog || null;
  if (!snapshotTagCatalog || !Array.isArray(snapshotTagCatalog.LANGUAGE_OPTIONS)) {
    throw new Error('[text-extraction-batch-flow] SnapshotTagCatalog unavailable; cannot continue');
  }

  // =============================================================================
  // Constants / config
  // =============================================================================

  const DEFAULT_FAILURE_POLICY = 'finish_unit_after_last_success';
  const ROUTE_NATIVE = 'native';
  const ROUTE_OCR = 'ocr';
  const GROUP_NEW_SENTINEL = '__new__';

  // =============================================================================
  // Shared state
  // =============================================================================

  let deps = null;
  let nextInputId = 1;
  let nextUnitId = 1;

  // =============================================================================
  // Dependency helpers
  // =============================================================================

  function configure(nextDeps = {}) {
    deps = {
      applyTextViaCanonicalPath: null,
      getOptionalElectronMethod: null,
      getOcrLanguage: null,
      guardUserAction: null,
      hasBlockingModalOpen: null,
      hasCurrentTextSubscription: null,
      requestPreparedImport: null,
      textExtractionStatusUi: null,
      ...nextDeps,
    };
  }

  function requireDeps() {
    if (!deps) {
      throw new Error('[text-extraction-batch-flow] configure() must run before batch usage');
    }
    return deps;
  }

  function getOptionalElectronMethod(methodName, options) {
    const { getOptionalElectronMethod: getter } = requireDeps();
    if (typeof getter !== 'function') {
      throw new Error('[text-extraction-batch-flow] getOptionalElectronMethod dependency missing');
    }
    return getter(methodName, options);
  }

  function getStatusUi() {
    const { textExtractionStatusUi } = requireDeps();
    if (!textExtractionStatusUi
      || typeof textExtractionStatusUi.beginPrepare !== 'function'
      || typeof textExtractionStatusUi.endPrepare !== 'function'
      || typeof textExtractionStatusUi.setPendingExecutionContext !== 'function'
      || typeof textExtractionStatusUi.clearPendingExecutionContext !== 'function') {
      throw new Error('[text-extraction-batch-flow] textExtractionStatusUi dependency incomplete');
    }
    return textExtractionStatusUi;
  }

  // =============================================================================
  // Generic helpers
  // =============================================================================

  function normalizeFilePath(rawValue) {
    return typeof rawValue === 'string' ? rawValue.trim() : '';
  }

  function normalizeNonEmptyString(rawValue) {
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    return value || '';
  }

  function normalizeRoute(rawValue) {
    const value = normalizeNonEmptyString(rawValue).toLowerCase();
    return value === ROUTE_NATIVE || value === ROUTE_OCR ? value : '';
  }

  function constrainFileName(rawValue) {
    const value = normalizeNonEmptyString(rawValue);
    if (!value) return '';
    const segments = value.split(/[\\/]+/).filter(Boolean);
    return segments.length ? segments[segments.length - 1] : value;
  }

  function cloneTags(tags) {
    if (!tags || typeof tags !== 'object' || Array.isArray(tags)) return null;
    return { ...tags };
  }

  function cloneSelection(selection) {
    if (!selection || typeof selection !== 'object' || Array.isArray(selection)) return null;
    return { ...selection };
  }

  function cloneArtifactPolicy(policy) {
    if (!policy || typeof policy !== 'object' || Array.isArray(policy)) return null;
    return { ...policy };
  }

  function deepClone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function makeInputId() {
    const inputId = `batch-input-${nextInputId}`;
    nextInputId += 1;
    return inputId;
  }

  function makeGroupKey() {
    const groupKey = `batch-unit-${nextUnitId}`;
    nextUnitId += 1;
    return groupKey;
  }

  function getTagLabel(options, value) {
    const option = options.find((candidate) => candidate.value === value);
    return option ? tRenderer(option.labelKey) : value;
  }

  function formatTagsSummary(tags) {
    const safeTags = tags && typeof tags === 'object' ? tags : null;
    if (!safeTags) return tRenderer('renderer.text_extraction.batch_plan.tags_none');
    const parts = [];
    if (safeTags.language) {
      parts.push(getTagLabel(snapshotTagCatalog.LANGUAGE_OPTIONS, safeTags.language));
    }
    if (safeTags.type) {
      parts.push(getTagLabel(snapshotTagCatalog.TYPE_OPTIONS, safeTags.type));
    }
    if (safeTags.difficulty) {
      parts.push(getTagLabel(snapshotTagCatalog.DIFFICULTY_OPTIONS, safeTags.difficulty));
    }
    return parts.length
      ? parts.join(' · ')
      : tRenderer('renderer.text_extraction.batch_plan.tags_none');
  }

  function getInputAlertCode(input) {
    if (input.prepareOk === false) return input.prepareCode || 'prepare_ipc_failed';
    if (input.prepareFailed === true) {
      return input.prepareErrorCode || 'prepare_failed';
    }
    return '';
  }

  function isInputRemoved(input) {
    return !!(input && input.removed === true);
  }

  function isInputExecutable(input) {
    return !!(input && input.prepareReady === true);
  }

  function isPdfInput(input) {
    return !!(input && input.fileKind === 'pdf');
  }

  function isHeavySplitActive(input) {
    return !!(
      input
      && isInputExecutable(input)
      && isPdfInput(input)
      && input.heavySplitEligible === true
      && input.activeRoute === ROUTE_OCR
    );
  }

  function canEditPages(input) {
    return !!(input && isPdfInput(input) && !isHeavySplitActive(input));
  }

  function getPdfTotalPages(input) {
    const totalPages = input && input.pdfPageSelection && Number.isInteger(Number(input.pdfPageSelection.totalPages))
      && Number(input.pdfPageSelection.totalPages) > 0
      ? Number(input.pdfPageSelection.totalPages)
      : 1;
    return totalPages;
  }

  function canToggleGeneratedPdfPolicy(input) {
    if (!input || !input.generatedPdfArtifactPolicy || !isPdfInput(input)) {
      return false;
    }
    if (isHeavySplitActive(input)) {
      return true;
    }
    return !!(
      input.pdfPageSelection
      && input.pdfPageSelection.mode === 'range'
    );
  }

  function getHeavyUnitKey(input) {
    return `heavy:${input.inputId}`;
  }

  function getInputUnitKey(input) {
    return isHeavySplitActive(input) ? getHeavyUnitKey(input) : input.groupKey;
  }

  function getInputDefaultRoute(preparation) {
    if (!preparation || preparation.ok !== true) return '';
    const chosenRoute = normalizeRoute(preparation.routeMetadata && preparation.routeMetadata.chosenRoute);
    if (chosenRoute) return chosenRoute;
    const routeOptions = Array.isArray(preparation.routeChoiceOptions)
      ? preparation.routeChoiceOptions.map((value) => normalizeRoute(value)).filter(Boolean)
      : [];
    if (routeOptions.includes(ROUTE_NATIVE) && routeOptions.includes(ROUTE_OCR)) {
      return ROUTE_OCR;
    }
    if (routeOptions.length === 1) return routeOptions[0];
    const availableRoutes = Array.isArray(preparation.routeMetadata && preparation.routeMetadata.availableRoutes)
      ? preparation.routeMetadata.availableRoutes.map((value) => normalizeRoute(value)).filter(Boolean)
      : [];
    if (availableRoutes.includes(ROUTE_NATIVE) && availableRoutes.includes(ROUTE_OCR)) {
      return ROUTE_OCR;
    }
    if (availableRoutes.length === 1) return availableRoutes[0];
    return '';
  }

  function formatUnitDisplayLabel(unitIndex) {
    return tRenderer('renderer.text_extraction.batch_plan.unit_label')
      .replace('{index}', String(unitIndex + 1));
  }

  function formatUnitOptionLabel(unitIndex, customName) {
    const displayLabel = formatUnitDisplayLabel(unitIndex);
    const safeCustomName = normalizeNonEmptyString(customName);
    if (!safeCustomName) {
      return displayLabel;
    }
    return `${displayLabel} - ${safeCustomName}`;
  }

  function buildInputModel({ filePath, preparation }) {
    const safePreparation = preparation && typeof preparation === 'object' ? preparation : null;
    const fileInfo = safePreparation && safePreparation.fileInfo && typeof safePreparation.fileInfo === 'object'
      ? safePreparation.fileInfo
      : {};
    const routeMetadata = safePreparation && safePreparation.routeMetadata && typeof safePreparation.routeMetadata === 'object'
      ? safePreparation.routeMetadata
      : {};
    const pdfPageSelection = cloneSelection(safePreparation && safePreparation.pdfPageSelection)
      || (isPdfInput({
        fileKind: routeMetadata.fileKind || fileInfo.sourceFileKind,
      })
        ? pdfPageSelectionHelper.buildAllPagesSelection(routeMetadata.pdfTotalPages || 1)
        : null);
    const generatedPdfArtifactPolicy = cloneArtifactPolicy(safePreparation && safePreparation.generatedPdfArtifactPolicy)
      || (isPdfInput({
        fileKind: routeMetadata.fileKind || fileInfo.sourceFileKind,
      })
        ? { mode: 'delete' }
        : null);
    const heavySplitPreview = routeMetadata.heavySplitPreview
      && typeof routeMetadata.heavySplitPreview === 'object'
      && Array.isArray(routeMetadata.heavySplitPreview.generatedInputs)
        ? deepClone(routeMetadata.heavySplitPreview.generatedInputs)
        : [];

    return {
      inputId: makeInputId(),
      filePath: normalizeFilePath(filePath),
      fileName: constrainFileName(fileInfo.fileName || filePath),
      fileKind: normalizeNonEmptyString(routeMetadata.fileKind || fileInfo.sourceFileKind),
      prepareReady: !!(safePreparation && safePreparation.prepareReady === true),
      prepareFailed: !!(safePreparation && safePreparation.prepareFailed === true),
      prepareOk: !!(safePreparation && safePreparation.ok === true),
      prepareCode: normalizeNonEmptyString(safePreparation && safePreparation.code),
      prepareErrorCode: normalizeNonEmptyString(safePreparation && safePreparation.error && safePreparation.error.code),
      preparation: safePreparation,
      routeOptions: Array.isArray(safePreparation && safePreparation.routeChoiceOptions)
        ? safePreparation.routeChoiceOptions.map((value) => normalizeRoute(value)).filter(Boolean)
        : (Array.isArray(routeMetadata.availableRoutes)
          ? routeMetadata.availableRoutes.map((value) => normalizeRoute(value)).filter(Boolean)
          : []),
      activeRoute: getInputDefaultRoute(safePreparation),
      pdfPageSelection,
      generatedPdfArtifactPolicy,
      heavySplitEligible: routeMetadata.heavySplitEligible === true,
      heavySplitPreview,
      removed: false,
      groupKey: null,
    };
  }

  function syncUnitMetadata(state) {
    const visibleUnitKeys = [];
    state.inputs.forEach((input) => {
      if (isInputRemoved(input)) return;
      const unitKey = getInputUnitKey(input);
      if (!unitKey) return;
      if (!visibleUnitKeys.includes(unitKey)) {
        visibleUnitKeys.push(unitKey);
      }
      if (!state.unitMetaByKey[unitKey]) {
        state.unitMetaByKey[unitKey] = {
          customName: '',
          tags: null,
        };
      }
    });

    const nextUnitOrder = [];
    state.unitOrder.forEach((unitKey) => {
      if (visibleUnitKeys.includes(unitKey) && !nextUnitOrder.includes(unitKey)) {
        nextUnitOrder.push(unitKey);
      }
    });
    visibleUnitKeys.forEach((unitKey) => {
      if (!nextUnitOrder.includes(unitKey)) {
        nextUnitOrder.push(unitKey);
      }
    });
    state.unitOrder = nextUnitOrder;

    Object.keys(state.unitMetaByKey).forEach((unitKey) => {
      if (!visibleUnitKeys.includes(unitKey)) {
        delete state.unitMetaByKey[unitKey];
      }
    });
  }

  function createPlannerState(inputs, {
    flowKind = 'batch',
    source = 'picker',
  } = {}) {
    const state = {
      flowKind,
      source,
      inputs: inputs.map((input) => ({ ...input })),
      unitMetaByKey: {},
      unitOrder: [],
      failurePolicy: DEFAULT_FAILURE_POLICY,
    };

    state.inputs.forEach((input) => {
      if (isInputRemoved(input) || isHeavySplitActive(input)) return;
      input.groupKey = makeGroupKey();
    });
    syncUnitMetadata(state);
    return state;
  }

  function getOrdinaryInputs(state) {
    return state.inputs.filter((input) => !isInputRemoved(input) && !isHeavySplitActive(input));
  }

  function getPlannedOcrInputs(state) {
    return state.inputs.filter((input) => (
      !isInputRemoved(input)
      && isInputExecutable(input)
      && normalizeRoute(input.activeRoute) === ROUTE_OCR
    ));
  }

  function getVisibleUnits(state) {
    return state.unitOrder
      .map((unitKey, unitIndex) => {
        const unitInputs = state.inputs.filter((input) => !isInputRemoved(input) && getInputUnitKey(input) === unitKey);
        if (!unitInputs.length) return null;
        const exclusiveHeavy = unitKey.startsWith('heavy:');
        const unitMeta = state.unitMetaByKey[unitKey] || {};
        const sourceInput = unitInputs[0];
        const customName = normalizeNonEmptyString(unitMeta.customName);
        const title = customName
          || (exclusiveHeavy ? sourceInput.fileName : `unit_${unitIndex + 1}`);
        return {
          unitKey,
          title,
          customName,
          displayLabel: exclusiveHeavy ? sourceInput.fileName : formatUnitDisplayLabel(unitIndex),
          optionLabel: exclusiveHeavy ? sourceInput.fileName : formatUnitOptionLabel(unitIndex, customName),
          tags: cloneTags(unitMeta.tags),
          exclusiveHeavy,
          inputs: unitInputs,
          canConfigureTags: state.unitOrder.length > 1,
          generatedInputsPreview: exclusiveHeavy ? deepClone(sourceInput.heavySplitPreview) : [],
        };
      })
      .filter(Boolean);
  }

  function hasExecutableInputs(state) {
    return state.inputs.some((input) => !isInputRemoved(input) && isInputExecutable(input));
  }

  function getUnresolvedExecutableInputCount(state) {
    return state.inputs.filter((input) => (
      !isInputRemoved(input)
      && isInputExecutable(input)
      && !normalizeRoute(input.activeRoute)
    )).length;
  }

  function applyPresetAllTogether(state) {
    const ordinaryInputs = getOrdinaryInputs(state);
    if (!ordinaryInputs.length) return;
    const nextGroupKey = makeGroupKey();
    state.unitMetaByKey[nextGroupKey] = {
      customName: '',
      tags: null,
    };
    ordinaryInputs.forEach((input) => {
      input.groupKey = nextGroupKey;
    });
    syncUnitMetadata(state);
  }

  function applyPresetEachSeparately(state) {
    getOrdinaryInputs(state).forEach((input) => {
      const groupKey = makeGroupKey();
      input.groupKey = groupKey;
      state.unitMetaByKey[groupKey] = {
        customName: '',
        tags: null,
      };
    });
    syncUnitMetadata(state);
  }

  function setInputRoute(state, inputId, nextRoute) {
    const input = state.inputs.find((candidate) => candidate.inputId === inputId);
    if (!input) return;
    const normalizedRoute = normalizeRoute(nextRoute);
    if (!normalizedRoute) return;
    const wasHeavy = isHeavySplitActive(input);
    input.activeRoute = normalizedRoute;
    const isHeavy = isHeavySplitActive(input);
    if (wasHeavy !== isHeavy && isPdfInput(input)) {
      input.pdfPageSelection = pdfPageSelectionHelper.buildAllPagesSelection(
        input.pdfPageSelection && input.pdfPageSelection.totalPages
          ? input.pdfPageSelection.totalPages
          : (input.preparation
            && input.preparation.routeMetadata
            && input.preparation.routeMetadata.pdfTotalPages)
      );
    }
    if (!input.groupKey && !isHeavy) {
      input.groupKey = makeGroupKey();
    }
    syncUnitMetadata(state);
  }

  function moveUnit(state, unitKey, direction) {
    const currentIndex = state.unitOrder.indexOf(unitKey);
    if (currentIndex < 0) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= state.unitOrder.length) return;
    const nextOrder = [...state.unitOrder];
    nextOrder.splice(currentIndex, 1);
    nextOrder.splice(targetIndex, 0, unitKey);
    state.unitOrder = nextOrder;
  }

  function moveInputWithinUnit(state, inputId, direction) {
    const currentIndex = state.inputs.findIndex((candidate) => candidate.inputId === inputId);
    if (currentIndex < 0) return;
    const input = state.inputs[currentIndex];
    const unitKey = getInputUnitKey(input);
    const unitIndexes = state.inputs
      .map((candidate, index) => ({ candidate, index }))
      .filter(({ candidate }) => !isInputRemoved(candidate) && getInputUnitKey(candidate) === unitKey);
    const unitPosition = unitIndexes.findIndex(({ candidate }) => candidate.inputId === inputId);
    if (unitPosition < 0) return;
    const swapWithPosition = direction === 'up' ? unitPosition - 1 : unitPosition + 1;
    if (swapWithPosition < 0 || swapWithPosition >= unitIndexes.length) return;
    const swapIndex = unitIndexes[swapWithPosition].index;
    const nextInputs = [...state.inputs];
    const temp = nextInputs[currentIndex];
    nextInputs[currentIndex] = nextInputs[swapIndex];
    nextInputs[swapIndex] = temp;
    state.inputs = nextInputs;
  }

  function removeInput(state, inputId) {
    const input = state.inputs.find((candidate) => candidate.inputId === inputId);
    if (!input) return;
    input.removed = true;
    syncUnitMetadata(state);
  }

  function assignInputGroup(state, inputId, groupKey) {
    const input = state.inputs.find((candidate) => candidate.inputId === inputId);
    if (!input || isHeavySplitActive(input)) return;
    let nextGroupKey = groupKey;
    if (groupKey === GROUP_NEW_SENTINEL) {
      nextGroupKey = makeGroupKey();
      state.unitMetaByKey[nextGroupKey] = {
        customName: '',
        tags: null,
      };
    }
    input.groupKey = nextGroupKey;
    syncUnitMetadata(state);
  }

  function renameUnit(state, unitKey, name) {
    if (!state.unitMetaByKey[unitKey]) return;
    state.unitMetaByKey[unitKey].customName = normalizeNonEmptyString(name);
  }

  function setUnitTags(state, unitKey, tags) {
    if (!state.unitMetaByKey[unitKey]) return;
    state.unitMetaByKey[unitKey].tags = cloneTags(tags);
  }

  function setFailurePolicy(state, failurePolicy) {
    state.failurePolicy = failurePolicy === 'omit_failed_and_continue'
      ? 'omit_failed_and_continue'
      : DEFAULT_FAILURE_POLICY;
  }

  function setGeneratedPdfPolicy(state, inputId, keepGeneratedPdf) {
    const input = state.inputs.find((candidate) => candidate.inputId === inputId);
    if (!input || !input.generatedPdfArtifactPolicy) return;
    input.generatedPdfArtifactPolicy = {
      mode: keepGeneratedPdf === true ? 'keep' : 'delete',
    };
  }

  function setPdfPageSelection(state, inputId, nextPdfPageSelection) {
    const input = state.inputs.find((candidate) => candidate.inputId === inputId);
    if (!input || !canEditPages(input) || !nextPdfPageSelection) return;
    const totalPages = getPdfTotalPages(input);
    const canonicalSelection = pdfPageSelectionHelper.canonicalizePageSelection(nextPdfPageSelection, {
      totalPages,
    });
    if (!canonicalSelection) {
      return;
    }
    input.pdfPageSelection = canonicalSelection;
  }

  function buildPlannerViewModel(state) {
    syncUnitMetadata(state);
    const units = getVisibleUnits(state);
    const ordinaryUnitOptions = units
      .filter((unit) => unit.exclusiveHeavy !== true)
      .map((unit) => ({
        unitKey: unit.unitKey,
        label: unit.optionLabel,
      }));
    const unresolvedExecutableInputCount = getUnresolvedExecutableInputCount(state);
    const startDisabled = !hasExecutableInputs(state) || unresolvedExecutableInputCount > 0;

    return {
      flowKind: state.flowKind,
      failurePolicy: state.failurePolicy,
      startDisabled,
      unitCount: units.length,
      units: units.map((unit, unitIndex) => ({
        unitKey: unit.unitKey,
        title: unit.title,
        customName: unit.customName,
        displayLabel: unit.displayLabel,
        tagsSummary: formatTagsSummary(unit.tags),
        exclusiveHeavy: unit.exclusiveHeavy,
        canConfigureTags: unit.canConfigureTags,
        canMoveUp: unitIndex > 0,
        canMoveDown: unitIndex < (units.length - 1),
        generatedInputsPreview: unit.generatedInputsPreview,
        inputs: unit.inputs.map((input, inputIndex) => ({
          inputId: input.inputId,
          fileName: input.fileName,
          alertCode: getInputAlertCode(input),
          activeRoute: normalizeRoute(input.activeRoute),
          routeOptions: [...input.routeOptions],
          pagesSummary: input.pdfPageSelection
            ? pdfPageSelectionHelper.formatPageSelectionSummary(input.pdfPageSelection, {
              allKey: 'renderer.text_extraction.batch_plan.pages_all',
              rangeKey: 'renderer.text_extraction.batch_plan.pages_range',
            })
            : '',
          canEditPages: canEditPages(input),
          pdfPageSelection: cloneSelection(input.pdfPageSelection),
          pdfTotalPages: getPdfTotalPages(input),
          canToggleKeep: canToggleGeneratedPdfPolicy(input),
          keepGeneratedPdf: !!(input.generatedPdfArtifactPolicy && input.generatedPdfArtifactPolicy.mode === 'keep'),
          groupKey: input.groupKey,
          canMoveUp: inputIndex > 0,
          canMoveDown: inputIndex < (unit.inputs.length - 1),
          groupOptions: ordinaryUnitOptions,
          heavySplitActive: isHeavySplitActive(input),
        })),
      })),
    };
  }

  function buildPlannerController(initialState) {
    const state = initialState;
    return {
      getViewModel() {
        return buildPlannerViewModel(state);
      },
      getFinalState() {
        syncUnitMetadata(state);
        return deepClone(state);
      },
      async validateStart() {
        syncUnitMetadata(state);
        return validateBatchStart(state);
      },
      applyAction(action = {}) {
        const type = normalizeNonEmptyString(action.type);
        if (type === 'apply_preset_all') {
          applyPresetAllTogether(state);
        } else if (type === 'apply_preset_separate') {
          applyPresetEachSeparately(state);
        } else if (type === 'set_failure_policy') {
          setFailurePolicy(state, action.failurePolicy);
        } else if (type === 'set_input_route') {
          setInputRoute(state, action.inputId, action.route);
        } else if (type === 'move_unit') {
          moveUnit(state, action.unitKey, action.direction);
        } else if (type === 'move_input') {
          moveInputWithinUnit(state, action.inputId, action.direction);
        } else if (type === 'remove_input') {
          removeInput(state, action.inputId);
        } else if (type === 'assign_input_group') {
          assignInputGroup(state, action.inputId, action.groupKey);
        } else if (type === 'rename_unit') {
          renameUnit(state, action.unitKey, action.name);
        } else if (type === 'set_generated_pdf_policy') {
          setGeneratedPdfPolicy(state, action.inputId, action.keepGeneratedPdf);
        } else if (type === 'set_pdf_page_selection') {
          setPdfPageSelection(state, action.inputId, action.pdfPageSelection);
        }
      },
      async editUnitTags(unitKey) {
        const currentTags = state.unitMetaByKey[unitKey] ? state.unitMetaByKey[unitKey].tags : null;
        const nextTags = await window.Notify.promptSnapshotSaveTags({
          initialTags: currentTags || null,
          copy: {
            titleKey: 'renderer.text_extraction.batch_plan.tags_modal.title',
            messageKey: 'renderer.text_extraction.batch_plan.tags_modal.message',
            confirmKey: 'renderer.text_extraction.batch_plan.tags_modal.confirm_button',
            cancelKey: 'renderer.snapshot_save_tags.buttons.cancel',
            closeAriaKey: 'renderer.text_extraction.batch_plan.tags_modal.close_aria',
          },
        });
        if (!nextTags) return;
        setUnitTags(state, unitKey, nextTags.tags || null);
      },
    };
  }

  // =============================================================================
  // Planning / execution helpers
  // =============================================================================

  async function preparePlanInputs(filePaths) {
    const {
      getOcrLanguage,
      requestPreparedImport,
    } = requireDeps();
    const prepareTextExtractionSelectedFile = getOptionalElectronMethod('prepareTextExtractionSelectedFile', {
      dedupeKey: 'renderer.ipc.prepareTextExtractionSelectedFile.unavailable',
      unavailableMessage: 'prepareTextExtractionSelectedFile unavailable; batch planning cannot continue.',
    });
    if (!prepareTextExtractionSelectedFile) {
      return null;
    }
    if (typeof requestPreparedImport !== 'function') {
      throw new Error('[text-extraction-batch-flow] requestPreparedImport dependency missing');
    }

    const inputs = [];
    for (const filePath of filePaths) {
      const preparationRun = await requestPreparedImport({
        prepareTextExtractionSelectedFile,
        preparationRequest: {
          filePath,
          ocrLanguage: typeof getOcrLanguage === 'function' ? (getOcrLanguage() || '') : '',
          planningMode: 'batch',
          pdfPageSelection: null,
          generatedPdfArtifactPolicy: null,
        },
      });
      const preparation = preparationRun ? preparationRun.preparation : null;
      inputs.push(buildInputModel({
        filePath,
        preparation,
      }));
    }
    return inputs;
  }

  function resolvePreconditionFailure(preconditions) {
    if (!preconditions || preconditions.ok === false) {
      window.Notify.notifyMain('renderer.alerts.text_extraction_precondition_error');
      return true;
    }
    if (!preconditions.canStart) {
      window.Notify.notifyMain(preconditions.guidanceKey || 'renderer.alerts.text_extraction_precondition_blocked');
      return true;
    }
    return false;
  }

  function mapBatchOcrBlockedAlertKey(availabilityResult) {
    const code = availabilityResult && typeof availabilityResult.code === 'string'
      ? availabilityResult.code
      : '';
    if (code === 'ocr_activation_required') {
      return 'renderer.alerts.text_extraction_batch_ocr_activation_required';
    }
    if (code === 'ocr_token_state_invalid') {
      return 'renderer.alerts.text_extraction_batch_ocr_token_state_invalid';
    }
    return 'renderer.alerts.text_extraction_batch_ocr_unavailable';
  }

  async function validateBatchStart(state) {
    const plannedOcrInputs = getPlannedOcrInputs(state);
    if (!plannedOcrInputs.length) {
      return true;
    }

    const checkTextExtractionOcrAvailability = getOptionalElectronMethod('checkTextExtractionOcrAvailability', {
      dedupeKey: 'renderer.ipc.checkTextExtractionOcrAvailability.unavailable',
      unavailableMessage: 'checkTextExtractionOcrAvailability unavailable; batch OCR start check cannot continue.',
    });
    if (!checkTextExtractionOcrAvailability) {
      window.Notify.notifyMain('renderer.alerts.text_extraction_error');
      return false;
    }

    let availabilityResult = null;
    try {
      availabilityResult = await checkTextExtractionOcrAvailability();
    } catch (err) {
      log.error('Batch OCR availability check failed unexpectedly:', err);
      window.Notify.notifyMain('renderer.alerts.text_extraction_error');
      return false;
    }

    if (availabilityResult && availabilityResult.ok === true && availabilityResult.available === true) {
      return true;
    }

    log.warn('Batch OCR start blocked because OCR is unavailable for the final plan:', {
      ocrInputCount: plannedOcrInputs.length,
      code: availabilityResult && availabilityResult.code ? availabilityResult.code : '',
      state: availabilityResult && availabilityResult.state ? availabilityResult.state : '',
    });
    window.Notify.notifyMain(mapBatchOcrBlockedAlertKey(availabilityResult));
    return false;
  }

  function mapPreparedIdInvalidReason(execution) {
    if (!execution || execution.code !== 'PREPARED_ID_INVALID') {
      return 'prepared_id_invalid';
    }
    if (execution.invalidReason === 'fingerprint_mismatch') {
      return 'fingerprint_mismatch';
    }
    return 'prepared_id_invalid';
  }

  async function applyExecutionText(mode, textToApply) {
    const {
      applyTextViaCanonicalPath,
      hasCurrentTextSubscription,
    } = requireDeps();
    if (typeof applyTextViaCanonicalPath !== 'function') {
      return { ok: false, code: 'apply_unavailable' };
    }
    if (typeof hasCurrentTextSubscription !== 'function' || !hasCurrentTextSubscription()) {
      return { ok: false, code: 'apply_unavailable' };
    }
    return applyTextViaCanonicalPath({
      mode,
      textToApply,
      repeatCount: 1,
    });
  }

  async function autoSaveUnitSnapshot(unitName, tags) {
    if (!window.electronAPI || typeof window.electronAPI.saveCurrentTextSnapshot !== 'function') {
      return { ok: false, code: 'WRITE_FAILED' };
    }
    return window.electronAPI.saveCurrentTextSnapshot({
      nonInteractive: true,
      autoFileBaseName: unitName,
      tags: tags || null,
    });
  }

  function formatSnapshotResultText(key, replacements = {}) {
    let text = tRenderer(key);
    Object.keys(replacements).forEach((name) => {
      text = text.replace(`{${name}}`, String(replacements[name]));
    });
    return text;
  }

  function buildUnitResultLine(unitSnapshotResult) {
    if (!unitSnapshotResult || unitSnapshotResult.required !== true) {
      return {
        state: 'not_created',
        text: formatSnapshotResultText('renderer.text_extraction.batch_report.snapshot_not_created'),
      };
    }
    if (unitSnapshotResult.result && unitSnapshotResult.result.ok === true) {
      return {
        state: 'saved',
        text: formatSnapshotResultText(
          'renderer.text_extraction.batch_report.snapshot_created',
          { filename: unitSnapshotResult.result.filename }
        ),
      };
    }
    return {
      state: 'failed',
      text: formatSnapshotResultText(
        'renderer.text_extraction.batch_report.snapshot_creation_failed',
        {
          code: unitSnapshotResult.result && unitSnapshotResult.result.code
            ? unitSnapshotResult.result.code
            : 'WRITE_FAILED',
        }
      ),
    };
  }

  function buildInputReportRecord({
    fileName,
    state,
    code = '',
    generatedInputs = [],
    generatedPdfArtifact = null,
  }) {
    return {
      fileName,
      state,
      code,
      generatedInputs,
      generatedPdfArtifact,
    };
  }

  function mapExecutionResultStateToReportState(executionResult) {
    const state = executionResult && typeof executionResult.state === 'string'
      ? executionResult.state
      : '';
    if (state === 'success') return 'success';
    if (state === 'cancelled') return 'cancelled';
    if (state === 'omitted') return 'omitted';
    return 'failed';
  }

  function appendExecutionResultToUnitReport({
    unitReport,
    input,
    executionResult,
    heavyGeneratedInputs,
  }) {
    if (!unitReport || !input || !executionResult) {
      return;
    }

    if (unitReport.exclusiveHeavy === true
      && Array.isArray(heavyGeneratedInputs)
      && heavyGeneratedInputs.length) {
      unitReport.heavyGeneratedInputRows = true;
      unitReport.sourceFileName = input.fileName;
      unitReport.overallState = mapExecutionResultStateToReportState(executionResult);
      unitReport.overallCode = executionResult.error && executionResult.error.code
        ? executionResult.error.code
        : '';
      heavyGeneratedInputs.forEach((generatedInput) => {
        unitReport.inputs.push(buildInputReportRecord({
          fileName: generatedInput.fileName,
          state: generatedInput.state,
          code: generatedInput.code,
          generatedPdfArtifact: generatedInput.generatedPdfArtifact,
        }));
      });
      return;
    }

    unitReport.inputs.push(buildInputReportRecord({
      fileName: input.fileName,
      state: executionResult.state === 'success' ? 'success' : 'failed',
      code: executionResult.error && executionResult.error.code ? executionResult.error.code : '',
      generatedInputs: heavyGeneratedInputs,
      generatedPdfArtifact: executionResult.generatedPdfArtifact || null,
    }));
  }

  function buildBatchProcessingContext({
    unitIndex,
    unitCount,
    inputIndex,
    inputCount,
    selectedRoute,
    processingInputFileName,
    processingInputSource = 'original_selected_file',
  }) {
    return {
      unitIndex,
      unitCount,
      inputIndex,
      inputCount,
      selectedRoute,
      processingInputFileName,
      processingInputSource,
    };
  }

  function appendOmittedInputsToUnitReport(unitReport, unitInputs, startIndex) {
    for (let index = startIndex; index < unitInputs.length; index += 1) {
      unitReport.inputs.push(buildInputReportRecord({
        fileName: unitInputs[index].fileName,
        state: 'omitted',
        code: 'omitted',
      }));
    }
  }

  function appendRemainingOmittedUnits(finalReport, units, startUnitIndex) {
    for (let unitIndex = startUnitIndex; unitIndex < units.length; unitIndex += 1) {
      const unit = units[unitIndex];
      finalReport.units.push({
        unitTitle: unit.title,
        exclusiveHeavy: unit.exclusiveHeavy,
        sourceFileName: unit.exclusiveHeavy && unit.inputs[0] ? unit.inputs[0].fileName : '',
        overallState: '',
        overallCode: '',
        heavyGeneratedInputRows: false,
        inputs: unit.inputs.map((input) => buildInputReportRecord({
          fileName: input.fileName,
          state: 'omitted',
          code: 'omitted',
        })),
        snapshotResult: buildUnitResultLine({
          required: false,
          result: null,
        }),
      });
    }
  }

  async function isProcessingSessionActive(getTextExtractionProcessingMode) {
    if (typeof getTextExtractionProcessingMode !== 'function') {
      return false;
    }
    const stateResult = await getTextExtractionProcessingMode();
    return !!(stateResult && stateResult.ok === true && stateResult.state && stateResult.state.active === true);
  }

  async function runBatchExecution(state) {
    const {
      getOcrLanguage,
      requestPreparedImport,
    } = requireDeps();
    const textExtractionStatusUi = getStatusUi();
    const prepareTextExtractionSelectedFile = getOptionalElectronMethod('prepareTextExtractionSelectedFile', {
      dedupeKey: 'renderer.ipc.prepareTextExtractionSelectedFile.unavailable',
      unavailableMessage: 'prepareTextExtractionSelectedFile unavailable; batch execution cannot continue.',
    });
    const executePreparedTextExtraction = getOptionalElectronMethod('executePreparedTextExtraction', {
      dedupeKey: 'renderer.ipc.executePreparedTextExtraction.unavailable',
      unavailableMessage: 'executePreparedTextExtraction unavailable; batch execution cannot continue.',
    });
    const getTextExtractionProcessingMode = getOptionalElectronMethod('getTextExtractionProcessingMode', {
      dedupeKey: 'renderer.ipc.getTextExtractionProcessingMode.unavailable',
      unavailableMessage: 'getTextExtractionProcessingMode unavailable; batch execution cannot continue.',
    });
    const enterTextExtractionProcessingSession = getOptionalElectronMethod('enterTextExtractionProcessingSession', {
      dedupeKey: 'renderer.ipc.enterTextExtractionProcessingSession.unavailable',
      unavailableMessage: 'enterTextExtractionProcessingSession unavailable; batch execution cannot continue.',
    });
    const updateTextExtractionProcessingSession = getOptionalElectronMethod('updateTextExtractionProcessingSession', {
      dedupeKey: 'renderer.ipc.updateTextExtractionProcessingSession.unavailable',
      unavailableMessage: 'updateTextExtractionProcessingSession unavailable; batch execution cannot continue.',
    });
    const exitTextExtractionProcessingSession = getOptionalElectronMethod('exitTextExtractionProcessingSession', {
      dedupeKey: 'renderer.ipc.exitTextExtractionProcessingSession.unavailable',
      unavailableMessage: 'exitTextExtractionProcessingSession unavailable; batch execution cannot continue.',
    });
    if (!prepareTextExtractionSelectedFile
      || !executePreparedTextExtraction
      || !getTextExtractionProcessingMode
      || !enterTextExtractionProcessingSession
      || !updateTextExtractionProcessingSession
      || !exitTextExtractionProcessingSession) {
      window.Notify.notifyMain('renderer.alerts.text_extraction_error');
      return;
    }

    const units = getVisibleUnits(state);
    const finalReport = {
      flowKind: state.flowKind,
      units: [],
      hadOutput: false,
    };
    const initialContext = units.length && units[0] && units[0].inputs.length
      ? buildBatchProcessingContext({
        unitIndex: 1,
        unitCount: units.length,
        inputIndex: 1,
        inputCount: units[0].inputs.length,
        selectedRoute: units[0].inputs[0].activeRoute,
        processingInputFileName: units[0].inputs[0].fileName,
      })
      : buildBatchProcessingContext({
        unitIndex: 1,
        unitCount: 1,
        inputIndex: 1,
        inputCount: 1,
        selectedRoute: '',
        processingInputFileName: '',
      });
    const sessionEnterResult = await enterTextExtractionProcessingSession({
      source: 'text_extraction_batch_execution',
      reason: 'batch_execution_session',
      ...initialContext,
    });
    if (!sessionEnterResult || sessionEnterResult.ok !== true) {
      window.Notify.notifyMain('renderer.alerts.text_extraction_error');
      return;
    }

    let batchCancelled = false;

    try {
      for (let unitIndex = 0; unitIndex < units.length; unitIndex += 1) {
        const unit = units[unitIndex];
        const unitReport = {
          unitTitle: unit.title,
          exclusiveHeavy: unit.exclusiveHeavy,
          sourceFileName: unit.exclusiveHeavy && unit.inputs[0] ? unit.inputs[0].fileName : '',
          overallState: '',
          overallCode: '',
          heavyGeneratedInputRows: false,
          inputs: [],
          snapshotResult: null,
        };
        let unitProducedText = false;
        let closeUnitAfterFailure = false;

        for (let inputIndex = 0; inputIndex < unit.inputs.length; inputIndex += 1) {
          const input = unit.inputs[inputIndex];
          if (closeUnitAfterFailure) {
            unitReport.inputs.push(buildInputReportRecord({
              fileName: input.fileName,
              state: 'omitted',
              code: 'omitted',
            }));
            continue;
          }

          const sessionUpdateResult = await updateTextExtractionProcessingSession(buildBatchProcessingContext({
            unitIndex: unitIndex + 1,
            unitCount: units.length,
            inputIndex: inputIndex + 1,
            inputCount: unit.inputs.length,
            selectedRoute: input.activeRoute,
            processingInputFileName: input.fileName,
            processingInputSource: 'original_selected_file',
          }));
          if (!sessionUpdateResult || sessionUpdateResult.ok !== true) {
            batchCancelled = true;
            unitReport.inputs.push(buildInputReportRecord({
              fileName: input.fileName,
              state: 'failed',
              code: 'aborted_by_user',
            }));
            appendOmittedInputsToUnitReport(unitReport, unit.inputs, inputIndex + 1);
            break;
          }

          const executionSelection = isHeavySplitActive(input)
            ? pdfPageSelectionHelper.buildAllPagesSelection(input.pdfPageSelection && input.pdfPageSelection.totalPages)
            : cloneSelection(input.pdfPageSelection);
          const preparationRequest = {
            filePath: input.filePath,
            ocrLanguage: typeof getOcrLanguage === 'function' ? (getOcrLanguage() || '') : '',
            planningMode: 'batch',
            forceHeavySplitFullSource: isHeavySplitActive(input),
            pdfPageSelection: executionSelection,
            generatedPdfArtifactPolicy: cloneArtifactPolicy(input.generatedPdfArtifactPolicy),
          };

          const preparationRun = await requestPreparedImport({
            prepareTextExtractionSelectedFile,
            preparationRequest,
          });
          if (!(await isProcessingSessionActive(getTextExtractionProcessingMode))) {
            batchCancelled = true;
            unitReport.inputs.push(buildInputReportRecord({
              fileName: input.fileName,
              state: 'failed',
              code: 'aborted_by_user',
            }));
            appendOmittedInputsToUnitReport(unitReport, unit.inputs, inputIndex + 1);
            break;
          }

          const executionPreparation = preparationRun ? preparationRun.preparation : null;
          if (!executionPreparation || executionPreparation.ok !== true || executionPreparation.prepareReady !== true) {
            const failureCode = executionPreparation && executionPreparation.prepareFailed === true
              ? (executionPreparation.error && executionPreparation.error.code ? executionPreparation.error.code : 'prepare_failed')
              : 'prepare_failed';
            unitReport.inputs.push(buildInputReportRecord({
              fileName: input.fileName,
              state: 'failed',
              code: failureCode,
            }));
            if (state.failurePolicy !== 'omit_failed_and_continue') {
              closeUnitAfterFailure = true;
            }
            continue;
          }

          textExtractionStatusUi.setPendingExecutionContext({
            preparation: executionPreparation,
            routePreference: input.activeRoute,
            fileName: input.fileName,
            processingInputFileName: executionPreparation.processingInputFileName,
          });
          const execution = await executePreparedTextExtraction({
            prepareId: executionPreparation.prepareId,
            routePreference: input.activeRoute,
            reuseActiveProcessingLock: true,
            heavySplitFailurePolicy: state.failurePolicy,
            processingContext: buildBatchProcessingContext({
              unitIndex: unitIndex + 1,
              unitCount: units.length,
              inputIndex: inputIndex + 1,
              inputCount: unit.inputs.length,
              selectedRoute: input.activeRoute,
              processingInputFileName: executionPreparation.processingInputFileName || input.fileName,
              processingInputSource: 'original_selected_file',
            }),
          });
          textExtractionStatusUi.clearPendingExecutionContext();

          if (!execution || execution.ok !== true || !execution.result) {
            const failureCode = execution && execution.code === 'PREPARED_ID_INVALID'
              ? mapPreparedIdInvalidReason(execution)
              : (execution && execution.code ? String(execution.code).toLowerCase() : 'execution_failed');
            unitReport.inputs.push(buildInputReportRecord({
              fileName: input.fileName,
              state: 'failed',
              code: failureCode,
            }));
            if (failureCode === 'active_session_required') {
              batchCancelled = true;
              appendOmittedInputsToUnitReport(unitReport, unit.inputs, inputIndex + 1);
              break;
            }
            if (state.failurePolicy !== 'omit_failed_and_continue') {
              closeUnitAfterFailure = true;
            }
            continue;
          }

          const isCancelled = execution.result.state === 'cancelled';
          const isSuccess = execution.result.state === 'success';
          const hasText = isSuccess && typeof execution.result.text === 'string' && execution.result.text.length > 0;
          if (hasText) {
            const applyMode = unitProducedText ? 'append' : 'overwrite';
            const applyResult = await applyExecutionText(applyMode, execution.result.text);
            if (!applyResult || applyResult.ok !== true) {
              unitReport.inputs.push(buildInputReportRecord({
                fileName: input.fileName,
                state: 'failed',
                code: applyResult && applyResult.code ? applyResult.code : 'apply_failed',
              }));
              if (state.failurePolicy !== 'omit_failed_and_continue') {
                closeUnitAfterFailure = true;
              }
              continue;
            }
            unitProducedText = true;
            finalReport.hadOutput = true;
          }

          const heavyGeneratedInputs = execution.result.heavySplitExecution
            && Array.isArray(execution.result.heavySplitExecution.generatedInputs)
              ? execution.result.heavySplitExecution.generatedInputs.map((generatedInput) => ({
                fileName: generatedInput.fileName,
                state: generatedInput.state === 'success'
                  ? 'success'
                  : (generatedInput.state === 'omitted'
                    ? 'omitted'
                    : 'failed'),
                code: generatedInput.errorCode || '',
                generatedPdfArtifact: generatedInput.generatedPdfArtifact || null,
              }))
              : [];

          appendExecutionResultToUnitReport({
            unitReport,
            input,
            executionResult: execution.result,
            heavyGeneratedInputs,
          });

          if (isCancelled) {
            batchCancelled = true;
            appendOmittedInputsToUnitReport(unitReport, unit.inputs, inputIndex + 1);
            break;
          }

          if (!isSuccess && state.failurePolicy !== 'omit_failed_and_continue') {
            closeUnitAfterFailure = true;
          }
        }

        const snapshotRequired = units.length > 1 && unitProducedText;
        const snapshotResult = snapshotRequired
          ? await autoSaveUnitSnapshot(unit.title, unit.tags)
          : null;
        unitReport.snapshotResult = buildUnitResultLine({
          required: snapshotRequired,
          result: snapshotResult,
        });
        finalReport.units.push(unitReport);

        if (batchCancelled) {
          appendRemainingOmittedUnits(finalReport, units, unitIndex + 1);
          break;
        }
      }
    } finally {
      textExtractionStatusUi.clearPendingExecutionContext();
      try {
        await exitTextExtractionProcessingSession({
          source: 'text_extraction_batch_execution',
          reason: batchCancelled ? 'batch_execution_cancelled' : 'batch_execution_completed',
        });
      } catch (err) {
        log.warn('Batch processing session exit failed (ignored):', err);
      }
    }

    const openSnapshotsFolder = async () => {
      if (!window.electronAPI || typeof window.electronAPI.openCurrentTextSnapshotsFolder !== 'function') {
        throw new Error('openCurrentTextSnapshotsFolder unavailable');
      }
      const result = await window.electronAPI.openCurrentTextSnapshotsFolder();
      if (!result || result.ok !== true) {
        throw new Error('openCurrentTextSnapshotsFolder failed');
      }
    };

    await window.Notify.promptTextExtractionBatchFinalReport({
      report: finalReport,
      elapsedValueText: textExtractionStatusUi.getFinalElapsedValueText(),
      onRevealGeneratedPdf: async (artifactPath) => {
        const revealTextExtractionGeneratedPdf = getOptionalElectronMethod('revealTextExtractionGeneratedPdf', {
          dedupeKey: 'renderer.ipc.revealTextExtractionGeneratedPdf.unavailable',
          unavailableMessage: 'revealTextExtractionGeneratedPdf unavailable; reveal action disabled.',
        });
        if (!revealTextExtractionGeneratedPdf) {
          throw new Error('revealTextExtractionGeneratedPdf unavailable');
        }
        const revealResult = await revealTextExtractionGeneratedPdf({ artifactPath });
        if (!revealResult || revealResult.ok !== true) {
          throw new Error('revealTextExtractionGeneratedPdf failed');
        }
      },
      onOpenSnapshotsFolder: openSnapshotsFolder,
    });
  }

  async function startFromSelectedFiles({
    filePaths = [],
    source = 'picker',
    actionId = 'text-extraction-entrypoint',
    flowKind = 'batch',
    skipGuard = false,
  } = {}) {
    const {
      guardUserAction,
      hasBlockingModalOpen,
    } = requireDeps();
    const normalizedFilePaths = Array.isArray(filePaths)
      ? filePaths.map((filePath) => normalizeFilePath(filePath)).filter(Boolean)
      : [];
    if (!normalizedFilePaths.length) return;

    if (!skipGuard) {
      if (typeof guardUserAction !== 'function' || !guardUserAction(actionId)) {
        return;
      }
    }
    if (typeof hasBlockingModalOpen === 'function' && hasBlockingModalOpen() === true) {
      log.info('Batch planning blocked because a main-window modal is open:', { source });
      return;
    }

    const checkTextExtractionPreconditions = getOptionalElectronMethod('checkTextExtractionPreconditions', {
      dedupeKey: 'renderer.ipc.checkTextExtractionPreconditions.unavailable',
      unavailableMessage: 'checkTextExtractionPreconditions unavailable; batch entrypoint skipped.',
    });
    if (!checkTextExtractionPreconditions) {
      window.Notify.notifyMain('renderer.alerts.text_extraction_precondition_error');
      return;
    }

    const preconditions = await checkTextExtractionPreconditions();
    if (resolvePreconditionFailure(preconditions)) {
      return;
    }

    const inputs = await preparePlanInputs(normalizedFilePaths);
    if (!inputs) {
      window.Notify.notifyMain('renderer.alerts.text_extraction_error');
      return;
    }

    const plannerState = createPlannerState(inputs, { flowKind, source });
    const plannerController = buildPlannerController(plannerState);
    const plannerDecision = await window.Notify.promptTextExtractionBatchPlan({
      controller: plannerController,
    });
    if (!plannerDecision || plannerDecision.action !== 'start') {
      return;
    }
    await runBatchExecution(plannerController.getFinalState());
  }

  async function startSyntheticSingleFileHeavySplit({
    filePath,
    source = 'single_file_heavy_split',
  } = {}) {
    return startFromSelectedFiles({
      filePaths: [filePath],
      source,
      actionId: 'text-extraction-single-file-heavy-split',
      flowKind: 'single_file_split',
      skipGuard: true,
    });
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================

  window.TextExtractionBatchFlow = {
    configure,
    startFromSelectedFiles,
    startSyntheticSingleFileHeavySplit,
  };
})();

// =============================================================================
// End of public/js/text_extraction_batch_flow.js
// =============================================================================
