# Plan orden y limpieza por archivo

## Elección de archivo:

Archivos ya ordenados y limpiados:
- Ninguno

## Nivel 0: Diagnóstico mínimo (obligatorio, corto)

**0.1 Mapa de lectura**

* ¿Cuál es el orden real del archivo hoy? (imports, constantes, helpers, lógica, exports).
* ¿Dónde se rompe la lectura lineal? (saltos, mezclas de responsabilidades, duplicación, anidación).

**0.2 Mapa de contrato**

* ¿Qué expone? (exports / entrypoints / side effects).
* ¿Qué invariantes sugiere? (inputs esperados, errores tolerables, fallbacks).

**Regla:** aquí no se proponen soluciones todavía; solo se identifica qué estorba.

### Prompt Nivel 0 para Codex:
```
# Target file: `<TARGET_FILE>`

For this response only, produce a Level 0 minimal diagnosis of the file (short, descriptive, no code changes).

## 0.1 Reading map
- What is the file’s actual block order today? (imports, constants/config, helpers, main logic/handlers, exports)
- Where does linear reading break? (jumps, mixed responsibilities, duplication, nesting)
  - For each obstacle: name the exact identifier (function/variable) and include a micro-quote (≤ 15 words) to locate it.

## 0.2 Contract map
- What does the module expose? (exports / public entrypoints / side effects)
- What invariants does it suggest? (expected inputs, tolerated errors, fallbacks)
- If present, describe the IPC contract:
  - List every ipcMain.handle(<channel>) present.
  - For each: input shape (if any), return shape, and any outgoing webContents.send(...) messages (channel + payload shape).
```

---

## Nivel 1: Refactor estructural y cleanup (obligatorio)

Objetivo: que el archivo sea **navegable** y, si es que facilita más la lectura humana, lo más **lineal** posible, sin tocar comportamiento ni romper los timings necesarios.

**1.1 Reordenamiento por bloques**

Propuesta (hay flexibilidad, no tiene que ser necesariamente así):
* Imports arriba.
* Constantes/config después.
* Helpers agrupados por responsabilidad.
* Lógica principal/handlers/entrypoints.
* Exports al final.

**1.2 Simplificación local segura**

* Reducir anidación (early returns).
* Eliminar duplicación textual obvia si no cambia semántica.
* Nombres locales más claros cuando reduzcan ambigüedad.

**Gate para pasar de Nivel 1 a 2:**
Se cumple “lectura más o menos lineal” + no hay cambios observables del contrato.

### Prompt Nivel 1 para Codex:
```
# Target file: `<TARGET_FILE>`

Level 1 — Structural refactor and cleanup.

Objective: make `<TARGET_FILE>` navigable and, where it helps, more linearly readable, without changing observable behavior/contract or breaking any timing-dependent behavior.

Constraints:
- Preserve behavior and the observable contract as-is (public API, IPC surface, payload/return shapes, side effects).
- Preserve truncation + persistence behavior and timing.

Anti “refactor that makes it worse” rule:
If a change:
- introduces more concepts than it removes;
- increases indirection without reducing branches/duplication;
- forces the reader to read more to understand the same behavior; 
  then discard it or scale it down to a smaller Level 1 change.

What to do (flexible, use judgment):
- Reorder the file into coherent blocks (e.g., imports → constants/config → helpers → main logic/handlers/entrypoints → exports). This is guidance, not a rigid layout.
- Apply safe local simplifications:
  - reduce nesting via early returns only when behavior is identical,
  - remove obvious duplication only when semantics stay identical,
  - improve local naming only when it reduces ambiguity and is behavior-preserving.

You may inspect the repo as needed to understand how this module is used, but apply changes only to `<TARGET_FILE>`.
```

---

## Nivel 2: Refactor de claridad/robustez (condicional, pero normal)

Regla anti-“refactor que empeora”:

Si una propuesta:

* introduce más conceptos de los que elimina,
* aumenta la indirección sin reducir ramas/duplicación,
* obliga a leer más para entender lo mismo,

entonces se descarta o se reduce al Nivel 1.

Aquí se permiten cambios internos que **sí** mejoran el diseño, sin caer en arquitectura innecesaria.

**2.1 Helpers permitidos**

* Se permite introducir **helpers** si:

  * eliminan duplicación real o concentran un caso borde repetido,
  * reducen complejidad (menos ramas/anidación),
  * no obligan a saltar por todo el archivo para entender.

**2.2 Manejo de errores/casos borde**

