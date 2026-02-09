// public/js/menu_actions.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Renderer-side menu action router.
// Responsibilities:
// - Register handlers keyed by menu action id.
// - Receive menu clicks from preload (onMenuClick) and dispatch to handlers.
// - Expose a small API on window.menuActions for registration and teardown.
// - Report degraded paths when listener setup is not available.

(function () {
    // =============================================================================
    // Logger / shared state
    // =============================================================================
    const log = window.getLogger('menu-actions');

    // actionId -> handler
    const registry = new Map();

    // Unsubscribe handle from preload (if supported)
    let _unsubscribeMenuClick = null;

    // =============================================================================
    // Public API helpers
    // =============================================================================
    function registerMenuAction(payload, callback) {
        if (typeof payload !== 'string' || !payload.trim()) {
            throw new Error('registerMenuAction: payload debe ser string no vacio');
        }
        if (typeof callback !== 'function') {
            throw new Error('registerMenuAction: callback debe ser funcion');
        }
        registry.set(payload, callback);
        log.debug(`menuActions: registered action -> ${payload}`);
    }

    function unregisterMenuAction(payload) {
        return registry.delete(payload);
    }

    function listMenuActions() {
        return Array.from(registry.keys());
    }

    // =============================================================================
    // IPC handler / listener registration
    // =============================================================================
    function handleMenuClick(payload) {
        log.debug('menu-click received (menu_actions.js):', payload);
        const action = registry.get(payload);
        if (action) {
            try {
                action(payload);
            } catch (err) {
                log.error(`Error executing menu action '${payload}':`, err);
            }
        } else {
            log.warn(`menuActions: payload without registered action -> ${payload}`);
        }
    }

    function setupListener() {
        // If you are already registered, do not re-register.
        if (_unsubscribeMenuClick) {
            log.debug('menuActions: listener already registered (skip)');
            return true;
        }

        const api = window.electronAPI;
        if (!api || typeof api.onMenuClick !== 'function') {
            return false;
        }

        try {
            const maybeUnsubscribe = api.onMenuClick(handleMenuClick);

            // Save the unsubscribe function if it was returned
            if (typeof maybeUnsubscribe === 'function') {
                _unsubscribeMenuClick = maybeUnsubscribe;
                log.debug('menuActions: listener registered in electronAPI.onMenuClick (with unsubscribe)');
            } else {
                // Not all preload implementations return unsubscribe. We accept that.
                _unsubscribeMenuClick = null;
                log.warn('menuActions: onMenuClick did not return unsubscribe; listener cannot be removed');
            }
            return true;
        } catch (err) {
            log.error('menuActions: error registering listener in electronAPI.onMenuClick:', err);
            return false;
        }
    }

    // =============================================================================
    // Bootstrapping
    // =============================================================================
    if (!setupListener()) {
        log.warn('BOOTSTRAP: menuActions: onMenuClick not available yet; retrying at DOMContentLoaded');
        // Try again when the DOM is ready (and other APIs have been injected)
        document.addEventListener('DOMContentLoaded', () => {
            if (!setupListener()) {
                log.warn('menuActions: onMenuClick unavailable after DOMContentLoaded; menu clicks will not be handled');
            }
        });
    }

    // =============================================================================
    // Exports / module surface
    // =============================================================================
    window.menuActions = {
        registerMenuAction,
        unregisterMenuAction,
        listMenuActions,

        // Optional teardown hook for manual reloads/debugging.
        stopListening() {
            if (typeof _unsubscribeMenuClick === 'function') {
                try {
                    _unsubscribeMenuClick();
                    log.debug('menuActions: listener unsubscribed correctly');
                } catch (err) {
                    log.error('menuActions: error unsubscribing listener:', err);
                }
                _unsubscribeMenuClick = null;
            } else {
                log.warn('menuActions: stopListening cannot unsubscribe; no unsubscribe handle available');
            }
        },

        // Debug-only access to internal state; not for normal use.
        _internal: {
            _getUnsubscribeRef: () => _unsubscribeMenuClick
        }
    };
})();

// =============================================================================
// End of public/js/menu_actions.js
// =============================================================================
