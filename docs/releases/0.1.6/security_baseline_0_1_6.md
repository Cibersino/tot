# Baseline de seguridad para distribución (por release)

Fecha: `2026-02-19`
Tag objetivo (GitHub): `v0.1.6`
Commit freeze (Git): `cbc2e1610687ae511ad6c39907d3c4825ac99ccf`
Artefacto inspeccionado: `toT-0.1.6-win-x64.zip`
SHA256(artefacto): `2389A93122DE99913A612142EC77A90C152AFD43EB82F28227BC88CB77575052`

Pregunta única que responde este documento: **¿La app es suficientemente segura para ser distribuida en este release?**

Este baseline está diseñado como **checklist operativo** y como “candado” de publicación.  
La app solo se considera “suficientemente segura para distribuir” si:

1) **Todo el Ship Gate (repo/código + configuración de release) está en PASS**, y  
2) **Todo el Post-packaging Gate (artefacto empaquetado) está en PASS**.

Leyenda:
* **[PASS]** Cumple.
* **[BLOCKER]** No cumple: bloquea distribución.
* **[PENDING]** No verificado aún, pero es requisito para distribuir (bloquea hasta ejecutar el check).
* **[N/A]** No aplica al modelo de app. Evitar usarlo; si aparece, justificar explícitamente por qué.

Regla operativa:
* Este baseline aplica **solo** al artefacto inspeccionado. Si se re-empaqueta, se debe re-ejecutar el Post-packaging Gate.
* Este archivo es la **línea base reusable** para releases futuros; cada release debe completar estados/evidencias sobre esta misma estructura.

---

## 1) Veredicto del release

**Veredicto actual:** `PASS`  
**Decisión:** `OK publicar`

Estado por gate:
* **Ship Gate (repo/código + release hygiene):** `PASS`
  * Postura de seguridad del runtime (secciones 2–9): `PASS`
  * Release hygiene (sección 10): `PASS`
* **Post-packaging Gate (artefacto build):** `PASS`

Notas:
* Si el veredicto es PASS, registrar el identificador del artefacto validado (nombre exacto + hash o evidencia equivalente).
* Si el veredicto es BLOCKER/PENDING, registrar el/los ítems bloqueantes y el plan de cierre.
* Registrar siempre el **delta de seguridad** del release (canales IPC nuevos/modificados, ventanas nuevas, cambios CSP, rutas nuevas de persistencia, cambios en updater/enlaces externos).

---

## 2) Threat model mínimo — Ship Gate

**Objetivo práctico:** impedir escalamiento renderer → OS y acotar entradas no confiables.

Checklist:
* [PASS] Renderer (DOM + JS) se trata como **no confiable**.
* [PASS] Proceso main es el **punto de enforcement** (política).
* [PASS] Preloads son el **único puente** entre renderer y capacidades privilegiadas.
* [PASS] La app no depende de cargar contenido remoto arbitrario para operar.

Notas / evidencia:
* Indicar superficies con input no confiable y su control (texto principal, editor, presets, task editor, links externos, snapshots, clipboard).
* Indicar cómo se acota riesgo de inyección/escalamiento (CSP + sandbox + IPC whitelist + restricción de navegación).

---

## 3) BrowserWindow posture — Ship Gate

**Invariantes requeridas en todas las ventanas** (main / editor / task_editor / preset / language / flotante / otras):

Checklist:
* [PASS] `contextIsolation: true`
* [PASS] `nodeIntegration: false`
* [PASS] `sandbox: true`
* [PASS] No se usa `enableRemoteModule` (si aparece: incidente).
* [PASS] No hay `webview` embebidos (`webviewTag` / `<webview>`).
* [PASS] No se desactiva `webSecurity` ni se habilitan flags equivalentes que relajen aislamiento.
* [PASS] No se navega a contenido remoto para renderizar UI (modelo local-first / local-only, salvo excepción explícita documentada).
* [PASS] Existe control explícito de navegación/ventana emergente (`will-navigate`, `setWindowOpenHandler` o control equivalente deny-by-default).

Criterio de bloqueo:
* Cualquier ventana que deshabilite `sandbox`, habilite `nodeIntegration`, o deshabilite `contextIsolation`.
* Falta de control de navegación no deseada en ventanas renderer con contenido interactivo.

Evidencia mínima sugerida:
* Lista exhaustiva de ventanas y dónde se setean `webPreferences` (archivo + referencia aproximada de línea).
* Evidencia del control de navegación/ventanas emergentes y del flujo permitido para salidas externas.

