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

  // =============================================================================
  // Helpers
  // =============================================================================

  function hasRequiredElements() {
    return !!(modal
      && backdrop
      && title
      && message
      && languageLabel
      && languageSelect
      && typeLabel
      && typeSelect
      && difficultyLabel
      && difficultySelect
      && btnConfirm
      && btnCancel
      && btnClose);
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
    const language = typeof languageSelect.value === 'string' ? languageSelect.value.trim() : '';
    const type = typeof typeSelect.value === 'string' ? typeSelect.value.trim() : '';
    const difficulty = typeof difficultySelect.value === 'string' ? difficultySelect.value.trim() : '';

    if (language) tags.language = language;
    if (type) tags.type = type;
    if (difficulty) tags.difficulty = difficulty;

    return Object.keys(tags).length ? tags : null;
  }

  function populateCopy() {
    title.textContent = tRenderer('renderer.snapshot_save_tags.title');
    message.textContent = tRenderer('renderer.snapshot_save_tags.message');
    languageLabel.textContent = tRenderer('renderer.snapshot_save_tags.labels.language');
    typeLabel.textContent = tRenderer('renderer.snapshot_save_tags.labels.type');
    difficultyLabel.textContent = tRenderer('renderer.snapshot_save_tags.labels.difficulty');
    btnConfirm.textContent = tRenderer('renderer.snapshot_save_tags.buttons.confirm');
    btnCancel.textContent = tRenderer('renderer.snapshot_save_tags.buttons.cancel');
    btnClose.setAttribute(
      'aria-label',
      tRenderer('renderer.snapshot_save_tags.close_aria')
    );

    setSelectOptions(
      languageSelect,
      getSortedOptionsByLabel(LANGUAGE_OPTIONS),
      tRenderer('renderer.snapshot_save_tags.empty.language')
    );
    setSelectOptions(
      typeSelect,
      TYPE_OPTIONS,
      tRenderer('renderer.snapshot_save_tags.empty.type')
    );
    setSelectOptions(
      difficultySelect,
      DIFFICULTY_OPTIONS,
      tRenderer('renderer.snapshot_save_tags.empty.difficulty')
    );

    languageSelect.value = '';
    typeSelect.value = '';
    difficultySelect.value = '';
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

  async function promptSnapshotSaveTags() {
    if (!hasRequiredElements()) {
      log.error('Snapshot save tags modal DOM elements missing.');
      return null;
    }

    populateCopy();

    return await new Promise((resolve) => {
      let settled = false;
      const previousFocus = document.activeElement && typeof document.activeElement.focus === 'function'
        ? document.activeElement
        : null;

      const cleanup = () => {
        btnConfirm.removeEventListener('click', onConfirm);
        btnCancel.removeEventListener('click', onCancel);
        btnClose.removeEventListener('click', onCancel);
        backdrop.removeEventListener('click', onCancel);
        window.removeEventListener('keydown', onWindowKeyDown);
        modal.setAttribute('aria-hidden', 'true');
        restorePreviousFocus(previousFocus);
      };

      const finish = (result) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      const onConfirm = () => finish({ tags: collectTags() });
      const onCancel = () => finish(null);
      const onWindowKeyDown = (ev) => {
        if (modal.getAttribute('aria-hidden') !== 'false') return;
        if (ev.key === 'Escape') {
          ev.preventDefault();
          finish(null);
        }
      };

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
