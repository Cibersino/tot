# Plan orden y limpieza por archivo

## Elección de archivo:

- En proceso: `electron/link_openers.js`

- Archivos ya ordenados y limpiados (9): `electron/main.js`, `electron/settings.js`, `electron/fs_storage.js`, `electron/text_state.js`, `electron/editor_state.js`, `electron/presets_main.js`, `electron/menu_builder.js`, `electron/updater.js`, `electron/constants_main.js`.

- Faltan (19): `public/renderer.js`, `public/editor.js`, `public/preset_modal.js`, `public/flotante.js`, `public/language_window.js`, `public/js/count.js`, `public/js/presets.js`, `public/js/crono.js`, `public/js/menu_actions.js`, `public/js/format.js`, `public/js/i18n.js`, `public/js/notify.js`, `public/js/constants.js`,`public/js/info_modal_links.js`, `electron/preload.js`, `electron/editor_preload.js`, `electron/preset_preload.js`, `electron/flotante_preload.js`, `electron/language_preload.js`.

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

For this response only, produce a Level 0 minimal diagnosis of the file (short, descriptive, no code changes, no recommendations).

Output requirement:
- Write the full Level 0 result to a Markdown file at: `tools_local/codex_reply.md`
- Overwrite the file contents (do not append).
- The file must start with a header that includes the target path.
- In chat, output only: “WROTE: tools_local/codex_reply.md”.

Hard constraints:
- Do NOT propose fixes or refactors. Diagnosis only.
- Do NOT invent IPC channels or behaviors not explicitly present in this file.
- If you infer an invariant, anchor it to a visible check/fallback in this file (mention the identifier and a micro-quote).

## 0.1 Reading map
- What is the file’s actual block order today? (imports, constants/config, helpers, main logic/handlers, exports)
- Where does linear reading break? (jumps, mixed responsibilities, duplication, nesting)
  - For each obstacle: name the exact identifier (function/variable) and include a micro-quote (≤ 15 words) to locate it.

## 0.2 Contract map
- What does the module expose? (exports / public entrypoints / side effects)
- What invariants does it suggest? (expected inputs, tolerated errors, fallbacks)
- If present, describe the IPC contract (only what exists in this file):
  A) Exhaustive IPC enumeration (mechanical; list ALL occurrences you can find in the file):
    - List every ipcMain.handle(<channel>), ipcMain.on(<channel>), ipcMain.once(<channel>)
    - List every ipcRenderer.invoke(<channel>), ipcRenderer.send(<channel>), ipcRenderer.on(<channel>), ipcRenderer.once(<channel>)
    - List every webContents.send(<channel>) call
  For each item:
    - Channel name (string)
    - Input shape (args) as seen at the handler/listener boundary
    - Return shape (only for handle/invoke)
    - Outgoing send messages emitted by that handler/listener (channel + payload shape), if any
  B) Delegated registration (if applicable):
    - If this file calls any helper that registers IPC (e.g., registerLinkIpc(...), *.registerIpc(...)), list the exact callee identifier(s) and note “delegates IPC registration”, but do not list the delegated channels unless they are explicitly in this file.
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

Default rule:
- If you cannot identify clear, behavior-preserving Level 1 improvements with real readability payoff, make NO code changes. Explain why. (Do not force changes.)

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

Scope:
- You may inspect the repo as needed to understand how this module is used, but apply changes only to `<TARGET_FILE>`.

Output requirement:
- Write a short Level 1 report to `tools_local/codex_reply.md` (overwrite; do not append).
- The report must start with: `# Level 1 result: <TARGET_FILE>`
- The report must include:
  - "Decision: CHANGED" or "Decision: NO CHANGE"
  - If CHANGED: 3–10 bullets describing what was changed (structural only), and a one-line confirmation that contract/behavior/timing were preserved.
  - If NO CHANGE: 3–8 bullets explaining why no safe Level 1 change was worth doing.
- Do NOT output diffs (neither in chat nor in the report).
- In chat, output only: “WROTE: tools_local/codex_reply.md”.
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

Objective: improve internal clarity and robustness of `<TARGET_FILE>` while keeping the module’s observable behavior/contract intact, and without introducing unnecessary architecture or timing changes.

