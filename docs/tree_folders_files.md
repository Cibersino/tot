# Árbol de carpetas y archivos

**Versión de la app:** ver campo `version` en [`package.json`](../package.json)

Este documento describe la **estructura** del repo y los **archivos clave** (entry points y módulos).
No es un inventario exhaustivo de cada archivo.

## Árbol

```ASCII
tot/
├── .github/
│ └── workflows/
│   └── test.yml                   # {workflow GitHub Actions del baseline automatizado (`npm test` en Windows)}
├── assets/
│   └── icons/                     # {íconos funcionales canónicos de la app}
├── build-resources/               # {recursos solo de packaging (electron-builder)}
├── config/                        # {generada en primer arranque} {carpeta ignorada por git}
│ ├── ocr_google_drive/
│ │ ├── credentials.json
│ │ └── token.json
│ ├── presets_defaults/
│ │ ├── defaults_presets.json   
│ │ ├── defaults_presets_en.json
│ │ └── defaults_presets_es.json
│ ├── saved_current_texts/
│ │ └── reading_speed_test_pool/   # {pool local del reading speed test; sincronizado al arranque, contenido sin state inline}
│ ├── tasks/
│ │ ├── allowed_hosts.json
│ │ ├── column_widths.json
│ │ ├── library.json
│ │ ├── lists/
│ │ └── task_editor_state.json
│ ├── current_text.json
│ ├── editor_state.json
│ ├── reading_test_pool_import_state.json
│ ├── reading_test_pool_state.json
│ ├── text_extraction_state.json
│ └── user_settings.json
├── docs/
│ ├── releases/                    # {con subcarpetas por release con docs de chequeo}
│ │ ├── legal_baseline.md
│ │ ├── release_checklist.md
│ │ └── security_baseline.md
| ├── screenshots/ 
│ │ ├── windows/
| | | ├── en/
| | | └── es/
│ │ └── README.md
│ ├── changelog_detailed.md
│ ├── test_suite.md
│ └── tree_folders_files.md
├── electron/
│ ├── assets/
│ │ └── ocr_google_drive/          # {credenciales OAuth desktop empaquetadas para OCR Google}
│ │   ├── credentials.json         # {ignorado por git; material real provisto por el owner para builds de producción}
│ │   └── README.md
│ ├── presets/                     # {presets para restauración de fábrica}
│ │ ├── defaults_presets.json
│ │ ├── defaults_presets_en.json
│ │ └── defaults_presets_es.json
│ ├── reading_test_pool/           # {starter files versionados del reading speed test}
│ ├── text_extraction_platform/
│ │ ├── platform_adapters/
│ │ │ ├── common.js
│ │ │ ├── darwin.js
│ │ │ ├── fallback.js
│ │ │ ├── linux.js
│ │ │ └── windows.js
│ │ ├── native_extraction_route.js
│ │ ├── native_pdf_selectable_text_probe.js
│ │ ├── ocr_google_drive_activation_state.js
│ │ ├── ocr_google_drive_bundled_credentials.js
│ │ ├── ocr_google_drive_credentials_file.js
│ │ ├── ocr_google_drive_oauth_client.js
│ │ ├── ocr_google_drive_provider_failure.js
│ │ ├── ocr_google_drive_provider_failure_classification.js
│ │ ├── ocr_google_drive_route.js
│ │ ├── ocr_google_drive_secure_oauth.js
│ │ ├── ocr_google_drive_setup_validation.js
│ │ ├── ocr_google_drive_token_storage.js
│ │ ├── ocr_image_normalization.js
│ │ ├── text_extraction_execute_prepared_ipc.js
│ │ ├── text_extraction_file_picker_ipc.js
│ │ ├── text_extraction_generated_pdf_reveal_ipc.js
│ │ ├── text_extraction_heavy_pdf_split_core.js
│ │ ├── text_extraction_ocr_activation_ipc.js
│ │ ├── text_extraction_ocr_disconnect_ipc.js
│ │ ├── text_extraction_pdf_error_detection.js
│ │ ├── text_extraction_pdf_inspect_ipc.js
│ │ ├── text_extraction_pdf_selection_pipeline.js
│ │ ├── text_extraction_platform_adapter.js
│ │ ├── text_extraction_preconditions_ipc.js
│ │ ├── text_extraction_prepare_execute_core.js
│ │ ├── text_extraction_prepare_ipc.js
│ │ ├── text_extraction_prepared_store.js
│ │ ├── text_extraction_processing_mode_ipc.js
│ │ └── text_extraction_supported_formats.js
│ ├── app_temp_paths.js
│ ├── constants_main.js
│ ├── current_text_processing_main_bridge.js
│ ├── current_text_processing_state_ipc.js
│ ├── current_text_snapshots_main.js
│ ├── editor_find_main.js
│ ├── editor_find_preload.js
│ ├── editor_find_session.js
│ ├── editor_find_shortcuts.js
│ ├── editor_preload.js
│ ├── editor_state.js
│ ├── editor_text_size.js
│ ├── editor_window_lifecycle.js
│ ├── flotante_preload.js
│ ├── fs_storage.js
│ ├── language_preload.js
│ ├── link_openers.js
│ ├── log.js
│ ├── main.js
│ ├── menu_builder.js
│ ├── preset_preload.js
│ ├── presets_main.js
│ ├── preload.js
│ ├── reading_test_pool.js
│ ├── reading_test_pool_import.js
│ ├── reading_test_questions_preload.js
│ ├── reading_test_result_preload.js
│ ├── reading_test_session.js
│ ├── reading_test_session_flow.js
│ ├── reading_test_session_windows.js
│ ├── settings.js
│ ├── spellcheck.js
│ ├── task_editor_preload.js
│ ├── task_editor_state.js
│ ├── tasks_main.js
│ ├── text_state.js
│ └── updater.js
├── extensions/                    # {extensiones de navegadores distribuidas fuera de Electron}
│ └── reading-time/
│   └── chrome/
├── i18n/                          # {subcarpetas por idioma y variantes regionales}
│ ├── languages.json
| └── TRANSLATION_GUIDE.md
├── node_modules/                  # { }
├── public/
│ ├── assets/
│ │ ├── extension/                 # { }
│ │ ├── instrucciones/             # {capturas/GIFs usados por public/info/instrucciones.*.html}
│ │ ├── kofi_symbol.png
│ │ ├── logo-cibersino.svg
│ │ ├── logo-tot.120x120.png
│ │ ├── logo-tot.png
│ │ ├── logo-tot.svg
│ │ └── SOURCES.md
│ ├── fonts/
│ │ ├── Baskervville.css
│ │ ├── Baskervville-Italic-VariableFont_wght.ttf
│ │ └── Baskervville-VariableFont_wght.ttf
│ ├── info/
│ │ ├── acerca_de.html
│ │ ├── instrucciones.en.html
│ │ ├── instrucciones.es.html
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
│ │ ├── browser_extension_modal.js
│ │ ├── constants.js
│ │ ├── count.js
│ │ ├── crono.js
│ │ ├── current_text_refresh_policy.js
│ │ ├── current_text_runtime.js
│ │ ├── current_text_selector_section.js
│ │ ├── current_text_snapshots.js
│ │ ├── editor_engine.js
│ │ ├── editor_startup_presentation.js
│ │ ├── editor_ui.js
│ │ ├── format.js
│ │ ├── generated_icons.js
│ │ ├── i18n.js
│ │ ├── info_modal_links.js
│ │ ├── log.js
│ │ ├── main_logo_links.js
│ │ ├── menu_actions.js
│ │ ├── notify.js
│ │ ├── presets.js
│ │ ├── reading_speed_test.js
│ │ ├── renderer_icons.js
│ │ ├── results_time_multiplier.js
│ │ ├── snapshot_save_tags_modal.js
│ │ ├── text_apply_canonical.js
│ │ ├── text_extraction_apply_modal.js
│ │ ├── text_extraction_batch_final_modal.js
│ │ ├── text_extraction_batch_flow.js
│ │ ├── text_extraction_batch_planning_modal.js
│ │ ├── text_extraction_drag_drop.js
│ │ ├── text_extraction_entry.js
│ │ ├── text_extraction_ocr_activation.js
│ │ ├── text_extraction_ocr_activation_disclosure_modal.js
│ │ ├── text_extraction_ocr_activation_flow.js
│ │ ├── text_extraction_ocr_activation_recovery.js
│ │ ├── text_extraction_ocr_disconnect.js
│ │ ├── text_extraction_pdf_options_modal.js
│ │ ├── text_extraction_pdf_page_selection_ui_model.js
│ │ ├── text_extraction_route_choice_modal.js
│ │ ├── text_extraction_single_file_heavy_pdf_modal.js
│ │ ├── text_extraction_status_ui.js
│ │ ├── wpm_controls.js
│ │ └── wpm_curve.js
│ ├── third_party_licenses/        # {licencias/notices versionados de terceros redistribuidos}
│ ├── editor.css
│ ├── editor.html
│ ├── editor.js
│ ├── editor_find.css
│ ├── editor_find.html
│ ├── editor_find.js
│ ├── flotante.css
│ ├── flotante.html
│ ├── flotante.js
│ ├── index.html
│ ├── language_window.html
│ ├── language_window.js
│ ├── preset_modal.html
│ ├── preset_modal.js
│ ├── reading_test_questions.css
│ ├── reading_test_questions.html
│ ├── reading_test_questions.js
│ ├── reading_test_result.css
│ ├── reading_test_result.html
│ ├── reading_test_result.js
│ ├── renderer.js
│ ├── style.css
│ ├── task_editor.css
│ ├── task_editor.html
│ └── task_editor.js
├── test/                          # {tests de desarrollo automátizados de la app}
| └── README.md
├── tools/
│ └── generate_renderer_icons.js   # {genera el registro runtime de SVGs funcionales del renderer}
├── website/                       # {sitio web de la app}
├── .editorconfig
├── .eslintrc.cjs
├── .gitattributes
├── .gitignore
├── CHANGELOG.md
├── jsconfig.json
├── LICENSE
├── package-lock.json
├── package.json
├── PRIVACY.md
├── README.md
└── ToDo.md
```

