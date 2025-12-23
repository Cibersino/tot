# Plan para eliminar código muerto

## Contexto técnico del repo (usado para diseñar el plan)

Estructura relevante (según el árbol del proyecto):

* **Main (Electron):** `electron/main.js`
* **Preloads múltiples:** `electron/preload.js`, `electron/*_preload.js` (`language_preload.js`, `editor_preload.js`, `preset_preload.js`, `flotante_preload.js`)
* **Renderer con HTML + scripts NO importados (contrato implícito):**
  * HTML: `public/index.html`, `public/flotante.html`, `public/editor.html`, `public/preset_modal.html`, `public/language_window.html`
  * JS “entry”/top-level: `public/renderer.js`, `public/flotante.js`, `public/editor.js`, `public/preset_modal.js`
  * JS por `<script src>`: `public/js/*.js` (p.ej. `crono.js`, `menu_actions.js`, `i18n.js`, etc.)
* **Persistencia runtime:** `electron/fs_storage.js`, `electron/settings.js`, `electron/*_state.js` y `config/*.json` generado en primer arranque
* **I18n:** `i18n/{es,en}/*.json`
* **Backyard local (NO tocar / NO versionar / NO subir):** `tools_local/**`
  * Para este plan, **sí** se usa `tools_local/` como **sandbox** de toolchain, precisamente para no contaminar el repo (ni `package.json` raíz, ni `node_modules` raíz, ni lockfiles del root).

Este layout impone una realidad: **mucho código “usado” no aparece por imports**, sino por:

* Carga por HTML `<script>`
* Carga de ventanas por `BrowserWindow.loadFile(...)`
* Contratos por strings (IPC, menús, etc.)

Por eso, cualquier limpieza seria debe **calibrar el análisis estático** (para que no mienta) y **cerrar contratos** con evidencia.

---

## Objetivo operativo (definición y criterio de borrado)

Vas a producir y ejecutar un *Dead Code Ledger* donde cada candidato cae en una de estas clases:

* **Clase A — Local/lexical:** `unused vars/imports/functions` dentro de un módulo (alta certeza)
* **Clase B — Export/File:** exports o archivos desconectados (requiere grafo correcto)
* **Clase C — Contrato:** IPC/menu/event IDs / DOM hooks / i18n keys / claves persistidas (alto riesgo)
* **Clase D — Fallbacks “invisibilizadores”:** silencios, defaults opacos, catches amplios

**Regla de oro (borrado):**

* **A/B**: borrar con evidencia estática fuerte + smoke test.
* **C**: borrar sólo con evidencia estática **y** evidencia dinámica focalizada (usado vs definido).
* **D**: no es “borrar por unused”; es **política de fallo visible** (eliminar/transformar).

---

## Convención transversal: cómo usar Codex (sin “fase aparte”)

Codex se usa **dentro** de las fases, solo cuando su ventaja es clara (repo-wide + generación de listas/parches).

**Reglas fijas para prompts a Codex (siempre):**
    1) Contexto técnico mínimo (Electron multi-ventana, multi-preload, scripts por `<script src>`).
    2) Restricciones duras:
        - NO tocar nada fuera de `tools_local/deadcode_toolchain/` salvo que el paso lo pida explícitamente.
        - NO reformat, NO refactors, NO renames.
        - Cambios mínimos, y siempre con evidencia (`path:line` o match exacto).
    3) Salida exigida: evidencia + patch/diff o archivo generado + checklist de verificación.

---

## Fase 1 — Instalar TODA la toolchain útil en `tools_local/` y comprobar que corre (antes de decidir nada)

### 1.1 Crear sandbox de toolchain (NO tocar `package.json`/`node_modules` de la raíz)

Ruta estándar (local, no versionada):

* `tools_local/deadcode_toolchain/`

PowerShell (desde la raíz del repo):

```powershell
mkdir tools_local\deadcode_toolchain -Force | Out-Null
cd tools_local\deadcode_toolchain
npm init -y
npm i -D knip depcheck madge eslint
npm i -D eslint-plugin-import eslint-plugin-unused-imports eslint-plugin-n
```

Hard gate (seguridad repo):

* Verifica que `tools_local/**` esté excluido de Git (por política del repo).
* Crea `tools_local/deadcode_toolchain/.gitignore` con:

  * `node_modules/`
  * `.cache/`
  * `*.log`
  * `package-lock.json`

Notas críticas:

* Esto crea `node_modules/` **solo** dentro de `tools_local/deadcode_toolchain/`.
* El root del repo debe quedar **intacto**: sin devDependencies nuevas, sin lockfiles nuevos, sin scripts nuevos.

### 1.2 Confirmar que no rompes nada sólo por instalar

Ejecuta tu ciclo normal de arranque/build. Criterio:

