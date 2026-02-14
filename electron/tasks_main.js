// electron/tasks_main.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Provide save/load flows for task lists via native dialogs.
// - Manage row library (list/save/delete).
// - Enforce path containment under config/tasks/.
// - Open task links with confirmation + allowlist.
// - Register IPC handlers for task-related actions.
// =============================================================================

// =============================================================================
// Imports / logger
// =============================================================================
const fs = require('fs');
const path = require('path');
const { dialog, shell, BrowserWindow } = require('electron');
const Log = require('./log');
const menuBuilder = require('./menu_builder');
const { DEFAULT_LANG } = require('./constants_main');
const {
  ensureTasksDirs,
  getTasksListsDir,
  getTasksLibraryFile,
  getTasksAllowedHostsFile,
  getTasksColumnWidthsFile,
  saveJson,
} = require('./fs_storage');

const log = Log.get('tasks-main');

// =============================================================================
// Constants / config
// =============================================================================
const TASK_EXT = '.json';

// =============================================================================
// Helpers (paths + dialogs)
// =============================================================================
function safeRealpath(targetPath) {
  try {
    return fs.realpathSync(targetPath);
  } catch {
    return null;
  }
}

function ensureTasksRoot() {
  try {
    ensureTasksDirs();
  } catch (err) {
    log.error('ensureTasksRoot failed:', err);
  }
  const root = getTasksListsDir();
  return fs.existsSync(root) ? root : null;
}

function isPathInsideRoot(rootReal, candidatePath) {
  if (!rootReal || !candidatePath) return false;
  const rel = path.relative(rootReal, candidatePath);
  if (rel === '') return true;
  return !rel.startsWith('..') && !path.isAbsolute(rel);
}

function sanitizeTaskBaseName(base) {
  let next = String(base || '');
  next = next.replace(/\s+/g, '_');
  next = next.replace(/[^A-Za-z0-9_-]/g, '');
  next = next.replace(/_+/g, '_').replace(/-+/g, '-');
  next = next.replace(/^[_-]+|[_-]+$/g, '');
  return next || 'task';
}

function resolveDialogText(dialogTexts, key, fallback) {
  return menuBuilder.resolveDialogText(dialogTexts, key, fallback, {
    log,
    warnPrefix: 'tasks_main.dialog.missing',
  });
}

function getDialogTexts() {
  try {
    const settings = require('./settings').getSettings();
    const lang = settings && settings.language ? settings.language : DEFAULT_LANG;
    return menuBuilder.getDialogTexts(lang);
  } catch (err) {
    log.warnOnce('tasks_main.dialogTexts', 'Using fallback dialog texts:', err);
    return {};
  }
}

function getDefaultTaskFileName(rootDir, taskName) {
  const base = sanitizeTaskBaseName(taskName || '');
  let candidate = `${base}${TASK_EXT}`;
  if (!fs.existsSync(path.join(rootDir, candidate))) return candidate;
  let idx = 2;
  while (fs.existsSync(path.join(rootDir, `${base}_${idx}${TASK_EXT}`))) {
    idx += 1;
  }
  return `${base}_${idx}${TASK_EXT}`;
}

function normalizeSavePath(filePath) {
  const resolved = path.resolve(String(filePath || ''));
  const dir = path.dirname(resolved);
  const base = path.basename(resolved, path.extname(resolved));
  const safeBase = sanitizeTaskBaseName(base);
  return path.join(dir, `${safeBase}${TASK_EXT}`);
}

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return { ok: false, code: 'NOT_FOUND' };
    }
    let raw = fs.readFileSync(filePath, 'utf8');
    raw = raw.replace(/^\uFEFF/, '');
    if (!raw.trim()) return { ok: false, code: 'INVALID_JSON', message: 'empty file' };
    const data = JSON.parse(raw);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, code: 'INVALID_JSON', message: String(err) };
  }
}

// =============================================================================
// Helpers (normalization / validation)
// =============================================================================
function normalizeTexto(raw) {
  let s = String(raw || '');
  s = s.trim().replace(/\s+/g, ' ');
  if (!s) return '';
  try {
    s = s.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  } catch {
    s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }
  return s.toLowerCase();
}

