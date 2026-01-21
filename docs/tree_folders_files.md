# Árbol de carpetas y archivos

**Versión de la app:** ver [`VERSION`](../VERSION)

Este documento describe la **estructura** del repo y los **archivos clave** (entry points y módulos).
No es un inventario exhaustivo de cada archivo.

## Árbol

```ASCII
tot-readingmeter/
├── .vscode/                       # {carpeta ignorada por git}
│ ├── settings.json
│ └── tasks.json
├── build-output/                  # {vacío} {carpeta ignorada por git}
├── config/                        # {generada en primer arranque} {carpeta ignorada por git}
│ ├── presets_defaults/
│ │ ├── defaults_presets.json   
│ │ ├── defaults_presets_en.json
│ │ └── defaults_presets_es.json
│ ├── current_text.json
│ ├── editor_state.json
│ └── user_settings.json
├── docs/
│ ├── cleanup/
│ │ ├── _evidence/
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
│ ├── preset_preload.js
│ ├── flotante_preload.js
│ ├── fs_storage.js
│ ├── settings.js
│ ├── text_state.js
│ ├── editor_state.js
│ ├── presets_main.js
│ ├── menu_builder.js
│ ├── updater.js
│ ├── link_openers.js
│ ├── constants_main.js
│ └── log.js
├── i18n/                          # {varias subcarpetas de idioma}
│ └── languages.json
├── public/
│ ├── assets/
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
│ │ ├── constants.js
│ │ ├── count.js
│ │ ├── format.js
│ │ ├── i18n.js
│ │ ├── menu_actions.js
│ │ ├── notify.js
│ │ ├── presets.js
│ │ ├── crono.js
│ │ ├── info_modal_links.js
│ │ └── log.js
│ ├── renderer.js
│ ├── language_window.js
│ ├── editor.js
│ ├── preset_modal.js
│ ├── flotante.js
│ ├── index.html
│ ├── language_window.html
│ ├── editor.html
│ ├── preset_modal.html
│ ├── flotante.html
│ ├── editor.css
│ ├── flotante.css
│ └── style.css
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
- `electron/preset_preload.js` — Preload del modal de presets: expone IPC hacia `public/preset_modal.js`.
- `electron/language_preload.js` — Preload de la ventana de idioma (primer arranque / selección).
- `electron/flotante_preload.js` — Preload de la ventana flotante del cronómetro.

**Renderer (UI / ventanas):**
- `public/renderer.js` — Lógica principal de UI (ventana principal).
- `public/editor.js` — Lógica del editor manual (ventana editor).
- `public/preset_modal.js` — Lógica del modal de presets (nuevo/editar/restaurar).
- `public/flotante.js` — Lógica de la ventana flotante del cronómetro.

### 2) Módulos del proceso principal (Electron)

- `electron/fs_storage.js` — Capa de persistencia JSON: rutas de config, ensure dirs, `loadJson`/`saveJson`, utilidades de almacenamiento.
- `electron/settings.js` — Fuente de verdad de `user_settings.json`: carga/normalización, persistencia, handlers IPC de settings y broadcast de cambios; también persiste la selección de preset por idioma (`selected_preset_by_language`, IPC `set-selected-preset`).
- `electron/text_state.js` — Estado del texto vigente (`currentText`) + límites (p. ej. `MAX_TEXT_CHARS`) + handlers IPC asociados.
- `electron/editor_state.js` — Persistencia/estado de la ventana editor (tamaño/posición/maximizado) y su integración con el `BrowserWindow`.
- `electron/presets_main.js` — Sistema de presets en main: defaults por idioma, CRUD, diálogos nativos y handlers IPC.
- `electron/menu_builder.js` — Construcción del menú nativo (labels i18n) + router de acciones hacia renderer (`menu-click`) + textos de diálogos.
- `electron/updater.js` — Lógica de actualización (comparación de versión, diálogos y apertura de URL de descarga).
- `electron/constants_main.js` — Constantes del proceso principal (IDs, rutas/keys comunes, flags, etc. según aplique).
- `electron/log.js` — Logger del proceso principal (política de logs/fallbacks).

### 3) Módulos del renderer (public/js)

Estos módulos encapsulan lógica compartida del lado UI; `public/renderer.js` suele actuar como orquestador.

- `public/js/constants.js` — Constantes compartidas del renderer.
- `public/js/count.js` — Cálculos de conteo (palabras/caracteres; modo simple/preciso).
- `public/js/format.js` — Formateo numérico/tiempos (incluye dependencias de `numberFormat`).
- `public/js/i18n.js` — Capa i18n del renderer: carga/aplicación de textos y utilidades de traducción.
- `public/js/presets.js` — UX del selector y flujos de presets en UI (con IPC hacia main).
- `public/js/crono.js` — UX del cronómetro en UI (cliente del cronómetro autoritativo en main).
- `public/js/menu_actions.js` — Router de acciones recibidas desde el menú (`menu-click`) hacia handlers de UI.
- `public/js/notify.js` — Avisos/alertas no intrusivas en UI.
- `public/js/log.js` — Logger del renderer (política de logs del lado UI).

### 4) i18n (estructura y responsabilidades)

- `i18n/languages.json` — Catálogo de idiomas soportados (y metadatos si aplica).
- `i18n/<lang>/main.json` — Textos del proceso principal / menú / diálogos nativos.
- `i18n/<lang>/renderer.json` — Textos de la UI (ventana principal y modales renderizados).
- `i18n/<lang>/numberFormat.json` — Configuración de formato numérico por idioma (defaults; puede haber override vía settings).

### 5) Persistencia runtime (carpeta `config/`)

**Nota:** `config/` se crea y usa en runtime. Estos archivos representan **estado local del usuario** y se ignoran por git para no commitear estado de ejecución.

- `config/user_settings.json` — Preferencias del usuario (idioma, modo de conteo, presets personalizados, etc.).
- `config/current_text.json` — Texto vigente persistido.
- `config/editor_state.json` — Estado persistido del editor (geometría/maximizado, etc.).

#### 5.1) Presets por defecto (dos capas)

- **Defaults de instalación (versionados):** `electron/presets/*.json`  
  Fuente “empaquetada” / base. Debe existir en el repo y viaja con la app.

- **Defaults editables por el usuario (runtime, no versionados):** `config/presets_defaults/*.json`  
  Copia editable fuera del empaquetado. Ignorada por git.

**Regla operativa (documentar aquí solo si aplica en el código actual):**
- Si `config/presets_defaults/` no existe o falta algún archivo esperado, la app lo restaura desde `electron/presets/`.
- Si el usuario modifica archivos en `config/presets_defaults/`, esos cambios se consideran en el próximo arranque.

### 6) Documentación y operación del repo

- `docs/release_checklist.md` — Checklist mecánico de release (fuentes de verdad, changelog, consistencia).
- `docs/changelog_detailed.md` — Changelog detallado (técnico/narrativo; post-0.0.930 con formato mecánico).
- `CHANGELOG.md` — Changelog corto (resumen por versión).
- `ToDo.md` (o `docs/` / Project) — Roadmap/índice (si aplica; evitar duplicación con GitHub Project/Issues).
- `docs/cleanup/` — Protocolos y evidencia de cleanup (incluye `_evidence/`, `no_silence.md`, etc.).

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