* Instalar herramientas en `tools_local/` **no debe cambiar runtime**.
* Si cambia, es un problema de entorno o de archivos fuera de `tools_local/`, no de dead code.

### 1.3 Añadir ejecución repetible (en el `package.json` del sandbox, NO en la raíz)

Edita `tools_local/deadcode_toolchain/package.json` y agrega:

```json
{
  "scripts": {
    "dead:lint": "eslint --config eslint.config.cjs --ext .js ../..",
    "dead:knip": "knip --config knip.json --directory ../..",
    "dead:madge": "madge --circular --extensions js,mjs,cjs ../../electron/main.js",
    "dead:depcheck": "depcheck ../.."
  }
}
```

Notas:

* `../..` se asume como “root del repo” visto desde `tools_local/deadcode_toolchain/`.
* Toda config de herramientas vive bajo `tools_local/deadcode_toolchain/`.

### 1.4 Crear config mínima de ESLint en el sandbox

Crea `tools_local/deadcode_toolchain/eslint.config.cjs` con una base mínima orientada a “dead code local”, sin depender de config del root:

```js
// tools_local/deadcode_toolchain/eslint.config.cjs
const importPlugin = require("eslint-plugin-import");
const unusedImports = require("eslint-plugin-unused-imports");
const nPlugin = require("eslint-plugin-n");

module.exports = [
  {
    files: ["**/*.js"],
    ignores: [
      "node_modules/**",
      "tools_local/**",
      "config/**",
      "build-output/**"
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script"
    },
    plugins: {
      import: importPlugin,
      "unused-imports": unusedImports,
      n: nPlugin
    },
    rules: {
      "no-unused-vars": ["warn", { args: "after-used", ignoreRestSiblings: true }],
      "unused-imports/no-unused-imports": "warn",
      "unused-imports/no-unused-vars": ["warn", { args: "after-used", argsIgnorePattern: "^_" }],
      "no-unreachable": "warn",
      "no-constant-condition": ["warn", { checkLoops: false }]
    }
  }
];
```

---

## Fase 2 — Calibrar entry points y knip para TU Electron (si fallas aquí, todo lo demás se contamina)

**Problema real del repo:** múltiples procesos + múltiples HTML + múltiples scripts por `<script>` (sin imports).
**Consecuencia:** knip debe alimentarse con **entry points reales**, no “supuestos”.

### 2.1 Inventariar entry points reales (determinista)

Construye una lista de entradas por dos fuentes:

#### Fuente 1: Ventanas (main process)

En `electron/main.js`, localizar cada:

* `new BrowserWindow(...)` asociado a un preload (`preload: ...`)
* `win.loadFile(".../public/<x>.html")` o equivalente

Salida esperada: pares `{ html, preload }` por ventana.

#### Fuente 2: Scripts cargados por HTML (renderer)

Para cada HTML en `public/*.html`:

* lista todos los `<script src="...">` (incluye `public/js/*.js` y `public/*.js`)

Salida esperada: conjunto completo de archivos JS “top-level” que el navegador carga sin imports.

### 2.2 (Codex) Generar la lista con evidencia (recomendado)

**Prompt para Codex (solo para inventario y evidencia; sin cambios de código):**

```text
Repo context (Electron):
- main: electron/main.js
- multiple preloads: electron/preload.js, electron/*_preload.js
- multiple HTML windows in public/*.html loaded via BrowserWindow.loadFile(...)
- renderer JS is NOT only imports: HTML loads scripts via <script src>, especially public/js/*.js
- tools_local/** is local-only; do not touch anything outside tools_local/deadcode_toolchain/

Task (NO code changes):
1) Enumerate all BrowserWindow creations in electron/main.js and map each window to:
   - html file path loaded (loadFile/loadURL)
   - preload file path used
   Provide file+line evidence for each mapping.
2) For each public/*.html, extract all <script src="..."> and list the referenced JS files.
   Provide file+line evidence for each.
Output:
- an evidence table (path:line -> why it's an entry)
```

### 2.3 Construir `tools_local/deadcode_toolchain/knip.json` con esas entradas

Guarda este archivo como `tools_local/deadcode_toolchain/knip.json`.
Las rutas dentro de `entry` deben ser **relativas al root del repo**, porque knip se ejecuta con `--directory ../..`.

Modelo base (ajústalo estrictamente a tu evidencia):

```json
{
  "entry": [
    "electron/main.js",
    "electron/preload.js",
    "electron/language_preload.js",
    "electron/editor_preload.js",
    "electron/preset_preload.js",
    "electron/flotante_preload.js",
    "public/renderer.js",
    "public/flotante.js",
    "public/editor.js",
    "public/preset_modal.js",
    "public/js/constants.js",
    "public/js/notify.js",
    "public/js/menu_actions.js",
    "public/js/i18n.js",
    "public/js/presets.js",
    "public/js/count.js",
    "public/js/format.js",
    "public/js/crono.js"
  ],
  "project": ["**/*.js"],
  "ignore": [
    "node_modules/**",
    "build-output/**",
    "config/**",
    "tools_local/**"
  ]
}
```

