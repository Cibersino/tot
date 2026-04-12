# Baseline operativo de seguridad de release

Este documento responde una sola pregunta: `¿el artefacto evaluado es suficientemente seguro para distribuirse?`

La plantilla reusable debe contener solo controles estables.  
Todo inventario exacto del release debe vivir en su documento versionado:
`docs/releases/<release-id>/security_baseline_<release_file_id>.md`
Aquí, `<release_file_id>` significa el identificador del release normalizado para nombre de archivo.

## Reglas de mantenimiento

- No fijar aquí nombres exactos de canales IPC, rutas internas cambiantes, hosts, hashes, versiones de dependencias ni evidencia de un release concreto.
- Todo valor exacto debe quedar en el baseline versionado del release.
- Si una excepción aplica solo a un release, documentarla solo en el baseline versionado.
- Actualizar esta plantilla solo cuando cambie el modelo base de seguridad del producto.
- El veredicto vale solo para el artefacto inspeccionado. Si se reempaqueta, se repite el gate del artefacto.

## Campos mínimos del release versionado

- Fecha de ejecución: `2026-04-11`
- Release ID: `v1.1.1`
- Commit freeze: `dc23cf11e31a3248fc3a76a6fceb856ab59d12f7`
- Artefactos inspeccionados: `toT-1.1.1-win-x64.zip`
- Hashes de artefacto: `892D09EB42B156FBD9EDC7CE1961355479BB411F96B9AD48865F5B90D0B82141`
- Referencia base para comparar delta: `v1.0.0|aff7cf9c87a6081804f72ac84b2f7d86da0bbef9`
- Veredicto final: `<PASS | BLOCKER | PENDING>`

## 1. Hechos estables del producto que este baseline asume

- El producto es una app de escritorio Electron con proceso `main`, ventanas `renderer` y `preload` como puente privilegiado.
- La UI distribuida viaja dentro del build; cualquier salida a red, al navegador externo o al sistema operativo es una capacidad privilegiada que debe revisarse.
- El renderer debe tratarse como superficie no confiable; la decisión de seguridad pertenece al proceso `main`.
- El estado del usuario y la persistencia de runtime viven fuera del árbol versionado y deben distinguirse del material empaquetado por el release.
- El veredicto de seguridad es por artefacto final, no solo por estado del repo.

## 2. Inventarios obligatorios del release

- [ ] Inventario de ventanas y preloads cerrado.
Registro requerido en el baseline versionado: cada ventana renderer vigente, su propósito, su HTML, su preload, dónde se configura y qué controles de aislamiento/navegación usa.

- [ ] Inventario de capacidades privilegiadas cerrado.
Registro requerido en el baseline versionado: APIs expuestas al renderer, canales IPC, operaciones sensibles, validaciones, límites, `sender guards` cuando apliquen y cambios respecto de la referencia base.

- [ ] Inventario de persistencia y fronteras de archivo cerrado.
Registro requerido en el baseline versionado: qué datos persiste la app, dónde, quién los escribe, qué entradas no confiables llegan a disco, qué flujos usan diálogos del sistema y qué controles evitan rutas arbitrarias.

- [ ] Inventario de conectividad y aperturas externas cerrado.
Registro requerido en el baseline versionado: endpoints, hosts, esquemas externos, servicios conectados, propósito, iniciador del flujo, datos enviados, autenticación, permisos/scopes y política de desconexión o revocación cuando aplique.

- [ ] Inventario de material sensible o controlado cerrado.
Registro requerido en el baseline versionado: secretos, credenciales, configuraciones empaquetadas, tokens locales del usuario, política de inclusión/exclusión en repo y artefacto, y tratamiento de cualquier material controlado del release.

- [ ] Inventario de contenido empaquetado y dependencias runtime cerrado.
Registro requerido en el baseline versionado: dependencias de producción efectivamente redistribuidas, módulos nativos desempacados, recursos ejecutables relevantes y diferencias respecto del release de referencia.

- [ ] Delta de seguridad del release cerrado.
Registro requerido en el baseline versionado: superficies nuevas, modificadas o retiradas; riesgos residuales; y razón explícita por la que el delta no bloquea o sí bloquea publicación.

## 3. Gate previo al packaging

### 3.1 Aislamiento de procesos y navegación

- [ ] Toda ventana renderer vigente del release usa `contextIsolation: true`, `nodeIntegration: false` y `sandbox: true`, salvo excepción revisada y justificada explícitamente.
- [ ] No se agrega `webview` ni una superficie equivalente privilegiada sin revisión específica de seguridad.
- [ ] La UI distribuida no carga contenido remoto arbitrario para operar.
- [ ] Las superficies HTML del release mantienen una política de contenido y ejecución coherente con el modelo local del producto; cualquier relajación de scripts remotos, inline o equivalentes se trata como excepción revisada.
- [ ] La navegación y las aperturas de ventanas secundarias están denegadas por defecto o pasan por control explícito y acotado.
- [ ] El renderer no toma decisiones de confianza por sí solo.

