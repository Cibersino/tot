# Plan para eliminar código muerto

## Contexto técnico (conclusiones preliminares)

Conclusiones que guían el método (se validan por inventario en Fase 2; no se asumen rutas/archivos):
- Electron multi-ventana y multi-preload: hay múltiples superficies de entrada (main + preloads + renderers).
- Mucho código “usado” no aparece por `import/require`, sino por carga indirecta:
  - HTML `<script src="...">` (orden importa)
  - `BrowserWindow.loadFile/loadURL` (ventanas)
  - contratos por strings (IPC, menús/comandos, DOM hooks, i18n, persistencia)
- Por lo anterior, el análisis estático debe **calibrarse** con entrypoints reales; si no, produce falsos positivos peligrosos.
- Las rutas/IDs dinámicas (no literales) se tratan como **DYNAMIC/UNKNOWN**: no se rellenan; se gestionan como riesgo y se compensan con evidencia dinámica (Fase 4).

---

## Objetivo operativo (definición y criterio de borrado)

Vas a producir y ejecutar un *Dead Code Ledger* donde cada candidato cae en una de estas clases:

- **Clase A — Local/lexical:** `unused vars/imports/functions` dentro de un módulo (alta certeza)
- **Clase B — Export/File:** exports o archivos desconectados (requiere grafo correcto)
- **Clase C — Contrato:** IPC/menu/event IDs / DOM hooks / i18n keys / claves persistidas (alto riesgo)
- **Clase D — Fallbacks “invisibilizadores”:** silencios, defaults opacos, catches amplios

**Regla de oro (borrado):**
- **A/B**: borrar con evidencia estática fuerte + smoke test.
- **C**: borrar solo con evidencia estática **y** evidencia dinámica focalizada (usado vs definido).
- **D**: no es “borrar por unused”; es **política de fallo visible** (eliminar/transformar).

---

## Convención transversal: Codex integrado (no apéndice)

Codex se invoca **dentro de pasos numerados** cuando se necesita:
- inventario repo-wide (evitar omisiones),
- generación de listas/tablas con evidencia `path:line`,
- generación de configs/patches mínimos.

**Reglas fijas (siempre):**
1) Contexto mínimo: Electron multi-ventana, multi-preload, renderer por `<script src>`, contratos por strings.
2) Restricciones duras:
   - NO reformat / NO refactor / NO renames.
   - Cambios mínimos.
   - Siempre con evidencia (`path:line` o match exacto).
3) Salida exigida:
   - tabla/lista con evidencia y/o patch/diff
   - checklist de verificación (smoke test)

---

## Evidencia y logs (disciplina estricta)

### Principio
Los logs son **evidencia local** para sustentar el ledger. No se versionan por defecto.

### Carpeta de evidencia (local, dentro de docs/cleanup)
- Carpeta raíz: `docs/cleanup/_evidence/deadcode/`
- Cada ejecución crea una subcarpeta por run: `docs/cleanup/_evidence/deadcode/<RUN_ID>/`

