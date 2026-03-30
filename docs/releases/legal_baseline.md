# Baseline legal para distribución (por release)

Fecha: `<YYYY-MM-DD>`
Tag objetivo (GitHub): `v<MAJOR.MINOR.PATCH>`
Commit freeze (Git): `<SHA_COMMIT>`
Artefacto inspeccionado: `<ZIP/INSTALLER>`
SHA256(artefacto): `<SHA256>`

Pregunta única que responde este documento: **¿El artefacto es legalmente redistribuible en este release?**

Este baseline está diseñado como **checklist operativo** y como “candado” de publicación legal.  
La app solo se considera “legalmente redistribuible” si:

1) **Todo el Ship Gate (repo/inventario/cobertura documental) está en PASS**, y  
2) **Todo el Post-packaging Gate (artefacto empaquetado real) está en PASS**.

Leyenda:
* **[PASS]** Cumple.
* **[BLOCKER]** Incumplimiento objetivo: bloquea distribución.
* **[PENDING]** No verificado aún: bloquea hasta completar.
* **[N/A]** No aplica. Evitar usarlo; si aparece, justificar explícitamente.

Regla operativa:
* Este baseline aplica **solo** al artefacto inspeccionado. Si se re-empaqueta, se re-ejecuta el Post-packaging Gate.
* Este archivo es la **línea base reusable** para releases futuros; cada release completa estados/evidencias sobre esta estructura.
* La evidencia detallada (árboles, salidas de comandos, capturas) puede guardarse fuera del repo; aquí debe quedar el resumen + referencia.

---

## 1) Veredicto del release

**Veredicto actual:** `<PASS | BLOCKER | PENDING>`  
**Decisión:** `<OK publicar | NO publicar>`

Estado por gate:
* **Ship Gate (inventario + cobertura legal):** `<PASS | BLOCKER | PENDING>`
  * Servicios externos + terceros redistribuidos (secciones 2–5): `<PASS | BLOCKER | PENDING>`
  * Higiene legal de release (sección 6): `<PASS | BLOCKER | PENDING>`
* **Post-packaging Gate (artefacto build):** `<PASS | BLOCKER | PENDING>`

Notas:
* Si el veredicto es PASS, registrar el identificador exacto del artefacto validado (nombre + hash).
* Si el veredicto es BLOCKER/PENDING, registrar ítems bloqueantes y plan de cierre.
* Registrar siempre el **delta legal del release** (servicios nuevos, terceros nuevos, cambios de licencias/notices, cambios en docs legales de usuario).
* En el baseline actual, el delta legal debe registrar explícitamente:
  * cualquier cambio en la postura legal/documental de **import/extract + OCR conectado con Google**,
  * cualquier cambio en el material OAuth desktop empaquetado del owner/propietario para OCR,
  * y cualquier cambio en licencias/notices/docs específicos de import/extract.

---

## 2) Modelo legal mínimo — Ship Gate

**Objetivo práctico:** que todo lo consumido externamente y todo lo redistribuido tenga inventario y cobertura legal antes de empaquetar.

Checklist:
* [PENDING] Existe inventario legal efectivo del release (servicios externos + material de terceros + docs entregables).
* [PENDING] Cada ítem del inventario tiene: origen, licencia/términos, decisión de redistribución y evidencia.
* [PENDING] Hay comparación explícita contra release anterior (added/removed/changed).
* [PENDING] Si hay incertidumbre legal, el ítem queda en PENDING hasta resolver.

Criterio de bloqueo:
* Publicar con un tercero redistribuido sin licencia/notice identificable y redistribuible.

Evidencia mínima sugerida:
* Tabla inventario (`ítem | origen | licencia/términos | obligación | ubicación notice/doc | estado`).
* Resumen del delta legal respecto al release previo.

---

## 3) Inventario de servicios externos — Ship Gate

Servicios externos efectivos esperados (baseline actual; completar por release):
* Updater check:
  * `https://api.github.com/repos/Cibersino/tot/releases/latest`
