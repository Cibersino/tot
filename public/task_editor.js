// public/task_editor.js
'use strict';

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
  throw new Error('[task-editor] window.getLogger unavailable; cannot continue');
}
const log = window.getLogger('task-editor');
log.debug('Task Editor starting...');
const rendererIcons = window.RendererIcons || null;
if (!rendererIcons
  || typeof rendererIcons.applyIconToElement !== 'function'
  || typeof rendererIcons.createIconButton !== 'function') {
  throw new Error('[task-editor] RendererIcons unavailable; cannot continue');
}
const { AppConstants } = window;
if (!AppConstants) {
  throw new Error('[task-editor] AppConstants unavailable; verify constants.js load order');
}
const {
  DEFAULT_LANG,
  TASK_NAME_MAX_CHARS,
  TASK_ROW_TEXT_MAX_CHARS,
  TASK_ROW_COMMENT_MAX_CHARS,
  TASK_ROW_LINK_MAX_CHARS,
} = AppConstants;
const stopwatchTimeCore = window.StopwatchTimeCore || null;
if (!stopwatchTimeCore || typeof stopwatchTimeCore.createStopwatchTimeUtils !== 'function') {
  throw new Error('[task-editor] StopwatchTimeCore.createStopwatchTimeUtils unavailable; cannot continue');
}
const stopwatchTimeUtils = stopwatchTimeCore.createStopwatchTimeUtils();
const {
  formatStopwatchMs,
  parseStopwatchInput,
} = stopwatchTimeUtils;

// =============================================================================
// i18n
// =============================================================================
let idiomaActual = DEFAULT_LANG;
let translationsLoadedFor = null;

const { loadRendererTranslations, tRenderer, applyWindowLanguageAttributes } = window.RendererI18n || {};
if (!loadRendererTranslations || !tRenderer || !applyWindowLanguageAttributes) {
  throw new Error('[task-editor] RendererI18n unavailable; cannot continue');
}

const tr = (path) => tRenderer(path);

async function ensureTaskEditorTranslations(lang) {
  const target = (lang || '').toLowerCase() || DEFAULT_LANG;
  if (translationsLoadedFor === target) return;
  applyWindowLanguageAttributes(target);
  await loadRendererTranslations(target);
  translationsLoadedFor = target;
}

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
const thTexto = document.getElementById('thTexto');
const thTiempo = document.getElementById('thTiempo');
const thPercent = document.getElementById('thPercent');
const thFalta = document.getElementById('thFalta');
const thEnlace = document.getElementById('thEnlace');
const thComentario = document.getElementById('thComentario');
const thAcciones = document.getElementById('thAcciones');
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
let meta = { name: '', createdAt: '', updatedAt: '' };
let sourcePath = null;
let dirty = false;
let rowIdCounter = 1;
let pendingCommentRowId = null;
let pendingCommentSnapshotRelPath = '';
let pendingLibraryRowId = null;
let libraryItemsCache = [];
let columnLayoutController = null;
let renderedRowFields = new Map();

// =============================================================================
// Helpers
// =============================================================================
function markDirty() {
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
  const api = window.taskEditorAPI;
  if (!api || typeof api.setDirtyState !== 'function') {
    log.warnOnce('task_editor.setDirtyState.missing', 'taskEditorAPI.setDirtyState unavailable; dirty state sync disabled.');
    return;
  }
  try {
    api.setDirtyState(dirty);
  } catch (err) {
    log.warnOnce('task_editor.setDirtyState.failed', 'taskEditorAPI.setDirtyState failed (ignored):', err);
  }
}

syncDirtyState();

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
  const name = String(input || '');
  return name.length > TASK_NAME_MAX_CHARS
    ? name.slice(0, TASK_NAME_MAX_CHARS)
    : name;
}

function normalizeSnapshotRelPath(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const normalizedSlashes = raw.replace(/\\/g, '/');
  const withoutLeading = normalizedSlashes.startsWith('/')
    ? normalizedSlashes.slice(1)
    : normalizedSlashes;
  const segments = withoutLeading.split('/').filter(Boolean);
  if (!segments.length) return '';
  if (segments.some((seg) => seg === '.' || seg === '..')) return '';
  const rel = `/${segments.join('/')}`;
  if (!rel.toLowerCase().endsWith('.json')) return '';
  return rel;
}

