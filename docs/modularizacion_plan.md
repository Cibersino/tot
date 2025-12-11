# MODULARIZACIÓN DE `main.js`  
**Proyecto:** toT — Reading Meter  
**Documento maestro — versión corregida**  
**Este documento se actualiza paso por paso.**

---

# 1. Objetivo del proceso

Transformar `electron/main.js` desde un archivo monolítico grande a un **archivo coordinador** claro y mantenible, delegando responsabilidades en módulos internos bien definidos, **sin alterar ninguna funcionalidad de la app**.

Esto incluye:

- Mantener intacto el cronómetro global.
- Mantener intacta la ventana flotante.
- Conservar toda la comunicación IPC actual (nombres de canales y shape de payloads).
- Mantener los módulos ya existentes del renderer (`public/js/*.js`) sin duplicar responsabilidades.
- Dividir el código en módulos naturales sin romper la arquitectura Electron.

Cada paso debe ser probado antes de continuar.

## Criterios generales de trabajo para la modularización

Estos criterios aplican a todos los pasos del plan de modularización, y en particular a la auditoría final de `main.js` y de los módulos del proceso principal.

1. **Adherencia al plan documentado**

   - Se deben seguir los pasos definidos en `modularizacion_plan.md`.
   - Si durante la revisión se detecta que alguna parte del plan es inconsistente, quedó desactualizada respecto de la ruta real del proyecto, o existe un motivo razonable para desviarse, la desviación debe:
     - Ser explicitada en este documento.
     - Estar justificada de forma breve y concreta.

2. **Registro de dificultades y errores**

   - Toda dificultad relevante encontrada durante la revisión debe registrarse:
     - Errores detectados en código.
     - Problemas de carga/visualización de archivos.
     - Inconsistencias entre módulos, preloads y renderers.
   - Debe indicarse si la dificultad:
     - Fue resuelta en el acto.
     - Quedó pendiente, con nota de seguimiento.

3. **Confianza absoluta en los módulos**

   - Los módulos creados (`fs_storage`, `modal_state`, `text_state`, `settings`, `menu_builder`, `presets_main`, `updater`, etc.) deben considerarse la fuente de verdad de su dominio.
   - Si se encuentran duplicados de lógica en otras partes de la app (incluyendo fallbacks innecesarios fuera del módulo propietario), esos duplicados se consideran vestigios y deben eliminarse, siempre verificando que:
     - La app permanece estable.
     - La funcionalidad observable no se degrade.

4. **Eliminación de vestigios del código anterior**

   - No se deben conservar restos de código antiguo como “legacy” dentro de la base actual.
   - Todo código que haya sido reemplazado por la modularización debe ser eliminado:
     - Sin dejar funciones muertas.
     - Sin mantener bloques comentados como “versión anterior”.
   - La única “memoria” de los cambios debe quedar en:
     - Este documento (`modularizacion_plan.md`).
     - El historial de Git.

5. **Fuente de verdad: carpeta local del proyecto**

   - La revisión debe basarse exclusivamente en los archivos de la carpeta local actual del proyecto, que contienen el estado más reciente de la app.
   - Si hay problemas para abrir o visualizar un archivo (por tamaño, codificación u otra causa), esto debe:
     - Ser explicitado en el registro de avances.
     - Detallar qué archivo está afectado y qué parte no pudo revisarse.

6. **Ritmo de trabajo y revisión exhaustiva**

   - No se deben apresurar las respuestas ni las modificaciones.
   - Cada cambio debe realizarse solo después de revisar cuidadosamente:
     - El archivo afectado.
     - Sus dependencias directas (imports/require, IPC asociados, etc.).
   - Si una revisión requiere más tiempo o pasos intermedios, debe indicarse explícitamente.

7. **Criterio específico para el cronómetro y la ventana flotante**

   - La lógica del cronómetro y la coordinación con la ventana flotante forman parte explícita de las responsabilidades de `main.js`.
   - Por criterio de estabilidad:
     - El proceso del cronómetro debe permanecer en `main.js`.
     - La lógica que asegura el funcionamiento correcto de la ventana flotante **no debe** ser movida fuera de `main.js`.
   - Cualquier mejora en esta área debe respetar esta restricción y, si se toca código relacionado, se debe registrar de forma explícita en este documento.

---

# 2. Arquitectura actual del proyecto (resumen)

## 2.1 Capas de la aplicación

- **Proceso Principal (Main Process)**
  - `electron/main.js`
  - `electron/presets/*.js`
  - `electron/preload.js`, `manual_preload.js`, `preset_preload.js`, `flotante_preload.js`, `language_preload.js`
  - (futuro) `electron/settings.js`, `electron/text_state.js`, `electron/modal_state.js`, `electron/presets_main.js`, `electron/menu_builder.js`, `electron/fs_storage.js`, `electron/updater.js`

- **Renderers**
  - Ventana principal: `public/index.html` + `public/renderer.js`
  - Editor manual: `public/manual.html` + `public/manual.js`
  - Ventana flotante: `public/flotante.html` + `public/flotante.js`
  - Modal de presets: `public/preset_modal.html` + `public/preset_modal.js`
  - Modal de idioma: `public/language_modal.html` + `public/language_modal.js`

- **Utilidades renderer (`public/js`)**
  - `constants.js`, `count.js`, `format.js`, `i18n.js`, `menu.js`, `notify.js`, `presets.js`, `timer.js`

- **i18n**
  - `i18n/<lang>/main.json` (proceso principal: menús y diálogos)
  - `i18n/<lang>/renderer.json` (renderers)
  - `i18n/<lang>/numberFormat.json` (formato numérico)

- **Datos persistentes (`config/`)**
  - `user_settings.json`
  - `current_text.json`
  - `modal_state.json`
  - `presets_defaults/*.json` (copiados desde `electron/presets/*.js`)

---

# 3. Qué YA existe y no se debe duplicar

## 3.1 Renderer (`public/js/*.js`)

- `constants.js` → `window.AppConstants`
- `count.js` → conteo de texto (`CountUtils`)
- `format.js` → formato numérico (`FormatUtils`)
- `i18n.js` → traducciones renderer (`RendererI18n`)
- `menu.js` → router de menú (`window.menuActions`)
- `notify.js` → sistema de notificaciones (`window.Notify`)
- `presets.js` → gestión de presets en el renderer (`RendererPresets`)
- `timer.js` → lógica del cronómetro en renderer (`RendererTimer`)

No se crea ningún módulo nuevo que repita lógica ya implementada aquí.

## 3.2 Preloads

- `electron/preload.js` → `window.electronAPI` (ventana principal)
- `electron/manual_preload.js` → `window.manualAPI`
- `electron/flotante_preload.js` → `window.flotanteAPI`
- `electron/preset_preload.js` → `window.presetAPI`
- `electron/language_preload.js` → `window.languageAPI`

Su API pública no se modifica (nombres de métodos y canales IPC se conservan).

## 3.3 Presets por defecto

- `electron/presets/defaults_presets*.js`  
  Son la fuente de verdad de los presets por defecto.  
  No se mueven ni se duplican.

---

# 4. Responsabilidades actuales de `main.js` a modularizar

`main.js` mezcla actualmente las siguientes responsabilidades:

1. Gestión de estado del editor manual (`modal_state.json`).
2. Gestión del texto actual (`current_text.json` + broadcasts a renderer y editor).
3. Gestión de settings del usuario (`user_settings.json`, idioma, modo conteo, formato numérico).
4. Construcción del menú nativo (i18n main).
5. Sistema de presets (defaults + usuario, confirmaciones, diálogos nativos).
6. Sistema de actualizaciones remotas (versiones, diálogos, fetch).
7. Acceso genérico a FS: `loadJson`, `saveJson`, `ensureConfigDir`, etc.
8. Creación de ventanas y ciclo de vida de la app.
9. Cronómetro global y coordinación con ventana flotante.

Los puntos 8 y 9 **NO** se moverán de `main.js`.  
Los demás se modularizan.

---

# 5. Módulos destino y responsabilidades (versión corregida)

## MÓDULO 1 — `fs_storage.js`

### Rol

Centralizar utilidades de acceso a disco usadas por `main.js` y otros módulos internos del proceso principal.

### Bloques a extraer de `main.js`

1. `loadJson(filePath, defaultValue)`
2. `saveJson(filePath, data)`
3. `ensureConfigDir()` (crear `config/` si no existe)
4. `ensureConfigPresetsDir()` (crear `config/presets_defaults/` si no existe)

> Nota: la lógica de copiar presets por defecto desde `electron/presets/*.js` hacia `config/presets_defaults/*.json` se mantiene en `presets_main.js`, pero usando estos helpers de FS.

### En `main.js` quedará solo:

```js
const { loadJson, saveJson, ensureConfigDir, ensureConfigPresetsDir } = require("./fs_storage");
````

---

## MÓDULO 2 — `modal_state.js`

### Rol

Gestionar el estado persistente del editor manual (`modal_state.json`) y encapsular la lógica de:

* Maximizado / reducido.
* Recuerdo de posición y tamaño en modo reducido.
* Fallback en caso de no existir estado previo.

### Bloques a extraer de `main.js`

1. Lectura inicial del archivo `modal_state.json`:

   ```js
   const state = loadJson(MODAL_STATE_FILE, { maximized: true, reduced: null });
   ```

2. Función `saveReducedState` y funciones auxiliares asociadas.

3. Lógica de actualización de `maximized`/`reduced`:

   * En los listeners de la ventana del editor:

     * `"resize"` → guarda estado reducido si no está maximizada.
     * `"move"` → idem.
     * `"maximize"` → marca `maximized: true`.
     * `"unmaximize"` → restaura `reduced` o aplica fallback (mitad de pantalla pegada arriba a la derecha).
     * `"close"` → persiste `maximized`.

### API interna sugerida

```js
// modal_state.js
function loadInitialState(loadJson) { ... }   // devuelve { maximized, reduced }
function attachTo(editorWin, loadJson, saveJson) { ... }

module.exports = { loadInitialState, attachTo };
```

### Lo que queda en `main.js`

* Creación de la ventana editor (`new BrowserWindow(...)`).
* Uso de:

  ```js
  const editorState = modalState.loadInitialState(loadJson);

  // aplicar editorState al crear la ventana

  modalState.attachTo(editorWin, loadJson, saveJson);
  ```

---

## MÓDULO 3 — `text_state.js`

### Rol

Centralizar el estado del texto compartido (`current_text`) en el proceso principal:

* Carga inicial desde `current_text.json`.
* Truncado inicial a `MAX_TEXT_CHARS`.
* Persistencia en disco.
* IPC `get-current-text` / `set-current-text`.
* `force-clear-editor`.
* Broadcast de cambios a renderer (`manual-text-updated`).

### Bloques a extraer de `main.js`

1. Lectura inicial:

   ```js
   currentText = loadJson(CURRENT_TEXT_FILE, "");
   // + truncado inicial + guardado si hubo cambios
   ```

2. Lógica de truncado (por `MAX_TEXT_CHARS`), incluyendo guardado inmediato si se modifica.

3. Handlers IPC:

   ```js
   ipcMain.handle("get-current-text", ...)
   ipcMain.handle("set-current-text", ...)
   ipcMain.on("force-clear-editor", ...)
   ```

4. Persistencia al cerrar:

   ```js
   app.on("before-quit", () => { ... persist text ... });
   ```

5. Broadcast de cambios al renderer:

   * Envío de `"manual-text-updated"` cuando el texto cambia desde editor/manual o renderer.

### Punto importante corregido

El envío de `"manual-init-text"` al editor manual **NO** se mueve a `text_state.js`, porque:

* Está acoplado a la secuencia de creación y `ready-to-show` de `editorWin`.
* Depende de la existencia de la ventana y del canal IPC correspondiente.

Por lo tanto:

* `text_state.js` expone una función para leer el texto actual (`getCurrentText()`).
* `main.js` usa esa función dentro de `createEditorWindow()` para enviar:

  ```js
  editorWin.webContents.send("manual-init-text", { text, meta });
  ```

### API interna sugerida

```js
// text_state.js
function init(loadJson, saveJson, app /* u objeto para subscribir before-quit */) { ... }
function registerIpc(ipcMain, windowsRef) { ... } // para manual-text-updated, force-clear, etc.
function getCurrentText() { ... }

