## CONTRATOS DE MÓDULOS — toT Reading Meter
Version 0.0.920

### 0. Convenciones generales

* Todos los módulos frontend se cuelgan de `window.*`.
* Los módulos en `public/js/*.js` son **librerías puras** o **helpers de UI**, pero no deben depender de DOM salvo que su responsabilidad sea explícitamente de UI.
* `renderer.js`, `manual.js`, `preset_modal.js`, `flotante.js` son **capas de presentación** que consumen módulos.

---

## 1. `constants.js` — `window.AppConstants`

**Responsabilidad:**
Centralizar constantes globales de configuración.

**Exporta:**

* Propiedades numéricas:

  * `MAX_TEXT_CHARS: number`
  * `WPM_MIN: number`
  * `WPM_MAX: number`
  * `PREVIEW_INLINE_THRESHOLD: number`
  * `PREVIEW_START_CHARS: number`
  * `PREVIEW_END_CHARS: number`
* Función:

  * `applyConfig(cfg: object): number`

    * Entrada: objeto config (`cfg.maxTextChars` opcional).
    * Acción: ajusta `MAX_TEXT_CHARS` según config.
    * Retorno: valor efectivo de `MAX_TEXT_CHARS`.

**Uso esperado:**

* Todos los límites de tamaño de texto, rangos de WPM y umbrales de preview deben leer **siempre** desde `AppConstants`.
* No redefinir estos números “a mano” en renderer/manual/preset/flotante.

**Fail-fast:**

* Los consumidores deben verificar al inicio:

  * `if (!window.AppConstants) throw new Error("[renderer] AppConstants no disponible");`

---

## 2. `i18n.js` — `window.RendererI18n`

**Responsabilidad:**
Carga de JSON de idioma y resolución de claves de interfaz.

**Exporta:**

* `async loadRendererTranslations(lang: string): Promise<object|null>`

  * Carga `../i18n/<lang>/renderer.json`.
  * Guarda cache interno (`rendererTranslations`, `rendererTranslationsLang`).
  * Retorno: objeto de traducciones o `null` si falla.

* `tRenderer(path: string, fallback?: string): string|undefined`

  * `path` tipo `"renderer.main.buttons.edit"`.
  * Recorre árbol. Si encuentra valor string → lo devuelve.
  * Si no encuentra:

    * Retorna `fallback`.
    * No lanza excepción.

* `msgRenderer(path: string, params?: object, fallback?: string): string`

  * Igual que `tRenderer`, pero reemplaza `{param}` en el string.
  * Si clave no existe, usa `fallback`.

**Uso esperado:**

* No acceder nunca directamente al JSON; siempre usar `tRenderer`/`msgRenderer`.
* Todos los textos de UI deben provenir de claves i18n, salvo:

  * logs de consola,
  * mensajes de error puramente técnicos.

**Fail-fast / robustez:**

* Los módulos de UI deben tolerar que `loadRendererTranslations` falle:

  * Mantener fallbacks legibles.
  * No romper flujo si no hay traducciones.

---

## 3. `notify.js` — `window.Notify`

**Responsabilidad:**
Punto único para mostrar avisos al usuario.

**Exporta:**

* `notifyMain(key: string, fallback?: string): void`

  * Busca texto: `RendererI18n.msgRenderer(key, {}, fallback||key)`.
  * Muestra `alert(msg)` en la ventana principal.
  * No retorna valor.

* `notifyManual(key: string, opts?: { type?: "info"|"warn"|"error"; duration?: number }, showNoticeFn?: (msg, opts) => void): void`

  * Busca texto igual que `notifyMain`.
  * Usa `showNoticeFn` si se pasa.
  * Si no, intenta `window.showNotice(msg, opts)`.
  * No retorna valor.

**Uso esperado:**

* Ventana principal (`renderer.js`):

  * Siempre usar `Notify.notifyMain("renderer.alerts.xxx")`.
* Editor manual:

  * Siempre usar `Notify.notifyManual("renderer.editor_alerts.xxx", {type, duration})`.
* Modal presets:

  * `Notify.notifyMain("renderer.preset_alerts.xxx")`.

**Fallback permitido:**

