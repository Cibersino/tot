// public/task_editor.js
'use strict';

// A required dependency can fail before the Task Editor's normal coordinator
// exists. Report the no-draft terminal state through the already-exposed
// lifecycle bridge when it is available; no renderer draft has been admitted
// at this point.
function reportNoDraftTaskBootstrapFailure(kind) {
  const api = typeof window !== 'undefined' ? window.taskEditorAPI : null;
  if (!api || typeof api.reportTerminalState !== 'function') return false;
  try {
    api.reportTerminalState({
      kind,
      phase: 'no-draft',
      initId: null,
      dirty: null,
    });
    return true;
  } catch (err) {
    console.error('Task Editor startup terminal report failed:', err);
    return false;
  }
}

// =============================================================================
// Overview
// =============================================================================
// Task Editor renderer.
// - Render and edit task rows.
// - Compute per-row and total durations.
// - Persist task lists and column widths via taskEditorAPI.
// - Manage library load/save/delete and link opening.
// - Track dirty state, close confirmations, and translations/settings updates.

// =============================================================================
// Logger / constants
// =============================================================================
if (typeof window.getLogger !== 'function') {
  reportNoDraftTaskBootstrapFailure('bootstrap-logger');
  throw new Error('[task-editor] window.getLogger unavailable; cannot continue');
}
let log = null;
try {
  log = window.getLogger('task-editor');
} catch (err) {
  reportNoDraftTaskBootstrapFailure('bootstrap-logger');
  throw err;
}
if (!log || typeof log.debug !== 'function' || typeof log.warn !== 'function'
  || typeof log.warnOnce !== 'function' || typeof log.error !== 'function') {
  reportNoDraftTaskBootstrapFailure('bootstrap-logger');
  throw new Error('[task-editor] task editor logger unavailable; cannot continue');
}
log.debug('Task Editor starting...');
const rendererIcons = window.RendererIcons || null;
if (!rendererIcons
  || typeof rendererIcons.applyIconToElement !== 'function'
  || typeof rendererIcons.createIconButton !== 'function') {
  reportNoDraftTaskBootstrapFailure('bootstrap-renderer-icons');
  throw new Error('[task-editor] RendererIcons unavailable; cannot continue');
}
const { AppConstants } = window;
if (!AppConstants) {
  reportNoDraftTaskBootstrapFailure('bootstrap-constants');
  throw new Error('[task-editor] AppConstants unavailable; verify constants.js load order');
}
const {
  DEFAULT_LANG,
  WPM_MIN,
  WPM_MAX,
  SNAPSHOT_NAME_MAX_CHARS,
  SNAPSHOT_SOURCE_COMMENT_MAX_CHARS,
  TASK_NAME_MAX_CHARS,
  TASK_ROW_TEXT_MAX_CHARS,
  TASK_ROW_COMMENT_MAX_CHARS,
  TASK_ROW_LINK_MAX_CHARS,
} = AppConstants;
const stopwatchTimeCore = window.StopwatchTimeCore || null;
if (!stopwatchTimeCore || typeof stopwatchTimeCore.createStopwatchTimeUtils !== 'function') {
  reportNoDraftTaskBootstrapFailure('bootstrap-stopwatch-time');
  throw new Error('[task-editor] StopwatchTimeCore.createStopwatchTimeUtils unavailable; cannot continue');
}
const stopwatchTimeUtils = stopwatchTimeCore.createStopwatchTimeUtils();
const {
  formatClockSeconds,
  parseClockSeconds,
} = stopwatchTimeUtils;
const taskDurationCore = window.TaskDurationCore || null;
if (!taskDurationCore || typeof taskDurationCore.createTaskDurationUtils !== 'function') {
  reportNoDraftTaskBootstrapFailure('bootstrap-task-duration');
  throw new Error('[task-editor] TaskDurationCore.createTaskDurationUtils unavailable; cannot continue');
}
const taskDurationUtils = taskDurationCore.createTaskDurationUtils();
const EMPTY_TASK_ROW = Object.freeze({
  texto: '',
  tiempoSeconds: 0,
  percentComplete: 0,
  enlace: '',
  comentario: '',
  snapshotRelPath: '',
});
const taskEditorRoot = document.querySelector('.task-editor');

// =============================================================================
// i18n
// =============================================================================
let idiomaActual = DEFAULT_LANG;
let taskEditorSemanticQueue = Promise.resolve();
let taskEditorTranslationsReady = false;
let taskEditorI18nTerminal = false;
let taskEditorNormalInteractionAvailable = false;
let taskEditorHasInitializedDraft = false;
let taskEditorCurrentInitId = null;
let taskEditorLatestInitId = null;
const pendingTaskInitPayloads = [];

const {
  transitionRendererTranslations,
  tRenderer,
  msgRenderer,
} = window.RendererI18n || {};
if (!transitionRendererTranslations || !tRenderer || !msgRenderer) {
  closeTaskEditorAfterI18nFailure({ startup: true });
  throw new Error('[task-editor] RendererI18n unavailable; cannot continue');
}
const taskEditorColumnLayout = window.TaskEditorColumnLayout || null;
if (!taskEditorColumnLayout || typeof taskEditorColumnLayout.createController !== 'function') {
  closeTaskEditorAfterI18nFailure({ startup: true });
  throw new Error('[task-editor] TaskEditorColumnLayout unavailable; cannot continue');
}

const tr = (path) => tRenderer(path);

// =============================================================================
// DOM references (task_editor.html ids)
// =============================================================================
const taskNameLabel = document.getElementById('taskNameLabel');
const taskNameInput = document.getElementById('taskNameInput');
const btnTaskSave = document.getElementById('btnTaskSave');
const btnTaskDelete = document.getElementById('btnTaskDelete');
const taskSummaryTotalLabel = document.getElementById('taskSummaryTotalLabel');
const taskSummaryTotalValue = document.getElementById('taskSummaryTotalValue');
const taskSummaryLeftLabel = document.getElementById('taskSummaryLeftLabel');
const taskSummaryLeftValue = document.getElementById('taskSummaryLeftValue');
const btnTaskAddRow = document.getElementById('btnTaskAddRow');
const btnTaskAddFiles = document.getElementById('btnTaskAddFiles');
const btnTaskLoadLibrary = document.getElementById('btnTaskLoadLibrary');
const tableBody = document.getElementById('taskTableBody');

// Table columns
const thTiempo = document.getElementById('thTiempo');
const thPercent = document.getElementById('thPercent');
const thFalta = document.getElementById('thFalta');
const thEnlace = document.getElementById('thEnlace');
const thComentario = document.getElementById('thComentario');
const thAcciones = document.getElementById('thAcciones');
const thTextoLabel = document.getElementById('thTextoLabel');
const thTiempoLabel = document.getElementById('thTiempoLabel');
const thPercentLabel = document.getElementById('thPercentLabel');
const thFaltaLabel = document.getElementById('thFaltaLabel');
const thEnlaceLabel = document.getElementById('thEnlaceLabel');
const thComentarioLabel = document.getElementById('thComentarioLabel');
const thAccionesLabel = document.getElementById('thAccionesLabel');
const taskTable = document.getElementById('taskTable');
const taskColGroup = document.getElementById('taskColGroup');
const taskTableWrap = document.querySelector('.task-table-wrap');

// Modals
const commentModal = document.getElementById('commentModal');
const commentBackdrop = document.getElementById('commentBackdrop');
const commentClose = document.getElementById('commentClose');
const commentCancel = document.getElementById('commentCancel');
const commentSave = document.getElementById('commentSave');
const commentInput = document.getElementById('commentInput');
const commentTitle = document.getElementById('commentTitle');
const commentSnapshotSelect = document.getElementById('commentSnapshotSelect');
const commentSnapshotClear = document.getElementById('commentSnapshotClear');
const commentSnapshotPath = document.getElementById('commentSnapshotPath');

const snapshotSourceReminderModal = document.getElementById('snapshotSourceReminderModal');
const snapshotSourceReminderBackdrop = document.getElementById('snapshotSourceReminderBackdrop');
const snapshotSourceReminderClose = document.getElementById('snapshotSourceReminderClose');
const snapshotSourceReminderCancel = document.getElementById('snapshotSourceReminderCancel');
const snapshotSourceReminderSelectFile = document.getElementById('snapshotSourceReminderSelectFile');
const snapshotSourceReminderTitle = document.getElementById('snapshotSourceReminderTitle');
const snapshotSourceReminderText = document.getElementById('snapshotSourceReminderText');
const snapshotSourceReminderCommentLabel = document.getElementById('snapshotSourceReminderCommentLabel');
const snapshotSourceReminderCommentValue = document.getElementById('snapshotSourceReminderCommentValue');

const snapshotDetailsConfirmModal = document.getElementById('snapshotDetailsConfirmModal');
const snapshotDetailsConfirmBackdrop = document.getElementById('snapshotDetailsConfirmBackdrop');
const snapshotDetailsConfirmClose = document.getElementById('snapshotDetailsConfirmClose');
const snapshotDetailsConfirmApply = document.getElementById('snapshotDetailsConfirmApply');
const snapshotDetailsConfirmKeep = document.getElementById('snapshotDetailsConfirmKeep');
const snapshotDetailsConfirmTitle = document.getElementById('snapshotDetailsConfirmTitle');
const snapshotDetailsConfirmText = document.getElementById('snapshotDetailsConfirmText');
const snapshotDetailsConfirmTextSection = document.getElementById('snapshotDetailsConfirmTextSection');
const snapshotDetailsConfirmTextChoice = document.getElementById('snapshotDetailsConfirmTextChoice');
const snapshotDetailsConfirmApplyText = document.getElementById('snapshotDetailsConfirmApplyText');
const snapshotDetailsConfirmApplyTextLabel = document.getElementById('snapshotDetailsConfirmApplyTextLabel');
const snapshotDetailsConfirmCurrentTextLabel = document.getElementById('snapshotDetailsConfirmCurrentTextLabel');
const snapshotDetailsConfirmCurrentTextValue = document.getElementById('snapshotDetailsConfirmCurrentTextValue');
const snapshotDetailsConfirmSnapshotNameLabel = document.getElementById('snapshotDetailsConfirmSnapshotNameLabel');
const snapshotDetailsConfirmSnapshotNameValue = document.getElementById('snapshotDetailsConfirmSnapshotNameValue');
const snapshotDetailsConfirmTimeSection = document.getElementById('snapshotDetailsConfirmTimeSection');
const snapshotDetailsConfirmTimeChoice = document.getElementById('snapshotDetailsConfirmTimeChoice');
const snapshotDetailsConfirmApplyTime = document.getElementById('snapshotDetailsConfirmApplyTime');
const snapshotDetailsConfirmApplyTimeLabel = document.getElementById('snapshotDetailsConfirmApplyTimeLabel');
const snapshotDetailsConfirmCurrentTimeLabel = document.getElementById('snapshotDetailsConfirmCurrentTimeLabel');
const snapshotDetailsConfirmCurrentTimeValue = document.getElementById('snapshotDetailsConfirmCurrentTimeValue');
const snapshotDetailsConfirmEstimateLabel = document.getElementById('snapshotDetailsConfirmEstimateLabel');
const snapshotDetailsConfirmEstimateValue = document.getElementById('snapshotDetailsConfirmEstimateValue');
const snapshotDetailsConfirmWpmLabel = document.getElementById('snapshotDetailsConfirmWpmLabel');
const snapshotDetailsConfirmWpmValue = document.getElementById('snapshotDetailsConfirmWpmValue');

const libraryModal = document.getElementById('libraryModal');
const libraryBackdrop = document.getElementById('libraryBackdrop');
const libraryClose = document.getElementById('libraryClose');
const libraryList = document.getElementById('libraryList');
const libraryEmpty = document.getElementById('libraryEmpty');
const libraryTitle = document.getElementById('libraryTitle');
const librarySearchLabel = document.getElementById('librarySearchLabel');
const librarySearchInput = document.getElementById('librarySearchInput');