* Download en navegador externo:
  * `https://github.com/Cibersino/tot/releases/latest`
* Sitio/documentación pública del producto:
  * `https://totapp.org/`
  * páginas públicas del producto usadas para la postura release de homepage/privacy
* OCR conectado con Google:
  * OAuth desktop vía navegador del sistema (Google Identity)
  * Google Drive API / conversión Google Docs para OCR de archivos elegidos por el usuario
  * baseline de scope esperado: `drive.file`
* Host allowlist actual a reconciliar por release:
  * `github.com`
  * `www.github.com`
  * `api.github.com`
  * `raw.githubusercontent.com`
  * `doi.org`
  * `totapp.org`
  * `www.totapp.org`
  * `www.patreon.com`
  * `mailto:cibersino@gmail.com`

Checklist:
* [PENDING] Lista efectiva de endpoints/servicios usada por la app en este release (incluye cualquier host nuevo).
* [PENDING] Host allowlist efectiva registrada y consistente con la lista de endpoints.
* [PENDING] Inventariar explícitamente el uso de Google OAuth + Google Drive OCR y dejar cerrada su cobertura documental mínima (scope, disclosure, privacidad, disconnect, homepage/privacy públicas).
* [PENDING] Confirmar ausencia de credenciales embebidas no documentadas (`token`, `key`, `user:pass`, `.env`, etc.).
* [PENDING] Registrar la presencia del cliente OAuth empaquetado del owner/propietario para OCR como **excepción controlada e intencional**; no tratarla como “secret accidental”, pero sí exigir trazabilidad exacta de ruta, propósito y exclusiones de git.
* [PENDING] Si aparece servicio nuevo: inventariar obligación legal asociada (ToS, aviso, privacidad, atribución, etc.).

Criterio de bloqueo:
* Secret/credencial embebida en repo.
* Secret/credencial no documentada o no intencional embebida en artefacto.
* La app usa Google para OCR pero no tiene inventario/cobertura mínima cerrada para su postura Google/OAuth/privacidad.
* Servicio externo nuevo en producción sin inventario/cobertura legal mínima.

Evidencia mínima sugerida:
* Referencia a archivos/canales donde se usa cada endpoint.
* Búsqueda de URLs/secrets (ejemplos):
  * `rg -n "https?://|openExternal|check-for-updates" electron public`
  * `rg -n "googleapis|authenticate\\(|drive\\.files\\.|drive\\.file|Disconnect Google OCR|import_extract_ocr" electron public i18n docs website`
  * `rg -n "(AKIA|BEGIN PRIVATE KEY|ghp_|xox[baprs]-|token|secret|password|\\.env)" .`

---

## 4) Inventario de material redistribuido de terceros — Ship Gate

**Objetivo práctico:** identificar todo lo de terceros que viaja dentro del artefacto y su obligación asociada.

Checklist:
* [PENDING] Fonts redistribuidas inventariadas con licencia/notice:
  * `Baskervville` — `public/fonts/LICENSE_Baskervville_OFL.txt`
  * Otras (si existen): `<FontName> — <ruta licencia/notice>`
* [PENDING] Assets redistribuidos de terceros inventariados (si todo es propio, declararlo explícitamente).
* [PENDING] Runtime notices obligatorios inventariados:
  * `LICENSE.electron.txt`
  * `LICENSES.chromium.html`
* [PENDING] Material legal redistribuido específico de import/extract inventariado:
  * `public/extraction_feature_licenses/LICENSE_@google-cloud_local-auth_2.1.0.txt`
  * `public/extraction_feature_licenses/LICENSE_googleapis_105.0.0.txt`
  * `public/extraction_feature_licenses/LICENSE_mammoth_1.11.0.txt`
  * `public/extraction_feature_licenses/LICENSE_pdf-parse_1.1.1.txt`
  * `public/extraction_feature_licenses/LICENSE_sharp_0.34.4.txt`
  * `public/extraction_feature_licenses/LICENSE_@img_sharp-win32-x64_0.34.4.txt`
  * `public/extraction_feature_licenses/NOTICE_@img_sharp-win32-x64_0.34.4.txt`
