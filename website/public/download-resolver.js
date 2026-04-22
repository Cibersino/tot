(function () {
  var downloadModalController = null;

  function getConfig() {
    if (window.totDownloadConfig && typeof window.totDownloadConfig === "object") {
      return window.totDownloadConfig;
    }

    return null;
  }

  function getPlatformSource() {
    var parts = [];

    if (window.navigator && window.navigator.userAgentData && window.navigator.userAgentData.platform) {
      parts.push(String(window.navigator.userAgentData.platform).toLowerCase());
    }

    if (window.navigator && window.navigator.platform) {
      parts.push(String(window.navigator.platform).toLowerCase());
    }

    if (window.navigator && window.navigator.userAgent) {
      parts.push(String(window.navigator.userAgent).toLowerCase());
    }

    return parts.join(" ");
  }

  function detectOs() {
    var source = getPlatformSource();

    if (source.indexOf("win") !== -1) return "windows";
    if (source.indexOf("mac") !== -1 && source.indexOf("iphone") === -1 && source.indexOf("ipad") === -1 && source.indexOf("ipod") === -1) return "macos";
    if (source.indexOf("linux") !== -1 || source.indexOf("x11") !== -1) return "linux";

    return "unknown";
  }

  function detectArch() {
    var source = getPlatformSource();

    if (source.indexOf("arm64") !== -1 || source.indexOf("aarch64") !== -1) return "arm64";
    if (source.indexOf("arm") !== -1) return "arm";
    if (source.indexOf("x86_64") !== -1 || source.indexOf("win64") !== -1 || source.indexOf("x64") !== -1 || source.indexOf("amd64") !== -1) return "x64";
    if (source.indexOf("ia32") !== -1 || source.indexOf("i686") !== -1 || source.indexOf("x86") !== -1) return "ia32";

    return "";
  }

  function buildAssetMatchers(os, arch) {
    var patterns = [];

    if (os === "windows") {
      if (arch === "arm64") patterns.push(/-win-arm64\.zip$/);
      patterns.push(/-win-x64\.zip$/);
      patterns.push(/-win-ia32\.zip$/);
      patterns.push(/-win-.*\.zip$/);
    } else if (os === "macos") {
      if (arch === "arm64") patterns.push(/-mac-arm64\.dmg$/);
      patterns.push(/-mac-universal\.dmg$/);
      patterns.push(/-mac-x64\.dmg$/);
      patterns.push(/-mac-.*\.dmg$/);
    } else if (os === "linux") {
      if (arch === "arm64") patterns.push(/-linux-arm64\.appimage$/);
      patterns.push(/-linux-x64\.appimage$/);
      patterns.push(/-linux-.*\.appimage$/);
    }

    return patterns;
  }

  function selectAsset(assets, os, arch) {
    if (!Array.isArray(assets) || !assets.length) return null;

    var patterns = buildAssetMatchers(os, arch);
    for (var i = 0; i < patterns.length; i += 1) {
      for (var j = 0; j < assets.length; j += 1) {
        var asset = assets[j];
        var name = asset && asset.name ? String(asset.name).toLowerCase() : "";
        if (name && patterns[i].test(name)) return asset;
      }
    }

    return null;
  }

  function setCta(ctaEl, href, label) {
    if (!ctaEl) return;
    ctaEl.href = href;
    ctaEl.textContent = label;
  }

  function setCtaMode(ctaEl, kind, os, assetName) {
    if (!ctaEl) return;

    ctaEl.dataset.downloadKind = kind || "fallback";
    ctaEl.dataset.downloadOs = os || "";

    if (assetName) {
      ctaEl.dataset.downloadAssetName = assetName;
      return;
    }

    delete ctaEl.dataset.downloadAssetName;
  }

  function setMessage(messageEl, text) {
    if (!messageEl) return;
    messageEl.textContent = text;
  }

  function setFallback(state, releaseUrl) {
    setCta(state.ctaEl, releaseUrl || state.config.releasesUrl, state.config.labels.fallback);
    setCtaMode(state.ctaEl, "fallback", state.os, "");
    setMessage(state.messageEl, state.config.messages.fallback[state.os] || state.config.messages.unknown);
  }

  function setErrorFallback(state) {
    setCta(state.ctaEl, state.config.releasesUrl, state.config.labels.fallback);
    setCtaMode(state.ctaEl, "fallback", state.os, "");
    setMessage(state.messageEl, state.config.messages.error[state.os] || state.config.messages.error.unknown);
  }

  function buildSupportContent(supportEl, modalConfig) {
    if (!supportEl) return;

    supportEl.textContent = "";

    var textBeforeLink = modalConfig && modalConfig.supportTextBeforeLink ? modalConfig.supportTextBeforeLink : "";
    var textAfterLink = modalConfig && modalConfig.supportTextAfterLink ? modalConfig.supportTextAfterLink : "";
    var kofiUrl = modalConfig && modalConfig.kofiUrl ? modalConfig.kofiUrl : "";
    var linkLabel = modalConfig && modalConfig.supportLinkLabel ? modalConfig.supportLinkLabel : "Ko-fi";

    if (textBeforeLink) supportEl.appendChild(document.createTextNode(textBeforeLink));

    if (kofiUrl) {
      var linkEl = document.createElement("a");
      linkEl.href = kofiUrl;
      linkEl.target = "_blank";
      linkEl.rel = "noopener noreferrer";
      linkEl.textContent = linkLabel;
      supportEl.appendChild(linkEl);
    } else if (linkLabel) {
      supportEl.appendChild(document.createTextNode(linkLabel));
    }

    if (textAfterLink) supportEl.appendChild(document.createTextNode(textAfterLink));
  }

  function createDownloadModalController(config) {
    if (downloadModalController) return downloadModalController;

    var modalConfig = config && config.downloadModal ? config.downloadModal : null;
    if (!modalConfig) return null;

    var modalEl = document.getElementById("downloadStartModal");
    var backdropEl = document.getElementById("downloadStartModalBackdrop");
    var titleEl = document.getElementById("downloadStartModalTitle");
    var bodyEl = document.getElementById("downloadStartModalBody");
    var supportEl = document.getElementById("downloadStartModalSupport");
    var closeEl = document.getElementById("downloadStartModalClose");
    var dismissEl = document.getElementById("downloadStartModalDismiss");

    if (!modalEl || !backdropEl || !titleEl || !bodyEl || !supportEl || !closeEl || !dismissEl) {
      console.warn("Download modal elements missing; skipping modal presentation.");
      return null;
    }

    var lastFocusedEl = null;

    function closeModal() {
      modalEl.hidden = true;
      modalEl.setAttribute("aria-hidden", "true");
      document.body.classList.remove("download-modal-open");

      if (lastFocusedEl && typeof lastFocusedEl.focus === "function") {
        lastFocusedEl.focus();
      }
    }

    function handleDocumentKeydown(event) {
      if (event.key !== "Escape") return;
      if (modalEl.hidden) return;
      closeModal();
    }

    function openModal(os) {
      var messageMap = modalConfig.messages || {};
      var resolvedOs = os || "unknown";

      titleEl.textContent = modalConfig.title || "";
      bodyEl.textContent = messageMap[resolvedOs] || messageMap.unknown || "";
      closeEl.setAttribute("aria-label", modalConfig.labels && modalConfig.labels.closeAria ? modalConfig.labels.closeAria : "Close");
      dismissEl.textContent = modalConfig.labels && modalConfig.labels.close ? modalConfig.labels.close : "Close";
      buildSupportContent(supportEl, modalConfig);

      lastFocusedEl = document.activeElement;
      modalEl.hidden = false;
      modalEl.setAttribute("aria-hidden", "false");
      document.body.classList.add("download-modal-open");
      dismissEl.focus();
    }

    backdropEl.addEventListener("click", closeModal);
    closeEl.addEventListener("click", closeModal);
    dismissEl.addEventListener("click", closeModal);
    document.addEventListener("keydown", handleDocumentKeydown);

    downloadModalController = {
      open: openModal
    };

    return downloadModalController;
  }

  function triggerDownload(href) {
    if (!href) return;

    var tempLink = document.createElement("a");
    tempLink.href = href;
    tempLink.style.display = "none";
    document.body.appendChild(tempLink);
    tempLink.click();
    document.body.removeChild(tempLink);
  }

  function bindDownloadModal(state) {
    if (!state.ctaEl) return;

    state.ctaEl.addEventListener("click", function (event) {
      var downloadKind = state.ctaEl.dataset.downloadKind || "fallback";
      if (downloadKind !== "direct") return;

      event.preventDefault();
      triggerDownload(state.ctaEl.href);

      var modalController = createDownloadModalController(state.config);
      if (modalController) {
        modalController.open(state.ctaEl.dataset.downloadOs || state.os);
      }
    });
  }

  function fetchLatestRelease(state) {
    if (typeof window.fetch !== "function") {
      setErrorFallback(state);
      return;
    }

    window.fetch(state.config.releaseApiUrl, {
      headers: {
        Accept: "application/vnd.github+json"
      }
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("release_lookup_failed");
        }

        return response.json();
      })
      .then(function (release) {
        var releaseUrl = release && release.html_url ? release.html_url : state.config.releasesUrl;
        var asset = selectAsset(release && release.assets, state.os, state.arch);

        if (!asset || !asset.browser_download_url) {
          setFallback(state, releaseUrl);
          return;
        }

        setCta(state.ctaEl, asset.browser_download_url, state.config.labels.direct[state.os] || state.config.labels.fallback);
        setCtaMode(state.ctaEl, "direct", state.os, asset.name || "");
        setMessage(state.messageEl, state.config.messages.direct[state.os] || state.config.messages.unknown);
      })
      .catch(function () {
        setErrorFallback(state);
      });
  }

  function init() {
    var config = getConfig();
    if (!config) return;

    var state = {
      arch: detectArch(),
      config: config,
      ctaEl: document.getElementById("primary-download"),
      messageEl: document.getElementById("os-message"),
      os: detectOs()
    };

    if (state.os === "unknown") {
      setCta(state.ctaEl, config.releasesUrl, config.labels.fallback);
      setCtaMode(state.ctaEl, "fallback", state.os, "");
      setMessage(state.messageEl, config.messages.unknown);
      return;
    }

    setCta(state.ctaEl, config.releasesUrl, config.labels.loading[state.os] || config.labels.fallback);
    setCtaMode(state.ctaEl, "fallback", state.os, "");
    setMessage(state.messageEl, config.messages.loading[state.os] || config.messages.unknown);
    bindDownloadModal(state);
    fetchLatestRelease(state);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
