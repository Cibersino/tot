// public/preset_modal.js
/* global Notify */
'use strict';

(function () {

  const log = window.getLogger('preset-modal');

  log.debug('Preset modal starting...');

  document.addEventListener('DOMContentLoaded', function () {
    // Selecting DOM elements
    const h3El = document.querySelector('h3');
    const nameEl = document.getElementById('presetName');
    const wpmEl = document.getElementById('presetWpm');
    const descEl = document.getElementById('presetDesc');
    const btnSave = document.getElementById('btnSave');
    const btnCancel = document.getElementById('btnCancel');
    const charCountEl = document.getElementById('charCount');
    const hintEl = document.querySelector('.hint');

    // If elements are missing, we abort and leave a warning via the log.
    if (!nameEl || !wpmEl || !descEl || !btnSave || !btnCancel || !charCountEl) {
      log.warn('preset_modal: missing DOM elements, modal script was not initialized.');
      return;
    }

    const { AppConstants } = window;
    if (!AppConstants) {
      throw new Error('[preset_modal] AppConstants no disponible; verifica la carga de constants.js');
    }
    const { DEFAULT_LANG, PRESET_DESC_MAX, PRESET_NAME_MAX, WPM_MIN, WPM_MAX } = AppConstants;

    // Initial configuration
    const descMaxLength = PRESET_DESC_MAX;
    const nameMaxLength = PRESET_NAME_MAX;
    if (wpmEl) {
      wpmEl.min = String(WPM_MIN);
      wpmEl.max = String(WPM_MAX);
    }
    if (nameEl) nameEl.maxLength = nameMaxLength;
    if (descEl) descEl.maxLength = descMaxLength;

    let mode = 'new';
    let originalName = null;
    let idiomaActual = DEFAULT_LANG;
    let translationsLoadedFor = null;

    const { loadRendererTranslations, tRenderer, msgRenderer } = window.RendererI18n || {};
    if (!loadRendererTranslations || !tRenderer || !msgRenderer) {
      throw new Error('[preset_modal] RendererI18n no disponible; no se puede continuar');
    }
    const tr = (path, fallback) => tRenderer(path, fallback);
    const mr = (path, params = {}, fallback = '') => msgRenderer(path, params, fallback);

    async function ensurePresetTranslations(lang) {
      const target = (lang || '').toLowerCase() || DEFAULT_LANG;
      if (translationsLoadedFor === target) return;
      await loadRendererTranslations(target);
      translationsLoadedFor = target;
    }

    async function applyPresetTranslations(modeForHeading = mode) {
      await ensurePresetTranslations(idiomaActual);
      const isEdit = modeForHeading === 'edit';
      const headingKey = isEdit ? 'renderer.modal_preset.heading_edit' : 'renderer.modal_preset.heading_new';
      const titleKey = isEdit ? 'renderer.modal_preset.title_edit' : 'renderer.modal_preset.title_new';
      document.title = tr(titleKey, document.title);
      if (h3El) h3El.textContent = tr(headingKey, h3El.textContent || '');
      const labels = document.querySelectorAll('label');
      labels.forEach((lbl) => {
        const text = (lbl.textContent || '').trim();
        if (text.startsWith('Nombre') || text.startsWith('Name')) lbl.childNodes[0].textContent = tr('renderer.modal_preset.name', text);
        if (text.startsWith('WPM')) lbl.childNodes[0].textContent = tr('renderer.modal_preset.wpm', text);
        if (text.startsWith('Descripcion') || text.startsWith('Descripci') || text.startsWith('Description')) lbl.childNodes[0].textContent = tr('renderer.modal_preset.description', text);
      });
      if (nameEl && nameEl.placeholder) nameEl.placeholder = tr('renderer.modal_preset.placeholder', nameEl.placeholder);
      if (descEl && descEl.placeholder) descEl.placeholder = tr('renderer.modal_preset.placeholder', descEl.placeholder);
      if (charCountEl) charCountEl.textContent = mr('renderer.modal_preset.char_count', { remaining: descMaxLength }, charCountEl.textContent || '');
      if (hintEl) hintEl.textContent = tr('renderer.modal_preset.hint', hintEl.textContent || '');
      if (btnSave) btnSave.textContent = tr('renderer.modal_preset.save', btnSave.textContent || '');
      if (btnCancel) btnCancel.textContent = tr('renderer.modal_preset.cancel', btnCancel.textContent || '');
    }

    // Listens to init sent from main (preset-init)
    if (window.presetAPI && typeof window.presetAPI.onInit === 'function') {
      try {
        window.presetAPI.onInit(async (payload) => {
          try {
            if (!payload) return;
            try {
              if (window.presetAPI && typeof window.presetAPI.getSettings === 'function') {
                const settings = await window.presetAPI.getSettings();
                if (settings && settings.language) idiomaActual = settings.language || idiomaActual;
              }
            } catch (err) {
              log.warnOnce(
                'preset-modal.getSettings',
                '[preset_modal] presetAPI.getSettings failed:',
                err
              );
            }

            await ensurePresetTranslations(idiomaActual);
            const incomingMode = (payload.mode === 'edit') ? 'edit' : 'new';
            mode = incomingMode;

            if (incomingMode === 'edit' && payload.preset) {
              originalName = payload.preset.name;
              nameEl.value = payload.preset.name || '';
              descEl.value = payload.preset.description || '';
              if (typeof payload.preset.wpm === 'number') wpmEl.value = Math.round(payload.preset.wpm);
            } else {
              if (typeof payload.wpm === 'number') {
                wpmEl.value = Math.round(payload.wpm);
                if (!nameEl.value.trim()) nameEl.value = `${Math.round(payload.wpm)}wpm`;
              }
            }

            await applyPresetTranslations(mode);
            // Update char count initial
            const currLen = descEl.value ? descEl.value.length : 0;
            charCountEl.textContent = mr('renderer.modal_preset.char_count', { remaining: Math.max(0, descMaxLength - currLen) }, `${Math.max(0, descMaxLength - currLen)} caracteres restantes`);
          } catch (err) {
            log.error('Error applying preset-init data:', err);
          }
        });
      } catch (err) {
        log.error('Error setting up presetAPI.onInit listener:', err);
      }
    }

    if (window.presetAPI && typeof window.presetAPI.onSettingsChanged === 'function') {
      window.presetAPI.onSettingsChanged(async (settings) => {
        try {
          const nextLang = settings && settings.language ? settings.language : '';
          if (!nextLang || nextLang === idiomaActual) return;
          idiomaActual = nextLang;
          await applyPresetTranslations(mode);
        } catch (err) {
          log.warn('preset_modal: failed to apply settings update:', err);
        }
      });
    }

    // helper function to build preset from inputs (minimum validations)
    function buildPresetFromInputs() {
      const name = (nameEl.value || '').trim();
      const wpm = Number(wpmEl.value);
      const desc = (descEl.value || '').trim();

      if (!name) {
        if (window.Notify && typeof window.Notify.notifyMain === 'function') {
          window.Notify.notifyMain('renderer.preset_alerts.name_empty');
        } else {
          alert(tr('renderer.preset_alerts.name_empty'));
        }
        return null;
      }

      if (!Number.isFinite(wpm) || wpm < WPM_MIN || wpm > WPM_MAX) {
        Notify.notifyMain('renderer.preset_alerts.wpm_invalid');
        return null;
      }

      return { name, wpm: Math.round(wpm), description: desc };
    }

    // Listeners
    descEl.addEventListener('input', () => {
      const currentLength = descEl.value.length;
      const remaining = descMaxLength - currentLength;
      charCountEl.textContent = mr('renderer.modal_preset.char_count', { remaining }, `${remaining} caracteres restantes`);
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
              Notify.notifyMain('renderer.preset_alerts.edit_error');
              log.error('Error editing preset (response):', res);
            }
          }
        } else {
          if (window.presetAPI && typeof window.presetAPI.createPreset === 'function') {
            const res = await window.presetAPI.createPreset(preset);
            if (res && res.ok) {
              window.close();
            } else {
              Notify.notifyMain('renderer.preset_alerts.create_error');
              log.error('Error creating preset (response):', res);
            }
          }
        }
      } catch (err) {
        Notify.notifyMain('renderer.preset_alerts.process_error');
        log.error('Error in save preset:', err);
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

    // Initial: update character counter if text was already present
    (async function initCharCount() {
      const currLen = descEl.value ? descEl.value.length : 0;
      charCountEl.textContent = mr('renderer.modal_preset.char_count', { remaining: Math.max(0, descMaxLength - currLen) }, `${Math.max(0, descMaxLength - currLen)} caracteres restantes`);
    })();

  }); // DOMContentLoaded
})();
