// public/js/menu.js
(function () {
    const registry = new Map();

    // referencia privada para la funcion de desuscripcion retornada por preload
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

    // Intenta registrar listener hacia preload -> ipcRenderer
    function setupListener() {
        // si ya esta registrado, no volver a registrar
        if (_unsubscribeMenuClick) {
            console.debug('menuActions: listener already registered (skip)');
            return true;
        }

        if (window.electronAPI && typeof window.electronAPI.onMenuClick === 'function') {
            try {
                const maybeUnsubscribe = window.electronAPI.onMenuClick(handleMenuClick);

                // Guardar la funcion de desuscripcion si la devolvieron
                if (typeof maybeUnsubscribe === 'function') {
                    _unsubscribeMenuClick = maybeUnsubscribe;
                    console.debug('menuActions: listener registered in electronAPI.onMenuClick (with unsubscribe)');
                } else {
                    // No todas las implementaciones de preload devuelven unsubscribe. Aceptamos eso.
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
        // Intentar nuevamente cuando el DOM este listo (y otras APIs hayan sido inyectadas)
        document.addEventListener('DOMContentLoaded', () => { setupListener(); });
    }

    // API publica minima disponible globalmente
    window.menuActions = {
        registerMenuAction,
        unregisterMenuAction,
        listMenuActions,

        // util para depuracion o futuros reloads
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

        // expuesto solo para depuracion avanzada; no recomendado para uso normal
        _internal: {
            _getUnsubscribeRef: () => _unsubscribeMenuClick
        }
    };
})();
