# Plan orden y limpieza por archivo

## Elección de archivo:

Archivos ya ordenados y limpiados:
- `electron/main.js`
- `electron/menu_builder.js`
- `electron/fs_storage.js`
- `electron/settings.js`

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
# Target file: electron/text_state.js

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
# File: electron/text_state.js

Level 1 — Structural refactor and cleanup.

Objective: make electron/text_state.js navigable and, where it helps, more linearly readable, without changing observable behavior/contract or breaking any timing-dependent behavior.

Constraints:
- Preserve behavior and the observable contract as-is (public API, IPC surface, payload/return shapes, side effects).
- Preserve truncation + persistence behavior and timing.

Anti “refactor that makes it worse” rule:
If a change:
- introduces more concepts than it removes,
- increases indirection without reducing branches/duplication,
- forces the reader to read more to understand the same behavior,
then discard it or scale it down to a smaller Level 1 change.

What to do (flexible, use judgment):
- Reorder the file into coherent blocks (e.g., imports → constants/config → helpers → main logic/handlers/entrypoints → exports). This is guidance, not a rigid layout.
- Apply safe local simplifications:
  - reduce nesting via early returns only when behavior is identical,
  - remove obvious duplication only when semantics stay identical,
  - improve local naming only when it reduces ambiguity and is behavior-preserving.

You may inspect the repo as needed to understand how this module is used, but apply changes only to electron/text_state.js.
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
# File: electron/text_state.js

Level 2 — Clarity / robustness refactor (controlled).

Objective: improve internal clarity and robustness of electron/text_state.js while keeping the module’s observable behavior/contract intact, and without introducing unnecessary architecture.

Constraints:
- Preserve the observable contract as-is (public API, IPC surface, payload/return shapes, side effects, timing).
- Avoid “silent” problematic cases, but also avoid over-logging (no noisy logging).

Anti “refactor that makes it worse” rule:
If a change:
- introduces more concepts than it removes,
- increases indirection without reducing branches/duplication,
- forces the reader to read more to understand the same behavior,
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

You may inspect the repo as needed to understand how this module is used, but apply changes only to electron/text_state.js.
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
# File: electron/text_state.js

Level 3 — Architecture / contract changes (exceptional; evidence-driven).

Objective: Only if there is strong evidence of real pain that cannot be addressed in Levels 1–2, propose and (if justified) implement a minimal architecture/contract change that measurably improves the situation.

Entry criteria (must be satisfied):
- Direct evidence in code OR a reproducible bug/issue:
  - point to the exact call sites / usage patterns in the repo, OR
  - provide a minimal reproduction (steps) that demonstrates the pain.
- Explicit risk assessment: what could break and where.
- Clear validation plan: how to confirm correctness after the change.

Process:
1) First, inspect the repo to identify whether electron/text_state.js has a real pain point that requires Level 3:
   - duplicated responsibility across modules,
   - unstable/ambiguous contract for IPC payloads/returns,
   - sync/async mismatch causing issues,
   - multiple consumers depending on inconsistent semantics,
   - cross-module coupling (e.g., settings bootstrap inside text_state) that is causing bugs or maintenance problems.
2) If NO strong evidence exists, do NOT change code. Instead, output a short “No Level 3 justified” note and list the evidence you checked.
3) If evidence DOES exist, apply the smallest possible Level 3 change that resolves it:
   - keep the change minimal (avoid broad rewrites),
   - update all affected consumers in the repo consistently,
   - avoid introducing unnecessary architecture.

Anti “refactor that makes it worse” rule:
If a change:
- introduces more concepts than it removes,
- increases indirection without reducing real pain,
- forces readers to read more to understand the same behavior,
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

---

## Nivel 5: Comentarios

* Ajustar comentarios para que sirvan de orientación cualquier persona con pocos conocimientos técnicos.
* Revisar comentarios y borrarlos, reescribirlos o agregar otros si son aporte real.
* Seguir formato de `main.js`:
  - Overview conciso (responsibilities),
  - secciones visibles,
  - marcador de “End of …” al final.
* Todos los comentarios deben ser en inglés (pero sin traducir los nombres o claves que usa el código, aunque estén en otro idioma).

---

## Nivel 6: Revision final

* Eliminar legacy o resabios tras refactorizaciones o cualquier cambio en la app.
* Revisar que todo el código haya quedado coherente.

---

## Nivel 7: Smoke test

* Cuando lo anterior esté listo: Smoke test y/o análisis debug para diagnosticar que los cambios realizados no rompieron la app.

---