Hard constraints:
- Preserve the observable contract as-is (IPC surface, channel names, payload/return shapes, side effects, timing/ordering).
- Do NOT reorder startup sequencing inside `app.whenReady` (treat ordering as timing-sensitive unless proven otherwise).
- Do NOT reorder IPC registration in a way that could change readiness or race behavior.
- Avoid “silent” problematic cases, but also avoid over-logging (no noisy logging).

Anti “refactor that makes it worse” rule:
If a change:
- introduces more concepts than it removes;
- increases indirection without reducing branches/duplication;
- forces the reader to read more to understand the same behavior;
then discard it or scale it down to Level 1 or NO CHANGE.

Allowed Level 2 moves (use judgment):
- Add small helpers ONLY if they:
  - eliminate real duplication or centralize a repeated edge case,
  - reduce branching/nesting complexity,
  - remain local/easy to understand (no “jumping around” required).
- Make implicit edge cases explicit only when it affects decisions (e.g., missing vs invalid inputs).
- Improve error handling where it is currently implicit or risky, while keeping logs proportional and deduped.

Scope:
- You may inspect the repo as needed to understand usage, but apply changes only to `<TARGET_FILE>`.

Output requirement:
- Apply changes directly to `<TARGET_FILE>` only if you decided CHANGED.
- Write the full Level 2 result to a Markdown file at: `tools_local/codex_reply.md`
- Overwrite the file contents (do not append).
- The file must start with a header that includes the target path, e.g.:
  `# Level 2 result: <TARGET_FILE>`
- The report must include:
  - Decision: CHANGED | NO CHANGE
  - If NO CHANGE: 3–8 bullets stating why no safe Level 2 change was worth doing.
  - If CHANGED: for every non-trivial change:
    - Gain: one sentence.
    - Cost: one sentence.
    - Validation: how to verify (manual check / smoke path / simple repo grep).
  - One explicit sentence confirming the observable contract/timing were preserved.
- Do NOT output diffs (neither in chat nor in the report).
- In chat, output only: “WROTE: tools_local/codex_reply.md”.
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

Objective:
Only if there is strong evidence of real pain that cannot be addressed in Levels 1–2, propose and (if justified) implement a minimal architecture/contract change that measurably improves the situation.

Entry criteria (must be satisfied to change code):
- Direct evidence in code OR a reproducible bug/issue:
  - point to exact call sites / usage patterns in the repo, OR
  - provide minimal repro steps that demonstrate the pain.
- Explicit risk assessment: what could break and where.
- Clear validation plan: how to confirm correctness after the change.

Process:
1) Inspect the repo and identify whether `<TARGET_FILE>` has a real pain point that requires Level 3, e.g.:
   - duplicated responsibility across modules,
   - unstable/ambiguous contract (IPC payloads/returns),
   - sync/async mismatch causing issues,
   - multiple consumers depending on inconsistent semantics,
   - cross-module coupling causing bugs or maintenance pain.
2) If NO strong evidence exists:
   - Do NOT change code.
   - Output “Decision: NO CHANGE (no Level 3 justified)” and list the evidence you checked (file + identifier anchors).
3) If evidence DOES exist:
   - Apply the smallest possible Level 3 change that resolves it.
   - Update all affected consumers consistently (only if required by the change).
   - Avoid broad rewrites and unnecessary architecture.

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

Output requirement:
- Write the full Level 3 result to `tools_local/codex_reply.md` (overwrite; do not append).
- The file must start with: `# Level 3 result: <TARGET_FILE>`
- The report must include:
  - Decision: CHANGED | NO CHANGE
  - If NO CHANGE: 3–10 bullets of evidence checked (anchors).
  - If CHANGED: list each non-trivial change with Evidence/Risk/Validation, and explicitly confirm the observable contract/timing were preserved (or state what contract changed and why it was required).
- Do NOT output diffs (neither in chat nor in the report).
- In chat, output only: “WROTE: tools_local/codex_reply.md”.
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

Objective:
Align logging in `<TARGET_FILE>` with the project logging policy and established style, so that:
- Levels match recoverability (error vs warn vs info vs debug),
- Fallbacks are never silent (per policy),
- High-frequency repeatable events where additional occurrences add no new diagnostic value are deduplicated (use warnOnce/errorOnce),
- Messages are short, actionable, and consistent with the repo (see `electron/main.js` patterns).

