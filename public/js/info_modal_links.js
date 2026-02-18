// public/js/info_modal_links.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Responsibilities:
// - Bind a single click handler for info modal link containers.
// - Route hash links to in-modal scroll with a manual fallback.
// - Route appdoc: links via electronAPI.openAppDoc.
// - Route external links via electronAPI.openExternalUrl.
// - Log recoverable failures and fallbacks.

(function () {
  // =============================================================================
  // Logger
  // =============================================================================
  if (typeof window.getLogger !== 'function') {
    throw new Error('[info-modal-links] window.getLogger unavailable; cannot continue');
  }
  const log = window.getLogger('info-modal-links');
  log.debug('Info modal links starting...');

  // =============================================================================
  // Helpers
  // =============================================================================
  const escapeSelector = (value) => {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
    log.warnOnce(
      'renderer.info.css-escape.missing',
      'CSS.escape unavailable; using fallback selector escaping.'
    );
    return String(value).replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
  };

  // =============================================================================
  // Main handler
  // =============================================================================
  function bindInfoModalLinks(container, { electronAPI } = {}) {
    if (!container || container.dataset.externalLinksBound === '1') return;
    container.dataset.externalLinksBound = '1';

    const api = electronAPI || window.electronAPI;

    container.addEventListener('click', (ev) => {
      try {
        const target = ev.target;
        if (!target || typeof target.closest !== 'function') return;
        const link = target.closest('a');
        if (!link || !container.contains(link)) return;

        const rawHref = (link.getAttribute('href') || '').trim();
        if (!rawHref) return;

        if (rawHref.startsWith('#')) {
          ev.preventDefault();
          const hash = rawHref.slice(1).trim();
          const panel = container.closest('.info-modal-panel');
          if (!hash) {
            if (panel) {
              panel.scrollTop = 0;
            } else {
              container.scrollTop = 0;
            }
            return;
          }
          const safeId = escapeSelector(hash);
          const targetEl = container.querySelector(`#${safeId}`);
          if (!targetEl) return;

          try {
            targetEl.scrollIntoView({ behavior: 'auto', block: 'start' });
          } catch (err) {
            log.warnOnce(
              'renderer.info.scrollIntoView.failed',
              'scrollIntoView failed; using manual scroll fallback:',
              err
            );
            if (!panel) return;
            const panelRect = panel.getBoundingClientRect();
            const targetRect = targetEl.getBoundingClientRect();
            const desired = (targetRect.top - panelRect.top) + panel.scrollTop;
            const finalTop = Math.max(0, Math.min(desired, panel.scrollHeight - panel.clientHeight));
            panel.scrollTo({ top: finalTop, behavior: 'auto' });
          }
          return;
        }

        ev.preventDefault();

        if (rawHref.startsWith('appdoc:')) {
          const docKey = rawHref.slice('appdoc:'.length).trim();
          if (!api || typeof api.openAppDoc !== 'function') {
            log.warn(
              'openAppDoc not available; blocked app doc:',
              docKey
            );
            return;
          }

          api.openAppDoc(docKey)
            .then((result) => {
              if (!result || result.ok !== true) {
                log.warn('App doc blocked or failed:', docKey, result);
              }
            })
            .catch((err) => {
              log.warn('App doc request failed:', docKey, err);
            });
          return;
        }

        const resolvedHref = link.href || rawHref;
        if (!api || typeof api.openExternalUrl !== 'function') {
          log.warn(
            'openExternalUrl not available; blocked navigation to:',
            resolvedHref
          );
          return;
        }

        api.openExternalUrl(resolvedHref)
          .then((result) => {
            if (!result || result.ok !== true) {
              log.warn('External URL blocked or failed:', resolvedHref, result);
            }
          })
          .catch((err) => {
            log.warn('External URL request failed:', resolvedHref, err);
          });
      } catch (err) {
        log.error('Error handling info modal link click:', err);
      }
    });
  }

  window.InfoModalLinks = {
    bindInfoModalLinks
  };
})();

// =============================================================================
// End of public/js/info_modal_links.js
// =============================================================================
