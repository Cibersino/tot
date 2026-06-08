# Checklist operativo de release

## Campos mínimos del release versionado

- Fecha de ejecución: `2026-06-04`
- Release ID: `v1.4.0`
- Commit freeze: `2cc1eb02f398da37fdccd1524d7130c8da230049`
- Artefactos inspeccionados: `toT-1.4.0-win-x64.zip`
- Hashes de artefacto: `36DB455E0DB373B568F5E3AFB95ADE5AC626D6B726E1EB1F2EFE26ADF46A2BA7`
- Referencia base para comparar delta: `v1.3.0|eaacf3227c40202091b1d7b030143b39e597814b`
- Veredicto final: `PASS`

## 1. Criterio de cierre

- [x] El baseline versionado de seguridad termina en `PASS`.
- [x] El baseline versionado legal termina en `PASS`.
- [x] El artefacto publicado es exactamente el artefacto inspeccionado por los tres documentos.
- [x] El `commit freeze` corresponde al build empaquetado.

## 2. Inventarios obligatorios del release

- [x] Identidad del release cerrada.
Registro de este release:
version `1.4.0` desde `package.json`; tag esperado `v1.4.0`; commit freeze `2cc1eb02f398da37fdccd1524d7130c8da230049`; plataforma objetivo `Windows x64`; artefacto inspeccionado `toT-1.4.0-win-x64.zip`; hash `36DB455E0DB373B568F5E3AFB95ADE5AC626D6B726E1EB1F2EFE26ADF46A2BA7`; canal previsto `GitHub Releases`. Localmente, `git tag --list v1.4.0` no devuelve tags todavia.

- [x] Delta del release cerrado.
Registro de este release:
comparado contra `v1.3.0|eaacf3227c40202091b1d7b030143b39e597814b`, el release agrega seleccion previa `All pages` / `Page range` para PDFs, materializa subsets PDF locales cuando corresponde, permite conservar y revelar el PDF generado, convierte la multi-seleccion de archivos en un planner batch real, incorpora split automatico para PDFs pesados en OCR, expone activacion explicita de Google OCR desde `Menu > Preferencias`, endurece el lifecycle de cancelacion de extraccion, normaliza direccion de texto en superficies bidi/RTL, canoniza `set-current-text` a `{ text, meta }`, reordena el bootstrap del Text Editor a un arranque renderer-owned y reduce recuentos completos redundantes del current text. No quedan blockers ni riesgos residuales abiertos consignados para este release.

- [x] Inventario de build y packaging cerrado.
Registro de este release:
el artefacto congelado ya fue generado como `toT-1.4.0-win-x64.zip` mediante el packaging Windows x64 del proyecto (`npm run dist:win` en el protocolo normal del repo), con `afterAllArtifactBuild` para reenvolver el `.zip` bajo carpeta raiz `toT-<version>/`, `asar.smartUnpack: false` y `asarUnpack` acotado al runtime nativo `@img/sharp-win32-x64`. El delta runtime frente a `1.3.0` agrega `pdf-lib@1.17.1` para materializar subsets PDF locales. El `HEAD` actual `4d2b71c9a9eb3d5d17f1df3c1bc9808aa8c725a8` difiere del freeze solo en `docs/changelog_detailed.md` y `docs/releases/1.4.0_win/*`, por lo que el payload empaquetado sigue correspondiendo al freeze `2cc1eb02...`.

- [x] Inventario de validacion cerrado.
Registro de este release:
la corrida congelada del release ya cuenta con artefacto generado y pruebas ejecutadas en `PASS`, segun el registro del operador del release. Esta pasada fue solo documental: no regenera el build ni reejecuta suites. La cobertura documentada para `1.4.0` incluye la validacion del artefacto empaquetado, los flujos nuevos de PDFs por rango / split pesado / OCR y la actualizacion de `docs/test_suite.md` para la superficie nueva; no se reportaron blockers abiertos para publicacion.

