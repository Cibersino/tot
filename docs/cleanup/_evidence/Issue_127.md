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

---

## Definition of Done

- Todos los archivos listados en este Issue pasaron por el loop Nivel 3.
- Para cada archivo: existe ledger completo + clasificación 1:1 + decisión + validación documentadas.
- Drift corregible en Nivel 3 corregido sin tocar healthy-path.
- Todo “Level 4 evidence” (si existe) está justificado por cambio de healthy-path o necesidad cross-file (no por failure-path).
