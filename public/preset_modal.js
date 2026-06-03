// public/preset_modal.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Renderer script for the preset modal.
// Responsibilities:
// - Bind DOM elements and enforce input limits.
// - Load and apply renderer translations for this modal.
// - React to preset-init and settings updates from presetAPI.
// - Validate inputs and trigger create/edit actions.
// - Keep UI hints and counters in sync.

(function () {

  // =============================================================================
  // Logger + bootstrap
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[preset_modal] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('preset-modal');

  log.debug('Preset modal starting...');

  document.addEventListener('DOMContentLoaded', function () {
    // =============================================================================
    // DOM references + required guards
    // =============================================================================
    const h3El = document.querySelector('h3');
    const nameEl = document.getElementById('presetName');
    const wpmEl = document.getElementById('presetWpm');
    const descEl = document.getElementById('presetDesc');
    const btnSave = document.getElementById('btnSave');
    const btnCancel = document.getElementById('btnCancel');
    const charCountEl = document.getElementById('charCount');
    const hintEl = document.querySelector('.hint');

    if (!nameEl || !wpmEl || !descEl || !btnSave || !btnCancel || !charCountEl) {
      log.warn('Preset modal initialization skipped: required DOM elements missing.');
      return;
    }

    // =============================================================================
    // Constants / limits
    // =============================================================================
    const { AppConstants } = window;
    if (!AppConstants) {
      throw new Error('[preset_modal] AppConstants unavailable; verify constants.js load order');
    }
    const { DEFAULT_LANG, PRESET_DESC_MAX, PRESET_NAME_MAX, WPM_MIN, WPM_MAX } = AppConstants;

    const descMaxLength = PRESET_DESC_MAX;
    const nameMaxLength = PRESET_NAME_MAX;
    if (wpmEl) {
      wpmEl.min = String(WPM_MIN);
      wpmEl.max = String(WPM_MAX);
    }
    if (nameEl) nameEl.maxLength = nameMaxLength;
    if (descEl) descEl.maxLength = descMaxLength;

    // =============================================================================
    // Local state
    // =============================================================================
    let mode = 'new';
    let originalName = null;
    let idiomaActual = DEFAULT_LANG;
    let translationsLoadedFor = null;

    // =============================================================================
    // i18n helpers
    // =============================================================================
    const {
      loadRendererTranslations,
      tRenderer,
      msgRenderer,
      applyWindowLanguageAttributes,
      resolveUserTextDirection,
    } = window.RendererI18n || {};
    if (!loadRendererTranslations || !tRenderer || !msgRenderer || !applyWindowLanguageAttributes || !resolveUserTextDirection) {
      throw new Error('[preset_modal] RendererI18n unavailable; cannot continue');
    }
    const tr = (path) => tRenderer(path);
    const mr = (path, params = {}) => msgRenderer(path, params);

    function updateCharCount() {
      const currentLength = descEl.value ? descEl.value.length : 0;
      const remaining = Math.max(0, descMaxLength - currentLength);
      charCountEl.textContent = mr('renderer.presets.preset_modal.char_count', { remaining });
    }

    function updatePresetDescriptionDirection() {
      const direction = resolveUserTextDirection(descEl.value || '');
      descEl.setAttribute('dir', direction);
      return direction;
    }

    async function ensurePresetTranslations(lang) {
      const target = (lang || '').toLowerCase() || DEFAULT_LANG;
      if (translationsLoadedFor === target) return;
      applyWindowLanguageAttributes(target);
      await loadRendererTranslations(target);
      translationsLoadedFor = target;
    }

    async function applyPresetTranslations(modeForHeading = mode) {
      await ensurePresetTranslations(idiomaActual);
      const isEdit = modeForHeading === 'edit';
      const headingKey = isEdit ? 'renderer.presets.preset_modal.heading_edit' : 'renderer.presets.preset_modal.heading_new';
      const titleKey = isEdit ? 'renderer.presets.preset_modal.title_edit' : 'renderer.presets.preset_modal.title_new';
      document.title = tr(titleKey);
      if (h3El) h3El.textContent = tr(headingKey);
      const labels = document.querySelectorAll('label');
      labels.forEach((lbl) => {
        const text = (lbl.textContent || '').trim();
        if (text.startsWith('Nombre') || text.startsWith('Name')) lbl.childNodes[0].textContent = tr('renderer.presets.preset_modal.name');
        if (text.startsWith('WPM')) lbl.childNodes[0].textContent = tr('renderer.presets.preset_modal.wpm');
        if (text.startsWith('Descripcion') || text.startsWith('Descripci') || text.startsWith('Description')) lbl.childNodes[0].textContent = tr('renderer.presets.preset_modal.description');
      });
      if (nameEl && nameEl.placeholder) nameEl.placeholder = tr('renderer.presets.preset_modal.name_placeholder');
      if (descEl && descEl.placeholder) descEl.placeholder = tr('renderer.presets.preset_modal.description_placeholder');
      if (charCountEl) charCountEl.textContent = mr('renderer.presets.preset_modal.char_count', { remaining: descMaxLength });
      if (hintEl) hintEl.textContent = tr('renderer.presets.preset_modal.hint');
      if (btnSave) btnSave.textContent = tr('renderer.presets.preset_modal.save');
      if (btnCancel) btnCancel.textContent = tr('renderer.presets.preset_modal.cancel');
    }

    function applyIncomingPresetPayload(payload) {
      if (!payload) return;

      const incomingMode = (payload.mode === 'edit') ? 'edit' : 'new';

      if (incomingMode === 'edit' && payload.preset) {
        mode = 'edit';
        originalName = payload.preset.name;
        nameEl.value = payload.preset.name || '';
        descEl.value = payload.preset.description || '';
        if (typeof payload.preset.wpm === 'number') wpmEl.value = Math.round(payload.preset.wpm);
        return;
      }

      if (incomingMode === 'edit') {
        mode = 'new';
        log.warn('BOOTSTRAP: preset-init edit payload missing preset; falling back to new mode.');
      } else {
        mode = 'new';
      }

      if (typeof payload.wpm === 'number') {
        wpmEl.value = Math.round(payload.wpm);
        if (!nameEl.value.trim()) nameEl.value = `${Math.round(payload.wpm)}wpm`;
      }
    }

    async function savePreset(preset) {
      if (mode === 'edit') {
        if (window.presetAPI && typeof window.presetAPI.editPreset === 'function') {
          const res = await window.presetAPI.editPreset(originalName, preset);
          if (res && res.ok) {
            window.close();
            return;
          }
          if (res && res.code === 'CANCELLED') return;
          window.Notify.notifyMain('renderer.presets.alerts.edit_error');
          log.error('Preset modal editPreset response failed:', res);
          return;
        }

        window.Notify.notifyMain('renderer.presets.alerts.process_error');
        log.error('presetAPI.editPreset missing.');
        return;
      }

      if (window.presetAPI && typeof window.presetAPI.createPreset === 'function') {
        const res = await window.presetAPI.createPreset(preset);
        if (res && res.ok) {
          window.close();
          return;
        }
        window.Notify.notifyMain('renderer.presets.alerts.create_error');
        log.error('Preset modal createPreset response failed:', res);
        return;
      }

      window.Notify.notifyMain('renderer.presets.alerts.process_error');
      log.error('presetAPI.createPreset missing.');
    }

    // =============================================================================
    // presetAPI wiring (init + settings)
    // =============================================================================
    if (window.presetAPI && typeof window.presetAPI.onInit === 'function') {
      try {
        window.presetAPI.onInit(async (payload) => {
          try {
            if (!payload) return;
            try {
              if (window.presetAPI && typeof window.presetAPI.getSettings === 'function') {
                const settings = await window.presetAPI.getSettings();
                if (settings && settings.language) idiomaActual = settings.language || idiomaActual;
              } else {
                log.warn('BOOTSTRAP: presetAPI.getSettings missing; using default language.');
              }
            } catch (err) {
              log.warn('BOOTSTRAP: presetAPI.getSettings failed; using default language:', err);
            }

            await ensurePresetTranslations(idiomaActual);
            applyIncomingPresetPayload(payload);
            await applyPresetTranslations(mode);
            updatePresetDescriptionDirection();
            updateCharCount();
          } catch (err) {
            log.error('Preset modal preset-init handling failed:', err);
          }
        });
      } catch (err) {
        log.error('BOOTSTRAP: presetAPI.onInit listener setup failed:', err);
      }
    } else {
      log.warn('BOOTSTRAP: presetAPI.onInit missing; modal will not receive init data.');
    }

    if (window.presetAPI && typeof window.presetAPI.onSettingsChanged === 'function') {
      try {
        window.presetAPI.onSettingsChanged(async (settings) => {
          try {
            const nextLang = settings && settings.language ? settings.language : '';
            if (!nextLang || nextLang === idiomaActual) return;
            idiomaActual = nextLang;
            await applyPresetTranslations(mode);
            updatePresetDescriptionDirection();
          } catch (err) {
            log.warn('Preset modal settings update failed:', err);
          }
        });
      } catch (err) {
        log.warn('BOOTSTRAP: presetAPI.onSettingsChanged listener setup failed; language updates disabled:', err);
      }
    } else {
      log.warn('BOOTSTRAP: presetAPI.onSettingsChanged missing; language updates disabled.');
    }

    // =============================================================================
    // Input validation / preset builder
    // =============================================================================
    function buildPresetFromInputs() {
      const name = (nameEl.value || '').trim();
      const wpm = Number(wpmEl.value);
      const desc = (descEl.value || '').trim();

      if (!name) {
        window.Notify.notifyMain('renderer.presets.alerts.name_empty');
        return null;
      }

      if (!Number.isFinite(wpm) || wpm < WPM_MIN || wpm > WPM_MAX) {
        window.Notify.notifyMain('renderer.presets.alerts.wpm_invalid', {
          min: WPM_MIN,
          max: WPM_MAX
        });
        return null;
      }

      return { name, wpm: Math.round(wpm), description: desc };
    }

    // =============================================================================
    // UI event listeners
    // =============================================================================
    descEl.addEventListener('input', () => {
      if (descEl.value.length > descMaxLength) {
        descEl.value = descEl.value.substring(0, descMaxLength);
      }
      updatePresetDescriptionDirection();
      updateCharCount();
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
        await savePreset(preset);
      } catch (err) {
        window.Notify.notifyMain('renderer.presets.alerts.process_error');
        log.error('Preset modal save action failed:', err);
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

    // =============================================================================
    // Initial UI sync
    // =============================================================================
    (async function initCharCount() {
      updateCharCount();
      updatePresetDescriptionDirection();
    })();

  }); // DOMContentLoaded
})();

// =============================================================================
// End of public/preset_modal.js
// =============================================================================
