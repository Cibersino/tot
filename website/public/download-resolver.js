(function () {
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

  function setMessage(messageEl, text) {
    if (!messageEl) return;
    messageEl.textContent = text;
  }

  function setFallback(state, releaseUrl) {
    setCta(state.ctaEl, releaseUrl || state.config.releasesUrl, state.config.labels.fallback);
    setMessage(state.messageEl, state.config.messages.fallback[state.os] || state.config.messages.unknown);
  }

  function setErrorFallback(state) {
    setCta(state.ctaEl, state.config.releasesUrl, state.config.labels.fallback);
    setMessage(state.messageEl, state.config.messages.error[state.os] || state.config.messages.error.unknown);
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
      setMessage(state.messageEl, config.messages.unknown);
      return;
    }

    setCta(state.ctaEl, config.releasesUrl, config.labels.loading[state.os] || config.labels.fallback);
    setMessage(state.messageEl, config.messages.loading[state.os] || config.messages.unknown);
    fetchLatestRelease(state);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