const includeCommentModal = document.getElementById('includeCommentModal');
const includeCommentBackdrop = document.getElementById('includeCommentBackdrop');
const includeCommentClose = document.getElementById('includeCommentClose');
const includeCommentYes = document.getElementById('includeCommentYes');
const includeCommentNo = document.getElementById('includeCommentNo');
const includeCommentCancel = document.getElementById('includeCommentCancel');
const includeCommentTitle = document.getElementById('includeCommentTitle');
const includeCommentText = document.getElementById('includeCommentText');

// =============================================================================
// Shared state
// =============================================================================
// Mutable editor session state; reset on load/delete.
let rows = [];
let meta = { name: '', createdAt: '', updatedAt: '', savedWith: '' };
let sourcePath = null;
let dirty = false;
let rowIdCounter = 1;
let pendingCommentRowId = null;
let pendingCommentSnapshotRelPath = '';
let pendingSnapshotDetailsConfirmation = null;
let pendingSnapshotSourceReminderFileSelection = null;
let commentSaveInFlight = false;
let pendingLibraryRowId = null;
let libraryItemsCache = [];
let renderedRowFields = new Map();

let columnLayoutController = null;
try {
  columnLayoutController = taskEditorColumnLayout.createController({
    wrapper: taskTableWrap,
    table: taskTable,
    colGroup: taskColGroup,
    utilityHeaders: {
      comentario: thComentario,
      tiempo: thTiempo,
      percent: thPercent,
      falta: thFalta,
      enlace: thEnlace,
      acciones: thAcciones,
    },
  });
} catch (err) {
  closeTaskEditorAfterI18nFailure({ startup: true, kind: 'column-layout-controller' });
  throw err;
}
if (!columnLayoutController
  || typeof columnLayoutController.initialize !== 'function'
  || typeof columnLayoutController.cancelActiveResize !== 'function') {
  closeTaskEditorAfterI18nFailure({ startup: true, kind: 'column-layout-controller' });
  throw new Error('[task-editor] TaskEditorColumnLayout controller unavailable; cannot continue');
}

// =============================================================================
// Helpers
// =============================================================================
function setTaskEditorNormalInteractionAvailable(available) {
  const nextAvailable = available === true && !taskEditorI18nTerminal;
  taskEditorNormalInteractionAvailable = nextAvailable;
  if (!taskEditorRoot) return;
  taskEditorRoot.toggleAttribute('inert', !nextAvailable);
  taskEditorRoot.setAttribute('aria-busy', nextAvailable ? 'false' : 'true');
}

function markDirty() {
  if (!taskEditorNormalInteractionAvailable) return;
  if (dirty) return;
  dirty = true;
  syncDirtyState();
}

function resetDirty() {
  if (!dirty) return;
  dirty = false;
  syncDirtyState();
}

function syncDirtyState() {
  if (!taskEditorHasInitializedDraft || !Number.isInteger(taskEditorCurrentInitId)) return;
  const api = window.taskEditorAPI;
  if (!api || typeof api.setDirtyState !== 'function') {
    log.warn('taskEditorAPI.setDirtyState unavailable; dirty state sync failed (ignored).');
    return;
  }
  try {
    api.setDirtyState({
      dirty,
      initId: taskEditorCurrentInitId,
    });
  } catch (err) {
    log.warn('taskEditorAPI.setDirtyState failed (ignored):', err);
  }
}

function setTaskFieldInvalidState(input, isInvalid) {
  if (!input) return;
  input.classList.toggle('is-invalid', isInvalid);
  input.setAttribute('aria-invalid', isInvalid ? 'true' : 'false');
}

function resetTaskEditorValidationState() {
  // Table inputs are recreated by renderTable; the task name input persists across sessions.
  setTaskFieldInvalidState(taskNameInput, false);
}

function clampTaskName(input) {
  return input.length > TASK_NAME_MAX_CHARS
    ? input.slice(0, TASK_NAME_MAX_CHARS)
    : input;
}

function normalizeSnapshotRelPath(input) {
  const raw = input.trim();
  if (!raw) return '';
  const normalizedSlashes = raw.replace(/\\/g, '/');
  const withoutLeading = normalizedSlashes.startsWith('/')
    ? normalizedSlashes.slice(1)
    : normalizedSlashes;
  const segments = withoutLeading.split('/').filter(Boolean);
  if (!segments.length) return '';
  if (segments.some((seg) => seg === '.' || seg === '..')) return '';
  return `/${segments.join('/')}`;
}

function isCanonicalSnapshotRelPath(value) {
  return typeof value === 'string' && normalizeSnapshotRelPath(value) === value;
}

function setCommentSnapshotDisplay(snapshotRelPath) {
  if (!commentSnapshotPath) return;
  if (!isCanonicalSnapshotRelPath(snapshotRelPath)) {
    throw new Error('[task-editor] setCommentSnapshotDisplay requires canonical snapshotRelPath');
  }
  if (!snapshotRelPath) {
    commentSnapshotPath.textContent = '';
    commentSnapshotPath.hidden = true;
    if (commentSnapshotClear) commentSnapshotClear.hidden = true;
    return;
  }
  commentSnapshotPath.textContent = snapshotRelPath;
  commentSnapshotPath.hidden = false;
  if (commentSnapshotClear) commentSnapshotClear.hidden = false;
}

function formatDuration(totalSeconds) {
  if (!taskDurationUtils.isWholeDurationSeconds(totalSeconds)) {
    throw new Error('[task-editor] formatDuration requires canonical whole seconds');
  }
  const formattedDuration = formatClockSeconds(totalSeconds);
  if (formattedDuration === null) {
    throw new Error('[task-editor] formatClockSeconds rejected canonical duration');
  }
  return formattedDuration;
}

function parseDuration(input) {
  return parseClockSeconds(input);
}

function parsePercent(input) {
  const raw = input.trim();
  if (!raw) return null;
  const cleaned = raw.endsWith('%') ? raw.slice(0, -1).trim() : raw;
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return taskDurationUtils.isPercentComplete(n) ? n : null;
}

function getFaltaSeconds(row) {
  const remainingSeconds = taskDurationUtils.getRowRemainingSeconds(
    row.tiempoSeconds,
    row.percentComplete
  );
  if (remainingSeconds === null) {
    throw new Error('[task-editor] getRowRemainingSeconds rejected canonical row');
  }
  return remainingSeconds;
}

function renderTaskSummary(summary) {
  const estimatedTotalSeconds = summary === null ? 0 : summary.estimatedTotalSeconds;
  const estimatedRemainingSeconds = summary === null ? 0 : summary.estimatedRemainingSeconds;

  if (taskSummaryTotalValue) {
    taskSummaryTotalValue.textContent = formatDuration(estimatedTotalSeconds);
  }
  if (taskSummaryLeftValue) {
    taskSummaryLeftValue.textContent = formatDuration(estimatedRemainingSeconds);
  }
}

function updateSummary() {
  const summaryResult = taskDurationUtils.deriveTaskSummary(rows);
  if (!summaryResult.ok) {
    throw new Error(`[task-editor] deriveTaskSummary failed: ${summaryResult.code}`);
  }
  renderTaskSummary(summaryResult.summary);
}

function validateCandidateTaskRows(candidateRows) {
  const summaryResult = taskDurationUtils.deriveTaskSummary(candidateRows);
  if (summaryResult.ok) return summaryResult;
  if (summaryResult.code === 'INVALID_SUMMARY') {
    log.warn('Task Editor duration change rejected because the aggregate summary exceeds the safe range.');
    window.Notify.notifyEditor('renderer.tasks.alerts.task_duration_too_large');
    return summaryResult;
  }
  throw new Error(`[task-editor] candidate deriveTaskSummary failed: ${summaryResult.code}`);
}

function openModal(modalEl, initialFocusEl) {
  if (!modalEl) return;
  modalEl.setAttribute('aria-hidden', 'false');
  const fallbackFocus = modalEl.querySelector('.modal-header button');
  window.Notify.activateModalFocus(modalEl, {
    initialFocus: initialFocusEl,
    fallbackFocus,
  });
}

function closeModal(modalEl) {
  if (!modalEl) return;
  modalEl.setAttribute('aria-hidden', 'true');
  window.Notify.deactivateModalFocus(modalEl);
}

// Centralized modal close wiring for consistent behavior across dialogs.
function wireModalClose(modalEl, ...closeTriggers) {
  closeTriggers.forEach((trigger) => {
    if (trigger) trigger.addEventListener('click', () => closeModal(modalEl));
  });
}

function handleTaskEditorModalEscape(event) {
  if (!event || event.key !== 'Escape' || event.defaultPrevented) return;

  const closeEntries = [
    { modal: commentModal, close: dismissCommentModal },
    { modal: libraryModal, close: () => closeModal(libraryModal) },
    { modal: includeCommentModal, close: () => closeModal(includeCommentModal) },
    { modal: snapshotSourceReminderModal, close: () => resolveSnapshotSourceReminder(false) },
    { modal: snapshotDetailsConfirmModal, close: () => resolveSnapshotDetailsConfirmation(false) },
  ];
  const isVisible = ({ modal }) => modal && modal.getAttribute('aria-hidden') === 'false';
  const focusedEntry = closeEntries.find(({ modal }) => isVisible({ modal }) && modal.contains(document.activeElement));
  const entry = focusedEntry || closeEntries.slice().reverse().find(isVisible);
  if (!entry) return;

  event.preventDefault();
  entry.close();
}

// Shared guard for taskEditorAPI methods; emits a user notice and warnOnce on missing APIs.
function getTaskEditorApi(methodName, missingNoticeKey = 'renderer.tasks.alerts.task_unavailable') {
  const api = window.taskEditorAPI;
  if (!api || typeof api[methodName] !== 'function') {
    log.warn('taskEditorAPI missing method (ignored):', methodName);
    if (missingNoticeKey) window.Notify.notifyEditor(missingNoticeKey);
    return null;
  }
  return api;
}

function isFailedTaskEditorResult(result) {
  return !result || result.ok !== true;
}

function getTaskEditorResultCode(result, fallbackCode) {
  return result && typeof result.code === 'string' && result.code
    ? result.code
    : fallbackCode;
}

function isCancelledTaskEditorResultCode(code) {
  return code === 'CANCELLED' || code === 'CONFIRM_DENIED';
}

function setCommentSaveInFlight(inFlight) {
  commentSaveInFlight = inFlight;
  [
    commentClose,
    commentCancel,
    commentSave,
    commentSnapshotSelect,
    commentSnapshotClear,
  ].forEach((control) => {
    if (control) control.disabled = inFlight;
  });
}

function getSnapshotDetailsConfirmationState(confirmation) {
  const hasTextChange = !!confirmation && typeof confirmation.texto === 'string';
  const hasTimeChange = !!(confirmation && confirmation.reading);
  return {
    hasTextChange,
    hasTimeChange,
    allowsIndividualSelection: hasTextChange && hasTimeChange,
  };
}

