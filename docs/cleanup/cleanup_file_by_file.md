# Plan orden y limpieza por archivo

## Elección de archivo: 

- En proceso: none.

- Archivos ya ordenados y limpiados (28): `electron/settings.js`, `electron/fs_storage.js`, `electron/text_state.js`, `electron/editor_state.js`, `electron/presets_main.js`, `electron/updater.js`, `electron/link_openers.js`, `electron/constants_main.js`, `public/editor.js`, `public/preset_modal.js`, `public/flotante.js`, `public/language_window.js`, `public/js/crono.js`, `public/js/format.js`, `public/js/count.js`, `electron/main.js`, `electron/menu_builder.js`, `public/renderer.js`, `public/js/presets.js`, `public/js/menu_actions.js`, `public/js/i18n.js`, `public/js/notify.js`, `public/js/info_modal_links.js`, `public/js/constants.js`, `electron/preload.js`, `electron/editor_preload.js`, `electron/preset_preload.js`, `electron/flotante_preload.js`, `electron/language_preload.js`.

- Faltan (0): none.

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
- The report must include:
  - "Decision: CHANGED" or "Decision: NO CHANGE"
  - If CHANGED: 3–10 bullets describing what was changed (structural only), and a one-line confirmation that contract/behavior/timing were preserved.
  - If NO CHANGE: 3–8 bullets explaining why no safe Level 1 change was worth doing.
- Do NOT output diffs.
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
- The report must include:
  - Decision: CHANGED | NO CHANGE
  - If NO CHANGE: 3–8 bullets stating why no safe Level 2 change was worth doing.
  - If CHANGED: for every non-trivial change:
    - Gain: one sentence.
    - Cost: one sentence.
    - Validation: how to verify (manual check / smoke path / simple repo grep).
  - One explicit sentence confirming the observable contract/timing were preserved.
- Do NOT output diffs.
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
- The report must include:
  - Decision: CHANGED | NO CHANGE
  - If NO CHANGE: 3–10 bullets of evidence checked (anchors).
  - If CHANGED: list each non-trivial change with Evidence/Risk/Validation, and explicitly confirm the observable contract/timing were preserved (or state what contract changed and why it was required).
- Do NOT output diffs.
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
- Call-site style (policy): use `log.warn|warnOnce|error|errorOnce` directly; do NOT add/keep local aliases/wrappers (e.g., `warnOnceRenderer`). If a helper needs it, pass the method reference (e.g., `{ warnOnce: log.warnOnce }`) or pass `log`.

Reference material (inspect before editing):
- Logging policy headers: `electron/log.js` and `public/js/log.js`.
- Style baseline: `electron/main.js` (best-effort failures, “failed (ignored):”, recoverable fallbacks).

Preload constraint:
- If `<TARGET_FILE>` is a preload (sandbox:true context), do NOT introduce `require('./log')` or other imports that violate preload constraints. Keep the file’s existing logging mechanism (console-based) and style.

What to do:
0) Identify runtime context of `<TARGET_FILE>` (main vs renderer vs preload) and keep the existing logger mechanism (Log.get / window.getLogger / console). Do not introduce cross-context logging dependencies.

0.1) Enforce call-site style: remove any local log method aliases/wrappers and update call sites accordingly (no behavior/timing change).

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
- The report must include: `Decision: CHANGED | NO CHANGE`
- Do NOT output diffs.
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
- Include: `Decision: CHANGED | NO CHANGE`
  - If CHANGED: 3–8 bullets describing comment changes + “No functional changes; comments-only.”
  - If NO CHANGE: 3–8 bullets explaining why no meaningful comment improvements were warranted.
- Do NOT output diffs.
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
- Include: `Decision: CHANGED | NO CHANGE`
  - If CHANGED: list each non-trivial change with Change/Gain/Cost/Risk/Validation.
  - If NO CHANGE: “No Level 6 changes justified” + 3–8 bullets of what you checked (anchors).
- Include one explicit sentence confirming the observable contract/timing were preserved.
- Do NOT output diffs.
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

## Metodología uniforme para auditar preloads

### Niveles

* **LP0 — Diagnosis + Inventarios (Codex)**
* **LP1 — Unified pass (estructura/legibilidad + robustez estrictamente contract-preserving) (Codex)**
* **LP2 — Callbacks semantics review (propagate vs isolate, unsubscribe, cb validation) (Codex)**
* **LP3 — Logs (preload policy) (Codex)**
* **LP4 — Final review + Smoke (Codex + humano)**

