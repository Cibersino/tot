# Plan para eliminar código muerto (Dead Code Audit)
Version: 1.2 (ledger-aligned / de-duplicated)
Status: Active
Scope: repo-wide (Electron main + preloads + renderers + contracts por strings)
Single source of truth: `docs/cleanup/DeadCodeLedger.md`

---

## Contexto técnico (conclusiones preliminares)

Concluimos (y se valida por inventario en Fase 2; NO se asumen rutas/archivos):
- Electron multi-ventana y multi-preload: hay múltiples superficies de entrada (main + preloads + renderers).
- Mucho código “usado” no aparece por `import/require`, sino por carga indirecta:
  - HTML `<script src="...">` (orden importa)
  - `BrowserWindow.loadFile/loadURL` (ventanas)
  - contratos por strings (IPC, menús/comandos, DOM hooks, i18n, persistencia)
- Por lo anterior, el análisis estático debe calibrarse con entrypoints reales; si no, produce falsos positivos peligrosos.
- Rutas/IDs dinámicas se tratan como **DYNAMIC/UNKNOWN**: no se “rellenan”; se gestionan como riesgo y se compensan con evidencia dinámica (Fase 4).

---

## Objetivo operativo (definición y criterio de borrado)

Se produce y ejecuta un *Dead Code Ledger* donde cada candidato cae en una clase:

- **Clase A — Local/lexical:** `unused vars/imports/functions` dentro de un módulo (alta certeza)
- **Clase B — Export/File:** exports o archivos desconectados (requiere grafo correcto)
- **Clase C — Contrato:** IPC/menu/event IDs / DOM hooks / i18n keys / claves persistidas (alto riesgo)
- **Clase D — Fallback “invisibilizador”:** silencios, defaults opacos, catches amplios

Regla de oro (borrado):
- **A/B**: borrar con evidencia estática fuerte + smoke focalizado.
- **C**: borrar solo con evidencia estática + evidencia dinámica focalizada (used vs defined).
- **D**: no es “borrar por unused”; es política de fallo visible (transformar, no “limpiar” por tool-signal).

---

## Convención transversal: Codex integrado (no apéndice)

Codex se invoca dentro de pasos numerados cuando se necesita:
- inventario repo-wide (evitar omisiones),
- generación de listas/tablas con evidencia `path:line`,
- generación de configs/patches mínimos.

Reglas fijas:
1) Contexto mínimo (siempre): Electron multi-ventana, multi-preload, renderer por `<script src>`, contratos por strings.
2) Restricciones duras:
   - NO reformat / NO refactor / NO renames.
   - cambios mínimos.
   - siempre con evidencia (`path:line` o match exacto).
3) Salida exigida:
   - tabla/lista con evidencia y/o patch/diff
   - checklist de verificación (smoke)

---

## Evidencia y logs (disciplina estricta)

Principio: los logs son evidencia local para sustentar el ledger; no se versionan por defecto.

Carpeta:
- raíz: `docs/cleanup/_evidence/deadcode/`
- cada ejecución crea un run: `docs/cleanup/_evidence/deadcode/<RUN_ID>/`

PowerShell sugerido:
```powershell
$run  = Get-Date -Format "yyyyMMdd-HHmmss"
$EVID = "docs\cleanup\_evidence\deadcode\$run"
New-Item -ItemType Directory -Force -Path $EVID | Out-Null
"$EVID" | Write-Host
````

Git ignore recomendado (solo logs):
Crear/asegurar `docs/cleanup/_evidence/.gitignore`:

```
*
!.gitignore
```

Notas operativas:

* No copies/pegues el prompt de la consola (ej. `PS C:\...>`). Pega solo el script.
* Patrones con `(` y `)` deben ejecutarse con `git grep -F` (fixed string) para evitar regex errors.

---

## Convención de referencias en el Ledger (reemplaza DC-IDs obligatorios)

### LedgerKey (OBLIGATORIO)

Cada candidato/closure se referencia por un **LedgerKey estable**:

* `A1`, `A2`, ...
* `B1`, `B2.1`, `B2.4`, ...
* `C1`, `C2`, ...
* `D1`, `D2`, ...

### RUN_ID (OBLIGATORIO)

La evidencia se referencia por `RUN_ID` (carpeta) y por nombres de archivos dentro del run.

### DC-IDs (OPCIONAL)

Si quieres mantener DC-IDs por hábito/PR/commit-message, se permite **solo hacia adelante**:

* nuevos items pueden llevar `DC-####` adicional.
* no se exige reescribir lo ya existente.
* el identificador normativo sigue siendo `LedgerKey + RUN_ID`.