function updateSnapshotDetailsConfirmationDisplay() {
  const confirmation = pendingSnapshotDetailsConfirmation;
  const row = confirmation && rows.find((candidate) => candidate.id === confirmation.rowId);
  if (!confirmation || !row) return false;

  const {
    hasTextChange,
    hasTimeChange,
    allowsIndividualSelection,
  } = getSnapshotDetailsConfirmationState(confirmation);
  if (snapshotDetailsConfirmTextSection) {
    snapshotDetailsConfirmTextSection.hidden = !hasTextChange;
  }
  if (snapshotDetailsConfirmTimeSection) {
    snapshotDetailsConfirmTimeSection.hidden = !hasTimeChange;
  }
  if (snapshotDetailsConfirmTextChoice) {
    snapshotDetailsConfirmTextChoice.hidden = !allowsIndividualSelection;
  }
  if (snapshotDetailsConfirmTimeChoice) {
    snapshotDetailsConfirmTimeChoice.hidden = !allowsIndividualSelection;
  }

  if (hasTextChange) {
    const hasCurrentName = typeof row.texto === 'string' && !!row.texto.trim();
    if (snapshotDetailsConfirmApplyTextLabel) {
      snapshotDetailsConfirmApplyTextLabel.textContent = tr(
        hasCurrentName
          ? 'renderer.tasks.comentario_modal.snapshot_details_confirm.replace_reading_name'
          : 'renderer.tasks.comentario_modal.snapshot_details_confirm.set_reading_name'
      );
    }
    if (snapshotDetailsConfirmCurrentTextValue) {
      snapshotDetailsConfirmCurrentTextValue.textContent = hasCurrentName
        ? row.texto
        : tr('renderer.tasks.comentario_modal.snapshot_details_confirm.empty');
      snapshotDetailsConfirmCurrentTextValue.classList.toggle('is-empty', !hasCurrentName);
    }
    if (snapshotDetailsConfirmSnapshotNameValue) {
      snapshotDetailsConfirmSnapshotNameValue.textContent = confirmation.texto;
    }
  }

  if (hasTimeChange) {
    if (snapshotDetailsConfirmCurrentTimeValue) {
      snapshotDetailsConfirmCurrentTimeValue.textContent = formatDuration(row.tiempoSeconds);
    }
    if (snapshotDetailsConfirmEstimateValue) {
      snapshotDetailsConfirmEstimateValue.textContent = formatDuration(confirmation.reading.estimatedSeconds);
    }
    if (snapshotDetailsConfirmWpmValue) {
      snapshotDetailsConfirmWpmValue.textContent = `${confirmation.reading.wpm} WPM`;
    }
  }
  return hasTextChange || hasTimeChange;
}

function updateSnapshotDetailsConfirmationApplyState() {
  const confirmation = pendingSnapshotDetailsConfirmation;
  if (!snapshotDetailsConfirmApply || !confirmation) return;

  const {
    hasTextChange,
    hasTimeChange,
    allowsIndividualSelection,
  } = getSnapshotDetailsConfirmationState(confirmation);
  const textSelected = hasTextChange
    && (!allowsIndividualSelection || !!(snapshotDetailsConfirmApplyText && snapshotDetailsConfirmApplyText.checked));
  const timeSelected = hasTimeChange
    && (!allowsIndividualSelection || !!(snapshotDetailsConfirmApplyTime && snapshotDetailsConfirmApplyTime.checked));
  snapshotDetailsConfirmApply.textContent = tr(
    allowsIndividualSelection
      ? 'renderer.tasks.comentario_modal.snapshot_details_confirm.apply_selected'
      : 'renderer.tasks.comentario_modal.snapshot_details_confirm.apply'
  );
  snapshotDetailsConfirmApply.disabled = !textSelected && !timeSelected;
}

function openSnapshotDetailsConfirmation(row, changes) {
  pendingSnapshotDetailsConfirmation = {
    rowId: row.id,
    texto: changes.texto,
    reading: changes.reading,
  };
  if (!updateSnapshotDetailsConfirmationDisplay()) {
    pendingSnapshotDetailsConfirmation = null;
    return false;
  }
  if (snapshotDetailsConfirmApplyText) {
    snapshotDetailsConfirmApplyText.checked = typeof changes.texto === 'string';
  }
  if (snapshotDetailsConfirmApplyTime) {
    snapshotDetailsConfirmApplyTime.checked = !!changes.reading;
  }
  updateSnapshotDetailsConfirmationApplyState();
  const { allowsIndividualSelection } = getSnapshotDetailsConfirmationState(
    pendingSnapshotDetailsConfirmation
  );
  const initialFocus = allowsIndividualSelection
    ? snapshotDetailsConfirmApplyText || snapshotDetailsConfirmApply
    : snapshotDetailsConfirmApply;
  openModal(snapshotDetailsConfirmModal, initialFocus);
  return true;
}

function openSnapshotSourceReminder(row, fields, sourceComment) {
  if (!snapshotSourceReminderCommentValue || !snapshotSourceReminderSelectFile) return false;
  pendingSnapshotSourceReminderFileSelection = { row, fields };
  snapshotSourceReminderCommentValue.textContent = sourceComment;
  openModal(snapshotSourceReminderModal, snapshotSourceReminderSelectFile);
  return true;
}

function dismissSnapshotSourceReminder() {
  pendingSnapshotSourceReminderFileSelection = null;
  if (snapshotSourceReminderCommentValue) snapshotSourceReminderCommentValue.textContent = '';
  closeModal(snapshotSourceReminderModal);
}

async function resolveSnapshotSourceReminder(shouldSelectFile) {
  const selection = pendingSnapshotSourceReminderFileSelection;
  dismissSnapshotSourceReminder();
  if (!shouldSelectFile || !selection) return;

  try {
    await selectTaskFileForRow(selection.row, selection.fields);
  } catch (err) {
    log.error('selectTaskFileForRow failed after snapshot source reminder:', err);
  }
}

function resetPendingCommentDraft() {
  pendingCommentRowId = null;
  pendingCommentSnapshotRelPath = '';
  pendingSnapshotDetailsConfirmation = null;
  setCommentSnapshotDisplay('');
}

function dismissCommentModal() {
  if (pendingSnapshotDetailsConfirmation) {
    resolveSnapshotDetailsConfirmation(false);
    return;
  }
  if (commentSaveInFlight) return;
  resetPendingCommentDraft();
  closeModal(commentModal);
}

function commitCommentChangesAndDismiss({ texto = null, estimatedSeconds = null } = {}) {
  const row = rows.find((r) => r.id === pendingCommentRowId);
  if (!row) {
    dismissCommentModal();
    return true;
  }
  if (texto !== null && typeof texto !== 'string') {
    throw new Error('[task-editor] commitCommentChangesAndDismiss requires texto to be a string or null');
  }
  if (estimatedSeconds !== null && !taskDurationUtils.isWholeDurationSeconds(estimatedSeconds)) {
    throw new Error('[task-editor] commitCommentChangesAndDismiss requires canonical estimatedSeconds or null');
  }

  const nextRow = {
    ...row,
    comentario: commentInput.value,
    snapshotRelPath: pendingCommentSnapshotRelPath,
  };
  if (texto !== null) nextRow.texto = texto;
  if (estimatedSeconds !== null) nextRow.tiempoSeconds = estimatedSeconds;

  const summaryResult = validateCandidateTaskRows(rows.map((candidate) => (
    candidate === row ? nextRow : candidate
  )));
  if (!summaryResult.ok) return false;

  const changed = row.comentario !== nextRow.comentario
    || row.snapshotRelPath !== nextRow.snapshotRelPath
    || row.texto !== nextRow.texto
    || row.tiempoSeconds !== nextRow.tiempoSeconds;
  const needsRender = row.snapshotRelPath !== nextRow.snapshotRelPath
    || row.texto !== nextRow.texto
    || row.tiempoSeconds !== nextRow.tiempoSeconds;
  Object.assign(row, nextRow);
  if (needsRender) renderTable();
  if (changed) markDirty();
  dismissCommentModal();
  return true;
}

function notifySnapshotInspectionFailure(code) {
  if (code === 'NOT_FOUND') {
    window.Notify.notifyEditor('renderer.tasks.alerts.snapshot_missing');
    return;
  }
  if (code === 'INVALID_JSON'
    || code === 'INVALID_SCHEMA'
    || code === 'INVALID_SNAPSHOT_PATH'
    || code === 'PATH_OUTSIDE_SNAPSHOTS') {
    window.Notify.notifyEditor('renderer.tasks.alerts.snapshot_invalid');
    return;
  }
  window.Notify.notifyEditor('renderer.tasks.alerts.snapshot_read_error');
}

function getSnapshotInspectionReading(result) {
  if (!result
    || !Object.prototype.hasOwnProperty.call(result, 'estimatedSeconds')
    || !Object.prototype.hasOwnProperty.call(result, 'wpm')) {
    return { ok: false };
  }
  if (result.estimatedSeconds === null || result.wpm === null) {
    return result.estimatedSeconds === null && result.wpm === null
      ? { ok: true, reading: null }
      : { ok: false };
  }
  if (!Number.isSafeInteger(result.estimatedSeconds)
    || result.estimatedSeconds < 0
    || !Number.isSafeInteger(result.wpm)
    || result.wpm < WPM_MIN
    || result.wpm > WPM_MAX) {
    return { ok: false };
  }
  return {
    ok: true,
    reading: {
      estimatedSeconds: result.estimatedSeconds,
      wpm: result.wpm,
    },
  };
}

function getSnapshotInspectionDetails(result) {
  if (!result
    || !Object.prototype.hasOwnProperty.call(result, 'name')
    || !Object.prototype.hasOwnProperty.call(result, 'sourceComment')) {
    return { ok: false };
  }
  const name = result.name;
  if (name !== null
    && (typeof name !== 'string'
      || !name.trim()
      || name.length > SNAPSHOT_NAME_MAX_CHARS
      || /[\r\n]/.test(name))) {
    return { ok: false };
  }

  const sourceComment = result.sourceComment;
  if (sourceComment !== null
    && (typeof sourceComment !== 'string'
      || !sourceComment.trim()
      || sourceComment.length > SNAPSHOT_SOURCE_COMMENT_MAX_CHARS
      || /[\r\n]/.test(sourceComment))) {
    return { ok: false };
  }

  const readingInfo = getSnapshotInspectionReading(result);
  if (!readingInfo.ok) return { ok: false };
  return {
    ok: true,
    name,
    sourceComment,
    reading: readingInfo.reading,
  };
}

function getSnapshotDetailsChanges(row, details) {
  const texto = details.name !== null && details.name !== row.texto
    ? details.name
    : null;
  const reading = details.reading && details.reading.estimatedSeconds !== row.tiempoSeconds
    ? details.reading
    : null;
  return { texto, reading };
}

async function getSnapshotSourceReminderComment(row) {
  if (!row) return '';
  const snapshotRelPath = row.snapshotRelPath;
  if (!snapshotRelPath) return '';

  const api = getTaskEditorApi('inspectTaskRowSnapshot', null);
  if (!api) return '';

  let result = null;
  try {
    result = await api.inspectTaskRowSnapshot(snapshotRelPath);
  } catch (err) {
    log.warn('Snapshot source reminder inspection failed (ignored):', err);
    return '';
  }

  if (isFailedTaskEditorResult(result)) {
    const code = getTaskEditorResultCode(result, 'READ_FAILED');
    log.warn('Snapshot source reminder inspection failed (ignored):', {
      code,
      snapshotRelPath,
      response: result || null,
    });
    return '';
  }

  const details = getSnapshotInspectionDetails(result);
  if (!details.ok) {
    log.warn('Snapshot source reminder inspection returned invalid details (ignored):', result || null);
    return '';
  }
  return details.sourceComment === null ? '' : details.sourceComment;
}

function resolveSnapshotDetailsConfirmation(applySelectedDetails) {
  const confirmation = pendingSnapshotDetailsConfirmation;
  if (!confirmation) return;
  const {
    hasTextChange,
    hasTimeChange,
    allowsIndividualSelection,
  } = getSnapshotDetailsConfirmationState(confirmation);
  pendingSnapshotDetailsConfirmation = null;
  const committed = commitCommentChangesAndDismiss({
    texto: applySelectedDetails
      && hasTextChange
      && (!allowsIndividualSelection || !!(snapshotDetailsConfirmApplyText && snapshotDetailsConfirmApplyText.checked))
      ? confirmation.texto
      : null,
    estimatedSeconds: applySelectedDetails
      && hasTimeChange
      && (!allowsIndividualSelection || !!(snapshotDetailsConfirmApplyTime && snapshotDetailsConfirmApplyTime.checked))
      ? confirmation.reading.estimatedSeconds
      : null,
  });
  if (!committed) {
    pendingSnapshotDetailsConfirmation = confirmation;
    return;
  }
  closeModal(snapshotDetailsConfirmModal);
}

