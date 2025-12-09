// public/js/notify.js
(() => {
  function resolveText(key, fallback) {
    const { RendererI18n } = window || {};
    if (!RendererI18n || typeof RendererI18n.msgRenderer !== "function") {
      return fallback || key;
    }
    return RendererI18n.msgRenderer(key, {}, fallback || key);
  }

  function notifyMain(key, fallback) {
    const msg = resolveText(key, fallback);
    if (typeof alert === "function") alert(msg);
  }

  function notifyManual(key, { type = "info", duration = 4500 } = {}, showNoticeFn) {
    const msg = resolveText(key, key);
    const fn = showNoticeFn || (window && window.showNotice);
    if (typeof fn === "function") {
      fn(msg, { type, duration });
    }
  }

  window.Notify = {
    notifyMain,
    notifyManual
  };
})();