* En casos extremos donde `Notify` no exista:

  * `alert(tr("renderer.alerts.xxx", "Error."));`
  * `showNotice(tr("renderer.editor_alerts.xxx", "..."), opts);`
* Pero no deben introducirse nuevos casos directos; se mantienen solo como fallback.

---

## 4. `count.js` — `window.CountUtils`

**Responsabilidad:**
Cálculo de caracteres/palabras de forma independiente a la UI.

**Exporta (principal):**

* `contarTexto(texto: string, opts?: { modoConteo?: "simple"|"preciso"; idioma?: string }): { conEspacios: number; sinEspacios: number; palabras: number }`

**Uso esperado:**

* renderer:

  * Llamar `contarTexto(currentText, { modoConteo, idioma })`.
  * Usar retorno para resultados y tiempo estimado (vía FormatUtils).
* manual:

  * No debería reimplementar el conteo; usar resultados provenientes vía IPC (o, si se usa directo, siempre a través de CountUtils).

**Fail-fast:**

* Si `window.CountUtils` o `contarTexto` no existen:

  * `throw new Error("[renderer] CountUtils no disponible; no se puede continuar");`

---

## 5. `format.js` — `window.FormatUtils`

**Responsabilidad:**
Formateo numérico y de tiempo.

**Exporta (principales):**

* `getTimeParts(words: number, wpm: number): { hours: number; minutes: number; seconds: number }`
* `formatTimeFromWords(words: number, wpm: number): string`
* `obtenerSeparadoresDeNumeros(idioma: string, settings?: object): Promise<{ separadorMiles: string; separadorDecimal: string }>`
* `formatearNumero(valor: number, miles: string, decimal: string): string`

**Uso esperado:**

* renderer:

  * Nunca formatear números directamente con `.toLocaleString()` disperso.
  * Usar `obtenerSeparadoresDeNumeros` + `formatearNumero`.

**Fail-fast:**

* Si falta `FormatUtils`, renderer debe:

  * Loggear error.
  * Evitar mostrar basura (puede mostrar valores sin formatear como fallback).

---

## 6. `presets.js` — `window.RendererPresets`

**Responsabilidad:**
Fusión de presets (defaults + usuario) y sincronización con select de UI.

**Exporta:**

* `combinePresets({ settings, defaults }): Preset[]`
* `fillPresetsSelect(list: Preset[], selectEl: HTMLSelectElement): void`
* `applyPresetSelection(preset: Preset, domRefs: { selectEl?, wpmInput?, wpmSlider?, presetDescription? }): void`
* `loadPresetsIntoDom({ electronAPI, language, currentPresetName, selectEl, wpmInput, wpmSlider, presetDescription }): Promise<{ list: Preset[], selected: Preset|null, language: string }>`

**Contrato Preset:**

```ts
type Preset = {
  name: string;
  wpm: number;
  description?: string;
}
```

**Uso esperado (renderer):**

* Nunca leer presets directamente desde settings.
* Usar siempre `loadPresetsIntoDom` y `combinePresets`.

---

## 7. `timer.js` — `window.RendererTimer`

**Responsabilidad:**
Lógica del cronómetro en renderer y flotante, sincronizado con main.

**Exporta (mínimo):**

* `formatTimer(ms: number): string`
* `actualizarVelocidadRealFromElapsed(args: {...}): void`
* `uiResetTimer(args: {...}): void`
* `openFloating(args: {...}): Promise<{ elapsed?: number }>`
* `closeFloating(args: {...}): Promise<void>`
* `parseTimerInput(input: string): number|null`
* `applyManualTime(args: {...}): void`
* `handleCronoState(args: {...}): { elapsed, running, prevRunning, lastComputedElapsedForWpm }`

**Uso esperado:**

* renderer:

  * No manipular el cronómetro “a mano” en ms; usar `RendererTimer`.
* flotante:

  * No replicar lógica de cálculo; solo delegar.

---

## 8. `menu.js` — `window.menuActions`

**Responsabilidad:**
Router de acciones del menú superior.

**Exporta:**

* `registerMenuAction(payload: string, callback: (payload) => void): void`
* `unregisterMenuAction(payload: string): boolean`
* `listMenuActions(): string[]`
* `stopListening(): void` (depuración).

**Uso esperado (renderer):**