Default rule (do not force changes):
- If `<TARGET_FILE>` already complies with policy and any proposed tweak would be marginal or would add noise/complexity, make NO code changes and justify “NO CHANGE”.

Hard constraints:
- Do NOT change observable runtime behavior/contract (public API, IPC surface, channel names, payload/return shapes, side effects, timing/ordering).
- Changes must be limited to logging (levels/messages/dedupe) plus minimal local structure strictly required to support that (e.g., introducing a stable key constant).
- Avoid over-logging: do not add new logs on healthy/high-frequency paths.

Reference material (inspect before editing):
- Logging policy headers: `electron/log.js` and `public/js/log.js`.
- Style baseline: `electron/main.js` (best-effort failures, “failed (ignored):”, recoverable fallbacks).

Preload constraint:
- If `<TARGET_FILE>` is a preload (sandbox:true context), do NOT introduce `require('./log')` or other imports that violate preload constraints. Keep the file’s existing logging mechanism (console-based) and style.

What to do:
0) Identify runtime context of `<TARGET_FILE>` (main vs renderer vs preload) and keep the existing logger mechanism (Log.get / window.getLogger / console). Do not introduce cross-context logging dependencies.

1) Audit every existing logging site AND every fallback / best-effort path that could be silent or misleading:
   - payload shape normalization, defaulting, suspicious input acceptance,
   - send-to-window races (missing/destroyed windows),
   - optional I/O / parse / load steps with fallback behavior.

2) Classify each event and choose the correct level:
   - error: unexpected failures that break an intended action or invariant.
   - warn: recoverable anomalies / degraded behavior / fallback paths.
   - info: low-volume lifecycle/state transitions.
   - debug: verbose diagnostics; do not add new debug logs unless they materially improve diagnosis.

3) No silent fallbacks rule:
   - Any fallback MUST emit at least a warn (or warnOnce) unless the behavior is explicitly a no-op by contract (i.e., not a fallback).
   - If the fallback is BOOTSTRAP-only (pre-init), the message OR the explicit dedupe key MUST start with `BOOTSTRAP:` and that path must become unreachable after init. If it can happen after init, it is NOT bootstrap.

4) Once-variants (OUTPUT dedupe only):
   - Use warnOnce/errorOnce ONLY for high-frequency repeatable events where additional occurrences add no new diagnostic value.
     If you cannot justify that property, do NOT introduce or tighten dedupe (prefer warn/error or NO CHANGE).
   - OUTPUT dedupe only: the dedupe key is not diagnostic output. Do not store important context only in the key; include it in the message/args.
   - Explicit key rule (matches log.js headers):
     - The explicit key defines the dedupe bucket.
     - Allowed: a stable short event id, optionally with a CONTROLLED variant suffix when “once per variant” is desired (e.g., lang/base/window).
     - Forbidden: per-occurrence / unbounded data in the key (ids, timestamps, error messages/stacks, arbitrary user input, content-derived strings).
   - warnOnce/errorOnce signature:
     - warnOnce(key, ...args): explicit dedupe key (stable short string; may include a controlled variant suffix).
     - warnOnce(...args): auto-key derived from args (args[0] string preferred, else JSON(args)); if args vary, dedupe may not trigger reliably.
   - Do NOT embed dynamic payloads or error objects in an explicit dedupe key; keep dynamic details in the log args/message.

5) Best-effort window sends (races):
   - If a send is part of an intended action that is being dropped, log warnOnce using “failed (ignored):” style.
   - Use a stable key, optionally with a CONTROLLED variant suffix for the target/window (per-window buckets are allowed).
   - If a send is truly optional and contractually “do nothing if missing”, it may remain silent; do not add noise.

Anti “refactor that makes it worse” rule:
- If a proposed logging change increases complexity/indirection without improving signal-to-noise or policy compliance, discard or simplify it.

After editing (mandatory report):
- If CHANGED: list each non-trivial logging change with:
  - Gain (1 sentence),
  - Cost (1 sentence),
  - Validation (a simple manual action and/or a grep for the stable key).