* [PENDING] El material OAuth desktop empaquetado del owner/propietario queda inventariado como **configuración distribuida controlada**, no como “notice de tercero”, con ruta y tratamiento separados de las licencias.
* [PENDING] Cada tercero tiene trazabilidad completa:
  * `componente | origen | licencia | obligación | archivo notice/doc`

Criterio de bloqueo:
* Cualquier font/asset/componente de terceros redistribuido sin licencia/notice cubierto.

Evidencia mínima sugerida:
* Inventario consolidado por componente.
* Referencias de ubicación en repo de cada notice/licencia.

---

## 5) Dependencias runtime y cobertura de licencias — Ship Gate

Este punto no asume “sin deps”; debe verificarse en cada release.

Checklist:
* [PENDING] Modelo esperado para este release (marcar uno):
  * [ ] No hay `node_modules` runtime (solo runtime Electron + app bundle).
  * [ ] Sí hay `node_modules` runtime (listar top-level). Baseline actual esperado: **sí**.
* [PENDING] Si hay deps runtime: listar `nombre@versión`, licencia y cobertura documental.
  * Baseline actual esperada para import/extract:
    * `@google-cloud/local-auth@2.1.0` — `Apache-2.0`
    * `googleapis@105.0.0` — `Apache-2.0`
    * `mammoth@1.11.0` — `BSD-2-Clause`
    * `pdf-parse@1.1.1` — `MIT`
    * `sharp@0.34.4` — `Apache-2.0`
    * runtime nativo de `sharp` para la plataforma empaquetada (por ejemplo `@img/sharp-win32-x64@0.34.4`) — verificar licencia/notice entregados para la plataforma real
* [PENDING] Si no hay deps runtime: registrar la expectativa explícitamente para validar contra artefacto en Post-packaging.
* [PENDING] Cualquier dependencia efectiva encontrada en artefacto queda cubierta por esta sección y por documentos de §6.

Criterio de bloqueo:
* Dependencia runtime efectiva sin cobertura de licencia/notice aplicable.

Evidencia mínima sugerida:
* Inventario de deps runtime esperadas (si aplica).
* Comando de apoyo (si aplica): `npm ls --omit=dev --depth=0`

---

## 6) Documentos legales entregables + release hygiene legal — Ship Gate

**Objetivo práctico:** dejar cerrado qué documentos recibe el usuario y asegurar que build/repo no arrastren material impropio.

Checklist:
* [PENDING] Lista efectiva de documentos legales que deben incluirse en artefacto:
  * `LICENSE`
  * `PRIVACY.md`
  * `LICENSE.electron.txt`
  * `LICENSES.chromium.html`
  * Licencias/notices de fonts redistribuidas (ej. `public/fonts/LICENSE_Baskervville_OFL.txt`)
  * Notices adicionales si aplica (ej. `THIRD_PARTY_NOTICES.md`)
  * `public/extraction_feature_licenses/LICENSE_@google-cloud_local-auth_2.1.0.txt`
  * `public/extraction_feature_licenses/LICENSE_googleapis_105.0.0.txt`
  * `public/extraction_feature_licenses/LICENSE_mammoth_1.11.0.txt`
  * `public/extraction_feature_licenses/LICENSE_pdf-parse_1.1.1.txt`
  * `public/extraction_feature_licenses/LICENSE_sharp_0.34.4.txt`
  * licencia/notices del runtime nativo de `sharp` para la plataforma empaquetada (ej. Windows x64):
    * `public/extraction_feature_licenses/LICENSE_@img_sharp-win32-x64_0.34.4.txt`
    * `public/extraction_feature_licenses/NOTICE_@img_sharp-win32-x64_0.34.4.txt`