* Registrar acciones:

  * `"guia_basica"`, `"instrucciones_completas"`, `"faq"`, `"readme"`, `"acerca_de"`, etc.
* No acceder al menú nativo directamente desde renderer; todo pasa por `menuActions`.

---

## 9. Interfaces IPC: `electronAPI`, `manualAPI`, etc.

### 9.1. `window.electronAPI` en renderer

**Responsabilidad:**
Puente desde renderer a procesos de Electron/main.

**Métodos relevantes (contrato):**

* `getAppConfig(): Promise<object>`
* `getSettings(): Promise<object>`
* `onSettingsChanged(handler: (newSettings) => void)`
* `getCurrentText(): Promise<string|{text:string,meta?:object}>`
* `setCurrentText({ text, meta }): Promise<{ ok?: boolean; truncated?: boolean; text?: string }>`
* `readClipboard(): Promise<string>`
* `openEditor(): Promise<void>`
* `forceClearEditor(): Promise<void>`
* `openPresetModal(payload): Promise<void>`
* `requestDeletePreset(name?: string): Promise<{ ok: boolean; code?: string; error?: string }>`
* `requestRestoreDefaults(): Promise<{ ok: boolean; code?: string; error?: string }>`
* `checkForUpdates(): Promise<void>`
* Cronómetro:

  * `sendCronoToggle()`
  * `sendCronoReset()`
  * `onCronoState(handler)`
  * `onFloatingClosed(handler)`

**Uso esperado:**

* renderer nunca llama directamente a `ipcRenderer`.

---

### 9.2. `window.manualAPI` en editor manual

**Responsabilidad:**

* `getCurrentText(): Promise<string>`
* `setCurrentText({ text, meta }): Promise<{ truncated?: boolean; text?: string }>`
* Eventos:

  * `onCurrentTextUpdated(handler)`

**Uso esperado:**

* manual nunca accede a main directamente; solo vía `manualAPI`.

---

### 9.3. `window.floatingAPI` (si aplica)

* Similar patrón para ventana flotante; sólo comandos de crono y cierre.

---

## 10. Reglas de oro para futuros cambios

1. **Ningún nuevo `alert()` ni `showNotice()` directo.**
   Siempre usar `Notify` con claves i18n.

2. **Ningún número mágico duplicado.**
   Siempre usar `AppConstants`.

3. **Ningún acceso directo a `ipcRenderer`.**
   Siempre a través de `electronAPI` / `manualAPI` / `floatingAPI`.

4. **Ningún texto de UI duro en JS.**
   Siempre claves i18n vía `RendererI18n`.

---

## 11. Proceso principal (`electron/main.js`) y módulos del proceso principal

### 11.1 `electron/main.js` — Proceso principal

**Responsabilidad:**

- Punto de entrada de la app y ciclo de vida de Electron:
  - `app.whenReady`, `app.on('window-all-closed')`, `app.on('activate')`, etc.
- Creación y gestión de ventanas:
  - Ventana principal.
  - Editor manual.
  - Ventana de presets.
  - Ventana de idioma.
  - Ventana flotante del cronómetro.
- Autoridad central del cronómetro y coordinación con la ventana flotante:
  - Estado único del cronómetro en el proceso principal.
  - Emisión de estados hacia renderer y flotante.
- Integración y orquestación de los módulos internos del proceso principal:
  - `fs_storage.js`
  - `modal_state.js`
  - `text_state.js`
  - `settings.js`
  - `presets_main.js`
  - `menu_builder.js`
  - `updater.js`
- Wiring de IPC de alto nivel entre:
  - `preload.js` / `manual_preload.js` / `preset_preload.js` / `flotante_preload.js` / `language_preload.js`.
  - Los módulos internos listados arriba.

**No debe hacer:**

- Lógica de negocio de:
  - Acceso a disco (más allá de lo estrictamente necesario para arrancar) → delegar en `fs_storage`.
  - Gestión de texto → `text_state`.
  - Gestión de settings/idioma → `settings`.
  - Gestión de presets → `presets_main`.
  - Lógica de actualizaciones → `updater`.
- Cálculos de conteo, tiempos de lectura o formateo numérico → ya existen `CountUtils`, `FormatUtils`, `RendererTimer`, etc.

**Contrato interno (respecto a módulos):**

