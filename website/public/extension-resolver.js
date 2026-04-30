(function () {
  function getConfig() {
    if (window.totExtensionConfig && typeof window.totExtensionConfig === "object") {
      return window.totExtensionConfig;
    }

    return null;
  }

  function hasBrand(brands, expected) {
    if (!Array.isArray(brands)) return false;

    for (var i = 0; i < brands.length; i += 1) {
      var brand = brands[i];
      if (!brand || !brand.brand) continue;
      if (String(brand.brand).toLowerCase() === expected) return true;
    }

    return false;
  }

  function detectChrome() {
    var nav = window.navigator || {};

    if (nav.userAgentData && Array.isArray(nav.userAgentData.brands)) {
      var hasGoogleChrome = hasBrand(nav.userAgentData.brands, "google chrome");
      var hasEdge = hasBrand(nav.userAgentData.brands, "microsoft edge");
      var hasOpera = hasBrand(nav.userAgentData.brands, "opera");

      return hasGoogleChrome && !hasEdge && !hasOpera;
    }

    var ua = nav.userAgent ? String(nav.userAgent) : "";
    var vendor = nav.vendor ? String(nav.vendor) : "";

    if (vendor !== "Google Inc.") return false;
    if (ua.indexOf("Chrome/") === -1) return false;
    if (ua.indexOf("Edg/") !== -1) return false;
    if (ua.indexOf("OPR/") !== -1) return false;
    if (ua.indexOf("Opera/") !== -1) return false;
    if (ua.indexOf("SamsungBrowser/") !== -1) return false;
    if (ua.indexOf("CriOS/") !== -1) return false;

    return true;
  }

  function init() {
    var config = getConfig();
    if (!config) return;

    var installEl = document.getElementById("extension-install");
    if (!installEl) return;

    installEl.href = config.chromeStoreUrl;
    installEl.textContent = detectChrome() ? config.labels.chrome : config.labels.fallback;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
