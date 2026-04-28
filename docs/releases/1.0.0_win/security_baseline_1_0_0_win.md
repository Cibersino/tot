# Baseline de seguridad para distribución (por release)

Fecha: `2026-04-03`
Tag objetivo (GitHub): `v1.0.0`
Commit freeze (Git): `aff7cf9c87a6081804f72ac84b2f7d86da0bbef9`
Artefacto inspeccionado: `toT-1.0.0-win-x64.zip`
SHA256(artefacto): `9F2E2B215A9339F870ABB80A0471D3891FF765590DD6BA2EF10E0945FA7CFB87`

Pregunta única que responde este documento: **¿La app es suficientemente segura para ser distribuida en este release?**

Este baseline está diseñado como **checklist operativo** y como “candado” de publicación.  
La app solo se considera “suficientemente segura para distribuir” si:

1) **Todo el Ship Gate (repo/código + configuración de release) está en PASS**, y  
2) **Todo el Post-packaging Gate (artefacto empaquetado) está en PASS**.

Leyenda:
* **[PASS]** Cumple.
* **[BLOCKER]** No cumple: bloquea distribución.
* **[PENDING]** No verificado aún, pero es requisito para distribuir (bloquea hasta ejecutar el check).
* **[N/A]** No aplica al modelo de app. Evitar usarlo; si aparece, justificar explícitamente por qué.

Regla operativa:
* Este baseline aplica **solo** al artefacto inspeccionado. Si se re-empaqueta, se debe re-ejecutar el Post-packaging Gate.
* Este archivo es la **línea base reusable** para releases futuros; cada release debe completar estados/evidencias sobre esta misma estructura.

---

## 1) Veredicto del release

**Veredicto actual:** `PASS`  
**Decisión:** `OK publicar`

Estado por gate:
* **Ship Gate (repo/código + release hygiene):** `PASS`
  * Postura de seguridad del runtime (secciones 2–9): `PASS`
  * Release hygiene (sección 10): `PASS`
* **Post-packaging Gate (artefacto build):** `PASS`

Notas:
* Si el veredicto es PASS, registrar el identificador del artefacto validado (nombre exacto + hash o evidencia equivalente).
* Si el veredicto es BLOCKER/PENDING, registrar el/los ítems bloqueantes y el plan de cierre.
* Registrar siempre el **delta de seguridad** del release (canales IPC nuevos/modificados, ventanas nuevas, cambios CSP, rutas nuevas de persistencia, cambios en updater/enlaces externos).
* Delta de seguridad del release `1.0.0`:
  * `1.0.0` introduce la nueva superficie `import/extract` + OCR opcional con exposición preload en `electronAPI` (`openImportExtractPicker`, `checkImportExtractPreconditions`, `prepareImportExtractOcrActivation`, `launchImportExtractOcrActivation`, `disconnectImportExtractOcr`, `prepareImportExtractSelectedFile`, `executePreparedImportExtract`, `getImportExtractProcessingMode`, `requestImportExtractAbort`, `onImportExtractProcessingModeChanged`).
  * `1.0.0` introduce nuevos canales IPC y enforcement en main para selección de archivo, preconditions, prepare/execute y activación/desconexión OCR.
  * `1.0.0` introduce nueva persistencia app-owned bajo `config/import_extract_state.json` y `config/ocr_google_drive/{credentials.json,token.json}`.
  * `1.0.0` introduce nuevo material OCR empaquetado controlado por el release: `electron/assets/ocr_google_drive/credentials.json`.
  * `1.0.0` introduce nueva salida a servicios externos para OCR bajo navegador del sistema + OAuth desktop en main + scope fijo `drive.file`; renderer no controla provider, host ni scope.
  * En este release también queda en uso la salida pública fija del main window hacia `https://totapp.org/` y `https://www.patreon.com/Cibersino`, ambas mediadas por `electronAPI.openExternalUrl` y la allowlist de `electron/link_openers.js`.

---

## 2) Threat model mínimo — Ship Gate

**Objetivo práctico:** impedir escalamiento renderer → OS y acotar entradas no confiables.

Checklist:
* [PASS] Renderer (DOM + JS) se trata como **no confiable**.
* [PASS] Proceso main es el **punto de enforcement** (política).
* [PASS] Preloads son el **único puente** entre renderer y capacidades privilegiadas.
* [PASS] La app no depende de cargar contenido remoto arbitrario para operar.

