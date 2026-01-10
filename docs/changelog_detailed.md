# Changelog (detallado)

Historial técnico y narrativo por versión. Incluye decisiones, notas de implementación y contexto.
Orden: versiones más recientes primero.
Antes de publicar una nueva versión, seguir `docs/release_checklist.md`.

---

## Política

### 1) Corte histórico
- Las entradas `0.0.*` (hasta e incluyendo `0.0.930`) se consideran **históricas** y se mantienen con su formato actual.
- Desde la **próxima versión publicada** se adopta **SemVer estricto** y un formato mecánico nuevo.

### 2) SemVer estricto (post-0.0.930)
- Formato obligatorio: `MAJOR.MINOR.PATCH` (tres componentes), por ejemplo `0.1.0`, `0.1.1`, `0.2.0`, `1.0.0`.
- Regla de incremento (SemVer):
  - **MAJOR**: cambios incompatibles (breaking) en contratos/UX/datos persistidos.
  - **MINOR**: nuevas capacidades **compatibles** (features) o ampliaciones de contratos sin romper.
  - **PATCH**: fixes compatibles, ajustes menores y refactors sin impacto contractual.
- Se prohíbe volver a usar el “patch como build counter” (ej. `0.0.930`, `0.0.901`, etc.) en nuevas versiones.
- Pre-releases permitidos cuando aplique: `-alpha.N`, `-beta.N`, `-rc.N` (manteniendo `MAJOR.MINOR.PATCH` base).

### 3) Formato mecánico (post-0.0.930)
Cada versión nueva debe usar este esqueleto (secciones en este orden; **omitir** las que no apliquen):

- `### Added`
- `### Changed`
- `### Fixed`
- `### Removed`
- `### Breaking changes` (obligatoria si hay bump MAJOR)
- `### Migration` (obligatoria si hay acciones requeridas por el usuario o por la persistencia)
- `### Contracts` (IPC/storage/IDs; obligatoria si se tocó algún contrato)
- `### Files` (opcional; solo si aporta trazabilidad)
- `### Known issues` (opcional)
- `### Notes` (opcional)

Reglas:
- Un bullet = una idea. Sub-bullets solo para precisar.
- Contratos deben escribirse con precisión (canal IPC, shape de payload, key de storage, filename).
- Si la versión cambia contratos o persistencia, **no basta** con “refactor”: debe quedar explícito en `### Contracts` y, si aplica, `### Migration`.

---

## [Unreleased]
(sin entradas aún)

<!--
TEMPLATE (post-0.0.930; SemVer estricto)

## [0.1.0] - YYYY-MM-DD

### Added
- ...

### Changed
- ...

### Fixed
- ...

### Removed
- ...

### Breaking changes
- ...

### Migration
- ...

### Contracts
- IPC:
  - `<channel>`: request `{ ... }` -> response `{ ... }`
- Persistencia:
  - `config/<file>.json`: keys nuevas/modificadas: `...`
- IDs/UI:
  - `menu-click` actionId: `...`

### Files
- `path/to/file.js`: ...

### Known issues
- ...

### Notes
- ...
-->

---

## [0.0.930] - 2025-12-11
### Modularización del proceso principal (Electron)

- `electron/main.js`
  - Reduce su rol a orquestar la app: creación de ventanas, wiring de IPC y construcción del menú.
  - Pasa a delegar lógica a módulos dedicados: `fs_storage`, `settings`, `text_state`, `modal_state`,
    `presets_main`, `menu_builder` y `updater`.

- `electron/fs_storage.js`
  - Extrae desde `main.js` las rutas `CONFIG_DIR` / `CONFIG_PRESETS_DIR` y las utilidades:
    `ensureConfigDir`, `ensureConfigPresetsDir`, `loadJson`, `saveJson`.

- `electron/settings.js`
  - Centraliza el manejo de `user_settings.json`: lectura inicial (`init`), normalización (`normalizeSettings`)
    y persistencia.
  - Registra IPC de configuración general: `"get-settings"`, `"set-language"`, `"set-mode-conteo"`.
  - Emite `settings-updated` a las ventanas cuando cambian los ajustes.