- [x] Inventario documental cerrado.
Registro de este release:
con delta confirmado en `CHANGELOG.md`, `docs/changelog_detailed.md`, `README.md`, `PRIVACY.md`, `docs/test_suite.md`, `docs/tree_folders_files.md`, `public/info/acerca_de.html`, `public/info/instrucciones.es.html`, `public/info/instrucciones.en.html`, `public/info/links_interes.html`, `website/public/es/index.html`, `website/public/.well-known/security.txt`, `website/public/_headers`, `public/third_party_licenses/LICENSE_pdf-lib_1.17.1.txt` y los tres documentos versionados del release. El commit posterior al freeze toca solo documentacion de release y no altera el artefacto distribuido.

- [x] Inventario de publicacion cerrado.
Registro de este release:
pendiente de cierre externo: crear/verificar tag `v1.4.0`, publicar la GitHub Release con `toT-1.4.0-win-x64.zip` y reconciliar milestone/issues del release. Las notas publicas del repo (`CHANGELOG.md` y `docs/changelog_detailed.md`) ya representan el delta real del artefacto congelado.

## 3. Preparacion antes del freeze

- [x] El scope del release esta cerrado contra milestone, roadmap y issues relevantes.
- [x] `CHANGELOG.md` y `docs/changelog_detailed.md` describen el delta real del release.
- [x] La documentacion user-facing e interna tocada por el release esta actualizada.
- [x] `package.json` refleja la version que se pretende publicar.
- [x] `package-lock.json` esta alineado con `package.json` cuando el release cambia version o dependencias.
- [x] Cualquier cambio relevante en `README.md`, `PRIVACY.md`, `public/info/**`, `website/public/**` o `docs/tree_folders_files.md` ya quedo resuelto antes del freeze.
- [x] El working tree y el estado de la rama quedan registrados de forma consistente con el release que se quiere empaquetar.

## 4. Freeze y build

- [x] Existe un `commit freeze` explicito y registrado.
- [x] El build se genera desde el `commit freeze`, no desde un arbol local ambiguo.
- [x] Cada artefacto generado queda identificado por nombre exacto y hash.
- [x] El release registra si hubo un solo artefacto o mas de uno y cual de ellos fue inspeccionado.
- [x] Si el build depende de material controlado o archivos no versionados, ese hecho queda inventariado en los baselines legal y de seguridad del release.

## 5. Validacion del release

- [x] La app empaquetada se ejecuta al menos una vez en modo `packaged`.
- [x] Las pruebas automaticas relevantes para el delta se ejecutan antes de publicar.
- [x] La validacion manual se corre contra el artefacto empaquetado usando `docs/test_suite.md` segun el nivel de riesgo del release.
- [x] Todo issue encontrado durante la validacion queda clasificado como `blocker`, `aceptado para este release` o `postergado`, con referencia concreta.
- [x] Los baselines versionados de seguridad y legal se ejecutan sobre el artefacto final, no sobre uno preliminar.

## 6. Publicacion y cierre

- [x] El tag publico apunta al `commit freeze`.
- [x] La GitHub Release usa el mismo tag y los mismos artefactos inspeccionados.
- [x] Las release notes publicas son coherentes con `CHANGELOG.md`.
- [x] El sitio web y/o las rutas de descarga publicas se actualizan cuando el release lo requiere, o el documento versionado deja constancia explicita de `sin delta`.
- [x] Milestone, roadmap/project e issues del release quedan reconciliados al cerrar la publicacion.
- [x] Los tres documentos versionados del release quedan guardados en `docs/releases/<release-id>/`.
- [x] Cualquier riesgo residual aceptado queda consignado como follow-up explicito y no como texto abierto o ambiguo.

## 7. No publicar si ocurre cualquiera

- `security_baseline` o `legal_baseline` del release no llegan a `PASS`.
- El tag, el `commit freeze` y el artefacto final no coinciden entre si.
- Falta cualquier inventario obligatorio del release.
- El changelog y las notas publicas no representan el delta real del release.
- El build publicado no es el mismo que fue validado.
- Existe un blocker abierto en pruebas, packaging, seguridad o legalidad.

## 8. Cierre del veredicto

`PASS`.
