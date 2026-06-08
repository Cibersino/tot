# Baseline operativo legal de release

## Campos mínimos del release versionado

- Fecha de ejecución: `2026-06-04`
- Release ID: `v1.4.0`
- Commit freeze: `2cc1eb02f398da37fdccd1524d7130c8da230049`
- Artefactos inspeccionados: `toT-1.4.0-win-x64.zip`
- Hashes de artefacto: `36DB455E0DB373B568F5E3AFB95ADE5AC626D6B726E1EB1F2EFE26ADF46A2BA7`
- Referencia base para comparar delta: `v1.3.0|eaacf3227c40202091b1d7b030143b39e597814b`
- Veredicto final: `PASS`

## 1. Hechos estables del producto que este baseline asume

- El producto se distribuye como app de escritorio empaquetada.
- El artefacto redistribuye runtime, dependencias de produccion, recursos visuales, documentacion in-app y material controlado del owner.
- El veredicto legal vale solo para el artefacto inspeccionado.

## 2. Inventarios obligatorios del release

- [x] Inventario de componentes redistribuidos de terceros cerrado.
Registro de este release:
`googleapis@171.4.0` (`Apache-2.0`), `mammoth@1.11.0` (`BSD-2-Clause`), `pdf-lib@1.17.1` (`MIT`), `pdf-parse@1.1.1` (`MIT`), `sharp@0.34.4` (`Apache-2.0`), `adm-zip@0.5.16` (`MIT`), `@img/sharp-win32-x64@0.34.4` (`Apache-2.0 AND LGPL-3.0-or-later`), `Baskervville` (`OFL`) y runtime Electron/Chromium. Las coberturas de notice/licencia quedan en `public/third_party_licenses/*`, `LICENSE.electron.txt` y `LICENSES.chromium.html`.

- [x] Inventario de assets, fonts y marcas de terceros cerrado.
Registro de este release:
`public/assets/kofi_symbol.png` se mantiene como asset de branding de Ko-fi; `public/assets/extension/chrome-web-store-badge.png` se mantiene como material de branding de Chrome Web Store; `public/fonts/Baskervville-*.ttf` sigue redistribuida con cobertura `OFL`; no se agregan nuevos assets de terceros en el freeze `1.4.0`. El isotipo `tot-symbols.*` de la extension se trata como asset propio del proyecto.

- [x] Inventario de servicios externos y disclosures cerrado.
Registro de este release:
GitHub Releases para updater/descarga; Google OCR opt-in documentado en `PRIVACY.md`, `README.md` y superficies informativas in-app; carpeta publica de Google Drive para obtener starter files del reading speed test; Chrome Web Store enlazado desde README, sitio publico y modal in-app de extension; sin telemetria ni sync con la extension. La documentacion tambien deja explicito el comportamiento de PDFs por rango, split automatico de PDFs pesados y PDFs generados localmente que el usuario decide conservar.

- [x] Inventario de material controlado por la app cerrado.
Registro de este release:
`electron/assets/ocr_google_drive/credentials.json` viaja en el build como material controlado del owner para habilitar el flujo OAuth de OCR; `token.json` mutable del usuario no forma parte del artefacto; no se observaron secretos accidentales adicionales dentro del build esperado.

- [x] Inventario de documentos legales cerrado.
Registro de este release:
`LICENSE` y `PRIVACY.md` quedan presentes en `app.asar`; `LICENSE.electron.txt` y `LICENSES.chromium.html` quedan presentes en `win-unpacked`; `public/info/acerca_de.html` expone las superficies legales in-app, incluyendo la nueva referencia de licencia para `pdf-lib`; `README.md`, `public/info/instrucciones.es.html`, `public/info/instrucciones.en.html` y `website/public/es/index.html` reflejan la postura publica del release sobre OCR, seleccion de paginas PDF, split automatico y extension Chrome.

- [x] Delta legal del release cerrado.
Registro de este release:
frente a `1.3.0`, el delta legal principal agrega `pdf-lib@1.17.1` como nueva dependencia runtime redistribuida para materializar subsets PDF locales y suma `public/third_party_licenses/LICENSE_pdf-lib_1.17.1.txt` a la cobertura documental del build. Ademas, `PRIVACY.md`, `README.md` y las instrucciones in-app pasan a describir de forma explicita la seleccion de paginas PDF, la posible retencion local de PDFs generados y el split automatico del PDF completo cuando OCR no admite el archivo como una sola unidad.

