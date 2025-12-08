// public/preset_modal.js
(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    // Selección de elementos del DOM
    const h3El = document.querySelector('h3');
    const nameEl = document.getElementById('presetName');
    const wpmEl = document.getElementById('presetWpm');
    const descEl = document.getElementById('presetDesc');
    const btnSave = document.getElementById('btnSave');
    const btnCancel = document.getElementById('btnCancel');
    const charCountEl = document.getElementById('charCount');
    const hintEl = document.querySelector('.hint');

    // Si faltan elementos, abortamos y dejamos un aviso en consola.
    if (!nameEl || !wpmEl || !descEl || !btnSave || !btnCancel || !charCountEl) {
      console.warn('preset_modal: elementos del DOM faltantes. El script del modal no se inicializó.');
      return;
    }

    // Configuración inicial
    const descMaxLength = 120;
    const nameMaxLength = 13;

    let mode = 'new';
    let originalName = null;
    let idiomaActual = 'es';
    let presetTranslations = null;
    let presetTranslationsLang = null;

    async function loadPresetTranslations(lang) {
      const target = (lang || "").toLowerCase() || "es";
      if (presetTranslations && presetTranslationsLang === target) return presetTranslations;
      try {
        const resp = await fetch(`../i18n/${target}/renderer.json`);
        if (resp && resp.ok) {
          const raw = await resp.text();
          const cleaned = raw.replace(/^\uFEFF/, "");
          const data = JSON.parse(cleaned || "{}");
          presetTranslations = data;
          presetTranslationsLang = target;
          return data;
        }
      } catch (e) {
        console.warn("preset_modal: no se pudieron cargar traducciones:", e);
      }
      presetTranslations = null;
      presetTranslationsLang = null;
      return null;
    }

    function tPreset(path, fallback) {
      if (!presetTranslations) return fallback;
      const parts = path.split(".");
      let cur = presetTranslations;
      for (const p of parts) {
        if (cur && Object.prototype.hasOwnProperty.call(cur, p)) {
          cur = cur[p];
        } else {
          return fallback;
        }
      }
      return (typeof cur === "string") ? cur : fallback;
    }

    function msgPreset(path, params = {}, fallback = "") {
      let str = tPreset(path, fallback);
      if (!str) return fallback;
      Object.keys(params || {}).forEach(k => {
        str = str.replace(new RegExp(`\\{${k}\\}`, "g"), String(params[k]));
      });
      return str;
    }

    async function applyPresetTranslations(modeForHeading = mode) {
      if (!presetTranslations) return;
      const isEdit = modeForHeading === 'edit';
      const headingKey = isEdit ? "renderer.modal_preset.heading_edit" : "renderer.modal_preset.heading_new";
      const titleKey = isEdit ? "renderer.modal_preset.title_edit" : "renderer.modal_preset.title_new";
      document.title = tPreset(titleKey, document.title);
      if (h3El) h3El.textContent = tPreset(headingKey, h3El.textContent || "");
      const labels = document.querySelectorAll("label");
      labels.forEach((lbl) => {
        const text = (lbl.textContent || "").trim();
        if (text.startsWith("Nombre") || text.startsWith("Name")) lbl.childNodes[0].textContent = tPreset("renderer.modal_preset.name", text);
        if (text.startsWith("WPM")) lbl.childNodes[0].textContent = tPreset("renderer.modal_preset.wpm", text);
        if (text.startsWith("Descripción") || text.startsWith("Descripci") || text.startsWith("Description")) lbl.childNodes[0].textContent = tPreset("renderer.modal_preset.description", text);
      });
      if (nameEl && nameEl.placeholder) nameEl.placeholder = tPreset("renderer.modal_preset.placeholder", nameEl.placeholder);
      if (descEl && descEl.placeholder) descEl.placeholder = tPreset("renderer.modal_preset.placeholder", descEl.placeholder);
      if (charCountEl) charCountEl.textContent = msgPreset("renderer.modal_preset.char_count", { remaining: descMaxLength }, charCountEl.textContent || "");
      if (hintEl) hintEl.textContent = tPreset("renderer.modal_preset.hint", hintEl.textContent || "");
      if (btnSave) btnSave.textContent = tPreset("renderer.modal_preset.save", btnSave.textContent || "");
      if (btnCancel) btnCancel.textContent = tPreset("renderer.modal_preset.cancel", btnCancel.textContent || "");
    }

    async function initTranslations() {
      try {
        if (window.presetAPI && typeof window.presetAPI.getSettings === "function") {
          const settings = await window.presetAPI.getSettings();
          if (settings && settings.language) idiomaActual = settings.language || "es";
        }
      } catch (e) { /* noop */ }
      try {
        await loadPresetTranslations(idiomaActual);
        await applyPresetTranslations();
        console.debug("[preset_modal] Traducciones cargadas para idioma:", idiomaActual);
      } catch (e) {
        console.warn("preset_modal: no se pudieron aplicar traducciones iniciales:", e);
      }
    }

    // Escucha init enviada desde main (preset-init)
    if (window.presetAPI && typeof window.presetAPI.onInit === 'function') {
      try {
        window.presetAPI.onInit((payload) => {
          try {
            if (!payload) return;
            if (payload.mode === 'edit' && payload.preset && payload.preset.name) {
              mode = 'edit';
              originalName = payload.preset.name;
              if (h3El) h3El.textContent = tPreset("renderer.modal_preset.heading_edit", "Editar preset");
              document.title = tPreset("renderer.modal_preset.title_edit", document.title);
              nameEl.value = payload.preset.name || '';
              descEl.value = payload.preset.description || '';
              if (typeof payload.preset.wpm === 'number') wpmEl.value = Math.round(payload.preset.wpm);
            } else {
              mode = 'new';
              if (typeof payload.wpm === 'number') {
                wpmEl.value = Math.round(payload.wpm);
                if (!nameEl.value.trim()) nameEl.value = `${Math.round(payload.wpm)}wpm`;
              }
            }
            // Update char count initial
            const currLen = descEl.value ? descEl.value.length : 0;
            charCountEl.textContent = msgPreset("renderer.modal_preset.char_count", { remaining: Math.max(0, descMaxLength - currLen) }, `${Math.max(0, descMaxLength - currLen)} caracteres restantes`);
          } catch (err) {
            console.error('Error applying preset-init data:', err);
          }
        });
      } catch (err) {
        console.error('Error setting up presetAPI.onInit listener:', err);
      }
    }

    // Función helper para construir preset desde inputs (validaciones mínimas)
    function buildPresetFromInputs() {
      const name = (nameEl.value || '').trim();
      const wpm = Number(wpmEl.value);
      const desc = (descEl.value || '').trim();

      if (!name) {
        alert(tPreset("renderer.preset_alerts.name_empty", "El nombre no puede estar vacío."));
        return null;
      }
      if (!Number.isFinite(wpm) || wpm < 50 || wpm > 500) {
        alert(tPreset("renderer.preset_alerts.wpm_invalid", "WPM debe ser un número entre 50 y 500."));
        return null;
      }
      return { name, wpm: Math.round(wpm), description: desc };
    }

    // Listeners
    descEl.addEventListener('input', () => {
      const currentLength = descEl.value.length;
      const remaining = descMaxLength - currentLength;
      charCountEl.textContent = msgPreset("renderer.modal_preset.char_count", { remaining }, `${remaining} caracteres restantes`);
      if (currentLength >= descMaxLength) {
        descEl.value = descEl.value.substring(0, descMaxLength);
      }
    });

    nameEl.addEventListener('input', () => {
      if (nameEl.value.length >= nameMaxLength) {
        nameEl.value = nameEl.value.substring(0, nameMaxLength);
      }
    });

    btnSave.addEventListener('click', async () => {
      const preset = buildPresetFromInputs();
      if (!preset) return;

      try {
        if (mode === 'edit') {
          if (window.presetAPI && typeof window.presetAPI.editPreset === 'function') {
            const res = await window.presetAPI.editPreset(originalName, preset);
            if (res && res.ok) {
              window.close();
            } else {
              if (res && res.code === 'CANCELLED') return;
              alert(tPreset("renderer.preset_alerts.edit_error", "Ocurrió un error al editar el preset. Revisa la consola."));
              console.error('Error editando preset (respuesta):', res);
            }
          }
        } else {
          if (window.presetAPI && typeof window.presetAPI.createPreset === 'function') {
            const res = await window.presetAPI.createPreset(preset);
            if (res && res.ok) {
              window.close();
            } else {
              alert(tPreset("renderer.preset_alerts.create_error", "Ocurrió un error al crear el preset. Revisa la consola."));
              console.error('Error creando preset (respuesta):', res);
            }
          }
        }
      } catch (err) {
        alert(tPreset("renderer.preset_alerts.process_error", "Ocurrió un error al procesar el preset. Revisa la consola."));
        console.error('Error en save preset:', err);
      }
    });

    btnCancel.addEventListener('click', () => {
      window.close();
    });

    wpmEl.addEventListener('input', () => {
      if (!nameEl.value.trim()) {
        const val = Number(wpmEl.value);
        if (Number.isFinite(val) && val > 0) {
          nameEl.value = `${val}wpm`;
        }
      }
    });

    // Inicial: actualizar contador de caracteres si ya había texto
    (async function initCharCount() {
      const currLen = descEl.value ? descEl.value.length : 0;
      charCountEl.textContent = msgPreset("renderer.modal_preset.char_count", { remaining: Math.max(0, descMaxLength - currLen) }, `${Math.max(0, descMaxLength - currLen)} caracteres restantes`);
      await initTranslations();
    })();

  }); // DOMContentLoaded
})();
