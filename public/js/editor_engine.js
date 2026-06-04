// public/js/editor_engine.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Text Editor engine module for the renderer editor page.
// Responsibilities:
// - Read and update selection state used by typing, paste, drop, and replace flows.
// - Apply native-first insert and replace operations with local fallbacks.
// - Build replace responses for main-driven requests.
// - Synchronize Text Editor text back to main and surface truncation feedback.
// - Reconcile external text updates without echoing editor-originated changes back to main.

(() => {
  if (typeof window.getLogger !== 'function') {
    throw new Error('[editor-engine] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('editor-engine');

  // =============================================================================
  // Module Factory
  // =============================================================================

  function createEditorEngine(ctx) {
    const { editorAPI, editorFindReplaceCore, dom, state } = ctx;
    const { editor, calcWhileTyping } = dom;

    // =============================================================================
    // Selection And Native Edit Helpers
    // =============================================================================

    function getSelectionRange() {
      const start = typeof editor.selectionStart === 'number' ? editor.selectionStart : editor.value.length;
      const end = typeof editor.selectionEnd === 'number' ? editor.selectionEnd : start;
      return { start, end };
    }

    function getInsertionCapacity() {
      const { start, end } = getSelectionRange();
      const selectedLength = Math.max(0, end - start);
      return state.maxTextChars - (editor.value.length - selectedLength);
    }

    function getBeforeInputIncomingLength(ev) {
      const inputType = (ev && typeof ev.inputType === 'string') ? ev.inputType : '';
      if (ev && typeof ev.data === 'string') {
        return ev.data.length;
      }
      if (inputType === 'insertLineBreak' || inputType === 'insertParagraph') {
        return 1;
      }
      return null;
    }

    function setSelectionSafe(start, end) {
      if (typeof editor.setSelectionRange === 'function') editor.setSelectionRange(start, end);
    }

    function setCaretSafe(pos) {
      if (typeof pos === 'number' && !Number.isNaN(pos)) {
        setSelectionSafe(pos, pos);
      }
    }

    function selectAllEditor() {
      if (typeof editor.select === 'function') {
        try { editor.select(); }
        catch (err) { log.warnOnce('editor.select', 'editor.select() failed (ignored):', err); }
        return;
      }
      setSelectionSafe(0, editor.value.length);
    }

    function dispatchNativeInputEvent() {
      try {
        const ev = new Event('input', { bubbles: true });
        editor.dispatchEvent(ev);
      } catch (err) {
        log.error('dispatchNativeInputEvent error:', err);
      }
    }

    function restorePreviousActiveElement(prevActive, warnKey) {
      try {
        if (prevActive && prevActive !== editor) prevActive.focus();
      } catch (err) {
        log.warnOnce(warnKey, 'prevActive.focus() failed (ignored):', err);
      }
    }

    function replaceEditorValueHidden(nextValue) {
      try {
        editor.style.visibility = 'hidden';
        editor.value = nextValue;
        dispatchNativeInputEvent();
      } catch (err) {
        log.warnOnce(
          'editor.replaceHidden.visibility',
          'replaceEditorValueHidden visibility update failed; using direct update fallback:',
          err
        );
        editor.value = nextValue;
        dispatchNativeInputEvent();
      } finally {
        editor.style.visibility = '';
      }
    }

    function withLocalUpdateSuppressed(work) {
      const previousSuppressLocalUpdate = state.suppressLocalUpdate;
      state.suppressLocalUpdate = true;
      try {
        return work();
      } finally {
        state.suppressLocalUpdate = previousSuppressLocalUpdate;
      }
    }

    function tryNativeReplaceWholeValueSelection(nextValue) {
      let execOk = false;

      try {
        execOk = !!(document.execCommand && document.execCommand('insertText', false, nextValue));
      } catch {
        execOk = false;
      }

      if (execOk) {
        return true;
      }

      log.warnOnce(
        'editor.execCommand.replaceWholeValue',
        "document.execCommand('insertText') unavailable or failed; using whole-value replace fallback."
      );

      if (typeof editor.setRangeText === 'function') {
        editor.setRangeText(nextValue, 0, editor.value.length, 'end');
        dispatchNativeInputEvent();
        return true;
      }

      log.warnOnce(
        'editor.setRangeText.replaceWholeValue',
        'editor.setRangeText unavailable; using direct value replace fallback.'
      );

      return false;
    }

    function tryNativeInsertAtSelection(text) {
      try {
        const { start, end } = getSelectionRange();

        try {
          const ok = document.execCommand && document.execCommand('insertText', false, text);
          if (ok) return true;
        } catch {
          // follow fallback
        }

        log.warnOnce(
          'editor.execCommand.insert',
          "document.execCommand('insertText') unavailable or failed; using Text Editor insert fallback."
        );

        if (typeof editor.setRangeText === 'function') {
          editor.setRangeText(text, start, end, 'end');
          const newCaret = start + text.length;
          setCaretSafe(newCaret);
          dispatchNativeInputEvent();
          return true;
        }

        log.warnOnce(
          'editor.setRangeText.insert',
          'editor.setRangeText unavailable; using value splice insert fallback.'
        );

        const before = editor.value.slice(0, start);
        const after = editor.value.slice(end);
        editor.value = before + text + after;
        const newCaret = before.length + text.length;
        setCaretSafe(newCaret);
        dispatchNativeInputEvent();
        return true;
      } catch (err) {
        log.error('tryNativeInsertAtSelection error:', err);
        return false;
      }
    }

    function tryNativeReplaceSelectionWithoutSync(start, end, replacementText) {
      const previousActiveElement = document.activeElement;

      try {
        editor.focus();
        setSelectionSafe(start, end);

        try {
          const ok = document.execCommand && document.execCommand('insertText', false, replacementText);
          if (ok) return true;
        } catch {
          // follow fallback
        }

        log.warnOnce(
          'editor.execCommand.replaceCurrent',
          "document.execCommand('insertText') unavailable or failed; using replace-current fallback."
        );

        if (typeof editor.setRangeText === 'function') {
          editor.setRangeText(replacementText, start, end, 'end');
          dispatchNativeInputEvent();
          return true;
        }

        log.warnOnce(
          'editor.setRangeText.replaceCurrent',
          'editor.setRangeText unavailable; using manual replace-current fallback.'
        );

        const before = editor.value.slice(0, start);
        const after = editor.value.slice(end);
        editor.value = before + replacementText + after;
        const newCaret = before.length + replacementText.length;
        setCaretSafe(newCaret);
        dispatchNativeInputEvent();
        return true;
      } catch (err) {
        log.error('tryNativeReplaceSelectionWithoutSync error:', err);
        return false;
      } finally {
        restorePreviousActiveElement(previousActiveElement, 'focus.prevActive.replaceCurrent.selection');
      }
    }

    function commitWholeValueNativeFirstWithoutSync(nextValue, { focusWarnKey = 'focus.prevActive.wholeValue.native' } = {}) {
      const safeNextValue = String(nextValue || '');
      const previousActiveElement = document.activeElement;

      try {
        editor.focus();
        selectAllEditor();
        if (!tryNativeReplaceWholeValueSelection(safeNextValue)) {
          editor.value = safeNextValue;
          dispatchNativeInputEvent();
        }
        return true;
      } catch (err) {
        log.warn(
          'Native whole-value replace failed; using direct update fallback:',
          err
        );
        try {
          editor.value = safeNextValue;
          dispatchNativeInputEvent();
          return true;
        } catch (fallbackErr) {
          log.error('commitWholeValueNativeFirstWithoutSync error:', fallbackErr);
          return false;
        }
      } finally {
        restorePreviousActiveElement(previousActiveElement, focusWarnKey);
      }
    }

    function commitWholeValueWithThresholdPolicy(
      nextValue,
      {
        nativeFocusWarnKey = 'focus.prevActive.wholeValue.native',
        directFocusWarnKey = 'focus.prevActive.wholeValue.full',
      } = {}
    ) {
      const safeNextValue = String(nextValue || '');

      if (safeNextValue.length <= ctx.SMALL_UPDATE_THRESHOLD) {
        return commitWholeValueNativeFirstWithoutSync(safeNextValue, {
          focusWarnKey: nativeFocusWarnKey,
        });
      }

      const previousActiveElement = document.activeElement;
      try {
        replaceEditorValueHidden(safeNextValue);
        return true;
      } catch (err) {
        log.error('commitWholeValueWithThresholdPolicy error:', err);
        return false;
      } finally {
        restorePreviousActiveElement(previousActiveElement, directFocusWarnKey);
      }
    }

    // =============================================================================
    // Replace Request Handling
    // =============================================================================

    function buildReplaceResponse(operation, requestId, fields = {}) {
      return {
        requestId,
        operation: operation === 'replace-all' ? 'replace-all' : 'replace-current',
        ok: fields.ok !== false,
        status: fields.status || 'noop',
        replacements: Number.isFinite(fields.replacements) ? fields.replacements : 0,
        finalTextLength: Number.isFinite(fields.finalTextLength) ? fields.finalTextLength : editor.value.length,
        error: fields.error || '',
      };
    }

    function handleReplaceCurrentRequest(payload) {
      const requestId = Number(payload && payload.requestId);
      const query = typeof payload?.query === 'string' ? payload.query : '';
      const replacement = typeof payload?.replacement === 'string' ? payload.replacement : '';
      const activeMatchOrdinal = Number(payload && payload.activeMatchOrdinal);
      const matchCase = !!(payload && payload.matchCase);

      if (!query) {
        return buildReplaceResponse('replace-current', requestId, {
          status: 'noop-empty-query',
          replacements: 0,
        });
      }

      const explicitRange = editorFindReplaceCore.resolveLiteralMatchByOrdinal({
        value: editor.value,
        query,
        ordinal: activeMatchOrdinal,
        matchCase,
      });

      if (!explicitRange) {
        return buildReplaceResponse('replace-current', requestId, {
          status: 'selection-mismatch',
          replacements: 0,
        });
      }

      const replaced = tryNativeReplaceSelectionWithoutSync(
        explicitRange.start,
        explicitRange.end,
        replacement
      );
      if (!replaced) {
        return buildReplaceResponse('replace-current', requestId, {
          ok: false,
          status: 'internal-error',
          error: 'replace-current failed',
          replacements: 0,
        });
      }

      return buildReplaceResponse('replace-current', requestId, {
        status: 'replaced',
        replacements: 1,
      });
    }

    function handleReplaceAllRequest(payload) {
      const requestId = Number(payload && payload.requestId);
      const query = typeof payload?.query === 'string' ? payload.query : '';
      const replacement = typeof payload?.replacement === 'string' ? payload.replacement : '';
      const matchCase = !!(payload && payload.matchCase);
      const currentValue = editor.value;

      if (!query) {
        return buildReplaceResponse('replace-all', requestId, {
          status: 'noop-empty-query',
          replacements: 0,
          finalTextLength: currentValue.length,
        });
      }

      const computed = editorFindReplaceCore.computeLiteralReplaceAll({
        value: currentValue,
        query,
        replacement,
        matchCase,
      });
      if (!computed.replacements || computed.nextValue === currentValue) {
        return buildReplaceResponse('replace-all', requestId, {
          status: 'noop-unchanged',
          replacements: 0,
          finalTextLength: currentValue.length,
        });
      }

      if (computed.nextValue.length > state.maxTextChars) {
        return buildReplaceResponse('replace-all', requestId, {
          ok: false,
          status: 'max-text-exceeded',
          replacements: 0,
          finalTextLength: currentValue.length,
          error: 'replace-all projected text exceeds max text chars',
        });
      }

      const replaced = commitWholeValueWithThresholdPolicy(computed.nextValue, {
        nativeFocusWarnKey: 'focus.prevActive.replaceAll.native',
        directFocusWarnKey: 'focus.prevActive.replaceAll.full',
      });
      if (!replaced) {
        return buildReplaceResponse('replace-all', requestId, {
          ok: false,
          status: 'internal-error',
          error: 'replace-all failed',
          replacements: 0,
          finalTextLength: currentValue.length,
        });
      }

      return buildReplaceResponse('replace-all', requestId, {
        status: 'replaced',
        replacements: computed.replacements,
        finalTextLength: computed.nextValue.length,
      });
    }

    function handleReplaceRequest(payload) {
      const operation = payload && payload.operation === 'replace-all'
        ? 'replace-all'
        : 'replace-current';

      if (operation === 'replace-all') {
        return handleReplaceAllRequest(payload);
      }

      return handleReplaceCurrentRequest(payload);
    }

    // =============================================================================
    // Main Text Sync And Transfer Handling
    // =============================================================================

    function sendCurrentTextToMain(action, options = {}) {
      const hasText = Object.prototype.hasOwnProperty.call(options, 'text');
      const text = hasText ? options.text : editor.value;
      const onError = typeof options.onError === 'function' ? options.onError : null;

      try {
        const payload = { text, meta: { source: 'editor', action } };
        const setCurrentTextResult = editorAPI.setCurrentText(payload);
        handleTruncationResponse(setCurrentTextResult);
        return true;
      } catch (err) {
        if (onError) {
          onError(err);
        } else {
          log.warnOnce(
            'editor.setCurrentText.failed',
            'editorAPI.setCurrentText failed (ignored):',
            err
          );
        }
        return false;
      }
    }

    function notifyTextTruncated() {
      window.Notify.notifyEditor('renderer.editor.alerts.text_truncated', { type: 'warn', duration: 5000 });
    }

    function notifyIfTruncated(truncated) {
      if (truncated) {
        notifyTextTruncated();
      }
    }

    function handleResolvedSetCurrentTextResult(result) {
      if (result && result.truncated) {
        notifyTextTruncated();
      }
    }

    function handleTruncationResponse(setCurrentTextResult) {
      try {
        if (setCurrentTextResult && typeof setCurrentTextResult.then === 'function') {
          setCurrentTextResult.then((result) => {
            handleResolvedSetCurrentTextResult(result);
          }).catch((err) => {
            log.warn('editorAPI.setCurrentText response handling failed (ignored):', err);
          });
          return;
        }

        handleResolvedSetCurrentTextResult(setCurrentTextResult);
      } catch (err) {
        log.error('handleTruncationResponse error:', err);
      }
    }

    function insertTextAtCursor(rawText, options = {}) {
      try {
        const limitAlertKey = (options && typeof options.limitAlertKey === 'string')
          ? options.limitAlertKey
          : 'renderer.editor.alerts.paste_limit';
        const truncatedAlertKey = (options && typeof options.truncatedAlertKey === 'string')
          ? options.truncatedAlertKey
          : 'renderer.editor.alerts.paste_truncated';
        const available = getInsertionCapacity();
        if (available <= 0) {
          window.Notify.notifyEditor(limitAlertKey, { type: 'warn' });
          ctx.ui.restoreFocusToEditor();
          return { inserted: 0, truncated: false };
        }

        let toInsert = rawText;
        let truncated = false;
        if (rawText.length > available) {
          toInsert = rawText.slice(0, available);
          truncated = true;
        }

        tryNativeInsertAtSelection(toInsert);

        if (truncated) {
          window.Notify.notifyEditor(truncatedAlertKey, { type: 'warn', duration: 5000 });
        }

        ctx.ui.restoreFocusToEditor();
        return { inserted: toInsert.length, truncated };
      } catch (err) {
        log.error('insertTextAtCursor error:', err);
        return { inserted: 0, truncated: false };
      }
    }

    function handleTextTransferInsert(ev, transferConfig) {
      const source = transferConfig && transferConfig.source ? transferConfig.source : 'transfer';
      const noTextAlertKey = transferConfig && transferConfig.noTextAlertKey
        ? transferConfig.noTextAlertKey
        : 'renderer.editor.alerts.paste_no_text';
      const tooBigAlertKey = transferConfig && transferConfig.tooBigAlertKey
        ? transferConfig.tooBigAlertKey
        : 'renderer.editor.alerts.paste_too_big';
      const insertOptions = transferConfig && transferConfig.insertOptions ? transferConfig.insertOptions : {};
      const getText = transferConfig && typeof transferConfig.getText === 'function'
        ? transferConfig.getText
        : () => '';

      try {
        if (editor.readOnly) {
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }

        ev.preventDefault();
        ev.stopPropagation();

        const text = String(getText(ev) || '');
        if (!text) {
          window.Notify.notifyEditor(noTextAlertKey, { type: 'warn' });
          ctx.ui.restoreFocusToEditor();
          return;
        }

        if (text.length > ctx.PASTE_ALLOW_LIMIT) {
          window.Notify.notifyEditor(tooBigAlertKey, { type: 'warn', duration: 5000 });
          ctx.ui.restoreFocusToEditor();
          return;
        }

        const action = (insertOptions && typeof insertOptions.action === 'string')
          ? insertOptions.action
          : 'paste';
        const syncOptions = {};
        if (insertOptions && typeof insertOptions.onError === 'function') {
          syncOptions.onError = insertOptions.onError;
        }

        let insertResult = null;
        withLocalUpdateSuppressed(() => {
          insertResult = insertTextAtCursor(text, insertOptions);
        });

        if (
          insertResult &&
          insertResult.inserted > 0 &&
          calcWhileTyping &&
          calcWhileTyping.checked
        ) {
          sendCurrentTextToMain(action, syncOptions);
        }
      } catch (err) {
        log.error(`${source} handler error:`, err);
        ctx.ui.restoreFocusToEditor();
      }
    }

    // =============================================================================
    // External Update Reconciliation
    // =============================================================================

    function normalizeExternalUpdatePayload(payload) {
      if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'text')) {
        return {
          incomingMeta: payload.meta || null,
          newText: String(payload.text || ''),
        };
      }

      return {
        incomingMeta: null,
        newText: String(payload || ''),
      };
    }

    function appendSmallExternalTextWithoutSync(textToInsert) {
      const previousActiveElement = document.activeElement;

      try {
        editor.focus();
        const caretPos = editor.value.length;
        setCaretSafe(caretPos);

        const ok = document.execCommand && document.execCommand('insertText', false, textToInsert);
        if (ok) {
          return;
        }

        log.warnOnce(
          'editor.execCommand.appendNewline',
          "document.execCommand('insertText') unavailable or failed; using append fallback."
        );

        if (typeof editor.setRangeText === 'function') {
          editor.setRangeText(textToInsert, caretPos, caretPos, 'end');
          dispatchNativeInputEvent();
          return;
        }

        log.warnOnce(
          'editor.setRangeText.appendNewline',
          'editor.setRangeText unavailable; using direct append fallback.'
        );

        editor.value = editor.value + textToInsert;
        dispatchNativeInputEvent();
      } catch (err) {
        log.warnOnce(
          'editor.execCommand.appendNewline',
          "document.execCommand('insertText') unavailable or failed; using append fallback:",
          err
        );
        log.warnOnce(
          'editor.setRangeText.appendNewline',
          'editor.setRangeText unavailable; using direct append fallback.'
        );
        editor.value = editor.value + textToInsert;
        dispatchNativeInputEvent();
      } finally {
        restorePreviousActiveElement(previousActiveElement, 'focus.prevActive.append_newline.native');
      }
    }

    function handleAppendNewlineExternalUpdate(newText, truncated) {
      if (!newText.startsWith(editor.value)) {
        return false;
      }

      const textToInsert = newText.slice(editor.value.length);
      if (!textToInsert) {
        return true;
      }

      if (textToInsert.length <= ctx.SMALL_UPDATE_THRESHOLD) {
        appendSmallExternalTextWithoutSync(textToInsert);
        return true;
      }

      const committed = commitWholeValueWithThresholdPolicy(newText, {
        nativeFocusWarnKey: 'focus.prevActive.append_newline.native',
        directFocusWarnKey: 'focus.prevActive.append_newline.full',
      });
      if (!committed) {
        log.error('append_newline full replace failed unexpectedly.');
      }
      notifyIfTruncated(truncated);
      return true;
    }

    async function applyExternalUpdate(payload) {
      try {
        const normalizedPayload = normalizeExternalUpdatePayload(payload);
        const incomingMeta = normalizedPayload.incomingMeta;
        let newText = normalizedPayload.newText;

        let truncated = false;
        if (newText.length > state.maxTextChars) {
          newText = newText.slice(0, state.maxTextChars);
          truncated = true;
        }

        if (incomingMeta && incomingMeta.source === 'editor') {
          return;
        }

        if (editor.value === newText) {
          notifyIfTruncated(truncated);
          return;
        }

        // Prevent main-driven updates from re-triggering local Text Editor sync while applying them.
        withLocalUpdateSuppressed(() => {
          const metaSource = incomingMeta && incomingMeta.source ? incomingMeta.source : null;
          const metaAction = incomingMeta && incomingMeta.action ? incomingMeta.action : null;

          if (
            metaSource === 'main-window' &&
            metaAction === 'append_newline' &&
            handleAppendNewlineExternalUpdate(newText, truncated)
          ) {
            return;
          }

          if (metaSource === 'main' || metaSource === 'main-window' || !metaSource) {
            const committed = commitWholeValueWithThresholdPolicy(newText, {
              nativeFocusWarnKey: 'focus.prevActive.main.native',
              directFocusWarnKey: 'focus.prevActive.main.full',
            });
            if (!committed) {
              log.error('Whole-value external update failed unexpectedly.');
            }
            notifyIfTruncated(truncated);
            return;
          }

          replaceEditorValueHidden(newText);
          notifyIfTruncated(truncated);
        });
      } catch (err) {
        log.error('applyExternalUpdate error:', err);
      }
    }

    // =============================================================================
    // Module Surface
    // =============================================================================

    return {
      getSelectionRange,
      getInsertionCapacity,
      getBeforeInputIncomingLength,
      setSelectionSafe,
      setCaretSafe,
      handleReplaceRequest,
      sendCurrentTextToMain,
      handleTruncationResponse,
      handleTextTransferInsert,
      applyExternalUpdate,
    };
  }

  // =============================================================================
  // Exports
  // =============================================================================

  window.EditorEngine = { createEditorEngine };
})();

// =============================================================================
// End of public/js/editor_engine.js
// =============================================================================