function normalizeRow(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, code: 'INVALID_ROW' };
  const texto = String(raw.texto || '').trim();
  if (!texto) return { ok: false, code: 'EMPTY_TEXTO' };
  const tiempoSeconds = Number(raw.tiempoSeconds);
  if (!Number.isFinite(tiempoSeconds) || tiempoSeconds < 0) {
    return { ok: false, code: 'INVALID_TIEMPO' };
  }
  const percentComplete = Number(raw.percentComplete);
  if (!Number.isFinite(percentComplete) || percentComplete < 0 || percentComplete > 100) {
    return { ok: false, code: 'INVALID_PERCENT' };
  }
  const tipo = typeof raw.tipo === 'string' ? raw.tipo : String(raw.tipo || '');
  const enlace = typeof raw.enlace === 'string' ? raw.enlace : String(raw.enlace || '');
  const comentario = typeof raw.comentario === 'string' ? raw.comentario : String(raw.comentario || '');
  return {
    ok: true,
    row: { texto, tiempoSeconds, percentComplete, tipo, enlace, comentario },
  };
}

function normalizeLibraryEntry(raw, includeComment) {
  if (!raw || typeof raw !== 'object') return { ok: false, code: 'INVALID_ROW' };
  const texto = String(raw.texto || '').trim();
  if (!texto) return { ok: false, code: 'EMPTY_TEXTO' };
  const tiempoSeconds = Number(raw.tiempoSeconds);
  if (!Number.isFinite(tiempoSeconds) || tiempoSeconds < 0) {
    return { ok: false, code: 'INVALID_TIEMPO' };
  }
  const tipo = typeof raw.tipo === 'string' ? raw.tipo : String(raw.tipo || '');
  const enlace = typeof raw.enlace === 'string' ? raw.enlace : String(raw.enlace || '');
  let comentario = typeof raw.comentario === 'string' ? raw.comentario : String(raw.comentario || '');
  if (!includeComment) comentario = '';
  const entry = { texto, tiempoSeconds, tipo, enlace };
  if (comentario) entry.comentario = comentario;
  return { ok: true, entry };
}

function normalizeTaskMeta(rawMeta, { preserveCreatedAt } = {}) {
  const meta = rawMeta && typeof rawMeta === 'object' ? rawMeta : {};
  const name = String(meta.name || '').trim();

  let createdAt = '';
  if (typeof meta.createdAt === 'string' && meta.createdAt.trim()) {
    const t = Date.parse(meta.createdAt);
    if (Number.isFinite(t)) createdAt = new Date(t).toISOString();
  } else if (typeof meta.createdAt === 'number' && Number.isFinite(meta.createdAt)) {
    createdAt = new Date(meta.createdAt).toISOString();
  }

  if (!createdAt && preserveCreatedAt) {
    createdAt = preserveCreatedAt;
  }
  if (!createdAt) createdAt = new Date().toISOString();

  const updatedAt = new Date().toISOString();
  return { ok: true, meta: { name, createdAt, updatedAt } };
}

function normalizeTaskList(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, code: 'INVALID_SCHEMA' };
  const rowsRaw = Array.isArray(raw.rows) ? raw.rows : null;
  if (!rowsRaw) return { ok: false, code: 'INVALID_SCHEMA' };

  const normalizedRows = [];
  for (const r of rowsRaw) {
    const res = normalizeRow(r);
    if (!res.ok) return { ok: false, code: 'INVALID_SCHEMA', message: res.code };
    normalizedRows.push(res.row);
  }

  const metaRaw = raw.meta && typeof raw.meta === 'object' ? raw.meta : {};
  const meta = {
    name: String(metaRaw.name || '').trim(),
    createdAt: metaRaw.createdAt || new Date().toISOString(),
    updatedAt: metaRaw.updatedAt || new Date().toISOString(),
  };

  return { ok: true, task: { meta, rows: normalizedRows } };
}

// =============================================================================
// Helpers (library + allowlist)
// =============================================================================
function loadLibraryData() {
  const file = getTasksLibraryFile();
  const res = readJsonFile(file);
  if (!res.ok) {
    if (res.code === 'NOT_FOUND') return { ok: true, items: [] };
    return { ok: false, code: res.code };
  }
  if (!Array.isArray(res.data)) return { ok: false, code: 'INVALID_SCHEMA' };
  return { ok: true, items: res.data };
}

