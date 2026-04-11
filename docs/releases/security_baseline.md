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
* Este archivo es la **línea base reusable** para releases futuros; cada release debe completar estados/evidencias sobre esta misma estructura, pero la plantilla debe mantenerse alineada con el comportamiento **actual** del producto.
* Si se usa otro release/baseline como referencia, registrar la referencia exacta (doc/ruta/tag/commit) y el delta observado; no asumir que una versión previa quedó “cerrada” si después hubo correcciones documentales, de packaging o de superficie runtime.

---

## 1) Veredicto actual

**Veredicto actual:** `<PASS | BLOCKER | PENDING>`  
**Decisión:** `<OK publicar | NO publicar>`

Estado por gate:
* **Ship Gate (repo/código + higiene de distribución):** `<PASS | BLOCKER | PENDING>`
  * Postura de seguridad del runtime (secciones 2–9): `<PASS | BLOCKER | PENDING>`
  * Higiene de distribución (sección 10): `<PASS | BLOCKER | PENDING>`
* **Post-packaging Gate (artefacto build):** `<PASS | BLOCKER | PENDING>`

Notas:
* Si el veredicto es PASS, registrar el identificador del artefacto validado (nombre exacto + hash o evidencia equivalente).
* Si el veredicto es BLOCKER/PENDING, registrar el/los ítems bloqueantes y el plan de cierre.
* Registrar siempre qué cambió en seguridad respecto de la referencia elegida (canales IPC nuevos/modificados, ventanas nuevas, cambios CSP, cambios de persistencia, cambios en updater y enlaces externos).
* En el baseline actual, el delta de seguridad debe registrar explícitamente cualquier cambio en:
  * la superficie IPC/preload de flujos sensibles,
  * la autenticación, permisos y proveedor de cualquier flujo conectado con servicios externos,
  * el inventario y la política de persistencia propia de la app,
  * el tratamiento de cualquier material sensible incluido en el build o creado en runtime.
  * cualquier nueva dependencia runtime redistribuida.
  * cualquier nueva forma de entrada de archivos o contenido externo (picker nativo, drag-drop, archivos locales, archivos comprimidos, enlaces públicos, etc.).
  * cualquier cambio en cómo la app abre enlaces externos o documentación.

---

## 2) Threat model mínimo — Ship Gate

**Objetivo práctico:** impedir escalamiento renderer → OS y acotar entradas no confiables.

Checklist:
* [PENDING] Renderer (DOM + JS) se trata como **no confiable**.
* [PENDING] Proceso main es el **punto de enforcement** (política).
* [PENDING] Preloads son el **único puente** entre renderer y capacidades privilegiadas.
* [PENDING] La app no depende de cargar contenido remoto arbitrario para operar.

Notas / evidencia:
* Indicar el inventario vigente de superficies con input no confiable y su control, sin depender de una lista heredada de otra versión.
* Matriz mínima sugerida: `superficie | de dónde viene el input | frontera de confianza | controles principales | evidencia`.
* Indicar cómo se acota riesgo de inyección/escalamiento (CSP + sandbox + IPC whitelist + restricción de navegación).

---

## 3) BrowserWindow posture — Ship Gate

**Invariantes requeridas en todas las ventanas renderer vigentes del producto**:

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
* Inventario vigente de ventanas renderer (`ventana | propósito | HTML/preload | dónde se setean webPreferences | notas`) en vez de una lista heredada.
* Evidencia del control de navegación/ventanas emergentes y del flujo permitido para salidas externas.

---

## 4) Preload posture (superficie expuesta) — Ship Gate

Principios operativos:
* La API expuesta a renderer debe ser **pequeña, intencional y cerrada**.
* Renderer no debe poder invocar capacidades privilegiadas “genéricas” (ej. `invoke(channel, payload)` libre).

Checklist:
* [PENDING] Preloads exponen API vía `contextBridge` y no exponen Node a renderer.
* [PENDING] Preloads no implementan file I/O, network I/O, ni ejecución dinámica.
* [PENDING] Preloads no exponen superficies amplias (ej. acceso directo a `ipcRenderer` sin wrapper de propósito).
* [PENDING] APIs preload se mantienen separadas por ventana y con propósito explícito, de acuerdo con el inventario vigente del producto.
* [PENDING] Logging en preload es mínimo; decisiones de seguridad se aplican en main.

Criterio de bloqueo:
* Cualquier preload que exponga capacidades genéricas que permitan al renderer ampliar superficie (p. ej. “invoke cualquier canal”, “eval”, “require”, “fs”).

Evidencia mínima sugerida:
* Enumeración de APIs expuestas (`window.*API`) + lista de métodos y su propósito (por preload).
* Confirmación de que no se expone `ipcRenderer` crudo, `require`, `process`, `fs` o primitivos de ejecución dinámica.
* Incluir el inventario vigente de bridges preload (`API | métodos | propósito | ventana/superficie | controles relevantes`) en vez de copiar listas de otra versión.

