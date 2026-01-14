// public/js/info_modal_links.js
'use strict';

(function () {
  function bindInfoModalLinks(container, { electronAPI, warnOnceRenderer, log } = {}) {
    if (!container || container.dataset.externalLinksBound === '1') return;
    container.dataset.externalLinksBound = '1';

    const api = electronAPI || window.electronAPI;
    const warnOnce = typeof warnOnceRenderer === 'function' ? warnOnceRenderer : null;
    const logger = log || console;

    container.addEventListener('click', (ev) => {
      try {
        const target = ev.target;
        if (!target || typeof target.closest !== 'function') return;
        const link = target.closest('a');
        if (!link || !container.contains(link)) return;

        const rawHref = (link.getAttribute('href') || '').trim();
        if (!rawHref || rawHref.startsWith('#')) return;

        ev.preventDefault();

        if (rawHref.startsWith('appdoc:')) {
          const docKey = rawHref.slice('appdoc:'.length).trim();
          if (!api || typeof api.openAppDoc !== 'function') {
            if (warnOnce) {
              warnOnce(
                'renderer.info.appdoc.missing',
                'openAppDoc not available; blocked app doc:',
                docKey
              );
            }
            return;
          }

          api.openAppDoc(docKey)
            .then((result) => {
              if (!result || result.ok !== true) {
                if (warnOnce) {
                  warnOnce(
                    'renderer.info.appdoc.blocked',
                    'App doc blocked or failed:',
                    docKey,
                    result
                  );
                }
              }
            })
            .catch((err) => {
              if (warnOnce) {
                warnOnce(
                  'renderer.info.appdoc.error',
                  'App doc request failed:',
                  docKey,
                  err
                );
              }
            });
          return;
        }

        const resolvedHref = link.href || rawHref;
        if (!api || typeof api.openExternalUrl !== 'function') {
          if (warnOnce) {
            warnOnce(
              'renderer.info.external.missing',
              'openExternalUrl not available; blocked navigation to:',
              resolvedHref
            );
          }
          return;
        }

        api.openExternalUrl(resolvedHref)
          .then((result) => {
            if (!result || result.ok !== true) {
              if (warnOnce) {
                warnOnce(
                  'renderer.info.external.blocked',
                  'External URL blocked or failed:',
                  resolvedHref,
                  result
                );
              }
            }
          })
          .catch((err) => {
            if (warnOnce) {
              warnOnce(
                'renderer.info.external.error',
                'External URL request failed:',
                resolvedHref,
                err
              );
            }
          });
      } catch (err) {
        if (logger && typeof logger.error === 'function') {
          logger.error('Error handling info modal link click:', err);
        }
      }
    });
  }

  window.InfoModalLinks = {
    bindInfoModalLinks
  };
})();
