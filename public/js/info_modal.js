// public/js/info_modal.js
'use strict';

// Owns Info modal state, DOM lifecycle, document rendering, and About hydration.
(() => {
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
  let infoModal = null;
  let infoModalBackdrop = null;
  let infoModalClose = null;
  let infoModalTitle = null;
  let infoModalContent = null;
  let getCurrentLanguage = null;
  let openInfoModalKey = '';
  let infoModalRenderVersion = 0;
  let uiBound = false;

  async function fetchText(path) {
    try {
      const res = await fetch(path, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      log.warn('fetchText failed; info modal will fallback:', path, err);
      return null;
    }
  }

  function translateInfoHtml(htmlString, key) {
    try {
      const doc = new DOMParser().parseFromString(htmlString, 'text/html');
      doc.querySelectorAll('[data-i18n]').forEach((el) => {
        const dataKey = el.getAttribute('data-i18n');
        if (!dataKey) return;
        const translated = tRenderer(`renderer.info.${key}.${dataKey}`);
        if (translated) el.textContent = translated;
      });
      return doc.body.innerHTML;
    } catch (err) {
      log.warn('translateInfoHtml failed:', err);
      return htmlString;
    }
  }

  function extractInfoBodyHtml(htmlString) {
    try {
      return new DOMParser().parseFromString(htmlString, 'text/html').body.innerHTML;
    } catch (err) {
      log.warn('extractInfoBodyHtml failed:', err);
      return htmlString;
    }
  }

  function getDescriptor(key) {
    if (key === 'acerca_de') return { fileToLoad: './info/acerca_de.html', isManual: false, sectionId: '' };
    if (key === 'links_interes') return { fileToLoad: './info/links_interes.html', isManual: false, sectionId: '' };
    const sectionByKey = { guia_basica: 'guia-basica', instrucciones: 'instrucciones', faq: 'faq' };
    if (!Object.prototype.hasOwnProperty.call(sectionByKey, key)) return null;
    return { documentId: 'renderer.info.instructions', isManual: true, sectionId: sectionByKey[key] };
  }

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

  async function hydrateAboutVersion(container) {
    const versionEl = container ? container.querySelector('#appVersion') : null;
    if (!versionEl) return;
    const unavailableText = tRenderer('renderer.info.acerca_de.version.unavailable');
    if (!window.electronAPI || typeof window.electronAPI.getAppVersion !== 'function') {
      log.warn('getAppVersion not available for About modal.');
      versionEl.textContent = unavailableText;
      return;
    }
    try {
      const version = await window.electronAPI.getAppVersion();
      const cleaned = typeof version === 'string' ? version.trim() : '';
      if (!cleaned) {
        log.warn('getAppVersion returned empty; About modal shows N/A.');
        versionEl.textContent = unavailableText;
        return;
      }
      versionEl.textContent = cleaned;
    } catch (err) {
      log.warn('getAppVersion failed; About modal shows N/A:', err);
      versionEl.textContent = unavailableText;
    }
  }

  async function hydrateAboutEnvironment(container) {
    const envEl = container ? container.querySelector('#appEnv') : null;
    const runtimeEl = container ? container.querySelector('#appRuntimeVersions') : null;
    const sharpRuntimeLicenseRow = container ? container.querySelector('#sharpRuntimeLicenseRow') : null;
    const sharpRuntimeNoticeRow = container ? container.querySelector('#sharpRuntimeNoticeRow') : null;
    const sharpRuntimeEl = container ? container.querySelector('#sharpRuntimePackageName') : null;
    const sharpRuntimeNoticeEl = container ? container.querySelector('#sharpRuntimeNoticePackageName') : null;
    if (!envEl) return;
    const unavailableText = tRenderer('renderer.info.acerca_de.env.unavailable');
    const defaultSharpRuntimePackage = '@img/sharp-<plataforma>-<arquitectura>@0.34.4';
    const applyUnavailableEnvironmentState = ({ includeSharpRuntimeNames = false } = {}) => {
      envEl.textContent = unavailableText;
      if (runtimeEl) runtimeEl.textContent = unavailableText;
      if (includeSharpRuntimeNames) {
        if (sharpRuntimeEl) sharpRuntimeEl.textContent = defaultSharpRuntimePackage;
        if (sharpRuntimeNoticeEl) sharpRuntimeNoticeEl.textContent = defaultSharpRuntimePackage;
      }
      if (sharpRuntimeLicenseRow) sharpRuntimeLicenseRow.hidden = true;
      if (sharpRuntimeNoticeRow) sharpRuntimeNoticeRow.hidden = true;
    };
    if (!window.electronAPI || typeof window.electronAPI.getAppRuntimeInfo !== 'function') {
      log.warn('getAppRuntimeInfo not available for About modal.');
      applyUnavailableEnvironmentState();
      return;
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
        || '@img/sharp-<plataforma>-<arquitectura>@0.34.4';
      if (!osLabel || !arch) {
        log.warn('getAppRuntimeInfo missing platform/arch; About modal shows N/A.');
        applyUnavailableEnvironmentState({ includeSharpRuntimeNames: true });
        return;
      }
      envEl.textContent = `${osLabel} (${arch})`;
      if (sharpRuntimeEl) sharpRuntimeEl.textContent = sharpRuntimePackage;
      if (sharpRuntimeNoticeEl) sharpRuntimeNoticeEl.textContent = sharpRuntimePackage;
      if (runtimeEl) {
        runtimeEl.textContent = [
          electronVersion ? `Electron ${electronVersion}` : `Electron ${unavailableText}`,
          chromeVersion ? `Chromium ${chromeVersion}` : `Chromium ${unavailableText}`,
          nodeVersion ? `Node.js ${nodeVersion}` : `Node.js ${unavailableText}`,
        ].join(' | ');
      }
      if (window.electronAPI && typeof window.electronAPI.getAppDocAvailability === 'function') {
        try {
          const [licenseAvailability, noticeAvailability] = await Promise.all([
            window.electronAPI.getAppDocAvailability('license-text-extraction-image-processing-runtime'),
            window.electronAPI.getAppDocAvailability('notice-text-extraction-image-processing-runtime'),
          ]);
          if (sharpRuntimeLicenseRow) sharpRuntimeLicenseRow.hidden = !(licenseAvailability && licenseAvailability.available);
          if (sharpRuntimeNoticeRow) sharpRuntimeNoticeRow.hidden = !(noticeAvailability && noticeAvailability.available);
        } catch (err) {
          log.warn('getAppDocAvailability failed; About modal document availability defaults to hidden:', err);
          if (sharpRuntimeLicenseRow) sharpRuntimeLicenseRow.hidden = true;
          if (sharpRuntimeNoticeRow) sharpRuntimeNoticeRow.hidden = true;
        }
      } else {
        log.warn('getAppDocAvailability unavailable; About modal document availability defaults to hidden.');
        if (sharpRuntimeLicenseRow) sharpRuntimeLicenseRow.hidden = true;
        if (sharpRuntimeNoticeRow) sharpRuntimeNoticeRow.hidden = true;
      }
    } catch (err) {
      log.warn('getAppRuntimeInfo failed; About modal shows N/A:', err);
      applyUnavailableEnvironmentState({ includeSharpRuntimeNames: true });
    }
  }

  function close() {
    try {
      if (!infoModal || !infoModalContent) return;
      openInfoModalKey = '';
      infoModalRenderVersion += 1;
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
    const documentResult = descriptor.isManual
      ? await loadLocalizedDocument(descriptor.documentId, getCurrentLanguage() || DEFAULT_LANG)
      : { html: await fetchText(descriptor.fileToLoad) };
    if (renderVersion !== infoModalRenderVersion || openInfoModalKey !== key) return;
    if (!documentResult || documentResult.html === null) {
      log.warn('Info modal content unavailable; showing missing-content state:', key);
      infoModalContent.innerHTML = `<p class="info-modal-message">${msgRenderer('renderer.info.missing_content', { name: infoDialogLabel })}</p>`;
      focusClose();
      return;
    }
    infoModalContent.innerHTML = descriptor.isManual
      ? extractInfoBodyHtml(documentResult.html)
      : translateInfoHtml(documentResult.html, translationKey);
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
      await hydrateAboutVersion(infoModalContent);
      await hydrateAboutEnvironment(infoModalContent);
      if (renderVersion !== infoModalRenderVersion || openInfoModalKey !== key) return;
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
    openInfoModalKey = key;
    return render(key, { open: true });
  }

  function isOpen() {
    return !!infoModal && infoModal.getAttribute('aria-hidden') === 'false';
  }

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
    if (infoModalBackdrop) infoModalBackdrop.addEventListener('click', close);
    window.addEventListener('keydown', (ev) => {
      if (infoModal && ev.key === 'Escape' && infoModal.getAttribute('aria-hidden') === 'false') close();
    });
    uiBound = true;
  }

  window.InfoModal = { init, open, isOpen, applyTranslations };
})();
