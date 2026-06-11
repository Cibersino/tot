// public/js/renderer_icons.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Consume the generated runtime icon registry derived from assets/icons/.
// - Upgrade static markup placeholders into app-owned SVG controls.
// - Provide one shared creation/application path for JS-generated icon controls.
// =============================================================================

(() => {
  if (typeof window.getLogger !== 'function') {
    throw new Error('[renderer-icons] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('renderer-icons');

  const registry = window.GeneratedRendererIcons || null;
  if (!registry || !registry.icons || typeof registry.icons !== 'object') {
    throw new Error('[renderer-icons] GeneratedRendererIcons unavailable; run npm run generate:icons');
  }

  const templateCache = new Map();
  let iconInstanceCounter = 0;

  function sanitizeToken(value) {
    const token = String(value || '').trim().toLowerCase();
    return /^[a-z0-9_-]+$/.test(token) ? token : '';
  }

  function getIconMarkup(iconName) {
    const normalizedName = sanitizeToken(iconName);
    const markup = normalizedName ? registry.icons[normalizedName] : '';
    if (!markup) {
      throw new Error(`[renderer-icons] Unknown icon: ${iconName}`);
    }
    return markup;
  }

  function buildTemplate(iconName) {
    const template = document.createElement('template');
    template.innerHTML = getIconMarkup(iconName);
    const svg = template.content.firstElementChild;
    if (!svg || svg.tagName.toLowerCase() !== 'svg') {
      throw new Error(`[renderer-icons] Invalid SVG root for ${iconName}`);
    }
    return svg;
  }

  function getTemplate(iconName) {
    const normalizedName = sanitizeToken(iconName);
    if (!templateCache.has(normalizedName)) {
      templateCache.set(normalizedName, buildTemplate(normalizedName));
    }
    return templateCache.get(normalizedName);
  }

  function uniquifySvgIds(svg, iconName) {
    const elementsWithId = svg.querySelectorAll('[id]');
    if (!elementsWithId.length) return;

    iconInstanceCounter += 1;
    const suffix = `${sanitizeToken(iconName) || 'icon'}-${iconInstanceCounter}`;
    const idMap = new Map();

    elementsWithId.forEach((element) => {
      const currentId = element.getAttribute('id');
      if (!currentId) return;
      idMap.set(currentId, `${currentId}__${suffix}`);
      element.setAttribute('id', `${currentId}__${suffix}`);
    });

    if (!idMap.size) return;

    const attributeNames = [
      'aria-labelledby',
      'aria-describedby',
      'clip-path',
      'fill',
      'filter',
      'href',
      'mask',
      'stroke',
      'style',
      'xlink:href',
    ];

    const elements = svg.querySelectorAll('*');
    elements.forEach((element) => {
      attributeNames.forEach((attributeName) => {
        const currentValue = element.getAttribute(attributeName);
        if (!currentValue) return;

        let nextValue = currentValue;
        idMap.forEach((nextId, previousId) => {
          nextValue = nextValue
            .replaceAll(`url(#${previousId})`, `url(#${nextId})`)
            .replaceAll(`#${previousId}`, `#${nextId}`);
        });

        if (nextValue !== currentValue) {
          element.setAttribute(attributeName, nextValue);
        }
      });
    });
  }

  function cloneSvg(iconName) {
    const normalizedName = sanitizeToken(iconName);
    const svg = getTemplate(normalizedName).cloneNode(true);
    uniquifySvgIds(svg, normalizedName);
    svg.classList.add('tot-icon-svg');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('aria-hidden', 'true');
    svg.removeAttribute('role');
    svg.removeAttribute('aria-labelledby');
    svg.removeAttribute('aria-describedby');
    svg.querySelectorAll('title, desc').forEach((node) => node.remove());
    return svg;
  }

  function createIconSlot(iconName, { size = 'md' } = {}) {
    const normalizedSize = sanitizeToken(size) || 'md';
    const slot = document.createElement('span');
    slot.className = `tot-icon-slot tot-icon-slot--${normalizedSize}`;
    slot.setAttribute('data-tot-icon-slot', 'true');
    slot.setAttribute('data-tot-icon-name', sanitizeToken(iconName));
    slot.appendChild(cloneSvg(iconName));
    return slot;
  }

  function syncAccessibleName(element, { title = '', ariaLabel = '' } = {}) {
    const resolvedAriaLabel = String(ariaLabel || '').trim();
    const resolvedTitle = String(title || '').trim();
    if (resolvedAriaLabel) {
      element.setAttribute('aria-label', resolvedAriaLabel);
    } else if (!element.getAttribute('aria-label') && resolvedTitle) {
      element.setAttribute('aria-label', resolvedTitle);
    }

    if (resolvedTitle) {
      element.title = resolvedTitle;
    } else if (!element.title && resolvedAriaLabel) {
      element.title = resolvedAriaLabel;
    }
  }

  function removeAppliedIconSlots(element) {
    element.querySelectorAll('[data-tot-icon-slot="true"]').forEach((slot) => {
      if (slot.parentNode === element) {
        slot.remove();
      }
    });
  }

  function applyIconToElement(element, iconName, {
    size = 'md',
    preserveContent = false,
    title = '',
    ariaLabel = '',
  } = {}) {
    if (!element) {
      throw new Error('[renderer-icons] applyIconToElement requires an element');
    }

    const normalizedName = sanitizeToken(iconName);
    if (!normalizedName) {
      throw new Error('[renderer-icons] applyIconToElement requires a valid iconName');
    }

    removeAppliedIconSlots(element);
    if (!preserveContent) {
      element.textContent = '';
    }
    element.classList.add('tot-icon-host');
    element.setAttribute('data-tot-icon', normalizedName);
    syncAccessibleName(element, { title, ariaLabel });
    element.appendChild(createIconSlot(normalizedName, { size }));
    return element;
  }

  function createIconButton({
    iconName,
    size = 'md',
    className = '',
    title = '',
    ariaLabel = '',
    type = 'button',
  } = {}) {
    const button = document.createElement('button');
    button.type = type;
    if (className) {
      button.className = className;
    }
    applyIconToElement(button, iconName, {
      size,
      title,
      ariaLabel,
    });
    return button;
  }

  function upgradeStaticIcons(root = document) {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    root.querySelectorAll('[data-tot-icon]').forEach((element) => {
      const iconName = element.getAttribute('data-tot-icon');
      const size = element.getAttribute('data-tot-icon-size') || 'md';
      const preserveContent = element.getAttribute('data-tot-icon-preserve') === 'true';
      try {
        applyIconToElement(element, iconName, {
          size,
          preserveContent,
        });
      } catch (err) {
        log.error('Static icon upgrade failed:', {
          iconName,
          elementId: element.id || '',
          err,
        });
        throw err;
      }
    });
  }

  window.RendererIcons = {
    applyIconToElement,
    createIconButton,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => upgradeStaticIcons(document), { once: true });
  } else {
    upgradeStaticIcons(document);
  }
})();

// =============================================================================
// End of public/js/renderer_icons.js
// =============================================================================