async function applyCommentChangesAndDismiss() {
  if (commentSaveInFlight || pendingSnapshotDetailsConfirmation) return;

  const row = rows.find((candidate) => candidate.id === pendingCommentRowId);
  if (!row) {
    dismissCommentModal();
    return;
  }

  const nextSnapshotRelPath = pendingCommentSnapshotRelPath;
  const currentSnapshotRelPath = row.snapshotRelPath;
  const snapshotChanged = currentSnapshotRelPath !== nextSnapshotRelPath;
  if (!snapshotChanged || !nextSnapshotRelPath) {
    commitCommentChangesAndDismiss();
    return;
  }

  const api = getTaskEditorApi('inspectTaskRowSnapshot');
  if (!api) return;

  setCommentSaveInFlight(true);
  let result = null;
  try {
    result = await api.inspectTaskRowSnapshot(nextSnapshotRelPath);
  } catch (err) {
    log.warn('inspectTaskRowSnapshot failed:', err);
    window.Notify.notifyEditor('renderer.tasks.alerts.snapshot_read_error');
    return;
  } finally {
    setCommentSaveInFlight(false);
  }

  if (isFailedTaskEditorResult(result)) {
    const code = getTaskEditorResultCode(result, 'READ_FAILED');
    log.warn('inspectTaskRowSnapshot returned failure:', { code, response: result || null });
    notifySnapshotInspectionFailure(code);
    return;
  }

  const details = getSnapshotInspectionDetails(result);
  if (!details.ok) {
    log.warn('inspectTaskRowSnapshot returned invalid snapshot details:', result || null);
    window.Notify.notifyEditor('renderer.tasks.alerts.snapshot_read_error');
    return;
  }
  const changes = getSnapshotDetailsChanges(row, details);
  if (!changes.texto && !changes.reading) {
    commitCommentChangesAndDismiss();
    return;
  }
  if (!openSnapshotDetailsConfirmation(row, changes)) {
    log.error('Snapshot details confirmation could not be opened.');
    window.Notify.notifyEditor('renderer.tasks.alerts.snapshot_read_error');
  }
}

async function selectSnapshotForPendingCommentRow() {
  if (!pendingCommentRowId) return;
  const api = getTaskEditorApi('selectTaskRowSnapshot');
  if (!api) return;
  const res = await api.selectTaskRowSnapshot();
  if (isFailedTaskEditorResult(res)) {
    const code = getTaskEditorResultCode(res, 'READ_FAILED');
    if (isCancelledTaskEditorResultCode(code)) return;
    log.warn('selectTaskRowSnapshot failed:', { code, response: res || null });
    if (code === 'PATH_OUTSIDE_SNAPSHOTS') {
      window.Notify.notifyEditor('renderer.tasks.alerts.link_blocked');
      return;
    }
    window.Notify.notifyEditor('renderer.tasks.alerts.library_load_error');
    return;
  }
  const safeRel = res.snapshotRelPath;
  if (!safeRel || !isCanonicalSnapshotRelPath(safeRel)) {
    log.warn('selectTaskRowSnapshot returned invalid snapshotRelPath:', { snapshotRelPath: res.snapshotRelPath });
    window.Notify.notifyEditor('renderer.tasks.alerts.library_load_error');
    return;
  }
  pendingCommentSnapshotRelPath = safeRel;
  setCommentSnapshotDisplay(safeRel);
}

function clearSnapshotForPendingCommentRow() {
  if (!pendingCommentRowId) return;
  pendingCommentSnapshotRelPath = '';
  setCommentSnapshotDisplay('');
}

async function loadSnapshotForRow(row) {
  if (!row) return;
  const snapshotRelPath = row.snapshotRelPath;
  if (!snapshotRelPath) return;
  const api = getTaskEditorApi('loadTaskRowSnapshot');
  if (!api) return;
  const res = await api.loadTaskRowSnapshot(snapshotRelPath);
  if (isFailedTaskEditorResult(res)) {
    const code = getTaskEditorResultCode(res, 'READ_FAILED');
    if (isCancelledTaskEditorResultCode(code)) return;
    log.warn('loadTaskRowSnapshot failed:', { code, snapshotRelPath, response: res || null });
    if (code === 'NOT_FOUND') {
      window.Notify.notifyEditor('renderer.tasks.alerts.link_missing');
      return;
    }
    if (code === 'PATH_OUTSIDE_SNAPSHOTS') {
      window.Notify.notifyEditor('renderer.tasks.alerts.link_blocked');
      return;
    }
    window.Notify.notifyEditor('renderer.tasks.alerts.link_error');
    return;
  }
}

async function selectFileForRow(row, fields = {}) {
  if (pendingSnapshotSourceReminderFileSelection) return;

  const sourceComment = await getSnapshotSourceReminderComment(row);
  if (sourceComment) {
    if (openSnapshotSourceReminder(row, fields, sourceComment)) return;
    log.error('Snapshot source reminder could not be opened; file selection will continue.');
  }

  await selectTaskFileForRow(row, fields);
}

async function selectTaskFileForRow(row, { textoInput, enlaceInput } = {}) {
  const api = getTaskEditorApi('selectTaskFile');
  if (!api) return;
  const res = await api.selectTaskFile();
  if (isFailedTaskEditorResult(res)) {
    const code = getTaskEditorResultCode(res, 'READ_FAILED');
    if (isCancelledTaskEditorResultCode(code)) return;
    log.warn('selectTaskFile failed:', { code, response: res || null });
    window.Notify.notifyEditor('renderer.tasks.alerts.file_select_error');
    return;
  }
  const filePath = res.filePath;
  if (typeof filePath !== 'string' || !filePath.trim()) {
    log.warn('selectTaskFile returned invalid filePath:', res || null);
    window.Notify.notifyEditor('renderer.tasks.alerts.file_select_error');
    return;
  }
  let changed = false;
  if (filePath !== row.enlace) {
    row.enlace = filePath;
    if (enlaceInput) enlaceInput.value = filePath;
    changed = true;
  }
  if (!row.texto.trim()) {
    const derivedText = deriveRowTextFromPath(filePath);
    if (derivedText && derivedText !== row.texto) {
      row.texto = derivedText;
      if (textoInput) textoInput.value = derivedText;
      changed = true;
    }
  }
  if (changed) markDirty();
}

// =============================================================================
// Rendering / table
// =============================================================================
function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function copyTaskRowData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('[task-editor] copyTaskRowData requires a row object');
  }
  if (!taskDurationUtils.isWholeDurationSeconds(data.tiempoSeconds)) {
    throw new Error('[task-editor] copyTaskRowData requires canonical tiempoSeconds');
  }
  if (!taskDurationUtils.isPercentComplete(data.percentComplete)) {
    throw new Error('[task-editor] copyTaskRowData requires canonical percentComplete');
  }
  if (typeof data.texto !== 'string'
    || typeof data.enlace !== 'string'
    || typeof data.comentario !== 'string'
    || typeof data.snapshotRelPath !== 'string') {
    throw new Error('[task-editor] copyTaskRowData requires string task fields');
  }
  if (!isCanonicalSnapshotRelPath(data.snapshotRelPath)) {
    throw new Error('[task-editor] copyTaskRowData requires canonical snapshotRelPath');
  }
  return {
    texto: data.texto,
    tiempoSeconds: data.tiempoSeconds,
    percentComplete: data.percentComplete,
    enlace: data.enlace,
    comentario: data.comentario,
    snapshotRelPath: data.snapshotRelPath,
  };
}

function copyTaskMeta(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)
    || typeof data.name !== 'string'
    || typeof data.createdAt !== 'string'
    || typeof data.updatedAt !== 'string'
    || typeof data.savedWith !== 'string') {
    throw new Error('[task-editor] task metadata requires string operational fields');
  }
  return {
    name: data.name,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    savedWith: data.savedWith,
  };
}

function copyTaskInitPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || !payload.task || typeof payload.task !== 'object' || Array.isArray(payload.task)
    || !Array.isArray(payload.task.rows)
    || !hasOwn(payload, 'sourcePath')
    || !Number.isInteger(payload.initId) || payload.initId <= 0) {
    throw new Error('[task-editor] task-editor-init payload missing operational task state');
  }

  const sourcePath = payload.sourcePath;
  if (sourcePath !== null && (typeof sourcePath !== 'string' || !sourcePath)) {
    throw new Error('[task-editor] task-editor-init payload has invalid sourcePath');
  }

  return {
    initId: payload.initId,
    meta: copyTaskMeta(payload.task.meta),
    rows: payload.task.rows.map((row) => copyTaskRowData(row)),
    sourcePath,
  };
}

function copyLibraryEntryData(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error('[task-editor] library entry requires an object');
  }
  if (typeof entry.texto !== 'string' || !entry.texto || entry.texto !== entry.texto.trim()) {
    throw new Error('[task-editor] library entry requires canonical nonempty texto');
  }
  if (!taskDurationUtils.isWholeDurationSeconds(entry.tiempoSeconds)) {
    throw new Error('[task-editor] library entry requires whole-second tiempoSeconds');
  }
  if (typeof entry.enlace !== 'string') {
    throw new Error('[task-editor] library entry enlace must be a string');
  }

  const libraryEntry = {
    texto: entry.texto,
    tiempoSeconds: entry.tiempoSeconds,
    enlace: entry.enlace,
  };
  if (hasOwn(entry, 'comentario')) {
    if (typeof entry.comentario !== 'string') {
      throw new Error('[task-editor] library entry comentario must be a string when supplied');
    }
    libraryEntry.comentario = entry.comentario;
  }
  if (hasOwn(entry, 'snapshotRelPath')) {
    if (typeof entry.snapshotRelPath !== 'string'
      || !entry.snapshotRelPath
      || !isCanonicalSnapshotRelPath(entry.snapshotRelPath)) {
      throw new Error('[task-editor] library entry snapshotRelPath must be canonical when supplied');
    }
    libraryEntry.snapshotRelPath = entry.snapshotRelPath;
  }
  return libraryEntry;
}

function copyLibraryEntryAsTaskRow(entry) {
  const libraryEntry = copyLibraryEntryData(entry);
  return copyTaskRowData({
    texto: libraryEntry.texto,
    tiempoSeconds: libraryEntry.tiempoSeconds,
    percentComplete: 0,
    enlace: libraryEntry.enlace,
    comentario: hasOwn(libraryEntry, 'comentario') ? libraryEntry.comentario : '',
    snapshotRelPath: hasOwn(libraryEntry, 'snapshotRelPath') ? libraryEntry.snapshotRelPath : '',
  });
}

function copySavedTaskResult(result) {
  if (!result || result.ok !== true
    || typeof result.path !== 'string' || !result.path
    || !hasOwn(result, 'meta')) {
    throw new Error('[task-editor] saveTaskList returned an invalid successful result');
  }
  return {
    path: result.path,
    meta: copyTaskMeta(result.meta),
  };
}

function materializeTaskRows(canonicalRows) {
  const nextRowIdCounter = rowIdCounter + canonicalRows.length;
  return {
    rows: canonicalRows.map((canonicalData, index) => ({
      id: rowIdCounter + index,
      ...canonicalData,
    })),
    nextRowIdCounter,
  };
}

function deriveRowTextFromPath(filePath) {
  const raw = filePath.trim();
  if (!raw) return '';
  const segments = raw.split(/[\\/]+/).filter(Boolean);
  const fileName = segments.length ? segments[segments.length - 1] : raw;
  const dotIdx = fileName.lastIndexOf('.');
  const baseName = dotIdx > 0 ? fileName.slice(0, dotIdx) : fileName;
  const next = (baseName || fileName || raw).trim();
  return next.length > TASK_ROW_TEXT_MAX_CHARS
    ? next.slice(0, TASK_ROW_TEXT_MAX_CHARS)
    : next;
}

