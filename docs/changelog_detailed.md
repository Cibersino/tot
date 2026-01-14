# Changelog (detallado)

Historial técnico y narrativo por versión. Incluye decisiones, notas de implementación y contexto.
Orden: versiones más recientes primero.
Antes de publicar una nueva versión, seguir `docs/release_checklist.md`.

---

## Política

### 1) Corte histórico
- Las entradas `0.0.*` (hasta e incluyendo `0.0.930`) se consideran **históricas** y se mantienen con su formato actual.
- Desde la versión **0.1.0** se adopta **SemVer estricto** y un formato mecánico nuevo.

### 2) SemVer estricto (post-0.0.930)
- Formato obligatorio: `MAJOR.MINOR.PATCH` (tres componentes), por ejemplo `0.1.0`, `0.1.1`, `0.2.0`, `1.0.0`.
- Regla de incremento (SemVer):
  - **MAJOR**: cambios incompatibles (breaking) en contratos/UX/datos persistidos.
  - **MINOR**: nuevas capacidades **compatibles** (features) o ampliaciones de contratos sin romper.
  - **PATCH**: fixes compatibles, ajustes menores y refactors sin impacto contractual.
- Se prohíbe volver a usar el “patch como build counter” (ej. `0.0.930`, `0.0.901`, etc.) en nuevas versiones.
- Pre-releases permitidos cuando aplique: `-alpha.N`, `-beta.N`, `-rc.N` (manteniendo `MAJOR.MINOR.PATCH` base).

### 3) Fuente de verdad y tags (post-0.0.930)
- Fuente de verdad única de versión: `package.json` (`app.getVersion()`).
- Tag de release obligatorio en GitHub: `vMAJOR.MINOR.PATCH` (p. ej. `v0.1.0`) o `vMAJOR.MINOR.PATCH-rc.N` (p. ej. `v0.2.0-rc.1`).
- Regla estricta: el updater requiere prefijo `v` (minúscula) en el `tag_name` de la latest release.

### 4) Formato mecánico (post-0.0.930)
Cada versión nueva debe usar este esqueleto (secciones en este orden; **omitir** las que no apliquen):

- `## [TAG] (opcional: título de la versión)`
- `### Fecha release y último commit`
- `### Resumen de cambios` (opcional: organizar según relevancia)
- `### Agregado`
- `### Cambiado`
- `### Arreglado`
- `### Removido`
- `### Migración` (obligatoria si hay acciones requeridas por el usuario o por la persistencia)
- `### Contratos tocados` (IPC/storage/IDs; obligatoria si se tocó algún contrato)
- `### Archivos` (opcional; solo si aporta trazabilidad)
- `### Issues conocidos` (opcional)
- `### Notas` (opcional)

Reglas:
- Un bullet = una idea. Sub-bullets solo para precisar.
- Contratos deben escribirse con precisión (canal IPC, shape de payload, key de storage, filename).
- Si la versión cambia contratos o persistencia, **no basta** con “refactor”: debe quedar explícito en `### Contratos` y, si aplica, `### Migración`.

---

## [0.1.0] Primer release público

### Fecha release y último commit

- Fecha: `2026-01-14`
- Último commit: `<TBD>`
- Baseline técnico usado para auditoría: `0.0.930` (commit `68a4ef4`) → `<TBD>`

### Resumen de cambios

- Primer empaquetado distribuible: **Windows x64 portable `.zip`** (sin instalador) vía `electron-builder`.
- Endurecimiento de seguridad para releases: **renderer sandbox** + **apertura de links** controlada (solo GitHub) + **docs locales** allowlisted vía `appdoc:`.
- Consolidación “no silencios”: logging centralizado en **main** y **renderer** + eliminación de `try/catch noop`.
- Rework de UI/ventanas: **Manual → Editor**, selector de idioma pasa a **ventana** dedicada, y “timer” pasa a **crono** (naming y plumbing).
- Persistencia: el estado deja de vivir junto a la app y pasa a `app.getPath('userData')/config` (diseño para portable real).
- Updater pasa a **GitHub Releases API** y comparación SemVer; política sigue siendo “informar + abrir navegador”.

