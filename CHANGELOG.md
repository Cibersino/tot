# Changelog

Este archivo resume cambios relevantes por versión.
Para el historial técnico completo, ver `docs/changelog_detailed.md`.
Antes de publicar una nueva versión, seguir `docs/release_checklist.md`.

## Esquema de versiones

- **Histórico (hasta 0.0.930, inclusive):** no SemVer estricto. Se usó `0.0.XYY` como contador incremental de builds dentro del ciclo `0.0.X`.
- **Desde 0.1.0 en adelante:** SemVer estricto `MAJOR.MINOR.PATCH` (p. ej. `0.1.0`, `0.1.1`, `0.2.0`, `1.0.0`). Se prohíbe volver a usar `0.0.XYY` como contador de builds.
- **Pre-releases (cuando aplique):** `-alpha.N`, `-beta.N`, `-rc.N` sobre una base `MAJOR.MINOR.PATCH`.

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
