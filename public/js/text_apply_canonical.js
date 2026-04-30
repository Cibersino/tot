// public/js/text_apply_canonical.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Keep canonical overwrite/append/repetitions text-apply helpers in one place.
// - Avoid duplicated apply semantics across clipboard and text extraction flows.
// - Return structured apply results instead of scattering write-path decisions across callers.
// =============================================================================

(() => {
  // =============================================================================
  // Imports / logger
  // =============================================================================

  if (typeof window.getLogger !== 'function') {
    throw new Error('[text-apply-canonical] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('text-apply-canonical');
  log.debug('Text apply canonical helpers starting...');

  // =============================================================================
  // Helpers
  // =============================================================================

  function normalizeRepeat(rawValue, { maxRepeat } = {}) {
    const numericValue = Number(rawValue);
    const cap = Number.isInteger(Number(maxRepeat)) && Number(maxRepeat) > 0
      ? Number(maxRepeat)
      : 1;
    if (!Number.isInteger(numericValue) || numericValue < 1) return 1;
    return Math.min(numericValue, cap);
  }

  function projectRepeatedLength(baseText, textToApply, repeatCount) {
    const clip = String(textToApply || '');
    const clipLength = clip.length;
    const clipEndsWithNewline = clipLength > 0 && (clip.endsWith('\n') || clip.endsWith('\r'));
    let projected = String(baseText || '').length;
    let hasContent = projected > 0;
    let endsWithNewline = hasContent && (String(baseText || '').endsWith('\n') || String(baseText || '').endsWith('\r'));

    for (let i = 0; i < repeatCount; i += 1) {
      if (hasContent) {
        projected += endsWithNewline ? 1 : 2;
        endsWithNewline = true;
      }
      if (clipLength > 0) {
        projected += clipLength;
        hasContent = true;
        endsWithNewline = clipEndsWithNewline;
      }
    }
    return projected;
  }

  function buildRepeatedText(baseText, textToApply, repeatCount) {
    const clip = String(textToApply || '');
    const clipLength = clip.length;
    const clipEndsWithNewline = clipLength > 0 && (clip.endsWith('\n') || clip.endsWith('\r'));
    const parts = [String(baseText || '')];
    let hasContent = parts[0].length > 0;
    let endsWithNewline = hasContent && (parts[0].endsWith('\n') || parts[0].endsWith('\r'));

    for (let i = 0; i < repeatCount; i += 1) {
      if (hasContent) {
        parts.push(endsWithNewline ? '\n' : '\n\n');
        endsWithNewline = true;
      }
      if (clipLength > 0) {
        parts.push(clip);
        hasContent = true;
        endsWithNewline = clipEndsWithNewline;
      }
    }
    return parts.join('');
  }

  // =============================================================================
  // Public entrypoints
  // =============================================================================

  async function applyTextWithMode({
    mode,
    textToApply,
    repeatCount,
    maxRepeat,
    maxTextChars,
    maxIpcChars,
    getCurrentText,
    setCurrentText,
    source = 'main-window',
  } = {}) {
    const normalizedMode = mode === 'append' ? 'append' : (mode === 'overwrite' ? 'overwrite' : '');
    if (!normalizedMode) {
      return { ok: false, code: 'INVALID_MODE' };
    }
    if (typeof setCurrentText !== 'function') {
      return { ok: false, code: 'SET_CURRENT_TEXT_UNAVAILABLE' };
    }

    const normalizedRepeat = normalizeRepeat(repeatCount, { maxRepeat });
    const safeMaxTextChars = Number(maxTextChars) > 0 ? Number(maxTextChars) : 0;
    const safeMaxIpcChars = Number(maxIpcChars) > 0 ? Number(maxIpcChars) : 0;
    const incomingText = String(textToApply || '');

    let baseText = '';
    if (normalizedMode === 'append') {
      if (typeof getCurrentText !== 'function') {
        return { ok: false, code: 'GET_CURRENT_TEXT_UNAVAILABLE' };
      }
      try {
        baseText = String(await getCurrentText() || '');
      } catch (err) {
        log.error('getCurrentText failed while applying text:', err);
        return { ok: false, code: 'GET_CURRENT_TEXT_FAILED', error: String(err) };
      }
    }

    const projectedLen = projectRepeatedLength(baseText, incomingText, normalizedRepeat);
    if (safeMaxIpcChars > 0 && projectedLen > safeMaxIpcChars) {
      return {
        ok: false,
        code: 'PAYLOAD_TOO_LARGE',
        projectedLen,
      };
    }

    if (normalizedMode === 'append' && safeMaxTextChars > 0) {
      const available = safeMaxTextChars - baseText.length;
      if (available <= 0) {
        return { ok: false, code: 'TEXT_LIMIT' };
      }
    }

    const nextText = buildRepeatedText(baseText, incomingText, normalizedRepeat);
    const action = normalizedMode === 'append' ? 'append_newline' : 'overwrite';

    try {
      const resp = await setCurrentText({
        text: nextText,
        meta: { source, action },
      });
      if (!resp || resp.ok === false) {
        return {
          ok: false,
          code: 'SET_CURRENT_TEXT_FAILED',
          error: String(resp && resp.error ? resp.error : 'set-current-text failed'),
        };
      }
      return {
        ok: true,
        mode: normalizedMode,
        repeatCount: normalizedRepeat,
        truncated: !!resp.truncated,
        response: resp,
      };
    } catch (err) {
      log.error('setCurrentText failed while applying text:', err);
      return { ok: false, code: 'SET_CURRENT_TEXT_FAILED', error: String(err) };
    }
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================

  window.TextApplyCanonical = {
    normalizeRepeat,
    projectRepeatedLength,
    buildRepeatedText,
    applyTextWithMode,
  };
})();

// =============================================================================
// End of public/js/text_apply_canonical.js
// =============================================================================