function buildActionButton(iconName, nameKey, onClick, { className = 'btn-standard btn-standard--square' } = {}) {
  const name = tr(nameKey);
  const btn = rendererIcons.createIconButton({
    iconName,
    className,
    ariaLabel: name,
  });
  btn.setAttribute('data-tot-tooltip', name);
  btn.addEventListener('click', onClick);
  return btn;
}

function renderTechnicalValueDescription(container, template, token, value) {
  const placeholder = `{${token}}`;
  const placeholderIndex = template.indexOf(placeholder);
  const prefix = document.createElement('span');
  const technicalValue = document.createElement('bdi');
  const suffix = document.createElement('span');

  container.textContent = '';
  prefix.textContent = placeholderIndex >= 0 ? template.slice(0, placeholderIndex) : template;
  technicalValue.setAttribute('dir', 'ltr');
  technicalValue.textContent = value;
  suffix.textContent = placeholderIndex >= 0
    ? template.slice(placeholderIndex + placeholder.length)
    : '';
  container.appendChild(prefix);
  container.appendChild(technicalValue);
  container.appendChild(suffix);
}

function renderRow(row) {
  const trEl = document.createElement('tr');
  trEl.dataset.rowId = String(row.id);
  const tdFaltaValue = document.createElement('span');

  // Text
  const tdTexto = document.createElement('td');
  const textoInput = document.createElement('input');
  textoInput.type = 'text';
  textoInput.maxLength = TASK_ROW_TEXT_MAX_CHARS;
  textoInput.setAttribute('aria-labelledby', 'thTexto');
  textoInput.setAttribute('aria-invalid', 'false');
  textoInput.value = row.texto;
  textoInput.addEventListener('input', () => {
    const next = textoInput.value;
    if (next.trim()) setTaskFieldInvalidState(textoInput, false);
    if (next !== row.texto) {
      row.texto = next;
      markDirty();
    }
  });
  tdTexto.appendChild(textoInput);

  // Duration
  const tdTiempo = document.createElement('td');
  tdTiempo.className = 'task-cell--time';
  const tiempoInput = document.createElement('input');
  tiempoInput.type = 'text';
  tiempoInput.setAttribute('aria-labelledby', 'thTiempo');
  tiempoInput.setAttribute('aria-invalid', 'false');
  tiempoInput.value = formatDuration(row.tiempoSeconds);
  const commitTiempo = () => {
    const parsed = parseDuration(tiempoInput.value);
    if (parsed === null) {
      tiempoInput.value = formatDuration(row.tiempoSeconds);
      setTaskFieldInvalidState(tiempoInput, false);
      return;
    }
    if (parsed !== row.tiempoSeconds) {
      const summaryResult = validateCandidateTaskRows(rows.map((candidate) => (
        candidate === row ? { ...candidate, tiempoSeconds: parsed } : candidate
      )));
      if (!summaryResult.ok) {
        tiempoInput.value = formatDuration(row.tiempoSeconds);
        setTaskFieldInvalidState(tiempoInput, false);
        return;
      }
      row.tiempoSeconds = parsed;
      tdFaltaValue.textContent = formatDuration(getFaltaSeconds(row));
      renderTaskSummary(summaryResult.summary);
      markDirty();
    }
    tiempoInput.value = formatDuration(row.tiempoSeconds);
    setTaskFieldInvalidState(tiempoInput, false);
  };
  tiempoInput.addEventListener('input', () => {
    setTaskFieldInvalidState(tiempoInput, parseDuration(tiempoInput.value) === null);
  });
  tiempoInput.addEventListener('blur', commitTiempo);
  tiempoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') tiempoInput.blur();
  });
  tdTiempo.appendChild(tiempoInput);

  // Percent complete
  const tdPercent = document.createElement('td');
  tdPercent.className = 'task-cell--percent';
  const percentInput = document.createElement('input');
  percentInput.type = 'text';
  percentInput.setAttribute('aria-labelledby', 'thPercent');
  percentInput.setAttribute('aria-invalid', 'false');
  percentInput.value = `${row.percentComplete}%`;
  const commitPercent = () => {
    const parsed = parsePercent(percentInput.value);
    if (parsed === null) {
      percentInput.value = `${row.percentComplete}%`;
      setTaskFieldInvalidState(percentInput, false);
      return;
    }
    if (parsed !== row.percentComplete) {
      const summaryResult = validateCandidateTaskRows(rows.map((candidate) => (
        candidate === row ? { ...candidate, percentComplete: parsed } : candidate
      )));
      if (!summaryResult.ok) {
        percentInput.value = `${row.percentComplete}%`;
        setTaskFieldInvalidState(percentInput, false);
        return;
      }
      row.percentComplete = parsed;
      tdFaltaValue.textContent = formatDuration(getFaltaSeconds(row));
      renderTaskSummary(summaryResult.summary);
      markDirty();
    }
    percentInput.value = `${row.percentComplete}%`;
    setTaskFieldInvalidState(percentInput, false);
  };
  percentInput.addEventListener('input', () => {
    setTaskFieldInvalidState(percentInput, parsePercent(percentInput.value) === null);
  });
  percentInput.addEventListener('blur', commitPercent);
  percentInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') percentInput.blur();
  });
  tdPercent.appendChild(percentInput);

  // Remaining
  const tdFalta = document.createElement('td');
  tdFalta.className = 'task-cell--remaining';
  tdFaltaValue.textContent = formatDuration(getFaltaSeconds(row));
  tdFalta.appendChild(tdFaltaValue);

  // Link
  const tdEnlace = document.createElement('td');
  const enlaceWrap = document.createElement('div');
  enlaceWrap.className = 'link-cell';
  const enlaceInput = document.createElement('input');
  enlaceInput.type = 'text';
  enlaceInput.maxLength = TASK_ROW_LINK_MAX_CHARS;
  enlaceInput.setAttribute('aria-labelledby', 'thEnlace');
  enlaceInput.setAttribute('aria-invalid', 'false');
  enlaceInput.value = row.enlace;
  enlaceInput.addEventListener('input', () => {
    const next = enlaceInput.value;
    if (next !== row.enlace) {
      setTaskFieldInvalidState(enlaceInput, false);
      row.enlace = next;
      markDirty();
    }
  });
  enlaceInput.addEventListener('blur', () => {
    setTaskFieldInvalidState(enlaceInput, false);
  });
  const linkBrowseName = tr('renderer.tasks.columns.names.file_select');
  const enlaceSelectBtn = rendererIcons.createIconButton({
    iconName: 'folder',
    className: 'btn-standard btn-standard--square',
    ariaLabel: linkBrowseName,
  });
  enlaceSelectBtn.setAttribute('data-tot-tooltip', linkBrowseName);
  enlaceSelectBtn.addEventListener('click', () => {
    selectFileForRow(row, { textoInput, enlaceInput }).catch((err) => log.error('selectFileForRow failed:', err));
  });
  const linkName = tr('renderer.tasks.columns.names.link_open');
  const enlaceBtn = rendererIcons.createIconButton({
    iconName: 'open-target',
    className: 'btn-standard btn-standard--square',
    ariaLabel: linkName,
  });
  enlaceBtn.setAttribute('data-tot-tooltip', linkName);
  enlaceBtn.addEventListener('click', () => {
    void (async () => {
      const raw = enlaceInput.value;
      const api = getTaskEditorApi('openTaskLink');
      if (!api) return;
      const res = await api.openTaskLink(raw);
      if (isFailedTaskEditorResult(res)) {
        const code = getTaskEditorResultCode(res, 'ERROR');
        if (code === 'CONFIRM_DENIED') return;
        log.warn('openTaskLink failed:', { code, response: res || null });
        if (code === 'LINK_MISSING' || code === 'LINK_BLOCKED') {
          setTaskFieldInvalidState(enlaceInput, true);
          enlaceInput.focus();
          window.Notify.notifyEditor(
            code === 'LINK_MISSING'
              ? 'renderer.tasks.alerts.link_missing'
              : 'renderer.tasks.alerts.link_blocked'
          );
          return;
        }
        window.Notify.notifyEditor('renderer.tasks.alerts.link_error');
        return;
      }
    })().catch((err) => log.error('openTaskLink failed:', err));
  });
  enlaceWrap.appendChild(enlaceInput);
  enlaceWrap.appendChild(enlaceSelectBtn);
  enlaceWrap.appendChild(enlaceBtn);
  tdEnlace.appendChild(enlaceWrap);

  // Comment
  const tdComentario = document.createElement('td');
  tdComentario.className = 'task-cell--comment';
  const commentActions = document.createElement('div');
  commentActions.className = 'cell-actions';
  const snapshotRelPath = row.snapshotRelPath;
  if (snapshotRelPath) {
    const snapshotName = tr('renderer.tasks.columns.names.snapshot_load');
    const snapshotBtn = rendererIcons.createIconButton({
      iconName: 'task-text-snapshot-load',
      className: 'btn-standard btn-standard--square',
      ariaLabel: snapshotName,
    });
    const snapshotDescription = document.createElement('span');
    snapshotDescription.id = `taskSnapshotDescription-${row.id}`;
    snapshotDescription.className = 'task-editor-accessible-description';
    renderTechnicalValueDescription(
      snapshotDescription,
      tr('renderer.tasks.columns.descriptions.snapshot_path'),
      'path',
      snapshotRelPath
    );
    snapshotBtn.setAttribute('aria-describedby', snapshotDescription.id);
    snapshotBtn.setAttribute(
      'data-tot-tooltip',
      msgRenderer('renderer.tasks.columns.tooltips.snapshot_load_with_path', {
        path: `\u2068${snapshotRelPath}\u2069`,
      })
    );
    snapshotBtn.addEventListener('click', () => {
      loadSnapshotForRow(row).catch((err) => log.error('loadSnapshotForRow failed:', err));
    });
    commentActions.appendChild(snapshotBtn);
    commentActions.appendChild(snapshotDescription);
  }
  const commentButtonName = tr('renderer.tasks.columns.names.comment');
  const commentBtn = rendererIcons.createIconButton({
    iconName: 'task-comment',
    className: 'btn-standard btn-standard--square',
    ariaLabel: commentButtonName,
  });
  commentBtn.setAttribute('data-tot-tooltip', commentButtonName);
  commentBtn.addEventListener('click', () => {
    pendingCommentRowId = row.id;
    pendingCommentSnapshotRelPath = snapshotRelPath;
    commentInput.value = row.comentario;
    setCommentSnapshotDisplay(pendingCommentSnapshotRelPath);
    openModal(commentModal, commentInput);
  });
  commentActions.appendChild(commentBtn);
  tdComentario.appendChild(commentActions);

  // Actions
  const tdActions = document.createElement('td');
  const actionsWrap = document.createElement('div');
  actionsWrap.className = 'cell-actions';

  const btnUp = buildActionButton('arrow-up', 'renderer.tasks.columns.names.move_up', () => moveRow(row.id, -1), {
    className: 'btn-standard btn-standard--half-width',
  });
  const btnDown = buildActionButton('arrow-down', 'renderer.tasks.columns.names.move_down', () => moveRow(row.id, 1), {
    className: 'btn-standard btn-standard--half-width',
  });
  const btnDelete = buildActionButton('trash', 'renderer.tasks.columns.names.delete_row', () => deleteRow(row.id));
  const btnSaveLib = buildActionButton('task-row-save', 'renderer.tasks.columns.names.library_row_save', () => {
    pendingLibraryRowId = row.id;
    openModal(includeCommentModal, includeCommentYes);
  });

  actionsWrap.appendChild(btnUp);
  actionsWrap.appendChild(btnDown);
  actionsWrap.appendChild(btnSaveLib);
  actionsWrap.appendChild(btnDelete);
  tdActions.appendChild(actionsWrap);

  trEl.appendChild(tdTexto);
  trEl.appendChild(tdComentario);
  trEl.appendChild(tdTiempo);
  trEl.appendChild(tdPercent);
  trEl.appendChild(tdFalta);
  trEl.appendChild(tdEnlace);
  trEl.appendChild(tdActions);

  renderedRowFields.set(row.id, { textoInput });
  return trEl;
}