---

## Fase 1 — Toolchain y reproducibilidad (TODO en ROOT)

Objetivo: asegurar ejecución reproducible (sin instalaciones implícitas de `npx`).

### 1.0 Gate de seguridad

* `git status --porcelain` debe estar controlado.

### 1.1 Gate “no npx-install”

```powershell
npx --no-install eslint --version
npx --no-install knip --version
npx --no-install madge --version
npx --no-install depcheck --version
```

Gate: si alguno falla, instalar explícitamente como devDependency:

* `npm i -D <tool>`

### 1.2 Smoke base (separar toolchain de runtime)

* `npm start` + recorrido mínimo.
* aquí no se decide borrado.

---

## Fase 2 — Calibrar entry points y knip (si fallas aquí, todo se contamina)

### 2.1 Inventariar entry points reales (repo-wide; sin supuestos)

Fuente 1: Ventanas / procesos (main)

* localizar: `new BrowserWindow(...)`, `webPreferences.preload`, `loadFile/loadURL`.
  Salida: tabla `{window_id?, html_or_url, preload, evidence(path:line + snippet)}`.

Fuente 2: Scripts cargados por HTML (renderer)

* identificar HTML relevantes
* extraer `<script src="...">` en orden
* resolver rutas relativas solo si es determinista

Clasificación obligatoria:

* LITERAL
* DETERMINISTIC_COMPUTED (solo `__dirname` + `path.join/resolve` + literales)
* DYNAMIC/UNKNOWN (variables, condicionales, templates, runtime data)

Regla:

* LITERAL + DETERMINISTIC_COMPUTED alimentan `knip.json entry[]`.
* DYNAMIC/UNKNOWN NO se rellena; se registra como riesgo y se cierra con Fase 4 antes de tocar Clase C.

### 2.2 (Codex) Generar inventario con evidencia (NO code changes)

Prompt:

```text
Repo context:
- Electron multi-window, multi-preload
- Renderer loads scripts via <script src> (not only imports)
- Contracts are strings (IPC/menu/persistence/i18n/DOM)

Task (NO code changes):
1) Repo-wide: find every BrowserWindow creation and map each window to:
   - html file path or url loaded (loadFile/loadURL/other)
   - preload file path used (webPreferences.preload)
   Provide file+line evidence for each mapping.
2) Repo-wide: find HTML files relevant to the app (including those referenced by loadFile/loadURL).
   For each, extract <script src="..."> in order and list the resolved JS targets.
   Provide file+line evidence for each.

Output:
- a single evidence table (path:line -> why it's an entry)
- explicitly mark DYNAMIC/UNKNOWN when:
  - html/preload/script src is not a string literal
  - path is computed/conditional
  - indirection prevents deterministic resolution
- do NOT guess or fill missing paths; mark UNKNOWN instead.
```

### 2.3 Congelar el inventario (artefactos versionados)

Crear/actualizar:

* `docs/cleanup/EntryPointsInventory.md` (incluye sección "Unknowns / Risks")

### 2.4 Construir `knip.json` desde el inventario (sin inventar entries)

Ubicación recomendada versionada:

* `docs/cleanup/deadcode_toolchain/knip.json`

### 2.5 Gate de calibración knip

Ejecuta knip (ver Fase 3) y valida:

* Si knip marca unused un archivo que el inventario marca como entrypoint real, tu `knip.json` está incompleto.
* No avanzas a Fase 3/5 hasta controlar falsos positivos groseros.

