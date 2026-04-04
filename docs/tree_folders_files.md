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
│ ├── import_extract_state.json
│ ├── ocr_google_drive/
│ │ ├── credentials.json
│ │ └── token.json
│ ├── saved_current_texts/
│ │ └── reading_speed_test_pool/  # {pool local del reading speed test; seeded/copied at runtime}
│ └── user_settings.json
├── docs/
│ ├── cleanup/
│ │ ├── _evidence/
│ │ ├── bridge_failure_mode_convention.md
│ │ ├── cleanup_file_by_file.md
│ │ ├── naming_convention.md
│ │ ├── no_silence.md
│ │ └── preload_listener_api_standard.md
│ ├── issues/                      # {issues/epics con contratos, planes y evidencia operativa}
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
│ ├── fs_storage.js
│ ├── settings.js
│ ├── text_state.js
│ ├── current_text_snapshots_main.js
│ ├── tasks_main.js
│ ├── task_editor_position.js
│ ├── editor_state.js
│ ├── editor_find_main.js
│ ├── reading_test_pool/          # {starter files versionados del reading speed test}
│ ├── reading_test_pool.js
│ ├── reading_test_session.js
│ ├── import_extract_platform/
│ │ ├── platform_adapters/
│ │ │ ├── common.js
│ │ │ ├── windows.js
│ │ │ ├── darwin.js
│ │ │ ├── linux.js
│ │ │ └── fallback.js
│ │ ├── import_extract_file_picker_ipc.js
│ │ ├── import_extract_preconditions_ipc.js
│ │ ├── import_extract_processing_mode_ipc.js
│ │ ├── import_extract_ocr_activation_ipc.js
│ │ ├── import_extract_ocr_disconnect_ipc.js
│ │ ├── import_extract_prepare_execute_core.js
│ │ ├── import_extract_prepare_ipc.js
│ │ ├── import_extract_execute_prepared_ipc.js
│ │ ├── import_extract_prepared_store.js
│ │ ├── import_extract_platform_adapter.js
│ │ ├── import_extract_supported_formats.js
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
├── i18n/                          # {subcarpetas por idioma y variantes regionales}
│ └── languages.json
├── public/
│ ├── assets/
│ │ ├── instrucciones/             # {capturas/GIFs usados por public/info/instrucciones.*.html}
│ │ ├── logo-cibersino.svg
│ │ ├── logo-tot.png
│ │ ├── logo-tot.svg
│ │ └── patreon.png
│ ├── fonts/
│ │ ├── Baskervville-VariableFont_wght.ttf
│ │ ├── Baskervville-Italic-VariableFont_wght.ttf
│ │ ├── Baskervville.css
│ │ └── LICENSE_Baskervville_OFL.txt
│ ├── info/
│ │ ├── acerca_de.html
│ │ ├── instrucciones.es.html
│ │ ├── instrucciones.en.html
│ │ └── links_interes.html
│ ├── js/
│ │ ├── lib/
│ │ │ ├── count_core.js
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
│ │ ├── notify.js
│ │ ├── info_modal_links.js
│ │ ├── main_logo_links.js
│ │ ├── text_apply_canonical.js
│ │ ├── import_extract_status_ui.js
│ │ ├── import_extract_route_choice_modal.js
│ │ ├── import_extract_apply_modal.js
│ │ ├── import_extract_ocr_activation_disclosure_modal.js
│ │ ├── import_extract_ocr_activation_recovery.js
│ │ ├── import_extract_ocr_disconnect.js
│ │ ├── import_extract_entry.js
│ │ ├── import_extract_drag_drop.js
│ │ └── log.js
│ ├── renderer.js
│ ├── language_window.js
│ ├── editor.js
│ ├── editor_find.js
│ ├── task_editor.js
│ ├── preset_modal.js
│ ├── flotante.js
│ ├── reading_test_questions.js
│ ├── index.html
│ ├── language_window.html
│ ├── editor.html
│ ├── editor_find.html
│ ├── task_editor.html
│ ├── preset_modal.html
│ ├── flotante.html
│ ├── reading_test_questions.html
│ ├── editor.css
│ ├── editor_find.css
│ ├── task_editor.css
│ ├── flotante.css
│ ├── reading_test_questions.css
│ └── style.css
├── test/
│ ├── smoke/
│ │ └── electron_launch_smoke.test.js
│ ├── unit/
│ │ ├── electron/
│ │ │ ├── import_extract_prepare_execute_core.test.js
│ │ │ ├── import_extract_prepared_store.test.js
│ │ │ ├── import_extract_supported_formats.test.js
│ │ │ ├── ocr_google_drive_activation_state.test.js
│ │ │ ├── ocr_google_drive_provider_failure_classification.test.js
│ │ │ ├── ocr_google_drive_provider_failure.test.js
│ │ │ └── settings.test.js
│ │ └── shared/
│ │   ├── count_core.test.js
│ │   └── format_core.test.js
│ └── README.md
├── website/                       # {sitio web}
│ └── public/
│   ├── assets/
│   │ ├── brand/
│   │ │ ├── logo-cibersino.svg
│   │ │ └── logo-tot.svg
│   │ └── social/
│   │   ├── instagram-black.svg
│   │   ├── instagram-white.svg
│   │   ├── patreon.png
│   │   ├── SOURCES.md
│   │   ├── twitch.svg
│   │   ├── x-black.png
│   │   ├── x-white.png
│   │   └── youtube.png
│   ├── en/
│   │ ├── app-privacy/
│   │ │ ├── google-ocr/
│   │ │ │ └── index.html
│   │ │ └── index.html
│   │ ├── privacy-cookies/
│   │ │ └── index.html
│   │ └── index.html
│   ├── es/
│   │ ├── app-privacy/
│   │ │ ├── google-ocr/
│   │ │ │ └── index.html
│   │ │ └── index.html
│   │ ├── privacy-cookies/
│   │ │ └── index.html
│   │ └── index.html
│   ├── index.html
│   ├── favicon.svg
│   ├── favicon.ico
│   ├── og-image.png
│   ├── robots.txt
│   ├── site-language.js
│   ├── _headers
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
- `electron/editor_preload.js` — Preload del editor manual: expone IPC específico del editor hacia `public/editor.js`.
- `electron/editor_find_preload.js` — Preload de la ventana de búsqueda del editor: expone `window.editorFindAPI` hacia `public/editor_find.js`.
- `electron/preset_preload.js` — Preload del modal de presets: expone `window.presetAPI` y maneja `preset-init` (buffer/replay) y `settings-updated` hacia `public/preset_modal.js`.
- `electron/task_editor_preload.js` — Preload del editor de tareas (expone `window.taskEditorAPI` y callbacks como `onInit` / `onRequestClose`).
- `electron/language_preload.js` — Preload de la ventana de idioma; expone `window.languageAPI` (`setLanguage`, `getAvailableLanguages`) para persistir/seleccionar idioma; `setLanguage` invoca `set-language` y luego emite `language-selected` para destrabar el startup.
- `electron/flotante_preload.js` — Preload de la ventana flotante del cronómetro.
- `electron/reading_test_questions_preload.js` — Preload del modal de preguntas del reading speed test; expone `window.readingTestQuestionsAPI` y bufferiza/reproduce el payload init del cuestionario.

