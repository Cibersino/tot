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

---

## Definition of Done

- Todos los archivos listados en este Issue pasaron por el loop Nivel 3.
- Para cada archivo: existe ledger completo + clasificación 1:1 + decisión + validación documentadas.
- Drift corregible en Nivel 3 corregido sin tocar healthy-path.
- Todo “Level 4 evidence” (si existe) está justificado por cambio de healthy-path o necesidad cross-file (no por failure-path).
