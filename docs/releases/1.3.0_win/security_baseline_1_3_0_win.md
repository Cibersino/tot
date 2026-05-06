# Baseline operativo de seguridad de release

## Campos mínimos del release versionado

- Fecha de ejecución: `2026-05-06`
- Release ID: `v1.3.0`
- Commit freeze: `eaacf3227c40202091b1d7b030143b39e597814b`
- Artefactos inspeccionados: `toT-1.3.0-win-x64.zip`
- Hashes de artefacto: `AE550228DA18FB3BD5EC664CBDF49CF254201DC2F2473FFAA6F9FCD9BC5F2D78`
- Referencia base para comparar delta: `v1.2.0|ef976e9dbf554113b164b1d7a3352d2d9815b5c7`
- Veredicto final: `PASS`

## 1. Hechos estables del producto que este baseline asume

- El producto es una app de escritorio Electron con proceso `main`, ventanas `renderer` y `preload`.
- El renderer se trata como superficie no confiable.
- El veredicto de seguridad vale solo para el artefacto inspeccionado.

## 2. Inventarios obligatorios del release

- [x] Inventario de ventanas y preloads cerrado.
Registro de este release:
main `public/index.html` + `electron/preload.js`; editor `public/editor.html` + `electron/editor_preload.js`; find `public/editor_find.html` + `electron/editor_find_preload.js`; task editor `public/task_editor.html` + `electron/task_editor_preload.js`; preset `public/preset_modal.html` + `electron/preset_preload.js`; language `public/language_window.html` + `electron/language_preload.js`; flotante `public/flotante.html` + `electron/flotante_preload.js`; reading-test questions `public/reading_test_questions.html` + `electron/reading_test_questions_preload.js`; reading-test result `public/reading_test_result.html` + `electron/reading_test_result_preload.js`. La creación/configuración vive en `electron/main.js`, `electron/editor_find_main.js` y `electron/reading_test_session_windows.js`.

- [x] Inventario de capacidades privilegiadas cerrado.
Registro de este release:
sender guards en `electron/text_state.js`, `electron/current_text_snapshots_main.js`, `electron/tasks_main.js` y `electron/editor_find_main.js`; `link_openers.js` media `open-external-url` y `appdoc:` con allowlist explícita para GitHub, Ko-fi, Chrome Web Store y `mailto:cibersino@gmail.com`; la superficie histórica `import-extract-*` queda renombrada a `text-extraction-*` sin abrir privilegios nuevos; `reading-test-set-show-bundled-entries` y `spellcheckAvailable` siguen siendo derivados/main-owned y no decisión autónoma del renderer.

- [x] Inventario de persistencia y fronteras de archivo cerrado.
Registro de este release:
persistencia bajo `app.getPath('userData')/config`; `text_extraction_state.json` reemplaza a `import_extract_state.json` para última carpeta usada; `reading_test_pool_state.json` ahora guarda `showBundledEntries`, `used` y `managedBundledHash`; `tasks/task_editor_state.json` reemplaza el estado posicional previo con shape `{ maximized, reduced }`; las listas/biblioteca de tareas dejan de persistir el campo `tipo`; `credentials.json` empaquetado como material controlado de la app; `token.json` del usuario queda fuera del artefacto.

- [x] Inventario de conectividad y aperturas externas cerrado.
Registro de este release:
updater contra GitHub Releases; apertura externa mediada por `open-external-url`; `mailto:` restringido a `cibersino@gmail.com`; OCR Google opt-in en navegador externo con scope `drive.file`; reading-test puede abrir la carpeta pública de Google Drive; el nuevo modal `Browser extension` abre solo `https://chromewebstore.google.com/detail/aaadjdlieimolidjdkbimjcdojologld` vía la misma allowlist.

- [x] Inventario de material sensible o controlado cerrado.
Registro de este release:
`electron/assets/ocr_google_drive/credentials.json` y `README.md` viajan en el build como material controlado del owner; no se observan `.env`, secretos de usuario, `token.json`, dumps, logs ni estado mutable del usuario dentro del artefacto final.

- [x] Inventario de contenido empaquetado y dependencias runtime cerrado.
Registro de este release:
`resources/app.asar` contiene `electron/**`, `public/**`, `i18n/**`, `LICENSE`, `PRIVACY.md`, `public/third_party_licenses/*`, `electron/assets/ocr_google_drive/*` y las dependencias runtime redistribuidas; `resources/app.asar.unpacked` queda acotado a `node_modules/@img/sharp-win32-x64/**` (`libvips-42.dll`, `libvips-cpp-8.17.2.dll`, `sharp-win32-x64.node`). No se observaron carpetas auxiliares de desarrollo fuera de ese runtime nativo esperado.