- `electron/text_state.js`
  - Aísla el estado compartido del texto (`currentText`) y el límite `MAX_TEXT_CHARS`.
  - Maneja carga desde `config/current_text.json` y escritura al salir.
  - Registra IPC `"get-current-text"`, `"set-current-text"`, `"force-clear-editor"`, notificando
    a la ventana principal y al editor manual.

- `electron/modal_state.js`
  - Separa persistencia de `config/modal_state.json` y restauración de tamaño/posición/maximizado del editor.
  - Expone `loadInitialState` y `attachTo` para enganchar eventos del `BrowserWindow` del editor
    (maximize/unmaximize/move/resize/close).

- `electron/presets_main.js`
  - Agrupa lógica de presets antes alojada en `main.js`: carga de presets por defecto (incluye variantes por idioma),
    actualización de `settings.presets` y uso de `settings.disabled_default_presets`.
  - Implementa handlers IPC (p. ej. `"get-default-presets"`, `"edit-preset"`, `"request-delete-preset"`,
    `"request-restore-defaults"`) y los diálogos nativos asociados.

- `electron/menu_builder.js`
  - Extrae carga de traducciones desde `i18n/<lang>/main.json` y construcción del menú nativo
    (`Menu.buildFromTemplate`).
  - Encapsula envío de `"menu-click"` a la ventana principal y obtención de textos de diálogo (`getDialogTexts`).

- `electron/updater.js`
  - Extrae sistema de actualización: lectura de `VERSION`, comparación con versión remota y apertura de URL de descarga.
  - Registra IPC `"check-for-updates"` y gestiona diálogos nativos de actualización; `main.js` solo delega a `updater.register(...)`.

---

## [0.0.920] - 2025-12-09
### Depuración y orden del código

#### Modularización de renderer
- Nuevos módulos:
  - `constants.js` — centraliza constantes.
  - `count.js` — centraliza cálculos de conteo.
  - `format.js` — centraliza formato numérico.
  - `timer.js` — centraliza cronómetro (con proceso autoritativo en main, necesario para VF).
  - `presets.js` — centraliza selector de presets y botones.
  - `notify.js` — centraliza avisos/alertas.
  - `i18n.js` — capa i18n del renderer.
- Nuevo `CONTRACTS.md`.
- Limpieza de duplicados, vestigios y fallbacks innecesarios.
- Solución de bugs y fixes menores.

#### i18n unificado
- `preset_modal.js` y `manual.js` pasan a depender de `RendererI18n` (vía `js/i18n.js` en los HTML), eliminando cargadores/cachés propios.
- Modal de presets:
  - Una sola aplicación de traducciones al recibir `preset-init`, respetando modo (new/edit) e idioma del usuario.
  - Removida la doble llamada que pisaba títulos.
- Dependencias explícitas en renderer:
  - `renderer.js` exige `RendererI18n` y `CountUtils` sin fallback, evitando duplicación de conteo.
- Limpieza de diagnóstico:
  - Eliminados logs temporales y la apertura automática de DevTools.
  - Eliminado `console.debug` de `open-preset-modal` en `electron/main.js`.
- Corrección de idioma en presets:
  - El modal lee `language` de settings al abrir, mostrando inglés/español según preferencia actual.

---

## [0.0.910] - 2025-12-07
### Internacionalización

- Implementación de arquitectura multi-lenguaje.
- UI principal y modales traducidos (renderer/main), incluyendo tooltips y alertas persistentes.
- Páginas de info (acerca_de, readme, instrucciones) cargan textos vía i18n con `data-i18n` y JSON por idioma.
- Defaults `numberFormat` por idioma cargados desde i18n; respeta overrides de usuario.
- Fixes y detalles menores.

---

## [0.0.901] - 2025-12-06
### UI / Info modal

- Unificación de Guía básica, Instrucciones completas y FAQ en un solo HTML con secciones.
- Mejoras de diseño del infomodal (compartido con Readme y Acerca de).
- Cambio de fuente de letra (Bakersvville) en preview y ventana de texto vigente.
- Ajustes de diseño en ventana principal para nueva fuente.

---

## [0.0.9] - 2025-12-05
### Ventana flotante del cronómetro + migración del cronómetro a main process

