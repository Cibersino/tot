# Baseline operativo legal de release

## Campos mínimos del release versionado

- Fecha de ejecución: `2026-05-06`
- Release ID: `v1.3.0`
- Commit freeze: `eaacf3227c40202091b1d7b030143b39e597814b`
- Artefactos inspeccionados: `toT-1.3.0-win-x64.zip`
- Hashes de artefacto: `AE550228DA18FB3BD5EC664CBDF49CF254201DC2F2473FFAA6F9FCD9BC5F2D78`
- Referencia base para comparar delta: `v1.2.0|ef976e9dbf554113b164b1d7a3352d2d9815b5c7`
- Veredicto final: `PASS`

## 1. Hechos estables del producto que este baseline asume

- El producto se distribuye como app de escritorio empaquetada.
- El artefacto redistribuye runtime, dependencias de producción, recursos visuales, documentación in-app y material controlado del owner.
- El veredicto legal vale solo para el artefacto inspeccionado.

## 2. Inventarios obligatorios del release

- [x] Inventario de componentes redistribuidos de terceros cerrado.
Registro de este release:
`googleapis@171.4.0` (`Apache-2.0`), `mammoth@1.11.0` (`BSD-2-Clause`), `pdf-parse@1.1.1` (`MIT`), `sharp@0.34.4` (`Apache-2.0`), `adm-zip@0.5.16` (`MIT`), `@img/sharp-win32-x64@0.34.4` (`Apache-2.0 AND LGPL-3.0-or-later`), `Baskervville` (`OFL`) y runtime Electron/Chromium. Las coberturas de notice/licencia quedan en `public/third_party_licenses/*`, `LICENSE.electron.txt` y `LICENSES.chromium.html`.

- [x] Inventario de assets, fonts y marcas de terceros cerrado.
Registro de este release:
`public/assets/kofi_symbol.png` identificado como asset de branding de Ko-fi; `public/assets/extension/chrome-web-store-badge.png` identificado como material de branding de Chrome Web Store; `public/fonts/Baskervville-*.ttf` redistribuida con cobertura `OFL`; `public/assets/SOURCES.md` agrega trazabilidad local de procedencia para los assets runtime de terceros. El isotipo `tot-symbols.*` de la extensión se trata como asset propio del proyecto.

- [x] Inventario de servicios externos y disclosures cerrado.
Registro de este release:
GitHub Releases para updater/descarga; Google OCR opt-in documentado en `PRIVACY.md` y superficies informativas in-app; carpeta pública de Google Drive para obtener starter files del reading speed test; Chrome Web Store enlazado desde README, sitio público y modal in-app de extensión; sin telemetría ni sync con la extensión.

- [x] Inventario de material controlado por la app cerrado.
Registro de este release:
`electron/assets/ocr_google_drive/credentials.json` y `README.md` viajan en el build como material controlado del owner; `token.json` mutable del usuario no forma parte del artefacto; no se observaron secretos accidentales adicionales dentro del build.

- [x] Inventario de documentos legales cerrado.
Registro de este release:
`LICENSE` y `PRIVACY.md` presentes en `app.asar`; `LICENSE.electron.txt` y `LICENSES.chromium.html` presentes en `win-unpacked`; `public/info/acerca_de.html` expone las superficies legales in-app con docKeys `license-text-extraction-*` y `notice-text-extraction-*`; README y `website/public/**` ya reflejan la superficie de la extensión, privacidad y términos públicos del release.

- [x] Delta legal del release cerrado.
Registro de este release:
no se agregan nuevas dependencias runtime respecto de `1.2.0`; el delta legal se concentra en renombrar la familia documental `license-import-extract-*` / `notice-import-extract-*` a `license-text-extraction-*` / `notice-text-extraction-*`, añadir trazabilidad de origen para `public/assets/` y abrir una nueva superficie pública para la extensión del navegador y su privacidad. `PRIVACY.md` no cambia dentro del freeze inspeccionado.

- [x] Inventario legal del artefacto final cerrado.
Registro de este release:
en el build final se observaron `LICENSE`, `PRIVACY.md`, `public/info/acerca_de.html`, `public/third_party_licenses/LICENSE_googleapis_171.4.0.txt`, `LICENSE_mammoth_1.11.0.txt`, `LICENSE_pdf-parse_1.1.1.txt`, `LICENSE_sharp_0.34.4.txt`, `LICENSE_adm-zip_0.5.16.txt`, `LICENSE_@img_sharp-win32-x64_0.34.4.txt`, `NOTICE_@img_sharp-win32-x64_0.34.4.txt`, `LICENSE_Baskervville_OFL.txt`, `LICENSE.electron.txt`, `LICENSES.chromium.html` y el material OCR controlado por la app.

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