Notas / evidencia:
* Superficies tratadas como input no confiable: texto principal/editor, presets, task editor, snapshots, clipboard, links externos, picker/drag-drop de import/extract, archivos fuente elegidos por el usuario, errores/respuestas del provider OCR y estado local del token OCR.
* La contención observada es: `loadFile(...)` local-only, `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, CSP con `script-src 'self'`, bridges preload whitelist-based y enforcement en main vía IPC.
* Las salidas externas no navegan la UI principal: se enrutan por `electron/link_openers.js`/`shell.openExternal(...)` con allowlist de hosts y `mailto`.

---

## 3) BrowserWindow posture — Ship Gate

**Invariantes requeridas en todas las ventanas** (main / editor / task_editor / preset / language / flotante / otras):

Checklist:
* [PASS] `contextIsolation: true`
* [PASS] `nodeIntegration: false`
* [PASS] `sandbox: true`
* [PASS] No se usa `enableRemoteModule` (si aparece: incidente).
* [PASS] No hay `webview` embebidos (`webviewTag` / `<webview>`).
* [PASS] No se desactiva `webSecurity` ni se habilitan flags equivalentes que relajen aislamiento.
* [PASS] No se navega a contenido remoto para renderizar UI (modelo local-first / local-only, salvo excepción explícita documentada).
* [PASS] Existe control efectivo deny-by-default de navegación/ventana emergente en el modelo local-only del producto.

Criterio de bloqueo:
* Cualquier ventana que deshabilite `sandbox`, habilite `nodeIntegration`, o deshabilite `contextIsolation`.
* Falta de control de navegación no deseada en ventanas renderer con contenido interactivo.

Evidencia mínima sugerida:
* Lista exhaustiva de ventanas y dónde se setean `webPreferences` (archivo + referencia aproximada de línea).
* Evidencia del control efectivo de navegación/ventanas emergentes y del flujo permitido para salidas externas.
* Ventanas verificadas con `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` y `loadFile(...)`: `mainWin`, `editorWin`, `taskEditorWin`, `presetWin`, `langWin`, `flotanteWin`, `findWin`.
* No se encontraron `enableRemoteModule`, `webviewTag`, `<webview>`, `webSecurity: false` ni `loadURL(...)` en la superficie renderer.
* El control efectivo observado es: ventanas renderer cargadas solo por `loadFile(...)`, ausencia de `loadURL(...)` para UI, ausencia de `webview`, y salidas externas únicamente por el flujo mediado/allowlistado de `electron/link_openers.js`.

---

## 4) Preload posture (superficie expuesta) — Ship Gate

Principios operativos:
* API expuesta a renderer debe ser **pequeña, intencional y whitelist-based**.
* Renderer no debe poder invocar capacidades privilegiadas “genéricas” (ej. `invoke(channel, payload)` libre).

Checklist:
* [PASS] Preloads exponen API vía `contextBridge` y no exponen Node a renderer.
* [PASS] Preloads no implementan file I/O, network I/O, ni ejecución dinámica.
* [PASS] Preloads no exponen superficies amplias (ej. acceso directo a `ipcRenderer` sin wrapper de propósito).
* [PASS] APIs preload se mantienen separadas por ventana y con propósito explícito (ej. `electronAPI`, `editorAPI`, `taskEditorAPI`, `presetAPI`, `languageAPI`, `flotanteAPI`).
* [PASS] Logging en preload es mínimo; decisiones de seguridad se aplican en main.

Criterio de bloqueo:
* Cualquier preload que exponga capacidades genéricas que permitan al renderer ampliar superficie (p. ej. “invoke cualquier canal”, “eval”, “require”, “fs”).

Evidencia mínima sugerida:
* Enumeración de APIs expuestas (`window.*API`) + lista de métodos y su propósito (por preload).
* Confirmación de que no se expone `ipcRenderer` crudo, `require`, `process`, `fs` o primitivos de ejecución dinámica.
* En este baseline, incluir también la superficie `electronAPI` nueva de import/extract:
  * `openImportExtractPicker`
  * `getPathForFile`
  * `checkImportExtractPreconditions`
  * `prepareImportExtractOcrActivation`
  * `launchImportExtractOcrActivation`
  * `disconnectImportExtractOcr`
  * `prepareImportExtractSelectedFile`
  * `executePreparedImportExtract`
  * `getImportExtractProcessingMode`
  * `requestImportExtractAbort`
  * `onImportExtractProcessingModeChanged`
* Preloads verificados: `electron/preload.js`, `editor_preload.js`, `task_editor_preload.js`, `preset_preload.js`, `language_preload.js`, `flotante_preload.js`, `editor_find_preload.js`.
* Superficies expuestas: `electronAPI`, `editorAPI`, `taskEditorAPI`, `presetAPI`, `languageAPI`, `flotanteAPI`, `editorFindAPI`.
* No se expone `ipcRenderer` crudo, ni `require`, `process`, `fs`, `eval` o primitivos equivalentes al renderer.

---

## 5) IPC posture (trust boundary) — Ship Gate

**IPC es frontera de confianza.** Todo input del renderer es no confiable.

Requisitos mínimos (aplican a canales de impacto: clipboard, texto, presets, apertura de modales/ventanas, apertura de URLs/docs, etc.):

Checklist:
* [PASS] Disciplina de esquema (plain object donde corresponde; coerción/normalización de tipos).
* [PASS] Whitelisting de campos (ignorar/dropear campos desconocidos; no “passthrough”).
* [PASS] Size fuses para strings controlables por el renderer (texto, nombres/descripciones, meta).
* [PASS] Size fuses cubren también entradas de Task Editor (texto, enlace, comentario y payloads de listas/biblioteca).
* [PASS] Sender restriction cuando el canal debe pertenecer a una ventana específica.
* [PASS] Fallos recuperables devuelven respuesta estructurada `{ ok:false, ... }` y feedback UX cuando aplica.
* [PASS] Flujos multi-step sensibles mantienen estado efímero app-owned y no confían en payload reinyectado por renderer (por ejemplo `prepareId` one-shot + TTL + revalidación por fingerprint antes de `execute`).

Mapa de superficies “de impacto” (completar por release, al menos con los canales relevantes):
* [PASS] Clipboard bridge (lectura/escritura si existe): tamaño + control de origen.
* [PASS] Ingesta/edición de texto: límites + tratamiento seguro de meta.
* [PASS] Presets: creación/edición/borrado con sanitización y límites.
* [PASS] Apertura de modales/ventanas: payload acotado + control de origen.
* [PASS] Apertura de enlaces/docs: allowlist + validación + no “open arbitrary”.
* [PASS] Task Editor (listas/biblioteca/enlaces): esquema + sender guard + límites + política de apertura de links/paths.
* [PASS] Snapshots de texto: validación de esquema + contención de ruta + confirmación de sobreescritura.
* [PASS] Import/extract picker + preconditions: `import-extract-open-picker` y `import-extract-check-preconditions` con sender guard de main window y retorno estructurado.
* [PASS] Import/extract prepare/execute: `import-extract-prepare-selected-file` y `import-extract-execute-prepared` con validación de payload, prepared-record TTL, fingerprint freshness y route choice acotado.
* [PASS] Import/extract processing mode: `import-extract-get-processing-mode` / `import-extract-request-abort` con sender guard y sanitización de meta (`source`/`reason`).
* [PASS] OCR activation/disconnect: `import-extract-prepare-ocr-activation`, `import-extract-launch-ocr-activation` e `import-extract-disconnect-ocr` con sender guard, paths resueltos en main y sin scopes/endpoints controlables por renderer.

Criterio de bloqueo:
* Añadir un canal IPC nuevo de impacto sin: whitelist, size fuse y (si aplica) sender guard.

Evidencia mínima sugerida:
* Lista de canales IPC “de impacto” y dónde se registran (archivo + referencia aproximada).
* Para cada canal: shape de request/response y validaciones relevantes.
* Tabla explícita de cambios IPC respecto al release anterior (canal nuevo/modificado/eliminado + riesgo + veredicto).
* En este release, incluir explícitamente los canales nuevos/modificados de import/extract/OCR y el archivo de preload donde quedan expuestos.
* Evidencia verificada: `clipboard-read-text` y `set-current-text` en `electron/text_state.js`; snapshots en `electron/current_text_snapshots_main.js`; apertura externa/docs en `electron/link_openers.js`; import/extract en `electron/import_extract_platform/*`.
* Evidencia actual: `presets_main.js` aplica sender restriction por ventana según el flujo (`create-preset`/`edit-preset` desde `presetWin`; `request-delete-preset`/`request-restore-defaults` desde `mainWin`).
* `import-extract-check-preconditions` devuelve estado estructurado y valida sender contra `mainWin`, alineado con el resto de la superficie `import/extract`.
* Evidencia actual: `tasks_main.js` valida esquema y límites para listas/biblioteca (`texto`, `tipo`, `enlace`, `comentario` con tope de `1200`), tope agregado de `200` filas por task list y `12000` ítems para la task library, aplica sender guard en los handlers del Task Editor y restringe apertura de destinos a archivos locales existentes con confirmación o URLs `https:` con confirmación/allowlist.

---

## 6) CSP baseline — Ship Gate

Objetivo:
* Reducir probabilidad y blast radius de inyección (XSS/DOM injection) en superficies renderer.
* Evitar que inyección derive en puente privilegiado.

Baseline mínimo aceptable (ajustar solo con justificación explícita):
* `default-src 'self';`
* `script-src 'self';`
* `style-src 'self' 'unsafe-inline';` **(excepción aceptada solo si está justificada)**
* `object-src 'none';`
* `base-uri 'none';`

Checklist:
* [PASS] CSP presente en **todas** las páginas HTML de ventanas renderer.
* [PASS] CSP presente también en HTMLs informativos/auxiliares (`public/info/*.html` u equivalentes).
* [PASS] `script-src 'self'` (sin fuentes remotas; sin `unsafe-eval`; sin inline scripts).
* [PASS] No hay `<script>` inline en HTML.
* [PASS] No hay handlers inline tipo `onclick=...`.
* [PASS] Si existe `style-src 'unsafe-inline'`, su uso está justificado y acotado (solo estilos).

Criterio de bloqueo:
* Cualquier necesidad de relajar `script-src` (p. ej. `unsafe-eval`, scripts remotos, o permitir inline scripts).

Evidencia mínima sugerida:
* Lista de HTMLs con su CSP (muestra representativa o verificación sistemática).
* Resultado de búsqueda de `<script>` inline / handlers inline y resolución de hallazgos.
* HTMLs verificados con CSP: `public/index.html`, `editor.html`, `task_editor.html`, `preset_modal.html`, `language_window.html`, `flotante.html`, `editor_find.html`, `public/info/acerca_de.html`, `instrucciones.en.html`, `instrucciones.es.html`, `links_interes.html`.
* La política observada es `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none';`.
* No se encontraron `<script>` inline ni handlers inline en `public/`.

---

## 7) File boundaries (lectura/escritura) — Ship Gate

Principio:
* Escrituras persistentes acotadas a storage propio de la app con nombres de archivo conocidos.
* Renderer no aporta rutas arbitrarias a operaciones de I/O del main.

Checklist:
* [PASS] Persistencia de usuario confinada a un directorio controlado por la app (p. ej. `app.getPath('userData')/...`).
* [PASS] No existe lectura/escritura arbitraria por rutas entregadas por renderer (salvo diseño explícito con validación fuerte).
* [PASS] Entradas no confiables que llegan a persistencia (texto, presets) están acotadas por tamaño y saneo antes de persistir.
* [PASS] Rutas seleccionadas por diálogos (`save/open`) se normalizan y confinan al root esperado (p. ej. `tasks/lists`, `saved_current_texts`).
* [PASS] Lecturas i18n limitadas al árbol `i18n/` y las claves/tags se normalizan.
* [PASS] Import/extract acepta rutas de archivos fuente solo desde selección explícita del usuario (picker nativo o `File`/drag-drop ya concedido por el navegador de archivos del sistema) y nunca usa esas rutas como destino de escritura arbitraria.
* [PASS] El estado persistido específico de import/extract/OCR permanece app-owned y con rutas fijas:
  * `config/import_extract_state.json`
  * `config/ocr_google_drive/credentials.json`
  * `config/ocr_google_drive/token.json`
* [PASS] `config/ocr_google_drive/credentials.json` se materializa/repara desde `electron/assets/ocr_google_drive/credentials.json`; el renderer no importa ni elige un `credentials.json` arbitrario.
* [PASS] `config/ocr_google_drive/token.json` se escribe/borrar solo desde main con `safeStorage`; si la plataforma usa backend más débil (por ejemplo `basic_text` en Linux), el riesgo residual queda documentado antes de PASS.

Criterio de bloqueo:
* Introducir rutas controladas por renderer para lectura/escritura sin validación estricta y sin rediseño de seguridad.
* Permitir importación manual arbitraria de credenciales OCR o persistencia de token OCR fuera del storage controlado por la app.

Evidencia mínima sugerida:
* Inventario de archivos persistidos esperados (p. ej. `user_settings.json`, `current_text.json`, `presets_defaults/*`, `tasks/*`, `saved_current_texts/*`, `import_extract_state.json`, `ocr_google_drive/*`) + ubicación base + quién puede escribirlos.
* Enumeración de rutas abiertas por diálogos del sistema (si existen) y cómo se validan.
* Evidencia verificada en `electron/fs_storage.js`: root bajo `app.getPath('userData')/config`, `saved_current_texts`, `tasks/*`, `import_extract_state.json`, `ocr_google_drive/{credentials.json,token.json}`.
* Evidencia verificada en `electron/current_text_snapshots_main.js` y `electron/tasks_main.js`: contención de rutas bajo roots esperados y confirmación de sobreescritura donde aplica.
* Evidencia verificada en `electron/import_extract_platform/ocr_google_drive_bundled_credentials.js`: el producto no pide al usuario importar `credentials.json` arbitrario.
* El caveat documentado de `safeStorage` en Linux `basic_text` no aplica al target validado `win-x64`.

---

## 8) Clipboard posture — Ship Gate

Checklist:
* [PASS] Clipboard se trata como input no confiable.
* [PASS] Lectura/escritura de clipboard ocurre en main vía IPC bridge (no directo en renderer).
* [PASS] Payload acotado: si excede el límite permitido, no se transporta (respuesta estructurada + UX preservada).

Criterio de bloqueo:
* Permitir que renderer lea clipboard directamente o transportar clipboard sin límite de tamaño.

Evidencia mínima sugerida:
* Canales IPC de clipboard + sender restriction (si aplica) + size fuse.
* Evidencia verificada en `electron/text_state.js`: `clipboard-read-text` solo admite sender de main window, trata clipboard como input no confiable y aplica límite de tamaño con respuesta estructurada.

---

## 9) Updater + external-service policy — Ship Gate

Modelo recomendado: **actualización dirigida por el usuario** (user-driven) y uso de servicios externos con parámetros fijos desde main.

Checklist:
* [PASS] El check de versión consulta un endpoint HTTPS fijo y conocido (documentar cuál).
* [PASS] Si hay update, se solicita consentimiento explícito del usuario.
* [PASS] La acción de “Download” abre el release oficial en navegador externo (o flujo equivalente bajo control del usuario).
* [PASS] Endpoint de check y URL de descarga no son controlables por renderer.
* [PASS] No existe descarga silenciosa de binarios.
* [PASS] No existe ejecución automática de instaladores.
* [PASS] No existe auto-update in-app (download/quitAndInstall/etc.).
* [PASS] La activación OCR usa navegador del sistema para OAuth; no existe webview/embedded browser para autenticación Google.
* [PASS] La ruta OCR usa un scope fijo y mínimo (`drive.file`) y ese scope no es controlable por renderer.
* [PASS] Endpoints/proveedor del flujo OCR están fijos al modelo documentado del producto (Google OAuth + Google Drive/Docs); renderer no puede inyectar host, scope o provider alternativo.
* [PASS] OCR solo envía a Google archivos elegidos explícitamente por el usuario y la app intenta limpieza remota del documento temporal tras exportar.
* [PASS] No existe backend del desarrollador en el medio para OCR ni reenvío de archivos a servicios no documentados.

Riesgo residual (completar si aplica):
* [PASS] Si no hay verificación criptográfica propia de artefactos, justificar por qué el modelo de updater no descarga/ejecuta automáticamente.
* [PASS] Si el target usa un backend `safeStorage` más débil o si el proveedor OCR responde con fallas de conectividad/cuota/API deshabilitada, registrar el riesgo residual sin degradar el modelo de permisos.

Criterio de bloqueo:
* Cualquier flujo que descargue/ejecute updates dentro de la app sin una revisión de seguridad separada.
* Cualquier flujo OCR que permita credenciales/scopes/endpoints controlables por renderer o autenticación dentro de contenido embebido.
* Cualquier flujo OCR que envíe archivos sin acción explícita del usuario o a través de un backend intermedio no documentado.

Evidencia mínima sugerida:
* Endpoint usado + decisión de UX + confirmación de que no existe auto-update.
* Referencias de código del handler IPC y del flujo de confirmación UX.
* Para OCR: referencias al scope fijo, flujo `authenticate(...)`, validación de setup y limpieza remota best-effort.
* Evidencia verificada en `electron/updater.js`: check fijo a `https://api.github.com/repos/Cibersino/tot/releases/latest`, descarga dirigida a `https://github.com/Cibersino/tot/releases/latest`, confirmación explícita del usuario y apertura en navegador externo.
* Evidencia verificada en `electron/import_extract_platform/import_extract_ocr_activation_ipc.js`: `OCR_SCOPES = ['https://www.googleapis.com/auth/drive.file']` y `authenticate(...)` en main.
* Evidencia verificada en `electron/import_extract_platform/ocr_google_drive_route.js`: create/export/delete vía Google Drive/Docs y limpieza remota best-effort del documento temporal.
* El riesgo residual del updater queda aceptado porque la app no descarga ni ejecuta binarios; el riesgo residual OCR en este target es operacional (conectividad/cuota/API), no de ampliación del modelo de permisos.

---

## 10) Release hygiene (repo + configuración de release) — Ship Gate

Este bloque es relevante para seguridad de distribución porque controla supply-chain accidental (secrets, material dev, artefactos no intencionados) y configuración de build.

Checklist:
* [PASS] Secret hygiene:
  * No hay llaves/tokens/credenciales hardcodeadas (incluye `.env`, tokens en JS, URLs con credenciales, etc.).
  * No hay archivos de volcado/logs de desarrollo con datos sensibles versionados.
  * Si se detecta un secreto: incidente y bloquea publicación hasta rotación/remoción.
  * Tratar `electron/assets/ocr_google_drive/credentials.json` como material app-owned controlado del release: no committed en git, no editable por renderer, y con trazabilidad explícita en revisión.
  * `config/ocr_google_drive/token.json` nunca pertenece al repo ni al artefacto empaquetado final.

* [PASS] Packaging excludes (política “no arrastrar dev”):
  * La configuración de empaquetado usa allowlist estricta de runtime (`build.files`) o excludes explícitos equivalentes.
  * Quedan fuera directorios no distribuibles (mínimo: `tools_local/` y equivalentes).
  * Excluye backups, evidence folders, scripts internos que no sean runtime.
  * Excluye cualquier token OCR mutable de usuario y cualquier volcado/debug output del flujo import/extract/OCR.

* [PASS] External-link allowlist coherente con canales públicos:
  * Si el release modifica enlaces públicos (sitio web, contacto, redes, docs in-app), verificar que `electron/link_openers.js` mantenga política de mínimo privilegio.
  * `https` solo para hosts explícitamente allowlistados.
  * `mailto` solo para direcciones explícitamente allowlistadas.
  * Si no hay cambios de enlaces/hosts en el release, dejar evidencia breve de “no delta”.

* [PASS] DevTools / Debug hooks (política para build distribuible):
  * En build empaquetado: DevTools **no se abre automáticamente**.
  * En build empaquetado: no existe un menú/atajo propio de la app que abra DevTools salvo modo debug explícito y deliberado.
  * Nota: DevTools en modo dev es normal.

* [PASS] Source maps (si aplica):
  * Se observaron `.map` dentro de `app.asar` arrastrados por dependencias runtime.
  * No se identificó exposición relevante de source maps propios de la app en el artefacto inspeccionado.

Criterio de bloqueo:
* Cualquier secreto encontrado en repo o incluido por build.
* `tools_local/` (o equivalentes) no excluido por configuración antes de empaquetar.
* Build empaquetado configurado para abrir DevTools automáticamente o dejar debug hooks no intencionales.

Evidencia mínima sugerida:
* Comandos/outputs usados para verificar (p. ej. grep de secretos, inspección de config build, etc.).
* Resumen de archivos efectivamente incluidos por configuración de empaquetado.
* En releases con import/extract/OCR, evidencia específica sobre:
  * presencia esperada de `electron/assets/ocr_google_drive/credentials.json` como material controlado,
  * ausencia de `config/ocr_google_drive/token.json` en repo y en packaging input,
  * y dependencias runtime nuevas (`@google-cloud/local-auth`, `googleapis`, `mammoth`, `pdf-parse`, `sharp` y runtime nativo asociado).
* Evidencia verificada en `.gitignore`: exclusión de `tools_local/`, `config/` y `electron/assets/ocr_google_drive/credentials.json`.
* Evidencia verificada con `git ls-files`: no están versionados `electron/assets/ocr_google_drive/credentials.json`, `config/ocr_google_drive/token.json`, `tools_local` ni `.env`.
* Evidencia verificada en `build-output/builder-effective-config.yaml`: allowlist estricta `package.json`, `electron/**`, `public/**`, `i18n/**`, `LICENSE`, `PRIVACY.md`; `asarUnpack` limitado a `sharp`/`@img`.
* Evidencia verificada en `build-output/win-unpacked`: no se observaron `tools_local`, `.env`, `token.json`, backups, dumps ni `evidence` folders.
* Evidencia verificada en `electron/main.js`, `electron/menu_builder.js` y `README.md`: en build empaquetado no se abre DevTools automáticamente y el menú Development solo existe en desarrollo con `SHOW_DEV_MENU=1`.
* Delta de enlaces públicos del release: main-logo links a `https://totapp.org/` y `https://www.patreon.com/Cibersino`, ambos bajo `electronAPI.openExternalUrl` + allowlist de `electron/link_openers.js`.

---

# POST-PACKAGING GATE (obligatorio antes de publicar)

Este gate valida el **artefacto real** a distribuir (installer/zip) y su superficie de supply-chain.  
No re-valida postura de seguridad “en fuente” (IPC/CSP/etc.) salvo en la medida en que el artefacto incluya contenido inesperado o dependencias no intencionadas.

## 11) Dependencias incluidas en el build (solo runtime)

**Bloque de dependencias runtime (lo que se integra en el build):**
* Runtime (Electron + Chromium + Node embebido).
* App bundle (p. ej. `app.asar` y/o recursos equivalentes).
* `node_modules` solo de producción (si corresponde; si no hay, declararlo explícitamente).

Checklist:
* [PASS] Listado exacto de dependencias de producción incluidas en el build (top-level):
  * Confrontar lo incluido en artefacto contra `package.json` (`dependencies`) y contra el runtime esperado de Electron.
  * Enumerar `resources/app.asar/node_modules` o ruta equivalente y registrar nombres + versiones.
  * Resultado (pegar debajo):
    * `resources/app.asar/node_modules` top-level exactos:
      * `@google-cloud/local-auth@3.0.1`, `@img/colour@1.1.0`, `@img/sharp-win32-x64@0.34.4`, `@xmldom/xmldom@0.8.12`, `agent-base@7.1.4`, `argparse@1.0.10`, `arrify@2.0.1`, `base64-js@1.5.1`, `bignumber.js@9.3.1`, `bluebird@3.4.7`, `buffer-equal-constant-time@1.0.1`, `call-bind-apply-helpers@1.0.2`, `call-bound@1.0.4`, `core-util-is@1.0.2`, `data-uri-to-buffer@4.0.1`, `debug@4.4.3`, `detect-libc@2.1.2`, `dingbat-to-unicode@1.0.1`, `duck@0.1.12`, `dunder-proto@1.0.1`, `ecdsa-sig-formatter@1.0.11`, `es-define-property@1.0.1`, `es-errors@1.3.0`, `es-object-atoms@1.1.1`, `extend@3.0.2`, `fetch-blob@3.2.0`, `formdata-polyfill@4.0.10`, `function-bind@1.1.2`, `gaxios@6.7.1`, `gcp-metadata@6.1.1`, `get-intrinsic@1.3.0`, `get-proto@1.0.1`, `google-auth-library@10.6.2`, `google-logging-utils@1.1.3`, `googleapis@171.4.0`, `googleapis-common@8.0.1`, `gopd@1.2.0`, `gtoken@7.1.0`, `has-symbols@1.1.0`, `hasown@2.0.2`, `https-proxy-agent@7.0.6`, `immediate@3.0.6`, `inherits@2.0.4`, `is-docker@2.2.1`, `is-stream@2.0.1`, `is-wsl@2.2.0`, `isarray@1.0.0`, `json-bigint@1.0.0`, `jszip@3.10.1`, `jwa@2.0.1`, `jws@4.0.1`, `lie@3.3.0`, `lop@0.4.2`, `mammoth@1.11.0`, `math-intrinsics@1.1.0`, `ms@2.1.3`, `node-domexception@1.0.0`, `node-ensure@0.0.0`, `node-fetch@2.7.0`, `object-inspect@1.13.4`, `open@7.4.2`, `option@0.2.4`, `pako@1.0.11`, `path-is-absolute@1.0.1`, `pdf-parse@1.1.1`, `process-nextick-args@2.0.1`, `qs@6.15.0`, `readable-stream@2.3.8`, `safe-buffer@5.2.1`, `semver@7.7.3`, `server-destroy@1.0.1`, `setimmediate@1.0.5`, `sharp@0.34.4`, `side-channel@1.1.0`, `side-channel-list@1.0.0`, `side-channel-map@1.0.1`, `side-channel-weakmap@1.0.2`, `sprintf-js@1.0.3`, `string_decoder@1.1.1`, `tr46@0.0.3`, `underscore@1.13.8`, `url-template@2.0.8`, `util-deprecate@1.0.2`, `uuid@9.0.1`, `web-streams-polyfill@3.3.3`, `webidl-conversions@3.0.1`, `whatwg-url@5.0.0`, `xmlbuilder@10.1.1`
    * `resources/app.asar.unpacked/node_modules` top-level exactos:
      * `@img/colour@1.1.0`, `@img/sharp-win32-x64@0.34.4`, `jszip@3.10.1`, `sharp@0.34.4`
  * En el baseline actual, verificar explícitamente la presencia/ausencia esperada de:
    * `@google-cloud/local-auth@3.0.1` (`PASS`)
    * `googleapis@171.4.0` (`PASS`)
    * `mammoth@1.11.0` (`PASS`)
    * `pdf-parse@1.1.1` (`PASS`)
    * `sharp@0.34.4` (`PASS`)
    * runtime nativo `@img/sharp-win32-x64@0.34.4` (`PASS`)

* [PASS] Sanity check de vulnerabilidades sobre dependencias runtime (mínimo: ausencia de CVEs críticas conocidas en deps incluidas o justificación/mitigación si existen).
  * `npm audit --omit=dev --json` sobre el árbol actual de producción devuelve `0` vulnerabilidades (`0 info`, `0 low`, `0 moderate`, `0 high`, `0 critical`; total `0`).

Criterio de bloqueo:
* Dependencias inesperadas de runtime o material sensible incluido por error.

---

## 12) Checklist mínimo post-empaquetado (artefacto final)

Checklist:
* [PASS] Inspección de contenido del artefacto:
  * Confirmar que solo incluye lo esperado (app + recursos + runtime).
  * Confirmar ausencia de archivos sensibles (tokens, llaves, `.env`, dumps, logs de dev).
  * Confirmar ausencia de material de desarrollo no intencionado (herramientas locales, evidence folders, backups).
  * Confirmar que las páginas renderer incluidas corresponden al set esperado (main/editor/task_editor/preset/language/flotante/info u otras explícitamente aprobadas).
  * Confirmar tratamiento correcto del material import/extract/OCR:
    * presencia esperada de `electron/assets/ocr_google_drive/credentials.json` según el baseline actual del producto,
    * ausencia de `config/ocr_google_drive/token.json` u otro token OCR mutable de usuario,
    * presencia solo de los módulos runtime esperados del flujo import/extract/OCR.

* [PASS] Smoke “renderer containment” sobre el artefacto:
  * Confirmar que renderer no expone Node (`window.require` / `window.process`).
  * Confirmar que funcionalidades principales operan sin pedir permisos no esperados.
  * Confirmar que navegación externa no controlada queda bloqueada (solo flujos permitidos vía main/allowlist).
  * Confirmar que import/extract/OCR funciona bajo el mismo modelo de aislamiento:
    * picker y OAuth salen por diálogos/sistema operativo, no por permisos directos de renderer,
    * renderer no puede redirigir el provider OCR ni abrir destinos externos fuera del flujo permitido.

Criterio de bloqueo:
* Cualquier hallazgo de material dev/sensible dentro del artefacto.
* Inclusión de páginas renderer/HTML no esperadas (no revisadas) en el artefacto.
* Señales de escalamiento renderer→Node (existencia de `window.require`/`window.process` en renderer).
* Inclusión de token OCR mutable de usuario en el artefacto o tratamiento incorrecto del material OCR empaquetado respecto al baseline del producto.

Evidencia mínima sugerida:
* Evidencia de inspección (lista de archivos o capturas del árbol) + prueba mínima de “no Node en renderer”.
* Evidencia verificada en `build-output/win-unpacked`: runtime Electron esperado + `LICENSE.electron.txt` + `LICENSES.chromium.html` + `resources/app.asar` + `resources/app.asar.unpacked`.
* Evidencia verificada dentro de `app.asar`: `LICENSE`, `PRIVACY.md`, `public/index.html`, `editor.html`, `task_editor.html`, `preset_modal.html`, `language_window.html`, `flotante.html`, `editor_find.html`, `public/info/{acerca_de,instrucciones.en,instrucciones.es,links_interes}.html`, `public/fonts/LICENSE_Baskervville_OFL.txt`, `public/extraction_feature_licenses/*`, `electron/assets/ocr_google_drive/credentials.json`.
* No se observó `config/ocr_google_drive/token.json`, `.env`, `tools_local`, `backup`, `dump` ni `evidence` en el artefacto inspeccionado.

---

## 13) Resultado final (cómo cerrar el veredicto)

La app queda marcada como **“suficientemente segura para distribuir este release”** únicamente cuando:
* Ship Gate: todo PASS (incluye runtime security posture + release hygiene), y
* Post-packaging Gate: todo PASS (incluyendo dependencias runtime listadas y revisadas).

Veredicto final: `PASS`  
Artefacto validado: `toT-1.0.0-win-x64.zip`

---