- Inicialización de FS:
  - Llama a `fsStorage.ensureConfigDir()` y `fsStorage.ensureConfigPresetsDir()` al arranque.
- Texto compartido:
  - Llama una sola vez a `textState.init({ loadJson, saveJson, currentTextFile, settingsFile, app, maxTextChars })`.
  - Llama a `textState.registerIpc(ipcMain, () => ({ mainWin, editorWin }))`.
- Settings / idioma:
  - Inicializa `settingsState.init(...)` con los helpers de FS.
  - Registra `settingsState.registerIpc(ipcMain, { getWindows, buildAppMenu, getCurrentLanguage, setCurrentLanguage })`.
  - No implementa por sí mismo `get-settings`, `set-language`, `set-mode-conteo`: solo delega.
- Presets:
  - Llama a `presetsMain.registerIpc(ipcMain, helpers)` para todos los IPC de presets.
  - No accede directamente a presets por defecto ni a presets de usuario (salvo a través de `presets_main`).
- Menú nativo:
  - Construye el menú exclusivamente vía `menuBuilder.buildAppMenu(lang, { mainWin, onOpenLanguage })`.
- Updater:
  - Registra el IPC de actualización vía:
    - `updater.register(ipcMain, { mainWinRef: () => mainWin, currentLanguageRef: () => currentLanguage })`.
  - Programa el chequeo inicial con `updater.scheduleInitialCheck()`.
- Cronómetro y flotante:
  - Es el único responsable de:
    - Registrar los IPC `crono-*` (`crono-toggle`, `crono-reset`, `crono-get-state`, etc.).
    - Mantener el estado del cronómetro y notificarlo a través de `crono-state`.
    - Gestionar apertura y cierre de la ventana flotante (`floating-open`, `floating-close`) y el evento `flotante-closed`.

**Notas:**

- El cronómetro global y la coordinación con la ventana flotante permanecen en `main.js`. `RendererTimer` solo maneja la lógica de UI y derivados en renderer/flotante.
- Cualquier nueva ventana o nuevo IPC de alto nivel debe:
  - Definirse y registrarse en `main.js`.
  - Delegar su lógica en un módulo dedicado del proceso principal cuando sea más que wiring trivial.

### 11.2 `electron/fs_storage.js` — utilidades de FS del proceso principal

**Responsabilidad:**

Centralizar las operaciones de lectura/escritura de JSON y creación de carpetas de configuración usadas por `main.js` y los demás módulos internos del proceso principal.

**Exporta (API pública):**

- Constantes de rutas:
  - `CONFIG_DIR: string`
  - `CONFIG_PRESETS_DIR: string`
- Helpers de inicialización:
  - `ensureConfigDir(): void`
  - `ensureConfigPresetsDir(): void`
- Helpers de JSON:
  - `loadJson(filePath: string, defaultValue: any): any`
  - `saveJson(filePath: string, data: any): void`

**Uso esperado:**

- `main.js`:
  - Llama a `ensureConfigDir()` al arranque para garantizar la carpeta base de configuración.
  - No llama directamente a `ensureConfigPresetsDir()`; no necesita conocer la estructura interna de presets.
- `presets_main.js`:
  - Es el responsable de llamar a `ensureConfigPresetsDir()` cuando necesite leer/escribir presets por defecto o de usuario.
- Otros módulos (`text_state`, `settings`, etc.):
  - Deben usar `loadJson`/`saveJson` con las rutas que les correspondan (`current_text.json`, `user_settings.json`, etc.) en lugar de acceder manualmente a `fs`.
- No se deben duplicar `loadJson`/`saveJson`/`ensureConfigDir`/`ensureConfigPresetsDir` dentro de otros módulos.

### 11.3 `electron/modal_state.js` — estado del editor manual

**Responsabilidad:**

Persistir y restaurar el estado de la ventana del editor manual (posición, tamaño, maximizado, etc.) entre sesiones, sin que `main.js` tenga que lidiar con detalles de `modal_state.json`.

**Exporta (API pública):**

- `loadInitialState(loadJsonOverride?): { x?, y?, width?, height?, isMaximized?: boolean }`
- `attachTo(editorWin, { saveJsonOverride?, debounceMs? } = {}): void`

