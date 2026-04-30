# Árbol de carpetas y archivos

**Versión de la app:** ver campo `version` en [`package.json`](../package.json)

Este documento describe la **estructura** del repo y los **archivos clave** (entry points y módulos).
No es un inventario exhaustivo de cada archivo.

## Árbol

```ASCII
tot/
├── .github/
│ └── workflows/
│   └── test.yml                  # workflow GitHub Actions del baseline automatizado (`npm test` en Windows)
├── .vscode/                       # {carpeta ignorada por git}
│ ├── settings.json
│ └── tasks.json
├── build-output/                  # {vacío} {carpeta ignorada por git}
├── build-resources/               # recursos solo de packaging (electron-builder)
│ ├── after-all-artifact-build.js
│ ├── logo-cibersino.ico
│ ├── logo-cibersino.png
│ └── README.md
├── config/                        # {generada en primer arranque} {carpeta ignorada por git}
│ ├── presets_defaults/
│ │ ├── defaults_presets.json   
│ │ ├── defaults_presets_en.json
│ │ └── defaults_presets_es.json
│ ├── tasks/
│ │ ├── lists/
│ │ ├── library.json
│ │ ├── allowed_hosts.json
│ │ ├── column_widths.json
│ │ └── task_editor_position.json
│ ├── current_text.json
│ ├── editor_state.json
│ ├── text_extraction_state.json
│ ├── reading_test_pool_import_state.json
│ ├── reading_test_pool_state.json
│ ├── ocr_google_drive/
│ │ ├── credentials.json
│ │ └── token.json
│ ├── saved_current_texts/
│ │ └── reading_speed_test_pool/  # {pool local del reading speed test; sincronizado al arranque, contenido sin state inline}
│ └── user_settings.json
├── docs/
│ ├── releases/                    # {con subcarpetas por release con docs de chequeo}
│ │ ├── release_checklist.md
│ │ ├── security_baseline.md
│ │ └── legal_baseline.md
│ ├── changelog_detailed.md
│ ├── test_suite.md
│ └── tree_folders_files.md
├── electron/
│ ├── assets/
│ │ └── ocr_google_drive/         # {credenciales OAuth desktop empaquetadas para OCR Google}
│ │   ├── credentials.json        # {ignorado por git; material real provisto por el owner para builds de producción}
│ │   └── README.md
│ ├── presets/                     # {presets para restauración de fábrica}
│ │ ├── defaults_presets.json
│ │ ├── defaults_presets_en.json
│ │ └── defaults_presets_es.json
│ ├── main.js
│ ├── preload.js
│ ├── language_preload.js
│ ├── editor_preload.js
│ ├── editor_find_preload.js
│ ├── task_editor_preload.js
│ ├── preset_preload.js
│ ├── flotante_preload.js
│ ├── reading_test_questions_preload.js
│ ├── reading_test_result_preload.js
│ ├── fs_storage.js
│ ├── settings.js
│ ├── spellcheck.js
│ ├── text_state.js
│ ├── current_text_snapshots_main.js
│ ├── tasks_main.js
│ ├── task_editor_position.js
│ ├── editor_state.js
│ ├── editor_find_main.js
│ ├── editor_find_session.js
│ ├── editor_find_shortcuts.js
│ ├── editor_text_size.js
│ ├── reading_test_pool/          # {starter files versionados del reading speed test}
│ ├── reading_test_pool.js
│ ├── reading_test_pool_import.js
│ ├── reading_test_session.js
│ ├── reading_test_session_windows.js
│ ├── reading_test_session_flow.js
│ ├── text_extraction_platform/
│ │ ├── platform_adapters/
│ │ │ ├── common.js
│ │ │ ├── windows.js
│ │ │ ├── darwin.js
│ │ │ ├── linux.js
│ │ │ └── fallback.js
│ │ ├── text_extraction_file_picker_ipc.js
│ │ ├── text_extraction_preconditions_ipc.js
│ │ ├── text_extraction_processing_mode_ipc.js
│ │ ├── text_extraction_ocr_activation_ipc.js
│ │ ├── text_extraction_ocr_disconnect_ipc.js
│ │ ├── text_extraction_prepare_execute_core.js
│ │ ├── text_extraction_prepare_ipc.js
│ │ ├── text_extraction_execute_prepared_ipc.js
│ │ ├── text_extraction_prepared_store.js
│ │ ├── text_extraction_platform_adapter.js
│ │ ├── text_extraction_supported_formats.js
│ │ ├── native_extraction_route.js
│ │ ├── native_pdf_selectable_text_probe.js
│ │ ├── ocr_google_drive_activation_state.js
│ │ ├── ocr_google_drive_bundled_credentials.js
│ │ ├── ocr_google_drive_credentials_file.js
│ │ ├── ocr_google_drive_oauth_client.js
│ │ ├── ocr_google_drive_provider_failure_classification.js
│ │ ├── ocr_google_drive_provider_failure.js
│ │ ├── ocr_google_drive_setup_validation.js
│ │ ├── ocr_google_drive_token_storage.js
│ │ ├── ocr_google_drive_route.js
│ │ └── ocr_image_normalization.js
│ ├── presets_main.js
│ ├── menu_builder.js
│ ├── updater.js
│ ├── link_openers.js
│ ├── constants_main.js
│ └── log.js
├── extensions/                    # extensiones/superficies nuevas distribuidas fuera de Electron
│ └── reading-time/
│   └── chrome/                    # extensión Chrome MV3 para estimar tiempo de lectura sobre texto seleccionado
│     ├── _locales/
│     │ ├── en/
│     │ │ └── messages.json
│     │ └── es/
│     │   └── messages.json
│     ├── icons/
│     │ ├── icon-128.png
│     │ ├── icon-16.png
│     │ ├── icon-32.png
│     │ └── icon-48.png
│     ├── content-script.js
│     ├── content.css
│     ├── logic.js
│     ├── manifest.json
│     ├── popup.css
│     ├── popup.html
│     ├── popup.js
│     └── service-worker.js
├── i18n/                          # {subcarpetas por idioma y variantes regionales}
│ └── languages.json
├── public/
│ ├── assets/
│ │ ├── instrucciones/             # {capturas/GIFs usados por public/info/instrucciones.*.html}
│ │ ├── SOURCES.md
│ │ ├── logo-cibersino.svg
│ │ ├── logo-tot.png
│ │ ├── logo-tot.svg
│ │ └── kofi_symbol.png
│ ├── fonts/
│ │ ├── Baskervville-VariableFont_wght.ttf
│ │ ├── Baskervville-Italic-VariableFont_wght.ttf
│ │ └── Baskervville.css
│ ├── third_party_licenses/       # {licencias/notices versionados de terceros redistribuidos}
│ ├── info/
│ │ ├── acerca_de.html
│ │ ├── instrucciones.es.html
│ │ ├── instrucciones.en.html
│ │ └── links_interes.html
│ ├── js/
│ │ ├── lib/
│ │ │ ├── count_core.js
│ │ │ ├── editor_find_replace_core.js
│ │ │ ├── editor_maximized_layout_core.js
│ │ │ ├── format_core.js
│ │ │ ├── reading_test_filters_core.js
│ │ │ ├── reading_test_questions_core.js
│ │ │ └── snapshot_tag_catalog.js
│ │ ├── count.js
│ │ ├── presets.js
│ │ ├── crono.js
│ │ ├── menu_actions.js
│ │ ├── current_text_snapshots.js
│ │ ├── snapshot_save_tags_modal.js
│ │ ├── reading_speed_test.js
│ │ ├── format.js
│ │ ├── results_time_multiplier.js
│ │ ├── i18n.js
│ │ ├── constants.js
│ │ ├── wpm_curve.js
│ │ ├── wpm_controls.js
│ │ ├── notify.js
│ │ ├── info_modal_links.js
│ │ ├── main_logo_links.js
│ │ ├── text_apply_canonical.js
│ │ ├── text_extraction_status_ui.js
│ │ ├── text_extraction_route_choice_modal.js
│ │ ├── text_extraction_apply_modal.js
│ │ ├── text_extraction_ocr_activation_disclosure_modal.js
│ │ ├── text_extraction_ocr_activation_recovery.js
│ │ ├── text_extraction_ocr_disconnect.js
│ │ ├── text_extraction_entry.js
│ │ ├── text_extraction_drag_drop.js
│ │ ├── current_text_selector_section.js
│ │ ├── editor_ui.js
│ │ ├── editor_engine.js
│ │ └── log.js
│ ├── renderer.js
│ ├── language_window.js
│ ├── editor.js
│ ├── editor_find.js
│ ├── task_editor.js
│ ├── preset_modal.js
│ ├── flotante.js
│ ├── reading_test_questions.js
│ ├── reading_test_result.js
│ ├── index.html
│ ├── language_window.html
│ ├── editor.html
│ ├── editor_find.html
│ ├── task_editor.html
│ ├── preset_modal.html
│ ├── flotante.html
│ ├── reading_test_questions.html
│ ├── reading_test_result.html
│ ├── editor.css
│ ├── editor_find.css
│ ├── task_editor.css
│ ├── flotante.css
│ ├── reading_test_questions.css
│ ├── reading_test_result.css
│ └── style.css
├── test/
│ ├── smoke/
│ │ └── electron_launch_smoke.test.js
│ ├── unit/
│ │ ├── electron/
│ │ │ ├── editor_find_main.test.js
│ │ │ ├── editor_state.test.js
│ │ │ ├── text_extraction_prepare_execute_core.test.js
│ │ │ ├── text_extraction_prepared_store.test.js
│ │ │ ├── text_extraction_supported_formats.test.js
│ │ │ ├── ocr_google_drive_activation_state.test.js
│ │ │ ├── ocr_google_drive_provider_failure_classification.test.js
│ │ │ ├── ocr_google_drive_provider_failure.test.js
│ │ │ ├── reading_test_pool.test.js
│ │ │ ├── reading_test_pool_import.test.js
│ │ │ ├── spellcheck.test.js
│ │ │ └── settings.test.js
│ │ └── shared/
│ │   ├── count_core.test.js
│ │   ├── editor_find_replace_core.test.js
│ │   ├── editor_maximized_layout_core.test.js
│ │   ├── editor_ui_margin_persistence.test.js
│ │   └── format_core.test.js
│ └── README.md
├── website/                       # {sitio web}
│ └── public/
│   ├── app-privacy/
│   │ └── index.html
│   ├── assets/
│   │ ├── brand/
│   │ │ ├── logo-cibersino.svg
│   │ │ └── logo-tot.svg
│   │ ├── demo/
│   │ │ └── guia-basica.gif
│   │ └── social/
│   │   ├── instagram-black.svg
│   │   ├── instagram-white.svg
│   │   ├── kofi_symbol.png
│   │   ├── SOURCES.md
│   │   ├── x-black.png
│   │   ├── x-white.png
│   │   └── youtube.png
│   ├── chrome-extension-privacy/
│   │ └── index.html
│   ├── en/
│   │ ├── app-privacy/
│   │ │ ├── google-ocr/
│   │ │ │ └── index.html
│   │ │ └── index.html
│   │ ├── privacy-cookies/
│   │ │ └── index.html
│   │ ├── terms/
│   │ │ └── index.html
│   │ └── index.html
│   ├── es/
│   │ ├── app-privacy/
│   │ │ ├── google-ocr/
│   │ │ │ └── index.html
│   │ │ └── index.html
│   │ ├── privacy-cookies/
│   │ │ └── index.html
│   │ ├── terms/
│   │ │ └── index.html
│   │ └── index.html
│   ├── terms/
│   │ └── index.html
│   ├── _headers
│   ├── download-resolver.js
│   ├── index.html
│   ├── favicon.svg
│   ├── favicon.ico
│   ├── og-image.png
│   ├── robots.txt
│   ├── site-language.js
│   └── styles.css
├── tools_local/                   # {carpeta ignorada por git} {taller trasero}
├── .editorconfig
├── .eslintrc.cjs
├── .gitattributes
├── .gitignore
├── jsconfig.json
├── package.json
├── package-lock.json
├── ToDo.md
├── CHANGELOG.md
├── PRIVACY.md
├── README.md
└── LICENSE
```