---

## 4) Preload posture (superficie expuesta) — Ship Gate

Principios operativos:
* API expuesta a renderer debe ser **pequeña, intencional y whitelist-based**.
* Renderer no debe poder invocar capacidades privilegiadas “genéricas” (ej. `invoke(channel, payload)` libre).

Checklist:
* [PASS] Preloads exponen API vía `contextBridge` y no exponen Node a renderer.
* [PASS] Preloads no implementan file I/O, network I/O, ni ejecución dinámica.
* [PASS] Preloads no exponen superficies amplias (ej. acceso directo a `ipcRenderer` sin wrapper de propósito).
* [PASS] APIs preload se mantienen separadas por ventana y con propósito explícito (ej. `electronAPI`, `editorAPI`, `taskEditorAPI`, `presetAPI`, `languageAPI`, `flotanteAPI`).
* [PASS] Logging en preload es mínimo; decisiones de seguridad se aplican en main.

Criterio de bloqueo:
* Cualquier preload que exponga capacidades genéricas que permitan al renderer ampliar superficie (p. ej. “invoke cualquier canal”, “eval”, “require”, “fs”).

Evidencia mínima sugerida:
* Enumeración de APIs expuestas (`window.*API`) + lista de métodos y su propósito (por preload).
* Confirmación de que no se expone `ipcRenderer` crudo, `require`, `process`, `fs` o primitivos de ejecución dinámica.

---

## 5) IPC posture (trust boundary) — Ship Gate

**IPC es frontera de confianza.** Todo input del renderer es no confiable.

Requisitos mínimos (aplican a canales de impacto: clipboard, texto, presets, apertura de modales/ventanas, apertura de URLs/docs, etc.):

Checklist:
* [PASS] Disciplina de esquema (plain object donde corresponde; coerción/normalización de tipos).
* [PASS] Whitelisting de campos (ignorar/dropear campos desconocidos; no “passthrough”).
* [PASS] Size fuses para strings controlables por el renderer (texto, nombres/descripciones, meta).
* [PASS] Size fuses cubren también entradas de Task Editor (texto, enlace, comentario y payloads de listas/biblioteca).
* [PASS] Sender restriction cuando el canal debe pertenecer a una ventana específica.
* [PASS] Fallos recuperables devuelven respuesta estructurada `{ ok:false, ... }` y feedback UX cuando aplica.

Mapa de superficies “de impacto” (completar por release, al menos con los canales relevantes):
* [PASS] Clipboard bridge (lectura/escritura si existe): tamaño + control de origen.
* [PASS] Ingesta/edición de texto: límites + tratamiento seguro de meta.
* [PASS] Presets: creación/edición/borrado con sanitización y límites.
* [PASS] Apertura de modales/ventanas: payload acotado + control de origen.
* [PASS] Apertura de enlaces/docs: allowlist + validación + no “open arbitrary”.
* [PASS] Task Editor (listas/biblioteca/enlaces): esquema + sender guard + límites + política de apertura de links/paths.
* [PASS] Snapshots de texto: validación de esquema + contención de ruta + confirmación de sobreescritura.

Criterio de bloqueo:
* Añadir un canal IPC nuevo de impacto sin: whitelist, size fuse y (si aplica) sender guard.

Evidencia mínima sugerida:
* Lista de canales IPC “de impacto” y dónde se registran (archivo + referencia aproximada).
* Para cada canal: shape de request/response y validaciones relevantes.
* Tabla explícita de cambios IPC respecto al release anterior (canal nuevo/modificado/eliminado + riesgo + veredicto).

---

## 6) CSP baseline — Ship Gate

Objetivo:
* Reducir probabilidad y blast radius de inyección (XSS/DOM injection) en superficies renderer.
* Evitar que inyección derive en puente privilegiado.

Baseline mínimo aceptable (ajustar solo con justificación explícita):
* `default-src 'self';`
* `script-src 'self';`
* `style-src 'self' 'unsafe-inline';` **(excepción aceptada solo si está justificada)**
* `object-src 'none';`
* `base-uri 'none';`

Checklist:
* [PASS] CSP presente en **todas** las páginas HTML de ventanas renderer.
* [PASS] CSP presente también en HTMLs informativos/auxiliares (`public/info/*.html` u equivalentes).
* [PASS] `script-src 'self'` (sin fuentes remotas; sin `unsafe-eval`; sin inline scripts).
* [PASS] No hay `<script>` inline en HTML.
* [PASS] No hay handlers inline tipo `onclick=...`.
* [PASS] Si existe `style-src 'unsafe-inline'`, su uso está justificado y acotado (solo estilos).

