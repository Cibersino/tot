Rule 1 = Purpose clarity
Rule 2 = Non-collision (confusability por rol)
Rule 3 = Lexicon consistency (sinónimos para lo mismo)

electron/manual_preload.js
- Observed Role:   Preload que expone manualAPI para el editor (texto completo): leer/escribir texto actual, leer config/settings, recibir eventos manual-*.
- Rule(s) failed?: 3
- Keep?:           Y
- Notes:           Rename (lexicón editor): electron/manual_preload.js -> electron/editor_preload.js.
                  Nota: window.manualAPI se mantiene por ahora (contrato).

public/js/menu.js [LISTO]
- Observed Role:   Wiring/dispatcher en renderer para acciones de menú: escucha window.electronAPI.onMenuClick(...), registra handlers y gestiona unsubscribe.
- Rule(s) failed?: 2
- Keep?:           Y
- Notes:           Rename propuesto para desambiguar rol vs electron/menu_builder.js:
                  public/js/menu.js -> public/js/menu_actions.js

electron/modal_state.js
- Observed Role:   Persistencia/restauración del estado de ventana del editor (maximized + “reduced bounds” width/height/x/y) en config/modal_state.json; attachTo(editorWin, ...) y editorWin.setBounds(...).
- Rule(s) failed?: 1, 3
- Keep?:           Y
- Notes:           Rename (claridad + lexicón editor):
                  electron/modal_state.js -> electron/editor_state.js.

config/modal_state.json
- Observed Role:   Archivo JSON persistido en CONFIG_DIR (verificado como ../config) que guarda el estado de ventana del editor (maximized + reduced bounds), leído/escrito por electron/modal_state.js.
- Rule(s) failed?: 1, 3
- Keep?:           Y
- Notes:           Rename alineado al módulo:
                  config/modal_state.json -> config/editor_state.json.

public/manual.js
- Observed Role:   Script del editor “Texto completo”: integra con window.manualAPI, listeners manual-*, y eventos del editor (paste/drop/input) con fallbacks.
- Rule(s) failed?: 1, 3
- Keep?:           Y
- Notes:           Rename (lexicón editor): public/manual.js -> public/editor.js.
                  Nota: window.manualAPI se mantiene por ahora (contrato).

public/js/timer.js [LISTO]
- Observed Role:   Lógica de crono/tiempo + control de flotante: formateo/parsing, cálculo velocidad real desde elapsed, openFloating/closeFloating, handler de estado crono.
- Rule(s) failed?: 1, 3
- Keep?:           Y
- Notes:           Rename (consistencia con “crono/cronómetro” e IPC crono-*):
                  public/js/timer.js -> public/js/crono.js

public/manual.html
- Observed Role:   Página del editor “Texto completo”; carga manual.css, js/notify.js, js/i18n.js, js/constants.js, manual.js; <title>Editor — Texto completo</title>.
- Rule(s) failed?: 1, 3
- Keep?:           Y
- Notes:           Rename (lexicón editor): public/manual.html -> public/editor.html
                  (y actualizar referencias a CSS/JS renombrados).

public/language_modal.html [LISTO]
- Observed Role:   Página de selección de idioma cargada por langWin; <title>Seleccionar idioma</title>.
- Rule(s) failed?: 1
- Keep?:           Y
- Notes:           langWin está modal:false y parent:null; “_modal” es engañoso.
                  Rename: public/language_modal.html -> public/language_window.html
                  (Actualizar constante LANGUAGE_MODAL_HTML / loadFile path en electron/main.js.)

public/manual.css
- Observed Role:   Estilos de public/manual.html.
- Rule(s) failed?: 3
- Keep?:           Y
- Notes:           Rename (lexicón editor): public/manual.css -> public/editor.css
                  (y actualizar link href).
