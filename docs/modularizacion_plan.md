# LISTA EXACTA DE BLOQUES A MODULARIZAR DESDE `electron/main.js`

---

# MÓDULO 1 — **modal_state.js**

### Estado persistente del editor manual

**RIESGO: muy bajo**

Este módulo se encargará de:

### BLOQUES A EXTRAER:

#### 1. Lectura del archivo `modal_state.json`

En main.js, aparece en la creación de la ventana del editor:

```js
const state = loadJson(MODAL_STATE_FILE, { maximized: true, reduced: null });
```

Debe moverse toda la lógica de lectura y escritura para que main.js solo use:

```js
const editorState = modalState.load();
```

#### 2. Función `saveReducedState`

Código típico:

```js
const saveReducedState = () => {
   if (!editorWin || editorWin.isDestroyed()) return;
   if (editorWin.isMaximized()) return;
   const b = editorWin.getBounds();
   const st = loadJson(MODAL_STATE_FILE, ...);
   st.reduced = { width: b.width, height: b.height, x: b.x, y: b.y };
   saveJson(...);
};
```

Debe moverse COMPLETA.

#### 3. Listeners del editor relacionados con modal_state:

* `"resize"` → invoca saveReducedState
* `"move"` → invoca saveReducedState
* `"maximize"` → guardar `{ maximized: true }`
* `"unmaximize"` → restaurar `state.reduced` o fallback
* `"close"` → persistir `maximized`

### LO QUE DEBE QUEDARSE EN main.js:

* La creación de la ventana (`new BrowserWindow({ ... })`).
* El wiring de listeners:

```js
modalState.attachTo(editorWin);
```

---

# MÓDULO 2 — **text_state.js**

### Manejo de `current_text.json` y sincronización principal

**RIESGO: bajo**

### BLOQUES A EXTRAER:

#### 1. Lectura inicial del texto:

```js
currentText = loadJson(CURRENT_TEXT_FILE, "");
```

#### 2. Lógica de truncado:

* Por `MAX_TEXT_CHARS`
* Truncado silencioso o notificado
* Guardado inmediato

#### 3. Handlers IPC:

```js
ipcMain.handle("get-current-text", ...)
ipcMain.handle("set-current-text", ...)
ipcMain.on("force-clear-editor", ...)
```

#### 4. Persistencia al cerrar:

```js
app.on("before-quit", () => { ... persist text ... });
```

#### 5. Eventos a otras ventanas:

* Envío al editor: `"manual-init-text"`
* Broadcast a renderer: `"manual-text-updated"`

### LO QUE DEBE QUEDARSE EN main.js:

* Nada de la lógica: main no debe gestionar texto directamente.
* Solo las llamadas:

```js
const textState = require("./text_state");
```

---

# MÓDULO 3 — **settings.js**

### Manejo de configuración del usuario

**RIESGO: bajo**

### BLOQUES A EXTRAER:

#### 1. Normalización de settings:

El bloque:

```js
function normalizeSettings(s) {
  ...
}
```

#### 2. Carga y guardado inicial de `user_settings.json`:

```js
let settings = loadJson(SETTINGS_FILE, { ... });
settings = normalizeSettings(settings);
```

#### 3. Handlers IPC:

```js
ipcMain.handle("get-settings", ...)
ipcMain.handle("set-language", ...)
ipcMain.handle("set-mode-conteo", ...)
```

#### 4. Broadcast correspondiente a:

```js
mainWin.webContents.send("settings-updated", settings);
editorWin?.webContents.send("settings-updated", settings);
presetWin?.webContents.send("settings-updated", settings);
```

#### 5. Number formatting defaults:

Carga de:

```
i18n/<lang>/numberFormat.json
```

### LO QUE DEBE QUEDARSE EN main.js:

* El valor actual de `currentLanguage` (pero puede moverse también si lo deseas).

---

# MÓDULO 4 — **menu_builder.js**

### Construcción del menú nativo

**RIESGO: muy bajo**

### BLOQUES A EXTRAER:

#### 1. Lógica de carga de traducciones para main:

```js
loadMainTranslations(lang)
getDialogTexts(id)
```

#### 2. Menú propiamente tal:

```js
function buildAppMenu(lang) {
  const template = [ ... ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
```

#### 3. Emisión de `menu-click`:

Cada item:

```js
click(_, browserWindow) {
   browserWindow.webContents.send("menu-click", "action-id");
}
```

### LO QUE DEBE QUEDARSE EN main.js:

* Solo una llamada:

```js
menuBuilder.build(lang);
```

---

# MÓDULO 5 — **presets_main.js**

### Manejo completo de presets en el proceso principal

**RIESGO: medio**

### BLOQUES A EXTRAER:

#### 1. Carga combinada de presets por defecto:

```js
function loadDefaultPresetsCombined(lang) { ... }
```

#### 2. Copia inicial de presets desde `/electron/presets/*.js` hacia `/config/presets_defaults/*.json`.

#### 3. Handlers IPC:

* `"create-preset"`
* `"edit-preset"`
* `"request-delete-preset"`
* `"request-restore-defaults"`
* `"get-default-presets"`
* `"notify-no-selection-edit"`

Cada uno de estos hace:

* Validación
* Edición de archivos
* Emisión de eventos hacia ventanas:

```js
mainWin.webContents.send("preset-created", { name });
editorWin?.webContents.send("preset-updated", { ... });
presetWin?.webContents.send("preset-updated", { ... });
```

### LO QUE DEBE QUEDARSE EN main.js:

* Llamada a:

```js
presetsMain.register(ipcMain, {...});
```

* Creación de presetWin.

---

# MÓDULO 6 — **updater.js** (ya existe pero vacío)

### Manejo de actualización remota

**RIESGO: muy bajo**

### BLOQUES A EXTRAER:

#### 1. compareVersions

#### 2. fetchRemoteVersion

#### 3. checkForUpdates

#### 4. Handler IPC:

```js
ipcMain.handle("check-for-updates", ...)
```

### LO QUE DEBE QUEDARSE EN main.js:

* Nada.
* Solo:

```js
updater.register(ipcMain);
```

---

# MÓDULO 7 — fs_storage.js**

### Manejo estandarizado de `loadJson` / `saveJson` / ensureDir

**RIESGO: cero**

### BLOQUES A EXTRAER:

#### 1. loadJson

#### 2. saveJson

#### 3. ensureConfigDir

#### 4. ensureConfigPresetsDir

### LO QUE DEBE QUEDARSE EN main.js:

* Solo llamar:

```js
const { loadJson, saveJson, ensureConfigDir } = require("./fs_storage");
```

---

# MÓDULO 8 — **window_manager.js**

### Complemento de creación de ventanas

**RIESGO: depende**

Se puede extraer:

* createPresetWindow
* createLanguageWindow

**PERO NO:**

* createMainWindow
* createFloatingWindow
* createEditorWindow

Porque estos están demasiado acoplados al ciclo de vida de la app.

---

# RESUMEN FINAL DE EXTRACCIÓN

| Módulo                       | Bloques que se mueven             | Riesgo     |
| ---------------------------- | --------------------------------- | ---------- |
| modal_state.js               | Estado del editor manual          | Muy bajo   |
| text_state.js                | current_text + IPC + broadcast    | Bajo       |
| settings.js                  | user_settings + IPC + language    | Bajo       |
| menu_builder.js              | Menú + i18n main                  | Muy bajo   |
| presets_main.js              | TODA la lógica de presets en main | Medio      |
| updater.js                   | Actualizaciones                   | Muy bajo   |
| fs_storage.js                | loadJson/saveJson/etc             | Cero       |
| window_manager.js            | ventanas secundarias              | Bajo–medio |

---

# BLOQUES QUE DEBEN MANTENERSE EN `main.js` (NO SE MUEVEN)

1. **Cronómetro completo**
2. **Ventana flotante**
3. **Ventana principal**
4. **IPC de cronómetro**
5. **Apertura/cierre de ventanas**
6. **app.whenReady / ciclo de vida**

Estos forman la base esencial.

---