## Guía rápida

**Propósito:** este documento permite entender la estructura del repo de un vistazo (humanos y herramientas), y ubicar rápidamente los “puntos de entrada” y módulos principales.

### 1) Puntos de entrada (entry points)

**Main process (Electron):**
- `electron/main.js` — Punto de entrada del proceso principal: ciclo de vida de la app, creación de ventanas, wiring de IPC, orquestación general.
- `electron/preload.js` — Preload de la ventana principal: expone la API IPC segura hacia `public/renderer.js`.
- `electron/editor_preload.js` — Preload del editor manual: expone IPC específico del editor (texto vigente, settings, estado de ventana del editor, toggle de spellcheck y persistencia de tamaño de fuente/ancho maximizado del textarea) hacia `public/editor.js`.
- `electron/editor_find_preload.js` — Preload de la ventana de búsqueda del editor: expone `window.editorFindAPI` hacia `public/editor_find.js`.
- `electron/preset_preload.js` — Preload del modal de presets: expone `window.presetAPI` y maneja `preset-init` (buffer/replay) y `settings-updated` hacia `public/preset_modal.js`.
- `electron/task_editor_preload.js` — Preload del editor de tareas (expone `window.taskEditorAPI` y callbacks como `onInit` / `onRequestClose`).
- `electron/language_preload.js` — Preload de la ventana de idioma; expone `window.languageAPI` (`setLanguage`, `getAvailableLanguages`) para persistir/seleccionar idioma; `setLanguage` invoca `set-language` y luego emite `language-selected` para destrabar el startup.
- `electron/flotante_preload.js` — Preload de la ventana flotante del cronómetro.
- `electron/reading_test_questions_preload.js` — Preload del modal de preguntas del reading speed test; expone `window.readingTestQuestionsAPI` y bufferiza/reproduce el payload init del cuestionario.
- `electron/reading_test_result_preload.js` — Preload del modal de resultado del reading speed test; expone `window.readingTestResultAPI` y bufferiza/reproduce el payload init del resultado medido.

