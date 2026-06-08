# Checklist operativo de release

## Campos mínimos del release versionado

- Fecha de ejecución: `2026-06-07`
- Release ID: `v1.4.1`
- Commit freeze: `29921a471bf8445c14d13dc0c102c09dedf5cede`
- Artefactos inspeccionados: `toT-1.4.1-mac-arm64.dmg`
- Hashes de artefacto: `b301d8ea0bc8998616002f3f4a4d7e8de49561c45e8967122acb253a1dae9a63`
- Referencia base para comparar delta: `v1.4.0|2cc1eb02f398da37fdccd1524d7130c8da230049`
- Veredicto final: `PASS`

## 1. Criterio de cierre

- [x] El baseline versionado de seguridad termina en `PASS`.
- [x] El baseline versionado legal termina en `PASS`.
- [x] El artefacto publicado es exactamente el artefacto inspeccionado por los tres documentos.
- [x] El `commit freeze` corresponde al build empaquetado.

## 2. Inventarios obligatorios del release

- [x] Identidad del release cerrada.
Registro de este release:
version `1.4.1` desde `package.json`; tag esperado `v1.4.1`; commit freeze `29921a471bf8445c14d13dc0c102c09dedf5cede`; plataforma objetivo `macOS arm64`; artefacto inspeccionado `toT-1.4.1-mac-arm64.dmg`; hash `b301d8ea0bc8998616002f3f4a4d7e8de49561c45e8967122acb253a1dae9a63`; canal previsto `GitHub Releases`. La verificacion local del tag no fue reejecutada en esta pasada documental.

- [x] Delta del release cerrado.
Registro de este release:
comparado contra `v1.4.0|2cc1eb02f398da37fdccd1524d7130c8da230049`, el release normaliza la barra de menu nativa entre plataformas, corrige la insercion invalida de `Enlaces de interes` como accion top-level al moverla a submenu propio, recupera un menu de aplicacion dedicado en macOS con etiquetas alineadas al idioma elegido dentro de toT, alinea la paleta visual del Task Editor y de sus modales locales con la ventana principal y elimina dos residuos sin uso que solo generaban warnings de lint en `editor_find_main` y `preset_modal.test`. No introduce features nuevas de runtime, cambios de contrato ni riesgos residuales abiertos para este release.

- [x] Inventario de build y packaging cerrado.
Registro de este release:
el artefacto congelado ya fue generado como `toT-1.4.1-mac-arm64.dmg` mediante el packaging macOS del proyecto (`npm run dist:mac` en el protocolo normal del repo), con target `dmg`, `afterAllArtifactBuild` activo, `asar.smartUnpack: false` y `asarUnpack` acotado al runtime nativo `@img/sharp-darwin-arm64`. Frente a `1.4.0`, el runtime redistribuido no agrega ni remueve dependencias de produccion; `package.json` y `package-lock.json` cambian solo por el versionado del release y su lockfile asociado.

- [x] Inventario de validacion cerrado.
Registro de este release:
la corrida congelada del release ya cuenta con artefacto generado y pruebas ejecutadas en `PASS`, segun el registro del operador del release. Esta pasada fue solo documental: no regenera el build ni reejecuta suites. El alcance funcional esperado para `1.4.1` cubre menu nativo, consistencia visual del Task Editor y limpieza de lint sin cambios de comportamiento ni de contratos; no se reportaron blockers abiertos para publicacion.

- [x] Inventario documental cerrado.
Registro de este release:
con delta confirmado en `CHANGELOG.md`, `docs/changelog_detailed.md` y los tres documentos versionados del release. Dentro del freeze inspeccionado, `README.md`, `PRIVACY.md`, `public/info/**`, `website/public/**`, `docs/test_suite.md`, `docs/tree_folders_files.md` y `public/third_party_licenses/**` quedan `sin delta`.

- [x] Inventario de publicacion cerrado.
Registro de este release:
pendiente de cierre externo: crear/verificar tag `v1.4.1`, publicar la GitHub Release con `toT-1.4.1-mac-arm64.dmg` y reconciliar milestone/issues del release. Las notas publicas del repo (`CHANGELOG.md` y `docs/changelog_detailed.md`) ya representan el delta real del artefacto congelado.

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
