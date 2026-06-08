# Baseline operativo de seguridad de release

## Campos mínimos del release versionado

- Fecha de ejecución: `2026-06-04`
- Release ID: `v1.4.0`
- Commit freeze: `2cc1eb02f398da37fdccd1524d7130c8da230049`
- Artefactos inspeccionados: `toT-1.4.0-win-x64.zip`
- Hashes de artefacto: `36DB455E0DB373B568F5E3AFB95ADE5AC626D6B726E1EB1F2EFE26ADF46A2BA7`
- Referencia base para comparar delta: `v1.3.0|eaacf3227c40202091b1d7b030143b39e597814b`
- Veredicto final: `PASS`

## 1. Hechos estables del producto que este baseline asume

- El producto es una app de escritorio Electron con proceso `main`, ventanas `renderer` y `preload`.
- El renderer se trata como superficie no confiable.
- El veredicto de seguridad vale solo para el artefacto inspeccionado.

## 2. Inventarios obligatorios del release

- [x] Inventario de ventanas y preloads cerrado.
Registro de este release:
main `public/index.html` + `electron/preload.js`; editor `public/editor.html` + `electron/editor_preload.js`; find `public/editor_find.html` + `electron/editor_find_preload.js`; task editor `public/task_editor.html` + `electron/task_editor_preload.js`; preset `public/preset_modal.html` + `electron/preset_preload.js`; language `public/language_window.html` + `electron/language_preload.js`; flotante `public/flotante.html` + `electron/flotante_preload.js`; reading-test questions `public/reading_test_questions.html` + `electron/reading_test_questions_preload.js`; reading-test result `public/reading_test_result.html` + `electron/reading_test_result_preload.js`. `1.4.0` no agrega nuevas `BrowserWindow`; las superficies nuevas de PDF options, planner batch, heavy-PDF recovery y reporte final viven como modales renderer dentro de la ventana principal.

- [x] Inventario de capacidades privilegiadas cerrado.
Registro de este release:
la superficie privilegiada nueva queda acotada a IPCs especificos para inspeccion previa de PDF, revelado del PDF generado, sesiones de procesamiento de extraccion, apertura de la carpeta de snapshots, estado pending del current text, handshake de primer show del editor y dirty-state del Task Editor. `set-current-text` queda canonizado a `{ text, meta }` y deja de aceptar payload string legacy. `link_openers.js` sigue mediando aperturas externas con allowlist explicita; la activacion de Google OCR desde `Menu > Preferencias` reutiliza el mismo flujo controlado `prepare -> disclosure -> launch` y el mismo scope fijo `drive.file`, sin permitir al renderer elegir host, provider, scope ni credencial arbitrarios.

- [x] Inventario de persistencia y fronteras de archivo cerrado.
Registro de este release:
la persistencia principal sigue bajo `app.getPath('userData')/config`; los snapshots automaticos batch quedan en `config/saved_current_texts/`; los PDFs generados que el usuario decide conservar quedan en `app.getPath('userData')/tot-generated-pdfs/`; los temporales locales de runtime se centralizan bajo un root app-owned resuelto por `electron/app_temp_paths.js`; `electron/assets/ocr_google_drive/credentials.json` sigue siendo material controlado empaquetado del owner y `token.json` del usuario queda fuera del artefacto. El renderer no obtiene rutas privilegiadas arbitrarias: solo puede operar sobre destinos app-owned o rutas elegidas via dialogos/sistemas de archivo ya mediados por `main`.

- [x] Inventario de conectividad y aperturas externas cerrado.
Registro de este release:
updater contra GitHub Releases; apertura externa mediada por `open-external-url`; `mailto:` restringido a `cibersino@gmail.com`; Google OCR sigue siendo opt-in en navegador externo con scope `drive.file`; la activacion puede iniciarse ahora desde `Menu > Preferencias` o desde la recuperacion de extraccion, pero no introduce destinos nuevos; reading-test puede abrir la carpeta publica de Google Drive; la extension Chrome sigue abriendose solo via allowlist a Chrome Web Store.

- [x] Inventario de material sensible o controlado cerrado.
Registro de este release:
`electron/assets/ocr_google_drive/credentials.json` viaja en el build como material controlado del owner; los tokens OAuth del usuario, snapshots de usuario, PDFs retenidos, temporales de OCR y demas estado mutable viven fuera del artefacto; no se observan `.env`, secretos de usuario, logs, dumps ni backups como parte del payload distribuido esperado.

- [x] Inventario de contenido empaquetado y dependencias runtime cerrado.
Registro de este release:
`resources/app.asar` contiene `electron/**`, `public/**`, `i18n/**`, `LICENSE`, `PRIVACY.md`, `public/third_party_licenses/*`, `electron/assets/ocr_google_drive/*` y las dependencias runtime redistribuidas. El delta frente a `1.3.0` agrega `pdf-lib@1.17.1` y su notice local para materializar subsets PDF por rango. `resources/app.asar.unpacked` sigue acotado al runtime nativo esperado de `@img/sharp-win32-x64` (`libvips-42.dll`, `libvips-cpp-8.17.2.dll`, `sharp-win32-x64.node`), sin carpetas auxiliares de desarrollo no inventariadas.

