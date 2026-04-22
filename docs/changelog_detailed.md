# Changelog (detallado)

Historial técnico y narrativo por versión. Incluye decisiones, notas de implementación y contexto.
Orden: versiones más recientes primero.
Antes de publicar una nueva versión, seguir `docs/release_checklist.md`.

---

## Política

### 1) SemVer estricto
- Formato obligatorio: `MAJOR.MINOR.PATCH` (tres componentes), por ejemplo `0.1.0`, `0.1.1`, `0.2.0`, `1.0.0`.
- Regla de incremento (SemVer):
  - **MAJOR**: cambios incompatibles (breaking) en contratos/UX/datos persistidos.
  - **MINOR**: nuevas capacidades **compatibles** (features) o ampliaciones de contratos sin romper.
  - **PATCH**: fixes compatibles, ajustes menores y refactors sin impacto contractual.
- Pre-releases permitidos cuando aplique: `-alpha.N`, `-beta.N`, `-rc.N` (manteniendo `MAJOR.MINOR.PATCH` base).

### 2) Fuente de verdad y tags
- Fuente de verdad única de versión: `package.json` (`app.getVersion()`).
- Tag de release obligatorio en GitHub: `vMAJOR.MINOR.PATCH` (p. ej. `v0.1.0`) o `vMAJOR.MINOR.PATCH-rc.N` (p. ej. `v0.2.0-rc.1`).
- Regla estricta: el updater requiere prefijo `v` (minúscula) en el `tag_name` de la latest release.

### 3) Formato mecánico
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

## Unreleased

### Resumen

