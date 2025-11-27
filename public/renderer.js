console.log("Renderer main starting...");

const textPreview = document.getElementById('textPreview');
const btnCountClipboard = document.getElementById('btnCountClipboard');
const btnAppendClipboardNewLine = document.getElementById('btnAppendClipboardNewLine');
const btnEdit = document.getElementById('btnEdit');
const btnEmptyMain = document.getElementById('btnEmptyMain');
const btnHelp = document.getElementById('btnHelp');

const resChars = document.getElementById('resChars');
const resCharsNoSpace = document.getElementById('resCharsNoSpace');
const resWords = document.getElementById('resWords');
const resTime = document.getElementById('resTime');

const wpmSlider = document.getElementById('wpmSlider');
const wpmInput = document.getElementById('wpmInput');

const realWpmDisplay = document.getElementById('realWpmDisplay');

const btnVF = document.getElementById('btnVF');

// Referencias a elementos para presets
const presetsSelect = document.getElementById('presets');
const btnNewPreset = document.getElementById('btnNewPreset');
const btnEditPreset = document.getElementById('btnEditPreset');
const btnDeletePreset = document.getElementById('btnDeletePreset');
const btnResetDefaultPresets = document.getElementById('btnResetDefaultPresets');
const presetDescription = document.getElementById('presetDescription');

let currentText = "";
let wpm = Number(wpmSlider.value);
let currentPresetName = null;

// Caché local de presets (lista completa cargada una vez)
let allPresetsCache = [];

// ======================= Conteo de texto =======================
function contarTexto(texto) {
  const conEspacios = texto.length;
  const sinEspacios = texto.replace(/\s+/g, '').length;
  const palabras = texto.trim() === "" ? 0 : texto.trim().split(/\s+/).length;
  return { conEspacios, sinEspacios, palabras };
}

