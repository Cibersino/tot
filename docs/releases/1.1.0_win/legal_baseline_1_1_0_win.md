# Baseline operativo legal de release

Este documento responde una sola pregunta: `¿el artefacto evaluado es legalmente redistribuible?`

La plantilla reusable debe contener solo controles estables.  
Todo inventario exacto del release debe vivir en su documento versionado:
`docs/releases/<release-id>/legal_baseline_<release_file_id>.md`
Aquí, `<release_file_id>` significa el identificador del release normalizado para nombre de archivo.

## Reglas de mantenimiento

- No fijar aquí versiones exactas de dependencias, rutas cambiantes, licencias concretas por release, hosts, hashes ni evidencia puntual.
- Todo valor exacto debe quedar en el baseline versionado del release.
- Si una excepción aplica solo a un release, documentarla solo en el baseline versionado.
- Actualizar esta plantilla solo cuando cambie la postura legal base del producto o su modelo de redistribución.
- El veredicto vale solo para el artefacto inspeccionado. Si se reempaqueta, se repite el gate del artefacto.

## Campos mínimos del release versionado

- Fecha de ejecución: `2026-04-11`
- Release ID: `v1.1.1`
- Commit freeze: `b0e4d6d298eac4f13ebd176c80efeb8dedd1f696`
- Artefactos inspeccionados: `toT-1.1.1-win-x64.zip`
- Hashes de artefacto: `4D86BEFC3BF64AADD5158DB6A236D193B88757B03F8287EDB877E206D9A4E767`
- Referencia base para comparar delta: `v1.0.0|aff7cf9c87a6081804f72ac84b2f7d86da0bbef9`
- Veredicto final: `<PASS | BLOCKER | PENDING>`

## 1. Hechos estables del producto que este baseline asume

- El producto se distribuye como app de escritorio empaquetada.
- El artefacto puede redistribuir runtime, dependencias de producción, recursos visuales, documentación in-app y otros materiales entregados al usuario final.
- La app mantiene superficies legales y de privacidad en más de un lugar: artefacto distribuido, documentación del repo, superficies informativas in-app y sitio web público.
- Algunas features pueden abrir servicios externos o enviar datos a terceros solo bajo flujos definidos por la app; esos flujos deben tener cobertura legal y documental alineada.
- El veredicto legal es por artefacto final, no solo por estado del repo.

## 2. Inventarios obligatorios del release

- [ ] Inventario de componentes redistribuidos de terceros cerrado.
Registro requerido en el baseline versionado: cada componente redistribuido por el artefacto, su versión exacta, origen, licencia o términos aplicables, obligación de notice/atribución y archivo o superficie donde esa obligación queda cubierta.

- [ ] Inventario de assets, fonts y marcas de terceros cerrado.
Registro requerido en el baseline versionado: procedencia, permiso de uso, obligación documental y ubicación efectiva en repo y artefacto para todo asset no propio que viaje con la app o con el sitio público relevante para el release.

- [ ] Inventario de servicios externos y disclosures cerrado.
Registro requerido en el baseline versionado: terceros con los que interactúa la app, propósito, datos que salen del dispositivo, condición que dispara el flujo, cuenta o permisos requeridos, y documentación user-facing que cubre ese comportamiento.

- [ ] Inventario de material controlado por la app cerrado.
Registro requerido en el baseline versionado: cualquier credencial, configuración u otro material distribuido intencionalmente por el owner de la app, la razón por la que viaja en el artefacto, su tratamiento separado de notices de terceros y su política de inclusión/exclusión en git y packaging.

- [ ] Inventario de documentos legales cerrado.
Registro requerido en el baseline versionado: documentos que deben entregarse al usuario en este release, incluyendo al menos `LICENSE`, `PRIVACY.md` y cualquier superficie legal o informativa que el artefacto actual exponga in-app o vía sitio público.

- [ ] Delta legal del release cerrado.
Registro requerido en el baseline versionado: altas, bajas o cambios en terceros redistribuidos, servicios externos, disclosures, documentos legales, material controlado y postura pública del release respecto de la referencia base.

- [ ] Inventario legal del artefacto final cerrado.
Registro requerido en el baseline versionado: lista efectiva de documentos, notices, componentes runtime y material sensible o controlado observado en el build final.

## 3. Gate previo al packaging

### 3.1 Redistribución de terceros

