# Árbol de carpetas y archivos

**Versión de la app:** ver campo `version` en [`package.json`](../package.json)

Este documento describe la **estructura** del repo y los **archivos clave** (entry points y módulos).
No es un inventario exhaustivo de cada archivo.

## Árbol

```ASCII
tot/
├── .vscode/                       # {carpeta ignorada por git}
│ ├── settings.json
│ └── tasks.json
├── build-output/                  # {vacío} {carpeta ignorada por git}
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
│ ├── fs_storage.js
│ ├── settings.js
│ ├── text_state.js
│ ├── current_text_snapshots_main.js
│ ├── tasks_main.js
│ ├── task_editor_position.js
│ ├── editor_state.js
│ ├── editor_find_main.js
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
│ │ ├── import_extract_ocr_gate_ipc.js
│ │ ├── import_extract_ocr_activation_ipc.js
│ │ ├── import_extract_ocr_disconnect_ipc.js
│ │ ├── import_extract_prepare_execute_core.js
│ │ ├── import_extract_prepare_ipc.js
│ │ ├── import_extract_execute_prepared_ipc.js
│ │ ├── import_extract_prepared_store.js
│ │ ├── import_extract_platform_adapter.js
│ │ ├── native_extraction_route.js
│ │ ├── native_pdf_selectable_text_probe.js
│ │ ├── ocr_google_drive_activation_state.js
│ │ ├── ocr_google_drive_oauth_client.js
│ │ ├── ocr_google_drive_setup_validation.js
│ │ ├── ocr_google_drive_setup_validation_ipc.js
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
│ │ ├── logo-cibersino.ico
│ │ ├── logo-cibersino.png
│ │ ├── logo-cibersino.svg
│ │ ├── logo-tot.png
│ │ └── logo-tot.svg
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
│ │ ├── count.js
│ │ ├── presets.js
│ │ ├── crono.js
│ │ ├── menu_actions.js
│ │ ├── current_text_snapshots.js
│ │ ├── format.js
│ │ ├── i18n.js
│ │ ├── constants.js
│ │ ├── wpm_curve.js
│ │ ├── notify.js
│ │ ├── info_modal_links.js
│ │ ├── text_apply_canonical.js
│ │ ├── import_extract_status_ui.js
│ │ ├── import_extract_route_choice_modal.js
│ │ ├── import_extract_apply_modal.js
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
│ ├── index.html
│ ├── language_window.html
│ ├── editor.html
│ ├── editor_find.html
│ ├── task_editor.html
│ ├── preset_modal.html
│ ├── flotante.html
│ ├── editor.css
│ ├── editor_find.css
│ ├── task_editor.css
│ ├── flotante.css
│ └── style.css
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
│   │ ├── privacy-cookies/
│   │ │ └── index.html
│   │ └── index.html
│   ├── es/
│   │ ├── privacy-cookies/
│   │ │ └── index.html
│   │ └── index.html
│   ├── privacy-cookies/
│   │ └── index.html
│   ├── index.html
│   ├── favicon.svg
│   ├── favicon.ico
│   ├── og-image.png
│   ├── robots.txt
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

**Renderer (UI / ventanas):**
- `public/renderer.js` — Lógica principal de UI (ventana principal).
- `public/editor.js` — Lógica del editor manual (ventana editor).
- `public/editor_find.js` — Lógica de la ventana dedicada de búsqueda del editor.
- `public/preset_modal.js` — Lógica del modal de presets (nuevo/editar).
- `public/task_editor.js` — Renderer del editor de tareas (UI + tabla + biblioteca + anchos de columnas).
- `public/flotante.js` — Lógica de la ventana flotante del cronómetro.
- `public/language_window.js` — Lógica de la ventana de selección de idioma.

### 2) Módulos del proceso principal (Electron)

- `electron/fs_storage.js`: Persistencia JSON sincrónica del main; resuelve rutas bajo `app.getPath('userData')/config` (requiere `initStorage(app)`); ensure dirs + loadJson/saveJson + getters de `settings/current_text/editor_state`, estado del picker import/extract y credenciales/tokens OCR.
- `electron/settings.js`: estado de settings: defaults centralizados (`createDefaultSettings`), carga/normalización y persistencia; integra defaults de formato numérico desde `i18n/<langBase>/numberFormat.json` (`ensureNumberFormattingForBase`); registra IPC `get-settings`, `set-language`, `set-mode-conteo`, `set-selected-preset` y difunde cambios vía `settings-updated`; mantiene buckets por idioma (p.ej. `selected_preset_by_language`).
- `electron/text_state.js` — Estado del texto vigente: carga/guardado, límites (texto + payload IPC), lectura de portapapeles en main, y broadcast best-effort hacia ventanas (main/editor).
- `electron/current_text_snapshots_main.js` — Snapshots del texto vigente (save/load): diálogos nativos, lectura/escritura JSON `{ "text": "<string>" }` bajo `config/saved_current_texts/` (incluye subcarpetas), confirmación de overwrite y chequeo de contención (realpath/relative) para evitar escapes fuera del árbol.
- `electron/editor_state.js` — Persistencia/estado de la ventana editor (tamaño/posición/maximizado) y su integración con el `BrowserWindow`.
- `electron/editor_find_main.js` — Coordinador del buscador nativo del editor: ciclo de vida de la ventana de búsqueda, atajos (`Ctrl/Cmd+F`, `F3`, `Shift+F3`, `Esc`), IPC autorizado y sincronización de estado con `found-in-page`.
- `electron/presets_main.js` — Sistema de presets en main: defaults por idioma, CRUD, diálogos nativos y handlers IPC.
- `electron/tasks_main.js` — Backend de tareas (persistencia + validación + IPC de listas/biblioteca/anchos/enlaces).
- `electron/task_editor_position.js` — Persistencia de posición (x/y) de la ventana del editor de tareas.
- `electron/import_extract_platform/import_extract_file_picker_ipc.js` — File picker nativo del flujo import/extract; resuelve carpeta por defecto/persistida y guarda la última carpeta usada.
- `electron/import_extract_platform/import_extract_preconditions_ipc.js` — Gate previo al inicio: bloquea extracción si hay ventanas secundarias abiertas o si el cronómetro está corriendo.
- `electron/import_extract_platform/import_extract_processing_mode_ipc.js` — Controlador/IPC del processing mode de import/extract: lock state, broadcast al renderer y solicitud de abort.
- `electron/import_extract_platform/import_extract_ocr_gate_ipc.js` — Clasifica elegibilidad OCR por tipo de archivo y estado de disponibilidad/activación del OCR.
- `electron/import_extract_platform/import_extract_ocr_activation_ipc.js` — Activación OCR vía desktop OAuth en navegador del sistema; valida `credentials.json` y persiste el token local.
- `electron/import_extract_platform/import_extract_ocr_disconnect_ipc.js` — Desconexión OCR desde menú: confirmación nativa, revocación del token OAuth guardado y borrado del token local tras revocación exitosa.
- `electron/import_extract_platform/import_extract_prepare_execute_core.js` — Núcleo compartido del prepare/execute: clasificación de archivo, triage PDF, selección de ruta y ejecución.
- `electron/import_extract_platform/import_extract_prepare_ipc.js` — Etapa prepare del archivo seleccionado: calcula metadata/rutas disponibles y crea el registro preparado.
- `electron/import_extract_platform/import_extract_execute_prepared_ipc.js` — Etapa execute del flujo preparado: valida integridad del registro/fingerprint y corre la ruta elegida en processing mode.
- `electron/import_extract_platform/import_extract_prepared_store.js` — Store efímero de requests preparadas con TTL y fingerprint del archivo fuente.
- `electron/import_extract_platform/import_extract_platform_adapter.js` + `electron/import_extract_platform/platform_adapters/*.js` — Abstracción por plataforma para carpeta inicial del picker y normalización de paths (Windows-first, pero portable a macOS/Linux).
- `electron/import_extract_platform/native_extraction_route.js` — Ruta de extracción nativa para `txt`, `md`, `html`, `docx` y PDFs con text layer; incluye pipeline de normalización.
- `electron/import_extract_platform/native_pdf_selectable_text_probe.js` — Probe de PDF para detectar si existe texto seleccionable utilizable antes de decidir la ruta.
- `electron/import_extract_platform/ocr_google_drive_activation_state.js` — Estado local de disponibilidad OCR (`setup_incomplete`, `ocr_activation_required`, `ready`) a partir de `credentials.json`/`token.json`.
- `electron/import_extract_platform/ocr_google_drive_oauth_client.js` — Helpers compartidos OAuth para OCR: lectura de `credentials.json`, construcción del cliente OAuth2 y selección del token preferido para revocación.
- `electron/import_extract_platform/ocr_google_drive_setup_validation.js` — Validación técnica del setup OCR (credenciales, token y reachability de Google Drive).
- `electron/import_extract_platform/ocr_google_drive_setup_validation_ipc.js` — Handler IPC para consultar/diagnosticar el estado de setup OCR desde la UI.
- `electron/import_extract_platform/ocr_google_drive_token_storage.js` — Lectura/escritura/borrado protegido del token OCR usando `safeStorage` de Electron.
- `electron/import_extract_platform/ocr_google_drive_route.js` — Ruta OCR Google Drive/Docs: upload, conversión, export a texto, cleanup y taxonomía explícita de errores.
- `electron/import_extract_platform/ocr_image_normalization.js` — Normalización local de imágenes para OCR antes del upload cuando el formato lo requiere.
- `electron/menu_builder.js` — Construcción del menú nativo: carga bundle i18n con cadena de fallback (tag→base→DEFAULT_LANG); incluye menú Dev opcional (SHOW_DEV_MENU en dev); enruta acciones al renderer (`menu-click`) y expone textos de diálogos.
- `electron/updater.js` — Lógica de actualización (comparación de versión, diálogos y apertura de URL de descarga).
- `electron/link_openers.js` — Registro de IPC para abrir enlaces externos y documentos de la app: `open-external-url` (solo `https` + whitelist de hosts) y `open-app-doc` (mapea docKey→archivo; gating en dev; verifica existencia; en algunos casos copia a temp y abre vía `shell.openExternal/openPath`).
- `electron/constants_main.js` — Constantes del proceso principal (IDs, rutas/keys comunes, flags, etc. según aplique).
- `electron/log.js` — Logger del proceso principal (política de logs/fallbacks).

### 3) Módulos del renderer (public/js)

Estos módulos encapsulan lógica compartida del lado UI; `public/renderer.js` suele actuar como orquestador.

- `public/js/constants.js` — Constantes compartidas del renderer.
- `public/js/wpm_curve.js` — Mapeo discreto slider↔WPM (lineal/exponencial suave), garantizando cobertura de enteros en el rango configurado.
- `public/js/count.js` — Cálculos de conteo (palabras/caracteres; modo simple/preciso).
- `public/js/format.js` — Helpers de formateo (tiempo y numeros); expone `window.FormatUtils`.
- `public/js/i18n.js` — Capa i18n del renderer: carga/aplicación de textos y utilidades de traducción.
- `public/js/presets.js` — UX del selector y flujos de presets en UI (sin IPC directo; usa `electronAPI.getDefaultPresets` / `electronAPI.setSelectedPreset`).
- `public/js/crono.js` — UX del cronómetro en UI (cliente del cronómetro autoritativo en main).
- `public/js/menu_actions.js` — Router de acciones recibidas desde el menú (`menu-click`) hacia handlers de UI; expone `window.menuActions` (register/unregister/list/stopListening).
- `public/js/current_text_snapshots.js` — Helper de snapshots del texto vigente: expone `saveSnapshot()` / `loadSnapshot()`, invoca `electronAPI.saveCurrentTextSnapshot` / `electronAPI.loadCurrentTextSnapshot` y mapea `{ ok, code }` a `Notify` (sin DOM wiring; el binding de botones vive en `public/renderer.js`).
- `public/js/info_modal_links.js` — Binding de enlaces en info modals: evita doble-bind (`dataset.externalLinksBound`); rutea `#` (scroll interno), `appdoc:` (api.openAppDoc) y externos (api.openExternalUrl); usa `CSS.escape` con fallback; logger `window.getLogger('info-modal-links')`.
- `public/js/text_apply_canonical.js` — Helpers canónicos de aplicar texto (`overwrite` / `append` / repeticiones) reutilizados por clipboard e import/extract.
- `public/js/import_extract_status_ui.js` — Superficie visual del flujo import/extract en ventana principal: estado prepare, waiting UI honesta, tiempo transcurrido y botón abort.
- `public/js/import_extract_route_choice_modal.js` — Modal de elección de ruta (`native` / `ocr`) cuando un PDF soporta ambas.
- `public/js/import_extract_apply_modal.js` — Modal post-extracción para decidir overwrite/append y repeticiones antes de aplicar el texto extraído.
- `public/js/import_extract_ocr_activation_recovery.js` — Helpers de recuperación para activar OCR y reintentar el prepare cuando el bloqueo es de setup/auth.
- `public/js/import_extract_ocr_disconnect.js` — Handler del renderer para `Disconnect Google OCR`: solicita la desconexión al main y muestra feedback de éxito/fallo/not-connected.
- `public/js/import_extract_entry.js` — Orquestador compartido del flujo import/extract desde picker o drag/drop.
- `public/js/import_extract_drag_drop.js` — Capa drag/drop del main: overlay de drop y forwarding de archivos al entry flow compartido.
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

- `config/user_settings.json` — Preferencias del usuario (idioma, modo de conteo, presets personalizados, etc.).
- `config/current_text.json` — Texto vigente persistido.
- `config/editor_state.json` — Estado persistido del editor (geometría/maximizado, etc.).
- `config/import_extract_state.json` — Estado local del picker de import/extract (por ejemplo, última carpeta utilizada).
- `config/ocr_google_drive/credentials.json` — Credenciales OAuth de Google aportadas por el usuario para habilitar OCR localmente; se conservan al desconectar Google OCR.
- `config/ocr_google_drive/token.json` — Token OAuth local del usuario para la ruta OCR de Google Drive/Docs; se elimina al desconectar Google OCR tras revocación exitosa.
- `config/saved_current_texts/` — Carpeta runtime con snapshots del texto vigente (archivos JSON `{ "text": ... }`; puede contener subcarpetas).
- `config/tasks/lists/*.json` — Listas de tareas guardadas por el usuario.
- `config/tasks/library.json` — Biblioteca de filas (por `texto` normalizado).
- `config/tasks/allowed_hosts.json` — Allowlist de hosts confiables para enlaces remotos.
- `config/tasks/column_widths.json` — Persistencia de anchos de columnas del editor de tareas.
- `config/tasks/task_editor_position.json` — Última posición (x/y) de la ventana del editor de tareas.

#### 5.1) Presets por defecto (dos capas)

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
- `CHANGELOG.md` — Changelog corto (resumen por versión).
- `ToDo.md` (o `docs/` / Project) — Roadmap/índice (si aplica; evitar duplicación con GitHub Project/Issues).
- `docs/cleanup/` — Protocolos y evidencia de cleanup (incluye `_evidence/`, `no_silence.md`, `bridge_failure_mode_convention.md`, `preload_listener_api_standard.md`, etc.).

### 6.1) Sitio web estático (website/public)

- `website/public/index.html` — Landing neutral del sitio público (`https://totapp.org/`), usada como entrada x-default y selector explícito de idioma.
- `website/public/es/index.html` — Versión en español (`https://totapp.org/es/`), con switch de idioma, CTA de descarga y bloque "Apoya y sigue a Cibersino".
- `website/public/en/index.html` — Versión en inglés (`https://totapp.org/en/`), con switch de idioma, CTA de descarga y bloque "Support and follow Cibersino".
- `website/public/privacy-cookies/index.html` — Entrada neutral para política mínima de privacidad/cookies (selector hacia versiones localizadas).
- `website/public/es/privacy-cookies/index.html` — Política mínima de privacidad/cookies en español.
- `website/public/en/privacy-cookies/index.html` — Política mínima de privacidad/cookies en inglés.
- Footer de `index.html`, `es/index.html` y `en/index.html` — incluye enlaces visibles a la política de privacidad/cookies.
- `website/public/styles.css` — Hoja de estilos compartida para las tres rutas.
- `website/public/assets/brand/*.svg` — Logos locales del proyecto/desarrollador usados en el header y footer (`logo-tot.svg`, `logo-cibersino.svg`).
- `website/public/assets/social/` — Íconos sociales usados en `/es/` y `/en/` (Instagram light/dark, Patreon, X light/dark, YouTube, Twitch) y `SOURCES.md` como trazabilidad de origen de assets.
- `website/public/_headers` — Políticas de headers para Cloudflare Pages (incluye noindex para dominios preview/versionados).
- `website/public/robots.txt` — Reglas de robots para el dominio público.
- `website/public/favicon.*` y `website/public/og-image.png` — Activos comunes de branding/preview social.

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
