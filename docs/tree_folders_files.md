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
│ └── user_settings.json
├── docs/
│ ├── cleanup/
│ │ ├── _evidence/
│ │ ├── bridge_failure_mode_convention.md
│ │ ├── cleanup_file_by_file.md
│ │ ├── naming_convention.md
│ │ └── no_silence.md
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
├── website/
│ └── public/
│   ├── index.html
│   ├── favicon.svg
│   ├── favicon.ico
│   ├── og-image.png
│   ├── robots.txt
│   └── _headers
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

- `electron/fs_storage.js`: Persistencia JSON sincrónica del main; resuelve rutas bajo `app.getPath('userData')/config` (requiere `initStorage(app)`); ensure dirs + loadJson/saveJson + getters de `settings/current_text/editor_state`.
- `electron/settings.js`: estado de settings: defaults centralizados (`createDefaultSettings`), carga/normalización y persistencia; integra defaults de formato numérico desde `i18n/<langBase>/numberFormat.json` (`ensureNumberFormattingForBase`); registra IPC `get-settings`, `set-language`, `set-mode-conteo`, `set-selected-preset` y difunde cambios vía `settings-updated`; mantiene buckets por idioma (p.ej. `selected_preset_by_language`).
- `electron/text_state.js` — Estado del texto vigente: carga/guardado, límites (texto + payload IPC), lectura de portapapeles en main, y broadcast best-effort hacia ventanas (main/editor).
- `electron/current_text_snapshots_main.js` — Snapshots del texto vigente (save/load): diálogos nativos, lectura/escritura JSON `{ "text": "<string>" }` bajo `config/saved_current_texts/` (incluye subcarpetas), confirmación de overwrite y chequeo de contención (realpath/relative) para evitar escapes fuera del árbol.
- `electron/editor_state.js` — Persistencia/estado de la ventana editor (tamaño/posición/maximizado) y su integración con el `BrowserWindow`.
- `electron/editor_find_main.js` — Coordinador del buscador nativo del editor: ciclo de vida de la ventana de búsqueda, atajos (`Ctrl/Cmd+F`, `F3`, `Shift+F3`, `Esc`), IPC autorizado y sincronización de estado con `found-in-page`.
- `electron/presets_main.js` — Sistema de presets en main: defaults por idioma, CRUD, diálogos nativos y handlers IPC.
- `electron/tasks_main.js` — Backend de tareas (persistencia + validación + IPC de listas/biblioteca/anchos/enlaces).
- `electron/task_editor_position.js` — Persistencia de posición (x/y) de la ventana del editor de tareas.
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
- `CHANGELOG.md` — Changelog corto (resumen por versión).
- `ToDo.md` (o `docs/` / Project) — Roadmap/índice (si aplica; evitar duplicación con GitHub Project/Issues).
- `docs/cleanup/` — Protocolos y evidencia de cleanup (incluye `_evidence/`, `no_silence.md`, `bridge_failure_mode_convention.md`, etc.).

### 7) Política de actualización de este archivo

Actualizar `docs/tree_folders_files.md` cuando:
- Se agreguen/renombren entry points (main/preloads/ventanas).
- Se mueva o divida lógica en módulos principales (`electron/` o `public/js/`).
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