* [PENDING] `public/info/acerca_de.html` (u otra UI equivalente) es consistente con el inventario legal anterior.
* [PENDING] `PRIVACY.md`, `public/info/acerca_de.html` y `public/info/instrucciones.*.html` describen coherentemente:
  * que OCR usa Google solo cuando el usuario elige esa ruta,
  * que la autorización ocurre en navegador externo,
  * que solo los archivos elegidos por el usuario para OCR se envían a Google,
  * que existe disconnect dentro de la app,
  * y que la app intenta limpieza remota del artefacto temporal de Google después de exportar.
* [PENDING] Sitio web público (`website/public`) alineado legal/comercialmente con el release:
  * Rutas públicas esperadas vigentes: `/`, `/es/`, `/en/`, `/privacy-cookies/`, `/es/privacy-cookies/`, `/en/privacy-cookies/`.
  * También revisar la postura pública de app/privacy para OCR, incluyendo:
    * `/es/app-privacy/`
    * `/en/app-privacy/`
    * `/es/app-privacy/google-ocr/`
    * `/en/app-privacy/google-ocr/`
  * `Privacidad / Cookies` / `Privacy / Cookies` visible en footer de `/`, `/es/` y `/en/` (sin depender de metadatos).
  * Contenido mínimo de privacidad/cookies alineado con implementación actual (sin claims no verificadas sobre analytics/cookies/servicios).
  * Homepage/privacy públicas del producto alineadas con la postura real de Google OCR usada en la app.
  * Operador y canales de contacto consistentes entre sitio web y artefacto/app (`Cibersino`, GitHub Issues, `cibersino@gmail.com`).
* [PENDING] Branding y marcas de terceros en sitio web inventariados cuando aplique:
  * Uso intencional de logos/marks de plataformas externas (Patreon, Instagram, X, YouTube, Twitch u otras) revisado a nivel de cumplimiento básico de términos de marca.
  * Si no hay cambios en logos/marks respecto al release anterior, registrar “no delta”.
* [PENDING] Configuración de empaquetado usa allowlist/excludes coherentes para no arrastrar material no distribuible.
* [PENDING] Confirmar ausencia de `tools_local/`, backups, dumps, `.env` y secretos no intencionales en lo que se planea distribuir.
* [PENDING] Verificar tratamiento correcto de credenciales/token OCR:
  * `electron/assets/ocr_google_drive/credentials.json` forma parte del baseline distribuido como material app-owned intencional del owner/propietario.
  * ese archivo no debe estar committed en git.
  * `config/ocr_google_drive/token.json` no forma parte del artefacto distribuido; es estado mutable local post-activación.

Criterio de bloqueo:
* Documento legal obligatorio faltante en la lista efectiva de entrega.
* Configuración de build incluye material sensible/no distribuible fuera de lo explícitamente decidido, inventariado y justificado para el release.
* La app tiene política de credenciales/token OCR inconsistente con el modelo documentado del release.

Evidencia mínima sugerida:
* Matriz `documento | obligación | ruta en repo | ruta esperada en artefacto`.
* Referencia a configuración de empaquetado (`build.files`/excludes) y verificación de secretos.

---

# POST-PACKAGING GATE (obligatorio antes de publicar)

Este gate valida el **artefacto real** que se publica (zip/installer), no solo el repo.

## 7) Inspección del contenido del artefacto

Checklist:
* [PENDING] Confirmar que el artefacto contiene solo runtime + app + docs legales esperados.
* [PENDING] Confirmar ausencia de material no distribuible/sensible:
  * `tools_local/`, backups, evidence folders, dumps
  * `.env`, llaves, logs de desarrollo
* [PENDING] Verificar explícitamente el material OCR empaquetado:
  * presencia esperada de `electron/assets/ocr_google_drive/credentials.json` según el baseline actual del producto,
  * ausencia de cualquier `token.json` de usuario dentro del artefacto,
  * presencia de `public/extraction_feature_licenses/*` esperados para la plataforma empaquetada.
* [PENDING] Registrar evidencia mínima (árbol/archivo listado de raíz + `resources/`).