module.exports = { init, registerIpc, getCurrentText };
```

---

## MÓDULO 4 — `settings.js`

### Rol

Gestionar la configuración del usuario (`user_settings.json`), incluyendo:

* `language` (idioma actual).
* `modeConteo` (modo de conteo).
* Otros campos de configuración general (incluidos `presets`, pero **sin** implementar la lógica de manipulación de estos; la lógica de presets va en `presets_main.js`).

### Bloques a extraer de `main.js`

1. Normalización de settings:

   ```js
   function normalizeSettings(s) { ... }
   ```

2. Carga inicial de `user_settings.json`:

   ```js
   let settings = loadJson(SETTINGS_FILE, { ... });
   settings = normalizeSettings(settings);
   ```

3. Handlers IPC relacionados con configuración general:

   ```js
   ipcMain.handle("get-settings", ...)
   ipcMain.handle("set-language", ...)
   ipcMain.handle("set-mode-conteo", ...)
   ```

4. Broadcast de cambios de settings a las ventanas:

   ```js
   mainWin.webContents.send("settings-updated", settings);
   editorWin?.webContents.send("settings-updated", settings);
   presetWin?.webContents.send("settings-updated", settings);
   floatingWin?.webContents.send("settings-updated", settings);
   ```

5. Carga de `i18n/<lang>/numberFormat.json` y cualquier cacheo asociado (para formato numérico en renderer).

### Matiz importante

* `settings.js` sigue cargando y guardando el objeto completo de settings (incluyendo el arreglo `presets`).
* **Pero** no modifica ni decide la lógica de creación/edición/borrado de presets; eso lo hace `presets_main.js`, que utiliza `settings.js` como fuente de settings.

---

## MÓDULO 5 — `menu_builder.js`

### Rol

Construir el menú nativo de la aplicación, localizado según `i18n/<lang>/main.json`, y enviar `menu-click` al renderer.

### Bloques a extraer de `main.js`

1. Carga de traducciones de main:

   ```js
   function loadMainTranslations(lang) { ... }
   function getDialogTexts(lang) { ... }
   ```

2. Construcción del menú:

   ```js
   function buildAppMenu(lang) {
     const template = [ ... ];
     const menu = Menu.buildFromTemplate(template);
     Menu.setApplicationMenu(menu);
   }
   ```

3. Envío de `menu-click` desde los items del menú:

   ```js
   click(_, browserWindow) {
     browserWindow.webContents.send("menu-click", "action-id");
   }
   ```

### En `main.js` quedará:

```js
const menuBuilder = require("./menu_builder");
// ...
menuBuilder.buildAppMenu(currentLanguage, mainWin /* si lo necesita */);
```

---

## MÓDULO 6 — `presets_main.js`

### Rol

Gestionar toda la lógica de presets en el proceso principal:

* Carga combinada de presets por defecto (general + por idioma).
* Integración con `electron/presets/*.js` y `config/presets_defaults/*.json`.
* Manipulación de `settings.presets` (crear, editar, borrar).
* Diálogos nativos (`dialog.showMessageBox`) para confirmaciones.
* Restauración de presets por defecto.
* IPC relacionados con presets.

### Bloques a extraer de `main.js`

1. Función para cargar presets por defecto combinados:

   ```js
   function loadDefaultPresetsCombined(lang) { ... }
   ```

2. Lógica de copia inicial de presets desde `/electron/presets/*.js` hacia `/config/presets_defaults/*.json` (usando helpers de `fs_storage.js`).

3. Handlers IPC:

   ```js
   ipcMain.handle("create-preset", ...)
   ipcMain.handle("edit-preset", ...)
   ipcMain.handle("request-delete-preset", ...)
   ipcMain.handle("request-restore-defaults", ...)
   ipcMain.handle("get-default-presets", ...)
   ipcMain.handle("open-default-presets-folder", ...)
   ```

4. Emisión de eventos hacia ventanas:

   ```js
   mainWin.webContents.send("preset-created", { name });
   editorWin?.webContents.send("preset-updated", { ... });
   presetWin?.webContents.send("preset-updated", { ... });
   ```

### En `main.js` quedará:

* Creación de la ventana de presets (`presetWin`).
* Registro global:

  ```js
  const presetsMain = require("./presets_main");
  presetsMain.register(ipcMain, {
    mainWinRef: () => mainWin,
    editorWinRef: () => editorWin,
    presetWinRef: () => presetWin,
    loadJson,
    saveJson,
    ensureConfigPresetsDir,
    SETTINGS_FILE,
    CONFIG_PRESETS_DIR
  });
  ```

---

## MÓDULO 7 — `updater.js` (ya existe, ahora con lógica real)

### Rol

Gestionar el sistema de actualizaciones:

* Comparar versiones.
* Consultar versión remota.
* Mostrar diálogos de actualización.

### Bloques a extraer de `main.js`

1. `compareVersions(local, remote)`
2. `fetchRemoteVersion()` (y cualquier lógica HTTP asociada).
3. `checkForUpdates()` y variantes.
4. Handler IPC opcional:

   ```js
   ipcMain.handle("check-for-updates", ...)
   ```

### En `main.js` quedará solo:

```js
const updater = require("./updater");
updater.register(ipcMain, { mainWinRef: () => mainWin });
```

---

# 6. Resumen final de extracción (versión corregida)

| Módulo            | Bloques que se mueven                                               | Riesgo   |
| ----------------- | ------------------------------------------------------------------- | -------- |
| `fs_storage.js`   | `loadJson`, `saveJson`, `ensureConfigDir`, `ensureConfigPresetsDir` | Cero     |
| `modal_state.js`  | Estado persistente del editor manual                                | Muy bajo |
| `text_state.js`   | `current_text` + IPC + truncado + persistencia + broadcast          | Bajo     |
| `settings.js`     | `user_settings` (sin lógica de presets) + IPC + idioma/modo/format  | Bajo     |
| `menu_builder.js` | Menú nativo + i18n main + emisión de `menu-click`                   | Muy bajo |
| `presets_main.js` | TODA la lógica de presets en main (defaults + usuario + diálogos)   | Medio    |
| `updater.js`      | Lógica de actualización remota                                      | Muy bajo |

---

# 7. Bloques que deben mantenerse en `main.js` (no se mueven)

1. **Cronómetro completo** (estado maestro, IPC de cronómetro).
2. **Ventana flotante** (creación, vida, coordinación con cronómetro).
3. **Ventana principal** (creación y ciclo de vida).
4. **Apertura/cierre de ventanas** (editor, presets, idioma, flotante).
5. **`app.whenReady` y ciclo de vida global de la app.**
6. Envío de `"manual-init-text"` al editor manual en `createEditorWindow()` (porque depende del `ready-to-show` del `BrowserWindow`).

Estos forman la base esencial que no se traslada fuera de `main.js`.

---

# 8. Registro de pruebas por paso

Formato a usar en este documento después de cada paso de refactor:

```markdown

## Paso 1 — fs_storage.js

### Resultado esperado
Extraer utilidades de FS (loadJson, saveJson, ensureConfigDir, ensureConfigPresetsDir) a un módulo dedicado, sin cambiar el comportamiento observable de la app.

### Resultado obtenido
- fs_storage.js creado en electron/.
- main.js ahora importa CONFIG_DIR, CONFIG_PRESETS_DIR y las funciones desde fs_storage.
- Las funciones duplicadas fueron eliminadas de main.js.
- La app arranca correctamente y persiste/lee config como antes.

### Errores detectados
Ninguno.

### Estado
☑ Completado

## Paso 2 — modal_state.js

### Resultado esperado
Extraer toda la lógica relacionada con el estado persistente del editor manual (`modal_state.json`) desde `main.js` hacia un módulo dedicado (`modal_state.js`), incluyendo:
- Lectura inicial del estado (`maximized` y `reduced`).
- Normalización defensiva de dicho estado.
- Persistencia automática de tamaño/posición cuando la ventana está reducida.
- Registro de cambios de maximización y restauración de modo reducido.
- Aplicación de un fallback coherente cuando no existe estado previo o es inválido.
- Mantener *idéntico* el comportamiento observable de la ventana del editor en todas las situaciones: primera apertura, maximizar, reducir, cerrar maximizado, cerrar reducido, cerrar app.

El comportamiento no debe alterarse respecto al `main.backup.js` excepto para corregir el antiguo bug de “abrir reducido con tamaño gigante si se cerró maximizado sin estado previo”.

### Resultado obtenido
- Nuevo archivo `electron/modal_state.js` creado, con:
  - `loadInitialState(loadJson)` para obtener y normalizar el estado persistido.
  - `attachTo(editorWin, loadJson, saveJson)` para manejar todos los eventos relevantes:
    - `resize` / `move` → guarda `reduced`.
    - `maximize` → marca `maximized: true`.
    - `unmaximize` → restaura `reduced` si existe, o aplica fallback (mitad de la pantalla, esquina superior derecha).
    - `close` → persiste `maximized`.
  - Función defensiva `normalizeState` y validación robusta de `reduced`.

- `main.js`:
  - Ahora importa `modalState` desde `./modal_state`.
  - Lectura inicial del estado mediante `modalState.loadInitialState(loadJson)`.
  - Toda la lógica previa de maximizado/reducido fue eliminada sin dejar vestigios.
  - Se integró `modalState.attachTo(editorWin, loadJson, saveJson)` en la nueva `createEditorWindow`.
  - Se restauró correctamente el evento `manual-editor-ready` hacia `mainWin`, corrigiendo el bug del spinner de carga.
  - Se restauró el payload previo de `manual-init-text` con `{ text, meta: { source: "main", action: "init" } }`.

### Pruebas realizadas
- Primera apertura sin `modal_state.json`: editor abre maximizado; al reducir aplica fallback correcto.
- Mover y redimensionar el editor en modo reducido y luego maximizar → al volver a reducir recupera exactamente tamaño y posición.
- Cerrar el editor en modo reducido → reabrir mantiene dimensiones y ubicación.
- Cerrar el editor maximizado → reabrir maximizado; al reducir recupera última posición/tamaño reducidos.
- Cerrar la app completa con editor maximizado → reabrir conserva maximizado; al reducir recupera reducido previo.
- Archivo `modal_state.json` corrupto → no rompe la app; fallback siempre operativo.
- Spinner del botón “Editor manual” vuelve a desactivarse correctamente al recibir `manual-editor-ready`.

### Errores detectados
Ninguno.  
(Se detectó un bug previo no relacionado con la modularización —el spinner— y fue corregido restaurando el contrato IPC original.)

### Estado
☑ Completado

## Paso 3 — text_state.js

### Resultado esperado
Centralizar en un módulo dedicado (`text_state.js`) toda la gestión del texto compartido (`current_text`) en el proceso principal, incluyendo:

- Carga inicial desde `current_text.json` y normalización del formato.
- Truncado inicial por `MAX_TEXT_CHARS` y persistencia del texto truncado.
- Persistencia del texto en disco al cerrar la aplicación (`before-quit`), asegurando también la existencia mínima de `user_settings.json`.
- Exposición de un API interno `getCurrentText()` para ser usado por `main.js` (por ejemplo, al inicializar el editor manual).
- Registro y manejo de los IPC:
  - `"get-current-text"`
  - `"set-current-text"`
  - `"force-clear-editor"`
- Broadcast de los cambios de texto hacia:
  - la ventana principal (`current-text-updated`) y
  - el editor manual (`manual-text-updated`, `manual-force-clear`),
manteniendo el comportamiento observable previo.

### Resultado obtenido
- Nuevo archivo `electron/text_state.js` creado, con:
  - `init({ loadJson, saveJson, currentTextFile, settingsFile, app, maxTextChars })`:
    - Carga y normaliza `current_text.json`.
    - Aplica truncado inicial por `MAX_TEXT_CHARS` cuando corresponde, persistiendo el resultado.
    - Registra un listener `before-quit` para persistir el texto y asegurar la existencia de `user_settings.json`.
  - `registerIpc(ipcMain, () => ({ mainWin, editorWin }))`:
    - Registra `get-current-text`, devolviendo siempre `currentText` como string.
    - Registra `set-current-text`, aceptando tanto payloads `{ text, meta }` como strings simples:
      - Aplica truncado por `MAX_TEXT_CHARS` con aviso en consola.
      - Actualiza el estado interno `currentText`.
      - Emite `current-text-updated` hacia la ventana principal.
      - Emite `manual-text-updated` hacia el editor manual con `{ text, meta }`, respetando el contrato de `meta` (`source`, `action`).
      - Devuelve `{ ok, truncated, length, text }` al invocador.
    - Registra `force-clear-editor`, que:
      - Vacía el estado interno `currentText`.
      - Emite `current-text-updated` a la ventana principal.
      - Emite `manual-force-clear` al editor manual para que ejecute su lógica local de limpieza.
  - `getCurrentText()`, que devuelve el texto actual (`currentText`) para ser usado por `main.js` al inicializar el editor manual.

- `electron/main.js`:
  - Importa y utiliza `text_state.js`:
    - Llama a `textState.init(...)` después de definir `MAX_TEXT_CHARS` y tras asegurar `CONFIG_DIR`.
    - Llama a `textState.registerIpc(ipcMain, () => ({ mainWin, editorWin }))` para registrar los IPC de texto.
  - Elimina por completo:
    - La variable global `currentText`.
    - La carga manual de `current_text.json` y su truncado inicial.
    - La función `persistCurrentTextOnQuit` y su registro en `app.on("before-quit", ...)`.
    - Los handlers IPC locales:
      - `"get-current-text"`
      - `"set-current-text"`
      - `"force-clear-editor"`
  - Sustituye el uso de `currentText` por `textState.getCurrentText()` en:
    - `createEditorWindow()` → envío de `manual-init-text` al editor manual con `{ text, meta }`.
    - El handler de `open-editor` cuando la ventana del editor ya existe.
  - Mantiene intacta la lógica de:
    - `manual-init-text` (forma del payload, secuencia de envío).
    - `manual-editor-ready` a la ventana principal.
    - Integración con `modal_state.js` para maximizado/reducido del editor.

- Pruebas funcionales:
  - La app inicia sin errores en consola (main ni renderer).
  - La carga inicial de `current_text.json` funciona:
    - Con texto corto, la ventana principal y el editor manual muestran el mismo contenido.
    - Con texto mayor a `MAX_TEXT_CHARS`, se trunca, se persiste y no se producen fallos.
  - `set-current-text`:
    - Desde la ventana principal:
      - Actualiza correctamente preview y resultados.
      - Actualiza el editor manual.
      - Muestra advertencias de truncado cuando corresponde.
    - Desde el editor manual:
      - Actualiza correctamente el preview y los resultados en la ventana principal.
      - Mantiene el comportamiento esperado en el propio editor (sin bucles de eco gracias a `meta`).
  - `force-clear-editor`:
    - Al vaciar desde la ventana principal:
      - Se limpia el texto en la ventana principal (preview/resultados).
      - Se limpia el editor manual.
      - El estado persiste vacío al reiniciar la app solo cuando se cierra la aplicación (persistencia en `before-quit`).
  - Persistencia:
    - Cambios de texto (origen ventana principal o editor) se mantienen al cerrar y reabrir la app.

### Errores detectados
- Error de orden de inicialización: se intentó pasar `MAX_TEXT_CHARS` a `textState.init` antes de declarar la constante, provocando `ReferenceError: Cannot access 'MAX_TEXT_CHARS' before initialization`.  
  - Solución: mover la declaración de `MAX_TEXT_CHARS` antes de la llamada a `textState.init(...)`.
- Omisión inicial del broadcast `current-text-updated` hacia la ventana principal en el handler `set-current-text`, lo que impedía que los cambios iniciados desde el editor manual se reflejaran en el preview y resultados de la ventana principal.  
  - Solución: restaurar el envío de `current-text-updated` a `mainWin` dentro de `text_state.js`.
- Diferencia respecto al comportamiento original en `force-clear-editor`, donde inicialmente solo se notificaba al editor manual.  
  - Solución: reintroducir también el envío de `current-text-updated` a `mainWin` en `force-clear-editor`, alineando el comportamiento con el `main.js` estable previo.

Todos estos errores fueron corregidos y las pruebas posteriores confirman que el comportamiento actual es consistente con la versión estable previa, con la lógica de estado de texto centralizada en `text_state.js`.

### Estado
☑ Completado

## Paso 4 — settings.js

### Resultado esperado
Centralizar la gestión de la configuración de usuario (`user_settings.json`) en un módulo dedicado (`settings.js`), incluyendo:

- Carga inicial y normalización de settings (idioma, presets, modeConteo, numberFormatting).
- Persistencia de settings normalizados en disco.
- Exposición de un API interno para obtener y guardar settings.
- Registro y manejo de los IPC generales de configuración:
  - `"get-settings"`
  - `"set-language"`
  - `"set-mode-conteo"`
- Broadcast coherente de cambios de settings a todas las ventanas (`settings-updated`).
- Carga de `i18n/<lang>/numberFormat.json` y manejo de sus defaults (formato numérico).

### Resultado obtenido
- Nuevo archivo `electron/settings.js` creado, con:
  - `init({ loadJson, saveJson, settingsFile })`:
    - Carga `user_settings.json` con defaults mínimos.
    - Normaliza el objeto settings (language, presets, modeConteo, numberFormatting).
    - Persiste inmediatamente el settings normalizado.
    - Cachea el último settings normalizado.
  - `getSettings()`:
    - Devuelve siempre la versión actual de settings leyendo desde disco y normalizando, para reflejar cambios realizados fuera del propio módulo.
  - `saveSettings(nextSettings)`:
    - Normaliza y persiste settings.
    - Actualiza el cache interno.
  - `normalizeSettings(settings)`:
    - Asegura:
      - `language` string.
      - `presets` como arreglo.
      - `modeConteo` en `{ "preciso", "simple" }` (fallback `"preciso"`).
      - `numberFormatting[lang]` con valores por defecto extraídos de `i18n/<lang>/numberFormat.json` o, en su defecto, con fallback estándar por idioma.
  - `loadNumberFormatDefaults(lang)`:
    - Lee `i18n/<lang>/numberFormat.json` (con limpieza explícita de BOM UTF-8) y extrae separadores de miles y decimal.
  - `broadcastSettingsUpdated(settings, windows)`:
    - Envía `"settings-updated"` a `mainWin`, `editorWin`, `presetWin` y `floatingWin` cuando están presentes.
  - `registerIpc(ipcMain, { getWindows, buildAppMenu, getCurrentLanguage, setCurrentLanguage })`:
    - Registra:
      - `"get-settings"` → retorna settings normalizado.
      - `"set-language"` → actualiza `language`, asegura `numberFormatting[lang]`, guarda settings, actualiza `currentLanguage`, reconstruye menús (`buildAppMenu(lang)`) y envía `"settings-updated"` a todas las ventanas.
      - `"set-mode-conteo"` → actualiza `modeConteo` (`simple`/`preciso`), guarda settings y envía `"settings-updated"`.
  - `applyFallbackLanguageIfUnset(fallbackLang = "es")`:
    - Si `settings.language` está vacío, fuerza el idioma de fallback (`"es"`), asegurando `numberFormatting["es"]` y persistiendo el resultado.

- `electron/main.js`:
  - Importa `settingsState` desde `./settings`.
  - En `app.whenReady().then(...)`:
    - Reemplaza la carga manual de `user_settings.json` por `settingsState.init(...)`.
    - Utiliza el `language` normalizado para inicializar `currentLanguage`.
    - Mantiene la misma lógica de flujo:
      - Si `settings.language` está vacío → abre modal de idioma.
      - Si está definido → crea directamente la ventana principal.
  - En `createLanguageWindow()`:
    - Reemplaza la lógica in situ de fallback de idioma por `settingsState.applyFallbackLanguageIfUnset("es")` en el evento `langWin.on("closed", ...)`.
  - Registra los IPC de settings mediante:
    - `settingsState.registerIpc(ipcMain, { getWindows: () => ({ mainWin, editorWin, presetWin, langWin, floatingWin }), buildAppMenu, getCurrentLanguage: () => currentLanguage, setCurrentLanguage: (lang) => { currentLanguage = trimmed; } })`.
  - Elimina de `main.js`:
    - La antigua función `normalizeSettings`.
    - Los handlers IPC:
      - `"get-settings"`
      - `"set-language"`
      - `"set-mode-conteo"`
  - Ajusta todos los usos restantes de `normalizeSettings` (principalmente en la lógica de presets) para que utilicen `settingsState.normalizeSettings(...)` sin duplicación de código.

- Comportamiento verificado:
  - Arranque limpio sin carpeta `config/`:
    - Se crean correctamente los archivos en `config/` (incluidos presets por defecto).
    - Aparece el modal de selección de idioma.
    - Al elegir idioma, se crea la ventana principal con ajustes coherentes.
  - Carga de `numberFormat.json`:
    - El BOM UTF-8 ya no provoca `SyntaxError`; `loadNumberFormatDefaults` limpia el BOM antes de `JSON.parse`.
    - El formato numérico se ajusta correctamente por idioma.
  - `get-settings`:
    - Refleja siempre el contenido actual de `user_settings.json` (incluyendo cambios realizados por la lógica de presets).
  - Cambios de idioma (`set-language`):
    - Actualizan `user_settings.json`.
    - Reconstruyen el menú de la app.
    - Actualizan la visibilidad/menú de las ventanas secundarias (editor, presets, language modal).
    - Envían `"settings-updated"` a todas las ventanas relevantes.
  - Cambios de `modeConteo` (`set-mode-conteo`):
    - Persisten en settings y se propagan correctamente a las ventanas.

### Errores detectados
- `numberFormat.json` con BOM UTF-8:
  - Problema: `JSON.parse` fallaba con `SyntaxError: Unexpected token '∩╗┐'` al parsear `i18n/es/numberFormat.json`.
  - Causa: presencia de BOM (`\uFEFF`) al inicio del archivo, no manejada.
  - Solución: en `loadNumberFormatDefaults`, se elimina explícitamente el BOM de la cadena leída antes de llamar a `JSON.parse`.
- Caché interno de settings desincronizado con cambios de presets:
  - Problema: tras modularizar, `getSettings()` devolvía `_currentSettings` cacheado en memoria, mientras los handlers de presets seguían usando `loadJson`/`saveJson` directos sobre `user_settings.json`. Al crear/editar presets, el archivo se actualizaba, pero `get-settings` (vía IPC) seguía entregando la versión antigua, por lo que el selector no reflejaba los cambios.
  - Solución: `getSettings()` fue ajustado para recargar siempre desde disco (`_loadJson`) y normalizar en cada llamada, actualizando el cache interno. De este modo, cualquier cambio efectuado por la lógica de presets queda inmediatamente visible al llamar `get-settings`.

### Notas para pasos siguientes
- La lógica de presets sigue residiendo mayoritariamente en `main.js` y utiliza:
  - `loadJson` / `saveJson` directos sobre `SETTINGS_FILE`, combinados con `settingsState.normalizeSettings(...)`.
- En el futuro **Paso 6 — presets_main.js** se recomienda:
  - Centralizar toda la manipulación de `presets` en un módulo específico.
  - Unificar el flujo de:
    - `create-preset`
    - `edit-preset`
    - `delete-preset`
    - `restore-defaults`
  - Para que:
    - Usen consistentemente `settingsState.getSettings()` / `settingsState.saveSettings()`.
    - Reutilicen `broadcastSettingsUpdated(...)` o un broadcast específico para presets, evitando divergencias entre “broadcast directo” y “refresco vía get-settings”.
- El diseño actual es estable y funcional, pero estructuralmente heterogéneo: los presets funcionan bien, aunque no todos los caminos pasan aún por `settings.js`. Esto se deja explícito para ser abordado en el módulo de presets.

### Estado
☑ Completado

## Paso 5 — menu_builder.js

### Resultado esperado
Extraer desde `electron/main.js` toda la lógica de:
- Carga de traducciones del menú desde `i18n/<lang>/main.json`.
- Construcción del menú nativo (`Menu.buildFromTemplate`).
- Emisión del evento `menu-click` hacia el renderer.
- Centralizar en un módulo independiente la regeneración del menú cuando cambia el idioma.

El comportamiento observable debía mantenerse idéntico:
- Menú superior completamente localizado.
- Envío correcto de `menu-click` a `public/js/menu.js`.
- Rebuild del menú al cambiar de idioma mediante `set-language`.

### Resultado obtenido
- Nuevo archivo **`electron/menu_builder.js`** creado, con:
  - `loadMainTranslations(lang)` — carga robusta con eliminación de BOM y manejo defensivo de JSON.
  - `getDialogTexts(lang)` — exposición para diálogos de actualización usados en `main.js`.
  - `buildAppMenu(lang, opts)` — función principal que construye el menú completo y emite `menu-click`.
    - `opts.mainWindow` → destino de los eventos.
    - `opts.onOpenLanguage` → callback limpio para abrir la ventana de idioma (remueve el acoplamiento previo).

- `electron/main.js`:
  - Eliminados todos los bloques de construcción manual del menú.
  - Reemplazado por:

    ```js
    const menuBuilder = require("./menu_builder");
    buildAppMenu(currentLanguage);
    ```

  - Llamada automática a `buildAppMenu()` desde:
    - `createMainWindow()`
    - `settingsState.registerIpc()` cuando se ejecuta `set-language`.

- Corrección aplicada posteriormente:
  - El menú **sí se reconstruía**, pero las cadenas estaban mezcladas porque `main.js` tenía un *fallback incorrecto* al usar claves vacías de `main.json`.
  - Se aplicó un parche directo en `menu_builder.js`, colocando **fallbacks explícitos solo cuando corresponde** y eliminando la mezcla ES/EN.
  - Tras el parche, el menú:
    - Se muestra 100% localizado.
    - Se actualiza inmediatamente al cambiar idioma.
    - Mantiene intactos todos los payloads enviados al router `menu.js` del renderer.

### Pruebas realizadas
- Cambio dinámico de idioma desde el menú → el menú se reconstruye correctamente.
- Creación de la ventana principal → se carga el menú en el idioma persistido.
- Verificación de todos los ítems, submenús y payloads enviados a `menuActions`.
- Verificado que el menú no aparece en ventanas secundarias (editor / preset / idioma).
- Verificado que la modularización **no afecta los atajos de desarrollo** ni las rutas a preload.

### Errores detectados
- Se detectó mezcla de idiomas en el menú inicial:
  - Causa: lectura parcial del `main.json` o fallback a strings en inglés no deseadas.
  - Solución: sanitización y fallback explícito corregidos en `menu_builder.js`.

### Estado
☑ Completado

## Paso 6 — presets_main.js

### Resultado esperado
Extraer completamente desde `electron/main.js` toda la lógica de presets, centralizándola en un módulo dedicado encargado de:

- Cargar presets por defecto (generales + por idioma).
- Copiar presets por defecto desde `/electron/presets/*.js` hacia `/config/presets_defaults/*.json`.
- Gestionar `settings.presets` y `settings.disabled_default_presets`.
- Implementar y unificar los IPC de presets:
  - `create-preset`
  - `edit-preset`
  - `request-delete-preset`
  - `request-restore-defaults`
  - `get-default-presets`
  - `open-default-presets-folder`
  - `notify-no-selection-edit`
- Emitir eventos coherentes hacia las ventanas renderer (`preset-created`, `preset-deleted`, `preset-restored`).
- Reutilizar `settingsState.getSettings()`, `settingsState.saveSettings()` y `broadcastSettingsUpdated()` en vez de accesos directos a archivos JSON.
- Mantener el comportamiento observable idéntico al de la app estable previa.

### Resultado obtenido
- Se creó el módulo **`electron/presets_main.js`**, que ahora contiene:
  - `loadDefaultPresetsCombined(lang)` con sanitización robusta del código de idioma.
  - Copia inicial JS → JSON automática de presets (`copyDefaultPresetsIfMissing()`).
  - Implementación completa de todos los IPC de presets.
  - Integración directa con `settingsState` para lectura/escritura y normalización.
  - Broadcast centralizado de settings luego de cada modificación.
  - Uso de `menuBuilder.getDialogTexts()` para todos los diálogos nativos de presets.

- `electron/main.js` fue limpiado de:
  - `sanitizeLangCode`, `loadPresetArray`, `loadDefaultPresetsCombined`.
  - Bloque completo de copia JS → JSON de presets.
  - Todos los handlers IPC relacionados con presets.
  - Cualquier manipulación directa de `settings.presets`.

- `electron/main.js` conserva únicamente:
  - Creación de la ventana de presets (`createPresetWindow`).
  - El IPC `open-preset-modal`, coherente con la responsabilidad de manejar ventanas.

- El módulo `settings.js` fue actualizado para exportar `broadcastSettingsUpdated`, permitiendo que presets y otros módulos envíen actualizaciones coherentes a todos los renderer sin duplicación de código.

- **La app funciona exactamente igual que antes**, incluyendo:
  - Carga de presets por defecto según idioma.
  - Creación, edición, borrado e ignorado de presets.
  - Restauración de presets por defecto.
  - Persistencia correcta entre ejecuciones.
  - Sincronización inmediata del renderer tras cualquier operación.

### Errores detectados
Ninguno.  
La extracción fue completada sin inconsistencias y el comportamiento final coincide con la versión estable previa del sistema.

### Notas para pasos siguientes
- La modularización de presets permite ahora implementar funcionalidades avanzadas sin tocar `main.js` (por ejemplo: presets por usuario, presets remotos, perfiles, etc.).
- `settings.js` y `presets_main.js` establecen una ruta clara para futuros módulos que necesiten manipular estructuras complejas dentro de `settings`.
- El renderer (`public/js/presets.js`) quedó completamente desacoplado de `main.js`; su contrato IPC es ahora mucho más estable.
- La modularización alcanzó un nivel en el cual agregar nuevos presets por defecto o cambiar su estructura es trivial y sin riesgo para el resto de la app.

## Paso 7 — updater.js

### Resultado esperado
Extraer toda la lógica de actualización desde `electron/main.js` hacia un módulo dedicado que gestione:

- Comparación de versiones (`compareVersions`).
- Obtención de la versión remota (`fetchRemoteVersion`).
- Lectura de la versión local.
- Diálogos nativos de actualización.
- Apertura del enlace de descarga.
- Check automático al iniciar la aplicación.
- Check manual vía IPC (`check-for-updates`).

El objetivo es que en `main.js` quede únicamente:

- El registro del módulo mediante `updater.register(...)`.
- La llamada a `updater.scheduleInitialCheck()`.

Sin dejar lógica de versiones o HTTP dentro de `main.js`.

### Resultado obtenido
- Se creó el módulo **`electron/updater.js`**, el cual ahora contiene:
  - `compareVersions(local, remote)`.
  - `fetchRemoteVersion(url)` con manejo defensivo de errores y HTTPS.
  - `checkForUpdates({ lang, manual })`, idéntico en comportamiento al original.
  - `scheduleInitialCheck()`, que realiza la verificación automática solo una vez, preservando el comportamiento previo.
  - `register(ipcMain, { mainWinRef, currentLanguageRef })` para exponer el IPC `check-for-updates` y recibir referencias de ventana/idioma de forma desacoplada.
  - Constantes internas (`VERSION_FILE`, `VERSION_REMOTE_URL`, `DOWNLOAD_URL`) reubicadas fuera de `main.js`.

- En `electron/main.js`:
  - Se eliminaron por completo:
    - `compareVersions`.
    - `fetchRemoteVersion`.
    - `checkForUpdates`.
    - `updateCheckDone`.
    - Constantes `VERSION_FILE`, `VERSION_REMOTE_URL`, `DOWNLOAD_URL`.
    - El handler `ipcMain.handle('check-for-updates', ...)`.
  - Se agregaron las llamadas limpias:
    ```js
    updater.register(ipcMain, {
      mainWinRef: () => mainWin,
      currentLanguageRef: () => currentLanguage,
    });
    updater.scheduleInitialCheck();
    ```
  - El main quedó sin lógica de actualización, cumpliendo la modularización completa del subsistema.

- Comportamiento observable verificado:
  - La app realiza un chequeo automático de actualización al inicio, solo una vez.
  - El chequeo manual desde el menú funciona igual que antes.
  - Los diálogos nativos muestran los mismos textos localizados mediante `menuBuilder.getDialogTexts()`.
  - En caso de actualización disponible, se abre el enlace correspondiente.
  - En caso de falla de red, el comportamiento manual sigue informando y el automático permanece silencioso, igual que la versión previa.

### Errores detectados
Ninguno.  
El refactor no introdujo regresiones y el comportamiento final coincide exactamente con el sistema previo.

### Notas para pasos siguientes
- Con `updater.js` ya modularizado, `main.js` quedó en un estado donde prácticamente maneja solo:
  - Ciclo de vida de ventanas.
  - Routing IPC de alto nivel.
  - Integración de módulos.
- Este orden hace posible un **Paso 8** centrado en unificar o aislar la creación de ventanas (`window_manager.js`) si así lo define el plan.
- La modularización actual permite implementar futuros métodos de actualización (por ejemplo, auto-descarga o feeds alternativos) sin tocar `main.js`.

### Estado
☑ Completado

---

## Paso 8 — Auditoría final de `main.js` y módulos del proceso principal

### Resultado esperado

Realizar una auditoría integral de la modularización de `electron/main.js` y de todos los módulos internos del proceso principal, con los siguientes objetivos:

1. Auditoría de `electron/main.js` post-modularización:
   - Verificar que su rol se limite a: ciclo de vida de ventanas, routing IPC de alto nivel e integración de módulos (fs_storage, modal_state, text_state, settings, presets_main, menu_builder, updater).
   - Detectar y marcar cualquier lógica que debería estar en un módulo (reglas de negocio, acceso a disco, manipulación de settings/presets, etc.).

2. Auditoría de todos los módulos creados:
   - `fs_storage.js`, `modal_state.js`, `text_state.js`, `settings.js`, `menu_builder.js`, `presets_main.js`, `updater.js`.
   - Confirmar que cada módulo tenga una responsabilidad clara y una API pública coherente, sin solapamientos innecesarios.

3. Revisión de preloads y APIs expuestas:
   - Revisar `preload.js`, `manual_preload.js`, `preset_preload.js`, `flotante_preload.js`, `language_preload.js`.
   - Asegurar que:
     - Solo expongan métodos realmente registrados en `main.js`/módulos.
     - Sus nombres y payloads coincidan con lo que consumen los renderers (`renderer.js`, `manual.js`, `flotante.js`, etc.).

4. Verificación de funciones duplicadas y rutas muertas:
   - Eliminar duplicados de lógica que ya fue extraída a módulos.
   - Eliminar handlers IPC y funciones no referenciadas (legacy) o documentarlos explícitamente si se reservan para futuras features.

5. Detección de lógica mal ubicada o fusionable:
   - Identificar código que debería moverse entre módulos (por ejemplo, lógica de presets que aún dependa directamente de FS, o lógica de settings repartida).
   - Proponer movimientos mínimos que mejoren la coherencia sin cambiar el comportamiento observable.

6. Revisión de naming, estructura, consistencia y responsabilidades:
   - Alinear nombres de módulos y funciones con su rol real.
   - Homogeneizar la estructura interna de los módulos (orden de imports, constantes, helpers privados, API pública, `module.exports`).
   - Añadir comentarios breves donde sea necesario para clarificar responsabilidades.

El comportamiento observable de la aplicación no debe cambiar respecto a la versión estable posterior a los Pasos 1–7; solo se permiten correcciones de bugs reales detectados durante la auditoría.

---

### Checklist de trabajo

#### 0. Preparación

- [x] 0.1 Congelar referencia actual:
  - [x] Verificar que la app arranque sin errores de consola (main y renderer).
  - [x] Confirmar que las funcionalidades principales (ventana principal, editor manual, presets, idioma, cronómetro, ventana flotante, updater) están operativas.
- [x] 0.2 Definir criterio: no introducir cambios funcionales salvo correcciones de bugs claramente identificados.

#### 1. Auditoría de `electron/main.js`

- [x] 1.1 Inventario de responsabilidades actuales de `main.js` (ventanas, IPC, cronómetro, integración de módulos).
- [x] 1.2 Marcar bloques:
  - [x] Core legítimo de main (ventanas, wiring, cronómetro).
  - [x] Delegable a módulo existente.
  - [x] Duplicado de lógica que ya está en un módulo.
  - [x] Ruta muerta (nunca invocada).
- [x] 1.3 Anotar para cada bloque si se mantiene, se mueve o se elimina.

#### 2. Auditoría de módulos del proceso principal

Para cada módulo (`fs_storage`, `modal_state`, `text_state`, `settings`, `menu_builder`, `presets_main`, `updater`):

- [ ] 2.1 Listar API pública (`module.exports`) y describir brevemente la responsabilidad.
- [ ] 2.2 Mapear quién lo usa (buscar `require("./nombre_modulo")`).
- [ ] 2.3 Comprobar que no duplique lógica ya existente en otro módulo.
- [ ] 2.4 Verificar ausencia de dependencias cíclicas innecesarias.
- [ ] 2.5 Revisar que solo exporte lo que realmente se usa.

#### 3. Preloads y correspondencia con IPC

- [ ] 3.1 Construir tabla de canales IPC:
  - Canal, módulo que lo registra, preload que lo expone, renderer que lo consume, shape del payload.
- [ ] 3.2 Revisar cada preload:
  - [ ] Verificar que no exponga métodos huérfanos (sin handler en main/módulos).
  - [ ] Verificar que no falten métodos usados en renderer.
- [ ] 3.3 Ajustar, si corresponde, nombres y payloads para que preload ↔ main/módulos ↔ renderer estén perfectamente alineados.

#### 4. Duplicados y rutas muertas

- [ ] 4.1 Búsqueda global de funciones clave (FS, presets, settings, updater, traducciones).
- [ ] 4.2 Eliminar versiones antiguas que quedaron en `main.js` u otros archivos.
- [ ] 4.3 Identificar handlers IPC nunca usados y decidir:
  - [ ] Borrado directo.
  - [ ] O marcarlos explícitamente como “reservados para futura feature” (documentado).

#### 5. Lógica a mover o fusionar

- [ ] 5.1 Detectar lógica de negocio fuera de su módulo natural (por ejemplo, presets manipulando settings sin pasar por `settings.js`).
- [ ] 5.2 Proponer y aplicar movimientos mínimos de funciones a módulos existentes, sin rediseñar la arquitectura.
- [ ] 5.3 Documentar en este plan cualquier decisión de “no mover” (con breve justificación).

#### 6. Naming, estructura y responsabilidades

- [ ] 6.1 Revisar naming de módulos y funciones exportadas:
  - [ ] Que describan claramente su rol (`init`, `registerIpc`, `getX`, `setX`, `createXWindow`, etc.).
- [ ] 6.2 Homogeneizar estructura interna de módulos:
  - [ ] Imports → constantes → helpers privados → API pública → `module.exports`.
- [ ] 6.3 Añadir, donde aporte claridad, un comentario inicial de 1–2 líneas por módulo indicando:
  - [ ] Qué hace.
  - [ ] Qué explícitamente NO hace (para evitar que crezca de forma desordenada).

---

### Plan de ejecución resumido

1. **Fase 0 — Preparación:** congelar el estado actual y validar que la app está estable antes de tocar nada.
2. **Fase 1 — `main.js`:** inventario de responsabilidades y marcado de bloques (core, delegable, duplicado, muerto).
3. **Fase 2 — Módulos:** revisar API, usos y solapamientos de `fs_storage`, `modal_state`, `text_state`, `settings`, `menu_builder`, `presets_main`, `updater`.
4. **Fase 3 — Preloads/IPCs:** construir tabla de canales y revisar preload ↔ main ↔ renderer.
5. **Fase 4 — Limpieza:** eliminar duplicados y rutas muertas, moviendo pequeñas piezas a su módulo correcto.
6. **Fase 5 — Consistencia:** ajustar naming, estructura y comentarios para dejar la arquitectura legible.
7. **Fase 6 — Pruebas:** ejecutar la batería de pruebas manuales ya utilizada en pasos anteriores para confirmar que no se alteró el comportamiento observable.

---

### Registro de avances

#### **Fase 0** 

- `2025-12-11` — Fase 0.1 completada:
  - App levanta correctamente desde la carpeta local actual (versión post Pasos 1–7).
  - Sin errores críticos en consola de main ni renderer durante el arranque.
  - Funcionalidades básicas verificadas:
    - Ventana principal operativa.
    - Editor manual abre y cierra correctamente y recibe `manual-init-text`.
    - Gestión de presets funcional (crear/editar/eliminar, envío de `preset-init`).
    - Cambio de idioma operativo mediante ventana modal.
    - Cronómetro en ventana principal y ventana flotante sincronizados.
    - Check de actualizaciones ejecuta sin errores visibles.

- `2025-12-11` — Fase 0.2 completada:
  - Confirmado el criterio para la auditoría:
    - No introducir cambios funcionales deliberados.
    - Solo se permiten correcciones de bugs claramente identificados durante la revisión.
    - Cualquier desviación a este criterio debe documentarse en este mismo archivo.

##### Observaciones detectadas

- DevTools solo se puede abrir en la ventana principal:
  - Los atajos de desarrollo (`Cmd/Ctrl+Shift+I`, `Cmd/Ctrl+R`, etc.) están registrados únicamente contra `mainWin`.
  - Las ventanas de editor, presets, idioma e info/flotante no tienen actualmente atajos ni menú para abrir DevTools.
  - Se mantiene como limitación de diagnóstico mientras dure la auditoría para no mezclar refactorización con cambios de tooling.

##### Estado

☑ Completado

#### **Fase 1** 

- `2025-12-11` — Fase 1 completada (Auditoría de `electron/main.js`)

  - **1.1 Inventario de responsabilidades de `main.js`**
    - Se revisó el archivo `electron/main.js` completo y se clasificaron sus responsabilidades en:
      - Bootstrap y wiring base (imports, rutas de config, inicialización de `textState`).
      - Gestión de ventanas (principal, editor manual, presets, idioma, ventana flotante).
      - Cronómetro central (estado único en proceso principal y broadcast a ventanas).
      - IPC de cronómetro y ventana flotante.
      - IPC de apertura de ventanas (`open-editor`, `open-preset-modal`) y configuración general (`get-app-config`).
      - Integración con módulos internos (`text_state`, `settings`, `presets_main`, `menu_builder`, `updater`).
      - Ciclo de vida global de la app (`whenReady`, `window-all-closed`, `activate`).

  - **1.2 / 1.3 Clasificación de bloques y decisiones**
    - Se marcaron explícitamente los bloques de `main.js` como:
      - **Core legítimo de main**:
        - Creación y ciclo de vida de ventanas (principal, editor, presets, idioma, flotante).
        - Cronómetro maestro y coordinación con ventana flotante.
        - Wiring de IPC de alto nivel (cronómetro, flotante, apertura de ventanas, `get-app-config`).
        - Integración con módulos (`text_state.registerIpc`, `settingsState.registerIpc`, `presetsMain.registerIpc`, `updater.register`).
        - Ciclo de vida de la app (`app.whenReady`, `window-all-closed`, `activate`).
      - **Delegable a módulos existentes**:
        - No se detectaron bloques en `main.js` que contuvieran lógica de negocio que debiera moverse a un módulo ya creado sin romper los contratos actuales. `main.js` se limita a orquestar.
      - **Duplicado de lógica ya modularizada**:
        - No hay duplicación de lógica de texto, settings, presets o updater en `main.js`. Esos IPC están totalmente delegados a sus módulos respectivos.
      - **Rutas muertas / vestigios en `main.js`**:
        - Imports de `dialog`, `Menu`, `shell` desde `electron` que ya no se utilizaban en `main.js`.
        - Doble registro de `app.on('will-quit')` (uno para atajos de desarrollo y otro para limpiar el cronómetro).
        - Desalineación documental respecto de `ensureConfigPresetsDir` (CONTRACTS decía que se llamaba desde `main.js`, pero en la implementación real la llamada la realiza `presets_main`).

    - **Acciones aplicadas como parte de la Fase 1**:
      - Se eliminaron los imports no utilizados en `electron/main.js`:
        - `dialog`, `Menu`, `shell` fueron removidos de la lista destructurada de `require('electron')`.
      - Se fusionaron los dos handlers `app.on('will-quit')` en un único listener que:
        - Llama a `unregisterShortcuts()` para limpiar atajos de desarrollo.
        - Limpia de forma segura el `cronoInterval` del cronómetro.
      - Se actualizó `CONTRACTS.md` para alinear el contrato con la implementación real:
        - `main.js` se documenta ahora como responsable de llamar solo a `ensureConfigDir()` al arranque.
        - `presets_main.js` se documenta como responsable de llamar a `ensureConfigPresetsDir()` cuando necesite leer/escribir presets por defecto o de usuario.

    - **Resultado de la Fase 1 sobre `main.js`**:
      - `main.js` queda claramente limitado a:
        - Gestión de ventanas.
        - Cronómetro central y ventana flotante.
        - Routing IPC de alto nivel.
        - Integración de módulos del proceso principal.
      - No quedan funciones duplicadas de texto, settings, presets o updater en `main.js`.
      - Los únicos cambios realizados fueron de limpieza estructural y documental, sin alterar el comportamiento observable:
        - La aplicación sigue arrancando sin errores.
        - Todas las funcionalidades principales verificadas en la Fase 0 siguen operativas.

##### Estado

☑ Completado