#### Resumen ejecutivo
Se implementó una ventana flotante (VF) funcional y controlable que requirió mover la autoría del cronómetro al main process.
Resultado: cronómetro fiable y sincronizado entre ventana principal y VF, con UX y recursos optimizados.

#### Resultado final (arquitectura)
- Cronómetro autoritativo en `main`; `renderer` y `flotante` operan como clientes:
  - comandos → `main`
  - `crono-state` desde `main` → clientes
- VF implementada como `BrowserWindow` minimalista: movible, always-on-top, semitransparente, con controles ▶ / ⏸ / ⏹ y sin mostrar velocidad.
- Interacción inmediata desde VF: comandos aplican en `main` y el estado se difunde a ambas vistas.
- UX replicada respecto a la versión anterior (cronómetro en renderer), pero robusta frente a throttling/background.

#### Archivos afectados
- `main.js`
  - Añadido cronómetro central (`crono`), handlers `crono-toggle`, `crono-reset`, `crono-set-elapsed`,
    broadcast (`crono-state`) y `createFloatingWindow()` actualizado (posicionamiento).
- `preload.js`
  - Exposiciones IPC nuevas: `sendCronoToggle`, `sendCronoReset`, `setCronoElapsed`, `getCronoState`,
    `onCronoState`, `openFloatingWindow`, `closeFloatingWindow`.
- `renderer.js`
  - Adaptado para espejo (`elapsed`, `running`), handler `onCronoState`, lógica `timerEditing`,
    reemplazo de botón VF por switch, WPM logic y `updatePreviewAndResults()` gatillando `resetTimer()`.
- `flotante_preload.js` / `flotante.js`
  - Listeners y envíos de comandos (`flotante-command`) a `main`; render minimalista (timer + toggle + reset).
- `index.html` / `style.css`
  - Reemplazo del botón VF por el `switch` y reutilización de estilos `.switch` / `.slider`;
    estilos de cronómetro y `timer-controls` simplificados.

#### Bugs abiertos / observaciones
- VF puede desaparecer al hacer clic sobre ella cuando hay otra aplicación en fullscreen (p. ej., slideshow/juego) — prioridad baja.
- Observación: comportamiento dependiente del SO/gestor de ventanas; por diseño se permitió que la VF ceda topmost en fullscreen (requisito inicial).
  Queda por decidir si se fuerza visibilidad (posibles conflictos UX/OS).

#### Nota técnica (decisión clave)
- Mantener timekeeping en `main` (Date.now + interval) resolvió sincronización y throttling.
- Se priorizó fiabilidad y consistencia por sobre mantener cronómetro en renderer.

---

## [0.0.8] - 2025-12-03
### Nueva funcionalidad: modo de conteo de texto (y avance multilenguaje)

#### Modo preciso vs. modo simple (UI)
- Se añadió un switch “Modo preciso” en **Resultados del conteo**.
- Activado → conteo **preciso**; desactivado → conteo **simple**.
- Cambiar el modo recalcula automáticamente el texto vigente.
- La preferencia se guarda de forma persistente en `user_settings.json`.
- La configuración se aplica al inicio de la app, garantizando coherencia.

#### Funciones de conteo
- `contarTextoSimple(texto)`
  - Basado en regex y `length`.
  - Bajo costo computacional.
  - Compatible con todos los entornos.
  - Mantiene el comportamiento histórico.
- `contarTextoPreciso(texto, language)`
  - Basado en `Intl.Segmenter`.
  - Segmentación real de grafemas y palabras.
  - Compatible con Unicode extendido (emojis, alfabetos no latinos, ligaduras).
  - Fallback si `Intl.Segmenter` no existe:
    - Grafemas con spread.
    - Palabras por `\b` / `\s+`.

Ambas retornan un objeto uniforme:
```js
{
  conEspacios: Number,
  sinEspacios: Number,
  palabras: Number
}
```

#### Soporte multilenguaje

* Variable global `idiomaActual` cargada desde `settingsCache.language`.
* Función `setIdiomaActual(nuevoIdioma)` permite cambios dinámicos de idioma.
* `Intl.Segmenter` utiliza el idioma correcto.
* La app puede cambiar idioma dinámicamente y el conteo se adapta sin reinicio.