## Guía rápida

**Propósito:** este documento permite entender la estructura del repo de un vistazo (humanos y herramientas), y ubicar rápidamente los “puntos de entrada” y módulos principales.

### 1) Puntos de entrada (entry points)

**Main process (Electron):**
- `electron/main.js` — Punto de entrada del proceso principal: ciclo de vida de la app, creación de ventanas, wiring de IPC, orquestación general.
- `electron/preload.js` — Preload de la ventana principal: expone la API IPC segura hacia `public/renderer.js`.
- `electron/editor_preload.js` — Preload del Editor de Texto: expone IPC específico (texto actual, settings, estado de ventana del editor, toggle de spellcheck y persistencia de tamaño de fuente/ancho maximizado del textarea) hacia `public/editor.js`.
- `electron/editor_find_preload.js` — Preload de la ventana de búsqueda del Editor de Texto: expone `window.editorFindAPI` hacia `public/editor_find.js`.
- `electron/preset_preload.js` — Preload del modal de presets: expone `window.presetAPI` y maneja `preset-init` (buffer/replay) y `settings-updated` hacia `public/preset_modal.js`.
- `electron/task_editor_preload.js` — Preload del Editor de Tareas (expone `window.taskEditorAPI` y callbacks como `onInit` / `onRequestClose`).
- `electron/language_preload.js` — Preload de la ventana de idioma; expone `window.languageAPI` (`setLanguage`, `getAvailableLanguages`) para persistir/seleccionar idioma; `setLanguage` invoca `set-language` y luego emite `language-selected` para destrabar el startup.
- `electron/flotante_preload.js` — Preload del Cronómetro Flotante.
- `electron/reading_test_questions_preload.js` — Preload del modal de preguntas del reading speed test; expone `window.readingTestQuestionsAPI` y bufferiza/reproduce el payload init del cuestionario.
- `electron/reading_test_result_preload.js` — Preload del modal de resultado del reading speed test; expone `window.readingTestResultAPI` y bufferiza/reproduce el payload init del resultado medido.

