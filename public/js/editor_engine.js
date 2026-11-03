// public/js/editor_engine.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Text Editor engine module for the renderer editor page.
// Responsibilities:
// - Read and update selection state used by typing, paste, drop, and replace flows.
// - Apply insert and replace operations through ordered native and direct mutation strategies.
// - Build replace responses for main-driven requests.
// - Synchronize Text Editor text back to main and surface truncation feedback.
// - Reconcile external canonical-text updates without echoing editor-originated changes back to main.
// - Verify external updates and isolate canonical-text synchronization after a textarea mismatch.

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
        catch (error) { log.warn('editor.select() failed; whole-value selection may be incomplete:', error); }
        return;
      }
      setSelectionSafe(0, editor.value.length);
    }

    function dispatchNativeInputEvent() {
      try {
        const ev = new Event('input', { bubbles: true });
        editor.dispatchEvent(ev);
      } catch (error) {
        log.error('dispatchNativeInputEvent error:', error);
      }
    }

    function restorePreviousActiveElement(prevActive) {
      try {
        if (prevActive && prevActive !== editor) prevActive.focus();
      } catch (error) {
        log.warn('prevActive.focus() failed (ignored):', error);
      }
    }

    function replaceEditorValueHidden(nextValue) {
      try {
        editor.style.visibility = 'hidden';
        editor.value = nextValue;
        dispatchNativeInputEvent();
      } catch (error) {
        log.warn(
          'Hidden whole-value update failed; attempting direct value assignment:',
          error
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

      log.warn(
        "document.execCommand('insertText') unavailable or failed; using whole-value replace fallback."
      );

      if (typeof editor.setRangeText === 'function') {
        editor.setRangeText(nextValue, 0, editor.value.length, 'end');
        dispatchNativeInputEvent();
        return true;
      }

      log.warn(
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
          // The common diagnostic below covers this failure before the next strategy runs.
        }

        log.warn(
          "document.execCommand('insertText') unavailable or failed; using Text Editor insert fallback."
        );

        if (typeof editor.setRangeText === 'function') {
          editor.setRangeText(text, start, end, 'end');
          const newCaret = start + text.length;
          setCaretSafe(newCaret);
          dispatchNativeInputEvent();
          return true;
        }

        log.warn(
          'editor.setRangeText unavailable; using value splice insert fallback.'
        );

        const before = editor.value.slice(0, start);
        const after = editor.value.slice(end);
        editor.value = before + text + after;
        const newCaret = before.length + text.length;
        setCaretSafe(newCaret);
        dispatchNativeInputEvent();
        return true;
      } catch (error) {
        log.error('tryNativeInsertAtSelection error:', error);
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
          // The common diagnostic below covers this failure before the next strategy runs.
        }

        log.warn(
          "document.execCommand('insertText') unavailable or failed; using replace-current fallback."
        );

        if (typeof editor.setRangeText === 'function') {
          editor.setRangeText(replacementText, start, end, 'end');
          dispatchNativeInputEvent();
          return true;
        }

        log.warn(
          'editor.setRangeText unavailable; using manual replace-current fallback.'
        );

        const before = editor.value.slice(0, start);
        const after = editor.value.slice(end);
        editor.value = before + replacementText + after;
        const newCaret = before.length + replacementText.length;
        setCaretSafe(newCaret);
        dispatchNativeInputEvent();
        return true;
      } catch (error) {
        log.error('tryNativeReplaceSelectionWithoutSync error:', error);
        return false;
      } finally {
        restorePreviousActiveElement(previousActiveElement);
      }
    }

    function commitWholeValueNativeFirstWithoutSync(nextValue) {
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
      } catch (error) {
        log.warn(
          'Native whole-value replace failed; using direct update fallback:',
          error
        );
        try {
          editor.value = safeNextValue;
          dispatchNativeInputEvent();
          return true;
        } catch (error) {
          log.error('commitWholeValueNativeFirstWithoutSync error:', error);
          return false;
        }
      } finally {
        restorePreviousActiveElement(previousActiveElement);
      }
    }

    function commitWholeValueWithThresholdPolicy(nextValue) {
      const safeNextValue = String(nextValue || '');

      if (safeNextValue.length <= ctx.SMALL_UPDATE_THRESHOLD) {
        return commitWholeValueNativeFirstWithoutSync(safeNextValue);
      }

      const previousActiveElement = document.activeElement;
      try {
        replaceEditorValueHidden(safeNextValue);
        return true;
      } catch (error) {
        log.error('commitWholeValueWithThresholdPolicy error:', error);
        return false;
      } finally {
        restorePreviousActiveElement(previousActiveElement);
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

      const currentValue = editor.value;
      const explicitRange = editorFindReplaceCore.resolveLiteralMatchByOrdinal({
        value: currentValue,
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

      const projectedLength = currentValue.length
        - (explicitRange.end - explicitRange.start)
        + replacement.length;
      if (projectedLength > state.maxTextChars) {
        return buildReplaceResponse('replace-current', requestId, {
          ok: false,
          status: 'max-text-exceeded',
          replacements: 0,
          finalTextLength: currentValue.length,
          error: 'replace-current projected text exceeds max text chars',
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

      const replaced = commitWholeValueWithThresholdPolicy(computed.nextValue);
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

    function handleSetCurrentTextFailure(error, onError) {
      if (typeof onError === 'function') {
        onError(error);
        return;
      }
      log.warn(
        'editorAPI.setCurrentText failed (ignored):',
        error
      );
    }

    function sendCurrentTextToMain(action, options = {}) {
      if (state.canonicalTextSyncIsolated === true) {
        return false;
      }

      const hasText = Object.prototype.hasOwnProperty.call(options, 'text');
      const text = hasText ? options.text : editor.value;
      const onError = typeof options.onError === 'function' ? options.onError : null;

      try {
        const payload = {
          text,
          baseNonEditorRevision: state.latestNonEditorRevisionSeen,
          meta: { source: 'editor', action },
        };
        const setCurrentTextResult = editorAPI.setCurrentText(payload);
        handleTruncationResponse(setCurrentTextResult, { onError });
        return true;
      } catch (error) {
        handleSetCurrentTextFailure(error, onError);
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

    function handleResolvedSetCurrentTextResult(result, onError) {
      if (result && result.ok === false) {
        if (result.code === 'STALE_EDITOR_WRITE') return;
        handleSetCurrentTextFailure(
          result.error || 'editorAPI.setCurrentText returned a non-ok result.',
          onError
        );
        return;
      }

      if (result && result.truncated) {
        notifyTextTruncated();
      }
    }

    function handleTruncationResponse(setCurrentTextResult, options = {}) {
      const onError = typeof options.onError === 'function' ? options.onError : null;

      try {
        if (setCurrentTextResult && typeof setCurrentTextResult.then === 'function') {
          setCurrentTextResult.then(
            (result) => {
              try {
                handleResolvedSetCurrentTextResult(result, onError);
              } catch (error) {
                log.error('handleTruncationResponse result handling error:', error);
              }
            },
            (error) => {
              handleSetCurrentTextFailure(error, onError);
            }
          );
          return;
        }
      } catch (error) {
        log.error('handleTruncationResponse error:', error);
        return;
      }

      try {
        handleResolvedSetCurrentTextResult(setCurrentTextResult, onError);
      } catch (error) {
        log.error('handleTruncationResponse result handling error:', error);
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

        const valueBeforeInsert = editor.value;
        const didInsert = tryNativeInsertAtSelection(toInsert);
        if (!didInsert && editor.value === valueBeforeInsert) {
          ctx.ui.restoreFocusToEditor();
          return { inserted: 0, truncated: false };
        }

        if (truncated) {
          window.Notify.notifyEditor(truncatedAlertKey, { type: 'warn', duration: 5000 });
        }

        ctx.ui.restoreFocusToEditor();
        return { inserted: toInsert.length, truncated };
      } catch (error) {
        log.error('insertTextAtCursor error:', error);
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
      } catch (error) {
        log.error(`${source} handler error:`, error);
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

    function verifyEditorText(expectedText) {
      try {
        const actualText = editor.value;
        return {
          matches: typeof actualText === 'string' && actualText === expectedText,
          actualLength: typeof actualText === 'string' ? actualText.length : null,
        };
      } catch (error) {
        return {
          matches: false,
          actualLength: null,
          readError: error,
        };
      }
    }

    function latchCanonicalTextSyncIsolation({ expectedText, verification, applicationError = null }) {
      if (state.canonicalTextSyncIsolated === true) {
        return false;
      }

      state.canonicalTextSyncIsolated = true;

      if (state.debounceTimer !== null && state.debounceTimer !== undefined) {
        clearTimeout(state.debounceTimer);
        state.debounceTimer = null;
      }

      try {
        ctx.ui.syncCanonicalTextSyncControls();
      } catch (error) {
        log.error('Canonical text sync isolation control presentation failed:', error);
      }

      log.error('Canonical text synchronization isolated after external update mismatch.', {
        expectedLength: expectedText.length,
        actualLength: verification.actualLength,
        applicationFailed: applicationError !== null,
        textareaReadFailed: !!verification.readError,
      });
      return true;
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

        log.warn(
          "document.execCommand('insertText') unavailable or failed; using append fallback."
        );

        if (typeof editor.setRangeText === 'function') {
          editor.setRangeText(textToInsert, caretPos, caretPos, 'end');
          dispatchNativeInputEvent();
          return;
        }

        log.warn(
          'editor.setRangeText unavailable; using direct append fallback.'
        );

        editor.value = editor.value + textToInsert;
        dispatchNativeInputEvent();
      } catch (error) {
        log.warn(
          'appendSmallExternalTextWithoutSync native append path failed; using direct append fallback:',
          error
        );
        editor.value = editor.value + textToInsert;
        dispatchNativeInputEvent();
      } finally {
        restorePreviousActiveElement(previousActiveElement);
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

      const committed = commitWholeValueWithThresholdPolicy(newText);
      if (!committed) {
        log.error('append_newline full replace failed unexpectedly.');
      }
      notifyIfTruncated(truncated);
      return true;
    }

    async function applyInitialText(payload) {
      let initialText;
      let truncated = false;

      try {
        const normalizedPayload = normalizeExternalUpdatePayload(payload);
        initialText = normalizedPayload.newText;

        if (initialText.length > state.maxTextChars) {
          initialText = initialText.slice(0, state.maxTextChars);
          truncated = true;
        }

        const committed = withLocalUpdateSuppressed(() => commitWholeValueWithThresholdPolicy(initialText));
        if (!committed) {
          log.error('Initial whole-value application failed unexpectedly.');
          return false;
        }
        notifyIfTruncated(truncated);
      } catch (error) {
        log.error('applyInitialText error:', error);
        return false;
      }

      const verification = verifyEditorText(initialText);
      if (!verification.matches) {
        log.error('Initial current-text application did not produce the expected textarea value.', {
          expectedLength: initialText.length,
          actualLength: verification.actualLength,
          textareaReadFailed: !!verification.readError,
        });
        return false;
      }

      return true;
    }

    async function applyExternalUpdate(payload) {
      if (state.canonicalTextSyncIsolated === true) {
        return { canonicalTextSyncIsolationLatched: false };
      }

      let normalizedPayload;
      try {
        normalizedPayload = normalizeExternalUpdatePayload(payload);
      } catch (error) {
        log.error('applyExternalUpdate error:', error);
        return { canonicalTextSyncIsolationLatched: false };
      }

      const incomingMeta = normalizedPayload.incomingMeta;
      let newText = normalizedPayload.newText;

      let truncated = false;
      if (newText.length > state.maxTextChars) {
        newText = newText.slice(0, state.maxTextChars);
        truncated = true;
      }

      if (incomingMeta && incomingMeta.source === 'editor') {
        return { canonicalTextSyncIsolationLatched: false };
      }

      let applicationError = null;
      try {
        if (editor.value === newText) {
          notifyIfTruncated(truncated);
          return { canonicalTextSyncIsolationLatched: false };
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
            const committed = commitWholeValueWithThresholdPolicy(newText);
            if (!committed) {
              log.error('Whole-value external update failed unexpectedly.');
            }
            notifyIfTruncated(truncated);
            return;
          }

          replaceEditorValueHidden(newText);
          notifyIfTruncated(truncated);
        });
      } catch (error) {
        applicationError = error;
        log.error('applyExternalUpdate error:', error);
      }

      const verification = verifyEditorText(newText);
      if (!verification.matches) {
        return {
          canonicalTextSyncIsolationLatched: latchCanonicalTextSyncIsolation({
            expectedText: newText,
            verification,
            applicationError,
          }),
        };
      }

      return { canonicalTextSyncIsolationLatched: false };
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
      applyInitialText,
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