function saveLibraryData(items) {
  const file = getTasksLibraryFile();
  saveJson(file, items);
  return { ok: true };
}

function loadAllowedHosts() {
  const file = getTasksAllowedHostsFile();
  const res = readJsonFile(file);
  if (!res.ok) {
    if (res.code !== 'NOT_FOUND') {
      log.warnOnce('tasks_main.allowedHosts.invalid', 'allowed_hosts.json invalid; using empty set.');
    }
    return new Set();
  }
  const arr = Array.isArray(res.data) ? res.data : [];
  const set = new Set();
  arr.forEach((h) => {
    if (typeof h === 'string' && h.trim()) set.add(h.trim().toLowerCase());
  });
  return set;
}

function saveAllowedHosts(set) {
  const file = getTasksAllowedHostsFile();
  const arr = Array.from(set);
  saveJson(file, arr);
}

function sanitizeColumnWidths(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  Object.keys(raw).forEach((key) => {
    const n = Number(raw[key]);
    if (Number.isFinite(n) && n > 0) {
      out[key] = Math.round(n);
    }
  });
  return Object.keys(out).length ? out : null;
}

function isAuthorizedSender(event, expectedWin, logKey, logMessage) {
  const senderWin = BrowserWindow.fromWebContents(event.sender);
  if (expectedWin && senderWin && senderWin !== expectedWin) {
    log.warnOnce(logKey, logMessage);
    return false;
  }
  return true;
}

