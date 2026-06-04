// public/js/snapshot_save_tags_modal.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Host the snapshot-save tags modal behavior in the main renderer.
// - Populate localized labels/options before prompting the user.
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
  const DEFAULT_COPY = {
    titleKey: 'renderer.snapshots.title',
    messageKey: 'renderer.snapshots.message',
    confirmKey: 'renderer.snapshots.buttons.confirm',
    cancelKey: 'renderer.snapshots.buttons.cancel',
    closeAriaKey: 'renderer.snapshots.close_aria',
  };

  // =============================================================================
  // UI elements
  // =============================================================================

  const modal = document.getElementById('snapshotSaveTagsModal');
  const backdrop = document.getElementById('snapshotSaveTagsModalBackdrop');
  const title = document.getElementById('snapshotSaveTagsModalTitle');
  const message = document.getElementById('snapshotSaveTagsModalMessage');
  const languageLabel = document.getElementById('snapshotSaveTagsLanguageLabel');
  const languageSelect = document.getElementById('snapshotSaveTagsLanguage');
  const typeLabel = document.getElementById('snapshotSaveTagsTypeLabel');
  const typeSelect = document.getElementById('snapshotSaveTagsType');
  const difficultyLabel = document.getElementById('snapshotSaveTagsDifficultyLabel');
  const difficultySelect = document.getElementById('snapshotSaveTagsDifficulty');
  const btnConfirm = document.getElementById('snapshotSaveTagsModalConfirm');
  const btnCancel = document.getElementById('snapshotSaveTagsModalCancel');
  const btnClose = document.getElementById('snapshotSaveTagsModalClose');
  const REQUIRED_MODAL_ELEMENTS = [
    modal,
    backdrop,
    title,
    message,
    languageLabel,
    languageSelect,
    typeLabel,
    typeSelect,
    difficultyLabel,
    difficultySelect,
    btnConfirm,
    btnCancel,
    btnClose,
  ];

  // =============================================================================
  // Helpers
  // =============================================================================

  function hasRequiredElements() {
    return REQUIRED_MODAL_ELEMENTS.every(Boolean);
  }

  function normalizeOptionalString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function setSelectOptions(selectEl, options, emptyLabel) {
    if (!selectEl) return;
    selectEl.innerHTML = '';

    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = emptyLabel;
    selectEl.appendChild(emptyOption);

    options.forEach((option) => {
      const el = document.createElement('option');
      el.value = option.value;
      el.textContent = tRenderer(option.labelKey);
      selectEl.appendChild(el);
    });
  }

  function getSortedOptionsByLabel(options) {
    return [...options].sort((left, right) => {
      const leftLabel = tRenderer(left.labelKey);
      const rightLabel = tRenderer(right.labelKey);
      return leftLabel.localeCompare(rightLabel, undefined, { sensitivity: 'base' });
    });
  }

  function collectTags() {
    const tags = {};
    const language = normalizeOptionalString(languageSelect.value);
    const type = normalizeOptionalString(typeSelect.value);
    const difficulty = normalizeOptionalString(difficultySelect.value);

    if (language) tags.language = language;
    if (type) tags.type = type;
    if (difficulty) tags.difficulty = difficulty;

    return Object.keys(tags).length ? tags : null;
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
    languageLabel.textContent = tRenderer('renderer.snapshots.labels.language');
    typeLabel.textContent = tRenderer('renderer.snapshots.labels.type');
    difficultyLabel.textContent = tRenderer('renderer.snapshots.labels.difficulty');
    btnConfirm.textContent = tRenderer(resolvedCopy.confirmKey);
    btnCancel.textContent = tRenderer(resolvedCopy.cancelKey);
    btnClose.setAttribute(
      'aria-label',
      tRenderer(resolvedCopy.closeAriaKey)
    );

    setSelectOptions(
      languageSelect,
      getSortedOptionsByLabel(LANGUAGE_OPTIONS),
      tRenderer('renderer.snapshots.empty.language')
    );
    setSelectOptions(
      typeSelect,
      TYPE_OPTIONS,
      tRenderer('renderer.snapshots.empty.type')
    );
    setSelectOptions(
      difficultySelect,
      DIFFICULTY_OPTIONS,
      tRenderer('renderer.snapshots.empty.difficulty')
    );

    languageSelect.value = '';
    typeSelect.value = '';
    difficultySelect.value = '';
  }

  function applyInitialTags(initialTags) {
    const safeTags = initialTags && typeof initialTags === 'object' ? initialTags : null;
    if (!safeTags) return;
    languageSelect.value = typeof safeTags.language === 'string' ? safeTags.language : '';
    typeSelect.value = typeof safeTags.type === 'string' ? safeTags.type : '';
    difficultySelect.value = typeof safeTags.difficulty === 'string' ? safeTags.difficulty : '';
  }

  function restorePreviousFocus(previousFocus) {
    if (!previousFocus || !document.contains(previousFocus)) return;

    try {
      previousFocus.focus();
    } catch (err) {
      log.warn('Could not restore previous focus after snapshot save tags modal:', err);
    }
  }

  // =============================================================================
  // Public entrypoint
  // =============================================================================

  async function promptSnapshotSaveTags(options = {}) {
    if (!hasRequiredElements()) {
      log.error('Snapshot save tags modal DOM elements missing.');
      return null;
    }

    populateCopy(options.copy);
    applyInitialTags(options.initialTags);

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
        window.removeEventListener('keydown', onWindowKeyDown);
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

      function onWindowKeyDown(ev) {
        if (modal.getAttribute('aria-hidden') !== 'false') return;
        if (ev.key === 'Escape') {
          ev.preventDefault();
          finish(null);
        }
      }

      btnConfirm.addEventListener('click', onConfirm);
      btnCancel.addEventListener('click', onCancel);
      btnClose.addEventListener('click', onCancel);
      backdrop.addEventListener('click', onCancel);
      window.addEventListener('keydown', onWindowKeyDown);

      modal.setAttribute('aria-hidden', 'false');
      languageSelect.focus();
    });
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================

  window.Notify = window.Notify || {};
  window.Notify.promptSnapshotSaveTags = promptSnapshotSaveTags;
})();

// =============================================================================
// End of public/js/snapshot_save_tags_modal.js
// =============================================================================