---

## Fase 3 — Barrido estático completo + construcción del Dead Code Ledger (evidencia primero)

### 3.1 Ejecutar herramientas (orden fijo) y guardar outputs (evidencia local)

Crear run:

```powershell
$run  = Get-Date -Format "yyyyMMdd-HHmmss"
$EVID = "docs\cleanup\_evidence\deadcode\$run"
New-Item -ItemType Directory -Force -Path $EVID | Out-Null
```

1. ESLint:

```powershell
npm run lint *>&1 | Tee-Object "$EVID\eslint.log"
```

2. knip (config versionada):

```powershell
npx --no-install knip --config docs/cleanup/deadcode_toolchain/knip.json *>&1 | Tee-Object "$EVID\knip.log"
```

3. madge (seed NO asumido; derivado del inventario)

* regla: el seed sale de `EntryPointsInventory.md`
* si hay más de un seed plausible, correr uno por uno y guardar logs separados
  Ejemplo (si inventario confirma `electron/main.js`):

```powershell
npx --no-install madge --circular --extensions js,mjs,cjs electron/main.js *>&1 | Tee-Object "$EVID\madge.main.log"
```

Registrar en el ledger: “seed verificado por evidencia (EntryPointsInventory.md)”.

4. depcheck:

```powershell
npx --no-install depcheck . *>&1 | Tee-Object "$EVID\depcheck.log"
```

### 3.2 Construir/actualizar el ledger único (formato NO reiterativo)

Archivo:

* `docs/cleanup/DeadCodeLedger.md`

Regla central:

* El ledger es *single-source* y evita repetición:

  * se mantiene un **Evidence Index** (lista de RUN_IDs + archivos generados)
  * las entradas/cierres solo apuntan a `RUN_ID`s (no replican listas completas si no aportan)

Estructura mínima recomendada del ledger:

1. Header de corrida (HEAD, seed madge verificado, carpeta evidencia)
2. Evidence Index (por RUN_ID; una sola vez)
3. Resúmenes:

   * Phase 4 (dynamic evidence)
   * Phase 5 (micro-batches execution log)
4. Candidatos por clase (A/B/C/D), con status

Cada entrada/cierre debe incluir:

* `LedgerKey` (obligatorio)
* `Clase` (A/B/C/D)
* `Status`: CANDIDATE | REMOVED | NO DEAD | BLOCKED (DYNAMIC/UNKNOWN) | DEFERRED
* `Ubicación` (path:line si aplica; si es “surface”, listar archivos relevantes)
* `Signal` (eslint/knip/madge/depcheck/grep/runtime)
* `Decisión` (qué se hará o qué se hizo)
* `Evidencia`: referencia a uno o más `RUN_ID`s del Evidence Index

DC-IDs:

* opcional solo hacia adelante (si los quieres), nunca condición para avanzar.

### 3.3 Integrar contratos (estático) dentro del ledger (todavía sin dinámico)

Agregar inventario estático (no borra nada):

* IPC definido: `ipcMain.handle/on`
* IPC usado: `ipcRenderer.invoke/send/on/once`
* Menús/comandos: definición/uso
* Persistencia: nombres de archivos JSON y keys principales (si son literales)
* i18n: keys consultadas (si hay wrapper o loader)
* DOM hooks: `getElementById/querySelector` y similares
  Nota:
* superficies DYNAMIC/UNKNOWN => HIGH y se difieren hasta Fase 4.

### 3.4 (Codex) Convertir outputs en borrador de ledger (NO code changes)

Prompt:

```text
Input:
- tool outputs in docs/cleanup/_evidence/deadcode/<RUN_ID>/*.log
- EntryPointsInventory.md (incluye "Unknowns / Risks")

Task (NO code changes):
Create/Update docs/cleanup/DeadCodeLedger.md with:
1) Evidence Index: list RUN_ID + files generated (no duplication elsewhere).
2) Candidate lists grouped into:
   A) locals (eslint)
   B) unused exports/files (knip + madge signals)
   C) contract surfaces (IPC/menu/persistence/i18n/DOM) with static evidence
   D) fallback patterns (silent catch/noop/silent defaults)

Rules:
- Use LedgerKeys (A1/B2.4/C2/D1...) as primary identifiers.
- For each item: path:line evidence, risk, proposed batch, and reference RUN_ID(s).
- Do NOT guess: when encountering DYNAMIC/UNKNOWN, record as HIGH risk and mark as "needs dynamic evidence (Phase 4)".
Output:
- full ledger content ready to paste
```

---

## Fase 4 — Dinámico focalizado (solo Clase C) para cerrar “used vs defined”

Objetivo: censo mínimo para no romper contratos, especialmente con DYNAMIC/UNKNOWN.

### 4.1 Instrumentación mínima detrás de flag

Agregar logging condicional (`process.env.DEADCODE_AUDIT === "1"`) para recolectar sets:

* IPC: `IPC_DEFINED`, `IPC_USED`
* Menús: `MENU_DEFINED`, `MENU_USED`
  Opcional:
* `SETTINGS_KEYS_USED`, `I18N_KEYS_USED`

### 4.2 Smoke con flag + evidencia local

* `DEADCODE_AUDIT=1` + smoke estándar
* guardar output en: `$EVID\runtime_contracts.log`

### 4.3 Regla de decisión (Clase C)

Un contrato entra a borrado solo si:

* no tiene referencias estáticas razonables (o es unidireccional definido→no usado / usado→no definido)
* y NO aparece en `*_USED` durante smoke con `DEADCODE_AUDIT=1`

### 4.4 (Codex) Implementar instrumentación con dif mínimo (recomendado)

Prompt:

```text
Context:
Electron app; contracts are strings (IPC/menu/persistence/i18n/DOM).

Task:
Implement DEADCODE_AUDIT instrumentation that collects and prints:
- IPC_DEFINED / IPC_USED
- MENU_DEFINED / MENU_USED
Optionally: SETTINGS_KEYS_USED / I18N_KEYS_USED

Constraints:
- Minimal diff. No refactors. No formatting. No renames.
- Instrumentation behind process.env.DEADCODE_AUDIT === "1".

Output:
- patch/diff
- where to run and what output to expect
```

---

## Fase 5 — Eliminación en micro-batches (máxima eficiencia, mínimo riesgo)

### 5.1 Orden estricto de eliminación

Batch 1: ESLint LOW (Clase A)
Batch 2: knip LOW/MED (Clase B: unused exports)
Batch 3: knip LOW/MED (Clase B: unused files) — solo si NO son entrypoints del inventario
Batch 4: depcheck (deps muertas confirmadas)
Batch 5: Contratos HIGH confirmados (Clase C) — end-to-end
Batch 6: Fallbacks (Clase D) — hacer fallas visibles (no “borrar por unused”)

### 5.2 Gate por micro-batch (obligatorio)

Para cada micro-batch:

1. aplicar cambios SOLO a ítems listados en el ledger para ese micro-batch
2. capturar evidencia:

   * pre-checks (si aplica)
   * patch diff
   * post-checks
   * smoke focalizado
3. si falla: revert inmediato y anotar en ledger `Status: BLOCKED` o `NO DEAD` con razón
4. commit por micro-batch con mensaje que referencie:

   * `LedgerKey` (obligatorio)
   * `RUN_ID` (obligatorio)
   * DC-IDs (opcional si los usas)

Plantilla de commit message:

* `deadcode(<ledgerkey>): <acción> (RUN_ID <run>)`
  Ej:
* `deadcode(B2.4): drop settings exports loadNumberFormatDefaults + normalizeSettings (RUN_ID 20251226-074013)`


**Y reemplázalo por este bloque completo:**