### Agregado

- **Distribución / empaquetado (Windows portable ZIP)**
  - `package.json`:
    - Se incorpora setup de **electron-builder** para **Windows x64** target **`zip`** (portable; sin instalador).
    - Scripts nuevos para distribución: `dist`, `dist:win`.
    - `directories.output`: `build-output/`.
    - `artifactName`: `toT-ReadingMeter-${version}-win-${arch}.${ext}`.
    - `build.files` incluye explícitamente: `electron/**`, `public/**`, `i18n/**`, `package.json`, `LICENSE`, `PRIVACY.md`.
    - Identidad: `"name": "tot-readingmeter"`, `appId: "com.cibersino.tot-readingmeter"`, `productName: "toT — Reading Meter"` (validar encoding del em dash antes de release).

- **Módulo de apertura de links endurecida (GitHub allowlist + docs locales allowlisted)**
  - `electron/link_openers.js` (nuevo):
    - IPC `open-external-url`: abre en navegador **solo** si la URL pasa allowlist de hosts GitHub.
    - IPC `open-app-doc`: resuelve claves allowlisted de documentación local (consumidas como `appdoc:<key>`).
  - `public/js/info_modal_links.js` (nuevo):
    - Intercepta clicks en páginas info/modal:
      - `appdoc:<key>` → `openAppDoc(key)`.
      - `https://...` → `openExternalUrl(url)` (filtrada por allowlist en main).

- **Logging central (“no silencios”)**
  - `electron/log.js` (nuevo): logger con helpers (`warnOnce`/`errorOnce`) para fallos esperables sin spam (p. ej. `webContents.send()` durante shutdown).
  - `public/js/log.js` (nuevo): logger en renderer con API equivalente (base para i18n/notify/UI).

- **Constantes invariantes en main**
  - `electron/constants_main.js` (nuevo): centraliza límites y defaults (p. ej. `MAX_TEXT_CHARS`, `MAX_IPC_CHARS`, `DEFAULT_LANG`, límites de strings de presets).

- **Ventana de idioma (reemplaza el modal anterior)**
  - `public/language_window.html` + `public/language_window.js` (nuevos): selector con búsqueda/filtro y navegación por teclado.
  - `i18n/languages.json` (nuevo): manifiesto de idiomas disponibles (input para UI).
  - IPC nuevo: `get-available-languages`.

- **Nuevo locale**
  - `i18n/es/es-CL/main.json` + `i18n/es/es-CL/renderer.json` (nuevos).

- **Licencia redistribuible de fuente**
  - `public/fonts/LICENSE_Baskervville_OFL.txt` (nuevo).

- **Ayuda contextual (botón “?” en Resultados)**
  - `public/renderer.js`: el botón `btnHelp` muestra **tips aleatorios** usando el sistema de notificaciones (keys i18n dedicadas).

### Cambiado

- **Seguridad de renderer (sandbox)**
  - `electron/main.js`:
    - `webPreferences.sandbox: true` en las ventanas (principal/editor/preset/language/flotante).
    - Consecuencia: acciones privilegiadas (clipboard, abrir URLs/docs) pasan a depender de IPC explícitos.

- **Apertura de URLs externas (solo GitHub)**
  - Integración de `link_openers` en main:
    - `open-external-url` valida parseo y host antes de delegar a `shell.openExternal(...)`.
    - Se elimina el patrón “renderer abre enlaces directo”.

- **Docs locales (esquema `appdoc:`)**
  - `public/info/acerca_de.html`:
    - Links internos usan `appdoc:*` (p. ej. `appdoc:privacy-policy`, `appdoc:license-app`, etc.) en vez de rutas o enlaces directos.
  - `electron/link_openers.js` maneja “dev vs packaged” para resolver rutas de docs.

- **CSP endurecida para páginas info**
  - `public/info/*.html` relevantes:
    - CSP estricta tipo: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none';`.