**Renderer (UI / ventanas):**
- `public/renderer.js` — Lógica principal/orquestador de UI de la ventana principal; delega ownership especializados a módulos auxiliares del renderer como `public/js/wpm_controls.js`, `public/js/presets.js`, `public/js/crono.js` y `public/js/reading_speed_test.js`.
- `public/editor.js` — Entry point/orquestador del editor manual: valida dependencias, arma el contexto compartido del editor y registra bootstrap, listeners DOM e IPC sobre los módulos auxiliares `public/js/editor_ui.js` y `public/js/editor_engine.js`, incluyendo el layout maximizado centrado con gutters simétricos.
- `public/editor_find.js` — Lógica de la ventana dedicada de búsqueda del editor.
- `public/preset_modal.js` — Lógica del modal de presets (nuevo/editar).
- `public/task_editor.js` — Renderer del editor de tareas (UI + tabla + biblioteca + anchos de columnas).
- `public/flotante.js` — Lógica de la ventana flotante del cronómetro.
- `public/language_window.js` — Lógica de la ventana de selección de idioma.
- `public/reading_test_questions.js` — Lógica del modal de preguntas/comprensión del reading speed test.
- `public/reading_test_result.js` — Lógica del modal compacto de resultado del reading speed test (WPM medidos + resumen breve antes de preguntas/preset).

### 2) Módulos del proceso principal (Electron)