---

## 5) IPC posture (trust boundary) — Ship Gate

**IPC es frontera de confianza.** Todo input del renderer es no confiable.

Requisitos mínimos (aplican a canales de impacto: clipboard, texto, presets, apertura de modales/ventanas, apertura de URLs/docs, etc.):

Checklist:
* [PENDING] Disciplina de esquema (objetos simples donde corresponde; coerción/normalización de tipos).
* [PENDING] Lista cerrada de campos (ignorar o rechazar campos desconocidos; no “passthrough”).
* [PENDING] Size fuses para strings controlables por el renderer (texto, nombres/descripciones, meta).
* [PENDING] Size fuses cubren también entradas de Task Editor (texto, enlace, comentario y payloads de listas/biblioteca).
* [PENDING] Sender restriction cuando el canal debe pertenecer a una ventana específica.
* [PENDING] Fallos recuperables devuelven respuesta estructurada `{ ok:false, ... }` y feedback UX cuando aplica.
* [PENDING] Flujos sensibles de varios pasos mantienen estado temporal propio de la app y no confían en payload reinyectado por renderer (por ejemplo `prepareId` de un solo uso + vencimiento + revalidación antes de `execute`).

Mapa de superficies “de impacto” (completar por release, al menos con los canales relevantes):
* [PENDING] Clipboard bridge (lectura/escritura si existe): tamaño + control de origen.
* [PENDING] Ingesta/edición de texto: límites + tratamiento seguro de meta.
* [PENDING] Presets: creación/edición/borrado con sanitización y límites.
* [PENDING] Apertura de modales/ventanas: payload acotado + control de origen.
* [PENDING] Apertura de enlaces/docs: allowlist + validación + no “open arbitrary”.
* [PENDING] Task Editor (listas/biblioteca/enlaces): esquema + sender guard + límites + política de apertura de links/paths.
* [PENDING] Snapshots de texto: validación de esquema + contención de ruta + confirmación de sobreescritura.
* [PENDING] Flujos sensibles de selección/precondiciones usan sender guard de la ventana autorizada y retorno estructurado.
* [PENDING] Flujos de prepare/execute usan validación de payload, estado temporal propio de la app, vencimiento/revalidación cuando aplique y decisiones acotadas.
* [PENDING] Flujos de procesamiento activo/cancelación usan sender guard y sanitización de meta/razón cuando aplique.
* [PENDING] Flujos de activación/conexión/desconexión con servicios externos resuelven rutas, secretos, permisos, endpoints y proveedores en main; renderer no controla esos parámetros.
* [PENDING] Cualquier nueva superficie de adquisición/importación local o remota usa sender guard, picker/flujo mediado por main, validación estructurada, resolución explícita de duplicados/conflictos cuando aplique y límites consistentes con el modelo de riesgo.

Criterio de bloqueo:
* Añadir un canal IPC nuevo de impacto sin: whitelist, size fuse y (si aplica) sender guard.

Evidencia mínima sugerida:
* Lista de canales IPC “de impacto” y dónde se registran (archivo + referencia aproximada).
* Para cada canal: shape de request/response y validaciones relevantes.
* Tabla explícita de cambios IPC respecto al release anterior (canal nuevo/modificado/eliminado + riesgo + veredicto).
* En este release, incluir explícitamente los canales nuevos/modificados de cualquier flujo sensible y el preload/superficie donde quedan expuestos.

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
* Escrituras persistentes acotadas a almacenamiento propio de la app con nombres de archivo conocidos.
* Renderer no aporta rutas arbitrarias a operaciones de I/O del main.

Checklist:
* [PENDING] Persistencia de usuario confinada a un directorio controlado por la app (p. ej. `app.getPath('userData')/...`).
* [PENDING] No existe lectura/escritura arbitraria por rutas entregadas por renderer (salvo diseño explícito con validación fuerte).
* [PENDING] Entradas no confiables que llegan a persistencia (texto, presets) están acotadas por tamaño y saneo antes de persistir.
* [PENDING] Rutas seleccionadas por diálogos (`save/open`) se normalizan y confinan al root esperado (p. ej. `tasks/lists`, `saved_current_texts`).
* [PENDING] Lecturas i18n limitadas al árbol `i18n/` y las claves/tags se normalizan.
* [PENDING] Import/extract acepta rutas de archivos fuente solo desde selección explícita del usuario (picker nativo o `File`/drag-drop ya concedido por el navegador de archivos del sistema) y nunca usa esas rutas como destino de escritura arbitraria.
* [PENDING] Toda persistencia específica de features o sensible permanece bajo control de la app, con rutas fijas declaradas en el inventario vigente del release.
* [PENDING] Si existe material sensible de runtime (por ejemplo credenciales empaquetadas, tokens locales o estado de activación), su origen, creación, lectura/escritura y exclusión del artefacto/repo quedan documentados según la implementación real.
* [PENDING] Cualquier nueva superficie con persistencia propia evita escape de ruta desde nombres de archivo, entradas de archivo comprimido o payloads equivalentes.