```md
### 5.3 Matriz de evidencia para unused exports (Clase B; patrón knip LOW/MED)

Regla (alineada con el ledger):
- Los greps repo-wide por identificador pueden contaminarse por **colisiones de símbolos**.
- Por lo tanto, el **hard gate para “unused export surface” debe ser importer-scoped**:
  - primero descubres importadores reales del owner module (CommonJS `require(...)`, scoped a `electron/`)
  - luego buscas el símbolo SOLO dentro de esos importadores.

Para CADA export que se elimina del `module.exports` (función retenida internamente):

**PRE (pinned a HEAD):**
1) Descubrir importadores del owner module (CommonJS `require(...)`, scoped a `electron/`).
2) Identifier grep de `sym` scoped a importers (captura destructuring / refs directas).
3) Property access grep `.$sym` scoped a importers.
4) Bracket access grep `['sym']` y `["sym"]` scoped a importers.
5) HARD GATE: si existe cualquier referencia en importers → **NO es seguro remover el export** (STOP y clasificar como NO DEAD / USED_EXTERNALLY).

**PATCH:**
6) Diff mínimo: remover SOLO la entrada en `module.exports` (retener helper interno).

**POST (working tree):**
7) Export grep en owner: debe estar vacío para el ítem de lista (línea suelta en `module.exports`).
8) (Opcional pero recomendado) Re-ejecutar el gate importer-scoped en working tree para confirmar que no apareció uso externo durante el cambio.

**SMOKE:**
9) Smoke focalizado; cualquier error de consola runtime = FAIL.

Script recomendado (PowerShell; por símbolo; PowerShell-safe):

```powershell
$RUN_ID = (Get-Date -Format "yyyyMMdd-HHmmss")
$EVID   = "docs\cleanup\_evidence\deadcode\$RUN_ID"
New-Item -ItemType Directory -Force -Path $EVID | Out-Null

$REF = "HEAD"

# Rellena por micro-batch:
$owner = "<OWNER_FILE>"   # e.g. electron/settings.js
$sym   = "<SYM_NAME>"     # e.g. normalizeSettings

$stem = [IO.Path]::GetFileNameWithoutExtension($owner)

# ----------------------------
# PRE: descubrir importadores (scoped a electron/)
# ----------------------------
$stemEsc = [regex]::Escape($stem)
$reqPat  = "require\(\s*['""][^'""]*${stemEsc}(\.js)?['""]\s*\)"
$req     = git grep -n -E $reqPat $REF -- electron 2>$null

$importerFiles = @(
  $req | ForEach-Object { ($_ -split ':',4)[1] } | Sort-Object -Unique
)

$importerFiles | Out-File -Encoding utf8 "$EVID\pre.importers.$sym.grep.log"

# Si no hay importadores detectados, el gate NO prueba ausencia de uso (podría existir require dinámico).
# En ese caso: registra logs vacíos y exige revisión manual adicional.
if ($importerFiles.Count -eq 0) {
  "" | Out-File -Encoding utf8 "$EVID\pre.external_refs.$sym.grep.log"
  "" | Out-File -Encoding utf8 "$EVID\pre.prop_anyobj.$sym.grep.log"
  "" | Out-File -Encoding utf8 "$EVID\pre.bracket.sq.$sym.grep.log"
  "" | Out-File -Encoding utf8 "$EVID\pre.bracket.dq.$sym.grep.log"
  throw "HARD GATE INCONCLUSIVE: no importers found for '$owner' (sym '$sym'). Check for dynamic require/fs-scan before removing export."
}

# ----------------------------
# PRE: identifier / property / bracket SOLO en importers
# ----------------------------
$all = git grep -n -- $sym $REF -- $importerFiles 2>$null
$all | Out-File -Encoding utf8 "$EVID\pre.all_importer_refs.$sym.grep.log"

$prop = git grep -n -F -- (".{0}" -f $sym) $REF -- $importerFiles 2>$null
$prop | Out-File -Encoding utf8 "$EVID\pre.prop_anyobj.$sym.grep.log"

$bsqPat = "['{0}']" -f $sym
$bdqPat = '["{0}"]' -f $sym