function renderTable() {
  if (!tableBody) return;
  tableBody.innerHTML = '';
  renderedRowFields = new Map();
  rows.forEach((row) => {
    tableBody.appendChild(renderRow(row));
  });
  updateSummary();
}

// =============================================================================
// Row operations
// =============================================================================
function addRow(data = EMPTY_TASK_ROW) {
  return addRows([data]);
}

function addRows(items) {
  if (!Array.isArray(items) || !items.length) return false;
  const addedRowData = items.map((item) => copyTaskRowData(item));
  const summaryResult = validateCandidateTaskRows([...rows, ...addedRowData]);
  if (!summaryResult.ok) return false;

  const addedRows = materializeTaskRows(addedRowData);
  rows = [...rows, ...addedRows.rows];
  rowIdCounter = addedRows.nextRowIdCounter;
  markDirty();
  renderTable();
  return true;
}

async function addRowsFromSelectedFiles() {
  const api = getTaskEditorApi('selectTaskFiles');
  if (!api) return;
  const res = await api.selectTaskFiles();
  if (isFailedTaskEditorResult(res)) {
    const code = getTaskEditorResultCode(res, 'READ_FAILED');
    if (isCancelledTaskEditorResultCode(code)) return;
    log.warn('selectTaskFiles failed:', { code, response: res || null });
    window.Notify.notifyEditor('renderer.tasks.alerts.file_select_error');
    return;
  }
  const filePaths = Array.isArray(res.filePaths)
    ? res.filePaths
    : null;
  if (!filePaths || !filePaths.length
    || filePaths.some((filePath) => typeof filePath !== 'string' || !filePath.trim())) {
    log.warn('selectTaskFiles returned invalid filePaths:', res || null);
    window.Notify.notifyEditor('renderer.tasks.alerts.file_select_error');
    return;
  }
  addRows(filePaths.map((filePath) => ({
    texto: deriveRowTextFromPath(filePath),
    tiempoSeconds: 0,
    percentComplete: 0,
    enlace: filePath,
    comentario: '',
    snapshotRelPath: '',
  })));
}

function deleteRow(id) {
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return;
  rows.splice(idx, 1);
  markDirty();
  renderTable();
}

function moveRow(id, delta) {
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) return;
  const nextIdx = idx + delta;
  if (nextIdx < 0 || nextIdx >= rows.length) return;
  const temp = rows[idx];
  rows[idx] = rows[nextIdx];
  rows[nextIdx] = temp;
  markDirty();
  renderTable();
}

// =============================================================================
// Task lifecycle (load/save/delete)
// =============================================================================
function applyTaskPayload(payload) {
  // tasks_main owns persisted-task schema validation. The renderer validates only
  // the operational fields it will materialize and use for Task Editor state.
  const nextTask = copyTaskInitPayload(payload);
  const summaryResult = taskDurationUtils.deriveTaskSummary(nextTask.rows);
  if (!summaryResult.ok) {
    throw new Error(`[task-editor] task-editor-init summary invalid: ${summaryResult.code}`);
  }
  const nextRows = materializeTaskRows(nextTask.rows);

  meta = nextTask.meta;
  sourcePath = nextTask.sourcePath;
  rows = nextRows.rows;
  rowIdCounter = nextRows.nextRowIdCounter;
  dirty = false;
  taskNameInput.value = nextTask.meta.name;
  renderTable();
  resetTaskEditorValidationState();
  taskEditorCurrentInitId = nextTask.initId;
  taskEditorLatestInitId = nextTask.initId;
  taskEditorHasInitializedDraft = true;
  syncDirtyState();
  setTaskEditorNormalInteractionAvailable(true);
}

function normalizeRowTexto(row) {
  const normalizedTexto = row.texto.trim();
  if (row.texto === normalizedTexto) return normalizedTexto;
  row.texto = normalizedTexto;
  const renderedFields = renderedRowFields.get(row.id);
  if (renderedFields && renderedFields.textoInput) {
    renderedFields.textoInput.value = normalizedTexto;
  }
  markDirty();
  return normalizedTexto;
}

function validateBeforeSave() {
  const name = clampTaskName(taskNameInput.value).trim();
  if (taskNameInput.value !== name) taskNameInput.value = name;
  setTaskFieldInvalidState(taskNameInput, !name);

  const invalidRows = [];
  for (const row of rows) {
    const normalizedTexto = normalizeRowTexto(row);
    const renderedFields = renderedRowFields.get(row.id);
    const isInvalid = !normalizedTexto;
    setTaskFieldInvalidState(renderedFields && renderedFields.textoInput, isInvalid);
    if (isInvalid) invalidRows.push(renderedFields && renderedFields.textoInput);
  }

  if (!name) {
    taskNameInput.focus();
    window.Notify.notifyEditor('renderer.tasks.alerts.name_required');
    return null;
  }
  if (invalidRows.length) {
    if (invalidRows[0]) invalidRows[0].focus();
    window.Notify.notifyEditor('renderer.tasks.alerts.row_text_required');
    return null;
  }
  return name;
}

async function saveTask() {
  const api = getTaskEditorApi('saveTaskList');
  if (!api) return;
  const name = validateBeforeSave();
  if (name === null) return;

  meta.name = name;
  const payload = {
    meta,
    rows: rows.map((r) => ({
      texto: r.texto,
      tiempoSeconds: r.tiempoSeconds,
      percentComplete: r.percentComplete,
      enlace: r.enlace,
      comentario: r.comentario,
      snapshotRelPath: r.snapshotRelPath,
    })),
    sourcePath,
  };

  const res = await api.saveTaskList(payload);
  if (isFailedTaskEditorResult(res)) {
    const code = getTaskEditorResultCode(res, 'WRITE_FAILED');
    if (code === 'CANCELLED') return;
    log.warn('saveTaskList failed:', { code, response: res || null });
    if (code === 'NAME_REQUIRED') {
      window.Notify.notifyEditor('renderer.tasks.alerts.name_required');
      return;
    }
    if (code === 'PATH_OUTSIDE_TASKS') {
      window.Notify.notifyEditor('renderer.tasks.alerts.task_path_outside');
      return;
    }
    if (code === 'INVALID_SCHEMA') {
      window.Notify.notifyEditor('renderer.tasks.alerts.task_invalid_rows');
      return;
    }
    window.Notify.notifyEditor('renderer.tasks.alerts.task_save_error');
    return;
  }

  const savedTask = copySavedTaskResult(res);
  meta = savedTask.meta;
  sourcePath = savedTask.path;
  resetDirty();
  window.Notify.notifyEditor('renderer.tasks.alerts.task_save_success');
}

async function deleteTask() {
  if (!sourcePath) {
    window.Notify.notifyEditor('renderer.tasks.alerts.task_delete_unavailable');
    return;
  }
  const api = getTaskEditorApi('deleteTaskList');
  if (!api) return;
  const res = await api.deleteTaskList(sourcePath);
  if (isFailedTaskEditorResult(res)) {
    const code = getTaskEditorResultCode(res, 'WRITE_FAILED');
    if (code === 'CONFIRM_DENIED') return;
    log.warn('deleteTaskList failed:', { code, response: res || null });
    window.Notify.notifyEditor('renderer.tasks.alerts.task_delete_error');
    return;
  }

  const now = new Date().toISOString();
  const savedWith = meta.savedWith;
  meta = {
    name: '',
    createdAt: now,
    updatedAt: now,
    savedWith,
  };
  sourcePath = null;
  rows = [];
  resetDirty();
  taskNameInput.value = '';
  renderTable();
  resetTaskEditorValidationState();
}

// =============================================================================
// Library flow (load/save/delete)
// =============================================================================
function renderLibraryItems(items) {
  if (!libraryList) return;
  libraryList.innerHTML = '';
  libraryEmpty.hidden = true;

  if (!items.length) {
    libraryEmpty.hidden = false;
    return;
  }

  items.forEach((entry) => {
    const li = document.createElement('li');
    li.className = 'library-item';
    const text = document.createElement('div');
    text.className = 'library-item__text';
    text.textContent = entry.texto;

    const durationSeconds = entry.tiempoSeconds;
    const controls = document.createElement('div');
    controls.className = 'library-item__controls';
    const time = document.createElement('span');
    time.className = 'library-item__time';
    time.textContent = `(${formatDuration(durationSeconds)})`;
    if (durationSeconds === 0) {
      time.classList.add('library-item__time--hidden');
    }

    const actions = document.createElement('div');
    actions.className = 'cell-actions';

    const btnLoad = buildActionButton('task-row-load', 'renderer.tasks.biblioteca.library_row_load', () => {
      const didAdd = addRow(copyLibraryEntryAsTaskRow(entry));
      if (didAdd) closeModal(libraryModal);
    });
    const btnDelete = buildActionButton('trash', 'renderer.tasks.biblioteca.library_row_delete', async () => {
      try {
        const api = getTaskEditorApi('deleteLibraryEntry');
        if (!api) return;
        const delRes = await api.deleteLibraryEntry(entry.texto);
        if (isFailedTaskEditorResult(delRes)) {
          const code = getTaskEditorResultCode(delRes, 'WRITE_FAILED');
          if (code === 'CONFIRM_DENIED') return;
          log.warn('deleteLibraryEntry failed:', { code, response: delRes || null });
          window.Notify.notifyEditor('renderer.tasks.alerts.library_delete_error');
          return;
        }
        await refreshLibraryList();
      } catch (err) {
        log.error('Task library delete action failed:', err);
      }
    });

    actions.appendChild(btnLoad);
    actions.appendChild(btnDelete);
    controls.appendChild(time);
    controls.appendChild(actions);
    li.appendChild(text);
    li.appendChild(controls);
    libraryList.appendChild(li);
  });
}

function filterLibraryItems() {
  const term = librarySearchInput ? librarySearchInput.value.trim().toLowerCase() : '';
  if (!term) {
    renderLibraryItems(libraryItemsCache);
    return;
  }
  const filtered = libraryItemsCache.filter((entry) => {
    return entry.texto.toLowerCase().includes(term);
  });
  renderLibraryItems(filtered);
}

async function refreshLibraryList() {
  if (!libraryList) return;

  const api = getTaskEditorApi('listLibrary');
  if (!api) return;
  const res = await api.listLibrary();
  if (isFailedTaskEditorResult(res)) {
    const code = getTaskEditorResultCode(res, 'READ_FAILED');
    log.warn('listLibrary failed:', { code, response: res || null });
    window.Notify.notifyEditor('renderer.tasks.alerts.library_load_error');
    return;
  }

  if (!Array.isArray(res.items)) {
    log.warn('listLibrary returned invalid items:', { response: res || null });
    window.Notify.notifyEditor('renderer.tasks.alerts.library_load_error');
    return;
  }

  let nextLibraryItems = null;
  try {
    nextLibraryItems = res.items.map((entry) => copyLibraryEntryData(entry));
  } catch (err) {
    log.warn('listLibrary returned invalid library entries:', err);
    window.Notify.notifyEditor('renderer.tasks.alerts.library_load_error');
    return;
  }

  libraryItemsCache = nextLibraryItems;
  filterLibraryItems();
}

function createLibraryEntryFromRow(row, includeComment) {
  const entry = {
    texto: row.texto,
    tiempoSeconds: row.tiempoSeconds,
    enlace: row.enlace,
  };
  if (includeComment && row.comentario) entry.comentario = row.comentario;
  if (row.snapshotRelPath) entry.snapshotRelPath = row.snapshotRelPath;
  return entry;
}