**Renderer (UI / ventanas):**
- `public/renderer.js` — Lógica principal de UI (ventana principal).
- `public/editor.js` — Lógica del editor manual (ventana editor).
- `public/editor_find.js` — Lógica de la ventana dedicada de búsqueda del editor.
- `public/preset_modal.js` — Lógica del modal de presets (nuevo/editar).
- `public/task_editor.js` — Renderer del editor de tareas (UI + tabla + biblioteca + anchos de columnas).
- `public/flotante.js` — Lógica de la ventana flotante del cronómetro.
- `public/language_window.js` — Lógica de la ventana de selección de idioma.
- `public/reading_test_questions.js` — Lógica del modal de preguntas/comprensión del reading speed test.

### 2) Módulos del proceso principal (Electron)

- `electron/fs_storage.js`: Persistencia JSON sincrónica del main; resuelve rutas bajo `app.getPath('userData')/config` (requiere `initStorage(app)`); ensure dirs + loadJson/saveJson + getters de `settings/current_text/editor_state`, estado del picker import/extract, credenciales/tokens OCR runtime y ruta de credenciales OCR empaquetadas en `electron/assets/ocr_google_drive/credentials.json`.
- `electron/settings.js`: estado de settings: defaults centralizados (`createDefaultSettings`), carga/normalización y persistencia; integra defaults de formato numérico desde `i18n/<langBase>/numberFormat.json` (`ensureNumberFormattingForBase`); registra IPC `get-settings`, `set-language`, `set-mode-conteo`, `set-selected-preset` y difunde cambios vía `settings-updated`; mantiene buckets por idioma (p.ej. `selected_preset_by_language`).
- `electron/text_state.js` — Estado del texto vigente: carga/guardado, límites (texto + payload IPC), lectura de portapapeles en main, y broadcast best-effort hacia ventanas (main/editor).
- `electron/current_text_snapshots_main.js` — Snapshots del texto vigente (save/load): valida payloads del flujo save, abre diálogos nativos, persiste/lee JSON bajo `config/saved_current_texts/` (incluye subcarpetas), acepta snapshots legacy `{ "text": "<string>" }` y snapshots etiquetados `{ "text": "<string>", "tags"?: { "language"?, "type"?, "difficulty"? } }`, confirma overwrite al cargar y mantiene chequeo de contención (realpath/relative) para evitar escapes fuera del árbol.
- `electron/editor_state.js` — Persistencia/estado de la ventana editor (tamaño/posición/maximizado) y su integración con el `BrowserWindow`.
- `electron/editor_find_main.js` — Coordinador del buscador nativo del editor: ciclo de vida de la ventana de búsqueda, atajos (`Ctrl/Cmd+F`, `F3`, `Shift+F3`, `Esc`), IPC autorizado y sincronización de estado con `found-in-page`.
- `electron/reading_test_pool.js` — Helpers del pool del reading speed test: asegura el subárbol runtime bajo snapshots, copia starter files versionados cuando faltan, escanea/valida JSON del pool, serializa metadata para la UI y reescribe `tags.testUsed` inline.
- `electron/reading_test_session.js` — Controlador main-owned del reading speed test: precondiciones, bloqueo de interacción, selección aleatoria del pool, ownership de la sesión, reinterpretación de controles flotantes, finish flow, questions step y handoff al modal de presets.
- `electron/presets_main.js` — Sistema de presets en main: defaults por idioma, CRUD, diálogos nativos y handlers IPC.
- `electron/tasks_main.js` — Backend de tareas (persistencia + validación + IPC de listas/biblioteca/anchos/enlaces).
- `electron/task_editor_position.js` — Persistencia de posición (x/y) de la ventana del editor de tareas.
- `electron/import_extract_platform/import_extract_file_picker_ipc.js` — File picker nativo del flujo import/extract; resuelve carpeta por defecto/persistida, guarda la última carpeta usada y deriva la lista de extensiones soportadas desde el contrato compartido de formatos.
- `electron/import_extract_platform/import_extract_preconditions_ipc.js` — Gate previo al inicio: bloquea extracción si hay ventanas secundarias abiertas o si el cronómetro está corriendo.
- `electron/import_extract_platform/import_extract_processing_mode_ipc.js` — Controlador/IPC del processing mode de import/extract: lock state, broadcast al renderer y solicitud de abort.
- `electron/import_extract_platform/import_extract_ocr_activation_ipc.js` — Activación OCR Google vía navegador del sistema, separada en dos fases IPC: preparación de credenciales (`prepareImportExtractOcrActivation`, sin abrir navegador) y lanzamiento OAuth (`launchImportExtractOcrActivation`, persiste el token local y valida el setup).
- `electron/import_extract_platform/import_extract_ocr_disconnect_ipc.js` — Desconexión OCR desde menú: confirmación nativa, revocación del token OAuth guardado y borrado del token local tras revocación exitosa.
- `electron/import_extract_platform/import_extract_prepare_execute_core.js` — Núcleo compartido del prepare/execute: clasificación de archivo, gating de formatos soportados, triage PDF, selección de ruta y ejecución.
- `electron/import_extract_platform/import_extract_prepare_ipc.js` — Etapa prepare del archivo seleccionado: calcula metadata/rutas disponibles y crea el registro preparado.
- `electron/import_extract_platform/import_extract_execute_prepared_ipc.js` — Etapa execute del flujo preparado: valida integridad del registro/fingerprint y corre la ruta elegida en processing mode.
- `electron/import_extract_platform/import_extract_prepared_store.js` — Store efímero de requests preparadas con TTL y fingerprint del archivo fuente.
- `electron/import_extract_platform/import_extract_platform_adapter.js` + `electron/import_extract_platform/platform_adapters/*.js` — Abstracción por plataforma para carpeta inicial del picker y normalización de paths (Windows-first, pero portable a macOS/Linux).
- `electron/import_extract_platform/import_extract_supported_formats.js` — Contrato compartido de formatos soportados por import/extract: centraliza extensiones nativas, extensiones Google-backed y extensiones OCR/imagen, además de los helpers reutilizados por picker, prepare y rutas de ejecución.
- `electron/import_extract_platform/native_extraction_route.js` — Ruta de extracción nativa para `txt`, `md`, `html`, `docx` y PDFs con text layer; consume el contrato compartido de formatos y mantiene el pipeline de normalización.
- `electron/import_extract_platform/native_pdf_selectable_text_probe.js` — Probe de PDF para detectar si existe texto seleccionable utilizable antes de decidir la ruta.
- `electron/import_extract_platform/ocr_google_drive_activation_state.js` — Estado grueso de disponibilidad OCR a partir de presencia de `credentials.json`/`token.json`; distingue `credentials_missing`, `ocr_activation_required` y `ready` antes de validaciones más profundas.
- `electron/import_extract_platform/ocr_google_drive_bundled_credentials.js` — Bootstrap del modelo OCR de producción: consume el lector compartido de `credentials.json`, valida las credenciales OAuth desktop empaquetadas y materializa/repara el espejo runtime bajo `config/ocr_google_drive/credentials.json` sin pedir importación manual al usuario.
- `electron/import_extract_platform/ocr_google_drive_credentials_file.js` — Lector/validador low-level compartido para `credentials.json`: lectura BOM-safe, parse JSON, clasificación (`missing_file`/`empty_file`/`invalid_json`/`invalid_shape`/`read_failed`) y validación de la shape OAuth desktop/web.
- `electron/import_extract_platform/ocr_google_drive_oauth_client.js` — Helpers compartidos OAuth para OCR: lectura de `credentials.json`, construcción del cliente OAuth2 y selección del token preferido para revocación.
- `electron/import_extract_platform/ocr_google_drive_provider_failure_classification.js` — Clasificación compartida post-parse de fallas provider/runtime de Google OCR: centraliza tablas de razones y la política común para `connectivity_failed`, `provider_api_disabled`, `quota_or_rate_limited`, `auth_failed` y `platform_runtime_failed`.
- `electron/import_extract_platform/ocr_google_drive_provider_failure.js` — Parser compartido de fallas provider-side de Google para OCR: lee tanto `error.errors[].reason` como `google.rpc.ErrorInfo.reason`, normaliza señales documentadas de API deshabilitada y preserva diagnóstico de conflictos entre ambos formatos.
- `electron/import_extract_platform/ocr_google_drive_setup_validation.js` — Validación técnica del setup OCR (credenciales, token y reachability de Google Drive); consume el parser compartido y la clasificación post-parse común, pero conserva subtipos y fallback propios del flujo de setup.
- `electron/import_extract_platform/ocr_google_drive_token_storage.js` — Lectura/escritura/borrado protegido del token OCR usando `safeStorage` de Electron.
- `electron/import_extract_platform/ocr_google_drive_route.js` — Ruta Google Drive/Docs para extracción respaldada por Google: cubre `rtf`/`odt` por conversión de documento y también imágenes/PDFs para OCR, usa la clasificación post-parse común para fallas provider/runtime y conserva sus fallbacks propios de etapa (`ocr_conversion_failed` / `ocr_export_failed`).
- `electron/import_extract_platform/ocr_image_normalization.js` — Normalización local de imágenes para OCR antes del upload cuando el formato lo requiere.
- `electron/menu_builder.js` — Construcción del menú nativo: carga bundle i18n con cadena de fallback (tag→base→DEFAULT_LANG); incluye menú Dev opcional (SHOW_DEV_MENU en dev); enruta acciones al renderer (`menu-click`) y expone textos de diálogos.
- `electron/updater.js` — Lógica de actualización (comparación de versión, diálogos y apertura de URL de descarga).
- `electron/link_openers.js` — Registro de IPC para abrir enlaces externos y documentos de la app: `open-external-url` (solo `https` + whitelist de hosts, incluyendo `totapp.org` y `www.patreon.com` para superficies fijas de la app) y `open-app-doc` (mapea docKey→archivo; gating en dev; verifica existencia; en algunos casos copia a temp y abre vía `shell.openExternal/openPath`).
- `electron/constants_main.js` — Constantes del proceso principal (IDs, rutas/keys comunes, flags, etc. según aplique).
- `electron/log.js` — Logger del proceso principal (política de logs/fallbacks).
- `electron/main.js` — Además del arranque normal, contiene un hook de smoke test local controlado por env vars (`TOT_SMOKE_TEST`, `TOT_SMOKE_USER_DATA_DIR`) para validar el startup mínimo con perfil aislado.