- `electron/fs_storage.js`: Persistencia JSON sincrónica del main; resuelve rutas bajo `app.getPath('userData')/config` (requiere `initStorage(app)`); ensure dirs + loadJson/saveJson + getters de `settings/current_text/editor_state`, estado del picker text extraction, estado externo del pool del reading speed test, credenciales/tokens OCR runtime y ruta de credenciales OCR empaquetadas en `electron/assets/ocr_google_drive/credentials.json`.
- `electron/settings.js`: estado de settings: defaults centralizados (`createDefaultSettings`), carga/normalización y persistencia; integra defaults de formato numérico desde `i18n/<langBase>/numberFormat.json` (`ensureNumberFormattingForBase`); registra IPC `get-settings`, `set-language`, `set-mode-conteo`, `set-selected-preset`, `set-spellcheck-enabled`, `set-editor-font-size-px` y difunde cambios vía `settings-updated` más callback `onSettingsUpdated`; mantiene buckets por idioma (p.ej. `selected_preset_by_language`) y persiste `spellcheckEnabled` y `editorFontSizePx`.
- `electron/spellcheck.js` — Política/controlador del spellcheck de Electron: resuelve el diccionario a usar según el idioma activo de la app, aplica la configuración sobre `session.defaultSession`, respeta `spellcheckEnabled` y deshabilita spellcheck cuando el tag activo no tiene diccionario soportado (p.ej. `arn`, `es-cl`) en vez de delegar silenciosamente al locale del SO.
- `electron/text_state.js` — Estado del texto vigente: carga/guardado, límites (texto + payload IPC), lectura de portapapeles en main, y broadcast best-effort hacia ventanas (main/editor).
- `electron/current_text_snapshots_main.js` — Snapshots del texto vigente (save/load): valida payloads del flujo save, abre diálogos nativos, persiste/lee JSON bajo `config/saved_current_texts/` (incluye subcarpetas), acepta snapshots simples `{ "text": "<string>" }`, snapshots etiquetados `{ "text": "<string>", "tags"?: { "language"?, "type"?, "difficulty"? } }` y archivos compatibles con payload opcional `readingTest`, confirma overwrite al cargar y mantiene chequeo de contención (realpath/relative) para evitar escapes fuera del árbol; la carga normal sigue aplicando solo `text` al current text.
- `electron/editor_state.js` — Persistencia/estado de la ventana editor (tamaño/posición/maximizado y `maximizedTextWidthPx`), su integración con el `BrowserWindow` y el bridge IPC/notificaciones del estado de ventana hacia el renderer del editor.
- `electron/editor_find_main.js` — Coordinador main-owned del find/replace del editor: conserva el ciclo de vida de la ventana dedicada, el wiring Electron-specific de listeners/IPC autorizado, los atajos (`Ctrl/Cmd+F`, `Ctrl+H` / `Cmd+Option+F`, `F3`, `Shift+F3`, `Esc`, `Ctrl/Cmd +`, `Ctrl/Cmd -`, `Ctrl/Cmd 0`) y la orquestación de alto nivel entre ventana editor y ventana Find.
- `electron/editor_find_session.js` — Sesión/state machine main-owned del find/replace del editor: encapsula el estado mutable del query, navegación `findInPage`, re-sync al refocar la ventana Find, waits/pending request scoped, y la tubería main↔editor de `Replace` / `Replace All` con sincronización de estado basada en `found-in-page`.
- `electron/editor_find_shortcuts.js` — Helpers puros/importables de shortcuts del find del editor: detección de `Ctrl/Cmd+F`, `Ctrl+H` / `Cmd+Option+F`, `F3`, `Esc` y shortcuts de tamaño de texto; se mantiene sin estado para reducir ruido en `editor_find_main.js`.
- `electron/editor_text_size.js` — Controlador main-owned del tamaño de texto del editor: encapsula `set/increase/decrease/reset`, persiste `editorFontSizePx` vía `settings`, difunde `settings-updated` y entrega acciones reutilizables para los atajos del editor/find sin seguir inflando `electron/main.js`.
- `electron/reading_test_pool.js` — Helpers del pool del reading speed test: asegura el subárbol runtime bajo snapshots, sincroniza al arranque los starter files versionados mediante hashes de contenido bundled, poda estado obsoleto y starter files retirados, escanea/valida JSON del pool y mezcla contenido + estado externo (`config/reading_test_pool_state.json`) para serializar metadata usable por la UI (`used` top-level).
- `electron/reading_test_pool_import.js` — Follow-up main-owned de adquisición/import del pool: abre el picker nativo para `.json`/`.zip`, recuerda la última carpeta usada, valida candidatos contra el contrato del pool, resuelve duplicados por nombre de destino y escribe solo snapshots válidos dentro de `config/saved_current_texts/reading_speed_test_pool/`.
- `electron/reading_test_session.js` — Orquestador/controlador main-owned del reading speed test: valida precondiciones, mantiene el estado compartido de la sesión, expone el surface público consumido por `main.js`, registra el IPC (`reading-test-get-entry-data`, `reading-test-reset-pool`, `reading-test-start`, `reading-test-get-state`) y delega la plomería de ventanas y el flujo guiado a módulos auxiliares sin cambiar el contrato externo.
- `electron/reading_test_session_windows.js` — Helpers de ventanas del reading speed test: espera visibilidad/carga del editor y la ventana flotante, abre la sesión guiada en modo diferido, sincroniza la visibilidad del overlay prestart del editor y crea los modales de resultado y de preguntas.
- `electron/reading_test_session_flow.js` — Helpers del flujo guiado del reading speed test: ownership de las etapas `arming/running/result/questions/preset`, cómputo autoritativo de WPM, payload prellenado del preset, cancel/finish semantics, ruta `pool` vs `current_text` y reinterpretación de comandos/cierres de la ventana flotante y el editor.
- `electron/presets_main.js` — Sistema de presets en main: defaults por idioma, CRUD, diálogos nativos y handlers IPC.
- `electron/tasks_main.js` — Backend de tareas (persistencia + validación + IPC de listas/biblioteca/anchos/enlaces).
- `electron/task_editor_position.js` — Persistencia de posición (x/y) de la ventana del editor de tareas.
- `electron/text_extraction_platform/text_extraction_file_picker_ipc.js` — File picker nativo del flujo text extraction; resuelve carpeta por defecto/persistida, guarda la última carpeta usada y deriva la lista de extensiones soportadas desde el contrato compartido de formatos.
- `electron/text_extraction_platform/text_extraction_preconditions_ipc.js` — Gate previo al inicio: bloquea extracción si hay ventanas secundarias abiertas o si el cronómetro está corriendo.
- `electron/text_extraction_platform/text_extraction_processing_mode_ipc.js` — Controlador/IPC del processing mode de text extraction: lock state, broadcast al renderer y solicitud de abort.
- `electron/text_extraction_platform/text_extraction_ocr_activation_ipc.js` — Activación OCR Google vía navegador del sistema, separada en dos fases IPC: preparación de credenciales (`prepareTextExtractionOcrActivation`, sin abrir navegador) y lanzamiento OAuth (`launchTextExtractionOcrActivation`, usa el helper loopback seguro con `state` + PKCE, persiste el token local y valida el setup).
- `electron/text_extraction_platform/text_extraction_ocr_disconnect_ipc.js` — Desconexión OCR desde menú: confirmación nativa, revocación del token OAuth guardado y borrado del token local tras revocación exitosa.
- `electron/text_extraction_platform/text_extraction_prepare_execute_core.js` — Núcleo compartido del prepare/execute: clasificación de archivo, gating de formatos soportados, triage PDF, selección de ruta y ejecución.
- `electron/text_extraction_platform/text_extraction_prepare_ipc.js` — Etapa prepare del archivo seleccionado: calcula metadata/rutas disponibles y crea el registro preparado.
- `electron/text_extraction_platform/text_extraction_execute_prepared_ipc.js` — Etapa execute del flujo preparado: valida integridad del registro/fingerprint y corre la ruta elegida en processing mode.
- `electron/text_extraction_platform/text_extraction_prepared_store.js` — Store efímero de requests preparadas con TTL y fingerprint del archivo fuente.
- `electron/text_extraction_platform/text_extraction_platform_adapter.js` + `electron/text_extraction_platform/platform_adapters/*.js` — Abstracción por plataforma para carpeta inicial del picker y normalización de paths (Windows-first, pero portable a macOS/Linux).
- `electron/text_extraction_platform/text_extraction_supported_formats.js` — Contrato compartido de formatos soportados por text extraction: centraliza extensiones nativas, extensiones Google-backed y extensiones OCR/imagen, además de los helpers reutilizados por picker, prepare y rutas de ejecución.
- `electron/text_extraction_platform/native_extraction_route.js` — Ruta de extracción nativa para `txt`, `md`, `html`, `docx` y PDFs con text layer; consume el contrato compartido de formatos y mantiene el pipeline de normalización.
- `electron/text_extraction_platform/native_pdf_selectable_text_probe.js` — Probe de PDF para detectar si existe texto seleccionable utilizable antes de decidir la ruta.
- `electron/text_extraction_platform/ocr_google_drive_activation_state.js` — Estado grueso de disponibilidad OCR a partir de presencia de `credentials.json`/`token.json`; distingue `credentials_missing`, `ocr_activation_required` y `ready` antes de validaciones más profundas.
- `electron/text_extraction_platform/ocr_google_drive_bundled_credentials.js` — Bootstrap del modelo OCR de producción: consume el lector compartido de `credentials.json`, valida las credenciales OAuth desktop empaquetadas y materializa/repara el espejo runtime bajo `config/ocr_google_drive/credentials.json` sin pedir importación manual al usuario.
- `electron/text_extraction_platform/ocr_google_drive_credentials_file.js` — Lector/validador low-level compartido para `credentials.json`: lectura BOM-safe, parse JSON, clasificación (`missing_file`/`empty_file`/`invalid_json`/`invalid_shape`/`read_failed`) y validación de la shape OAuth desktop/web.
- `electron/text_extraction_platform/ocr_google_drive_oauth_client.js` — Helpers compartidos OAuth para OCR: lectura/normalización de `credentials.json`, construcción del cliente OAuth2 y selección del token preferido para revocación.
- `electron/text_extraction_platform/ocr_google_drive_secure_oauth.js` — Helper propio de activación OAuth desktop segura para Google OCR: reutiliza el cliente OAuth instalado ya empaquetado, abre navegador externo del sistema, levanta callback loopback efímero y aplica `state` + PKCE antes de intercambiar el código.
- `electron/text_extraction_platform/ocr_google_drive_provider_failure_classification.js` — Clasificación compartida post-parse de fallas provider/runtime de Google OCR: centraliza tablas de razones y la política común para `connectivity_failed`, `provider_api_disabled`, `quota_or_rate_limited`, `auth_failed` y `platform_runtime_failed`.
- `electron/text_extraction_platform/ocr_google_drive_provider_failure.js` — Parser compartido de fallas provider-side de Google para OCR: lee tanto `error.errors[].reason` como `google.rpc.ErrorInfo.reason`, normaliza señales documentadas de API deshabilitada y preserva diagnóstico de conflictos entre ambos formatos.
- `electron/text_extraction_platform/ocr_google_drive_setup_validation.js` — Validación técnica del setup OCR (credenciales, token y reachability de Google Drive); consume el parser compartido y la clasificación post-parse común, pero conserva subtipos y fallback propios del flujo de setup.
- `electron/text_extraction_platform/ocr_google_drive_token_storage.js` — Lectura/escritura/borrado protegido del token OCR usando `safeStorage` de Electron.
- `electron/text_extraction_platform/ocr_google_drive_route.js` — Ruta Google Drive/Docs para extracción respaldada por Google: cubre `rtf`/`odt` por conversión de documento y también imágenes/PDFs para OCR, usa la clasificación post-parse común para fallas provider/runtime y conserva sus fallbacks propios de etapa (`ocr_conversion_failed` / `ocr_export_failed`).
- `electron/text_extraction_platform/ocr_image_normalization.js` — Normalización local de imágenes para OCR antes del upload cuando el formato lo requiere.
- `electron/menu_builder.js` — Construcción del menú nativo: carga bundle i18n con cadena de fallback (tag→base→DEFAULT_LANG); incluye menú Dev opcional (SHOW_DEV_MENU en dev); enruta acciones al renderer (`menu-click`) y expone textos de diálogos.
- `electron/updater.js` — Lógica de actualización (comparación de versión, diálogos y apertura de URL de descarga).
- `electron/link_openers.js` — Registro de IPC para abrir enlaces externos y documentos de la app: `open-external-url` (solo `https` + whitelist de hosts, incluyendo `totapp.org` y `ko-fi.com` para superficies fijas de la app) y `open-app-doc` (mapea docKey→archivo; gating en dev; verifica existencia; en algunos casos copia a temp y abre vía `shell.openExternal/openPath`).
- `electron/constants_main.js` — Constantes del proceso principal (IDs, rutas/keys comunes, flags, etc. según aplique), incluyendo límites/default/step del tamaño de fuente y del ancho de texto maximizado del editor manual.
- `electron/log.js` — Logger del proceso principal (política de logs/fallbacks).
- `electron/main.js` — Además del arranque normal, contiene un hook de smoke test local controlado por env vars (`TOT_SMOKE_TEST`, `TOT_SMOKE_USER_DATA_DIR`) para validar el startup mínimo con perfil aislado; la lógica específica de tamaño de texto del editor queda delegada a `electron/editor_text_size.js`.