- If NO CHANGE: 3–8 bullets explaining why no meaningful policy improvement was warranted.
- Include one explicit sentence confirming observable contract/timing were preserved.

Scope:
- You may inspect the repo as needed to understand context, but apply changes ONLY to `<TARGET_FILE>`.

Output requirement:
- Write the full Level 4 result to a Markdown file at: `tools_local/codex_reply.md`
- Overwrite the file contents (do not append).
- The file must start with: `# Level 4 result: <TARGET_FILE>`
- The report must include: `Decision: CHANGED | NO CHANGE`
- Do NOT output diffs (neither in chat nor in the report).
- In chat, output only: “WROTE: tools_local/codex_reply.md”.
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

Level 5 — Comments (reader-oriented, `electron/main.js` style).

Objective:
Improve comments so the file is easier to understand for a new contributor with limited context, while keeping comments genuinely useful (intent/constraints, not obvious syntax). Follow the project’s comment style as in `electron/main.js`:
- concise "Overview" with responsibilities,
- visible section dividers that match the file’s real structure,
- an explicit "End of <file>" marker at the end.

Default rule (do not force changes):
- If comments already meet the style/policy and edits would be marginal or risk drift, make NO code changes and justify “NO CHANGE”.

Constraints:
- Do NOT change runtime behavior in any way (no logic changes, no contract changes, no timing changes).
- Comments-only: you may adjust whitespace around comments and move comments to better locations, but do not move code unless needed to keep a section header adjacent to the block it describes.
- All comments must be in English and plain ASCII only (avoid fancy quotes, em dashes, non-ASCII bullets).
- Do not translate or rename identifiers/IPC channel names/JSON keys; reference them exactly as in code.

What to do:
1) Review/update the top "Overview" comment:
   - 3–7 bullet responsibilities max.
2) Section dividers (required when missing or inconsistent):
   - Ensure the file has section divider comments that match its true blocks (only what exists).
   - If section dividers are missing, ADD them (comments-only) following the style used in `electron/main.js`.
   - Do not invent sections; derive them from the file’s actual block order.
   Typical divider buckets (adapt to the file; use only applicable ones):
   - Imports / logger
   - Constants / config (paths, defaults, limits)
   - Shared state (window refs, module-level state)
   - Helpers (pure helpers, validators, small utilities)
   - Window factories / UI wiring (if any)
   - IPC registration / handlers (if any)
   - App lifecycle / bootstrapping (if any)
   - Delegated registration / integration points (if any)
   - Exports / module surface (if any)
3) Review existing comments/JSDoc:
   - Remove redundant “what code already says” comments.
   - Comment validity rule: if the comment cannot be validated from the file or a direct pointer, remove it.
   - Fix drift: comments must match actual behavior.
   - Prefer “why / constraints / edge cases” over “what”.
4) Add (or confirm) an end-of-file marker:
   - "End of <TARGET_FILE>" in the same style as the repo.

Output requirement:
- Apply edits only if you decided CHANGED.
- Write the full Level 5 result to `tools_local/codex_reply.md` (overwrite; do not append).
- The file must start with: `# Level 5 result: <TARGET_FILE>`
- Include: `Decision: CHANGED | NO CHANGE`
  - If CHANGED: 3–8 bullets describing comment changes + “No functional changes; comments-only.”
  - If NO CHANGE: 3–8 bullets explaining why no meaningful comment improvements were warranted.
- Do NOT output diffs (neither in chat nor in the report).
- In chat, output only: “WROTE: tools_local/codex_reply.md”.
```
---

## Nivel 6: Revision final

* Eliminar legacy o resabios tras refactorizaciones o cualquier cambio en la app.
* Revisar que todo el código haya quedado coherente.

### Prompt Nivel 6 para Codex:
```
# Target file: `<TARGET_FILE>`

Level 6 — Final review (coherence + leftover cleanup after refactors).

Objective:
Do a careful final pass to ensure `<TARGET_FILE>` is coherent end-to-end after Levels 1–5:
- remove leftovers / dead code / stale patterns introduced by earlier refactors;
- ensure internal consistency (naming, control flow, invariants, helper usage);
- ensure logging API usage matches the repo policy (no signature drift);
- ensure comments and code agree (no drift); while preserving the module’s observable behavior/contract and timing.