### 3) Módulos del renderer (public/js)

Estos módulos encapsulan lógica compartida del lado UI; `public/renderer.js` suele actuar como orquestador.

- `public/js/constants.js` — Constantes compartidas del renderer.
- `public/js/wpm_curve.js` — Mapeo discreto slider↔WPM (lineal/exponencial suave), garantizando cobertura de enteros en el rango configurado.
- `public/js/lib/count_core.js` — Núcleo puro/importable de conteo (simple/preciso, `Intl.Segmenter`, regla de unión por guiones) reutilizado por el wrapper renderer y por la suite automatizada.
- `public/js/lib/format_core.js` — Núcleo puro/importable de formateo (tiempo estimado, partes de tiempo y separadores numéricos) reutilizado por el wrapper renderer y por la suite automatizada.
- `public/js/lib/reading_test_filters_core.js` — Núcleo puro/importable del selector del reading speed test: semántica de checkboxes (OR dentro de categoría, AND entre categorías activas), cálculo de elegibles y enabled/disabled state desde combinaciones reales.
- `public/js/lib/reading_test_questions_core.js` — Núcleo puro/importable del reading speed test para validar payloads `readingTest.questions`, puntuar respuestas y calcular el baseline probabilístico de respuesta al azar.
- `public/js/lib/snapshot_tag_catalog.js` — Catálogo puro/importable compartido de tags de snapshot: define los valores canónicos/opciones de `language` / `type` / `difficulty` / `testUsed` y centraliza la normalización reutilizada por renderer y main para evitar drift.
- `public/js/count.js` — Wrapper renderer de conteo: valida dependencias del `window`, construye `window.CountUtils` desde `count_core.js` y conserva la superficie pública existente.
- `public/js/format.js` — Wrapper renderer de formateo: valida dependencias del `window`, construye `window.FormatUtils` desde `format_core.js` y conserva la superficie pública existente.
- `public/js/i18n.js` — Capa i18n del renderer: carga/aplicación de textos y utilidades de traducción.
- `public/js/presets.js` — UX del selector y flujos de presets en UI (sin IPC directo; usa `electronAPI.getDefaultPresets` / `electronAPI.setSelectedPreset`).
- `public/js/crono.js` — UX del cronómetro en UI (cliente del cronómetro autoritativo en main).
- `public/js/menu_actions.js` — Router de acciones recibidas desde el menú (`menu-click`) hacia handlers de UI; expone `window.menuActions` (register/unregister/list/stopListening).
- `public/js/current_text_snapshots.js` — Helper de snapshots del texto vigente: expone `saveSnapshot()` / `loadSnapshot()`, invoca el modal previo de tags al guardar, normaliza metadata opcional de snapshot vía `snapshot_tag_catalog`, llama `electronAPI.saveCurrentTextSnapshot` / `electronAPI.loadCurrentTextSnapshot` y mapea `{ ok, code }` a `Notify` (sin DOM wiring; el binding de botones vive en `public/renderer.js`).
- `public/js/snapshot_save_tags_modal.js` — Modal renderer previo al save nativo de snapshots: muestra selects opcionales para `language` / `type` / `difficulty`, aplica i18n y devuelve tags normalizados o cancelación.
- `public/js/reading_speed_test.js` — Módulo renderer del reading speed test: gestiona el modal de entrada/configuración, refleja combinaciones reales del pool, ejecuta reset/start IPC, muestra warnings inline y sincroniza el lock state / WPM aplicado.
- `public/js/info_modal_links.js` — Binding de enlaces en info modals: evita doble-bind (`dataset.externalLinksBound`); rutea `#` (scroll interno), `appdoc:` (api.openAppDoc) y externos (api.openExternalUrl); usa `CSS.escape` con fallback; logger `window.getLogger('info-modal-links')`.
- `public/js/main_logo_links.js` — Binding de enlaces fijos del header principal: conecta los logos clickeables de Cibersino y Patreon a `electronAPI.openExternalUrl(...)`, aplica tooltips/labels i18n (`es` / `en`) y mantiene este wiring fuera de `public/renderer.js`.
- `public/js/text_apply_canonical.js` — Helpers canónicos de aplicar texto (`overwrite` / `append` / repeticiones) reutilizados por clipboard e import/extract.
- `public/js/results_time_multiplier.js` — Controla el multiplicador de tiempo bajo el resultado estimado: valida el input como numero natural, conserva el estado base recibido desde `public/renderer.js` y renderiza el tiempo multiplicado en la ventana principal.
- `public/js/import_extract_status_ui.js` — Superficie visual del flujo import/extract en ventana principal: estado prepare, waiting UI honesta, tiempo transcurrido y botón abort.
- `public/js/import_extract_route_choice_modal.js` — Modal de elección de ruta (`native` / `ocr`) cuando un PDF soporta ambas.
- `public/js/import_extract_apply_modal.js` — Modal post-extracción para decidir overwrite/append y repeticiones antes de aplicar el texto extraído.
- `public/js/import_extract_ocr_activation_disclosure_modal.js` — Modal renderer de preconsentimiento para OCR Google: muestra la divulgación inmediatamente antes del OAuth, enlaza a `privacy-policy` mediante `openAppDoc(...)` y exige acción afirmativa del usuario.
- `public/js/import_extract_ocr_activation_recovery.js` — Helpers de recuperación para OCR: completan preparación de credenciales, muestran el modal de divulgación y lanzan OAuth solo tras aceptación, antes de reintentar el prepare.
- `public/js/import_extract_ocr_disconnect.js` — Handler del renderer para `Disconnect Google OCR`: solicita la desconexión al main y muestra feedback de éxito/fallo/not-connected.
- `public/js/import_extract_entry.js` — Orquestador compartido del flujo import/extract desde picker o drag/drop.
- `public/js/import_extract_drag_drop.js` — Capa drag/drop del main: overlay de drop y forwarding de archivos al entry flow compartido.
- `public/js/notify.js` — Avisos/alertas no intrusivas en UI.
- `public/js/log.js` — Logger del renderer (política de logs del lado UI).