// ======================= Formato HHh MMm SSs =======================
function formatTimeFromWords(words, wpm) {
  if (!wpm || wpm <= 0) return "0h 0m 0s";

  const totalSeconds = Math.round((words / wpm) * 60);

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours}h ${minutes}m ${seconds}s`;
}

// ======================= Obtener configuraciones de idioma =======================
const obtenerIdiomaActivo = async () => {
  const settings = await window.electronAPI.getSettings();
  return settings.language || 'es';  // Devolver el idioma actual, por defecto 'es'
};

// ======================= Obtener separadores de números según el idioma =======================
const obtenerSeparadoresDeNumeros = async (idioma) => {
  const settings = await window.electronAPI.getSettings();
  const formatSettings = settings.numberFormatting || {};
  return formatSettings[idioma] || formatSettings['es'];  // Default a español si no se encuentra el idioma
};

// ======================= Formatear número con separadores de miles y decimales =======================
const formatearNumero = (numero, separadorMiles, separadorDecimal) => {
  // Convertir el número a string con decimales si es necesario
  let [entero, decimal] = numero.toFixed(0).split('.');

  // Agregar separador de miles
  entero = entero.replace(/\B(?=(\d{3})+(?!\d))/g, separadorMiles);

  // Si hay parte decimal, usar el separador adecuado
  return decimal ? `${entero}${separadorDecimal}${decimal}` : entero;
};

// ======================= Actualizar vista y resultados =======================
async function updatePreviewAndResults(text) {
  currentText = text || "";

  const displayText = currentText.replace(/\r?\n/g, '   ');
  const n = displayText.length;

  if (n === 0) {
    textPreview.textContent = "(Pegue texto con “Pegar portapapeles” o pulse “Editar” para ingresarlo manualmente)";
  } else if (n <= 200) {
    textPreview.textContent = displayText;
  } else {
    const start = displayText.slice(0, 275);
    const end = displayText.slice(-275);
    textPreview.textContent = `${start}... | ...${end}`;
  }

  const stats = contarTexto(currentText);
  const idioma = await obtenerIdiomaActivo();
  const { separadorMiles, separadorDecimal } = await obtenerSeparadoresDeNumeros(idioma);

  // Formatear las cifras según el idioma
  const caracteresFormateado = formatearNumero(stats.conEspacios, separadorMiles, separadorDecimal);
  const caracteresSinEspaciosFormateado = formatearNumero(stats.sinEspacios, separadorMiles, separadorDecimal);
  const palabrasFormateado = formatearNumero(stats.palabras, separadorMiles, separadorDecimal);
  resChars.textContent = `Caracteres: ${caracteresFormateado}`;
  resCharsNoSpace.textContent = `Caracteres (sin espacio): ${caracteresSinEspaciosFormateado}`;
  resWords.textContent = `Palabras: ${palabrasFormateado}`;
  resTime.textContent = `⏱ Tiempo estimado de lectura: ${formatTimeFromWords(stats.palabras, wpm)}`;
}

// ======================= Mostrar velocidad real (WPM) =======================
async function mostrarVelocidadReal(realWpm) {
  const idioma = await obtenerIdiomaActivo();
  const { separadorMiles, separadorDecimal } = await obtenerSeparadoresDeNumeros(idioma);
  // Aplicar el mismo formato a la velocidad real
  const velocidadFormateada = formatearNumero(realWpm, separadorMiles, separadorDecimal);
  realWpmDisplay.textContent = `${velocidadFormateada} WPM`;
}

// ======================= Cargar presets (fusionar + shadowing) =======================
const loadPresets = async () => {
  presetsSelect.innerHTML = "";

  // Cargar settings de usuario (incluye presets personalizados)
  const settings = (await window.electronAPI.getSettings()) || { language: "es", presets: [] };
  const lang = settings.language || "es";
  const userPresets = Array.isArray(settings.presets) ? settings.presets.slice() : [];

  // Obtener presets por defecto desde el main process (electron/presets/*.js)
  let defaults = { general: [], languagePresets: {} };
  try {
    defaults = await window.electronAPI.getDefaultPresets();
  } catch (e) {
    console.error("Error obteniendo default presets desde main:", e);
    defaults = { general: [], languagePresets: {} };
  }

  // 1) Combinar defaults general + defaults idioma
  let combined = Array.isArray(defaults.general) ? defaults.general.slice() : [];
  const langPresets = (defaults.languagePresets && defaults.languagePresets[lang]) ? defaults.languagePresets[lang] : [];
  if (Array.isArray(langPresets)) combined.push(...langPresets);

  // 1.b) Aplicar lista de defaults ignorados desde settings (si existe)
  const disabledByUser = (settings.disabled_default_presets && Array.isArray(settings.disabled_default_presets[lang])) ? settings.disabled_default_presets[lang] : [];
  if (Array.isArray(disabledByUser) && disabledByUser.length > 0) {
    combined = combined.filter(p => !disabledByUser.includes(p.name));
  }

  // 2) Aplicar "shadowing": los presets de usuario reemplazan por nombre, sin borrar los defaults
  const map = new Map();
  combined.forEach(p => map.set(p.name, Object.assign({}, p))); // defaults
  userPresets.forEach(up => {
    // Si usuario introdujo un preset con mismo nombre, lo sustituye (shadow) en el map
    map.set(up.name, Object.assign({}, up));
  });

  // 3) Convertir a array y ordenar
  const finalList = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));

  // Guardar caché y poblar DOM del select
  allPresetsCache = finalList.slice();
  allPresetsCache.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.name;
    presetsSelect.appendChild(opt);
  });

  // Si hay un preset actualmente seleccionado (por ejemplo re-inicialización), reflejarlo
  if (currentPresetName) {
    presetsSelect.value = currentPresetName;
  } else {
    presetsSelect.selectedIndex = -1;
  }

  return allPresetsCache;
};

// ======================= Inicialización =======================
(async () => {
  try {
    // Obtener texto inicial actual (si hay)
    const t = await window.electronAPI.getCurrentText();
    updatePreviewAndResults(t || "");

    // Suscripción a actualizaciones desde main (modal)
    if (window.electronAPI && typeof window.electronAPI.onCurrentTextUpdated === 'function') {
      window.electronAPI.onCurrentTextUpdated((text) => {
        updatePreviewAndResults(text || "");
      });
    }

    // Suscripción: escuchar cuando main notifica que se creó/actualizó un preset
    if (window.electronAPI && typeof window.electronAPI.onPresetCreated === 'function') {
      window.electronAPI.onPresetCreated(async (preset) => {
        try {
          // Recargar presets desde settings (aplica shadowing) y seleccionar el creado
          const updated = await loadPresets();
          if (preset && preset.name) {
            const found = updated.find(p => p.name === preset.name);
            if (found) {
              currentPresetName = found.name;
              // fijar selección visual
              presetsSelect.value = found.name;
              wpm = found.wpm;
              wpmInput.value = wpm;
              wpmSlider.value = wpm;
              presetDescription.textContent = found.description || "";
              updatePreviewAndResults(currentText);
            }
          }
        } catch (e) {
          console.error("Error handling preset-created event:", e);
        }
      });
    }

    // Cargar presets y guardarlos en caché
    const allPresets = await loadPresets();

    // Seleccionar preset inicial "default" del general y fijarlo visualmente
    const initialPreset = allPresets.find(p => p.name === "default");
    if (initialPreset) {
      currentPresetName = initialPreset.name;
      presetsSelect.value = currentPresetName; // fija la selección visualmente
      wpm = initialPreset.wpm;
      wpmInput.value = wpm;
      wpmSlider.value = wpm;
      presetDescription.textContent = initialPreset.description;
    }

    // Actualizar vista final con el posible WPM inicial
    updatePreviewAndResults(t || "");

  } catch (e) {
    console.error("Error inicializando renderer:", e);
  }
  // ======================= BARRA SUPERIOR: registrar acciones con menuActions =======================
  // Asegúrate de que menu.js fue cargado (script incluido antes de renderer.js)
  if (window.menuActions && typeof window.menuActions.registerMenuAction === 'function') {
    // Ejemplo: acción para 'guia_basica'
    window.menuActions.registerMenuAction('guia_basica', () => {
      console.log("Botón 'Guía básica' pulsado - acción temporal (registrada vía menuActions)");
      alert("Guía básica pulsada (acción temporal)");
    });

    // Puedes registrar más acciones de ejemplo aquí:
    window.menuActions.registerMenuAction('instrucciones_completas', () => {
      console.log("Instrucciones completas - acción temporal (registrada vía menuActions)");
      // TODO: reemplazar por navegación/modal real
    });

    // Ejemplo genérico para ver payloads no registrados explícitamente:
    // (opcional) registrar un "catch-all" no es necesario; menu.js ya loguea payloads sin handler.
  } else {
    // Si menuActions no está disponible, registra un receptor directo (fallback)
    if (window.electronAPI && typeof window.electronAPI.onMenuClick === 'function') {
      window.electronAPI.onMenuClick((payload) => {
        console.log('menu-click recibido (fallback desde renderer):', payload);
      });
    } else {
      console.warn('menuActions y electronAPI.onMenuClick no disponibles — la barra superior no será manejada por renderer.');
    }
  }
})();

// ======================= Selección de preset (usa caché, no recarga DOM) =======================
presetsSelect.addEventListener('change', () => {
  const name = presetsSelect.value;
  if (!name) return;

  const preset = allPresetsCache.find(p => p.name === name);
  if (preset) {
    currentPresetName = preset.name;
    // Fijar visualmente (por si el select no lo marca en alguna plataforma)
    presetsSelect.value = preset.name;
    wpm = preset.wpm;
    wpmInput.value = wpm;
    wpmSlider.value = wpm;
    presetDescription.textContent = preset.description || "";
    updatePreviewAndResults(currentText);
  }
});

// ======================= Detectar cambio manual en WPM =======================
function resetPresetSelection() {
  currentPresetName = null;
  // dejar el select sin selección visual
  presetsSelect.selectedIndex = -1;
  presetDescription.textContent = "";
}

// Slider/input WPM
wpmSlider.addEventListener('input', () => {
  wpm = Number(wpmSlider.value);
  wpmInput.value = wpm;
  resetPresetSelection();
  updatePreviewAndResults(currentText);
});

wpmInput.addEventListener('blur', () => {
  let val = Number(wpmInput.value);
  if (isNaN(val)) val = 200;
  val = Math.min(Math.max(val, 100), 500);
  wpm = val;
  wpmInput.value = wpm;
  wpmSlider.value = wpm;
  resetPresetSelection();
  updatePreviewAndResults(currentText);
});

wpmInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    wpmInput.blur();
  }
});

// ======================= Botones (básicos) =======================
btnCountClipboard.addEventListener('click', async () => {
  try {
    const text = await window.electronAPI.readClipboard();
    await window.electronAPI.setCurrentText(text || "");
    updatePreviewAndResults(text || "");
  } catch (e) {
    console.error("clipboard error:", e);
  }
});

// ======================= Botón "Pegar portapapeles nueva línea" =======================
btnAppendClipboardNewLine.addEventListener('click', async () => {
  try {
    const clip = await window.electronAPI.readClipboard() || "";
    const current = await window.electronAPI.getCurrentText() || "";

    let newText;
    if (!current) {
      newText = clip;
    } else {
      // ensure there's exactly one newline between blocks (if current doesn't end with newline)
      const endsWithNL = current.endsWith('\n') || current.endsWith('\r');
      newText = current + (endsWithNL ? '\n' : '\n\n') + clip;
    }

    await window.electronAPI.setCurrentText(newText);
    updatePreviewAndResults(newText);
  } catch (e) {
    console.error("Error pegando portapapeles en nueva línea:", e);
    alert("Ocurrió un error al pegar el portapapeles. Revisa la consola.");
  }
});

btnEdit.addEventListener('click', () => {
  window.electronAPI.openEditor();
});

// ======================= Botón VACIAR (pantalla principal) =======================
btnEmptyMain.addEventListener('click', async () => {
  try {
    // Clear memory and update preview
    await window.electronAPI.setCurrentText("");
    updatePreviewAndResults("");

    // Force clear editor window irrespective of focus
    if (window.electronAPI && typeof window.electronAPI.forceClearEditor === 'function') {
      try {
        await window.electronAPI.forceClearEditor();
      } catch (e) {
        // Non-fatal: log
        console.error("Error invocando forceClearEditor:", e);
      }
    }
  } catch (e) {
    console.error("Error vaciando texto desde pantalla principal:", e);
    alert("Ocurrió un error al vaciar el texto. Revisa la consola.");
  }
});

// Botón ? (por ahora solo está ubicado; sin funcionalidad)
if (btnHelp) {
  btnHelp.addEventListener('click', () => {
    console.log("Botón ? pulsado — funcionalidad pendiente.");
    // Por ahora no abrimos modal ni hacemos nada; quedará implementado más adelante.
  });
}

// Nuevo: abrir modal para crear preset (main crea la ventana modal)
// Ahora se envía el WPM actual al main para que lo propague al modal
btnNewPreset.addEventListener('click', () => {
  try {
    if (window.electronAPI && typeof window.electronAPI.openPresetModal === 'function') {
      window.electronAPI.openPresetModal(wpm);
    } else {
      // Fallback: intentar usar prompt (rare platforms — but preload intentionally disabled prompt earlier)
      console.warn("openPresetModal no disponible en electronAPI");
      alert("Funcionalidad de modal no disponible.");
    }
  } catch (e) {
    console.error("Error abriendo modal de nuevo preset:", e);
  }
});

// ======================= Botón EDIT (Editar preset seleccionado) =======================
btnEditPreset.addEventListener('click', async () => {
  try {
    const selectedName = presetsSelect.value;
    if (!selectedName) {
      // Ask main to show native info dialog "No hay ningún preset seleccionado para editar"
      if (window.electronAPI && typeof window.electronAPI.notifyNoSelectionEdit === 'function') {
        await window.electronAPI.notifyNoSelectionEdit();
        return;
      } else {
        alert("No hay ningún preset seleccionado para editar");
        return;
      }
    }

    // Find preset data from cache
    const preset = allPresetsCache.find(p => p.name === selectedName);
    if (!preset) {
      alert("Preset seleccionado no encontrado en caché.");
      return;
    }

    // Open modal in edit mode. We pass an object with mode and the preset data.
    const payload = { wpm: wpm, mode: 'edit', preset: preset };
    if (window.electronAPI && typeof window.electronAPI.openPresetModal === 'function') {
      window.electronAPI.openPresetModal(payload);
    } else {
      alert("Funcionalidad de edición no disponible.");
    }
  } catch (e) {
    console.error("Error abriendo modal de editar preset:", e);
    alert("Ocurrió un error al intentar editar el preset. Revisa la consola.");
  }
});

// ======================= Botón BORRAR (🗑️) =======================
btnDeletePreset.addEventListener('click', async () => {
  try {
    const name = presetsSelect.value || null;
    // Call main to request deletion; main will show native dialogs as needed
    const res = await window.electronAPI.requestDeletePreset(name);

    if (res && res.ok) {
      // On success, reload presets and clear selection. Do not change WPM.
      await loadPresets();
      presetsSelect.selectedIndex = -1;
      currentPresetName = null;
      presetDescription.textContent = "";
      // No further UI dialog required - main already showed confirmation earlier.
      return;
    } else {
      // res.ok === false -> handle known codes
      if (res && res.code === 'NO_SELECTION') {
        // main already showed native information dialog; nothing else to do.
        return;
      }
      if (res && res.code === 'CANCELLED') {
        // user cancelled; nothing to do
        return;
      }
      // Unexpected error: log and show a simple alert
      console.error("Error deleting preset:", res && res.error ? res.error : res);
      alert("Ocurrió un error al borrar el preset. Revisa la consola.");
    }
  } catch (e) {
    console.error("Error en petición de borrado:", e);
    alert("Ocurrió un error al borrar el preset. Revisa la consola.");
  }
});

// ======================= Botón RESTAURAR (R) =======================
btnResetDefaultPresets.addEventListener('click', async () => {
  try {
    // Call main to request restore. main will show native confirmation dialog.
    const res = await window.electronAPI.requestRestoreDefaults();

    if (res && res.ok) {
      // Reload presets to reflect restored defaults
      await loadPresets();

      // After restoration we leave selection cleared (consistently with delete behavior).
      presetsSelect.selectedIndex = -1;
      currentPresetName = null;
      presetDescription.textContent = "";

      return;
    } else {
      if (res && res.code === 'CANCELLED') {
        // User cancelled in native dialog; nothing to do
        return;
      }
      console.error("Error restaurando presets:", res && res.error ? res.error : res);
      alert("Ocurrió un error al restaurar presets. Revisa la consola.");
    }
  } catch (e) {
    console.error("Error en petición de restaurar presets:", e);
    alert("Ocurrió un error al restaurar presets. Revisa la consola.");
  }
});

// ======================= Cronómetro =======================
const timerDisplay = document.getElementById('timerDisplay');
const tStart = document.getElementById('timerStart');
const tStop = document.getElementById('timerStop');
const tReset = document.getElementById('timerReset');

let running = false;
let startTime = 0;
let elapsed = 0;
let rafId = null;

function formatTimer(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

function tick() {
  const now = performance.now();
  const ms = elapsed + (now - startTime);
  timerDisplay.value = formatTimer(ms);
  rafId = requestAnimationFrame(tick);
}

tStart.addEventListener('click', () => {
  if (!running) {
    running = true;
    startTime = performance.now();
    rafId = requestAnimationFrame(tick);
  }
});

tStop.addEventListener('click', () => {
  if (running) {
    running = false;
    elapsed += performance.now() - startTime;
    if (rafId) cancelAnimationFrame(rafId);
  }

  const stats = contarTexto(currentText);
  const words = stats.palabras;
  const secondsTotal = elapsed / 1000;

  if (words > 0 && secondsTotal > 0) {
    const realWpm = (words / secondsTotal) * 60;
    mostrarVelocidadReal(realWpm);
  } else {
    realWpmDisplay.textContent = "";
  }
});

tReset.addEventListener('click', () => {
  running = false;
  startTime = 0;
  elapsed = 0;
  if (rafId) cancelAnimationFrame(rafId);
  timerDisplay.value = "00:00:00";
  realWpmDisplay.textContent = "";
});

// VF button (por ahora no hace nada funcional)
if (btnVF) {
  btnVF.addEventListener('click', () => {
    console.log("VF button clicked - functionality pending.");
    // Placeholder for future functionality
  });
}

// ======================= Edición manual del cronómetro =======================
function parseTimerInput(input) {
  const match = input.match(/^(\d+):([0-5]\d):([0-5]\d)$/);
  if (!match) return null;

  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const seconds = parseInt(match[3], 10);

  return (hours * 3600 + minutes * 60 + seconds) * 1000;
}

function applyManualTime() {
  const ms = parseTimerInput(timerDisplay.value);

  if (ms !== null) {
    elapsed = ms;
    if (running) startTime = performance.now();
    timerDisplay.value = formatTimer(elapsed);
  } else {
    timerDisplay.value = formatTimer(elapsed);
  }
}

timerDisplay.addEventListener('blur', applyManualTime);

timerDisplay.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    timerDisplay.blur();
  }
});