- **Persistencia / filesystem: el estado se mueve a `app.getPath('userData')/config`**
  - `electron/fs_storage.js`:
    - `CONFIG_DIR` deja de ser una carpeta en el árbol del repo/app y pasa a `userData/config`.
    - Se agrega inicialización explícita (guardrails: error si se usa sin inicializar).
    - Se agregan getters dedicados para rutas:
      - `getSettingsFile()` → `user_settings.json`
      - `getCurrentTextFile()` → `current_text.json`
      - `getEditorStateFile()` → `editor_state.json`
      - `getConfigPresetsDir()` → directorio de presets defaults bajo config
    - `loadJson`/`saveJson` pasan a loggear missing/empty/failed con claves estables (y a registrar errores de escritura).

- **Updater: fuente GitHub Releases + SemVer**
  - `electron/updater.js`:
    - Migra a `https://api.github.com/repos/Cibersino/tot-readingmeter/releases/latest`.
    - Extrae `tag_name` y exige prefijo `v` (minúscula) para el parse (`vMAJOR.MINOR.PATCH`).
    - Parse/compare SemVer con extracción de versión desde el tag (y manejo explícito de “invalid tag”).
    - Flujo se mantiene: **informa** y ofrece abrir URL de release (no instala).

- **Manual → Editor (ventana y plumbing)**
  - Renombres/reestructura:
    - `public/manual.js` (deleted) → `public/editor.js` (added)
    - `public/manual.html` → `public/editor.html`
    - `public/manual.css` → `public/editor.css`
    - `electron/manual_preload.js` (deleted) → `electron/editor_preload.js` (added)
    - `electron/modal_state.js` → `electron/editor_state.js` (rename; estado persistente del editor)
  - IPC renombrados y “contracts” actualizados (ver Contratos).

- **Timer → Crono (naming y módulo)**
  - `public/js/timer.js` → `public/js/crono.js` (rename con rework interno).
  - IPC y eventos estandarizan prefijo `crono-*` y el envío a ventanas pasa a ser best-effort con logs (en vez de `try/catch noop`).

- **Floating → Flotante (naming + IPC)**
  - `electron/main.js` y preloads:
    - `floating-open` → `flotante-open`
    - `floating-close` → `flotante-close`
    - variable/handle: `floatingWin` → `flotanteWin`.

- **Menú y acciones (renderer)**
  - `public/js/menu.js` → `public/js/menu_actions.js`:
    - Centraliza el registro/ejecución de acciones por key (`registerMenuAction`, `executeMenuAction`).
  - `public/renderer.js`:
    - Ajusta el router de info modals: `showInfoModal(...)` ya no reconoce key `readme`.

- **i18n renderer (overlay + fallback más explícito)**
  - `public/js/i18n.js`:
    - Modelo base + overlay (incluye soporte para `es-CL` como overlay sobre `es`).
    - Logging consistente para keys faltantes (evita spam).

- **Presets: defaults pasan de JS a JSON + selección por idioma base**
  - Defaults:
    - Se eliminan defaults en JS (`electron/presets/defaults_presets*.js`) y se reemplazan por JSON (`defaults_presets*.json`).
  - `electron/presets_main.js`:
    - Carga defaults desde JSON.
    - Copia defaults a un directorio bajo config (userData) cuando aplica.
    - Sanitiza preset input (shape/tipos) antes de persistir y antes de emitir eventos.
  - `electron/settings.js`:
    - Normaliza idioma como tag y deriva base (`es` para `es-cl`) para bucketing.
    - Evoluciona schema para presets por base:
      - `presets_by_language`
      - `selected_preset_by_language`
      - `disabled_default_presets` normalizado por base cuando aplica.
    - Nuevo IPC `set-selected-preset`.

- **Límites y robustez de IPC/payloads**
  - `electron/main.js` expone `get-app-config` con `{ maxTextChars, maxIpcChars }`.
  - `electron/text_state.js`:
    - Enforce de `maxIpcChars` para payloads entrantes (rechaza si excede).
    - Truncado/limit hard cap con `maxTextChars`.
    - `meta` se sanitiza (solo strings acotadas; descarta/limita campos ruidosos).
    - Clipboard: se introduce `clipboard-read-text` vía main (compatible con sandbox) y se restringe por sender/ventana.

