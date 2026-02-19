# Changelog

Este archivo resume cambios relevantes por versión.
Para el historial técnico completo, ver `docs/changelog_detailed.md`.
Antes de publicar una nueva versión, seguir `docs/release_checklist.md`.

## Esquema de versiones

- **Histórico (hasta 0.0.930, inclusive):** no SemVer estricto. Se usó `0.0.XYY` como contador incremental de builds dentro del ciclo `0.0.X`.
- **Desde 0.1.0 en adelante:** SemVer estricto `MAJOR.MINOR.PATCH` (p. ej. `0.1.0`, `0.1.1`, `0.2.0`, `1.0.0`). Se prohíbe volver a usar `0.0.XYY` como contador de builds.
- **Pre-releases (cuando aplique):** `-alpha.N`, `-beta.N`, `-rc.N` sobre una base `MAJOR.MINOR.PATCH`.
- **Fuente de verdad:** la versión de la app proviene de `package.json` (`app.getVersion()`).
- **Tags de release (GitHub):** se publican como `vMAJOR.MINOR.PATCH` (p. ej. `v0.1.0`). El updater requiere el prefijo `v` (minúscula).

## [0.1.6] toT - Iteraciones
- Fecha: `2026-02-19`

- Selector de texto (Issue #131): nuevo flujo de append iterado con `N` repeticiones en un solo clic de `📋+` (lectura única de portapapeles, normalización/clamp de `N`, validación previa de tamaño y una sola escritura IPC).
- Rendimiento/sincronización: corregida la demora de actualización de la ventana principal cuando el editor la cubre completa (`backgroundThrottling:false` en `mainWin`).
- Canonicalización de texto vigente: `electron/text_state.js` normaliza saltos de línea a `LF` (`\n`) tanto en bootstrap como en `set-current-text`, y persiste la versión normalizada cuando corresponde.
- Estado de texto vigente: `public/renderer.js` elimina la doble autoridad local y usa `current-text-updated` como fuente única de sincronización UI.
- Editor manual: endurecimiento de límites de entrada (`beforeinput`) y del pipeline `paste`/`drop` para evitar overshoot/truncado reactivo y ecos locales.

## [0.1.5] toT - reemplazo find/search editor
- Fecha: `2026-02-18`

- Editor (Find/Search): reemplazo del sistema de búsqueda manual embebido por una ventana dedicada, controlada desde main y basada en `webContents.findInPage`.
- Superficie de búsqueda: la UI de búsqueda dejó de coexistir en el mismo DOM del editor; además se redujo exposición de textos de la barra inferior del editor moviendo labels a `data-label` + pseudo-elementos CSS.
- Snapshots: endurecimiento de validaciones y normalización del flujo de selección/carga por ruta relativa (`snapshotRelPath`) para uso desde Task Editor.
- UI/i18n: ajustes de títulos de ventanas (`toT — ...`), nuevas claves de snapshot en tareas y limpieza de textos hardcodeados en inglés en el editor de tareas.
- Cleanup policy gate (Issue #127, Nivel 3): cierre de auditoría bridge file-by-file con foco principal en renderer (`public/**`), más ajustes complementarios en main (`electron/**`), manteniendo intacto el contrato healthy-path.

## [0.1.4] toT - nuevo editor de tareas y snapshots
- Fecha: `2026-02-16`

- Snapshots del texto vigente (Issue #50): controles **Cargar/Guardar** con diálogos nativos para guardar el texto vigente como snapshot y cargar uno sobrescribiendo el texto vigente (con confirmación).
- Tareas (Issue #50): nueva ventana para gestionar listas de lectura (tiempo estimado, % completado, tiempo restante, enlaces y comentarios), con controles **Nueva/Cargar** en la ventana principal y persistencia bajo `config/tasks/`.

## [0.1.3] toT - nueva columna vertebral
- Fecha: `2026-02-11`

- Repo-wide cleanup execution (Issue #64): ejecución del protocolo `docs/cleanup/cleanup_file_by_file.md` a lo largo del repo (`/electron`, `/public` y preloads):
  - mejoras de estructura/logging/comentarios/coherencia sin cambios de contrato/timing observables;
  - evidencia consolidada por archivo en `docs/cleanup/_evidence/issue64_repo_cleanup.md` (incluye checklists L7).
- Arranque (Issue #102): rediseño a un modelo con **splash bloqueante** y un **único punto de habilitación de interactividad**, eliminando estados visibles “a medio inicializar” y reduciendo carreras de timing.
- Arranque (Issue #102): el renderer no queda utilizable hasta que:
  - el renderer completa prerrequisitos internos,
  - el main **autoriza** el desbloqueo, y
  - el renderer **confirma** el retiro del splash (handshake explícito).
- Arranque (Issue #102): se consolidó el bootstrap del renderer en **un solo orquestador** (config → settings → idioma/traducciones → texto vigente → presets) y se removieron arranques duplicados.
- Dev-only (Issue #94): atajos de desarrollo ahora operan sobre la ventana enfocada (fallback: ventana principal):
  - `Ctrl+Shift+I` → abre/cierra DevTools de la ventana enfocada.
  - `Ctrl+R` / `Ctrl+Shift+R` → recarga la ventana enfocada (normal / ignorando caché).
- Dev-only (Issue #94): menú **Development → Toggle DevTools** ahora aplica a la ventana enfocada (fallback: ventana principal), facilitando inspección de logs por ventana/renderer.
- Docs (Issue #94): README incorpora nota para desarrolladores sobre niveles de log del renderer y cómo habilitar el menú de desarrollo (`SHOW_DEV_MENU=1`) en corridas de desarrollo; además aclara que en builds empaquetados DevTools no es accionable (sin menú/atajos dev).

## [0.1.2] Con instrucciones
- Fecha: `2026-01-20`

### Added
- Manual de uso (Issue #85): contenido real con **3 secciones fijas** (`#instrucciones`, `#guia-basica`, `#faq`), versión **ES/EN** y **assets locales** (PNG/GIF).
- Info modal **“Links de interés”** (Issue #83): página dedicada con referencia + DOI (apertura externa allowlisted).
- Editor manual: búsqueda **Ctrl+F / Cmd+F** con barra de búsqueda, navegación (Enter/Shift+Enter, F3/Shift+F3), **modo modal no destructivo** (no modifica el texto; no afecta undo/redo) y **resaltado visible** del match aunque el foco quede en el input del buscador.

### Changed
- Cronómetro (Issue #84): se ajusta la semántica de reset por cambios de texto:
  - **No** se resetea si el texto resultante queda **no vacío**.
  - Se resetea **solo** cuando el texto vigente queda **vacío** (overwrite/append/vaciar/editor).
- Refactor del cronómetro para reducir acoplamiento y duplicación de wiring/estado en renderer.
- Selector de texto: iconos de overwrite/append del portapapeles actualizados a **`📋↺`** y **`📋+`**.

### Fixed
- Conteo (modo **Preciso**, Issue #85): compuestos con guion sin espacios (`e-mail`, `co-operate`, etc.) pasan a contar como **1 palabra**.
- Cronómetro (Issue #84): se evita pérdida de tiempo acumulado en ediciones no vacías y se garantiza reset completo y consistente al quedar el texto vacío.

## [0.1.1] Nuevos idiomas
- Fecha: `2026-01-16`

### Added
- Idiomas UI añadidos: Mapudungun (`arn`), Français (`fr`), Deutsch (`de`), Italiano (`it`), Português (`pt`).
- (Docs) `docs/test_suite.md` para correr pruebas manuales de la app (Issue #65), incorporado al flujo pre-release vía `docs/release_checklist.md`.

### Changed
- `README.md` reestructurado y ahora bilingüe (ES/EN).
- Ajuste de preview para textos cortos:
  - `PREVIEW_INLINE_THRESHOLD`: `200` → `1200`
  - `PREVIEW_START_CHARS`: `350` → `275`
  - `PREVIEW_END_CHARS`: `230` → `275`
- UX:
  - Nota de la ventana de idioma actualizada (mensaje de contribución ES/EN).
  - Botón de Editor manual pasa a símbolo `⌨`.
- Menú/acciones:
  - Acción alineada: `contador_imagen` → `cargador_imagen` + actualización de textos i18n asociados.
- Refactor de `public/editor.js` (mejor manejo de selección/caret y robustez en inserciones).
- Comentarios añadidos en constantes:
  - `electron/constants_main.js`
  - `public/js/constants.js`

### Fixed
- Editor: el caret ya no salta al final del documento después de pegar texto (Issue #77).

## [0.1.0] Primer release público
- Fecha: `2026-01-14`

### Added
- Primer build distribuible para usuarios finales: **Windows x64 portable `.zip`** (sin instalador) vía `electron-builder` (scripts `dist` / `dist:win`, output `build-output/`, `artifactName` versionado).
- **Apertura de enlaces endurecida** para releases:
  - URLs externas solo vía IPC `open-external-url` y **allowlist de hosts GitHub**.
  - Docs locales vía IPC `open-app-doc` y claves allowlisted consumidas como `appdoc:<key>` desde páginas info.
- **Logging “no silencios”** (main + renderer): loggers dedicados con helpers `warnOnce/errorOnce` para evitar spam y registrar fallas reales.
- **Ventana de idioma** dedicada (reemplaza el modal anterior): selector con búsqueda/filtro y navegación por teclado; manifiesto `i18n/languages.json`.
- Nuevo locale: **es-CL** (Spanish, Chile).
- Licencia redistribuible de la fuente incluida: `public/fonts/LICENSE_Baskervville_OFL.txt`.
- Ayuda contextual: botón **“?”** (`btnHelp`) entrega tips aleatorios usando el sistema de notificaciones.

### Changed
- **Seguridad del renderer**: ventanas corren con `webPreferences.sandbox: true`; acciones privilegiadas pasan a IPC explícitos (p. ej. abrir enlaces/docs, clipboard).
- **Persistencia**: el estado deja de vivir junto a la app y se mueve a `app.getPath('userData')/config` (I/O JSON más robusto, con guardrails y logging de estados missing/empty/failed).
- **Updater**: cambia backend a **GitHub Releases API** (`/releases/latest`) y comparación SemVer desde `tag_name` (requiere tags `vMAJOR.MINOR.PATCH`); política se mantiene: informar y abrir navegador (sin auto-instalar).
- **Rework de ventanas/UX**:
  - “Manual” pasa a **Editor** (nuevo renderer + preload dedicado; IPC `manual-*` → `editor-*`).
  - “Timer” pasa a **Crono** (rename a `crono` y estandarización de canales `crono-*`).
  - “Floating” pasa a **Flotante** (IPC `floating-*` → `flotante-*`).
- **Menú y acciones**: router de acciones en renderer se consolida en `menu_actions`; el infomodal deja de soportar la key `readme`.
- **i18n en renderer**: pasa a modelo base + overlay (soporte de overlay regional como `es-CL` sobre `es`) con fallback/logging consistente.
- **Presets/settings**:
  - Defaults pasan de **JS a JSON** (`defaults_presets*.json`).
  - Settings y presets se **bucketizan por idioma base** (presets/selección/disabled defaults); nuevo IPC `set-selected-preset`.
  - Sanitización/validación más estricta de presets antes de persistir y antes de emitir eventos.
- **Límites de payloads IPC**:
  - `get-app-config` expone `maxTextChars` y `maxIpcChars`.
  - `set-current-text` endurece validación (rechaza payloads demasiado grandes), aplica hard cap y sanitiza `meta`.
- Notificaciones: `notify.js` evoluciona a sistema de **toasts** (contenedor DOM + autocierre).

### Fixed
- Eliminación sistemática de fallas silenciosas (`try/catch noop`) reemplazadas por logging controlado (incluye envíos `webContents.send()` best-effort durante shutdown/races).
- Robustez de init en preset modal: `onInit(cb)` re-emite último payload si el listener se registra después del `preset-init` (evita race).
- Conteo/constantes: `applyConfig(cfg)` deja de mutar global y retorna límite efectivo; simplificación del conteo “simple” con default de idioma consolidado.
- Sandbox compatibility: lectura de clipboard movida a main vía `clipboard-read-text` (con restricción por sender y límites).

### Removed
- Feature completa **in-app README**: `public/info/readme.html` + entrypoints (menú/action key/router/i18n) asociados.
- Artefactos legacy reemplazados por el rework:
  - `public/manual.js` + `electron/manual_preload.js`
  - `public/language_modal.html`
  - defaults presets en JS
  - templates `.default` en `config/`
- Asset obsoleto: `public/assets/logo-tot.ico`.

## [0.0.930] - 2025-12-11
### Changed
- Modularización del proceso principal (Electron): `main.js` pasa a orquestación; lógica delegada a módulos (`fs_storage`, `settings`, `text_state`, `modal_state`, `presets_main`, `menu_builder`, `updater`).

## [0.0.920] - 2025-12-09
### Added
- Modularización de renderer: módulos dedicados (`constants`, `count`, `format`, `timer`, `presets`, `notify`, `i18n`) y `CONTRACTS.md`.

### Changed
- i18n unificado en modales; reducción de duplicación y fallbacks.
- Limpieza de duplicados/vestigios y mejoras de coherencia interna.

## [0.0.910] - 2025-12-07
### Added
- Arquitectura multi-lenguaje: UI principal y modales traducidos; páginas informativas cargan contenidos vía i18n con `data-i18n`.
- Carga de `numberFormat` por idioma desde i18n (con overrides de usuario cuando corresponda).

### Fixed
- Ajustes menores de coherencia i18n/UX (varios).

## [0.0.901] - 2025-12-06
### Changed
- Guía básica / Instrucciones / FAQ consolidadas en un único HTML con secciones.
- Mejoras de diseño en el infomodal (compartido con Readme y Acerca de).
- Ajustes tipográficos y refinamientos visuales menores.

## [0.0.9] - 2025-12-05
### Added
- Ventana flotante del cronómetro (VF).
- Cronómetro autoritativo en `main` con sincronización por IPC a ventana principal y VF.

### Changed
- Refactor del cronómetro (migración desde renderer a main) para mayor fiabilidad y consistencia.

## [0.0.8] - 2025-12-03
### Added
- Modo de conteo “preciso” vs “simple” (toggle en UI), con persistencia en settings.
- Conteo preciso basado en `Intl.Segmenter` (con fallbacks compatibles).

### Changed
- El conteo se recalcula automáticamente al cambiar modo; sincronización de cambios vía IPC.

## [0.0.7] - 2025-12-02
### Added
- Límite máximo de texto vigente (`MAX_TEXT_CHARS = 10_000_000`) y truncado automático para robustez.
- Mejor interoperabilidad entre ventana principal y editor (payloads con metadata y respuestas con estado de truncado).

### Changed
- Estándar de payload para “set current text” y mejoras de sincronización/UX del editor (undo/redo preservado cuando aplica).

## [0.0.6] - 2025-11-28
### Added
- Botones informativos del menú habilitados funcionalmente (Guía / Instrucciones / FAQ / Readme / Acerca de) vía un infomodal compartido.
- Acción “Presets por defecto”: apertura de carpeta de presets por defecto para edición segura por el usuario.

### Changed
- Ajustes menores de diseño.
- Actualización del preset default general (wpm y descripción).

## [0.0.5] - 2025-11-27
### Added
- Menú/barra superior de la aplicación y flujo de acciones (main → preload → router en renderer).
- Selector de idioma en primer arranque.

### Changed
- Optimización del sistema de presets (sin cambios funcionales buscados).
- Rango de WPM ajustado (50–500).
- Actualizaciones visuales (logos y consistencia).

## [0.0.4] - 2025-11-24
### Added
- Renovación de diseño en ventana principal, editor y modales (layout flexible).
- Nuevos botones/controles en UI (incluye acceso a editor de texto completo y controles adicionales en secciones principales).

### Changed
- Reorganización y estandarización visual de componentes (consistencia general).

## [0.0.3] - 2025-11-22
### Added
- Botón “Editar” con confirmación nativa.

### Changed
- Consolidación de flujos de presets (Nuevo / Borrar / Restaurar) y handlers IPC asociados.

## Before [0.0.3]
- Tempus edax rerum