### 3) Módulos del renderer (public/js)

Estos módulos encapsulan lógica compartida del lado UI; `public/renderer.js` suele actuar como orquestador.

- `public/js/constants.js` — Constantes compartidas del renderer, incluyendo límites/default/step del tamaño de fuente, ancho de texto maximizado y gutter mínimo del editor manual.
- `public/js/wpm_curve.js` — Mapeo discreto slider↔WPM (lineal/exponencial suave), garantizando cobertura de enteros en el rango configurado.
- `public/js/wpm_controls.js` — Owner renderer de los controles de velocidad de lectura: centraliza estado WPM, binding slider/input, mapeo vía `wpm_curve`, carga/selección de presets en coordinación con `RendererPresets` y aplicación de cambios externos sin devolver esa lógica a `public/renderer.js`.
- `public/js/lib/count_core.js` — Núcleo puro/importable de conteo (simple/preciso, `Intl.Segmenter`, regla de unión por guiones) reutilizado por el wrapper renderer y por la suite automatizada.
- `public/js/lib/editor_find_replace_core.js` — Núcleo puro/importable del find/replace del editor: matching literal sobre selección, cómputo determinista de `Replace All` y chequeo puro de elegibilidad por longitud; reutilizado por `public/editor.js` y por la suite automatizada.
- `public/js/lib/editor_maximized_layout_core.js` — Núcleo puro/importable del layout maximizado del editor manual: clamp del ancho preferido/renderizado de la columna centrada y cálculo del resize simétrico desde cualquiera de los gutters; reutilizado por `public/editor.js` y por la suite automatizada.
- `public/js/lib/format_core.js` — Núcleo puro/importable de formateo (tiempo estimado, partes de tiempo y separadores numéricos) reutilizado por el wrapper renderer y por la suite automatizada.
- `public/js/lib/reading_test_filters_core.js` — Núcleo puro/importable del selector del reading speed test: semántica de checkboxes (OR dentro de categoría, AND entre categorías activas), cálculo de elegibles y enabled/disabled state desde combinaciones reales.
- `public/js/lib/reading_test_questions_core.js` — Núcleo puro/importable del reading speed test para validar payloads `readingTest.questions`, puntuar respuestas y calcular el baseline probabilístico de respuesta al azar.
- `public/js/lib/snapshot_tag_catalog.js` — Catálogo puro/importable compartido de tags de snapshot: define los valores canónicos/opciones de `language` / `type` / `difficulty` y centraliza la normalización reutilizada por renderer y main para evitar drift.
- `public/js/count.js` — Wrapper renderer de conteo: valida dependencias del `window`, construye `window.CountUtils` desde `count_core.js` y conserva la superficie pública existente.
- `public/js/format.js` — Wrapper renderer de formateo: valida dependencias del `window`, construye `window.FormatUtils` desde `format_core.js` y conserva la superficie pública existente.
- `public/js/i18n.js` — Capa i18n del renderer: carga/aplicación de textos y utilidades de traducción.
- `public/js/presets.js` — Bridge/owner renderer de presets: resuelve catálogo por idioma, rellena el selector en DOM, conserva la descripción visible y persiste la selección activa; deja el ownership de WPM widget sync a `public/js/wpm_controls.js`.
- `public/js/crono.js` — UX del cronómetro en UI (cliente del cronómetro autoritativo en main).
- `public/js/menu_actions.js` — Router de acciones recibidas desde el menú (`menu-click`) hacia handlers de UI; expone `window.menuActions` (register/unregister/list/stopListening).
- `public/js/current_text_snapshots.js` — Helper de snapshots del texto vigente: expone `saveSnapshot()` / `loadSnapshot()`, invoca el modal previo de tags al guardar, normaliza metadata opcional de snapshot vía `snapshot_tag_catalog`, llama `electronAPI.saveCurrentTextSnapshot` / `electronAPI.loadCurrentTextSnapshot` y mapea `{ ok, code }` a `Notify` (sin DOM wiring; el binding de botones vive en `public/renderer.js`).
- `public/js/snapshot_save_tags_modal.js` — Modal renderer previo al save nativo de snapshots: muestra selects opcionales para `language` / `type` / `difficulty`, aplica i18n y devuelve tags normalizados o cancelación.
- `public/js/reading_speed_test.js` — Módulo renderer del reading speed test: gestiona el modal de entrada/configuración, refleja combinaciones reales del pool, ejecuta reset/start IPC, muestra warnings inline y sincroniza el lock state / WPM aplicado.
- `public/js/info_modal_links.js` — Binding de enlaces en info modals: evita doble-bind (`dataset.externalLinksBound`); rutea `#` (scroll interno), `appdoc:` (api.openAppDoc) y externos (api.openExternalUrl); usa `CSS.escape` con fallback; logger `window.getLogger('info-modal-links')`.
- `public/js/main_logo_links.js` — Binding de enlaces fijos del header principal: conecta los logos clickeables de Cibersino y Ko-fi a `electronAPI.openExternalUrl(...)`, aplica tooltips/labels i18n y mantiene este wiring fuera de `public/renderer.js`.
- `public/js/text_apply_canonical.js` — Helpers canónicos de aplicar texto (`overwrite` / `append` / repeticiones) reutilizados por clipboard y por el flujo de extracción.
- `public/js/results_time_multiplier.js` — Controla el multiplicador de tiempo bajo el resultado estimado: valida el input como numero natural, conserva el estado base recibido desde `public/renderer.js` y renderiza el tiempo multiplicado en la ventana principal.
- `public/js/text_extraction_status_ui.js` — Superficie visual del flujo text extraction en ventana principal: estado prepare, waiting UI honesta, tiempo transcurrido y botón abort.
- `public/js/text_extraction_route_choice_modal.js` — Modal de elección de ruta (`native` / `ocr`) cuando un PDF soporta ambas.
- `public/js/text_extraction_apply_modal.js` — Modal post-extracción para decidir overwrite/append y repeticiones antes de aplicar el texto extraído.
- `public/js/text_extraction_ocr_activation_disclosure_modal.js` — Modal renderer de preconsentimiento para OCR Google: muestra la divulgación inmediatamente antes del OAuth, enlaza a `privacy-policy` mediante `openAppDoc(...)` y exige acción afirmativa del usuario.
- `public/js/text_extraction_ocr_activation_recovery.js` — Helpers de recuperación para OCR: completan preparación de credenciales, muestran el modal de divulgación y lanzan OAuth solo tras aceptación, antes de reintentar el prepare.
- `public/js/text_extraction_ocr_disconnect.js` — Handler del renderer para `Disconnect Google OCR`: solicita la desconexión al main y muestra feedback de éxito/fallo/not-connected.
- `public/js/text_extraction_entry.js` — Orquestador compartido del flujo text extraction desde picker o drag/drop.
- `public/js/text_extraction_drag_drop.js` — Capa drag/drop del main: overlay de drop y forwarding de archivos al entry flow compartido.
- `public/js/current_text_selector_section.js` — Owner UI de la sección “texto vigente” en la ventana principal: concentra el título, el preview del texto actual, el toolbar local de esa sección, el lock state específico de sus controles y el toggle `Spoiler`, que permite ocultar el tramo final del preview sin devolver esa lógica a `public/renderer.js`.
- `public/js/editor_ui.js` — Módulo UI del editor manual: i18n del editor, `spellcheck`, tamaño de texto, layout maximizado con gutters simétricos y persistencia de `maximizedTextWidthPx`, progreso de lectura, restauración de foco y overlay prestart del reading speed test.
- `public/js/editor_engine.js` — Módulo de lógica/sync del editor manual: helpers de selección e inserción, `replace current/all`, sincronización con main, truncation handling, paste/drop y aplicación de updates externos.
- `public/js/notify.js` — Avisos/alertas no intrusivas en UI.
- `public/js/log.js` — Logger del renderer (política de logs del lado UI).

