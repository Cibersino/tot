(function () {
  var KEY = "tot-preferred-lang";
  var LANGUAGE_LINK_SELECTOR = ".lang-switch a[lang], .landing-actions a[data-lang][lang]";

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

  function bindLanguageLinks(root) {
    if (!root || typeof root.querySelectorAll !== "function") return;

    var links = root.querySelectorAll(LANGUAGE_LINK_SELECTOR);
    for (var i = 0; i < links.length; i += 1) {
      (function (link) {
        link.addEventListener("click", function () {
          saveLanguage(link.getAttribute("lang"));
        });
      })(links[i]);
    }
  }

  function highlightPreferredLanguage(root) {
    if (!root || typeof root.querySelector !== "function") return;

    var preferredLanguage = getPreferredLanguage();
    var preferredLink = root.querySelector('.landing-actions a[data-lang="' + preferredLanguage + '"]');
    if (!preferredLink) return;

    preferredLink.classList.add("recommended");
  }

  function redirectLanguageRoute(root) {
    if (!root || !root.dataset) return;

    var esTarget = root.dataset.languageRedirectEs || "";
    var enTarget = root.dataset.languageRedirectEn || "";
    if (!esTarget && !enTarget) return;

    var preferredLanguage = getPreferredLanguage();
    var targetPath = preferredLanguage === "en" ? enTarget : esTarget;
    if (!targetPath) {
      targetPath = esTarget || enTarget;
    }
    if (!targetPath) return;

    window.location.replace(targetPath + window.location.search + window.location.hash);
  }

  function init(root) {
    redirectLanguageRoute(root);
    bindLanguageLinks(root);
    highlightPreferredLanguage(root);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      init(document);
    });
  } else {
    init(document);
  }
})();