* Hacer explícito lo que hoy está implícito (p.ej. distinguir “no existe” vs “inválido” si eso afecta decisiones).
* Evitar silencios peligrosos (pero sin sobre-logging).

**Gate para aceptar Nivel 2:**
Por cada cambio no trivial: **ganancia** (1 frase) + **costo** (1 frase) + **validación** (cómo comprobar).

### Prompt Nivel 2 para Codex:
```
# Target file: `<TARGET_FILE>`

Level 2 — Clarity / robustness refactor (controlled).

Objective: improve internal clarity and robustness of `<TARGET_FILE>` while keeping the module’s observable behavior/contract intact, and without introducing unnecessary architecture.

Constraints:
- Preserve the observable contract as-is (public API, IPC surface, payload/return shapes, side effects, timing).
- Avoid “silent” problematic cases, but also avoid over-logging (no noisy logging).

Anti “refactor that makes it worse” rule:
If a change:
- introduces more concepts than it removes;
- increases indirection without reducing branches/duplication;
- forces the reader to read more to understand the same behavior;
  then discard it or scale it down to Level 1.

Allowed Level 2 moves (use judgment):
- Add small helpers ONLY if they:
  - eliminate real duplication or centralize a repeated edge case,
  - reduce branching/nesting complexity,
  - remain local/easy to understand (no “jumping around” required).
- Make implicit edge cases explicit only when it affects decisions (e.g., distinguish “missing” vs “invalid” inputs where relevant).
- Improve error handling where it is currently implicit or risky:
  - remove dangerous silent fallbacks,
  - keep logs proportional (warn/error only when it genuinely helps diagnosing state).

Gate output requirement (mandatory):
For every non-trivial change you apply, include:
- Gain: one sentence.
- Cost: one sentence.
- Validation: how to verify (manual check, smoke path, or simple repo grep).

You may inspect the repo as needed to understand how this module is used, but apply changes only to `<TARGET_FILE>`.
```

---

## Nivel 3: Cambios de arquitectura/contrato (excepcional, con evidencia fuerte)

Solo se entra aquí si el diagnóstico muestra un dolor real que no se resuelve con Nivel 1–2.

Ejemplos típicos:

* separar responsabilidades en otro archivo,
* cambiar sync↔async,
* cambiar API pública o semántica de retorno,
* cambios con impacto en múltiples consumidores.

**Requisito para Nivel 3:**

* evidencia directa en el código (o bug reproducible),
* riesgo explícito,
* plan de validación claro.

### Prompt Nivel 3 para Codex:
```
# Target file: `<TARGET_FILE>`

Level 3 — Architecture / contract changes (exceptional; evidence-driven).

Objective: Only if there is strong evidence of real pain that cannot be addressed in Levels 1–2, propose and (if justified) implement a minimal architecture/contract change that measurably improves the situation.

Entry criteria (must be satisfied):
- Direct evidence in code OR a reproducible bug/issue:
  - point to the exact call sites / usage patterns in the repo, OR
  - provide a minimal reproduction (steps) that demonstrates the pain.
- Explicit risk assessment: what could break and where.
- Clear validation plan: how to confirm correctness after the change.

Process:
1. First, inspect the repo to identify whether `<TARGET_FILE>` has a real pain point that requires Level 3:
   - duplicated responsibility across modules,
   - unstable/ambiguous contract for IPC payloads/returns,
   - sync/async mismatch causing issues,
   - multiple consumers depending on inconsistent semantics,
   - cross-module coupling (e.g., settings bootstrap inside text_state) that is causing bugs or maintenance problems.
2. If NO strong evidence exists, do NOT change code. Instead, output a short “No Level 3 justified” note and list the evidence you checked.
3. If evidence DOES exist, apply the smallest possible Level 3 change that resolves it:
   - keep the change minimal (avoid broad rewrites),
   - update all affected consumers in the repo consistently,
   - avoid introducing unnecessary architecture.

Anti “refactor that makes it worse” rule:
If a change:
- introduces more concepts than it removes;
- increases indirection without reducing real pain;
- forces readers to read more to understand the same behavior;
  then discard it or scale it back.

Mandatory Gate output (for each non-trivial change you make):
- Evidence: one sentence + where it appears (file(s)/function(s) or repro steps).
- Risk: one sentence.
- Validation: how to verify (manual smoke path, repo grep, or a concrete runtime check).

You may inspect the repo as needed. If you implement anything, ensure the repo builds/runs and the app’s IPC paths still work.
```

---

## Nivel 4: Logs (después de estabilizar el flujo)

