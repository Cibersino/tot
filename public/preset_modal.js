(function() {
  const titleEl = document.querySelector('h3');
  const nameEl = document.getElementById('presetName');
  const wpmEl = document.getElementById('presetWpm');
  const descEl = document.getElementById('presetDesc');
  const btnSave = document.getElementById('btnSave');
  const btnCancel = document.getElementById('btnCancel');
  const charCountEl = document.getElementById('charCount');
  const nameMaxLength = 13; // Limite de caracteres del nombre
  const descMaxLength = 120; // Limite de caracteres de la descripción

  // Track mode and original name (when editing)
  let mode = 'new';
  let originalName = null;

  // Si hay una API preset disponible (para inicializar datos)
  if (window.presetAPI && typeof window.presetAPI.onInit === 'function') {
    try {
      window.presetAPI.onInit((data) => {
        try {
          if (!data) return;

          // Determinar si es edición o creación
          if (data.mode === 'edit' && data.preset && data.preset.name) {
            mode = 'edit';
            originalName = data.preset.name;

            // Cambiar título
            if (titleEl) titleEl.textContent = 'Editar preset';

            // Pre-cargar los datos
            if (nameEl) nameEl.value = data.preset.name || "";
            if (descEl) descEl.value = data.preset.description || "";
            if (wpmEl && typeof data.preset.wpm === 'number') wpmEl.value = Math.round(data.preset.wpm);
          } else {
            mode = 'new';
            if (wpmEl && typeof data.wpm === 'number') {
              wpmEl.value = Math.round(data.wpm);
              if (nameEl && !nameEl.value.trim()) {
                nameEl.value = `${Math.round(data.wpm)}wpm`;
              }
            }
          }
        } catch (e) {
          console.error("Error applying preset-init data:", e);
        }
      });
    } catch (e) {
      console.error("Error setting up presetAPI.onInit listener:", e);
    }
  }

  // Validación de los campos
  function validate() {
    const name = (nameEl.value || "").trim();
    const wpm = Number(wpmEl.value);
    const desc = (descEl.value || "").trim();

    if (!name) {
      alert("El nombre no puede estar vacío.");
      return null;
    }
    if (!Number.isFinite(wpm) || wpm <= 0) {
      alert("WPM debe ser un número mayor que 0.");
      return null;
    }

    return { name, wpm: Math.round(wpm), description: desc };
  }

  // Control de escritura en el textarea de descripción
  descEl.addEventListener('input', () => {
    const currentLength = descEl.value.length;
    const remaining = descMaxLength - currentLength;
    charCountEl.textContent = `${remaining} caracteres restantes`;

    if (currentLength >= descMaxLength) {
      // Impedir que siga escribiendo cuando se alcanza el límite
      descEl.value = descEl.value.substring(0, descMaxLength);  // Recorta si sobrepasa el límite
    }
  });

  // Control de escritura en el campo "nombre"
  nameEl.addEventListener('input', () => {
    if (nameEl.value.length >= nameMaxLength) {
      nameEl.value = nameEl.value.substring(0, nameMaxLength);  // Recorta si sobrepasa el límite
    }
  });

  // Guardar preset
  btnSave.addEventListener('click', async () => {
    const preset = validate();
    if (!preset) return;
    try {
      if (mode === 'edit') {
        if (window.presetAPI && typeof window.presetAPI.editPreset === 'function') {
          const res = await window.presetAPI.editPreset(originalName, preset);
          if (res && res.ok) {
            window.close();
          } else {
            if (res && res.code === 'CANCELLED') return;
            alert("Ocurrió un error al editar el preset. Revisa la consola.");
            console.error("Error editando preset (respuesta):", res);
          }
        }
      } else {
        if (window.presetAPI && typeof window.presetAPI.createPreset === 'function') {
          const res = await window.presetAPI.createPreset(preset);
          if (res && res.ok) {
            window.close();
          } else {
            alert("Ocurrió un error al crear el preset. Revisa la consola.");
            console.error("Error creando preset (respuesta):", res);
          }
        }
      }
    } catch (e) {
      alert("Ocurrió un error al procesar el preset. Revisa la consola.");
      console.error("Error en save preset:", e);
    }
  });

  // Cancelar acción
  btnCancel.addEventListener('click', () => {
    window.close();
  });

  // Autocompletar el nombre con el valor de WPM
  wpmEl.addEventListener('input', () => {
    if (!nameEl.value.trim()) {
      const v = Number(wpmEl.value);
      if (Number.isFinite(v) && v > 0) nameEl.value = `${v}wpm`;
    }
  });

})();
