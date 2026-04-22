// public/js/lib/editor_maximized_layout_core.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Shared sizing core for the maximized manual-editor layout.
// Responsibilities:
// - Normalize and clamp the persisted preferred text-column width.
// - Clamp the rendered width to the currently available maximized stage width.
// - Compute symmetric drag-resize updates from either gutter.

// =============================================================================
// Module Factory
// =============================================================================

function createEditorMaximizedLayoutCore() {
  function clampPreferredTextWidthPx(
    value,
    {
      defaultPx = 960,
      minPx = 480,
      maxPx = 1600,
    } = {}
  ) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return Math.round(defaultPx);
    const rounded = Math.round(parsed);
    return Math.min(Math.round(maxPx), Math.max(Math.round(minPx), rounded));
  }

  function clampRenderedTextWidthPx(
    preferredWidthPx,
    {
      stageWidthPx = 0,
      defaultPx = 960,
      minPx = 480,
      maxPx = 1600,
      gutterMinPx = 40,
    } = {}
  ) {
    const preferred = clampPreferredTextWidthPx(preferredWidthPx, {
      defaultPx,
      minPx,
      maxPx,
    });
    const stageWidth = Math.round(Number(stageWidthPx));
    const gutterMin = Math.max(0, Math.round(Number(gutterMinPx) || 0));

    if (!Number.isFinite(stageWidth) || stageWidth <= 0) {
      return preferred;
    }

    const maxVisibleWidth = Math.max(0, stageWidth - (gutterMin * 2));
    if (maxVisibleWidth <= 0) {
      return Math.max(0, Math.min(preferred, stageWidth));
    }

    return Math.min(preferred, maxVisibleWidth);
  }

  function computeNextPreferredTextWidthPxFromDrag(
    {
      initialTextWidthPx = 0,
      pointerDeltaPx = 0,
      side = 'left',
    } = {},
    options = {}
  ) {
    const initialWidth = clampRenderedTextWidthPx(initialTextWidthPx, options);
    const delta = Math.round(Number(pointerDeltaPx) || 0);
    const signedMultiplier = side === 'right' ? 1 : -1;
    const nextWidth = initialWidth + (delta * 2 * signedMultiplier);
    return clampRenderedTextWidthPx(nextWidth, options);
  }

  return {
    clampPreferredTextWidthPx,
    clampRenderedTextWidthPx,
    computeNextPreferredTextWidthPxFromDrag,
  };
}

// =============================================================================
// Exports
// =============================================================================

(function initEditorMaximizedLayoutCore(factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  if (typeof window !== 'undefined') {
    window.EditorMaximizedLayoutCore = api;
  }
})(createEditorMaximizedLayoutCore);

// =============================================================================
// End of public/js/lib/editor_maximized_layout_core.js
// =============================================================================
