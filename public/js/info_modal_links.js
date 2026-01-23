// public/js/info_modal_links.js
'use strict';

(function () {
  const log = window.getLogger('info-modal-links');

  function bindInfoModalLinks(container, { electronAPI } = {}) {
    if (!container || container.dataset.externalLinksBound === '1') return;
    container.dataset.externalLinksBound = '1';

    const api = electronAPI || window.electronAPI;

    const escapeSelector = (value) => {
      if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
      return String(value).replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
    };

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
          } catch {
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
            log.warnOnce(
              'renderer.info.appdoc.missing',
              'openAppDoc not available; blocked app doc:',
              docKey
            );
            return;
          }

          api.openAppDoc(docKey)
            .then((result) => {
              if (!result || result.ok !== true) {
                log.warnOnce(
                  'renderer.info.appdoc.blocked',
                  'App doc blocked or failed:',
                  docKey,
                  result
                );
              }
            })
            .catch((err) => {
              log.warnOnce(
                'renderer.info.appdoc.error',
                'App doc request failed:',
                docKey,
                err
              );
            });
          return;
        }

        const resolvedHref = link.href || rawHref;
        if (!api || typeof api.openExternalUrl !== 'function') {
          log.warnOnce(
            'renderer.info.external.missing',
            'openExternalUrl not available; blocked navigation to:',
            resolvedHref
          );
          return;
        }

        api.openExternalUrl(resolvedHref)
          .then((result) => {
            if (!result || result.ok !== true) {
              log.warnOnce(
                'renderer.info.external.blocked',
                'External URL blocked or failed:',
                resolvedHref,
                result
              );
            }
          })
          .catch((err) => {
            log.warnOnce(
              'renderer.info.external.error',
              'External URL request failed:',
              resolvedHref,
              err
            );
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