### 3.2 Preloads, IPC y capacidades privilegiadas

- [ ] Cada preload expone una API pequeña, con propósito explícito y sin primitivas genéricas de privilegio.
- [ ] No se expone `ipcRenderer` crudo, `require`, `process`, `fs` ni superficies equivalentes al renderer.
- [ ] Todo canal u operación sensible valida forma de payload, tipos, límites de tamaño y campos admitidos.
- [ ] Las operaciones sensibles limitadas a una ventana o flujo validan origen o `sender` cuando corresponde.
- [ ] Los flujos de varios pasos mantienen su estado autoritativo en `main`, no confían en payloads reinyectados por renderer y revalidan antes de ejecutar cuando el riesgo lo exige.
- [ ] Los fallos vuelven de forma estructurada y no ensanchan la superficie de privilegio mediante fallbacks implícitos.

### 3.3 Persistencia, archivos e inputs no confiables

- [ ] Las escrituras persistentes quedan confinadas al almacenamiento propio de la app o a destinos elegidos explícitamente por el usuario.
- [ ] El renderer no puede dictar rutas privilegiadas arbitrarias al proceso `main`.
- [ ] Los flujos de importación, drag-drop, picker, OCR, archivos comprimidos, documentos, URLs u otros inputs externos pasan por validación explícita y política clara de duplicados/sobrescritura.
- [ ] Todo material sensible local tiene ciclo de vida documentado: origen, ubicación, quién lo escribe, cómo se elimina, rota o invalida.
- [ ] Cualquier material empaquetado controlado por la app queda documentado por separado del estado mutable del usuario.

### 3.4 Conectividad, servicios externos y aperturas fuera de la app

- [ ] Cada flujo conectado tiene destino inventariado, propósito documentado, iniciador claro, modelo de autenticación y datos salientes identificados.
- [ ] La apertura de URLs externas, `mailto:` y documentos de la app queda mediada por `main` y restringida por política explícita.
- [ ] El updater o verificador de releases no descarga ni ejecuta código en silencio, salvo revisión separada y documentada.
- [ ] El renderer no puede elegir arbitrariamente proveedor, host, endpoint, scope, permiso o credencial para un flujo conectado.
- [ ] Si una feature envía datos fuera del dispositivo, el baseline versionado deja constancia explícita del dato que sale y de la condición que dispara el envío.

### 3.5 Higiene de packaging y supply chain

- [ ] El build incluye solo contenido runtime necesario para distribuir la app.
- [ ] Quedan fuera del build herramientas locales, backups, dumps, carpetas de evidencia, salidas temporales, `.env`, estado mutable del usuario y cualquier otro material no distribuible.
- [ ] El conjunto esperado de dependencias runtime se revisa antes del empaquetado.
- [ ] Los módulos nativos o carpetas desempaquetadas reciben revisión explícita cuando formen parte del artefacto.
- [ ] El build distribuible no abre DevTools automáticamente ni deja hooks de debug no intencionales habilitados para el usuario final.
- [ ] Las afirmaciones de seguridad y privacidad en `PRIVACY.md`, `README.md`, documentación in-app, sitio web y release notes coinciden con la implementación real.

## 4. Gate del artefacto final

- [ ] El artefacto inspeccionado queda identificado por nombre exacto y hash.
- [ ] El contenido empaquetado real (`app.asar`, `app.asar.unpacked` o equivalente) se inspecciona contra el inventario runtime del release.
- [ ] No aparecen ejecutables, scripts, credenciales, tokens de usuario, logs, backups ni material de desarrollo no esperado dentro del artefacto.
- [ ] La smoke validation del build empaquetado confirma que el renderer no expone Node ni primitivas equivalentes de privilegio.
- [ ] La smoke validation del build empaquetado confirma que aperturas externas, flujos conectados y persistencia siguen el mismo modelo de confianza revisado en el gate previo.
- [ ] Si el artefacto cambia después de esta revisión, el gate del artefacto se repite completo.

## 5. Criterio de veredicto

`BLOCKER` si ocurre cualquiera:

- Se rompe el aislamiento básico de renderer (`contextIsolation`, `nodeIntegration`, `sandbox`) sin rediseño aprobado.
- Aparece una API preload o IPC que expone privilegios genéricos o sin validación suficiente.
- El artefacto incluye material sensible, material de desarrollo o dependencias runtime no inventariadas.
- Existe un flujo conectado o una apertura externa no inventariada o controlada de forma ambigua.
- La documentación de seguridad/privacidad contradice el comportamiento real del release.

`PENDING` si ocurre cualquiera:

- Falta cualquier inventario obligatorio del release.
- Falta ejecutar el gate del artefacto final sobre el build exacto que se quiere publicar.
- Existe riesgo residual relevante sin decisión explícita ni follow-up identificado.

`PASS` solo cuando:

- El gate previo al packaging y el gate del artefacto final están cerrados para el mismo artefacto.
- El delta de seguridad del release quedó documentado de forma explícita.
- No queda ningún blocker abierto para publicación.