Criterio de bloqueo:
* Introducir rutas controladas por renderer para lectura/escritura sin validación estricta y sin rediseño de seguridad.
* Permitir credenciales, tokens o material sensible fuera del almacenamiento controlado por la app o con una política distinta a la documentada para el producto.

Evidencia mínima sugerida:
* Inventario vigente de persistencia (`archivo/subárbol | ubicación base | propósito | quién escribe | controles`) en vez de una lista copiada de otra versión.
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

## 9) Updater + external-service policy — Ship Gate

Modelo recomendado: **actualización dirigida por el usuario** (user-driven) y uso de servicios externos con parámetros fijos desde main.

Checklist:
* [PENDING] El check de versión consulta un endpoint HTTPS fijo y conocido (documentar cuál).
* [PENDING] Si hay update, se solicita consentimiento explícito del usuario.
* [PENDING] La acción de “Download” abre el release oficial en navegador externo (o flujo equivalente bajo control del usuario).
* [PENDING] Endpoint de check y URL de descarga no son controlables por renderer.
* [PENDING] No existe descarga silenciosa de binarios.
* [PENDING] No existe ejecución automática de instaladores.
* [PENDING] No existe auto-update in-app (download/quitAndInstall/etc.).
* [PENDING] Si existe autenticación contra servicios externos, usa el mecanismo previsto por el producto y no contenido embebido inseguro; renderer no puede redirigir proveedor, host, permiso, endpoint o credenciales.
* [PENDING] Si existe un flujo conectado que procesa archivos o contenido del usuario, solo envía material elegido explícitamente por el usuario y su política de borrado/retención queda documentada.
* [PENDING] No existe backend intermedio ni reenvío a servicios no documentados fuera del modelo aprobado del producto.
* [PENDING] Las aperturas externas y de documentación siguen siendo iniciadas por el usuario, validadas y mediadas por main; esto incluye sitio web, soporte, docs in-app y cualquier enlace externo fijo incorporado por la app.

Riesgo residual (completar si aplica):
* [PENDING] Si no hay verificación criptográfica propia de artefactos, justificar por qué el modelo de updater no descarga/ejecuta automáticamente.
* [PENDING] Si la plataforma usa un backend de protección local más débil o si un proveedor externo introduce límites o fallas operativas, registrar el riesgo residual sin degradar el modelo de permisos.

Criterio de bloqueo:
* Cualquier flujo que descargue/ejecute updates dentro de la app sin una revisión de seguridad separada.
* Cualquier flujo conectado que permita credenciales, permisos, endpoints o proveedores controlables por renderer, o autenticación dentro de contenido embebido.
* Cualquier flujo conectado que envíe archivos/contenido sin acción explícita del usuario o a través de un backend intermedio no documentado.

Evidencia mínima sugerida:
* Endpoint usado + decisión de UX + confirmación de que no existe auto-update.
* Referencias de código del handler IPC y del flujo de confirmación UX.
* Para flujos conectados: referencias a autenticación, permisos, validación de setup, política de envío de contenido y borrado/retención cuando aplique.

---

## 10) Higiene de distribución (repo + configuración) — Ship Gate

Este bloque es relevante para seguridad de distribución porque controla supply-chain accidental (secrets, material dev, artefactos no intencionados) y configuración de build.

Checklist:
* [PENDING] Hygiene de secretos:
  * No hay llaves/tokens/credenciales hardcodeadas (incluye `.env`, tokens en JS, URLs con credenciales, etc.).
  * No hay archivos de volcado/logs de desarrollo con datos sensibles versionados.
  * Si se detecta un secreto: incidente y bloquea publicación hasta rotación/remoción.
  * Cualquier material sensible empaquetado o creado por la app se trata como material controlado del release: no editable por renderer, con trazabilidad clara de ruta/origen/política repo+artefacto en la revisión y con verificación de coherencia con la política vigente del producto.
  * Cualquier token/credencial mutable de usuario nunca pertenece al repo ni al artefacto empaquetado final.

* [PENDING] Packaging excludes (política “no arrastrar dev”):
  * La configuración de empaquetado usa allowlist estricta de runtime (`build.files`) o excludes explícitos equivalentes.
  * Quedan fuera directorios no distribuibles (mínimo: `tools_local/` y equivalentes).
  * Excluye backups, evidence folders, scripts internos que no sean runtime.
  * Excluye cualquier token/credencial mutable de usuario y cualquier volcado/debug output de flujos sensibles.

