// public/js/notify.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Resolve renderer i18n keys to displayable text.
// - Show blocking alerts for main-window notices.
// - Show toast notifications for main and editor contexts.
// - Provide a small, stable window.Notify surface for callers.
// =============================================================================

(() => {
  // =============================================================================
  // Logger
  // =============================================================================
  const log = window.getLogger('notify');
  log.debug('Notify starting...');

  // =============================================================================
  // Helpers (i18n + toast rendering)
  // =============================================================================
  function resolveText(key) {
    const { RendererI18n } = window || {};
    // If it fails, we return the key itself. No fallback.
    if (!RendererI18n || typeof RendererI18n.msgRenderer !== 'function') {
      log.warnOnce(
        'notify.resolveText.i18n.missing',
        'RendererI18n.msgRenderer missing; using key fallback.'
      );
      return key;
    }
    const txt = RendererI18n.msgRenderer(key, {}, key);
    return txt || key;
  }

  function applyToastPosition(container, position) {
    const pos = position || 'top-right';
    const positions = {
      'top-right': { top: '16px', right: '16px', bottom: 'auto', left: 'auto', align: 'flex-end' },
      'bottom-right': { top: 'auto', right: '16px', bottom: '16px', left: 'auto', align: 'flex-end' },
      'top-left': { top: '16px', right: 'auto', bottom: 'auto', left: '16px', align: 'flex-start' },
      'bottom-left': { top: 'auto', right: 'auto', bottom: '16px', left: '16px', align: 'flex-start' }
    };
    const cfg = positions[pos] || positions['top-right'];
    container.style.top = cfg.top;
    container.style.right = cfg.right;
    container.style.bottom = cfg.bottom;
    container.style.left = cfg.left;
    container.style.alignItems = cfg.align;
  }

  function ensureToastContainer(containerId, position) {
    let container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      Object.assign(container.style, {
        position: 'fixed',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        maxWidth: 'calc(100% - 32px)',
        pointerEvents: 'none',
        zIndex: '9999'
      });
      document.body.appendChild(container);
    }
    applyToastPosition(container, position);
    return container;
  }

  function toastText(text, { containerId = 'totToastContainer', position = 'top-right', duration = 4500, type = 'info' } = {}) {
    if (!document || !document.body) {
      throw new Error('[notify] toastText unavailable: document/body not ready.');
    }

    const msg = (typeof text === 'string') ? text : String(text);
    const container = ensureToastContainer(containerId, position);
    const toast = document.createElement('div');
    toast.className = 'tot-toast';
    toast.dataset.type = type;
    toast.textContent = msg;
    Object.assign(toast.style, {
      margin: '0',
      maxWidth: '320px',
      padding: '10px 12px',
      border: '1px solid rgba(0, 0, 0, 0.15)',
      borderRadius: '8px',
      boxShadow: '0 6px 16px rgba(0, 0, 0, 0.18)',
      background: '#ffffff',
      color: '#111111',
      font: '13px/1.35 "Segoe UI", Tahoma, sans-serif',
      opacity: '0',
      transform: 'translateY(6px)',
      transition: 'opacity 0.2s ease, transform 0.2s ease',
      pointerEvents: 'none',
      wordBreak: 'break-word'
    });

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
  }

  // =============================================================================
  // Entry points (public API)
  // =============================================================================
  function notifyMain(key) {
    const msg = resolveText(key);
    alert(msg);
  }

  function toastMain(key, { type = 'info', duration = 9000 } = {}) {
    const msg = resolveText(key);
    try {
      toastText(msg, { containerId: 'totMainToastContainer', position: 'top-right', type, duration });
    } catch (err) {
      log.warn('toastMain failed; falling back to notifyMain:', err);
      try {
        notifyMain(key);
      } catch (fallbackErr) {
        log.error('toastMain fallback failed:', fallbackErr);
      }
    }
  }

  function toastEditorText(text, { type = 'info', duration = 4500 } = {}) {
    try {
      toastText(text, { containerId: 'totEditorToastContainer', position: 'top-right', type, duration });
    } catch (err) {
      log.warn('toastEditorText failed; falling back to notifyMain:', err);
      try {
        if (typeof notifyMain === 'function') {
          notifyMain(text);
        } else {
          log.errorOnce(
            'notify.toastEditorText.notifyMain.missing',
            'toastEditorText fallback unavailable: notifyMain missing; notice dropped.'
          );
        }
      } catch (fallbackErr) {
        log.error('toastEditorText fallback failed:', fallbackErr);
      }
    }
  }

  function notifyEditor(key, { type = 'info', duration = 4500 } = {}) {
    const msg = resolveText(key);
    try {
      toastEditorText(msg, { type, duration });
    } catch (err) {
      log.warn('notifyEditor failed; falling back to notifyMain:', err);
      try {
        notifyMain(key);
      } catch (fallbackErr) {
        log.error('notifyEditor fallback failed:', fallbackErr);
      }
    }
  }

  // =============================================================================
  // Exports / module surface
  // =============================================================================
  window.Notify = {
    notifyMain,
    notifyEditor,
    toastMain,
    toastEditorText
  };
})();

// =============================================================================
// End of public/js/notify.js
// =============================================================================