// =============================================================================
// IPC registration
// =============================================================================
function registerIpc(ipcMain, { getWindows, ensureTaskEditorWindow } = {}) {
  if (!ipcMain) {
    throw new Error('[tasks_main] registerIpc requires ipcMain');
  }

  const resolveWins = () => (typeof getWindows === 'function' ? (getWindows() || {}) : {});
  const resolveMainWin = () => resolveWins().mainWin || null;
  const resolveTaskEditorWin = () => resolveWins().taskEditorWin || null;

  ipcMain.handle('open-task-editor', async (event, payload) => {
    try {
      const mainWin = resolveMainWin();
      if (
        !isAuthorizedSender(
          event,
          mainWin,
          'tasks_main.open.unauthorized',
          'open-task-editor unauthorized (ignored).'
        )
      ) return { ok: false, code: 'UNAUTHORIZED' };

      if (typeof ensureTaskEditorWindow !== 'function') {
        log.warnOnce('tasks_main.open.noEnsure', 'open-task-editor unavailable: ensureTaskEditorWindow missing.');
        return { ok: false, code: 'UNAVAILABLE' };
      }

      const mode = payload && payload.mode === 'load' ? 'load' : 'new';

      if (mode === 'new') {
        ensureTaskEditorWindow();
        const taskEditorWin = resolveTaskEditorWin();
        if (taskEditorWin) {
          taskEditorWin.webContents.send('task-editor-init', {
            mode: 'new',
            task: { meta: { name: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, rows: [] },
            sourcePath: null,
          });
        }
        return { ok: true };
      }

      // Load existing task list
      const root = ensureTasksRoot();
      if (!root) {
        return { ok: false, code: 'READ_FAILED', message: 'tasks root unavailable' };
      }
      const rootReal = safeRealpath(root);
      if (!rootReal) {
        return { ok: false, code: 'READ_FAILED', message: 'tasks root realpath failed' };
      }

      const dialogRes = await dialog.showOpenDialog(resolveMainWin(), {
        defaultPath: root,
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile'],
      });

      if (!dialogRes || dialogRes.canceled || !dialogRes.filePaths || !dialogRes.filePaths.length) {
        return { ok: false, code: 'CANCELLED' };
      }

      const selectedPath = String(dialogRes.filePaths[0] || '');
      const selectedReal = safeRealpath(selectedPath);
      if (!selectedReal) {
        return { ok: false, code: 'READ_FAILED', message: 'task list realpath failed' };
      }
      if (!isPathInsideRoot(rootReal, selectedReal)) {
        return { ok: false, code: 'PATH_OUTSIDE_TASKS' };
      }

      const jsonRes = readJsonFile(selectedReal);
      if (!jsonRes.ok) {
        return { ok: false, code: jsonRes.code || 'INVALID_JSON' };
      }
      const normalized = normalizeTaskList(jsonRes.data);
      if (!normalized.ok) {
        return { ok: false, code: normalized.code || 'INVALID_SCHEMA', message: normalized.message };
      }

      ensureTaskEditorWindow();
      const taskEditorWin = resolveTaskEditorWin();
      if (taskEditorWin) {
        taskEditorWin.webContents.send('task-editor-init', {
          mode: 'load',
          task: normalized.task,
          sourcePath: selectedReal,
        });
      }
      return { ok: true };
    } catch (err) {
      log.error('Error processing open-task-editor:', err);
      return { ok: false, code: 'READ_FAILED', message: String(err) };
    }
  });

  ipcMain.handle('task-list-save', async (event, payload) => {
    try {
      const taskEditorWin = resolveTaskEditorWin();
      if (
        !isAuthorizedSender(
          event,
          taskEditorWin,
          'tasks_main.save.unauthorized',
          'task-list-save unauthorized (ignored).'
        )
      ) return { ok: false, code: 'UNAUTHORIZED' };

      const root = ensureTasksRoot();
      if (!root) return { ok: false, code: 'WRITE_FAILED', message: 'tasks root unavailable' };
      const rootReal = safeRealpath(root);
      if (!rootReal) return { ok: false, code: 'WRITE_FAILED', message: 'tasks root realpath failed' };

      const rowsRaw = payload && Array.isArray(payload.rows) ? payload.rows : null;
      if (!rowsRaw) return { ok: false, code: 'INVALID_SCHEMA' };

      const normalizedRows = [];
      for (const r of rowsRaw) {
        const res = normalizeRow(r);
        if (!res.ok) return { ok: false, code: 'INVALID_SCHEMA', message: res.code };
        normalizedRows.push(res.row);
      }

      const metaRes = normalizeTaskMeta(payload.meta || {});
      if (!metaRes.ok) return { ok: false, code: 'INVALID_SCHEMA', message: metaRes.code };

      const defaultName = getDefaultTaskFileName(root, metaRes.meta.name);
      const defaultPath = path.join(root, defaultName);

      const dialogRes = await dialog.showSaveDialog(taskEditorWin || null, {
        defaultPath,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });

      if (!dialogRes || dialogRes.canceled || !dialogRes.filePath) {
        return { ok: false, code: 'CANCELLED' };
      }

      const normalizedPath = normalizeSavePath(dialogRes.filePath);
      const candidateResolved = path.resolve(normalizedPath);
      const parentDir = path.dirname(candidateResolved);
      const parentReal = fs.existsSync(parentDir) ? safeRealpath(parentDir) : null;

      if (!isPathInsideRoot(rootReal, candidateResolved)) {
        return { ok: false, code: 'PATH_OUTSIDE_TASKS' };
      }
      if (parentReal && !isPathInsideRoot(rootReal, parentReal)) {
        return { ok: false, code: 'PATH_OUTSIDE_TASKS' };
      }

      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      const taskData = {
        meta: metaRes.meta,
        rows: normalizedRows,
      };
      saveJson(candidateResolved, taskData);

      if (!fs.existsSync(candidateResolved)) {
        return { ok: false, code: 'WRITE_FAILED', message: 'task list not persisted' };
      }

      return { ok: true, path: candidateResolved, meta: taskData.meta };
    } catch (err) {
      log.error('task-list-save failed:', err);
      return { ok: false, code: 'WRITE_FAILED', message: String(err) };
    }
  });

  ipcMain.handle('task-list-delete', async (event, payload) => {
    try {
      const taskEditorWin = resolveTaskEditorWin();
      if (
        !isAuthorizedSender(
          event,
          taskEditorWin,
          'tasks_main.delete.unauthorized',
          'task-list-delete unauthorized (ignored).'
        )
      ) return { ok: false, code: 'UNAUTHORIZED' };

      const target = payload && payload.path ? String(payload.path) : '';
      if (!target) return { ok: false, code: 'INVALID_REQUEST' };

      const root = ensureTasksRoot();
      if (!root) return { ok: false, code: 'WRITE_FAILED' };
      const rootReal = safeRealpath(root);
      const targetReal = safeRealpath(target);
      if (!rootReal || !targetReal || !isPathInsideRoot(rootReal, targetReal)) {
        return { ok: false, code: 'PATH_OUTSIDE_TASKS' };
      }

      const dialogTexts = getDialogTexts();
      const yesLabel = resolveDialogText(dialogTexts, 'yes', 'Yes, continue');
      const noLabel = resolveDialogText(dialogTexts, 'no', 'No, cancel');
      let message = resolveDialogText(
        dialogTexts,
        'task_delete_confirm',
        'Delete this task list?'
      );
      message = message.replace('{name}', path.basename(targetReal));

      const res = await dialog.showMessageBox(taskEditorWin || null, {
        type: 'none',
        buttons: [yesLabel, noLabel],
        defaultId: 1,
        cancelId: 1,
        message,
      });
      if (!res || res.response !== 0) {
        return { ok: false, code: 'CONFIRM_DENIED' };
      }

      fs.unlinkSync(targetReal);
      return { ok: true };
    } catch (err) {
      log.error('task-list-delete failed:', err);
      return { ok: false, code: 'WRITE_FAILED', message: String(err) };
    }
  });

  ipcMain.handle('task-library-list', async (event) => {
    try {
      const taskEditorWin = resolveTaskEditorWin();
      if (
        !isAuthorizedSender(
          event,
          taskEditorWin,
          'tasks_main.library.list.unauthorized',
          'task-library-list unauthorized (ignored).'
        )
      ) return { ok: false, code: 'UNAUTHORIZED' };

      ensureTasksDirs();
      const res = loadLibraryData();
      if (!res.ok) return { ok: false, code: res.code };

      const items = res.items
        .filter((entry) => entry && typeof entry === 'object' && typeof entry.texto === 'string')
        .map((entry) => ({
          texto: String(entry.texto || '').trim(),
          tiempoSeconds: Number(entry.tiempoSeconds) || 0,
          tipo: typeof entry.tipo === 'string' ? entry.tipo : String(entry.tipo || ''),
          enlace: typeof entry.enlace === 'string' ? entry.enlace : String(entry.enlace || ''),
          comentario: typeof entry.comentario === 'string' ? entry.comentario : '',
          _norm: normalizeTexto(entry.texto),
        }))
        .sort((a, b) => a._norm.localeCompare(b._norm));

      items.forEach((x) => delete x._norm);
      return { ok: true, items };
    } catch (err) {
      log.error('task-library-list failed:', err);
      return { ok: false, code: 'READ_FAILED', message: String(err) };
    }
  });

  ipcMain.handle('task-library-save', async (event, payload) => {
    try {
      const taskEditorWin = resolveTaskEditorWin();
      if (
        !isAuthorizedSender(
          event,
          taskEditorWin,
          'tasks_main.library.save.unauthorized',
          'task-library-save unauthorized (ignored).'
        )
      ) return { ok: false, code: 'UNAUTHORIZED' };

      ensureTasksDirs();
      const includeComment = !!(payload && payload.includeComment);
      const resEntry = normalizeLibraryEntry(payload && payload.row, includeComment);
      if (!resEntry.ok) return { ok: false, code: 'INVALID_SCHEMA', message: resEntry.code };

      const res = loadLibraryData();
      if (!res.ok) return { ok: false, code: res.code };

      const items = res.items || [];
      const norm = normalizeTexto(resEntry.entry.texto);
      const existingIdx = items.findIndex((it) => normalizeTexto(it.texto) === norm);

      if (existingIdx >= 0) {
        const dialogTexts = getDialogTexts();
        const yesLabel = resolveDialogText(dialogTexts, 'yes', 'Yes, continue');
        const noLabel = resolveDialogText(dialogTexts, 'no', 'No, cancel');
        let message = resolveDialogText(
          dialogTexts,
          'task_library_overwrite',
          'Overwrite existing library entry?'
        );
        message = message.replace('{name}', resEntry.entry.texto);
        const resp = await dialog.showMessageBox(taskEditorWin || null, {
          type: 'none',
          buttons: [yesLabel, noLabel],
          defaultId: 1,
          cancelId: 1,
          message,
        });
        if (!resp || resp.response !== 0) {
          return { ok: false, code: 'CONFIRM_DENIED' };
        }
        items.splice(existingIdx, 1, resEntry.entry);
      } else {
        items.push(resEntry.entry);
      }

      items.sort((a, b) => normalizeTexto(a.texto).localeCompare(normalizeTexto(b.texto)));
      saveLibraryData(items);
      return { ok: true };
    } catch (err) {
      log.error('task-library-save failed:', err);
      return { ok: false, code: 'WRITE_FAILED', message: String(err) };
    }
  });

  ipcMain.handle('task-library-delete', async (event, payload) => {
    try {
      const taskEditorWin = resolveTaskEditorWin();
      if (
        !isAuthorizedSender(
          event,
          taskEditorWin,
          'tasks_main.library.delete.unauthorized',
          'task-library-delete unauthorized (ignored).'
        )
      ) return { ok: false, code: 'UNAUTHORIZED' };

      ensureTasksDirs();
      const texto = payload && typeof payload.texto === 'string' ? payload.texto.trim() : '';
      if (!texto) return { ok: false, code: 'INVALID_REQUEST' };

      const res = loadLibraryData();
      if (!res.ok) return { ok: false, code: res.code };

      const items = res.items || [];
      const norm = normalizeTexto(texto);
      const idx = items.findIndex((it) => normalizeTexto(it.texto) === norm);
      if (idx < 0) return { ok: false, code: 'NOT_FOUND' };

      const dialogTexts = getDialogTexts();
      const yesLabel = resolveDialogText(dialogTexts, 'yes', 'Yes, continue');
      const noLabel = resolveDialogText(dialogTexts, 'no', 'No, cancel');
      let message = resolveDialogText(
        dialogTexts,
        'task_library_delete',
        'Delete this library entry?'
      );
      message = message.replace('{name}', items[idx].texto || texto);
      const resp = await dialog.showMessageBox(taskEditorWin || null, {
        type: 'none',
        buttons: [yesLabel, noLabel],
        defaultId: 1,
        cancelId: 1,
        message,
      });
      if (!resp || resp.response !== 0) {
        return { ok: false, code: 'CONFIRM_DENIED' };
      }

      items.splice(idx, 1);
      saveLibraryData(items);
      return { ok: true };
    } catch (err) {
      log.error('task-library-delete failed:', err);
      return { ok: false, code: 'WRITE_FAILED', message: String(err) };
    }
  });

  ipcMain.handle('task-columns-load', async (event) => {
    try {
      const taskEditorWin = resolveTaskEditorWin();
      if (
        !isAuthorizedSender(
          event,
          taskEditorWin,
          'tasks_main.columns.load.unauthorized',
          'task-columns-load unauthorized (ignored).'
        )
      ) return { ok: false, code: 'UNAUTHORIZED' };

      ensureTasksDirs();
      const file = getTasksColumnWidthsFile();
      const res = readJsonFile(file);
      if (!res.ok) {
        if (res.code === 'NOT_FOUND') return { ok: true, widths: null };
        return { ok: false, code: res.code };
      }
      const widths = sanitizeColumnWidths(res.data);
      return { ok: true, widths };
    } catch (err) {
      log.error('task-columns-load failed:', err);
      return { ok: false, code: 'READ_FAILED', message: String(err) };
    }
  });

  ipcMain.handle('task-columns-save', async (event, payload) => {
    try {
      const taskEditorWin = resolveTaskEditorWin();
      if (
        !isAuthorizedSender(
          event,
          taskEditorWin,
          'tasks_main.columns.save.unauthorized',
          'task-columns-save unauthorized (ignored).'
        )
      ) return { ok: false, code: 'UNAUTHORIZED' };

      ensureTasksDirs();
      const widths = sanitizeColumnWidths(payload && payload.widths ? payload.widths : null);
      if (!widths) return { ok: false, code: 'INVALID_SCHEMA' };
      const file = getTasksColumnWidthsFile();
      saveJson(file, widths);
      return { ok: true };
    } catch (err) {
      log.error('task-columns-save failed:', err);
      return { ok: false, code: 'WRITE_FAILED', message: String(err) };
    }
  });

  ipcMain.handle('task-open-link', async (event, payload) => {
    try {
      const taskEditorWin = resolveTaskEditorWin();
      if (
        !isAuthorizedSender(
          event,
          taskEditorWin,
          'tasks_main.link.unauthorized',
          'task-open-link unauthorized (ignored).'
        )
      ) return { ok: false, code: 'UNAUTHORIZED' };

      const raw = payload && typeof payload.raw === 'string' ? payload.raw.trim() : '';
      if (!raw) return { ok: false, code: 'LINK_BLOCKED' };

      const isWindowsPath = /^[a-zA-Z]:[\\/]/.test(raw) || raw.startsWith('\\\\');
      const isPosixPath = path.posix.isAbsolute(raw);
      const looksLikePath = isWindowsPath || isPosixPath;

      if (looksLikePath) {
        if (!fs.existsSync(raw)) {
          return { ok: false, code: 'LINK_MISSING' };
        }
        const stats = fs.statSync(raw);
        if (!stats.isFile()) {
          return { ok: false, code: 'LINK_BLOCKED' };
        }

        const dialogTexts = getDialogTexts();
        const yesLabel = resolveDialogText(dialogTexts, 'yes', 'Yes, continue');
        const noLabel = resolveDialogText(dialogTexts, 'no', 'No, cancel');
        let message = resolveDialogText(
          dialogTexts,
          'task_path_confirm',
          'Open this local file?'
        );
        message = message.replace('{path}', raw);

        const resp = await dialog.showMessageBox(taskEditorWin || null, {
          type: 'none',
          buttons: [yesLabel, noLabel],
          defaultId: 1,
          cancelId: 1,
          message,
        });
        if (!resp || resp.response !== 0) {
          return { ok: false, code: 'CONFIRM_DENIED' };
        }

        const openRes = await shell.openPath(raw);
        if (openRes) {
          log.warn('task-open-link openPath failed:', openRes);
          return { ok: false, code: 'OPEN_FAILED' };
        }
        return { ok: true };
      }

      // Try URL parse first
      let parsed = null;
      try {
        parsed = new URL(raw);
      } catch {
        parsed = null;
      }

      if (parsed) {
        if (parsed.protocol !== 'https:') {
          return { ok: false, code: 'LINK_BLOCKED' };
        }

        const host = parsed.hostname.toLowerCase();
        const allowlist = loadAllowedHosts();
        let trusted = allowlist.has(host);

        if (!trusted) {
          const dialogTexts = getDialogTexts();
          const yesLabel = resolveDialogText(dialogTexts, 'yes', 'Yes, continue');
          const noLabel = resolveDialogText(dialogTexts, 'no', 'No, cancel');
          let message = resolveDialogText(
            dialogTexts,
            'task_link_confirm',
            'Open this link?'
          );
          message = message.replace('{url}', parsed.toString());
          const checkboxLabel = resolveDialogText(
            dialogTexts,
            'task_link_trust_host',
            'Trust this host from now on'
          );

          const resp = await dialog.showMessageBox(taskEditorWin || null, {
            type: 'none',
            buttons: [yesLabel, noLabel],
            defaultId: 1,
            cancelId: 1,
            message,
            detail: parsed.toString(),
            checkboxLabel,
            checkboxChecked: false,
          });
          if (!resp || resp.response !== 0) {
            return { ok: false, code: 'CONFIRM_DENIED' };
          }
          trusted = true;
          if (resp.checkboxChecked) {
            allowlist.add(host);
            saveAllowedHosts(allowlist);
          }
        }

        if (trusted) {
          await shell.openExternal(parsed.toString());
          return { ok: true };
        }
      }

      return { ok: false, code: 'LINK_BLOCKED' };
    } catch (err) {
      log.error('task-open-link failed:', err);
      return { ok: false, code: 'ERROR', message: String(err) };
    }
  });
}

// =============================================================================
// Exports
// =============================================================================
module.exports = {
  registerIpc,
};

// =============================================================================
// End of electron/tasks_main.js
// =============================================================================
