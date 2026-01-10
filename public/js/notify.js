// public/js/notify.js
'use strict';

(() => {
  function resolveText(key) {
    const { RendererI18n } = window || {};
    // If it fails, we return the key itself. No fallback.
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

  function notifyEditor(key, { type = 'info', duration = 4500 } = {}) {
    const msg = resolveText(key);
    // showNotice already exists in editor.js
    if (typeof window.showNotice === 'function') {
      window.showNotice(msg, { type, duration });
    }
  }

  function toastMain(key, { type = 'info', duration = 4500 } = {}) {
    const msg = resolveText(key);
    try {
      if (!document || !document.body) {
        console.error('[notify] toastMain unavailable: document/body not ready.');
        notifyMain(key);
        return;
      }

      const containerId = 'totMainToastContainer';
      let container = document.getElementById(containerId);
      if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        container.style.position = 'fixed';
        container.style.right = '16px';
        container.style.top = '16px';
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '8px';
        container.style.alignItems = 'flex-end';
        container.style.zIndex = '9999';
        document.body.appendChild(container);
      }

      const toast = document.createElement('div');
      toast.className = 'tot-main-toast';
      toast.dataset.type = type;
      toast.textContent = msg;
      toast.style.margin = '0';
      toast.style.maxWidth = '320px';
      toast.style.padding = '10px 12px';
      toast.style.border = '1px solid rgba(0, 0, 0, 0.15)';
      toast.style.borderRadius = '8px';
      toast.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.18)';
      toast.style.background = '#ffffff';
      toast.style.color = '#111111';
      toast.style.font = '13px/1.35 "Segoe UI", Tahoma, sans-serif';
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(6px)';
      toast.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      toast.style.pointerEvents = 'none';

      container.appendChild(toast);

      const showToast = () => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
      };
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(showToast);
      } else {
        setTimeout(showToast, 0);
      }

      const safeDuration = Number.isFinite(duration) ? Math.max(0, duration) : 4500;
      const removeToast = () => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(6px)';
        setTimeout(() => {
          if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 250);
      };

      if (safeDuration === 0) {
        removeToast();
      } else {
        setTimeout(removeToast, safeDuration);
      }
    } catch (err) {
      console.error('[notify] toastMain failed:', err);
      try {
        notifyMain(key);
      } catch (fallbackErr) {
        console.error('[notify] toastMain fallback failed:', fallbackErr);
      }
    }
  }

  window.Notify = {
    notifyMain,
    notifyEditor,
    toastMain
  };
})();