Criterio de bloqueo:
* Presencia de material sensible o no distribuible en artefacto final fuera de lo explícitamente decidido, inventariado y justificado para el release.
* Presencia de token OAuth de usuario en artefacto final.
* Presencia/ausencia incorrecta del `credentials.json` OCR empaquetado respecto al baseline documentado del producto.

Evidencia mínima sugerida:
* Snapshot de árbol de archivos del artefacto y `resources/`.

---

## 8) Dependencias runtime efectivas (en artefacto)

Checklist:
* [PENDING] Verificar si existen:
  * `resources/app.asar/node_modules/**`
  * `resources/app.asar.unpacked/**`
  * `resources/app/node_modules/**`
* [PENDING] Si existen deps runtime: listar top-level real y cruzar contra §5.
* [PENDING] Cualquier dependencia inesperada se clasifica y cubre legalmente antes de publicar.

Criterio de bloqueo:
* Dependencia runtime efectiva inesperada sin cobertura legal/documental.

Evidencia mínima sugerida:
* Listado top-level real de deps dentro del artefacto + resultado del cruce con §5.

---

## 9) Verificación de documentos legales en artefacto (contra §6)

Checklist:
* [PENDING] Cada documento listado en §6 está presente en el artefacto final.
* [PENDING] Verificar accesibilidad práctica: el usuario puede abrir esos documentos (por UI o por ubicación clara en zip/installer).
* [PENDING] Verificar accesibilidad práctica de los docs de import/extract/OCR:
  * `PRIVACY.md` desde el disclosure OCR y/o `Acerca de`
  * licencias/notices de import/extract desde `Acerca de`
* [PENDING] Confirmar que nombres/rutas finales no rompen la trazabilidad definida en §6.

Criterio de bloqueo:
* Falta cualquier documento legal obligatorio en el artefacto final.

Evidencia mínima sugerida:
* Tabla de presencia/ausencia + evidencia de apertura.

---

## 10) Servicios externos sanity en artefacto

Checklist:
* [PENDING] Confirmar que endpoints/hosts del build empaquetado coinciden con §3.
* [PENDING] Confirmar que la postura efectiva del binario empaquetado para OCR sigue siendo:
  * OAuth en navegador del sistema,
  * scope `drive.file`,
  * Google Drive OCR para archivos elegidos por el usuario,
  * sin backend del desarrollador para OCR.
* [PENDING] Si aparece conectividad nueva, volver a §3 y §2 (estado pasa a PENDING hasta cerrar inventario/cobertura).

Criterio de bloqueo:
* Endpoint/host efectivo no inventariado con obligación legal mínima cerrada.

Evidencia mínima sugerida:
* Referencia de verificación sobre binario/asar/config y resultado de comparación contra §3.

---

## 11) Resultado final (cómo cerrar el veredicto)

La app queda marcada como **“legalmente redistribuible en este release”** únicamente cuando:
* Ship Gate: todo PASS (inventario legal + cobertura documental + higiene legal), y
* Post-packaging Gate: todo PASS (artefacto real validado).

**BLOCKER** (no publicar) si ocurre cualquiera:
* Tercero redistribuido sin licencia/notice identificable y redistribuible.
* Documento legal obligatorio ausente en artefacto final.
* Secret/credencial embebida en repo.
* Secret/credencial no documentada o no intencional embebida en artefacto.
* `config/ocr_google_drive/token.json` u otro token mutable de usuario incluido en artefacto.
* La app no tiene decisión/evidencia cerrada sobre el material OAuth empaquetado del owner/propietario para OCR.
* Material sensible/no distribuible no documentado o no intencional incluido por build.

**PENDING** (no publicar aún) si ocurre cualquiera:
* Hay ítems nuevos (servicios/terceros/deps/docs) sin inventario/cobertura cerrada.
* No se ejecutó por completo el Post-packaging Gate sobre el artefacto final.

Veredicto final: `<PASS | BLOCKER | PENDING>`  
Artefacto validado: `<nombre exacto>`

---