function setCommentSnapshotDisplay(snapshotRelPath) {
  if (!commentSnapshotPath) return;
  const safeRel = normalizeSnapshotRelPath(snapshotRelPath);
  if (!safeRel) {
    commentSnapshotPath.textContent = '';
    commentSnapshotPath.hidden = true;
    if (commentSnapshotClear) commentSnapshotClear.hidden = true;
    return;
  }
  commentSnapshotPath.textContent = safeRel;
  commentSnapshotPath.hidden = false;
  if (commentSnapshotClear) commentSnapshotClear.hidden = false;
}

function formatDuration(totalSeconds) {
  const seconds = Number(totalSeconds);
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  return formatStopwatchMs(safeSeconds * 1000);
}

function parseDuration(input) {
  const milliseconds = parseStopwatchInput(input);
  if (milliseconds === null) return null;
  const seconds = milliseconds / 1000;
  return Number.isSafeInteger(seconds) && seconds >= 0 ? seconds : null;
}

function parsePercent(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const cleaned = raw.endsWith('%') ? raw.slice(0, -1).trim() : raw;
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n;
}

function getFaltaSeconds(row) {
  const tiempo = Number(row.tiempoSeconds) || 0;
  const pct = Number(row.percentComplete) || 0;
  return tiempo * (1 - pct / 100);
}

function updateSummary() {
  const summary = rows.reduce((acc, row) => {
    acc.totalSeconds += Number(row.tiempoSeconds) || 0;
    acc.leftSeconds += getFaltaSeconds(row);
    return acc;
  }, { totalSeconds: 0, leftSeconds: 0 });

  if (taskSummaryTotalValue) {
    taskSummaryTotalValue.textContent = formatDuration(summary.totalSeconds);
  }
  if (taskSummaryLeftValue) {
    taskSummaryLeftValue.textContent = formatDuration(summary.leftSeconds);
  }
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
    log.warnOnce(`task_editor.api.missing.${methodName}`, 'taskEditorAPI missing method (ignored):', methodName);
    if (missingNoticeKey) window.Notify.notifyEditor(missingNoticeKey);
    return null;
  }
  return api;
}

function isFailedTaskEditorResult(result) {
  return !result || result.ok === false;
}

function getTaskEditorResultCode(result, fallbackCode) {
  return result && result.code ? result.code : fallbackCode;
}

function isCancelledTaskEditorResultCode(code) {
  return code === 'CANCELLED' || code === 'CONFIRM_DENIED';
}

function resetPendingCommentDraft() {
  pendingCommentRowId = null;
  pendingCommentSnapshotRelPath = '';
  setCommentSnapshotDisplay('');
}

function dismissCommentModal() {
  resetPendingCommentDraft();
  closeModal(commentModal);
}