**Renderer (UI / ventanas):**
- `public/renderer.js` — Lógica principal/orquestador de UI de la ventana principal; delega ownership especializados a módulos auxiliares del renderer como `public/js/wpm_controls.js`, `public/js/presets.js`, `public/js/crono.js`, `public/js/reading_speed_test.js` y el stack batch/heavy del flujo text extraction.
- `public/editor.js` — Entry point/orquestador del Editor de Texto: valida dependencias, arma el contexto compartido del editor y registra bootstrap, listeners DOM e IPC sobre los módulos auxiliares `public/js/editor_ui.js` y `public/js/editor_engine.js`, incluyendo el layout maximizado centrado con gutters simétricos.
- `public/editor_find.js` — Lógica de la ventana dedicada de búsqueda del Editor de Texto.
- `public/preset_modal.js` — Lógica del modal de presets (nuevo/editar).
- `public/task_editor.js` — Renderer del Editor de Tareas (UI + tabla + biblioteca + anchos de columnas).
- `public/flotante.js` — Lógica del Cronómetro Flotante.
- `public/language_window.js` — Lógica de la ventana de selección de idioma.
- `public/reading_test_questions.js` — Lógica del modal de preguntas/comprensión del reading speed test.
- `public/reading_test_result.js` — Lógica del modal compacto de resultado del reading speed test (WPM medidos + resumen breve antes de preguntas/preset).

### 2) Módulos del proceso principal (Electron)