- [x] Inventario legal del artefacto final cerrado.
Registro de este release:
en el build final se inventarian `LICENSE`, `PRIVACY.md`, `public/info/acerca_de.html`, `public/third_party_licenses/LICENSE_googleapis_171.4.0.txt`, `LICENSE_mammoth_1.11.0.txt`, `LICENSE_pdf-lib_1.17.1.txt`, `LICENSE_pdf-parse_1.1.1.txt`, `LICENSE_sharp_0.34.4.txt`, `LICENSE_adm-zip_0.5.16.txt`, `LICENSE_@img_sharp-win32-x64_0.34.4.txt`, `NOTICE_@img_sharp-win32-x64_0.34.4.txt`, `LICENSE_Baskervville_OFL.txt`, `LICENSE.electron.txt`, `LICENSES.chromium.html` y el material OCR controlado por la app.

## 3. Gate previo al packaging

### 3.1 Redistribución de terceros

- [x] Todo componente redistribuido queda clasificado con nombre, version, origen, licencia o terminos aplicables y decision de redistribucion.
- [x] Toda obligacion de notice, atribucion, copia de licencia o texto de terceros tiene una cobertura explicita en el release.
- [x] Ningun componente de terceros queda en estado ambiguo o sin clasificacion legal.
- [x] Fonts, imagenes, iconos, logos y otros assets de terceros tienen procedencia y permiso de uso identificados.

### 3.2 Servicios externos, privacidad y disclosures

- [x] Todo servicio externo o flujo conectado tiene una descripcion user-facing coherente con la implementacion real.
- [x] La documentacion user-facing aclara que dato sale del dispositivo, bajo que accion o condicion y hacia que tercero.
- [x] Cuentas, permisos, scopes, consentimientos o pasos de autenticacion requeridos por una feature conectada quedan documentados cuando apliquen.
- [x] La app no promete comportamiento `offline`, `local-only`, `sin terceros` o equivalente si el release real tiene excepciones no descritas.
- [x] Identidad del operador, canales de soporte, correo de contacto, tracker publico y rutas oficiales de descarga son coherentes entre si.

### 3.3 Material controlado por la app

- [x] Todo material sensible o controlado distribuido intencionalmente por la app queda documentado por separado de los notices de terceros.
- [x] La razon por la que ese material viaja en el artefacto queda explicita y revisada.
- [x] La politica de git, packaging y rotacion de ese material queda documentada de forma coherente con el modelo del producto.
- [x] Ningun token mutable del usuario final, estado personal o secreto accidental forma parte del artefacto distribuible.

### 3.4 Documentos legales y alineacion documental

- [x] Existe una lista explicita de documentos que el release debe entregar al usuario.
- [x] `LICENSE` y `PRIVACY.md` quedan cubiertos por el release.
- [x] Las superficies in-app, `README.md`, changelogs y sitio web publico que describen la app son coherentes con la postura legal y de privacidad real del release.
- [x] Si el release cambia la postura legal o de privacidad, el cambio queda reflejado en la documentacion publica e interna pertinente.
- [x] Las rutas de ayuda, privacidad, soporte y documentacion enlazadas desde la app o el sitio siguen siendo validas para este release.

### 3.5 Higiene de packaging

- [x] La configuracion de build incluye los documentos legales y notices que el release debe distribuir.
- [x] El build no arrastra borradores, backups, secretos, evidencia interna ni otros materiales no distribuibles.
- [x] El inventario de terceros, documentos y material controlado puede reconciliarse con lo que el packaging realmente pretende incluir.

## 4. Gate del artefacto final

- [x] El artefacto inspeccionado queda identificado por nombre exacto y hash.
- [x] El contenido empaquetado real se inspecciona contra el inventario legal del release.
- [x] Los documentos legales y notices requeridos estan presentes en el build final y son accesibles de forma razonable para el usuario.
- [x] Las dependencias runtime, modulos nativos, fonts, assets y demas componentes redistribuidos observados en el artefacto coinciden con el inventario clasificado.
- [x] El build final no contiene terceros no inventariados, tokens de usuario, secretos accidentales ni material sensible no declarado.
- [x] Las superficies in-app que abren documentos legales o paginas publicas siguen apuntando a destinos validos para este release.
- [x] Si el artefacto cambia despues de esta revision, el gate del artefacto se repite completo.

## 5. Criterio de veredicto

`PASS`.