**Criterio de calibración (hard gate):**

* Si knip marca como “unused” un archivo que sabes que se carga por HTML o como preload real, tu `entry` está incompleto.
* No avanzas a Fase 3 hasta que knip deje de producir falsos positivos groseros.

### 2.4 (Codex) Escribir `knip.json` en el sandbox (si quieres automatizar el paso)

```text
Task:
Using the evidence table previously produced, write knip.json under:
tools_local/deadcode_toolchain/knip.json
Constraints:
- DO NOT modify any other files.
- Keep entries relative to repo root (because knip runs with --directory ../..).
Output:
- the exact knip.json content
- a short rationale for each entry group (main/preloads/html scripts)
```

---

## Fase 3 — Barrido estático completo + construcción del Dead Code Ledger (evidencia primero)

### 3.1 Ejecutar herramientas (en este orden) y guardar outputs

Ejecuta:

```bash
npm --prefix tools_local/deadcode_toolchain run dead:lint
npm --prefix tools_local/deadcode_toolchain run dead:knip
npm --prefix tools_local/deadcode_toolchain run dead:madge
npm --prefix tools_local/deadcode_toolchain run dead:depcheck
```

Recomendación operativa (para evidencia): redirige cada salida a un archivo de log en `tools_local/deadcode_toolchain/out/` (crea la carpeta si no existe), para que el ledger cite “exactamente qué dijo la herramienta”.

### 3.2 Construir un ledger único (formato obligatorio)

Crea `docs/cleanup/DeadCodeLedger.md` (o tabla/CSV si prefieres). Cada entrada:

* `ID`: DC-0001…
* `Tipo`: A(Local) / B(Export|File) / C(Contrato) / D(Fallback)
* `Path:líneas`
* `Herramienta`: eslint | knip | madge | depcheck | grep
* `Evidencia estática mínima`:

  * referencia exacta de tool output (idealmente: archivo log + fragmento)
  * `rg` (conteo repo-wide) cuando aplique
* `Riesgo`: LOW / MED / HIGH
* `Acción`: DELETE | INLINE | MERGE | REMOVE-CONTRACT | REPLACE-FALLBACK
* `Paquete de eliminación`: Batch-01, Batch-02…

### 3.3 Integrar contratos (estático) dentro del ledger (en esta fase, todavía sin dinámico)

Porque **knip/eslint no “entienden” contratos por strings**, agrega secciones de contrato al ledger:

* **IPC defined (main):** `ipcMain.handle/on('...')`
* **IPC used (renderer/preload):** `ipcRenderer.invoke/send/on('...')`
* **Menu/command IDs:** donde se definan/usen (p.ej. `public/js/menu_actions.js`, `electron/menu_builder.js`)
* **Persistencia:** nombres de archivos JSON y keys principales (p.ej. en `electron/fs_storage.js`, `electron/settings.js`)
* **i18n keys:** keys presentes en `i18n/*/*.json` vs usos (si hay `t('...')` u otro wrapper)
* **DOM hooks:** `getElementById/querySelector` con IDs/clases críticos

Esto **no borra nada**; es inventario para prevenir falsos “unused”.

### 3.4 (Codex) Convertir outputs en un primer borrador de ledger (acelera mucho)

```text
Input:
- tool outputs: eslint, knip, madge, depcheck (paste or point to log files)
- repo structure: electron/*, public/*, public/js/*, i18n/*, config generated
Task:
Create/Update docs/cleanup/DeadCodeLedger.md with entries grouped into:
A) locals (eslint)
B) unused exports/files (knip + madge signals)
C) contract surfaces (IPC/menu/persistence/i18n/DOM) with static evidence
D) fallback patterns (silent catch/noop/silent defaults)
For each entry include: path:line, evidence snippet, risk, proposed batch.
Constraints:
- No code changes.
- Do not modify root package.json/node_modules/lockfiles.
- Do not write tool configs outside tools_local/deadcode_toolchain/.
Output:
- the full ledger content (ready to paste)
```

---

## Fase 4 — Dinámico focalizado (solo Clase C: contratos) para cerrar “used vs defined”

El dinámico aquí no es “observabilidad total”; es un **censo mínimo** para evitar romper IPC/menús por error.

### 4.1 Instrumentación mínima detrás de flag (temporal o permanente, pero desactivada por defecto)

Añade logging *condicional* (ej. `process.env.DEADCODE_AUDIT === "1"`) para recolectar sets:

* IPC: registrar **handlers ejecutados** y **canales invocados**
* Menús: registrar **comandos despachados** y **handlers resueltos**
* Persistencia: registrar **keys leídas/escritas**
* i18n: registrar **keys consultadas** (si hay función central)

**Salida requerida:** al final del run, imprimir sets:

* `IPC_DEFINED`, `IPC_USED`
* `MENU_DEFINED`, `MENU_USED`
* (opcional) `SETTINGS_KEYS_USED`, `I18N_KEYS_USED`

### 4.2 Smoke test con flag

Ejecuta tu smoke test con `DEADCODE_AUDIT=1` y guarda el log como evidencia.

### 4.3 Regla de decisión para contratos

Un contrato (IPC/menu/key) entra a borrado **solo si**:

* No tiene referencias estáticas razonables (o es unidireccional tipo “definido pero no usado”)
* **y** no aparece en `*_USED` durante smoke test

### 4.4 (Codex) Implementar instrumentación con dif mínimo (recomendado)

```text
Context:
Electron app; contracts are strings (IPC/menu/persistence/i18n).
Task:
Implement DEADCODE_AUDIT instrumentation that collects and prints:
- IPC_DEFINED / IPC_USED
- MENU_DEFINED / MENU_USED
Optionally: SETTINGS_KEYS_USED / I18N_KEYS_USED
Constraints:
- Minimal diff. No refactors. No formatting.
- Instrumentation must be behind process.env.DEADCODE_AUDIT === "1".
- Do not touch tools_local/** (except logs) and do not change root package.json/node_modules/lockfiles.
Output:
- patch/diff
- where to run and what output to expect
```

---

## Fase 5 — Eliminación en batches (máxima eficiencia, mínimo riesgo)

### 5.1 Orden estricto de eliminación (optimiza rendimiento y minimiza regresión)

#### Batch 1: ESLint LOW (Clase A)

* unused imports
* unused vars/params
* unreachable obvious

**Expectativa:** casi cero riesgo.

#### Batch 2: knip LOW/MED (Clase B: unused exports)

* exports marcados por knip, revisando side-effects por lectura rápida

**Regla:** si el archivo tiene side-effects (listeners, init), sube a MED/HIGH.

#### Batch 3: knip LOW/MED (Clase B: unused files)

* archivos marcados unused **que no estén en entry list** y no estén cargados por HTML

#### Batch 4: depcheck (dependencias)

* eliminar dependencias confirmadas muertas

**Regla:** si se usa en build/runtime indirecto, no se toca sin evidencia.

#### Batch 5: Contratos HIGH confirmados (Clase C)

* borrar end-to-end: si borras un IPC, borras:

  * el `ipcMain.handle/on`
  * el `ipcRenderer.invoke/send/on`
  * el puente en preload si existía

**Regla:** un contrato por commit o por micro-lote coherente.

#### Batch 6: Fallbacks “invisibilizadores” (Clase D)

* reemplazar silencios por error explícito o señal visible (según tu política)
* eliminar fallback legacy si su única función era “ocultar”

### 5.2 Gate de verificación por batch (obligatorio)

Para cada Batch-N:

1. aplicar cambios **solo** a entradas listadas en el ledger para ese batch
2. smoke test estándar
3. si falla: revert inmediato y anotar en ledger “NO eliminar; razón: …”
4. commit por batch (o micro-batch coherente), con mensaje explícito y referencia a DC-IDs

### 5.3 (Codex) Implementación por batch con trazabilidad ledger→diff

```text
Context:
Electron app with multiple windows and multiple preloads. Renderer uses HTML <script src> (not just imports).
Constraints:
- Minimal diff, no reformatting, no renames
- Do not touch anything outside the explicit batch scope
- Do not touch tools_local/** except for tool outputs (logs) if needed
- Remove only items listed in Batch-N from the ledger
Task:
Implement Batch-N removals. For each change, cite the ledger entry (DC-####) and the exact path:line.
Output:
- patch/diff
- list of files changed
- verification checklist (smoke test steps)
```

---

## Resultado esperado (si sigues el orden)

* Ronda 1 (ESLint + knip calibrado): elimina gran volumen de dead code con bajo riesgo.
* Ronda 2 (contratos con evidencia dinámica): elimina legacy real sin romper IPC/menús.
* Ronda 3 (fallbacks): dejas de ocultar fallas de manera controlada y explícita.

---

## Punto único donde se ganan o se pierden semanas

**La calibración de entry points (Fase 2)**. En tu repo, si no modelas:

* múltiples `loadFile(...)` de ventanas
* múltiples preloads
* y scripts por `<script src>` en HTML

entonces “unused” será ruido y te hará borrar cosas vivas.

Este plan está construido para que eso no ocurra.
