// public/task_editor.js
/* global Notify */
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Task editor renderer.
// - Render and edit task rows.
// - Compute per-row and total durations.
// - Persist task lists and column widths via taskEditorAPI.
// - Manage library load/save/delete and link opening.
// - Track dirty state, close confirmations, and translations/settings updates.

// =============================================================================
// Logger / constants
// =============================================================================
const log = window.getLogger('task-editor');
log.debug('Task editor starting...');
const { AppConstants } = window;
if (!AppConstants) {
  throw new Error('[task-editor] AppConstants no disponible; verifica la carga de constants.js');
}
const {
  DEFAULT_LANG,
  TASK_NAME_MAX_CHARS,
  TASK_ROW_TEXT_MAX_CHARS,
  TASK_ROW_TYPE_MAX_CHARS,
  TASK_ROW_LINK_MAX_CHARS,
} = AppConstants;

// =============================================================================
// i18n
// =============================================================================
let idiomaActual = DEFAULT_LANG;
let translationsLoadedFor = null;

const { loadRendererTranslations, tRenderer } = window.RendererI18n || {};
if (!loadRendererTranslations || !tRenderer) {
  throw new Error('[task-editor] RendererI18n no disponible; no se puede continuar');
}

const tr = (path, fallback) => tRenderer(path, fallback);

async function ensureTaskEditorTranslations(lang) {
  const target = (lang || '').toLowerCase() || DEFAULT_LANG;
  if (translationsLoadedFor === target) return;
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
const taskTotalLabel = document.getElementById('taskTotalLabel');
const taskTotalValue = document.getElementById('taskTotalValue');
const btnTaskAddRow = document.getElementById('btnTaskAddRow');
const btnTaskLoadLibrary = document.getElementById('btnTaskLoadLibrary');
const tableBody = document.getElementById('taskTableBody');

// Table columns
const thTexto = document.getElementById('thTexto');
const thTiempo = document.getElementById('thTiempo');
const thPercent = document.getElementById('thPercent');
const thFalta = document.getElementById('thFalta');
const thTipo = document.getElementById('thTipo');
const thEnlace = document.getElementById('thEnlace');
const thComentario = document.getElementById('thComentario');
const thAcciones = document.getElementById('thAcciones');
const taskTable = document.getElementById('taskTable');
const taskColGroup = document.getElementById('taskColGroup');

// Modals
const commentModal = document.getElementById('commentModal');
const commentBackdrop = document.getElementById('commentBackdrop');
const commentClose = document.getElementById('commentClose');
const commentCancel = document.getElementById('commentCancel');
const commentSave = document.getElementById('commentSave');
const commentInput = document.getElementById('commentInput');
const commentTitle = document.getElementById('commentTitle');
const commentSnapshotSelect = document.getElementById('commentSnapshotSelect');
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
let columnWidths = {};
let activeResize = null;

const COLUMN_KEYS = [
  { key: 'texto', th: thTexto },
  { key: 'tiempo', th: thTiempo },
  { key: 'percent', th: thPercent },
  { key: 'falta', th: thFalta },
  { key: 'tipo', th: thTipo },
  { key: 'enlace', th: thEnlace },
  { key: 'comentario', th: thComentario },
  { key: 'acciones', th: thAcciones },
];

const MIN_COL_WIDTH = 10;

// =============================================================================
// Helpers
// =============================================================================
function markDirty() {
  dirty = true;
}

function resetDirty() {
  dirty = false;
}

function clampTaskName(input) {
  const name = String(input || '').trim();
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
    return;
  }
  commentSnapshotPath.textContent = safeRel;
  commentSnapshotPath.hidden = false;
}