async function saveRowToLibrary(includeComment) {
  const row = rows.find((r) => r.id === pendingLibraryRowId);
  pendingLibraryRowId = null;
  closeModal(includeCommentModal);
  if (!row) return;
  const normalizedTexto = normalizeRowTexto(row);
  const renderedFields = renderedRowFields.get(row.id);
  const textoInput = renderedFields && renderedFields.textoInput;
  setTaskFieldInvalidState(textoInput, !normalizedTexto);
  if (!normalizedTexto) {
    if (textoInput) textoInput.focus();
    window.Notify.notifyEditor('renderer.tasks.alerts.row_text_required');
    return;
  }
  const api = getTaskEditorApi('saveLibraryEntry');
  if (!api) return;
  const res = await api.saveLibraryEntry(createLibraryEntryFromRow(row, includeComment));
  if (isFailedTaskEditorResult(res)) {
    const code = getTaskEditorResultCode(res, 'WRITE_FAILED');
    if (code === 'CONFIRM_DENIED') return;
    log.warn('saveLibraryEntry failed:', { code, response: res || null, rowId: row.id });
    window.Notify.notifyEditor('renderer.tasks.alerts.library_save_error');
    return;
  }
  window.Notify.notifyEditor('renderer.tasks.alerts.library_save_success');
}

// =============================================================================
// Translations apply
// =============================================================================
async function applyTaskEditorTranslations() {
  document.title = tr('renderer.tasks.title');
  if (taskNameLabel) taskNameLabel.textContent = tr('renderer.tasks.name');
  if (taskNameInput) taskNameInput.setAttribute('placeholder', tr('renderer.tasks.name_placeholder'));
  if (taskSummaryTotalLabel) taskSummaryTotalLabel.textContent = tr('renderer.tasks.summary_total');
  if (taskSummaryLeftLabel) taskSummaryLeftLabel.textContent = tr('renderer.tasks.summary_left');
  if (btnTaskSave) btnTaskSave.textContent = tr('renderer.tasks.save_button');
  if (btnTaskDelete) btnTaskDelete.textContent = tr('renderer.tasks.delete_button');
  if (btnTaskAddRow) btnTaskAddRow.textContent = tr('renderer.tasks.add_row_button');
  if (btnTaskAddFiles) btnTaskAddFiles.textContent = tr('renderer.tasks.add_files_button');
  if (btnTaskLoadLibrary) btnTaskLoadLibrary.textContent = tr('renderer.tasks.open_library_button');

  if (thTextoLabel) thTextoLabel.textContent = tr('renderer.tasks.columns.texto');
  if (thEnlaceLabel) thEnlaceLabel.textContent = tr('renderer.tasks.columns.enlace');
  if (thAccionesLabel) thAccionesLabel.textContent = tr('renderer.tasks.columns.acciones');
  [
    [thComentario, thComentarioLabel, 'comentario'],
    [thTiempo, thTiempoLabel, 'tiempo'],
    [thPercent, thPercentLabel, 'percent'],
    [thFalta, thFaltaLabel, 'falta'],
  ].forEach(([header, label, key]) => {
    if (!header || !label) return;
    label.textContent = tr(`renderer.tasks.columns.${key}`);
    const expandedName = tr(`renderer.tasks.columns.header_names.${key}`);
    header.setAttribute('aria-label', expandedName);
    header.setAttribute('data-tot-tooltip', expandedName);
  });

  if (commentTitle) commentTitle.textContent = tr('renderer.tasks.comentario_modal.comment_title');
  if (commentClose) {
    commentClose.setAttribute('aria-label', tr('renderer.tasks.comentario_modal.close_aria'));
  }
  if (commentInput) {
    commentInput.setAttribute('placeholder', tr('renderer.tasks.comentario_modal.comment_placeholder'));
    commentInput.setAttribute('aria-label', tr('renderer.tasks.comentario_modal.comment_title'));
  }
  if (commentSave) commentSave.textContent = tr('renderer.tasks.save_button');
  if (commentCancel) commentCancel.textContent = tr('renderer.tasks.guardar_lectura_modal.cancel');
  if (commentSnapshotSelect) {
    commentSnapshotSelect.textContent = tr('renderer.tasks.comentario_modal.snapshot_select');
    commentSnapshotSelect.removeAttribute('aria-label');
  }
  if (commentSnapshotClear) {
    const snapshotClearName = tr('renderer.tasks.comentario_modal.snapshot_clear');
    commentSnapshotClear.setAttribute('aria-label', snapshotClearName);
    commentSnapshotClear.setAttribute('data-tot-tooltip', snapshotClearName);
    rendererIcons.applyIconToElement(commentSnapshotClear, 'unlink', {
      preserveContent: false,
      ariaLabel: snapshotClearName,
    });
  }

  if (snapshotSourceReminderTitle) {
    snapshotSourceReminderTitle.textContent = tr('renderer.tasks.comentario_modal.snapshot_source_reminder.title');
  }
  if (snapshotSourceReminderText) {
    snapshotSourceReminderText.textContent = tr('renderer.tasks.comentario_modal.snapshot_source_reminder.message');
  }
  if (snapshotSourceReminderCommentLabel) {
    snapshotSourceReminderCommentLabel.textContent = tr(
      'renderer.tasks.comentario_modal.snapshot_source_reminder.source_comment'
    );
  }
  if (snapshotSourceReminderCancel) {
    snapshotSourceReminderCancel.textContent = tr('renderer.tasks.comentario_modal.snapshot_source_reminder.cancel');
  }
  if (snapshotSourceReminderSelectFile) {
    snapshotSourceReminderSelectFile.textContent = tr(
      'renderer.tasks.comentario_modal.snapshot_source_reminder.select_file'
    );
  }
  if (snapshotSourceReminderClose) {
    const closeName = tr('renderer.tasks.comentario_modal.snapshot_source_reminder.close_aria');
    snapshotSourceReminderClose.setAttribute('aria-label', closeName);
    rendererIcons.applyIconToElement(snapshotSourceReminderClose, 'close', {
      preserveContent: false,
      ariaLabel: closeName,
    });
  }

  if (snapshotDetailsConfirmTitle) {
    snapshotDetailsConfirmTitle.textContent = tr('renderer.tasks.comentario_modal.snapshot_details_confirm.title');
  }
  if (snapshotDetailsConfirmText) {
    snapshotDetailsConfirmText.textContent = tr('renderer.tasks.comentario_modal.snapshot_details_confirm.message');
  }
  if (snapshotDetailsConfirmCurrentTextLabel) {
    snapshotDetailsConfirmCurrentTextLabel.textContent = tr('renderer.tasks.comentario_modal.snapshot_details_confirm.current_name');
  }
  if (snapshotDetailsConfirmSnapshotNameLabel) {
    snapshotDetailsConfirmSnapshotNameLabel.textContent = tr('renderer.tasks.comentario_modal.snapshot_details_confirm.snapshot_name');
  }
  if (snapshotDetailsConfirmApplyTimeLabel) {
    snapshotDetailsConfirmApplyTimeLabel.textContent = tr('renderer.tasks.comentario_modal.snapshot_details_confirm.replace_time');
  }
  if (snapshotDetailsConfirmCurrentTimeLabel) {
    snapshotDetailsConfirmCurrentTimeLabel.textContent = tr('renderer.tasks.comentario_modal.snapshot_details_confirm.current_time');
  }
  if (snapshotDetailsConfirmEstimateLabel) {
    snapshotDetailsConfirmEstimateLabel.textContent = tr('renderer.tasks.comentario_modal.snapshot_details_confirm.snapshot_estimate');
  }
  if (snapshotDetailsConfirmWpmLabel) {
    snapshotDetailsConfirmWpmLabel.textContent = tr('renderer.tasks.comentario_modal.snapshot_details_confirm.reading_speed');
  }
  if (snapshotDetailsConfirmApply) {
    snapshotDetailsConfirmApply.textContent = tr('renderer.tasks.comentario_modal.snapshot_details_confirm.apply');
  }
  if (snapshotDetailsConfirmKeep) {
    snapshotDetailsConfirmKeep.textContent = tr('renderer.tasks.comentario_modal.snapshot_details_confirm.keep');
  }
  if (snapshotDetailsConfirmClose) {
    const closeName = tr('renderer.tasks.comentario_modal.snapshot_details_confirm.close_aria');
    snapshotDetailsConfirmClose.setAttribute('aria-label', closeName);
    rendererIcons.applyIconToElement(snapshotDetailsConfirmClose, 'close', {
      preserveContent: false,
      ariaLabel: closeName,
    });
  }
  updateSnapshotDetailsConfirmationDisplay();
  updateSnapshotDetailsConfirmationApplyState();

  if (libraryTitle) libraryTitle.textContent = tr('renderer.tasks.biblioteca.library_title');
  if (libraryClose) libraryClose.setAttribute('aria-label', tr('renderer.tasks.biblioteca.close_aria'));
  if (librarySearchLabel) librarySearchLabel.textContent = tr('renderer.tasks.biblioteca.search');
  if (librarySearchInput) {
    librarySearchInput.setAttribute('placeholder', tr('renderer.tasks.biblioteca.search_placeholder'));
  }

  if (includeCommentTitle) includeCommentTitle.textContent = tr('renderer.tasks.guardar_lectura_modal.library_save_title');
  if (includeCommentClose) {
    includeCommentClose.setAttribute(
      'aria-label',
      tr('renderer.tasks.guardar_lectura_modal.close_aria')
    );
  }
  if (includeCommentText) includeCommentText.textContent = tr('renderer.tasks.guardar_lectura_modal.library_save_question');
  if (includeCommentYes) includeCommentYes.textContent = tr('renderer.tasks.guardar_lectura_modal.yes');
  if (includeCommentNo) includeCommentNo.textContent = tr('renderer.tasks.guardar_lectura_modal.no');
  if (includeCommentCancel) includeCommentCancel.textContent = tr('renderer.tasks.guardar_lectura_modal.cancel');

  if (libraryEmpty) libraryEmpty.textContent = tr('renderer.tasks.biblioteca.empty');

  renderTable();
}

async function transitionTaskEditorTranslations(language) {
  await transitionRendererTranslations(language || DEFAULT_LANG, {
    applyTranslations: ({ language: appliedLanguage }) => {
      idiomaActual = appliedLanguage;
      return applyTaskEditorTranslations();
    },
  });
}

function reportTaskEditorI18nFailure(err, { startup = false } = {}) {
  const transition = err && err.rendererI18nTransition;
  if (!transition) {
    return;
  }
  if (!startup && transition && transition.hadEstablishedState && !transition.restorationFailed) {
    log.error('Task Editor language transition failed; previous translation state remains authoritative:', err);
    return;
  }
  log.error('Task Editor i18n failure requires terminal unavailability:', err);
  closeTaskEditorAfterI18nFailure({ startup });
}

function getTaskEditorTerminalStatePayload(kind) {
  const hasInitializedDraft = taskEditorHasInitializedDraft === true
    && Number.isInteger(taskEditorCurrentInitId);
  const hasCurrentInitializedDraft = hasInitializedDraft
    && taskEditorCurrentInitId === taskEditorLatestInitId;
  const hasCurrentNoDraftAttempt = !hasInitializedDraft
    && Number.isInteger(taskEditorLatestInitId);

  return {
    kind,
    phase: hasInitializedDraft ? 'initialized' : 'no-draft',
    initId: hasCurrentInitializedDraft
      ? taskEditorCurrentInitId
      : hasCurrentNoDraftAttempt
        ? taskEditorLatestInitId
        : null,
    dirty: hasCurrentInitializedDraft ? dirty : null,
  };
}

