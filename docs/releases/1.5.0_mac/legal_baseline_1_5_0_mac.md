# Baseline operativo legal de release

## Campos mínimos del release versionado

- Fecha de ejecución: `2026-06-21`
- Release ID: `v1.5.0`
- Commit freeze: `a4ae6c1985403a3024ab9328299193dc531e1720`
- Artefactos inspeccionados: `toT-1.5.0-mac-arm64.dmg`
- Hashes de artefacto: `2f49b0ffaf0dfa7224cfbf01488fccd5f72a527bae479a28412492e8910282e7`
- Referencia base para comparar delta: `v1.4.1|29921a471bf8445c14d13dc0c102c09dedf5cede`
- Veredicto final: `PASS`

## 1. Hechos estables del producto que este baseline asume

- El producto se distribuye como app de escritorio empaquetada.
- El artefacto redistribuye runtime, dependencias de producción, recursos visuales, documentación in-app y material controlado del owner.
- El veredicto legal vale solo para el artefacto inspeccionado.

## 2. Inventarios obligatorios del release

- [x] Inventario de componentes redistribuidos de terceros cerrado.
Registro de este release:
`@xmldom/xmldom@0.8.13` (`MIT`) se redistribuye para soporte local de EPUB; OpenJPEG WASM se redistribuye para soporte JP2 OCR; el resto del runtime redistribuido sigue la postura previa del proyecto. Las coberturas de notice/licencia se mantienen en `public/third_party_licenses/*`, `LICENSE.electron.txt` y `LICENSES.chromium.html`.

- [x] Inventario de assets, fonts y marcas de terceros cerrado.
Registro de este release:
artefacto DMG de macOS arm64 con `INSTALL.txt` y el instalador de aplicación estándar. No se agregan assets de terceros nuevos de branding o tipografía que modifiquen la postura de redistribución.

- [x] Inventario de servicios externos y disclosures cerrado.
Registro de este release:
Google OCR sigue siendo opt-in y documentado en `PRIVACY.md`; GitHub Releases permanece como canal de descarga; no se introducen servicios externos nuevos ni cambios de postura de privacidad respecto de la referencia base.

- [x] Inventario de material controlado por la app cerrado.
Registro de este release:
El artefacto sigue incluyendo material controlado del owner necesario para el flujo OCR y la distribución de la app. No se agregan secretos accidentales ni tokens de usuario al build distribuido.

- [x] Inventario de documentos legales cerrado.
Registro de este release:
`LICENSE`, `PRIVACY.md`, `public/info/acerca_de.html`, `public/third_party_licenses/*`, `LICENSE.electron.txt` y `LICENSES.chromium.html` son parte del inventario legal del artefacto final.

- [x] Delta legal del release cerrado.
Registro de este release:
Frente a `1.4.1`, el delta legal se centra en la redistribución explícita de la dependencia `@xmldom/xmldom@0.8.13`, el runtime OpenJPEG WASM vendorizado para JP2, la documentación de provenance asociada y los ajustes de packaging de la plataforma.
No se altera la postura de redistribución general de terceros ni se agregan servicios externos nuevos.

- [x] Inventario legal del artefacto final cerrado.
Registro de este release:
El artefacto final incluye la app distribuible, la documentación legal requerida, los notices de terceros y las coberturas de licencia relativas a EPUB y JP2.

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