- **Notificaciones**
  - `public/js/notify.js`: pasa de wrapper simple a sistema de “toasts” (contenedor DOM, autocierre, helpers `toastMain(...)`/`notifyMain(...)`).

- **Assets / branding**
  - Renombre de logos: `logo-cibersin.*` → `logo-cibersino.*`.
  - Se elimina `public/assets/logo-tot.ico`.

### Arreglado

- **Eliminación de silencios operativos**
  - Rutas con `try/catch { /* noop */ }` se reemplazan por:
    - `warnOnce/errorOnce` en main (ej. `webContents.send(...)` cuando una ventana ya se destruyó).
    - logs explícitos en fallas de I/O (`fs_storage.loadJson:*`, `saveJson failed`).

- **Compatibilidad con sandbox**
  - Lectura de clipboard pasa a main (`clipboard-read-text`) para evitar dependencias directas del renderer.
  - Apertura de URLs/docs pasa a IPC allowlisted (evita `window.open`/atajos directos).

- **Preset modal init más robusto**
  - `electron/preset_preload.js`: `onInit(cb)` re-emite el último payload si el listener se registra después del `preset-init` (evita race al abrir la ventana).

- **Conteo / límites**
  - `public/js/constants.js` deja de mutar global al aplicar config: `applyConfig(cfg)` retorna el límite efectivo (reduce drift).
  - `public/js/count.js`: consolida default de idioma (`DEFAULT_LANG`) y simplifica conteo “simple”.

### Removido

- **In-app README (feature completa)**
  - `public/info/readme.html` (deleted).
  - Entry points asociados:
    - menú `readme`,
    - router/modal key `readme`,
    - labels i18n dedicadas a esa página.

- **Artefactos legacy**
  - `public/manual.js` (deleted) y `electron/manual_preload.js` (deleted) al migrar a Editor.
  - `public/language_modal.html` (deleted) al migrar a ventana de idioma.
  - Defaults presets en JS (deleted) al migrar a JSON.
  - Templates versionados `.default` en `config/` (deleted).

- **Assets**
  - `public/assets/logo-tot.ico` (deleted).

### Migración

- No aplica, es el primer release.

### Contratos tocados

#### 1) IPC (main): canales **nuevos / renombrados / removidos**

- **Nuevo** `open-external-url` (`ipcMain.handle`) — `electron/link_openers.js:47`
  - Input: `url` (string).
  - Output: `{ ok: true }` o `{ ok: false, reason: <string> }`.
  - Regla contractual: **solo abre** URLs que pasen la allowlist (GitHub hosts); el resto se rechaza.

- **Nuevo** `open-app-doc` (`ipcMain.handle`) — `electron/link_openers.js:76`
  - Input: `docKey` (string).
  - Output: `{ ok: true }` o `{ ok: false, reason: <string> }`.
  - Regla contractual: `docKey` va por **allowlist** (ver §4 “appdoc keys”).

- **Nuevo** `get-available-languages` (`ipcMain.handle`) — `electron/main.js:846`
  - Output: `Array<{ tag: string, label: string }>` (sin wrapper `{ok:...}`).

- **Nuevo** `get-app-version` (`ipcMain.handle`) — `electron/main.js:1097`
  - Output: `string` (versión); fallback: `'unknown'`.

- **Nuevo** `get-app-runtime-info` (`ipcMain.handle`) — `electron/main.js:1106`
  - Output: `{ platform: string, arch: string }`.

- **Nuevo** `clipboard-read-text` (`ipcMain.handle`) — `electron/text_state.js:192`
  - Output: `{ ok: true, text: string }` o `{ ok: false, reason: string }`.
  - Regla contractual: **autoriza solo** a la ventana principal (valida el sender).
  - Regla contractual: respeta límite `maxIpcChars` (puede truncar/rechazar según implementación).

- **Nuevo** `set-selected-preset` (`ipcMain.handle`) — `electron/settings.js:573`
  - Input: `presetName` (string).
  - Output: `{ ok: true, langKey: string, name: string }` o `{ ok: false, error: string }`.
  - Regla contractual: la selección queda **bucketizada por idioma base** (`langKey`).

