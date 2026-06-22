# Checklist operativo de release

## Campos mínimos del release versionado

- Fecha de ejecución: `2026-06-21`
- Release ID: `v1.5.0`
- Commit freeze: `a4ae6c1985403a3024ab9328299193dc531e1720`
- Artefactos inspeccionados: `toT-1.5.0-win-x64.zip`
- Hashes de artefacto: `797B124ABEBC2DFAFEC5D151F512965DCB71B02F4FF065442958559053DFA3C4`
- Referencia base para comparar delta: `v1.4.1|29921a471bf8445c14d13dc0c102c09dedf5cede`
- Veredicto final: `PASS`

## 1. Criterio de cierre

- [x] El baseline versionado de seguridad termina en `PASS`.
- [x] El baseline versionado legal termina en `PASS`.
- [x] El artefacto publicado es exactamente el artefacto inspeccionado por los tres documentos.
- [x] El `commit freeze` corresponde al build empaquetado.

## 2. Inventarios obligatorios del release

- [x] Identidad del release cerrada.
Registro requerido en este release:
version `v1.5.0` desde `package.json`; tag esperado `v1.5.0`; commit freeze `a4ae6c1985403a3024ab9328299193dc531e1720`; plataforma objetivo Windows x64; artefacto inspeccionado `toT-1.5.0-win-x64.zip`; hash `797B124ABEBC2DFAFEC5D151F512965DCB71B02F4FF065442958559053DFA3C4`.

- [x] Delta del release cerrado.
Registro de este release:
- El app deja de depender de glyphs Unicode como controles funcionales y pasa a un sistema compartido de SVGs canónicos para renderer.
- La ventana principal agrega un botón de icono dedicado para el `Reading speed test` y alinea toolbar, presets, cronómetro y marcador del `Floating Stopwatch` bajo una misma familia visual funcional.
- Text Editor, barra de búsqueda/reemplazo, Floating Stopwatch, Task Editor y modales batch/info migran sus acciones funcionales al mismo modelo de iconos compartidos, reduciendo drift visual y de wiring.
- El modal de entrada del Reading speed test corrige la semántica de habilitación de filtros para que cada opción se deshabilite cuando no exista entrada compatible.
- El flujo de tags de snapshots deja de depender de un catálogo fijo y permite crear tags personalizados inline con un gestor común para `language` / `type` / `difficulty`.
- La ruta nativa de extracción de texto agrega soporte local para `.epub`, resolviendo el orden de lectura desde `container.xml` + OPF/spine dentro del mismo flujo existente.
- La extracción EPUB promueve `@xmldom/xmldom@0.8.13` a dependencia runtime directa y añade su licencia redistribuida.
- La extracción OCR agrega soporte para `.jp2` como input solo-imagen usando normalización local a PNG antes del upload OCR con OpenJPEG WASM vendorizado.
- La persistencia JSON local separa ahora `saveJson(...)` como operación best-effort y `saveJsonStrict(...)` como write verificado.

- [x] Inventario de build y packaging cerrado.
Registro requerido en este release:
El artefacto congelado ya fue generado como `toT-1.5.0-win-x64.zip` mediante el packaging Windows x64 del proyecto (`npm run dist:win` en el protocolo normal del repo), con `afterAllArtifactBuild` para reenvolver el `.zip` bajo carpeta raíz `toT-<version>/`, `asar.smartUnpack: false` y `asarUnpack` acotado al runtime nativo esperado.

- [x] Inventario de validación cerrado.
Registro requerido en este release:
La validación incluye la generación del artefacto empaquetado y la comprobación de packaging, release notes y baselines de seguridad/legal.

- [x] Inventario documental cerrado.
Registro requerido en este release:
`CHANGELOG.md`, `docs/changelog_detailed.md`, el sitio público y la documentación in-app reflejan el delta real del release. `README.md`, `PRIVACY.md`, `public/info/**`, `website/public/**` y `docs/tree_folders_files.md` mantienen el estado previsto del freeze.

- [x] Inventario de publicación cerrado.
Registro requerido en este release:
Pendiente de creación/verificación del tag `v1.5.0` y publicación de la GitHub Release con `toT-1.5.0-win-x64.zip`.

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

- [x] `security_baseline` o `legal_baseline` del release no llegan a `PASS`.
- [x] El tag, el `commit freeze` y el artefacto final no coinciden entre sí.
- [x] Falta cualquier inventario obligatorio del release.
- [x] El changelog y las notas públicas no representan el delta real del release.
- [x] El build publicado no es el mismo que fue validado.
- [x] Existe un blocker abierto en pruebas, packaging, seguridad o legalidad.

## 8. Cierre del veredicto

`PASS`.