- [x] Delta de seguridad del release cerrado.
Registro de este release:
el delta frente a `1.3.0` agrega una nueva fase previa de inspeccion y seleccion de paginas para PDFs, split automatico de PDFs pesados para OCR, revelado de PDFs generados retenidos, un root temporal app-owned comun, el lifecycle `current text processing` con settle explicito y el arranque renderer-owned del Text Editor. Ninguno de esos cambios introduce `webview`, contenido remoto arbitrario, privilegios genericos de preload, proveedor nuevo de red, ni capacidad para que el renderer elija rutas/hosts/scopes por fuera de la politica de `main`.

## 3. Gate previo al packaging

### 3.1 Aislamiento de procesos y navegacion

- [x] Toda ventana renderer vigente del release usa `contextIsolation: true`, `nodeIntegration: false` y `sandbox: true`, salvo excepcion revisada y justificada explicitamente.
- [x] No se agrega `webview` ni una superficie equivalente privilegiada sin revision especifica de seguridad.
- [x] La UI distribuida no carga contenido remoto arbitrario para operar.
- [x] Las superficies HTML del release mantienen una politica de contenido y ejecucion coherente con el modelo local del producto.
- [x] La navegacion y las aperturas de ventanas secundarias estan denegadas por defecto o pasan por control explicito y acotado.
- [x] El renderer no toma decisiones de confianza por si solo.

### 3.2 Preloads, IPC y capacidades privilegiadas

- [x] Cada preload expone una API pequena, con proposito explicito y sin primitivas genericas de privilegio.
- [x] No se expone `ipcRenderer` crudo, `require`, `process`, `fs` ni superficies equivalentes al renderer.
- [x] Todo canal u operacion sensible valida forma de payload, tipos, limites de tamano y campos admitidos.
- [x] Las operaciones sensibles limitadas a una ventana o flujo validan origen o `sender` cuando corresponde.
- [x] Los flujos de varios pasos mantienen su estado autoritativo en `main`, no confian en payloads reinyectados por renderer y revalidan antes de ejecutar cuando el riesgo lo exige.
- [x] Los fallos vuelven de forma estructurada y no ensanchan la superficie de privilegio mediante fallbacks implicitos.

### 3.3 Persistencia, archivos e inputs no confiables

- [x] Las escrituras persistentes quedan confinadas al almacenamiento propio de la app o a destinos elegidos explicitamente por el usuario.
- [x] El renderer no puede dictar rutas privilegiadas arbitrarias al proceso `main`.
- [x] Los flujos de importacion, drag-drop, picker, OCR, archivos comprimidos, documentos, URLs u otros inputs externos pasan por validacion explicita y politica clara de duplicados/sobrescritura.
- [x] Todo material sensible local tiene ciclo de vida documentado: origen, ubicacion, quien lo escribe, como se elimina, rota o invalida.
- [x] Cualquier material empaquetado controlado por la app queda documentado por separado del estado mutable del usuario.

### 3.4 Conectividad, servicios externos y aperturas fuera de la app

- [x] Cada flujo conectado tiene destino inventariado, proposito documentado, iniciador claro, modelo de autenticacion y datos salientes identificados.
- [x] La apertura de URLs externas, `mailto:` y documentos de la app queda mediada por `main` y restringida por politica explicita.
- [x] El updater o verificador de releases no descarga ni ejecuta codigo en silencio, salvo revision separada y documentada.
- [x] El renderer no puede elegir arbitrariamente proveedor, host, endpoint, scope, permiso o credencial para un flujo conectado.
- [x] Si una feature envia datos fuera del dispositivo, el baseline versionado deja constancia explicita del dato que sale y de la condicion que dispara el envio.

### 3.5 Higiene de packaging y supply chain

- [x] El build incluye solo contenido runtime necesario para distribuir la app.
- [x] Quedan fuera del build herramientas locales, backups, dumps, carpetas de evidencia, salidas temporales, `.env`, estado mutable del usuario y cualquier otro material no distribuible.
- [x] El conjunto esperado de dependencias runtime se revisa antes del empaquetado.
- [x] Los modulos nativos o carpetas desempaquetadas reciben revision explicita cuando formen parte del artefacto.
- [x] El build distribuible no abre DevTools automaticamente ni deja hooks de debug no intencionales habilitados para el usuario final.
- [x] Las afirmaciones de seguridad y privacidad en `PRIVACY.md`, `README.md`, documentacion in-app, sitio web y release notes coinciden con la implementacion real.

## 4. Gate del artefacto final

- [x] El artefacto inspeccionado queda identificado por nombre exacto y hash.
- [x] El contenido empaquetado real (`app.asar`, `app.asar.unpacked` o equivalente) se inspecciona contra el inventario runtime del release.
- [x] No aparecen ejecutables, scripts, credenciales, tokens de usuario, logs, backups ni material de desarrollo no esperado dentro del artefacto.
- [x] La smoke validation del build empaquetado confirma que el renderer no expone Node ni primitivas equivalentes de privilegio.
- [x] La smoke validation del build empaquetado confirma que aperturas externas, flujos conectados y persistencia siguen el mismo modelo de confianza revisado en el gate previo.
- [x] Si el artefacto cambia despues de esta revision, el gate del artefacto se repite completo.

## 5. Criterio de veredicto

`PASS`.
