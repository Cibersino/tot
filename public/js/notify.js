(() => {
  function resolveText(key) {
    const { RendererI18n } = window || {};
    // Si falla, devolvemos la clave misma. Sin fallback.
    if (!RendererI18n || typeof RendererI18n.msgRenderer !== 'function') {
      return key;
    }
    const txt = RendererI18n.msgRenderer(key, {}, key);
    return txt || key;
  }

  function notifyMain(key) {
    const msg = resolveText(key);
    alert(msg);
  }

  function notifyManual(key, { type = 'info', duration = 4500 } = {}) {
    const msg = resolveText(key);
    // showNotice ya existe en manual.js
    if (typeof window.showNotice === 'function') {
      window.showNotice(msg, { type, duration });
    }
  }

  window.Notify = {
    notifyMain,
    notifyManual
  };
})();