### 3.1) Testing automatizado

- `.github/workflows/test.yml` — Workflow GitHub Actions del baseline automatizado actual; corre `npm ci` + `npm test` sobre `windows-latest`.
- `test/README.md` — Convenciones del layout de tests y separación entre baseline unitario y smoke suite local.
- `test/unit/electron/*.test.js` — Cobertura de contratos Node-accessible del proceso principal y del flujo import/extract (`settings`, formatos soportados, prepared store, parsing/clasificación OCR, decision helpers).
- `test/unit/shared/*.test.js` — Cobertura de núcleos puros extraídos del renderer (`count_core`, `format_core`).
- `test/smoke/electron_launch_smoke.test.js` — Smoke test local del arranque real de Electron con perfil temporal aislado; no forma parte de `npm test` ni del workflow CI base.

### 4) i18n (estructura y responsabilidades)

- `i18n/languages.json` — Catálogo de idiomas soportados (y metadatos si aplica).
- `i18n/<lang>/main.json` — Textos del proceso principal / menú / diálogos nativos.
- `i18n/<lang>/renderer.json` — Textos de la UI (ventana principal y modales renderizados).
- `i18n/<lang>/numberFormat.json` — Configuración de formato numérico por idioma (defaults; puede haber override vía settings).
- `i18n/<lang>/<variant>/*.json` — Variantes regionales cuando aplica (p.ej. `i18n/es/es-cl/`).