### Regla base (aplica a todos los niveles)

En preloads, la **superficie observable** es:

1. **Surface API**: `contextBridge.exposeInMainWorld(name, shape)` (o `exposeInIsolatedWorld`).
2. **IPC wiring**: `ipcRenderer.invoke/send/on/removeListener/removeAllListeners`.
3. **Semántica de listeners**: subscribe/unsubscribe, replay/buffer, timing (sync/async), aislamiento de errores.

**Cualquier cambio** que altere **nombre/keys expuestas**, **semántica de listeners**, o **canales/payloads/returns** es **cambio de contrato** (normalmente prohibido salvo evidencia fuerte).

**Logging en preloads:** mantener **console-based** (no `window.getLogger`, no `require('./log')`, no dependencias nuevas).

**Nota sobre orden de keys:** el *set* de keys expuestas es contrato. El orden es observable (p. ej. `Object.keys(...)`) y por defecto lo tratamos como NO-contractual.
- Regla por defecto: Se permite reordenar keys del objeto expuesto (por legibilidad/estructura).
- Gate obligatorio: antes de reordenar, LP0 debe incluir un “key-order dependency scan” del repo.
  - Si el scan da 0 hits relevantes (nadie depende del orden), el reordenamiento se considera contract-preserving.
  - Si hay cualquier hit relevante (uso de indices/posicion, UI/logic que asume orden), tratar el orden como contractual para ese preload y PROHIBIR reordenar salvo gate fuerte (Evidence/Risk/Validation).

---

### LP0 — Diagnosis + Inventarios (Codex)

**Objetivo:** mapear el contrato real del preload sin tocar código.

**Entregables en evidencia (obligatorios):**

* Surface inventory: `name` expuesto + keys + tipo de cada key (invoke/send/on/helper/constant) + semántica de listener (unsubscribe, removeListener, replay/buffer).
* Key-order dependency scan (repo): evidenciar si alguien enumera `window.<API_NAME>` y depende del orden.
* IPC inventory: lista completa de canales y forma de args/returns/payload.
* Invariantes/fallbacks anclados (cb validation, try/catch, buffering, guards).