*(Los nombres exactos pueden variar; el contrato conceptual es que `main.js` no conozca el formato interno del archivo ni la estrategia de persistencia.)*

**Uso esperado:**

- `main.js`:
  - Lee el estado inicial llamando a `loadInitialState(...)`.
  - Crea la `BrowserWindow` del editor manual con ese estado inicial.
  - Llama a `attachTo(editorWin, ...)` para que el módulo escuche `resize/move/close` y persista.
- Ningún otro módulo debe leer o escribir `modal_state.json` directamente.


### 11.4 `electron/text_state.js` — estado de texto compartido

**Responsabilidad:**

Gestionar todo el ciclo de vida del texto compartido (`current_text`) en el proceso principal:

- Carga inicial desde `current_text.json`, incluyendo truncado por `MAX_TEXT_CHARS`.
- Normalización de formato (aceptar/emitir `{ text, meta }` pero guardar un string coherente).
- Persistencia al cerrar la app.
- Broadcast de cambios hacia:
  - Ventana principal.
  - Editor manual.

**Exporta (API pública):**

- `init({ loadJson, saveJson, currentTextFile, settingsFile, app, maxTextChars }): void`
- `registerIpc(ipcMain, getWindows: () => ({ mainWin, editorWin })): void`
  - Registra:
    - `"get-current-text"`
    - `"set-current-text"`
    - `"force-clear-editor"`
- `getCurrentText(): string`

**Uso esperado:**

- `main.js`:
  - Llama a `init()` una sola vez, tras conocer `CONFIG_DIR` y `MAX_TEXT_CHARS`.
  - Llama a `registerIpc(...)` una sola vez, pasando una función que devuelve referencias a ventanas (`mainWin`, `editorWin`).
  - Usa `getCurrentText()` solo para inicializar el editor manual cuando se abre.
- Ningún otro módulo debe mantener su propia copia de `currentText`:
  - `text_state` es la única fuente de verdad.
- Ningún otro módulo debe registrar los IPC `"get-current-text"`, `"set-current-text"`, `"force-clear-editor"`.


### 11.5 `electron/settings.js` — gestión de settings e idioma

**Responsabilidad:**

Centralizar la gestión de `user_settings.json` y el idioma actual de la aplicación:

- Normalización de settings.
- Carga y escritura en disco.
- Propagación de cambios de idioma (incluyendo reconstrucción del menú y notificación a ventanas).
- Propagación de cambios de modo de conteo u otras preferencias.

**Exporta (API pública):**

- `init({ loadJson, saveJson, configDir, app, buildAppMenu }): void`
- `getSettings(): object`
  - Carga siempre desde disco y normaliza antes de devolver.
- `saveSettings(next: object): void`
- `broadcastSettingsUpdated(getWindows: () => ({ mainWin, editorWin, presetWin, langWin, floatingWin })): void`
- `registerIpc(ipcMain, { getWindows, buildAppMenu, getCurrentLanguage, setCurrentLanguage }): void`
  - Registra al menos:
    - `"get-settings"`
    - `"set-language"`
    - `"set-mode-conteo"`

**Uso esperado:**

- `main.js`:
  - Llama a `init()` al arrancar, después de preparar `fs_storage`.
  - Llama a `registerIpc(...)` una sola vez, pasando:
    - `getWindows` → para obtener referencias a todas las ventanas.
    - `buildAppMenu` → para reconstruir menú al cambiar idioma.
    - `getCurrentLanguage` / `setCurrentLanguage` → para coordinar el idioma global.
- Cualquier código que necesite settings:
  - Debe utilizar `get-settings` vía IPC (desde renderer) o `getSettings()` (desde main/módulos), no leer `user_settings.json` directamente.
- La normalización de settings no debe reimplementarse fuera de este módulo.


### 11.6 `electron/menu_builder.js` — menú nativo de la aplicación

**Responsabilidad:**

- Cargar traducciones específicas de “main” (archivos `i18n/<lang>/main.json`).
- Construir el menú nativo (`Menu.setApplicationMenu`) según el idioma.
- Encapsular todos los `MenuItem` que emiten `menu-click` hacia renderer y otros comandos nativos (p.ej. abrir URL, DevTools).

**Exporta (API pública):**

- `loadMainTranslations(lang: string): object|null`
- `getDialogTexts(lang: string): object`
  - Textos comunes para diálogos nativos (`update_*`, etc.).
