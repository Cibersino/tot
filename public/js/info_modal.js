// public/js/info_modal.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Own the Info modal DOM, state, open/close lifecycle, and modal focus.
// - Load and render static Info documents and localized manual documents.
// - Invalidate stale asynchronous renders and preserve state during language refresh.
// - Hydrate About version, runtime, and document-availability details.
// - Expose the narrow Info-modal integration surface consumed by public/renderer.js.

(() => {
  // =============================================================================
  // Imports / logger
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[info-modal] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('info-modal');
  log.debug('Info modal starting...');

  const { AppConstants, RendererI18n } = window;
  if (!AppConstants || typeof AppConstants.DEFAULT_LANG !== 'string' || !AppConstants.DEFAULT_LANG.trim()) {
    throw new Error('[info-modal] AppConstants.DEFAULT_LANG unavailable; cannot continue');
  }
  if (!RendererI18n
    || typeof RendererI18n.getLanguageDirection !== 'function'
    || typeof RendererI18n.loadLocalizedDocument !== 'function'
    || typeof RendererI18n.msgRenderer !== 'function'
    || typeof RendererI18n.tRenderer !== 'function') {
    throw new Error('[info-modal] RendererI18n unavailable; cannot continue');
  }
  if (!window.Notify
    || typeof window.Notify.activateModalFocus !== 'function'
    || typeof window.Notify.deactivateModalFocus !== 'function') {
    throw new Error('[info-modal] Notify modal-focus API unavailable; cannot continue');
  }

  const { DEFAULT_LANG } = AppConstants;
  const { getLanguageDirection, loadLocalizedDocument, msgRenderer, tRenderer } = RendererI18n;
  const { bindInfoModalLinks, enhanceInfoModalScreenshots } = window.InfoModalLinks || {};

  // =============================================================================
  // Shared state
  // =============================================================================
  let infoModal = null;
  let infoModalBackdrop = null;
  let infoModalClose = null;
  let infoModalTitle = null;
  let infoModalContent = null;
  let getCurrentLanguage = null;
  let openInfoModalKey = '';
  let infoModalRenderVersion = 0;
  let openInfoModalInstance = 0;
  let documentUnavailableForOpenInstance = false;
  let aboutVersionOutcomePromise = null;
  let aboutEnvironmentOutcomePromise = null;
  let uiBound = false;

  // =============================================================================
  // Document rendering
  // =============================================================================
  async function fetchText(path) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      log.warn('fetchText failed; info modal will show unavailable content:', path, err);
      return null;
    }
  }

  function translateInfoHtml(htmlString, key) {
    try {
      if (typeof htmlString !== 'string' || !htmlString.trim()) return null;
      const doc = new DOMParser().parseFromString(htmlString, 'text/html');
      doc.querySelectorAll('[data-i18n]').forEach((el) => {
        const dataKey = el.getAttribute('data-i18n');
        if (!dataKey) {
          throw new Error('Info document contains an empty data-i18n key');
        }
        const translationKey = `renderer.info.${key}.${dataKey}`;
        el.textContent = tRenderer(translationKey);
      });
      return doc.body.innerHTML;
    } catch (err) {
      log.warn('translateInfoHtml failed:', err);
      return null;
    }
  }

  function extractInfoBodyHtml(htmlString) {
    try {
      if (typeof htmlString !== 'string' || !htmlString.trim()) return null;
      const doc = new DOMParser().parseFromString(htmlString, 'text/html');
      return doc && doc.body ? doc.body.innerHTML : null;
    } catch (err) {
      log.warn('extractInfoBodyHtml failed:', err);
      return null;
    }
  }

  function getDescriptor(key) {
    if (key === 'acerca_de') {
      return { documentId: 'renderer.info.acerca_de', isManual: true, sectionId: '' };
    }
    if (key === 'links_interes') return { fileToLoad: './info/links_interes.html', isManual: false, sectionId: '' };
    const sectionByKey = { guia_basica: 'guia-basica', instrucciones: 'instrucciones', faq: 'faq' };
    if (!Object.prototype.hasOwnProperty.call(sectionByKey, key)) return null;
    return { documentId: 'renderer.info.instructions', isManual: true, sectionId: sectionByKey[key] };
  }

  // =============================================================================
  // Focus and section targeting
  // =============================================================================
  function focusClose() {
    infoModalClose.focus({ preventScroll: true });
  }

  function scrollToSection(panel, sectionId) {
    requestAnimationFrame(() => {
      try {
        const target = infoModalContent.querySelector(`#${sectionId}`);
        if (!target) {
          log.warn('Info modal requested section unavailable; retaining Close focus:', sectionId);
          focusClose();
          return;
        }
        try {
          target.scrollIntoView({ behavior: 'auto', block: 'start' });
        } catch (err) {
          log.warn('Info modal native section scroll failed; using panel scroll fallback:', sectionId, err);
          const panelRect = panel.getBoundingClientRect();
          const targetRect = target.getBoundingClientRect();
          const desired = (targetRect.top - panelRect.top) + panel.scrollTop;
          panel.scrollTo({ top: Math.max(0, Math.min(desired, panel.scrollHeight - panel.clientHeight)), behavior: 'auto' });
        }
        const indexLink = infoModalContent.querySelector(`nav a[href="#${sectionId}"]`);
        if (!indexLink || typeof indexLink.focus !== 'function') {
          log.warn('Info modal matching index link unavailable; retaining Close focus:', sectionId);
          focusClose();
          return;
        }
        indexLink.focus({ preventScroll: true });
      } catch (err) {
        log.warn('Info modal section targeting failed; retaining Close focus:', sectionId, err);
        focusClose();
      }
    });
  }

  // =============================================================================
  // About hydration
  // =============================================================================
  function getAboutVersionOutcome() {
    if (aboutVersionOutcomePromise) return aboutVersionOutcomePromise;
    aboutVersionOutcomePromise = (async () => {
      if (!window.electronAPI || typeof window.electronAPI.getAppVersion !== 'function') {
        log.warn('getAppVersion not available for About modal.');
        return { value: '' };
      }
      try {
        const version = await window.electronAPI.getAppVersion();
        const value = typeof version === 'string' ? version.trim() : '';
        if (!value) log.warn('getAppVersion returned empty; About modal shows unavailable.');
        return { value };
      } catch (err) {
        log.warn('getAppVersion failed; About modal shows unavailable:', err);
        return { value: '' };
      }
    })();
    return aboutVersionOutcomePromise;
  }

  async function hydrateAboutVersion(container, isCurrentRender) {
    const outcome = await getAboutVersionOutcome();
    if (typeof isCurrentRender === 'function' && !isCurrentRender()) return;
    const versionEl = container ? container.querySelector('#appVersion') : null;
    if (!versionEl) {
      log.warn('About version target unavailable; skipping version hydration.');
      return;
    }
    versionEl.textContent = outcome.value || tRenderer('renderer.info.acerca_de.version.unavailable');
  }

  function getAboutEnvironmentOutcome() {
    if (aboutEnvironmentOutcomePromise) return aboutEnvironmentOutcomePromise;
    aboutEnvironmentOutcomePromise = (async () => {
      const defaultSharpRuntimePackage = '@img/sharp-<plataforma>-<arquitectura>@0.34.4';
      if (!window.electronAPI || typeof window.electronAPI.getAppRuntimeInfo !== 'function') {
        log.warn('getAppRuntimeInfo not available for About modal.');
        return { unavailable: true, includeSharpRuntimeNames: false, sharpRuntimePackage: '' };
      }
      try {
        const info = await window.electronAPI.getAppRuntimeInfo();
        const platform = info && typeof info.platform === 'string' ? info.platform.trim() : '';
        const arch = info && typeof info.arch === 'string' ? info.arch.trim() : '';
        const electronVersion = info && typeof info.electronVersion === 'string' ? info.electronVersion.trim() : '';
        const chromeVersion = info && typeof info.chromeVersion === 'string' ? info.chromeVersion.trim() : '';
        const nodeVersion = info && typeof info.nodeVersion === 'string' ? info.nodeVersion.trim() : '';
        const platformMap = { win32: 'Windows', darwin: 'macOS', linux: 'Linux' };
        const osLabel = platformMap[platform] || platform;
        const sharpRuntimePackageMap = {
          'win32:x64': '@img/sharp-win32-x64@0.34.4',
          'darwin:x64': '@img/sharp-darwin-x64@0.34.4',
          'darwin:arm64': '@img/sharp-darwin-arm64@0.34.4',
          'linux:x64': '@img/sharp-linux-x64@0.34.4',
        };
        const sharpRuntimePackage = sharpRuntimePackageMap[`${platform}:${arch}`]
          || defaultSharpRuntimePackage;
        if (!osLabel || !arch) {
          log.warn('getAppRuntimeInfo missing platform/arch; About modal shows unavailable.');
          return {
            unavailable: true,
            includeSharpRuntimeNames: true,
            sharpRuntimePackage,
          };
        }
        if (!electronVersion || !chromeVersion || !nodeVersion) {
          log.warn('getAppRuntimeInfo missing runtime version fields; About modal shows unavailable fields.');
        }
        let licenseAvailable = false;
        let noticeAvailable = false;
        if (typeof window.electronAPI.getAppDocAvailability === 'function') {
          try {
            const [license, notice] = await Promise.all([
              window.electronAPI.getAppDocAvailability('license-text-extraction-image-processing-runtime'),
              window.electronAPI.getAppDocAvailability('notice-text-extraction-image-processing-runtime'),
            ]);
            licenseAvailable = !!(license && license.available);
            noticeAvailable = !!(notice && notice.available);
          } catch (err) {
            log.warn('getAppDocAvailability failed; About modal document availability defaults to hidden:', err);
          }
        } else {
          log.warn('getAppDocAvailability unavailable; About modal document availability defaults to hidden.');
        }
        return {
          unavailable: false,
          osLabel,
          arch,
          electronVersion,
          chromeVersion,
          nodeVersion,
          sharpRuntimePackage,
          licenseAvailable,
          noticeAvailable,
        };
      } catch (err) {
        log.warn('getAppRuntimeInfo failed; About modal shows unavailable:', err);
        return {
          unavailable: true,
          includeSharpRuntimeNames: true,
          sharpRuntimePackage: defaultSharpRuntimePackage,
        };
      }
    })();
    return aboutEnvironmentOutcomePromise;
  }

  async function hydrateAboutEnvironment(container, isCurrentRender) {
    const outcome = await getAboutEnvironmentOutcome();
    if (typeof isCurrentRender === 'function' && !isCurrentRender()) return;
    const envEl = container ? container.querySelector('#appEnv') : null;
    const runtimeEl = container ? container.querySelector('#appRuntimeVersions') : null;
    const sharpRuntimeLicenseRow = container ? container.querySelector('#sharpRuntimeLicenseRow') : null;
    const sharpRuntimeNoticeRow = container ? container.querySelector('#sharpRuntimeNoticeRow') : null;
    const sharpRuntimeEl = container ? container.querySelector('#sharpRuntimePackageName') : null;
    const sharpRuntimeNoticeEl = container ? container.querySelector('#sharpRuntimeNoticePackageName') : null;
    if (!envEl) {
      log.warn('About environment target unavailable; skipping environment hydration.');
      return;
    }
    const missingOptionalTargetIds = [];
    if (!runtimeEl) missingOptionalTargetIds.push('#appRuntimeVersions');
    if (!sharpRuntimeLicenseRow) missingOptionalTargetIds.push('#sharpRuntimeLicenseRow');
    if (!sharpRuntimeNoticeRow) missingOptionalTargetIds.push('#sharpRuntimeNoticeRow');
    if (!sharpRuntimeEl) missingOptionalTargetIds.push('#sharpRuntimePackageName');
    if (!sharpRuntimeNoticeEl) missingOptionalTargetIds.push('#sharpRuntimeNoticePackageName');
    if (missingOptionalTargetIds.length) {
      log.warn('About document targets unavailable; partial hydration skipped:', missingOptionalTargetIds);
    }
    const unavailableText = tRenderer('renderer.info.acerca_de.env.unavailable');
    if (outcome.unavailable) {
      envEl.textContent = unavailableText;
      if (runtimeEl) runtimeEl.textContent = unavailableText;
      if (outcome.includeSharpRuntimeNames) {
        if (sharpRuntimeEl) sharpRuntimeEl.textContent = outcome.sharpRuntimePackage;
        if (sharpRuntimeNoticeEl) sharpRuntimeNoticeEl.textContent = outcome.sharpRuntimePackage;
      }
      if (sharpRuntimeLicenseRow) sharpRuntimeLicenseRow.hidden = true;
      if (sharpRuntimeNoticeRow) sharpRuntimeNoticeRow.hidden = true;
      return;
    }
    envEl.textContent = `${outcome.osLabel} (${outcome.arch})`;
    if (sharpRuntimeEl) sharpRuntimeEl.textContent = outcome.sharpRuntimePackage;
    if (sharpRuntimeNoticeEl) sharpRuntimeNoticeEl.textContent = outcome.sharpRuntimePackage;
    if (runtimeEl) {
      runtimeEl.textContent = [
        outcome.electronVersion ? `Electron ${outcome.electronVersion}` : `Electron ${unavailableText}`,
        outcome.chromeVersion ? `Chromium ${outcome.chromeVersion}` : `Chromium ${unavailableText}`,
        outcome.nodeVersion ? `Node.js ${outcome.nodeVersion}` : `Node.js ${unavailableText}`,
      ].join(' | ');
    }
    if (sharpRuntimeLicenseRow) sharpRuntimeLicenseRow.hidden = !outcome.licenseAvailable;
    if (sharpRuntimeNoticeRow) sharpRuntimeNoticeRow.hidden = !outcome.noticeAvailable;
  }

  // =============================================================================
  // Modal lifecycle
  // =============================================================================
  function resetOpenInstanceOutcomes() {
    documentUnavailableForOpenInstance = false;
    aboutVersionOutcomePromise = null;
    aboutEnvironmentOutcomePromise = null;
  }

  function isCurrentRender(key, renderVersion, openInstance, container) {
    return openInfoModalKey === key
      && renderVersion === infoModalRenderVersion
      && openInstance === openInfoModalInstance
      && container === infoModalContent
      && infoModal
      && infoModal.getAttribute('aria-hidden') === 'false';
  }

  function renderUnavailableDocument(infoDialogLabel) {
    infoModalContent.innerHTML = `<p class="info-modal-message">${msgRenderer(
      'renderer.info.missing_content',
      { name: infoDialogLabel }
    )}</p>`;
    focusClose();
  }

  function close() {
    try {
      if (!infoModal || !infoModalContent) return;
      openInfoModalKey = '';
      infoModalRenderVersion += 1;
      openInfoModalInstance += 1;
      resetOpenInstanceOutcomes();
      infoModal.setAttribute('aria-hidden', 'true');
      window.Notify.deactivateModalFocus(infoModal);
      infoModalContent.innerHTML = `<div id="infoModalLoading" class="info-loading">${tRenderer('renderer.info.loading')}</div>`;
    } catch (err) {
      log.error('Error closing info modal:', err);
    }
  }

  async function render(key, { open = false, preservedUiState = null } = {}) {
    if (!infoModal || !infoModalTitle || !infoModalContent || !infoModalClose) {
      log.error('Info modal required element unavailable; cannot render.');
      return;
    }
    const descriptor = getDescriptor(key);
    const renderVersion = ++infoModalRenderVersion;
    const openInstance = openInfoModalInstance;
    const contentContainer = infoModalContent;
    const translationKey = (key === 'guia_basica' || key === 'faq') ? 'instrucciones' : key;
    const infoDialogLabel = tRenderer(`renderer.info.${translationKey}.title`);
    infoModalContent.removeAttribute('lang');
    infoModalContent.removeAttribute('dir');
    infoModalTitle.textContent = infoDialogLabel;
    infoModalContent.innerHTML = `<div id="infoModalLoading" class="info-loading">${tRenderer('renderer.info.loading')}</div>`;
    if (open) {
      infoModal.setAttribute('aria-hidden', 'false');
      window.Notify.activateModalFocus(infoModal, { initialFocus: infoModalClose, fallbackFocus: infoModalClose });
    }
    const panel = infoModal.querySelector('.info-modal-panel');
    if (!panel) {
      log.warn('Info modal panel unavailable; retaining Close focus.');
      focusClose();
      return;
    }
    panel.scrollTop = preservedUiState ? preservedUiState.scrollTop : 0;
    if (documentUnavailableForOpenInstance) {
      renderUnavailableDocument(infoDialogLabel);
      return;
    }
    const documentResult = descriptor.isManual
      ? await loadLocalizedDocument(descriptor.documentId, getCurrentLanguage() || DEFAULT_LANG)
      : { html: await fetchText(descriptor.fileToLoad) };
    const currentRender = () => isCurrentRender(key, renderVersion, openInstance, contentContainer);
    if (!currentRender()) return;
    if (!documentResult || documentResult.html === null) {
      log.warn('Info modal content unavailable; showing missing-content state:', key);
      documentUnavailableForOpenInstance = true;
      renderUnavailableDocument(infoDialogLabel);
      return;
    }
    const documentHtml = descriptor.isManual
      ? extractInfoBodyHtml(documentResult.html)
      : translateInfoHtml(documentResult.html, translationKey);
    if (typeof documentHtml !== 'string' || !documentHtml.trim()) {
      log.warn('Info modal content parsing or substitution failed; showing unavailable state:', key);
      documentUnavailableForOpenInstance = true;
      renderUnavailableDocument(infoDialogLabel);
      return;
    }
    infoModalContent.innerHTML = documentHtml;
    if (descriptor.isManual && typeof documentResult.language === 'string' && documentResult.language.trim()) {
      const effectiveDocumentLanguage = documentResult.language.trim();
      infoModalContent.setAttribute('lang', effectiveDocumentLanguage);
      infoModalContent.setAttribute('dir', getLanguageDirection(effectiveDocumentLanguage));
    }
    if (typeof bindInfoModalLinks === 'function' && typeof enhanceInfoModalScreenshots === 'function') {
      enhanceInfoModalScreenshots(infoModalContent);
      bindInfoModalLinks(infoModalContent, { electronAPI: window.electronAPI });
    } else {
      log.warn('InfoModalLinks lifecycle helpers unavailable; modal links and screenshot keyboard support will use default behavior.');
    }
    if (key === 'acerca_de') {
      await hydrateAboutVersion(infoModalContent, currentRender);
      await hydrateAboutEnvironment(infoModalContent, currentRender);
      if (!currentRender()) return;
    }
    if (preservedUiState) {
      panel.scrollTop = preservedUiState.scrollTop;
      if (preservedUiState.hadReplacedContentFocus) focusClose();
      return;
    }
    if (descriptor.sectionId) scrollToSection(panel, descriptor.sectionId);
  }

  async function refreshOpenModal() {
    if (!openInfoModalKey || !infoModal || infoModal.getAttribute('aria-hidden') !== 'false') return;
    const panel = infoModal.querySelector('.info-modal-panel');
    const hadReplacedContentFocus = !!(
      document.activeElement && infoModalContent && infoModalContent.contains(document.activeElement)
    );
    await render(openInfoModalKey, {
      preservedUiState: {
        scrollTop: panel && typeof panel.scrollTop === 'number' ? panel.scrollTop : 0,
        hadReplacedContentFocus,
      },
    });
  }

  function open(key) {
    if (!getDescriptor(key)) {
      log.warn('InfoModal.open received unsupported key:', key);
      return Promise.resolve();
    }
    if (!isOpen() || openInfoModalKey !== key) {
      openInfoModalInstance += 1;
      resetOpenInstanceOutcomes();
    }
    openInfoModalKey = key;
    return render(key, { open: true });
  }

  function isOpen() {
    return !!infoModal && infoModal.getAttribute('aria-hidden') === 'false';
  }

  // =============================================================================
  // Public API
  // =============================================================================
  function applyTranslations() {
    const loading = document.getElementById('infoModalLoading');
    if (loading) loading.textContent = tRenderer('renderer.info.loading');
    if (infoModalClose) infoModalClose.setAttribute('aria-label', tRenderer('renderer.info.close_aria'));
    if (window.InfoModalLinks && typeof window.InfoModalLinks.applyTranslations === 'function') {
      window.InfoModalLinks.applyTranslations();
    }
    void refreshOpenModal().catch((err) => {
      log.warn('Open Info modal language refresh failed (ignored):', err);
    });
  }

  function init({ getCurrentLanguage: getCurrentLanguageInput } = {}) {
    if (typeof getCurrentLanguageInput !== 'function') {
      throw new Error('[info-modal] init requires getCurrentLanguage');
    }
    getCurrentLanguage = getCurrentLanguageInput;
    infoModal = document.getElementById('infoModal');
    infoModalBackdrop = document.getElementById('infoModalBackdrop');
    infoModalClose = document.getElementById('infoModalClose');
    infoModalTitle = document.getElementById('infoModalTitle');
    infoModalContent = document.getElementById('infoModalContent');
    if (uiBound) return;
    if (infoModalClose) infoModalClose.addEventListener('click', close);
    if (infoModalBackdrop) {
      infoModalBackdrop.addEventListener('click', close);
    } else {
      log.warn('Info modal backdrop unavailable; click-to-close binding skipped.');
    }
    window.addEventListener('keydown', (ev) => {
      if (infoModal && ev.key === 'Escape' && infoModal.getAttribute('aria-hidden') === 'false') close();
    });
    uiBound = true;
  }

  window.InfoModal = { init, open, isOpen, applyTranslations };
})();

// =============================================================================
// End of public/js/info_modal.js
// =============================================================================
