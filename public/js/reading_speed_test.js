'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Host the reading-speed-test intro/config modal in the main renderer.
// - Keep renderer-side reading-test session state in sync with main-owned state.
// - Render real-combination checkbox filters from current pool metadata.
// - Trigger pool reset/start IPC without bloating renderer.js.
// =============================================================================

(() => {
  // =============================================================================
  // Imports / logger
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[reading-speed-test] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('reading-speed-test');
  log.debug('Reading speed test main-renderer module starting...');

  if (!window.RendererI18n
    || typeof window.RendererI18n.tRenderer !== 'function'
    || typeof window.RendererI18n.msgRenderer !== 'function') {
    throw new Error('[reading-speed-test] RendererI18n unavailable; cannot continue');
  }
  const { tRenderer, msgRenderer } = window.RendererI18n;

  const filtersCore = window.ReadingTestFiltersCore || null;
  if (!filtersCore || typeof filtersCore.computeFilterState !== 'function') {
    throw new Error('[reading-speed-test] ReadingTestFiltersCore unavailable; cannot continue');
  }

  const snapshotTagCatalog = window.SnapshotTagCatalog || null;
  if (!snapshotTagCatalog
    || !Array.isArray(snapshotTagCatalog.LANGUAGE_OPTIONS)
    || !Array.isArray(snapshotTagCatalog.TYPE_OPTIONS)
    || !Array.isArray(snapshotTagCatalog.DIFFICULTY_OPTIONS)) {
    throw new Error('[reading-speed-test] SnapshotTagCatalog unavailable; cannot continue');
  }

  // =============================================================================
  // DOM references
  // =============================================================================
  const modal = document.getElementById('readingTestEntryModal');
  const backdrop = document.getElementById('readingTestEntryModalBackdrop');
  const title = document.getElementById('readingTestEntryModalTitle');
  const introToggle = document.getElementById('readingTestEntryModalIntroToggle');
  const intro = document.getElementById('readingTestEntryModalIntro');
  const warningBox = document.getElementById('readingTestEntryModalWarning');
  const eligibleCount = document.getElementById('readingTestEntryModalEligibleCount');
  const getMoreFilesLink = document.getElementById('readingTestEntryModalGetMoreFiles');
  const importButton = document.getElementById('readingTestEntryModalImport');
  const resetButton = document.getElementById('readingTestEntryModalReset');
  const btnStart = document.getElementById('readingTestEntryModalStart');
  const btnStartCurrentText = document.getElementById('readingTestEntryModalStartCurrentText');
  const btnClose = document.getElementById('readingTestEntryModalClose');
  const languageSection = document.getElementById('readingTestEntryLanguageSection');
  const languageHeading = document.getElementById('readingTestEntryLanguageHeading');
  const languageOptions = document.getElementById('readingTestEntryLanguageOptions');
  const typeSection = document.getElementById('readingTestEntryTypeSection');
  const typeHeading = document.getElementById('readingTestEntryTypeHeading');
  const typeOptions = document.getElementById('readingTestEntryTypeOptions');
  const difficultySection = document.getElementById('readingTestEntryDifficultySection');
  const difficultyHeading = document.getElementById('readingTestEntryDifficultyHeading');
  const difficultyOptions = document.getElementById('readingTestEntryDifficultyOptions');

  function hasRequiredElements() {
    return !!(modal
      && backdrop
      && title
      && introToggle
      && intro
      && warningBox
      && eligibleCount
      && getMoreFilesLink
      && importButton
      && resetButton
      && btnStart
      && btnStartCurrentText
      && btnClose
      && languageSection
      && languageHeading
      && languageOptions
      && typeSection
      && typeHeading
      && typeOptions
      && difficultySection
      && difficultyHeading
      && difficultyOptions);
  }

  if (!hasRequiredElements()) {
    throw new Error('[reading-speed-test] required modal DOM missing; cannot continue');
  }

  // =============================================================================
  // Shared state
  // =============================================================================
  const optionValueLookupByCategory = {
    language: new Map(snapshotTagCatalog.LANGUAGE_OPTIONS.map((option) => [option.value, option])),
    type: new Map(snapshotTagCatalog.TYPE_OPTIONS.map((option) => [option.value, option])),
    difficulty: new Map(snapshotTagCatalog.DIFFICULTY_OPTIONS.map((option) => [option.value, option])),
  };

  let onInteractionStateChanged = () => {};
  let onApplyWpm = () => {};
  let previousFocus = null;
  let sessionState = { active: false, stage: 'idle', blocked: false };
  let poolEntries = [];
  let selection = filtersCore.normalizeSelection({});
  let filterState = filtersCore.computeFilterState(poolEntries, selection);
  let poolExhausted = false;
  let currentTextAvailable = false;
  let stabilizing = false;
  let introExpanded = false;
  let initialized = false;
  const DRIVE_FOLDER_URL = 'https://drive.google.com/drive/folders/1uvNX53NPITaO-jyzqQvr_uZffp28eP4F?usp=sharing';

  // =============================================================================
  // Helpers
  // =============================================================================
  function readElectronMethod(name) {
    return window.electronAPI && typeof window.electronAPI[name] === 'function'
      ? window.electronAPI[name]
      : null;
  }

  function notifyUnavailable() {
    window.Notify.notifyMain('renderer.alerts.reading_test_unavailable');
  }

  function notifyGuidance(guidanceKey, params = {}, { type = 'error' } = {}) {
    if (!guidanceKey) return;
    if (type === 'info' && typeof window.Notify.toastMain === 'function') {
      window.Notify.toastMain(guidanceKey, { type: 'info', params });
      return;
    }
    window.Notify.notifyMain(guidanceKey, params);
  }

  function handleReadingTestNotice(notice) {
    if (!notice || typeof notice !== 'object' || !notice.key) return;
    const type = typeof notice.type === 'string' ? notice.type : 'info';
    notifyGuidance(notice.key, notice.params || {}, { type });
  }

  function isModalOpen() {
    return modal.getAttribute('aria-hidden') === 'false';
  }

  function isSessionActive() {
    return !!(sessionState && sessionState.active);
  }

  function isUiInteractionLocked() {
    return isSessionActive() || isModalOpen();
  }

  function syncLockState() {
    try {
      onInteractionStateChanged();
    } catch (err) {
      log.error('Reading-test interaction lock sync failed:', err);
    }
  }

  function normalizeSessionState(rawState) {
    return {
      active: !!(rawState && rawState.active),
      stage: rawState && typeof rawState.stage === 'string' ? rawState.stage : 'idle',
      blocked: !!(rawState && rawState.blocked),
    };
  }

  function restorePreviousFocus() {
    if (!previousFocus || !document.contains(previousFocus)) return;
    try {
      previousFocus.focus();
    } catch (err) {
      log.warn('Reading-test focus restore failed (ignored):', err);
    }
  }

  function rememberPreviousFocus() {
    const activeElement = document.activeElement;
    previousFocus = activeElement && typeof activeElement.focus === 'function'
      ? activeElement
      : null;
  }

  function setModalVisible(visible) {
    modal.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (visible) {
      introExpanded = false;
      const panel = modal.querySelector('.reading-test-entry-modal-panel');
      if (panel) panel.scrollTop = 0;
      renderIntroVisibility();
    }
    syncLockState();
    if (!visible) {
      restorePreviousFocus();
    }
  }

  function closeModal() {
    if (!isModalOpen()) return;
    setModalVisible(false);
  }

  function getCategoryDisplayLabel(category) {
    const key = `renderer.snapshot_save_tags.labels.${category}`;
    const fallbackByCategory = {
      language: 'Language',
      type: 'Type',
      difficulty: 'Difficulty',
    };
    return tRenderer(key, fallbackByCategory[category] || category);
  }

  function getOptionLabel(category, value) {
    const option = optionValueLookupByCategory[category].get(value);
    if (option) {
      return tRenderer(option.labelKey, option.fallback);
    }
    return value;
  }

  function sortOptionsForDisplay(category, options) {
    if (category === 'difficulty') {
      const order = new Map(
        snapshotTagCatalog.DIFFICULTY_OPTIONS.map((option, index) => [option.value, index])
      );
      return [...options].sort((left, right) => {
        const leftIndex = order.has(left.value) ? order.get(left.value) : Number.MAX_SAFE_INTEGER;
        const rightIndex = order.has(right.value) ? order.get(right.value) : Number.MAX_SAFE_INTEGER;
        return leftIndex - rightIndex;
      });
    }

    return [...options].sort((left, right) => {
      const leftLabel = getOptionLabel(category, left.value);
      const rightLabel = getOptionLabel(category, right.value);
      return leftLabel.localeCompare(rightLabel, undefined, { sensitivity: 'base' });
    });
  }

  function rebuildFilterState() {
    filterState = filtersCore.computeFilterState(poolEntries, selection);
  }

  async function stabilizeSelection(nextSelection) {
    stabilizing = true;
    selection = filtersCore.normalizeSelection(nextSelection);
    render();

    await Promise.resolve();

    rebuildFilterState();
    stabilizing = false;
    render();
  }

  function collectNextSelection(category, value, checked) {
    const nextSelection = filtersCore.normalizeSelection(selection);
    const currentValues = Array.isArray(nextSelection[category]) ? nextSelection[category].slice() : [];
    const filteredValues = currentValues.filter((item) => item !== value);
    nextSelection[category] = checked
      ? [...filteredValues, value]
      : filteredValues;
    return nextSelection;
  }

  function createCheckboxOption(category, optionState) {
    const row = document.createElement('label');
    row.className = 'reading-test-entry-modal-option';
    row.dataset.category = category;
    row.dataset.value = optionState.value;

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !!optionState.checked;
    checkbox.disabled = stabilizing || !optionState.enabled || isSessionActive();
    checkbox.setAttribute('aria-label', getOptionLabel(category, optionState.value));
    checkbox.addEventListener('change', () => {
      if (stabilizing || isSessionActive()) return;
      const nextSelection = collectNextSelection(category, optionState.value, checkbox.checked);
      void stabilizeSelection(nextSelection);
    });

    const text = document.createElement('span');
    text.textContent = getOptionLabel(category, optionState.value);

    row.appendChild(checkbox);
    row.appendChild(text);
    return row;
  }

  function renderCategorySection(category, sectionEl, headingEl, optionsEl) {
    const optionStates = sortOptionsForDisplay(category, filterState.options[category] || []);
    headingEl.textContent = getCategoryDisplayLabel(category);
    optionsEl.innerHTML = '';

    if (!optionStates.length) {
      sectionEl.hidden = true;
      sectionEl.setAttribute('aria-hidden', 'true');
      return;
    }

    sectionEl.hidden = false;
    sectionEl.setAttribute('aria-hidden', 'false');
    optionStates.forEach((optionState) => {
      optionsEl.appendChild(createCheckboxOption(category, optionState));
    });
  }

  function renderEligibleCount() {
    eligibleCount.textContent = msgRenderer(
      'renderer.reading_test.entry.eligible_count',
      { count: filterState.eligibleCount },
      `Eligible files: ${filterState.eligibleCount}`
    );
  }

  function renderWarningBox() {
    if (poolExhausted) {
      warningBox.hidden = false;
      warningBox.textContent = tRenderer(
        'renderer.reading_test.entry.pool_exhausted_message',
        'There are no remaining unused test files. Reset the pool or add more files.'
      );
      return;
    }

    warningBox.hidden = true;
    warningBox.textContent = '';
  }

  function renderIntroVisibility() {
    intro.hidden = !introExpanded;
    introToggle.setAttribute('aria-expanded', introExpanded ? 'true' : 'false');
    introToggle.textContent = tRenderer(
      introExpanded
        ? 'renderer.reading_test.entry.buttons.hide_instructions'
        : 'renderer.reading_test.entry.buttons.show_instructions',
      introExpanded ? 'Hide instructions' : 'Show instructions'
    );
  }

  function render() {
    title.textContent = tRenderer(
      'renderer.reading_test.entry.title',
      'Reading speed test'
    );
    intro.textContent = tRenderer(
      'renderer.reading_test.entry.intro',
      'This test is meant to estimate your real reading speed through a guided session. The app will open the text, start the timer, and ask you to read normally; when you finish, press Pause (⏸) in the Floating Window. Use Stop/Reset (⏹) only if you want to cancel the test. Afterwards, you may review comprehension questions if the text includes them and, at the end, create a preset from the result.\nThis pool uses short texts, so treat the result with caution. It should not be directly extrapolated to long texts, where positive factors such as flow and contextual buildup, and negative factors such as mental recapitulation and fatigue, usually come into play.'
    );
    renderIntroVisibility();
    btnClose.setAttribute(
      'aria-label',
      tRenderer('renderer.reading_test.entry.close_aria', 'Close reading speed test dialog')
    );
    getMoreFilesLink.textContent = tRenderer(
      'renderer.reading_test.entry.buttons.get_more_files',
      'Get more files'
    );
    importButton.textContent = tRenderer(
      'renderer.reading_test.entry.buttons.import_files',
      'Import files...'
    );
    resetButton.textContent = tRenderer(
      'renderer.reading_test.entry.buttons.reset_pool',
      'Reset pool'
    );
    btnStart.textContent = tRenderer(
      'renderer.reading_test.entry.buttons.start_random_text',
      'Start with random text'
    );
    btnStartCurrentText.textContent = tRenderer(
      'renderer.reading_test.entry.buttons.start_current_text',
      'Start with current text'
    );

    renderEligibleCount();
    renderWarningBox();
    renderCategorySection('language', languageSection, languageHeading, languageOptions);
    renderCategorySection('type', typeSection, typeHeading, typeOptions);
    renderCategorySection('difficulty', difficultySection, difficultyHeading, difficultyOptions);

    const managementDisabled = stabilizing || isSessionActive();
    getMoreFilesLink.setAttribute('aria-disabled', managementDisabled ? 'true' : 'false');
    importButton.disabled = managementDisabled;
    resetButton.disabled = stabilizing || isSessionActive();
    btnStart.disabled = stabilizing || isSessionActive() || filterState.eligibleCount < 1;
    btnStartCurrentText.disabled = stabilizing || isSessionActive() || !currentTextAvailable;

    modal.dataset.stabilizing = stabilizing ? 'true' : 'false';
  }

  async function refreshPoolEntriesFromResult(result) {
    if (!result || result.ok !== true) {
      notifyGuidance((result && result.guidanceKey) || 'renderer.alerts.reading_test_pool_error');
      return false;
    }
    if (!result.canOpen) {
      notifyGuidance(result.guidanceKey || 'renderer.alerts.reading_test_precondition_blocked');
      return false;
    }

    poolExhausted = !!result.poolExhausted;
    currentTextAvailable = !!result.currentTextAvailable;
    poolEntries = Array.isArray(result.entries) ? result.entries : [];
    rebuildFilterState();
    return true;
  }

  async function requestEntryData() {
    const getEntryData = readElectronMethod('getReadingTestEntryData');
    if (!getEntryData) {
      log.warnOnce(
        'reading-speed-test.getEntryData.missing',
        'getReadingTestEntryData unavailable; reading speed test entry flow skipped.'
      );
      notifyUnavailable();
      return null;
    }

    try {
      return await getEntryData();
    } catch (err) {
      log.error('Reading-test entry data request failed:', err);
      notifyGuidance('renderer.alerts.reading_test_pool_error');
      return null;
    }
  }

  async function syncInitialSessionState() {
    const getState = readElectronMethod('getReadingTestState');
    if (!getState) {
      log.warnOnce(
        'reading-speed-test.getState.missing',
        'getReadingTestState unavailable; reading-test session sync disabled.'
      );
      return;
    }

    try {
      sessionState = normalizeSessionState(await getState());
      syncLockState();
    } catch (err) {
      log.warn('Reading-test initial session-state fetch failed (ignored):', err);
    }
  }

  async function openEntryFlow() {
    if (stabilizing || isSessionActive()) return;

    const result = await requestEntryData();
    if (!result) return;

    if (!await refreshPoolEntriesFromResult(result)) {
      return;
    }

    selection = filtersCore.normalizeSelection({});
    rebuildFilterState();
    rememberPreviousFocus();
    render();
    setModalVisible(true);
  }

  async function handleResetPool() {
    if (stabilizing || isSessionActive()) return;

    const confirmed = window.Notify.confirmMain(
      'renderer.reading_test.entry.reset_confirm'
    );
    if (!confirmed) return;

    const resetPool = readElectronMethod('resetReadingTestPool');
    if (!resetPool) {
      log.warnOnce(
        'reading-speed-test.resetPool.missing',
        'resetReadingTestPool unavailable; pool reset skipped.'
      );
      notifyUnavailable();
      return;
    }

    stabilizing = true;
    render();

    try {
      const result = await resetPool();
      if (!await refreshPoolEntriesFromResult(result)) {
        stabilizing = false;
        render();
        closeModal();
        return;
      }
    } catch (err) {
      log.error('Reading-test pool reset failed:', err);
      notifyGuidance('renderer.alerts.reading_test_pool_error');
    }

    stabilizing = false;
    rebuildFilterState();
    render();
  }

  function notifyImportSummary(result) {
    if (!result || result.ok !== true || result.canceled) return;

    const totalFailed = (Number(result.failedValidation) || 0)
      + (Number(result.failedArchiveEntries) || 0)
      + (Number(result.failedWrites) || 0);
    const toastType = (Number(result.imported) || 0) > 0
      ? 'info'
      : (totalFailed > 0 || (Number(result.skippedDuplicates) || 0) > 0 ? 'warn' : 'info');

    if (typeof window.Notify.toastMain === 'function') {
      window.Notify.toastMain('renderer.reading_test.entry.import_summary', {
        type: toastType,
        params: {
          imported: Number(result.imported) || 0,
          skippedDuplicates: Number(result.skippedDuplicates) || 0,
          failedValidation: Number(result.failedValidation) || 0,
          failedArchiveEntries: Number(result.failedArchiveEntries) || 0,
          failedWrites: Number(result.failedWrites) || 0,
        },
      });
      return;
    }

    notifyGuidance('renderer.reading_test.entry.import_summary', {
      imported: Number(result.imported) || 0,
      skippedDuplicates: Number(result.skippedDuplicates) || 0,
      failedValidation: Number(result.failedValidation) || 0,
      failedArchiveEntries: Number(result.failedArchiveEntries) || 0,
      failedWrites: Number(result.failedWrites) || 0,
    });
  }

  function buildImportDialogPayload() {
    return {
      conflictDialog: {
        conflictTitle: tRenderer(
          'renderer.reading_test.entry.import_conflict.title',
          'Import files'
        ),
        conflictMessage: tRenderer(
          'renderer.reading_test.entry.import_conflict.message',
          'Some imported files already exist in the pool. How should duplicates be handled?'
        ),
        conflictDetail: msgRenderer(
          'renderer.reading_test.entry.import_conflict.detail',
          { count: '{count}' },
          '{count} destination filename(s) already exist in the pool.'
        ),
        buttons: {
          skip: tRenderer(
            'renderer.reading_test.entry.import_conflict.buttons.skip',
            'Skip duplicates'
          ),
          replace: tRenderer(
            'renderer.reading_test.entry.import_conflict.buttons.replace',
            'Replace duplicates'
          ),
          cancel: tRenderer(
            'renderer.reading_test.entry.import_conflict.buttons.cancel',
            'Cancel import'
          ),
        },
      },
    };
  }

  async function refreshEntryDataAfterPoolMutation() {
    const result = await requestEntryData();
    if (!result) return false;
    if (!await refreshPoolEntriesFromResult(result)) {
      return false;
    }
    rebuildFilterState();
    render();
    return true;
  }

  async function handleImportFiles() {
    if (stabilizing || isSessionActive()) return;

    const importReadingTestPoolFiles = readElectronMethod('importReadingTestPoolFiles');
    if (!importReadingTestPoolFiles) {
      log.warnOnce(
        'reading-speed-test.import.missing',
        'importReadingTestPoolFiles unavailable; reading-test pool import skipped.'
      );
      notifyUnavailable();
      return;
    }

    stabilizing = true;
    render();

    try {
      const result = await importReadingTestPoolFiles(buildImportDialogPayload());
      if (!result || result.ok !== true) {
        stabilizing = false;
        render();
        notifyGuidance((result && result.guidanceKey) || 'renderer.alerts.reading_test_pool_import_failed');
        return;
      }

      if (result.canceled) {
        stabilizing = false;
        render();
        return;
      }

      stabilizing = false;
      await refreshEntryDataAfterPoolMutation();
      notifyImportSummary(result);
    } catch (err) {
      stabilizing = false;
      render();
      log.error('Reading-test pool import failed unexpectedly:', err);
      notifyGuidance('renderer.alerts.reading_test_pool_import_failed');
    }
  }

  function handleOpenDriveFolder(event) {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    if (stabilizing || isSessionActive()) return;

    const openExternalUrl = readElectronMethod('openExternalUrl');
    if (!openExternalUrl) {
      log.warnOnce(
        'reading-speed-test.external-link.missing',
        'openExternalUrl unavailable; reading-test external link disabled.'
      );
      window.Notify.notifyMain('renderer.info.external.blocked');
      return;
    }

    openExternalUrl(DRIVE_FOLDER_URL)
      .then((result) => {
        if (!result || result.ok !== true) {
          window.Notify.notifyMain(
            result && result.reason === 'blocked'
              ? 'renderer.info.external.blocked'
              : 'renderer.info.external.error'
          );
          log.warn('Reading-test pool external link blocked or failed:', DRIVE_FOLDER_URL, result);
        }
      })
      .catch((err) => {
        log.error('Reading-test pool external link request failed:', err);
        window.Notify.notifyMain('renderer.info.external.error');
      });
  }

  async function handleStart() {
    if (stabilizing || isSessionActive() || filterState.eligibleCount < 1) return;

    const startReadingTest = readElectronMethod('startReadingTest');
    if (!startReadingTest) {
      log.warnOnce(
        'reading-speed-test.start.missing',
        'startReadingTest unavailable; reading speed test start skipped.'
      );
      notifyUnavailable();
      return;
    }

    stabilizing = true;
    render();

    try {
      const result = await startReadingTest({ sourceMode: 'pool', selection });
      stabilizing = false;
      render();

      if (!result || result.ok !== true) {
        notifyGuidance((result && result.guidanceKey) || 'renderer.alerts.reading_test_start_failed');
        return;
      }

      closeModal();
    } catch (err) {
      stabilizing = false;
      render();
      log.error('Reading-test start failed unexpectedly:', err);
      notifyGuidance('renderer.alerts.reading_test_start_failed');
    }
  }

  async function handleStartCurrentText() {
    if (stabilizing || isSessionActive() || !currentTextAvailable) return;

    const startReadingTest = readElectronMethod('startReadingTest');
    if (!startReadingTest) {
      log.warnOnce(
        'reading-speed-test.start-current-text.missing',
        'startReadingTest unavailable; current-text reading speed test start skipped.'
      );
      notifyUnavailable();
      return;
    }

    stabilizing = true;
    render();

    try {
      const result = await startReadingTest({ sourceMode: 'current_text' });
      stabilizing = false;
      render();

      if (!result || result.ok !== true) {
        notifyGuidance((result && result.guidanceKey) || 'renderer.alerts.reading_test_start_failed');
        return;
      }

      closeModal();
    } catch (err) {
      stabilizing = false;
      render();
      log.error('Reading-test start failed unexpectedly:', err);
      notifyGuidance('renderer.alerts.reading_test_start_failed');
    }
  }

  function bindStaticListeners() {
    btnClose.addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);
    introToggle.addEventListener('click', () => {
      introExpanded = !introExpanded;
      renderIntroVisibility();
    });
    getMoreFilesLink.addEventListener('click', handleOpenDriveFolder);
    importButton.addEventListener('click', () => {
      void handleImportFiles();
    });
    resetButton.addEventListener('click', () => {
      void handleResetPool();
    });
    btnStart.addEventListener('click', () => {
      void handleStart();
    });
    btnStartCurrentText.addEventListener('click', () => {
      void handleStartCurrentText();
    });
    window.addEventListener('keydown', (event) => {
      if (!isModalOpen()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeModal();
      }
    });
  }

  function installIpcSubscriptions() {
    const onStateChanged = readElectronMethod('onReadingTestStateChanged');
    if (onStateChanged) {
      onStateChanged((nextState) => {
        sessionState = normalizeSessionState(nextState);
        if (sessionState.active && isModalOpen()) {
          closeModal();
        } else {
          render();
          syncLockState();
        }
      });
    } else {
      log.warnOnce(
        'reading-speed-test.onStateChanged.missing',
        'onReadingTestStateChanged unavailable; renderer lock state will not live-sync.'
      );
    }

    const onNotice = readElectronMethod('onReadingTestNotice');
    if (onNotice) {
      onNotice((notice) => {
        try {
          handleReadingTestNotice(notice);
        } catch (err) {
          log.error('Reading-test notice handler failed:', err);
        }
      });
    } else {
      log.warnOnce(
        'reading-speed-test.onNotice.missing',
        'onReadingTestNotice unavailable; reading-test notices will not surface in renderer.'
      );
    }

    const onApplyWpmEvent = readElectronMethod('onReadingTestApplyWpm');
    if (onApplyWpmEvent) {
      onApplyWpmEvent((payload) => {
        const nextWpm = payload && typeof payload.wpm === 'number'
          ? payload.wpm
          : NaN;
        if (!Number.isFinite(nextWpm)) {
          log.warnOnce(
            'reading-speed-test.applyWpm.invalid',
            'Reading-test apply-WPM payload invalid (ignored):',
            payload
          );
          return;
        }
        try {
          onApplyWpm(nextWpm);
        } catch (err) {
          log.error('Reading-test WPM apply callback failed:', err);
        }
      });
    } else {
      log.warnOnce(
        'reading-speed-test.onApplyWpm.missing',
        'onReadingTestApplyWpm unavailable; computed WPM will not sync into main renderer.'
      );
    }
  }

  // =============================================================================
  // Public API
  // =============================================================================
  function configure({ onLockChange, applyWpm } = {}) {
    onInteractionStateChanged = typeof onLockChange === 'function' ? onLockChange : () => {};
    onApplyWpm = typeof applyWpm === 'function' ? applyWpm : () => {};

    if (!initialized) {
      initialized = true;
      bindStaticListeners();
      installIpcSubscriptions();
      void syncInitialSessionState();
    }

    render();
    syncLockState();
  }

  function applyTranslations() {
    render();
  }

  window.ReadingSpeedTestUi = {
    applyTranslations,
    configure,
    hasBlockingModalOpen: isModalOpen,
    isInteractionLocked: isUiInteractionLocked,
    isSessionActive,
    openEntryFlow,
  };
})();

// =============================================================================
// End of public/js/reading_speed_test.js
// =============================================================================
