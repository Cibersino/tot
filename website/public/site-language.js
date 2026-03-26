(function () {
  var KEY = "tot-preferred-lang";

  function normalizeLanguage(lang) {
    if (!lang) return "";
    var value = String(lang).trim().toLowerCase();
    if (value.indexOf("es") === 0) return "es";
    if (value.indexOf("en") === 0) return "en";
    return "";
  }

  function getSavedLanguage() {
    try {
      return normalizeLanguage(window.localStorage.getItem(KEY));
    } catch (_) {
      return "";
    }
  }

  function saveLanguage(lang) {
    var normalized = normalizeLanguage(lang);
    if (!normalized) return "";

    try {
      window.localStorage.setItem(KEY, normalized);
    } catch (_) {
      // Ignore storage restrictions and continue navigation.
    }

    return normalized;
  }

  function getBrowserLanguage() {
    var candidates = [];

    if (window.navigator && Array.isArray(window.navigator.languages)) {
      candidates = candidates.concat(window.navigator.languages);
    }

    if (window.navigator && window.navigator.language) {
      candidates.push(window.navigator.language);
    }

    for (var i = 0; i < candidates.length; i += 1) {
      var normalized = normalizeLanguage(candidates[i]);
      if (normalized) return normalized;
    }

    return "";
  }

  function getPreferredLanguage() {
    return getSavedLanguage() || getBrowserLanguage() || "es";
  }

  function bindLanguageSwitch(root) {
    if (!root || typeof root.querySelectorAll !== "function") return;

    var links = root.querySelectorAll(".lang-switch a[lang]");
    for (var i = 0; i < links.length; i += 1) {
      (function (link) {
        link.addEventListener("click", function () {
          saveLanguage(link.getAttribute("lang"));
        });
      })(links[i]);
    }
  }

  window.ToTSiteLanguage = {
    bindLanguageSwitch: bindLanguageSwitch,
    getPreferredLanguage: getPreferredLanguage,
    saveLanguage: saveLanguage
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      bindLanguageSwitch(document);
    });
  } else {
    bindLanguageSwitch(document);
  }
})();
