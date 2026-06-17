// public/js/snapshot_save_tags_modal.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Host the snapshot-save tags modal behavior in the main renderer.
// - Populate localized labels/options before prompting the user.
// - Provide searchable selectors for snapshot tag categories.
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
  if (!window.RendererI18n || typeof window.RendererI18n.tRenderer !== 'function') {
    throw new Error('[snapshot-save-tags-modal] RendererI18n.tRenderer unavailable; cannot continue');
  }
  const { tRenderer } = window.RendererI18n;
  const snapshotTagCatalog = window.SnapshotTagCatalog || null;
  if (!snapshotTagCatalog
    || !Array.isArray(snapshotTagCatalog.LANGUAGE_OPTIONS)
    || !Array.isArray(snapshotTagCatalog.TYPE_OPTIONS)
    || !Array.isArray(snapshotTagCatalog.DIFFICULTY_OPTIONS)) {
    throw new Error('[snapshot-save-tags-modal] SnapshotTagCatalog unavailable; cannot continue');
  }
  const {
    LANGUAGE_OPTIONS,
    TYPE_OPTIONS,
    DIFFICULTY_OPTIONS,
  } = snapshotTagCatalog;

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

  const FIELD_DEFS = [
    {
      key: 'language',
      labelKey: 'renderer.snapshots.labels.language',
      emptyKey: 'renderer.snapshots.empty.language',
      options: () => getSortedOptionsByLabel(LANGUAGE_OPTIONS),
      labelEl: document.getElementById('snapshotSaveTagsLanguageLabel'),
      controlEl: document.getElementById('snapshotSaveTagsLanguageControl'),
      inputEl: document.getElementById('snapshotSaveTagsLanguageInput'),
      listboxEl: document.getElementById('snapshotSaveTagsLanguageListbox'),
    },
    {
      key: 'type',
      labelKey: 'renderer.snapshots.labels.type',
      emptyKey: 'renderer.snapshots.empty.type',
      options: () => TYPE_OPTIONS.slice(),
      labelEl: document.getElementById('snapshotSaveTagsTypeLabel'),
      controlEl: document.getElementById('snapshotSaveTagsTypeControl'),
      inputEl: document.getElementById('snapshotSaveTagsTypeInput'),
      listboxEl: document.getElementById('snapshotSaveTagsTypeListbox'),
    },
    {
      key: 'difficulty',
      labelKey: 'renderer.snapshots.labels.difficulty',
      emptyKey: 'renderer.snapshots.empty.difficulty',
      options: () => DIFFICULTY_OPTIONS.slice(),
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
  const btnConfirm = document.getElementById('snapshotSaveTagsModalConfirm');
  const btnCancel = document.getElementById('snapshotSaveTagsModalCancel');
  const btnClose = document.getElementById('snapshotSaveTagsModalClose');
  const REQUIRED_MODAL_ELEMENTS = [
    modal,
    backdrop,
    title,
    message,
    btnConfirm,
    btnCancel,
    btnClose,
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

  // =============================================================================
  // Helpers
  // =============================================================================

  function hasRequiredElements() {
    return REQUIRED_MODAL_ELEMENTS.every(Boolean);
  }

  function normalizeOptionalString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function normalizeSearchText(value) {
    return (typeof value === 'string' ? value : '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  function getSortedOptionsByLabel(options) {
    return [...options].sort((left, right) => {
      const leftLabel = tRenderer(left.labelKey);
      const rightLabel = tRenderer(right.labelKey);
      return leftLabel.localeCompare(rightLabel, undefined, { sensitivity: 'base' });
    });
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
  }

  function buildOptions(field) {
    const clearLabel = tRenderer(field.emptyKey);
    const clearOption = {
      value: '',
      label: clearLabel,
      normalizedSearch: normalizeSearchText(clearLabel),
      kind: 'clear',
    };
    const canonicalOptions = field.options().map((option) => {
      const label = tRenderer(option.labelKey);
      return {
        value: option.value,
        label,
        normalizedSearch: `${normalizeSearchText(label)} ${normalizeSearchText(option.value)}`.trim(),
        kind: 'value',
      };
    });
    return [clearOption, ...canonicalOptions];
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

  function updateFilteredOptions(fieldKey) {
    const fieldState = ensureFieldState(fieldKey);
    const normalizedQuery = normalizeSearchText(fieldState.queryText);
    fieldState.filteredOptions = normalizedQuery
      ? fieldState.allOptions.filter((option) => option.normalizedSearch.includes(normalizedQuery))
      : fieldState.allOptions.slice();

    if (!fieldState.filteredOptions.length) {
      fieldState.activeIndex = -1;
      return;
    }

    const committedIndex = fieldState.filteredOptions.findIndex(
      (option) => option.value === fieldState.committedValue
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
      optionEl.className = `snapshot-save-tags-option${option.kind === 'clear' ? ' is-clear' : ''}${index === fieldState.activeIndex ? ' is-active' : ''}`;
      optionEl.setAttribute('role', 'option');
      optionEl.setAttribute('aria-selected', option.value === fieldState.committedValue ? 'true' : 'false');
      optionEl.dataset.index = String(index);
      optionEl.textContent = option.label;
      optionEl.addEventListener('mousedown', (event) => {
        event.preventDefault();
      });
      optionEl.addEventListener('click', () => {
        commitFieldOption(fieldKey, index);
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

  function commitFieldOption(fieldKey, explicitIndex = null) {
    const fieldState = ensureFieldState(fieldKey);
    const optionIndex = explicitIndex == null ? fieldState.activeIndex : explicitIndex;
    if (optionIndex < 0 || optionIndex >= fieldState.filteredOptions.length) return;

    fieldState.committedValue = fieldState.filteredOptions[optionIndex].value;
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

  function ensureFieldEventsBound() {
    if (fieldEventsBound) return;

    FIELD_DEFS.forEach((field) => {
      field.inputEl.addEventListener('click', () => {
        if (!ensureFieldState(field.key).isOpen) {
          openField(field.key);
        }
        const fieldState = ensureFieldState(field.key);
        if (fieldState.committedValue && typeof field.inputEl.select === 'function') {
          field.inputEl.select();
        }
      });

      field.inputEl.addEventListener('input', () => {
        const fieldState = ensureFieldState(field.key);
        fieldState.queryText = field.inputEl.value;
        openField(field.key, { preserveQuery: true });
      });

      field.inputEl.addEventListener('keydown', (event) => {
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
          commitFieldOption(field.key);
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

  function resetFields(initialTags) {
    const safeTags = initialTags && typeof initialTags === 'object' ? initialTags : null;

    FIELD_DEFS.forEach((field) => {
      const fieldState = ensureFieldState(field.key);
      fieldState.allOptions = buildOptions(field);
      const normalizedInitialOption = safeTags
        ? findOptionByValue(fieldState.allOptions, safeTags[field.key])
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
      log.warn('Snapshot save tags modal focus restore failed (ignored):', err);
    }
  }

  // =============================================================================
  // Public prompt
  // =============================================================================

  async function promptSnapshotSaveTags(options = {}) {
    if (!hasRequiredElements()) {
      log.error('Snapshot save tags modal DOM elements missing.');
      return null;
    }

    ensureFieldEventsBound();
    populateCopy(options.copy);
    resetFields(options.initialTags);

    return await new Promise((resolve) => {
      let settled = false;
      const previousFocus = document.activeElement && typeof document.activeElement.focus === 'function'
        ? document.activeElement
        : null;

      function cleanup() {
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

      function onDocumentMouseDown(event) {
        FIELD_DEFS.forEach((field) => {
          if (!isNodeWithin(field.controlEl, event.target)) {
            closeField(field.key, { restoreCommittedValue: true });
          }
        });
      }

      function onWindowKeyDown(ev) {
        if (modal.getAttribute('aria-hidden') !== 'false') return;
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

  window.Notify.promptSnapshotSaveTags = promptSnapshotSaveTags;
})();

// =============================================================================
// End of public/js/snapshot_save_tags_modal.js
// =============================================================================
