# Baseline operativo legal de release

## Campos mínimos del release versionado

- Fecha de ejecución: `2026-04-22`
- Release ID: `v1.2.0`
- Commit freeze: `ef976e9dbf554113b164b1d7a3352d2d9815b5c7`
- Artefactos inspeccionados: `toT-1.2.0-win-x64.zip`
- Hashes de artefacto: `CA0BC7B138C79BA9998631B194410CAA0507842071FAE3AAD85F6F1DDE0DA089`
- Referencia base para comparar delta: `N/A`
- Veredicto final: `PASS`

## Excepción de este release

- No se incluye delta comparativo contra releases previos por instrucción explícita de este release.
- La referencia base queda `N/A`.
- La excepción aplica solo al delta documental; no sustituye el gate legal del artefacto final.

## 1. Hechos estables del producto que este baseline asume

- El producto se distribuye como app de escritorio empaquetada.
- El artefacto redistribuye runtime, dependencias de producción, recursos visuales, documentación in-app y material controlado del owner.
- El veredicto legal vale solo para el artefacto inspeccionado.

## 2. Inventarios obligatorios del release

- [x] Inventario de componentes redistribuidos de terceros cerrado.
Registro de este release:
`googleapis@171.4.0` (`Apache-2.0`), `mammoth@1.11.0` (`BSD-2-Clause`), `pdf-parse@1.1.1` (`MIT`), `sharp@0.34.4` (`Apache-2.0`), `adm-zip@0.5.16` (`MIT`), `@img/sharp-win32-x64@0.34.4` (`Apache-2.0 AND LGPL-3.0-or-later`), `Baskervville` (`OFL`), runtime Electron/Chromium.

- [x] Inventario de assets, fonts y marcas de terceros cerrado.
Registro de este release:
`public/assets/kofi_symbol.png` identificado como asset de branding; `Baskervville` redistribuida con su licencia; sin otros assets de tercero pendientes de clasificación en el artefacto inspeccionado.

- [x] Inventario de servicios externos y disclosures cerrado.
Registro de este release:
GitHub Releases API para updater manual; aperturas externas mediadas por allowlist; OCR Google documentado en `PRIVACY.md` y `public/info/acerca_de.html`, con scope `drive.file`.

- [x] Inventario de material controlado por la app cerrado.
Registro de este release:
`electron/assets/ocr_google_drive/credentials.json` y `README.md` viajan en el build como material controlado del owner; `token.json` mutable del usuario no forma parte del artefacto.

- [x] Inventario de documentos legales cerrado.
Registro de este release:
`LICENSE` y `PRIVACY.md` presentes en `app.asar`; `LICENSE.electron.txt` y `LICENSES.chromium.html` presentes en el build distribuido; `public/info/acerca_de.html` expone las superficies legales in-app.

- [x] Delta legal del release cerrado.
Registro de este release:
Excepción explícita: no se documenta delta comparativo en este release; referencia base `N/A`.

- [x] Inventario legal del artefacto final cerrado.
Registro de este release:
Se observaron en el build final `LICENSE`, `PRIVACY.md`, `public/info/acerca_de.html`, `public/third_party_licenses/*`, `LICENSE.electron.txt`, `LICENSES.chromium.html` y el material OCR controlado por la app.

## 3. Gate previo al packaging

### 3.1 Redistribución de terceros

- [x] Todo componente redistribuido queda clasificado con nombre, versión, origen, licencia o términos aplicables y decisión de redistribución.
- [x] Toda obligación de notice, atribución, copia de licencia o texto de terceros tiene una cobertura explícita en el release.
- [x] Ningún componente de terceros queda en estado ambiguo o sin clasificación legal.
- [x] Fonts, imágenes, iconos, logos y otros assets de terceros tienen procedencia y permiso de uso identificados.

### 3.2 Servicios externos, privacidad y disclosures

- [x] Todo servicio externo o flujo conectado tiene una descripción user-facing coherente con la implementación real.
- [x] La documentación user-facing aclara qué dato sale del dispositivo, bajo qué acción o condición y hacia qué tercero.
- [x] Cuentas, permisos, scopes, consentimientos o pasos de autenticación requeridos por una feature conectada quedan documentados cuando apliquen.
- [x] La app no promete comportamiento `offline`, `local-only`, `sin terceros` o equivalente si el release real tiene excepciones no descritas.
- [x] Identidad del operador, canales de soporte, correo de contacto, tracker público y rutas oficiales de descarga son coherentes entre sí.

### 3.3 Material controlado por la app

- [x] Todo material sensible o controlado distribuido intencionalmente por la app queda documentado por separado de los notices de terceros.
- [x] La razón por la que ese material viaja en el artefacto queda explícita y revisada.
- [x] La política de git, packaging y rotación de ese material queda documentada de forma coherente con el modelo del producto.
- [x] Ningún token mutable del usuario final, estado personal o secreto accidental forma parte del artefacto distribuible.

### 3.4 Documentos legales y alineación documental

- [x] Existe una lista explícita de documentos que el release debe entregar al usuario.
- [x] `LICENSE` y `PRIVACY.md` quedan cubiertos por el release.
- [x] Las superficies in-app, `README.md`, changelogs y sitio web público que describen la app son coherentes con la postura legal y de privacidad real del release.
- [x] Si el release cambia la postura legal o de privacidad, el cambio queda reflejado en la documentación pública e interna pertinente.
- [x] Las rutas de ayuda, privacidad, soporte y documentación enlazadas desde la app o el sitio siguen siendo válidas para este release.

### 3.5 Higiene de packaging

- [x] La configuración de build incluye los documentos legales y notices que el release debe distribuir.
- [x] El build no arrastra borradores, backups, secretos, evidencia interna ni otros materiales no distribuibles.
- [x] El inventario de terceros, documentos y material controlado puede reconciliarse con lo que el packaging realmente pretende incluir.

## 4. Gate del artefacto final

- [x] El artefacto inspeccionado queda identificado por nombre exacto y hash.
- [x] El contenido empaquetado real se inspecciona contra el inventario legal del release.
- [x] Los documentos legales y notices requeridos están presentes en el build final y son accesibles de forma razonable para el usuario.
- [x] Las dependencias runtime, módulos nativos, fonts, assets y demás componentes redistribuidos observados en el artefacto coinciden con el inventario clasificado.
- [x] El build final no contiene terceros no inventariados, tokens de usuario, secretos accidentales ni material sensible no declarado.
- [x] Las superficies in-app que abren documentos legales o páginas públicas siguen apuntando a destinos válidos para este release.
- [x] Si el artefacto cambia después de esta revisión, el gate del artefacto se repite completo.

## 5. Criterio de veredicto

`PASS`.