- Branding/support links: la superficie fija de sponsorship de la ventana principal deja Patreon y pasa a Ko-fi (`https://ko-fi.com/cibersino/`), manteniendo el bloque compacto de branding y actualizando el asset runtime, el wiring renderer/i18n y la allowlist acotada de enlaces externos.
- Google OCR / OAuth segura (Issue #229): la activación OCR deja de depender de `@google-cloud/local-auth` y pasa a usar un helper propio loopback + navegador del sistema + `state` + PKCE, manteniendo el modelo de dos fases IPC ya existente (`prepare` sin navegador, `launch` con OAuth) y sin introducir churn en la superficie renderer/main ni en i18n.
- Follow-up de robustez sobre ese mismo flujo: el listener loopback queda acotado por timeout y el bind del host IPv6 bracketed (`[::1]`) se normaliza explícitamente antes de `server.listen(...)`, evitando dependencia implícita del tratamiento de hostnames bracketed por el runtime.
- Limpieza del flujo legado: `@google-cloud/local-auth` sale del grafo runtime redistribuido, desaparece de `Acerca de` y de los docKeys/licencias públicas actuales del producto; el contrato histórico queda preservado solo en documentos versionados de releases anteriores.
- Packaging runtime OCR: el artefacto empaquetado deja de depender de un `asarUnpack` amplio para `sharp`/`@img` y pasa a desempaquetar solo los runtimes nativos de `sharp` por plataforma, manteniendo operativa la normalización OCR de `.webp` / `.tif` / `.tiff` en build distribuido sin arrastrar módulos JS ajenos fuera de `app.asar`.
- Packaging UX del release portable: el `.zip` distribuido deja de extraerse con archivos sueltos en la raíz y pasa a quedar reenvuelto bajo una carpeta superior única `toT-<version>/`, alineando el nombre visible del contenedor extraído con la versión publicada.
- Main window / selector section: la zona del texto vigente deja de repartir ownership entre `public/renderer.js` y wiring local disperso; ahora el renderer usa un owner dedicado `public/js/current_text_selector_section.js`, y esa misma sección agrega un checkbox `Spoiler` junto a `Reading speed test` para ocultar el segmento final del preview sin mostrar el separador `... | ...`.

### Agregado

- `electron/import_extract_platform/ocr_google_drive_secure_oauth.js` (nuevo): helper propio de activación OAuth desktop segura para Google OCR; reutiliza el cliente OAuth desktop ya empaquetado, abre el navegador del sistema, levanta callback loopback efímero, genera `state` por transacción y aplica PKCE (`code_verifier` + `code_challenge` S256) antes del intercambio del código.
- `test/unit/electron/ocr_google_drive_secure_oauth.test.js` (nuevo): cobertura dirigida del helper nuevo, incluyendo ruta exitosa con `state` + PKCE, rechazo por `state` inválido, normalización del host loopback IPv6 y timeout cuando no llega callback.
- `build-resources/after-all-artifact-build.js` (nuevo): hook post-build de `electron-builder` que reempaqueta los artefactos `.zip` ya construidos bajo una carpeta raíz `toT-<version>/`.

### Cambiado

- Branding/support links:
  - `public/index.html`, `public/style.css` y `public/js/main_logo_links.js`: el link fijo de sponsorship de la ventana principal deja Patreon y pasa a Ko-fi, preservando el layout compacto existente con IDs/classes/keys renombrados a la nueva plataforma.
  - `electron/link_openers.js`: la allowlist fija de `open-external-url` deja de contemplar Patreon y pasa a permitir `ko-fi.com` / `www.ko-fi.com` para esa superficie de branding.
  - `i18n/*/renderer.json`: la key tooltip `renderer.main.tooltips.cibersino_patreon` se reemplaza por `renderer.main.tooltips.cibersino_kofi` en los bundles root y en el overlay `es-cl`.
  - `website/public/es/index.html`, `website/public/en/index.html` y `website/public/assets/social/`: el bloque público “support/follow” del sitio también deja Patreon y pasa a Ko-fi, con CTA visible y asset social actualizado.
  - `docs/tree_folders_files.md`: se actualiza la documentación viva para reflejar Ko-fi como plataforma vigente de sponsorship y los nuevos assets `public/assets/kofi_symbol.png` y `website/public/assets/social/kofi_symbol.png`.
- `electron/import_extract_platform/import_extract_ocr_activation_ipc.js`:
  - `import-extract-launch-ocr-activation` deja de invocar `authenticate(...)` de `@google-cloud/local-auth` y pasa a delegar en el helper propio `authenticateGoogleLoopback(...)`.
  - el flujo mantiene la persistencia cifrada del token y la validación posterior ya existentes, pero ahora el navegador del sistema recibe una URL OAuth generada por el repo con `access_type=offline`, `prompt=consent`, `state` y PKCE.
- `electron/import_extract_platform/ocr_google_drive_oauth_client.js`:
  - los helpers compartidos OAuth dejan de servir solo a runtime/disconnect y pasan también a centralizar la extracción de la raíz válida de `credentials.json`, la resolución del redirect canónico y la construcción del cliente OAuth2 a partir de credenciales ya validadas.
- Runtime/legal:
  - `package.json` y `package-lock.json`: se elimina `@google-cloud/local-auth` como dependencia runtime directa/transitiva del producto actual.
  - `public/info/acerca_de.html`, `electron/link_openers.js` y `public/third_party_licenses/`: `Acerca de` deja de enumerar `@google-cloud/local-auth` como componente redistribuido, desaparece el docKey `license-import-extract-google-auth` y se elimina la licencia pública repo-managed asociada al helper retirado.
- Packaging/runtime:
  - `package.json`: `electron-builder` deja de usar `asarUnpack` amplio sobre `node_modules/sharp/**/*` y `node_modules/@img/**/*`; el release pasa a declarar solo los runtimes nativos de `sharp` por plataforma (`@img/sharp-win32-x64`, `@img/sharp-darwin-x64`, `@img/sharp-darwin-arm64`, `@img/sharp-linux-x64`) como contenido fuera de `app.asar`.
  - `package.json`: `asar.smartUnpack` se fija en `false` para evitar que la heurística automática marque módulos completos como unpacked por archivos binarios/metadata incidentales no ejecutables.
  - `package.json`: el packaging registra `afterAllArtifactBuild` para postprocesar los `.zip` distribuidos y envolver su contenido final bajo una carpeta raíz versionada `toT-<version>/`, sin cambiar el layout interno producido en `win-unpacked`.
- Ventana principal / selector del texto vigente:
  - `public/renderer.js`: deja de seguir absorbiendo detalles locales del selector del texto vigente y conserva solo el rol de orquestador; el título, el preview, el toolbar local y su lock state pasan a quedar compuestos por un owner específico del renderer.
  - `public/js/current_text_selector_section.js` (nuevo): asume el ownership UI completo de la sección del texto vigente en la ventana principal.
  - `public/index.html` y `public/style.css`: el toolbar del selector agrega un checkbox `Spoiler`, marcado por defecto, a la derecha de `Reading speed test`.
  - `public/js/current_text_selector_section.js`: el preview largo conserva el contrato actual basado en `AppConstants` cuando `Spoiler` está marcado y, cuando se desmarca, oculta el tramo final, elimina `... | ...` y reasigna `PREVIEW_END_CHARS` al tramo inicial visible, devolviendo ahora un truncado explícito `start...`.
  - i18n renderer (`arn`, `de`, `en`, `es`, `fr`, `it`, `pt`): nueva key `renderer.main.reading_tools.preview_spoiler`.
- Documentación viva:
  - `docs/tree_folders_files.md`: se actualiza para reflejar que la activación OCR ya no usa `local-auth`, para registrar el nuevo helper propio `ocr_google_drive_secure_oauth.js` y para documentar el hook de packaging que reenvuelve los `.zip` distribuidos bajo `toT-<version>/`.
  - `docs/tree_folders_files.md`: se amplía también para registrar `public/js/current_text_selector_section.js` como owner UI del selector del texto vigente y del nuevo toggle `Spoiler`.
  - `tools_local/issues/issue_229.md`: el issue deja de ser solo diagnóstico y pasa a incluir la propuesta final adoptada, la nota post-implementación y las decisiones nuevas tomadas durante la ejecución real del cambio.

### Arreglado

- Google OCR / seguridad del flujo:
  - la activación OCR deja de depender de un helper upstream archivado/deprecated que no exponía `state` ni PKCE en el flujo visible revisado; la generación y verificación de ambas protecciones queda ahora bajo control explícito del repo.
- Google OCR / robustez del listener:
  - el listener loopback deja de poder quedar esperando indefinidamente si el navegador se abre pero no llega callback; ahora existe timeout explícito con error interno tipado `oauth_timeout`.
  - redirects OAuth con loopback IPv6 bracketed (`http://[::1]:...`) dejan de depender de que `server.listen(...)` acepte ese hostname tal cual; el helper conserva la forma bracketed en la URL, pero normaliza `"[::1]" -> "::1"` solo para el bind del host del listener.
- Packaging del artefacto distribuido:
  - `resources/app.asar.unpacked` deja de inflarse por globs amplios o por heurísticas de smart-unpack sobre módulos JS sin código nativo; el ZIP final conserva fuera de `app.asar` únicamente el runtime nativo requerido por `sharp` para OCR empaquetado.
  - se evita un falso positivo de `electron-builder` sobre `jszip`, cuyo módulo podía quedar completo fuera de `app.asar` por un archivo de metadata binario/extensionless (`.jekyll-metadata`) ajeno a la ejecución real del producto.
  - el `.zip` portable deja de extraer archivos directamente en la carpeta elegida por el usuario; ahora el artefacto publicado se reempaqueta con una carpeta raíz única `toT-<version>/`, mejorando la ergonomía de extracción sin cambiar el payload distribuido.

### Contratos tocados

- IPC OCR renderer ↔ main:
  - **sin cambio contractual externo**: se mantienen `import-extract-prepare-ocr-activation`, `import-extract-launch-ocr-activation` e `import-extract-disconnect-ocr`, junto con sus shapes generales de request/respuesta y el mismo modelo de éxito/fallo consumido por renderer.
- Surface de errores del flujo OAuth:
  - **sin churn contractual hacia renderer**: los errores internos nuevos `oauth_state_invalid` y `oauth_timeout` no se exponen como codes nuevos del IPC.
  - mapeo actual:
    - `oauth_state_invalid` → code público existente `auth_failed`
    - `oauth_timeout` → code público existente `platform_runtime_failed`
  - ambos preservan `reason` específico en `detailsSafeForLogs` para diagnóstico sin introducir nuevas keys i18n ni nuevas ramas contractuales en renderer.

### Archivos

- `electron/import_extract_platform/import_extract_ocr_activation_ipc.js`
- `electron/import_extract_platform/ocr_google_drive_oauth_client.js`
- `electron/import_extract_platform/ocr_google_drive_secure_oauth.js`
- `test/unit/electron/ocr_google_drive_secure_oauth.test.js`
- `build-resources/after-all-artifact-build.js`
- `public/js/current_text_selector_section.js`
- `public/index.html`
- `public/style.css`
- `i18n/arn/renderer.json`
- `i18n/de/renderer.json`
- `i18n/en/renderer.json`
- `i18n/es/renderer.json`
- `i18n/fr/renderer.json`
- `i18n/it/renderer.json`
- `i18n/pt/renderer.json`
- `package.json`
- `package-lock.json`
- `public/info/acerca_de.html`
- `electron/link_openers.js`
- `public/third_party_licenses/LICENSE_@google-cloud_local-auth_3.0.1.txt` (removido)
- `docs/tree_folders_files.md`
- `tools_local/issues/issue_229.md`

---

## [1.1.0] toT - Testing

### Fecha release y último commit

- Fecha: `2026-04-12`
- Último commit: `91e1b979eefa6f391835f50b7604f2b8f7f1e9a2`

### Resumen

- Reading speed test (Issue #52): el botón `Test de velocidad de lectura` deja de ser un aviso WIP y pasa a abrir un flujo guiado real con modal de entrada/configuración, selección por combinaciones reales del pool y una segunda acción explícita `Start with current text`; según la ruta elegida, la sesión usa texto aleatorio del pool o reutiliza directamente el current text ya cargado, manteniendo cálculo autoritativo de WPM en main, paso opcional de preguntas de comprensión y handoff final al modal de presets con payload prellenado.
- Pool del reading speed test (Issue #209): se agrega un subárbol runtime `config/saved_current_texts/reading_speed_test_pool/`, sincronizado al arranque desde archivos versionados en `electron/reading_test_pool/` mediante hashes de contenido bundled; los archivos del pool siguen siendo snapshots JSON ordinarios con payload opcional `readingTest`, mientras que el estado mutable (`used` y `managedBundledHash`) pasa a `config/reading_test_pool_state.json`, permitiendo refresco y prune de starter files gestionados sin mezclar estado inline.
- Adquisición/import del pool (Issue #208): el modal del pool agrega un link oficial a Google Drive y una acción nativa `Import files...` para instalar `.json` y `.zip`; el importador recuerda la última carpeta usada, resuelve duplicados por nombre de destino dentro del pool runtime y refresca el estado del modal abierto tras cada operación. Esto introduce `adm-zip@0.5.16` como nueva dependencia runtime redistribuida para inspección local de archivos comprimidos y, por tanto, amplía el inventario de terceros redistribuidos del release.
- Snapshots del texto vigente (Issue #201): el botón `💾` de la ventana principal deja de abrir inmediatamente el diálogo nativo y pasa a mostrar primero un modal renderer con tags opcionales `language`, `type` y `difficulty`; al confirmar, recién entonces se abre el save dialog nativo.
- Persistencia de snapshots: el formato deja de ser únicamente `{ "text": "<string>" }` y pasa a aceptar también snapshots etiquetados `{ "text": "<string>", "tags"?: { "language"?, "type"?, "difficulty"? } }`; además, la carga normal tolera payload opcional `readingTest` cuando existe.
- Catálogo compartido de tags de snapshot: los valores permitidos y la canonización de `language` / `type` / `difficulty` dejan de estar duplicados entre renderer y main y pasan a centralizarse en un módulo shared/importable único para evitar drift futuro.
- Corrector ortográfico del editor (Issue #211): la ventana editor agrega un checkbox persistente, habilitado por defecto, y el spellcheck de Electron deja de depender implícitamente del locale del sistema; ahora sigue el idioma activo de la app cuando existe diccionario soportado y se deshabilita explícitamente en tags UI sin diccionario válido (p.ej. `arn`, `es-cl`).
- Tamaño de texto del editor (Issue #212): la ventana editor agrega controles locales `A-` / indicador / `A+` / reset para escalar solo el `textarea`, persiste `editorFontSizePx`, soporta `Ctrl/Cmd +`, `Ctrl/Cmd -` y `Ctrl/Cmd 0`, y mueve su orquestación main-owned a `electron/editor_text_size.js` para no seguir inflando `electron/main.js`.
- Find/Replace del editor (Issue #231): la ventana dedicada Find deja de ser search-only y pasa a soportar un modo expandido de dos filas con `Replace` y `Replace All`, manteniendo el modelo de ventana secundaria controlada desde main, el comportamiento existente de búsqueda/navegación y la semántica actual de apply/current-text del editor. El flujo agrega `Ctrl+H` en Windows/Linux y `Cmd+Option+F` en macOS para abrir expandido, re-sync del query al refocar Find, límite compartido de `512` caracteres entre search y replace, y una ruta renderer-owned para las mutaciones de texto con undo de un solo paso para `Replace` y para el `Replace All` soportado.

### Agregado

- Snapshots / UI:
  - `public/index.html`: nuevo modal renderer `snapshotSaveTagsModal*` con selects opcionales para `language`, `type` y `difficulty`, botón `Save Text Snapshot` y cierre/cancelación explícitos antes del diálogo nativo de guardado.
  - `public/js/snapshot_save_tags_modal.js` (nuevo): módulo renderer dedicado al modal previo al save; aplica i18n, pobla el catálogo de tags y devuelve `{ tags }` o cancelación.
- Editor / spellcheck:
  - `electron/spellcheck.js` (nuevo): módulo main-owned que concentra la política y el controller del spellcheck de Electron; resuelve idiomas soportados a partir del idioma activo de la app y aplica la configuración sobre `session.defaultSession`.
  - `public/editor.html`: el editor agrega un checkbox persistente de corrector ortográfico, habilitado por defecto, dentro de la barra inferior.
  - i18n renderer (`arn`, `de`, `en`, `es`, `es-cl`, `fr`, `it`, `pt`): nueva key `renderer.editor.spellcheck` para la etiqueta del toggle de corrector ortográfico del editor.
- Editor / text size:
  - `electron/editor_text_size.js` (nuevo): controller main-owned del tamaño de texto del editor; encapsula `set/increase/decrease/reset`, persiste `editorFontSizePx` vía settings y expone acciones reutilizables para los atajos del editor y del Find.
  - `public/editor.html`: el editor agrega controles locales `A-`, indicador, `A+` y reset en la barra inferior para escalar solo el `textarea`.
  - i18n renderer (`arn`, `de`, `en`, `es`, `es-cl`, `fr`, `it`, `pt`): nuevas keys `renderer.editor.text_size_label`, `renderer.editor.decrease_text_size`, `renderer.editor.increase_text_size`, `renderer.editor.reset_text_size` y `renderer.editor.text_size_value`.
- Editor / find-replace:
  - `public/js/lib/editor_find_replace_core.js` (nuevo): núcleo puro/importable del replace del editor; centraliza matching literal case-insensitive, cómputo determinista de `Replace All` y chequeo puro de elegibilidad por longitud, sin mover fuera del renderer la mutación real del `textarea`.
  - `test/unit/shared/editor_find_replace_core.test.js` (nuevo): cobertura del núcleo puro de replace (`selectionMatchesLiteralQuery`, `computeLiteralReplaceAll`, `isReplaceAllAllowedByLength`).
  - `test/unit/electron/editor_find_main.test.js` (nuevo): cobertura dirigida del coordinador main-owned del Find/Replace del editor, incluyendo autorización IPC, re-sync request-scoped al refocar la ventana Find, replace request/response y relay de `replaceAllAllowedByLength`.
- Shared catalog:
  - `public/js/lib/snapshot_tag_catalog.js` (nuevo): módulo dual browser/CommonJS que define el catálogo canónico de tags de snapshot, incluyendo el set ampliado de idiomas (`es`, `en`, `pt`, `fr`, `de`, `it`, `arn`, `ja`, `ko`, `ru`, `tr`, `id`, `hi`, `bn`, `ur`, `ar`, `zh-Hans`, `zh-Hant`) y los normalizadores reutilizados por renderer y main.
- Reading speed test:
  - `public/index.html` y `public/style.css`: nuevo modal renderer `readingTestEntryModal*` para el flujo de entrada/configuración del reading speed test, con warning inline de agotamiento del pool, conteo vivo de archivos elegibles, grupos de checkboxes por `language` / `type` / `difficulty`, acción explícita `Reset pool` y segundo CTA `Start with current text`.
  - `public/js/reading_speed_test.js` (nuevo): módulo renderer dedicado al flujo de entrada del reading speed test; sincroniza estado bloqueado con main, refleja combinaciones reales del pool, bloquea interacción durante la estabilización de filtros, ejecuta reset/start por IPC, habilita la ruta alternativa basada en current text y aplica el WPM medido devuelto por main.
  - `public/js/lib/reading_test_filters_core.js` (nuevo): núcleo puro/importable para la semántica del selector del reading speed test (OR dentro de categoría, AND entre categorías activas, conteo de elegibles y enabled/disabled state derivado de combinaciones reales).
  - `public/js/lib/reading_test_questions_core.js` (nuevo): núcleo puro/importable para validar `readingTest.questions`, puntuar respuestas, calcular la probabilidad de acierto al azar, el baseline esperado y la probabilidad exacta de obtener al menos el puntaje observado al responder al azar.
  - `public/reading_test_questions.html`, `public/reading_test_questions.css` y `public/reading_test_questions.js` (nuevos): ventana/modal dedicada para la etapa opcional de preguntas de comprensión, con una sola respuesta por pregunta, resultado agregado, baseline probabilístico y continuación explícita del flujo.
  - `electron/reading_test_questions_preload.js` (nuevo): preload específico del modal de preguntas; expone `window.readingTestQuestionsAPI` y bufferiza/reproduce el payload init para evitar carreras entre el envío desde main y el registro tardío del listener renderer.
  - `electron/reading_test_pool.js` y `electron/reading_test_session.js` (nuevos): helpers main-owned para sincronizar al arranque el starter set del pool usando hashes bundled, mantener el estado mutable del pool en `config/reading_test_pool_state.json`, validar elegibilidad y orquestar la sesión guiada completa del reading speed test, incluyendo la ruta alternativa que usa current text sin tocar el estado del pool.
  - `electron/reading_test_pool_import.js` (nuevo): módulo main-owned del follow-up de adquisición/import; valida `.json`, inspecciona `.zip` localmente y escribe solo candidatos válidos dentro del pool runtime.
  - `config/reading_test_pool_state.json` (nuevo, runtime): persistencia local del estado externo del pool; guarda `used` por `snapshotRelPath` y, para starter files gestionados por la app, el `managedBundledHash` instalado.
  - `config/reading_test_pool_import_state.json` (nuevo, runtime): persistencia local de la última carpeta usada por `Import files...` en el pool del reading speed test.
  - `electron/reading_test_pool/*.json` (nuevos): starter files versionados del pool (`2` con preguntas de comprensión y `2` speed-only) que la app sincroniza al arranque con el subárbol runtime; su contenido permanece libre de estado inline.
- Runtime/legal:
  - `package.json`: se agrega `adm-zip@^0.5.16` como dependencia runtime directa para soportar la importación local de packs `.zip` del pool del reading speed test.
  - `package-lock.json`: se refresca el grafo runtime para incorporar `adm-zip@0.5.16`.
  - `public/third_party_licenses/` (nuevo): pasa a ser la carpeta canónica repo-managed de licencias/notices de terceros redistribuidos; absorbe tanto las licencias runtime anteriores del flujo import/extract como la licencia OFL de Baskervville y la nueva licencia `MIT` de `adm-zip@0.5.16`.
  - `public/info/acerca_de.html` y `electron/link_openers.js`: `Acerca de` pasa a enumerar `adm-zip@0.5.16` como dependencia runtime redistribuida y resuelve todas las licencias repo-managed de terceros desde `public/third_party_licenses/`, manteniendo `LICENSE.electron.txt` y `LICENSES.chromium.html` como notices especiales del artefacto empaquetado.
- i18n/documentación:
  - i18n renderer (`arn`, `de`, `en`, `es`, `es-cl`, `fr`, `it`, `pt`): nuevas keys `renderer.snapshot_save_tags.*` para título, mensaje, labels, botones, accesibilidad y opciones visibles del catálogo de idiomas/tipos/dificultades.
  - i18n renderer (`de`, `en`, `es`, `fr`, `it`, `pt`): nuevas keys `renderer.reading_test.*` y `renderer.alerts.reading_test_*` para el modal de entrada, la acción `Start with current text`, la etapa de preguntas, mensajes inline y alertas/notices del flujo guiado.
  - `public/info/instrucciones.es.html` y `public/info/instrucciones.en.html`: se documenta que `💾` abre primero un modal de tags y que las etiquetas quedan persistidas en el archivo del snapshot pero no se transfieren al estado de texto actual al cargar.

### Cambiado

- `public/js/current_text_snapshots.js`:
  - `saveSnapshot()` deja de saltar directo a IPC y pasa a invocar primero el modal `promptSnapshotSaveTags(...)`.
  - La metadata opcional del snapshot se normaliza contra el catálogo compartido antes de invocar `electronAPI.saveCurrentTextSnapshot(...)`; el flujo save persiste solo tags descriptivos y no inyecta estado runtime del pool del reading speed test.
- `electron/preload.js`:
  - `saveCurrentTextSnapshot(...)` deja de ser un invoke sin argumentos y pasa a aceptar un payload opcional con metadata de save.
  - Se agregan nuevos métodos/listeners `getReadingTestEntryData()`, `resetReadingTestPool()`, `startReadingTest(payload)`, `getReadingTestState()`, `onReadingTestStateChanged(cb)`, `onReadingTestNotice(cb)` y `onReadingTestApplyWpm(cb)` sobre `window.electronAPI`.
- `public/editor.js`, `public/editor.html` y `public/editor.css`:
  - el editor agrega el toggle `spellcheck` en la barra inferior y nuevos controles locales de tamaño de texto para el `textarea`; aplica ambos estados localmente y sincroniza tanto las etiquetas traducidas como `document.documentElement.lang` con `settings-updated`.
- `electron/editor_preload.js` y `electron/settings.js`:
  - el bridge del editor agrega `setSpellcheckEnabled(enabled)` y `setEditorFontSizePx(fontSizePx)`; settings incorpora los campos persistentes `spellcheckEnabled` y `editorFontSizePx`, con IPC dedicados `set-spellcheck-enabled` y `set-editor-font-size-px`.
  - la publicación de settings actualizados sigue saliendo por `settings-updated`, pero ahora también dispara la reaplicación main-owned del spellcheck y del tamaño de texto del editor según corresponda.
- `electron/editor_find_main.js`, `electron/editor_text_size.js` y `electron/main.js`:
  - el coordinador del Find deja de ocuparse solo de navegación y pasa a reenviar `Ctrl/Cmd +`, `Ctrl/Cmd -` y `Ctrl/Cmd 0` hacia un controller main-owned separado; `main.js` conserva solo el wiring de ese controller sin absorber la lógica específica del feature.
- `electron/editor_find_main.js`, `electron/editor_find_preload.js`, `electron/editor_preload.js`, `public/editor_find.js`, `public/editor_find.html`, `public/editor_find.css` y `public/editor.js`:
  - la ventana dedicada Find deja de quedarse en un flujo search-only de una sola fila y pasa a soportar un estado expandido/collapsed main-owned, con toggle explícito, campo `replace`, botones `Replace` / `Replace All` y foco dirigido a query o replace según el atajo de apertura.
  - `Ctrl/Cmd+F` conserva la apertura collapsed y, si la ventana ya existe, preserva su estado expandido/colapsado; `Ctrl+H` (Windows/Linux) y `Cmd+Option+F` (macOS) abren expandido o expanden la misma ventana ya abierta.
  - el coordinador del Find deja de tratar el refocus de la ventana como un mero detalle de UI y pasa a rerunear el query actual como una nueva búsqueda request-scoped contra el texto actual del editor.
  - el pipeline de replace queda dividido explícitamente: main conserva búsqueda, shortcuts, autorización, serialization y espera request-scoped de `found-in-page`; el renderer del editor conserva la mutación real del `textarea`, la validación de selección para `Replace` y el cómputo completo de `Replace All`.
  - `Replace All` queda soportado solo en el small-document path actual: se habilita cuando el editor reporta `replaceAllAllowedByLength === true`, computa el resultado final en memoria y aplica una sola mutación whole-document cuando el texto actual y el texto proyectado siguen dentro de `SMALL_UPDATE_THRESHOLD`.
  - el renderer del Find deja de mostrar la etiqueta visible estática `Find/Search`; el campo de búsqueda queda como control inicial de la fila, y el límite explícito `EDITOR_FIND_INPUT_MAX_CHARS = 512` pasa a aplicarse tanto al input de búsqueda como al de reemplazo.
- `electron/current_text_snapshots_main.js`:
  - el handler `current-text-snapshot-save` valida payloads opcionales de tags, persiste `tags` cuando existen y mantiene la misma política de diálogos nativos / contención bajo `config/saved_current_texts/`.
  - el parser/validador de snapshots deja de aceptar solo `{ text }` y pasa a tolerar también `{ text, tags }`, rechazando shapes inválidas de `tags` de forma explícita.
  - el schema admitido se amplía para aceptar payload opcional `readingTest`, sin transferir esa metadata al current-text state al cargar.
  - el flujo save deja de inyectar estado del pool en los snapshots recién guardados y persiste únicamente `text` más tags descriptivos opcionales.
- `public/renderer.js`:
  - el nuevo modal de tags pasa a formar parte del set de blocking modals de la ventana principal para no cruzarse con drag/drop o con otros flujos que ya respetan `guardUserAction(...)`.
  - el botón `Test de velocidad de lectura` deja de abrir un aviso WIP y pasa a delegar en el módulo `public/js/reading_speed_test.js`; además, la ventana principal incorpora el nuevo lock del reading test dentro de la misma política de `guardUserAction(...)` / blocking modals para impedir acciones concurrentes mientras la sesión guiada está activa.
- `electron/main.js`:
  - deja de tratar el reading speed test como placeholder y pasa a integrar un controlador main-owned (`reading_test_session`) que participa del gating global de interacción, del bloqueo de acciones de la ventana principal y de la reinterpretación de comandos de la ventana flotante mientras la sesión está activa; además, el arranque sincroniza el starter set del pool antes de que el modal pueda abrirse.
  - incorpora un controller `spellcheck` separado del wiring genérico del main; el arranque y los cambios de settings reaplican la política de spellcheck sin volver a inflar `main.js`.
- `electron/reading_test_session.js` y `public/js/reading_speed_test.js`:
  - el flujo de entrada deja de asumir que todo test sobrescribe current text y pasa a soportar dos rutas explícitas: `pool` y `current_text`.
  - la ruta `current_text` ignora filtros/estado del pool, no toca `config/reading_test_pool_state.json` y cancela la sesión preservando el texto vigente del usuario.
- `electron/reading_test_pool_import.js` y `public/js/reading_speed_test.js`:
  - la adquisición/import del pool deja de depender de manipulación manual del filesystem y pasa a soportar link oficial a Google Drive + picker nativo para `.json`/`.zip`.
  - el picker del importador del pool persiste su última carpeta usada en estado propio, separado de `import_extract_state.json`.
  - los duplicados se resuelven explícitamente por nombre de destino dentro de `config/saved_current_texts/reading_speed_test_pool/`, con ramas `Skip duplicates` / `Replace duplicates` / cancelación.
- `public/js/lib/snapshot_tag_catalog.js`:
  - el catálogo queda como fuente de verdad única para los tags descriptivos `language` / `type` / `difficulty`, sin mezclar estado runtime del reading speed test.
- `public/info/instrucciones.es.html` y `public/info/instrucciones.en.html`, `docs/tree_folders_files.md` y `docs/test_suite.md`:
  - se actualizan para documentar el reading speed test, el nuevo subárbol runtime `reading_speed_test_pool`, el estado externo `config/reading_test_pool_state.json`, la sincronización startup del starter set y la nueva suite manual/regresión del flujo guiado.
- Baselines de release:
  - `docs/releases/legal_baseline.md` y `docs/releases/security_baseline.md`: el baseline reusable pasa a contemplar `adm-zip@0.5.16` dentro del set esperado de dependencias runtime redistribuidas y de la cobertura legal/security post-packaging del release.

### Arreglado

- Reading speed test / UX:
  - el agotamiento del pool deja de bloquear el entrypoint con un alert separado; ahora el botón abre el mismo modal de entrada y muestra el warning inline para que el usuario pueda restablecer el pool desde allí.
  - el cálculo final de WPM deja de abortar el flujo cuando el resultado queda fuera del rango operativo de presets `10..700`; ahora el valor se clamp-ea a ese rango y el flujo continúa hasta preguntas/preset creation.
  - el modal de entrada deja de recortar sus acciones inferiores en viewports bajos y pasa a usar `max-height` + scroll interno, manteniendo alcanzables `Reset pool` / `Start`.
  - la ruta `Start with current text` deja de requerir hacks manuales sobre el pool para calibrar un texto ya cargado; ahora puede iniciar la misma sesión guiada sin sobrescribir previamente el current text y, si se cancela, preserva ese texto en lugar de vaciarlo.
- Editor / spellcheck:
  - el editor deja de depender implícitamente del idioma del sistema operativo para elegir diccionario; en plataformas con `setSpellCheckerLanguages(...)`, el spellcheck sigue el idioma activo de la app cuando existe un match soportado.
  - tags UI sin diccionario válido (`arn`, `es-cl`) dejan de producir subrayados engañosos por fallback al locale del SO; ahora el spellcheck se deshabilita explícitamente en esos casos.
  - el campo Find del editor permanece fuera del alcance del spellcheck; la superficie afectada queda acotada al `textarea` principal del editor.
- Editor / find-replace:
  - el Find del editor deja de quedar desfasado respecto del texto actual cuando el usuario vuelve a enfocar la ventana Find tras editar el `textarea`; ahora el refocus dispara una nueva búsqueda request-scoped sobre el texto vigente.
  - `Ctrl+H` / `Cmd+Option+F` deja de comportarse como una simple apertura más grande del Find collapsed; ahora abre o expande el mismo Find directamente en modo replace, con la segunda fila visible y foco dirigido al campo correcto.
  - `Replace` y `Replace All` dejan de depender de un path de mutación implícito y pasan a usar un request/response explícito entre main y editor, manteniendo un undo step por reemplazo simple y un undo step por `Replace All` soportado.
  - `Replace All` deja de quedar disponible fuera del rango soportado del small-document path; cuando el largo actual del `textarea` o el largo proyectado salen de `SMALL_UPDATE_THRESHOLD`, el flujo no muta texto y no introduce ruido de UX ni pasos extra de undo.
- Editor / layout:
  - la barra inferior del editor deja de colapsar el botón de limpiar en una fila huérfana cuando la ventana se angosta; ahora el bloque derecho permanece anclado en la esquina y el wrapping de controles no deja un hueco visual grande debajo de los controles de tamaño de texto.
- Reading speed test / persistencia:
  - la sincronización del starter set deja de depender de abrir el modal; ahora ocurre al arranque y compara hashes de contenido bundled para refrescar solo starter files gestionados por la app.
  - el consumo/reset del pool deja de mutar estado inline dentro de cada JSON; ahora usa `config/reading_test_pool_state.json`, lo que permite conservar los archivos del pool como contenido puro reutilizable por el flujo normal de snapshots.
  - el arranque poda filas de estado huérfanas y elimina starter files gestionados que ya no forman parte del bundle actual.
- Reading speed test / race conditions:
  - la ventana de preguntas deja de poder abrir vacía cuando el payload `reading-test-questions-init` llegaba antes de que el renderer registrara su callback; el preload ahora bufferiza y reproduce el último payload init.

### Contratos tocados

- IPC `current-text-snapshot-save`:
  - antes: sin payload.
  - ahora: acepta payload opcional `{ tags?: { language?, type?, difficulty? } }`.
  - semántica ampliada: la persistencia resultante guarda solo `text` y tags descriptivos canónicos; no inyecta estado runtime del reading speed test.
  - failure-path nuevo: payloads/tag shapes inválidos responden `{ ok:false, code:'INVALID_SCHEMA' }`.
- Storage `config/saved_current_texts/*.json`:
  - antes: shape efectiva `{ "text": "<string>" }`.
  - ahora: shape admitida:
    - `{ "text": "<string>" }`
    - `{ "text": "<string>", "tags"?: { "language"?, "type"?, "difficulty"? } }`
    - `{ "text": "<string>", "tags"?: { "language"?, "type"?, "difficulty"? }, "readingTest"?: { "questions"?: [...] } }`
  - `language` se persiste en forma canónica; en esta iteración incluye `zh-Hans` y `zh-Hant` como valores distintos.
  - la carga normal sigue aplicando únicamente `text`; `readingTest` se tolera sin transferirse al current-text state.
- Storage `config/reading_test_pool_state.json`:
  - shape efectiva: `{ "entries": { "<snapshotRelPath>": { "used": boolean, "managedBundledHash"?: "sha256:..." } } }`.
  - `managedBundledHash` existe solo para starter files gestionados por la app; entradas importadas/usuario mantienen solo `used`.
- IPC `reading-test-get-entry-data` (nuevo):
  - request: sin payload.
  - OK típico: `{ ok:true, canOpen:true, currentTextAvailable:boolean, poolExhausted:boolean, entries:[{ snapshotRelPath, fileName, hasValidQuestions, tags:{...}, used:boolean }, ...], poolDirName:string }`.
  - bloqueado: `{ ok:true, canOpen:false, guidanceKey:string, code:string }`.
- IPC `reading-test-reset-pool` (nuevo):
  - request: sin payload.
  - OK: misma shape que `reading-test-get-entry-data`, ya recomputada tras limpiar `used:false` en `config/reading_test_pool_state.json`.
  - errores: `{ ok:false, code:'UNAUTHORIZED' | 'SESSION_ACTIVE' | 'POOL_RESET_FAILED', guidanceKey?:string }`.
- IPC `reading-test-start` (nuevo):
  - request: `{ sourceMode?: 'pool'|'current_text', selection?: { language?: string[], type?: string[], difficulty?: string[] } }`.
  - OK: `{ ok:true }`.
  - bloqueos/fallos: `{ ok:false, code:string, guidanceKey?:string }`.
- IPC `reading-test-get-state` (nuevo):
  - response: `{ active:boolean, stage:'idle'|'running'|'questions'|'preset', blocked:boolean }`.
- IPC `reading-test-import-pool-files` (nuevo):
  - request: `{ conflictDialog?: { conflictTitle?: string, conflictMessage?: string, conflictDetail?: string, buttons?: { skip?: string, replace?: string, cancel?: string } } }`.
  - cancel picker: `{ ok:true, canceled:true }`.
  - OK import: `{ ok:true, canceled:false, imported:number, skippedDuplicates:number, failedValidation:number, failedArchiveEntries:number, failedWrites:number }`.
  - error: `{ ok:false, code:'UNAUTHORIZED' | 'SESSION_ACTIVE' | 'IMPORT_FAILED', guidanceKey?:string }`.
- Eventos main → renderer (nuevos):
  - `reading-test-state-changed` → state `{ active, stage, blocked }`.
  - `reading-test-notice` → `{ key:string, params?:object, type?:'info'|'warn'|'error' }`.
  - `reading-test-apply-wpm` → `{ wpm:number }`.
- Storage `config/user_settings.json`:
  - schema efectivo ampliado con `spellcheckEnabled:boolean` y `editorFontSizePx:number`.
  - defaults normalizados: `spellcheckEnabled:true` y `editorFontSizePx:20`.
  - `editorFontSizePx` se clamp-ea al rango `12..36` al cargar settings persistidos.
- IPC `set-editor-font-size-px` (nuevo):
  - request: `number` finito en px.
  - OK: `{ ok:true, editorFontSizePx:number }`.
  - invalid input: `{ ok:false, error:'invalid' }`.
- IPC `set-spellcheck-enabled` (nuevo):
  - request: `boolean`.
  - OK: `{ ok:true, enabled:boolean }`.
  - invalid/failure: `{ ok:false, error:'invalid' | string }`.
- IPC Find/Replace del editor:
  - nuevos invokes autorizados desde la ventana Find:
    - `editor-find-replace-current` → request: `string` (`replacement`).
    - `editor-find-replace-all` → request: `string` (`replacement`).
    - `editor-find-toggle-expanded` → request: sin payload.
  - surface de estado publicada a la ventana Find ampliada con:
    - `expanded:boolean`
    - `busy:boolean`
    - `replaceAllAllowedByLength:boolean`
  - nuevo evento main → find window:
    - `editor-find-focus-target` → `{ target:'query'|'replace', selectAll:boolean }`.
- IPC main ↔ editor para replace:
  - nuevo evento main → editor:
    - `editor-replace-request` → `{ requestId:number, operation:'replace-current'|'replace-all', query:string, replacement:string, matchCase:boolean }`.
  - nuevos eventos editor → main:
    - `editor-replace-response` → `{ requestId:number, operation:'replace-current'|'replace-all', ok:boolean, status:string, replacements:number, finalTextLength:number, error:string }`.
    - `editor-replace-status` → `{ replaceAllAllowedByLength:boolean }`.
  - semántica explícita:
    - `Replace` valida la selección actual convertida desde `findInPage` y reemplaza solo esa selección.
    - `Replace All` opera únicamente sobre `editorArea.value`, usa matching literal case-insensitive y solo está soportado cuando el texto actual y el texto proyectado permanecen dentro de `SMALL_UPDATE_THRESHOLD`.
- Preload/editor bridge:
  - nueva superficie `window.editorAPI.setSpellcheckEnabled(enabled)`.
- Preload/find + editor bridge:
  - `window.editorFindAPI` agrega `replaceCurrent(replacement)`, `replaceAll(replacement)`, `toggleExpanded()` y `onFocusTarget(cb)`.
  - `window.editorAPI` agrega `onReplaceRequest(cb)`, `sendReplaceResponse(payload)` y `sendReplaceStatus(payload)`.
- Renderer/UI:
  - nuevos IDs `snapshotSaveTagsModal`, `snapshotSaveTagsModalBackdrop`, `snapshotSaveTagsModalTitle`, `snapshotSaveTagsModalMessage`, `snapshotSaveTagsLanguage`, `snapshotSaveTagsType`, `snapshotSaveTagsDifficulty`, `snapshotSaveTagsModalConfirm`, `snapshotSaveTagsModalCancel` y `snapshotSaveTagsModalClose`.
  - nueva superficie pública renderer `window.Notify.promptSnapshotSaveTags(...)`.
  - nueva superficie shared `window.SnapshotTagCatalog` / módulo CommonJS `snapshot_tag_catalog.js`.
  - nuevos IDs/entrypoints del reading test en ventana principal: `readingTestEntryModal`, `readingTestEntryModalBackdrop`, `readingTestEntryModalTitle`, `readingTestEntryModalIntro`, `readingTestEntryModalWarning`, `readingTestEntryModalEligibleCount`, `readingTestEntryModalReset`, `readingTestEntryModalStart`, `readingTestEntryModalStartCurrentText`, `readingTestEntryLanguageOptions`, `readingTestEntryTypeOptions` y `readingTestEntryDifficultyOptions`.
  - nueva superficie preload/renderer para el cuestionario: `window.readingTestQuestionsAPI`.
  - nuevas superficies shared `window.ReadingTestFiltersCore` / `reading_test_filters_core.js` y `window.ReadingTestQuestionsCore` / `reading_test_questions_core.js`.
  - nuevo ID renderer `spellcheckToggle` en `public/editor.html`.
  - nuevos IDs/entrypoints del Find/Replace del editor: `findToggle`, `replaceRow`, `findReplace`, `findReplaceOne` y `findReplaceAll` en `public/editor_find.html`.
- Semántica explícita:
  - cargar un snapshot etiquetado **no** transfiere `tags` al estado activo de current-text; solo aplica `text`.
  - durante una sesión activa del reading speed test, la ventana principal queda bloqueada y la Ventana flotante deja de operar como cronómetro genérico: `pause` finaliza la sesión y `reset` la cancela.
  - si el reading speed test se inicia con `sourceMode:'current_text'`, el flujo reutiliza el current text ya cargado, no consume entradas del pool y la cancelación deja intacto el texto vigente.
  - si una entrada del pool tiene `readingTest.questions` válido, la etapa de preguntas se inserta antes del modal de presets; si no lo tiene, el flujo continúa directo a preset creation.
  - el spellcheck del editor sigue el idioma activo de la app cuando existe diccionario soportado; si no existe match soportado para el tag UI activo, se deshabilita en lugar de caer al locale del SO.
  - `Ctrl/Cmd+F` abre Find collapsed cuando la ventana está cerrada y preserva el estado expanded/collapsed actual cuando ya está abierta.
  - `Ctrl+H` (Windows/Linux) y `Cmd+Option+F` (macOS) abren Find expanded cuando la ventana está cerrada y expanden la misma ventana si estaba collapsed.
  - refocar la ventana Find con query no vacío relanza ese query contra el texto actual del editor como una nueva búsqueda; las acciones de replace operan sobre esa búsqueda resincronizada y no fuerzan persistencia eager de current-text fuera de la semántica ya existente del editor.

### Archivos

- `public/index.html`
- `public/style.css`
- `public/renderer.js`
- `public/js/current_text_snapshots.js`
- `public/js/snapshot_save_tags_modal.js`
- `public/js/lib/snapshot_tag_catalog.js`
- `public/js/reading_speed_test.js`
- `public/js/lib/reading_test_filters_core.js`
- `public/js/lib/reading_test_questions_core.js`
- `public/reading_test_questions.html`
- `public/reading_test_questions.css`
- `public/reading_test_questions.js`
- `public/editor.html`
- `public/editor.css`
- `public/editor.js`
- `public/editor_find.html`
- `public/editor_find.css`
- `public/editor_find.js`
- `public/js/lib/editor_find_replace_core.js`
- `electron/preload.js`
- `electron/editor_preload.js`
- `electron/editor_find_preload.js`
- `electron/editor_find_main.js`
- `test/unit/shared/editor_find_replace_core.test.js`
- `test/unit/electron/editor_find_main.test.js`
- `docs/test_suite.md`
- `docs/tree_folders_files.md`
- `tools_local/issues/issue_231.md`
- `electron/editor_preload.js`
- `electron/current_text_snapshots_main.js`
- `electron/main.js`
- `electron/settings.js`
- `electron/spellcheck.js`
- `electron/reading_test_pool.js`
- `electron/reading_test_session.js`
- `electron/reading_test_questions_preload.js`
- `electron/reading_test_pool/*.json`
- `electron/reading_test_pool_import.js`
- `i18n/*/renderer.json`
- `public/info/instrucciones.es.html`
- `public/info/instrucciones.en.html`
- `public/info/acerca_de.html`
- `public/third_party_licenses/*`
- `electron/link_openers.js`
- `config/reading_test_pool_import_state.json` (runtime)
- `package.json`
- `test/unit/electron/settings.test.js`
- `test/unit/electron/spellcheck.test.js`
- `test/smoke/electron_launch_smoke.test.js`
- `docs/tree_folders_files.md`
- `docs/test_suite.md`
- `package-lock.json`
- `docs/releases/legal_baseline.md`
- `docs/releases/security_baseline.md`
- `docs/test_suite.md`
- `docs/tree_folders_files.md`

---

## [1.0.0] toT - Sofías fármakon

### Fecha release y último commit

- Fecha: `2026-04-03`
- Último commit: `aff7cf9c87a6081804f72ac84b2f7d86da0bbef9`

### Resumen

- Importación/extracción/OCR: la ventana principal incorpora un flujo único por `📥` y drag/drop para importar texto desde archivos de texto/documento (`.txt`, `.md`, `.html`, `.htm`, `.docx`, `.rtf`, `.odt`), extraer desde imágenes (`.png`, `.jpg`, `.jpeg`, `.webp`, `.bmp`, `.tif`, `.tiff`) y procesar PDFs con elección entre ruta nativa u OCR cuando el PDF tiene texto seleccionable.
- Sitio web de la app: se agrega una landing pública mínima en `https://totapp.org/` y una página dedicada `https://totapp.org/app-privacy/` para la política de privacidad general de la app y del OCR con Google.
- Delta legal del release `1.0.0`: se explicita la postura de import/extract + Google OCR (OCR opcional, OAuth desktop en navegador externo, envío solo de archivos elegidos por el usuario y opción de desconexión), se actualizan las licencias redistribuidas de `@google-cloud/local-auth@3.0.1` y `googleapis@171.4.0`, y `Acerca de` pasa a enumerar los artefactos versionados efectivamente redistribuidos para import/extract.
- Delta de seguridad del release `1.0.0`: se introduce la nueva superficie `import/extract` + OCR opcional con bridges preload/IPC explícitos y enforcement en main, persistencia app-owned bajo `config/import_extract_state.json` y `config/ocr_google_drive/*`, OAuth Google en navegador del sistema con scope fijo `drive.file`, restricciones de sender/límites para presets, Task Editor e import/extract, y sanity post-packaging del runtime de producción sin vulnerabilidades reportadas por `npm audit --omit=dev`.
- Hardening de seguridad/consistencia en `set-current-text`: ahora valida sender IPC en main y deja de confiar `meta.source` proveniente del renderer.
- Selector de texto: la repetición de pegado se unifica para ambos flujos de portapapeles (`📋↺` overwrite y `📋+` append) y se agrega estado visual de advertencia cuando `N > 1`.
- Resultados del conteo (Issue #178): se agrega un multiplicador de tiempo en la ventana principal, debajo del tiempo estimado, para proyectar la misma estimación base `N` veces sin introducir una segunda ruta canónica de cálculo.
- Branding/header principal (Issue #174): el logo de Cibersino pasa a ser clickeable hacia `https://totapp.org/`, se agrega un logo de Patreon clickeable hacia `https://www.patreon.com/Cibersino`, ambos clicks se enrutan por la misma pasarela segura de enlaces externos ya existente y el bloque fijo de branding se reubica a la esquina inferior derecha de la ventana principal en orden visual `Patreon | Cibersino | toT`, eliminando la reserva superior que quedó obsoleta.
- Info modal / links (Issue #165): los fallos al abrir links externos y `appdoc:` desde el info modal dejan de quedar solo en logs y pasan a mostrarse al usuario con una taxonomía final explícita de notificaciones alineada con los reasons reales del runtime.
- Modal de presets / WPM: se corrige la discrepancia entre el mensaje de validación y el rango realmente aceptado al guardar; el warning renderer deja de hardcodear `50..500`, se alinea con el rango operativo vigente `10..700` y main agrega una validación server-side equivalente para persistencia.
- Límite del texto vigente: `MAX_TEXT_CHARS` aumenta de `10_000_000` a `50_000_000` y el límite seguro IPC derivado (`MAX_IPC_CHARS`) aumenta en la misma proporción, de `40_000_000` a `200_000_000`.
- Reading tools / test de velocidad de lectura: la ventana principal deja atrás la noción de “available/spare section”, renombra esa zona como `reading tools` y agrega un botón centrado `Test de velocidad de lectura` que por ahora muestra un aviso WIP bloqueado por los mismos gates de startup/processing de la ventana principal.
- Preload listener APIs (Issue #161): se completa una auditoría repo-wide de preloads y se normalizan los listeners driftados al estándar `onX(cb) -> unsubscribe`, dejando explícitos los casos válidos de replay/buffer sin cambiar canales, payloads ni timing saludable.
- Testing automatizado / CI (Issue #193): el repo deja de tener `npm test` como placeholder y pasa a contar con una baseline automatizada real basada en `node --test`, cobertura inicial de contratos en `electron/**`, extracción de núcleos puros para `count`/`format`, smoke local mínimo de arranque Electron y workflow Windows en GitHub Actions para ejecutar la suite estable.
- Runtime / packaging baseline del release `1.0.0`: se actualiza el runtime a `electron@39.8.6` y el pipeline de empaquetado a `electron-builder@26.8.1`.

### Agregado

- Importación/extracción/OCR:
  - `public/index.html`: nuevo botón `📥` en el selector de texto, estado visible de preparación/procesamiento, barra de ejecución con tiempo transcurrido y botón de cancelación, modal de elección de ruta para PDFs con doble opción, modal final para aplicar el texto extraído (`Sobrescribir` / `Agregar`) con `Repeticiones`, y modal de disclosure previo a la activación de Google OCR.
  - `public/js/import_extract_entry.js`, `public/js/import_extract_drag_drop.js`, `public/js/import_extract_status_ui.js`, `public/js/import_extract_route_choice_modal.js` y `public/js/import_extract_apply_modal.js` (nuevos): flujo compartido selector/drag-drop → preparación → elección de ruta → ejecución → aplicación, incluyendo overlay visual de drop, textos de espera específicos por ruta y captura del tiempo final para el modal de aplicación.
  - `public/js/import_extract_ocr_activation_disclosure_modal.js`, `public/js/import_extract_ocr_activation_recovery.js` y `public/js/import_extract_ocr_disconnect.js` (nuevos): activación OCR con disclosure y link a privacidad antes de abrir OAuth, reintento automático del prepare tras conexión exitosa y acción de desconexión accesible desde `Menú > Preferencias > Desconectar Google OCR`.
- Sitio web:
  - `website/public/index.html` (nuevo): landing pública mínima con metadatos `canonical` / Open Graph, posicionamiento de la app como herramienta de estimación de lectura + OCR y enlace directo a privacidad.
  - `website/public/app-privacy/index.html` (nuevo): página web específica de privacidad para la app, incluyendo alcance local-first, uso opcional de Google OCR, almacenamiento/protección, retención/eliminación y contacto.
- Reading tools / test de velocidad de lectura:
  - `public/index.html`: la sección inferior derecha pasa a contener un botón centrado `Test de velocidad de lectura`.
  - `public/renderer.js`: se agrega wiring renderer para traducir la etiqueta del botón y mostrar `renderer.alerts.wip_reading_speed_test` al hacer click, respetando `guardUserAction(...)`.
  - i18n renderer: se agregan `renderer.main.reading_tools.reading_speed_test` y `renderer.alerts.wip_reading_speed_test` en todos los locales con `renderer.json`.
- Testing automatizado / CI (Issue #193):
  - `.github/workflows/test.yml` (nuevo): workflow mínimo `Test` sobre `windows-latest` que ejecuta `npm ci` y `npm test` en push y pull request.
  - `test/README.md` (nuevo) y estructura `test/unit/**` + `test/smoke/**`: baseline documentada para tests de contrato Node-accessible y smoke local de arranque Electron.
  - `test/unit/electron/*.test.js`: primera ola de cobertura para `settings`, formatos soportados de import/extract, estado de activación OCR, parsing/clasificación de fallos provider-side, prepared store y helpers de decisión de `import_extract_prepare_execute_core`.
  - `test/unit/shared/count_core.test.js` y `test/unit/shared/format_core.test.js` (nuevos): cobertura de los núcleos puros extraídos desde renderer para conteo y formateo.
  - `test/smoke/electron_launch_smoke.test.js` (nuevo): smoke local acotado que lanza la app real con perfil aislado, espera `TOT_SMOKE_READY` y valida cierre limpio sin meter esta ruta en CI.

### Cambiado

- `electron/text_state.js`:
  - `set-current-text` ahora autoriza explícitamente el sender y acepta solo `mainWin`/`editorWin`; otros senders reciben `{ ok:false, error:'unauthorized' }`.
  - `meta.source` pasa a derivarse en main según sender (`editor` o `main-window`), evitando spoofing desde payload renderer.
  - `meta.action` pasa por allowlist blanda (`overwrite`, `append_newline`, `typing`, `typing_toggle_on`, `clear`, `paste`, `drop`, `set`); acciones desconocidas se normalizan a `set` con warning (sin reject duro).
- `public/renderer.js`:
  - Se generaliza la repetición del portapapeles para ambos botones (`overwrite` y `append`) usando helpers compartidos (`normalize/get/project/build`) y una sola semántica de `N`.
  - Renombre de superficie local para reflejar semántica unificada: `appendRepeatInput` → `clipboardRepeatInput`; `MAX_APPEND_REPEAT` → `MAX_CLIPBOARD_REPEAT`.
  - Se incorpora estado visual en vivo para el input de repeticiones (`.is-repeat-active`) cuando el valor efectivo es `> 1`, aplicado tanto en edición directa como tras normalización/clamp.
- UI/i18n/documentación:
  - `public/index.html` y `public/style.css`: renombre a `clipboard-repeat-input` y estilo de advertencia (borde/fondo rojo suave + foco rojo) para `N > 1`.
  - i18n renderer: renombre de key `renderer.main.tooltips/aria.append_repeat*` a `renderer.main.tooltips/aria.clipboard_repeat_count` en todos los locales.
  - `docs/test_suite.md` e instrucciones (`public/info/instrucciones.es.html`, `public/info/instrucciones.en.html`): actualización de casos y texto para dejar explícito que `N` aplica a `📋↺` y `📋+`.
- Resultados del conteo (Issue #178):
  - `public/index.html`: se agrega una nueva fila debajo de `#resTime` con label fijo `x`, input numérico (`min="1"`, `step="1"`) y salida derivada a la derecha.
  - `public/js/results_time_multiplier.js` (nuevo): módulo renderer dedicado que valida números naturales, multiplica a partir de los mismos `{ hours, minutes, seconds }` redondeados que ya ve el usuario y limpia/normaliza estados inválidos (`empty`, `0`, negativos, decimales) al salir del input.
  - `public/renderer.js`: se unifica la renderización del tiempo estimado en un helper compartido para que `#resTime` y el multiplicador reciban exactamente la misma base canónica desde `updatePreviewAndResults(...)` y `updateTimeOnlyFromStats()`.
  - `public/style.css`: ajuste mínimo de layout para la nueva fila del multiplicador; además se reduce un poco la tipografía y el gap vertical de `Words` / `Characters` / `Characters (no spaces)`, se achica el espacio bajo la caja rosada del tiempo estimado y se desplaza levemente la fila del multiplicador hacia la derecha.
  - i18n renderer (`en` / `es`): no se agregan keys nuevas para esta UI final; el chrome del multiplicador queda fijo como `x` a la izquierda y `:` en la salida derivada.
- Branding/header principal (Issue #174):
  - `public/index.html`: la franja superior deja de ocultar el bloque de logos con `aria-hidden`, mantiene `toT` como logo no interactivo, envuelve los logos de Cibersino y Patreon en controles clickeables con tooltip/aria-label y reordena el bloque visible a `Patreon | Cibersino | toT`.
  - `public/style.css`: se ajusta el layout del bloque fijo de branding para soportar los logos clickeables y el nuevo símbolo de Patreon, reubicar el conjunto a la esquina inferior derecha de la ventana principal y eliminar el padding superior extra que había quedado reservado para su antigua posición.
  - `public/js/main_logo_links.js` (nuevo): módulo renderer dedicado que hace el binding de los links fijos del header, aplica tooltips i18n (`es` / `en`) y enruta ambos destinos vía `electronAPI.openExternalUrl(...)`.
  - `public/renderer.js`: integración mínima del nuevo módulo para aplicar traducciones y registrar el binding, manteniendo el wiring fuera del entry file principal.
  - `electron/link_openers.js`: se amplía de forma acotada la allowlist de `open-external-url` para incluir `www.patreon.com`; `totapp.org` ya seguía permitido por la misma superficie.
  - `public/assets/patreon.png`: se agrega asset runtime local para el logo de Patreon, copiado desde `tools_local` en lugar de reutilizar el asset del sitio web.
  - i18n renderer (`en` / `es`): nuevas keys `renderer.main.tooltips.cibersino_website` y `renderer.main.tooltips.cibersino_patreon`.
- Info modal / links (Issue #165):
  - `public/js/info_modal_links.js`: agrega mapeo explícito de reasons IPC a claves de notificación renderer en vez de reutilizar suffixes crudos del runtime; `open-external-url` colapsa a `renderer.info.external.{blocked,error}` y `open-app-doc` colapsa a `renderer.info.appdoc.{blocked,missing,error}`.
  - El flujo renderer ahora dispara `window.Notify.notifyMain(...)` cuando falla la apertura de links externos o docs `appdoc:` desde el info modal, manteniendo el logging estructurado existente.
  - i18n renderer (`arn`, `de`, `en`, `es`, `es-cl`, `fr`, `it`, `pt`): se elimina la key obsoleta `renderer.info.external.missing` y se preserva la taxonomía final alcanzable para external/appdoc.
- Notificaciones / diálogos renderer (Issue #173):
  - `public/js/notify.js` se consolida como owner público único de la superficie de diálogos renderer; `public/renderer.js`, `public/editor.js`, `public/task_editor.js`, `public/preset_modal.js`, `public/js/current_text_snapshots.js`, `public/js/import_extract_entry.js` y `public/js/import_extract_drag_drop.js` pasan a consumir `window.Notify.*` directamente.
  - Los prompts custom de import/extract dejan de publicarse como globals de feature (`window.ImportExtractRouteChoiceModal`, `window.ImportExtractApplyModal`, `window.ImportExtractOcrActivationDisclosureModal`) y pasan a exponerse como `window.Notify.promptImportExtractRouteChoice(...)`, `window.Notify.promptImportExtractApplyChoice(...)` y `window.Notify.promptImportExtractOcrActivationDisclosure(...)`.
  - Se eliminan wrappers/fallbacks locales (`notifyMain(...)`, `showNotice(...)`, `showEditorNotice(...)`, guards repetidos de disponibilidad de `window.Notify`) sin cambiar la semántica healthy-path de los avisos existentes.
  - `window.Notify.notifyMain(...)`, `confirmMain(...)`, `toastMain(...)` y `notifyEditor(...)` pasan a aceptar params opcionales de interpolación i18n, evitando mensajes renderer con límites numéricos hardcodeados cuando la UI ya depende de constantes runtime.
- Modal de presets / validación WPM:
  - `public/preset_modal.js`: el aviso `renderer.preset_alerts.wpm_invalid` pasa a interpolar `{min,max}` desde `WPM_MIN/WPM_MAX` en vez de depender de texto fijo desalineado.
  - `electron/constants_main.js` y `electron/presets_main.js`: se agrega validación server-side explícita para presets fuera del rango operativo `10..700`, endureciendo la persistencia para que no diverja del renderer healthy-path.
  - i18n renderer (`arn`, `de`, `en`, `es`, `es-cl`, `fr`, `it`, `pt`): `renderer.preset_alerts.wpm_invalid` deja de codificar `50..500` y pasa a usar placeholders `{min}` / `{max}`.
- Reading tools / test de velocidad de lectura:
  - `public/index.html` y `public/style.css`: la antigua sección reservada/“available” se renombra a `reading-tools`; el botón ya no cubre toda el área y queda centrado como control normal.
  - i18n renderer (`en`, `es`, `es-cl`, `arn`, `de`, `fr`, `it`, `pt`): se alinea el orden interno de secciones para dejar `reading_tools` antes de `processing`, y en `en` además se reordenan `editor`, `editor_find`, `tasks` y `modal_preset` para mantener consistencia estructural con el resto de locales.
- Importación/extracción/OCR:
  - `public/renderer.js`: deja de contener la mayor parte de la orquestación inline y pasa a cablear módulos dedicados del flujo `📥` / drag/drop, integra el bloqueo por processing-mode, el botón `⛔` de cancelación, la acción de menú `disconnect_google_ocr` y la ruta canónica compartida de aplicación de texto para portapapeles e import/extract.
  - `public/js/text_apply_canonical.js` (nuevo): centraliza `overwrite` / `append` / `repetitions` para que el portapapeles y el modal final de importación/OCR apliquen exactamente la misma semántica de joins, normalización de `N`, proyección de tamaño y escritura vía `set-current-text`.
  - `electron/preload.js`: incorpora la superficie bridge necesaria para el flujo completo (`openImportExtractPicker`, `getPathForFile`, `checkImportExtractPreconditions`, `prepareImportExtractOcrActivation`, `launchImportExtractOcrActivation`, `disconnectImportExtractOcr`, `prepareImportExtractSelectedFile`, `executePreparedImportExtract`, `getImportExtractProcessingMode`, `requestImportExtractAbort`, `onImportExtractProcessingModeChanged`).
  - `electron/menu_builder.js`: `Preferencias` incorpora `Disconnect Google OCR` y el menú pasa a poder avisar al renderer cuando una acción queda bloqueada por processing-mode.
  - `electron/import_extract_platform/ocr_google_drive_route.js`: se agrega un post-procesado acotado al healthy-path OCR que detecta y elimina solo una primera línea compuesta exclusivamente por separadores (`^[ _-]{6,}$`), ignorando un posible BOM UTF-8 y absorbiendo también la línea en blanco inmediata que seguía al artefacto provider-side.
  - `electron/import_extract_platform/import_extract_execute_prepared_ipc.js`: el log main-process `import/extract execute completed` pasa a incluir `warnings` del resultado para que saneamientos no fatales como `ocr_leading_separator_artifact_stripped` queden observables desde terminal sin volverlos notificación UI.
- Preload listener APIs (Issue #161):
  - `electron/editor_preload.js`: `onInitText`, `onExternalUpdate` y `onForceClear` se alinean con el estándar repo `onX(cb) -> unsubscribe`, aislando errores del callback y del `removeListener(...)` local.
  - `electron/preload.js`: `onCurrentTextUpdated` y `onPresetCreated` pasan a retornar unsubscribe; `onPresetCreated` además deja de propagar errores síncronos del callback al preload.
  - `electron/preset_preload.js`, `electron/task_editor_preload.js` y `electron/editor_find_preload.js`: se conservan como casos compliant de replay/buffer explícito, con captura temprana + replay asíncrono para sus payloads de init/estado.
  - `electron/flotante_preload.js` y `electron/language_preload.js`: auditados sin cambios; el primero ya cumplía el contrato de listeners y el segundo no expone listeners.
- Testing automatizado / renderer utilities (Issue #193):
  - `package.json`: `npm test` deja de fallar por placeholder y pasa a ejecutar la baseline estable; además se reservan `test:unit` y `test:smoke` como entrypoints explícitos.
  - `public/js/lib/count_core.js` y `public/js/lib/format_core.js` (nuevos): el comportamiento puro de conteo y formateo se extrae a módulos reutilizables compatibles con browser-script y CommonJS, sin mover la responsabilidad de wiring fuera del renderer.
  - `public/js/count.js` y `public/js/format.js`: se reducen a wrappers de arranque que validan dependencias obligatorias (`window.getLogger`, `window.AppConstants`, `window.CountCore` / `window.FormatCore`, y `window.RendererI18n` en `format`) y publican `window.CountUtils` / `window.FormatUtils` sin cambiar la surface healthy-path.
  - `public/index.html`: carga los nuevos núcleos antes de sus wrappers para mantener el contrato global y permitir cobertura unitaria directa sobre la lógica pura.
  - `electron/main.js`: agrega un hook de smoke local controlado por `TOT_SMOKE_TEST` / `TOT_SMOKE_USER_DATA_DIR` para validar launch+READY con perfil aislado, sin alterar el startup normal fuera de tests.
- Páginas informativas / documentación in-app:
  - `public/info/instrucciones.es.html` y `public/info/instrucciones.en.html`: se documentan el flujo `📥` / drag/drop, los formatos soportados, la decisión nativa/OCR para PDF, el modal final con `Repeticiones`, la privacidad del flujo OCR y la ruta de desconexión de Google OCR.
  - `public/info/acerca_de.html`: se actualizan sitio web, conectividad, privacidad y licencias de componentes incorporados para importación/extracción, OCR, PDF, DOCX y procesamiento de imágenes.
  - Delta legal del release `1.0.0`: se deja explícita la postura documental/legal de import/extract + Google OCR (OCR opcional, OAuth desktop en navegador externo, envío solo de archivos elegidos por el usuario y opción de desconexión dentro de la app), se alinean los archivos redistribuidos de licencias de Google con las versiones efectivas `@google-cloud/local-auth@3.0.1` y `googleapis@171.4.0`, y `Acerca de` pasa a enumerar los artefactos versionados efectivamente redistribuidos para import/extract (`@google-cloud/local-auth@3.0.1`, `googleapis@171.4.0`, `mammoth@1.11.0`, `pdf-parse@1.1.1`, `sharp@0.34.4` y el runtime nativo de `sharp` con su license/notice correspondiente).
- Runtime / packaging baseline del release `1.0.0`:
  - `package.json`: upgrade de `electron` a `39.8.6`, `electron-builder` a `26.8.1`, y alineación de dependencias directas de Google OCR a `@google-cloud/local-auth@3.0.1` + `googleapis@171.4.0`.
  - `package-lock.json`: refresh del árbol runtime/build para dejar el audit de producción en `0 vulnerabilities`, sacar a `Electron` del audit full y reducir el remanente a tooling/dev deps.
  - Validación del baseline: `npm test`, `npm run test:smoke`, `npm run lint`, `npm run dist:win`, `Release smoke` y `Full regression` sobre el release candidate pasan en Windows.

### Arreglado

- Se corrige una brecha de defensa en profundidad: `set-current-text` no aplicaba control de autorización por sender, a diferencia de otros handlers sensibles.
- OCR de imágenes/fotos de página (Issue #191): se corrige la aparición de una línea espuria inicial formada solo por separadores en algunos resultados OCR; la app ahora sanea ese artefacto provider-side antes de aplicar el texto, sin tocar la ruta nativa ni introducir avisos UI nuevos.
- Info modal / links (Issue #165): los fallos de apertura para links externos y documentos `appdoc:` ya no quedan invisibles para el usuario; ahora se notifican en la UI principal con el mismo outcome final que define la taxonomía i18n vigente.
- Modal de presets / WPM: se corrige el drift entre la validación visible (`renderer.preset_alerts.wpm_invalid`) y la aceptación real al guardar presets; el warning ya no anuncia `50..500` cuando la UI opera con `10..700`, y la persistencia rechaza valores fuera del mismo rango canónico del renderer.

### Contratos tocados

- IPC `set-current-text` (failure-path):
  - se formaliza respuesta `unauthorized` para senders no autorizados.
- Sin cambios en canal, shape healthy-path ni superficie de preload (`window.electronAPI.setCurrentText` / `window.editorAPI.setCurrentText` se mantienen).
- UI/i18n (renderer):
  - ID/clase de input de repetición renombrados a `clipboardRepeatInput` / `clipboard-repeat-input`.
  - Keys i18n renombradas a `renderer.main.tooltips.clipboard_repeat_count` y `renderer.main.aria.clipboard_repeat_count`.
  - Sin cambios de contratos IPC/storage asociados al flujo de repetición.
- Resultados del conteo (renderer/UI):
  - nuevos IDs `resultsTimeMultiplierLabel`, `resultsTimeMultiplierInput` y `resultsTimeMultiplierOutput` en la ventana principal.
  - nueva superficie global renderer `window.ResultsTimeMultiplier` con entrypoint `setBaseTimeParts(...)`.
  - sin cambios de IPC, preload, storage o persistencia.
- Branding/header principal:
  - nueva superficie global renderer `window.MainLogoLinks` con entrypoints `applyTranslations(...)` y `bindBrandLinks(...)`.
  - `open-external-url` mantiene el contrato de `https` + allowlist, pero ahora contempla `www.patreon.com` además de `totapp.org` para las superficies fijas de branding.
  - nuevos IDs renderer `devLogoLink`, `patreonLogoLink` y `patreonLogo` en la ventana principal.
  - nuevas keys i18n `renderer.main.tooltips.cibersino_website` y `renderer.main.tooltips.cibersino_patreon` solo en `en` y `es`.
- Info modal / links (renderer/UI):
  - `open-external-url` y `open-app-doc` mantienen sus responses/reasons IPC existentes; el cambio contractual ocurre en renderer, que ahora los mapea explícitamente a `renderer.info.external.{blocked,error}` y `renderer.info.appdoc.{blocked,missing,error}`.
  - `renderer.info.external.missing` deja de ser parte de la taxonomía alcanzable del info modal.
- Importación/extracción/OCR:
  - `window.electronAPI` agrega métodos/handlers `openImportExtractPicker()`, `getPathForFile(file)`, `checkImportExtractPreconditions()`, `prepareImportExtractOcrActivation()`, `launchImportExtractOcrActivation()`, `disconnectImportExtractOcr(payload)`, `prepareImportExtractSelectedFile(payload)`, `executePreparedImportExtract(payload)`, `getImportExtractProcessingMode()`, `requestImportExtractAbort(payload)` y `onImportExtractProcessingModeChanged(cb)`.
  - nueva action ID de menú `disconnect_google_ocr`.
  - nuevos IDs renderer `btnImportExtract`, `importExtractPrepareStatus`, `selectorControlsProcessing`, `importExtractProcessingLabel`, `importExtractProcessingElapsed`, `btnImportExtractAbort`, `importExtractRouteModal*`, `importExtractApplyModal*` e `importExtractOcrActivationDisclosure*`.
  - nuevas superficies globales renderer `window.ImportExtractEntry`, `window.ImportExtractDragDrop`, `window.ImportExtractStatusUi`, `window.ImportExtractRouteChoiceModal`, `window.ImportExtractApplyModal`, `window.ImportExtractOcrActivationDisclosureModal`, `window.ImportExtractOcrActivationRecovery`, `window.ImportExtractOcrDisconnect` y `window.TextApplyCanonical`.
- Notificaciones / diálogos renderer:
  - `window.Notify` se formaliza como superficie pública única de diálogos renderer para avisos bloqueantes, confirmaciones y prompts custom de import/extract.
  - `window.Notify` agrega/expone `confirmMain(...)`, `promptImportExtractRouteChoice(...)`, `promptImportExtractApplyChoice(...)` y `promptImportExtractOcrActivationDisclosure(...)` como entrypoints públicos consolidados.
  - `window.Notify.notifyMain(...)`, `confirmMain(...)`, `toastMain(...)` y `notifyEditor(...)` extienden contrato para aceptar params opcionales de interpolación i18n; llamadas existentes sin params conservan semántica.
  - `window.ImportExtractRouteChoiceModal`, `window.ImportExtractApplyModal` y `window.ImportExtractOcrActivationDisclosureModal` dejan de ser parte de la superficie pública runtime; el wiring interno de esos modales permanece en sus módulos renderer dedicados.
- Modal de presets / validación WPM:
  - `renderer.preset_alerts.wpm_invalid` mantiene la misma key, pero su semántica final pasa a depender de placeholders `{min}` / `{max}` resueltos en runtime en vez de texto estático.
  - `create-preset` y `edit-preset` mantienen canal y shape healthy-path, pero endurecen failure-path para rechazar presets con `wpm` fuera del rango canónico `10..700` también desde main.
- Preload listener APIs (Issue #161):
  - `window.editorAPI.onInitText(cb)`, `window.editorAPI.onExternalUpdate(cb)` y `window.editorAPI.onForceClear(cb)` pasan a seguir el contrato `onX(cb) -> unsubscribe`, manteniendo canales (`editor-init-text`, `editor-text-updated`, `editor-force-clear`), payloads y timing healthy-path.
- IPC `get-app-config`:
  - mantiene el mismo shape `{ ok, maxTextChars, maxIpcChars }`.
  - actualiza sus valores efectivos a `maxTextChars = 50_000_000` y `maxIpcChars = 200_000_000`.
  - `window.electronAPI.onCurrentTextUpdated(cb)` y `window.electronAPI.onPresetCreated(cb)` pasan a seguir el contrato `onX(cb) -> unsubscribe`, manteniendo canales (`current-text-updated`, `preset-created`) y payloads healthy-path.
  - `window.presetAPI.onInit(cb)`, `window.taskEditorAPI.onInit(cb)`, `window.editorFindAPI.onInit(cb)` y `window.editorFindAPI.onState(cb)` quedan explícitamente documentados como listeners de replay/buffer; no cambia su semántica observable de replay asíncrono.
- Sitio web:
  - nuevas rutas públicas `/` y `/app-privacy/` dentro del bundle `website/public`.

### Archivos

- `electron/text_state.js`
- `electron/constants_main.js`
- `electron/preload.js`
- `electron/editor_preload.js`
- `electron/menu_builder.js`
- `public/renderer.js`
- `public/index.html`
- `public/style.css`
- `public/js/results_time_multiplier.js`
- `public/js/main_logo_links.js`
- `public/js/info_modal_links.js`
- `public/js/notify.js`
- `public/js/import_extract_entry.js`
- `public/js/import_extract_drag_drop.js`
- `public/js/import_extract_status_ui.js`
- `public/js/import_extract_route_choice_modal.js`
- `public/js/import_extract_apply_modal.js`
- `public/js/import_extract_ocr_activation_disclosure_modal.js`
- `public/js/import_extract_ocr_activation_recovery.js`
- `public/js/import_extract_ocr_disconnect.js`
- `public/js/text_apply_canonical.js`
- `public/js/current_text_snapshots.js`
- `public/js/constants.js`
- `public/assets/patreon.png`
- `public/preset_modal.js`
- `public/editor.js`
- `public/task_editor.js`
- `i18n/arn/renderer.json`
- `i18n/de/renderer.json`
- `i18n/en/renderer.json`
- `i18n/es/es-cl/renderer.json`
- `i18n/es/renderer.json`
- `i18n/fr/renderer.json`
- `i18n/it/renderer.json`
- `i18n/pt/renderer.json`
- `docs/test_suite.md`
- `docs/tree_folders_files.md`
- `docs/issues/issue_174.md`
- `public/info/acerca_de.html`
- `public/info/instrucciones.es.html`
- `public/info/instrucciones.en.html`
- `website/public/index.html`
- `website/public/app-privacy/index.html`
- `docs/changelog_detailed.md`

---

## [0.1.6] toT - Iteraciones

- Fecha: `2026-02-19`
- Último commit: `f0d7690baa50aa566fd37704a0e591c46ce6565a`

### Resumen

- Selector de texto (Issue #131): nuevo flujo de append iterado con `N` repeticiones en un solo clic de `📋+` (lectura única de portapapeles, normalización/clamp de `N`, validación previa de tamaño y una sola escritura IPC).
- Velocidad de lectura (WPM): el slider de la ventana principal pasa a mapeo no lineal suave (exponencial leve) sin saltos de enteros; se amplía el rango operativo a `10..700` en slider e inputs numéricos.
- Rendimiento/sincronización: corregida la demora de actualización de la ventana principal cuando el editor la cubre completa (`backgroundThrottling:false` en `mainWin`).
- Canonicalización de texto vigente: `electron/text_state.js` normaliza saltos de línea a `LF` (`\n`) tanto en bootstrap como en `set-current-text`, y persiste la versión normalizada cuando corresponde.
- Estado de texto vigente: `public/renderer.js` elimina la doble autoridad local y usa `current-text-updated` como fuente única de sincronización UI.
- Editor manual: endurecimiento de límites de entrada (`beforeinput`) y del pipeline `paste`/`drop` para evitar overshoot/truncado reactivo y ecos locales.

### Agregado

- Selector de texto (Issue #131): nuevo input numérico `appendRepeatInput` junto a `📋+` para repetir append del portapapeles `N` veces en un solo click.
- Task Editor (comentarios): nuevo botón `commentSnapshotClear` (`🗙`) para quitar el `snapshotRelPath` seleccionado de la fila antes de guardar el comentario.
- i18n (accesibilidad): nuevas claves `renderer.main.aria.*` para `wpmInput`, `wpmSlider`, presets de velocidad, toggle de modo preciso y controles del cronómetro/ventana flotante.
- i18n (tareas): nuevas claves `renderer.tasks.buttons.clear_snapshot`, `renderer.tasks.tooltips.snapshot_select` y `renderer.tasks.tooltips.snapshot_clear` en `en`, `es`, `arn`, `de`, `es/es-cl`, `fr`, `it`, `pt`.
- i18n (selector de texto): cobertura de `renderer.main.tooltips.append_repeat` en `arn`, `de`, `es/es-cl`, `fr`, `it`, `pt`.
- Editor: nueva alerta `renderer.editor_alerts.drop_limit` para diferenciar el límite de `drop` del límite de `paste`.

### Cambiado

- `public/renderer.js` (Issue #131): el flujo `📋+` ahora:
  - lee portapapeles una sola vez;
  - normaliza `N` (si no es entero válido `>=1`, usa `1`; clamp superior a `MAX_APPEND_REPEAT`);
  - construye el texto final equivalente a `N` clicks consecutivos, aplicando la regla de joiner por iteración (`\n` o `\n\n` según el acumulado);
  - valida tamaño proyectado contra `maxIpcChars` antes de `setCurrentText(...)`;
  - mantiene una sola llamada a `setCurrentText({ text, meta:{ source:'main-window', action:'append_newline' } })`;
  - mantiene notificación de truncado solo cuando `main` reporta `resp.truncated`.
- UI: ajuste visual de `.append-repeat-input` para diferenciarlo de botones (`btn-standard`) y mejorar legibilidad/foco.
- `public/js/constants.js`: nuevo `MAX_APPEND_REPEAT = 9_999`.
- WPM slider/UI:
  - `public/js/constants.js`: `WPM_MIN/WPM_MAX` pasan a `10/700` y se agregan `WPM_SLIDER_STEP`, `WPM_SLIDER_CURVE` y `WPM_SLIDER_EXP_STRENGTH`.
  - `public/js/wpm_curve.js` (nuevo): módulo de mapeo discreto slider↔WPM (curva `linear/exp`) que garantiza cobertura completa de enteros (`10..700`) sin gaps.
  - `public/renderer.js`: integración mínima del módulo (`wpmFromSliderControl`, `sliderControlFromWpm`, `syncWpmControls`) en init y sincronización slider/input/presets.
  - `public/index.html` y `public/preset_modal.html`: actualización de límites visibles `min/max` de WPM a `10/700`.
- `public/renderer.js`: se elimina la doble autoridad de estado para texto vigente; `clipboard overwrite`, `clipboard append` y `clear` ya no aplican sincronización optimista local y dependen de `current-text-updated` como fuente única.
- `public/renderer.js`: `onCurrentTextUpdated` pasa a requerimiento de arranque (fail-fast) y se valida `hasCurrentTextSubscription` antes de aceptar éxito de `setCurrentText(...)`.
- `public/editor.js`: refactor del pipeline de transferencia de texto (`paste`/`drop`) a un handler común (`handleTextTransferInsert`) con configuración por acción.
- `public/editor.js`: el límite de escritura se controla en `beforeinput` con capacidad real de inserción (`getInsertionCapacity`, contemplando selección), en lugar de truncar post-input.
- `public/editor.js`: `applyExternalUpdate(...)` aplica `suppressLocalUpdate` durante sincronización externa para evitar reenvíos locales no deseados.
- `electron/text_state.js`: normalización de saltos de línea a `LF` (`\n`) en init y en `set-current-text`; si el texto se normaliza/trunca en bootstrap, se persiste la versión canónica.
- `public/js/current_text_snapshots.js`: ajuste de duración de toasts (`save/load` OK a `2500ms`, truncado a `3500ms`).
- `public/task_editor.html`, `public/task_editor.css`, `public/task_editor.js`: ajustes de UI del modal de comentario (cierres `🗙`, botón clear compacto, títulos/aria para snapshot select/clear).
- `electron/editor_find_main.js`: ventana Find del editor sin sombra (`hasShadow:false`) y sin `thickFrame`.
- Documentación/manuales:
  - `docs/test_suite.md`: casos nuevos/actualizados para append repetido, normalización/clamp de `N` y guardas de overflow.
  - `public/info/instrucciones.es.html`, `public/info/instrucciones.en.html`: se documenta el input `1-9999` de repetición de append y su normalización (`N inválido => 1`).
- Assets de manual: actualización de capturas en `public/assets/instrucciones/*` para reflejar UI/flujo vigentes.
- `public/editor.html`: normalización de formato/indentación (sin cambios funcionales).

### Arreglado

- Editor maximizado/cubriendo monitor completo: se corrige la demora de actualización en ventana principal desactivando throttling por oclusión (`backgroundThrottling:false`) en `mainWin`.
- Editor: se corrige el doble update/eco local al recibir sincronizaciones externas desde main.
- Editor: se corrigen edge cases del límite de caracteres al escribir (incluyendo reemplazo de selección y salto de línea), evitando overshoot temporal y truncado reactivo.

### Contratos tocados

- Sin cambios contractuales de IPC/storage/IDs en este tramo; los cambios se concentran en sincronización renderer, validaciones locales, accesibilidad, UX y documentación.

### Archivos

- Main/estado:
  - `electron/main.js`
  - `electron/text_state.js`
  - `electron/editor_find_main.js`
- Renderer/UI:
  - `public/index.html`
  - `public/preset_modal.html`
  - `public/style.css`
  - `public/js/constants.js`
  - `public/js/wpm_curve.js`
  - `public/renderer.js`
  - `public/editor.html`
  - `public/editor.js`
  - `public/js/current_text_snapshots.js`
  - `public/task_editor.css`
  - `public/task_editor.html`
  - `public/task_editor.js`
- i18n:
  - `i18n/arn/renderer.json`
  - `i18n/de/renderer.json`
  - `i18n/en/renderer.json`
  - `i18n/es/es-cl/renderer.json`
  - `i18n/es/renderer.json`
  - `i18n/fr/renderer.json`
  - `i18n/it/renderer.json`
  - `i18n/pt/renderer.json`
- Documentación:
  - `docs/test_suite.md`
  - `public/info/instrucciones.en.html`
  - `public/info/instrucciones.es.html`
- Assets/manual:
  - `public/assets/instrucciones/cronometro.png`
  - `public/assets/instrucciones/editor-manual-sobre-ventana-principal.png`
  - `public/assets/instrucciones/editor-tareas-library.png`
  - `public/assets/instrucciones/editor-tareas.png`
  - `public/assets/instrucciones/guia-basica.gif`
  - `public/assets/instrucciones/resultados-conteo.png`
  - `public/assets/instrucciones/selector-texto-ventana-principal.png`
  - `public/assets/instrucciones/selector-velocidad-ventana-principal.png`
  - `public/assets/instrucciones/toggle-modo-preciso.png`
  - `public/assets/instrucciones/ventana-principal-completa.en.png`
  - `public/assets/instrucciones/ventana-principal-completa.png`

---

## [0.1.5] toT - reemplazo find/search editor

### Fecha release y último commit

- Fecha: `2026-02-18`
- Último commit: `3041dbf630f69500fa36e84d9e2c2536283fd879`

### Resumen de cambios

- Editor (Find/Search): reemplazo del sistema de búsqueda manual embebido por una ventana dedicada, controlada desde main y basada en `webContents.findInPage`.
- Superficie de búsqueda: la UI de búsqueda dejó de coexistir en el mismo DOM del editor; además se redujo exposición de textos de la barra inferior del editor moviendo labels a `data-label` + pseudo-elementos CSS.
- Snapshots: endurecimiento de validaciones y normalización del flujo de selección/carga por ruta relativa (`snapshotRelPath`) para uso desde Task Editor.
- UI/i18n: ajustes de títulos de ventanas (`toT — ...`), nuevas claves de snapshot en tareas y limpieza de textos hardcodeados en inglés en el editor de tareas.
- Cleanup policy gate (Issue #127, Nivel 3): cierre de auditoría bridge file-by-file con foco principal en renderer (`public/**`), más ajustes complementarios en main (`electron/**`), manteniendo intacto el contrato healthy-path.

### Agregado

- Main: nuevo módulo `electron/editor_find_main.js` para búsqueda nativa del editor:
  - ciclo de vida de la ventana de búsqueda (`BrowserWindow` hijo del editor);
  - atajos `Ctrl/Cmd+F`, `F3`, `Shift+F3`, `Esc` vía `before-input-event`;
  - ejecución de `findInPage(...)`, consumo de `found-in-page` y limpieza con `stopFindInPage('clearSelection')`;
  - sincronización de estado `{ query, matches, activeMatchOrdinal, finalUpdate }` hacia la UI de búsqueda.
- Preload: nuevo `electron/editor_find_preload.js` que expone `window.editorFindAPI` para la ventana de búsqueda.
- UI: nueva ventana de búsqueda del editor:
  - `public/editor_find.html`
  - `public/editor_find.css`
  - `public/editor_find.js`
- i18n (tareas): nuevas claves para flujo de snapshot en comentario:
  - `renderer.tasks.buttons.snapshot`
  - `renderer.tasks.buttons.select_snapshot`
  - `renderer.tasks.tooltips.snapshot_load`

### Cambiado

- `electron/main.js`:
  - integra `editorFindMain.attachEditorWindow(editorWin)` al crear editor;
  - registra IPC de find (`editorFindMain.registerIpc(ipcMain)`);
  - cierra la ventana de búsqueda como best-effort al cerrar la main window.
- `electron/settings.js`:
  - `broadcastSettingsUpdated(...)` ahora incluye `editorFindWin`;
  - la política de ocultar menú en ventanas secundarias ahora también aplica a `editorFindWin`.
- `public/editor.html`, `public/editor.css`, `public/editor.js`:
  - se elimina la find bar embebida y el overlay manual de highlights;
  - barra inferior migra a labels por atributo (`data-label`) renderizados por CSS (`::before` / `::after`);
  - `btnCalc` pasa a semántica visual `CALC/SAVE` y checkbox a texto de auto-guardar/auto-recalcular.
- `electron/current_text_snapshots_main.js`:
  - refactor de helpers (`getSnapshotsRoot`, `validateSelectedSnapshot`, `parseSnapshotFile`, etc.);
  - validaciones explícitas de `realpath`, contención y schema antes de responder;
  - diálogos asociados a la ventana dueña del sender (fallback a `mainWin`).
- Task Editor (`public/task_editor.js`, `public/task_editor.html`, `public/task_editor.css`):
  - botones de acción sin fallback hardcodeado en inglés;
  - botón de snapshot de comentario con estilo compacto (`icon-btn--tiny`);
  - ajustes de anchos por defecto de columnas y textos base de modales.
- i18n (`i18n/*/renderer.json` en `arn`, `de`, `en`, `es`, `es/es-cl`, `fr`, `it`, `pt`):
  - títulos de editor/tareas pasan a formato `toT — ...`;
  - cierre de find usa ícono `🗙`;
  - se retiran claves de wrap (`status_wrap_start`, `status_wrap_end`) en `renderer.editor_find`.
- `public/flotante.html`: título actualizado a `toT — Cronómetro flotante`.
- Alineación de failure-mode bridge (Issue #127):
  - **renderer (principal):** se homogeniza el manejo de bridges en `public/**` con fail-fast explícito en dependencias requeridas de arranque (ej. `window.getLogger` y contratos core por módulo), guard + continuidad en capacidades opcionales y diagnósticos no silenciosos/deduplicados;
  - **main (complementario):** se endurece fail-fast explícito de contratos requeridos de registro IPC (`registerIpc` / `registerLinkIpc`) para evitar registro silencioso o fallo implícito;
  - se ajusta dedupe por frecuencia real (`warn/warnOnce`, `error/errorOnce`) siguiendo `electron/log.js` y `public/js/log.js`;
  - se completa evidencia por archivo en `docs/cleanup/_evidence/Issue_127.md` bajo `## Tracking` (incluye ledger por archivo y frontera Level 4).

### Arreglado

- Búsqueda del editor:
  - cierre/reapertura limpia estado activo de búsqueda y retorna foco al textarea del editor;
  - sincronización de navegación con el match activo reportado por `found-in-page`.
- Task Editor:
  - regresión en nombre de tarea: el trim se mueve a validación de guardado (ya no se recorta durante edición en `clampTaskName`).
- Snapshots:
  - mejores diagnósticos y rutas de error (`warn`) en selección/carga desde Task Editor;
  - se reduce ambigüedad de metadatos al aplicar snapshot cargado usando `source: 'main-window'`.
- Bridge/IPC (Issue #127):
  - **renderer (principal):** corrección de rutas con fail-fast implícito, guards faltantes y/o fallback silencioso en módulos de UI/bridge (`public/renderer.js`, `public/editor.js`, `public/task_editor.js`, `public/js/*`, etc.), sin alterar contratos ni ordering;
  - **main (complementario):** corrección puntual de contratos de registro IPC requeridos y validaciones de arranque en módulos `electron/*` auditados;
  - cobertura y consistencia de diagnóstico en rutas opcionales/best-effort sin alterar canalización healthy-path.

### Removido

- Sistema legacy de búsqueda manual en `public/editor.js` (count local, wrap-status local y overlay DOM de resaltado).
- Barra de búsqueda embebida en `public/editor.html` y estilos asociados en `public/editor.css`.

### Contratos tocados

- IPC nuevos (find window → main, `invoke`):
  - `editor-find-set-query`:
    - Payload: `query` (`string`)
    - OK: `{ ok:true, requestId? }`
    - Error: `{ ok:false, error:'unauthorized'|... }`
  - `editor-find-next`:
    - Payload: ninguno
    - OK: `{ ok:true, requestId? }` o `{ ok:true, skipped:'empty query' }`
    - Error: `{ ok:false, error:'unauthorized'|... }`
  - `editor-find-prev`:
    - Payload: ninguno
    - OK: `{ ok:true, requestId? }` o `{ ok:true, skipped:'empty query' }`
    - Error: `{ ok:false, error:'unauthorized'|... }`
  - `editor-find-close`:
    - Payload: ninguno
    - OK: `{ ok:true }`
    - Error: `{ ok:false, error:'unauthorized'|... }`
- IPC nuevos (main → find window, `send`):
  - `editor-find-init`: payload `{ query, matches, activeMatchOrdinal, finalUpdate }`
  - `editor-find-state`: payload `{ query, matches, activeMatchOrdinal, finalUpdate }`
  - `editor-find-focus-query`: payload `{ selectAll:boolean }`
- Preload API nueva (`window.editorFindAPI`):
  - `setQuery(query)`, `next()`, `prev()`, `close()`
  - `onInit(cb)`, `onState(cb)`, `onFocusQuery(cb)`
  - `getSettings()`, `onSettingsChanged(cb)`
- IPC ajustado (snapshot select):
  - `current-text-snapshot-select`:
    - OK (actual): `{ ok:true, snapshotRelPath }`
    - Se removieron del payload OK: `path`, `filename`, `bytes`, `mtime`.
- Issue #127 (Nivel 3): **sin cambios contractuales adicionales** en canales IPC, payload/return shapes, side effects u ordering del healthy-path; los cambios se limitaron a enforcement de failure-path/diagnóstico.

### Archivos

- Main/preload:
  - `electron/main.js`
  - `electron/settings.js`
  - `electron/current_text_snapshots_main.js`
  - `electron/editor_find_main.js` (nuevo)
  - `electron/editor_find_preload.js` (nuevo)
- Renderer/UI:
  - `public/editor.html`
  - `public/editor.css`
  - `public/editor.js`
  - `public/editor_find.html` (nuevo)
  - `public/editor_find.css` (nuevo)
  - `public/editor_find.js` (nuevo)
  - `public/task_editor.html`
  - `public/task_editor.css`
  - `public/task_editor.js`
  - `public/flotante.html`
- i18n:
  - `i18n/arn/renderer.json`
  - `i18n/de/renderer.json`
  - `i18n/en/renderer.json`
  - `i18n/es/renderer.json`
  - `i18n/es/es-cl/renderer.json`
  - `i18n/fr/renderer.json`
  - `i18n/it/renderer.json`
  - `i18n/pt/renderer.json`
- Bridge alignment (Issue #127, auditados):
  - `public/renderer.js`
  - `public/language_window.js`
  - `public/flotante.js`
  - `public/preset_modal.js`
  - `public/editor.js`
  - `public/editor_find.js`
  - `public/task_editor.js`
  - `public/js/crono.js`
  - `public/js/presets.js`
  - `public/js/menu_actions.js`
  - `public/js/i18n.js`
  - `public/js/notify.js`
  - `public/js/current_text_snapshots.js`
  - `public/js/count.js`
  - `public/js/format.js`
  - `public/js/info_modal_links.js`
  - `electron/main.js`
  - `electron/text_state.js`
  - `electron/settings.js`
  - `electron/presets_main.js`
  - `electron/tasks_main.js`
  - `electron/current_text_snapshots_main.js`
  - `electron/editor_find_main.js`
  - `electron/updater.js`
  - `electron/link_openers.js`
  - `electron/menu_builder.js`
  - evidencia consolidada: `docs/cleanup/_evidence/Issue_127.md`

---

## [0.1.4] toT - nuevo editor de tareas y snapshots

### Fecha release y último commit

- Fecha: `2026-02-16`
- Último commit: `6971888588e60adcc94651358195f241f6681138`

### Resumen de cambios

- Snapshots del texto vigente (Issue #50): controles **Cargar/Guardar** con diálogos nativos para guardar el texto vigente como snapshot y cargar uno sobrescribiendo el texto vigente (con confirmación).
- Tareas (Issue #50): nueva ventana para gestionar listas de lectura (tiempo estimado, % completado, tiempo restante, enlaces y comentarios), con controles **Nueva/Cargar** en la ventana principal y persistencia bajo `config/tasks/`.

### Agregado

- Selector de texto (Issue #50): botones `Cargar` y `Guardar` junto a `🗑` en los controles del preview del texto vigente.
- Persistencia (Issue #50): snapshots JSON `{ "text": "<string>" }` bajo `config/saved_current_texts/` (se permiten subcarpetas).
- Main (Issue #50): `electron/current_text_snapshots_main.js`:
  - `showSaveDialog` / `showOpenDialog`;
  - confirmación al **cargar** (reemplazar texto vigente);
  - nombre por defecto `current_text_<N>.json`;
  - saneamiento de nombre: espacios → `_`, y base name restringido a `[A-Za-z0-9_-]` (fuerza `.json`);
  - chequeo de contención bajo `config/saved_current_texts/` usando `realpath` + `relative` (defensa contra escapes).
- Renderer (Issue #50): helper `public/js/current_text_snapshots.js` expone `saveSnapshot()` / `loadSnapshot()` y mapea `{ ok, code }` a `Notify` (sin wiring DOM).
- Selector de texto (Tareas): botones `📝` (nueva tarea) y `🗃️` (cargar tareas) en los controles del preview del texto vigente.
- Ventana (Tareas): nueva ventana **Editor de Tareas** (`public/task_editor.html` + `public/task_editor.js`) con tabla editable:
  - columnas: `Texto`, `Tiempo`, `%`, `R` (restante), `Tipo`, `Enlace`, `Comentario`, `Acciones`;
  - cálculo de **restante** por fila y **total** (sumatoria de restantes);
  - modales de **comentario** y **biblioteca** (cargar filas reutilizables).
- Persistencia (Tareas):
  - listas de tareas bajo `config/tasks/lists/**/*.json`;
  - biblioteca reutilizable bajo `config/tasks/library.json`;
  - allowlist de hosts para enlaces HTTPS bajo `config/tasks/allowed_hosts.json`;
  - anchos de columna del editor bajo `config/tasks/column_widths.json`;
  - posición del Task Editor (solo `x`,`y`) bajo `config/tasks/task_editor_position.json`.
- Main (Tareas): `electron/tasks_main.js` registra IPC para abrir/guardar/cargar/borrar tareas, biblioteca, anchos de columnas y apertura de enlaces (con confirmación y reglas de allowlist).
- Main (Tareas): `electron/task_editor_position.js` persiste/restaura posición (`x`,`y`) del Task Editor y valida contra work areas disponibles (multi-display).
- Preload (Tareas): `electron/task_editor_preload.js` expone `window.taskEditorAPI` (Task Editor) y maneja replay de `task-editor-init` si llega antes de registrar callbacks.

### Cambiado

- `electron/text_state.js`: se extrae `applyCurrentText(...)`; `set-current-text` lo reutiliza; el load de snapshot aplica el texto por el mismo pipeline (normalización/truncado + broadcasts).
- `electron/fs_storage.js`: helpers `getCurrentTextSnapshotsDir()` / `ensureCurrentTextSnapshotsDir()`.
- `electron/main.js`: se incorpora `taskEditorWin` (ventana fija 1200×720, no redimensionable/maximizables) y wiring para abrirla/mostrarla desde IPC; al cerrar `mainWin`, se fuerza el cierre del Task Editor si está vivo.
- `electron/settings.js`: `broadcastSettingsUpdated(...)` incluye `taskEditorWin`; el “hide menu in secondary windows” considera Task Editor.
- `electron/fs_storage.js`: se agregan helpers/paths y `ensureTasksDirs()` para `config/tasks/`; `loadJson()` reconoce `task_editor_position.json` como archivo “known” (nota de primer uso).
- `electron/link_openers.js`: internaliza logger (ya no recibe `log` desde `main`) y simplifica firmas de helpers (`getTempDir`, `copyToTemp`, `openPathWithLog`, `registerLinkIpc`).
- Manual (`public/info/instrucciones.es.html`, `public/info/instrucciones.en.html`): se agrega sección/paso de **Tareas** (Task Editor) y se actualizan notas de persistencia local (incluye tareas).
- Logging/diagnóstico: se agregan mensajes `log.debug('<module> starting...')` al inicio de múltiples módulos main/renderer para trazabilidad de arranque.

### Contratos tocados

- IPC (renderer → main, `invoke`):
  - `current-text-snapshot-save`. Payload: ninguno.
    - OK: `{ ok:true, path, filename, bytes, mtime, length }`
    - Error: `{ ok:false, code:'CANCELLED'|'PATH_OUTSIDE_SNAPSHOTS'|'WRITE_FAILED', message? }`
  - `current-text-snapshot-load`. Payload: ninguno.
    - OK: `{ ok:true, path, filename, bytes, mtime, truncated, length }`
    - Error: `{ ok:false, code:'CANCELLED'|'CONFIRM_DENIED'|'PATH_OUTSIDE_SNAPSHOTS'|'READ_FAILED'|'INVALID_JSON'|'INVALID_SCHEMA', message? }`
  - `open-task-editor`. Payload: `{ mode:'new'|'load' }`
    - OK: `{ ok:true }`
    - Error: `{ ok:false, code:'UNAUTHORIZED'|'UNAVAILABLE'|'CANCELLED'|'PATH_OUTSIDE_TASKS'|'READ_FAILED'|'INVALID_JSON'|'INVALID_SCHEMA', message? }`
- IPC (task editor → main, `invoke`):
  - `task-list-save`. Payload: `{ meta, rows }`
    - OK: `{ ok:true, path, meta }`
    - Error: `{ ok:false, code:'UNAUTHORIZED'|'CANCELLED'|'PATH_OUTSIDE_TASKS'|'INVALID_SCHEMA'|'WRITE_FAILED', message? }`
  - `task-list-delete`. Payload: `{ path }`
    - OK: `{ ok:true }`
    - Error: `{ ok:false, code:'UNAUTHORIZED'|'INVALID_REQUEST'|'CONFIRM_DENIED'|'PATH_OUTSIDE_TASKS'|'WRITE_FAILED', message? }`
  - `task-library-list`. Payload: ninguno.
    - OK: `{ ok:true, items }`
    - Error: `{ ok:false, code:'UNAUTHORIZED'|'READ_FAILED', message? }`
  - `task-library-save`. Payload: `{ row, includeComment }`
    - OK: `{ ok:true }`
    - Error: `{ ok:false, code:'UNAUTHORIZED'|'CONFIRM_DENIED'|'INVALID_SCHEMA'|'READ_FAILED'|'WRITE_FAILED', message? }`
  - `task-library-delete`. Payload: `{ texto }`
    - OK: `{ ok:true }`
    - Error: `{ ok:false, code:'UNAUTHORIZED'|'INVALID_REQUEST'|'NOT_FOUND'|'CONFIRM_DENIED'|'READ_FAILED'|'WRITE_FAILED', message? }`
  - `task-columns-load`. Payload: ninguno.
    - OK: `{ ok:true, widths }` (widths puede ser `null` en primer uso)
    - Error: `{ ok:false, code:'UNAUTHORIZED'|'READ_FAILED', message? }`
  - `task-columns-save`. Payload: `{ widths }`
    - OK: `{ ok:true }`
    - Error: `{ ok:false, code:'UNAUTHORIZED'|'INVALID_SCHEMA'|'WRITE_FAILED', message? }`
  - `task-open-link`. Payload: `{ raw }`
    - OK: `{ ok:true }`
    - Error: `{ ok:false, code:'UNAUTHORIZED'|'CONFIRM_DENIED'|'LINK_MISSING'|'LINK_BLOCKED'|'OPEN_FAILED'|'ERROR', message? }`
- IPC (eventos, `send`):
  - main → task editor: `task-editor-init` (envía `{ mode, task, sourcePath }`).
  - main → task editor: `task-editor-request-close` (handshake de cierre por cambios sin guardar).
  - task editor → main: `task-editor-confirm-close`.
- Preload API (`window.electronAPI`, agregado):
  - `saveCurrentTextSnapshot(): Promise<...>`
  - `loadCurrentTextSnapshot(): Promise<...>`
  - `openTaskEditor(mode: 'new'|'load'): Promise<...>`
- Preload API (`window.taskEditorAPI`, nuevo; disponible en `task_editor.html`):
  - `onInit(cb): unsubscribe`
  - `saveTaskList(payload)`, `deleteTaskList(path)`
  - `listLibrary()`, `saveLibraryRow(row, includeComment)`, `deleteLibraryEntry(texto)`
  - `openTaskLink(raw)`
  - `getColumnWidths()`, `saveColumnWidths(widths)`
  - `getSettings()`, `onSettingsChanged(cb): unsubscribe`
  - `onRequestClose(cb): unsubscribe`, `confirmClose()`
- Storage (nuevo):
  - `config/saved_current_texts/**/*.json`: schema `{ "text": "<string>" }`
  - `config/tasks/lists/**/*.json`: schema `{ meta:{ name, createdAt, updatedAt }, rows:[{ texto, tiempoSeconds, percentComplete, tipo, enlace, comentario }] }`
  - `config/tasks/library.json`: schema `[{ texto, tiempoSeconds, tipo, enlace, comentario? }]`
  - `config/tasks/allowed_hosts.json`: schema `["example.com", ...]`
  - `config/tasks/column_widths.json`: schema `{ "<colKey>": <pxInt>, ... }`
  - `config/tasks/task_editor_position.json`: schema `{ "x": <number>, "y": <number> }`

### Archivos

- `public/index.html`
- `public/renderer.js`
- `public/js/current_text_snapshots.js`
- `electron/current_text_snapshots_main.js`
- `electron/preload.js`
- `electron/text_state.js`
- `electron/fs_storage.js`
- i18n: `i18n/en/renderer.json`, `i18n/es/renderer.json`, `i18n/en/main.json`, `i18n/es/main.json`
- `electron/main.js`
- `electron/tasks_main.js`
- `electron/task_editor_preload.js`
- `electron/task_editor_position.js`
- `electron/settings.js`
- `electron/link_openers.js`
- `electron/menu_builder.js`
- `electron/editor_state.js`
- `electron/presets_main.js`
- `electron/updater.js`
- `public/task_editor.html`
- `public/task_editor.js`
- `public/info/instrucciones.es.html`
- `public/info/instrucciones.en.html`
- `public/js/count.js`
- `public/js/crono.js`
- `public/js/format.js`
- `public/js/i18n.js`
- `public/js/info_modal_links.js`
- `public/js/menu_actions.js`
- `public/js/notify.js`
- `public/js/presets.js`
- `public/language_window.js`

---

## [0.1.3] toT - nueva columna vertebral

### Fecha release y último commit

- Fecha: `2026-02-11`
- Último commit: `20e671f68a2878277acd720e1308b932bc3ba8f8`

### Resumen de cambios

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

### Agregado

- Arranque (Issue #102):
  - Splash overlay bloqueante en `public/index.html` + `public/style.css` (visible al primer paint; captura interacción).
  - Señales de handshake de arranque (IPC, nombres exactos):
    - `startup:renderer-core-ready` (renderer → main)
    - `startup:ready` (main → renderer)
    - `startup:splash-removed` (renderer → main)
  - Preload: helpers en `window.electronAPI` para emitir/escuchar señales de arranque (`sendStartupRendererCoreReady`, `onStartupReady`, `sendStartupSplashRemoved`).

### Cambiado

- Renderer (Issue #102): bootstrap en un único orquestador con secuencia explícita, eliminando:
  - inicializaciones duplicadas,
  - recomputes/refresh de arranque repetidos,
  - dependencias implícitas entre “bloques” paralelos.
- Renderer (Issue #102): **pre-READY effectless**:
  - se registran temprano listeners/suscripciones (para no perder señales/eventos),
  - pero se **gatean solo** efectos visibles y side-effects user-facing antes del desbloqueo,
  - y se permite instalación de estado/cachés necesarias para cerrar el arranque (sin UI effects).
- Main (Issue #102): se introduce un gate explícito para rutas user-triggered (IPC/atajos/ventanas auxiliares):
  - pre-READY: acciones ignoradas con logs deduplicados (sin efectos visibles),
  - post-READY: ejecución normal.
- Menú y atajos (Issue #102):
  - dispatch **late-bound** (resuelve ventana/webContents al momento de invocar; evita capturas tempranas),
  - permanece **inerte** hasta confirmación post-desbloqueo del renderer.
- Flujo de idioma (Issue #102, primera ejecución):
  - resolución determinística (selección o fallback explícito),
  - se evita creación redundante de la ventana principal desde handlers laterales del flujo de idioma.
- Updater (Issue #102): el chequeo inicial se difiere a **post-desbloqueo**, evitando efectos antes de que la app sea realmente utilizable.
- Presets (Issue #102):
  - carga y selección se alinean a “snapshot único” de settings de arranque,
  - resolución de preset seleccionado se vuelve determinística (persistido → currentPresetName → fallback).

### Arreglado

- Cronómetro: el formateo numérico de la velocidad real (WPM) ahora usa `settingsCache.numberFormatting` (mismos separadores que “Resultados del conteo”), evitando defaults hardcodeados y eliminando el warning `format.numberFormatting.missing` (`[WARN][format] numberFormatting missing; using hardcoded defaults.`).
- Cronómetro (Issue #106): al cambiar el modo de conteo (simple/preciso) se aplica la misma política canónica que en cambio de texto (`cronoController.handleTextChange(...)`), evitando `realWpm` stale tras alternar modo:
  - PAUSED (`elapsed > 0`): recálculo inmediato de `realWpm` con el modo vigente.
  - RUNNING: sin pausa ni recálculo (idéntico al cambio de texto vigente).
  - ZERO/RESET (`elapsed == 0`): no se inventa WPM; texto vacío respeta la regla fuerte de reset.
  - Se gatilla por toggle UI y por updates de settings (`settingsChangeHandler`), usando `previousText=null` como sentinel (sin copiar texto).
- Split explícito de responsabilidades para un conteo más ágil:
  - `updatePreviewAndResults(text)`: queda como **único pipeline text-dependiente**. Recalcula preview + conteo (`contarTexto(...)`) + separadores/formato numérico y actualiza chars/palabras/tiempo. En este mismo paso **cachea** los stats en `currentTextStats`.
  - `updateTimeOnlyFromStats()`: updater **WPM-only**. Recalcula **solo** el tiempo (`getTimeParts(currentTextStats.palabras, wpm)`) y actualiza `resTime`, sin preview, sin `contarTexto`, sin formateo/actualización de chars/palabras.
- Entry points WPM-only migrados a `updateTimeOnlyFromStats()`:
  - cambio de preset vía `<select>` (después de `resolvePresetSelection(...)`, manteniendo apply+persist en presets.js)
  - `wpmSlider` (`input`)
  - `wpmInput` (`blur`)
- Flotante (Issue #107): al soltar en el borde entre monitores (Windows 11, 2 pantallas), el clamp del `workArea` ya no desplaza la ventana hacia el centro ni rompe el drag:
  - se removió el path `win32` que hacía snap inmediato en `moved`;
  - el snap se ejecuta solo tras debounce (`endMoveMs`) luego de la última señal `move/moved`, armado por `will-move` (Windows/macOS) y con Linux tratado como user-driven.

### Removido

- Arranque (Issue #102):
  - Renderer: bootstrap duplicado (doble IIFE) reemplazado por un orquestador único.
  - Renderer: llamadas duplicadas de arranque a `updatePreviewAndResults(...)` (un solo kickoff inicial).
  - Renderer: llamada bootstrap a `setCurrentTextAndUpdateUI(...)` para la carga inicial del texto (ahora: instalación de estado pre-READY + UI effects solo post-READY).
  - Main: scheduling del updater antes del desbloqueo (ahora strictly post-desbloqueo).
  - Main: creación de main window desde el cierre de la ventana de idioma (ahora centralizado en resolución determinística).
  - Presets: lectura duplicada de settings dentro del loader (ahora se consume snapshot de settings ya leído en el orquestador).

### Contratos tocados

- IPC (nuevos canales):
  - `startup:renderer-core-ready` (renderer → main). Payload: ninguno.
  - `startup:ready` (main → renderer). Payload: ninguno.
  - `startup:splash-removed` (renderer → main). Payload: ninguno.
- Preload API (`window.electronAPI`, agregado):
  - `sendStartupRendererCoreReady(): void`
  - `onStartupReady(cb: () => void): () => void` (retorna función de unsubscribe)
  - `sendStartupSplashRemoved(): void`
- `electron/menu_builder.js`:
  - `buildAppMenu(lang, opts)` acepta opcionalmente:
    - `resolveMainWindow(): BrowserWindow|null` (late-binding del target)
    - `isMenuEnabled(): boolean` (gate de dispatch)
- `public/js/presets.js` (`window.RendererPresets`):
  - `loadPresetsIntoDom({... , settings?})`: acepta snapshot de settings; ya no lee settings internamente para el arranque.
  - `resolvePresetSelection({...})`: helper explícito para resolver/aplicar/persistir la selección (persistido → fallback).

### Archivos

- electron/main.js
- electron/menu_builder.js
- electron/preload.js
- public/renderer.js
- public/js/presets.js
- public/js/crono.js
- public/index.html
- public/style.css

### Notas

- La interactividad se define por el retiro del splash (**un solo umbral**).
- Menú/atajos se habilitan tras confirmación `startup:splash-removed` (micro-gap intencional y aceptado).
- La previsualización/resultados del texto vigente pueden poblarse inmediatamente después del desbloqueo; el estado del texto y prerrequisitos ya quedaron instalados durante el arranque.

---

## [0.1.2] Con instrucciones

### Fecha release y último commit

- Fecha: `2026-01-16`
- Último commit: `<TBD>`

### Resumen de cambios

- El cronómetro deja de resetearse al modificar el texto vigente cuando el resultado queda **no vacío** (Issue #84).
- El cronómetro **solo** se resetea cuando el texto vigente queda **vacío** (desde cualquier flujo: overwrite/append/vaciar/editor).
- Se refactoriza el subsistema del cronómetro para reducir acoplamiento y eliminar duplicación de wiring/estado en `public/renderer.js`.
- Se habilita el info modal **“Links de interés”** (Issue #83): nuevo `public/info/links_interes.html` con referencia + DOI de Brysbaert (2019), y el menú deja de mostrar WIP.
- Se incorpora i18n del modal para **todos los idiomas disponibles** (keys `renderer.info.links_interes.*`).
- Manual de uso (Issue #85): se reemplaza el placeholder por contenido real con **3 secciones fijas** (IDs `#instrucciones`, `#guia-basica`, `#faq`), se agrega **HTML en inglés**, y se incorporan **assets locales** (PNG/GIF) para capturas/animaciones.
- El modo **Preciso** corrige el conteo de compuestos con guion (Issue #85): `e-mail`, `co-operate` y similares pasan a contar como **1 palabra**.
- Editor manual: se habilita búsqueda **Ctrl+F / Cmd+F** con barra de búsqueda, navegación de coincidencias (Enter/Shift+Enter, F3/Shift+F3), modo modal (no edita texto) y resaltado visible incluso con foco en el input.
- Selector de texto: se actualizan los iconos de overwrite/append del portapapeles a **`📋↺`** y **`📋+`**.

### Agregado

- Editor manual — Find:
  - Barra de búsqueda embebida con input + controles **Prev / Next / Close**.
  - Shortcuts: **Ctrl+F / Cmd+F** (abrir), **Enter / Shift+Enter** (siguiente/anterior), **F3 / Shift+F3** (siguiente/anterior), **Esc** (cerrar).
  - Resaltado visual propio (overlay) para la coincidencia activa, independiente del highlight nativo del `<textarea>`.

### Cambiado

- Reglas de actualización de WPM real (Issue #84):
  - En cambios de texto **no vacío**: no hay reset; la velocidad real solo se actualiza inmediatamente si el cronómetro está **pausado** y `elapsed > 0`.
  - Si `elapsed == 0`, no se recalcula nada (se mantiene estado neutral).
  - Si el cronómetro está **corriendo**, no se fuerza recalcular en el evento de cambio de texto (se mantiene el pipeline normal de actualización).
- Refactor cronómetro:
  - Se mueve el wiring del cronómetro y el “mirror state” del renderer a un controller (`RendererCrono.createController`) en `public/js/crono.js`.
  - Se estandariza el recompute async con un wrapper seguro (`safeRecomputeRealWpm`) para evitar rechazos no manejados.
  - Se eliminan listeners duplicados del input del cronómetro en `public/renderer.js` y se centralizan en el controller.
  - Las reglas por cambio de texto pasan a delegarse al controller (sin que el módulo se adueñe del ciclo de vida del texto).
- Selector de texto:
  - Los botones de overwrite/append del portapapeles cambian sus iconos a **`📋↺`** (sobrescribir) y **`📋+`** (agregar).
- Info modal “Links de interés” (Issue #83):
  - La acción de menú `links_interes` ahora abre `showInfoModal('links_interes')` (en lugar de notificación WIP).
  - Allowlist de links externos: se permite `doi.org` para abrir el DOI desde el modal.
- Manual de uso (Issue #85):
  - El manual deja de usar el enfoque anterior de traducción vía `data-i18n` y pasa a servirse como **HTML localizado por idioma** (ES/EN), manteniendo los IDs contractuales de secciones (`#instrucciones`, `#guia-basica`, `#faq`).
  - Se incorporan capturas/animaciones como **assets locales** (PNG/GIF) referenciados desde el HTML del manual, sin dependencias remotas (CSP-friendly).
- Editor manual — Find (modo modal):
  - Mientras Find está abierto el editor entra en modo **no editable** (readOnly), bloqueando input/paste/drop y capturando navegación global para evitar modificaciones accidentales.
  - Scroll interno al match mediante medición con mirror (no depende de `setSelectionRange()`).
  - Overlay de highlight alineado al scroll del textarea vía `transform` (sin recomputar geometría en cada scroll).

### Arreglado

- Cronómetro (Issue #84):
  - Ya no se pierde el tiempo acumulado al hacer overwrite/append o aplicar cambios desde el Editor manual si el texto vigente queda no vacío.
  - Al quedar el texto vigente vacío, el cronómetro se resetea completamente y queda en estado consistente (elapsed=0 y WPM real en estado neutral).
- Conteo (modo Preciso) — compuestos con guion (Issue #85):
  - Se implementa regla **“alnum join”**: se cuentan como **una sola palabra** secuencias alfa-numéricas unidas por guion **sin espacios** (incluye cadenas con múltiples guiones).
  - Set de guiones aceptados como joiners: `-` (U+002D), `‐` (U+2010), `-` (U+2011), `‒` (U+2012), `–` (U+2013), `−` (U+2212).
- Editor manual — Find:
  - Navegación next/prev ahora **siempre** lleva el scroll interno del textarea a la coincidencia.
  - Con Find abierto, **Enter ya no borra/reemplaza** texto (modo modal + captura de teclas).
  - El resaltado de coincidencia permanece visible aunque el foco se mantenga en el input del buscador (overlay).

### Archivos

- `public/renderer.js`
- `public/js/crono.js`
- `public/js/count.js`
- `public/info/links_interes.html`
- `electron/link_openers.js`
- `public/info/instrucciones.es.html`
- `public/info/instrucciones.en.html`
- `public/assets/instrucciones/*` (PNG/GIF)
- Editor manual (Find):
  - `public/editor.html`
  - `public/editor.css`
  - `public/editor.js`
  - i18n: keys `renderer.editor_find.*` en `i18n/**/renderer.json` (idiomas disponibles)
- i18n: keys `renderer.info.links_interes.*` en `i18n/**/renderer.json` (todos los idiomas disponibles).

---

## [0.1.1] Nuevos idiomas

### Fecha release y último commit

- Fecha: `2026-01-16`
- Último commit: `9b056a8`

### Resumen de cambios

- Se amplía i18n con 5 idiomas nuevos (Mapudungun `arn`, Français `fr`, Deutsch `de`, Italiano `it`, Português `pt`) y se mejoran textos existentes en `es`, `es-cl` y `en`.
- Se refactoriza `public/editor.js` para un manejo más robusto de selección/caret y sincronización con main; incluye el fix del caret al pegar.
- Se ajustan detalles de UX (nota de la ventana de idioma, símbolo del botón de editor) y el comportamiento de preview para textos cortos.
- Se alinea el identificador de acción del menú para el “cargador de imágenes” y se actualizan claves i18n asociadas.
- Se completan y normalizan claves i18n faltantes (ES/EN) detectadas por auditoría: errores de lista de idiomas (`main.menu.language.*`), mensajes del info modal (`renderer.info.external.*` / `renderer.info.appdoc.*`) y fallbacks del modal “Acerca de” (`renderer.info.acerca_de.*`).

### Agregado

- Idiomas UI (manifiesto `i18n/languages.json`):
  - `arn` — Mapudungun
  - `fr` — Français
  - `de` — Deutsch
  - `it` — Italiano
  - `pt` — Português
- Paquetes i18n para cada idioma nuevo:
  - `i18n/<tag>/main.json`, `i18n/<tag>/renderer.json`, `i18n/<tag>/numberFormat.json`.
- i18n:
  - Se agregan traducciones faltantes para:
    - `main.menu.language.empty`, `main.menu.language.invalid`
    - `renderer.info.external.{blocked,missing,error}`
    - `renderer.info.appdoc.{blocked,missing,error}`
    - `renderer.info.acerca_de.version.unavailable`, `renderer.info.acerca_de.env.unavailable`
- Documentación de pruebas manuales:
  - `docs/test_suite.md` (Issue #65).
  - Referenciada en `docs/release_checklist.md` como parte de las pruebas pre-release.

### Cambiado

- README:
  - `README.md` reestructurado y ahora bilingüe (ES/EN), con sección “Documentación” (checklist/changelog/árbol del repo/privacidad).
- Preview:
  - `public/js/constants.js`:
    - `PREVIEW_INLINE_THRESHOLD`: `200` → `1200`.
    - `PREVIEW_START_CHARS`: `350` → `275`.
    - `PREVIEW_END_CHARS`: `230` → `275`.
- UX / labels:
  - Botón de Editor en la ventana principal pasa a símbolo `⌨` (`public/index.html` + traducciones renderer).
  - Ventana de idioma: nota de contribución actualizada a mensaje bilingüe ES/EN (`public/language_window.html`).
- i18n:
  - Ajustes de copy (puntuación, tooltips y mensajes WIP) en `es`, `es-cl` y `en`.
  - Textos del menú en `es-cl` ajustados para herramientas (p. ej. “chupaletras…”).
  - Se alinea el namespace del modal “Acerca de”: `renderer.about.*` → `renderer.info.acerca_de.*` (incluye ajuste de referencias en `public/renderer.js`).
- Constantes:
  - Comentarios explicativos agregados en constantes relevantes:
    - `electron/constants_main.js`
    - `public/js/constants.js`

### Arreglado

- Editor:
  - El caret ya no salta al final del documento después de pegar texto en el editor (Issue #77).
    - Fix implementado en `public/editor.js` mediante utilidades de selección/caret seguras y normalización de inserciones.

### Migración

- No aplica.

### Contratos tocados

- Menú → renderer (action IDs):
  - Acción de menú: `contador_imagen` → `cargador_imagen`.
- i18n (keys de alertas WIP en renderer):
  - `renderer.alerts.wip_contador_imagen` → `renderer.alerts.wip_cargador_imagen`.

### Archivos

- i18n:
  - `i18n/languages.json`
  - `i18n/{es,en,arn,de,fr,it,pt}/(main.json|renderer.json|numberFormat.json)`
  - Ajustes en: `i18n/es/main.json`, `i18n/es/renderer.json`, `i18n/es/es-cl/main.json`, `i18n/es/es-cl/renderer.json`, `i18n/en/renderer.json`
- UI / renderer:
  - `public/index.html`
  - `public/language_window.html`
  - `public/js/constants.js`
  - `public/renderer.js`
  - `public/editor.js`
- Main:
  - `electron/constants_main.js`
  - `electron/menu_builder.js`

### Notas

- El refactor de `public/editor.js` está orientado a robustez (selección/caret y envío a main) sin cambios de contratos IPC.

---

## [0.1.0] Primer release público

### Fecha release y último commit

- Fecha: `2026-01-14`
- Último commit: `dffe1d9`
- Baseline técnico usado para auditoría: `0.0.930` (commit `68a4ef4`) → `dffe1d9`

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

- Queda una advertencia conocida `DEP0040` (`punycode`) al arrancar la app, rastreada al path de `@google-cloud/local-auth`; no aparece en `npm audit --omit=dev`, no bloqueó `Release smoke` / `Full regression`, y se deja como deuda técnica separada de la baseline runtime/packaging cerrada en `1.0.0`.

---

## Históricos

Sin SemVer estricto

### [0.0.930] - 2025-12-11
#### Modularización del proceso principal (Electron)

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

### [0.0.920] - 2025-12-09
#### Depuración y orden del código

##### Modularización de renderer
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

##### i18n unificado
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

### [0.0.910] - 2025-12-07
#### Internacionalización

- Implementación de arquitectura multi-lenguaje.
- UI principal y modales traducidos (renderer/main), incluyendo tooltips y alertas persistentes.
- Páginas de info (acerca_de, readme, instrucciones) cargan textos vía i18n con `data-i18n` y JSON por idioma.
- Defaults `numberFormat` por idioma cargados desde i18n; respeta overrides de usuario.
- Fixes y detalles menores.

---

### [0.0.901] - 2025-12-06
#### UI / Info modal

- Unificación de Guía básica, Instrucciones completas y FAQ en un solo HTML con secciones.
- Mejoras de diseño del infomodal (compartido con Readme y Acerca de).
- Cambio de fuente de letra (Bakersvville) en preview y ventana de texto vigente.
- Ajustes de diseño en ventana principal para nueva fuente.

---

### [0.0.9] - 2025-12-05
#### Ventana flotante del cronómetro + migración del cronómetro a main process

##### Resumen ejecutivo
Se implementó una ventana flotante (VF) funcional y controlable que requirió mover la autoría del cronómetro al main process.
Resultado: cronómetro fiable y sincronizado entre ventana principal y VF, con UX y recursos optimizados.

##### Resultado final (arquitectura)
- Cronómetro autoritativo en `main`; `renderer` y `flotante` operan como clientes:
  - comandos → `main`
  - `crono-state` desde `main` → clientes
- VF implementada como `BrowserWindow` minimalista: movible, always-on-top, semitransparente, con controles ▶ / ⏸ / ⏹ y sin mostrar velocidad.
- Interacción inmediata desde VF: comandos aplican en `main` y el estado se difunde a ambas vistas.
- UX replicada respecto a la versión anterior (cronómetro en renderer), pero robusta frente a throttling/background.

##### Archivos afectados
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

##### Bugs abiertos / observaciones
- VF puede desaparecer al hacer clic sobre ella cuando hay otra aplicación en fullscreen (p. ej., slideshow/juego) — prioridad baja.
- Observación: comportamiento dependiente del SO/gestor de ventanas; por diseño se permitió que la VF ceda topmost en fullscreen (requisito inicial).
  Queda por decidir si se fuerza visibilidad (posibles conflictos UX/OS).

##### Nota técnica (decisión clave)
- Mantener timekeeping en `main` (Date.now + interval) resolvió sincronización y throttling.
- Se priorizó fiabilidad y consistencia por sobre mantener cronómetro en renderer.

---

### [0.0.8] - 2025-12-03
#### Nueva funcionalidad: modo de conteo de texto (y avance multilenguaje)

##### Modo preciso vs. modo simple (UI)
- Se añadió un switch “Modo preciso” en **Resultados del conteo**.
- Activado → conteo **preciso**; desactivado → conteo **simple**.
- Cambiar el modo recalcula automáticamente el texto vigente.
- La preferencia se guarda de forma persistente en `user_settings.json`.
- La configuración se aplica al inicio de la app, garantizando coherencia.

##### Funciones de conteo
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

##### Soporte multilenguaje

* Variable global `idiomaActual` cargada desde `settingsCache.language`.
* Función `setIdiomaActual(nuevoIdioma)` permite cambios dinámicos de idioma.
* `Intl.Segmenter` utiliza el idioma correcto.
* La app puede cambiar idioma dinámicamente y el conteo se adapta sin reinicio.

##### Persistencia y sincronización

* `modeConteo` agregado a `user_settings.json`.
* Cambios emitidos vía IPC (`settings-updated`) para refrescar UI.
* Handlers que modifican `user_settings.json` emiten `settings-updated` automáticamente:

  * `set-language`
  * `create-preset`
  * `edit-preset`
  * `request-delete-preset`
  * `request-restore-defaults`

##### Funciones auxiliares

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

##### Resumen técnico

* Dos sistemas de conteo coexistentes.
* Modo preciso Unicode-aware.
* Persistencia y sincronización automáticas.
* Preparado para soporte multilenguaje.
* Código optimizado: evita lecturas repetidas de settings.

---

### [0.0.7] - 2025-12-02

#### Robustez del texto vigente + mejoras del flujo con editor

##### Mejoras principales

* Límite de tamaño máximo del texto vigente: `MAX_TEXT_CHARS = 10_000_000`.
* Truncado automático y mejor robustez del flujo de edición entre ventana principal y modal editor.

##### Cambios en `main.js`

* Añadido `MAX_TEXT_CHARS = 10_000_000` y truncado automático al cargar `current_text.json`.
* Exposición de `MAX_TEXT_CHARS` vía `get-app-config` (IPC) como fuente de verdad para UI y modal.
* `set-current-text` ahora acepta `{ text, meta }` y devuelve `{ ok, truncated, length, text }`.

  * El truncado se registra en consola y se comunica en la respuesta.
* `manual-init-text` y `manual-text-updated` envían `{ text, meta }` para que el editor aplique actualizaciones diferenciales cuando corresponda (preservando undo/redo).
* Compatibilidad hacia atrás: `set-current-text` sigue aceptando strings.

##### Cambios en `renderer.js`

* UI principal envía `setCurrentText` con `{ text, meta }` y consume `{ ok, truncated, length, text }` para sincronizar preview y avisos.
* `btnAppendClipboardNewLine` corta el texto añadido a la capacidad restante para evitar exceder el límite.
* Mejor interoperabilidad con el editor gracias a metadata (`source`, `action`) en payloads.

##### Cambios en `manual.js`

* Introduce `showNotice` para mensajes no bloqueantes en el editor.
* Inserciones pequeñas por paste/drop usan técnicas nativas (execCommand / setRangeText) para mantener undo/redo cuando sea posible.
* Estandariza `setCurrentText` como `{ text, meta }` con metadata `source/action`.
* `applyExternalUpdate` mejorado para manejar `append_newline`, `init`, `overwrite` y `differential inserts`.
* Truncado y feedback sincronizado: paste/drop/input se truncarán localmente y se notificará al usuario; main confirma truncado vía respuesta.

---

### [0.0.6] - 2025-11-28

#### Menú (habilitación funcional) + presets por defecto

##### Menú / barra superior (funcional)

* Botones informativos habilitados:

  * Guía básica, Instrucciones completas, FAQ, Readme y Acerca de.
* Todos usan un infomodal compartido que carga su HTML correspondiente.

  * Si no se encuentra el HTML, muestra aviso: “No hay contenido disponible para ...”.
* Archivos agregados: `guia_basica.html`, `instrucciones.html`, `faq.html`, `readme.html`, `acerca_de.html`.

##### Notas (CSP / contenido)

* Por el momento esos HTML contienen texto de prueba.
* Al editarlos, verificar que ningún HTML dentro de `public/info/` incluya scripts inline para cumplir CSP
  (con el setup actual no debería generar problemas, pero es una restricción a mantener).

##### Presets por defecto (carpeta editable)

* Botón “Presets por defecto” abre `config/presets_defaults` en el explorador del sistema operativo.
* El usuario puede modificar/eliminar `.json` sin romper la app.

  * Si modifica un archivo, al próximo arranque la app considera nuevos presets por defecto para operaciones normales.
  * Si elimina un archivo desde la carpeta, al próximo arranque la app restaura el archivo de instalación.

**Nota técnica**

* Se usa `shell.openPath(...)`. En entornos empaquetados (asar) funciona si la ruta está fuera del asar
  (la carpeta `config/` está fuera), por lo que no debería presentar problemas.

##### Otros

* Modificaciones menores de diseño para ajustar layout.
* El preset default general cambió su WPM de 240 a 250 y tiene nueva descripción.

---

### [0.0.5] - 2025-11-27

#### Menú/barra superior (estructura) + selector de idioma + presets

##### Menú / barra superior (UI)

* Se habilitó la barra superior reemplazando la barra por defecto de Electron.
* Botones creados (visualmente), agrupados por secciones:

  * ¿Cómo usar la app? → Guía básica, Instrucciones completas, FAQ
  * Herramientas → Cargador de archivo de textos, Contador de palabras en imágenes, Test de velocidad de lectura
  * Preferencias → Idioma; Diseño (Skins, Ventana flotante, Fuentes, Colores); Shortcuts; Presets por defecto
  * Comunidad → Discord; Avisos y novedades
  * Links de interés; COLABORA ($)
  * ? → Actualizar a última versión; Readme; Acerca de

##### Menú (flujo técnico inicial)

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

##### Idioma (primer arranque)

* Nuevo selector de idioma en primer arranque.

##### Presets (optimización sin cambios funcionales buscados)

* Se eliminó la inclusión de `preset_modal.js` en `index.html`; ahora se carga solo en `preset_modal.html`.
* Lógica del modal envuelta en `DOMContentLoaded` y con chequeos de existencia de elementos para evitar errores.

##### Otros

* Calibración del rango del WMP de 100-500 a 50-500.

* Logos nuevos

  * Mejora de logo toT
  * Inserción de logo Cibersino

---

### [0.0.4] - 2025-11-24

#### Renovación completa de UI + nuevos botones

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

### [0.0.3] - 2025-11-22

#### Presets + botón Editar

* Implementación del botón **Editar** con confirmación nativa.
* Consolidación de flujos de presets: Nuevo, Borrar, Restaurar y handlers IPC asociados.
* Funcionalidad estable y retrocompatible de editor y cronómetro.

### Before [0.0.3]

  Tempus edax rerum
  
