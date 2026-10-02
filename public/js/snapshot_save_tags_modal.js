// public/js/snapshot_save_tags_modal.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Host the snapshot-save tags modal behavior in the main renderer.
// - Persist editable snapshot-tag preferences through the settings-owned bridge.
// - Provide inline custom-tag creation inside the searchable selectors.
// - Host the shared snapshot-tag manager modal through window.Notify.
// - Return normalized optional snapshot tags or null on cancel.

(() => {
  // =============================================================================
  // Imports / logger
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[snapshot-save-tags-modal] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('snapshot-save-tags-modal');
  log.debug('Snapshot save tags modal starting...');

  if (!window.RendererI18n
    || typeof window.RendererI18n.tRenderer !== 'function'
    || typeof window.RendererI18n.msgRenderer !== 'function') {
    throw new Error('[snapshot-save-tags-modal] RendererI18n unavailable; cannot continue');
  }
  const { tRenderer, msgRenderer } = window.RendererI18n;
  const { AppConstants } = window;
  if (!AppConstants || !Number.isInteger(AppConstants.SNAPSHOT_TAG_LABEL_MAX_CHARS)
    || AppConstants.SNAPSHOT_TAG_LABEL_MAX_CHARS < 1
    || !Number.isInteger(AppConstants.SNAPSHOT_NAME_MAX_CHARS)
    || AppConstants.SNAPSHOT_NAME_MAX_CHARS < 1
    || !Number.isInteger(AppConstants.SNAPSHOT_SOURCE_COMMENT_MAX_CHARS)
    || AppConstants.SNAPSHOT_SOURCE_COMMENT_MAX_CHARS < 1) {
    throw new Error('[snapshot-save-tags-modal] Snapshot field limits unavailable; verify constants.js load order');
  }
  const {
    SNAPSHOT_TAG_LABEL_MAX_CHARS,
    SNAPSHOT_NAME_MAX_CHARS,
    SNAPSHOT_SOURCE_COMMENT_MAX_CHARS,
  } = AppConstants;

  const snapshotTagCatalog = window.SnapshotTagCatalog || null;
  if (!snapshotTagCatalog
    || !Array.isArray(snapshotTagCatalog.TAG_KEYS)
    || typeof snapshotTagCatalog.createEmptySnapshotTagPreferences !== 'function'
    || typeof snapshotTagCatalog.createCustomTag !== 'function'
    || typeof snapshotTagCatalog.deleteCustomTag !== 'function'
    || typeof snapshotTagCatalog.findKnownOptionByNormalizedLabel !== 'function'
    || typeof snapshotTagCatalog.hideDefaultTag !== 'function'
    || typeof snapshotTagCatalog.isPlainObject !== 'function'
    || typeof snapshotTagCatalog.moveVisibleTagValue !== 'function'
    || typeof snapshotTagCatalog.normalizeLabelForComparison !== 'function'
    || typeof snapshotTagCatalog.normalizeSnapshotTagPreferences !== 'function'
    || typeof snapshotTagCatalog.normalizeTagsAgainstCatalog !== 'function'
    || typeof snapshotTagCatalog.resolveCategoryCatalog !== 'function'
    || typeof snapshotTagCatalog.restoreHiddenDefaultTags !== 'function'
    || typeof snapshotTagCatalog.sortVisibleTagValuesAlphabetically !== 'function'
    || typeof snapshotTagCatalog.validateCustomLabel !== 'function') {
    throw new Error('[snapshot-save-tags-modal] SnapshotTagCatalog unavailable; cannot continue');
  }

  const rendererIcons = window.RendererIcons || null;
  if (!rendererIcons || typeof rendererIcons.createIconButton !== 'function') {
    throw new Error('[snapshot-save-tags-modal] RendererIcons unavailable; cannot continue');
  }
  const rendererCombobox = window.RendererCombobox || null;
  if (!rendererCombobox || typeof rendererCombobox.create !== 'function') {
    throw new Error('[snapshot-save-tags-modal] RendererCombobox unavailable; cannot continue');
  }

  const electronAPI = window.electronAPI || null;
  const getSnapshotTagPreferences = electronAPI
    && typeof electronAPI.getSnapshotTagPreferences === 'function'
    ? electronAPI.getSnapshotTagPreferences.bind(electronAPI)
    : null;
  const setSnapshotTagPreferences = electronAPI
    && typeof electronAPI.setSnapshotTagPreferences === 'function'
    ? electronAPI.setSnapshotTagPreferences.bind(electronAPI)
    : null;

  // =============================================================================
  // Constants / config
  // =============================================================================
  const DEFAULT_COPY = {
    titleKey: 'renderer.snapshots.title',
    messageKey: 'renderer.snapshots.message',
    confirmKey: 'renderer.snapshots.buttons.confirm',
    cancelKey: 'renderer.snapshots.buttons.cancel',
    closeAriaKey: 'renderer.snapshots.close_aria',
  };

  const SEARCH_PLACEHOLDER_KEY = 'renderer.snapshots.search.placeholder';
  const SEARCH_NO_RESULTS_KEY = 'renderer.snapshots.search.no_results';
  const SEARCH_CREATE_KEY = 'renderer.snapshots.search.create';
  const MANAGE_BUTTON_LABEL_KEY = 'renderer.snapshots.buttons.manage';
  const INCLUDE_COUNT_LABEL_KEY = 'renderer.snapshots.metrics.include_count';
  const INCLUDE_READING_LABEL_KEY = 'renderer.snapshots.metrics.include_reading';
  const SNAPSHOT_NAME_LABEL_KEY = 'renderer.snapshots.labels.name';
  const SNAPSHOT_SOURCE_COMMENT_LABEL_KEY = 'renderer.snapshots.labels.source_comment';
  const SNAPSHOT_NAME_PLACEHOLDER_KEY = 'renderer.snapshots.placeholders.name';
  const SNAPSHOT_SOURCE_COMMENT_PLACEHOLDER_KEY = 'renderer.snapshots.placeholders.source_comment';
  const MANAGER_UNAVAILABLE_ALERT_KEY = 'renderer.snapshots.alerts.catalog_update_error';
  const LOAD_PREFERENCES_BRIDGE_UNAVAILABLE_LOG_KEY = 'snapshot-save-tags-modal.preferenceBridge.load.unavailable';
  const SAVE_PREFERENCES_BRIDGE_UNAVAILABLE_LOG_KEY = 'snapshot-save-tags-modal.preferenceBridge.save.unavailable';
  const FOCUS_PREVENT_SCROLL_FALLBACK_LOG_KEY = 'snapshot-save-tags-modal.focus.preventScroll.fallback';

  const FIELD_DEFS = [
    {
      key: 'language',
      labelKey: 'renderer.snapshots.labels.language',
      emptyKey: 'renderer.snapshots.empty.language',
      labelEl: document.getElementById('snapshotSaveTagsLanguageLabel'),
      controlEl: document.getElementById('snapshotSaveTagsLanguageControl'),
    },
    {
      key: 'type',
      labelKey: 'renderer.snapshots.labels.type',
      emptyKey: 'renderer.snapshots.empty.type',
      labelEl: document.getElementById('snapshotSaveTagsTypeLabel'),
      controlEl: document.getElementById('snapshotSaveTagsTypeControl'),
    },
    {
      key: 'difficulty',
      labelKey: 'renderer.snapshots.labels.difficulty',
      emptyKey: 'renderer.snapshots.empty.difficulty',
      labelEl: document.getElementById('snapshotSaveTagsDifficultyLabel'),
      controlEl: document.getElementById('snapshotSaveTagsDifficultyControl'),
    },
  ];

  // =============================================================================
  // DOM references
  // =============================================================================
  const modal = document.getElementById('snapshotSaveTagsModal');
  const backdrop = document.getElementById('snapshotSaveTagsModalBackdrop');
  const title = document.getElementById('snapshotSaveTagsModalTitle');
  const message = document.getElementById('snapshotSaveTagsModalMessage');
  const btnManage = document.getElementById('snapshotSaveTagsManageButton');
  const btnConfirm = document.getElementById('snapshotSaveTagsModalConfirm');
  const btnCancel = document.getElementById('snapshotSaveTagsModalCancel');
  const btnClose = document.getElementById('snapshotSaveTagsModalClose');
  const snapshotMetadataFields = document.getElementById('snapshotSaveMetadataFields');
  const snapshotNameInput = document.getElementById('snapshotSaveName');
  const snapshotNameLabel = document.getElementById('snapshotSaveNameLabel');
  const snapshotSourceCommentInput = document.getElementById('snapshotSaveSourceComment');
  const snapshotSourceCommentLabel = document.getElementById('snapshotSaveSourceCommentLabel');
  const metricsOptions = document.getElementById('snapshotSaveMetricsOptions');
  const includeCountInput = document.getElementById('snapshotSaveIncludeCount');
  const includeCountLabel = document.getElementById('snapshotSaveIncludeCountLabel');
  const includeReadingInput = document.getElementById('snapshotSaveIncludeReading');
  const includeReadingLabel = document.getElementById('snapshotSaveIncludeReadingLabel');

  const managerModal = document.getElementById('snapshotTagManagerModal');
  const managerBackdrop = document.getElementById('snapshotTagManagerModalBackdrop');
  const managerTitle = document.getElementById('snapshotTagManagerModalTitle');
  const managerMessage = document.getElementById('snapshotTagManagerModalMessage');
  const managerContent = document.getElementById('snapshotTagManagerModalContent');
  const managerDoneButton = document.getElementById('snapshotTagManagerModalDone');
  const managerCloseButton = document.getElementById('snapshotTagManagerModalClose');

  const REQUIRED_MODAL_ELEMENTS = [
    modal,
    backdrop,
    title,
    message,
    btnManage,
    btnConfirm,
    btnCancel,
    btnClose,
    snapshotMetadataFields,
    snapshotNameInput,
    snapshotNameLabel,
    snapshotSourceCommentInput,
    snapshotSourceCommentLabel,
    metricsOptions,
    includeCountInput,
    includeCountLabel,
    includeReadingInput,
    includeReadingLabel,
    managerModal,
    managerBackdrop,
    managerTitle,
    managerMessage,
    managerContent,
    managerDoneButton,
    managerCloseButton,
    ...FIELD_DEFS.flatMap((field) => [
      field.labelEl,
      field.controlEl,
    ]),
  ];

  // =============================================================================
  // Shared state
  // =============================================================================
  const fieldStateByKey = new Map();
  let fieldComboboxesCreated = false;
  let metricChoiceEventsBound = false;
  let currentSnapshotTagPreferences = snapshotTagCatalog.createEmptySnapshotTagPreferences();
  const activePromptTranslationRefreshers = new Set();

  // =============================================================================
  // Generic helpers
  // =============================================================================
  function hasRequiredElements() {
    return REQUIRED_MODAL_ELEMENTS.every(Boolean);
  }

  function getDefaultLabel(option) {
    return tRenderer(option.labelKey);
  }

  function normalizeOptionalString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function buildOptionSearchIndex(label, value) {
    const normalizedLabel = snapshotTagCatalog.normalizeLabelForComparison(label);
    const normalizedValue = snapshotTagCatalog.normalizeLabelForComparison(value);
    const spacedValue = normalizedValue.replace(/[_:-]+/g, ' ');
    return `${normalizedLabel} ${normalizedValue} ${spacedValue}`.trim();
  }

  function getFieldDef(fieldKey) {
    return FIELD_DEFS.find((field) => field.key === fieldKey) || null;
  }

  function ensureFieldState(fieldKey) {
    if (!fieldStateByKey.has(fieldKey)) {
      fieldStateByKey.set(fieldKey, {
        committedValue: '',
        allOptions: [],
        pendingCreateLabel: '',
        combobox: null,
      });
    }
    return fieldStateByKey.get(fieldKey);
  }

  function isManagerModalOpen() {
    return managerModal.getAttribute('aria-hidden') === 'false';
  }

  function getDraftValidationText(errorKey) {
    if (!errorKey) return '';
    if (errorKey === 'renderer.snapshots.manager.validation.too_long') {
      return msgRenderer(errorKey, { max: SNAPSHOT_TAG_LABEL_MAX_CHARS });
    }
    return tRenderer(errorKey);
  }

  async function loadSnapshotTagPreferences(initialPreferences = null) {
    if (snapshotTagCatalog.isPlainObject(initialPreferences)) {
      return snapshotTagCatalog.normalizeSnapshotTagPreferences(initialPreferences);
    }

    if (!getSnapshotTagPreferences) {
      log.warnOnce(
        LOAD_PREFERENCES_BRIDGE_UNAVAILABLE_LOG_KEY,
        'Snapshot-tag preference bridge unavailable; using empty preferences.'
      );
      return snapshotTagCatalog.createEmptySnapshotTagPreferences();
    }

    try {
      const result = await getSnapshotTagPreferences();
      if (result && result.ok === true) {
        return snapshotTagCatalog.normalizeSnapshotTagPreferences(result.snapshotTags);
      }
      log.warn('Snapshot-tag preferences load returned non-ok result; using empty preferences:', result);
    } catch (err) {
      log.warn('Snapshot-tag preferences load failed; using empty preferences:', err);
    }

    return snapshotTagCatalog.createEmptySnapshotTagPreferences();
  }

  async function persistSnapshotTagPreferences(nextPreferences) {
    if (!setSnapshotTagPreferences) {
      log.warnOnce(
        SAVE_PREFERENCES_BRIDGE_UNAVAILABLE_LOG_KEY,
        'Snapshot-tag preference bridge unavailable; cannot persist snapshot-tag preferences.'
      );
      window.Notify.notifyMain(MANAGER_UNAVAILABLE_ALERT_KEY);
      return null;
    }

    try {
      const result = await setSnapshotTagPreferences(nextPreferences);
      if (result && result.ok === true) {
        return snapshotTagCatalog.normalizeSnapshotTagPreferences(result.snapshotTags);
      }
      log.warn('Snapshot-tag preferences save returned non-ok result:', result);
    } catch (err) {
      log.error('Snapshot-tag preferences save failed:', err);
    }

    window.Notify.notifyMain(MANAGER_UNAVAILABLE_ALERT_KEY);
    return null;
  }

  function buildFieldOptions(field) {
    const resolvedCategory = snapshotTagCatalog.resolveCategoryCatalog(
      field.key,
      currentSnapshotTagPreferences,
      { getDefaultLabel }
    );
    const clearLabel = tRenderer(field.emptyKey);
    const clearOption = {
      value: '',
      label: clearLabel,
      normalizedSearch: snapshotTagCatalog.normalizeLabelForComparison(clearLabel),
      kind: 'clear',
    };
    const visibleOptions = resolvedCategory.visibleOptions.map((option) => ({
      value: option.value,
      label: option.label,
      normalizedSearch: buildOptionSearchIndex(option.label, option.value),
      kind: 'value',
      origin: option.origin,
    }));
    return [clearOption, ...visibleOptions];
  }

  function buildCreateOption(fieldKey, queryText) {
    const labelInfo = snapshotTagCatalog.validateCustomLabel(queryText);
    if (!labelInfo.ok) return null;

    const existingOption = snapshotTagCatalog.findKnownOptionByNormalizedLabel(
      fieldKey,
      currentSnapshotTagPreferences,
      labelInfo.normalizedLabel,
      { getDefaultLabel }
    );
    if (existingOption) return null;

    return {
      value: '',
      label: msgRenderer(SEARCH_CREATE_KEY, { label: labelInfo.label }),
      normalizedSearch: '',
      kind: 'create',
      createLabel: labelInfo.label,
    };
  }

  function resolveFieldOptions(fieldKey, queryText) {
    const fieldState = ensureFieldState(fieldKey);
    const normalizedQuery = snapshotTagCatalog.normalizeLabelForComparison(queryText);
    const filteredOptions = normalizedQuery
      ? fieldState.allOptions.filter((option) => option.normalizedSearch.includes(normalizedQuery))
      : fieldState.allOptions.slice();
    const createOption = buildCreateOption(fieldKey, queryText);
    fieldState.pendingCreateLabel = createOption ? createOption.createLabel : '';
    if (createOption) {
      filteredOptions.unshift(createOption);
    }
    return filteredOptions.map((option) => (
      option.kind === 'create'
        ? { action: 'create', label: option.label, variant: 'create' }
        : {
          value: option.value,
          label: option.label,
          variant: option.kind === 'clear' ? 'clear' : '',
        }
    ));
  }

  function closeAllFields() {
    FIELD_DEFS.forEach((field) => {
      const combobox = ensureFieldState(field.key).combobox;
      if (combobox) combobox.close();
    });
  }

  function isFieldOpen(fieldKey) {
    const field = getFieldDef(fieldKey);
    const trigger = field && field.controlEl ? field.controlEl.firstElementChild : null;
    return !!trigger && trigger.getAttribute('aria-expanded') === 'true';
  }

  async function createCustomTagAndCommit(fieldKey, rawLabel) {
    const createInfo = snapshotTagCatalog.createCustomTag(
      currentSnapshotTagPreferences,
      fieldKey,
      rawLabel,
      { getDefaultLabel }
    );
    if (!createInfo.ok) {
      log.warn('Snapshot tag inline create rejected:', fieldKey, createInfo);
      return;
    }

    const persistedPreferences = await persistSnapshotTagPreferences(createInfo.preferences);
    if (!persistedPreferences) return;

    currentSnapshotTagPreferences = persistedPreferences;
    const nextTags = collectTags() || {};
    nextTags[fieldKey] = createInfo.createdTag.value;
    resetFields(nextTags);
  }

  function onFieldValueChanged(fieldKey, value) {
    const fieldState = ensureFieldState(fieldKey);
    fieldState.committedValue = value;
  }

  function onFieldAction(fieldKey, option) {
    if (!option || option.action !== 'create') return;
    const createLabel = ensureFieldState(fieldKey).pendingCreateLabel;
    if (createLabel) void createCustomTagAndCommit(fieldKey, createLabel);
  }

  function resetFields(initialTags) {
    const normalizedInitialTags = snapshotTagCatalog.normalizeTagsAgainstCatalog(
      initialTags,
      currentSnapshotTagPreferences,
      { getDefaultLabel }
    );

    FIELD_DEFS.forEach((field) => {
      const fieldState = ensureFieldState(field.key);
      fieldState.allOptions = buildFieldOptions(field);
      const normalizedValue = normalizedInitialTags
        ? normalizeOptionalString(normalizedInitialTags[field.key])
        : '';
      fieldState.committedValue = normalizedValue;
      fieldState.pendingCreateLabel = '';
      field.labelEl.textContent = tRenderer(field.labelKey);
      fieldState.combobox.update({
        options: fieldState.allOptions.map((option) => ({
          value: option.value,
          label: option.label,
          variant: option.kind === 'clear' ? 'clear' : '',
        })),
        value: normalizedValue,
        placeholder: tRenderer(SEARCH_PLACEHOLDER_KEY),
        noResultsLabel: tRenderer(SEARCH_NO_RESULTS_KEY),
      });
      fieldState.combobox.close();
    });
  }

  function collectTags() {
    const tags = {};

    FIELD_DEFS.forEach((field) => {
      const fieldState = ensureFieldState(field.key);
      const value = normalizeOptionalString(fieldState.committedValue);
      if (value) {
        tags[field.key] = value;
      }
    });

    return Object.keys(tags).length ? tags : null;
  }

  function focusElementWithoutScroll(element) {
    if (!element || typeof element.focus !== 'function') return;

    try {
      element.focus({ preventScroll: true });
    } catch (err) {
      log.warnOnce(
        FOCUS_PREVENT_SCROLL_FALLBACK_LOG_KEY,
        'focus({ preventScroll: true }) failed; falling back to focus().',
        err
      );
      element.focus();
    }
  }

  function resolveCopy(copy = {}) {
    const titleKey = normalizeOptionalString(copy.titleKey);
    const messageKey = normalizeOptionalString(copy.messageKey);
    const confirmKey = normalizeOptionalString(copy.confirmKey);
    const cancelKey = normalizeOptionalString(copy.cancelKey);
    const closeAriaKey = normalizeOptionalString(copy.closeAriaKey);

    return {
      titleKey: titleKey || DEFAULT_COPY.titleKey,
      messageKey: messageKey || DEFAULT_COPY.messageKey,
      confirmKey: confirmKey || DEFAULT_COPY.confirmKey,
      cancelKey: cancelKey || DEFAULT_COPY.cancelKey,
      closeAriaKey: closeAriaKey || DEFAULT_COPY.closeAriaKey,
    };
  }

  function populateCopy(copy = {}) {
    const resolvedCopy = resolveCopy(copy);
    title.textContent = tRenderer(resolvedCopy.titleKey);
    message.textContent = tRenderer(resolvedCopy.messageKey);
    btnConfirm.textContent = tRenderer(resolvedCopy.confirmKey);
    btnCancel.textContent = tRenderer(resolvedCopy.cancelKey);
    btnClose.setAttribute('aria-label', tRenderer(resolvedCopy.closeAriaKey));
    btnManage.textContent = tRenderer(MANAGE_BUTTON_LABEL_KEY);
    btnManage.removeAttribute('aria-label');
    includeCountLabel.textContent = tRenderer(INCLUDE_COUNT_LABEL_KEY);
    includeReadingLabel.textContent = tRenderer(INCLUDE_READING_LABEL_KEY);
    snapshotNameLabel.textContent = tRenderer(SNAPSHOT_NAME_LABEL_KEY);
    snapshotNameInput.placeholder = tRenderer(SNAPSHOT_NAME_PLACEHOLDER_KEY);
    snapshotNameInput.maxLength = SNAPSHOT_NAME_MAX_CHARS;
    snapshotSourceCommentLabel.textContent = tRenderer(SNAPSHOT_SOURCE_COMMENT_LABEL_KEY);
    snapshotSourceCommentInput.placeholder = tRenderer(SNAPSHOT_SOURCE_COMMENT_PLACEHOLDER_KEY);
    snapshotSourceCommentInput.maxLength = SNAPSHOT_SOURCE_COMMENT_MAX_CHARS;
  }

  function refreshFieldTranslations() {
    FIELD_DEFS.forEach((field) => {
      const fieldState = ensureFieldState(field.key);
      const preservedValue = fieldState.combobox && typeof fieldState.combobox.getValue === 'function'
        ? fieldState.combobox.getValue()
        : fieldState.committedValue;
      fieldState.allOptions = buildFieldOptions(field);
      field.labelEl.textContent = tRenderer(field.labelKey);
      fieldState.combobox.update({
        options: fieldState.allOptions.map((option) => ({
          value: option.value,
          label: option.label,
          variant: option.kind === 'clear' ? 'clear' : '',
        })),
        value: preservedValue,
        placeholder: tRenderer(SEARCH_PLACEHOLDER_KEY),
        noResultsLabel: tRenderer(SEARCH_NO_RESULTS_KEY),
      });
    });
  }

  function applyTranslations() {
    Array.from(activePromptTranslationRefreshers).forEach((refresh) => refresh());
  }

  function setSnapshotSaveFieldVisibility(showSaveFields) {
    snapshotMetadataFields.hidden = !showSaveFields;
    snapshotMetadataFields.setAttribute('aria-hidden', showSaveFields ? 'false' : 'true');
    metricsOptions.hidden = !showSaveFields;
    metricsOptions.setAttribute('aria-hidden', showSaveFields ? 'false' : 'true');
  }

  function resetSnapshotSaveFields() {
    snapshotNameInput.value = '';
    snapshotSourceCommentInput.value = '';
  }

  function collectOptionalInputValue(input) {
    return input && typeof input.value === 'string' && input.value.trim()
      ? input.value
      : '';
  }

  function syncMetricChoiceState() {
    if (!includeCountInput.checked) {
      includeReadingInput.checked = false;
    }
    includeReadingInput.disabled = !includeCountInput.checked;
  }

  function resetMetricChoices() {
    includeCountInput.checked = true;
    includeReadingInput.checked = true;
    syncMetricChoiceState();
  }

  function ensureMetricChoiceEventsBound() {
    if (metricChoiceEventsBound) return;
    includeCountInput.addEventListener('change', syncMetricChoiceState);
    metricChoiceEventsBound = true;
  }

  function ensureFieldEventsBound() {
    if (fieldComboboxesCreated) return;

    FIELD_DEFS.forEach((field) => {
      const fieldState = ensureFieldState(field.key);
      fieldState.combobox = rendererCombobox.create({
        host: field.controlEl,
        mode: 'editable',
        options: [],
        value: '',
        ariaLabelledBy: field.labelEl.id,
        placeholder: tRenderer(SEARCH_PLACEHOLDER_KEY),
        noResultsLabel: tRenderer(SEARCH_NO_RESULTS_KEY),
        resolveOptions: (query) => resolveFieldOptions(field.key, query),
        onChange: (value) => onFieldValueChanged(field.key, value),
        onAction: (option) => onFieldAction(field.key, option),
      });
    });

    fieldComboboxesCreated = true;
  }

  // =============================================================================
  // Tag manager prompt
  // =============================================================================
  async function promptSnapshotTagManager(options = {}) {
    if (!hasRequiredElements()) {
      log.error('Snapshot tag manager DOM elements missing.');
      return null;
    }

    let managerPreferences = await loadSnapshotTagPreferences(options.initialPreferences || null);
    const draftStateByCategory = new Map();
    for (const category of snapshotTagCatalog.TAG_KEYS) {
      draftStateByCategory.set(category, {
        active: false,
        value: '',
        errorKey: '',
      });
    }

    return await new Promise((resolve) => {
      let settled = false;
      const refreshManagerTranslations = () => {
        const focusedNode = document.activeElement;
        const focusedNodeWillBeReplaced = !!(
          focusedNode
          && typeof managerContent.contains === 'function'
          && managerContent.contains(focusedNode)
        );
        renderManagerContent({ focusNewDraft: false });
        if (focusedNodeWillBeReplaced) {
          focusElementWithoutScroll(managerCloseButton);
        }
      };
      function getDraftState(category) {
        return draftStateByCategory.get(category);
      }

      function createManagerActionButton(textKey, onClick, {
        disabled = false,
        textParams = {},
      } = {}) {
        const button = document.createElement('button');
        button.className = 'btn-standard';
        button.type = 'button';
        button.textContent = msgRenderer(textKey, textParams);
        button.disabled = disabled;
        button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        button.addEventListener('click', onClick);
        return button;
      }

      function createManagerIconButton({
        labelKey,
        labelParams = {},
        iconName,
        className = 'btn-standard btn-standard--square',
        count = null,
        disabled = false,
        onClick,
      }) {
        const text = msgRenderer(labelKey, labelParams);
        const countText = Number.isInteger(count) ? `(${count})` : '';
        const button = rendererIcons.createIconButton({
          iconName,
          className,
          ariaLabel: countText && !text.includes(countText) ? `${text} ${countText}` : text,
        });
        button.setAttribute('data-tot-tooltip', text);
        if (countText) {
          const countLabel = document.createElement('span');
          countLabel.className = 'snapshot-tag-manager-action-count';
          countLabel.setAttribute('aria-hidden', 'true');
          countLabel.textContent = countText;
          button.appendChild(countLabel);
        }
        button.disabled = disabled;
        button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        button.addEventListener('click', onClick);
        return button;
      }

      async function commitManagerPreferences(nextPreferences) {
        const persistedPreferences = await persistSnapshotTagPreferences(nextPreferences);
        if (!persistedPreferences) return false;
        managerPreferences = persistedPreferences;
        return true;
      }

      async function applyManagerPreferencesChange(actionName, changeInfo) {
        if (!changeInfo.ok) {
          log.warn('Snapshot tag manager action rejected:', actionName, changeInfo);
          return false;
        }
        if (!await commitManagerPreferences(changeInfo.preferences)) {
          return false;
        }
        renderManagerContent();
        return true;
      }

      function resetDraftState(draftState) {
        draftState.active = false;
        draftState.value = '';
        draftState.errorKey = '';
      }

      function renderManagerContent({ focusNewDraft = true } = {}) {
        managerTitle.textContent = tRenderer('renderer.snapshots.manager.title');
        managerMessage.textContent = tRenderer('renderer.snapshots.manager.message');
        managerDoneButton.textContent = tRenderer('renderer.snapshots.manager.done');
        managerCloseButton.setAttribute('aria-label', tRenderer('renderer.snapshots.manager.close_aria'));
        managerContent.innerHTML = '';

        snapshotTagCatalog.TAG_KEYS.forEach((category) => {
          const categoryInfo = snapshotTagCatalog.resolveCategoryCatalog(category, managerPreferences, {
            getDefaultLabel,
          });
          const draftState = getDraftState(category);
          const section = document.createElement('section');
          section.className = 'snapshot-tag-manager-category';

          const headingRow = document.createElement('div');
          headingRow.className = 'snapshot-tag-manager-category-header';

          const heading = document.createElement('h3');
          heading.textContent = tRenderer(`renderer.snapshots.labels.${category}`);
          headingRow.appendChild(heading);

          const categoryActions = document.createElement('div');
          categoryActions.className = 'snapshot-tag-manager-category-actions';
          categoryActions.appendChild(createManagerActionButton(
            'renderer.snapshots.manager.new_tag',
            () => {
              draftState.active = true;
              draftState.errorKey = '';
              renderManagerContent();
            }
          ));
          categoryActions.appendChild(createManagerActionButton(
            'renderer.snapshots.manager.sort_alphabetically',
            async () => {
              const sortInfo = snapshotTagCatalog.sortVisibleTagValuesAlphabetically(
                managerPreferences,
                category,
                { getDefaultLabel }
              );
              await applyManagerPreferencesChange('sort_alphabetically', sortInfo);
            },
            { disabled: categoryInfo.visibleOptions.length < 2 }
          ));
          categoryActions.appendChild(createManagerIconButton({
            labelKey: 'renderer.snapshots.manager.restore_hidden_defaults',
            iconName: 'reset-small',
            className: 'btn-standard snapshot-tag-manager-restore-button',
            labelParams: { count: categoryInfo.hiddenDefaultValues.length },
            count: categoryInfo.hiddenDefaultValues.length,
            onClick: async () => {
              const restoreInfo = snapshotTagCatalog.restoreHiddenDefaultTags(
                managerPreferences,
                category,
                { getDefaultLabel }
              );
              await applyManagerPreferencesChange('restore_hidden_defaults', restoreInfo);
            },
            disabled: categoryInfo.hiddenDefaultValues.length < 1,
          }));
          headingRow.appendChild(categoryActions);
          section.appendChild(headingRow);

          if (draftState.active) {
            const draftWrap = document.createElement('div');
            draftWrap.className = 'snapshot-tag-manager-draft';
            const draftInput = document.createElement('input');
            draftInput.className = 'snapshot-tag-manager-draft-input';
            draftInput.type = 'text';
            draftInput.value = draftState.value;
            draftInput.maxLength = SNAPSHOT_TAG_LABEL_MAX_CHARS;
            draftInput.placeholder = tRenderer('renderer.snapshots.manager.new_tag_placeholder');
            draftInput.setAttribute(
              'aria-label',
              tRenderer('renderer.snapshots.manager.new_tag_input_aria')
            );
            draftInput.addEventListener('input', () => {
              draftState.value = draftInput.value;
              draftState.errorKey = '';
            });
            draftInput.addEventListener('keydown', (event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void attemptCreateDraftTag(category);
              } else if (event.key === 'Escape') {
                event.preventDefault();
                if (typeof event.stopPropagation === 'function') {
                  event.stopPropagation();
                }
                resetDraftState(draftState);
                renderManagerContent();
              }
            });

            const draftActions = document.createElement('div');
            draftActions.className = 'snapshot-tag-manager-draft-actions';
            draftActions.appendChild(createManagerActionButton(
              'renderer.snapshots.manager.add_tag',
              () => {
                void attemptCreateDraftTag(category);
              }
            ));
            draftActions.appendChild(createManagerActionButton(
              'renderer.snapshots.manager.cancel_draft',
              () => {
                resetDraftState(draftState);
                renderManagerContent();
              }
            ));

            draftWrap.appendChild(draftInput);
            draftWrap.appendChild(draftActions);
            section.appendChild(draftWrap);

            const validation = document.createElement('div');
            validation.className = 'snapshot-tag-manager-validation';
            validation.setAttribute('aria-live', 'polite');
            validation.textContent = getDraftValidationText(draftState.errorKey);
            if (!draftState.errorKey) {
              validation.hidden = true;
            }
            section.appendChild(validation);

            if (focusNewDraft) {
              setTimeout(() => {
                focusElementWithoutScroll(draftInput);
              }, 0);
            }
          }

          if (!categoryInfo.visibleOptions.length) {
            const emptyState = document.createElement('p');
            emptyState.className = 'snapshot-tag-manager-empty';
            emptyState.textContent = tRenderer('renderer.snapshots.manager.empty_category');
            section.appendChild(emptyState);
          } else {
            const list = document.createElement('div');
            list.className = 'snapshot-tag-manager-list';
            categoryInfo.visibleOptions.forEach((option, index) => {
              const row = document.createElement('div');
              row.className = 'snapshot-tag-manager-row';

              const label = document.createElement('span');
              label.className = 'snapshot-tag-manager-row-label';
              label.textContent = option.label;
              row.appendChild(label);

              const actions = document.createElement('div');
              actions.className = 'snapshot-tag-manager-row-actions';
              actions.appendChild(createManagerIconButton({
                labelKey: 'renderer.snapshots.manager.move_up',
                labelParams: { label: option.label },
                iconName: 'arrow-up',
                className: 'btn-standard btn-standard--half-width',
                disabled: index < 1,
                onClick: async () => {
                  const moveInfo = snapshotTagCatalog.moveVisibleTagValue(
                    managerPreferences,
                    category,
                    option.value,
                    'up',
                    { getDefaultLabel }
                  );
                  await applyManagerPreferencesChange('move_up', moveInfo);
                },
              }));
              actions.appendChild(createManagerIconButton({
                labelKey: 'renderer.snapshots.manager.move_down',
                labelParams: { label: option.label },
                iconName: 'arrow-down',
                className: 'btn-standard btn-standard--half-width',
                disabled: index >= categoryInfo.visibleOptions.length - 1,
                onClick: async () => {
                  const moveInfo = snapshotTagCatalog.moveVisibleTagValue(
                    managerPreferences,
                    category,
                    option.value,
                    'down',
                    { getDefaultLabel }
                  );
                  await applyManagerPreferencesChange('move_down', moveInfo);
                },
              }));
              actions.appendChild(createManagerIconButton({
                labelKey: option.origin === 'default'
                  ? 'renderer.snapshots.manager.hide_default'
                  : 'renderer.snapshots.manager.delete_custom',
                labelParams: { label: option.label },
                iconName: 'trash',
                onClick: async () => {
                  if (option.origin === 'default') {
                    const confirmed = window.Notify.confirmMain(
                      'renderer.snapshots.manager.confirm_hide_default',
                      { label: option.label }
                    );
                    if (!confirmed) return;
                    const hideInfo = snapshotTagCatalog.hideDefaultTag(
                      managerPreferences,
                      category,
                      option.value,
                      { getDefaultLabel }
                    );
                    await applyManagerPreferencesChange('hide_default', hideInfo);
                    return;
                  }

                  const confirmed = window.Notify.confirmMain(
                    'renderer.snapshots.manager.confirm_delete_custom',
                    { label: option.label }
                  );
                  if (!confirmed) return;
                  const deleteInfo = snapshotTagCatalog.deleteCustomTag(
                    managerPreferences,
                    category,
                    option.value,
                    { getDefaultLabel }
                  );
                  await applyManagerPreferencesChange('delete_custom', deleteInfo);
                },
              }));
              row.appendChild(actions);
              list.appendChild(row);
            });
            section.appendChild(list);
          }

          managerContent.appendChild(section);
        });
      }

      async function attemptCreateDraftTag(category) {
        const draftState = getDraftState(category);
        const createInfo = snapshotTagCatalog.createCustomTag(
          managerPreferences,
          category,
          draftState.value,
          { getDefaultLabel }
        );
        if (!createInfo.ok) {
          if (createInfo.code === 'duplicate') {
            draftState.errorKey = 'renderer.snapshots.manager.validation.duplicate';
          } else if (createInfo.code === 'control_characters') {
            draftState.errorKey = 'renderer.snapshots.manager.validation.control_characters';
          } else if (createInfo.code === 'too_long') {
            draftState.errorKey = 'renderer.snapshots.manager.validation.too_long';
          } else {
            draftState.errorKey = 'renderer.snapshots.manager.validation.empty';
          }
          renderManagerContent();
          return;
        }

        if (!await commitManagerPreferences(createInfo.preferences)) {
          return;
        }

        resetDraftState(draftState);
        renderManagerContent();
      }

      function cleanup() {
        activePromptTranslationRefreshers.delete(refreshManagerTranslations);
        managerDoneButton.removeEventListener('click', onDone);
        managerCloseButton.removeEventListener('click', onCancel);
        managerBackdrop.removeEventListener('click', onCancel);
        window.removeEventListener('keydown', onWindowKeyDown);
        managerModal.setAttribute('aria-hidden', 'true');
        window.Notify.deactivateModalFocus(managerModal);
      }

      function finish(result) {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      }

      function onDone() {
        finish(managerPreferences);
      }

      function onCancel() {
        finish(managerPreferences);
      }

      function onWindowKeyDown(event) {
        if (!isManagerModalOpen()) return;
        if (event.key !== 'Escape') return;
        event.preventDefault();
        finish(managerPreferences);
      }

      managerDoneButton.addEventListener('click', onDone);
      managerCloseButton.addEventListener('click', onCancel);
      managerBackdrop.addEventListener('click', onCancel);
      window.addEventListener('keydown', onWindowKeyDown);

      renderManagerContent();
      activePromptTranslationRefreshers.add(refreshManagerTranslations);
      managerModal.setAttribute('aria-hidden', 'false');
      window.Notify.activateModalFocus(managerModal, {
        initialFocus: managerCloseButton,
        fallbackFocus: managerCloseButton,
      });
    });
  }

  // =============================================================================
  // Snapshot prompts
  // =============================================================================
  async function promptSnapshot(options = {}, { includeSaveFields } = {}) {
    if (!hasRequiredElements()) {
      log.error('Snapshot prompt DOM elements missing.');
      return null;
    }

    ensureFieldEventsBound();
    ensureMetricChoiceEventsBound();
    populateCopy(options.copy);
    setSnapshotSaveFieldVisibility(includeSaveFields);
    currentSnapshotTagPreferences = await loadSnapshotTagPreferences();
    resetFields(options.initialTags);
    resetMetricChoices();
    resetSnapshotSaveFields();

    return await new Promise((resolve) => {
      let settled = false;
      const refreshSnapshotTranslations = () => {
        populateCopy(options.copy);
        refreshFieldTranslations();
      };
      function cleanup() {
        activePromptTranslationRefreshers.delete(refreshSnapshotTranslations);
        btnManage.removeEventListener('click', onManageClick);
        btnConfirm.removeEventListener('click', onConfirm);
        btnCancel.removeEventListener('click', onCancel);
        btnClose.removeEventListener('click', onCancel);
        backdrop.removeEventListener('click', onCancel);
        window.removeEventListener('keydown', onWindowKeyDown);
        closeAllFields();
        modal.setAttribute('aria-hidden', 'true');
        window.Notify.deactivateModalFocus(modal);
      }

      function finish(result) {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      }

      function onConfirm() {
        const result = {
          tags: collectTags(),
        };
        if (includeSaveFields) {
          result.includeCount = includeCountInput.checked;
          result.includeReading = includeReadingInput.checked;
          const name = collectOptionalInputValue(snapshotNameInput);
          const sourceComment = collectOptionalInputValue(snapshotSourceCommentInput);
          if (name) result.name = name;
          if (sourceComment) result.sourceComment = sourceComment;
        }
        finish(result);
      }

      function onCancel() {
        finish(null);
      }

      async function onManage() {
        closeAllFields();
        const currentTags = collectTags();
        const nextPreferences = await promptSnapshotTagManager({
          initialPreferences: currentSnapshotTagPreferences,
        });
        if (!nextPreferences) return;
        currentSnapshotTagPreferences = snapshotTagCatalog.normalizeSnapshotTagPreferences(nextPreferences);
        resetFields(currentTags);
      }

      function onManageClick() {
        void onManage();
      }

      function onWindowKeyDown(ev) {
        if (modal.getAttribute('aria-hidden') !== 'false' || isManagerModalOpen()) return;
        if (ev.key !== 'Escape') return;

        const openFieldDef = FIELD_DEFS.find((field) => isFieldOpen(field.key));
        if (openFieldDef) {
          ev.preventDefault();
          ensureFieldState(openFieldDef.key).combobox.close();
          return;
        }

        ev.preventDefault();
        finish(null);
      }

      btnManage.addEventListener('click', onManageClick);
      btnConfirm.addEventListener('click', onConfirm);
      btnCancel.addEventListener('click', onCancel);
      btnClose.addEventListener('click', onCancel);
      backdrop.addEventListener('click', onCancel);
      window.addEventListener('keydown', onWindowKeyDown);
      activePromptTranslationRefreshers.add(refreshSnapshotTranslations);

      modal.setAttribute('aria-hidden', 'false');
      const initialFocus = includeSaveFields
        ? snapshotNameInput
        : FIELD_DEFS[0].controlEl.querySelector('.renderer-combobox__input');
      window.Notify.activateModalFocus(modal, {
        initialFocus,
        fallbackFocus: btnClose,
      });
    });
  }

  function promptSnapshotSave(options = {}) {
    return promptSnapshot(options, { includeSaveFields: true });
  }

  function promptSnapshotTags(options = {}) {
    return promptSnapshot(options, { includeSaveFields: false });
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================
  window.Notify.registerCustomPrompt('promptSnapshotTagManager', promptSnapshotTagManager);
  window.Notify.registerCustomPrompt('promptSnapshotSave', promptSnapshotSave);
  window.Notify.registerCustomPrompt('promptSnapshotTags', promptSnapshotTags);
  window.SnapshotSaveTagsModal = { applyTranslations };
})();

// =============================================================================
// End of public/js/snapshot_save_tags_modal.js
// =============================================================================