- `electron/fs_storage.js`: Persistencia JSON sincrónica del main; resuelve rutas bajo `app.getPath('userData')/config` (requiere `initStorage(app)`); ensure dirs + loadJson/saveJson + getters de `settings/current_text/editor_state`, estado del picker text extraction, estado externo del pool del reading speed test, credenciales/tokens OCR runtime y ruta de credenciales OCR empaquetadas en `electron/assets/ocr_google_drive/credentials.json`.
- `electron/settings.js`: estado de settings: defaults centralizados (`createDefaultSettings`), carga/normalización y persistencia; integra defaults de formato numérico desde `i18n/<langBase>/numberFormat.json` (`ensureNumberFormattingForBase`); registra IPC `get-settings`, `set-language`, `set-mode-conteo`, `set-selected-preset`, `set-spellcheck-enabled`, `set-editor-font-size-px` y difunde cambios vía `settings-updated` más callback `onSettingsUpdated`; mantiene buckets por idioma (p.ej. `selected_preset_by_language`) y persiste `spellcheckEnabled` y `editorFontSizePx`.
- `electron/spellcheck.js` — Política/controlador del spellcheck de Electron: resuelve el diccionario a usar según el idioma activo de la app, aplica la configuración sobre `session.defaultSession`, respeta `spellcheckEnabled` y deshabilita spellcheck cuando el tag activo no tiene diccionario soportado (p.ej. `arn`, `es-cl`) en vez de delegar silenciosamente al locale del SO.
- `electron/text_state.js` — Estado del texto actual: carga/guardado, límites (texto + payload IPC), lectura de portapapeles en main, y broadcast best-effort hacia ventanas (main/editor).
- `electron/current_text_snapshots_main.js` — Snapshots del texto actual (save/load): valida payloads del flujo save, abre diálogos nativos o resuelve paths determinísticos no interactivos para callers gestionados, persiste/lee JSON bajo `config/saved_current_texts/` (incluye subcarpetas), acepta snapshots simples `{ "text": "<string>" }`, snapshots etiquetados `{ "text": "<string>", "tags"?: { "language"?, "type"?, "difficulty"? } }` y archivos compatibles con payload opcional `readingTest`, expone además la apertura de la carpeta de snapshots, confirma overwrite al cargar y mantiene chequeo de contención (realpath/relative) para evitar escapes fuera del árbol; la carga normal sigue aplicando solo `text` al current text.
- `electron/current_text_processing_state_ipc.js` — Controlador main-owned y superficie IPC del estado pendiente del current text: mantiene el lifecycle autoritativo de settle con `lockId`/`requestId`, sanea metadata de contexto, ignora resoluciones stale y expone lectura/broadcast del estado hacia la ventana principal autorizada.
- `electron/current_text_processing_main_bridge.js` — Bridge main→renderer del estado autoritativo de procesamiento del current text: difunde `current-text-processing-state-changed` hacia la ventana principal cuando existe un `webContents` vivo y siembra el estado inicial al cargar el renderer, tolerando como no-op normal la fase de bootstrap previa a la creación de la ventana principal.
- `electron/editor_state.js` — Persistencia/estado de la ventana del Editor de Texto (tamaño/posición/maximizado y `maximizedTextWidthPx`), su integración con el `BrowserWindow` y el bridge IPC/notificaciones del estado de ventana hacia el renderer del editor.
- `electron/editor_window_lifecycle.js` — Controlador main-owned del ciclo de vida visible/oculto del Editor de Texto: centraliza hidden startup con generación de first-show, timeout de producto, coordinación de `base presentation ready`, conflictos de owner (`ordinary` vs `reading-test`), reveal/focus/maximize de la ventana y manejo consistente de cierre temprano o fallback tardío.
- `electron/editor_find_main.js` — Coordinador main-owned del find/replace del Editor de Texto: conserva el ciclo de vida de la ventana dedicada, el wiring Electron-specific de listeners/IPC autorizado, los atajos (`Ctrl/Cmd+F`, `Ctrl+H` / `Cmd+Option+F`, `F3`, `Shift+F3`, `Esc`, `Ctrl/Cmd +`, `Ctrl/Cmd -`, `Ctrl/Cmd 0`) y la orquestación de alto nivel entre ventana editor y ventana find.
- `electron/editor_find_session.js` — Sesión/state machine main-owned del find/replace del Editor de Texto: encapsula el estado mutable del query, navegación `findInPage`, re-sync al refocar la ventana Find, waits/pending request scoped, y la tubería main↔editor de `Replace` / `Replace All` con sincronización de estado basada en `found-in-page`.
- `electron/editor_find_shortcuts.js` — Helpers puros/importables de shortcuts del find del Editor de Texto: detección de `Ctrl/Cmd+F`, `Ctrl+H` / `Cmd+Option+F`, `F3`, `Esc` y shortcuts de tamaño de texto; se mantiene sin estado para reducir ruido en `editor_find_main.js`.
- `electron/editor_text_size.js` — Controlador main-owned del tamaño de texto del Editor de Texto: encapsula `set/increase/decrease/reset`, persiste `editorFontSizePx` vía `settings`, difunde `settings-updated` y entrega acciones reutilizables para los atajos del editor/find sin seguir inflando `electron/main.js`.
- `electron/reading_test_pool.js` — Helpers del pool del reading speed test: asegura el subárbol runtime bajo snapshots, sincroniza al arranque los starter files versionados mediante hashes de contenido bundled, poda estado obsoleto y starter files retirados, escanea/valida JSON del pool y mezcla contenido + estado externo (`config/reading_test_pool_state.json`) para serializar metadata usable por la UI, incluyendo la preferencia persistida `showBundledEntries`.
- `electron/reading_test_pool_import.js` — Follow-up main-owned de adquisición/import del pool: abre el picker nativo para `.json`/`.zip`, recuerda la última carpeta usada, valida candidatos contra el contrato del pool, resuelve duplicados por nombre de destino y escribe solo snapshots válidos dentro de `config/saved_current_texts/reading_speed_test_pool/`.
- `electron/reading_test_session.js` — Orquestador/controlador main-owned del reading speed test: valida precondiciones, mantiene el estado compartido de la sesión, expone el surface público consumido por `main.js`, registra el IPC (`reading-test-get-entry-data`, `reading-test-reset-pool`, `reading-test-set-show-bundled-entries`, `reading-test-start`, `reading-test-get-state`) y delega la plomería de ventanas y el flujo guiado a módulos auxiliares, ampliando de forma compatible el contrato externo del reading-test entry flow.
- `electron/reading_test_session_windows.js` — Helpers de ventanas del reading speed test: espera visibilidad/carga del Editor de Texto y el Cronómetro Flotante, abre la sesión guiada en modo diferido, sincroniza la visibilidad del overlay prestart del editor y crea los modales de resultado y de preguntas.
- `electron/reading_test_session_flow.js` — Helpers del flujo guiado del reading speed test: ownership de las etapas `arming/running/result/questions/preset`, cómputo autoritativo de WPM, payload prellenado del preset, cancel/finish semantics, ruta `pool` vs `current_text` y reinterpretación de comandos/cierres del Cronómetro Flotante y el Editor de Texto.
- `electron/presets_main.js` — Sistema de presets en main: defaults por idioma, CRUD, diálogos nativos y handlers IPC.
- `electron/tasks_main.js` — Backend de tareas (persistencia + validación + IPC de listas/biblioteca/anchos/enlaces).
- `electron/task_editor_state.js` — Persistencia/estado de la ventana del Editor de Tareas (tamaño, posición y maximizado).
- `electron/app_temp_paths.js` — Helper main-owned/importable de temporales de runtime: centraliza el root `os.tmpdir()/tot-temp/`, crea subdirectorios/paths temporales app-owned y expone helpers de contención y cleanup best-effort.
- `electron/text_extraction_platform/text_extraction_file_picker_ipc.js` — File picker nativo del flujo text extraction; resuelve carpeta por defecto/persistida, permite selección múltiple, guarda la última carpeta usada cuando la selección es válida y deriva la lista de extensiones soportadas desde el contrato compartido de formatos.
- `electron/text_extraction_platform/text_extraction_preconditions_ipc.js` — Gate previo al inicio: bloquea extracción si hay ventanas secundarias abiertas o si el cronómetro está corriendo.
- `electron/text_extraction_platform/text_extraction_processing_mode_ipc.js` — Controlador/IPC del processing mode de text extraction: lock state con `lockId`, broadcast al renderer, solicitud de abort y metadata saneada de progreso por unidad/archivo + ruta/input efectivo para batch execution y heavy split.
- `electron/text_extraction_platform/text_extraction_pdf_inspect_ipc.js` — IPC main-owned del paso inspect previo a prepare para PDFs: expone metadata segura del archivo y `totalPages` antes de mostrar el modal de opciones PDF en el renderer.
- `electron/text_extraction_platform/text_extraction_ocr_activation_ipc.js` — Activación OCR Google vía navegador del sistema, separada en dos fases IPC: preparación de credenciales (`prepareTextExtractionOcrActivation`, sin abrir navegador) y lanzamiento OAuth (`launchTextExtractionOcrActivation`, usa el helper loopback seguro con `state` + PKCE, persiste el token local y valida el setup).
- `electron/text_extraction_platform/text_extraction_ocr_disconnect_ipc.js` — Desconexión OCR desde menú: confirmación nativa, revocación del token OAuth guardado y borrado del token local tras revocación exitosa.
- `electron/text_extraction_platform/text_extraction_generated_pdf_reveal_ipc.js` — IPC main-owned para revelar en el explorador un PDF generado y retenido por la política `keep`, limitado al root permitido de artefactos generados.
- `electron/text_extraction_platform/text_extraction_heavy_pdf_split_core.js` — Helper main/shared del heavy-PDF planning para OCR: centraliza el límite `50 MB`, decide si el PDF fuente supera el umbral del provider y construye previews deterministas de inputs generados por páginas sin materializar todavía los child PDFs.
- `electron/text_extraction_platform/text_extraction_prepare_execute_core.js` — Núcleo compartido del inspect/prepare/execute: clasificación de archivo, triage PDF por rango seleccionado, detección/planning de heavy PDFs para OCR, canonicalización de `pdfPageSelection` y `generatedPdfArtifactPolicy`, materialización local del subset PDF para paridad native/OCR y ownership-aware cancellation para evitar que una ejecución abortada continúe bajo el lock de otra posterior.
- `electron/text_extraction_platform/text_extraction_prepare_ipc.js` — Etapa prepare del archivo seleccionado: calcula metadata/rutas disponibles, persiste el estado canónico de `pdfPageSelection`/`generatedPdfArtifactPolicy`, acepta `planningMode`/`forceHeavySplitFullSource` y crea el registro preparado.
- `electron/text_extraction_platform/text_extraction_execute_prepared_ipc.js` — Etapa execute del flujo preparado: valida integridad del registro/fingerprint, corre la ruta elegida en processing mode y devuelve alert keys/warnings ya resueltos para el renderer, incluyendo la superficie usada por heavy split y batch execution.
- `electron/text_extraction_platform/text_extraction_prepared_store.js` — Store efímero de requests preparadas con TTL y fingerprint del archivo fuente.
- `electron/text_extraction_platform/text_extraction_platform_adapter.js` + `electron/text_extraction_platform/platform_adapters/*.js` — Abstracción por plataforma para carpeta inicial del picker y normalización de paths (Windows-first, pero portable a macOS/Linux).
- `electron/text_extraction_platform/text_extraction_supported_formats.js` — Contrato compartido de formatos soportados por text extraction: centraliza extensiones nativas, extensiones Google-backed y extensiones OCR/imagen, además de los helpers reutilizados por picker, prepare y rutas de ejecución.
- `electron/text_extraction_platform/text_extraction_pdf_error_detection.js` — Helper compartido para clasificar errores PDF de cifrado/password y corrupción/lectura inválida, reutilizado por inspect, probe y ruta nativa para evitar drift entre heurísticas duplicadas.
- `electron/text_extraction_platform/text_extraction_pdf_selection_pipeline.js` — Owner del estado y trabajo local de page-range para PDFs: inspect de `totalPages`, canonicalización de `pdfPageSelection`/`generatedPdfArtifactPolicy`, nombres visibles del `processingInputFile`, materialización del subset PDF, cleanup/retención y warnings técnicos de cleanup.
- `electron/text_extraction_platform/native_extraction_route.js` — Ruta de extracción nativa para `txt`, `md`, `html`, `docx` y PDFs con text layer; consume el contrato compartido de formatos y opera sobre el `processingInputFile` efectivo, que puede ser un subset PDF materializado.
- `electron/text_extraction_platform/native_pdf_selectable_text_probe.js` — Probe de PDF para detectar si existe texto seleccionable utilizable antes de decidir la ruta; ahora puede sondear solo el rango seleccionado en vez del documento completo.
- `electron/text_extraction_platform/ocr_google_drive_activation_state.js` — Estado grueso de disponibilidad OCR a partir de presencia de `credentials.json`/`token.json`; distingue `credentials_missing`, `ocr_activation_required` y `ready` antes de validaciones más profundas.
- `electron/text_extraction_platform/ocr_google_drive_bundled_credentials.js` — Bootstrap del modelo OCR de producción: consume el lector compartido de `credentials.json`, valida las credenciales OAuth desktop empaquetadas y materializa/repara el espejo runtime bajo `config/ocr_google_drive/credentials.json` sin pedir importación manual al usuario.
- `electron/text_extraction_platform/ocr_google_drive_credentials_file.js` — Lector/validador low-level compartido para `credentials.json`: lectura BOM-safe, parse JSON, clasificación (`missing_file`/`empty_file`/`invalid_json`/`invalid_shape`/`read_failed`) y validación de la shape OAuth desktop/web.
- `electron/text_extraction_platform/ocr_google_drive_oauth_client.js` — Helpers compartidos OAuth para OCR: lectura/normalización de `credentials.json`, construcción del cliente OAuth2 y selección del token preferido para revocación.
- `electron/text_extraction_platform/ocr_google_drive_secure_oauth.js` — Helper propio de activación OAuth desktop segura para Google OCR: reutiliza el cliente OAuth instalado ya empaquetado, abre navegador externo del sistema, levanta callback loopback efímero y aplica `state` + PKCE antes de intercambiar el código.
- `electron/text_extraction_platform/ocr_google_drive_provider_failure_classification.js` — Clasificación compartida post-parse de fallas provider/runtime de Google OCR: centraliza tablas de razones y la política común para `connectivity_failed`, `provider_api_disabled`, `quota_or_rate_limited`, `auth_failed` y `platform_runtime_failed`.
- `electron/text_extraction_platform/ocr_google_drive_provider_failure.js` — Parser compartido de fallas provider-side de Google para OCR: lee tanto `error.errors[].reason` como `google.rpc.ErrorInfo.reason`, normaliza señales documentadas de API deshabilitada y preserva diagnóstico de conflictos entre ambos formatos.
- `electron/text_extraction_platform/ocr_google_drive_setup_validation.js` — Validación técnica del setup OCR (credenciales, token y reachability de Google Drive); consume el parser compartido y la clasificación post-parse común, pero conserva subtipos y fallback propios del flujo de setup.
- `electron/text_extraction_platform/ocr_google_drive_token_storage.js` — Lectura/escritura/borrado protegido del token OCR usando `safeStorage` de Electron.
- `electron/text_extraction_platform/ocr_google_drive_route.js` — Ruta Google Drive/Docs para extracción respaldada por Google: cubre `rtf`/`odt` por conversión de documento y también imágenes/PDFs para OCR, valida el límite de tamaño antes del upload OCR, usa la clasificación post-parse común para fallas provider/runtime y conserva sus fallbacks propios de etapa (`ocr_conversion_failed` / `ocr_export_failed`).
- `electron/text_extraction_platform/ocr_image_normalization.js` — Normalización local de imágenes para OCR antes del upload cuando el formato lo requiere.
- `electron/menu_builder.js` — Construcción del menú nativo: carga bundle i18n con cadena de fallback (tag→base→DEFAULT_LANG); incluye menú Dev opcional (SHOW_DEV_MENU en dev); enruta acciones al renderer (`menu-click`) y expone textos de diálogos.
- `electron/updater.js` — Lógica de actualización (comparación de versión, diálogos y apertura de URL de descarga).
- `electron/link_openers.js` — Registro de IPC para abrir enlaces externos y documentos de la app: `open-external-url` (solo `https` + whitelist de hosts, incluyendo `totapp.org` y `ko-fi.com` para superficies fijas de la app) y `open-app-doc` (mapea docKey→archivo; gating en dev; verifica existencia; en algunos casos copia a temp y abre vía `shell.openExternal/openPath`).
- `electron/constants_main.js` — Constantes del proceso principal (IDs, rutas/keys comunes, flags, etc. según aplique), incluyendo límites/default/step del tamaño de fuente y del ancho de texto maximizado del Editor de Texto.
- `electron/log.js` — Logger del proceso principal (política de logs/fallbacks).
- `electron/main.js` — Además del arranque normal, contiene un hook de smoke test local controlado por env vars (`TOT_SMOKE_TEST`, `TOT_SMOKE_USER_DATA_DIR`) para validar el startup mínimo con perfil aislado; la lógica específica de tamaño de texto del Editor de Texto queda delegada a `electron/editor_text_size.js`.

