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

## Paso X — [Nombre del paso]

### Resultado esperado
...

### Resultado obtenido
...

### Errores detectados
...

### Estado
☐ Pendiente
☑ Completado
```

---

# 9. Próximos pasos

1. Implementar `fs_storage.js`, `modal_state.js`, `text_state.js`, `settings.js`, `presets_main.js`, `menu_builder.js`, `updater.js` como módulos **internos del proceso principal**, sin cambiar la API pública de los preloads.
2. Ir migrando los bloques desde `main.js` hacia estos módulos **de a uno por vez**, siguiendo este orden recomendado:

   1. `fs_storage.js`
   2. `modal_state.js`
   3. `text_state.js`
   4. `settings.js`
   5. `menu_builder.js`
   6. `presets_main.js`
   7. `updater.js`
3. Después de cada extracción, actualizar la sección de pruebas y marcar el paso como completado.

---
