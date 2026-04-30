// public/js/browser_extension_modal.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own the browser-extension entry trigger in the main-window brand cluster.
// - Host the browser-extension modal open/close state and focus restoration.
// - Route the Chrome Web Store icon link through the shared external-link bridge.
// =============================================================================

(() => {
  // =============================================================================
  // Imports / logger
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[browser-extension-modal] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('browser-extension-modal');
  log.debug('Browser extension modal starting...');

  if (!window.RendererI18n || typeof window.RendererI18n.tRenderer !== 'function') {
    throw new Error('[browser-extension-modal] RendererI18n.tRenderer unavailable; cannot continue');
  }
  const { tRenderer } = window.RendererI18n;

  // =============================================================================
  // Constants / DOM
  // =============================================================================
  const CHROME_WEB_STORE_URL = 'https://chromewebstore.google.com/detail/aaadjdlieimolidjdkbimjcdojologld';

  const trigger = document.getElementById('browserExtensionLogoLink');
  const modal = document.getElementById('browserExtensionModal');
  const backdrop = document.getElementById('browserExtensionModalBackdrop');
  const closeButton = document.getElementById('browserExtensionModalClose');
  const title = document.getElementById('browserExtensionModalTitle');
  const subtitle = document.getElementById('browserExtensionModalSubtitle');
  const chromeStoreLink = document.getElementById('browserExtensionChromeStoreLink');
  const availability = document.getElementById('browserExtensionModalAvailability');

  function hasRequiredElements() {
    return !!(trigger
      && modal
      && backdrop
      && closeButton
      && title
      && subtitle
      && chromeStoreLink
      && availability);
  }

  if (!hasRequiredElements()) {
    throw new Error('[browser-extension-modal] required DOM missing; cannot continue');
  }

  // =============================================================================
  // Shared state
  // =============================================================================
  let previousFocus = null;
  let interactionLocked = false;
  let initialized = false;
  let electronApiRef = null;
  let hasBlockingModalOpen = () => false;

  // =============================================================================
  // Helpers
  // =============================================================================
  function mapExternalFailureReasonToKey(reason) {
    if (reason === 'blocked') return 'renderer.info.external.blocked';
    return 'renderer.info.external.error';
  }

  function isModalOpen() {
    return modal.getAttribute('aria-hidden') === 'false';
  }

  function readOpenExternalUrl() {
    const api = electronApiRef || window.electronAPI;
    return api && typeof api.openExternalUrl === 'function'
      ? api.openExternalUrl.bind(api)
      : null;
  }

  function setTriggerInteractionLocked(locked) {
    trigger.disabled = locked;
    trigger.setAttribute('aria-disabled', locked ? 'true' : 'false');
  }

  function rememberPreviousFocus() {
    const activeElement = document.activeElement;
    previousFocus = activeElement && typeof activeElement.focus === 'function'
      ? activeElement
      : null;
  }

  function restorePreviousFocus() {
    if (!previousFocus || !document.contains(previousFocus)) return;
    try {
      previousFocus.focus();
    } catch (err) {
      log.warn('Browser extension focus restore failed (ignored):', err);
    }
  }

  function setModalVisible(visible) {
    modal.setAttribute('aria-hidden', visible ? 'false' : 'true');
    if (visible) {
      const panel = modal.querySelector('.browser-extension-modal-panel');
      if (panel) panel.scrollTop = 0;
      chromeStoreLink.focus();
      return;
    }
    restorePreviousFocus();
  }

  function closeModal() {
    if (!isModalOpen()) return;
    setModalVisible(false);
  }

  function openModal() {
    if (interactionLocked || isModalOpen()) return;
    if (hasBlockingModalOpen()) {
      log.info('Browser extension modal open blocked because another main-window modal is open.');
      window.Notify.notifyMain('renderer.alerts.modal_unavailable');
      return;
    }

    rememberPreviousFocus();
    setModalVisible(true);
  }

  function handleChromeStoreLinkClick(event) {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }

    if (interactionLocked) return;

    const openExternalUrl = readOpenExternalUrl();
    if (!openExternalUrl) {
      log.warnOnce(
        'browser-extension-modal.external-link.missing',
        'openExternalUrl unavailable; browser extension external link open failed (ignored).'
      );
      window.Notify.notifyMain('renderer.info.external.blocked');
      return;
    }

    try {
      Promise.resolve(openExternalUrl(CHROME_WEB_STORE_URL))
        .then((result) => {
          if (!result || typeof result.ok !== 'boolean') {
            log.error('Browser extension external link result invalid:', result);
            window.Notify.notifyMain('renderer.info.external.error');
            return;
          }
          if (result.ok === true) {
            closeModal();
            return;
          }
          window.Notify.notifyMain(mapExternalFailureReasonToKey(result.reason));
          log.warn('Browser extension external link blocked or failed:', CHROME_WEB_STORE_URL, result);
        })
        .catch((err) => {
          log.error('Browser extension external link request failed:', err);
          window.Notify.notifyMain('renderer.info.external.error');
        });
    } catch (err) {
      log.error('Browser extension external link request failed:', err);
      window.Notify.notifyMain('renderer.info.external.error');
    }
  }

  function bindStaticListeners() {
    trigger.addEventListener('click', openModal);
    closeButton.addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);
    chromeStoreLink.addEventListener('click', handleChromeStoreLinkClick);
    window.addEventListener('keydown', (event) => {
      if (!isModalOpen() || event.key !== 'Escape') return;
      event.preventDefault();
      closeModal();
    });
  }

  // =============================================================================
  // Public API
  // =============================================================================
  function applyTranslations() {
    const triggerTooltip = tRenderer('renderer.main.tooltips.browser_extension');
    const triggerAria = tRenderer('renderer.main.aria.browser_extension');
    const chromeStoreAria = tRenderer('renderer.browser_extension.chrome_store_aria');

    trigger.title = triggerTooltip;
    trigger.setAttribute('aria-label', triggerAria);
    title.textContent = tRenderer('renderer.browser_extension.title');
    subtitle.textContent = tRenderer('renderer.browser_extension.subtitle');
    availability.textContent = tRenderer('renderer.browser_extension.availability');
    closeButton.setAttribute('aria-label', tRenderer('renderer.browser_extension.close_aria'));
    chromeStoreLink.title = chromeStoreAria;
    chromeStoreLink.setAttribute('aria-label', chromeStoreAria);
  }

  function configure({ electronAPI, hasBlockingModalOpen: nextHasBlockingModalOpen } = {}) {
    electronApiRef = electronAPI || window.electronAPI || null;
    hasBlockingModalOpen = typeof nextHasBlockingModalOpen === 'function'
      ? nextHasBlockingModalOpen
      : () => false;
    chromeStoreLink.href = CHROME_WEB_STORE_URL;

    if (!initialized) {
      initialized = true;
      bindStaticListeners();
    }

    setTriggerInteractionLocked(interactionLocked);
  }

  function setInteractionLocked(locked) {
    interactionLocked = !!locked;
    setTriggerInteractionLocked(interactionLocked);
    if (interactionLocked) {
      closeModal();
    }
  }

  window.BrowserExtensionModal = {
    applyTranslations,
    configure,
    hasBlockingModalOpen: isModalOpen,
    setInteractionLocked,
  };
})();

// =============================================================================
// End of public/js/browser_extension_modal.js
// =============================================================================
