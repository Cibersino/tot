# Legal baseline — Release gate (operativo)

Este documento es un checklist/inventario para decidir si un artefacto empaquetado es
**legalmente redistribuible**. No guarda “deltas”; el resultado y evidencia se guardan
fuera del repo (snapshot externo).

Fecha: `2026-02-11`
Tag objetivo (GitHub): `0.1.3`
Commit freeze (Git): `c6e554c18b9bc235c56d1e659ce1ad33caef32bd`
Artefacto inspeccionado: `toT-0.1.3-win-x64.zip`
SHA256(artefacto): `69F7FB7B083376C20E022C09A357CDBEEB2890925C543F8FF9EBFDB142D5BA98`

Estados:
* **PASS**: OK publicar el artefacto inspeccionado.
* **PENDING**: falta completar inventario o ejecutar un check.
* **BLOCKER**: incumplimiento objetivo (no publicar).

---

## 1) Veredicto

Ship Gate (repo/inventario): `PASS`  
Post-packaging Gate (artefacto): `PASS`  
Veredicto final: `PASS`

Notas (solo si afectan decisión):
* `none`

---

# SHIP GATE (app no empaqueada)

```pwsh
npm start
```

Objetivo: dejar inventariado lo redistribuido y lo externo; y asegurar que los notices/docs
necesarios existan en el repo antes de generar el artefacto final.

## 2) Inventario — Servicios externos (lista efectiva)

Completar con la lista real de este release. Si aparece algo nuevo: marcar **PENDING** y agregarlo a la lista.

Checklist:
* [PASS] Lista efectiva de servicios/endpoints usados por el build:

  * Updater check:
    * `https://api.github.com/repos/Cibersino/tot/releases/latest`
  * Download (abre navegador):
    * `https://github.com/Cibersino/tot/releases/latest`

  * Otros servicios/endpoints (si existen):
    * `none`

* [PASS] Confirmar: no hay credenciales embebidas (tokens/keys/BasicAuth/URLs con user:pass).

* [PASS] Host allowlist efectiva (si existe mecanismo de allowlist en main, `electron\link_openers.js`):
  * `github.com`
  * `www.github.com`
  * `api.github.com`
  * `raw.githubusercontent.com`
  * `doi.org`
  * Otros (si existen):
    * `none`

Resultado Ship Gate (servicios): `PASS`

---

## 3) Inventario — Material redistribuido (terceros)

Completar con lo que efectivamente va dentro del build (fuentes, assets, runtime notices, etc.).

### 3.1 Fonts redistribuidas (lista efectiva)
Checklist:
* [PASS] Fonts redistribuidas y su archivo de licencia/notice incluido en repo:
  * `Baskervville` — `public/fonts/LICENSE_Baskervville_OFL.txt`
  * Otras (si existen):
    * `none`

Resultado Ship Gate (fonts): `PASS`

### 3.2 Assets redistribuidos (lista efectiva)
Checklist:
* [PASS] Assets redistribuidos que NO sean 100% propios (si es todo propio, declararlo explícitamente):

  * `public/assets/**` — estado:
    * `[x] Todo propio (sin obligaciones adicionales)`
    * `[ ] Incluye terceros (listar abajo)`

  * Terceros (si existen):
    * `none`

Resultado Ship Gate (assets): `PASS`

### 3.3 Runtime notices (lista efectiva)
Checklist:
* [PASS] Runtime notices que deben distribuirse con el artefacto:

  * `LICENSE.electron.txt`
  * `LICENSES.chromium.html`

Resultado Ship Gate (runtime notices): `PASS`

---

## 4) Inventario — Dependencias runtime (si existen en el build)

Este punto no asume “no hay deps”. Se verifica y se registra.

Checklist:
* [PASS] Modelo esperado para este release (marcar uno):
  * [x] “No hay node_modules runtime (solo runtime Electron + app.asar)”
  * [ ] “Sí hay node_modules runtime” (listar abajo)

* [PASS] Si hay node_modules runtime: listar top-level (nombre + versión + licencia/notice en repo):
  * `none`

