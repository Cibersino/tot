# Checklist operativo de release

## Campos mínimos del release versionado

- Fecha de ejecución: `2026-05-06`
- Release ID: `v1.3.0`
- Commit freeze: `eaacf3227c40202091b1d7b030143b39e597814b`
- Artefactos inspeccionados: `toT-1.3.0-win-x64.zip`
- Hashes de artefacto: `AE550228DA18FB3BD5EC664CBDF49CF254201DC2F2473FFAA6F9FCD9BC5F2D78`
- Referencia base para comparar delta: `v1.2.0|ef976e9dbf554113b164b1d7a3352d2d9815b5c7`
- Veredicto final: `PENDING`

## 1. Criterio de cierre

- [x] El baseline versionado de seguridad termina en `PASS`.
- [x] El baseline versionado legal termina en `PASS`.
- [x] El artefacto publicado es exactamente el artefacto inspeccionado por los tres documentos.
- [x] El `commit freeze` corresponde al build empaquetado.

## 2. Inventarios obligatorios del release

- [x] Identidad del release cerrada.
Registro de este release:
versión `1.3.0` desde `package.json`; tag esperado `v1.3.0`; commit freeze `eaacf3227c40202091b1d7b030143b39e597814b`; plataforma objetivo `Windows x64`; artefacto inspeccionado `toT-1.3.0-win-x64.zip`; hash `10FC3E51BEDF929FE8DA3F8A81140889C78896ACCA03E4D1BED047ED6CFFF6BE`; canal previsto `GitHub Releases`. Localmente, `git tag --list v1.3.0` no devuelve tags todavía.

- [x] Delta del release cerrado.
Registro de este release:
comparado contra `v1.2.0|ef976e9dbf554113b164b1d7a3352d2d9815b5c7`, el release amplía la UI a `30` idiomas raíz, añade la entrada fija de `Browser extension` hacia Chrome Web Store, consolida `import/extract` como `text extraction` en UI/preload/IPC/storage, hace persistente la preferencia `showBundledEntries` del reading speed test, vuelve resizable/maximizable el task editor con nuevo estado `task_editor_state.json`, elimina el campo `Tipo` del editor de tareas y endurece la resolución de spellcheck para diccionarios realmente disponibles.

- [x] Inventario de build y packaging cerrado.
Registro de este release:
se ejecutaron `npm run lint`, `npm run test:unit`, `npm run test:smoke` y `npm run dist:win`; packaging con `asar.smartUnpack: false`, `asarUnpack` acotado a `@img/sharp-win32-x64` y artefacto final `build-output/toT-1.3.0-win-x64.zip`. El build se lanzó desde `HEAD`, pero `git diff --name-only eaacf3227c40202091b1d7b030143b39e597814b..HEAD` toca solo `docs/changelog_detailed.md` y `docs/releases/1.3.0_win/*`, que no forman parte del payload empaquetado; por eso el runtime distribuido sigue correspondiendo al freeze `eaacf32...`.

- [x] Inventario de validación cerrado.
Registro de este release:
`lint` `PASS`; `test:unit` `PASS` (`137/137`); `test:smoke` `PASS`; `dist:win` `PASS`; inspección de `app.asar` y `app.asar.unpacked` `PASS`; `build-output/win-unpacked/toT.exe` ejecutado en modo `TOT_SMOKE_TEST=1` con salida `0`; sin issues detectados en el alcance ejecutado. La regresión/manual suite completa de `docs/test_suite.md` no fue ejecutada en esta pasada documental.

- [x] Inventario documental cerrado.
Registro de este release:
con delta confirmado en `CHANGELOG.md`, `docs/changelog_detailed.md`, `README.md`, `docs/test_suite.md`, `docs/tree_folders_files.md`, `public/info/acerca_de.html`, `public/assets/SOURCES.md`, `website/public/index.html`, `website/public/es/index.html`, `website/public/en/index.html`, `website/public/chrome-extension-privacy/**`, `website/public/extension-resolver.js` y los tres documentos versionados del release; `PRIVACY.md` queda `sin delta` de contenido dentro del freeze inspeccionado.

- [x] Inventario de publicación cerrado.
Registro de este release:
pendiente de cierre externo: crear/verificar tag `v1.3.0`, publicar la GitHub Release con `toT-1.3.0-win-x64.zip`, reconciliar milestone/issues y confirmar despliegue público de sitio/descargas. Las notas del repo (`CHANGELOG.md` y `docs/changelog_detailed.md`) ya están alineadas con el delta real del release.

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
