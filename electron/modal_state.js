// electron/modal_state.js
const { screen } = require('electron');
const path = require('path');
const { CONFIG_DIR, loadJson, saveJson } = require('./fs_storage');

const MODAL_STATE_FILE = path.join(CONFIG_DIR, 'modal_state.json');

const DEFAULT_STATE = {
  maximized: true,
  reduced: null
};

function isValidReduced(reduced) {
  if (!reduced || typeof reduced !== 'object') return false;
  const { width, height, x, y } = reduced;
  return (
    typeof width === 'number' &&
    typeof height === 'number' &&
    typeof x === 'number' &&
    typeof y === 'number' &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    Number.isFinite(x) &&
    Number.isFinite(y)
  );
}

function normalizeState(raw) {
  const base = { ...DEFAULT_STATE };
  if (!raw || typeof raw !== 'object') {
    return { ...base };
  }

  const st = { ...base };

  if (typeof raw.maximized === 'boolean') {
    st.maximized = raw.maximized;
  }

  if (raw.reduced && isValidReduced(raw.reduced)) {
    st.reduced = {
      width: raw.reduced.width,
      height: raw.reduced.height,
      x: raw.reduced.x,
      y: raw.reduced.y
    };
  } else {
    st.reduced = null;
  }

  return st;
}

// API: lectura inicial del estado persistido
function loadInitialState(customLoadJson) {
  const loader = typeof customLoadJson === 'function' ? customLoadJson : loadJson;
  try {
    const raw = loader(MODAL_STATE_FILE, DEFAULT_STATE);
    return normalizeState(raw);
  } catch (e) {
    console.error('[modal_state] Error leyendo estado inicial:', e);
    return { ...DEFAULT_STATE };
  }
}

// API: adjuntar listeners a la ventana del editor
function attachTo(editorWin, customLoadJson, customSaveJson) {
  if (!editorWin) return;

  const loader = typeof customLoadJson === 'function' ? customLoadJson : loadJson;
  const saver = typeof customSaveJson === 'function' ? customSaveJson : saveJson;

  // REGLA B — guardar estado reducido cuando la ventana NO está maximizada
  const saveReducedState = () => {
    try {
      if (!editorWin || editorWin.isDestroyed()) return;
      if (editorWin.isMaximized()) return;

      const bounds = editorWin.getBounds();
      const current = loader(MODAL_STATE_FILE, { maximized: false, reduced: null });
      const state = normalizeState(current);

      state.reduced = {
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y
      };

      saver(MODAL_STATE_FILE, state);
    } catch (e) {
      console.error('[modal_state] Error guardando estado reducido del editor:', e);
    }
  };

  editorWin.on('resize', saveReducedState);
  editorWin.on('move', saveReducedState);

  // REGLA A — al maximizar, solo actualizamos flag maximized
  editorWin.on('maximize', () => {
    try {
      const current = loader(MODAL_STATE_FILE, { maximized: true, reduced: null });
      const state = normalizeState(current);
      state.maximized = true;
      saver(MODAL_STATE_FILE, state);
    } catch (e) {
      console.error('[modal_state] Error actualizando estado en maximize:', e);
    }
  });

  // REGLA D — al salir de maximizado, restaurar reduced o aplicar fallback
  editorWin.on('unmaximize', () => {
    try {
      const current = loader(MODAL_STATE_FILE, { maximized: false, reduced: null });
      const state = normalizeState(current);
      state.maximized = false;

      if (state.reduced && isValidReduced(state.reduced)) {
        editorWin.setBounds({
          width: state.reduced.width,
          height: state.reduced.height,
          x: state.reduced.x,
          y: state.reduced.y
        });
      } else {
        // Fallback: mitad de pantalla pegada al borde superior derecho del monitor actual
        const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
        const workArea = (display && display.workArea)
          ? display.workArea
          : { x: 0, y: 0, width: 1200, height: 800 };

        const width = Math.round(workArea.width / 2);
        const height = Math.round(workArea.height / 2);
        const x = workArea.x + workArea.width - width - 20;
        const y = workArea.y + 20;

        const reduced = { width, height, x, y };
        editorWin.setBounds(reduced);
        state.reduced = reduced;
      }

      saver(MODAL_STATE_FILE, state);
    } catch (e) {
      console.error('[modal_state] Error manejando unmaximize del editor:', e);
    }
  });

  // REGLA C — al cerrar, persistimos flag maximized y conservamos reduced previo
  editorWin.on('close', () => {
    try {
      const current = loader(MODAL_STATE_FILE, { maximized: false, reduced: null });
      const state = normalizeState(current);
      state.maximized = editorWin.isMaximized();
      saver(MODAL_STATE_FILE, state);
    } catch (e) {
      console.error('[modal_state] Error guardando estado de cierre de editor:', e);
    }
  });
}

module.exports = {
  loadInitialState,
  attachTo
};