### 5) Persistencia runtime (carpeta `config/`)

**Nota:** `config/` se crea y usa en runtime. Estos archivos representan **estado local del usuario** y se ignoran por git para no commitear estado de ejecución.

- `config/user_settings.json` — Preferencias del usuario (idioma, modo de conteo, presets personalizados, etc.).
- `config/current_text.json` — Texto vigente persistido.
- `config/editor_state.json` — Estado persistido del editor (geometría/maximizado, etc.).
- `config/import_extract_state.json` — Estado local del picker de import/extract (por ejemplo, última carpeta utilizada).
- `config/ocr_google_drive/credentials.json` — Espejo/copia runtime gestionado por la app para la configuración OAuth de Google OCR; en el modelo actual se materializa desde credenciales empaquetadas de la app y no forma parte del onboarding manual del usuario.
- `config/ocr_google_drive/token.json` — Estado local del token OAuth del usuario final para la ruta OCR de Google Drive/Docs; se elimina al desconectar Google OCR tras revocación exitosa.
- `config/saved_current_texts/` — Carpeta runtime con snapshots del texto vigente; admite JSON legacy `{ "text": ... }`, snapshots etiquetados `{ "text": ..., "tags"?: { "language"?, "type"?, "difficulty"?, "testUsed"? } }` y archivos con payload opcional `readingTest`; puede contener subcarpetas. La carga normal de snapshots sigue aplicando solo `text` al current text, sin rechazar metadata adicional compatible.
- `config/saved_current_texts/reading_speed_test_pool/` — Subcarpeta runtime dedicada al pool del reading speed test; recibe starter files copiados desde `electron/reading_test_pool/`, persiste `tags.testUsed` inline y sigue siendo compatible con el flujo normal de snapshots.
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
- `docs/issues/` — Issues relevantes y actuales que requieren seguimiento en Github.
- `docs/test_suite.md` — Suite manual app-level; incluye una sección breve de “Automated coverage status” para mapear la cobertura automatizada vigente sin reemplazar el smoke/regression manual.
- `CHANGELOG.md` — Changelog corto (resumen por versión).
- `ToDo.md` (o `docs/` / Project) — Roadmap/índice (si aplica; evitar duplicación con GitHub Project/Issues).
- `docs/cleanup/` — Protocolos y evidencia de cleanup (incluye `_evidence/`, `no_silence.md`, `bridge_failure_mode_convention.md`, `preload_listener_api_standard.md`, etc.).