- `buildAppMenu(lang: string, { mainWin, onOpenLanguage, sendMenuClick? }): void`
  - Construye el menú y llama internamente a `Menu.setApplicationMenu(...)`.

**Uso esperado:**

- `main.js`:
  - Llama a `buildAppMenu(currentLanguage, { mainWin, onOpenLanguage })` cuando:
    - Se crea la ventana principal.
    - Cambia el idioma.
  - Nunca construye el menú a mano.
- Renderer:
  - No accede al menú nativo; solo recibe `menu-click` desde `menu.js` (router en renderer) a través de `preload`.


### 11.7 `electron/presets_main.js` — presets en proceso principal

**Responsabilidad:**

- Gestionar la combinación de presets por defecto (`electron/presets/defaults_*.js`) con los presets de usuario en `config/`.
- Exponer operaciones de CRUD de presets vía IPC:
  - Crear, editar, borrar.
  - Restaurar presets por defecto.
- Mantener sincronizados `user_settings.json` y los archivos de presets cuando hay cambios.

**Exporta (API pública):**

- `registerIpc(ipcMain, helpers): void`
  - Registra los IPC de presets (nombres concretos según implementación actual).
  - Utiliza:
    - `helpers.loadJson` / `helpers.saveJson` (normalmente desde `fs_storage`).
    - `helpers.getSettings` / `helpers.saveSettings` (desde `settings`).
- `loadDefaultPresetsCombined(opts?): Preset[]`
  - Punto único para obtener la lista combinada de presets por defecto (para inicialización).

**Uso esperado:**

- `main.js`:
  - Llama a `registerIpc(ipcMain, ...)` una sola vez.
  - No implementa lógica de presets fuera de este módulo.
- Ningún otro módulo debe leer directamente los archivos de presets por defecto ni los JSON de presets de usuario:
  - Todos deben pasar por `presets_main` (directamente o vía IPC).


### 11.8 `electron/updater.js` — sistema de actualizaciones

**Responsabilidad:**

- Encapsular por completo la lógica de actualización:
  - Comparación de versiones.
  - Consulta remota a `VERSION` en el repositorio.
  - Decisión de si hay actualización disponible.
  - Diálogos nativos de “actualizado / hay nueva versión / fallo de conexión”.
- Mantener el comportamiento:
  - Chequeo automático al inicio, una sola vez por ciclo de vida.
  - Chequeo manual desde menú.

**Exporta (API pública):**

- `compareVersions(local: string, remote: string): number` (interno, pero estable).
- `fetchRemoteVersion(url: string): Promise<string|null>` (interno).
- `checkForUpdates({ lang, manual }: { lang?: string; manual?: boolean }): Promise<void>`
- `register(ipcMain, { mainWinRef, currentLanguageRef }): void`
  - Registra el handler IPC `check-for-updates`.
- `scheduleInitialCheck(): void`
  - Programa el chequeo automático de actualización (idempotente).

**Uso esperado:**

- `main.js`:
  - No implementa lógica de HTTP, comparación de versiones ni diálogos de actualización.
  - Solo:
    - Llama a `updater.register(ipcMain, { mainWinRef, currentLanguageRef })`.
    - Llama a `updater.scheduleInitialCheck()` tras crear la ventana principal.
- Renderer:
  - Llama a `window.electronAPI.checkForUpdates()` (vía preload) sin conocer detalles de `updater.js`.


### 11.9 Notas globales sobre el proceso principal

1. `electron/main.js` debe mantener un rol de:
   - Gestión de ventanas.
   - Wiring de IPC de alto nivel.
   - Integración de módulos.
   - Autoridad del cronómetro y ventana flotante.

2. Cualquier nueva funcionalidad del proceso principal que implique:
   - Acceso a disco,
   - Reglas de negocio,
   - Gestión de estado compartido,
   debe implementarse en un módulo dedicado de `electron/` y exponerse a través de:
   - Una API interna bien definida, y/o
   - IPC documentado en este archivo y en los preloads.

3. No se deben introducir nuevos “atajos” que dupliquen lógica ya cubierta por estos módulos (`fs_storage`, `text_state`, `settings`, `presets_main`, `updater`).
