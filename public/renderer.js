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

const toggleModoPreciso = document.getElementById('toggleModoPreciso');

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

// Límite local en renderer para evitar concatenaciones que creen strings demasiado grandes
let MAX_TEXT_CHARS = 1e7; // valor por defecto hasta que main responda

// --- Cache y estado global para conteo / idioma ---
let modoConteo = "preciso";   // preciso por defecto; puede ser "simple"
let idiomaActual = "es";      // se inicializa al arrancar
let settingsCache = {};       // caché de settings (numberFormatting, language, etc.)

(async () => {
  try {
    const cfg = await window.electronAPI.getAppConfig();
    if (cfg && cfg.maxTextChars) MAX_TEXT_CHARS = Number(cfg.maxTextChars) || MAX_TEXT_CHARS;
  } catch (e) {
    console.error("No se pudo obtener getAppConfig, usando defaults:", e);
  }

  // Cargar settings del usuario UNA VEZ al iniciar renderer
  try {
    const settings = await window.electronAPI.getSettings();
    settingsCache = settings || {};
    idiomaActual = settingsCache.language || "es";
    if (settingsCache.modeConteo) modoConteo = settingsCache.modeConteo;
  } catch (e) {
    console.error("No se pudo obtener user settings al inicio:", e);
    // idiomaActual queda en "es" por defecto
  }
})();

let wpm = Number(wpmSlider.value);
let currentPresetName = null;

// Caché local de presets (lista completa cargada una vez)
let allPresetsCache = [];

// ======================= Conteo de texto =======================
// Version simple
function contarTextoSimple(texto, language) {
  const conEspacios = texto.length;
  const sinEspacios = texto.replace(/\s+/g, '').length;
  const palabras = texto.trim() === "" ? 0 : texto.trim().split(/\s+/).length;
  return { conEspacios, sinEspacios, palabras };
}

function hasIntlSegmenter() {
  return typeof Intl !== "undefined" && typeof Intl.Segmenter === "function";
}

function contarTextoPrecisoFallback(texto, language) {
  // Fallback razonable: graphemes mediante spread (mejor que length) y palabras por regex simple
  const graphemes = [...texto]; // no perfecto para todos los combining clusters pero superior a length
  const conEspacios = graphemes.length;
  const sinEspacios = graphemes.filter(c => !/\s/.test(c)).length;

  // simple word extraction: sequences separated by whitespace (degradado al antiguo)
  const palabras = texto.trim() === "" ? 0 : texto.trim().split(/\s+/).length;

  return { conEspacios, sinEspacios, palabras };
}

// Version precisa usando Intl.Segmenter
// Fallback y comprobación de soporte
function hasIntlSegmenter() {
  return typeof Intl !== "undefined" && typeof Intl.Segmenter === "function";
}

function contarTextoPrecisoFallback(texto, language) {
  // Fallback razonable: spread para mejores graphemes que .length y split básico
  const graphemes = [...texto];
  const conEspacios = graphemes.length;
  const sinEspacios = graphemes.filter(c => !/\s/.test(c)).length;
  const palabras = texto.trim() === "" ? 0 : texto.trim().split(/\s+/).length;
  return { conEspacios, sinEspacios, palabras };
}

// Versión precisa con fallback automático
function contarTextoPreciso(texto, language) {
  if (!hasIntlSegmenter()) {
    // motor antiguo: usar fallback seguro
    return contarTextoPrecisoFallback(texto, language);
  }

  // Si Intl.Segmenter existe, usar la implementación precisa
  const segGraf = new Intl.Segmenter(language, { granularity: "grapheme" });
  const grafemas = [...segGraf.segment(texto)];

  const conEspacios = grafemas.length;
  const sinEspacios = grafemas.filter(g => !/\s/.test(g.segment)).length;

  const segPal = new Intl.Segmenter(language, { granularity: "word" });
  const palabras = [...segPal.segment(texto)]
    .filter(seg => seg.isWordLike)
    .length;

  return { conEspacios, sinEspacios, palabras };
}

// Dispatcher que selecciona el modo (simple/preciso). Preciso por defecto.
function contarTexto(texto) {
  // usar idiomaActual cargado al inicio
  return (modoConteo === "simple")
    ? contarTextoSimple(texto, idiomaActual)
    : contarTextoPreciso(texto, idiomaActual);
}