* Obligatorio: revisar la política explícita de los archivos `log.js` (se ven como `electron_log.js` y `public_js_log.js` en tu carpeta raíz).
* Basarse en la lógica aplicada a archivos ya revisados (p.ej. `main.js`).
* Ajustar nivel por recuperabilidad.
* Mensajes cortos y accionables, consistentes con el estilo del proyecto.
* No dejar ningún fallback silencioso.

### Prompt Nivel 4 para Codex:
```
# Target file: `<TARGET_FILE>`

Level 4 — Logs (policy-driven tuning after flow stabilization).

Objective: Align logging in the `<TARGET_FILE>` with the project’s logging policy and style (as used in electron/main.js), so that:
- log levels match recoverability (error vs warn vs info),
- high-frequency “best-effort” failures do not spam (use warnOnce/errorOnce appropriately),
- dangerous fallbacks are not silent (but avoid noisy logging),
- messages are short, actionable, and consistent with the repo.

Constraints:
- Do NOT change observable runtime behavior/contract (public API, IPC surface, payload/return shapes, side effects, timing).
- Changes in this level should be limited to logging behavior (levels/messages/once-deduping) and minimal local structure needed to support that.
- Avoid over-logging: no new high-volume logs on normal, healthy paths.

Reference material (inspect before editing):
- Logging policy: electron/log.js and public/js/log.js.
- Style baseline: electron/main.js (how it logs best-effort webContents.send failures, ignored races, and recoverable fallbacks).

What to do:
1. Audit every logging site in the `<TARGET_FILE>` (warn/error/info) and every best-effort path that can fail silently (e.g., payload shape fallbacks, send-to-window races).
2. For each, decide the correct level:
   - error: unexpected failures that break an intended action or invariant.
   - warn: recoverable anomalies / degraded behavior / fallback paths.
   - info: high-level lifecycle/state transitions (low volume).
   - Once-variants (deduplicated per process/page):
     - Use warnOnce/errorOnce only for high-frequency repeatable events where additional occurrences add no new diagnostic value; do not use once-variants when repetition is needed for reproduction during testing.
     - warnOnce: use for expected transient failures that can repeat frequently and would spam logs.
     - errorOnce: like warnOnce but for repeated error-class events (should be rare).
3. Ensure “no dangerous silent fallback”:
   - If the code accepts/normalizes an invalid or suspicious input shape and falls back to a degraded behavior, consider adding a warn or warnOnce with a stable dedupe key.
   - Do not add warnings for expected, benign conditions (e.g., a window not existing).
4. Keep log strings concise and consistent with the repo (prefer “failed (ignored):” wording for best-effort sends when appropriate).

Anti “refactor that makes it worse” rule:
If a proposed logging change introduces more complexity than it removes, increases indirection without reducing noise/ambiguity, or makes the file harder to scan, discard or simplify it.

After editing (mandatory report):
- List each non-trivial log change you made with:
  - Gain: one sentence.
  - Cost: one sentence.
  - Validation: how to verify (simple manual action, smoke path, or grep).
- If you find no meaningful log improvements that meet the constraints, make no changes and briefly explain why.

Apply changes only to the `<TARGET_FILE>`.
```
---

## Nivel 5: Comentarios

* Ajustar comentarios para que sirvan de orientación cualquier persona con pocos conocimientos técnicos.
* Revisar comentarios y borrarlos, reescribirlos o agregar otros si son aporte real.
* Seguir formato de `main.js`:
  - Overview conciso (responsibilities),
  - secciones visibles,
  - marcador de “End of …” al final.
* Todos los comentarios deben ser en inglés (pero sin traducir los nombres o claves que usa el código, aunque estén en otro idioma).

