// public/js/tooltips.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Convert native title attributes into the shared authored tooltip treatment.
// - Preserve accessible names while replacing native tooltip rendering.
// - Keep dynamic title updates synchronized with authored tooltip content.
// - Position the shared tooltip for pointer and keyboard interactions.
// =============================================================================

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

  if (typeof MutationObserver !== 'function') {
    log.warn('Authored tooltip enhancement unavailable: MutationObserver missing; native title tooltips remain.');
    return;
  }

  // =============================================================================
  // Constants
  // =============================================================================
  const TOOLTIP_ATTRIBUTE = 'data-tot-tooltip';
  const TOOLTIP_ID = 'tot-authored-tooltip';
  const VIEWPORT_MARGIN = 8;
  const TOOLTIP_GAP = 8;

  // =============================================================================
  // Shared state
  // =============================================================================
  let tooltip = null;
  let hoveredElement = null;
  let focusedElement = null;

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
    tooltip.setAttribute('role', 'tooltip');
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
    return focusedElement || hoveredElement;
  }

  function refreshTooltip() {
    const target = currentTarget();
    if (!target) {
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

  function captureTitle(element) {
    if (!element || typeof element.getAttribute !== 'function' || !element.hasAttribute('title')) return;

    const text = normalizeText(element.getAttribute('title'));
    element.removeAttribute('title');

    if (!text) {
      element.removeAttribute(TOOLTIP_ATTRIBUTE);
      if (element === hoveredElement || element === focusedElement) refreshTooltip();
      return;
    }

    element.setAttribute(TOOLTIP_ATTRIBUTE, text);
    if (!element.hasAttribute('aria-label') && !element.hasAttribute('aria-labelledby')) {
      element.setAttribute('aria-label', text);
    }
    if (element === hoveredElement || element === focusedElement) refreshTooltip();
  }

  function captureTitlesIn(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
    captureTitle(node);
    node.querySelectorAll?.('[title]').forEach(captureTitle);
  }

  function isWithinTarget(target, relatedTarget) {
    return Boolean(target && relatedTarget && target.contains(relatedTarget));
  }

  // =============================================================================
  // Event wiring
  // =============================================================================
  document.addEventListener('pointerover', (event) => {
    const target = findTooltipTarget(event.target);
    if (!target || target === hoveredElement) return;
    hoveredElement = target;
    refreshTooltip();
  });

  document.addEventListener('pointerout', (event) => {
    const target = findTooltipTarget(event.target);
    if (!target || target !== hoveredElement || isWithinTarget(target, event.relatedTarget)) return;
    hoveredElement = null;
    refreshTooltip();
  });

  document.addEventListener('focusin', (event) => {
    const target = findTooltipTarget(event.target);
    if (!target) return;
    focusedElement = target;
    refreshTooltip();
  });

  document.addEventListener('focusout', (event) => {
    const target = findTooltipTarget(event.target);
    if (!target || target !== focusedElement || isWithinTarget(target, event.relatedTarget)) return;
    focusedElement = null;
    refreshTooltip();
  });

  window.addEventListener('resize', () => positionTooltip(currentTarget()));
  document.addEventListener('scroll', () => positionTooltip(currentTarget()), true);

  // =============================================================================
  // Bootstrap
  // =============================================================================
  const titleObserver = new MutationObserver((records) => {
    records.forEach((record) => {
      if (record.type === 'attributes' && record.attributeName === 'title') {
        captureTitle(record.target);
      }
      if (record.type === 'childList') {
        record.addedNodes.forEach(captureTitlesIn);
      }
    });
  });

  captureTitlesIn(document.documentElement);
  titleObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['title'],
    childList: true,
    subtree: true,
  });
})();

// =============================================================================
// End of public/js/tooltips.js
// =============================================================================