Criterio de bloqueo:
* Cualquier necesidad de relajar `script-src` (p. ej. `unsafe-eval`, scripts remotos, o permitir inline scripts).

Evidencia mínima sugerida:
* Lista de HTMLs con su CSP (muestra representativa o verificación sistemática).
* Resultado de búsqueda de `<script>` inline / handlers inline y resolución de hallazgos.

---

## 7) File boundaries (lectura/escritura) — Ship Gate

Principio:
* Escrituras persistentes acotadas a storage propio de la app con nombres de archivo conocidos.
* Renderer no aporta rutas arbitrarias a operaciones de I/O del main.

Checklist:
* [PASS] Persistencia de usuario confinada a un directorio controlado por la app (p. ej. `app.getPath('userData')/...`).
* [PASS] No existe lectura/escritura arbitraria por rutas entregadas por renderer (salvo diseño explícito con validación fuerte).
* [PASS] Entradas no confiables que llegan a persistencia (texto, presets) están acotadas por tamaño y saneo antes de persistir.
* [PASS] Rutas seleccionadas por diálogos (`save/open`) se normalizan y confinan al root esperado (p. ej. `tasks/lists`, `saved_current_texts`).
* [PASS] Lecturas i18n limitadas al árbol `i18n/` y las claves/tags se normalizan.

Criterio de bloqueo:
* Introducir rutas controladas por renderer para lectura/escritura sin validación estricta y sin rediseño de seguridad.

Evidencia mínima sugerida:
* Inventario de archivos persistidos esperados (p. ej. `user_settings.json`, `current_text.json`, `presets_defaults/*`, `tasks/*`, `saved_current_texts/*`) + ubicación base + quién puede escribirlos.
* Enumeración de rutas abiertas por diálogos del sistema (si existen) y cómo se validan.

---

## 8) Clipboard posture — Ship Gate

Checklist:
* [PASS] Clipboard se trata como input no confiable.
* [PASS] Lectura/escritura de clipboard ocurre en main vía IPC bridge (no directo en renderer).
* [PASS] Payload acotado: si excede el límite permitido, no se transporta (respuesta estructurada + UX preservada).

Criterio de bloqueo:
* Permitir que renderer lea clipboard directamente o transportar clipboard sin límite de tamaño.

Evidencia mínima sugerida:
* Canales IPC de clipboard + sender restriction (si aplica) + size fuse.

---

## 9) Updater policy — Ship Gate

Modelo recomendado: **actualización dirigida por el usuario** (user-driven).

Checklist:
* [PASS] El check de versión consulta un endpoint HTTPS fijo y conocido (documentar cuál).
* [PASS] Si hay update, se solicita consentimiento explícito del usuario.
* [PASS] La acción de “Download” abre el release oficial en navegador externo (o flujo equivalente bajo control del usuario).
* [PASS] Endpoint de check y URL de descarga no son controlables por renderer.
* [PASS] No existe descarga silenciosa de binarios.
* [PASS] No existe ejecución automática de instaladores.
* [PASS] No existe auto-update in-app (download/quitAndInstall/etc.).

Riesgo residual (completar si aplica):
* [PASS] Si no hay verificación criptográfica propia de artefactos, justificar por qué el modelo de updater no descarga/ejecuta automáticamente.

Criterio de bloqueo:
* Cualquier flujo que descargue/ejecute updates dentro de la app sin una revisión de seguridad separada.

Evidencia mínima sugerida:
* Endpoint usado + decisión de UX + confirmación de que no existe auto-update.
* Referencias de código del handler IPC y del flujo de confirmación UX.

---

## 10) Release hygiene (repo + configuración de release) — Ship Gate

Este bloque es relevante para seguridad de distribución porque controla supply-chain accidental (secrets, material dev, artefactos no intencionados) y configuración de build.

Checklist:
* [PASS] Secret hygiene:
  * No hay llaves/tokens/credenciales hardcodeadas (incluye `.env`, tokens en JS, URLs con credenciales, etc.).
  * No hay archivos de volcado/logs de desarrollo con datos sensibles versionados.
  * Si se detecta un secreto: incidente y bloquea publicación hasta rotación/remoción.

