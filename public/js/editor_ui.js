// public/js/editor_ui.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Editor UI module for the renderer editor page.
// Responsibilities:
// - Apply editor translations and keep document language attributes in sync.
// - Update local spellcheck, font size, and read-progress UI state.
// - Restore editor focus after UI actions that temporarily move it elsewhere.
// - Run the reading-test countdown overlay and its related UI state.
// - Persist editor text-size changes through the editor bridge when available.

(() => {
  // =============================================================================
  // Module Factory
  // =============================================================================

  function createEditorUI(ctx) {
    const { log, editorAPI, DEFAULT_LANG, dom, state } = ctx;
    const {
      editorWrap,
      editorLayout,
      editorLeftGutter,
      editorTextColumn,
      editorRightGutter,
      editor,
      btnTrash,
      calcWhileTyping,
      spellcheckToggle,
      btnCalc,
      calcLabel,
      spellcheckLabel,
      textSizeControls,
      textSizeLabel,
      btnTextSizeDecrease,
      btnTextSizeIncrease,
      btnTextSizeReset,
      textSizeValue,
      readProgress,
      readProgressLabel,
      readProgressValue,
      bottomBar,
      readingTestCountdownOverlay,
      readingTestCountdownReminder,
      readingTestCountdownValue,
    } = dom;

    const { loadRendererTranslations, tRenderer, msgRenderer } = ctx.rendererI18n || {};
    if (!loadRendererTranslations || !tRenderer || !msgRenderer) {
      throw new Error('[editor] RendererI18n unavailable; cannot continue');
    }

    const tr = (path) => tRenderer(path);
    const trMsg = (path, params) => msgRenderer(path, params);

    // =============================================================================
    // Translation And Document Helpers
    // =============================================================================

    function applyDocumentLanguage() {
      const langTag = (state.idiomaActual || DEFAULT_LANG).toLowerCase();
      if (document && document.documentElement) {
        document.documentElement.lang = langTag;
      }
      if (editor) {
        editor.setAttribute('lang', langTag);
      }
    }

    async function ensureEditorTranslations(lang) {
      const target = (lang || '').toLowerCase() || DEFAULT_LANG;
      if (state.translationsLoadedFor === target) return;
      await loadRendererTranslations(target);
      state.translationsLoadedFor = target;
    }

    async function applyEditorTranslations() {
      await ensureEditorTranslations(state.idiomaActual);
      applyDocumentLanguage();
      document.title = tr('renderer.editor.title');
      if (editor) editor.setAttribute('placeholder', tr('renderer.editor.placeholder'));
      if (btnCalc) {
        const calcText = tr('renderer.editor.calc_button');
        btnCalc.setAttribute('data-label', calcText);
        btnCalc.setAttribute('aria-label', calcText);
      }
      if (calcLabel) {
        const calcWhileTypingText = tr('renderer.editor.calc_while_typing');
        calcLabel.setAttribute('data-label', calcWhileTypingText);
        if (calcWhileTyping) calcWhileTyping.setAttribute('aria-label', calcWhileTypingText);
      }
      if (spellcheckLabel) {
        const spellcheckText = tr('renderer.editor.spellcheck');
        spellcheckLabel.setAttribute('data-label', spellcheckText);
        if (spellcheckToggle) spellcheckToggle.setAttribute('aria-label', spellcheckText);
      }
      if (textSizeControls) {
        const textSizeGroupText = tr('renderer.editor.text_size_label');
        textSizeControls.setAttribute('aria-label', textSizeGroupText);
        if (textSizeLabel) textSizeLabel.setAttribute('data-label', textSizeGroupText);
      }
      if (readProgress) {
        const readProgressText = tr('renderer.editor.read_progress_label');
        readProgress.setAttribute('aria-label', readProgressText);
        if (readProgressLabel) readProgressLabel.setAttribute('data-label', readProgressText);
      }
      if (readingTestCountdownReminder) {
        readingTestCountdownReminder.textContent = tr('renderer.reading_test.countdown.reminder');
      }
      if (btnTextSizeDecrease) {
        const decreaseText = tr('renderer.editor.decrease_text_size');
        btnTextSizeDecrease.setAttribute('aria-label', decreaseText);
        btnTextSizeDecrease.title = decreaseText;
      }
      if (btnTextSizeIncrease) {
        const increaseText = tr('renderer.editor.increase_text_size');
        btnTextSizeIncrease.setAttribute('aria-label', increaseText);
        btnTextSizeIncrease.title = increaseText;
      }
      if (btnTextSizeReset) {
        const resetText = tr('renderer.editor.reset_text_size');
        btnTextSizeReset.setAttribute('aria-label', resetText);
        btnTextSizeReset.title = resetText;
      }
      if (btnTrash) {
        const clearText = tr('renderer.editor.clear');
        btnTrash.setAttribute('data-label', clearText);
        btnTrash.setAttribute('aria-label', clearText);
        btnTrash.title = tr('renderer.editor.clear_title');
      }
      if (bottomBar) {
        bottomBar.setAttribute('aria-label', tr('renderer.editor.title'));
      }
      updateEditorTextSizeUi();
      updateReadProgressUi();
    }

    // =============================================================================
    // Local UI State Helpers
    // =============================================================================

    function setLocalSpellcheckEnabled(enabled) {
      state.spellcheckEnabled = enabled !== false;
      if (spellcheckToggle) spellcheckToggle.checked = state.spellcheckEnabled;
      if (editor) {
        editor.spellcheck = state.spellcheckEnabled;
        editor.setAttribute('spellcheck', state.spellcheckEnabled ? 'true' : 'false');
      }
    }

    function clampEditorFontSizePx(value) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return ctx.EDITOR_FONT_SIZE_DEFAULT_PX;
      const rounded = Math.round(parsed);
      return Math.min(
        ctx.EDITOR_FONT_SIZE_MAX_PX,
        Math.max(ctx.EDITOR_FONT_SIZE_MIN_PX, rounded)
      );
    }

    function setLocalEditorFontSizePx(value) {
      state.editorFontSizePx = clampEditorFontSizePx(value);
      if (document && document.documentElement) {
        document.documentElement.style.setProperty('--editor-font-size', `${state.editorFontSizePx}px`);
      }
      updateEditorTextSizeUi();
      scheduleReadProgressUiUpdate();
    }

    function clampEditorMaximizedTextWidthPx(value) {
      return ctx.editorMaximizedLayoutCore.clampPreferredTextWidthPx(value, {
        defaultPx: ctx.EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX,
        minPx: ctx.EDITOR_MAXIMIZED_TEXT_WIDTH_MIN_PX,
        maxPx: ctx.EDITOR_MAXIMIZED_TEXT_WIDTH_MAX_PX,
      });
    }

    function getEditorMaximizedLayoutStageWidthPx() {
      if (!editorLayout) return 0;
      const width = Math.round(Number(editorLayout.clientWidth));
      return Number.isFinite(width) && width > 0 ? width : 0;
    }

    function syncEditorMaximizedLayout() {
      const maximized = !!state.editorWindowMaximized;
      document.body.classList.toggle('editor-maximized-layout', maximized);
      if (document && document.documentElement) {
        document.documentElement.style.setProperty(
          '--editor-maximized-text-width',
          `${state.maximizedTextWidthPx}px`
        );
      }
      if (editorWrap) {
        editorWrap.setAttribute('data-maximized-layout', maximized ? 'true' : 'false');
      }
      scheduleReadProgressUiUpdate();
    }

    function setLocalEditorWindowMaximized(maximized) {
      state.editorWindowMaximized = !!maximized;
      syncEditorMaximizedLayout();
    }

    function setLocalEditorMaximizedTextWidthPx(value) {
      state.maximizedTextWidthPx = clampEditorMaximizedTextWidthPx(value);
      syncEditorMaximizedLayout();
    }

    function updateEditorTextSizeUi() {
      if (textSizeValue) {
        const valueText = trMsg(
          'renderer.editor.text_size_value',
          { value: state.editorFontSizePx }
        );
        textSizeValue.setAttribute('data-label', valueText);
        textSizeValue.setAttribute('aria-label', valueText);
      }
      if (btnTextSizeDecrease) btnTextSizeDecrease.disabled = state.editorFontSizePx <= ctx.EDITOR_FONT_SIZE_MIN_PX;
      if (btnTextSizeIncrease) btnTextSizeIncrease.disabled = state.editorFontSizePx >= ctx.EDITOR_FONT_SIZE_MAX_PX;
      if (btnTextSizeReset) btnTextSizeReset.disabled = state.editorFontSizePx === ctx.EDITOR_FONT_SIZE_DEFAULT_PX;
    }

    function clampPercentage(value) {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) return 0;
      return Math.max(0, Math.min(100, Math.round(numericValue)));
    }

    function computeReadProgressPercent() {
      if (!editor) return 0;

      const scrollHeight = Number(editor.scrollHeight);
      const clientHeight = Number(editor.clientHeight);
      if (!Number.isFinite(scrollHeight) || !Number.isFinite(clientHeight) || scrollHeight <= 0 || clientHeight <= 0) {
        return 0;
      }

      if (scrollHeight <= (clientHeight + 1)) {
        return 100;
      }

      const scrollTop = Math.max(0, Number.isFinite(Number(editor.scrollTop)) ? Number(editor.scrollTop) : 0);
      const visibleBottom = Math.min(scrollHeight, scrollTop + clientHeight);
      return clampPercentage((visibleBottom / scrollHeight) * 100);
    }

    function updateReadProgressUi() {
      if (!readProgressValue) return;

      const readProgressPercent = computeReadProgressPercent();
      const valueText = trMsg(
        'renderer.editor.read_progress_value',
        { value: readProgressPercent }
      );
      const ariaText = trMsg(
        'renderer.editor.read_progress_aria',
        { value: readProgressPercent }
      );

      readProgressValue.setAttribute('data-label', valueText);
      readProgressValue.setAttribute('aria-label', ariaText);
    }

    function scheduleReadProgressUiUpdate() {
      if (state.readProgressFramePending) return;

      if (typeof window.requestAnimationFrame !== 'function') {
        updateReadProgressUi();
        return;
      }

      state.readProgressFramePending = true;
      window.requestAnimationFrame(() => {
        state.readProgressFramePending = false;
        updateReadProgressUi();
      });
    }

    // =============================================================================
    // Focus And Countdown Helpers
    // =============================================================================

    function restoreFocusToEditor(pos = null) {
      try {
        setTimeout(() => {
          try {
            if (!editor) return;
            editor.focus();
            if (ctx.engine && typeof ctx.engine.setCaretSafe === 'function') {
              ctx.engine.setCaretSafe(pos);
            }
          } catch (err) {
            log.warnOnce('editor:restoreFocus:inner_catch', 'restoreFocusToEditor failed (ignored):', err);
          }
        }, 0);
      } catch (err) {
        log.warnOnce('editor:restoreFocus:outer_catch', 'restoreFocusToEditor wrapper failed (ignored):', err);
      }
    }

    function clearReadingTestCountdownTimeouts() {
      for (const timeoutId of state.readingTestCountdownTimeouts) {
        clearTimeout(timeoutId);
      }
      state.readingTestCountdownTimeouts = [];
    }

    function notifyReadingTestCountdownReady(token) {
      if (!token) return true;
      if (!editorAPI || typeof editorAPI.notifyReadingTestCountdownReady !== 'function') {
        log.warn(
          'editorAPI.notifyReadingTestCountdownReady missing; reading-test countdown disabled.'
        );
        return false;
      }

      try {
        editorAPI.notifyReadingTestCountdownReady({ token });
        return true;
      } catch (err) {
        log.warn(
          'Reading-test countdown ready ack failed; reading-test countdown disabled:',
          err
        );
        return false;
      }
    }

    function positionEditorAtTop() {
      if (!editor) return;

      try {
        if (ctx.engine && typeof ctx.engine.setSelectionSafe === 'function') {
          ctx.engine.setSelectionSafe(0, 0);
        }
      } catch (err) {
        log.warn('Failed to set editor selection to top (ignored):', err);
      }

      try {
        editor.scrollTop = 0;
        editor.scrollLeft = 0;
      } catch (err) {
        log.warn('Failed to scroll editor to top (ignored):', err);
      }

      scheduleReadProgressUiUpdate();
    }

    function setReadingTestCountdownVisible(visible) {
      if (!readingTestCountdownOverlay) return;
      document.body.classList.toggle('reading-test-countdown-active', !!visible);
      readingTestCountdownOverlay.setAttribute('aria-hidden', visible ? 'false' : 'true');

      if (visible) {
        positionEditorAtTop();
        try {
          readingTestCountdownOverlay.focus();
        } catch (err) {
          log.warn(
            'Reading-test countdown focus failed (ignored):',
            err
          );
        }
        return;
      }
      setTimeout(() => {
        positionEditorAtTop();
      }, 0);
    }

    function startReadingTestCountdown(payload = {}) {
      if (!readingTestCountdownOverlay || !readingTestCountdownValue) {
        log.warn(
          'Reading-test countdown DOM missing; overlay countdown skipped.'
        );
        return;
      }

      const secondsRaw = Number(payload.seconds);
      const stepMsRaw = Number(payload.stepMs);
      const seconds = Number.isFinite(secondsRaw) && secondsRaw >= 1
        ? Math.floor(secondsRaw)
        : 10;
      const stepMs = Number.isFinite(stepMsRaw) && stepMsRaw >= 250
        ? Math.floor(stepMsRaw)
        : 1000;
      const token = payload && typeof payload.token === 'string'
        ? payload.token
        : '';

      const runId = ++state.readingTestCountdownRunId;
      clearReadingTestCountdownTimeouts();

      readingTestCountdownValue.textContent = String(seconds);
      setReadingTestCountdownVisible(true);
      if (!notifyReadingTestCountdownReady(token)) {
        setReadingTestCountdownVisible(false);
        return;
      }

      for (let index = 1; index < seconds; index += 1) {
        const nextValue = seconds - index;
        state.readingTestCountdownTimeouts.push(setTimeout(() => {
          if (runId !== state.readingTestCountdownRunId) return;
          readingTestCountdownValue.textContent = String(nextValue);
        }, index * stepMs));
      }

      state.readingTestCountdownTimeouts.push(setTimeout(() => {
        if (runId !== state.readingTestCountdownRunId) return;
        clearReadingTestCountdownTimeouts();
        setReadingTestCountdownVisible(false);
      }, seconds * stepMs));
    }

    // =============================================================================
    // Persistence Helpers
    // =============================================================================

    function applyTextareaDefaults() {
      try {
        if (editor) {
          editor.wrap = 'soft';
          editor.style.whiteSpace = 'pre-wrap';
          editor.style.wordBreak = 'break-word';
        }
      } catch (err) {
        log.warn('Editor wrap styles failed (ignored):', err);
      }
    }

    async function persistEditorFontSizePx(nextFontSizePx) {
      const previousFontSizePx = state.editorFontSizePx;
      const normalizedNextFontSizePx = clampEditorFontSizePx(nextFontSizePx);

      if (!editorAPI || typeof editorAPI.setEditorFontSizePx !== 'function') {
        log.warn(
          'editorAPI.setEditorFontSizePx missing; editor text-size update ignored.'
        );
        return false;
      }

      if (normalizedNextFontSizePx === previousFontSizePx) {
        updateEditorTextSizeUi();
        return true;
      }

      setLocalEditorFontSizePx(normalizedNextFontSizePx);

      try {
        const result = await editorAPI.setEditorFontSizePx(normalizedNextFontSizePx);
        if (!result || result.ok !== true) {
          throw new Error(result && result.error ? String(result.error) : 'unknown');
        }
        return true;
      } catch (err) {
        log.error('Error updating editor font size setting:', err);
        setLocalEditorFontSizePx(previousFontSizePx);
        return false;
      }
    }

    async function persistEditorMaximizedTextWidthPx(nextTextWidthPx, options = {}) {
      const previousTextWidthPx = clampEditorMaximizedTextWidthPx(
        Object.prototype.hasOwnProperty.call(options, 'previousTextWidthPx')
          ? options.previousTextWidthPx
          : state.maximizedTextWidthPx
      );
      const normalizedNextTextWidthPx = clampEditorMaximizedTextWidthPx(nextTextWidthPx);
      const skipLocalApply = options && options.skipLocalApply === true;

      if (!editorAPI || typeof editorAPI.setMaximizedTextWidthPx !== 'function') {
        log.warn(
          'editorAPI.setMaximizedTextWidthPx missing; maximized editor width update ignored.'
        );
        return false;
      }

      if (normalizedNextTextWidthPx === previousTextWidthPx) {
        syncEditorMaximizedLayout();
        return true;
      }

      if (!skipLocalApply) {
        setLocalEditorMaximizedTextWidthPx(normalizedNextTextWidthPx);
      }

      try {
        const result = await editorAPI.setMaximizedTextWidthPx(normalizedNextTextWidthPx);
        if (!result || result.ok !== true) {
          throw new Error(result && result.error ? String(result.error) : 'unknown');
        }
        return true;
      } catch (err) {
        log.error('Error updating editor maximized text width setting:', err);
        setLocalEditorMaximizedTextWidthPx(previousTextWidthPx);
        return false;
      }
    }

    function decreaseEditorFontSize() {
      return persistEditorFontSizePx(state.editorFontSizePx - ctx.EDITOR_FONT_SIZE_STEP_PX);
    }

    function increaseEditorFontSize() {
      return persistEditorFontSizePx(state.editorFontSizePx + ctx.EDITOR_FONT_SIZE_STEP_PX);
    }

    function resetEditorFontSize() {
      return persistEditorFontSizePx(ctx.EDITOR_FONT_SIZE_DEFAULT_PX);
    }

    function endEditorMarginDrag({ persist = true } = {}) {
      if (!state.editorMarginDrag) return;

      const drag = state.editorMarginDrag;
      state.editorMarginDrag = null;
      document.body.classList.remove('editor-margin-dragging');

      if (typeof drag.cleanup === 'function') {
        drag.cleanup();
      }

      if (!persist) {
        setLocalEditorMaximizedTextWidthPx(drag.initialPreferredTextWidthPx);
        restoreFocusToEditor();
        return;
      }

      const nextTextWidthPx = state.maximizedTextWidthPx;
      void persistEditorMaximizedTextWidthPx(nextTextWidthPx, {
        previousTextWidthPx: drag.initialPreferredTextWidthPx,
        skipLocalApply: true,
      }).finally(() => {
        restoreFocusToEditor();
      });
    }

    function handleEditorMarginPointerDown(event, side) {
      if (!state.editorWindowMaximized || !editorTextColumn || !editorLayout) return;

      const pointerId = Number(event && event.pointerId);
      if (!Number.isFinite(pointerId)) return;

      if (state.editorMarginDrag) {
        endEditorMarginDrag({ persist: false });
      }

      event.preventDefault();

      const target = side === 'right' ? editorRightGutter : editorLeftGutter;
      const initialRenderedTextWidthPx =
        Math.round(Number(editorTextColumn.clientWidth)) || state.maximizedTextWidthPx;
      const initialPreferredTextWidthPx = state.maximizedTextWidthPx;
      const stageWidthPx = getEditorMaximizedLayoutStageWidthPx();
      const dragOptions = {
        stageWidthPx,
        minPx: ctx.EDITOR_MAXIMIZED_TEXT_WIDTH_MIN_PX,
        maxPx: ctx.EDITOR_MAXIMIZED_TEXT_WIDTH_MAX_PX,
        defaultPx: ctx.EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX,
        gutterMinPx: ctx.EDITOR_MAXIMIZED_GUTTER_MIN_PX,
      };

      document.body.classList.add('editor-margin-dragging');

      try {
        if (target && typeof target.setPointerCapture === 'function') {
          target.setPointerCapture(pointerId);
        }
      } catch (err) {
        log.warn('Editor gutter pointer capture failed (ignored):', err);
      }

      const onPointerMove = (moveEvent) => {
        if (!state.editorMarginDrag || moveEvent.pointerId !== pointerId) return;
        const nextTextWidthPx = ctx.editorMaximizedLayoutCore.computeNextPreferredTextWidthPxFromDrag(
          {
            initialTextWidthPx: initialRenderedTextWidthPx,
            pointerDeltaPx: moveEvent.clientX - state.editorMarginDrag.startClientX,
            side,
          },
          dragOptions
        );
        setLocalEditorMaximizedTextWidthPx(nextTextWidthPx);
      };

      const onPointerEnd = (endEvent) => {
        if (!state.editorMarginDrag || endEvent.pointerId !== pointerId) return;
        endEditorMarginDrag({ persist: endEvent.type !== 'pointercancel' });
      };

      const cleanup = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerEnd);
        window.removeEventListener('pointercancel', onPointerEnd);
        try {
          if (
            target
            && typeof target.releasePointerCapture === 'function'
            && typeof target.hasPointerCapture === 'function'
            && target.hasPointerCapture(pointerId)
          ) {
            target.releasePointerCapture(pointerId);
          }
        } catch {}
      };

      state.editorMarginDrag = {
        pointerId,
        startClientX: Number(event.clientX) || 0,
        initialPreferredTextWidthPx,
        cleanup,
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerEnd);
      window.addEventListener('pointercancel', onPointerEnd);
    }

    function resetEditorMaximizedTextWidth() {
      return persistEditorMaximizedTextWidthPx(ctx.EDITOR_MAXIMIZED_TEXT_WIDTH_DEFAULT_PX);
    }

    // =============================================================================
    // Module Surface
    // =============================================================================

    return {
      applyDocumentLanguage,
      setLocalSpellcheckEnabled,
      clampEditorFontSizePx,
      clampEditorMaximizedTextWidthPx,
      updateEditorTextSizeUi,
      updateReadProgressUi,
      scheduleReadProgressUiUpdate,
      setLocalEditorFontSizePx,
      syncEditorMaximizedLayout,
      setLocalEditorWindowMaximized,
      setLocalEditorMaximizedTextWidthPx,
      ensureEditorTranslations,
      applyEditorTranslations,
      restoreFocusToEditor,
      startReadingTestCountdown,
      applyTextareaDefaults,
      persistEditorFontSizePx,
      decreaseEditorFontSize,
      increaseEditorFontSize,
      resetEditorFontSize,
      persistEditorMaximizedTextWidthPx,
      handleEditorMarginPointerDown,
      resetEditorMaximizedTextWidth,
    };
  }

  // =============================================================================
  // Exports
  // =============================================================================

  window.EditorUI = { createEditorUI };
})();

// =============================================================================
// End of public/js/editor_ui.js
// =============================================================================
