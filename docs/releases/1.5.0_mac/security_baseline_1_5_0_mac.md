# Baseline operativo de seguridad de release

## Campos mínimos del release versionado

- Fecha de ejecución: `2026-06-21`
- Release ID: `v1.5.0`
- Commit freeze: `a4ae6c1985403a3024ab9328299193dc531e1720`
- Artefactos inspeccionados: `toT-1.5.0-mac-arm64.dmg`
- Hashes de artefacto: `2f49b0ffaf0dfa7224cfbf01488fccd5f72a527bae479a28412492e8910282e7`
- Referencia base para comparar delta: `v1.4.1|29921a471bf8445c14d13dc0c102c09dedf5cede`
- Veredicto final: `PASS`

## 1. Hechos estables del producto que este baseline asume

- El producto es una app de escritorio Electron con proceso `main`, ventanas `renderer` y `preload`.
- El renderer se trata como superficie no confiable.
- El veredicto de seguridad vale solo para el artefacto inspeccionado.

## 2. Inventarios obligatorios del release

- [x] Inventario de ventanas y preloads cerrado.
Registro de este release:
main `public/index.html` + `electron/preload.js`; editor `public/editor.html` + `electron/editor_preload.js`; find `public/editor_find.html` + `electron/editor_find_preload.js`; task editor `public/task_editor.html` + `electron/task_editor_preload.js`; preset `public/preset_modal.html` + `electron/preset_preload.js`; language `public/language_window.html` + `electron/language_preload.js`; flotante `public/flotante.html` + `electron/flotante_preload.js`; reading-test questions `public/reading_test_questions.html` + `electron/reading_test_questions_preload.js`; reading-test result `public/reading_test_result.html` + `electron/reading_test_result_preload.js`. `1.5.0` no agrega ni remueve `BrowserWindow`; las mejoras se centran en menu/iconos y en el flujo de extraction de texto.

- [x] Inventario de capacidades privilegiadas cerrado.
Registro de este release:
No se agregan APIs preload nuevas ni canales IPC nuevos respecto de `1.4.1`. El soporte EPUB y JP2 se integra en los flujos de text extraction ya existentes sin nuevos canales genéricos; la migración de iconos y el boton dedicado de Reading speed test no introducen privilegios de carga remota.

- [x] Inventario de persistencia y fronteras de archivo cerrado.
Registro de este release:
El soporte EPUB resuelve el orden de lectura de `container.xml` + `OPF/spine` dentro del flujo local existente. El soporte JP2 OCR normaliza a PNG localmente con OpenJPEG WASM vendorizado y no añade rutas de archivo arbitrarias nuevas al proceso `main`.

- [x] Inventario de conectividad y aperturas externas cerrado.
Registro de este release:
No se agregan hosts, esquemas o servicios externos nuevos. Google OCR sigue siendo opt-in; el updater y los enlaces externos son los mismos que en la referencia base.

- [x] Inventario de material sensible o controlado cerrado.
Registro de este release:
El build mantiene la separación de material controlado del owner y el estado mutable del usuario. El runtime JP2 vendorizado se trata como material empaquetado controlado con documentación de provenance, pero no introduce secretos ni material sensible para el usuario final.

- [x] Inventario de contenido empaquetado y dependencias runtime cerrado.
Registro de este release:
Se redistribuye `@xmldom/xmldom@0.8.13` para EPUB y OpenJPEG WASM para JP2. No se agregan capacidades nativas nuevas fuera de las ya previstas para el build de la plataforma.

- [x] Delta de seguridad del release cerrado.
Registro de este release:
Frente a `1.4.1`, el delta es de bajo riesgo: soporte de formatos adicionales (`.epub`, `.jp2`), normalización de iconos funcionales, mejora de coherencia visual y la misma ruta de packaging del artefacto. No aparecen cambios de seguridad de proceso o de navegación no auditados.

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