**Prompt Codex (LP0):**
```
# Target file: `<TARGET_FILE>`

For this response only, produce a Level P0 minimal diagnosis of the file (short, descriptive, no code changes, no recommendations).

Hard constraints:
- Do NOT propose fixes or refactors. Diagnosis only.
- Do NOT invent IPC channels or consumers not explicitly present in this file.
- If you infer an invariant, anchor it to a visible check/fallback in this file (mention the identifier and a micro-quote <= 15 words).

#### 0.1 Reading map
- What is the file’s actual block order today?
- Where does linear reading break?
  - For each obstacle: identifier + micro-quote (<= 15 words).

#### 0.2 Preload surface contract map (mandatory)
A) List every `contextBridge.exposeInMainWorld(<name>, <api>)` and/or `contextBridge.exposeInIsolatedWorld(...)`:
  - Exposed name string.
  - List ALL keys on the exposed API object.
  - For each key: categorize (invoke wrapper | send wrapper | on-listener | pure helper | constant).
  - For listener keys: state whether it returns an unsubscribe function and how it removes listeners (if present).
  - If there is replay/buffer behavior, describe it and anchor to code.

B) Note any direct global exports (e.g., `window.X = ...`) if present.

#### 0.3 IPC contract (mechanical; list ALL occurrences in this file)
- List every `ipcRenderer.invoke/send/on/once/removeListener/removeAllListeners`.
- List every `ipcMain.*` or `webContents.send` if any (usually none).
For each item:
- Channel name (string literal).
- Input shape (args).
- Return shape (invoke only).
- For listeners: forwarded payload shape to the callback.

#### 0.4 Invariants / fallbacks (anchored)

For EVERY exposed listener-like key (any API key that accepts a callback, e.g. `onX(cb)`):
- Classify cb error policy: ISOLATES (try/catch) vs PROPAGATES (direct `cb(...)`).
- Anchor with a micro-quote (<=15w) containing the `cb(` call.
- If it logs on cb error, add a second micro-quote (<=15w) for the log call.

If the wrapper returns unsubscribe:
- State whether removal is protected by try/catch (ISOLATES vs PROPAGATES).
- Anchor with a micro-quote (<=15w) containing `removeListener(` (or equivalent).
- If it logs on removal error, add a micro-quote for the log call.

Output (mandatory): one table row per listener-like key:
API key | IPC channel | cb-quote | cb policy | unsub (Y/N) | remove-quote/N-A | unsub policy

After the table: list other non-callback invariants/fallbacks with micro-quotes.
Prohibition: no blanket “all listeners …” claims unless table proves it.

#### 0.5 Key-order dependency scan (repo; mandatory)

Let API_NAME be the exposed name string from 0.2(A) (e.g., `electronAPI`).

Search the repo for enumeration of the API object using ANY of these expressions:
- `API_NAME` (e.g., `electronAPI`)
- `window.API_NAME` and `window['API_NAME']`
- `globalThis.API_NAME` / `self.API_NAME` (if present in repo style)

For each enumeration family below, report hits (file + identifier + micro-quote <= 15 words) OR “0 hits”:
- `Object.keys(<expr>)`
- `Object.entries(<expr>)`
- `Object.values(<expr>)`
- `Reflect.ownKeys(<expr>)`
- `for (... in <expr>)`

Flag “order-dependent” ONLY if you find positional use or ordering assumptions, e.g.:
- indexing: `[0]`, `.at(0)`, destructuring `const [a] = ...`
- “first/last key” logic, UI assumptions, or comments implying fixed order

Conclude with one line:
- `Key order: NOT depended upon (safe to reorder)` OR
- `Key order: DEPENDED upon (treat as contractual; do not reorder)`
```

**PASS LP0** si: inventarios completos + sin IPC inventado + invariantes anclados.

---

### LP1 — Unified pass (estructura + robustez + gate de contrato) (Codex)

**Objetivo:** permitir mejoras reales de lectura/robustez **sin tocar contrato**, y solo permitir cambio de contrato si pasa un gate explícito.

**Regla NO FORCE:** si el preload ya es corto/lineal o el riesgo supera el beneficio → **NO CHANGE**.

**Prompt Codex (LP1 unificado):**
```
# Target file: `<TARGET_FILE>`

Level P1 (unified) — Structure + controlled robustness + explicit contract gate (preload).

Objective:
Improve readability and internal robustness only where it is clearly behavior-preserving,
while preserving observable contract/timing:
- exposed API name + keys,
- listener semantics (subscribe/unsubscribe/replay/buffer timing),
- IPC channel names and payload/return shapes,
- side effects and ordering.

Hard constraints (always):
- Do NOT add/remove/rename any exposed keys in `contextBridge.exposeInMainWorld(...)`.
- Do NOT change listener semantics (including whether it returns unsubscribe, replay/buffer behavior, sync vs async timing).
- Do NOT change IPC channel strings or payload/return shapes.
- Do NOT introduce new imports or cross-context deps.
- Reordering exposed API keys is allowed if LP0 key-order dependency scan found 0 relevant hits; otherwise do NOT reorder.

Allowed changes (only with clear payoff):
A) Structural:
- Reorder into coherent blocks if it materially improves readability:
  1) header + 'use strict'
  2) electron imports
  3) module state (buffers/sets)
  4) helpers
  5) API object
  6) exposeInMainWorld(...)
- Rename locals only for clarity (no contract impact).
- Reorder keys inside the exposed API object for grouping/readability only if allowed by the LP0 key-order dependency scan.

B) Robustness (still contract-preserving):
- Callback validation ONLY if current behavior already effectively no-ops on invalid input.
- try/catch around callback invocation ONLY if it does not change externally observable behavior/timing.
- Unsubscribe safety ONLY if semantics remain identical.

Contract gate (exceptional):
- If you propose ANY change that could affect consumers (exposed keys, listener semantics, IPC payload/shape, timing),
  you MUST include:
  - Evidence: exact repo anchors (file + identifier + micro-quote) OR minimal repro steps.
  - Risk: what could break and where.
  - Validation: concrete manual check and/or repo grep.
- If you cannot satisfy the gate, DO NOT change contract.

Output requirement:
- Decision: NO CHANGE | CHANGED (contract unchanged) | CHANGED (contract changed; gate satisfied)
- If CHANGED: for each non-trivial change include Change/Gain/Cost/Risk/Validation.
- One explicit sentence confirming whether observable contract/timing changed.
- Do NOT output diffs.
```

**PASS LP1** si: cambios (si los hay) son claramente contract-preserving, o si propone contract change lo hace con Evidence/Risk/Validation sólidos.

---

### LP2 — Callbacks semantics review (Codex)

#### Objetivo

Evaluar **todas** las funciones “listener-like” expuestas por el preload (p. ej. `onX(cb)`), y decidir por cada una:

1. **Error policy:** ¿propaga o aísla errores del callback? (propagate vs isolate)
2. **Unsubscribe:** ¿retorna unsubscribe? ¿cómo remueve el listener?
3. **Callback validation:** ¿valida que `cb` sea función o deja que lance TypeError?

Y, si amerita, **corregir** para alinearse con el criterio acordado:

* **Por defecto**: aislar en eventos recurrentes / streams; propagar solo si es fail-fast deliberado.
* Cambios solo si el riesgo está controlado.

#### Qué NO se permite tocar

* No cambiar **keys expuestas** en `exposeInMainWorld`.
* No cambiar **canales IPC** ni shapes de payload/return.
* No cambiar **timing semántico** (sync/async) salvo que ya exista en ese wrapper.
* No introducir imports/deps nuevos.

#### Gates (cuándo se permite “corregir”)

Un cambio a un listener wrapper se considera **potencialmente observable** (porque cambia error surfacing / side effects). Por lo tanto:

* Si el cambio es **solo encapsular errores con try/catch + console.error** en un stream/recurrente: permitido **solo si** no afecta número/orden de invocaciones ni introduce logs en path sano.
* Si el cambio es agregar **cb validation** (evitar TypeError): permitido **solo si** hay evidencia de que ocurre en runtime o si el contrato ya es efectivamente “no-op when invalid” (anclado).
* Si el cambio es agregar **unsubscribe donde antes no había**: tratar como **cambio de contrato (gate fuerte)**:
  * Evidence (grep de call sites y que el return no se usa),
  * Risk,
  * Validation plan.

#### Prompt para Codex (LP2):
```
# Target file: `<TARGET_FILE>`

Level P2 — Callback/listener semantics review (preload).

Objective:
Evaluate and (only if justified) correct the semantics of exposed callback/listener wrappers (e.g., `onX(cb)`),
using the explicit policy baseline below, while keeping the preload’s observable contract/timing intact as much as possible.

Hard constraints:
- Do NOT add/remove/rename exposed keys in `contextBridge.exposeInMainWorld(...)` / `exposeInIsolatedWorld(...)`.
- Do NOT change IPC channel strings or payload/return shapes.
- Do NOT introduce new imports or cross-context dependencies.
- Do NOT add logging on healthy/high-frequency paths.

Policy baseline (apply mechanically):
1) Classify each listener wrapper as one of:
   - STREAM/RECURRENT: can fire multiple times per session, state updates, user-driven repeated actions, timers, settings updates.
   - RARE/CONTROL: expected to fire rarely (one-shot readiness, lifecycle transitions, rare admin actions).
   Provide a 1-sentence justification per wrapper based on channel name, code comments, and usage patterns you can find in the repo.

2) Error policy decision:
   - STREAM/RECURRENT -> prefer ISOLATE:
     Wrap `cb(...)` in try/catch and log ONLY on error (console.error or console.warn), no logs in the healthy path.
   - RARE/CONTROL -> prefer PROPAGATE:
     Leave `cb(...)` unwrapped so errors surface loudly, unless the file already isolates by design.
   Any deviation must be justified with an explicit anchor (comment or code pattern).

3) Unsubscribe policy:
   - KEEP existing unsubscribe semantics as-is by default.
   - Adding or removing an unsubscribe return is treated as CONTRACT CHANGE and is FORBIDDEN unless the Contract Gate is satisfied.

4) Callback validation policy:
   - KEEP as-is by default.
   - You may add `typeof cb === 'function'` guards ONLY if you can show evidence that invalid callbacks can occur
     (repo call sites pass non-functions or optional callbacks), OR the current behavior is already an effective no-op.
   If you add guards, do not add logs unless the invalid-cb case is high-frequency and diagnostic value is high.

Contract Gate (required for any contract-affecting change):
If you propose ANY change that could affect consumers (return values like unsubscribe, error surfacing expectations, sync/async timing),
you MUST include:
- Evidence: exact repo anchors (file + identifier + micro-quote) OR minimal repro steps.
- Risk: what could break and where.
- Validation: concrete manual check and/or repo grep to confirm consumers remain compatible.
If you cannot satisfy the gate, DO NOT change that behavior.

Step 1) Enumerate listener-like API keys
- From the exposed API object, list every key that registers a callback (onX-style or similar).
For each key, record:
A) Underlying IPC usage (`ipcRenderer.on/once`, channel name).
B) Current behavior:
   - does it try/catch around cb?
   - does it validate cb?
   - does it return unsubscribe?
C) Current removal mechanism if any (`removeListener`, etc.).

Step 2) Apply the policy baseline (decision table)
For each wrapper, output:
- Classification: STREAM/RECURRENT or RARE/CONTROL + justification.
- Target policy: ISOLATE or PROPAGATE + justification.
- Unsubscribe: KEEP or CHANGE (if CHANGE, must pass Contract Gate).
- cb validation: KEEP or CHANGE (must meet validation policy above).

Step 3) Changes (only if justified)
Default rule: NO CHANGE unless there is a clear, evidence-driven improvement.

Output requirement:
- Decision: NO CHANGE | CHANGED (contract unchanged) | CHANGED (contract changed; gate satisfied)
- Always include the per-wrapper table from Step 2.
- If CHANGED: for each change include Change/Gain/Cost/Risk/Validation.
- One explicit sentence confirming whether observable contract/timing changed.
- Do NOT output diffs.
```

---

### LP3 — Logs (preload policy) (Codex)

**Objetivo:** ajustar logging sin ruido y sin romper restricciones de preload.

**Reglas duras:**

* Solo `console.*` (o el mecanismo console-based que ya exista en el archivo).
* No agregar logs en paths sanos/de alta frecuencia.
* Dedupe solo si es realmente spameable y no aporta más (con mecanismo local estable; sin keys dinámicas basadas en input).

**Prompt Codex (LP3 logs):**
```
# Target file: `<TARGET_FILE>`

Level P3 — Logs (preload policy).

Objective:
Align logging with preload constraints and repo style:
- Console-based only (no `window.getLogger`, no `require('./log')`, no new deps).
- Fallbacks should not be silently problematic, but avoid noise on healthy/high-frequency paths.
- Deduplicate only when repeated occurrences add no diagnostic value; use a stable local mechanism (e.g., Set) with stable keys (no user input in keys).

Hard constraints:
- Do NOT change contract/timing (exposed keys/semantics and IPC).
- Logging-only changes + minimal local structure strictly required to support that.

Output:
- Decision: CHANGED | NO CHANGE
- If CHANGED: list each non-trivial logging change with Gain/Cost/Validation.
- Confirm contract/timing preserved.
- Do NOT output diffs.
```

**PASS LP3** si: no introduce dependencia nueva, no mete ruido, y no deja fallbacks “problemáticos” silenciosos.

---

### LP4 — Final review + Smoke (Codex + humano)

Este nivel cierra el preload.

#### Parte A: Final review (Codex)

**Objetivo:** buscar leftovers, drift, incoherencias después de LP1–LP3.

**Prompt Codex (LP4 final review):**
```
# Target file: `<TARGET_FILE>`

Level P4 — Final review (preload; coherence).

Objective:
Ensure end-to-end coherence after LP1–LP3 while preserving contract/timing:
- no dead code / unused locals introduced by refactors,
- surface contract unchanged (exposed name + keys; listener semantics unchanged),
- IPC list stable (channel strings and payload shapes consistent),
- logging still console-based and not noisy,
- comments (if any) do not misdescribe behavior (fix/remove misleading comments only; do not add section dividers).

Output:
- Decision: CHANGED | NO CHANGE
- If NO CHANGE: “No Level P4 changes justified” + 3–8 bullets of what you checked (anchors).
- If CHANGED: Change/Gain/Cost/Risk/Validation per non-trivial change.
- Confirm observable contract/timing preserved.
- Do NOT output diffs.
```

#### Parte B: Smoke (humano; registrar en evidencia)

**Objetivo:** verificar que la API expuesta existe y que al menos 1 camino real funciona sin throw.

**Checklist mínimo (por preload):**

1. Abrir la ventana correspondiente (main/editor/flotante/language/presets).
2. DevTools Console:
   * `typeof window.<API_NAME>` es `"object"`.
* Validar keys:
  - Si LP0 marcó "0 hits relevantes" => validar SET (no orden): `Object.keys(window.<API_NAME>).sort()` coincide con el inventario LP0 ordenado.
  - Si LP0 marcó "order-dependent" => validar ORDEN: `Object.keys(window.<API_NAME>)` coincide exactamente con el inventario LP0 (mismo orden).
3. Canary:
   * ejecutar 1 método `invoke` “barato” si existe (ej. `getSettings`, `getCurrentText`, etc. según el preload),
   * si existe un listener: suscribirse y luego desuscribirse (si retorna unsubscribe), confirmando “no throw”.

**PASS LP4** si: smoke OK y no hay drift reportado por Codex.

---