### 6.0) Tooling raíz

- `package.json` — Manifiesto npm/electron-builder; además del arranque y packaging, define `npm test`, `npm run test:unit` y `npm run test:smoke`.
- `package-lock.json` — Lockfile npm usado también por el workflow CI (`npm ci`).

### 6.1) Sitio web estático (website/public)

- `website/public/index.html` — Landing neutral del sitio público (`https://totapp.org/`), usada como entrada x-default y selector explícito de idioma.
- `website/public/es/index.html` — Versión en español (`https://totapp.org/es/`), con switch de idioma, CTA de descarga y bloque "Apoya y sigue a Cibersino".
- `website/public/en/index.html` — Versión en inglés (`https://totapp.org/en/`), con switch de idioma, CTA de descarga y bloque "Support and follow Cibersino".
- `website/public/es/app-privacy/index.html` — Política de privacidad pública de la app en español.
- `website/public/en/app-privacy/index.html` — Política de privacidad pública de la app en inglés.
- `website/public/es/app-privacy/google-ocr/index.html` — Página pública específica de privacidad para Google OCR en español.
- `website/public/en/app-privacy/google-ocr/index.html` — Página pública específica de privacidad para Google OCR en inglés.
- `website/public/es/privacy-cookies/index.html` — Política mínima de privacidad/cookies en español.
- `website/public/en/privacy-cookies/index.html` — Política mínima de privacidad/cookies en inglés.
- Footer de `index.html`, `es/index.html` y `en/index.html` — incluye enlaces visibles a la política pública de privacidad de la app y/o a la política del sitio, según corresponda.
- `website/public/site-language.js` — Helper compartido del sitio estático para detectar/persistir idioma preferido y soportar la redirección desde `/`.
- `website/public/styles.css` — Hoja de estilos compartida para las tres rutas.
- `website/public/assets/brand/*.svg` — Logos locales del proyecto/desarrollador usados en el header y footer (`logo-tot.svg`, `logo-cibersino.svg`).
- `website/public/assets/social/` — Íconos sociales usados en `/es/` y `/en/` (Instagram light/dark, Patreon, X light/dark, YouTube, Twitch) y `SOURCES.md` como trazabilidad de origen de assets.
- `website/public/_headers` — Políticas de headers para Cloudflare Pages (incluye noindex para dominios preview/versionados).
- `website/public/robots.txt` — Reglas de robots para el dominio público.
- `website/public/favicon.*` y `website/public/og-image.png` — Activos comunes de branding/preview social.

### 6.2) Branding local en la app (public/assets)

- `public/assets/logo-tot.svg` / `public/assets/logo-tot.png` — Branding de la app usado en la ventana principal.
- `public/assets/logo-cibersino.svg` — Branding del desarrollador usado en la ventana principal.
- `public/assets/patreon.png` — Símbolo de Patreon usado en la ventana principal junto al logo de Cibersino; asset runtime copiado desde `tools_local` para mantener la procedencia local/original separada del sitio web.

### 6.3) Recursos de packaging (build-resources)

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