$bsq = git grep -n -F -- $bsqPat $REF -- $importerFiles 2>$null
$bdq = git grep -n -F -- $bdqPat $REF -- $importerFiles 2>$null

$bsq | Out-File -Encoding utf8 "$EVID\pre.bracket.sq.$sym.grep.log"
$bdq | Out-File -Encoding utf8 "$EVID\pre.bracket.dq.$sym.grep.log"

# External refs = cualquier match en importers (si hay, NO es seguro remover export)
$external = @()
if ($all)  { $external += $all }
if ($prop) { $external += $prop }
if ($bsq)  { $external += $bsq }
if ($bdq)  { $external += $bdq }

$external | Out-File -Encoding utf8 "$EVID\pre.external_refs.$sym.grep.log"

if ($external.Count -gt 0) {
  throw "HARD GATE FAIL: '$sym' aparece en importers de '$owner'. NO remover export."
}

# ----------------------------
# (EDIT MANUAL/CODEX) remover sym de module.exports en $owner
# ----------------------------

# PATCH EVIDENCE
$ownerDot = ($owner -replace '[\\/]', '_')
git diff -- $owner | Out-File -Encoding utf8 "$EVID\patch.$ownerDot.diff.log"

# POST: export list item (línea suelta dentro de module.exports)
git grep -n -E "^\s*${sym}\s*,?\s*$" -- $owner |
  Out-File -Encoding utf8 "$EVID\post.export_item.$sym.grep.log"

# SMOKE
npm start 2>&1 | Tee-Object "$EVID\smoke.$sym.log"
```

Notas:
- Este gate evita falsos FAIL por “colisión de nombre” (mismo identificador en módulos no relacionados).
- Si el owner module se carga dinámicamente (fs-scan / require no literal), este gate puede ser inconcluso: STOP y trata el caso como HIGH hasta cerrar con evidencia adicional (o Phase 4 si corresponde).

### 5.4 (Codex) Implementación por micro-batch con trazabilidad ledger→diff

Prompt:

```text
Context:
Electron app with multiple windows and multiple preloads. Renderer uses HTML <script src>.
Contracts are strings.

Constraints:
- Minimal diff, no reformatting, no refactors, no renames.
- Remove only items listed in DeadCodeLedger.md for the given LedgerKey(s).
- For each change cite: LedgerKey + exact path:line.

Task:
Implement the micro-batch removals.

Output:
- patch/diff
- list of files changed
- verification checklist (pre/post grep + smoke steps)
```

---

## Fase 6 — Retirar instrumentación de diagnóstico (DEADCODE_AUDIT)

Objetivo: completadas las eliminaciones (Fase 5) y pasada la smoke final, volver el repo a estado normal removiendo scaffolding de auditoría.

Regla:

* retiro como micro-batch dedicado (commit separado)
* smoke final sin `DEADCODE_AUDIT`

Checklist:

1. eliminar helper de preload de auditoría si existe
2. remover hooks en preloads que lo consumen
3. remover instrumentación en main (flags/canales/wiring)
4. remover wiring extra de menú para auditoría
5. validar estático:

   * `git grep -n -F "DEADCODE_AUDIT" -- .` debe quedar vacío (excluyendo docs si aplica)
6. smoke final:

   * `npm start` sin `DEADCODE_AUDIT`
   * confirmar que no se imprime JSON de auditoría al cerrar

---

## Resultado esperado (si sigues el orden)

* Ronda 1 (ESLint + knip calibrado): elimina volumen grande con bajo riesgo.
* Ronda 2 (contratos con evidencia dinámica): elimina legado real sin romper IPC/menús.
* Ronda 3 (fallbacks): fallas dejan de ocultarse de forma controlada.

---

## Punto único donde se ganan o se pierden semanas

La calibración de entrypoints (Fase 2). Si no modelas:

* múltiples ventanas (loadFile/loadURL)
* múltiples preloads
* scripts por `<script src>` (orden)
* contratos por strings
  Entonces “unused” será ruido y te hará borrar cosas vivas.

