## B3 — Candidate Ledger (label-sorted, occurrence-first, evidence-gated)

### Definiciones
- **Ocurrencia:** unidad atómica de B3. Es una línea o bloque acotado con evidencia local (`L<line>` + snippet).
- **Label:** categoría de triage/acción (orden fijo abajo).
- **Primary Theme (opcional):** header de navegación dentro de un label.
  - Un solo nivel (sin subárboles).
  - Cada ocurrencia declara exactamente un Primary Theme si se usa agrupación.
  - Los themes **no reemplazan** ocurrencias. Prohibidos “summary entries” dentro de B3.

### Orden (obligatorio)
B3 se ordena por label, en este orden:
`P1-DOC`, `P1-STRUCT`, `P2-CONTRACT`, `P2-SIDEFX`, `P2-FALLBACK`, `DEFER`, `DROP`.

Dentro de cada label:
- si hay Primary Theme: agrupar por header `##### <Primary Theme>`, luego listar ocurrencias;
- si no hay Primary Theme: listar ocurrencias directamente.
En ambos casos, **cada ocurrencia aparece exactamente una vez**.

### Nomenclatura de Primary Theme (determinista)
Usar un eje explícito:
- CONTRACT:
  - `CONTRACT:SEND:<event>`
  - `CONTRACT:IPC_HANDLE:<channel>` / `CONTRACT:IPC_ON:<channel>` / `CONTRACT:IPC_ONCE:<channel>`
  - `CONTRACT:MENU_ACTION:<actionId>` (si aplica)
- PATTERN:
  - `PATTERN:TRY_NOOP`
  - `PATTERN:DEFAULT_OR`
  - `PATTERN:DEFAULT_NULLISH`
  - `PATTERN:NUM_COERCE`
  - u otro patrón claramente nombrado y estable
- MISC:
  - `MISC:<...>` solo si no aplica CONTRACT/PATTERN

### Labels (intención)
- `P1-DOC`: comentarios/documentación (comment-only).
- `P1-STRUCT`: cambios estructurales “safe” (reordenar/extraer sin intención de cambio funcional).
- `P2-CONTRACT`: riesgo de romper superficie de contrato (IPC/event/export, o líneas near/touches contract).
- `P2-SIDEFX`: timing/orden/estado (side effects, race, init order).
- `P2-FALLBACK`: defaults/guards/try-noop fuera de contrato.
- `DEFER`: candidato real pero no se trabaja en este ciclo.
- `DROP`: falso positivo / no aplica.

### Evidence gating (VS Code)
Para toda ocurrencia que NO sea `DROP/DEFER` y que NO sea comment-only:
- Evidencia repo obligatoria:
  - símbolos: Shift+F12 (registrar count + top files)
  - strings: Ctrl+Shift+F (registrar count + files)

Regla: solo después de evidence-gating se permiten ediciones.
