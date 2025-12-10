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