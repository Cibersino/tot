# Checklist operativo de release

## Campos mínimos del release versionado

- Fecha de ejecución: `2026-04-22`
- Release ID: `v1.2.0`
- Commit freeze: `ef976e9dbf554113b164b1d7a3352d2d9815b5c7`
- Artefactos inspeccionados: `toT-1.2.0-win-x64.zip`
- Hashes de artefacto: `CA0BC7B138C79BA9998631B194410CAA0507842071FAE3AAD85F6F1DDE0DA089`
- Referencia base para comparar delta: `N/A`
- Veredicto final: `PASS`

## Excepción de este release

- No se incluyen deltas requeridos ni comparación contra release anterior por instrucción explícita de este release.
- La referencia base queda `N/A`.
- La excepción aplica solo al delta documental; no sustituye validaciones reales de build, legal o seguridad.

## 1. Criterio de cierre

- [x] El baseline versionado de seguridad termina en `PASS`.
- [x] El baseline versionado legal termina en `PASS`.
- [x] El artefacto publicado es exactamente el artefacto inspeccionado por los tres documentos.
- [x] El `commit freeze` corresponde al build empaquetado.

## 2. Inventarios obligatorios del release

- [x] Identidad del release cerrada.
Registro de este release:
versión `1.2.0` desde `package.json`; artefacto `toT-1.2.0-win-x64.zip`; plataforma `Windows x64`; tag esperado `v1.2.0`; commit freeze `ef976e9dbf554113b164b1d7a3352d2d9815b5c7`.

- [x] Delta del release cerrado.
Registro de este release:
Excepción explícita: no se documenta delta comparativo en este release; referencia base `N/A`.

- [x] Inventario de build y packaging cerrado.
Registro de este release:
se ejecutaron `npm run lint`, `npm run test:unit`, `npm run test:smoke`, `npm run dist:win`; packaging con `asar.smartUnpack: false`, `asarUnpack` acotado a runtimes nativos `@img/sharp-*` y hook `afterAllArtifactBuild`.

- [x] Inventario de validación cerrado.
Registro de este release:
`lint` `PASS`; `test:unit` `PASS`; `test:smoke` `PASS`; `dist:win` `PASS`; inspección de `app.asar` y `app.asar.unpacked` `PASS`; `Release smoke` manual `PASS`; `Full regression` no ejecutada.

- [x] Inventario documental cerrado.
Registro de este release:
`CHANGELOG.md`, `docs/changelog_detailed.md`, `PRIVACY.md` y los tres documentos versionados del release quedan registrados; el release también toca `README.md`, `public/info/**`, `website/public/**`, `docs/tree_folders_files.md` y `docs/test_suite.md`.

- [x] Inventario de publicación cerrado.
Registro pendiente de este release:
tag público, GitHub Release y verificación final de notas públicas contra el artefacto publicado.

## 3. Preparación antes del freeze

- [x] El scope del release está cerrado contra milestone, roadmap y issues relevantes.
- [x] `CHANGELOG.md` y `docs/changelog_detailed.md` describen el delta real del release.
- [x] La documentación user-facing e interna tocada por el release está actualizada.
- [x] `package.json` refleja la versión que se pretende publicar.
- [x] `package-lock.json` está alineado con `package.json` cuando el release cambia versión o dependencias.
- [x] Cualquier cambio relevante en `README.md`, `PRIVACY.md`, `public/info/**`, `website/public/**` o `docs/tree_folders_files.md` ya quedó resuelto antes del freeze.
- [x] El working tree y el estado de la rama quedan registrados de forma consistente con el release que se quiere empaquetar.

## 4. Freeze y build

- [x] Existe un `commit freeze` explícito y registrado.
- [x] El build se genera desde el `commit freeze`, no desde un árbol local ambiguo.
- [x] Cada artefacto generado queda identificado por nombre exacto y hash.
- [x] El release registra si hubo un solo artefacto o más de uno y cuál de ellos fue inspeccionado.
- [x] Si el build depende de material controlado o archivos no versionados, ese hecho queda inventariado en los baselines legal y de seguridad del release.

## 5. Validación del release

- [x] La app empaquetada se ejecuta al menos una vez en modo `packaged`.
- [x] Las pruebas automáticas relevantes para el delta se ejecutan antes de publicar.
- [x] La validación manual se corre contra el artefacto empaquetado usando `docs/test_suite.md` según el nivel de riesgo del release.
- [x] Todo issue encontrado durante la validación queda clasificado como `blocker`, `aceptado para este release` o `postergado`, con referencia concreta.
- [x] Los baselines versionados de seguridad y legal se ejecutan sobre el artefacto final, no sobre uno preliminar.

## 6. Publicación y cierre

- [x] El tag público apunta al `commit freeze`.
- [x] La GitHub Release usa el mismo tag y los mismos artefactos inspeccionados.
- [x] Las release notes públicas son coherentes con `CHANGELOG.md`.
- [x] El sitio web y/o las rutas de descarga públicas se actualizan cuando el release lo requiere, o el documento versionado deja constancia explícita de `sin delta`.
- [x] Milestone, roadmap/project e issues del release quedan reconciliados al cerrar la publicación.
- [x] Los tres documentos versionados del release quedan guardados en `docs/releases/<release-id>/`.
- [x] Cualquier riesgo residual aceptado queda consignado como follow-up explícito y no como texto abierto o ambiguo.

## 7. No publicar si ocurre cualquiera

- `security_baseline` o `legal_baseline` del release no llegan a `PASS`.
- El tag, el `commit freeze` y el artefacto final no coinciden entre sí.
- Falta cualquier inventario obligatorio del release.
- El changelog y las notas públicas no representan el delta real del release.
- El build publicado no es el mismo que fue validado.
- Existe un blocker abierto en pruebas, packaging, seguridad o legalidad.

## 8. Cierre del veredicto

`PASS`.