#### Persistencia y sincronización

* `modeConteo` agregado a `user_settings.json`.
* Cambios emitidos vía IPC (`settings-updated`) para refrescar UI.
* Handlers que modifican `user_settings.json` emiten `settings-updated` automáticamente:

  * `set-language`
  * `create-preset`
  * `edit-preset`
  * `request-delete-preset`
  * `request-restore-defaults`

#### Funciones auxiliares

```js
function setModoConteo(nuevoModo) {
  if (nuevoModo === "simple" || nuevoModo === "preciso") {
    modoConteo = nuevoModo;
  }
}

function setIdiomaActual(nuevoIdioma) {
  if (typeof nuevoIdioma === "string" && nuevoIdioma.length > 0) {
    idiomaActual = nuevoIdioma;
  }
}
```

#### Resumen técnico

* Dos sistemas de conteo coexistentes.
* Modo preciso Unicode-aware.
* Persistencia y sincronización automáticas.
* Preparado para soporte multilenguaje.
* Código optimizado: evita lecturas repetidas de settings.

---

## [0.0.7] - 2025-12-02

### Robustez del texto vigente + mejoras del flujo con editor

#### Mejoras principales

* Límite de tamaño máximo del texto vigente: `MAX_TEXT_CHARS = 10_000_000`.
* Truncado automático y mejor robustez del flujo de edición entre ventana principal y modal editor.

#### Cambios en `main.js`

* Añadido `MAX_TEXT_CHARS = 10_000_000` y truncado automático al cargar `current_text.json`.
* Exposición de `MAX_TEXT_CHARS` vía `get-app-config` (IPC) como fuente de verdad para UI y modal.
* `set-current-text` ahora acepta `{ text, meta }` y devuelve `{ ok, truncated, length, text }`.

  * El truncado se registra en consola y se comunica en la respuesta.
* `manual-init-text` y `manual-text-updated` envían `{ text, meta }` para que el editor aplique actualizaciones diferenciales cuando corresponda (preservando undo/redo).
* Compatibilidad hacia atrás: `set-current-text` sigue aceptando strings.

#### Cambios en `renderer.js`

* UI principal envía `setCurrentText` con `{ text, meta }` y consume `{ ok, truncated, length, text }` para sincronizar preview y avisos.
* `btnAppendClipboardNewLine` corta el texto añadido a la capacidad restante para evitar exceder el límite.
* Mejor interoperabilidad con el editor gracias a metadata (`source`, `action`) en payloads.

#### Cambios en `manual.js`

* Introduce `showNotice` para mensajes no bloqueantes en el editor.
* Inserciones pequeñas por paste/drop usan técnicas nativas (execCommand / setRangeText) para mantener undo/redo cuando sea posible.
* Estandariza `setCurrentText` como `{ text, meta }` con metadata `source/action`.
* `applyExternalUpdate` mejorado para manejar `append_newline`, `init`, `overwrite` y `differential inserts`.
* Truncado y feedback sincronizado: paste/drop/input se truncarán localmente y se notificará al usuario; main confirma truncado vía respuesta.

---

## [0.0.6] - 2025-11-28

### Menú (habilitación funcional) + presets por defecto

#### Menú / barra superior (funcional)

* Botones informativos habilitados:

  * Guía básica, Instrucciones completas, FAQ, Readme y Acerca de.
* Todos usan un infomodal compartido que carga su HTML correspondiente.

  * Si no se encuentra el HTML, muestra aviso: “No hay contenido disponible para ...”.
* Archivos agregados: `guia_basica.html`, `instrucciones.html`, `faq.html`, `readme.html`, `acerca_de.html`.

#### Notas (CSP / contenido)

* Por el momento esos HTML contienen texto de prueba.
* Al editarlos, verificar que ningún HTML dentro de `public/info/` incluya scripts inline para cumplir CSP
  (con el setup actual no debería generar problemas, pero es una restricción a mantener).

#### Presets por defecto (carpeta editable)

