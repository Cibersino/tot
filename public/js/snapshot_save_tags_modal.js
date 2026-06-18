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
// =============================================================================

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

  if (!window.Notify
    || typeof window.Notify.confirmMain !== 'function'
    || typeof window.Notify.notifyMain !== 'function'
    || typeof window.Notify.registerCustomPrompt !== 'function') {
    throw new Error('[snapshot-save-tags-modal] window.Notify unavailable; cannot continue');
  }

  const electronAPI = window.electronAPI || null;
  if (!electronAPI
    || typeof electronAPI.getSnapshotTagPreferences !== 'function'
    || typeof electronAPI.setSnapshotTagPreferences !== 'function') {
    throw new Error('[snapshot-save-tags-modal] snapshot-tag preference bridge unavailable; cannot continue');
  }

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
  const MANAGE_BUTTON_ARIA_KEY = 'renderer.snapshots.manager.title';
  const MANAGER_UNAVAILABLE_ALERT_KEY = 'renderer.snapshots.alerts.catalog_update_error';

  const FIELD_DEFS = [
    {
      key: 'language',
      labelKey: 'renderer.snapshots.labels.language',
      emptyKey: 'renderer.snapshots.empty.language',
      labelEl: document.getElementById('snapshotSaveTagsLanguageLabel'),
      controlEl: document.getElementById('snapshotSaveTagsLanguageControl'),
      inputEl: document.getElementById('snapshotSaveTagsLanguageInput'),
      listboxEl: document.getElementById('snapshotSaveTagsLanguageListbox'),
    },
    {
      key: 'type',
      labelKey: 'renderer.snapshots.labels.type',
      emptyKey: 'renderer.snapshots.empty.type',
      labelEl: document.getElementById('snapshotSaveTagsTypeLabel'),
      controlEl: document.getElementById('snapshotSaveTagsTypeControl'),
      inputEl: document.getElementById('snapshotSaveTagsTypeInput'),
      listboxEl: document.getElementById('snapshotSaveTagsTypeListbox'),
    },
    {
      key: 'difficulty',
      labelKey: 'renderer.snapshots.labels.difficulty',
      emptyKey: 'renderer.snapshots.empty.difficulty',
      labelEl: document.getElementById('snapshotSaveTagsDifficultyLabel'),
      controlEl: document.getElementById('snapshotSaveTagsDifficultyControl'),
      inputEl: document.getElementById('snapshotSaveTagsDifficultyInput'),
      listboxEl: document.getElementById('snapshotSaveTagsDifficultyListbox'),
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
      field.inputEl,
      field.listboxEl,
    ]),
  ];

  // =============================================================================
  // Shared state
  // =============================================================================
  const fieldStateByKey = new Map();
  let fieldEventsBound = false;
  let currentSnapshotTagPreferences = snapshotTagCatalog.createEmptySnapshotTagPreferences();

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
        queryText: '',
        isOpen: false,
        activeIndex: -1,
        allOptions: [],
        filteredOptions: [],
      });
    }
    return fieldStateByKey.get(fieldKey);
  }

  function isManagerModalOpen() {
    return managerModal.getAttribute('aria-hidden') === 'false';
  }

  async function loadSnapshotTagPreferences(initialPreferences = null) {
    if (snapshotTagCatalog.isPlainObject(initialPreferences)) {
      return snapshotTagCatalog.normalizeSnapshotTagPreferences(initialPreferences);
    }

    try {
      const result = await electronAPI.getSnapshotTagPreferences();
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
    try {
      const result = await electronAPI.setSnapshotTagPreferences(nextPreferences);
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

  function findOptionByValue(options, rawValue) {
    const normalizedValue = normalizeOptionalString(rawValue);
    if (!normalizedValue) return null;
    return options.find((option) => option.value === normalizedValue) || null;
  }

  function getCommittedOption(fieldState) {
    return fieldState.allOptions.find((option) => option.value === fieldState.committedValue)
      || fieldState.allOptions[0]
      || null;
  }

  function syncFieldInputFromCommittedValue(fieldKey) {
    const field = getFieldDef(fieldKey);
    const fieldState = ensureFieldState(fieldKey);
    const committedOption = getCommittedOption(fieldState);
    fieldState.queryText = '';
    field.inputEl.value = committedOption && committedOption.value ? committedOption.label : '';
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

  function updateFilteredOptions(fieldKey) {
    const fieldState = ensureFieldState(fieldKey);
    const normalizedQuery = snapshotTagCatalog.normalizeLabelForComparison(fieldState.queryText);
    fieldState.filteredOptions = normalizedQuery
      ? fieldState.allOptions.filter((option) => option.normalizedSearch.includes(normalizedQuery))
      : fieldState.allOptions.slice();

    const createOption = buildCreateOption(fieldKey, fieldState.queryText);
    if (createOption) {
      fieldState.filteredOptions.unshift(createOption);
    }

    if (!fieldState.filteredOptions.length) {
      fieldState.activeIndex = -1;
      return;
    }

    const committedIndex = fieldState.filteredOptions.findIndex(
      (option) => option.value === fieldState.committedValue && option.kind === 'value'
    );
    fieldState.activeIndex = committedIndex >= 0 ? committedIndex : 0;
  }

  function renderField(fieldKey) {
    const field = getFieldDef(fieldKey);
    const fieldState = ensureFieldState(fieldKey);
    if (!field) return;

    field.labelEl.textContent = tRenderer(field.labelKey);
    field.inputEl.placeholder = tRenderer(SEARCH_PLACEHOLDER_KEY);
    field.inputEl.setAttribute('aria-expanded', fieldState.isOpen ? 'true' : 'false');
    field.listboxEl.hidden = !fieldState.isOpen;
    field.listboxEl.setAttribute('aria-hidden', fieldState.isOpen ? 'false' : 'true');
    field.listboxEl.innerHTML = '';

    if (!fieldState.isOpen) {
      field.inputEl.removeAttribute('aria-activedescendant');
      return;
    }

    if (!fieldState.filteredOptions.length) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'snapshot-save-tags-option is-empty is-disabled';
      emptyEl.setAttribute('role', 'option');
      emptyEl.setAttribute('aria-disabled', 'true');
      emptyEl.textContent = tRenderer(SEARCH_NO_RESULTS_KEY);
      field.listboxEl.appendChild(emptyEl);
      field.inputEl.removeAttribute('aria-activedescendant');
      return;
    }

    fieldState.filteredOptions.forEach((option, index) => {
      const optionEl = document.createElement('div');
      optionEl.id = `snapshotSaveTags-${fieldKey}-option-${index}`;
      optionEl.className = `snapshot-save-tags-option${option.kind === 'clear' ? ' is-clear' : ''}${option.kind === 'create' ? ' is-create' : ''}${index === fieldState.activeIndex ? ' is-active' : ''}`;
      optionEl.setAttribute('role', 'option');
      optionEl.setAttribute(
        'aria-selected',
        option.kind !== 'create' && option.value === fieldState.committedValue ? 'true' : 'false'
      );
      optionEl.dataset.index = String(index);
      optionEl.textContent = option.label;
      optionEl.addEventListener('mousedown', (event) => {
        event.preventDefault();
      });
      optionEl.addEventListener('click', () => {
        void commitFieldOption(fieldKey, index);
      });
      field.listboxEl.appendChild(optionEl);
    });

    if (fieldState.activeIndex >= 0) {
      field.inputEl.setAttribute(
        'aria-activedescendant',
        `snapshotSaveTags-${fieldKey}-option-${fieldState.activeIndex}`
      );
    } else {
      field.inputEl.removeAttribute('aria-activedescendant');
    }
  }

  function renderAllFields() {
    FIELD_DEFS.forEach((field) => renderField(field.key));
  }

  function closeField(fieldKey, { restoreCommittedValue = true } = {}) {
    const field = getFieldDef(fieldKey);
    const fieldState = ensureFieldState(fieldKey);
    if (!field) return;

    fieldState.isOpen = false;
    if (restoreCommittedValue) {
      syncFieldInputFromCommittedValue(fieldKey);
      updateFilteredOptions(fieldKey);
    }
    renderField(fieldKey);
  }

  function closeAllFields() {
    FIELD_DEFS.forEach((field) => closeField(field.key, { restoreCommittedValue: true }));
  }

  function closeOtherFields(activeFieldKey) {
    FIELD_DEFS.forEach((field) => {
      if (field.key !== activeFieldKey) {
        closeField(field.key, { restoreCommittedValue: true });
      }
    });
  }

  function openField(fieldKey, { preserveQuery = false } = {}) {
    const fieldState = ensureFieldState(fieldKey);
    if (!preserveQuery) {
      fieldState.queryText = '';
      syncFieldInputFromCommittedValue(fieldKey);
    }
    closeOtherFields(fieldKey);
    updateFilteredOptions(fieldKey);
    fieldState.isOpen = true;
    renderField(fieldKey);
  }

  function moveActiveIndex(fieldKey, delta) {
    const fieldState = ensureFieldState(fieldKey);
    if (!fieldState.filteredOptions.length) {
      fieldState.activeIndex = -1;
      return;
    }
    if (fieldState.activeIndex < 0) {
      fieldState.activeIndex = 0;
      return;
    }
    const lastIndex = fieldState.filteredOptions.length - 1;
    fieldState.activeIndex = Math.max(0, Math.min(fieldState.activeIndex + delta, lastIndex));
  }

  async function createCustomTagAndCommit(fieldKey, rawLabel) {
    const createInfo = snapshotTagCatalog.createCustomTag(
      currentSnapshotTagPreferences,
      fieldKey,
      rawLabel,
      { getDefaultLabel }
    );
    if (!createInfo.ok) {
      return;
    }

    const persistedPreferences = await persistSnapshotTagPreferences(createInfo.preferences);
    if (!persistedPreferences) return;

    currentSnapshotTagPreferences = persistedPreferences;
    const nextTags = collectTags() || {};
    nextTags[fieldKey] = createInfo.createdTag.value;
    resetFields(nextTags);
  }

  async function commitFieldOption(fieldKey, explicitIndex = null) {
    const fieldState = ensureFieldState(fieldKey);
    const optionIndex = explicitIndex == null ? fieldState.activeIndex : explicitIndex;
    if (optionIndex < 0 || optionIndex >= fieldState.filteredOptions.length) return;

    const option = fieldState.filteredOptions[optionIndex];
    if (option.kind === 'create') {
      await createCustomTagAndCommit(fieldKey, option.createLabel);
      return;
    }

    fieldState.committedValue = option.value;
    closeField(fieldKey, { restoreCommittedValue: true });
  }

  function isNodeWithin(root, node) {
    let current = node || null;
    while (current) {
      if (current === root) return true;
      current = current.parentNode || null;
    }
    return false;
  }

  function isPrintableKey(event) {
    return typeof event.key === 'string' && event.key.length === 1 && !event.ctrlKey && !event.metaKey;
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
      const normalizedInitialOption = normalizedInitialTags
        ? findOptionByValue(fieldState.allOptions, normalizedInitialTags[field.key])
        : null;
      fieldState.committedValue = normalizedInitialOption ? normalizedInitialOption.value : '';
      fieldState.queryText = '';
      fieldState.isOpen = false;
      updateFilteredOptions(field.key);
      syncFieldInputFromCommittedValue(field.key);
    });

    renderAllFields();
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

  function restorePreviousFocus(previousFocus) {
    if (!previousFocus || !document.contains(previousFocus)) return;

    try {
      previousFocus.focus();
    } catch (err) {
      log.warn('Snapshot tags focus restore failed (ignored):', err);
    }
  }

  function focusElementWithoutScroll(element) {
    if (!element || typeof element.focus !== 'function') return;

    try {
      element.focus({ preventScroll: true });
    } catch (_err) {
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
    btnManage.setAttribute('aria-label', tRenderer(MANAGE_BUTTON_ARIA_KEY));
    btnManage.title = tRenderer(MANAGE_BUTTON_LABEL_KEY);
  }

  function ensureFieldEventsBound() {
    if (fieldEventsBound) return;

    FIELD_DEFS.forEach((field) => {
      field.inputEl.addEventListener('click', () => {
        if (isManagerModalOpen()) return;
        if (!ensureFieldState(field.key).isOpen) {
          openField(field.key);
        }
        const fieldState = ensureFieldState(field.key);
        if (fieldState.committedValue && typeof field.inputEl.select === 'function') {
          field.inputEl.select();
        }
      });

      field.inputEl.addEventListener('input', () => {
        if (isManagerModalOpen()) return;
        const fieldState = ensureFieldState(field.key);
        fieldState.queryText = field.inputEl.value;
        openField(field.key, { preserveQuery: true });
      });

      field.inputEl.addEventListener('keydown', (event) => {
        if (isManagerModalOpen()) return;
        const fieldState = ensureFieldState(field.key);

        if (event.key === 'ArrowDown') {
          event.preventDefault();
          if (!fieldState.isOpen) {
            openField(field.key);
            return;
          }
          moveActiveIndex(field.key, 1);
          renderField(field.key);
          return;
        }

        if (event.key === 'ArrowUp' && fieldState.isOpen) {
          event.preventDefault();
          moveActiveIndex(field.key, -1);
          renderField(field.key);
          return;
        }

        if (event.key === 'Enter' && fieldState.isOpen) {
          event.preventDefault();
          void commitFieldOption(field.key);
          return;
        }

        if (event.key === 'Escape' && fieldState.isOpen) {
          event.preventDefault();
          if (typeof event.stopPropagation === 'function') {
            event.stopPropagation();
          }
          closeField(field.key, { restoreCommittedValue: true });
          return;
        }

        if (event.key === 'Tab' && fieldState.isOpen) {
          closeField(field.key, { restoreCommittedValue: true });
          return;
        }

        if (!fieldState.isOpen && isPrintableKey(event) && fieldState.committedValue) {
          field.inputEl.value = '';
          fieldState.queryText = '';
        }
      });
    });

    fieldEventsBound = true;
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
      const previousFocus = document.activeElement && typeof document.activeElement.focus === 'function'
        ? document.activeElement
        : null;

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
        disabled = false,
        onClick,
      }) {
        const text = msgRenderer(labelKey, labelParams);
        const button = rendererIcons.createIconButton({
          iconName,
          size: 'sm',
          className: 'btn-standard btn-standard--square snapshot-tag-manager-icon-button',
          title: text,
          ariaLabel: text,
        });
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

      async function applyManagerPreferencesChange(changeInfo) {
        if (!changeInfo.ok) return false;
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

      function renderManagerContent() {
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
              await applyManagerPreferencesChange(sortInfo);
            },
            { disabled: categoryInfo.visibleOptions.length < 2 }
          ));
          categoryActions.appendChild(createManagerActionButton(
            'renderer.snapshots.manager.restore_hidden_defaults',
            async () => {
              const restoreInfo = snapshotTagCatalog.restoreHiddenDefaultTags(
                managerPreferences,
                category,
                { getDefaultLabel }
              );
              await applyManagerPreferencesChange(restoreInfo);
            },
            {
              disabled: categoryInfo.hiddenDefaultValues.length < 1,
              textParams: { count: categoryInfo.hiddenDefaultValues.length },
            }
          ));
          headingRow.appendChild(categoryActions);
          section.appendChild(headingRow);

          if (draftState.active) {
            const draftWrap = document.createElement('div');
            draftWrap.className = 'snapshot-tag-manager-draft';
            const draftInput = document.createElement('input');
            draftInput.className = 'snapshot-tag-manager-draft-input';
            draftInput.type = 'text';
            draftInput.value = draftState.value;
            draftInput.maxLength = snapshotTagCatalog.MAX_CUSTOM_LABEL_LENGTH;
            draftInput.placeholder = tRenderer('renderer.snapshots.manager.new_tag_placeholder');
            draftInput.setAttribute('aria-label', `${heading.textContent} ${tRenderer('renderer.snapshots.manager.new_tag_placeholder')}`);
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
            validation.textContent = draftState.errorKey ? tRenderer(draftState.errorKey) : '';
            if (!draftState.errorKey) {
              validation.hidden = true;
            }
            section.appendChild(validation);

            setTimeout(() => {
              focusElementWithoutScroll(draftInput);
            }, 0);
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
                iconName: 'arrow-up-strong',
                disabled: index < 1,
                onClick: async () => {
                  const moveInfo = snapshotTagCatalog.moveVisibleTagValue(
                    managerPreferences,
                    category,
                    option.value,
                    'up',
                    { getDefaultLabel }
                  );
                  await applyManagerPreferencesChange(moveInfo);
                },
              }));
              actions.appendChild(createManagerIconButton({
                labelKey: 'renderer.snapshots.manager.move_down',
                labelParams: { label: option.label },
                iconName: 'arrow-down-strong',
                disabled: index >= categoryInfo.visibleOptions.length - 1,
                onClick: async () => {
                  const moveInfo = snapshotTagCatalog.moveVisibleTagValue(
                    managerPreferences,
                    category,
                    option.value,
                    'down',
                    { getDefaultLabel }
                  );
                  await applyManagerPreferencesChange(moveInfo);
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
                    await applyManagerPreferencesChange(hideInfo);
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
                  await applyManagerPreferencesChange(deleteInfo);
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
        managerDoneButton.removeEventListener('click', onDone);
        managerCloseButton.removeEventListener('click', onCancel);
        managerBackdrop.removeEventListener('click', onCancel);
        window.removeEventListener('keydown', onWindowKeyDown);
        managerModal.setAttribute('aria-hidden', 'true');
        restorePreviousFocus(previousFocus);
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
      managerModal.setAttribute('aria-hidden', 'false');
      focusElementWithoutScroll(managerCloseButton || managerDoneButton);
    });
  }

  // =============================================================================
  // Snapshot-save prompt
  // =============================================================================
  async function promptSnapshotSaveTags(options = {}) {
    if (!hasRequiredElements()) {
      log.error('Snapshot save tags modal DOM elements missing.');
      return null;
    }

    ensureFieldEventsBound();
    populateCopy(options.copy);
    currentSnapshotTagPreferences = await loadSnapshotTagPreferences();
    resetFields(options.initialTags);

    return await new Promise((resolve) => {
      let settled = false;
      const previousFocus = document.activeElement && typeof document.activeElement.focus === 'function'
        ? document.activeElement
        : null;

      function cleanup() {
        btnManage.removeEventListener('click', onManageClick);
        btnConfirm.removeEventListener('click', onConfirm);
        btnCancel.removeEventListener('click', onCancel);
        btnClose.removeEventListener('click', onCancel);
        backdrop.removeEventListener('click', onCancel);
        document.removeEventListener('mousedown', onDocumentMouseDown);
        window.removeEventListener('keydown', onWindowKeyDown);
        closeAllFields();
        modal.setAttribute('aria-hidden', 'true');
        restorePreviousFocus(previousFocus);
      }

      function finish(result) {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      }

      function onConfirm() {
        finish({ tags: collectTags() });
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

      function onDocumentMouseDown(event) {
        if (isManagerModalOpen()) return;
        FIELD_DEFS.forEach((field) => {
          if (!isNodeWithin(field.controlEl, event.target)) {
            closeField(field.key, { restoreCommittedValue: true });
          }
        });
      }

      function onWindowKeyDown(ev) {
        if (modal.getAttribute('aria-hidden') !== 'false' || isManagerModalOpen()) return;
        if (ev.key !== 'Escape') return;

        const openFieldDef = FIELD_DEFS.find((field) => ensureFieldState(field.key).isOpen);
        if (openFieldDef) {
          ev.preventDefault();
          closeField(openFieldDef.key, { restoreCommittedValue: true });
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
      document.addEventListener('mousedown', onDocumentMouseDown);
      window.addEventListener('keydown', onWindowKeyDown);

      modal.setAttribute('aria-hidden', 'false');
      FIELD_DEFS[0].inputEl.focus();
    });
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================
  window.Notify.registerCustomPrompt('promptSnapshotTagManager', promptSnapshotTagManager);
  window.Notify.registerCustomPrompt('promptSnapshotSaveTags', promptSnapshotSaveTags);
})();

// =============================================================================
// End of public/js/snapshot_save_tags_modal.js
// =============================================================================
