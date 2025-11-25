// public/manual.js
console.log("Manual editor starting...");

const editor = document.getElementById('editorArea');
const btnTrash = document.getElementById('btnTrash');

const calcWhileTyping = document.getElementById('calcWhileTyping');
const btnCalc = document.getElementById('btnCalc');

let debounceTimer = null;
const DEBOUNCE_MS = 300;
let suppressLocalUpdate = false;

// Initialize editor with current text from main
(async () => {
  try {
    const t = await window.manualAPI.getCurrentText();
    editor.value = t || "";
    // initial state of CALCULAR button
    btnCalc.disabled = !!(calcWhileTyping && calcWhileTyping.checked);
  } catch (e) {
    console.error("Error inicializando editor:", e);
  }
})();

// Listen for explicit init messages from main (when window created/focused)
window.manualAPI.onInitText((text) => {
  // If user not currently typing, update. Simple heuristic: if element is not focused, update.
  if (!document.hasFocus()) {
    suppressLocalUpdate = true;
    editor.value = text || "";
    suppressLocalUpdate = false;
  }
});

// If main sends external updates while the editor is open and user is not typing, reflect them
window.manualAPI.onExternalUpdate((text) => {
  if (!document.hasFocus()) {
    suppressLocalUpdate = true;
    editor.value = text || "";
    suppressLocalUpdate = false;
  }
});

// If main forces clear editor (explicit), always clear regardless of focus
window.manualAPI.onForceClear(() => {
  try {
    suppressLocalUpdate = true;
    editor.value = "";
    // Update main too (keep state consistent)
    window.manualAPI.setCurrentText("");
  } catch (e) {
    console.error("Error en onForceClear:", e);
  } finally {
    suppressLocalUpdate = false;
  }
});

// On input: debounce and then send to main process as current text only if calcWhileTyping is enabled
editor.addEventListener('input', () => {
  if (suppressLocalUpdate) return;

  if (debounceTimer) clearTimeout(debounceTimer);

  if (calcWhileTyping && calcWhileTyping.checked) {
    debounceTimer = setTimeout(() => {
      const t = editor.value;
      window.manualAPI.setCurrentText(t);
    }, DEBOUNCE_MS);
  } else {
    // do not auto-send when automatic calculation is disabled
  }
});

// Trash button empties textarea and updates main
btnTrash.addEventListener('click', () => {
  editor.value = "";
  // immediately update main
  window.manualAPI.setCurrentText("");
});

// CALCULAR button behavior: only active when automatic calculation is disabled
if (btnCalc) {
  btnCalc.addEventListener('click', () => {
    try {
      const t = editor.value || "";
      window.manualAPI.setCurrentText(t);
      // Do not close the modal or ask anything — per spec
    } catch (e) {
      console.error("Error ejecutando CALCULAR:", e);
      alert("Ocurrió un error al calcular. Revisa la consola.");
    }
  });
}

// Checkbox toggles whether CALCULAR is enabled (when unchecked) or disabled (when checked)
if (calcWhileTyping) {
  calcWhileTyping.addEventListener('change', () => {
    if (calcWhileTyping.checked) {
      // enable automatic sending; disable CALCULAR
      btnCalc.disabled = true;
      // Also send current content once to keep sync
      const t = editor.value || "";
      window.manualAPI.setCurrentText(t);
    } else {
      // disable automatic sending; enable CALCULAR
      btnCalc.disabled = false;
    }
  });
}
