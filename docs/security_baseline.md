# baseline_security.md — Baseline de seguridad para distribuir 0.1.0 (Issue #72)

Date: 2026-01-12  
Project: toT – Reading Meter  
Pregunta única que responde este documento: **¿La app es suficientemente segura para ser distribuida?**

Este baseline está diseñado como **checklist operativo**.  
La app solo se considera “suficientemente segura para distribuir 0.1.0” si:
1) **Todo el Ship Gate (repo/código + configuración de release) está en PASS**, y  
2) **Todo el Post-packaging Gate (artefacto empaquetado) está en PASS**.

Leyenda:
- **[PASS]** Cumple.
- **[BLOCKER]** No cumple: bloquea distribución.
- **[PENDING]** No verificado aún, pero es requisito para distribuir (bloquea hasta ejecutar el check).
- **[N/A]** No aplica al modelo 0.1.0 (no se usa; si aparece, es un incidente).

---

## 1) Veredicto (0.1.0)

**Veredicto actual:** **PASS (OK distribuir 0.1.0).**

Estado por gate:
- **Ship Gate (repo/código + release hygiene):** **PASS**
  - Postura de seguridad del runtime: **PASS** (secciones 2–9)
  - Release hygiene (sección 10): **PASS**
- **Post-packaging Gate (artefacto build):** **PASS** (ejecutado sobre el zip final)

Notas:
- Este veredicto aplica **solo** al artefacto inspeccionado. Si se re-empaqueta, se debe re-ejecutar el Post-packaging Gate.

---

## 2) Threat model mínimo (0.1.0) — Ship Gate

**Objetivo práctico:** impedir escalamiento renderer → OS y acotar entradas no confiables.

Checklist:
- [PASS] Renderer (DOM + JS) se trata como **no confiable**.
- [PASS] Proceso main es el **punto de enforcement** (política).
- [PASS] Preloads son el **único puente** entre renderer y capacidades privilegiadas.
- [PASS] La app no depende de cargar contenido remoto arbitrario para operar.

---

## 3) BrowserWindow posture — Ship Gate

**Invariantes requeridas en todas las ventanas** (main / editor / preset / language / flotante):

Checklist:
- [PASS] `contextIsolation: true`
- [PASS] `nodeIntegration: false`
- [PASS] `sandbox: true`
- [PASS] No se usa `enableRemoteModule` (N/A en Electron moderno; si aparece: incidente).
- [PASS] No hay `webview` embebidos (`webviewTag` / `<webview>`): N/A esperado.
- [PASS] No se navega a contenido remoto para renderizar UI (modelo local-only).

Criterio de bloqueo:
- Cualquier cambio que deshabilite `sandbox`, habilite `nodeIntegration`, o deshabilite `contextIsolation`.

---

## 4) Preload posture (superficie expuesta) — Ship Gate

Principios operativos:
- API expuesta a renderer debe ser **pequeña, intencional y whitelist-based**.
- Renderer no debe poder invocar capacidades privilegiadas “genéricas” (ej. `invoke(channel, payload)` libre).

Checklist:
- [PASS] Preloads exponen API vía `contextBridge` y no exponen Node a renderer.
- [PASS] Preloads no implementan file I/O, network I/O, ni ejecución dinámica.
- [PASS] Preloads no exponen superficies amplias (por ejemplo, acceso directo a `ipcRenderer` sin wrapper de propósito).
- [PASS] Logging en preload es mínimo; las decisiones de seguridad se aplican en main.

Criterio de bloqueo:
- Cualquier preload que exponga capacidades genéricas que permitan al renderer ampliar superficie (p. ej., “invoke cualquier canal”, “eval”, “require”, “fs”).

---

## 5) IPC posture (trust boundary) — Ship Gate

**IPC es frontera de confianza.** Todo input del renderer es no confiable.

Requisitos mínimos (aplican a canales de impacto: clipboard, texto, presets, apertura de modales, etc.):

Checklist:
- [PASS] Disciplina de esquema (plain object donde corresponde; coerción/normalización de tipos).
- [PASS] Whitelisting de campos (ignorar/dropear campos desconocidos, no “passthrough”).
- [PASS] Size fuses para strings controlables por el renderer (texto, nombres/descripciones, meta).
- [PASS] Sender restriction cuando el canal debe pertenecer a una ventana específica.
- [PASS] Fallos recuperables devuelven `{ ok:false, error, code }` en vez de crashear; acciones manuales dan feedback.