### 3.1) Extensión Chrome (`extensions/reading-time/chrome`)

- `extensions/reading-time/chrome/manifest.json` — Manifiesto MV3 de la extensión: action popup, `service_worker`, permiso `storage`, command `toggle-current-tab`, content scripts sobre `http(s)` y `web_accessible_resources` para `content.css`.
- `extensions/reading-time/chrome/service-worker.js` — Orquestador background de la extensión: resuelve el sitio activo/tab actual, persiste el estado disabled por `origin` en `chrome.storage.local`, atiende mensajes `getSiteState` / `setSiteEnabled` y propaga cambios a tabs del mismo origen.
- `extensions/reading-time/chrome/logic.js` — Núcleo compartido/importable de la extensión: normalización de texto, resolución de locale, conteo de palabras con `Intl.Segmenter`, parseo de WPM y formateo del tiempo estimado.
- `extensions/reading-time/chrome/content-script.js` — Content script inyectado en páginas: observa selección de texto, monta el overlay shadow-DOM, calcula/actualiza el tiempo estimado, persiste WPM local y responde el `origin` de la top frame al background.
- `extensions/reading-time/chrome/popup.html` + `popup.css` + `popup.js` — UI del popup de la acción del navegador: consulta el estado del sitio activo, permite activar/desactivar la extensión por sitio y muestra feedback de carga/error.
- `extensions/reading-time/chrome/_locales/<lang>/messages.json` — Strings localizados de la extensión (`es`, `en`) consumidos por manifest, popup y overlay.
- `extensions/reading-time/chrome/icons/*.png` — Íconos empaquetados de la extensión para action/manifest.

### 3.2) Testing automatizado

- `.github/workflows/test.yml` — Workflow GitHub Actions del baseline automatizado actual; corre `npm ci` + `npm test` sobre `windows-latest`.
- `test/README.md` — Convenciones del layout de tests y separación entre baseline unitario y smoke suite local.
- `test/unit/electron/*.test.js` — Cobertura de contratos Node-accessible del proceso principal y del flujo text extraction (`settings`, incluyendo normalización/persistencia de `editorFontSizePx`, `editor_state` para `maximizedTextWidthPx`/window-state IPC, `spellcheck`, formatos soportados, prepared store, parsing/clasificación OCR, decision helpers, más `editor_find_main.test.js` para autorización IPC, re-sync al refocus y orquestación request-scoped de replace).
- `test/unit/electron/reading_test_pool.test.js` — Cobertura del pool del reading speed test: sincronización startup del starter set, seguimiento de hashes, estado externo `used` y prune de filas/archivos gestionados obsoletos.
- `test/unit/electron/reading_test_pool_import.test.js` — Cobertura del importador del pool del reading speed test: validación de `.json`/`.zip`, duplicados, persistencia de última carpeta y reporte de fallas de escritura.
- `test/unit/electron/spellcheck.test.js` — Cobertura del spellcheck main-owned: resolución de idiomas soportados, aplicación sobre `Session` y controller `createController(...)`/fallbacks de sesión.
- `test/unit/shared/*.test.js` — Cobertura de núcleos puros extraídos del renderer (`count_core`, `format_core`, `editor_find_replace_core`, `editor_maximized_layout_core`) y de la persistencia del margen maximizado del editor en `editor_ui`.
- `test/smoke/electron_launch_smoke.test.js` — Smoke test local del arranque real de Electron con perfil temporal aislado; además valida que el startup tolere el schema vigente mínimo de settings (incluyendo flags nuevos como `spellcheckEnabled` y `editorFontSizePx`); no forma parte de `npm test` ni del workflow CI base.