function applyCommentChangesAndDismiss() {
  const row = rows.find((r) => r.id === pendingCommentRowId);
  if (row) {
    const nextComment = commentInput.value || '';
    const nextSnapshotRelPath = normalizeSnapshotRelPath(pendingCommentSnapshotRelPath || '');
    let changed = false;
    if (row.comentario !== nextComment) {
      row.comentario = nextComment;
      changed = true;
    }
    if (normalizeSnapshotRelPath(row.snapshotRelPath || '') !== nextSnapshotRelPath) {
      row.snapshotRelPath = nextSnapshotRelPath;
      changed = true;
      renderTable();
    }
    if (changed) markDirty();
  }
  dismissCommentModal();
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
  const safeRel = normalizeSnapshotRelPath(res.snapshotRelPath || '');
  if (!safeRel) {
    log.warn('selectTaskRowSnapshot returned invalid snapshotRelPath:', { snapshotRelPath: res.snapshotRelPath || '' });
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
  const snapshotRelPath = normalizeSnapshotRelPath(row && row.snapshotRelPath ? row.snapshotRelPath : '');
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

async function selectFileForRow(row, { textoInput, enlaceInput } = {}) {
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
  const filePath = typeof res.filePath === 'string' ? res.filePath.trim() : '';
  if (!filePath) {
    log.warn('selectTaskFile returned empty filePath:', res || null);
    window.Notify.notifyEditor('renderer.tasks.alerts.file_select_error');
    return;
  }
  let changed = false;
  if (filePath !== row.enlace) {
    row.enlace = filePath;
    if (enlaceInput) enlaceInput.value = filePath;
    changed = true;
  }
  if (!String(row.texto || '').trim()) {
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
function makeRowId() {
  const id = rowIdCounter;
  rowIdCounter += 1;
  return id;
}

function createRow(data = {}) {
  return {
    id: makeRowId(),
    texto: String(data.texto || ''),
    tiempoSeconds: Number.isFinite(data.tiempoSeconds) ? data.tiempoSeconds : 0,
    percentComplete: Number.isFinite(data.percentComplete) ? data.percentComplete : 0,
    enlace: String(data.enlace || ''),
    comentario: String(data.comentario || ''),
    snapshotRelPath: normalizeSnapshotRelPath(data.snapshotRelPath || ''),
  };
}

function deriveRowTextFromPath(filePath) {
  const raw = String(filePath || '').trim();
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

function buildActionButton(iconName, titleKey, onClick, { className = 'btn-standard btn-standard--square' } = {}) {
  const title = tr(titleKey);
  const btn = rendererIcons.createIconButton({
    iconName,
    className,
    title,
    ariaLabel: title,
  });
  btn.addEventListener('click', onClick);
  return btn;
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
      row.tiempoSeconds = parsed;
      tdFaltaValue.textContent = formatDuration(getFaltaSeconds(row));
      updateSummary();
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
      row.percentComplete = parsed;
      tdFaltaValue.textContent = formatDuration(getFaltaSeconds(row));
      updateSummary();
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
  const linkBrowseTitle = tr('renderer.tasks.columns.tooltips.file_select');
  const enlaceSelectBtn = rendererIcons.createIconButton({
    iconName: 'folder',
    className: 'btn-standard btn-standard--square',
    title: linkBrowseTitle,
    ariaLabel: linkBrowseTitle,
  });
  enlaceSelectBtn.addEventListener('click', () => {
    selectFileForRow(row, { textoInput, enlaceInput }).catch((err) => log.error('selectFileForRow failed:', err));
  });
  const linkTitle = tr('renderer.tasks.columns.tooltips.link_open');
  const enlaceBtn = rendererIcons.createIconButton({
    iconName: 'open-target',
    className: 'btn-standard btn-standard--square',
    title: linkTitle,
    ariaLabel: linkTitle,
  });
  enlaceBtn.addEventListener('click', async () => {
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
  });
  enlaceWrap.appendChild(enlaceInput);
  enlaceWrap.appendChild(enlaceSelectBtn);
  enlaceWrap.appendChild(enlaceBtn);
  tdEnlace.appendChild(enlaceWrap);

  // Comment
  const tdComentario = document.createElement('td');
  const commentActions = document.createElement('div');
  commentActions.className = 'cell-actions';
  const snapshotRelPath = normalizeSnapshotRelPath(row.snapshotRelPath || '');
  if (snapshotRelPath) {
    const snapshotBtn = buildActionButton(
      'task-text-snapshot-load',
      'renderer.tasks.columns.tooltips.snapshot_load',
      () => {
        loadSnapshotForRow(row).catch((err) => log.error('loadSnapshotForRow failed:', err));
      }
    );
    const snapshotTitle = tr('renderer.tasks.columns.tooltips.snapshot_load');
    snapshotBtn.title = `${snapshotTitle} ${snapshotRelPath}`.trim();
    snapshotBtn.setAttribute('aria-label', snapshotBtn.title);
    commentActions.appendChild(snapshotBtn);
  }
  const commentButtonTitle = tr('renderer.tasks.columns.tooltips.comment');
  const commentBtn = rendererIcons.createIconButton({
    iconName: 'task-comment',
    className: 'btn-standard btn-standard--square',
    title: commentButtonTitle,
    ariaLabel: commentButtonTitle,
  });
  commentBtn.addEventListener('click', () => {
    pendingCommentRowId = row.id;
    pendingCommentSnapshotRelPath = snapshotRelPath;
    commentInput.value = row.comentario || '';
    setCommentSnapshotDisplay(pendingCommentSnapshotRelPath);
    openModal(commentModal, commentInput);
  });
  commentActions.appendChild(commentBtn);
  tdComentario.appendChild(commentActions);

  // Actions
  const tdActions = document.createElement('td');
  const actionsWrap = document.createElement('div');
  actionsWrap.className = 'cell-actions';

  const btnUp = buildActionButton('arrow-up', 'renderer.tasks.columns.tooltips.move_up', () => moveRow(row.id, -1), {
    className: 'btn-standard btn-standard--half-width',
  });
  const btnDown = buildActionButton('arrow-down', 'renderer.tasks.columns.tooltips.move_down', () => moveRow(row.id, 1), {
    className: 'btn-standard btn-standard--half-width',
  });
  const btnDelete = buildActionButton('trash', 'renderer.tasks.columns.tooltips.delete_row', () => deleteRow(row.id));
  const btnSaveLib = buildActionButton('task-row-save', 'renderer.tasks.columns.tooltips.library_row_save', () => {
    pendingLibraryRowId = row.id;
    openModal(includeCommentModal, includeCommentYes);
  });

  actionsWrap.appendChild(btnUp);
  actionsWrap.appendChild(btnDown);
  actionsWrap.appendChild(btnSaveLib);
  actionsWrap.appendChild(btnDelete);
  tdActions.appendChild(actionsWrap);

  trEl.appendChild(tdTexto);
  trEl.appendChild(tdTiempo);
  trEl.appendChild(tdPercent);
  trEl.appendChild(tdFalta);
  trEl.appendChild(tdEnlace);
  trEl.appendChild(tdComentario);
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
function addRow(data = {}) {
  rows.push(createRow(data));
  markDirty();
  renderTable();
}

function addRows(items) {
  if (!Array.isArray(items) || !items.length) return;
  rows.push(...items.map((item) => createRow(item)));
  markDirty();
  renderTable();
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
    ? res.filePaths.filter((filePath) => typeof filePath === 'string' && filePath.trim())
    : [];
  if (!filePaths.length) {
    log.warn('selectTaskFiles returned empty filePaths:', res || null);
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
  const task = payload && payload.task ? payload.task : null;
  if (!task || !task.meta || !Array.isArray(task.rows)) {
    log.warn('task-editor-init payload invalid (ignored):', payload);
    return;
  }
  const taskName = task.meta.name;
  meta = {
    name: taskName,
    createdAt: task.meta.createdAt,
    updatedAt: task.meta.updatedAt,
  };
  sourcePath = payload.sourcePath || null;
  rows = task.rows.map((r) => createRow(r));
  resetDirty();
  taskNameInput.value = taskName;
  renderTable();
  resetTaskEditorValidationState();
}

function normalizeRowTexto(row) {
  const normalizedTexto = String(row.texto || '').trim();
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
      snapshotRelPath: normalizeSnapshotRelPath(r.snapshotRelPath || ''),
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

  if (res.meta) meta = res.meta;
  if (res.path) sourcePath = res.path;
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

  meta = { name: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
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
    text.textContent = `${entry.texto}`;

    const durationSeconds = Math.max(0, Number(entry.tiempoSeconds) || 0);
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
      addRow({
        texto: entry.texto,
        tiempoSeconds: Number(entry.tiempoSeconds) || 0,
        percentComplete: 0,
        enlace: entry.enlace || '',
        comentario: entry.comentario || '',
        snapshotRelPath: entry.snapshotRelPath || '',
      });
      closeModal(libraryModal);
    });
    const btnDelete = buildActionButton('trash', 'renderer.tasks.biblioteca.library_row_delete', async () => {
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
    const texto = String(entry.texto || '').toLowerCase();
    return texto.includes(term);
  });
  renderLibraryItems(filtered);
}

async function refreshLibraryList() {
  if (!libraryList) return;
  libraryList.innerHTML = '';
  libraryEmpty.hidden = true;

  const api = getTaskEditorApi('listLibrary');
  if (!api) return;
  const res = await api.listLibrary();
  if (isFailedTaskEditorResult(res)) {
    const code = getTaskEditorResultCode(res, 'READ_FAILED');
    log.warn('listLibrary failed:', { code, response: res || null });
    window.Notify.notifyEditor('renderer.tasks.alerts.library_load_error');
    return;
  }

  libraryItemsCache = Array.isArray(res.items) ? res.items : [];
  filterLibraryItems();
}

function createLibraryEntryFromRow(row, includeComment) {
  const entry = {
    texto: row.texto,
    tiempoSeconds: row.tiempoSeconds,
    enlace: row.enlace,
  };
  if (includeComment && row.comentario) entry.comentario = row.comentario;
  const snapshotRelPath = normalizeSnapshotRelPath(row.snapshotRelPath);
  if (snapshotRelPath) entry.snapshotRelPath = snapshotRelPath;
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
  await ensureTaskEditorTranslations(idiomaActual);
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

  if (thTexto) thTexto.textContent = tr('renderer.tasks.columns.texto');
  if (thTiempo) {
    thTiempo.textContent = tr('renderer.tasks.columns.tiempo');
    thTiempo.title = tr('renderer.tasks.columns.header_tooltips.tiempo');
  }
  if (thPercent) {
    thPercent.textContent = tr('renderer.tasks.columns.percent');
    thPercent.title = tr('renderer.tasks.columns.header_tooltips.percent');
  }
  if (thFalta) {
    thFalta.textContent = tr('renderer.tasks.columns.falta');
    thFalta.title = tr('renderer.tasks.columns.header_tooltips.falta');
  }
  if (thEnlace) thEnlace.textContent = tr('renderer.tasks.columns.enlace');
  if (thComentario) thComentario.textContent = tr('renderer.tasks.columns.comentario');
  if (thAcciones) thAcciones.textContent = tr('renderer.tasks.columns.acciones');

  if (commentTitle) commentTitle.textContent = tr('renderer.tasks.comentario_modal.comment_title');
  if (commentInput) {
    commentInput.setAttribute('placeholder', tr('renderer.tasks.comentario_modal.comment_placeholder'));
    commentInput.setAttribute('aria-label', tr('renderer.tasks.comentario_modal.comment_title'));
  }
  if (commentSave) commentSave.textContent = tr('renderer.tasks.save_button');
  if (commentCancel) commentCancel.textContent = tr('renderer.tasks.guardar_lectura_modal.cancel');
  if (commentSnapshotSelect) {
    commentSnapshotSelect.textContent = tr('renderer.tasks.comentario_modal.snapshot_select');
    commentSnapshotSelect.title = tr('renderer.tasks.comentario_modal.snapshot_select_tooltip');
    commentSnapshotSelect.setAttribute('aria-label', commentSnapshotSelect.title || commentSnapshotSelect.textContent || '');
  }
  if (commentSnapshotClear) {
    commentSnapshotClear.title = tr('renderer.tasks.comentario_modal.snapshot_clear');
    commentSnapshotClear.setAttribute('aria-label', commentSnapshotClear.title || '');
    rendererIcons.applyIconToElement(commentSnapshotClear, 'unlink', {
      preserveContent: false,
      title: commentSnapshotClear.title,
      ariaLabel: commentSnapshotClear.title,
    });
  }

  if (libraryTitle) libraryTitle.textContent = tr('renderer.tasks.biblioteca.library_title');
  if (librarySearchLabel) librarySearchLabel.textContent = tr('renderer.tasks.biblioteca.search');
  if (librarySearchInput) {
    librarySearchInput.setAttribute('placeholder', tr('renderer.tasks.biblioteca.search_placeholder'));
  }

  if (includeCommentTitle) includeCommentTitle.textContent = tr('renderer.tasks.guardar_lectura_modal.library_save_title');
  if (includeCommentText) includeCommentText.textContent = tr('renderer.tasks.guardar_lectura_modal.library_save_question');
  if (includeCommentYes) includeCommentYes.textContent = tr('renderer.tasks.guardar_lectura_modal.yes');
  if (includeCommentNo) includeCommentNo.textContent = tr('renderer.tasks.guardar_lectura_modal.no');
  if (includeCommentCancel) includeCommentCancel.textContent = tr('renderer.tasks.guardar_lectura_modal.cancel');

  if (libraryEmpty) libraryEmpty.textContent = tr('renderer.tasks.biblioteca.empty');

  renderTable();
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
      applyCommentChangesAndDismiss();
    });
  }
}

function wireLibraryModalEvents() {
  wireModalClose(libraryModal, libraryClose, libraryBackdrop);
  if (librarySearchInput) {
    librarySearchInput.addEventListener('input', () => filterLibraryItems());
  }

  wireModalClose(includeCommentModal, includeCommentClose, includeCommentBackdrop, includeCommentCancel);
  if (includeCommentYes) includeCommentYes.addEventListener('click', () => saveRowToLibrary(true));
  if (includeCommentNo) includeCommentNo.addEventListener('click', () => saveRowToLibrary(false));
}

function wireTaskEditorEvents() {
  wirePrimaryTaskEditorEvents();
  wireCommentModalEvents();
  wireLibraryModalEvents();
  window.addEventListener('keydown', handleTaskEditorModalEscape);
}

function registerTaskEditorInit() {
  if (window.taskEditorAPI && typeof window.taskEditorAPI.onInit === 'function') {
    window.taskEditorAPI.onInit((payload) => {
      applyTaskPayload(payload);
    });
    return;
  }
  log.warnOnce('BOOTSTRAP:task_editor.onInit.missing', 'taskEditorAPI.onInit unavailable; editor init disabled.');
}

function registerTaskEditorCloseGuard() {
  if (window.taskEditorAPI && typeof window.taskEditorAPI.onRequestClose === 'function') {
    window.taskEditorAPI.onRequestClose(() => {
      if (columnLayoutController) columnLayoutController.cancelActiveResize();
      if (typeof window.taskEditorAPI.confirmClose !== 'function') {
        log.warnOnce('task_editor.confirmClose.missing', 'taskEditorAPI.confirmClose unavailable; close request ignored.');
        return;
      }
      if (!dirty) {
        window.taskEditorAPI.confirmClose();
        return;
      }
      if (window.Notify.confirmMain('renderer.tasks.alerts.close_unsaved')) {
        window.taskEditorAPI.confirmClose();
      }
    });
    return;
  }
  log.warnOnce('BOOTSTRAP:task_editor.onRequestClose.missing', 'taskEditorAPI.onRequestClose unavailable; close confirmation disabled.');
}

async function bootstrapTaskEditor() {
  try {
    if (window.taskEditorAPI && typeof window.taskEditorAPI.getSettings === 'function') {
      const settings = await window.taskEditorAPI.getSettings();
      if (settings && settings.language) {
        idiomaActual = settings.language || DEFAULT_LANG;
      }
    } else {
      log.warnOnce('BOOTSTRAP:task_editor.getSettings.missing', 'taskEditorAPI.getSettings unavailable; using default language.');
    }
    await applyTaskEditorTranslations();
    if (!window.TaskEditorColumnLayout
      || typeof window.TaskEditorColumnLayout.createController !== 'function') {
      throw new Error('[task-editor] TaskEditorColumnLayout unavailable; cannot continue');
    }
    columnLayoutController = window.TaskEditorColumnLayout.createController({
      wrapper: taskTableWrap,
      table: taskTable,
      colGroup: taskColGroup,
      utilityHeaders: {
        tiempo: thTiempo,
        percent: thPercent,
        falta: thFalta,
        enlace: thEnlace,
        comentario: thComentario,
        acciones: thAcciones,
      },
    });
    await columnLayoutController.initialize();
  } catch (err) {
    log.error('BOOTSTRAP: Task Editor initialization failed:', err);
  }
}

function registerTaskEditorSettingsChanged() {
  if (window.taskEditorAPI && typeof window.taskEditorAPI.onSettingsChanged === 'function') {
    window.taskEditorAPI.onSettingsChanged(async (settings) => {
      try {
        const nextLang = settings && settings.language ? settings.language : '';
        if (!nextLang || nextLang === idiomaActual) return;
        idiomaActual = nextLang;
        await applyTaskEditorTranslations();
      } catch (err) {
        log.warn('task-editor: settings update failed (ignored):', err);
      }
    });
    return;
  }
  log.warnOnce('BOOTSTRAP:task_editor.onSettingsChanged.missing', 'taskEditorAPI.onSettingsChanged unavailable; language updates disabled.');
}

wireTaskEditorEvents();
registerTaskEditorInit();
registerTaskEditorCloseGuard();
bootstrapTaskEditor();
registerTaskEditorSettingsChanged();

// =============================================================================
// End of public/task_editor.js
// =============================================================================