Estado 0.1.0 (hardened surfaces):
- [PASS] Clipboard read bridge: lectura en main, acotada por tamaño, con control de origen.
- [PASS] Ingesta de texto: límites de tamaño + tratamiento seguro de meta.
- [PASS] Presets: creación/edición/borrado con sanitización y límites.
- [PASS] Apertura de preset modal: payload acotado + control de origen.

Criterio de bloqueo:
- Añadir un canal IPC nuevo de impacto sin: whitelist, size fuse y (si aplica) sender guard.

---

## 6) CSP baseline — Ship Gate

Objetivo 0.1.0:
- Reducir probabilidad y blast radius de inyección (XSS/DOM injection) en superficies renderer.
- Evitar que inyección derive en puente privilegiado.

Baseline 0.1.0 (mínimo aceptable):
- `default-src 'self';`
- `script-src 'self';`
- `style-src 'self' 'unsafe-inline';` **(excepción explícita 0.1.0)**
- `object-src 'none';`
- `base-uri 'none';`

Checklist:
- [PASS] CSP presente en **todas** las páginas HTML de ventanas renderer.
- [PASS] `script-src 'self'` (sin fuentes remotas; sin `unsafe-eval`).
- [PASS] No hay `<script>` inline en HTML.
- [PASS] No hay handlers inline tipo `onclick=...`.
- [PASS] Excepción aceptada: `style-src 'unsafe-inline'` por `<style>` existentes.

Justificación de la única excepción (inline styles):
- Se acepta **solo** para estilos. El baseline mantiene scripts restringidos a `'self'` y sin inline scripts, de modo que la excepción no habilita ejecución de código.

Criterio de bloqueo:
- Cualquier necesidad de relajar `script-src` (p. ej. `unsafe-eval`, scripts remotos, o permitir inline scripts).

---

## 7) File boundaries (lectura/escritura) — Ship Gate

Principio:
- Escrituras persistentes acotadas a storage propio de la app (config) con nombres de archivo conocidos.
- Renderer no aporta rutas arbitrarias a operaciones de I/O del main.

Checklist:
- [PASS] Persistencia de usuario confinada a `config/` (settings / current text / window state / cache de presets).
- [PASS] No existe funcionalidad 0.1.0 de “guardar/cargar archivo arbitrario” vía diálogos del sistema.
- [PASS] Entradas no confiables que llegan a persistencia (texto, presets) están acotadas por tamaño y saneo antes de persistir.
- [PASS] Lecturas i18n limitadas al árbol `i18n/` y las claves de idioma se normalizan.

Criterio de bloqueo:
- Introducir rutas controladas por renderer para lectura/escritura sin validación estricta y sin rediseño de seguridad.

---

## 8) Clipboard posture — Ship Gate

Checklist:
- [PASS] Clipboard se trata como input no confiable.
- [PASS] Lectura de clipboard ocurre en main vía IPC bridge.
- [PASS] Payload acotado: si excede el límite permitido, no se transporta (respuesta estructurada “too large” + UX preservada).

Criterio de bloqueo:
- Permitir que renderer lea clipboard directamente o transportar clipboard sin límite de tamaño.

---

## 9) Updater policy — Ship Gate

Modelo aceptado 0.1.0: **actualización dirigida por el usuario**.

Checklist:
- [PASS] El check de versión consulta un endpoint HTTPS fijo (texto de versión).
- [PASS] Si hay update, se solicita consentimiento explícito del usuario.
- [PASS] La acción de “Download” abre el release oficial en navegador externo.
- [PASS] No existe descarga silenciosa de binarios.
- [PASS] No existe ejecución automática de instaladores.
- [PASS] No existe auto-update in-app (download/quitAndInstall/etc.).

Riesgo residual aceptado (0.1.0) y por qué se acepta:
- No hay verificación criptográfica propia de artefactos descargados; se acepta porque la app **no descarga ni ejecuta** nada automáticamente: el update es navegación externa bajo control del usuario.

Criterio de bloqueo:
- Cualquier flujo que descargue/ejecute updates dentro de la app sin una revisión de seguridad separada.

---

## 10) Release hygiene (repo + configuración de release) — Ship Gate

Este bloque es relevante para seguridad de distribución porque controla supply-chain accidental (secrets, material dev, artefactos no intencionados) y configuración de build.