Constraints:
- Preserve observable behavior/contract as-is (public API, IPC surface, payload/return shapes, side effects, timing/ordering).
- Avoid architecture changes and cross-module rewrites. If a change affects consumers, it is Level 3 and must NOT be done here.
- Prefer minimal edits with clear local payoff. Default to "no change" if uncertain.
- Apply changes ONLY to `<TARGET_FILE>`.

Anti “refactor that makes it worse” rule:
If a change:
- introduces more concepts than it removes;
- increases indirection without reducing real complexity;
- forces the reader to read more to understand the same behavior;
  then discard it or scale it down.

What to do:
1) Coherence scan (repo inspection allowed; edits only in this file):
   - Look for leftovers from prior levels: unused locals/params, duplicated checks,
     inconsistent helper usage/signatures, inconsistent naming, stale comments,
     inconsistent return shapes, redundant branching.
2) Contract consistency check:
   - Verify IPC handlers and exports still match actual call sites and expected payload/return shapes.
   - If you find a mismatch, only fix it if it can be done locally WITHOUT changing the contract; otherwise report it as Level 3 evidence (no code change).
3) Logging API consistency check:
   - Verify each log call matches the logging API (method names + argument shapes) as defined in `electron/log.js` or `public/js/log.js`.
   - If you detect signature drift (e.g., passing a dedupe key to a non-once method), correct it in the smallest way that preserves intended logging behavior and avoids spam.
4) Comment/code alignment:
   - Ensure comments describe real behavior and constraints; remove or adjust any drift introduced during prior edits.

Mandatory gate output (for each non-trivial change you apply):
- Change: one sentence describing what you changed.
- Gain: one sentence.
- Cost: one sentence.
- Risk: one sentence (what could break).
- Validation: how to verify (manual smoke path and/or a simple repo grep).

Output requirement:
- Write the full Level 6 result to `tools_local/codex_reply.md` (overwrite; do not append).
- The file must start with: `# Level 6 result: <TARGET_FILE>`
- Include: `Decision: CHANGED | NO CHANGE`
  - If CHANGED: list each non-trivial change with Change/Gain/Cost/Risk/Validation.
  - If NO CHANGE: “No Level 6 changes justified” + 3–8 bullets of what you checked (anchors).
- Include one explicit sentence confirming the observable contract/timing were preserved.
- Do NOT output diffs (neither in chat nor in the report).
- In chat, output only: “WROTE: tools_local/codex_reply.md”.
```

---

## Nivel 7: Smoke test (human-run; minimal)

**Objetivo:** verificar rápidamente que los cambios de L1–L6 no rompieron el contrato observable del archivo.

**Regla:** NO usar Codex en este nivel. El smoke es humano y se basa en flujos normales de la app. Referencia base: `docs/test_suite.md` (subset “Release smoke”), adaptando 6–15 pasos segun las responsabilidades del archivo.

**Checklist minima (ajustar si no aplica al archivo):**
1) Arrancar la app con logs visibles (terminal / DevTools).
   - Esperado: sin ERROR/uncaught exceptions; sin repeticion continua del mismo warning en idle.
2) Ejecutar 1–3 acciones UI que atraviesen el modulo tocado (p. ej. abrir ventana/accion asociada).
3) Ejecutar 1–2 acciones que persistan o lean estado (si el modulo toca settings/persistencia).
4) Repetir 1 accion clave una segunda vez (para detectar regresiones por estado/cache).
5) Cerrar y reabrir la app si el modulo participa en boot o en persistencia.

**Evidencia (obligatoria, simple):**
En `docs/cleanup/_evidence/issue64_repo_cleanup.md`, bajo `### L7`, registrar:
- Resultado: PASS | FAIL | PENDING
- Lista de pasos efectivamente ejecutados (6–15 bullets max).
- Nota corta si hubo algun log anomalo (solo lo relevante).

---

## Nivel 8: Debug / triage (solo si falla el smoke)

* Solo si falla un paso del Nivel 7: triage guiado por evidencia para aislar causa raíz y proponer la siguiente acción (sin modificar código en este nivel).

---
