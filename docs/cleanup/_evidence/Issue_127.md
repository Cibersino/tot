# Issue #127 Auditoría file-by-file — Nivel 3 (Bridge failure-mode alignment / policy gate)

## Contexto

Estamos haciendo una auditoría **archivo por archivo** enfocada exclusivamente en el **Nivel 3** del protocolo `docs/cleanup/cleanup_file_by_file.md`: un **policy gate** para alinear el manejo de fallas de dependencias bridge/API (preload/IPC/`window.*API`) con la convención del repo.

Este Nivel 3 es un **enforcement gate**: no basta “arreglar 1–2 casos”. El archivo **solo pasa** si queda documentado un inventario + clasificación 1:1 **completo** y el handling de failure-mode queda **enforced** por call-site, sin tocar el **healthy-path**.

Referencia obligatoria: `docs/cleanup/bridge_failure_mode_convention.md` (matriz + checklist).

Refs:
- `docs/cleanup/cleanup_file_by_file.md` (Nivel 3).
- `docs/cleanup/bridge_failure_mode_convention.md` (matriz autoritativa + checklist).

---

## Objetivo (Nivel 3)

Para cada archivo auditado:

1) **Inventariar exhaustivamente** todas las dependencias/paths bridge/API consumidas en ese archivo (sin “for example”, sin “other calls exist”).  
2) **Clasificar 1:1** cada dependencia/path como:
   - **required startup dependency** → fail fast,
   - **optional capability** → guard + continuar con feature deshabilitada + diagnóstico deduplicado,
   - **best-effort side action** (race-prone / droppeable) → intentar; si falla, **drop** sin romper el flujo + diagnóstico “failed (ignored)” deduplicado.
3) Detectar drift:
   - coexistencia no clasificada,
   - handling inconsistente para la misma clase,
   - silent fallbacks,
   - dedupe ausente donde la repetición no aporta,
   - logs mal nivelados (ruido en hot paths vs diagnósticos faltantes).
4) **Enforzar** la convención en **todos** los call-sites bridge del archivo:
   - “Minimal” = cambio mínimo **por sitio** (y helpers locales pequeños si reducen duplicación),
   - cobertura **completa** (no cherry-picking),
   - healthy-path intacto.

### Regla de frontera con Nivel 4

Escalar a Nivel 4 **solo** si corregir un drift exige cambiar **contrato observable (healthy-path)** o requiere cambios cross-file:
- IPC surface, channel names, payload/return shapes,
- side effects o semántica cuando el bridge está correctamente cableado,
- timing/ordering del healthy-path,
- o reordenamientos de startup/registro IPC.

Cambios de **failure-path** (miswire/missing/invalid bridge) **NO** son, por sí solos, “Level 4”.

**Contrato observable (healthy-path)** = comportamiento cuando el bridge está correctamente cableado; los miswire/failure modes son precisamente lo que este gate puede corregir si la convención lo clasifica distinto.

---

## Definiciones y matriz (fuente de verdad)

La convención define 3 clases y su failure-mode esperado:
- Required startup dependency: sin esto no sostienen invariantes → **throw / hard abort** + diagnóstico claro.
- Optional capability: el módulo sigue usable sin esa feature → **guard + skip** + diagnóstico deduplicado.
- Best-effort side action: acción “droppeable” por carrera/estado transitorio (p.ej. target window cerrada) → **no crash; drop** + diagnóstico “failed (ignored)” deduplicado.

Checklist de observabilidad (resumen):
- No silent fallback cuando hay fallback real.
- Si el fallback/miss puede repetirse y no aporta, usar dedupe con key estable y acotada.
- No usar datos dinámicos no acotados en la key.
- En `.js`, diagnósticos dev (logs warn/error y errores lanzados con `throw`) deben ser **English-only**; los nombres propios/identificadores deben mantenerse verbatim (ej.: `modoConteo`, `acerca_de`, `setModeConteo`, keys i18n, channels IPC, object keys, constantes, IDs internos); UI sigue i18n.
- Mantener mecanismo de logger por contexto (`Log.get`/`window.getLogger` en main/renderer, `console` en preload) y estilo de call-site directo (`log.warn|warnOnce|error|errorOnce`, sin wrappers/aliases locales).

---

## Restricciones duras (Nivel 3)

- Preservar IPC surface, channel names, payload/return shapes, side effects y HEALTHY-PATH timing/ordering.
- No reordenar secuenciación de startup dentro de `app.whenReady` (si existe).
- No reordenar registro IPC si pudiera cambiar readiness/races.
- Cambios solo dentro del archivo target.
- No se aceptan “passes” sin **ledger completo**.

---

## Alcance

Este Issue cubre únicamente:
- Archivos `public/**` (renderer) que consumen preload APIs (`window.*API`) y/o paths bridge equivalentes,
- y, si corresponde por dependencia directa, contratos relacionados en main/preload (pero siempre auditando de a un archivo por vez y manteniendo el scope del archivo objetivo).

**No incluye**: refactors generales, mejoras de arquitectura, renombres de canales, cambios de contrato (healthy-path).

---

## Criterio de PASS por archivo

Un `<TARGET_FILE>` pasa Nivel 3 solo si:

- Existe un **Bridge Dependency Ledger** que enumera **todas** las dependencias/paths bridge del archivo.
- Cada entrada tiene **una** clasificación + justificación breve.
- Cada entrada queda como:
  - **ya compliant**, o
  - **corregida en Nivel 3**, o
  - **Level 4 evidence** con motivo **concreto** (qué cambiaría en healthy-path o por qué requiere cross-file).

---

## Procedimiento por archivo (loop)

Para cada `<TARGET_FILE>` seleccionado desde el plan file-by-file:

1) Ejecutar el prompt Nivel 3 (enforcement gate) para ese archivo.  
2) Revisar que el output incluya el **Bridge Dependency Ledger** completo.  
3) Verificar que:
   - no hay “otros calls” sin enumerar,
   - la clasificación es 1:1,
   - la frontera Nivel 4 está aplicada con regla estricta (solo healthy-path / cross-file).  
4) Si `CHANGED`: verificar que el healthy-path quedó preservado y que el failure-path quedó alineado a la matriz.  
5) Registrar el resultado en la tabla de tracking (incluyendo link/ubicación del ledger y Level 4 evidence si aplica).

---

## Prompt Nivel 3 para Codex (copiar/pegar)

```
# Target file: `<TARGET_FILE>`

Level 3 — Bridge dependency failure-mode alignment (policy-driven, enforcement gate).

Objective:
Fully align `<TARGET_FILE>` with the bridge failure-mode convention in
`docs/cleanup/bridge_failure_mode_convention.md` by producing a COMPLETE bridge inventory + classification
AND enforcing the correct failure-mode handling for EVERY bridge dependency/path in this file.

Hard constraints:

* Preserve IPC surface, channel names, payload/return shapes, side effects, and HEALTHY-PATH timing/ordering.
* Do NOT reorder startup sequencing inside `app.whenReady` (if present).
* Do NOT reorder IPC registration in a way that could change readiness/race behavior.
* Keep the logger mechanism defined by runtime context (`electron/log.js` and `public/js/log.js` headers): main/renderer keep repo logger usage; preload stays console-based.
* Call-site style is mandatory: use `log.warn|warnOnce|error|errorOnce` directly; do not add local wrappers/aliases for these methods.
* Scope edits to **`<TARGET_FILE>` AND `docs\cleanup\_evidence\Issue_127.md` only** (no other files).
* You MAY change failure-path behavior (miswire/missing/invalid bridge) to comply with the convention.
  Do NOT claim “changes failure timing/behavior” as Level 4 evidence unless HEALTHY-PATH changes too.
* Level 3 scope guard: this level is ONLY for bridge dependency failure-mode alignment. Do NOT “polish” or refactor unrelated logging/messages. Only add/adjust diagnostics that are strictly required to comply with the bridge failure-mode convention (required fail-fast; optional/best-effort guarded + appropriate diagnostics). Do not rewrite existing logs unless required for that alignment.
* Precedence rule: If there is any tension between the “decision matrix” wording and logging behavior, **the logger headers (`electron/log.js`, `public/js/log.js`) win**. Interpret “dedupe” requirements in the matrix in a way that is consistent with those headers.

Anti-abstraction rule:

* Do NOT introduce helpers/abstractions by default.
* A local helper is allowed ONLY if it clearly improves human readability/maintainability AND is justified by repetition/complexity:
  - typically **3+ call-sites** with the same non-trivial pattern, OR
  - a repeated multi-branch pattern that would otherwise be error-prone if duplicated.

What to do (NO SKIPPING):

1. Exhaustive inventory:
   Enumerate EVERY bridge dependency/path used in this file (no “for example”):
   * all `window.*API` / preload bridge members consumed here,
   * any send-to-window / IPC-adjacent paths invoked from this module.
   For each entry capture:
   * Location anchor (function/section + line or nearest unique snippet),
   * Bridge member/path,
   * Current failure behavior (throw/guard/silent/try-catch/log level/dedupe),
   * Frequency class (startup/rare vs interactive vs potentially high-frequency).

2. Classification (1:1):
   For EACH inventory entry, assign exactly ONE:
   * required startup dependency
   * optional capability
   * best-effort side action
   Add a one-sentence justification grounded in the convention.

3. Drift check:
   Identify ALL drift:
   * inconsistent handling for the same dependency class,
   * unclassified coexistence,
   * silent fallbacks where a real fallback exists,
   * missing dedupe **when the failure can repeat IN HIGH FREQUENCY and repetition adds no diagnostic value**,
   * mis-leveled logging (noise on hot paths vs missing diagnostics).

4. Enforcement (required):
   Apply minimal local changes so that EVERY inventory entry’s handling matches the decision matrix.
   IMPORTANT: “dedupe” MUST be applied in a way that matches the logger headers (see Logging notes).

   * Required -> fail fast (do not continue invalid init path; clear diagnostic)
   * Optional -> guard + continue + diagnostic.
   * Best-effort -> drop without breaking flow + diagnostic when a real intended action is dropped:
   “Minimal” means minimal per-site change; coverage must be complete (no cherry-picking).

5. Level 4 evidence (strict boundary):
   Mark something as Level 4 ONLY if fixing it would change HEALTHY-PATH behavior (when bridge is correctly wired)
   or requires cross-file changes. If you claim Level 4, state EXACTLY:
   * what healthy-path behavior would change (channels/payloads/ordering/side effects),
   * why it cannot be fixed locally in this file without changing contract/timing.

Evidence recording requirement (MANDATORY):

6. Write the evidence directly into `docs\cleanup\_evidence\Issue_127.md` under the section **`##Tracking`**:
   * Locate the tracking table in that section.
   * Insert a new row for `<TARGET_FILE>` (or replace/update the existing row for that file) with:
     - Decision (CHANGED/NO CHANGE)
     - Ledger link/anchor (see below)
     - Coverage OK/NO
     - Drift summary (1–3 bullets, compressed)
     - Changes summary (1–3 bullets, or “none”)
     - Validation summary (1–3 bullets)
     - Level 4 evidence (Y/N + one-line concrete reason)
   * Still under `##Tracking`, add a subsection immediately after the table (or after that file’s row, depending on the doc’s style):
     - Heading: `### <TARGET_FILE>`
     - Paste the FULL “Bridge Dependency Ledger” table for `<TARGET_FILE>` there.
     - Add “Level 4 evidence” details (if any) in bullets.
     - Add the two confirmations (healthy-path preserved; failure-path aligned).
   * Keep the document’s existing formatting and style; do not reformat unrelated sections.

Output requirement (no diffs):

* Decision: CHANGED | NO CHANGE
  * NO CHANGE is acceptable ONLY if the ledger shows every entry is already compliant or correctly escalated.

* Provide a “Bridge Dependency Ledger” table (ALWAYS, both CHANGED and NO CHANGE) with columns:
  [ID | Location anchor | Bridge member/path | Class | Current handling | Required handling | Action taken | Dedupe key (if any)]

* If CHANGED: for each non-trivial change:
  * Gain: one sentence.
  * Cost: one sentence.
  * Validation: how to verify (manual check / smoke path / simple repo grep).

* Confirmations:
  * One explicit sentence confirming healthy-path contract/timing were preserved.
  * One explicit sentence confirming failure-path handling was aligned to the convention.

* Logging notes:
  * Dev diagnostics in `.js` must be English-only (non-user-facing), including warning/error logs and thrown errors (`throw new Error(...)`, `throw ...`).
  * Proper names / identifiers must remain verbatim inside those diagnostics (function/method names, i18n keys, config/object keys, IPC channel names, constants, internal IDs such as `modoConteo`, `acerca_de`, `setModeConteo`).
  * Dedupe keys must be stable/bounded (no user input or unbounded dynamic data in keys).
  * Use `warnOnce/errorOnce` only for high-frequency repeatable misses/failures where repetition adds no diagnostic value; otherwise use by default `warn/error`.
  * If a fallback is BOOTSTRAP-only, the message and the explicit dedupe key must start with `BOOTSTRAP:` and that path must become unreachable after init. (see)
  * The concrete logger behavior/signatures come from the runtime logger headers (`electron/log.js`, `public/js/log.js`). Follow those headers; do not invent alternative logging conventions.

Final response rule:
- In your chat response, do NOT paste the full ledger. Only state:
  1) Decision,
  2) which files you modified (`<TARGET_FILE>`, `docs\cleanup\_evidence\Issue_127.md`),
  3) where in `Issue_127.md` you inserted the evidence (confirm it is under `##Tracking` and under `### <TARGET_FILE>`),
  4) confirmations about healthy-path and failure-path alignment.
