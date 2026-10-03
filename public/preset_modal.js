// public/preset_modal.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Validate required modal DOM and shared renderer surfaces before continuing.
// - Apply preset-init payloads and live settings updates from presetAPI.
// - Load renderer translations and keep text direction and UI copy in sync.
// - Validate preset inputs before create/edit actions are sent to main.
// - Keep modal field constraints, hints, and counters synchronized locally.

(function () {

  // =============================================================================
  // Logger
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[preset_modal] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('preset-modal');

  log.debug('Preset modal starting...');

  const presetApi = window.presetAPI;
  if (!presetApi
    || typeof presetApi.onInit !== 'function'
    || typeof presetApi.createPreset !== 'function'
    || typeof presetApi.editPreset !== 'function') {
    log.error('BOOTSTRAP: required presetAPI methods unavailable; closing modal.');
    if (typeof window.close === 'function') window.close();
    return;
  }

  document.addEventListener('DOMContentLoaded', function () {
    // =============================================================================
    // DOM references + required guards
    // =============================================================================
    const headingEl = document.getElementById('presetHeading');
    const nameEl = document.getElementById('presetName');
    const wpmEl = document.getElementById('presetWpm');
    const descEl = document.getElementById('presetDesc');
    const btnSave = document.getElementById('btnSave');
    const btnCancel = document.getElementById('btnCancel');
    const charCountEl = document.getElementById('charCount');
    const hintEl = document.querySelector('.hint');

    if (!headingEl || !nameEl || !wpmEl || !descEl || !btnSave || !btnCancel || !charCountEl) {
      log.error('BOOTSTRAP: required preset modal DOM unavailable; initialization cannot continue.');
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
    wpmEl.min = String(WPM_MIN);
    wpmEl.max = String(WPM_MAX);
    nameEl.maxLength = nameMaxLength;
    descEl.maxLength = descMaxLength;

    // =============================================================================
    // Local state
    // =============================================================================
    let mode = 'new';
    let originalName = null;
    let idiomaActual = DEFAULT_LANG;
    let presetTranslationsEstablished = false;
    let presetInitialPayloadPresentationEstablished = false;
    let presetInitializationAborted = false;
    let presetI18nTerminal = false;
    let presetSemanticQueue = Promise.resolve();

    // =============================================================================
    // Helpers
    // =============================================================================
    const {
      transitionRendererTranslations,
      tRenderer,
      msgRenderer,
      normalizeLangTag,
      resolveUserTextDirection,
    } = window.RendererI18n || {};
    if (!transitionRendererTranslations || !tRenderer || !msgRenderer || !normalizeLangTag || !resolveUserTextDirection) {
      reportTerminalPresetI18nFailure('startup-api');
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

    function setPresetFormInteractionLocked(locked) {
      [nameEl, wpmEl, descEl, btnSave].forEach((element) => {
        element.disabled = locked === true;
      });
    }

    function establishInitialPresetPayloadPresentation() {
      if (presetInitialPayloadPresentationEstablished) return;
      presetInitialPayloadPresentationEstablished = true;
      setPresetFormInteractionLocked(false);
    }

    async function applyPresetTranslations(modeForHeading = mode) {
      const isEdit = modeForHeading === 'edit';
      const headingKey = isEdit ? 'renderer.presets.preset_modal.heading_edit' : 'renderer.presets.preset_modal.heading_new';
      const titleKey = isEdit ? 'renderer.presets.preset_modal.title_edit' : 'renderer.presets.preset_modal.title_new';
      document.title = tr(titleKey);
      headingEl.textContent = tr(headingKey);
      const nameLabel = document.getElementById('presetNameLabel');
      const wpmLabel = document.getElementById('presetWpmLabel');
      const descriptionLabel = document.getElementById('presetDescriptionLabel');
      if (nameLabel && nameLabel.firstChild) nameLabel.firstChild.textContent = tr('renderer.presets.preset_modal.name');
      if (wpmLabel && wpmLabel.firstChild) wpmLabel.firstChild.textContent = tr('renderer.presets.preset_modal.wpm');
      if (descriptionLabel && descriptionLabel.firstChild) descriptionLabel.firstChild.textContent = tr('renderer.presets.preset_modal.description');
      if (nameEl && nameEl.placeholder) nameEl.placeholder = tr('renderer.presets.preset_modal.name_placeholder');
      if (descEl && descEl.placeholder) descEl.placeholder = tr('renderer.presets.preset_modal.description_placeholder');
      if (charCountEl) charCountEl.textContent = mr('renderer.presets.preset_modal.char_count', { remaining: descMaxLength });
      if (hintEl) hintEl.textContent = tr('renderer.presets.preset_modal.hint');
      if (btnSave) btnSave.textContent = tr('renderer.presets.preset_modal.save');
      if (btnCancel) btnCancel.textContent = tr('renderer.presets.preset_modal.cancel');
    }

    async function applyPresetLanguagePresentation() {
      await applyPresetTranslations(mode);
      updatePresetDescriptionDirection();
      updateCharCount();
    }

    async function transitionPresetTranslations(language) {
      await transitionRendererTranslations(language || DEFAULT_LANG, {
        applyTranslations: async ({ language: appliedLanguage }) => {
          idiomaActual = appliedLanguage;
          await applyPresetLanguagePresentation();
        },
      });
      presetTranslationsEstablished = true;
    }

    function enqueuePresetSemanticWork(work) {
      const run = async () => {
        // Main-process closure is asynchronous. Do not admit queued semantic
        // work after terminal i18n failure or aborted initialization.
        if (presetI18nTerminal || presetInitializationAborted) return;
        return work();
      };
      presetSemanticQueue = presetSemanticQueue.then(run, run);
      return presetSemanticQueue;
    }

    async function getPresetSettingsLanguage() {
      if (typeof presetApi.getSettings !== 'function') {
        log.warn('presetAPI.getSettings missing; using default language.');
        return DEFAULT_LANG;
      }
      try {
        const settings = await presetApi.getSettings();
        return settings && settings.language ? settings.language : DEFAULT_LANG;
      } catch (err) {
        log.warn('presetAPI.getSettings failed; using default language:', err);
        return DEFAULT_LANG;
      }
    }

    function getEffectivePresetLanguage(language) {
      return normalizeLangTag(language) || DEFAULT_LANG;
    }

    async function applyPresetTranslationUpdate(language) {
      try {
        await transitionPresetTranslations(language);
        return true;
      } catch (err) {
        if (err && err.rendererI18nTransition) {
          reportPresetI18nFailure(err, {
            startup: !presetTranslationsEstablished,
          });
        } else {
          log.error('Preset modal semantic update failed:', err);
        }
        return false;
      }
    }

    function reportPresetI18nFailure(err, { startup = false } = {}) {
      const transition = err && err.rendererI18nTransition;
      if (!transition) {
        return;
      }
      if (!startup && transition && transition.hadEstablishedState && !transition.restorationFailed) {
        log.error('Preset modal language transition failed; previous translation state remains authoritative:', err);
        return;
      }
      log.error('Preset modal i18n failure requires window closure:', err);
      reportTerminalPresetI18nFailure(startup ? 'startup' : 'transition-restoration');
    }

    function reportTerminalPresetI18nFailure(kind) {
      if (presetI18nTerminal) return;
      presetI18nTerminal = true;
      setPresetFormInteractionLocked(true);
      if (typeof presetApi.reportRendererI18nFailure !== 'function') {
        log.warn('presetAPI.reportRendererI18nFailure unavailable (ignored); closing failed renderer locally.');
        if (typeof window.close === 'function') window.close();
        return;
      }
      try {
        presetApi.reportRendererI18nFailure({ kind });
      } catch (reportErr) {
        log.warn('presetAPI.reportRendererI18nFailure failed (ignored); closing failed renderer locally:', reportErr);
        if (typeof window.close === 'function') window.close();
      }
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
        log.warn('preset-init edit payload missing preset; falling back to new mode.');
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
        const res = await presetApi.editPreset(originalName, preset);
        if (res && res.ok) {
          window.close();
          return;
        }
        if (res && res.code === 'CANCELLED') return;
        window.Notify.notifyMain('renderer.presets.alerts.edit_error');
        log.error('Preset modal editPreset response failed:', res);
        return;
      }

      const res = await presetApi.createPreset(preset);
      if (res && res.ok) {
        window.close();
        return;
      }
      window.Notify.notifyMain('renderer.presets.alerts.create_error');
      log.error('Preset modal createPreset response failed:', res);
    }

    // Bootstrap HTML is only a temporary visual shell. Do not admit form
    // mutation or persistence until an authoritative preset payload has been
    // rendered through successfully established renderer translations.
    setPresetFormInteractionLocked(true);

    function registerPresetSettingsChanged() {
      if (typeof presetApi.onSettingsChanged !== 'function') {
        log.error('BOOTSTRAP: presetAPI.onSettingsChanged unavailable; closing modal before normal interaction.');
        reportTerminalPresetI18nFailure('settings-listener');
        return false;
      }
      try {
        presetApi.onSettingsChanged((settings) => {
          if (presetI18nTerminal) return;
          enqueuePresetSemanticWork(async () => {
            const nextLang = normalizeLangTag(settings && settings.language ? settings.language : '');
            if (!nextLang || nextLang === idiomaActual) return;
            await applyPresetTranslationUpdate(nextLang);
          });
        });
        return true;
      } catch (err) {
        log.error('BOOTSTRAP: presetAPI.onSettingsChanged registration failed; closing modal before normal interaction:', err);
        reportTerminalPresetI18nFailure('settings-listener');
        return false;
      }
    }

    function registerPresetInit() {
      try {
        presetApi.onInit((payload) => {
          if (presetI18nTerminal || presetInitializationAborted) return;
          if (!payload) {
            if (!presetInitialPayloadPresentationEstablished) {
              presetInitializationAborted = true;
              setPresetFormInteractionLocked(true);
              log.error('BOOTSTRAP: invalid preset-init payload; closing modal before initial presentation.');
              if (typeof window.close === 'function') window.close();
              return;
            }
            log.warn('Invalid preset-init payload ignored; preserving established modal presentation.');
            return;
          }
          enqueuePresetSemanticWork(async () => {
            applyIncomingPresetPayload(payload);
            if (presetTranslationsEstablished) {
              try {
                await applyPresetLanguagePresentation();
                if (presetI18nTerminal || presetInitializationAborted) return;
                establishInitialPresetPayloadPresentation();
              } catch (err) {
                log.error('Preset modal required language presentation failed:', err);
                reportTerminalPresetI18nFailure('semantic-application');
                return;
              }
            }
            const language = getEffectivePresetLanguage(await getPresetSettingsLanguage());
            if (presetI18nTerminal || presetInitializationAborted) return;
            if (!presetTranslationsEstablished || language !== idiomaActual) {
              if (!await applyPresetTranslationUpdate(language)) {
                return;
              }
            }
            if (presetI18nTerminal || presetInitializationAborted) return;
            establishInitialPresetPayloadPresentation();
            btnSave.focus({ preventScroll: true });
          });
        });
        return true;
      } catch (err) {
        log.error('BOOTSTRAP: presetAPI.onInit listener setup failed; closing modal before normal interaction:', err);
        if (typeof window.close === 'function') window.close();
        return false;
      }
    }

    if (!registerPresetInit()) return;
    if (!registerPresetSettingsChanged()) return;

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
      if (presetI18nTerminal) return;
      if (descEl.value.length > descMaxLength) {
        descEl.value = descEl.value.substring(0, descMaxLength);
      }
      updatePresetDescriptionDirection();
      updateCharCount();
    });

    nameEl.addEventListener('input', () => {
      if (presetI18nTerminal) return;
      if (nameEl.value.length >= nameMaxLength) {
        nameEl.value = nameEl.value.substring(0, nameMaxLength);
      }
    });

    btnSave.addEventListener('click', async () => {
      if (presetI18nTerminal) return;
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
      if (presetI18nTerminal) return;
      if (!nameEl.value.trim()) {
        const val = Number(wpmEl.value);
        if (Number.isFinite(val) && val > 0) {
          nameEl.value = `${val}wpm`;
        }
      }
    });

  }); // DOMContentLoaded
})();

// =============================================================================
// End of public/preset_modal.js
// =============================================================================