- **Renombrado** `floating-open` → `flotante-open` (`ipcMain.handle`) — `electron/main.js:909`
  - Mismo propósito (abrir ventana flotante), **cambia el nombre del canal**.

- **Renombrado** `floating-close` → `flotante-close` (`ipcMain.handle`) — `electron/main.js:928`
  - Mismo propósito (cerrar ventana flotante), **cambia el nombre del canal**.

- **Removido** `floating-open` (canal legacy).
- **Removido** `floating-close` (canal legacy).

#### 2) IPC (main): canales existentes con **shape/semántica tocada**

- **Cambiado** `get-app-config` (`ipcMain.handle`) — `electron/main.js:1088`
  - Antes (0.0.930): retornaba al menos `maxTextChars`.
  - Ahora (0.1.0): retorna `{ ok: true, maxTextChars: number, maxIpcChars: number }`.
  - Contrato: `maxIpcChars` pasa a ser límite explícito para payloads IPC grandes.

- **Cambiado** `set-current-text` (`ipcMain.handle`) — `electron/text_state.js:207`
  - Input aceptado:
    - `string`, o
    - `{ text: string, meta?: object }`.
  - Reglas contractuales:
    - Rechaza payloads demasiado grandes según `maxIpcChars`.
    - Aplica hard cap: trunca `text` a `maxTextChars`.
    - `meta` se sanitiza/whitelistea (no se persisten/propagan claves arbitrarias).
  - Output: `{ ok: true, truncated: boolean, length: number, text: string }` o `{ ok: false, error: string }`.
  - Nota: esto es un **cambio contractual real** (shape de retorno + validación/limitación).

- **Tocado** `open-preset-modal` (`ipcMain.handle`) — `electron/main.js:1029`
  - Semántica tocada: ahora se identifica `senderWin` desde `event.sender` (reduce ambigüedad del “quién abrió”).
  - Payload tolerado sigue siendo “número WPM o payload objeto”, pero con validaciones más estrictas (contrato más duro: inputs inválidos se rechazan antes).

- **Tocado** `edit-preset` (`ipcMain.handle`) — `electron/presets_main.js:304`
  - Semántica tocada: se endurece el shape validado/sanitizado del preset antes de persistir y antes de emitir eventos (mismo canal, contrato más estricto).

- **Tocado** `create-preset` / `request-delete-preset` / `request-restore-defaults` (`ipcMain.handle`) — `electron/presets_main.js`
  - Semántica tocada: sanitización/normalización previa a persistencia/emisión; el “payload efectivo” emitido al renderer puede cambiar (mismo evento/canal, datos normalizados).

#### 3) IPC eventos (main ↔ renderer): canales renombrados/agregados

- **Renombrados** eventos “Manual → Editor” (main ↔ editor renderer):
  - `manual-init-text` → `editor-init-text`
  - `manual-editor-ready` → `editor-ready`
  - `manual-text-updated` → `editor-text-updated`
  - `manual-force-clear` → `editor-force-clear`
  - Impacto contractual: cualquier listener antiguo (`manual-*`) deja de dispararse.

- **Nuevo** evento `flotante-closed` (main → renderer)
  - Contrato: notifica a la ventana principal que la flotante fue cerrada (listener expuesto en preload).

- **Tocado** `language-selected` (renderer → main)
  - Canal se mantiene, pero el emisor ahora trabaja con **tag** (`es`, `es-cl`, etc.); main ya no depende del argumento para cerrar la ventana (contrato más tolerante).

- **Menú (contrato interno “action key”)**
  - **Removida** action key `readme` (ya no debe emitirse ni manejarse en renderer).

#### 4) Preloads (surface contract): objetos expuestos y métodos tocados

- **Removido** `manualAPI` (preload legacy).
- **Agregado** `editorAPI` (nuevo preload) con métodos:
  - `getCurrentText() -> invoke('get-current-text')`
  - `setCurrentText(t) -> invoke('set-current-text', t)`
  - `getAppConfig() -> invoke('get-app-config')`
  - `getSettings() -> invoke('get-settings')`
  - (Contratos: nombres de métodos + canales invocados + shape de retorno de `set-current-text` cambió; ver §2.)