- [ ] Todo componente redistribuido queda clasificado con nombre, versión, origen, licencia o términos aplicables y decisión de redistribución.
- [ ] Toda obligación de notice, atribución, copia de licencia o texto de terceros tiene una cobertura explícita en el release.
- [ ] Ningún componente de terceros queda en estado ambiguo o sin clasificación legal.
- [ ] Fonts, imágenes, iconos, logos y otros assets de terceros tienen procedencia y permiso de uso identificados.

### 3.2 Servicios externos, privacidad y disclosures

- [ ] Todo servicio externo o flujo conectado tiene una descripción user-facing coherente con la implementación real.
- [ ] La documentación user-facing aclara qué dato sale del dispositivo, bajo qué acción o condición y hacia qué tercero.
- [ ] Cuentas, permisos, scopes, consentimientos o pasos de autenticación requeridos por una feature conectada quedan documentados cuando apliquen.
- [ ] La app no promete comportamiento `offline`, `local-only`, `sin terceros` o equivalente si el release real tiene excepciones no descritas.
- [ ] Identidad del operador, canales de soporte, correo de contacto, tracker público y rutas oficiales de descarga son coherentes entre sí.

### 3.3 Material controlado por la app

- [ ] Todo material sensible o controlado distribuido intencionalmente por la app queda documentado por separado de los notices de terceros.
- [ ] La razón por la que ese material viaja en el artefacto queda explícita y revisada.
- [ ] La política de git, packaging y rotación de ese material queda documentada de forma coherente con el modelo del producto.
- [ ] Ningún token mutable del usuario final, estado personal o secreto accidental forma parte del artefacto distribuible.

### 3.4 Documentos legales y alineación documental

- [ ] Existe una lista explícita de documentos que el release debe entregar al usuario.
- [ ] `LICENSE` y `PRIVACY.md` quedan cubiertos por el release.
- [ ] Las superficies in-app, `README.md`, changelogs y sitio web público que describen la app son coherentes con la postura legal y de privacidad real del release.
- [ ] Si el release cambia la postura legal o de privacidad, el cambio queda reflejado en la documentación pública e interna pertinente.
- [ ] Las rutas de ayuda, privacidad, soporte y documentación enlazadas desde la app o el sitio siguen siendo válidas para este release.

### 3.5 Higiene de packaging

- [ ] La configuración de build incluye los documentos legales y notices que el release debe distribuir.
- [ ] El build no arrastra borradores, backups, secretos, evidencia interna ni otros materiales no distribuibles.
- [ ] El inventario de terceros, documentos y material controlado puede reconciliarse con lo que el packaging realmente pretende incluir.

## 4. Gate del artefacto final

- [ ] El artefacto inspeccionado queda identificado por nombre exacto y hash.
- [ ] El contenido empaquetado real se inspecciona contra el inventario legal del release.
- [ ] Los documentos legales y notices requeridos están presentes en el build final y son accesibles de forma razonable para el usuario.
- [ ] Las dependencias runtime, módulos nativos, fonts, assets y demás componentes redistribuidos observados en el artefacto coinciden con el inventario clasificado.
- [ ] El build final no contiene terceros no inventariados, tokens de usuario, secretos accidentales ni material sensible no declarado.
- [ ] Las superficies in-app que abren documentos legales o páginas públicas siguen apuntando a destinos válidos para este release.
- [ ] Si el artefacto cambia después de esta revisión, el gate del artefacto se repite completo.

## 5. Criterio de veredicto

`BLOCKER` si ocurre cualquiera:

- Hay un componente redistribuido sin licencia o términos identificados.
- Falta un notice, atribución o documento legal obligatorio para el artefacto final.
- Existe un servicio externo o flujo de datos a terceros sin disclosure coherente.
- El build incluye un token mutable de usuario, un secreto accidental o material sensible no declarado.
- La documentación pública o in-app contradice la postura legal o de privacidad real del release.

`PENDING` si ocurre cualquiera:

- Falta cualquier inventario obligatorio del release.
- Falta ejecutar el gate del artefacto final sobre el build exacto que se quiere publicar.
- Existe un componente, servicio o material controlado cuya clasificación legal aún no está cerrada.

`PASS` solo cuando:

- El gate previo al packaging y el gate del artefacto final están cerrados para el mismo artefacto.
- El delta legal del release quedó documentado de forma explícita.
- No queda ningún blocker abierto para publicación.