Resultado Ship Gate (deps runtime): `PASS`

---

## 5) Documentos legales entregados al usuario (lista efectiva)

Aquí se define el set de docs que el artefacto debe incluir. Si aparece un tercero nuevo que exige notice,
se agrega a esta lista (eso es **PENDING**, no BLOCKER por sí mismo).

Checklist:
* [PASS] Lista efectiva de documentos a incluir en el artefacto:

  * `LICENSE`
  * `PRIVACY.md`
  * `LICENSE.electron.txt`
  * `LICENSES.chromium.html`
  * Licencias/notices de fonts redistribuidas:
    * `public/fonts/LICENSE_Baskervville_OFL.txt` (si Baskervville va incluida)
    * Otras (si existen):
      * `none`
  * Notices adicionales (si se incorporaron terceros que lo requieran):
    * `none`

* [PASS] `public/info/acerca_de.html` (o equivalente visible en UI): confirmar que **menciona** a los documentos anteriores (licencias/privacidad/notices) de forma consistente con el inventario.
  * Nota: En la app no empaquetada la UI no dirige todos los links a su sitio correcto.
  
Resultado Ship Gate (docs): `PASS`

---

**Resultado final Ship Gate:** `PASS`

---

# POST-PACKAGING GATE (sobre el artefacto final)

Objetivo: validar el artefacto real y cerrar la pregunta legal de redistribución.

## 6) Inspección del artefacto (contenido)

Checklist:
* [PASS] Confirmar ausencia de material no distribuible:
  * `tools_local/` o equivalentes
  * backups, evidence folders, dumps
  * `.env`, tokens, logs de dev, llaves
* [PASS] Registrar evidencia mínima (snapshot externo): listado/árbol de `resources/` y raíz del zip/installer.

Resultado Post-packaging (contenido): `PASS`

---

## 7) Verificación de dependencias runtime efectivas (en artefacto)

Checklist:
* [PASS] Verificar y registrar (snapshot externo) si existe alguno:
  * `resources/app.asar/node_modules/**`
  * `resources/app.asar.unpacked/**`
  * `resources/app/node_modules/**`

* [PASS] Si existen deps runtime: listar top-level real y verificar que está cubierto por §4 y §5.

Resultado Post-packaging (deps efectivas): `PASS`

---

## 8) Verificación de documentos legales (contra §5)

Checklist:
* [PASS] Cada documento listado en §5 está presente en el artefacto final.
* [PASS] Verificar accesibilidad práctica: el usuario **puede abrirlos** (por UI o por ubicación clara en el zip).

Resultado Post-packaging (docs presentes): `PASS`

---

## 9) Servicios externos (sanity en artefacto)

Checklist:
* [PASS] Confirmar que los endpoints/hosts usados en el build empaquetado coinciden con el inventario de §2.
* [PASS] Si aparece conectividad nueva: volver a §2 (estado pasa a PENDING hasta inventariar y cubrir obligaciones).

Resultado Post-packaging (servicios): `PASS`

---

**Resultado final Post-packaging Gate:** `PASS`

---

## 10) Reglas únicas de decisión (sin redundancia)

**Veredicto final = PASS** solo si:
* Ship Gate = PASS, y
* Post-packaging Gate = PASS sobre el artefacto inspeccionado.

**BLOCKER** (no publicar) si se cumple cualquiera:
* Hay un tercero redistribuido (font/asset/dep runtime) sin licencia/notice identificable y redistribuible.
* Falta en el artefacto cualquier documento listado en §5.
* Hay credenciales/secrets embebidos en repo o en artefacto.
* El artefacto incluye material sensible/no distribuible (tools_local, dumps, .env, etc.).

**PENDING** (no publicar aún) si ocurre cualquiera:
* Aparece algo nuevo (servicio/asset/font/dep) y todavía no está inventariado y cubierto en §2–§5.
* No se ejecutaron los checks del Post-packaging Gate.

Veredicto final: `PASS`

---