* [PENDING] External-link allowlist coherente con canales públicos:
  * Si el release modifica enlaces públicos (sitio web, contacto, redes, docs in-app), verificar que la implementación efectiva mantenga política de mínimo privilegio.
  * `https` solo para hosts explícitamente allowlistados.
  * `mailto` solo para direcciones explícitamente allowlistadas.
  * Si no hay cambios de enlaces/hosts en el release, dejar evidencia breve de “no delta”.

* [PENDING] Alineación documental / anti-drift:
  * No hay drift entre la postura de seguridad implementada y la documentación user-facing relevante (`PRIVACY.md`, documentación informativa in-app, disclosures de flujos sensibles y `website/public/**` si aplica al release).
  * No hay drift entre esa postura implementada y la documentación interna relevante (`docs/releases/security_baseline.md`, `docs/releases/release_checklist.md`, `docs/releases/legal_baseline.md` cuando comparta postura de privacidad/enlaces/servicios, `docs/tree_folders_files.md`, `CHANGELOG.md`, `docs/changelog_detailed.md`, `docs/test_suite.md` cuando cambien checks o flujos).
  * La plantilla reusable evita fijar versiones o inventarios mutables cuando basta con referirse a la fuente de verdad actual; los valores exactos quedan en el baseline versionado y en la evidencia del artefacto.
  * Si se detecta divergencia entre implementación y docs, registrar delta + plan de cierre antes de PASS.

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
* Claims de seguridad/privacidad/conectividad en documentación user-facing o interna que contradicen la implementación real del release.

Evidencia mínima sugerida:
* Comandos/outputs usados para verificar (p. ej. grep de secretos, inspección de config build, etc.).
* Resumen de archivos efectivamente incluidos por configuración de empaquetado.
* Matriz anti-drift `claim/superficie | implementación/fuente de verdad | doc user-facing | doc interna | estado`.
* En releases con material sensible empaquetado o materializado, evidencia específica sobre su presencia/ausencia esperada, su política repo+artefacto y la exclusión de tokens/credenciales mutables de usuario.
* En releases que agreguen nuevas dependencias runtime o nuevas superficies de adquisición/importación/conexión, evidencia específica sobre rutas/runtime nuevos, validación/contención de entradas y política efectiva de destinos/hosts/permissions permitidos cuando aplique.

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
  * Verificar explícitamente la presencia/ausencia esperada de dependencias runtime sensibles, nativas o recientemente introducidas según el inventario vigente del producto.

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
  * Confirmar que las páginas/superficies renderer incluidas corresponden al inventario esperado del producto.
  * Confirmar tratamiento correcto de material sensible y dependencias runtime específicas:
    * presencia/ausencia coherente con el baseline actual del producto,
    * ausencia de tokens/credenciales mutables de usuario,
    * presencia solo de módulos/runtime específicos esperados para las features habilitadas.

* [PENDING] Smoke “renderer containment” sobre el artefacto:
  * Confirmar que renderer no expone Node (`window.require` / `window.process`).
  * Confirmar que funcionalidades principales operan sin pedir permisos no esperados.
  * Confirmar que navegación externa no controlada queda bloqueada (solo flujos permitidos vía main/allowlist).
  * Confirmar que los flujos sensibles/conectados funcionan bajo el mismo modelo de aislamiento:
    * selección de archivos, autenticación o interacciones equivalentes salen por diálogos/sistema operativo o mecanismos explícitamente aprobados, no por permisos directos de renderer,
    * renderer no puede redirigir providers, destinos o permisos fuera del flujo permitido.

Criterio de bloqueo:
* Cualquier hallazgo de material dev/sensible dentro del artefacto.
* Inclusión de páginas renderer/HTML no esperadas (no revisadas) en el artefacto.
* Señales de escalamiento renderer→Node (existencia de `window.require`/`window.process` en renderer).
* Inclusión de tokens/credenciales mutables de usuario en el artefacto o tratamiento incorrecto de material sensible respecto al baseline del producto.

Evidencia mínima sugerida:
* Evidencia de inspección (lista de archivos o capturas del árbol) + prueba mínima de “no Node en renderer”.

---

## 13) Resultado final (cómo cerrar el veredicto)

La app queda marcada como **“suficientemente segura para distribuir el artefacto evaluado”** únicamente cuando:
* Ship Gate: todo PASS (incluye runtime security posture + higiene de distribución), y
* Post-packaging Gate: todo PASS (incluyendo dependencias runtime listadas y revisadas).

Veredicto final: `<PASS/BLOCKER>`  
Artefacto validado: `<nombre exacto>`

---
