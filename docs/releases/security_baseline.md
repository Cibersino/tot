# Baseline de seguridad para distribución (por release)

Fecha: `<YYYY-MM-DD>`
Tag objetivo (GitHub): `v<MAJOR.MINOR.PATCH>`
Commit freeze (Git): `<SHA_COMMIT>`
Artefacto inspeccionado: `<ZIP/INSTALLER>`
SHA256(artefacto): `<SHA256>`

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

**Veredicto actual:** `<PASS | BLOCKER | PENDING>`  
**Decisión:** `<OK publicar | NO publicar>`

Estado por gate:
* **Ship Gate (repo/código + release hygiene):** `<PASS | BLOCKER | PENDING>`
  * Postura de seguridad del runtime (secciones 2–9): `<PASS | BLOCKER | PENDING>`
  * Release hygiene (sección 10): `<PASS | BLOCKER | PENDING>`
* **Post-packaging Gate (artefacto build):** `<PASS | BLOCKER | PENDING>`

Notas:
* Si el veredicto es PASS, registrar el identificador del artefacto validado (nombre exacto + hash o evidencia equivalente).
* Si el veredicto es BLOCKER/PENDING, registrar el/los ítems bloqueantes y el plan de cierre.
* Registrar siempre el **delta de seguridad** del release (canales IPC nuevos/modificados, ventanas nuevas, cambios CSP, rutas nuevas de persistencia, cambios en updater/enlaces externos).

---

## 2) Threat model mínimo — Ship Gate

**Objetivo práctico:** impedir escalamiento renderer → OS y acotar entradas no confiables.

Checklist:
* [PENDING] Renderer (DOM + JS) se trata como **no confiable**.
* [PENDING] Proceso main es el **punto de enforcement** (política).
* [PENDING] Preloads son el **único puente** entre renderer y capacidades privilegiadas.
* [PENDING] La app no depende de cargar contenido remoto arbitrario para operar.

Notas / evidencia:
* Indicar superficies con input no confiable y su control (texto principal, editor, presets, task editor, links externos, snapshots, clipboard).
* Indicar cómo se acota riesgo de inyección/escalamiento (CSP + sandbox + IPC whitelist + restricción de navegación).

---

## 3) BrowserWindow posture — Ship Gate

**Invariantes requeridas en todas las ventanas** (main / editor / task_editor / preset / language / flotante / otras):

Checklist:
* [PENDING] `contextIsolation: true`
* [PENDING] `nodeIntegration: false`
* [PENDING] `sandbox: true`
* [PENDING] No se usa `enableRemoteModule` (si aparece: incidente).
* [PENDING] No hay `webview` embebidos (`webviewTag` / `<webview>`).
* [PENDING] No se desactiva `webSecurity` ni se habilitan flags equivalentes que relajen aislamiento.
* [PENDING] No se navega a contenido remoto para renderizar UI (modelo local-first / local-only, salvo excepción explícita documentada).
* [PENDING] Existe control explícito de navegación/ventana emergente (`will-navigate`, `setWindowOpenHandler` o control equivalente deny-by-default).

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
* [PENDING] Preloads exponen API vía `contextBridge` y no exponen Node a renderer.
* [PENDING] Preloads no implementan file I/O, network I/O, ni ejecución dinámica.
* [PENDING] Preloads no exponen superficies amplias (ej. acceso directo a `ipcRenderer` sin wrapper de propósito).
* [PENDING] APIs preload se mantienen separadas por ventana y con propósito explícito (ej. `electronAPI`, `editorAPI`, `taskEditorAPI`, `presetAPI`, `languageAPI`, `flotanteAPI`).
* [PENDING] Logging en preload es mínimo; decisiones de seguridad se aplican en main.

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
* [PENDING] Disciplina de esquema (plain object donde corresponde; coerción/normalización de tipos).
* [PENDING] Whitelisting de campos (ignorar/dropear campos desconocidos; no “passthrough”).
* [PENDING] Size fuses para strings controlables por el renderer (texto, nombres/descripciones, meta).
* [PENDING] Size fuses cubren también entradas de Task Editor (texto, enlace, comentario y payloads de listas/biblioteca).
* [PENDING] Sender restriction cuando el canal debe pertenecer a una ventana específica.
* [PENDING] Fallos recuperables devuelven respuesta estructurada `{ ok:false, ... }` y feedback UX cuando aplica.

Mapa de superficies “de impacto” (completar por release, al menos con los canales relevantes):
* [PENDING] Clipboard bridge (lectura/escritura si existe): tamaño + control de origen.
* [PENDING] Ingesta/edición de texto: límites + tratamiento seguro de meta.
* [PENDING] Presets: creación/edición/borrado con sanitización y límites.
* [PENDING] Apertura de modales/ventanas: payload acotado + control de origen.
* [PENDING] Apertura de enlaces/docs: allowlist + validación + no “open arbitrary”.
* [PENDING] Task Editor (listas/biblioteca/enlaces): esquema + sender guard + límites + política de apertura de links/paths.
* [PENDING] Snapshots de texto: validación de esquema + contención de ruta + confirmación de sobreescritura.

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
* [PENDING] CSP presente en **todas** las páginas HTML de ventanas renderer.
* [PENDING] CSP presente también en HTMLs informativos/auxiliares (`public/info/*.html` u equivalentes).
* [PENDING] `script-src 'self'` (sin fuentes remotas; sin `unsafe-eval`; sin inline scripts).
* [PENDING] No hay `<script>` inline en HTML.
* [PENDING] No hay handlers inline tipo `onclick=...`.
* [PENDING] Si existe `style-src 'unsafe-inline'`, su uso está justificado y acotado (solo estilos).

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
* [PENDING] Persistencia de usuario confinada a un directorio controlado por la app (p. ej. `app.getPath('userData')/...`).
* [PENDING] No existe lectura/escritura arbitraria por rutas entregadas por renderer (salvo diseño explícito con validación fuerte).
* [PENDING] Entradas no confiables que llegan a persistencia (texto, presets) están acotadas por tamaño y saneo antes de persistir.
* [PENDING] Rutas seleccionadas por diálogos (`save/open`) se normalizan y confinan al root esperado (p. ej. `tasks/lists`, `saved_current_texts`).
* [PENDING] Lecturas i18n limitadas al árbol `i18n/` y las claves/tags se normalizan.