function formatDuration(totalSeconds) {
  const sec = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function parseDuration(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const parts = raw.split(':');
  if (parts.length !== 2 && parts.length !== 3) return null;

  const nums = parts.map((p) => (p.trim() === '' ? NaN : Number(p)));
  if (nums.some((n) => !Number.isFinite(n) || !Number.isInteger(n))) return null;

  let h = 0;
  let m = 0;
  let s = 0;
  if (parts.length === 2) {
    m = nums[0];
    s = nums[1];
  } else {
    h = nums[0];
    m = nums[1];
    s = nums[2];
  }
  if (h < 0 || m < 0 || s < 0) return null;
  if (m > 59 || s > 59) return null;
  return (h * 3600) + (m * 60) + s;
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

function updateTotal() {
  const total = rows.reduce((acc, r) => acc + getFaltaSeconds(r), 0);
  taskTotalValue.textContent = formatDuration(total);
}

function openModal(modalEl) {
  if (!modalEl) return;
  modalEl.setAttribute('aria-hidden', 'false');
}

function closeModal(modalEl) {
  if (!modalEl) return;
  modalEl.setAttribute('aria-hidden', 'true');
}

// Centralized modal close wiring for consistent behavior across dialogs.
function wireModalClose(modalEl, ...closeTriggers) {
  closeTriggers.forEach((trigger) => {
    if (trigger) trigger.addEventListener('click', () => closeModal(modalEl));
  });
}

function showEditorNotice(key, opts = {}) {
  try {
    if (typeof Notify?.notifyEditor === 'function') {
      Notify.notifyEditor(key, opts);
      return;
    }
    log.warnOnce('task_editor.notify.missing', 'Notify.notifyEditor unavailable (ignored).');
  } catch (err) {
    log.warn('Notify.notifyEditor failed:', err);
  }
}

// Shared guard for taskEditorAPI methods; emits a user notice and warnOnce on missing APIs.
function getTaskEditorApi(methodName, missingNoticeKey = 'renderer.tasks.alerts.task_unavailable') {
  const api = window.taskEditorAPI;
  if (!api || typeof api[methodName] !== 'function') {
    log.warnOnce(`task_editor.api.missing.${methodName}`, 'taskEditorAPI missing method (ignored):', methodName);
    if (missingNoticeKey) showEditorNotice(missingNoticeKey);
    return null;
  }
  return api;
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

async function selectSnapshotForPendingCommentRow() {
  if (!pendingCommentRowId) return;
  const api = getTaskEditorApi('selectTaskRowSnapshot');
  if (!api) return;
  const res = await api.selectTaskRowSnapshot();
  if (!res || res.ok === false) {
    const code = res && res.code ? res.code : 'READ_FAILED';
    if (code === 'CANCELLED' || code === 'CONFIRM_DENIED') return;
    log.warn('selectTaskRowSnapshot failed:', { code, response: res || null });
    if (code === 'PATH_OUTSIDE_SNAPSHOTS') {
      showEditorNotice('renderer.tasks.alerts.link_blocked');
      return;
    }
    showEditorNotice('renderer.tasks.alerts.library_load_error');
    return;
  }
  const safeRel = normalizeSnapshotRelPath(res.snapshotRelPath || '');
  if (!safeRel) {
    log.warn('selectTaskRowSnapshot returned invalid snapshotRelPath:', { snapshotRelPath: res.snapshotRelPath || '' });
    showEditorNotice('renderer.tasks.alerts.library_load_error');
    return;
  }
  pendingCommentSnapshotRelPath = safeRel;
  setCommentSnapshotDisplay(safeRel);
}

async function loadSnapshotForRow(row) {
  const snapshotRelPath = normalizeSnapshotRelPath(row && row.snapshotRelPath ? row.snapshotRelPath : '');
  if (!snapshotRelPath) return;
  const api = getTaskEditorApi('loadTaskRowSnapshot');
  if (!api) return;
  const res = await api.loadTaskRowSnapshot(snapshotRelPath);
  if (!res || res.ok === false) {
    const code = res && res.code ? res.code : 'READ_FAILED';
    if (code === 'CANCELLED' || code === 'CONFIRM_DENIED') return;
    log.warn('loadTaskRowSnapshot failed:', { code, snapshotRelPath, response: res || null });
    if (code === 'NOT_FOUND') {
      showEditorNotice('renderer.tasks.alerts.link_missing');
      return;
    }
    if (code === 'PATH_OUTSIDE_SNAPSHOTS') {
      showEditorNotice('renderer.tasks.alerts.link_blocked');
      return;
    }
    showEditorNotice('renderer.tasks.alerts.link_error');
    return;
  }
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
    tipo: String(data.tipo || ''),
    enlace: String(data.enlace || ''),
    comentario: String(data.comentario || ''),
    snapshotRelPath: normalizeSnapshotRelPath(data.snapshotRelPath || ''),
  };
}

function buildActionButton(labelKey, titleKey, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'icon-btn';
  btn.textContent = tr(labelKey, btn.textContent || '');
  const title = tr(titleKey, btn.title || btn.textContent || '');
  if (title) btn.title = title;
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
  textoInput.value = row.texto;
  textoInput.addEventListener('input', () => {
    const next = textoInput.value;
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
  tiempoInput.value = formatDuration(row.tiempoSeconds);
  const commitTiempo = () => {
    const parsed = parseDuration(tiempoInput.value);
    if (parsed === null) {
      tiempoInput.value = formatDuration(row.tiempoSeconds);
      return;
    }
    if (parsed !== row.tiempoSeconds) {
      row.tiempoSeconds = parsed;
      tdFaltaValue.textContent = formatDuration(getFaltaSeconds(row));
      updateTotal();
      markDirty();
    }
    tiempoInput.value = formatDuration(row.tiempoSeconds);
  };
  tiempoInput.addEventListener('blur', commitTiempo);
  tiempoInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') tiempoInput.blur();
  });
  tdTiempo.appendChild(tiempoInput);

  // Percent complete
  const tdPercent = document.createElement('td');
  const percentInput = document.createElement('input');
  percentInput.type = 'text';
  percentInput.value = `${row.percentComplete}%`;
  const commitPercent = () => {
    const parsed = parsePercent(percentInput.value);
    if (parsed === null) {
      percentInput.value = `${row.percentComplete}%`;
      return;
    }
    if (parsed !== row.percentComplete) {
      row.percentComplete = parsed;
      tdFaltaValue.textContent = formatDuration(getFaltaSeconds(row));
      updateTotal();
      markDirty();
    }
    percentInput.value = `${row.percentComplete}%`;
  };
  percentInput.addEventListener('blur', commitPercent);
  percentInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') percentInput.blur();
  });
  tdPercent.appendChild(percentInput);

  // Remaining
  const tdFalta = document.createElement('td');
  tdFaltaValue.textContent = formatDuration(getFaltaSeconds(row));
  tdFalta.appendChild(tdFaltaValue);

  // Type
  const tdTipo = document.createElement('td');
  const tipoInput = document.createElement('input');
  tipoInput.type = 'text';
  tipoInput.maxLength = TASK_ROW_TYPE_MAX_CHARS;
  tipoInput.value = row.tipo;
  tipoInput.addEventListener('input', () => {
    const next = tipoInput.value;
    if (next !== row.tipo) {
      row.tipo = next;
      markDirty();
    }
  });
  tdTipo.appendChild(tipoInput);

  // Link
  const tdEnlace = document.createElement('td');
  const enlaceWrap = document.createElement('div');
  enlaceWrap.className = 'link-cell';
  const enlaceInput = document.createElement('input');
  enlaceInput.type = 'text';
  enlaceInput.maxLength = TASK_ROW_LINK_MAX_CHARS;
  enlaceInput.value = row.enlace;
  enlaceInput.addEventListener('input', () => {
    const next = enlaceInput.value;
    if (next !== row.enlace) {
      row.enlace = next;
      markDirty();
    }
  });
  const enlaceBtn = document.createElement('button');
  enlaceBtn.type = 'button';
  enlaceBtn.className = 'icon-btn';
  enlaceBtn.textContent = tr('renderer.tasks.buttons.link_open', enlaceBtn.textContent || '');
  enlaceBtn.title = tr('renderer.tasks.tooltips.link_open', enlaceBtn.title || enlaceBtn.textContent || '');
  enlaceBtn.addEventListener('click', async () => {
    const raw = enlaceInput.value;
    const api = getTaskEditorApi('openTaskLink');
    if (!api) return;
    const res = await api.openTaskLink(raw);
    if (!res || res.ok === false) {
      const code = res && res.code ? res.code : 'ERROR';
      if (code === 'CONFIRM_DENIED') return;
      if (code === 'LINK_MISSING') {
        showEditorNotice('renderer.tasks.alerts.link_missing');
        return;
      }
      if (code === 'LINK_BLOCKED') {
        showEditorNotice('renderer.tasks.alerts.link_blocked');
        return;
      }
      showEditorNotice('renderer.tasks.alerts.link_error');
      return;
    }
  });
  enlaceWrap.appendChild(enlaceInput);
  enlaceWrap.appendChild(enlaceBtn);
  tdEnlace.appendChild(enlaceWrap);

  // Comment
  const tdComentario = document.createElement('td');
  const commentActions = document.createElement('div');
  commentActions.className = 'cell-actions';
  const snapshotRelPath = normalizeSnapshotRelPath(row.snapshotRelPath || '');
  if (snapshotRelPath) {
    const snapshotBtn = buildActionButton(
      'renderer.tasks.buttons.snapshot',
      'renderer.tasks.tooltips.snapshot_load',
      () => {
        loadSnapshotForRow(row).catch((err) => log.error('loadSnapshotForRow failed:', err));
      }
    );
    const snapshotTitle = tr('renderer.tasks.tooltips.snapshot_load', snapshotBtn.title || snapshotBtn.textContent || '');
    snapshotBtn.title = `${snapshotTitle} ${snapshotRelPath}`.trim();
    commentActions.appendChild(snapshotBtn);
  }
  const commentBtn = document.createElement('button');
  commentBtn.type = 'button';
  commentBtn.className = 'icon-btn';
  commentBtn.textContent = tr('renderer.tasks.buttons.comment', commentBtn.textContent || '');
  commentBtn.title = tr('renderer.tasks.tooltips.comment', commentBtn.title || commentBtn.textContent || '');
  commentBtn.addEventListener('click', () => {
    pendingCommentRowId = row.id;
    pendingCommentSnapshotRelPath = snapshotRelPath;
    commentInput.value = row.comentario || '';
    setCommentSnapshotDisplay(pendingCommentSnapshotRelPath);
    openModal(commentModal);
  });
  commentActions.appendChild(commentBtn);
  tdComentario.appendChild(commentActions);

  // Actions
  const tdActions = document.createElement('td');
  const actionsWrap = document.createElement('div');
  actionsWrap.className = 'cell-actions';

  const btnUp = buildActionButton('renderer.tasks.buttons.move_up', 'renderer.tasks.tooltips.move_up', () => moveRow(row.id, -1));
  const btnDown = buildActionButton('renderer.tasks.buttons.move_down', 'renderer.tasks.tooltips.move_down', () => moveRow(row.id, 1));
  const btnDelete = buildActionButton('renderer.tasks.buttons.delete_row', 'renderer.tasks.tooltips.delete_row', () => deleteRow(row.id));
  const btnSaveLib = buildActionButton('renderer.tasks.buttons.library_row_save', 'renderer.tasks.tooltips.library_row_save', () => {
    pendingLibraryRowId = row.id;
    openModal(includeCommentModal);
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
  trEl.appendChild(tdTipo);
  trEl.appendChild(tdEnlace);
  trEl.appendChild(tdComentario);
  trEl.appendChild(tdActions);

  return trEl;
}

function renderTable() {
  if (!tableBody) return;
  tableBody.innerHTML = '';
  rows.forEach((row) => {
    tableBody.appendChild(renderRow(row));
  });
  updateTotal();
}

function collectDefaultColumnWidths() {
  const out = {};
  if (!taskColGroup) return out;
  const cols = taskColGroup.querySelectorAll('col');
  cols.forEach((col) => {
    const key = col.dataset.col;
    const def = Number(col.dataset.default);
    if (key && Number.isFinite(def) && def > 0) {
      out[key] = def;
    }
  });
  return out;
}

function applyColumnWidths(widths) {
  if (!taskColGroup) return;
  const cols = taskColGroup.querySelectorAll('col');
  let sum = 0;
  cols.forEach((col) => {
    const key = col.dataset.col;
    const w = key && widths && Number.isFinite(widths[key]) ? widths[key] : null;
    if (w && w > 0) {
      col.style.width = `${w}px`;
      sum += w;
    }
  });
  if (taskTable && sum > 0) {
    taskTable.style.width = `${sum}px`;
  }
}

async function saveColumnWidths() {
  if (!window.taskEditorAPI || typeof window.taskEditorAPI.saveColumnWidths !== 'function') {
    log.warnOnce('task_editor.columnWidths.save.missingApi', 'task column widths save unavailable (ignored).');
    return;
  }
  try {
    await window.taskEditorAPI.saveColumnWidths(columnWidths);
  } catch (err) {
    log.warnOnce('task_editor.columnWidths.save', 'saveColumnWidths failed (ignored):', err);
  }
}

async function loadColumnWidths() {
  const defaults = collectDefaultColumnWidths();
  if (!window.taskEditorAPI || typeof window.taskEditorAPI.getColumnWidths !== 'function') {
    log.warnOnce('BOOTSTRAP:task_editor.columnWidths.missingApi', 'task column widths unavailable; using defaults.');
    columnWidths = { ...defaults };
    applyColumnWidths(columnWidths);
    await saveColumnWidths();
    return;
  }
  const res = await window.taskEditorAPI.getColumnWidths();
  if (!res || res.ok === false || !res.widths) {
    log.warnOnce('BOOTSTRAP:task_editor.columnWidths.load', 'task column widths load failed; using defaults.', res);
    columnWidths = { ...defaults };
    applyColumnWidths(columnWidths);
    await saveColumnWidths();
    return;
  }
  columnWidths = { ...defaults, ...res.widths };
  applyColumnWidths(columnWidths);
}

function setupColumnResizers() {
  if (!taskColGroup) return;
  const cols = taskColGroup.querySelectorAll('col');
  const colMap = {};
  cols.forEach((col) => {
    const key = col.dataset.col;
    if (key) colMap[key] = col;
  });

  COLUMN_KEYS.forEach(({ key, th }) => {
    if (!th || !key) return;
    const handle = document.createElement('div');
    handle.className = 'col-resizer';
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const col = colMap[key];
      const startWidth = col
        ? col.getBoundingClientRect().width
        : th.getBoundingClientRect().width;
      activeResize = {
        key,
        startX: e.clientX,
        startWidth,
      };
      document.body.classList.add('is-resizing');
    });
    th.appendChild(handle);
  });

  const onMouseMove = (e) => {
    if (!activeResize) return;
    const delta = e.clientX - activeResize.startX;
    const nextWidth = Math.max(MIN_COL_WIDTH, activeResize.startWidth + delta);
    columnWidths[activeResize.key] = Math.round(nextWidth);
    applyColumnWidths(columnWidths);
  };

  const onMouseUp = () => {
    if (!activeResize) return;
    activeResize = null;
    document.body.classList.remove('is-resizing');
    saveColumnWidths();
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

// =============================================================================
// Row operations
// =============================================================================
function addRow(data = {}) {
  rows.push(createRow(data));
  markDirty();
  renderTable();
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
  const safeName = clampTaskName(task.meta.name || '');
  meta = {
    name: safeName,
    createdAt: task.meta.createdAt || new Date().toISOString(),
    updatedAt: task.meta.updatedAt || new Date().toISOString(),
  };
  sourcePath = payload.sourcePath || null;
  rows = task.rows.map((r) => createRow(r));
  resetDirty();
  taskNameInput.value = safeName;
  renderTable();
}

function validateBeforeSave() {
  const name = clampTaskName(taskNameInput.value);
  if (taskNameInput.value !== name) taskNameInput.value = name;
  for (const row of rows) {
    if (!String(row.texto || '').trim()) {
      showEditorNotice('renderer.tasks.alerts.row_text_required');
      return null;
    }
  }
  return name;
}

async function saveTask() {
  const api = getTaskEditorApi('saveTaskList');
  if (!api) return;
  const name = validateBeforeSave();
  if (name === null) return;

  meta.name = name || '';
  const payload = {
    meta,
    rows: rows.map((r) => ({
      texto: r.texto,
      tiempoSeconds: r.tiempoSeconds,
      percentComplete: r.percentComplete,
      tipo: r.tipo,
      enlace: r.enlace,
      comentario: r.comentario,
      snapshotRelPath: normalizeSnapshotRelPath(r.snapshotRelPath || ''),
    })),
    sourcePath,
  };

  const res = await api.saveTaskList(payload);
  if (!res || res.ok === false) {
    const code = res && res.code ? res.code : 'WRITE_FAILED';
    if (code === 'CANCELLED' || code === 'CONFIRM_DENIED') return;
    if (code === 'PATH_OUTSIDE_TASKS') {
      showEditorNotice('renderer.tasks.alerts.task_path_outside');
      return;
    }
    if (code === 'INVALID_SCHEMA') {
      showEditorNotice('renderer.tasks.alerts.task_invalid_rows');
      return;
    }
    showEditorNotice('renderer.tasks.alerts.task_save_error');
    return;
  }

  if (res.meta) meta = res.meta;
  if (res.path) sourcePath = res.path;
  resetDirty();
  showEditorNotice('renderer.tasks.alerts.task_save_success');
}

async function deleteTask() {
  if (!sourcePath) {
    showEditorNotice('renderer.tasks.alerts.task_delete_unavailable');
    return;
  }
  const api = getTaskEditorApi('deleteTaskList');
  if (!api) return;
  const res = await api.deleteTaskList(sourcePath);
  if (!res || res.ok === false) {
    const code = res && res.code ? res.code : 'WRITE_FAILED';
    if (code === 'CONFIRM_DENIED') return;
    showEditorNotice('renderer.tasks.alerts.task_delete_error');
    return;
  }

  meta = { name: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  sourcePath = null;
  rows = [];
  resetDirty();
  taskNameInput.value = '';
  renderTable();
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

    const btnLoad = buildActionButton('renderer.tasks.buttons.library_row_load', 'renderer.tasks.tooltips.library_row_load', () => {
      addRow({
        texto: entry.texto,
        tiempoSeconds: Number(entry.tiempoSeconds) || 0,
        percentComplete: 0,
        tipo: entry.tipo || '',
        enlace: entry.enlace || '',
        comentario: entry.comentario || '',
        snapshotRelPath: entry.snapshotRelPath || '',
      });
      closeModal(libraryModal);
    });
    const btnDelete = buildActionButton('renderer.tasks.buttons.library_row_delete', 'renderer.tasks.tooltips.library_row_delete', async () => {
      const api = getTaskEditorApi('deleteLibraryEntry');
      if (!api) return;
      const delRes = await api.deleteLibraryEntry(entry.texto);
      if (!delRes || delRes.ok === false) {
        const code = delRes && delRes.code ? delRes.code : 'WRITE_FAILED';
        if (code === 'CONFIRM_DENIED') return;
        showEditorNotice('renderer.tasks.alerts.library_delete_error');
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
    const tipo = String(entry.tipo || '').toLowerCase();
    return texto.includes(term) || tipo.includes(term);
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
  if (!res || res.ok === false) {
    showEditorNotice('renderer.tasks.alerts.library_load_error');
    return;
  }

  libraryItemsCache = Array.isArray(res.items) ? res.items : [];
  filterLibraryItems();
}
async function saveRowToLibrary(includeComment) {
  const row = rows.find((r) => r.id === pendingLibraryRowId);
  pendingLibraryRowId = null;
  closeModal(includeCommentModal);
  if (!row) return;
  if (!String(row.texto || '').trim()) {
    showEditorNotice('renderer.tasks.alerts.row_text_required');
    return;
  }
  const api = getTaskEditorApi('saveLibraryRow');
  if (!api) return;
  const res = await api.saveLibraryRow(row, includeComment);
  if (!res || res.ok === false) {
    const code = res && res.code ? res.code : 'WRITE_FAILED';
    if (code === 'CONFIRM_DENIED') return;
    showEditorNotice('renderer.tasks.alerts.library_save_error');
    return;
  }
  showEditorNotice('renderer.tasks.alerts.library_save_success');
}

// =============================================================================
// Translations apply
// =============================================================================
async function applyTaskEditorTranslations() {
  await ensureTaskEditorTranslations(idiomaActual);
  document.title = tr('renderer.tasks.title', document.title);
  if (taskNameLabel) taskNameLabel.textContent = tr('renderer.tasks.labels.name', taskNameLabel.textContent || '');
  if (taskTotalLabel) taskTotalLabel.textContent = tr('renderer.tasks.labels.total', taskTotalLabel.textContent || '');
  if (btnTaskSave) btnTaskSave.textContent = tr('renderer.tasks.buttons.save', btnTaskSave.textContent || '');
  if (btnTaskDelete) btnTaskDelete.textContent = tr('renderer.tasks.buttons.delete', btnTaskDelete.textContent || '');
  if (btnTaskAddRow) btnTaskAddRow.textContent = tr('renderer.tasks.buttons.add_row', btnTaskAddRow.textContent || '');
  if (btnTaskLoadLibrary) btnTaskLoadLibrary.textContent = tr('renderer.tasks.buttons.open_library', btnTaskLoadLibrary.textContent || '');

  if (thTexto) thTexto.textContent = tr('renderer.tasks.columns.texto', thTexto.textContent || '');
  if (thTiempo) thTiempo.textContent = tr('renderer.tasks.columns.tiempo', thTiempo.textContent || '');
  if (thPercent) thPercent.textContent = tr('renderer.tasks.columns.percent', thPercent.textContent || '');
  if (thFalta) thFalta.textContent = tr('renderer.tasks.columns.falta', thFalta.textContent || '');
  if (thTipo) thTipo.textContent = tr('renderer.tasks.columns.tipo', thTipo.textContent || '');
  if (thEnlace) thEnlace.textContent = tr('renderer.tasks.columns.enlace', thEnlace.textContent || '');
  if (thComentario) thComentario.textContent = tr('renderer.tasks.columns.comentario', thComentario.textContent || '');
  if (thAcciones) thAcciones.textContent = tr('renderer.tasks.columns.acciones', thAcciones.textContent || '');

  if (commentTitle) commentTitle.textContent = tr('renderer.tasks.modals.comment_title', commentTitle.textContent || '');
  if (commentSave) commentSave.textContent = tr('renderer.tasks.buttons.save', commentSave.textContent || '');
  if (commentCancel) commentCancel.textContent = tr('renderer.tasks.buttons.cancel', commentCancel.textContent || '');
  if (commentSnapshotSelect) {
    commentSnapshotSelect.textContent = tr('renderer.tasks.buttons.select_snapshot', commentSnapshotSelect.textContent || '');
  }

  if (libraryTitle) libraryTitle.textContent = tr('renderer.tasks.modals.library_title', libraryTitle.textContent || '');
  if (librarySearchLabel) librarySearchLabel.textContent = tr('renderer.tasks.labels.search', librarySearchLabel.textContent || '');
  if (librarySearchInput) {
    librarySearchInput.setAttribute(
      'placeholder',
      tr('renderer.tasks.labels.search_placeholder', librarySearchInput.getAttribute('placeholder') || '')
    );
  }

  if (includeCommentTitle) includeCommentTitle.textContent = tr('renderer.tasks.modals.library_save_title', includeCommentTitle.textContent || '');
  if (includeCommentText) includeCommentText.textContent = tr('renderer.tasks.modals.library_save_question', includeCommentText.textContent || '');
  if (includeCommentYes) includeCommentYes.textContent = tr('renderer.tasks.buttons.yes', includeCommentYes.textContent || '');
  if (includeCommentNo) includeCommentNo.textContent = tr('renderer.tasks.buttons.no', includeCommentNo.textContent || '');
  if (includeCommentCancel) includeCommentCancel.textContent = tr('renderer.tasks.buttons.cancel', includeCommentCancel.textContent || '');

  if (libraryEmpty) libraryEmpty.textContent = tr('renderer.tasks.labels.empty', libraryEmpty.textContent || '');

  renderTable();
}

// =============================================================================
// Event wiring
// =============================================================================
if (btnTaskAddRow) {
  btnTaskAddRow.addEventListener('click', () => addRow());
}

if (taskNameInput) {
  taskNameInput.maxLength = TASK_NAME_MAX_CHARS;
  taskNameInput.addEventListener('input', () => {
    const next = clampTaskName(taskNameInput.value);
    if (taskNameInput.value !== next) taskNameInput.value = next;
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
    openModal(libraryModal);
  });
}

if (commentClose) commentClose.addEventListener('click', () => dismissCommentModal());
if (commentBackdrop) commentBackdrop.addEventListener('click', () => dismissCommentModal());
if (commentCancel) commentCancel.addEventListener('click', () => dismissCommentModal());
if (commentSnapshotSelect) {
  commentSnapshotSelect.addEventListener('click', () => {
    selectSnapshotForPendingCommentRow().catch((err) => log.error('selectSnapshotForPendingCommentRow failed:', err));
  });
}
if (commentSave) {
  commentSave.addEventListener('click', () => {
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
  });
}

wireModalClose(libraryModal, libraryClose, libraryBackdrop);
if (librarySearchInput) {
  librarySearchInput.addEventListener('input', () => filterLibraryItems());
}

wireModalClose(includeCommentModal, includeCommentClose, includeCommentBackdrop, includeCommentCancel);
if (includeCommentYes) includeCommentYes.addEventListener('click', () => saveRowToLibrary(true));
if (includeCommentNo) includeCommentNo.addEventListener('click', () => saveRowToLibrary(false));

// =============================================================================
// Task editor init + close guard
// =============================================================================
if (window.taskEditorAPI && typeof window.taskEditorAPI.onInit === 'function') {
  window.taskEditorAPI.onInit((payload) => {
    if (dirty) {
      const msg = tr('renderer.tasks.confirm.discard_changes', 'Discard unsaved changes?');
      if (!window.confirm(msg)) return;
    }
    applyTaskPayload(payload);
  });
} else {
  log.warnOnce('BOOTSTRAP:task_editor.onInit.missing', 'taskEditorAPI.onInit unavailable; editor init disabled.');
}

if (window.taskEditorAPI && typeof window.taskEditorAPI.onRequestClose === 'function') {
  window.taskEditorAPI.onRequestClose(() => {
    if (!dirty) {
      window.taskEditorAPI.confirmClose();
      return;
    }
    const msg = tr('renderer.tasks.confirm.close_unsaved', 'Close without saving?');
    if (window.confirm(msg)) {
      window.taskEditorAPI.confirmClose();
    }
  });
} else {
  log.warnOnce('BOOTSTRAP:task_editor.onRequestClose.missing', 'taskEditorAPI.onRequestClose unavailable; close confirmation disabled.');
}

// =============================================================================
// Bootstrap: settings, translations, column widths
// =============================================================================
(async () => {
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
    await loadColumnWidths();
    setupColumnResizers();
  } catch (err) {
    log.warn('BOOTSTRAP: failed to apply initial translations:', err);
  }
})();

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
} else {
  log.warnOnce('BOOTSTRAP:task_editor.onSettingsChanged.missing', 'taskEditorAPI.onSettingsChanged unavailable; language updates disabled.');
}

// =============================================================================
// End of public/task_editor.js
// =============================================================================
