// public/js/editor_engine.js
'use strict';

// =============================================================================
// public/js/editor_engine.js
// =============================================================================
// Responsibilities:
// - Handle editor selection, insertion, replacement, and synchronization.
// - Publish replace status and respond to replace requests from main.
// - Reconcile external updates and transfer inserts.
// =============================================================================

(() => {
  function createEditorEngine(ctx) {
    const { log, editorAPI, editorFindReplaceCore, dom, state } = ctx;
    const { editor } = dom;

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
          "document.execCommand('insertText') unavailable or failed; using editor insert fallback."
        );

        if (typeof editor.setRangeText === 'function') {
          editor.setRangeText(text, start, end, 'end');
          const newCaret = start + text.length;
          setCaretSafe(newCaret);
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
        return true;
      } catch (err) {
        log.error('tryNativeInsertAtSelection error:', err);
        return false;
      }
    }

    function selectionMatchesCurrentEditorSelection(query, matchCase = false) {
      const { start, end } = getSelectionRange();
      return editorFindReplaceCore.selectionMatchesLiteralQuery({
        value: editor.value,
        selectionStart: start,
        selectionEnd: end,
        query,
        matchCase,
      });
    }

    function tryNativeReplaceCurrentSelectionWithoutSync(replacementText) {
      try {
        const { start, end } = getSelectionRange();

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
        log.error('tryNativeReplaceCurrentSelectionWithoutSync error:', err);
        return false;
      }
    }

    function tryNativeReplaceWholeValueWithoutSync(nextValue) {
      const previousActiveElement = document.activeElement;

      try {
        editor.focus();
        selectAllEditor();
        if (tryNativeReplaceWholeValueSelection(nextValue)) {
          return true;
        }

        editor.value = nextValue;
        dispatchNativeInputEvent();
        return true;
      } catch (err) {
        log.error('tryNativeReplaceWholeValueWithoutSync error:', err);
        return false;
      } finally {
        restorePreviousActiveElement(previousActiveElement, 'focus.prevActive.replaceAll.native');
      }
    }

    function publishReplaceStatus() {
      try {
        editorAPI.sendReplaceStatus({
          replaceAllAllowedByLength: editorFindReplaceCore.isReplaceAllAllowedByLength({
            value: editor.value,
            smallUpdateThreshold: ctx.SMALL_UPDATE_THRESHOLD,
          }),
        });
      } catch (err) {
        log.warnOnce(
          'editor.replaceStatus.send_failed',
          'editorAPI.sendReplaceStatus failed (ignored):',
          err
        );
      }
    }

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
      const matchCase = !!(payload && payload.matchCase);

      if (!query) {
        return buildReplaceResponse('replace-current', requestId, {
          status: 'noop-empty-query',
          replacements: 0,
        });
      }

      if (!selectionMatchesCurrentEditorSelection(query, matchCase)) {
        return buildReplaceResponse('replace-current', requestId, {
          status: 'selection-mismatch',
          replacements: 0,
        });
      }

      const replaced = tryNativeReplaceCurrentSelectionWithoutSync(replacement);
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

      if (currentValue.length > ctx.SMALL_UPDATE_THRESHOLD) {
        return buildReplaceResponse('replace-all', requestId, {
          status: 'noop-length-disallowed',
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

      if (computed.nextValue.length > ctx.SMALL_UPDATE_THRESHOLD) {
        return buildReplaceResponse('replace-all', requestId, {
          status: 'noop-length-disallowed',
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

      const replaced = tryNativeReplaceWholeValueWithoutSync(computed.nextValue);
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

    function sendCurrentTextToMain(action, options = {}) {
      const hasText = Object.prototype.hasOwnProperty.call(options, 'text');
      const text = hasText ? options.text : editor.value;
      const onPrimaryError = typeof options.onPrimaryError === 'function' ? options.onPrimaryError : null;
      const onFallbackError = typeof options.onFallbackError === 'function' ? options.onFallbackError : null;

      try {
        const payload = { text, meta: { source: 'editor', action } };
        const res = editorAPI.setCurrentText(payload);
        handleTruncationResponse(res);
        return true;
      } catch (err) {
        if (onPrimaryError) {
          onPrimaryError(err);
        } else {
          log.warnOnce(
            'editor.setCurrentText.payload_failed',
            'editorAPI.setCurrentText payload failed; using fallback:',
            err
          );
        }
        try {
          const resFallback = editorAPI.setCurrentText(text);
          handleTruncationResponse(resFallback);
          return true;
        } catch (fallbackErr) {
          if (onFallbackError) {
            onFallbackError(fallbackErr);
          } else {
            log.warn('editorAPI.setCurrentText fallback failed (ignored):', fallbackErr);
          }
          return false;
        }
      }
    }

    function notifyTextTruncated() {
      window.Notify.notifyEditor('renderer.editor_alerts.text_truncated', { type: 'warn', duration: 5000 });
    }

    function handleTruncationResponse(resPromise) {
      try {
        if (resPromise && typeof resPromise.then === 'function') {
          resPromise.then((r) => {
            if (r && r.truncated) {
              notifyTextTruncated();
            }
          }).catch((err) => {
            log.warn('editorAPI.setCurrentText response handling failed (ignored):', err);
          });
        }
      } catch (err) {
        log.error('handleTruncationResponse error:', err);
      }
    }

    function insertTextAtCursor(rawText, options = {}) {
      try {
        const action = (options && typeof options.action === 'string') ? options.action : 'paste';
        const limitAlertKey = (options && typeof options.limitAlertKey === 'string')
          ? options.limitAlertKey
          : 'renderer.editor_alerts.paste_limit';
        const truncatedAlertKey = (options && typeof options.truncatedAlertKey === 'string')
          ? options.truncatedAlertKey
          : 'renderer.editor_alerts.paste_truncated';
        const syncOptions = {};
        if (options && typeof options.onPrimaryError === 'function') {
          syncOptions.onPrimaryError = options.onPrimaryError;
        }
        if (options && typeof options.onFallbackError === 'function') {
          syncOptions.onFallbackError = options.onFallbackError;
        }
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

        sendCurrentTextToMain(action, syncOptions);

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
        : 'renderer.editor_alerts.paste_no_text';
      const tooBigAlertKey = transferConfig && transferConfig.tooBigAlertKey
        ? transferConfig.tooBigAlertKey
        : 'renderer.editor_alerts.paste_too_big';
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

        insertTextAtCursor(text, insertOptions);
      } catch (err) {
        log.error(`${source} handler error:`, err);
        ctx.ui.restoreFocusToEditor();
      }
    }

    async function applyExternalUpdate(payload) {
      try {
        let incomingMeta = null;
        let newText = '';

        if (payload && typeof payload === 'object' && Object.prototype.hasOwnProperty.call(payload, 'text')) {
          newText = String(payload.text || '');
          incomingMeta = payload.meta || null;
        } else {
          newText = String(payload || '');
        }

        let truncated = false;
        if (newText.length > state.maxTextChars) {
          newText = newText.slice(0, state.maxTextChars);
          truncated = true;
        }

        if (incomingMeta && incomingMeta.source === 'editor') {
          return;
        }

        if (editor.value === newText) {
          if (truncated) {
            notifyTextTruncated();
          }
          return;
        }

        const prevSuppressLocalUpdate = state.suppressLocalUpdate;
        state.suppressLocalUpdate = true;
        try {
          const useNative = newText.length <= ctx.SMALL_UPDATE_THRESHOLD;
          const prevActive = document.activeElement;

          const metaSource = incomingMeta && incomingMeta.source ? incomingMeta.source : null;
          const metaAction = incomingMeta && incomingMeta.action ? incomingMeta.action : null;

          if (metaSource === 'main-window' && metaAction === 'append_newline') {
            if (newText.startsWith(editor.value)) {
              const toInsert = newText.slice(editor.value.length);
              if (!toInsert) return;
              if (toInsert.length <= ctx.SMALL_UPDATE_THRESHOLD) {
                try {
                  editor.focus();
                  const tpos = editor.value.length;
                  setCaretSafe(tpos);
                  const ok = document.execCommand && document.execCommand('insertText', false, toInsert);
                  if (!ok && typeof editor.setRangeText === 'function') {
                    log.warnOnce(
                      'editor.execCommand.appendNewline',
                      "document.execCommand('insertText') unavailable or failed; using append fallback."
                    );
                    editor.setRangeText(toInsert, tpos, tpos, 'end');
                    dispatchNativeInputEvent();
                  } else if (!ok) {
                    log.warnOnce(
                      'editor.execCommand.appendNewline',
                      "document.execCommand('insertText') unavailable or failed; using append fallback."
                    );
                    log.warnOnce(
                      'editor.setRangeText.appendNewline',
                      'editor.setRangeText unavailable; using direct append fallback.'
                    );
                    editor.value = editor.value + toInsert;
                    dispatchNativeInputEvent();
                  }
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
                  editor.value = editor.value + toInsert;
                  dispatchNativeInputEvent();
                } finally {
                  restorePreviousActiveElement(prevActive, 'focus.prevActive.append_newline.native');
                }
                return;
              }
              replaceEditorValueHidden(newText);
              restorePreviousActiveElement(prevActive, 'focus.prevActive.append_newline.full');
              if (truncated) {
                notifyTextTruncated();
              }
              return;
            }
          }

          if (metaSource === 'main' || metaSource === 'main-window' || !metaSource) {
            if (useNative) {
              try {
                editor.focus();
                selectAllEditor();
                if (!tryNativeReplaceWholeValueSelection(newText)) {
                  editor.value = newText;
                  dispatchNativeInputEvent();
                }
              } catch (err) {
                log.warn(
                  'Native whole-value replace failed; using direct update fallback:',
                  err
                );
                editor.value = newText;
                dispatchNativeInputEvent();
              } finally {
                restorePreviousActiveElement(prevActive, 'focus.prevActive.main.native');
              }
              if (truncated) {
                notifyTextTruncated();
              }
              return;
            }
            replaceEditorValueHidden(newText);
            restorePreviousActiveElement(prevActive, 'focus.prevActive.main.full');
            if (truncated) {
              notifyTextTruncated();
            }
            return;
          }

          replaceEditorValueHidden(newText);
          if (truncated) {
            notifyTextTruncated();
          }
        } finally {
          state.suppressLocalUpdate = prevSuppressLocalUpdate;
        }
      } catch (err) {
        log.error('applyExternalUpdate error:', err);
      }
    }

    return {
      getSelectionRange,
      getInsertionCapacity,
      getBeforeInputIncomingLength,
      setSelectionSafe,
      setCaretSafe,
      publishReplaceStatus,
      handleReplaceRequest,
      sendCurrentTextToMain,
      handleTruncationResponse,
      handleTextTransferInsert,
      applyExternalUpdate,
    };
  }

  window.EditorEngine = { createEditorEngine };
})();
