// public/js/menu.js
(function () {
    const registry = new Map();

    // private reference for the unsubscribe function returned by preload
    let _unsubscribeMenuClick = null;

    function registerMenuAction(payload, callback) {
        if (typeof payload !== 'string' || !payload.trim()) {
            throw new Error('registerMenuAction: payload debe ser string no vacio');
        }
        if (typeof callback !== 'function') {
            throw new Error('registerMenuAction: callback debe ser funcion');
        }
        registry.set(payload, callback);
        console.debug(`menuActions: registered action -> ${payload}`);
    }

    function unregisterMenuAction(payload) {
        return registry.delete(payload);
    }

    function listMenuActions() {
        return Array.from(registry.keys());
    }

    function handleMenuClick(payload) {
        console.log('menu-click received (menu.js):', payload);
        const action = registry.get(payload);
        if (action) {
            try {
                action(payload);
            } catch (err) {
                console.error(`Error executing menu action '${payload}':`, err);
            }
        } else {
            console.warn(`menuActions: payload without registered action -> ${payload}`);
        }
    }

    // Try to register listener to preload -> ipcRenderer
    function setupListener() {
        // if you are already registered, do not re-register
        if (_unsubscribeMenuClick) {
            console.debug('menuActions: listener already registered (skip)');
            return true;
        }

        if (window.electronAPI && typeof window.electronAPI.onMenuClick === 'function') {
            try {
                const maybeUnsubscribe = window.electronAPI.onMenuClick(handleMenuClick);

                // Save the unsubscribe function if it was returned
                if (typeof maybeUnsubscribe === 'function') {
                    _unsubscribeMenuClick = maybeUnsubscribe;
                    console.debug('menuActions: listener registered in electronAPI.onMenuClick (with unsubscribe)');
                } else {
                    // Not all preload implementations return unsubscribe. We accept that.
                    _unsubscribeMenuClick = null;
                    console.debug('menuActions: listener registered in electronAPI.onMenuClick (without unsubscribe)');
                }
                return true;
            } catch (err) {
                console.error('menuActions: error registering listener in electronAPI.onMenuClick:', err);
                return false;
            }
        }
        return false;
    }

    if (!setupListener()) {
        // Try again when the DOM is ready (and other APIs have been injected)
        document.addEventListener('DOMContentLoaded', () => { setupListener(); });
    }

    // Minimum globally available public API
    window.menuActions = {
        registerMenuAction,
        unregisterMenuAction,
        listMenuActions,

        // useful for debugging or future reloads
        stopListening() {
            if (typeof _unsubscribeMenuClick === 'function') {
                try {
                    _unsubscribeMenuClick();
                    console.debug('menuActions: listener unscribed correctly');
                } catch (err) {
                    console.error('menuActions: error unsubscribing listener:', err);
                }
                _unsubscribeMenuClick = null;
            } else {
                console.debug('menuActions: unsubscribe unavailable (cannot unsubscribe)');
            }
        },

        // exposed only for advanced debugging; not recommended for normal use
        _internal: {
            _getUnsubscribeRef: () => _unsubscribeMenuClick
        }
    };
})();