- **Tocado** `electronAPI` (preload principal): cambios contractuales observables
  - **Nuevo** `readClipboard() -> invoke('clipboard-read-text')`.
  - **Nuevo** `getAppVersion() -> invoke('get-app-version')`.
  - **Nuevo** `getAppRuntimeInfo() -> invoke('get-app-runtime-info')`.
  - **Nuevo** `openExternalUrl(url) -> invoke('open-external-url', url)`.
  - **Nuevo** `openAppDoc(docKey) -> invoke('open-app-doc', docKey)`.
  - **Nuevo** `setSelectedPreset(name) -> invoke('set-selected-preset', name)`.
  - **Renombrado** plumbing de flotante:
    - `openFlotanteWindow()` ahora usa `invoke('flotante-open')` (antes `floating-open`).
    - `closeFlotanteWindow()` ahora usa `invoke('flotante-close')` (antes `floating-close`).
  - **Nuevo** listener: `onFlotanteClosed(cb)` (evento `flotante-closed`).

- **Tocado** `languageAPI` (preload de ventana de idioma)
  - `setLanguage(tag)` ahora usa `invoke('set-language', tag)` y `send('language-selected', tag)`.
  - **Nuevo** `getAvailableLanguages() -> invoke('get-available-languages')`.

- `presetAPI` se mantiene nominalmente, pero la semántica de `editPreset(...)` queda bajo un pipeline más estricto (sanitización/validación server-side) — ver §2.

#### 5) Storage / persistencia: paths y schema tocados

- **Cambiado** root de persistencia: `CONFIG_DIR` ahora vive bajo `app.getPath('userData')/config` (ya no bajo el árbol del repo).
  - Contrato de ubicación: `user_settings.json`, `current_text.json`, `editor_state.json` se leen/escriben desde ese root.
  - Contrato “guardrail”: operar sin init explícito de storage pasa a ser error.

- **Renombrado** archivo de estado de ventana:
  - `modal_state.json` (legacy) → `editor_state.json` (nuevo naming/archivo efectivo).

- **Tocado** `user_settings.json` (schema efectivo normalizado)
  - `language` se trata como **tag** (y se deriva base para bucketing).
  - Se consolida bucketing por idioma base para presets/selección/disabled defaults:
    - `presets_by_language`
    - `selected_preset_by_language`
    - `disabled_default_presets`
  - `modeConteo` queda validado contra set permitido.
  - Nota: aunque existieran piezas antes, el contrato “canon” que el código normaliza/persiste queda como arriba.

#### 6) appdoc keys (contrato: claves allowlisted → archivo local permitido)

- `privacy-policy` → `PRIVACY.md`
- `license-app` → `LICENSE`
- `license-baskervville` → `public/fonts/LICENSE_Baskervville_OFL.txt`
- `license-electron` → `LICENSE.electron.txt`
- `licenses-chromium` → `LICENSES.chromium.html`

#### IPC (main) — nuevos / modificados

- `ipcMain.handle('get-app-config')`
  - **Response:** `{ maxTextChars: number, maxIpcChars: number }`
- `ipcMain.handle('get-app-version')`
  - **Response:** `string` (equivalente a `app.getVersion()`)
- `ipcMain.handle('get-app-runtime-info')`
  - **Response:** `{ platform: string, arch: string }` (derivado de `process.platform` / `process.arch`)
- `ipcMain.handle('get-available-languages')`
  - **Response:** lista desde `i18n/languages.json` (manifiesto consumible por la UI de idioma)
- `ipcMain.handle('clipboard-read-text')`
  - **Request:** sin args
  - **Response:** `string`
  - **Restricción:** valida sender (solo ventana principal autorizada)
- `ipcMain.handle('open-external-url')`
  - **Request:** `url: string`
  - **Efecto:** abre navegador **solo** si host ∈ allowlist GitHub; si no, rechaza.
- `ipcMain.handle('open-app-doc')`
  - **Request:** `docKey: string`
  - **Efecto:** abre doc local **solo** si `docKey` ∈ allowlist y el archivo resuelve en ruta permitida.