### 3) Módulos del renderer (public/js)

Estos módulos encapsulan lógica compartida del lado UI; `public/renderer.js` suele actuar como orquestador.

- `public/js/constants.js` — Constantes compartidas del renderer, incluyendo límites/default/step del tamaño de fuente, ancho de texto maximizado y gutter mínimo del Editor de Texto.
- `public/js/wpm_curve.js` — Mapeo discreto slider↔WPM (lineal/exponencial suave), garantizando cobertura de enteros en el rango configurado.
- `public/js/wpm_controls.js` — Owner renderer de los controles de velocidad de lectura: centraliza estado WPM, binding slider/input, mapeo vía `wpm_curve`, carga/selección de presets en coordinación con `RendererPresets` y aplicación de cambios externos sin devolver esa lógica a `public/renderer.js`.
- `public/js/lib/count_core.js` — Núcleo puro/importable de conteo (simple/preciso, `Intl.Segmenter`, regla de unión por guiones) reutilizado por el wrapper renderer y por la suite automatizada.
- `public/js/lib/editor_find_replace_core.js` — Núcleo puro/importable del find/replace del Editor de Texto: matching literal sobre selección, cómputo determinista de `Replace All` y chequeo puro de elegibilidad por longitud; reutilizado por `public/editor.js` y por la suite automatizada.
- `public/js/lib/editor_maximized_layout_core.js` — Núcleo puro/importable del layout maximizado del Editor de Texto: clamp del ancho preferido/renderizado de la columna centrada y cálculo del resize simétrico desde cualquiera de los gutters; reutilizado por `public/editor.js` y por la suite automatizada.
- `public/js/lib/format_core.js` — Núcleo puro/importable de formateo (tiempo estimado, partes de tiempo y separadores numéricos) reutilizado por el wrapper renderer y por la suite automatizada.
- `public/js/lib/reading_test_filters_core.js` — Núcleo puro/importable del selector del reading speed test: semántica de checkboxes (OR dentro de categoría, AND entre categorías activas), cálculo de elegibles y enabled/disabled state desde combinaciones reales.
- `public/js/lib/reading_test_questions_core.js` — Núcleo puro/importable del reading speed test para validar payloads `readingTest.questions`, puntuar respuestas y calcular el baseline probabilístico de respuesta al azar.
- `public/js/lib/snapshot_tag_catalog.js` — Catálogo puro/importable compartido de tags de snapshot: define los valores canónicos/opciones de `language` / `type` / `difficulty` y centraliza la normalización reutilizada por renderer y main para evitar drift.
- `public/js/count.js` — Wrapper renderer de conteo: valida dependencias del `window`, construye `window.CountUtils` desde `count_core.js` y conserva la superficie pública existente.
- `public/js/format.js` — Wrapper renderer de formateo: valida dependencias del `window`, construye `window.FormatUtils` desde `format_core.js` y conserva la superficie pública existente.
- `public/js/generated_icons.js` — Artefacto runtime autogenerado del renderer: registra el catálogo serializado de SVGs funcionales a partir de `assets/icons/`; no se edita a mano y se regenera con `npm run generate:icons`.
- `public/js/i18n.js` — Capa i18n del renderer: carga/aplicación de textos y utilidades de traducción.
- `public/js/presets.js` — Bridge/owner renderer de presets: resuelve catálogo por idioma, rellena el selector en DOM, conserva la descripción visible y persiste la selección activa; deja el ownership de WPM widget sync a `public/js/wpm_controls.js`.
- `public/js/crono.js` — UX del cronómetro en UI (cliente del cronómetro autoritativo en main).
- `public/js/renderer_icons.js` — Helper compartido de íconos funcionales en renderer: consume `generated_icons.js`, resuelve variantes/tamaños y expone la aplicación común de iconos a markup estático y a controles generados por JS.
- `public/js/menu_actions.js` — Router de acciones recibidas desde el menú (`menu-click`) hacia handlers de UI; expone `window.menuActions` (register/unregister/list/stopListening).
- `public/js/current_text_snapshots.js` — Helper de snapshots del texto actual: expone `saveSnapshot()` / `loadSnapshot()`, invoca el modal previo de tags al guardar, normaliza metadata opcional de snapshot vía `snapshot_tag_catalog`, llama `electronAPI.saveCurrentTextSnapshot` / `electronAPI.loadCurrentTextSnapshot` y mapea `{ ok, code }` a `Notify` (sin DOM wiring; el binding de botones vive en `public/renderer.js`).
- `public/js/snapshot_save_tags_modal.js` — Modal renderer previo al save nativo de snapshots: muestra selects opcionales para `language` / `type` / `difficulty`, admite copy overrides compartidos con batch planning, aplica i18n y devuelve tags normalizados o cancelación.
- `public/js/reading_speed_test.js` — Módulo renderer del reading speed test: gestiona el modal de entrada/configuración, refleja combinaciones reales del pool, ejecuta reset/start IPC, muestra warnings inline y sincroniza el lock state / WPM aplicado.
- `public/js/info_modal_links.js` — Binding de enlaces en info modals: evita doble-bind (`dataset.externalLinksBound`); rutea `#` (scroll interno), `appdoc:` (api.openAppDoc) y externos (api.openExternalUrl); usa `CSS.escape` con fallback; logger `window.getLogger('info-modal-links')`.
- `public/js/main_logo_links.js` — Binding de enlaces fijos del header principal: conecta los logos clickeables de Cibersino y Ko-fi a `electronAPI.openExternalUrl(...)`, aplica tooltips/labels i18n y mantiene este wiring fuera de `public/renderer.js`.
- `public/js/browser_extension_modal.js` — Owner renderer del acceso a la extensión del navegador desde la ventana principal: gestiona el modal informativo, el foco/restauración, el lock state y el puente seguro hacia Chrome Web Store.
- `public/js/text_apply_canonical.js` — Helpers canónicos de aplicar texto (`overwrite` / `append` / repeticiones) reutilizados por clipboard y por el flujo de extracción.
- `public/js/results_time_multiplier.js` — Controla el multiplicador de tiempo bajo el resultado estimado: valida el input como numero natural, conserva el estado base recibido desde `public/renderer.js` y renderiza el tiempo multiplicado en la ventana principal.
- `public/js/text_extraction_pdf_page_selection_ui_model.js` — Owner renderer compartido del modelo `pdfPageSelection` para text extraction: construye drafts de UI, canonicaliza `all/range`, deriva estado visible (`selected count`, `invalid range`, enable/disable de submit) y formatea summaries/range labels para los consumers renderer.
- `public/js/text_extraction_status_ui.js` — Superficie visual del flujo text extraction en ventana principal: estado prepare, waiting UI honesta, tiempo transcurrido, botón abort, progreso por unidad/archivo y nombre seguro del `processingInputFile` (original, subset materializado o child generado por heavy split) sin exponer paths completos.
- `public/js/text_extraction_batch_planning_modal.js` — Modal/shared planner del batch extraction: renderiza unidades/inputs reordenables, consume el helper compartido de `pdfPageSelection` para page scope por input y disable/focus de ranges inválidos, aplica failure policy común y permite toggle de conservación de generated PDFs + edición de tags sin mover la lógica de negocio a `renderer.js`.
- `public/js/text_extraction_batch_final_modal.js` — Modal final compartido de batch/heavy execution: resume resultados por unidad, acciones de copy report / abrir carpeta de snapshots y reveal de artefactos generados retenidos sin crear una segunda superficie de reporte.
- `public/js/text_extraction_pdf_options_modal.js` — Modal renderer previo a prepare para PDFs: muestra `totalPages`, recoge `All pages` vs `Page range`, usa el helper compartido de `pdfPageSelection` para live validation / selected-count / disable de `Continue`, controla la policy `keep/delete` cuando aplica y resetea el draft de rango al volver a `All pages`.
- `public/js/text_extraction_route_choice_modal.js` — Modal de elección de ruta (`native` / `ocr`) cuando un PDF soporta ambas.
- `public/js/text_extraction_apply_modal.js` — Modal post-extracción para decidir overwrite/append y repeticiones antes de aplicar el texto extraído; cuando existe un PDF generado retenido, también ofrece la acción `Reveal saved PDF`.
- `public/js/text_extraction_ocr_activation_disclosure_modal.js` — Modal renderer de preconsentimiento para OCR Google: muestra la divulgación inmediatamente antes del OAuth, enlaza a `privacy-policy` mediante `openAppDoc(...)` y exige acción afirmativa del usuario.
- `public/js/text_extraction_ocr_activation_flow.js` — Flujo shared de activación OCR en la ventana principal: resuelve los bridges `prepareTextExtractionOcrActivation` / `launchTextExtractionOcrActivation`, ejecuta disclosure + OAuth y devuelve resultados estructurados sin acoplarse a alerts de un caller concreto.
- `public/js/text_extraction_ocr_activation.js` — Entry point renderer para `Menú > Preferencias > Enable/Activar Google OCR`: reutiliza el flujo shared y traduce sus outcomes a alerts específicas del contexto de activación manual.
- `public/js/text_extraction_ocr_activation_recovery.js` — Helpers de recuperación para OCR durante text extraction: detectan fallos recuperables de setup/auth, delegan la activación al flujo shared y reintentan `prepare` tras una activación exitosa.
- `public/js/text_extraction_ocr_disconnect.js` — Handler del renderer para `Disconnect Google OCR`: solicita la desconexión al main y muestra feedback de éxito/fallo/not-connected.
- `public/js/text_extraction_entry.js` — Orquestador compartido del flujo text extraction desde picker o drag/drop: encadena inspect PDF, modal de opciones PDF, prepare, route choice, execute y apply, deriva a batch planning cuando hay múltiples archivos, reutiliza el formatter compartido de `pdfPageSelection` para el handoff heavy-PDF y activa el synthetic full-source split cuando OCR no conviene como una sola unidad.
- `public/js/text_extraction_batch_flow.js` — Owner renderer del batch extraction: reutiliza contratos prepare/execute/apply/snapshot para múltiples archivos, centraliza la planificación por unidades, canonicaliza/summary de `pdfPageSelection` vía el helper renderer compartido y coordina la ejecución secuencial con failure policy compartida + handoff sintético del single-file heavy split.
- `public/js/text_extraction_drag_drop.js` — Capa drag/drop del main: overlay de drop y forwarding de uno o varios archivos al entry flow compartido, con branch explícito hacia batch planning cuando corresponde.
- `public/js/text_extraction_single_file_heavy_pdf_modal.js` — Modal blocking del caso heavy PDF en single-file OCR: explica los casos A/B del límite `50 MB`, mantiene explícito el handoff a full-source automatic split y expone reveal del generated PDF retenido cuando existe.
- `public/js/current_text_selector_section.js` — Owner UI de la sección “texto actual” en la ventana principal: concentra el título, el preview del texto actual, el toolbar local de esa sección, el lock state específico de sus controles y el toggle `Spoiler`, que permite ocultar el tramo final del preview sin devolver esa lógica a `public/renderer.js`.
- `public/js/current_text_runtime.js` — Owner renderer del runtime del current text en la ventana principal: conserva el preview/result rendering autoritativo, fusiona recalculaciones derivadas dentro del settle activo, reporta éxito/fallo al lifecycle pendiente main-owned y mantiene explícito el modo degradado cuando una actualización derivada falla.
- `public/js/current_text_refresh_policy.js` — Política compartida de refresh del current text: clasifica cambios de settings/presets entre `time_only`, `stats_display` y `full`, prioriza el refresh más fuerte y expone un controlador pequeño para despachar la acción correcta sin devolver esa taxonomía a `public/renderer.js`.
- `public/js/editor_startup_presentation.js` — Núcleo renderer del startup presentation del Editor de Texto: parsea los query params de arranque inyectados por main (`initialPresentationMode`, `firstShowGeneration`), conserva estable la intención inicial de presentación hasta que el estado real/nativo esté listo y bufferiza updates de window state mientras el lock de startup sigue activo.
- `public/js/editor_ui.js` — Módulo UI del Editor de Texto: i18n del editor, `spellcheck`, tamaño de texto, layout maximizado con gutters simétricos y persistencia de `maximizedTextWidthPx`, progreso de lectura, restauración de foco y overlay prestart del reading speed test.
- `public/js/editor_engine.js` — Módulo de lógica/sync del Editor de Texto: helpers de selección e inserción, `replace current/all`, sincronización con main, truncation handling, paste/drop y aplicación de updates externos.
- `public/js/notify.js` — Avisos/alertas no intrusivas en UI.
- `public/js/log.js` — Logger del renderer (política de logs del lado UI).