* [PASS] Packaging excludes (política “no arrastrar dev”):
  * La configuración de empaquetado usa allowlist estricta de runtime (`build.files`) o excludes explícitos equivalentes.
  * Quedan fuera directorios no distribuibles (mínimo: `tools_local/` y equivalentes).
  * Excluye backups, evidence folders, scripts internos que no sean runtime.

* [PASS] DevTools / Debug hooks (política para build distribuible):
  * En build empaquetado: DevTools **no se abre automáticamente**.
  * En build empaquetado: no existe un menú/atajo propio de la app que abra DevTools salvo modo debug explícito y deliberado.
  * Nota: DevTools en modo dev es normal.

* [PASS] Source maps (si aplica):
  * Política intencional: distribuir o no distribuir `.map`.
  * Verificar cumplimiento (no `.map` accidentales si la política es “no”).

Criterio de bloqueo:
* Cualquier secreto encontrado en repo o incluido por build.
* `tools_local/` (o equivalentes) no excluido por configuración antes de empaquetar.
* Build empaquetado configurado para abrir DevTools automáticamente o dejar debug hooks no intencionales.

Evidencia mínima sugerida:
* Comandos/outputs usados para verificar (p. ej. grep de secretos, inspección de config build, etc.).
* Resumen de archivos efectivamente incluidos por configuración de empaquetado.

---

# POST-PACKAGING GATE (obligatorio antes de publicar)

Este gate valida el **artefacto real** a distribuir (installer/zip) y su superficie de supply-chain.  
No re-valida postura de seguridad “en fuente” (IPC/CSP/etc.) salvo en la medida en que el artefacto incluya contenido inesperado o dependencias no intencionadas.

## 11) Dependencias incluidas en el build (solo runtime)

**Bloque de dependencias runtime (lo que se integra en el build):**
* Runtime (Electron + Chromium + Node embebido).
* App bundle (p. ej. `app.asar` y/o recursos equivalentes).
* `node_modules` solo de producción (si corresponde; si no hay, declararlo explícitamente).

Checklist:
* [PASS] Listado exacto de dependencias de producción incluidas en el build (top-level):
  * Confrontar lo incluido en artefacto contra `package.json` (`dependencies`) y contra el runtime esperado de Electron.
  * Enumerar `resources/app.asar/node_modules` o ruta equivalente y registrar nombres + versiones.
  * Resultado (pegar debajo):
    * `no hay node_modules en artefacto>`

* [PASS] Sanity check de vulnerabilidades sobre dependencias runtime (mínimo: ausencia de CVEs críticas conocidas en deps incluidas o justificación/mitigación si existen).

Criterio de bloqueo:
* Dependencias inesperadas de runtime o material sensible incluido por error.

---

## 12) Checklist mínimo post-empaquetado (artefacto final)

Checklist:
* [PASS] Inspección de contenido del artefacto:
  * Confirmar que solo incluye lo esperado (app + recursos + runtime).
  * Confirmar ausencia de archivos sensibles (tokens, llaves, `.env`, dumps, logs de dev).
  * Confirmar ausencia de material de desarrollo no intencionado (herramientas locales, evidence folders, backups).
  * Confirmar que las páginas renderer incluidas corresponden al set esperado (main/editor/task_editor/preset/language/flotante/info u otras explícitamente aprobadas).

* [PASS] Smoke “renderer containment” sobre el artefacto:
  * Confirmar que renderer no expone Node (`window.require` / `window.process`).
  * Confirmar que funcionalidades principales operan sin pedir permisos no esperados.
  * Confirmar que navegación externa no controlada queda bloqueada (solo flujos permitidos vía main/allowlist).

Criterio de bloqueo:
* Cualquier hallazgo de material dev/sensible dentro del artefacto.
* Inclusión de páginas renderer/HTML no esperadas (no revisadas) en el artefacto.
* Señales de escalamiento renderer→Node (existencia de `window.require`/`window.process` en renderer).

Evidencia mínima sugerida:
* Evidencia de inspección (lista de archivos o capturas del árbol) + prueba mínima de “no Node en renderer”.

---

## 13) Resultado final (cómo cerrar el veredicto)

La app queda marcada como **“suficientemente segura para distribuir este release”** únicamente cuando:
* Ship Gate: todo PASS (incluye runtime security posture + release hygiene), y
* Post-packaging Gate: todo PASS (incluyendo dependencias runtime listadas y revisadas).

Veredicto final: `PASS`  
Artefacto validado: `toT-0.1.6-win-x64.zip`

---
