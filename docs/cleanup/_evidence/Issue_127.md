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
- En `.js`, diagnósticos dev (warn/error) deben ser **English-only**; UI sigue i18n.

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
* Scope edits to **`<TARGET_FILE>` AND `docs\cleanup\_evidence\Issue_127.md` only** (no other files).
* You MAY change failure-path behavior (miswire/missing/invalid bridge) to comply with the convention.
  Do NOT claim “changes failure timing/behavior” as Level 4 evidence unless HEALTHY-PATH changes too.

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
   * missing dedupe where repetition adds no diagnostic value,
   * mis-leveled logging (noise on hot paths vs missing diagnostics).

4. Enforcement (required):
   Apply minimal local changes so that EVERY inventory entry’s handling matches the decision matrix:
   * Required -> fail fast (do not continue invalid init path; clear diagnostic)
   * Optional -> guard + continue + deduplicated diagnostic (stable bounded key; no user input in key)
   * Best-effort -> drop without breaking flow + deduplicated “failed (ignored)” diagnostic when a real intended action is dropped
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
  * Dev diagnostics in `.js` must be English-only (non-user-facing).
  * Dedupe keys must be stable/bounded (no user input or unbounded dynamic data in keys).

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
|      |          |                     |                              |                           |                             |            |                                          |

---

## Definition of Done

- Todos los archivos listados en este Issue pasaron por el loop Nivel 3.
- Para cada archivo: existe ledger completo + clasificación 1:1 + decisión + validación documentadas.
- Drift corregible en Nivel 3 corregido sin tocar healthy-path.
- Todo “Level 4 evidence” (si existe) está justificado por cambio de healthy-path o necesidad cross-file (no por failure-path).