### 4) i18n (estructura y responsabilidades)

- `i18n/languages.json` — Catálogo de idiomas soportados (y metadatos si aplica).
- `i18n/<lang>/main.json` — Textos del proceso principal / menú / diálogos nativos.
- `i18n/<lang>/renderer.json` — Textos de la UI (ventana principal y modales renderizados).
- `i18n/<lang>/numberFormat.json` — Configuración de formato numérico por idioma (defaults; puede haber override vía settings).
- `i18n/<lang>/<variant>/*.json` — Variantes regionales cuando aplica (p.ej. `i18n/es/es-cl/`).

### 5) Persistencia runtime (carpeta `config/`)

**Nota:** `config/` se crea y usa en runtime. Estos archivos representan **estado local del usuario** y se ignoran por git para no commitear estado de ejecución.

- `config/user_settings.json` — Preferencias del usuario (idioma, modo de conteo, `spellcheckEnabled`, `editorFontSizePx`, presets personalizados, etc.).
- `config/current_text.json` — Texto vigente persistido.
- `config/editor_state.json` — Estado persistido del editor (geometría/maximizado y `maximizedTextWidthPx`).
- `config/text_extraction_state.json` — Estado local del picker de text extraction (por ejemplo, última carpeta utilizada).
- `config/reading_test_pool_state.json` — Estado externo del pool del reading speed test; guarda `used` por `snapshotRelPath` y, para starter files gestionados por la app, el `managedBundledHash` instalado.
- `config/reading_test_pool_import_state.json` — Estado local del picker del importador del pool del reading speed test (última carpeta utilizada).
- `config/ocr_google_drive/credentials.json` — Espejo/copia runtime gestionado por la app para la configuración OAuth de Google OCR; en el modelo actual se materializa desde credenciales empaquetadas de la app y no forma parte del onboarding manual del usuario.
- `config/ocr_google_drive/token.json` — Estado local del token OAuth del usuario final para la ruta OCR de Google Drive/Docs; se elimina al desconectar Google OCR tras revocación exitosa.
- `config/saved_current_texts/` — Carpeta runtime con snapshots del texto vigente; admite JSON simples `{ "text": ... }`, snapshots etiquetados `{ "text": ..., "tags"?: { "language"?, "type"?, "difficulty"? } }` y archivos con payload opcional `readingTest`; puede contener subcarpetas. La carga normal de snapshots sigue aplicando solo `text` al current text, sin rechazar metadata adicional compatible.
- `config/saved_current_texts/reading_speed_test_pool/` — Subcarpeta runtime dedicada al pool del reading speed test; recibe starter files sincronizados al arranque desde `electron/reading_test_pool/`, conserva solo contenido (`text`, tags descriptivos y `readingTest` opcional) y delega el estado mutable del pool a `config/reading_test_pool_state.json`; sigue siendo compatible con el flujo normal de snapshots.
- `config/tasks/lists/*.json` — Listas de tareas guardadas por el usuario.
- `config/tasks/library.json` — Biblioteca de filas (por `texto` normalizado).
- `config/tasks/allowed_hosts.json` — Allowlist de hosts confiables para enlaces remotos.
- `config/tasks/column_widths.json` — Persistencia de anchos de columnas del editor de tareas.
- `config/tasks/task_editor_position.json` — Última posición (x/y) de la ventana del editor de tareas.

### 5.1) Material OCR empaquetado

- `electron/assets/ocr_google_drive/credentials.json` — Credenciales desktop OAuth de Google OCR provistas por el owner para builds de producción; no forman parte del setup manual del usuario final y deben permanecer fuera de git.
- `electron/assets/ocr_google_drive/README.md` — Contrato operativo para ese material empaquetado: nombre esperado del archivo, ubicación, protección `.gitignore` y relación con el espejo runtime bajo `config/ocr_google_drive/credentials.json`.

#### 5.2) Presets por defecto (dos capas)

- **Defaults de instalación (versionados):** `electron/presets/*.json`  
  Fuente “empaquetada” / base. Debe existir en el repo y viaja con la app.

- **Defaults editables por el usuario (runtime, no versionados):** `config/presets_defaults/*.json`  
  Copia editable fuera del empaquetado. Ignorada por git.

**Regla operativa (documentar aquí solo si aplica en el código actual):**
- Si `config/presets_defaults/` no existe o falta algún archivo esperado, la app lo restaura desde `electron/presets/`.
- Si el usuario modifica archivos en `config/presets_defaults/`, esos cambios se consideran en el próximo arranque.

### 6) Documentación y operación del repo

- `docs/releases/release_checklist.md` — Checklist mecánico de release (fuentes de verdad, changelog, consistencia).
- `docs/releases/<version>/` — Baselines y checklists versionados por release.
- `docs/changelog_detailed.md` — Changelog detallado (técnico/narrativo; post-0.0.930 con formato mecánico).
- `docs/test_suite.md` — Suite manual app-level; incluye una sección breve de “Automated coverage status” para mapear la cobertura automatizada vigente sin reemplazar el smoke/regression manual.
- `CHANGELOG.md` — Changelog corto (resumen por versión).
- `ToDo.md` (o `docs/` / Project) — Roadmap/índice (si aplica; evitar duplicación con GitHub Project/Issues).

### 6.0) Tooling raíz

- `package.json` — Manifiesto npm/electron-builder; además del arranque y packaging, define `npm test`, `npm run test:unit` y `npm run test:smoke`, y registra el hook `afterAllArtifactBuild` que reenvuelve los `.zip` distribuidos bajo una carpeta raíz `toT-<version>/`.
- `package-lock.json` — Lockfile npm usado también por el workflow CI (`npm ci`).

### 6.1) Sitio web estático (website/public)