// Helpers para actualizar modo / idioma desde otras partes (p. ej. menú)
function setModoConteo(nuevoModo) {
  if (nuevoModo === "simple" || nuevoModo === "preciso") {
    modoConteo = nuevoModo;
  }
}

function setIdiomaActual(nuevoIdioma) {
  if (typeof nuevoIdioma === "string" && nuevoIdioma.length > 0) {
    idiomaActual = nuevoIdioma;
  }
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

// ======================= Obtener separadores de números según el idioma (usa cache) =======================
const obtenerSeparadoresDeNumeros = async (idioma) => {
  // Usa settingsCache cargado al inicio (si no está, aplicamos defaults por idioma)
  const nf = settingsCache && settingsCache.numberFormatting ? settingsCache.numberFormatting : null;

  if (!nf) {
    // Defaults sencillos: español vs english
    if (idioma && idioma.toLowerCase().startsWith('en')) {
      return { separadorMiles: ',', separadorDecimal: '.' };
    } else {
      return { separadorMiles: '.', separadorDecimal: ',' };
    }
  }

  return nf[idioma] || nf['es'] || (idioma && idioma.toLowerCase().startsWith('en')
    ? { separadorMiles: ',', separadorDecimal: '.' }
    : { separadorMiles: '.', separadorDecimal: ',' });
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
  const idioma = idiomaActual; // cacheado al iniciar y actualizado por listener si aplica
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
  const idioma = idiomaActual;
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

    // --- Listener para cambios de settings desde main/preload (opcional) ---
    // Si el main/preload expone un evento, lo usamos para mantener settingsCache e idiomaActual actualizados.
    const settingsChangeHandler = (newSettings) => {
      try {
        settingsCache = newSettings || {};
        const nuevoIdioma = settingsCache.language || 'es';
        if (nuevoIdioma !== idiomaActual) {
          idiomaActual = nuevoIdioma;
          // refrescar la vista con posible nuevo formato/segmentación
          updatePreviewAndResults(currentText);
        }
        if (settingsCache.modeConteo && settingsCache.modeConteo !== modoConteo) {
          modoConteo = settingsCache.modeConteo;
          if (toggleModoPreciso) toggleModoPreciso.checked = (modoConteo === 'preciso');
        }
      } catch (err) {
        console.error("Error manejando settings change:", err);
      }
    };

    if (window.electronAPI) {
      if (typeof window.electronAPI.onSettingsChanged === 'function') {
        window.electronAPI.onSettingsChanged(settingsChangeHandler);
      } else if (typeof window.electronAPI.onSettingsUpdated === 'function') {
        window.electronAPI.onSettingsUpdated(settingsChangeHandler);
      } // si no existe, no hay listener disponible y no pasa nada
    }

    // ------------------------------
    // Inicializar y vincular toggle "Modo preciso"
    // ------------------------------
    try {
      if (toggleModoPreciso) {
        // Asegurar estado inicial del switch según el modo en memoria (cargado al inicio)
        toggleModoPreciso.checked = (modoConteo === 'preciso');

        // Cuando el usuario cambie el switch:
        toggleModoPreciso.addEventListener('change', async () => {
          try {
            const nuevoModo = toggleModoPreciso.checked ? 'preciso' : 'simple';

            // Actualizar estado en memoria (inmediato)
            setModoConteo(nuevoModo);

            toggleModoPreciso.setAttribute('aria-checked', toggleModoPreciso.checked ? 'true' : 'false');

            // Reconteo inmediato del texto actual
            updatePreviewAndResults(currentText);

            // Intentar persistir en settings vía IPC (si preload/main implementaron setModeConteo)
            if (window.electronAPI && typeof window.electronAPI.setModeConteo === 'function') {
              try {
                await window.electronAPI.setModeConteo(nuevoModo);
              } catch (ipcErr) {
                console.error("Error persistiendo modeConteo mediante setModeConteo:", ipcErr);
              }
            } else {
              // Fallback: si no existe setModeConteo, intentar escribir settings completo (si expuesto)
              if (window.electronAPI && typeof window.electronAPI.updateSettings === 'function') {
                try {
                  // leer settingsCache, actualizar y enviar
                  const copy = Object.assign({}, settingsCache || {});
                  copy.modeConteo = nuevoModo;
                  await window.electronAPI.updateSettings(copy);
                } catch (updateErr) {
                  console.warn("updateSettings no disponible o falló:", updateErr);
                }
              }
            }
          } catch (err) {
            console.error("Error manejando cambio del toggleModoPreciso:", err);
          }
        });

        // Si el settings cambia desde main, sincronizamos el switch al nuevo valor
        // (esto complementa settingsChangeHandler; repetimos por seguridad local)
        const syncToggleFromSettings = (s) => {
          try {
            if (!toggleModoPreciso) return;
            const modo = (s && s.modeConteo) ? s.modeConteo : modoConteo;
            toggleModoPreciso.checked = (modo === 'preciso');
          } catch (err) {
            console.error("Error sincronizando toggle desde settings:", err);
          }
        };

        // Ejecutar sincronización inmediata con settingsCache (ya cargado)
        try { syncToggleFromSettings(settingsCache || {}); } catch (e) { /* noop */ }
      }
    } catch (ex) {
      console.error("Error inicializando toggleModoPreciso:", ex);
    }

  } catch (e) {
    console.error("Error inicializando renderer:", e);
  }
  /* --- Info modal utility --- */
  const infoModal = document.getElementById("infoModal");
  const infoModalBackdrop = document.getElementById("infoModalBackdrop");
  const infoModalClose = document.getElementById("infoModalClose");
  const infoModalTitle = document.getElementById("infoModalTitle");
  const infoModalContent = document.getElementById("infoModalContent");

  function closeInfoModal() {
    try {
      if (!infoModal || !infoModalContent) return;
      infoModal.setAttribute("aria-hidden", "true");
      infoModalContent.innerHTML = '<div class="info-loading">Cargando...</div>';
    } catch (e) {
      console.error("Error cerrando modal info:", e);
    }
  }

  if (infoModalClose) infoModalClose.addEventListener("click", closeInfoModal);
  if (infoModalBackdrop) infoModalBackdrop.addEventListener("click", closeInfoModal);

  window.addEventListener("keydown", (ev) => {
    if (!infoModal) return;
    if (ev.key === "Escape" && infoModal.getAttribute("aria-hidden") === "false") {
      closeInfoModal();
    }
  });

  async function fetchText(path) {
    try {
      const res = await fetch(path, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      console.debug("fetchText error:", path, e);
      return null;
    }
  }

  async function showInfoModal(key, opts = {}) {
    // key: 'readme' | 'instrucciones' | 'faq' | 'acerca'
    const titles = {
      readme: "Readme",
      instrucciones: "Instrucciones completas",
      guia_basica: "Guía básica",
      faq: "Preguntas frecuentes (FAQ)",
      acerca_de: "Acerca de"
    };

    if (!infoModal || !infoModalTitle || !infoModalContent) return;

    infoModalTitle.textContent = titles[key] || (opts.title || "Información");
    infoModal.setAttribute("aria-hidden", "false");

    // Intentar cargar ./info/<key>.html primero
    const tryHtml = await fetchText(`./info/${key}.html`);
    if (tryHtml !== null) {
      infoModalContent.innerHTML = tryHtml;
      if (infoModalContent && typeof infoModalContent.focus === "function") {
        infoModalContent.focus();
      }
      return;
    }

    // Si no hay archivo, mostrar texto por defecto
    infoModalContent.innerHTML =
      `<p>No hay contenido disponible para "${infoModalTitle.textContent}".</p>`;

    if (infoModalContent && typeof infoModalContent.focus === "function") {
      infoModalContent.focus();
    }
  }

  // ======================= BARRA SUPERIOR: registrar acciones con menuActions =======================
  // Asegúrate de que menu.js fue cargado (script incluido antes de renderer.js)
  if (window.menuActions && typeof window.menuActions.registerMenuAction === 'function') {
    // Registrar acción para "guia_basica"
    window.menuActions.registerMenuAction("guia_basica", () => { showInfoModal("guia_basica") });
    // Registrar acción para "instrucciones_completas"
    window.menuActions.registerMenuAction("instrucciones_completas", () => { showInfoModal("instrucciones") });
    // Registrar acción para "faq"
    window.menuActions.registerMenuAction("faq", () => { showInfoModal("faq") });

    window.menuActions.registerMenuAction('cargador_texto', () => {
      console.log("Cargador de archivo de texto pulsado - acción temporal (registrada vía menuActions)");
      alert("WIP: Aquí se abrirá el cargador de archivos de texto en una futura versión.");
    });

    window.menuActions.registerMenuAction('contador_imagen', () => {
      console.log("Cargador de imágenes con texto pulsado - acción temporal (registrada vía menuActions)");
      alert("WIP: Aquí se abrirá el cargador de imágenes con texto en una futura versión.");
    });

    window.menuActions.registerMenuAction('test_velocidad', () => {
      console.log("Test de velocidad de lectura pulsado - acción temporal (registrada vía menuActions)");
      alert("WIP: Aquí se abrirá el test de velocidad de lectura en una futura versión.");
    });

    window.menuActions.registerMenuAction('preferencias_idioma', () => {
      console.log("Idioma pulsado - acción temporal (registrada vía menuActions)");
      alert("WIP: Aquí se abrirá el selector de idioma en una futura versión.");
    });

    window.menuActions.registerMenuAction('diseno_skins', () => {
      console.log("Skins pulsado - acción temporal (registrada vía menuActions)");
      alert("WIP: Aquí se abrirá el selector de skins en una futura versión.");
    });

    window.menuActions.registerMenuAction('diseno_crono_flotante', () => {
      console.log("Cronómetro flotante pulsado - acción temporal (registrada vía menuActions)");
      alert("WIP: Aquí se abrirá la configuración del cronómetro flotante en una futura versión.");
    });

    window.menuActions.registerMenuAction('diseno_fuentes', () => {
      console.log("Fuentes pulsado - acción temporal (registrada vía menuActions)");
      alert("WIP: Aquí se abrirá el selector de fuentes en una futura versión.");
    });

    window.menuActions.registerMenuAction('diseno_colores', () => {
      console.log("Colores pulsado - acción temporal (registrada vía menuActions)");
      alert("WIP: Aquí se abrirá el selector de colores en una futura versión.");
    });

    window.menuActions.registerMenuAction("presets_por_defecto", async () => {
      try {
        if (!window.electronAPI || typeof window.electronAPI.openDefaultPresetsFolder !== "function") {
          console.warn("openDefaultPresetsFolder no disponible en electronAPI");
          alert("No es posible abrir la carpeta de presets en este entorno.");
          return;
        }

        const res = await window.electronAPI.openDefaultPresetsFolder();
        if (res && res.ok) {
          // carpeta abierta correctamente; no mostrar notificación intrusiva
          console.debug("Carpeta config/presets_defaults abierta en el explorador.");
          return;
        }

        // en caso de fallo, informar al usuario
        const errMsg = res && res.error ? String(res.error) : "Desconocido";
        console.error("No se pudo abrir carpeta presets por defecto:", errMsg);
        alert("No se pudo abrir la carpeta de presets por defecto. Revisa la consola para más detalles.");
      } catch (err) {
        console.error("Error abriendo carpeta presets por defecto:", err);
        alert("Ocurrió un error al intentar abrir la carpeta de presets. Revisa la consola.");
      }
    });

    window.menuActions.registerMenuAction('avisos', () => {
      console.log("Avisos y novedades pulsado - acción temporal (registrada vía menuActions)");
      alert("WIP: Aquí se mostrarán los avisos y novedades en una futura versión.");
    });

    window.menuActions.registerMenuAction('discord', () => {
      console.log("Discord pulsado - acción temporal (registrada vía menuActions)");
      alert("WIP: Aquí se abrirá el enlace a Discord en una futura versión.");
    });

    window.menuActions.registerMenuAction('links_interes', () => {
      console.log("Links de interés pulsado - acción temporal (registrada vía menuActions)");
      alert("WIP: Aquí se mostrarán los links de interés en una futura versión.");
    });

    window.menuActions.registerMenuAction('colabora', () => {
      console.log("COLABORA ($) pulsado - acción temporal (registrada vía menuActions)");
      alert("WIP: Aquí se mostrará la información para colaborar en una futura versión.");
    });

    window.menuActions.registerMenuAction('actualizar_version', () => {
      console.log("Actualizar a última versión pulsado - acción temporal (registrada vía menuActions)");
      alert("WIP: Aquí se iniciará el proceso de actualización en una futura versión.");
    });
    // Registrar acción para "acerca_de"
    window.menuActions.registerMenuAction("readme", () => { showInfoModal("readme") });
    // Registrar acción para "acerca_de"
    window.menuActions.registerMenuAction("acerca_de", () => { showInfoModal("acerca_de") });

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
  val = Math.min(Math.max(val, 50), 500);
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

// ======================= Botón "Sobreescribir con portapapeles" =======================
btnCountClipboard.addEventListener("click", async () => {
  try {
    let clip = await window.electronAPI.readClipboard() || "";
    if (clip.length > MAX_TEXT_CHARS) {
      console.warn("Contenido del portapapeles supera 10000000 chars — será truncado.");
      clip = clip.slice(0, MAX_TEXT_CHARS);
      alert("El texto del portapapeles supera el tamaño máximo permitido y será truncado.");
    }

    // enviar objeto con meta (overwrite)
    const resp = await window.electronAPI.setCurrentText({
      text: clip,
      meta: { source: "main-window", action: "overwrite", clipboardText: clip }
    });

    updatePreviewAndResults(resp && resp.text ? resp.text : clip);
    resp && resp.truncated && alert("El texto fue truncado para ajustarse al límite máximo de la aplicación.");
  } catch (err) {
    console.error("clipboard error:", err);
  }
});

// ======================= Botón "Pegar portapapeles nueva línea" =======================
btnAppendClipboardNewLine.addEventListener("click", async () => {
  try {
    const clip = await window.electronAPI.readClipboard() || "";
    const current = await window.electronAPI.getCurrentText() || "";

    let joiner = "";
    if (current) joiner = current.endsWith("\n") || current.endsWith("\r") ? "\n" : "\n\n";

    const available = MAX_TEXT_CHARS - current.length;
    if (available <= 0) {
      alert("No es posible agregar texto: ya se alcanzó el tamaño máximo permitido.");
      return;
    }

    const toAdd = clip.slice(0, available);
    const newFull = current + (current ? joiner : "") + toAdd;

    // enviar objeto con meta (append_newline)
    const resp = await window.electronAPI.setCurrentText({
      text: newFull,
      meta: { source: "main-window", action: "append_newline", clipboardText: clip }
    });

    updatePreviewAndResults(resp && resp.text ? resp.text : newFull);

    // notificar truncado solo si main lo confirma
    if (resp && resp.truncated) {
      alert("El texto fue truncado para ajustarse al límite máximo de la aplicación.");
    }
  } catch (err) {
    console.error("Error pegando portapapeles en nueva línea:", err);
    alert("Ocurrió un error al pegar el portapapeles. Revisa la consola.");
  }
});

btnEdit.addEventListener('click', () => {
  window.electronAPI.openEditor();
});

// ======================= Botón Vaciar (pantalla principal) =======================
btnEmptyMain.addEventListener("click", async () => {
  try {
    const resp = await window.electronAPI.setCurrentText({
      text: "",
      meta: { source: "main-window", action: "overwrite" }
    });

    updatePreviewAndResults(resp && resp.text ? resp.text : "");
    if (window.electronAPI && typeof window.electronAPI.forceClearEditor === "function") {
      try { await window.electronAPI.forceClearEditor(); } catch (e) { console.error("Error invocando forceClearEditor:", e); }
    }
  } catch (err) {
    console.error("Error vaciando texto desde pantalla principal:", err);
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

// Abrir modal para crear preset (main crea la ventana modal)
// Envía el WPM actual al main para que lo propague al modal
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
const tToggle = document.getElementById('timerToggle');
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

tToggle.addEventListener('click', () => {
  if (!running) {
    // START
    running = true;
    startTime = performance.now();
    rafId = requestAnimationFrame(tick);

    tToggle.textContent = '⏸';
  } else {
    // STOP + CALCULAR
    running = false;
    elapsed += performance.now() - startTime;
    if (rafId) cancelAnimationFrame(rafId);

    tToggle.textContent = '▶';

    const stats = contarTexto(currentText);
    const words = stats.palabras;
    const secondsTotal = elapsed / 1000;

    if (words > 0 && secondsTotal > 0) {
      const realWpm = (words / secondsTotal) * 60;
      mostrarVelocidadReal(realWpm);
    } else {
      realWpmDisplay.textContent = "";
    }
  }
});

tReset.addEventListener('click', () => {
  running = false;
  startTime = 0;
  elapsed = 0;
  if (rafId) cancelAnimationFrame(rafId);

  timerDisplay.value = "00:00:00";
  realWpmDisplay.textContent = "";

  // El botón principal vuelve a ▶
  tToggle.textContent = '▶';
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