- `ipcMain.handle('check-for-updates', { manual })`
  - **Cambio de backend:** consulta GitHub Releases API; requiere `tag_name` con prefijo `v`.
- `ipcMain.handle('set-selected-preset', presetName)`
  - Persiste selección por idioma base (ver schema).

#### IPC renombrados

- `floating-open` → `flotante-open`
- `floating-close` → `flotante-close`
- `manual-*` → `editor-*` (ver abajo)

#### IPC Editor (renombre de canales)

- `manual-init-text` → `editor-init-text`
- `manual-editor-ready` → `editor-ready`
- `manual-text-updated` → `editor-text-updated`
- `manual-force-clear` → `editor-force-clear`

#### Preload API (renderer) — cambios relevantes

- `electron/preload.js` (`window.electronAPI`)
  - Agrega:
    - `readClipboard()` → `ipcRenderer.invoke('clipboard-read-text')`
    - `getAppVersion()`, `getAppRuntimeInfo()`
    - `openExternalUrl(url)`, `openAppDoc(docKey)`
  - Renombra flotante:
    - `openFlotanteWindow()` → `ipcRenderer.invoke('flotante-open')`
    - `closeFlotanteWindow()` → `ipcRenderer.invoke('flotante-close')`
- `electron/editor_preload.js` (`window.editorAPI`)
  - API dedicada para editor (`getCurrentText`, `setCurrentText`, `getAppConfig`, `getSettings`).
- `electron/preset_preload.js` (`window.presetAPI`)
  - `onInit(cb)` re-emite último payload si llegó antes del registro del callback.

#### Storage / archivos persistidos

- Directorio base: `CONFIG_DIR = app.getPath('userData')/config`
- Archivos clave:
  - `user_settings.json`
  - `current_text.json`
  - `editor_state.json`
- Defaults presets:
  - Fuente en app: `electron/presets/defaults_presets*.json`
  - Copia/uso bajo config: directorio `getConfigPresetsDir()` (según `fs_storage.js`)

#### Allowlist `appdoc:` (claves observadas)

- `privacy-policy` → `PRIVACY.md`
- `license-app` → `LICENSE`
- `license-baskervville` → `public/fonts/LICENSE_Baskervville_OFL.txt`
- `license-electron` / `licenses-chromium` → previstos para artefactos runtime (requieren estar presentes en el ZIP final si se habilitan)

### Archivos

- Agregados (selección):
  - `electron/constants_main.js`
  - `electron/link_openers.js`
  - `electron/log.js`
  - `electron/editor_preload.js`
  - `public/editor.js`
  - `public/js/info_modal_links.js`
  - `public/js/log.js`
  - `public/language_window.html`
  - `public/language_window.js`
  - `i18n/languages.json`
  - `i18n/es/es-CL/main.json`
  - `i18n/es/es-CL/renderer.json`
  - `public/fonts/LICENSE_Baskervville_OFL.txt`
- Renombrados (selección):
  - `electron/modal_state.js` → `electron/editor_state.js`
  - `public/manual.html` → `public/editor.html`
  - `public/manual.css` → `public/editor.css`
  - `public/js/timer.js` → `public/js/crono.js`
  - `public/js/menu.js` → `public/js/menu_actions.js`
  - `public/assets/logo-cibersin.*` → `public/assets/logo-cibersino.*`
- Eliminados (selección):
  - `public/info/readme.html`
  - `public/manual.js`
  - `electron/manual_preload.js`
  - `public/language_modal.html`
  - `config/current_text.json.default`
  - `config/modal_state.json.default`
  - `public/assets/logo-tot.ico`

### Notas

- `electron/updater.js` depende de tags `vMAJOR.MINOR.PATCH` (prefijo `v` minúscula) en la **latest release**.
- Validar encoding del string `productName` en `package.json` (se observa riesgo de encoding del em dash en diffs).
- `appdoc:license-electron` y `appdoc:licenses-chromium` están previstos: si se habilitan, asegurar que `LICENSE.electron.txt` y `LICENSES.chromium.html` estén efectivamente incluidos en el ZIP final (según checklist de release).

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
  * Inserción de logo Cibersino

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

## Before [0.0.3]

  Tempus edax rerum
  