```

---

## Tracking (actualizar en este Issue)

| File | Decision | Ledger (ubicación) | Cobertura inventario (OK/NO) | Drift detectado (resumen) | Cambios aplicados (resumen) | Validación | Level 4 evidence (Y/N + motivo concreto) |
|------|----------|---------------------|------------------------------|---------------------------|-----------------------------|------------|------------------------------------------|
| public/renderer.js | CHANGED | [### public/renderer.js](#publicrendererjs) | OK | - Había call-sites IPC opcionales sin guard/dedupe (clipboard/setCurrentText/openEditor/delete/restore/check updates y getters de startup).<br>- Había fallbacks opcionales silenciosos o sin dedupe (InfoModalLinks, helpers de idioma, acciones task/preset/menu).<br>- FormatUtils estaba en soft-fail pese a ser dependencia de arranque requerida. | - Se añadió helper local getOptionalElectronMethod y se aplicó guard + diagnóstico deduplicado por sitio opcional.<br>- FormatUtils quedó en fail-fast explícito (required startup dependency) y getLogger pasó a fail-fast explícito.<br>- Se eliminaron fallbacks silenciosos en rutas opcionales con warnOnce estable y acotado. | - node --check public/renderer.js OK.<br>- Grep de call-sites confirma que los métodos opcionales antes desprotegidos ahora tienen guard local/dedupe.<br>- Healthy-path smoke: sin cambios en canales/payloads/ordering/side-effects. | N - no requirió cambios de contrato healthy-path ni cambios cross-file. |
| public/language_window.js | CHANGED | [### public/language_window.js](#publiclanguage_windowjs) | OK | - `window.getLogger` tenía fallback implícito a `console`, sin fail-fast como dependencia de arranque requerida.<br>- `window.languageAPI.setLanguage` estaba sin guard explícito y dependía del catch para missing bridge, con ruido repetible en interacción.<br>- Coexistían paths opcionales con y sin diagnóstico deduplicado. | - `window.getLogger` quedó con fail-fast explícito (`throw`) cuando falta contrato bridge.<br>- Se agregó guard para `window.languageAPI.setLanguage` con `warnOnce` estable y retorno seguro sin romper el flujo de UI.<br>- Se mantuvo sin cambios el fallback BOOTSTRAP de `getAvailableLanguages` (ya alineado). | - node --check public/language_window.js OK.<br>- Grep del archivo confirma inventario exhaustivo de dependencias bridge (`getLogger`, `getAvailableLanguages`, `setLanguage`).<br>- Smoke de healthy-path: sin cambios de channels/payloads/ordering/side effects. | N - ajustes locales de failure-path en renderer; sin cambios de contrato healthy-path ni cambios cross-file. |
| public/flotante.js | CHANGED | [### public/flotante.js](#publicflotantejs) | OK | - `window.getLogger` estaba sin fail-fast explícito (TypeError implícito si faltaba contrato).<br>- `window.flotanteAPI` y métodos core (`onState`, `sendCommand`) tenían soft-fail/log y guards opcionales en rutas que requieren invariante de arranque.<br>- Había coexistencia required vs optional-style para el mismo bridge core (`flotanteAPI`) en distintos call-sites. | - Se agregó fail-fast explícito para `window.getLogger` ausente.<br>- Se elevó `window.flotanteAPI`, `onState` y `sendCommand` a hard-abort explícito en bootstrap (required startup dependencies).<br>- Se removieron guards opcionales redundantes en call-sites core para mantener handling consistente con el invariante required. | - node --check public/flotante.js OK.<br>- Grep confirma inventario bridge completo y enforcement en call-sites core/optional (`flotanteAPI`, `RendererI18n`, `RendererCrono`).<br>- Healthy-path smoke: sin cambios de channels/payloads/ordering/side effects. | N - solo alineación local de failure-path en renderer; sin cambios de contrato healthy-path ni cross-file. |
| public/preset_modal.js | CHANGED | [### public/preset_modal.js](#publicpreset_modaljs) | OK | - `window.getLogger` no tenía fail-fast explícito (TypeError implícito si faltaba contrato).<br>- Coexistía manejo inconsistente para `window.Notify.notifyMain`: un branch con guard/fallback y múltiples call-sites sin guard (incluyendo uno fuera del `try`).<br>- Había diagnósticos `throw` de dependencias requeridas en español (`AppConstants`, `RendererI18n`) incumpliendo la regla English-only para diagnósticos dev en `.js`. | - Se añadió fail-fast explícito para `window.getLogger` ausente.<br>- Se normalizó `window.Notify.notifyMain` como capacidad opcional con guard + fallback `alert` + `warnOnce` deduplicado estable en todos los call-sites.<br>- Se actualizaron los `throw` de `AppConstants` y `RendererI18n` a inglés sin cambiar control-flow de healthy-path. | - node --check public/preset_modal.js OK.<br>- Grep confirma cobertura de call-sites de notificación vía `notifyMain(...)` y un único fallback deduplicado para bridge missing.<br>- Healthy-path smoke: sin cambios en channels/payloads/ordering/side-effects. | N - ajustes locales de failure-path/alineación de diagnósticos en renderer; sin cambios de contrato healthy-path ni cross-file. |
| public/editor.js | CHANGED | [### public/editor.js](#publiceditorjs) | OK | - `window.getLogger` y el bridge core `window.editorAPI` (objeto + métodos críticos) eran implícitos; faltaba fail-fast explícito y coexistían TypeError tardíos en rutas de bootstrap/IPC.<br>- `editorAPI.onSettingsChanged` coexistía como capability opcional sin diagnóstico cuando faltaba contrato.<br>- `window.Notify.notifyEditor` tenía call-sites directos en rutas interactivas (incluyendo alta frecuencia) sin guard/fallback consistente. | - Se agregó fail-fast explícito para `window.getLogger` y para el contrato requerido de `window.editorAPI` (`setCurrentText`, `getCurrentText`, `onInitText`, `onExternalUpdate`, `onForceClear`).<br>- Se añadió diagnóstico explícito para missing `editorAPI.getSettings` (BOOTSTRAP) y missing `editorAPI.onSettingsChanged` (runtime opcional).<br>- Se normalizó `window.Notify.notifyEditor` con guard + fallback a `showNotice(tr(...))` + `warnOnce` deduplicado estable para misses repetibles. | - node --check public/editor.js OK.<br>- Grep confirma inventario/coverage de bridges (`editorAPI`, `RendererI18n`, `Notify`) y fail-fast explícito de dependencias required en bootstrap.<br>- Healthy-path smoke: sin cambios en channels/payloads/ordering/side-effects. | N - alineación local de failure-path en renderer; sin cambios de contrato healthy-path ni cambios cross-file. |
| public/editor_find.js | CHANGED | [### public/editor_find.js](#publiceditor_findjs) | OK | - `window.getLogger` se consumía sin fail-fast explícito (TypeError implícito si faltaba contrato).<br>- El envío de query (`editorFindAPI.setQuery`) podía fallar en ruta de alta frecuencia (`input`) con `log.error` no deduplicado, generando ruido repetitivo sin valor diagnóstico incremental.<br>- El resto de bridges ya tenía clasificación explícita required/optional con guard o abort coherente. | - Se agregó fail-fast explícito para `window.getLogger` ausente.<br>- Se elevó el fallo repetible de `setQuery` en input a `errorOnce` con clave estable/acotada para dedupe de salida.<br>- No se alteraron contratos IPC/channels/payloads ni orden de wiring/bootstrap. | - node --check public/editor_find.js OK.<br>- Grep confirma inventario completo de paths bridge (`getLogger`, `RendererI18n`, `editorFindAPI.*`) y dedupe en la ruta de input de mayor frecuencia.<br>- Healthy-path smoke: sin cambios en channels/payloads/ordering/side-effects. | N - correcciones locales de failure-path/observabilidad en renderer; sin cambios de contrato healthy-path ni cambios cross-file. |
| public/task_editor.js | CHANGED | [### public/task_editor.js](#publictask_editorjs) | OK | - `window.getLogger` se consumía sin fail-fast explícito (TypeError implícito si faltaba contrato).<br>- `window.taskEditorAPI.confirmClose` se invocaba sin guard dentro de `onRequestClose`, coexistiendo con patrón opcional guardado en el resto de métodos bridge.<br>- Había diagnósticos `throw` de dependencias requeridas en español (`AppConstants`, `RendererI18n`) fuera de la regla English-only para diagnósticos dev en `.js`. | - Se agregó fail-fast explícito para `window.getLogger` ausente.<br>- Se guardó `window.taskEditorAPI.confirmClose` con `warnOnce` estable y retorno seguro cuando falta contrato.<br>- Se actualizaron los `throw` de `AppConstants` y `RendererI18n` a inglés sin cambios de control-flow healthy-path. | - node --check public/task_editor.js OK.<br>- Grep confirma cobertura de paths bridge (`taskEditorAPI.*`, `Notify.notifyEditor`) y guard explícito de `confirmClose` en `onRequestClose`.<br>- Healthy-path smoke: sin cambios en channels/payloads/ordering/side-effects. | N - alineación local de failure-path/diagnostics en renderer; sin cambios de contrato healthy-path ni cambios cross-file. |
| public/js/crono.js | CHANGED | [### public/js/crono.js](#publicjscronojs) | OK | - `window.getLogger` se consumía sin fail-fast explícito (TypeError implícito si faltaba contrato).<br>- Había fallbacks opcionales silenciosos en rutas `electronAPI` (`setCronoElapsed`, `sendCronoReset`, `sendCronoToggle`, `onFlotanteClosed` y `getCronoState` missing branch).<br>- Coexistían paths opcionales con y sin diagnóstico para el mismo bridge `electronAPI`. | - Se agregó fail-fast explícito para `window.getLogger` ausente.<br>- Se añadieron diagnósticos deduplicados en todos los missing paths opcionales de `electronAPI` que antes eran silenciosos.<br>- Se preservó flujo healthy-path, contratos IPC y orden de wiring/bind. | - node --check public/js/crono.js OK.<br>- Grep confirma cobertura de inventario bridge (`getLogger`, `RendererCrono`, `electronAPI.*`) y presencia de nuevos `warnOnce` en branches missing.<br>- Healthy-path smoke: sin cambios en channels/payloads/ordering/side-effects. | N - ajustes locales de failure-path/observabilidad en renderer; sin cambios de contrato healthy-path ni cambios cross-file. |
| public/js/presets.js | CHANGED | [### public/js/presets.js](#publicjspresetsjs) | OK | - `window.getLogger`, `window.AppConstants` y `window.RendererI18n.getLangBase` se consumían sin fail-fast explícito (TypeError implícito).<br>- `electronAPI.setSelectedPreset` tenía fallback silencioso cuando faltaba método (no diagnóstico en missing branch).<br>- `loadPresetsIntoDom` tenía required throw en español y coexistencia guardada/no-guardada para `electronAPI.getDefaultPresets`. | - Se agregaron checks fail-fast explícitos para `getLogger`, `AppConstants` y `RendererI18n.getLangBase`.<br>- Se normalizó `electronAPI.getDefaultPresets` y `electronAPI.setSelectedPreset` con guard + diagnóstico deduplicado en missing branch.<br>- Se actualizó el `throw` required de `electronAPI` a diagnóstico en inglés, sin alterar contratos ni orden healthy-path. | - node --check public/js/presets.js OK.<br>- Grep confirma inventario bridge completo (`getLogger`, `AppConstants`, `RendererI18n.getLangBase`, `electronAPI.getDefaultPresets`, `electronAPI.setSelectedPreset`).<br>- Healthy-path smoke: sin cambios en channels/payloads/ordering/side-effects. | N - alineación local de failure-path/diagnostics en renderer; sin cambios de contrato healthy-path ni cambios cross-file. |
| public/js/menu_actions.js | CHANGED | [### public/js/menu_actions.js](#publicjsmenu_actionsjs) | OK | - `window.getLogger` se consumía sin fail-fast explícito (TypeError implícito si faltaba contrato).<br>- El fallback BOOTSTRAP post-`DOMContentLoaded` para `onMenuClick` no estaba marcado explícitamente como BOOTSTRAP.<br>- Coexistía dependencia bridge opcional (`electronAPI.onMenuClick`) con cobertura diagnóstica incompleta en ese branch de retry. | - Se agregó fail-fast explícito para `window.getLogger` ausente.<br>- Se marcó el warning del retry post-`DOMContentLoaded` como `BOOTSTRAP:` para alinear la semántica de fallback de arranque.<br>- Se preservó el wiring IPC y el flujo de registro/listening sin cambiar contratos ni ordering. | - node --check public/js/menu_actions.js OK.<br>- Grep confirma inventario bridge (`getLogger`, `electronAPI.onMenuClick`, `window.menuActions`) y warning BOOTSTRAP en ambos branches de retry.<br>- Healthy-path smoke: sin cambios en channels/payloads/ordering/side-effects. | N - ajustes locales de failure-path/diagnostics en renderer; sin cambios de contrato healthy-path ni cambios cross-file. |
| public/js/i18n.js | CHANGED | [### public/js/i18n.js](#publicjsi18njs) | OK | - `window.getLogger` se consumía sin fail-fast explícito (TypeError implícito si faltaba contrato).<br>- `window.AppConstants.DEFAULT_LANG` se consumía sin validación de contrato requerida (fallo implícito o estado inválido).<br>- El resto de paths bridge ya estaba alineado (carga con fallback + diagnósticos deduplicados en rutas opcionales de bundles). | - Se agregó fail-fast explícito para `window.getLogger` ausente.<br>- Se agregó fail-fast explícito para contrato requerido `window.AppConstants.DEFAULT_LANG` inválido/ausente.<br>- Se preservó sin cambios la semántica de fallback/diagnósticos de carga de bundles y la superficie `window.RendererI18n`. | - node --check public/js/i18n.js OK.<br>- Grep confirma inventario bridge completo (`getLogger`, `AppConstants.DEFAULT_LANG`, `window.RendererI18n`) y fail-fast explícito en bootstrap.<br>- Healthy-path smoke: sin cambios en channels/payloads/ordering/side-effects. | N - ajustes locales de failure-path en renderer; sin cambios de contrato healthy-path ni cambios cross-file. |
| public/js/notify.js | CHANGED | [### public/js/notify.js](#publicjsnotifyjs) | OK | - `window.getLogger` se consumía sin fail-fast explícito (TypeError implícito si faltaba contrato).<br>- El resto de paths bridge (`RendererI18n.msgRenderer` y fallbacks toast/alert) ya estaba explícitamente guardado con diagnóstico deduplicado o catch con continuidad.<br>- No había drift de dedupe en rutas repetibles de i18n-missing (ya `warnOnce`). | - Se agregó fail-fast explícito para `window.getLogger` ausente.<br>- Se mantuvieron sin cambios los guards/fallbacks opcionales existentes en `resolveText`, `toastMain`, `toastEditorText` y `notifyEditor`.<br>- Se preservó la superficie pública `window.Notify` y el comportamiento healthy-path de toasts/alerts. | - node --check public/js/notify.js OK.<br>- Grep confirma inventario bridge (`getLogger`, `RendererI18n.msgRenderer`, `window.Notify`) y guard deduplicado en `resolveText`.<br>- Healthy-path smoke: sin cambios en channels/payloads/ordering/side-effects. | N - ajuste local de failure-path en renderer; sin cambios de contrato healthy-path ni cambios cross-file. |
| public/js/current_text_snapshots.js | CHANGED | [### public/js/current_text_snapshots.js](#publicjscurrent_text_snapshotsjs) | OK | - El fallback de `Notify` en `toast()` usaba `warnOnce` pese a ser una ruta interactiva no alta frecuencia, en tensión con la guía de `public/js/log.js` para once-variants.<br>- El resto del inventario bridge ya estaba clasificado y alineado (`window.getLogger` fail-fast explícito; `electronAPI.save/loadCurrentTextSnapshot` guardados).<br>- No había silent fallbacks en call-sites bridge. | - Se cambió el diagnóstico de fallback `Notify` en `toast()` de `log.warnOnce` a `log.warn` (sin dedupe key) para alinearlo con la política de logging en baja frecuencia.<br>- Se mantuvo sin cambios el fail-fast requerido de `window.getLogger` y los guards opcionales de `electronAPI` save/load.<br>- Se preservó la superficie `window.CurrentTextSnapshots` y los payloads/retornos. | - node --check public/js/current_text_snapshots.js OK.<br>- Grep/manual confirma cobertura completa de paths bridge (`window.getLogger`, `window.Notify.toastMain`, `window.Notify.notifyMain`, `window.electronAPI.saveCurrentTextSnapshot`, `window.electronAPI.loadCurrentTextSnapshot`, `window.CurrentTextSnapshots`).<br>- Healthy-path smoke: sin cambios en channels/payloads/ordering/side-effects. | N - ajuste local de failure-path/observabilidad en renderer; sin cambios de contrato healthy-path ni cambios cross-file. |
| public/js/count.js | CHANGED | [### public/js/count.js](#publicjscountjs) | OK | - `window.getLogger` se consumía sin fail-fast explícito (TypeError implícito si faltaba contrato).<br>- `window.AppConstants.DEFAULT_LANG` se consumía sin validación de contrato requerido (fallo implícito o estado inválido).<br>- El resto de paths bridge del archivo ya estaba estable y sin silent fallback. | - Se agregó fail-fast explícito para `window.getLogger` ausente.<br>- Se agregó fail-fast explícito para contrato requerido `window.AppConstants.DEFAULT_LANG` ausente/inválido.<br>- Se preservó sin cambios la superficie `window.CountUtils` y la lógica de conteo healthy-path. | - node --check public/js/count.js OK.<br>- Grep/manual confirma inventario bridge completo (`window.getLogger`, `window.AppConstants.DEFAULT_LANG`, `window.CountUtils`).<br>- Healthy-path smoke: sin cambios en payloads/retornos/ordering/side-effects. | N - ajustes locales de failure-path en renderer; sin cambios de contrato healthy-path ni cambios cross-file. |
| public/js/format.js | CHANGED | [### public/js/format.js](#publicjsformatjs) | OK | - `window.getLogger` se consumía sin fail-fast explícito (TypeError implícito si faltaba contrato).<br>- `window.AppConstants.DEFAULT_LANG` y `window.RendererI18n.normalizeLangTag/getLangBase` se consumían sin validación explícita de contratos requeridos de arranque.<br>- Había coexistencia implícita (fallo tardío por uso) en vez de hard-abort explícito de init inválida. | - Se agregó fail-fast explícito para `window.getLogger` ausente.<br>- Se agregó fail-fast explícito para contrato requerido `window.AppConstants.DEFAULT_LANG` ausente/inválido.<br>- Se agregó fail-fast explícito para contrato requerido `window.RendererI18n.normalizeLangTag/getLangBase` ausente/inválido. | - node --check public/js/format.js OK.<br>- Grep/manual confirma inventario bridge completo (`window.getLogger`, `window.AppConstants.DEFAULT_LANG`, `window.RendererI18n.normalizeLangTag`, `window.RendererI18n.getLangBase`, `window.FormatUtils`).<br>- Healthy-path smoke: sin cambios en payloads/retornos/ordering/side-effects. | N - ajustes locales de failure-path en renderer; sin cambios de contrato healthy-path ni cambios cross-file. |
| public/js/info_modal_links.js | CHANGED | [### public/js/info_modal_links.js](#publicjsinfo_modal_linksjs) | OK | - `window.getLogger` se consumía sin fail-fast explícito (TypeError implícito si faltaba contrato).<br>- Los miss paths opcionales `openAppDoc`/`openExternalUrl` usaban `warnOnce` en ruta interactiva normal (no alta frecuencia), en tensión con la guía de `public/js/log.js` para once-variants.<br>- El resto de call-sites bridge ya estaba guardado/no-silencioso. | - Se agregó fail-fast explícito para `window.getLogger` ausente.<br>- Se cambiaron los diagnósticos de missing `openAppDoc` y `openExternalUrl` de `warnOnce` a `warn` (manteniendo guard + continue).<br>- Se mantuvieron sin cambios los `warnOnce` de fallbacks potencialmente repetibles (`CSS.escape`, `scrollIntoView`) y la superficie `window.InfoModalLinks`. | - node --check public/js/info_modal_links.js OK.<br>- Grep/manual confirma inventario bridge completo (`window.getLogger`, `window.electronAPI.openAppDoc`, `window.electronAPI.openExternalUrl`, `window.InfoModalLinks`).<br>- Healthy-path smoke: sin cambios en payloads/retornos/ordering/side-effects. | N - ajustes locales de failure-path/observabilidad en renderer; sin cambios de contrato healthy-path ni cambios cross-file. |
| electron/main.js | CHANGED | [### electron/main.js](#electronmainjs) | OK | - El guard BOOTSTRAP de acciones IPC pre-READY (`guardMainUserAction`) tenía key `BOOTSTRAP:*` pero el mensaje no iniciaba con `BOOTSTRAP:`.<br>- El resto de paths IPC/send del archivo ya estaba no-silencioso (guard/try-catch + diagnóstico) y con claves de dedupe estables/acotadas.<br>- No se detectó drift de contrato en channels/payloads/registro IPC/order de startup. | - Se normalizó `guardMainUserAction` para que el mensaje de fallback también inicie con `BOOTSTRAP:` (alineado con logger headers + convención).<br>- Se mantuvieron sin cambios canales, payload/return shapes, side effects y orden de registro/secuenciación.<br>- No se añadieron wrappers de logging; se conservó call-site directo `log.warnOnce`. | - node --check electron/main.js OK.<br>- Grep/manual confirma inventario completo de `ipcMain.(handle|on|once)`, `webContents.send` y registros IPC delegados en `whenReady`.<br>- Verificación de guard BOOTSTRAP: key y mensaje ahora prefijados con `BOOTSTRAP:` en misses pre-READY. | N - ajuste local de failure-path/diagnóstico en main; sin cambios de contrato healthy-path ni cambios cross-file. |
| electron/text_state.js | CHANGED | [### electron/text_state.js](#electrontext_statejs) | OK | - `registerIpc(ipcMain, ...)` no validaba explícitamente `ipcMain` (fail-fast implícito por TypeError tardío, sin diagnóstico claro de contrato requerido).<br>- El fallback BOOTSTRAP de init (`init.unexpectedShape`) no tenía key/mensaje prefijados con `BOOTSTRAP:` pese a ser ruta solo de arranque.<br>- El resto de paths bridge (`ipcMain.handle` + `webContents.send`) ya estaba guardado/no-silencioso con dedupe estable en rutas repetibles. | - Se agregó fail-fast explícito en `registerIpc` cuando falta contrato `ipcMain.handle`.<br>- Se marcó el fallback BOOTSTRAP de init con key y mensaje `BOOTSTRAP:`.<br>- Se preservaron canales, payload/return shapes y semántica de `safeSend`/handlers existentes. | - node --check electron/text_state.js OK.<br>- Grep/manual confirma inventario bridge completo (`ipcMain.handle` handlers + `webContents.send` channels `current-text-updated`, `editor-text-updated`, `editor-force-clear`).<br>- Validación BOOTSTRAP: `text_state.init.unexpectedShape` ahora usa key/mensaje `BOOTSTRAP:`. | N - ajustes locales de failure-path/diagnóstico en main; sin cambios de contrato healthy-path ni cambios cross-file. |
| electron/settings.js | CHANGED | [### electron/settings.js](#electronsettingsjs) | OK | - `registerIpc(ipcMain, { ... })` hacía destructuring sin default del segundo parámetro, coexistiendo con lógica opcional (`typeof getWindows/buildAppMenu === 'function'`) y causando fallo implícito si faltaba options.<br>- La validación de `ipcMain` en `registerIpc` solo comprobaba existencia, no contrato (`ipcMain.handle`).<br>- El resto de paths bridge (`ipcMain.handle` channels + `webContents.send('settings-updated')`) ya era no-silencioso y con dedupe estable en rutas repetibles. | - Se agregó default `= {}` al objeto options de `registerIpc` para alinear el comportamiento con su uso opcional en runtime.<br>- Se endureció el fail-fast requerido de `registerIpc` verificando `ipcMain.handle` explícitamente.<br>- Se preservaron sin cambios canales, payload/return shapes, side effects y orden de registro IPC. | - node --check electron/settings.js OK.<br>- Grep/manual confirma inventario completo de `ipcMain.handle('get-settings'/'set-language'/'set-mode-conteo'/'set-selected-preset')` y `webContents.send('settings-updated')`.<br>- Smoke healthy-path: sin cambios de contrato observable ni ordering de handlers. | N - ajustes locales de failure-path/contrato de registro en main; sin cambios de contrato healthy-path ni cambios cross-file. |
| electron/presets_main.js | CHANGED | [### electron/presets_main.js](#electronpresets_mainjs) | OK | - `registerIpc(ipcMain, ...)` validaba solo existencia de `ipcMain` y no su contrato (`ipcMain.handle`), dejando fallo implícito si estaba mal cableado.<br>- El `throw` de contrato requerido en `registerIpc` estaba en español (`requiere`) y no cumplía English-only para diagnósticos dev en `.js`.<br>- El resto de paths bridge (`ipcMain.handle` y `webContents.send`) ya estaba no-silencioso con guard/try-catch y dedupe estable en rutas repetibles. | - Se endureció el fail-fast requerido en `registerIpc` verificando explícitamente `ipcMain.handle`.<br>- Se actualizó el mensaje `throw` a inglés (`requires ipcMain`) manteniendo control-flow y contrato intactos.<br>- Se preservaron canales, payload/return shapes, side effects y orden de registro IPC. | - node --check electron/presets_main.js OK.<br>- Grep/manual confirma inventario completo de handlers (`get-default-presets`, `open-default-presets-folder`, `create-preset`, `request-delete-preset`, `request-restore-defaults`, `notify-no-selection-edit`, `edit-preset`) y sends (`settings-updated`, `preset-created`).<br>- Healthy-path smoke: sin cambios de contrato observable ni ordering. | N - ajustes locales de failure-path/diagnóstico en main; sin cambios de contrato healthy-path ni cambios cross-file. |
| electron/tasks_main.js | CHANGED | [### electron/tasks_main.js](#electrontasks_mainjs) | OK | - `registerIpc(ipcMain, ...)` validaba solo existencia de `ipcMain` y no su contrato requerido (`ipcMain.handle`), dejando fallo implícito si estaba mal cableado.<br>- El resto del inventario IPC/send del archivo ya estaba guardado/no-silencioso con diagnósticos en rutas de drop o error.<br>- No se detectó drift en canales/payloads/orden de registro healthy-path. | - Se endureció el fail-fast requerido en `registerIpc` verificando explícitamente `ipcMain.handle`.<br>- Se preservaron sin cambios handlers, channels, payload/return shapes, side effects y orden de registro IPC.<br>- No se introdujeron wrappers ni refactors fuera del scope Level 3. | - node --check electron/tasks_main.js OK.<br>- Grep/manual confirma inventario exhaustivo de `ipcMain.handle(...)`, `webContents.send('task-editor-init', ...)` y path IPC-adjacent de autorización de sender.<br>- Healthy-path smoke: sin cambios en channels/payloads/ordering/side-effects. | N - ajuste local de failure-path/contrato de registro en main; sin cambios de contrato healthy-path ni cambios cross-file. |

### public/language_window.js

| ID | Location anchor | Bridge member/path | Class | Current handling | Required handling | Action taken | Dedupe key (if any) |
|----|------------------|--------------------|-------|------------------|-------------------|--------------|---------------------|
| LW01 | top-level logger init (`L18`) startup/rare | `window.getLogger` | required startup dependency | Before: fallback a `console` cuando faltaba `getLogger` (sin hard-abort explícito). | Fail fast con diagnóstico claro; no continuar init inválida. | Added explicit contract check + `throw new Error('window.getLogger unavailable; cannot continue')`. | n/a |
| LW02 | bootstrap data load (`L202`, `L207`) startup/rare | `window.languageAPI.getAvailableLanguages` | optional capability | Guard + fallback a lista local con `log.warn` BOOTSTRAP; módulo continúa. | Guard + continuar degradado + diagnóstico BOOTSTRAP. | No change; already compliant with optional fallback semantics. | n/a |
| LW03 | language apply action (`L120`, `L122`, `L130`) interactive | `window.languageAPI.setLanguage` | optional capability | Before: call async sin guard explícito; missing bridge caía en `catch` con `log.error` repetible por interacción. | Guard + skip feature + diagnóstico deduplicado; mantener flujo de ventana sin crash. | Added explicit availability guard with `log.warnOnce` + status fallback + safe return before async call. | `language_window.api.setLanguage.unavailable` |

Level 4 evidence:
- N. No Level 4 escalation applies: all changes are local failure-path alignment in `public/language_window.js`; healthy-path contract/timing and IPC surface remain unchanged.

Healthy-path confirmation: the healthy-path contract/timing was preserved (no changes to channels, payload/return shapes, side effects, or ordering when bridge wiring is valid).

Failure-path confirmation: failure-mode handling is aligned to the convention (required dependency fail-fast for logger bootstrap; optional capabilities guarded with continue/fallback diagnostics, including dedupe where repetition is plausible).

### public/flotante.js

| ID | Location anchor | Bridge member/path | Class | Current handling | Required handling | Action taken | Dedupe key (if any) |
|----|------------------|--------------------|-------|------------------|-------------------|--------------|---------------------|
| F01 | top-level logger init (`L19`) startup/rare | `window.getLogger` | required startup dependency | Before: direct call; missing contract produced implicit runtime failure. | Fail fast with explicit diagnostic. | Added explicit function check + `throw new Error('window.getLogger unavailable; cannot continue')`. | n/a |
| F02 | constants bootstrap (`L30`) startup/rare | `window.AppConstants` | required startup dependency | Already explicit fail-fast throw when missing. | Fail fast with explicit diagnostic. | No change; already compliant. | n/a |
| F03 | bridge bootstrap (`L55`) startup/rare | `window.flotanteAPI` | required startup dependency | Before: logged error and continued with degraded/invalid runtime wiring. | Hard abort invalid init path. | Changed missing bridge handling to explicit `throw`. | n/a |
| F04 | state subscription contract (`L58`, `L115`) startup+runtime | `window.flotanteAPI.onState` | required startup dependency | Before: warned and skipped subscription if missing. | Hard abort invalid init path; do not continue without core state feed. | Added explicit startup `throw` on missing method; removed optional-style guard at subscription call-site. | n/a |
| F05 | command bridge contract + command sends (`L61`, `L184`, `L187`, `L194`, `L197`) startup+interactive | `window.flotanteAPI.sendCommand` | required startup dependency | Before: startup logged error if missing; interactive call-sites used optional object guards. | Hard abort invalid init path and keep required-path handling consistent across call-sites. | Added explicit startup `throw` on missing method; removed redundant optional guards in interactive call-sites. | n/a |
| F06 | settings fetch (`L64`, `L153`, `L155`) startup/rare | `window.flotanteAPI.getSettings` | optional capability | Guarded; on missing uses default language + warning; on failure warns and continues. | Guard + continue with feature degraded + diagnostic. | No change; already compliant. | n/a |
| F07 | settings subscription (`L67`, `L168`) runtime/rare | `window.flotanteAPI.onSettingsChanged` | optional capability | Guarded; missing listener warns and continues without live language updates. | Guard + continue with feature degraded + diagnostic. | No change; already compliant. | n/a |
| F08 | crono formatting helper (`L93`) potentially high-frequency | `window.RendererCrono.formatCrono` | optional capability | Guarded; missing helper falls back to simple formatter with deduped warning. | Guard + continue fallback + deduped diagnostic for repeatable misses. | No change; already compliant. | `flotante.formatCrono.missing` |
| F09 | i18n contract (`L120`, `L121`, `L129`, `L140`, `L141`) startup+interactive/rare | `window.RendererI18n.{loadRendererTranslations,tRenderer}` | optional capability | Guarded; missing contract warns and skips translations; load failures warn and continue. | Guard + continue with feature degraded + diagnostic. | No change; already compliant. | n/a |

Level 4 evidence:
- N. No Level 4 escalation applies: all fixes are local failure-path alignment in `public/flotante.js`; IPC surface, channel names, payload/return shapes, side effects, and healthy-path ordering/timing are unchanged.

Healthy-path confirmation: the healthy-path contract/timing was preserved (no changes to channels, payload/return shapes, side effects, or execution ordering when bridge wiring is valid).

Failure-path confirmation: failure-mode handling is aligned to the convention (required startup dependencies now fail fast; optional capabilities remain guarded with diagnostics; repeatable high-frequency fallback keeps stable dedupe).

### public/renderer.js

| ID | Location anchor | Bridge member/path | Class | Current handling | Required handling | Action taken | Dedupe key (if any) |
|----|------------------|--------------------|-------|------------------|-------------------|--------------|---------------------|
| R01 | top-level logger init (`L18`) startup/rare | `window.getLogger` | required startup dependency | Before: direct call (missing bridge -> implicit TypeError). | Fail fast with explicit diagnostic. | Added explicit function check + throw before logger init. | n/a |
| R02 | constants bootstrap (`L25`) startup/rare | `window.AppConstants` | required startup dependency | Already fail-fast (`throw`) when unavailable. | Fail fast with explicit diagnostic. | No change; already compliant. | n/a |
| R03 | i18n bootstrap (`L219`) startup/rare | `window.RendererI18n.{loadRendererTranslations,tRenderer,msgRenderer}` | required startup dependency | Already fail-fast (`throw`) if contract missing. | Fail fast with explicit diagnostic. | No change; already compliant. | n/a |
| R04 | count bootstrap (`L341`) startup/rare | `window.CountUtils.contarTexto` | required startup dependency | Already fail-fast (`throw`) when missing. | Fail fast with explicit diagnostic. | No change; already compliant. | n/a |
| R05 | time-format bootstrap (`L366`) startup/rare | `window.FormatUtils.{getTimeParts,obtenerSeparadoresDeNumeros,formatearNumero}` | required startup dependency | Before: `log.error` then continue in invalid state. | Fail fast with explicit diagnostic. | Changed to explicit `throw` on missing contract. | n/a |
| R06 | presets load path (`L315`, `L476`, `L500`) startup+interactive | `window.RendererPresets.loadPresetsIntoDom` | optional capability | Before: startup log + later try/catch errors; not cleanly disabled. | Guard + continue with feature disabled + deduped diagnostic. | Added bridge availability gate and guarded early returns. | `renderer.bridge.RendererPresets.unavailable`; `renderer.bridge.RendererPresets.reload.unavailable` |
| R07 | presets resolve path (`L315`, `L500`, `L1271`) startup+interactive | `window.RendererPresets.resolvePresetSelection` | optional capability | Before: could be called while bridge missing (error-driven fallback). | Guard + continue with feature disabled + deduped diagnostic. | Added guarded skip for load/change flows when bridge unavailable. | `renderer.bridge.RendererPresets.selection.unavailable`; `renderer.bridge.RendererPresets.change.unavailable` |
| R08 | snapshot-load button (`L330`, `L1566`) interactive | `window.CurrentTextSnapshots.loadSnapshot` | optional capability | Before: unguarded async call. | Guard + skip + deduped diagnostic. | Added method guard + `warnOnce` + safe return. | `renderer.bridge.CurrentTextSnapshots.unavailable`; `renderer.snapshot.load.unavailable` |
| R09 | snapshot-save button (`L330`, `L1580`) interactive | `window.CurrentTextSnapshots.saveSnapshot` | optional capability | Before: unguarded async call. | Guard + skip + deduped diagnostic. | Added method guard + `warnOnce` + safe return. | `renderer.bridge.CurrentTextSnapshots.unavailable`; `renderer.snapshot.save.unavailable` |
| R10 | startup handshake (`L120`) startup/rare | `window.electronAPI.sendStartupRendererCoreReady` | best-effort side action | Guarded; failures caught and logged; unavailable path deduped. | Attempt; drop on failure without breaking flow; deduped diagnostic. | No change; already compliant. | `BOOTSTRAP:renderer.startup.coreReady.unavailable` |
| R11 | startup handshake (`L137`) startup/rare | `window.electronAPI.sendStartupSplashRemoved` | best-effort side action | Guarded; failures caught and logged; unavailable path deduped. | Attempt; drop on failure without breaking flow; deduped diagnostic. | No change; already compliant. | `BOOTSTRAP:renderer.startup.splashRemoved.unavailable` |
| R12 | crono state subscription (`L441`) runtime subscription | `window.electronAPI.onCronoState` | optional capability | Guard + skip with deduped warning if unavailable. | Guard + skip + deduped diagnostic. | No change; already compliant. | `renderer.ipc.onCronoState.unavailable` |
| R13 | text sync subscription (`L582`) runtime subscription | `window.electronAPI.onCurrentTextUpdated` | optional capability | Guard + skip with deduped warning if unavailable. | Guard + skip + deduped diagnostic. | No change; already compliant. | `renderer.ipc.onCurrentTextUpdated.unavailable` |
| R14 | preset sync subscription (`L606`) runtime subscription | `window.electronAPI.onPresetCreated` | optional capability | Guard + skip with deduped warning if unavailable. | Guard + skip + deduped diagnostic. | No change; already compliant. | `renderer.ipc.onPresetCreated.unavailable` |
| R15 | startup readiness subscription (`L654`) startup/rare | `window.electronAPI.onStartupReady` | required startup dependency | Missing listener triggers `errorOnce`; READY is not unblocked (invalid init path is hard-blocked). | Hard abort invalid startup path with clear diagnostic. | No code change; current behavior already blocks invalid startup path and emits explicit diagnostic. | `renderer.startup.ready.unavailable` |
| R16 | settings sync subscription (`L673`) runtime subscription | `window.electronAPI.onSettingsChanged` | optional capability | Guard + skip with deduped warning if unavailable. | Guard + skip + deduped diagnostic. | No change; already compliant. | `renderer.ipc.onSettingsChanged.unavailable` |
| R17 | editor-ready subscription (`L682`) runtime subscription | `window.electronAPI.onEditorReady` | optional capability | Guard + skip with deduped warning if unavailable. | Guard + skip + deduped diagnostic. | No change; already compliant. | `renderer.ipc.onEditorReady.unavailable` |
| R18 | mode persistence (`L737`) interactive | `window.electronAPI.setModeConteo` | optional capability | Guard + skip with deduped warning if unavailable. | Guard + skip + deduped diagnostic. | No change; already compliant. | `renderer.ipc.setModeConteo.unavailable` |
| R19 | startup config fetch (`L779`) startup/rare | `window.electronAPI.getAppConfig` | optional capability | Before: unguarded call inside try/catch. | Guard + continue with defaults + deduped diagnostic. | Routed through optional-method helper and guarded fallback path. | `renderer.ipc.getAppConfig.unavailable` |
| R20 | startup settings fetch (`L803`) startup/rare | `window.electronAPI.getSettings` | optional capability | Before: unguarded call inside try/catch. | Guard + continue with defaults + deduped diagnostic. | Routed through optional-method helper and guarded fallback path. | `renderer.ipc.getSettings.unavailable` |
| R21 | startup text fetch (`L837`) startup/rare | `window.electronAPI.getCurrentText` | optional capability | Before: unguarded call inside try/catch. | Guard + continue with empty text + deduped diagnostic. | Routed through optional-method helper and guarded fallback path. | `renderer.ipc.getCurrentText.unavailable` |
| R22 | About modal hydrate (`L963`) interactive/rare | `window.electronAPI.getAppVersion` | optional capability | Guard + fallback to `N/A` with deduped diagnostic. | Guard + skip/fallback + deduped diagnostic. | No change; already compliant. | `renderer.info.acerca_de.version.unavailable` |
| R23 | About modal hydrate (`L991`) interactive/rare | `window.electronAPI.getAppRuntimeInfo` | optional capability | Guard + fallback to `N/A` with deduped diagnostic. | Guard + skip/fallback + deduped diagnostic. | No change; already compliant. | `renderer.info.acerca_de.env.unavailable` |
| R24 | modal language helper (`L1021`) interactive/rare | `window.RendererI18n.normalizeLangTag` | optional capability | Before: silent local fallback. | Guard + local fallback + deduped diagnostic. | Added deduped fallback warning. | `renderer.info.normalizeLangTag.fallback` |
| R25 | modal language helper (`L1032`) interactive/rare | `window.RendererI18n.getLangBase` | optional capability | Before: silent local fallback. | Guard + local fallback + deduped diagnostic. | Added deduped fallback warning. | `renderer.info.getLangBase.fallback` |
| R26 | info modal link binding (`L886`, `L1116`) interactive/rare | `window.InfoModalLinks.bindInfoModalLinks` | optional capability | Before: silent skip when missing. | Guard + skip + deduped diagnostic. | Added deduped warning in unavailable branch. | `renderer.info.bindInfoModalLinks.unavailable` |
| R27 | top-bar action registration (`L1172`) startup/rare | `window.menuActions.registerMenuAction` | optional capability | Guarded by availability check; if missing, top bar integration is skipped and warned. | Guard + skip + diagnostic. | No change; already compliant. | n/a |
| R28 | menu action (`L1209`) interactive/rare | `window.electronAPI.openDefaultPresetsFolder` | optional capability | Before: guarded but used non-deduped warning on missing bridge. | Guard + skip + deduped diagnostic. | Converted missing-bridge warning to `warnOnce`. | `renderer.ipc.openDefaultPresetsFolder.unavailable` |
| R29 | menu action (`L1250`) interactive/rare | `window.electronAPI.checkForUpdates` | optional capability | Before: unguarded call in try/catch. | Guard + skip + deduped diagnostic. | Routed through optional-method helper. | `renderer.ipc.checkForUpdates.unavailable` |
| R30 | clipboard helper (`L1352`) interactive | `window.electronAPI.readClipboard` | optional capability | Before: unguarded call. | Guard + skip + deduped diagnostic. | Routed through optional-method helper and graceful return. | `renderer.ipc.readClipboard.unavailable` |
| R31 | append flow (`L1431`) interactive | `window.electronAPI.getCurrentText` | optional capability | Before: unguarded call in append path. | Guard + skip + deduped diagnostic. | Routed through optional-method helper in append flow. | `renderer.ipc.getCurrentText.unavailable` |
| R32 | overwrite/append/clear flows (`L1392`, `L1459`, `L1523`) interactive | `window.electronAPI.setCurrentText` | optional capability | Before: unguarded calls across 3 interactive flows. | Guard + skip + deduped diagnostic. | Routed all three call-sites through optional-method helper. | `renderer.ipc.setCurrentText.unavailable` |
| R33 | editor launch button (`L1502`) interactive | `window.electronAPI.openEditor` | optional capability | Before: unguarded call. | Guard + skip + deduped diagnostic. | Routed through optional-method helper and safe loader reset path. | `renderer.ipc.openEditor.unavailable` |
| R34 | clear sync side action (`L1537`) interactive | `window.electronAPI.forceClearEditor` | best-effort side action | Guarded, try/catch wrapped; missing path deduped warning. | Attempt; on failure drop and continue with deduped diagnostic. | No change; already compliant. | `renderer.ipc.forceClearEditor.unavailable` |
| R35 | task actions (`L1609`, `L1630`) interactive | `window.electronAPI.openTaskEditor` | optional capability | Before: guarded with UI fallback but no deduped dev diagnostic. | Guard + skip + deduped diagnostic. | Added `warnOnce` in both unavailable branches (shared key). | `renderer.ipc.openTaskEditor.unavailable` |
| R36 | preset modal open (`L1696`, `L1746`) interactive | `window.electronAPI.openPresetModal` | optional capability | Before: guarded with fallback notify but missing branch was non-deduped/inconsistent. | Guard + skip + deduped diagnostic. | Normalized unavailable branch to deduped `warnOnce`. | `renderer.ipc.openPresetModal.unavailable` |
| R37 | preset edit no-selection path (`L1719`) interactive | `window.electronAPI.notifyNoSelectionEdit` | optional capability | Before: guarded with UI fallback but no dev diagnostic in fallback branch. | Guard + skip/fallback + deduped diagnostic. | Added deduped warning on fallback branch. | `renderer.ipc.notifyNoSelectionEdit.unavailable` |
| R38 | preset delete flow (`L1768`) interactive | `window.electronAPI.requestDeletePreset` | optional capability | Before: unguarded call. | Guard + skip + deduped diagnostic. | Routed through optional-method helper. | `renderer.ipc.requestDeletePreset.unavailable` |
| R39 | presets restore flow (`L1811`) interactive | `window.electronAPI.requestRestoreDefaults` | optional capability | Before: unguarded call. | Guard + skip + deduped diagnostic. | Routed through optional-method helper. | `renderer.ipc.requestRestoreDefaults.unavailable` |
| R40 | stopwatch controller init (`L1848`) startup/rare | `window.RendererCrono.createController` | optional capability | Guarded availability check; missing bridge disables crono feature only. | Guard + skip + diagnostic. | No change; already compliant. | n/a |
| R41 | preset helper payloads (`L486`, `L519`, `L633`, `L1296`) startup+interactive | `window.electronAPI` (pass-through object to preset helper contracts) | optional capability | Passed through as capability object; downstream optional behavior now guarded. | Pass-through allowed only with optional capability semantics. | No change to contract; coverage enforced by method-level guards above. | n/a |
| R42 | info-modal link binder payload (`L1116`) interactive/rare | `window.electronAPI` (pass-through to `bindInfoModalLinks`) | optional capability | Passed through as capability object; previously silent if binder missing. | Guard + skip + deduped diagnostic at binder boundary. | Added missing-binder deduped fallback diagnostic. | `renderer.info.bindInfoModalLinks.unavailable` |
| R43 | crono controller payload (`L1858`) startup/rare | `window.electronAPI` (pass-through to `RendererCrono` controller) | optional capability | Passed through as capability object; controller init is optional and guarded. | Guard + skip + diagnostic if controller unavailable. | No change; already compliant. | n/a |

Level 4 evidence:
- N. No Level 4 escalation applies: all fixes are local failure-path guard/logging alignment in `public/renderer.js`; IPC surface, channel names, payload/return shapes, side effects, and healthy-path ordering/timing were not changed.

Healthy-path confirmation: the healthy-path contract/timing was preserved (same startup ordering, same IPC channels/payloads, same side effects when bridge wiring is valid).

Failure-path confirmation: failure-mode handling is now aligned to the convention matrix (required dependencies fail fast; optional capabilities guard+continue with deduplicated diagnostics; best-effort actions drop on failure without breaking flow).

#### Delta (pass 2)

What changed:
- Replaced non-fatal handling for missing `electronAPI.onStartupReady` with a hard throw in `armIpcSubscriptions`.
- Replaced non-fatal handling for missing `window.electronAPI` with a hard throw in `armIpcSubscriptions`.
- Kept existing IPC registration order unchanged; only missing-contract failure-path behavior changed.
- Re-checked all previously marked required startup dependencies; they are explicit fail-fast (`throw`) paths.
- Aligned pass-through `window.electronAPI` ledger entries with the new bootstrap invariant (missing object now hard-aborts before those paths).

Updated ledger rows (affected IDs only):

| ID | Location anchor | Bridge member/path | Class | Current handling | Required handling | Action taken | Dedupe key (if any) |
|----|------------------|--------------------|-------|------------------|-------------------|--------------|---------------------|
| R15 | startup readiness subscription (`L654`) startup/rare | `window.electronAPI.onStartupReady` | required startup dependency | Pass 1 state: missing listener emitted `errorOnce` and left renderer pre-READY (no hard abort). Pass 2 state: missing listener or missing `electronAPI` throws and aborts bootstrap. | Hard abort invalid startup path with clear diagnostic. | Kept class as required and enforced true fail-fast via `throw` in both missing `onStartupReady` and missing `electronAPI` branches. | n/a |
| R41 | preset helper payloads (`L486`, `L519`, `L633`, `L1290`) startup+interactive | `window.electronAPI` (pass-through object to preset helper contracts) | required startup dependency (bootstrap-gated invariant) | Pass 1 row marked optional pass-through. Current code now hard-aborts in `armIpcSubscriptions` if `window.electronAPI` is missing, so this path is only reachable after required bootstrap invariant is satisfied. | Hard abort invalid startup path; downstream method-level capabilities may still be optional. | Reclassified evidence for consistency with pass 2 fail-fast behavior (no additional code change). | n/a |
| R42 | info-modal link binder payload (`L1110`) interactive/rare | `window.electronAPI` (pass-through to `bindInfoModalLinks`) | required startup dependency (bootstrap-gated invariant) | Pass 1 row treated this pass-through as optional. Current behavior aborts before modal wiring if `window.electronAPI` is absent. | Hard abort invalid startup path; preserve healthy-path modal behavior. | Reclassified evidence for consistency with pass 2 fail-fast behavior (no additional code change). | n/a |
| R43 | crono controller payload (`L1852`) startup/rare | `window.electronAPI` (pass-through to `RendererCrono` controller) | required startup dependency (bootstrap-gated invariant) | Pass 1 row treated this pass-through as optional. Current behavior aborts before normal startup completion when `window.electronAPI` is absent. | Hard abort invalid startup path; keep existing controller semantics when bridge is valid. | Reclassified evidence for consistency with pass 2 fail-fast behavior (no additional code change). | n/a |

Confirmations:
- Healthy-path contract/timing preserved (no IPC surface/channel/payload/ordering changes in valid bridge wiring).
- Failure-path handling is aligned to the convention, and `onStartupReady` is now consistent with its required class via true fail-fast.

#### Delta (language policy)

What changed:
- Updated throw diagnostic text only: `[renderer] AppConstants no disponible; verifica la carga de constants.js` -> `[renderer] AppConstants unavailable; verify constants.js load order`.
- Updated throw diagnostic text only: `[renderer] RendererI18n no disponible; no se puede continuar` -> `[renderer] RendererI18n unavailable; cannot continue`.
- Updated throw diagnostic text only: `[renderer] CountUtils no disponible; no se puede continuar` -> `[renderer] CountUtils unavailable; cannot continue`.
- Updated logged fallback token only: `Desconocido` -> `Unknown` in the `default presets folder failed to open` diagnostic path.

Confirmations:
- Healthy-path contract/timing preserved (no IPC surface/channel/payload/ordering changes).
- Startup and IPC registration ordering preserved (message-string updates only; no control-flow changes).

### public/preset_modal.js

| ID | Location anchor | Bridge member/path | Class | Current handling | Required handling | Action taken | Dedupe key (if any) |
|----|------------------|--------------------|-------|------------------|-------------------|--------------|---------------------|
| PM01 | top-level logger init (`L20`) startup/rare | `window.getLogger` | required startup dependency | Before: direct call with implicit TypeError if missing bridge contract. | Fail fast with explicit diagnostic; do not continue invalid bootstrap. | Added explicit function check + `throw new Error('[preset_modal] window.getLogger unavailable; cannot continue')`. | n/a |
| PM02 | constants bootstrap (`L48`) startup/rare | `window.AppConstants` | required startup dependency | Already fail-fast `throw`, but diagnostic text was non-English. | Fail fast with clear English diagnostic in `.js`. | Kept fail-fast behavior; updated throw text to English-only diagnostic. | n/a |
| PM03 | i18n bootstrap (`L74`) startup/rare | `window.RendererI18n.{loadRendererTranslations,tRenderer,msgRenderer}` | required startup dependency | Already fail-fast `throw`, but diagnostic text was non-English. | Fail fast with clear English diagnostic in `.js`. | Kept fail-fast behavior; updated throw text to English-only diagnostic. | n/a |
| PM04 | init subscription wiring (`L125`) startup/rare | `window.presetAPI.onInit` | optional capability | Guarded optional wiring; missing bridge logs deduped warning and continues degraded. | Guard + continue with feature degraded + diagnostic. | No change; already compliant optional guard path. | `preset-modal.onInit.missing` |
| PM05 | init-time settings fetch (`L131`) startup/rare | `window.presetAPI.getSettings` | optional capability | Guarded optional call; missing/failure falls back to default language with deduped warning. | Guard + continue degraded + diagnostic. | No change; already compliant optional fallback path. | `preset-modal.getSettings.missing`; `preset-modal.getSettings` |
| PM06 | runtime settings subscription (`L182`) runtime/rare | `window.presetAPI.onSettingsChanged` | optional capability | Guarded optional wiring; missing bridge logs deduped warning and continues without live language updates. | Guard + continue with feature disabled + diagnostic. | No change; already compliant optional guard path. | `preset-modal.onSettingsChanged.missing` |
| PM07 | user-notification path (`L81`, `L209`, `L214`, `L251`, `L255`, `L264`, `L268`, `L273`) interactive/potentially high-frequency | `window.Notify.notifyMain` | optional capability | Before: mixed handling (one guarded fallback, multiple unguarded call-sites; one unguarded call outside save `try` could throw and break click flow). | Guard + continue + diagnostic; avoid crash on missing bridge; dedupe repeated missing diagnostics. | Added local `notifyMain(...)` helper and routed all notification call-sites through guard + alert fallback + `log.warnOnce`. | `preset-modal.notifyMain.unavailable` |
| PM08 | save/edit action (`L245`) interactive | `window.presetAPI.editPreset` | optional capability | Guarded call; missing bridge logs deduped error and shows process-error notification. | Guard + continue with feature disabled + diagnostic. | No change to class/flow; now notification fallback is resilient through guarded notifier path. | `preset-modal.editPreset.missing` |
| PM09 | save/create action (`L259`) interactive | `window.presetAPI.createPreset` | optional capability | Guarded call; missing bridge logs deduped error and shows process-error notification. | Guard + continue with feature disabled + diagnostic. | No change to class/flow; now notification fallback is resilient through guarded notifier path. | `preset-modal.createPreset.missing` |

Level 4 evidence:
- N. No Level 4 escalation applies: all adjustments are local failure-path alignment in `public/preset_modal.js`; IPC surface, channel names, payload/return shapes, side effects, and healthy-path ordering/timing are unchanged.

Healthy-path confirmation: the healthy-path contract/timing was preserved (no changes to channels, payload/return shapes, side effects, or execution ordering when bridge wiring is valid).

Failure-path confirmation: failure-mode handling is aligned to the convention (required startup dependencies fail fast; optional capabilities are guarded with continue/fallback diagnostics and stable dedupe where repetition can occur).

### public/editor.js

| ID | Location anchor | Bridge member/path | Class | Current handling | Required handling | Action taken | Dedupe key (if any) |
|----|------------------|--------------------|-------|------------------|-------------------|--------------|---------------------|
| E01 | top-level logger init (`L17`) startup/rare | `window.getLogger` | required startup dependency | Before: direct call with implicit TypeError when bridge contract was missing. | Fail fast with explicit diagnostic; abort invalid init path. | Added explicit function check + `throw new Error('[editor] window.getLogger unavailable; cannot continue')`. | n/a |
| E02 | constants bootstrap (`L27`) startup/rare | `window.AppConstants` | required startup dependency | Already fail-fast `throw`, but diagnostic text was non-English. | Fail fast with clear English diagnostic in `.js`. | Kept fail-fast behavior; updated throw text to English-only diagnostic. | n/a |
| E03 | i18n bootstrap (`L107`) startup/rare | `window.RendererI18n.{loadRendererTranslations,tRenderer}` | required startup dependency | Already fail-fast `throw`, but diagnostic text was non-English. | Fail fast with clear English diagnostic in `.js`. | Kept fail-fast behavior; updated throw text to English-only diagnostic. | n/a |
| E04 | core bridge contract (`L34`) startup/rare | `window.editorAPI` (object presence) | required startup dependency | Before: used implicitly; missing object surfaced later as runtime TypeError in bootstrap/IPC paths. | Hard abort invalid init path before wiring. | Added explicit object-level fail-fast check. | n/a |
| E05 | sync publisher (`L37`, `L331`, `L345`, `L760`) startup+interactive | `window.editorAPI.setCurrentText` | required startup dependency | Before: unclassified coexistence (implicit dependency plus runtime try/catch fallback). | Enforce required contract at bootstrap; keep runtime payload fallback semantics unchanged. | Added explicit startup fail-fast check; preserved existing payload/fallback behavior. | `editor.setCurrentText.payload_failed`; `setCurrentText.drop.fallback`; `setCurrentText.truncate.fallback`; `setCurrentText.trash.clear.fallback`; `setCurrentText.typing_toggle_on.fallback` |
| E06 | initial text hydrate (`L40`, `L587`) startup/rare | `window.editorAPI.getCurrentText` | required startup dependency | Before: relied on async catch during init; missing method caused degraded late error path. | Fail fast for missing contract; do not continue invalid init. | Added explicit startup fail-fast check. | n/a |
| E07 | incoming text subscription (`L43`, `L599`) startup/rare | `window.editorAPI.onInitText` | required startup dependency | Before: direct call without guard; missing method threw at listener wiring time. | Fail fast with explicit diagnostic before IPC registration use. | Added explicit startup fail-fast check. | n/a |
| E08 | incoming text subscription (`L46`, `L600`) startup/rare | `window.editorAPI.onExternalUpdate` | required startup dependency | Before: direct call without guard; missing method threw at listener wiring time. | Fail fast with explicit diagnostic before IPC registration use. | Added explicit startup fail-fast check. | n/a |
| E09 | force-clear subscription (`L49`, `L602`) startup/rare | `window.editorAPI.onForceClear` | required startup dependency | Before: direct call without guard; missing method threw at listener wiring time. | Fail fast with explicit diagnostic before IPC registration use. | Added explicit startup fail-fast check. | n/a |
| E10 | config bootstrap (`L58`) startup/rare | `window.editorAPI.getAppConfig` | optional capability | Call inside BOOTSTRAP try/catch; on failure continues with defaults and warns. | Guard/continue degraded with BOOTSTRAP diagnostic. | No change; existing failure handling already compliant for optional bootstrap fallback. | n/a |
| E11 | settings bootstrap (`L68`) startup/rare | `window.editorAPI.getSettings` | optional capability | Before: guard existed but missing branch was silent. | Guard + continue with defaults + BOOTSTRAP diagnostic. | Added explicit missing-method BOOTSTRAP warning branch. | n/a |
| E12 | runtime settings updates (`L149`) runtime/rare | `window.editorAPI.onSettingsChanged` | optional capability | Before: optional guard existed but missing branch was silent. | Guard + continue with feature disabled + diagnostic. | Added explicit warning in missing-method branch. | n/a |
| E13 | notice sink primary (`L184`) interactive/potentially high-frequency | `window.Notify.toastEditorText` | optional capability | Guard + fallback to `notifyMain` with deduped warning. | Guard + continue/fallback + deduped diagnostic. | No change; already compliant. | `editor.showNotice.toastEditorText.missing` |
| E14 | notice sink fallback (`L192`, `L203`) interactive | `window.Notify.notifyMain` | optional capability | Guarded fallback path; missing sink logs deduped error and drops notice. | Guard + continue/drop + diagnostic on dropped intended action. | No change; already compliant. | `editor.showNotice.notifyMain.missing` |
| E15 | keyed notice API (`L220`, call-sites `L363`, `L389`, `L408`, `L631`, `L641`, `L662`, `L670`, `L683`, `L714`, `L765`) interactive/potentially high-frequency | `window.Notify.notifyEditor` | optional capability | Before: unguarded direct call-sites could throw and break local flows when bridge missing. | Guard + continue with fallback + deduped diagnostic for repeatable misses. | Added local guarded notifier path (`notifyEditor`) with `warnOnce` + fallback `showNotice(tr(key,key), opts)` and routed all call-sites through it. | `editor.notifyEditor.missing` |

Level 4 evidence:
- N. No Level 4 escalation applies: all changes are local failure-path alignment in `public/editor.js`; IPC surface, channel names, payload/return shapes, side effects, and healthy-path ordering/timing were not changed.

Healthy-path confirmation: the healthy-path contract/timing was preserved (no changes to channels, payload/return shapes, side effects, or execution ordering when bridge wiring is valid).

Failure-path confirmation: failure-mode handling is aligned to the convention (required startup dependencies fail fast; optional capabilities are guarded with continue/fallback diagnostics, including dedupe where repeatable misses add no value).

### public/editor_find.js

| ID | Location anchor | Bridge member/path | Class | Current handling | Required handling | Action taken | Dedupe key (if any) |
|----|------------------|--------------------|-------|------------------|-------------------|--------------|---------------------|
| EF01 | top-level logger init (`L17`) startup/rare | `window.getLogger` | required startup dependency | Before: direct call with implicit TypeError when contract was missing. | Fail fast with explicit diagnostic; abort invalid init path. | Added explicit function check + `throw new Error('[editor-find] window.getLogger unavailable; cannot continue.')`. | n/a |
| EF02 | constants bootstrap (`L24`) startup/rare | `window.AppConstants` | required startup dependency | Already explicit fail-fast throw when missing. | Fail fast with explicit diagnostic. | No change; already compliant. | n/a |
| EF03 | i18n bootstrap (`L30`) startup/rare | `window.RendererI18n.{loadRendererTranslations,tRenderer}` | required startup dependency | Already explicit fail-fast throw when missing contract. | Fail fast with explicit diagnostic. | No change; already compliant. | n/a |
| EF04 | bridge object bootstrap (`L36`) startup/rare | `window.editorFindAPI` | required startup dependency | Already explicit fail-fast throw when object is missing. | Fail fast with explicit diagnostic. | No change; already compliant. | n/a |
| EF05 | required method contract (`L41`) startup/rare | `window.editorFindAPI.{setQuery,next,prev,close,onInit,onState}` | required startup dependency | Already explicit fail-fast throw when any required method is missing. | Fail fast with explicit diagnostic. | No change; already compliant. | n/a |
| EF06 | query push on input (`L164`) potentially high-frequency | `window.editorFindAPI.setQuery` | required startup dependency | Before: runtime send failures logged with non-deduped `log.error` on each input-triggered failure. | Preserve flow; for repeatable high-frequency failures use deduped error diagnostic. | Changed to `log.errorOnce` with stable key for repeatable send failures. | `editor-find.setQuery.failed` |
| EF07 | Enter/Shift+Enter navigation (`L213`, `L215`) interactive | `window.editorFindAPI.prev` / `window.editorFindAPI.next` | required startup dependency | Call + promise rejection logging via `log.error`; low-frequency user action. | Keep action attempt; log failure without dedupe requirement. | No change; already compliant for interactive low-frequency path. | n/a |
| EF08 | click navigation (`L220`, `L224`) interactive | `window.editorFindAPI.prev` / `window.editorFindAPI.next` | required startup dependency | Call + promise rejection logging via `log.error`; low-frequency user action. | Keep action attempt; log failure without dedupe requirement. | No change; already compliant for interactive low-frequency path. | n/a |
| EF09 | close action (`L228`) interactive/rare | `window.editorFindAPI.close` | required startup dependency | Call + promise rejection logging via `log.error`; low-frequency action. | Keep action attempt; log failure without dedupe requirement. | No change; already compliant for interactive low-frequency path. | n/a |
| EF10 | init subscription (`L234`) startup/rare | `window.editorFindAPI.onInit` | required startup dependency | Required listener registration; missing contract already fail-fast at bootstrap. | Fail fast if contract missing; preserve subscription path. | No change; already compliant via required-method gate. | n/a |
| EF11 | state subscription (`L238`) startup/rare | `window.editorFindAPI.onState` | required startup dependency | Required listener registration; missing contract already fail-fast at bootstrap. | Fail fast if contract missing; preserve subscription path. | No change; already compliant via required-method gate. | n/a |
| EF12 | language bootstrap settings fetch (`L181`, `L189`) startup/rare | `window.editorFindAPI.getSettings` | optional capability | Guarded optional call; missing/failure falls back to default language with BOOTSTRAP `warnOnce`. | Guard + continue degraded + BOOTSTRAP diagnostic. | No change; already compliant. | `BOOTSTRAP:editor-find.getSettings.missing`; `BOOTSTRAP:editor-find.getSettings.failed` |
| EF13 | focus sync subscription (`L240`) startup/rare | `window.editorFindAPI.onFocusQuery` | optional capability | Guarded optional wiring; missing method logs BOOTSTRAP `warnOnce` and feature is disabled. | Guard + continue with capability disabled + BOOTSTRAP diagnostic. | No change; already compliant. | `BOOTSTRAP:editor-find.onFocusQuery.missing` |
| EF14 | live settings updates (`L252`) runtime/rare | `window.editorFindAPI.onSettingsChanged` | optional capability | Guarded optional wiring; missing method logs BOOTSTRAP `warnOnce` and module continues. | Guard + continue with capability disabled + diagnostic. | No change; already compliant. | `BOOTSTRAP:editor-find.onSettingsChanged.missing` |

Level 4 evidence:
- N. No Level 4 escalation applies: all changes are local failure-path/observability alignment in `public/editor_find.js`; IPC surface, channel names, payload/return shapes, side effects, and healthy-path ordering/timing were not changed.

Healthy-path confirmation: the healthy-path contract/timing was preserved (no changes to channels, payload/return shapes, side effects, or execution ordering when bridge wiring is valid).

Failure-path confirmation: failure-mode handling is aligned to the convention (required startup dependencies fail fast; optional capabilities remain guarded with diagnostics; repeatable high-frequency setQuery failures now use stable dedupe).

### public/task_editor.js

| ID | Location anchor | Bridge member/path | Class | Current handling | Required handling | Action taken | Dedupe key (if any) |
|----|------------------|--------------------|-------|------------------|-------------------|--------------|---------------------|
| T01 | top-level logger init (`L17`) startup/rare | `window.getLogger` | required startup dependency | Before: direct call with implicit TypeError when missing. | Fail fast with explicit diagnostic; abort invalid init path. | Added explicit function check + `throw new Error('[task-editor] window.getLogger unavailable; cannot continue')`. | n/a |
| T02 | constants bootstrap (`L22`) startup/rare | `window.AppConstants` | required startup dependency | Already fail-fast throw, but diagnostic text was non-English. | Fail fast with clear English diagnostic in `.js`. | Kept fail-fast behavior; updated throw text to English-only diagnostic. | n/a |
| T03 | i18n bootstrap (`L40`) startup/rare | `window.RendererI18n.{loadRendererTranslations,tRenderer}` | required startup dependency | Already fail-fast throw, but diagnostic text was non-English. | Fail fast with clear English diagnostic in `.js`. | Kept fail-fast behavior; updated throw text to English-only diagnostic. | n/a |
| T04 | notice sink (`L255`) interactive | `window.Notify.notifyEditor` | optional capability | Guarded in `showEditorNotice`; missing/failure logs warning and continues. | Guard + continue (drop notice if unavailable) + diagnostic. | No change; already compliant optional fallback path. | `task_editor.notify.missing` |
| T05 | snapshot picker action (`L289`) interactive/rare | `window.taskEditorAPI.selectTaskRowSnapshot` | optional capability | Guarded via `getTaskEditorApi`; missing method warns once + notice; failures mapped to user notices. | Guard + continue with feature disabled + diagnostic. | No change; already compliant. | `task_editor.api.missing.selectTaskRowSnapshot` |
| T06 | snapshot load action (`L316`) interactive/rare | `window.taskEditorAPI.loadTaskRowSnapshot` | optional capability | Guarded via `getTaskEditorApi`; missing method warns once + notice; failures mapped to user notices. | Guard + continue with feature disabled + diagnostic. | No change; already compliant. | `task_editor.api.missing.loadTaskRowSnapshot` |
| T07 | link open action (`L481`) interactive | `window.taskEditorAPI.openTaskLink` | optional capability | Guarded via `getTaskEditorApi`; missing method warns once + notice; result codes handled without crash. | Guard + continue with feature disabled + diagnostic. | No change; already compliant. | `task_editor.api.missing.openTaskLink` |
| T08 | persist column widths (`L608`, `L613`) runtime/repeatable | `window.taskEditorAPI.saveColumnWidths` | optional capability | Guarded; missing/failure logged with `warnOnce`; flow continues. | Guard + continue + deduped diagnostic for repeatable misses. | No change; already compliant. | `task_editor.columnWidths.save.missingApi`; `task_editor.columnWidths.save` |
| T09 | load column widths (`L621`, `L628`) startup/rare | `window.taskEditorAPI.getColumnWidths` | optional capability | Guarded; missing/failure falls back to defaults with BOOTSTRAP `warnOnce`; continues. | Guard + continue degraded + BOOTSTRAP diagnostic. | No change; already compliant. | `BOOTSTRAP:task_editor.columnWidths.missingApi`; `BOOTSTRAP:task_editor.columnWidths.load` |
| T10 | task save flow (`L752`, `L772`) interactive | `window.taskEditorAPI.saveTaskList` | optional capability | Guarded via `getTaskEditorApi`; missing method warns once + user notice; save flow continues without crash. | Guard + continue with feature disabled + diagnostic. | No change; already compliant. | `task_editor.api.missing.saveTaskList` |
| T11 | task delete flow (`L799`, `L801`) interactive/rare | `window.taskEditorAPI.deleteTaskList` | optional capability | Guarded via `getTaskEditorApi`; missing method warns once + user notice; delete flow continues safely. | Guard + continue with feature disabled + diagnostic. | No change; already compliant. | `task_editor.api.missing.deleteTaskList` |
| T12 | library delete flow (`L863`, `L865`) interactive | `window.taskEditorAPI.deleteLibraryEntry` | optional capability | Guarded via `getTaskEditorApi`; missing method warns once + user notice. | Guard + continue with feature disabled + diagnostic. | No change; already compliant. | `task_editor.api.missing.deleteLibraryEntry` |
| T13 | library list flow (`L904`, `L906`) interactive/rare | `window.taskEditorAPI.listLibrary` | optional capability | Guarded via `getTaskEditorApi`; missing method warns once + user notice. | Guard + continue with feature disabled + diagnostic. | No change; already compliant. | `task_editor.api.missing.listLibrary` |
| T14 | library save flow (`L924`, `L926`) interactive | `window.taskEditorAPI.saveLibraryRow` | optional capability | Guarded via `getTaskEditorApi`; missing method warns once + user notice. | Guard + continue with feature disabled + diagnostic. | No change; already compliant. | `task_editor.api.missing.saveLibraryRow` |
| T15 | init subscription (`L1066`) startup/rare | `window.taskEditorAPI.onInit` | optional capability | Guarded subscription; missing handler logs BOOTSTRAP `warnOnce` and module continues without init payload wiring. | Guard + continue with capability disabled + BOOTSTRAP diagnostic. | No change; already compliant. | `BOOTSTRAP:task_editor.onInit.missing` |
| T16 | close-request subscription (`L1078`) startup/rare | `window.taskEditorAPI.onRequestClose` | optional capability | Guarded subscription; missing handler logs BOOTSTRAP `warnOnce`; module continues. | Guard + continue with capability disabled + BOOTSTRAP diagnostic. | No change; already compliant. | `BOOTSTRAP:task_editor.onRequestClose.missing` |
| T17 | close-confirm command (`L1080`, `L1085`, `L1090`) interactive/rare | `window.taskEditorAPI.confirmClose` | optional capability | Before: unguarded direct calls inside `onRequestClose` callback; missing method could throw on close request. | Guard + continue + diagnostic when close-confirm capability is unavailable. | Added explicit method guard with `log.warnOnce` and safe return before call-sites. | `task_editor.confirmClose.missing` |
| T18 | language bootstrap (`L1102`) startup/rare | `window.taskEditorAPI.getSettings` | optional capability | Guarded optional call; missing branch logs BOOTSTRAP `warnOnce`; fallback uses default language. | Guard + continue degraded + BOOTSTRAP diagnostic. | No change; already compliant. | `BOOTSTRAP:task_editor.getSettings.missing` |
| T19 | live language updates (`L1118`) runtime/rare | `window.taskEditorAPI.onSettingsChanged` | optional capability | Guarded optional subscription; missing branch logs BOOTSTRAP `warnOnce`; module continues. | Guard + continue with capability disabled + diagnostic. | No change; already compliant. | `BOOTSTRAP:task_editor.onSettingsChanged.missing` |

Level 4 evidence:
- N. No Level 4 escalation applies: all updates are local failure-path/diagnostic alignment in `public/task_editor.js`; IPC surface, channel names, payload/return shapes, side effects, and healthy-path ordering/timing were not changed.

Healthy-path confirmation: the healthy-path contract/timing was preserved (no changes to channels, payload/return shapes, side effects, or execution ordering when bridge wiring is valid).

Failure-path confirmation: failure-mode handling is aligned to the convention (required startup dependencies fail fast; optional capabilities are guarded with diagnostics, and missing `confirmClose` no longer throws during close requests).

### public/js/crono.js

| ID | Location anchor | Bridge member/path | Class | Current handling | Required handling | Action taken | Dedupe key (if any) |
|----|------------------|--------------------|-------|------------------|-------------------|--------------|---------------------|
| C01 | top-level logger init (`L19`) startup/rare | `window.getLogger` | required startup dependency | Before: direct call with implicit TypeError if logger bridge was missing. | Fail fast with explicit diagnostic; abort invalid init path. | Added explicit function check + `throw new Error('[crono] window.getLogger unavailable; cannot continue')`. | n/a |
| C02 | flotante open action (`L100`, `L106`) interactive | `electronAPI.openFlotanteWindow` | optional capability | Guarded; missing method warned and flow continued with toggle reset. | Guard + continue with capability disabled + diagnostic. | No change; already compliant. | n/a |
| C03 | flotante state pull (`L112`, `L114`) interactive/rare | `electronAPI.getCronoState` | optional capability | Before: failure branch had `warnOnce`, but missing-method branch was silent after open. | Guard + continue + diagnostic for missing optional method. | Added missing-method `warnOnce` branch. | `crono.getCronoState.missing`; `crono.getCronoState` |
| C04 | flotante close action (`L140`, `L146`) interactive | `electronAPI.closeFlotanteWindow` | optional capability | Guarded; missing method warned and flow continued with toggle reset. | Guard + continue with capability disabled + diagnostic. | No change; already compliant. | n/a |
| C05 | manual time sync (`L230`, `L232`) interactive | `electronAPI.setCronoElapsed` | optional capability | Before: missing method path silently fell back to local state recompute. | Guard + continue degraded + diagnostic on missing capability. | Added missing-method `warnOnce` before local fallback path. | `crono.setCronoElapsed.missing` |
| C06 | empty-text reset side path (`L427`) interactive | `electronAPI.sendCronoReset` | optional capability | Before: missing method was silent; local reset still happened. | Guard + continue with local fallback + diagnostic. | Added missing-method `warnOnce` in empty-text path. | `crono.sendCronoReset.missing` |
| C07 | toggle button command (`L492`, `L493`) interactive | `electronAPI.sendCronoToggle` | optional capability | Before: missing method was silent and click action was effectively dropped. | Guard + continue + diagnostic when capability is unavailable. | Added missing-method `warnOnce` branch. | `crono.sendCronoToggle.missing` |
| C08 | reset button command (`L502`, `L503`) interactive | `electronAPI.sendCronoReset` | optional capability | Before: missing method was silent and click action was effectively dropped. | Guard + continue + diagnostic when capability is unavailable. | Added missing-method `warnOnce` branch (shared key with C06). | `crono.sendCronoReset.missing` |
| C09 | flotante close subscription (`L523`) startup/rare | `electronAPI.onFlotanteClosed` | optional capability | Before: optional wiring existed, but missing method path had no diagnostic. | Guard + continue with degraded sync + diagnostic. | Added missing-method `warnOnce` branch when `electronAPI` exists but callback API is absent. | `crono.onFlotanteClosed.missing` |
| C10 | blur-time parse module ref (`L546`) interactive | `window.RendererCrono.parseCronoInput` (self-module pass-through) | optional capability | Guarded by fallback: if `cronoModule.parseCronoInput` missing, local `parseCronoInput` is used. | Guard + continue with local fallback; no crash. | No change; already compliant fallback semantics. | n/a |

Level 4 evidence:
- N. No Level 4 escalation applies: all changes are local failure-path/diagnostic alignment in `public/js/crono.js`; IPC surface, channel names, payload/return shapes, side effects, and healthy-path ordering/timing were not changed.

Healthy-path confirmation: the healthy-path contract/timing was preserved (no changes to channels, payload/return shapes, side effects, or execution ordering when bridge wiring is valid).

Failure-path confirmation: failure-mode handling is aligned to the convention (required startup dependency now fails fast explicitly; optional `electronAPI` capabilities are guarded with diagnostics and no silent fallbacks remain in bridge-missing paths).

### public/js/presets.js

| ID | Location anchor | Bridge member/path | Class | Current handling | Required handling | Action taken | Dedupe key (if any) |
|----|------------------|--------------------|-------|------------------|-------------------|--------------|---------------------|
| PR01 | top-level logger init (`L19`) startup/rare | `window.getLogger` | required startup dependency | Before: direct call with implicit TypeError when missing. | Fail fast with explicit diagnostic; abort invalid init path. | Added explicit function check + `throw new Error('[presets] window.getLogger unavailable; cannot continue')`. | n/a |
| PR02 | constants bootstrap (`L24`) startup/rare | `window.AppConstants` | required startup dependency | Before: implicit destructuring failure if missing (`TypeError`). | Fail fast with explicit diagnostic. | Added explicit object check + throw with English diagnostic. | n/a |
| PR03 | i18n base-language helper (`L29`, `L45`, `L133`) startup+interactive | `window.RendererI18n.getLangBase` | required startup dependency | Before: implicit destructuring/runtime failure when missing helper. | Fail fast with explicit diagnostic. | Added explicit contract check + throw (`RendererI18n.getLangBase unavailable`). | n/a |
| PR04 | load flow contract (`L99`) startup/interactive | `electronAPI` (argument to `loadPresetsIntoDom`) | required startup dependency | Already hard-fail throw on missing argument, but diagnostic was non-English. | Fail fast with clear English diagnostic. | Kept fail-fast behavior; updated throw text to English. | n/a |
| PR05 | default presets fetch (`L103`, `L105`) startup/interactive | `electronAPI.getDefaultPresets` | optional capability | Before: invoked without method guard; missing method fell into catch via exception and logged error. | Guard + continue degraded + diagnostic on missing capability. | Added method guard with `warnOnce` for missing branch; kept existing catch logging for runtime failures. | `presets.getDefaultPresets.missing` |
| PR06 | selected preset persistence (`L170`, `L171`) interactive | `electronAPI.setSelectedPreset` | optional capability | Before: guarded call for happy-path but missing branch was silent (no diagnostic). | Guard + continue + diagnostic on dropped persistence capability. | Added missing-method `warnOnce` branch before skip. | `presets.setSelectedPreset.missing` |
| PR07 | module export surface (`L193`) startup/rare | `window.RendererPresets` (send-to-window module surface) | required startup dependency | Direct assignment; no explicit failure handling (normal in renderer module export path). | Preserve contract and module surface without changing timing/shape. | No change; export surface preserved as-is. | n/a |

Level 4 evidence:
- N. No Level 4 escalation applies: all changes are local failure-path/diagnostic alignment in `public/js/presets.js`; IPC surface, channel names, payload/return shapes, side effects, and healthy-path ordering/timing were not changed.

Healthy-path confirmation: the healthy-path contract/timing was preserved (no changes to channels, payload/return shapes, side effects, or execution ordering when bridge wiring is valid).

Failure-path confirmation: failure-mode handling is aligned to the convention (required startup dependencies now fail fast explicitly, and optional preset API capabilities are guarded with diagnostics instead of silent fallback).

### public/js/menu_actions.js

| ID | Location anchor | Bridge member/path | Class | Current handling | Required handling | Action taken | Dedupe key (if any) |
|----|------------------|--------------------|-------|------------------|-------------------|--------------|---------------------|
| MA01 | top-level logger init (`L18`) startup/rare | `window.getLogger` | required startup dependency | Before: direct call with implicit TypeError if logger bridge was missing. | Fail fast with explicit diagnostic; abort invalid init path. | Added explicit function check + `throw new Error('[menu-actions] window.getLogger unavailable; cannot continue')`. | n/a |
| MA02 | listener registration (`L76`, `L82`) startup/rare | `window.electronAPI.onMenuClick` | optional capability | Guarded setup; when missing, bootstrap retry path logs warning and module continues without menu-click handling. | Guard + continue with capability disabled + diagnostic. | No change in control-flow; optional guarding already compliant. | n/a |
| MA03 | bootstrap retry (`L103`, `L107`) startup/rare | `window.electronAPI.onMenuClick` (retry path) | optional capability | Before: first retry warning had BOOTSTRAP marker, second post-DOM warning lacked BOOTSTRAP marker. | BOOTSTRAP fallback diagnostics should be explicitly marked in bootstrap-only path. | Updated post-DOM warning message prefix to `BOOTSTRAP:`. | n/a |
| MA04 | unsubscribe handle contract (`L82`, `L85`, `L91`) startup+manual teardown | `onMenuClick` return unsubscribe function (IPC-adjacent path) | optional capability | Missing unsubscribe function logs warning; listener remains active but not removable via `stopListening`. | Guard + continue degraded with diagnostic (no crash, capability partially disabled). | No change; already compliant optional degradation path. | n/a |
| MA05 | teardown side action (`L123`, `L125`, `L129`) manual/rare | `_unsubscribeMenuClick()` (IPC-adjacent cleanup path) | best-effort side action | Attempted in try/catch; failures logged and flow continues. | Attempt; if it fails, drop without breaking flow + diagnostic. | No change; already compliant best-effort semantics. | n/a |
| MA06 | module surface export (`L116`) startup/rare | `window.menuActions` (send-to-window path) | required startup dependency | Direct export assignment with stable API (`registerMenuAction`, `unregisterMenuAction`, `listMenuActions`, `stopListening`). | Preserve exported surface and timing without contract drift. | No change; export contract preserved as-is. | n/a |

Level 4 evidence:
- N. No Level 4 escalation applies: all changes are local failure-path/diagnostic alignment in `public/js/menu_actions.js`; IPC surface, channel names, payload/return shapes, side effects, and healthy-path ordering/timing were not changed.

Healthy-path confirmation: the healthy-path contract/timing was preserved (no changes to channels, payload/return shapes, side effects, or execution ordering when bridge wiring is valid).

Failure-path confirmation: failure-mode handling is aligned to the convention (required startup dependency now fails fast explicitly, and optional bootstrap fallback diagnostics for `onMenuClick` are consistently marked and non-silent).

### public/js/i18n.js

| ID | Location anchor | Bridge member/path | Class | Current handling | Required handling | Action taken | Dedupe key (if any) |
|----|------------------|--------------------|-------|------------------|-------------------|--------------|---------------------|
| I18N01 | top-level logger init (`L19`) startup/rare | `window.getLogger` | required startup dependency | Before: direct call with implicit TypeError when logger bridge was missing. | Fail fast with explicit diagnostic; abort invalid init path. | Added explicit function check + `throw new Error('[i18n] window.getLogger unavailable; cannot continue')`. | n/a |
| I18N02 | constants bootstrap (`L21`-`L23`) startup/rare | `window.AppConstants.DEFAULT_LANG` | required startup dependency | Before: implicit destructuring/use without contract validation; could proceed with invalid defaults or fail indirectly. | Fail fast with explicit diagnostic when required default language contract is unavailable/invalid. | Added explicit guard for missing/invalid `AppConstants.DEFAULT_LANG` and throw with English diagnostic. | n/a |
| I18N03 | module surface export (`L211`) startup/rare | `window.RendererI18n` (send-to-window path) | required startup dependency | Direct export assignment with stable surface (`loadRendererTranslations`, `tRenderer`, `msgRenderer`, `normalizeLangTag`, `getLangBase`). | Preserve exported API contract/timing and avoid shape drift. | No change; export contract preserved as-is. | n/a |

Level 4 evidence:
- N. No Level 4 escalation applies: all updates are local failure-path alignment in `public/js/i18n.js`; IPC surface, channel names, payload/return shapes, side effects, and healthy-path ordering/timing were not changed.

Healthy-path confirmation: the healthy-path contract/timing was preserved (no changes to channels, payload/return shapes, side effects, or execution ordering when bridge wiring is valid).

Failure-path confirmation: failure-mode handling is aligned to the convention (required startup dependencies now fail fast explicitly; existing optional bundle-fallback diagnostics remain guarded and deduplicated).

### public/js/notify.js

| ID | Location anchor | Bridge member/path | Class | Current handling | Required handling | Action taken | Dedupe key (if any) |
|----|------------------|--------------------|-------|------------------|-------------------|--------------|---------------------|
| N01 | top-level logger init (`L18`) startup/rare | `window.getLogger` | required startup dependency | Before: direct call with implicit TypeError if logger bridge was missing. | Fail fast with explicit diagnostic; abort invalid init path. | Added explicit function check + `throw new Error('[notify] window.getLogger unavailable; cannot continue')`. | n/a |
| N02 | i18n resolver (`L25`, `L34`) runtime/interactive | `window.RendererI18n.msgRenderer` | optional capability | Guarded optional use; missing contract emits deduped warning and falls back to key text. | Guard + continue degraded + diagnostic. | No change; already compliant optional fallback path. | `notify.resolveText.i18n.missing` |
| N03 | API flow fallback (`L145`, `L159`, `L179`) runtime/interactive | `notifyMain` call path (IPC-adjacent UI fallback path) | best-effort side action | Wrapped in try/catch from toast paths; on failure logs error and continues without breaking caller flow. | Attempt fallback action; if it fails, drop and diagnose. | No change; already compliant best-effort fallback behavior. | n/a |
| N04 | module surface export (`L189`) startup/rare | `window.Notify` (send-to-window path) | required startup dependency | Direct export assignment with stable surface (`notifyMain`, `notifyEditor`, `toastMain`, `toastEditorText`). | Preserve exported API contract/timing without drift. | No change; export contract preserved as-is. | n/a |

Level 4 evidence:
- N. No Level 4 escalation applies: all updates are local failure-path alignment in `public/js/notify.js`; IPC surface, channel names, payload/return shapes, side effects, and healthy-path ordering/timing were not changed.

Healthy-path confirmation: the healthy-path contract/timing was preserved (no changes to channels, payload/return shapes, side effects, or execution ordering when bridge wiring is valid).

Failure-path confirmation: failure-mode handling is aligned to the convention (required startup dependency now fails fast explicitly, and optional/best-effort notification fallbacks remain guarded with diagnostics).

### public/js/current_text_snapshots.js

| ID | Location anchor | Bridge member/path | Class | Current handling | Required handling | Action taken | Dedupe key (if any) |
|----|------------------|--------------------|-------|------------------|-------------------|--------------|---------------------|
| CTS01 | top-level logger init (`L14`-`L17`) startup/rare | `window.getLogger` | required startup dependency | Explicit contract check + `throw new Error` when `getLogger` is missing; init aborts. | Fail fast with explicit diagnostic; do not continue invalid init path. | No change; already compliant. | n/a |
| CTS02 | `toast()` primary branch (`L31`-`L33`) interactive | `window.Notify.toastMain` | optional capability | Guarded method call; when unavailable, flow falls through to secondary notify branch. | Guard + continue with capability degraded + diagnostic on dropped action. | No change; already compliant optional guard chain. | n/a |
| CTS03 | `toast()` secondary branch + fallback (`L35`-`L39`) interactive | `window.Notify.notifyMain` | optional capability | Guarded fallback call; if both Notify methods are missing, action is dropped and warning emitted. | Guard + continue + diagnostic when intended toast action is dropped. | Changed fallback diagnostic from `log.warnOnce('current_text_snapshots.notify.unavailable', ...)` to `log.warn(...)` because this path is not high-frequency. | n/a |
| CTS04 | `saveSnapshot()` bridge call (`L75`-`L83`) interactive | `window.electronAPI.saveCurrentTextSnapshot` | optional capability | Guarded before invoke; missing method logs warning, shows unavailable toast, returns `{ ok:false, code:'WRITE_FAILED' }`. | Guard + continue with capability disabled + diagnostic. | No change; already compliant. | n/a |
| CTS05 | `loadSnapshot()` bridge call (`L92`-`L99`) interactive | `window.electronAPI.loadCurrentTextSnapshot` | optional capability | Guarded before invoke; missing method logs warning, shows unavailable toast, returns `{ ok:false, code:'READ_FAILED' }`. | Guard + continue with capability disabled + diagnostic. | No change; already compliant. | n/a |
| CTS06 | module surface export (`L107`-`L110`) startup/rare | `window.CurrentTextSnapshots` (send-to-window path) | required startup dependency | Direct export assignment with stable API (`saveSnapshot`, `loadSnapshot`). | Preserve exported contract/timing and avoid surface drift. | No change; export surface preserved as-is. | n/a |

Level 4 evidence:
- N. No Level 4 escalation applies: the update is local failure-path/diagnostic alignment in `public/js/current_text_snapshots.js`; IPC surface, channel names, payload/return shapes, side effects, and healthy-path ordering/timing were not changed.

Healthy-path confirmation: the healthy-path contract/timing was preserved (no changes to channels, payload/return shapes, side effects, or execution ordering when bridge wiring is valid).

Failure-path confirmation: failure-mode handling is aligned to the convention (required startup dependency fails fast, optional bridge capabilities are guarded with diagnostics, and low-frequency fallback logging follows the logger header policy).

### public/js/count.js

| ID | Location anchor | Bridge member/path | Class | Current handling | Required handling | Action taken | Dedupe key (if any) |
|----|------------------|--------------------|-------|------------------|-------------------|--------------|---------------------|
| CNT01 | top-level logger init (`L20`) startup/rare | `window.getLogger` | required startup dependency | Before: direct call with implicit TypeError if bridge was missing. | Fail fast with explicit diagnostic; abort invalid init path. | Added explicit function check + `throw new Error('[count] window.getLogger unavailable; cannot continue')`. | n/a |
| CNT02 | constants bootstrap (`L22`) startup/rare | `window.AppConstants.DEFAULT_LANG` | required startup dependency | Before: implicit destructuring/use without contract validation. | Fail fast with explicit diagnostic when required default language contract is missing/invalid. | Added explicit contract check + `throw new Error('[count] window.AppConstants.DEFAULT_LANG unavailable; cannot continue')`. | n/a |
| CNT03 | module surface export (`L203`) startup/rare | `window.CountUtils` (send-to-window path) | required startup dependency | Direct export assignment with stable API (`contarTextoSimple`, `contarTextoPrecisoFallback`, `contarTextoPreciso`, `contarTexto`, `hasIntlSegmenter`). | Preserve exported contract/timing and avoid surface drift. | No change; export surface preserved as-is. | n/a |

Level 4 evidence:
- N. No Level 4 escalation applies: updates are local failure-path alignment in `public/js/count.js`; IPC surface, payload/return shapes, side effects, and healthy-path ordering/timing were not changed.

Healthy-path confirmation: the healthy-path contract/timing was preserved (no changes to channels, payload/return shapes, side effects, or execution ordering when bridge wiring is valid).

Failure-path confirmation: failure-mode handling is aligned to the convention (required startup dependencies now fail fast explicitly and module-surface contract remains stable).

### public/js/format.js

| ID | Location anchor | Bridge member/path | Class | Current handling | Required handling | Action taken | Dedupe key (if any) |
|----|------------------|--------------------|-------|------------------|-------------------|--------------|---------------------|
| FMT01 | top-level logger init (`L17`) startup/rare | `window.getLogger` | required startup dependency | Before: direct call with implicit TypeError when missing. | Fail fast with explicit diagnostic; abort invalid init path. | Added explicit function check + `throw new Error('[format] window.getLogger unavailable; cannot continue')`. | n/a |
| FMT02 | constants bootstrap (`L19`) startup/rare | `window.AppConstants.DEFAULT_LANG` | required startup dependency | Before: implicit destructuring/use without contract validation. | Fail fast with explicit diagnostic when required default language contract is missing/invalid. | Added explicit contract check + `throw new Error('[format] window.AppConstants.DEFAULT_LANG unavailable; cannot continue')`. | n/a |
| FMT03 | i18n helper contract (`L20`, `L51`, `L52`, `L56`) startup+interactive | `window.RendererI18n.normalizeLangTag` | required startup dependency | Before: implicit destructuring/use; missing method failed later on first number-format call. | Fail fast with explicit diagnostic; avoid late runtime failure in utility path. | Added explicit contract check for `window.RendererI18n.normalizeLangTag`. | n/a |
| FMT04 | i18n helper contract (`L20`, `L52`, `L56`) startup+interactive | `window.RendererI18n.getLangBase` | required startup dependency | Before: implicit destructuring/use; missing method failed later on first number-format call. | Fail fast with explicit diagnostic; avoid late runtime failure in utility path. | Added explicit contract check for `window.RendererI18n.getLangBase`. | n/a |
| FMT05 | module surface export (`L82`) startup/rare | `window.FormatUtils` (send-to-window path) | required startup dependency | Direct export assignment with stable API (`getTimeParts`, `formatTimeFromWords`, `obtenerSeparadoresDeNumeros`, `formatearNumero`). | Preserve exported contract/timing and avoid surface drift. | No change; export surface preserved as-is. | n/a |

Level 4 evidence:
- N. No Level 4 escalation applies: updates are local failure-path alignment in `public/js/format.js`; IPC surface, payload/return shapes, side effects, and healthy-path ordering/timing were not changed.

Healthy-path confirmation: the healthy-path contract/timing was preserved (no changes to channels, payload/return shapes, side effects, or execution ordering when bridge wiring is valid).

Failure-path confirmation: failure-mode handling is aligned to the convention (required startup bridge dependencies now fail fast explicitly and module-surface contract remains stable).

### public/js/info_modal_links.js

| ID | Location anchor | Bridge member/path | Class | Current handling | Required handling | Action taken | Dedupe key (if any) |
|----|------------------|--------------------|-------|------------------|-------------------|--------------|---------------------|
| IML01 | top-level logger init (`L18`-`L22`) startup/rare | `window.getLogger` | required startup dependency | Before: direct call with implicit TypeError when logger bridge was missing. | Fail fast with explicit diagnostic; abort invalid init path. | Added explicit function check + `throw new Error('[info-modal-links] window.getLogger unavailable; cannot continue')`. | n/a |
| IML02 | appdoc click path (`L91`-`L109`) interactive | `window.electronAPI.openAppDoc` (or injected `electronAPI.openAppDoc`) | optional capability | Guarded optional call; missing capability now logs `warn` and skips action; runtime failures log `warn` and continue. | Guard + continue with capability disabled + diagnostic. | Kept guard/flow; changed missing-capability diagnostic from `warnOnce` to `warn` for non-high-frequency interactive misses. | n/a |
| IML03 | external-link click path (`L113`-`L130`) interactive | `window.electronAPI.openExternalUrl` (or injected `electronAPI.openExternalUrl`) | optional capability | Guarded optional call; missing capability now logs `warn` and skips action; runtime failures log `warn` and continue. | Guard + continue with capability disabled + diagnostic. | Kept guard/flow; changed missing-capability diagnostic from `warnOnce` to `warn` for non-high-frequency interactive misses. | n/a |
| IML04 | module surface export (`L137`-`L139`) startup/rare | `window.InfoModalLinks` (send-to-window path) | required startup dependency | Direct export assignment with stable API (`bindInfoModalLinks`). | Preserve exported contract/timing and avoid surface drift. | No change; export surface preserved as-is. | n/a |

Level 4 evidence:
- N. No Level 4 escalation applies: updates are local failure-path/diagnostic alignment in `public/js/info_modal_links.js`; IPC surface, channel names, payload/return shapes, side effects, and healthy-path ordering/timing were not changed.

Healthy-path confirmation: the healthy-path contract/timing was preserved (no changes to channels, payload/return shapes, side effects, or execution ordering when bridge wiring is valid).

Failure-path confirmation: failure-mode handling is aligned to the convention (required startup dependency now fails fast explicitly; optional bridge capabilities are guarded with diagnostics, and non-high-frequency misses use `warn` per logger policy).

### electron/main.js

| ID | Location anchor | Bridge member/path | Class | Current handling | Required handling | Action taken | Dedupe key (if any) |
|----|------------------|--------------------|-------|------------------|-------------------|--------------|---------------------|
| EM01 | pre-READY IPC guard (`L81`-`L93`) startup/interactive | `guardMainUserAction` for IPC channels (`crono-*`, `flotante-*`, `open-editor`, `open-preset-modal`, dev shortcuts) | optional capability | Guard + continue; key already BOOTSTRAP, but message lacked BOOTSTRAP prefix. | Guard + continue + BOOTSTRAP diagnostic with BOOTSTRAP-prefixed key/message. | Updated guard message normalization to enforce `BOOTSTRAP:` prefix while preserving behavior and dedupe bucketing. | `BOOTSTRAP:main.preReady.<actionId>` |
| EM02 | editor init send (`L372`, `L1227`) startup/interactive | `editorWin.webContents.send('editor-init-text', payload)` | best-effort side action | Wrapped in try/catch; failures log `error` and flow continues. | Attempt send; if dropped/fails, do not crash main flow; emit diagnostic. | No change; already compliant best-effort handling. | n/a |
| EM03 | editor ready notify (`L383`, `L1238`) startup/interactive | `mainWin.webContents.send('editor-ready')` | best-effort side action | Guarded by window liveness + try/catch; failures logged and flow continues. | Attempt send; drop on failure with diagnostic. | No change; already compliant. | n/a |
| EM04 | task editor close request (`L446`) interactive/rare | `taskEditorWin.webContents.send('task-editor-request-close')` | best-effort side action | Try/catch with fallback force-close; failure uses deduped warning. | Attempt; if send fails, continue with safe fallback + diagnostic. | No change; already compliant. | `taskEditor.close.requestFailed` |
| EM05 | preset modal init send (`L474`, `L505`) interactive/rare | `presetWin.webContents.send('preset-init', payload)` | best-effort side action | Try/catch logging on failure; modal flow continues. | Attempt send; drop/fallback on failure with diagnostic. | No change; already compliant. | n/a |
| EM06 | startup handshake send (`L601`) startup/rare | `mainWin.webContents.send('startup:ready')` | required startup dependency | Emits explicit `error` when target window unavailable/send fails; no silent fallback. | Required startup path must not be silent; invalid path must be clearly diagnosed. | No change; existing handling already emits explicit hard diagnostic and avoids silent continuation of send action. | n/a |
| EM07 | flotante close notify (`L882`) interactive/rare | `mainWin.webContents.send('flotante-closed')` | best-effort side action | Guard + try/catch; failures deduped with `warnOnce`. | Attempt; drop on failure without breaking flow + diagnostic. | No change; already compliant. | `mainWin.send.flotante-closed` |
| EM08 | stopwatch state broadcast (`L951`, `L957`) potentially high-frequency | `mainWin.webContents.send('crono-state')`, `flotanteWin.webContents.send('crono-state')` | best-effort side action | Try/catch + per-target `warnOnce` on failures; high-frequency-safe dedupe. | High-frequency drop paths should dedupe output with stable keys. | No change; already compliant. | `send.crono-state.mainWin`, `send.crono-state.flotanteWin` |
| EM09 | IPC registration (`L1054`) startup/rare | `ipcMain.handle('get-available-languages', ...)` | required startup dependency | Registered at module load; handler has validated fallback list + diagnostics. | Required bridge channel registration with non-silent fallback handling. | No change; already compliant. | n/a |
| EM10 | IPC registration (`L1088`) startup/interactive | `ipcMain.handle('crono-get-state', ...)` | optional capability | Registered unconditionally; returns state directly. | Guarded capability exposed via stable handler registration. | No change; already compliant. | n/a |
| EM11 | IPC registration (`L1092`, `L1101`, `L1110`) interactive | `ipcMain.on('crono-toggle'/'crono-reset'/'crono-set-elapsed')` | optional capability | Pre-READY guarded by `guardMainUserAction`; body try/catch logs errors. | Guard + continue + diagnostic for invalid/pre-ready path. | No change in channel behavior; diagnostics now BOOTSTRAP-prefixed via EM01 guard update. | `BOOTSTRAP:main.preReady.crono-toggle`; `BOOTSTRAP:main.preReady.crono-reset`; `BOOTSTRAP:main.preReady.crono-set-elapsed` |
| EM12 | IPC registration (`L1120`, `L1142`) interactive | `ipcMain.handle('flotante-open'/'flotante-close')` | optional capability | Pre-READY guarded; returns `{ok:false,error:'not ready'}` on blocked path; try/catch diagnostics. | Guard + continue with explicit degraded result + diagnostic. | No change in contract; diagnostics now BOOTSTRAP-prefixed via EM01 guard update. | `BOOTSTRAP:main.preReady.flotante-open`; `BOOTSTRAP:main.preReady.flotante-close` |
| EM13 | IPC registration (`L1162`) interactive | `ipcMain.on('flotante-command', ...)` | optional capability | Pre-READY guard + payload validation with deduped warnings on repeatable invalid commands. | Guard + continue + diagnostic; dedupe for repeatable invalid payload noise. | No change in channel behavior; diagnostics now BOOTSTRAP-prefixed in pre-READY branch via EM01 update. | `BOOTSTRAP:main.preReady.flotante-command`; `flotante-command.invalid`; `flotante-command.set.missingValue`; `flotante-command.set.invalidNumber`; `flotante-command.unknown` |
| EM14 | IPC registration (`L1214`) interactive | `ipcMain.handle('open-editor', ...)` | optional capability | Pre-READY guarded with structured error result; runtime failures logged. | Guard + continue with explicit degraded result + diagnostic. | No change in channel behavior; diagnostics now BOOTSTRAP-prefixed via EM01 guard update. | `BOOTSTRAP:main.preReady.open-editor` |
| EM15 | IPC registration (`L1252`) interactive/rare | `ipcMain.on('task-editor-confirm-close', ...)` | optional capability | Sender-window validation + try/catch; unauthorized/non-target sender ignored safely. | Guard + continue; do not break flow on invalid sender/close races. | No change; already compliant for optional close-confirm path. | n/a |
| EM16 | IPC registration (`L1264`) interactive | `ipcMain.handle('open-preset-modal', ...)` | optional capability | Pre-READY guard, sender auth checks, payload sanitization; degraded returns with diagnostics. | Guard + continue with explicit degraded result + diagnostics. | No change in contract; diagnostics now BOOTSTRAP-prefixed for pre-READY branch via EM01 update. | `BOOTSTRAP:main.preReady.open-preset-modal`; `open-preset-modal.noMainWin`; `open-preset-modal.unauthorized`; `open-preset-modal.invalidPreset`; `open-preset-modal.invalidPayload` |
| EM17 | IPC registration (`L1323`, `L1332`, `L1341`) startup/interactive | `ipcMain.handle('get-app-config'/'get-app-version'/'get-app-runtime-info')` | optional capability | Handlers return stable fallback payloads on errors with diagnostics. | Guard + continue with capability degraded + diagnostic. | No change; already compliant. | n/a |
| EM18 | startup IPC wiring (`L1353`, `L1364`, `L1483`, `L564`) startup/rare | `ipcMain.on('startup:renderer-core-ready')`, `ipcMain.on('startup:splash-removed')`, `ipcMain.once('language-selected')`, `ipcMain.removeListener('language-selected', ...)` | required startup dependency | Explicit startup gating + duplicate protection (`warnOnce`) and cleanup listener removal on fallback path. | Required startup wiring should be explicit, non-silent, and race-safe. | No change; already compliant startup/cleanup handling. | `startup.rendererCoreReady.duplicate`; `startup.splashRemoved.duplicate`; `startup.languageResolved.<reason>` |
| EM19 | delegated IPC registration (`L1362`) startup/rare | `registerLinkIpc({ ipcMain, app, shell })` | required startup dependency | Direct delegated registration; missing dependency would fail fast at startup. | Required registration path should fail fast and keep channel contract. | No change; already compliant fail-fast registration semantics. | n/a |
| EM20 | delegated module IPC registrations (`L1406`-`L1461`) startup/rare | `textState.registerIpc`, `editorFindMain.registerIpc`, `settingsState.registerIpc`, `presetsMain.registerIpc`, `snapshotsMain.registerIpc`, `tasksMain.registerIpc`, `updater.registerIpc` | required startup dependency | Direct registration in `app.whenReady`; failures surface immediately and abort startup path. | Required IPC surfaces should register deterministically or fail fast. | No change; already compliant required startup registration behavior. | n/a |

Level 4 evidence:
- N. No Level 4 escalation applies: updates are local failure-path/diagnostic alignment in `electron/main.js`; IPC surface, channel names, payload/return shapes, side effects, and healthy-path ordering/timing were not changed.

Healthy-path confirmation: the healthy-path contract/timing was preserved (no changes to channels, payload/return shapes, side effects, or execution ordering when bridge wiring is valid).

Failure-path confirmation: failure-mode handling is aligned to the convention (required startup wiring remains explicit, optional capabilities are guarded, best-effort sends remain non-breaking, and BOOTSTRAP diagnostics are now consistently BOOTSTRAP-prefixed).

### electron/text_state.js

| ID | Location anchor | Bridge member/path | Class | Current handling | Required handling | Action taken | Dedupe key (if any) |
|----|------------------|--------------------|-------|------------------|-------------------|--------------|---------------------|
| TS01 | IPC bootstrap (`L225`) startup/rare | `registerIpc(ipcMain, ...)` dependency on `ipcMain.handle` | required startup dependency | Before: no explicit contract check; invalid `ipcMain` failed later with implicit TypeError. | Fail fast with clear diagnostic on missing required IPC registrar contract. | Added explicit check + `throw new Error('[text_state] registerIpc requires ipcMain')`. | n/a |
| TS02 | IPC handler (`L233`) interactive/startup | `ipcMain.handle('get-current-text', ...)` | optional capability | Registered handler returns current text string; no silent failure path in handler body. | Keep guarded non-silent behavior and stable return shape. | No change; already compliant. | n/a |
| TS03 | IPC handler (`L236`) interactive | `ipcMain.handle('clipboard-read-text', ...)` | optional capability | Sender-window authorization guard + too-large guard; both diagnostics deduped and safe return object. | Guard + continue with capability disabled + diagnostic. | No change; already compliant. | `text_state.clipboardRead.unauthorized`; `text_state.clipboardRead.tooLarge` |
| TS04 | IPC handler (`L262`) potentially high-frequency | `ipcMain.handle('set-current-text', ...)` | optional capability | Payload-shape/size guards with deduped diagnostics; rejects oversized payload and returns `{ok:false,error}`; errors logged. | Guard + continue with explicit degraded result + diagnostic; dedupe repeatable high-frequency anomalies. | No change; already compliant. | `text_state.setCurrentText.missingText`; `text_state.setCurrentText.payload_too_large` |
| TS05 | IPC handler (`L295`) interactive/rare | `ipcMain.handle('force-clear-editor', ...)` | optional capability | Handler clears state and notifies windows via best-effort sends; errors return `{ok:false,error}`. | Guard + continue with explicit degraded result + diagnostic. | No change; already compliant. | n/a |
| TS06 | send side action (`L132`) potentially high-frequency | `mainWin.webContents.send('current-text-updated', currentText)` via `safeSend` | best-effort side action | No crash on missing/destroyed windows; send failures deduped by channel. | Attempt send; drop without breaking flow + deduped diagnostic. | No change; already compliant. | `text_state.safeSend:current-text-updated` |
| TS07 | send side action (`L136`) potentially high-frequency | `editorWin.webContents.send('editor-text-updated', payload)` via `safeSend` | best-effort side action | No crash on missing/destroyed windows; send failures deduped by channel. | Attempt send; drop without breaking flow + deduped diagnostic. | No change; already compliant. | `text_state.safeSend:editor-text-updated` |
| TS08 | send side action (`L306`) interactive/rare | `editorWin.webContents.send('editor-force-clear', '')` via `safeSend` | best-effort side action | No crash on missing/destroyed windows; send failures deduped by channel. | Attempt send; drop without breaking flow + deduped diagnostic. | No change; already compliant. | `text_state.safeSend:editor-force-clear` |

Level 4 evidence:
- N. No Level 4 escalation applies: updates are local failure-path/diagnostic alignment in `electron/text_state.js`; IPC surface, channel names, payload/return shapes, side effects, and healthy-path ordering/timing were not changed.

Healthy-path confirmation: the healthy-path contract/timing was preserved (no changes to channels, payload/return shapes, side effects, or execution ordering when bridge wiring is valid).

Failure-path confirmation: failure-mode handling is aligned to the convention (required IPC registration dependency now fails fast explicitly; optional handlers remain guarded; best-effort send paths remain non-breaking with stable dedupe diagnostics).

### electron/settings.js

| ID | Location anchor | Bridge member/path | Class | Current handling | Required handling | Action taken | Dedupe key (if any) |
|----|------------------|--------------------|-------|------------------|-------------------|--------------|---------------------|
| ES01 | IPC registration contract (`L468`-`L477`) startup/rare | `registerIpc(ipcMain, ...)` dependency on `ipcMain.handle` | required startup dependency | Before: only truthy check for `ipcMain`; missing `handle` failed later implicitly. | Fail fast with explicit diagnostic when required registrar contract is invalid. | Updated guard to `if (!ipcMain || typeof ipcMain.handle !== 'function') throw ...`. | n/a |
| ES02 | IPC options contract (`L468`-`L474`) startup/rare | `registerIpc` options object (`getWindows`, `buildAppMenu`) | optional capability | Before: destructuring required second arg even though call-sites treat both callbacks as optional. | Guard + continue when optional callbacks are absent. | Added default parameter `= {}` for options object; kept callback checks unchanged. | n/a |
| ES03 | IPC handler (`L480`) interactive/startup | `ipcMain.handle('get-settings', ...)` | optional capability | Handler catches failures, logs once, returns normalized safe fallback settings. | Guard + continue with degraded result + diagnostic. | No change; already compliant. | `settings.ipc.get-settings` |
| ES04 | IPC handler (`L494`) interactive | `ipcMain.handle('set-language', ...)` | optional capability | Normalizes input, optional menu rebuild guarded, broadcasts best-effort, returns `{ok,...}`; logs on failures. | Guard + continue with degraded result + diagnostics. | No change; already compliant. | `settings.set-language.invalid` |
| ES05 | IPC handler (`L566`) interactive | `ipcMain.handle('set-mode-conteo', ...)` | optional capability | Normalizes mode, persists, broadcasts, returns `{ok,...}`; catches/logs errors. | Guard + continue with degraded result + diagnostics. | No change; already compliant. | n/a |
| ES06 | IPC handler (`L583`) interactive | `ipcMain.handle('set-selected-preset', ...)` | optional capability | Validates preset name/language base; invalid cases warned and returned as `{ok:false,error}`. | Guard + continue with degraded result + diagnostics. | No change; already compliant. | `settings.set-selected-preset.invalid`; `settings.set-selected-preset.emptyLanguage` |
| ES07 | send side action (`L419`) potentially high-frequency | `win.webContents.send('settings-updated', settings)` via `broadcastSettingsUpdated` | best-effort side action | Per-window try/catch + deduped warning on failure; skips destroyed/missing windows. | Attempt send; drop on failure without breaking flow + deduped diagnostic. | No change; already compliant. | `settings.broadcastSettingsUpdated.<windowName>` |
| ES08 | IPC-adjacent callback (`L513`, `L572`) interactive | `getWindows()` callback used by set-language/set-mode-conteo broadcast path | optional capability | Guarded by `typeof getWindows === 'function'`; fallback to `{}` if missing. | Guard + continue with capability disabled + diagnostic where needed. | No change beyond ES02 default object alignment; behavior remains guarded. | n/a |
| ES09 | IPC-adjacent callback (`L516`) interactive/rare | `buildAppMenu(menuLang)` callback in set-language | optional capability | Guarded by `typeof buildAppMenu === 'function'`; try/catch warning on failures; flow continues. | Guard + continue with capability disabled + diagnostic. | No change beyond ES02 default object alignment; behavior remains guarded. | n/a |

Level 4 evidence:
- N. No Level 4 escalation applies: updates are local failure-path alignment in `electron/settings.js`; IPC surface, channel names, payload/return shapes, side effects, and healthy-path ordering/timing were not changed.

Healthy-path confirmation: the healthy-path contract/timing was preserved (no changes to channels, payload/return shapes, side effects, or execution ordering when bridge wiring is valid).

Failure-path confirmation: failure-mode handling is aligned to the convention (required IPC registrar contract now fails fast explicitly; optional callback dependencies are consistently guarded; best-effort settings broadcast remains non-breaking with stable dedupe diagnostics).

### electron/presets_main.js

| ID | Location anchor | Bridge member/path | Class | Current handling | Required handling | Action taken | Dedupe key (if any) |
|----|------------------|--------------------|-------|------------------|-------------------|--------------|---------------------|
| PM01 | IPC registration contract (`L233`-`L236`) startup/rare | `registerIpc(ipcMain, ...)` dependency on `ipcMain.handle` | required startup dependency | Before: checked only truthiness of `ipcMain`; invalid registrar contract failed later implicitly. | Fail fast with explicit diagnostic for missing required registrar contract. | Updated guard to validate `typeof ipcMain.handle === 'function'` and keep hard abort. | n/a |
| PM02 | registerIpc required diagnostic (`L235`) startup/rare | `throw new Error(...)` in required contract path | required startup dependency | Before: throw message was non-English (`registerIpc requiere ipcMain`). | English-only developer diagnostic in `.js` throw paths. | Updated throw text to `'[presets_main] registerIpc requires ipcMain'`. | n/a |
| PM03 | IPC options resolver (`L233`, `L238`-`L242`) startup/interactive | `getWindows` callback dependency | optional capability | Guarded callback/object fallback; missing callback degrades to `{}` safely. | Guard + continue with capability disabled + diagnostic where action is dropped. | No change; already compliant optional dependency handling. | n/a |
| PM04 | settings broadcast dependency (`L249`-`L256`) startup/interactive | `settingsState.broadcastSettingsUpdated` | optional capability | Guarded; if missing, warns once and falls back to direct main window send. | Guard + continue degraded + diagnostic. | No change; already compliant optional fallback. | `presets_main.broadcastSettingsUpdated.missing` |
| PM05 | fallback send side action (`L259`) interactive | `mainWin.webContents.send('settings-updated', settings)` | best-effort side action | Inside broadcast try/catch; failures warn once and flow continues. | Attempt send; drop on failure without breaking flow + diagnostic. | No change; already compliant. | `presets_main.broadcast.settings-updated` |
| PM06 | IPC handler (`L327`) startup/interactive | `ipcMain.handle('get-default-presets', ...)` | optional capability | Handler guarded by try/catch with fallback return object and diagnostics. | Guard + continue with degraded result + diagnostics. | No change; already compliant. | `presets_main.defaults.parse:*`; `presets_main.defaults.general.fallback`; `presets_main.defaults.lang.fallback:*`; `presets_main.defaults.parse.lang:*`; `presets_main.defaults.general.missingBundled` |
| PM07 | IPC handler (`L442`) interactive/rare | `ipcMain.handle('open-default-presets-folder', ...)` | optional capability | Guarded async handler; on failures returns `{ ok:false, error }` and logs diagnostics. | Guard + continue with degraded result + diagnostics. | No change; already compliant. | n/a |
| PM08 | IPC handler (`L466`) interactive | `ipcMain.handle('create-preset', ...)` | optional capability | Input guarded/sanitized; errors return `{ ok:false, ... }`; settings broadcast and notify are best-effort. | Guard + continue with degraded result + diagnostics. | No change; already compliant. | `presets_main.create-preset.invalid` |
| PM09 | notify side action (`L497`) interactive | `mainWin.webContents.send('preset-created', sanitizedPreset)` (create flow) | best-effort side action | Guard + try/catch with deduped warning when send fails. | Attempt send; drop on failure without breaking flow + diagnostic. | No change; already compliant. | `presets_main.send.preset-created.create` |
| PM10 | IPC handler (`L515`) interactive | `ipcMain.handle('request-delete-preset', ...)` | optional capability | Input validation + dialog flow guarded; failures return `{ ok:false, ... }` and log diagnostics. | Guard + continue with degraded result + diagnostics. | No change; already compliant. | `presets_main.request-delete-preset.invalid_name`; `presets_main.request-delete-preset.name_too_large` |
| PM11 | IPC handler (`L635`) interactive/rare | `ipcMain.handle('request-restore-defaults', ...)` | optional capability | Confirmation flow and persistence guarded; failures return `{ ok:false, error }`. | Guard + continue with degraded result + diagnostics. | No change; already compliant. | n/a |
| PM12 | IPC handler (`L717`) interactive/rare | `ipcMain.handle('notify-no-selection-edit', ...)` | optional capability | Dialog flow guarded; failures return `{ ok:false, error }` with diagnostics. | Guard + continue with degraded result + diagnostics. | No change; already compliant. | n/a |
| PM13 | IPC handler (`L745`) interactive | `ipcMain.handle('edit-preset', ...)` | optional capability | Input/dialog/persistence guarded; failures return `{ ok:false, ... }`; notify is best-effort. | Guard + continue with degraded result + diagnostics. | No change; already compliant. | `presets_main.edit-preset.invalid` |
| PM14 | notify side action (`L839`) interactive | `mainWin.webContents.send('preset-created', sanitizedPreset)` (edit flow) | best-effort side action | Guard + try/catch with deduped warning when send fails. | Attempt send; drop on failure without breaking flow + diagnostic. | No change; already compliant. | `presets_main.send.preset-created.edit` |

Level 4 evidence:
- N. No Level 4 escalation applies: updates are local failure-path/diagnostic alignment in `electron/presets_main.js`; IPC surface, channel names, payload/return shapes, side effects, and healthy-path ordering/timing were not changed.

Healthy-path confirmation: the healthy-path contract/timing was preserved (no changes to channels, payload/return shapes, side effects, or execution ordering when bridge wiring is valid).

Failure-path confirmation: failure-mode handling is aligned to the convention (required IPC registration contract now fails fast explicitly with English diagnostics; optional handlers remain guarded; best-effort sends remain non-breaking with stable diagnostics).

### electron/tasks_main.js

| ID | Location anchor | Bridge member/path | Class | Current handling | Required handling | Action taken | Dedupe key (if any) |
|----|------------------|--------------------|-------|------------------|-------------------|--------------|---------------------|
| TM01 | IPC registration contract (`L328`-`L331`) startup/rare | `registerIpc(ipcMain, ...)` dependency on `ipcMain.handle` | required startup dependency | Before: checked only truthy `ipcMain`; invalid registrar contract failed later implicitly. | Fail fast with explicit diagnostic when required IPC registrar contract is invalid. | Updated guard to `if (!ipcMain || typeof ipcMain.handle !== 'function') throw ...`. | n/a |
| TM02 | IPC options resolver (`L328`, `L333`-`L335`) startup/interactive | `getWindows()` callback dependency used by `resolveWins/resolveMainWin/resolveTaskEditorWin` | optional capability | Guarded by `typeof getWindows === 'function'`; fallback `{}` keeps flow running. | Guard + continue with degraded window-resolution capability. | No change; existing guarded fallback already keeps handler flow non-breaking. | n/a |
| TM03 | sender authorization helper (`L316`-`L323`) interactive | `BrowserWindow.fromWebContents(event.sender)` in `isAuthorizedSender` | optional capability | Guarded auth check; unauthorized mismatches log deduped warnings and return `UNAUTHORIZED`. | Guard + continue with explicit degraded result + diagnostic. | No change; caller-specific dedupe keys already applied across handlers. | per-call key (`tasks_main.*.unauthorized`) |
| TM04 | open flow dependency (`L352`-`L355`) interactive | `ensureTaskEditorWindow` callback in `open-task-editor` | optional capability | Guard + continue with `UNAVAILABLE` and deduped warning when callback is missing. | Guard + continue with explicit degraded result + diagnostic. | No change; already compliant optional capability handling. | `tasks_main.open.noEnsure` |
| TM05 | IPC handler (`L340`) interactive | `ipcMain.handle('open-task-editor', ...)` | optional capability | Sender guard + try/catch + structured error returns; no silent fallback. | Guard + continue with explicit degraded result + diagnostics. | No change; already compliant. | `tasks_main.open.unauthorized` |
| TM06 | send side action (`L363`) interactive/rare | `taskEditorWin.webContents.send('task-editor-init', { mode:'new', ... })` | best-effort side action | If target window missing, action is dropped with deduped warning; flow returns `{ ok:true }`. | Attempt send; drop without breaking flow + diagnostic when action is dropped. | No change; already compliant. | `send.task-editor-init.new` |
| TM07 | send side action (`L418`) interactive/rare | `taskEditorWin.webContents.send('task-editor-init', { mode:'load', ... })` | best-effort side action | If target window missing, action is dropped with deduped warning; flow returns `{ ok:true }`. | Attempt send; drop without breaking flow + diagnostic when action is dropped. | No change; already compliant. | `send.task-editor-init.load` |
| TM08 | IPC handler (`L439`) interactive | `ipcMain.handle('task-list-save', ...)` | optional capability | Sender guard + validation/path-containment guards + try/catch; explicit `{ ok:false, code }` on failures. | Guard + continue with explicit degraded result + diagnostics. | No change; already compliant. | `tasks_main.save.unauthorized` |
| TM09 | IPC handler (`L514`) interactive | `ipcMain.handle('task-list-delete', ...)` | optional capability | Sender guard + path-containment/confirm guards + try/catch; explicit `{ ok:false, code }` on failures. | Guard + continue with explicit degraded result + diagnostics. | No change; already compliant. | `tasks_main.delete.unauthorized` |
| TM10 | IPC handler (`L569`) interactive | `ipcMain.handle('task-library-list', ...)` | optional capability | Sender guard + guarded library read; missing/invalid storage paths return explicit error codes. | Guard + continue with explicit degraded result + diagnostics. | No change; already compliant. | `tasks_main.library.list.unauthorized`; `tasks_main.library.missing` |
| TM11 | IPC handler (`L606`) interactive | `ipcMain.handle('task-library-save', ...)` | optional capability | Sender guard + normalized payload + confirm-on-overwrite + try/catch with explicit error codes. | Guard + continue with explicit degraded result + diagnostics. | No change; already compliant. | `tasks_main.library.save.unauthorized` |
| TM12 | IPC handler (`L664`) interactive | `ipcMain.handle('task-library-delete', ...)` | optional capability | Sender guard + request validation + confirm + try/catch with explicit error codes. | Guard + continue with explicit degraded result + diagnostics. | No change; already compliant. | `tasks_main.library.delete.unauthorized` |
| TM13 | IPC handler (`L720`) interactive | `ipcMain.handle('task-columns-load', ...)` | optional capability | Sender guard + guarded file read; missing file returns `{ ok:true, widths:null }` with deduped diagnostic. | Guard + continue with explicit degraded result + diagnostics. | No change; already compliant. | `tasks_main.columns.load.unauthorized`; `tasks_main.columns.missing` |
| TM14 | IPC handler (`L753`) interactive | `ipcMain.handle('task-columns-save', ...)` | optional capability | Sender guard + schema guard + try/catch with explicit error codes. | Guard + continue with explicit degraded result + diagnostics. | No change; already compliant. | `tasks_main.columns.save.unauthorized` |
| TM15 | IPC handler (`L780`) interactive | `ipcMain.handle('task-open-link', ...)` | optional capability | Sender guard + path/URL allowlist/confirm guards + try/catch; explicit error codes on blocked/open failures. | Guard + continue with explicit degraded result + diagnostics. | No change; already compliant. | `tasks_main.link.unauthorized`; `tasks_main.allowedHosts.missing`; `tasks_main.allowedHosts.invalid` |

Level 4 evidence:
- N. No Level 4 escalation applies: updates are local failure-path alignment in `electron/tasks_main.js`; IPC surface, channel names, payload/return shapes, side effects, and healthy-path ordering/timing were not changed.

Healthy-path confirmation: the healthy-path contract/timing was preserved (no changes to channels, payload/return shapes, side effects, or execution ordering when bridge wiring is valid).

Failure-path confirmation: failure-mode handling is aligned to the convention (required IPC registrar contract now fails fast explicitly; optional handlers remain guarded with explicit degraded returns; best-effort send paths remain non-breaking with diagnostics).

---

## Definition of Done

- Todos los archivos listados en este Issue pasaron por el loop Nivel 3.
- Para cada archivo: existe ledger completo + clasificación 1:1 + decisión + validación documentadas.
- Drift corregible en Nivel 3 corregido sin tocar healthy-path.
- Todo “Level 4 evidence” (si existe) está justificado por cambio de healthy-path o necesidad cross-file (no por failure-path).