### Prompt Nivel 5 para Codex:
```
# Target file: `<TARGET_FILE>`

Level 5 — Comments (reader-oriented, main.js style).

Objective: Improve comments so the file is easier to understand for a new contributor with limited context, while keeping comments genuinely useful (explain intent/constraints, not obvious syntax). Follow the project’s comment style as in electron/main.js:
- concise "Overview" with responsibilities,
- visible section dividers that match the file’s real structure,
- an explicit "End of <file>" marker at the end.

Constraints:
- Do NOT change runtime behavior in any way (no logic changes, no contract changes, no timing changes).
- This level is comments-only: you may adjust whitespace around comments and move *comments- to better locations, but do not move code unless it is required to keep a section header adjacent to the block it describes.
- All comments must be in English and use plain ASCII characters only (avoid fancy quotes, em dashes, non-ASCII bullets, etc.).
- Do not translate or rename identifiers/IPC channel names/JSON keys; reference them exactly as they appear in code.

What to do:
1. Add or rewrite the top "Overview" comment:
   - 3–7 bullet responsibilities max.
   - Mention key side effects or ownership (e.g., IPC handlers, persistence timing) only at a high level.
2. Add section dividers that match the file’s true blocks (only what exists):
   - Imports / logger
   - Shared state / injected deps
   - Helpers
   - Entrypoints (init, IPC registration, etc.)
   - Exports
3. Review existing comments and JSDoc blocks:
   - Remove redundant “what the code already says” comments.
   - Fix any drift: comments must match actual behavior.
   - Prefer “why / constraints / edge cases” over “what”.
4. Add an end-of-file marker comment:
   - "End of <file>" in the same style as electron/main.js.

After editing (mandatory short report):
- List the comment changes you made in 3–8 bullets (e.g., "Added Overview responsibilities", "Removed redundant inline comments", "Aligned section dividers with actual block order").
- Confirm explicitly: "No functional changes; comments-only."
```
---

## Nivel 6: Revision final

* Eliminar legacy o resabios tras refactorizaciones o cualquier cambio en la app.
* Revisar que todo el código haya quedado coherente.

### Prompt Nivel 6 para Codex:
```
# Target file: `<TARGET_FILE>`

Level 6 — Final review (coherence + leftover cleanup after refactors).

Objective: Do a careful final pass to ensure the `<TARGET_FILE>` is coherent end-to-end after Levels 1–5:
- remove leftovers / dead code / stale patterns introduced by earlier refactors;
- ensure internal consistency (naming, control flow, invariants, helper usage);
- ensure logging API usage matches the repo policy (no signature drift);
- ensure comments and code agree (no drift);
  while preserving the module’s observable behavior/contract and timing.

Constraints:
- Preserve observable behavior/contract as-is (public API, IPC surface, payload/return shapes, side effects, timing).
- Avoid architecture changes and cross-module rewrites. If a change affects consumers, it is Level 3 and should NOT be done here.
- Prefer minimal edits with clear local payoff. Default to "no change" if uncertain.

Anti “refactor that makes it worse” rule:
If a change:
- introduces more concepts than it removes;
- increases indirection without reducing real complexity;
- forces the reader to read more to understand the same behavior;
  then discard it or scale it down.

What to do:
1. Coherence scan (`<TARGET_FILE>` only; repo inspection allowed):
   - Look for "leftovers" from prior levels: unused locals/params, duplicated checks, inconsistent helper signatures, inconsistent naming, stale comments, inconsistent return shapes, redundant branching.
2. Contract consistency check:
   - Verify the IPC handlers and exports still match actual call sites and expected payload/return shapes.
   - If you find a mismatch, only fix it if it can be done locally without changing the contract; otherwise report it as Level 3 evidence (no code change).
   - If call sites look consistent, do not spend output budget enumerating them; focus on issues that require local fixes.
3. Logging API consistency check:
   - Verify each log call matches the actual logging API (method names + argument shapes) as defined in electron/log.js (and relevant usage patterns in electron/main.js).
   - If you detect signature drift (e.g., passing a dedupe key to a non-once method), correct it in the smallest way that preserves intended logging behavior and avoids spam.
4. Comment/code alignment:
   - Ensure comments describe real behavior and constraints; remove or adjust any drift introduced during prior edits.

Mandatory gate output (for each non-trivial change you apply):
- Change: one sentence describing what you changed.
- Gain: one sentence.
- Cost: one sentence.
- Risk: one sentence (what could break).
- Validation: how to verify (manual smoke path and/or a simple repo grep).

If you find no changes that clearly improve coherence without risk, make no edits and output:
- "No Level 6 changes justified" + 3–8 bullets of what you checked.

Apply changes only to the `<TARGET_FILE>`.
```

---

## Nivel 7: Smoke test

* Cuando lo anterior esté listo: Smoke test checklist (human-run; code-informed) para verificar que los cambios realizados (desde nivel 1 a 6) no rompieron el comportamiento observable.