- [x] Delta de seguridad del release cerrado.
Registro de este release:
el delta frente a `1.2.0` introduce más idiomas UI, nueva resolución runtime de spellcheck, renombre `import/extract` -> `text extraction`, persistencia `showBundledEntries`, nuevo estado de ventana del task editor y un modal in-app hacia Chrome Web Store. Ninguno de esos cambios introduce `webview`, contenido remoto arbitrario, privilegios genéricos en preload ni endpoints seleccionables libremente por renderer.

## 3. Gate previo al packaging

### 3.1 Aislamiento de procesos y navegación

- [x] Toda ventana renderer vigente del release usa `contextIsolation: true`, `nodeIntegration: false` y `sandbox: true`, salvo excepción revisada y justificada explícitamente.
- [x] No se agrega `webview` ni una superficie equivalente privilegiada sin revisión específica de seguridad.
- [x] La UI distribuida no carga contenido remoto arbitrario para operar.
- [x] Las superficies HTML del release mantienen una política de contenido y ejecución coherente con el modelo local del producto.
- [x] La navegación y las aperturas de ventanas secundarias están denegadas por defecto o pasan por control explícito y acotado.
- [x] El renderer no toma decisiones de confianza por sí solo.

### 3.2 Preloads, IPC y capacidades privilegiadas

- [x] Cada preload expone una API pequeña, con propósito explícito y sin primitivas genéricas de privilegio.
- [x] No se expone `ipcRenderer` crudo, `require`, `process`, `fs` ni superficies equivalentes al renderer.
- [x] Todo canal u operación sensible valida forma de payload, tipos, límites de tamaño y campos admitidos.
- [x] Las operaciones sensibles limitadas a una ventana o flujo validan origen o `sender` cuando corresponde.
- [x] Los flujos de varios pasos mantienen su estado autoritativo en `main`, no confían en payloads reinyectados por renderer y revalidan antes de ejecutar cuando el riesgo lo exige.
- [x] Los fallos vuelven de forma estructurada y no ensanchan la superficie de privilegio mediante fallbacks implícitos.

### 3.3 Persistencia, archivos e inputs no confiables

- [x] Las escrituras persistentes quedan confinadas al almacenamiento propio de la app o a destinos elegidos explícitamente por el usuario.
- [x] El renderer no puede dictar rutas privilegiadas arbitrarias al proceso `main`.
- [x] Los flujos de importación, drag-drop, picker, OCR, archivos comprimidos, documentos, URLs u otros inputs externos pasan por validación explícita y política clara de duplicados/sobrescritura.
- [x] Todo material sensible local tiene ciclo de vida documentado: origen, ubicación, quién lo escribe, cómo se elimina, rota o invalida.
- [x] Cualquier material empaquetado controlado por la app queda documentado por separado del estado mutable del usuario.

### 3.4 Conectividad, servicios externos y aperturas fuera de la app

- [x] Cada flujo conectado tiene destino inventariado, propósito documentado, iniciador claro, modelo de autenticación y datos salientes identificados.
- [x] La apertura de URLs externas, `mailto:` y documentos de la app queda mediada por `main` y restringida por política explícita.
- [x] El updater o verificador de releases no descarga ni ejecuta código en silencio, salvo revisión separada y documentada.
- [x] El renderer no puede elegir arbitrariamente proveedor, host, endpoint, scope, permiso o credencial para un flujo conectado.
- [x] Si una feature envía datos fuera del dispositivo, el baseline versionado deja constancia explícita del dato que sale y de la condición que dispara el envío.

### 3.5 Higiene de packaging y supply chain

- [x] El build incluye solo contenido runtime necesario para distribuir la app.
- [x] Quedan fuera del build herramientas locales, backups, dumps, carpetas de evidencia, salidas temporales, `.env`, estado mutable del usuario y cualquier otro material no distribuible.
- [x] El conjunto esperado de dependencias runtime se revisa antes del empaquetado.
- [x] Los módulos nativos o carpetas desempaquetadas reciben revisión explícita cuando formen parte del artefacto.
- [x] El build distribuible no abre DevTools automáticamente ni deja hooks de debug no intencionales habilitados para el usuario final.
- [x] Las afirmaciones de seguridad y privacidad en `PRIVACY.md`, `README.md`, documentación in-app, sitio web y release notes coinciden con la implementación real.

## 4. Gate del artefacto final

- [x] El artefacto inspeccionado queda identificado por nombre exacto y hash.
- [x] El contenido empaquetado real (`app.asar`, `app.asar.unpacked` o equivalente) se inspecciona contra el inventario runtime del release.
- [x] No aparecen ejecutables, scripts, credenciales, tokens de usuario, logs, backups ni material de desarrollo no esperado dentro del artefacto.
- [x] La smoke validation del build empaquetado confirma que el renderer no expone Node ni primitivas equivalentes de privilegio.
- [x] La smoke validation del build empaquetado confirma que aperturas externas, flujos conectados y persistencia siguen el mismo modelo de confianza revisado en el gate previo.
- [x] Si el artefacto cambia después de esta revisión, el gate del artefacto se repite completo.

## 5. Criterio de veredicto

`PASS`.