### 4) i18n (estructura y responsabilidades)

- `i18n/languages.json` — Catálogo de idiomas soportados (y metadatos si aplica).
- `i18n/<lang>/main.json` — Textos del proceso principal / menú / diálogos nativos.
- `i18n/<lang>/renderer.json` — Textos de la UI (ventana principal y modales renderizados).
- `i18n/<lang>/numberFormat.json` — Configuración de formato numérico por idioma (defaults; puede haber override vía settings).
- `i18n/<lang>/<variant>/*.json` — Variantes regionales cuando aplica (p.ej. `i18n/es/es-cl/`).

### 5) Persistencia runtime (carpeta `config/`)

**Nota:** `config/` se crea y usa en runtime. Estos archivos representan **estado local del usuario** y se ignoran por git para no commitear estado de ejecución.

- `config/user_settings.json` — Preferencias del usuario (idioma, modo de conteo, `spellcheckEnabled`, `editorFontSizePx`, presets personalizados, etc.).
- `config/current_text.json` — Texto actual persistido.
- `config/editor_state.json` — Estado persistido del Editor de Texto (geometría/maximizado y `maximizedTextWidthPx`).
- `config/text_extraction_state.json` — Estado local del picker de text extraction (por ejemplo, última carpeta utilizada).
- `config/reading_test_pool_state.json` — Estado externo del pool del reading speed test; guarda la preferencia `showBundledEntries`, el `used` por `snapshotRelPath` y, para starter files gestionados por la app, el `managedBundledHash` instalado.
- `config/reading_test_pool_import_state.json` — Estado local del picker del importador del pool del reading speed test (última carpeta utilizada).
- `config/ocr_google_drive/credentials.json` — Espejo/copia runtime gestionado por la app para la configuración OAuth de Google OCR; en el modelo actual se materializa desde credenciales empaquetadas de la app y no forma parte del onboarding manual del usuario.
- `config/ocr_google_drive/token.json` — Estado local del token OAuth del usuario final para la ruta OCR de Google Drive/Docs; se elimina al desconectar Google OCR tras revocación exitosa.
- `config/saved_current_texts/` — Carpeta runtime con snapshots del texto actual; admite JSON simples `{ "text": ... }`, snapshots etiquetados `{ "text": ..., "tags"?: { "language"?, "type"?, "difficulty"? } }` y archivos con payload opcional `readingTest`; puede contener subcarpetas. La carga normal de snapshots sigue aplicando solo `text` al current text, sin rechazar metadata adicional compatible.
- `config/saved_current_texts/reading_speed_test_pool/` — Subcarpeta runtime dedicada al pool del reading speed test; recibe starter files sincronizados al arranque desde `electron/reading_test_pool/`, conserva solo contenido (`text`, tags descriptivos y `readingTest` opcional) y delega el estado mutable del pool a `config/reading_test_pool_state.json`; sigue siendo compatible con el flujo normal de snapshots.
- `config/tasks/lists/*.json` — Listas de tareas guardadas por el usuario.
- `config/tasks/library.json` — Biblioteca de filas (por `texto` normalizado).
- `config/tasks/allowed_hosts.json` — Allowlist de hosts confiables para enlaces remotos.
- `config/tasks/column_widths.json` — Persistencia de anchos de columnas del Editor de Tareas.
- `config/tasks/task_editor_state.json` — Estado persistido de la ventana del Editor de Tareas (geometría/maximizado).

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