Criterio de bloqueo:
* Introducir rutas controladas por renderer para lectura/escritura sin validación estricta y sin rediseño de seguridad.

Evidencia mínima sugerida:
* Inventario de archivos persistidos esperados (p. ej. `user_settings.json`, `current_text.json`, `presets_defaults/*`, `tasks/*`, `saved_current_texts/*`) + ubicación base + quién puede escribirlos.
* Enumeración de rutas abiertas por diálogos del sistema (si existen) y cómo se validan.

---

## 8) Clipboard posture — Ship Gate

Checklist:
* [PENDING] Clipboard se trata como input no confiable.
* [PENDING] Lectura/escritura de clipboard ocurre en main vía IPC bridge (no directo en renderer).
* [PENDING] Payload acotado: si excede el límite permitido, no se transporta (respuesta estructurada + UX preservada).

Criterio de bloqueo:
* Permitir que renderer lea clipboard directamente o transportar clipboard sin límite de tamaño.

Evidencia mínima sugerida:
* Canales IPC de clipboard + sender restriction (si aplica) + size fuse.

---

## 9) Updater policy — Ship Gate

Modelo recomendado: **actualización dirigida por el usuario** (user-driven).

Checklist:
* [PENDING] El check de versión consulta un endpoint HTTPS fijo y conocido (documentar cuál).
* [PENDING] Si hay update, se solicita consentimiento explícito del usuario.
* [PENDING] La acción de “Download” abre el release oficial en navegador externo (o flujo equivalente bajo control del usuario).
* [PENDING] Endpoint de check y URL de descarga no son controlables por renderer.
* [PENDING] No existe descarga silenciosa de binarios.
* [PENDING] No existe ejecución automática de instaladores.
* [PENDING] No existe auto-update in-app (download/quitAndInstall/etc.).

Riesgo residual (completar si aplica):
* [PENDING] Si no hay verificación criptográfica propia de artefactos, justificar por qué el modelo de updater no descarga/ejecuta automáticamente.

Criterio de bloqueo:
* Cualquier flujo que descargue/ejecute updates dentro de la app sin una revisión de seguridad separada.

Evidencia mínima sugerida:
* Endpoint usado + decisión de UX + confirmación de que no existe auto-update.
* Referencias de código del handler IPC y del flujo de confirmación UX.

---

## 10) Release hygiene (repo + configuración de release) — Ship Gate

Este bloque es relevante para seguridad de distribución porque controla supply-chain accidental (secrets, material dev, artefactos no intencionados) y configuración de build.

Checklist:
* [PENDING] Secret hygiene:
  * No hay llaves/tokens/credenciales hardcodeadas (incluye `.env`, tokens en JS, URLs con credenciales, etc.).
  * No hay archivos de volcado/logs de desarrollo con datos sensibles versionados.
  * Si se detecta un secreto: incidente y bloquea publicación hasta rotación/remoción.

* [PENDING] Packaging excludes (política “no arrastrar dev”):
  * La configuración de empaquetado usa allowlist estricta de runtime (`build.files`) o excludes explícitos equivalentes.
  * Quedan fuera directorios no distribuibles (mínimo: `tools_local/` y equivalentes).
  * Excluye backups, evidence folders, scripts internos que no sean runtime.

* [PENDING] DevTools / Debug hooks (política para build distribuible):
  * En build empaquetado: DevTools **no se abre automáticamente**.
  * En build empaquetado: no existe un menú/atajo propio de la app que abra DevTools salvo modo debug explícito y deliberado.
  * Nota: DevTools en modo dev es normal.

* [PENDING] Source maps (si aplica):
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
* [PENDING] Listado exacto de dependencias de producción incluidas en el build (top-level):
  * Confrontar lo incluido en artefacto contra `package.json` (`dependencies`) y contra el runtime esperado de Electron.
  * Enumerar `resources/app.asar/node_modules` o ruta equivalente y registrar nombres + versiones.
  * Resultado (pegar debajo):
    * `<TBD: lista exacta o “no hay node_modules en artefacto”>`

* [PENDING] Sanity check de vulnerabilidades sobre dependencias runtime (mínimo: ausencia de CVEs críticas conocidas en deps incluidas o justificación/mitigación si existen).

Criterio de bloqueo:
* Dependencias inesperadas de runtime o material sensible incluido por error.

---

## 12) Checklist mínimo post-empaquetado (artefacto final)

Checklist:
* [PENDING] Inspección de contenido del artefacto:
  * Confirmar que solo incluye lo esperado (app + recursos + runtime).
  * Confirmar ausencia de archivos sensibles (tokens, llaves, `.env`, dumps, logs de dev).
  * Confirmar ausencia de material de desarrollo no intencionado (herramientas locales, evidence folders, backups).
  * Confirmar que las páginas renderer incluidas corresponden al set esperado (main/editor/task_editor/preset/language/flotante/info u otras explícitamente aprobadas).

* [PENDING] Smoke “renderer containment” sobre el artefacto:
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

Veredicto final: `<PASS/BLOCKER>`  
Artefacto validado: `<nombre exacto>`

---
