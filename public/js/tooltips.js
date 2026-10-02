// public/js/tooltips.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Display explicit, already-localized visual-tooltip values.
// - Position the shared visual bubble for pointer and keyboard interactions.
// - Own tooltip dismissal semantics, including Escape priority while a tooltip is visible.

(() => {
  // =============================================================================
  // Renderer bootstrap dependencies
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[tooltips] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('tooltips');

  if (!document.documentElement || !document.body) {
    log.error('Tooltip bootstrap failed: document root unavailable.');
    throw new Error('[tooltips] document root unavailable');
  }

  // =============================================================================
  // Constants
  // =============================================================================
  const TOOLTIP_ATTRIBUTE = 'data-tot-tooltip';
  const TOOLTIP_ID = 'tot-authored-tooltip';
  const PRESENTER_STATE_KEY = Symbol.for('tot.visual-tooltip-presenter');
  const VIEWPORT_MARGIN = 8;
  const TOOLTIP_GAP = 8;

  if (document[PRESENTER_STATE_KEY]) return;
  document[PRESENTER_STATE_KEY] = true;

  // =============================================================================
  // Shared state
  // =============================================================================
  let tooltip = null;
  let hoveredElement = null;
  let focusedElement = null;
  let dismissedElement = null;

  // =============================================================================
  // Helpers
  // =============================================================================
  function normalizeText(value) {
    return String(value || '').trim();
  }

  function isTooltipTarget(element) {
    return Boolean(element
      && typeof element.getAttribute === 'function'
      && normalizeText(element.getAttribute(TOOLTIP_ATTRIBUTE)));
  }

  function findTooltipTarget(element) {
    if (!element || typeof element.closest !== 'function') return null;
    const target = element.closest(`[${TOOLTIP_ATTRIBUTE}]`);
    return isTooltipTarget(target) ? target : null;
  }

  function ensureTooltip() {
    if (tooltip) return tooltip;

    tooltip = document.createElement('div');
    tooltip.id = TOOLTIP_ID;
    tooltip.className = 'tot-tooltip';
    tooltip.setAttribute('aria-hidden', 'true');
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
    return tooltip;
  }

  function positionTooltip(target) {
    if (!tooltip || tooltip.hidden || !target || typeof target.getBoundingClientRect !== 'function') return;

    const targetRect = target.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - tooltipRect.width - VIEWPORT_MARGIN);
    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, targetRect.left + ((targetRect.width - tooltipRect.width) / 2)),
      maxLeft
    );
    const preferredTop = targetRect.top - tooltipRect.height - TOOLTIP_GAP;
    const top = preferredTop >= VIEWPORT_MARGIN
      ? preferredTop
      : Math.min(window.innerHeight - tooltipRect.height - VIEWPORT_MARGIN, targetRect.bottom + TOOLTIP_GAP);

    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(Math.max(VIEWPORT_MARGIN, top))}px`;
  }

  function currentTarget() {
    // Focus intentionally takes precedence over hover for a focused control.
    if (isTooltipTarget(focusedElement)) return focusedElement;
    if (isTooltipTarget(hoveredElement)) return hoveredElement;
    return null;
  }

  function refreshTooltip() {
    const target = currentTarget();
    if (!target || target === dismissedElement) {
      if (tooltip) tooltip.hidden = true;
      return;
    }

    const text = normalizeText(target.getAttribute(TOOLTIP_ATTRIBUTE));
    if (!text) {
      if (tooltip) tooltip.hidden = true;
      return;
    }

    const tooltipElement = ensureTooltip();
    tooltipElement.textContent = text;
    tooltipElement.style.left = '';
    tooltipElement.style.top = '';
    tooltipElement.hidden = false;
    positionTooltip(target);
  }

  function isWithinTarget(target, relatedTarget) {
    return Boolean(target && relatedTarget && target.contains(relatedTarget));
  }

  function clearDismissalWhenInactive(target) {
    if (dismissedElement === target && hoveredElement !== target && focusedElement !== target) {
      dismissedElement = null;
    }
  }

  function clearDetachedTargets() {
    let targetCleared = false;

    if (hoveredElement && !document.documentElement.contains(hoveredElement)) {
      hoveredElement = null;
      targetCleared = true;
    }
    if (focusedElement && !document.documentElement.contains(focusedElement)) {
      focusedElement = null;
      targetCleared = true;
    }
    if (dismissedElement && !document.documentElement.contains(dismissedElement)) {
      dismissedElement = null;
    }

    if (targetCleared) refreshTooltip();
  }

  // =============================================================================
  // Event wiring
  // =============================================================================
  document.addEventListener('pointerover', (event) => {
    const target = findTooltipTarget(event.target);
    if (!target || target === hoveredElement) return;
    // Subordinate hover activity must not revive an Escape-dismissed dominant focus target.
    if (dismissedElement
      && dismissedElement !== target
      && dismissedElement !== focusedElement) {
      dismissedElement = null;
    }
    hoveredElement = target;
    refreshTooltip();
  });

  document.addEventListener('pointerout', (event) => {
    const target = findTooltipTarget(event.target);
    if (!target || target !== hoveredElement || isWithinTarget(target, event.relatedTarget)) return;
    hoveredElement = null;
    clearDismissalWhenInactive(target);
    refreshTooltip();
  });

  document.addEventListener('focusin', (event) => {
    const target = findTooltipTarget(event.target);
    if (!target) return;
    if (target !== focusedElement) dismissedElement = null;
    focusedElement = target;
    refreshTooltip();
  });

  document.addEventListener('focusout', (event) => {
    const target = findTooltipTarget(event.target);
    if (!target || target !== focusedElement || isWithinTarget(target, event.relatedTarget)) return;
    focusedElement = null;
    clearDismissalWhenInactive(target);
    refreshTooltip();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !tooltip || tooltip.hidden) return;

    const target = currentTarget();
    if (!target) return;

    dismissedElement = target;
    tooltip.hidden = true;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  window.addEventListener('resize', () => positionTooltip(currentTarget()));
  document.addEventListener('scroll', () => positionTooltip(currentTarget()), true);

  // =============================================================================
  // Bootstrap
  // =============================================================================
  if (typeof MutationObserver === 'function') {
    const tooltipObserver = new MutationObserver((records) => {
      let activeValueChanged = false;
      let childListChanged = false;

      records.forEach((record) => {
        if (record.type === 'attributes'
          && record.attributeName === TOOLTIP_ATTRIBUTE
          && (record.target === hoveredElement || record.target === focusedElement)) {
          activeValueChanged = true;
        }
        if (record.type === 'childList') childListChanged = true;
      });

      if (childListChanged) clearDetachedTargets();
      if (activeValueChanged) refreshTooltip();
    });

    tooltipObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: [TOOLTIP_ATTRIBUTE],
      childList: true,
      subtree: true,
    });
  } else {
    log.warn('Visual tooltip mutation refresh and detached-target cleanup unavailable: MutationObserver missing.');
  }
})();

// =============================================================================
// End of public/js/tooltips.js
// =============================================================================