function closeTaskEditorAfterI18nFailure({ startup = false, kind } = {}) {
  if (taskEditorI18nTerminal) return;
  taskEditorI18nTerminal = true;
  setTaskEditorNormalInteractionAvailable(false);
  const api = window.taskEditorAPI;
  if (api && typeof api.reportTerminalState === 'function') {
    try {
      api.reportTerminalState(getTaskEditorTerminalStatePayload(
        kind || (startup ? 'startup' : 'transition-restoration')
      ));
      return;
    } catch (err) {
      log.warn('taskEditorAPI.reportTerminalState failed (ignored); Task Editor remains unavailable:', err);
    }
  } else {
    log.warn('taskEditorAPI.reportTerminalState unavailable (ignored); Task Editor remains unavailable.');
  }
}

// =============================================================================
// Bootstrap / event wiring
// =============================================================================
function wirePrimaryTaskEditorEvents() {
  if (btnTaskAddRow) {
    btnTaskAddRow.addEventListener('click', () => addRow());
  }

  if (btnTaskAddFiles) {
    btnTaskAddFiles.addEventListener('click', () => {
      addRowsFromSelectedFiles().catch((err) => log.error('addRowsFromSelectedFiles failed:', err));
    });
  }

  if (taskNameInput) {
    taskNameInput.maxLength = TASK_NAME_MAX_CHARS;
    taskNameInput.setAttribute('aria-invalid', 'false');
    taskNameInput.addEventListener('input', () => {
      const next = clampTaskName(taskNameInput.value);
      if (taskNameInput.value !== next) taskNameInput.value = next;
      if (next.trim()) setTaskFieldInvalidState(taskNameInput, false);
      if (next !== meta.name) {
        meta.name = next;
        markDirty();
      }
    });
  }

  if (btnTaskSave) {
    btnTaskSave.addEventListener('click', () => {
      saveTask().catch((err) => log.error('saveTask failed:', err));
    });
  }

  if (btnTaskDelete) {
    btnTaskDelete.addEventListener('click', () => {
      deleteTask().catch((err) => log.error('deleteTask failed:', err));
    });
  }

  if (btnTaskLoadLibrary) {
    btnTaskLoadLibrary.addEventListener('click', () => {
      if (librarySearchInput) librarySearchInput.value = '';
      refreshLibraryList().catch((err) => log.error('refreshLibraryList failed:', err));
      openModal(libraryModal, librarySearchInput);
    });
  }
}

function wireCommentModalEvents() {
  if (commentInput) commentInput.maxLength = TASK_ROW_COMMENT_MAX_CHARS;
  if (commentClose) commentClose.addEventListener('click', () => dismissCommentModal());
  if (commentBackdrop) commentBackdrop.addEventListener('click', () => dismissCommentModal());
  if (commentCancel) commentCancel.addEventListener('click', () => dismissCommentModal());
  if (commentSnapshotSelect) {
    commentSnapshotSelect.addEventListener('click', () => {
      selectSnapshotForPendingCommentRow().catch((err) => log.error('selectSnapshotForPendingCommentRow failed:', err));
    });
  }
  if (commentSnapshotClear) {
    commentSnapshotClear.addEventListener('click', () => {
      clearSnapshotForPendingCommentRow();
    });
  }
  if (commentSave) {
    commentSave.addEventListener('click', () => {
      applyCommentChangesAndDismiss().catch((err) => log.error('applyCommentChangesAndDismiss failed:', err));
    });
  }
}

function wireSnapshotDetailsConfirmModalEvents() {
  if (snapshotDetailsConfirmClose) {
    snapshotDetailsConfirmClose.addEventListener('click', () => resolveSnapshotDetailsConfirmation(false));
  }
  if (snapshotDetailsConfirmBackdrop) {
    snapshotDetailsConfirmBackdrop.addEventListener('click', () => resolveSnapshotDetailsConfirmation(false));
  }
  if (snapshotDetailsConfirmApply) {
    snapshotDetailsConfirmApply.addEventListener('click', () => resolveSnapshotDetailsConfirmation(true));
  }
  if (snapshotDetailsConfirmApplyText) {
    snapshotDetailsConfirmApplyText.addEventListener('change', updateSnapshotDetailsConfirmationApplyState);
  }
  if (snapshotDetailsConfirmApplyTime) {
    snapshotDetailsConfirmApplyTime.addEventListener('change', updateSnapshotDetailsConfirmationApplyState);
  }
  if (snapshotDetailsConfirmKeep) {
    snapshotDetailsConfirmKeep.addEventListener('click', () => resolveSnapshotDetailsConfirmation(false));
  }
}

function wireSnapshotSourceReminderModalEvents() {
  if (snapshotSourceReminderClose) {
    snapshotSourceReminderClose.addEventListener('click', () => resolveSnapshotSourceReminder(false));
  }
  if (snapshotSourceReminderBackdrop) {
    snapshotSourceReminderBackdrop.addEventListener('click', () => resolveSnapshotSourceReminder(false));
  }
  if (snapshotSourceReminderCancel) {
    snapshotSourceReminderCancel.addEventListener('click', () => resolveSnapshotSourceReminder(false));
  }
  if (snapshotSourceReminderSelectFile) {
    snapshotSourceReminderSelectFile.addEventListener('click', () => resolveSnapshotSourceReminder(true));
  }
}

function wireLibraryModalEvents() {
  wireModalClose(libraryModal, libraryClose, libraryBackdrop);
  if (librarySearchInput) {
    librarySearchInput.addEventListener('input', () => filterLibraryItems());
  }

  wireModalClose(includeCommentModal, includeCommentClose, includeCommentBackdrop, includeCommentCancel);
  if (includeCommentYes) {
    includeCommentYes.addEventListener('click', () => {
      saveRowToLibrary(true).catch((err) => log.error('saveRowToLibrary failed:', err));
    });
  }
  if (includeCommentNo) {
    includeCommentNo.addEventListener('click', () => {
      saveRowToLibrary(false).catch((err) => log.error('saveRowToLibrary failed:', err));
    });
  }
}

function wireTaskEditorEvents() {
  wirePrimaryTaskEditorEvents();
  wireCommentModalEvents();
  wireSnapshotDetailsConfirmModalEvents();
  wireSnapshotSourceReminderModalEvents();
  wireLibraryModalEvents();
  window.addEventListener('keydown', handleTaskEditorModalEscape);
}

function validateTaskEditorBootstrapContracts() {
  const api = window.taskEditorAPI;
  const requiredMethods = [
    'onInit',
    'onRequestClose',
    'onSettingsChanged',
    'setDirtyState',
    'respondToClose',
  ];
  const missingMethod = !api
    ? 'taskEditorAPI'
    : requiredMethods.find((methodName) => typeof api[methodName] !== 'function');
  if (missingMethod) {
    throw new Error(`[task-editor] required bootstrap bridge unavailable: ${missingMethod}`);
  }
  if (!taskEditorRoot || !taskNameInput || !taskTable || !taskTableWrap || !tableBody) {
    throw new Error('[task-editor] required task structure unavailable');
  }
}

function registerTaskEditorInit() {
  window.taskEditorAPI.onInit((payload) => {
    if (taskEditorI18nTerminal) return;
    if (payload && Number.isInteger(payload.initId) && payload.initId > 0) {
      taskEditorLatestInitId = payload.initId;
    }
    if (!taskEditorTranslationsReady) {
      pendingTaskInitPayloads.push(payload);
      return;
    }
    enqueueTaskEditorSemanticWork(() => applyIncomingTaskPayload(payload));
  });
}

function getTaskEditorTerminalClosePayload() {
  return getTaskEditorTerminalStatePayload('terminal');
}

function sendTaskEditorCloseResponse(payload) {
  try {
    window.taskEditorAPI.respondToClose(payload);
  } catch (err) {
    // Deliberate current tradeoff: response-send failure stays fail-closed, even if close remains pending.
    // Safe retry requires correlated IPC; revisit only if stronger close-recovery guarantees are warranted.
    log.warn('taskEditorAPI.respondToClose failed (ignored):', err);
  }
}

function registerTaskEditorCloseGuard() {
  window.taskEditorAPI.onRequestClose(() => {
    if (taskEditorI18nTerminal) {
      sendTaskEditorCloseResponse(getTaskEditorTerminalClosePayload());
      return;
    }
    columnLayoutController.cancelActiveResize();
    if (!dirty) {
      sendTaskEditorCloseResponse({ kind: 'normal', allow: true });
      return;
    }
    const allow = window.Notify.confirmMain('renderer.tasks.alerts.close_unsaved') === true;
    sendTaskEditorCloseResponse({ kind: 'normal', allow });
  });
}

async function bootstrapTaskEditor() {
  await enqueueTaskEditorSemanticWork(async () => {
    let bootstrapLanguage = idiomaActual;
    if (window.taskEditorAPI && typeof window.taskEditorAPI.getSettings === 'function') {
      try {
        const settings = await window.taskEditorAPI.getSettings();
        if (settings && settings.language) {
          bootstrapLanguage = settings.language || DEFAULT_LANG;
        }
      } catch (err) {
        log.warn('BOOTSTRAP: Task Editor settings acquisition failed; using default language:', err);
      }
    } else {
      log.warn('BOOTSTRAP: taskEditorAPI.getSettings unavailable; using default language.');
    }
    try {
      await transitionTaskEditorTranslations(bootstrapLanguage);
    } catch (err) {
      reportTaskEditorI18nFailure(err, { startup: true });
      return;
    }

    try {
      await columnLayoutController.initialize();
    } catch (err) {
      log.error('Task Editor column layout initialization failed:', err);
      closeTaskEditorAfterI18nFailure({ startup: true, kind: 'column-layout' });
      return;
    }
    taskEditorTranslationsReady = true;
    while (pendingTaskInitPayloads.length) {
      const applied = await applyIncomingTaskPayload(pendingTaskInitPayloads.shift());
      if (!applied || taskEditorI18nTerminal) break;
    }
  });
}

function registerTaskEditorSettingsChanged() {
  window.taskEditorAPI.onSettingsChanged((settings) => enqueueTaskEditorSettingsApplication(settings));
}

function enqueueTaskEditorSettingsApplication(settings) {
  const run = async () => {
    try {
      const nextLang = settings && settings.language ? settings.language : '';
      if (!nextLang || nextLang === idiomaActual) return;
      await transitionTaskEditorTranslations(nextLang);
    } catch (err) {
      reportTaskEditorI18nFailure(err);
    }
  };
  return enqueueTaskEditorSemanticWork(run);
}

function enqueueTaskEditorSemanticWork(work) {
  const run = async () => {
    // Window closure is coordinated asynchronously through the main process.
    // Do not admit queued Task Editor semantic work after terminal i18n failure.
    if (taskEditorI18nTerminal) return;
    return work();
  };
  taskEditorSemanticQueue = taskEditorSemanticQueue.then(run, run);
  return taskEditorSemanticQueue;
}

async function applyIncomingTaskPayload(payload) {
  try {
    applyTaskPayload(payload);
    return true;
  } catch (err) {
    log.error('Task Editor init payload application failed:', err);
    closeTaskEditorAfterI18nFailure({
      startup: !taskEditorHasInitializedDraft,
      kind: 'task-payload-application',
    });
    return false;
  }
}

// Task Editor intentionally has no programmatic initial DOM focus.
setTaskEditorNormalInteractionAvailable(false);
try {
  validateTaskEditorBootstrapContracts();
  wireTaskEditorEvents();
  registerTaskEditorInit();
  registerTaskEditorCloseGuard();
  registerTaskEditorSettingsChanged();
  bootstrapTaskEditor().catch((err) => {
    log.error('Task Editor required initialization failed:', err);
    closeTaskEditorAfterI18nFailure({ startup: true, kind: 'bootstrap' });
  });
} catch (err) {
  log.error('Task Editor required bootstrap contract failed:', err);
  closeTaskEditorAfterI18nFailure({ startup: true, kind: 'bootstrap-contract' });
}

// =============================================================================
// End of public/task_editor.js
// =============================================================================