### Prompt Nivel 7 para Codex:
```
# Target file: `<TARGET_FILE>`

Level 7 — Smoke test checklist (human-run; code-informed).

Objective:
Produce a minimal, realistic smoke checklist to verify that Levels 1–6 did not break observable behavior of `<TARGET_FILE>`.

Hard constraints:
- NO code changes. Instructions only.
- You can only inspect the repo.
- 6–15 smoke steps (unless the file genuinely has many responsibilities).
- Every step MUST be realistically triggerable via normal dev UI flows (no huge inputs, no manual JSON corruption, no rare races).
- If something is not realistically triggerable, do NOT include it as a smoke step:
  - Put it under "Not smoke-testable (optional)" with one sentence why.

Step independence (mandatory):
- Minimize step dependencies. Do NOT chain steps unless truly necessary.
- If a step depends on prior state (e.g., "text already set"), state it explicitly as a precondition and keep it minimal.

Evidence (mandatory, per step):
1. Target anchor (in `<TARGET_FILE>`):
   - function/block name + micro-quote (<= 15 words).
2. Trigger chain anchors (outside `<TARGET_FILE>`):
   - Show the shortest chain that proves the step reaches the target:
     UI event (or lifecycle) -> exposed API call (contextBridge / ipcRenderer.invoke / exported fn call) -> target surface.
   - Provide 1–3 anchors (file + function/handler + micro-quote <= 15 words each).
   - Rule: at least ONE trigger-chain anchor must be outside `<TARGET_FILE>`.
   - If the trigger is an Electron lifecycle event (before-quit, ready, etc.), you MUST include the injection/registration call site outside `<TARGET_FILE>` as a trigger-chain anchor.

Stable UI references (mandatory when UI is involved):
- Prefer DOM ids proven by `getElementById('...')` in code (anchor required), menu action ids, or contextBridge method names.
- Do NOT rely on translated button labels as the primary identifier.
- If you reference a control like `btnX`, you MUST also provide the DOM id that backs it (e.g., `getElementById('btnX')`) as part of trigger-chain evidence.

Boundary check (mandatory, per step):
- Each step must include at least one observable check at the boundary owned by `<TARGET_FILE>`:
  - an IPC return value (shape + key fields), OR
  - a specific outbound send channel (channel + payload shape), OR
  - a persisted file state written by `<TARGET_FILE>`.
- UI-only expectations are allowed only as secondary, not as the only expected outcome.

Boundary observation method (mandatory, per step; no code changes allowed):
- For the boundary check above, include at least ONE direct, no-code-change way to observe it, using ONE of:
  1. DevTools console one-liner that calls an already-exposed API (contextBridge) and shows the returned value/shape
     (e.g., `await window.<api>.<method>(...)`).
     - Rule: DevTools is an Observe method, not the primary Action, unless there is no other boundary-visible path without DevTools.
  2. Existing listener evidence in the repo that proves the outbound message is handled or surfaced.
     - If you claim an outbound send as the boundary check, you MUST cite the exact `ipcRenderer.on('<channel>')`
       (or equivalent) where it is observed, with anchor. If no such listener exists, mark the boundary as "not directly observable".
  3. File-on-disk verification for persistence steps (file path + what to look for).
- If none of these exist for a given boundary, do NOT invent one. Instead:
  - mark the step as "UI-only boundary visibility" and explain in one sentence why boundary cannot be directly observed without adding code.

Coverage requirement (mandatory):
- Ensure every IPC handler / exported entrypoint / registration function in `<TARGET_FILE>` is exercised by at least one smoke step,
  OR explicitly list it under "Not covered in smoke (and why)".

Output format:
1. Surface inventory (8–20 bullets):
   - file type (main/preload/renderer/utility/mixed)
   - exports/entrypoints (or equivalent surface if not a module)
   - IPC channels handled/invoked/sent
   - contextBridge keys (if any)
   - persisted files touched
   - limits/thresholds affecting behavior

2. Smoke steps (6–15):
For each step:
- Action (what the human does; which window; stable control id if applicable)
- Expected:
  - Primary: boundary check (required)
  - Secondary: UI outcome (optional)
- Observe:
  - include at least one direct boundary observation method (DevTools one-liner OR existing listener OR file-on-disk)
  - plus any UI observation if useful
- Evidence:
  - Target anchor
  - Trigger chain anchors (>=1 outside target; include DOM id anchor if UI control is referenced)
- Preconditions (only if truly needed)

3. Logs during smoke (3–8 items):
- Only logs that can plausibly occur during the smoke steps above.
- For each: trigger condition, level, once-dedupe key (with evidence).
- Also list "should NOT happen" (spammy repeats on normal paths).

4. Not smoke-testable (optional):
- List non-smoke-testable behaviors you found (brief), each with:
  - why not triggerable in normal UI flows
  - target anchor evidence
```

---

## Nivel 8: Debug / triage (solo si falla el smoke)

* Solo si falla un paso del Nivel 7: triage guiado por evidencia para aislar causa raíz y proponer la siguiente acción (sin modificar código en este nivel).

---