- `website/public/index.html` — Landing neutral del sitio público (`https://totapp.org/`), usada como entrada x-default, selector explícito de idioma y preview visual de la app mediante `assets/demo/guia-basica.gif`.
- `website/public/es/index.html` — Versión en español (`https://totapp.org/es/`), con switch de idioma, CTA de descarga y bloque "Síguenos"; define `window.totDownloadConfig` para el resolvedor de descarga por plataforma.
- `website/public/en/index.html` — Versión en inglés (`https://totapp.org/en/`), con switch de idioma, CTA de descarga y bloque "Follow us"; define `window.totDownloadConfig` para el resolvedor de descarga por plataforma.
- `website/public/download-resolver.js` — Helper compartido del sitio para detectar plataforma/arquitectura del navegador, consultar el último release en GitHub, seleccionar el asset estable más adecuado y abrir el modal con instrucciones de instalación.
- `website/public/app-privacy/index.html` — Ruta neutral `x-default` hacia la política pública de privacidad de la app; redirige según idioma preferido vía `site-language.js`.
- `website/public/es/app-privacy/index.html` — Política de privacidad pública de la app en español.
- `website/public/en/app-privacy/index.html` — Política de privacidad pública de la app en inglés.
- `website/public/es/app-privacy/google-ocr/index.html` — Página pública específica de privacidad para Google OCR en español.
- `website/public/en/app-privacy/google-ocr/index.html` — Página pública específica de privacidad para Google OCR en inglés.
- `website/public/terms/index.html` — Ruta neutral `x-default` hacia los términos de servicio; redirige según idioma preferido vía `site-language.js`.
- `website/public/es/terms/index.html` — Términos de servicio del sitio web y de la app en español.
- `website/public/en/terms/index.html` — Términos de servicio del sitio web y de la app en inglés.
- `website/public/chrome-extension-privacy/index.html` — Política pública de privacidad de la extensión Chrome `toT — Tiempo de lectura`; documenta datos locales, permisos y ausencia de transmisión/telemetría.
- `website/public/es/privacy-cookies/index.html` — Política mínima de privacidad/cookies en español.
- `website/public/en/privacy-cookies/index.html` — Política mínima de privacidad/cookies en inglés.
- Footers y paneles de descarga de `index.html`, `es/index.html` y `en/index.html` — incluyen enlaces visibles a privacidad/cookies y, en las rutas por idioma, también a la política pública de privacidad de la app y a términos de servicio.
- `website/public/site-language.js` — Helper compartido del sitio estático para detectar/persistir idioma preferido, resaltar la entrada recomendada en `/` y soportar redirecciones neutrales como `/app-privacy/` y `/terms/`.
- `website/public/styles.css` — Hoja de estilos compartida para las tres rutas.
- `website/public/assets/brand/*.svg` — Logos locales del proyecto/desarrollador usados en el header y footer (`logo-tot.svg`, `logo-cibersino.svg`).
- `website/public/assets/demo/guia-basica.gif` — Demo visual embebida en la landing neutral del sitio.
- `website/public/assets/social/` — Íconos sociales usados en `/es/` y `/en/` (Instagram light/dark, Ko-fi, X light/dark y YouTube) y `SOURCES.md` como trazabilidad de origen de assets.
- `website/public/_headers` — Políticas de headers para Cloudflare Pages (incluye noindex para dominios preview/versionados).
- `website/public/robots.txt` — Reglas de robots para el dominio público.
- `website/public/favicon.*` y `website/public/og-image.png` — Activos comunes de branding/preview social.

### 6.2) Branding local en la app (public/assets)

- `public/assets/SOURCES.md` — Trazabilidad local de procedencia para assets runtime de `public/assets/`, especialmente los de terceros o sujetos a términos de marca.
- `public/assets/logo-tot.svg` / `public/assets/logo-tot.png` — Branding de la app usado en la ventana principal.
- `public/assets/logo-cibersino.svg` — Branding del desarrollador usado en la ventana principal.
- `public/assets/kofi_symbol.png` — Símbolo de Ko-fi usado en la ventana principal junto al logo de Cibersino; asset runtime copiado desde `tools_local` para mantener la procedencia local/original separada del sitio web.

### 6.3) Recursos de packaging (build-resources)

- `build-resources/after-all-artifact-build.js` — Hook post-packaging de `electron-builder`: reempaqueta los artefactos `.zip` ya generados para que el contenido final quede bajo una carpeta raíz única `toT-<version>/`, mejorando la extracción manual del release portable sin alterar el layout interno de `win-unpacked`.
- `build-resources/logo-cibersino.ico` — Icono de packaging para Windows.
- `build-resources/logo-cibersino.png` — Fuente raster canónica de branding para packaging; también usable como input para Linux y para generar `logo-cibersino.icns` en macOS.

### 7) Política de actualización de este archivo

Actualizar `docs/tree_folders_files.md` cuando:
- Se agreguen/renombren entry points (main/preloads/ventanas).
- Se mueva o divida lógica en módulos principales (`electron/` o `public/js/`).
- Cambie la estructura o responsabilidades del sitio estático en `website/public/` (rutas, assets compartidos, headers/robots).
- Cambie la estructura de `i18n/`, `docs/` o el layout general del repo.
- Se introduzca o elimine persistencia relevante en `config/`.

Regla: este archivo describe **estructura y responsabilidades**; el detalle operativo vive en los Issues/Project y en la documentación específica.

## Cómo regenerar el árbol

Este documento mantiene un **árbol resumido y anotado** (sección “Árbol”) para explicar estructura y responsabilidades.
El comando nativo de Windows (`tree`) genera un **árbol completo** con un formato distinto; se usa como **insumo** para actualizar el resumen, no como reemplazo 1:1.

### 1) Generar árbol completo (referencia / verificación)

Ejecutar desde la raíz del repo:

PowerShell/CMD:
```
tree /F /A
```

Sugerencia operativa: si quieres comparar cómodamente, redirige la salida a un archivo temporal (no commitear):

```
tree /F /A | Out-File -Encoding utf8 docs\_tree_full.txt
```

### 2) Actualizar el árbol resumido (este documento)

El bloque “Árbol” de este archivo es **curado**. Al actualizarlo:

* Mantén solo carpetas y archivos **clave** (entry points, módulos principales, docs relevantes).
* Conserva las anotaciones (`# {ignorado por git}`, `{generado en runtime}`, etc.).
* Si agregas/renombras/mueves un entry point o módulo principal, actualiza también la sección “Guía rápida”.
* Evita listar carpetas voluminosas en detalle (`node_modules/`, outputs, etc.); basta con dejarlas a nivel superior con una nota.

Regla: el árbol completo (`tree /F /A`) es la referencia; el bloque “Árbol” es el resumen explicativo.