- `package.json` — Manifiesto npm/electron-builder; además del arranque y packaging, define `npm test`, `npm run test:unit` y `npm run test:smoke`, registra el hook `afterAllArtifactBuild` para reempaquetar los `.zip` distribuidos bajo `toT-<version>/INSTALL.txt` + `toT-<version>/toT-app/`, y configura el DMG de macOS para mostrar `INSTALL.txt` junto a la app y el acceso a `Applications`.
- `package-lock.json` — Lockfile npm usado también por el workflow CI (`npm ci`).
- `tools/generate_renderer_icons.js` — Script de generación del catálogo runtime de íconos funcionales del renderer: lee `assets/icons/`, valida el set canónico y escribe `public/js/generated_icons.js`; se ejecuta mediante `npm run generate:icons`.

### 6.2) Branding local en la app (public/assets)

- `public/assets/SOURCES.md` — Trazabilidad local de procedencia para assets runtime de `public/assets/`, especialmente los de terceros o sujetos a términos de marca.
- `public/assets/logo-tot.svg` / `public/assets/logo-tot.png` / `public/assets/logo-tot.120x120.png` — Branding de la app usado en la ventana principal y variantes raster cuadradas auxiliares del proyecto.
- `public/assets/logo-cibersino.svg` — Branding del desarrollador usado en la ventana principal.
- `public/assets/kofi_symbol.png` — Símbolo de Ko-fi usado en la ventana principal junto al logo de Cibersino.
- `public/assets/extension/` — Assets runtime del acceso a la extensión del navegador en la app (`tot-symbols.64.png`, `chrome-web-store-badge.png`).

### 6.3) Recursos de packaging (build-resources)

- `build-resources/after-all-artifact-build.js` — Hook post-packaging de `electron-builder`: reempaqueta los artefactos `.zip` de Windows para que el contenido final quede bajo `toT-<version>/`, agregue `INSTALL.txt` en la raíz visible y mueva la app empaquetada a `toT-<version>/toT-app/`.
- `build-resources/INSTALL.txt` — Nota bilingüe de instalación y primer inicio visible en los artefactos empaquetados de Windows y macOS.
- `build-resources/logo-cibersino.ico` — Ícono de packaging para Windows.
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
