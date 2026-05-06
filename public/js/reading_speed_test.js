// public/js/reading_speed_test.js
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
  if (!filtersCore
    || typeof filtersCore.computeFilterState !== 'function'
    || typeof filtersCore.normalizeSelection !== 'function') {
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
  const eligibleCountLabel = document.getElementById('readingTestEntryModalEligibleCountLabel');
  const eligibleCountNumber = document.getElementById('readingTestEntryModalEligibleCountNumber');
  const showBundledLabel = document.getElementById('readingTestEntryModalShowBundledLabel');
  const showBundledCheckbox = document.getElementById('readingTestEntryModalShowBundled');
  const showBundledText = document.getElementById('readingTestEntryModalShowBundledText');
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
      && eligibleCountLabel
      && eligibleCountNumber
      && showBundledLabel
      && showBundledCheckbox
      && showBundledText
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

  let onInteractionStateChanged = () => { };
  let onApplyWpm = () => { };
  let previousFocus = null;
  let sessionState = { active: false, stage: 'idle', blocked: false };
  let poolEntries = [];
  let selection = filtersCore.normalizeSelection({});
  let filterState = filtersCore.computeFilterState(poolEntries, selection);
  let poolExhausted = false;
  let entryEmptyState = 'none';
  let currentTextAvailable = false;
  let showBundledEntries = true;
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

  function isPayloadObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function normalizeSessionState(rawState) {
    return {
      active: !!(rawState && rawState.active),
      stage: rawState && typeof rawState.stage === 'string' ? rawState.stage : 'idle',
      blocked: !!(rawState && rawState.blocked),
    };
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

  function rememberPreviousFocus() {
    const activeElement = document.activeElement;
    previousFocus = activeElement && typeof activeElement.focus === 'function'
      ? activeElement
      : null;
  }

  function restorePreviousFocus() {
    if (!previousFocus || !document.contains(previousFocus)) return;
    try {
      previousFocus.focus();
    } catch (err) {
      log.warn('Reading-test focus restore failed (ignored):', err);
    }
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
    return tRenderer(key);
  }

  function getOptionLabel(category, value) {
    const option = optionValueLookupByCategory[category].get(value);
    if (option) {
      return tRenderer(option.labelKey);
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

  function setStabilizing(nextValue) {
    stabilizing = nextValue;
    render();
  }

  async function stabilizeSelection(nextSelection) {
    setStabilizing(true);
    selection = filtersCore.normalizeSelection(nextSelection);

    await Promise.resolve();

    rebuildFilterState();
    setStabilizing(false);
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
    eligibleCountLabel.textContent = tRenderer('renderer.reading_test.entry.eligible_count');
    eligibleCountNumber.textContent = String(filterState.eligibleCount);
  }

  function renderWarningBox() {
    if (entryEmptyState === 'pool_exhausted' && poolExhausted) {
      warningBox.hidden = false;
      warningBox.textContent = tRenderer('renderer.reading_test.entry.pool_exhausted_message');
      return;
    }

    if (entryEmptyState === 'visible_empty_bundled_hidden') {
      warningBox.hidden = false;
      warningBox.textContent = tRenderer('renderer.reading_test.entry.visible_empty_bundled_hidden_message');
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
        : 'renderer.reading_test.entry.buttons.show_instructions'
    );
  }

  function render() {
    title.textContent = tRenderer('renderer.reading_test.entry.title');
    intro.textContent = tRenderer('renderer.reading_test.entry.intro');
    renderIntroVisibility();
    btnClose.setAttribute(
      'aria-label',
      tRenderer('renderer.reading_test.entry.close_aria')
    );
    showBundledText.textContent = tRenderer('renderer.reading_test.entry.buttons.show_bundled_entries');
    showBundledLabel.title = tRenderer('renderer.reading_test.entry.tooltips.show_bundled_entries');
    showBundledCheckbox.checked = showBundledEntries;
    showBundledCheckbox.setAttribute('aria-label', showBundledText.textContent);
    getMoreFilesLink.textContent = tRenderer('renderer.reading_test.entry.buttons.get_more_files');
    getMoreFilesLink.title = tRenderer('renderer.reading_test.entry.tooltips.get_more_files');
    importButton.textContent = tRenderer('renderer.reading_test.entry.buttons.import_files');
    importButton.title = tRenderer('renderer.reading_test.entry.tooltips.import_files');
    resetButton.title = tRenderer('renderer.reading_test.entry.tooltips.reset_pool');
    resetButton.setAttribute('aria-label', resetButton.title);
    btnStart.textContent = tRenderer('renderer.reading_test.entry.buttons.start_random_text');
    btnStart.title = tRenderer('renderer.reading_test.entry.tooltips.start_random_text');
    btnStartCurrentText.textContent = tRenderer('renderer.reading_test.entry.buttons.start_current_text');
    btnStartCurrentText.title = tRenderer('renderer.reading_test.entry.tooltips.start_current_text');

    renderEligibleCount();
    renderWarningBox();
    renderCategorySection('language', languageSection, languageHeading, languageOptions);
    renderCategorySection('type', typeSection, typeHeading, typeOptions);
    renderCategorySection('difficulty', difficultySection, difficultyHeading, difficultyOptions);

    const managementDisabled = stabilizing || isSessionActive();
    showBundledCheckbox.disabled = managementDisabled;
    getMoreFilesLink.setAttribute('aria-disabled', managementDisabled ? 'true' : 'false');
    importButton.disabled = managementDisabled;
    resetButton.disabled = stabilizing || isSessionActive();
    btnStart.disabled = stabilizing || isSessionActive() || filterState.eligibleCount < 1;
    btnStartCurrentText.disabled = stabilizing || isSessionActive() || !currentTextAvailable;

    modal.dataset.stabilizing = stabilizing ? 'true' : 'false';
  }

  function refreshPoolEntriesFromResult(result) {
    if (!isPayloadObject(result) || typeof result.ok !== 'boolean') {
      log.error('Reading-test entry-flow result invalid:', result);
      window.Notify.notifyMain('renderer.alerts.reading_test_pool_error');
      return false;
    }
    if (result.ok !== true) {
      window.Notify.notifyMain(
        typeof result.guidanceKey === 'string'
          ? result.guidanceKey
          : 'renderer.alerts.reading_test_pool_error'
      );
      return false;
    }
    if (typeof result.canOpen !== 'boolean') {
      log.error('Reading-test entry-flow result missing canOpen flag:', result);
      window.Notify.notifyMain('renderer.alerts.reading_test_pool_error');
      return false;
    }
    if (!result.canOpen) {
      window.Notify.notifyMain(
        typeof result.guidanceKey === 'string'
          ? result.guidanceKey
          : 'renderer.alerts.reading_test_precondition_blocked'
      );
      return false;
    }
    if (!Array.isArray(result.entries)
      || typeof result.poolExhausted !== 'boolean'
      || typeof result.currentTextAvailable !== 'boolean'
      || typeof result.showBundledEntries !== 'boolean'
      || typeof result.entryEmptyState !== 'string') {
      log.error('Reading-test entry-flow success payload invalid:', result);
      window.Notify.notifyMain('renderer.alerts.reading_test_pool_error');
      return false;
    }

    poolExhausted = result.poolExhausted;
    entryEmptyState = result.entryEmptyState;
    currentTextAvailable = result.currentTextAvailable;
    showBundledEntries = result.showBundledEntries;
    poolEntries = result.entries;
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
      window.Notify.notifyMain('renderer.alerts.reading_test_unavailable');
      return null;
    }

    try {
      return await getEntryData();
    } catch (err) {
      log.error('Reading-test entry data request failed:', err);
      window.Notify.notifyMain('renderer.alerts.reading_test_pool_error');
      return null;
    }
  }

  async function syncInitialSessionState() {
    const getState = readElectronMethod('getReadingTestState');
    if (!getState) {
      log.warnOnce(
        'BOOTSTRAP:reading-speed-test.getState.missing',
        'getReadingTestState unavailable; reading-test session sync disabled.'
      );
      return;
    }

    try {
      const nextState = await getState();
      if (!isPayloadObject(nextState)) {
        log.warnOnce(
          'BOOTSTRAP:reading-speed-test.getState.invalid',
          'Reading-test initial session-state payload invalid; using defaults.',
          nextState
        );
      }
      sessionState = normalizeSessionState(nextState);
      syncLockState();
    } catch (err) {
      log.warn('BOOTSTRAP: reading-test initial session-state fetch failed (ignored):', err);
    }
  }

  async function refreshEntryDataAfterPoolMutation() {
    const result = await requestEntryData();
    if (!result) return false;
    if (!await refreshPoolEntriesFromResult(result)) {
      return false;
    }
    render();
    return true;
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
      window.Notify.notifyMain('renderer.alerts.reading_test_unavailable');
      return;
    }

    setStabilizing(true);

    try {
      const result = await resetPool();
      if (!await refreshPoolEntriesFromResult(result)) {
        setStabilizing(false);
        closeModal();
        return;
      }
    } catch (err) {
      log.error('Reading-test pool reset failed:', err);
      window.Notify.notifyMain('renderer.alerts.reading_test_pool_error');
    }

    setStabilizing(false);
  }

  function notifyImportSummary(result) {
    if (!result || result.ok !== true || result.canceled) return;

    const totalFailed = (Number(result.failedValidation) || 0)
      + (Number(result.failedArchiveEntries) || 0)
      + (Number(result.failedWrites) || 0);
    const toastType = (Number(result.imported) || 0) > 0
      ? 'info'
      : (totalFailed > 0 || (Number(result.skippedDuplicates) || 0) > 0 ? 'warn' : 'info');

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
  }

  function buildImportDialogPayload() {
    return {
      conflictDialog: {
        conflictTitle: tRenderer('renderer.reading_test.entry.import_conflict.title'),
        conflictMessage: tRenderer('renderer.reading_test.entry.import_conflict.message'),
        conflictDetail: msgRenderer(
          'renderer.reading_test.entry.import_conflict.detail',
          { count: '{count}' }
        ),
        buttons: {
          skip: tRenderer('renderer.reading_test.entry.import_conflict.buttons.skip'),
          replace: tRenderer('renderer.reading_test.entry.import_conflict.buttons.replace'),
          cancel: tRenderer('renderer.reading_test.entry.import_conflict.buttons.cancel'),
        },
      },
    };
  }

  async function handleImportFiles() {
    if (stabilizing || isSessionActive()) return;

    const importReadingTestPoolFiles = readElectronMethod('importReadingTestPoolFiles');
    if (!importReadingTestPoolFiles) {
      log.warnOnce(
        'reading-speed-test.import.missing',
        'importReadingTestPoolFiles unavailable; reading-test pool import skipped.'
      );
      window.Notify.notifyMain('renderer.alerts.reading_test_unavailable');
      return;
    }

    setStabilizing(true);

    try {
      const result = await importReadingTestPoolFiles(buildImportDialogPayload());
      if (!isPayloadObject(result) || typeof result.ok !== 'boolean') {
        setStabilizing(false);
        log.error('Reading-test pool import result invalid:', result);
        window.Notify.notifyMain('renderer.alerts.reading_test_pool_import_failed');
        return;
      }

      if (result.ok !== true) {
        setStabilizing(false);
        window.Notify.notifyMain(
          typeof result.guidanceKey === 'string'
            ? result.guidanceKey
            : 'renderer.alerts.reading_test_pool_import_failed'
        );
        return;
      }

      if (result.canceled) {
        setStabilizing(false);
        return;
      }

      setStabilizing(false);
      await refreshEntryDataAfterPoolMutation();
      notifyImportSummary(result);
    } catch (err) {
      setStabilizing(false);
      log.error('Reading-test pool import failed unexpectedly:', err);
      window.Notify.notifyMain('renderer.alerts.reading_test_pool_import_failed');
    }
  }

  async function handleShowBundledEntriesChanged() {
    if (stabilizing || isSessionActive()) return;

    const setShowBundledEntries = readElectronMethod('setReadingTestShowBundledEntries');
    if (!setShowBundledEntries) {
      log.warnOnce(
        'reading-speed-test.setShowBundledEntries.missing',
        'setReadingTestShowBundledEntries unavailable; reading-test bundled visibility toggle skipped.'
      );
      window.Notify.notifyMain('renderer.alerts.reading_test_unavailable');
      render();
      return;
    }

    const previousShowBundledEntries = showBundledEntries;
    const nextShowBundledEntries = showBundledCheckbox.checked;
    showBundledEntries = nextShowBundledEntries;
    setStabilizing(true);

    try {
      const result = await setShowBundledEntries(nextShowBundledEntries);
      if (!await refreshPoolEntriesFromResult(result)) {
        showBundledEntries = previousShowBundledEntries;
        setStabilizing(false);
        render();
        return;
      }
    } catch (err) {
      showBundledEntries = previousShowBundledEntries;
      log.error('Reading-test bundled visibility update failed:', err);
      window.Notify.notifyMain('renderer.alerts.reading_test_pool_error');
    }

    setStabilizing(false);
  }

  function mapExternalFailureReasonToKey(reason) {
    if (reason === 'blocked') return 'renderer.info.external.blocked';
    return 'renderer.info.external.error';
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
        'openExternalUrl unavailable; reading-test external link open failed (ignored).'
      );
      window.Notify.notifyMain('renderer.info.external.blocked');
      return;
    }

    try {
      Promise.resolve(openExternalUrl(DRIVE_FOLDER_URL))
        .then((result) => {
          if (!isPayloadObject(result) || typeof result.ok !== 'boolean') {
            log.error('Reading-test pool external link result invalid:', result);
            window.Notify.notifyMain('renderer.info.external.error');
            return;
          }
          if (result.ok !== true) {
            window.Notify.notifyMain(mapExternalFailureReasonToKey(result.reason));
            log.warn('Reading-test pool external link blocked or failed:', DRIVE_FOLDER_URL, result);
          }
        })
        .catch((err) => {
          log.error('Reading-test pool external link request failed:', err);
          window.Notify.notifyMain('renderer.info.external.error');
        });
    } catch (err) {
      log.error('Reading-test pool external link request failed:', err);
      window.Notify.notifyMain('renderer.info.external.error');
    }
  }

  async function runStartReadingTest(startReadingTest, payload) {
    setStabilizing(true);

    try {
      const result = await startReadingTest(payload);
      setStabilizing(false);

      if (!isPayloadObject(result) || typeof result.ok !== 'boolean') {
        log.error('Reading-test start result invalid:', result);
        window.Notify.notifyMain('renderer.alerts.reading_test_start_failed');
        return;
      }
      if (result.ok !== true) {
        window.Notify.notifyMain(
          typeof result.guidanceKey === 'string'
            ? result.guidanceKey
            : 'renderer.alerts.reading_test_start_failed'
        );
        return;
      }

      closeModal();
    } catch (err) {
      setStabilizing(false);
      log.error('Reading-test start failed unexpectedly:', err);
      window.Notify.notifyMain('renderer.alerts.reading_test_start_failed');
    }
  }

  async function handleStart() {
    if (stabilizing || isSessionActive() || filterState.eligibleCount < 1) return;

    if (currentTextAvailable) {
      const confirmed = window.Notify.confirmMain(
        'renderer.reading_test.entry.start_random_confirm'
      );
      if (!confirmed) return;
    }

    const startReadingTest = readElectronMethod('startReadingTest');
    if (!startReadingTest) {
      log.warnOnce(
        'reading-speed-test.start.missing',
        'startReadingTest unavailable; reading speed test start skipped.'
      );
      window.Notify.notifyMain('renderer.alerts.reading_test_unavailable');
      return;
    }

    await runStartReadingTest(startReadingTest, { sourceMode: 'pool', selection });
  }

  async function handleStartCurrentText() {
    if (stabilizing || isSessionActive() || !currentTextAvailable) return;

    const startReadingTest = readElectronMethod('startReadingTest');
    if (!startReadingTest) {
      log.warnOnce(
        'reading-speed-test.start-current-text.missing',
        'startReadingTest unavailable; current-text reading speed test start skipped.'
      );
      window.Notify.notifyMain('renderer.alerts.reading_test_unavailable');
      return;
    }

    await runStartReadingTest(startReadingTest, { sourceMode: 'current_text' });
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
    showBundledCheckbox.addEventListener('change', () => {
      void handleShowBundledEntriesChanged();
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

  function handleReadingTestNotice(notice) {
    if (!isPayloadObject(notice) || typeof notice.key !== 'string' || notice.key.length < 1) {
      log.warnOnce(
        'reading-speed-test.notice.invalid',
        'Reading-test notice payload invalid (ignored):',
        notice
      );
      return;
    }
    const type = typeof notice.type === 'string' ? notice.type : 'info';
    const params = isPayloadObject(notice.params) ? notice.params : {};
    if (type === 'info') {
      window.Notify.toastMain(notice.key, { type: 'info', params });
      return;
    }
    window.Notify.notifyMain(notice.key, params);
  }

  function installIpcSubscriptions() {
    const onStateChanged = readElectronMethod('onReadingTestStateChanged');
    if (onStateChanged) {
      try {
        onStateChanged((nextState) => {
          if (!isPayloadObject(nextState)) {
            log.warnOnce(
              'reading-speed-test.onStateChanged.invalid',
              'Reading-test state-changed payload invalid; using defaults.',
              nextState
            );
          }
          sessionState = normalizeSessionState(nextState);
          if (sessionState.active && isModalOpen()) {
            closeModal();
          } else {
            render();
            syncLockState();
          }
        });
      } catch (err) {
        log.warn(
          'BOOTSTRAP: onReadingTestStateChanged registration failed; renderer lock state will not live-sync.',
          err
        );
      }
    } else {
      log.warnOnce(
        'BOOTSTRAP:reading-speed-test.onStateChanged.missing',
        'onReadingTestStateChanged unavailable; renderer lock state will not live-sync.'
      );
    }

    const onNotice = readElectronMethod('onReadingTestNotice');
    if (onNotice) {
      try {
        onNotice((notice) => {
          try {
            handleReadingTestNotice(notice);
          } catch (err) {
            log.error('Reading-test notice handler failed:', err);
          }
        });
      } catch (err) {
        log.warn(
          'BOOTSTRAP: onReadingTestNotice registration failed; reading-test notices will not surface in renderer.',
          err
        );
      }
    } else {
      log.warnOnce(
        'BOOTSTRAP:reading-speed-test.onNotice.missing',
        'onReadingTestNotice unavailable; reading-test notices will not surface in renderer.'
      );
    }

    const onApplyWpmEvent = readElectronMethod('onReadingTestApplyWpm');
    if (onApplyWpmEvent) {
      try {
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
      } catch (err) {
        log.warn(
          'BOOTSTRAP: onReadingTestApplyWpm registration failed; computed WPM will not sync into main renderer.',
          err
        );
      }
    } else {
      log.warnOnce(
        'BOOTSTRAP:reading-speed-test.onApplyWpm.missing',
        'onReadingTestApplyWpm unavailable; computed WPM will not sync into main renderer.'
      );
    }
  }

  // =============================================================================
  // Public API
  // =============================================================================
  function configure({ onLockChange, applyWpm } = {}) {
    onInteractionStateChanged = typeof onLockChange === 'function' ? onLockChange : () => { };
    onApplyWpm = typeof applyWpm === 'function' ? applyWpm : () => { };

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