PowerShell sugerido:
```powershell
$run = Get-Date -Format "yyyyMMdd-HHmmss"
$EVID = "docs\cleanup\_evidence\deadcode\$run"
New-Item -ItemType Directory -Force -Path $EVID | Out-Null
"$EVID" | Write-Host
````

### Git: ignorar evidencia (solo logs)

Crear/asegurar `docs/cleanup/_evidence/.gitignore`:

```
*
!.gitignore
```

### Evidencia en PRs (si aplica)

* No subas logs completos.
* Copia solo fragmentos mínimos al ledger (snippets), citando:

  * `docs/cleanup/_evidence/deadcode/<RUN_ID>/<tool>.log` + líneas o excerpt.

---

## Fase 1 — Toolchain y reproducibilidad (TODO en ROOT)

Objetivo: asegurar que las herramientas corren de forma reproducible y que la ejecución no depende de instalaciones implícitas de `npx`.

### 1.0 Gate de seguridad (antes de correr tools)

* Confirmar estado Git controlado:

  * `git status --porcelain`

### 1.1 Gate de “no npx-install”

Ejecuta (y guarda el output si quieres trazabilidad):

```powershell
npx --no-install eslint --version
npx --no-install knip --version
npx --no-install madge --version
npx --no-install depcheck --version
```

Gate:

* Si alguno falla, instalar explícitamente como `devDependency` en root:

  * `npm i -D <tool>`

### 1.2 Smoke test de runtime (para aislar toolchain de runtime)

* Ejecutar tu smoke test estándar (ej. `npm start` y recorrido mínimo).
* No se decide borrado aquí. Solo confirmar que el entorno está estable.

---

## Fase 2 — Calibrar entry points y knip (si fallas aquí, todo lo demás se contamina)

### 2.1 Inventariar entry points reales (repo-wide; sin supuestos)

Construye lista de entradas por dos fuentes.

#### Fuente 1: Ventanas / procesos (main process)

Repo-wide localizar:

* `new BrowserWindow(...)`
* asignaciones a `webPreferences.preload`
* `loadFile(...)`, `loadURL(...)` y equivalentes

Salida esperada:

* una tabla con filas `{window_id?, html_or_url, preload, evidence}`.
* `evidence` = `path:line` + snippet mínimo.
* Si `html/preload` no es literal de string: marcar **DYNAMIC/UNKNOWN**.

#### Fuente 2: Scripts cargados por HTML (renderer)

Repo-wide:

* Identificar HTML relevantes (por referencia desde `loadFile/loadURL` y por presencia en repo).
* Para cada HTML relevante:

  * extraer `<script src="...">` **en orden**
  * resolver rutas relativas (anotando la forma; no inventar si es dinámica)

Salida esperada:

* conjunto completo de JS top-level cargados sin imports (con evidencia `path:line`).
* Marcar **DYNAMIC/UNKNOWN** cuando el `src` o el HTML objetivo no sea determinista.

### 2.2 (Codex) Generar inventario con evidencia (recomendado; NO code changes)

**Prompt para Codex:**

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

Crear (o actualizar) en `docs/cleanup/`:

* `docs/cleanup/EntryPointsInventory.md` (tabla final con evidencia)
* `docs/cleanup/EntryPointsUnknowns.md` (solo DYNAMIC/UNKNOWN + riesgo + plan de compensación en Fase 4)

### 2.4 Construir `knip.json` desde el inventario (sin inventar entries)

Ubicación versionada recomendada:

* `docs/cleanup/deadcode_toolchain/knip.json`

Modelo base (esqueleto; tu lista real sale del inventario):

```json
{
  "entry": [],
  "project": ["**/*.js"],
  "ignore": [
    "node_modules/**",
    "build-output/**",
    "dist/**",
    "out/**",
    "config/**",
    "tools_local/**",
    "docs/cleanup/_evidence/**"
  ]
}
```

Regla:

* `entry[]` se llena **solo** con entrypoints confirmados por `EntryPointsInventory.md`.
* Si hay DYNAMIC/UNKNOWN que podría introducir entrypoints, no se “rellena”: se deja fuera y se registra el riesgo en `EntryPointsUnknowns.md`.

### 2.5 Gate de calibración knip

Ejecuta knip (ver Fase 3) y valida:

* Si knip marca como unused un archivo que el inventario marca como entrypoint real, tu `knip.json` está incompleto o incorrecto.
* No avanzas a Fase 3/5 hasta que el set de falsos positivos groseros esté controlado.

---

## Fase 3 — Barrido estático completo + construcción del Dead Code Ledger (evidencia primero)

### 3.1 Ejecutar herramientas (en este orden) y guardar outputs (evidencia local)

Primero crea un run de evidencia:

```powershell
$run = Get-Date -Format "yyyyMMdd-HHmmss"
$EVID = "docs\cleanup\_evidence\deadcode\$run"
New-Item -ItemType Directory -Force -Path $EVID | Out-Null
```

Luego ejecuta:

1. ESLint (usa tu `npm run lint` existente):

```powershell
npm run lint *>&1 | Tee-Object "$EVID\eslint.log"
```

2. knip (con config versionada):

```powershell
npx --no-install knip --config docs/cleanup/deadcode_toolchain/knip.json *>&1 | Tee-Object "$EVID\knip.log"
```

3. madge (seed NO asumido; derivado del inventario)

* Regla: el seed para madge sale de `EntryPointsInventory.md`.
* Si el inventario confirma un entrypoint principal del main process (típicamente el módulo de arranque Electron), ese es el seed.
* Si hay más de un candidato “main seed”, ejecutar madge por cada seed y guardar logs separados.

Ejemplo (cuando el inventario confirma `electron/main.js` como seed):

```powershell
npx --no-install madge --circular --extensions js,mjs,cjs electron/main.js *>&1 | Tee-Object "$EVID\madge.main.log"
```

Si el seed es otro archivo, reemplázalo por el verificado. No inventar.
Además, documenta en el ledger: “seed verificado por evidencia (EntryPointsInventory.md)”.

4. depcheck:

```powershell
npx --no-install depcheck . *>&1 | Tee-Object "$EVID\depcheck.log"
```

### 3.2 Construir un ledger único (formato obligatorio)

Crear/actualizar:

* `docs/cleanup/DeadCodeLedger.md`

Cada entrada debe incluir:

* `ID`: DC-0001…
* `Tipo`: A(Local) / B(Export|File) / C(Contrato) / D(Fallback)
* `Path:líneas`
* `Herramienta`: eslint | knip | madge | depcheck | grep
* `Evidencia estática mínima`:

  * referencia a `$EVID\<tool>.log` + excerpt (o líneas)
  * `rg` repo-wide cuando aplique
* `Riesgo`: LOW / MED / HIGH
* `Acción`: DELETE | INLINE | MERGE | REMOVE-CONTRACT | REPLACE-FALLBACK
* `Paquete`: Batch-01, Batch-02…

### 3.3 Integrar contratos (estático) dentro del ledger (todavía sin dinámico)

Agregar inventario estático de contratos (no borra nada):

* IPC definido: `ipcMain.handle/on('...')`
* IPC usado: `ipcRenderer.invoke/send/on('...')`
* IDs de menús/comandos: definición/uso
* Persistencia: nombres de archivos JSON y keys principales
* i18n keys: keys vs usos (si existe wrapper)
* DOM hooks: `getElementById/querySelector` y similares

Nota:

* Si una superficie depende de rutas/IDs DYNAMIC/UNKNOWN, se marca HIGH y se difiere decisión hasta Fase 4.

### 3.4 (Codex) Convertir outputs en borrador de ledger (acelera mucho)

**Prompt:**

```text
Input:
- tool outputs in docs/cleanup/_evidence/deadcode/<RUN_ID>/*.log
- EntryPointsInventory.md + EntryPointsUnknowns.md

Task (NO code changes):
Create/Update docs/cleanup/DeadCodeLedger.md with entries grouped into:
A) locals (eslint)
B) unused exports/files (knip + madge signals)
C) contract surfaces (IPC/menu/persistence/i18n/DOM) with static evidence
D) fallback patterns (silent catch/noop/silent defaults)

Rules:
- For each entry include: path:line, evidence excerpt (log file + snippet), risk, proposed batch.
- Do NOT guess: when encountering DYNAMIC/UNKNOWN, record as HIGH risk and mark as "needs dynamic evidence (Phase 4)".
Output:
- full ledger content ready to paste
```

---

## Fase 4 — Dinámico focalizado (solo Clase C) para cerrar “used vs defined”

Objetivo: censo mínimo para no romper contratos por error, especialmente cuando hay DYNAMIC/UNKNOWN.

### 4.1 Instrumentación mínima detrás de flag

Agregar logging condicional (ej. `process.env.DEADCODE_AUDIT === "1"`) para recolectar sets:

* IPC: **handlers definidos** y **canales invocados**
* Menús: **comandos definidos** y **handlers despachados**
* (Opcional) Persistencia: keys leídas/escritas
* (Opcional) i18n: keys consultadas

Salida requerida al final del run:

* `IPC_DEFINED`, `IPC_USED`
* `MENU_DEFINED`, `MENU_USED`
* (Opcional) `SETTINGS_KEYS_USED`, `I18N_KEYS_USED`

### 4.2 Smoke test con flag + evidencia local

Ejecutar:

* `DEADCODE_AUDIT=1` + tu smoke test estándar
  Guardar output en el run de evidencia:
* `$EVID\runtime_contracts.log`

### 4.3 Regla de decisión (Clase C)

Un contrato (IPC/menu/key) entra a borrado solo si:

* No tiene referencias estáticas razonables (o es unidireccional definido→no usado / usado→no definido)
* **y** no aparece en `*_USED` durante smoke test con `DEADCODE_AUDIT=1`

### 4.4 (Codex) Implementar instrumentación con dif mínimo (recomendado)

**Prompt:**

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

## Fase 5 — Eliminación en batches (máxima eficiencia, mínimo riesgo)

### 5.1 Orden estricto de eliminación

#### Batch 1: ESLint LOW (Clase A)

* unused imports
* unused vars/params
* unreachable obvio

#### Batch 2: knip LOW/MED (Clase B: unused exports)

* exports marcados por knip, revisando side-effects (si hay side-effects: subir riesgo)

#### Batch 3: knip LOW/MED (Clase B: unused files)

* archivos marcados unused que NO sean entrypoints del inventario
* y que no estén implicados por DYNAMIC/UNKNOWN

#### Batch 4: depcheck

* eliminar dependencias confirmadas muertas
  Regla: si se usa indirectamente en build/runtime, no se toca sin evidencia.

#### Batch 5: Contratos HIGH confirmados (Clase C)

* borrar end-to-end (si borras un IPC, borras también uso en renderer/preload y puente)
  Regla: un contrato por commit o micro-lote coherente.

#### Batch 6: Fallbacks “invisibilizadores” (Clase D)

* reemplazar silencios por error explícito o señal visible (según tu política)
* eliminar fallback legacy si su única función era “ocultar”

### 5.2 Gate por batch (obligatorio)

Para cada Batch-N:

1. aplicar cambios solo a entradas listadas en el ledger para ese batch
2. smoke test estándar
3. si falla: revert inmediato y anotar en ledger “NO eliminar; razón: …”
4. commit por batch (o micro-batch coherente) con mensaje + referencia a DC-IDs

### 5.3 (Codex) Implementación por batch con trazabilidad ledger→diff

**Prompt:**

```text
Context:
Electron app with multiple windows and multiple preloads. Renderer uses HTML <script src>.

Constraints:
- Minimal diff, no reformatting, no renames.
- Remove only items listed in Batch-N from DeadCodeLedger.md.
- For each change cite DC-#### and exact path:line.

Task:
Implement Batch-N removals.

Output:
- patch/diff
- list of files changed
- verification checklist (smoke test steps)
```

---

## Resultado esperado (si sigues el orden)

* Ronda 1 (ESLint + knip calibrado): elimina volumen grande de dead code con bajo riesgo.
* Ronda 2 (contratos con evidencia dinámica): elimina legacy real sin romper IPC/menús.
* Ronda 3 (fallbacks): fallas dejan de ocultarse de forma controlada.

---

## Punto único donde se ganan o se pierden semanas

La calibración de entrypoints (Fase 2). Si no modelas:

* múltiples ventanas (loadFile/loadURL)
* múltiples preloads
* scripts por `<script src>` (orden)
* y contratos por strings
  entonces “unused” será ruido y te hará borrar cosas vivas.