Checklist:
- [PASS] Secret hygiene:
  - No hay llaves/tokens/credenciales hardcodeadas (incluye `.env`, tokens en JS, URLs con credenciales, etc.).
  - No hay archivos de volcado/logs de desarrollo con datos sensibles versionados.
  - Criterio: si se detecta un secreto, es incidente y bloquea publicación hasta rotación/remoción.

- [PASS] Packaging excludes (política “no arrastrar dev”):
  - La configuración de empaquetado excluye explícitamente directorios no distribuibles (mínimo: `tools_local/` y equivalentes).
  - Excluye backups, evidence folders, scripts internos que no sean runtime.

- [PASS] DevTools / Debug hooks (política para build distribuible):
  - En build empaquetado: DevTools **no se abre automáticamente**.
  - En build empaquetado: no existe un menú/atajo propio de la app que abra DevTools salvo modo debug explícito.
  - Nota: que DevTools exista en `npm start` (modo dev) es normal y no es señal de inseguridad del release.

- [PASS] Source maps (si aplica):
  - Decidir y verificar política: si se distribuyen sourcemaps, debe ser intencional.
  - Si no se distribuyen, asegurarse de que no queden `.map` dentro del artefacto.

Criterio de bloqueo:
- Cualquier secreto encontrado en repo o incluido por build.
- `tools_local/` (o equivalentes) no excluido por configuración antes de empaquetar.
- Build empaquetado configurado para abrir DevTools automáticamente (o dejar debug hooks evidentes sin intención).

---

# POST-PACKAGING GATE (obligatorio antes de publicar)

Este gate valida el **artefacto real** a distribuir (installer/zip) y su superficie de supply-chain.  
No re-valida postura de seguridad “en fuente” (IPC/CSP/etc.) salvo en la medida en que el artefacto pueda incluir contenido inesperado o dependencias no intencionadas.

## 11) Dependencias incluidas en el build (solo runtime)

**Bloque de dependencias runtime (lo que se integra en el build):**
- Electron runtime (incluye Node embebido).
- App bundle (p. ej. `app.asar` y/o recursos equivalentes) con:
  - `electron/**` (main + módulos de negocio),
  - `public/**` (renderer),
  - `i18n/**`,
  - `VERSION` u otros assets requeridos.
- `node_modules` **solo** de producción (dependencias necesarias para ejecutar la app; sin devDependencies).

Checklist:
- [PASS] Listado **exacto** de dependencias de producción incluidas en el build (top-level):
  - Enumerar `resources/app.asar/node_modules` o `resources/app/node_modules` y registrar nombres + versiones.
  - Resultado (pegar debajo):
    - No se incluyen dependencias npm de producción en el artefacto (no hay node_modules); runtime = Electron.
- [PASS] Sanity check de vulnerabilidades sobre dependencias de producción (mínimo: verificar ausencia de CVEs críticas conocidas en runtime deps).

Criterio de bloqueo:
- Dependencias inesperadas de runtime o material sensible incluido por error.

## 12) Checklist mínimo post-empaquetado (artefacto final)

Checklist:
- [PASS] Inspeccionar el contenido del artefacto:
  - Confirmar que solo incluye lo esperado (app + recursos + runtime).
  - Confirmar ausencia de archivos sensibles (tokens, llaves, `.env`, dumps, logs de dev).
  - Confirmar ausencia de material de desarrollo no intencionado (herramientas locales, evidence folders, backups).
  - Confirmar que las páginas renderer incluidas corresponden al set esperado (no se incluyen HTML “extra” no revisados).

- [PASS] Smoke “renderer containment” sobre el artefacto:
  - Confirmar que renderer no expone Node (`window.require` / `window.process`).
  - Confirmar que funcionalidades principales operan sin pedir permisos no esperados.

Criterio de bloqueo:
- Cualquier hallazgo de material dev/sensible dentro del artefacto.
- Inclusión de páginas renderer/HTML no esperadas (no revisadas) en el artefacto.
- Señales de escalamiento renderer→Node (por ejemplo, existencia de `window.require`/`window.process` en renderer).

---

## 13) Resultado final (cómo cerrar el veredicto)

La app queda marcada como **“suficientemente segura para distribuir 0.1.0”** únicamente cuando:
- Ship Gate: todo PASS (incluye runtime security posture + release hygiene), y
- Post-packaging Gate: todo PASS (incluyendo dependencias runtime listadas y revisadas).

Veredicto final: **PASS (OK publicar 0.1.0)**.

---
