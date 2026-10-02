// public/js/notify.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Resolve renderer i18n keys to displayable text.
// - Show blocking alerts and confirms for main-window notices.
// - Show toast notifications for main and Text Editor contexts.
// - Own stack-aware renderer modal focus containment and per-open restoration.
// - Provide a small, stable window.Notify surface for callers.

(() => {
  // =============================================================================
  // Logger
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[notify] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('notify');
  log.debug('Notify starting...');

  // =============================================================================
  // Helpers (i18n + toast rendering)
  // =============================================================================
  function resolveText(key, params = {}) {
    const { RendererI18n } = window || {};
    if (!RendererI18n || typeof RendererI18n.msgRenderer !== 'function') {
      throw new Error('[notify] RendererI18n.msgRenderer unavailable; cannot resolve renderer dialog text');
    }
    return RendererI18n.msgRenderer(key, params);
  }

  const TOAST_POSITIONS = new Set([
    'top-right',
    'bottom-right',
    'top-left',
    'bottom-left'
  ]);

  function normalizeToastPosition(position) {
    return TOAST_POSITIONS.has(position) ? position : 'top-right';
  }

  function ensureToastContainer(containerId, position) {
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      container.className = 'tot-toast-container';
      document.body.appendChild(container);
    }
    container.dataset.position = normalizeToastPosition(position);
    return container;
  }

  function toastText(text, { containerId = 'totToastContainer', position = 'top-right', duration = 4500, type = 'info' } = {}) {
    if (!document || !document.body) {
      throw new Error('[notify] toastText unavailable: document/body not ready.');
    }

    const msg = (typeof text === 'string') ? text : String(text);
    const container = ensureToastContainer(containerId, position);
    const toast = document.createElement('div');
    toast.className = 'tot-toast';
    toast.dataset.type = type;
    toast.dataset.state = 'entering';
    toast.textContent = msg;

    container.appendChild(toast);

    const showToast = () => {
      toast.dataset.state = 'visible';
    };
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(showToast);
    } else {
      log.warnOnce(
        'notify.toast.request-animation-frame-unavailable',
        'Toast presentation: requestAnimationFrame unavailable; using setTimeout fallback.'
      );
      setTimeout(showToast, 0);
    }

    const safeDuration = Number.isFinite(duration) ? Math.max(0, duration) : 4500;
    const removeToast = () => {
      toast.dataset.state = 'closing';
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 250);
    };

    if (safeDuration === 0) {
      removeToast();
    } else {
      setTimeout(removeToast, safeDuration);
    }
  }

  // =============================================================================
  // Modal focus containment / restoration
  // =============================================================================

  const sequentialFocusSelector = [
    'a[href]',
    'area[href]',
    'button',
    'input:not([type="hidden"])',
    'select',
    'textarea',
    'iframe',
    'object',
    'embed',
    '[contenteditable]:not([contenteditable="false"])',
    '[tabindex]',
  ].join(',');
  const modalFocusStack = [];
  let modalKeydownListening = false;

  function getAttribute(element, name) {
    return element && typeof element.getAttribute === 'function'
      ? element.getAttribute(name)
      : null;
  }

  function isElementConnected(element) {
    if (!element) return false;
    if (typeof element.isConnected === 'boolean') return element.isConnected;
    return !document || typeof document.contains !== 'function' || document.contains(element);
  }

  function isWithinModal(modal, element) {
    if (!modal || !element) return false;
    if (modal === element) return true;
    return typeof modal.contains === 'function' && modal.contains(element);
  }

  function isElementDisabled(element) {
    return !!(element
      && (element.disabled === true
        || getAttribute(element, 'aria-disabled') === 'true'));
  }

  function isElementVisiblyAvailable(element, modal) {
    if (!element || !isElementConnected(element) || !isWithinModal(modal, element)) return false;

    let current = element;
    while (current) {
      if (current.hidden === true
        || current.inert === true
        || getAttribute(current, 'hidden') !== null
        || getAttribute(current, 'inert') !== null
        || getAttribute(current, 'aria-hidden') === 'true') {
        return false;
      }
      if (typeof window.getComputedStyle === 'function') {
        const style = window.getComputedStyle(current);
        if (style && (style.display === 'none' || style.visibility === 'hidden')) {
          return false;
        }
      }
      if (current === modal) break;
      current = current.parentElement || current.parentNode || null;
    }
    return current === modal;
  }

  function isSequentialFocusTarget(element, modal) {
    if (!element
      || typeof element.focus !== 'function'
      || isElementDisabled(element)
      || !isElementVisiblyAvailable(element, modal)) {
      return false;
    }
    const tabIndex = Number(element.tabIndex);
    return Number.isFinite(tabIndex) && tabIndex >= 0;
  }

  function getSequentialFocusTargets(modal) {
    if (!modal || typeof modal.querySelectorAll !== 'function') return [];
    const targets = Array.from(modal.querySelectorAll(sequentialFocusSelector))
      .filter((element) => isSequentialFocusTarget(element, modal));

    return targets
      .map((element, domIndex) => ({ element, domIndex, tabIndex: Number(element.tabIndex) }))
      .sort((left, right) => {
        const leftPositive = left.tabIndex > 0;
        const rightPositive = right.tabIndex > 0;
        if (leftPositive && rightPositive && left.tabIndex !== right.tabIndex) {
          return left.tabIndex - right.tabIndex;
        }
        if (leftPositive !== rightPositive) return leftPositive ? -1 : 1;
        return left.domIndex - right.domIndex;
      })
      .map(({ element }) => element);
  }

  function focusWithoutScroll(element) {
    if (!element || typeof element.focus !== 'function') return false;
    try {
      element.focus({ preventScroll: true });
    } catch (err) {
      log.warnOnce(
        'notify.focus.preventScroll.failed',
        'focus({ preventScroll: true }) failed; falling back to focus().',
        err
      );
      element.focus();
    }
    return document.activeElement === element;
  }

  function ensureFallbackFocusable(entry) {
    const fallback = entry && entry.fallbackFocus;
    if (!fallback || typeof fallback.focus !== 'function') return false;
    const tabIndex = Number(fallback.tabIndex);
    if (Number.isFinite(tabIndex) && tabIndex >= 0) return true;
    if (getAttribute(fallback, 'tabindex') === null && typeof fallback.setAttribute === 'function') {
      fallback.setAttribute('tabindex', '-1');
      entry.addedFallbackTabIndex = true;
    }
    return true;
  }

  function focusEntryFallback(entry) {
    if (!entry
      || !isElementVisiblyAvailable(entry.fallbackFocus, entry.modal)
      || !ensureFallbackFocusable(entry)
      || !focusWithoutScroll(entry.fallbackFocus)) {
      log.error('Modal focus fallback unavailable; focus containment invariant failed.');
      return false;
    }
    return true;
  }

  function focusEntryBoundary(entry, reverse) {
    const targets = getSequentialFocusTargets(entry.modal);
    if (!targets.length) return focusEntryFallback(entry);
    return focusWithoutScroll(reverse ? targets[targets.length - 1] : targets[0]);
  }

  function handleModalFocusKeydown(event) {
    if (!event || event.key !== 'Tab' || event.defaultPrevented || !modalFocusStack.length) return;

    const entry = modalFocusStack[modalFocusStack.length - 1];
    const targets = getSequentialFocusTargets(entry.modal);
    if (!targets.length) {
      event.preventDefault();
      focusEntryFallback(entry);
      return;
    }

    const activeElement = document.activeElement;
    const activeIndex = targets.indexOf(activeElement);
    const reverse = event.shiftKey === true;
    const shouldWrap = activeIndex === -1
      || (!reverse && activeIndex === targets.length - 1)
      || (reverse && activeIndex === 0);
    if (!shouldWrap) return;

    event.preventDefault();
    focusWithoutScroll(reverse ? targets[targets.length - 1] : targets[0]);
  }

  function syncModalKeydownListener() {
    if (modalFocusStack.length && !modalKeydownListening) {
      document.addEventListener('keydown', handleModalFocusKeydown, true);
      modalKeydownListening = true;
      return;
    }
    if (!modalFocusStack.length && modalKeydownListening) {
      document.removeEventListener('keydown', handleModalFocusKeydown, true);
      modalKeydownListening = false;
    }
  }

  function activateModalFocus(modal, { initialFocus = null, fallbackFocus = modal } = {}) {
    if (!modal || typeof modal.querySelectorAll !== 'function') {
      throw new Error('[notify] activateModalFocus requires a modal element');
    }
    if (!fallbackFocus || !isWithinModal(modal, fallbackFocus)) {
      throw new Error('[notify] activateModalFocus requires a fallback inside the modal');
    }
    if (modalFocusStack.some((entry) => entry.modal === modal)) return;

    const entry = {
      modal,
      opener: document.activeElement || null,
      fallbackFocus,
      addedFallbackTabIndex: false,
    };
    modalFocusStack.push(entry);
    syncModalKeydownListener();

    if (isSequentialFocusTarget(initialFocus, modal) && focusWithoutScroll(initialFocus)) return;
    if (initialFocus) {
      log.warn('Modal initial focus target unavailable; using modal focus fallback.');
    }
    focusEntryBoundary(entry, false);
  }

  function isRestorableFocusTarget(element, activeModal = null) {
    if (!element
      || typeof element.focus !== 'function'
      || !isElementConnected(element)
      || isElementDisabled(element)) {
      return false;
    }
    if (activeModal && !isWithinModal(activeModal, element)) return false;

    let current = element;
    while (current) {
      if (current.hidden === true
        || current.inert === true
        || getAttribute(current, 'hidden') !== null
        || getAttribute(current, 'inert') !== null
        || getAttribute(current, 'aria-hidden') === 'true') {
        return false;
      }
      if (current === activeModal) break;
      current = current.parentElement || current.parentNode || null;
    }
    return !activeModal || current === activeModal;
  }

  function removeFallbackTabIndex(entry) {
    if (!entry || !entry.addedFallbackTabIndex) return;
    if (entry.fallbackFocus && typeof entry.fallbackFocus.removeAttribute === 'function') {
      entry.fallbackFocus.removeAttribute('tabindex');
    }
    entry.addedFallbackTabIndex = false;
  }

  function deactivateModalFocus(modal) {
    const modalIndex = modalFocusStack.findIndex((entry) => entry.modal === modal);
    if (modalIndex < 0) return;

    const removedEntries = modalFocusStack.splice(modalIndex);
    const closedEntry = removedEntries[0];
    removedEntries.forEach(removeFallbackTabIndex);
    syncModalKeydownListener();

    const activeEntry = modalFocusStack[modalFocusStack.length - 1] || null;
    if (isRestorableFocusTarget(closedEntry.opener, activeEntry && activeEntry.modal)
      && focusWithoutScroll(closedEntry.opener)) {
      return;
    }
    if (activeEntry) {
      log.warn('Modal focus restoration target unavailable; using parent modal focus fallback.');
      focusEntryBoundary(activeEntry, false);
      return;
    }
    if (closedEntry.opener) {
      log.warn('Modal focus restoration target unavailable; focus was not restored.');
    }
  }

  // =============================================================================
  // Entry points (public API)
  // =============================================================================
  function notifyMain(key, params = {}) {
    const msg = resolveText(key, params);
    alert(msg);
  }

  function confirmMain(key, params = {}) {
    const msg = resolveText(key, params);
    return confirm(msg);
  }

  function registerCustomPrompt(name, handler) {
    const promptName = (typeof name === 'string') ? name.trim() : '';
    if (!/^prompt[A-Za-z0-9_]+$/.test(promptName)) {
      throw new Error('[notify] registerCustomPrompt requires a prompt* method name');
    }
    if (typeof handler !== 'function') {
      throw new Error('[notify] registerCustomPrompt requires a function handler');
    }
    if (Object.prototype.hasOwnProperty.call(notifyApi, promptName)) {
      throw new Error(`[notify] registerCustomPrompt duplicate name: ${promptName}`);
    }
    notifyApi[promptName] = handler;
  }

  function toastMain(key, { type = 'info', duration = 9000, params = {} } = {}) {
    const msg = resolveText(key, params);
    try {
      toastText(msg, { containerId: 'totMainToastContainer', position: 'top-right', type, duration });
    } catch (err) {
      log.warn('toastMain failed; falling back to notifyMain:', err);
      try {
        notifyMain(key);
      } catch (fallbackErr) {
        log.error('toastMain fallback failed:', fallbackErr);
      }
    }
  }

  function toastEditorText(text, { type = 'info', duration = 4500 } = {}) {
    try {
      toastText(text, { containerId: 'totEditorToastContainer', position: 'top-right', type, duration });
    } catch (err) {
      log.warn('toastEditorText failed; falling back to notifyMain:', err);
      try {
        if (typeof notifyMain === 'function') {
          notifyMain(text);
        } else {
          log.errorOnce(
            'notify.toastEditorText.notifyMain.missing',
            'toastEditorText fallback unavailable: notifyMain missing; notice dropped.'
          );
        }
      } catch (fallbackErr) {
        log.error('toastEditorText fallback failed:', fallbackErr);
      }
    }
  }

  function notifyEditor(key, { type = 'info', duration = 4500, params = {} } = {}) {
    const msg = resolveText(key, params);
    try {
      toastEditorText(msg, { type, duration });
    } catch (err) {
      log.warn('notifyEditor failed; falling back to notifyMain:', err);
      try {
        notifyMain(key);
      } catch (fallbackErr) {
        log.error('notifyEditor fallback failed:', fallbackErr);
      }
    }
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================
  const notifyApi = {
    activateModalFocus,
    confirmMain,
    deactivateModalFocus,
    notifyMain,
    notifyEditor,
    registerCustomPrompt,
    toastMain,
    toastEditorText
  };
  window.Notify = notifyApi;
})();

// =============================================================================
// End of public/js/notify.js
// =============================================================================
