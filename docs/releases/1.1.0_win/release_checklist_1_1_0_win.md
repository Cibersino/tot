# Checklist operativo de release

Este documento responde una sola pregunta: `¿este release está listo para publicarse?`

La plantilla reusable debe contener solo requisitos estables del proceso.  
Todo dato mutable de un release concreto debe vivir en su documento versionado:
`docs/releases/<release-id>/release_checklist_<release_file_id>.md`
Aquí, `<release_file_id>` significa el identificador del release normalizado para nombre de archivo.

## Reglas de mantenimiento

- No registrar aquí versiones exactas, hashes, hosts, rutas internas cambiantes, resultados de comandos ni evidencia de un release específico.
- Si un release requiere una excepción de una sola vez, documentarla solo en el documento versionado del release.
- Si cambia el proceso base del producto, primero cerrar el release en el documento versionado y luego actualizar esta plantilla.
- Los tres documentos versionados del release deben apuntar al mismo `release-id`, al mismo `commit freeze` y al mismo conjunto de artefactos inspeccionados.

## Campos mínimos del release versionado

- Fecha de ejecución: `2026-04-11`
- Release ID: `v1.1.1`
- Commit freeze: `dc23cf11e31a3248fc3a76a6fceb856ab59d12f7`
- Artefactos inspeccionados: `toT-1.1.1-win-x64.zip`
- Hashes de artefacto: `892D09EB42B156FBD9EDC7CE1961355479BB411F96B9AD48865F5B90D0B82141`
- Referencia base para comparar delta: `v1.0.0|aff7cf9c87a6081804f72ac84b2f7d86da0bbef9`
- Veredicto final: `<PASS | BLOCKER | PENDING>`

## 1. Criterio de cierre

- [ ] El baseline versionado de seguridad termina en `PASS`.
- [ ] El baseline versionado legal termina en `PASS`.
- [ ] El artefacto publicado es exactamente el artefacto inspeccionado por los tres documentos.
- [x] El `commit freeze` corresponde al build empaquetado.

## 2. Inventarios obligatorios del release

- [x] Identidad del release cerrada.
Registro requerido en el documento versionado: fuente de verdad de versión, tag, commit freeze, plataformas y arquitecturas objetivo, nombres exactos de artefacto, hashes, canal de publicación y relación entre release ID y tag público.

- [ ] Delta del release cerrado.
Registro requerido en el documento versionado: funcionalidades nuevas, modificadas, retiradas, corregidas o postergadas; riesgos aceptados; issues o follow-ups abiertos; y referencia exacta usada para comparar contra el release anterior.

- [ ] Inventario de build y packaging cerrado.
Registro requerido en el documento versionado: comandos usados para generar el build, archivos/configuración de packaging tocados, dependencias runtime cambiadas, diferencias relevantes de contenido empaquetado y cualquier cambio de plataforma o formato de artefacto.

- [ ] Inventario de validación cerrado.
Registro requerido en el documento versionado: suites automáticas corridas, smoke/regression manual ejecutado, alcance real cubierto, issues encontrados, issues aceptados y criterio por el cual no bloquean publicación.

- [ ] Inventario documental cerrado.
Registro requerido en el documento versionado: cambios o `sin delta` para `CHANGELOG.md`, `docs/changelog_detailed.md`, `README.md`, `PRIVACY.md`, `public/info/**`, `website/public/**`, `docs/tree_folders_files.md` y cualquier otra superficie user-facing o interna que el release haya tocado.

- [ ] Inventario de publicación cerrado.
Registro requerido en el documento versionado: GitHub Release, notas públicas, adjuntos, cambios en sitio web o descargas, milestone, roadmap/project y estado final de los issues del release.

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
- [ ] Los tres documentos versionados del release quedan guardados en `docs/releases/<release-id>/`.
- [ ] Cualquier riesgo residual aceptado queda consignado como follow-up explícito y no como texto abierto o ambiguo.

## 7. No publicar si ocurre cualquiera

- `security_baseline` o `legal_baseline` del release no llegan a `PASS`.
- El tag, el `commit freeze` y el artefacto final no coinciden entre sí.
- Falta cualquier inventario obligatorio del release.
- El changelog y las notas públicas no representan el delta real del release.
- El build publicado no es el mismo que fue validado.
- Existe un blocker abierto en pruebas, packaging, seguridad o legalidad.

## 8. Cierre del veredicto

El release queda en `PASS` únicamente cuando:

- Los tres documentos versionados están completos y consistentes entre sí.
- El mismo conjunto de artefactos fue validado por release, legal y seguridad.
- No queda ningún blocker abierto para publicación.
