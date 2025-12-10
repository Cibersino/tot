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
        console.debug(`menuActions: accion registrada -> ${payload}`);
    }

    function unregisterMenuAction(payload) {
        return registry.delete(payload);
    }

    function listMenuActions() {
        return Array.from(registry.keys());
    }

    function handleMenuClick(payload) {
        console.log('menu-click recibido (menu.js):', payload);
        const action = registry.get(payload);
        if (action) {
            try {
                action(payload);
            } catch (err) {
                console.error(`Error ejecutando accion de menu '${payload}':`, err);
            }
        } else {
            console.warn(`menuActions: payload sin accion registrada -> ${payload}`);
        }
    }

    // Intenta registrar listener hacia preload -> ipcRenderer
    function setupListener() {
        // si ya esta registrado, no volver a registrar
        if (_unsubscribeMenuClick) {
            console.debug('menuActions: listener ya registrado (skip)');
            return true;
        }

        if (window.electronAPI && typeof window.electronAPI.onMenuClick === 'function') {
            try {
                const maybeUnsubscribe = window.electronAPI.onMenuClick(handleMenuClick);

                // Guardar la funcion de desuscripcion si la devolvieron
                if (typeof maybeUnsubscribe === 'function') {
                    _unsubscribeMenuClick = maybeUnsubscribe;
                    console.debug('menuActions: listener registrado en electronAPI.onMenuClick (con unsubscribe)');
                } else {
                    // No todas las implementaciones de preload devuelven unsubscribe. Aceptamos eso.
                    _unsubscribeMenuClick = null;
                    console.debug('menuActions: listener registrado en electronAPI.onMenuClick (sin unsubscribe devuelto)');
                }
                return true;
            } catch (err) {
                console.error('menuActions: error registrando listener en electronAPI.onMenuClick:', err);
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
                    console.debug('menuActions: listener desuscrito correctamente');
                } catch (err) {
                    console.error('menuActions: error al desuscribir listener:', err);
                }
                _unsubscribeMenuClick = null;
            } else {
                console.debug('menuActions: no hay unsubscribe disponible (no se puede desuscribir)');
            }
        },

        // expuesto solo para depuracion avanzada; no recomendado para uso normal
        _internal: {
            _getUnsubscribeRef: () => _unsubscribeMenuClick
        }
    };
})();