* Botón “Presets por defecto” abre `config/presets_defaults` en el explorador del sistema operativo.
* El usuario puede modificar/eliminar `.json` sin romper la app.

  * Si modifica un archivo, al próximo arranque la app considera nuevos presets por defecto para operaciones normales.
  * Si elimina un archivo desde la carpeta, al próximo arranque la app restaura el archivo de instalación.

**Nota técnica**

* Se usa `shell.openPath(...)`. En entornos empaquetados (asar) funciona si la ruta está fuera del asar
  (la carpeta `config/` está fuera), por lo que no debería presentar problemas.

#### Otros

* Modificaciones menores de diseño para ajustar layout.
* El preset default general cambió su WPM de 240 a 250 y tiene nueva descripción.

---

## [0.0.5] - 2025-11-27

### Menú/barra superior (estructura) + selector de idioma + presets

#### Menú / barra superior (UI)

* Se habilitó la barra superior reemplazando la barra por defecto de Electron.
* Botones creados (visualmente), agrupados por secciones:

  * ¿Cómo usar la app? → Guía básica, Instrucciones completas, FAQ
  * Herramientas → Cargador de archivo de textos, Contador de palabras en imágenes, Test de velocidad de lectura
  * Preferencias → Idioma; Diseño (Skins, Ventana flotante, Fuentes, Colores); Shortcuts; Presets por defecto
  * Comunidad → Discord; Avisos y novedades
  * Links de interés; COLABORA ($)
  * ? → Actualizar a última versión; Readme; Acerca de

#### Menú (flujo técnico inicial)

* Se habilitó un sistema de flujo (por ahora sin funciones reales).
* Flujo: main → preload → `menu.js` → renderer (acciones).

  * `main.js`: captura clicks reales del menú y envía evento único `"menu-click"` con `actionId`.
  * `preload.js`: listener único y estable para botones del menú.
  * `public/js/menu.js`: router interno de acciones (`menuActions`).

    * Recibe `"menu-click"` desde preload.
    * Reenvía `actionId` a funciones registradas.
    * Manejo explícito para acciones no registradas (warning en consola).
  * `renderer.js`: acciones temporales (avisos WIP) para botones nuevos.
* `index.html`: se agregó `<script src="./js/menu.js"></script>` antes de `renderer.js` para garantizar registro previo del router.

#### Idioma (primer arranque)

* Nuevo selector de idioma en primer arranque.

#### Presets (optimización sin cambios funcionales buscados)

* Se eliminó la inclusión de `preset_modal.js` en `index.html`; ahora se carga solo en `preset_modal.html`.
* Lógica del modal envuelta en `DOMContentLoaded` y con chequeos de existencia de elementos para evitar errores.

#### Otros

* Calibración del rango del WMP de 100-500 a 50-500.

* Logos nuevos

  * Mejora de logo toT
  * Inserción de logo Cibersin

---

## [0.0.4] - 2025-11-24

### Renovación completa de UI + nuevos botones

* Renovación completa del diseño visual de la pantalla principal, la ventana de texto completo y los modales de presets.

  * Sustitución del layout basado en grilla por uno completamente flexible.
  * Reorganización y estandarización de elementos en todas las secciones.
  * Inclusión del nuevo logotipo.
  * Varias mejoras visuales y de consistencia.

* Incorporación de nuevos botones:

  * Selector de texto:

    * “Pegar cortapapeles nueva línea” (nueva funcionalidad).
    * “Vaciar” (equivalente al de la ventana de texto completo).
  * Resultados:

    * “?” (solo ubicación). Futuro acceso a documentación del método de cálculo y otras informaciones relevantes.
  * Cronómetro:

    * “VF” (solo ubicación). Activará ventana flotante para cronometrar sin la pantalla principal.
  * Ventana de edición de texto completo:

    * “Calcular” (nuevo cálculo manual).
    * Interruptor del cálculo automático (antes siempre activo).

* Limpieza parcial (muy parcial) del código fuente.

---

## [0.0.3] - 2025-11-22

### Presets + botón Editar

* Implementación del botón **Editar** con confirmación nativa.
* Consolidación de flujos de presets: Nuevo, Borrar, Restaurar y handlers IPC asociados.
* Funcionalidad estable y retrocompatible de editor y cronómetro.
