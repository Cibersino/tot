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

    // Escucha init enviada desde main (preset-init)
    if (window.presetAPI && typeof window.presetAPI.onInit === 'function') {
      try {
        window.presetAPI.onInit((payload) => {
          try {
            if (!payload) return;
            if (payload.mode === 'edit' && payload.preset && payload.preset.name) {
              mode = 'edit';
              originalName = payload.preset.name;
              if (h3El) h3El.textContent = 'Editar preset';
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
            charCountEl.textContent = `${Math.max(0, descMaxLength - currLen)} caracteres restantes`;
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
        alert('El nombre no puede estar vacío.');
        return null;
      }
      if (!Number.isFinite(wpm) || wpm <= 0) {
        alert('WPM debe ser un número mayor que 0.');
        return null;
      }
      return { name, wpm: Math.round(wpm), description: desc };
    }

    // Listeners
    descEl.addEventListener('input', () => {
      const currentLength = descEl.value.length;
      const remaining = descMaxLength - currentLength;
      charCountEl.textContent = `${remaining} caracteres restantes`;
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
              alert('Ocurrió un error al editar el preset. Revisa la consola.');
              console.error('Error editando preset (respuesta):', res);
            }
          }
        } else {
          if (window.presetAPI && typeof window.presetAPI.createPreset === 'function') {
            const res = await window.presetAPI.createPreset(preset);
            if (res && res.ok) {
              window.close();
            } else {
              alert('Ocurrió un error al crear el preset. Revisa la consola.');
              console.error('Error creando preset (respuesta):', res);
            }
          }
        }
      } catch (err) {
        alert('Ocurrió un error al procesar el preset. Revisa la consola.');
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
    (function initCharCount() {
      const currLen = descEl.value ? descEl.value.length : 0;
      charCountEl.textContent = `${Math.max(0, descMaxLength - currLen)} caracteres restantes`;
    })();

  }); // DOMContentLoaded
})();
