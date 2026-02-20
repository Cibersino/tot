# Release checklist

Checklist mecánico para preparar y publicar una nueva versión.

Fecha: `2026-02-19`
Tag objetivo (GitHub): `v0.1.6`
Commit freeze (Git): `cbc2e1610687ae511ad6c39907d3c4825ac99ccf`
Artefacto inspeccionado: `toT-0.1.6-win-x64.zip`
SHA256(artefacto): `2389A93122DE99913A612142EC77A90C152AFD43EB82F28227BC88CB77575052`

## 0. Regla de versión (SemVer)
* Desde `0.1.0` en adelante, usar SemVer estricto: `MAJOR.MINOR.PATCH`.
* No volver a usar `0.0.XYY` como contador de builds.
* Si aplica pre-release: `-alpha.N`, `-beta.N`, `-rc.N` (sobre base `MAJOR.MINOR.PATCH`).
* Tag de release obligatorio en GitHub: `vX.Y.Z` (p. ej. `v0.1.0`), o `vX.Y.Z-rc.N` si aplica.

## 1. Tracker (GitHub Issues), milestone y Roadmap
* [x] GitHub Issues: revisar el milestone `X.Y.Z`:
  * [x] Issues resueltos: cerrar (idealmente referenciando commit/PR si existe).
  * [x] Issues no resueltos: mover al próximo milestone (p. ej. `X.Y.(Z+1)` o `X.(Y+1).0`).
  * [x] Labels mínimos:
    * [x] Cada `bug` tiene `area:*` y severidad `S0–S3`.
    * [x] Quitar `status:needs-triage` si ya hay repro/confirmación y clasificación suficiente.
* [x] Roadmap (GitHub Project “toT Roadmap”):
  * [x] Vista por milestone: filtrar por `X.Y.Z` (o equivalente) y verificar consistencia con el milestone del repo.
  * [x] Para cada Issue del release:
    * [x] `Status`: dejar en estado final (p. ej. Done) si se cerró, o mover fuera del release si se postergó.
    * [x] Si el Issue cambió de milestone, reflejar el cambio también en el Project (mismo milestone/campo).
  * [x] No dejar Issues “fantasma”: todo Issue relevante del release debe estar en el Project (si no, agregarlo).
* Nota: `ToDo.md` es un stub fijo que apunta al Project; no se usa para mantener estado.

## 2. Documentación del release (antes del freeze)

### 2.1 Preparación del changelog
* [x] `docs/changelog_detailed.md`: reflejar el release `X.Y.Z` con detalle.
* [x] `CHANGELOG.md`: reflejar el release `X.Y.Z` con resumen.
* [x] La fecha `YYYY-MM-DD` del release debe ser consistente entre `CHANGELOG.md` y `docs/changelog_detailed.md`.

Nota: diff útil para generar changelog (excluye `docs/`)
```pwsh
mkdir tools_local\diffs -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
# Base por defecto: último tag. (Si no hay tags aún, usar manualmente un base apropiado.)
$base = (git describe --tags --abbrev=0)
$outFile = "tools_local/diffs/changes_since_$base-$stamp.diff"
git diff "$base..HEAD" --output $outFile -- . ':(exclude)docs/'
```

### 2.2 Documentación pública y de apoyo

* [x] `README.md`: verificar que no quede desactualizado.
* [x] `public/info/instrucciones.*.html`: verificar que no queden desactualizados.
* [x] `docs/tree_folders_files.md`: actualizar si cambió estructura/archivos (entry points, módulos, i18n, persistencia).

## 3. Alinear la versión (freeze justo antes del empaquetado)

* [x] `package.json`: `"version": "X.Y.Z"` (fuente de verdad; `app.getVersion()`).
* [x] `package-lock.json`: consistente con `package.json` (actualizar/regenerar según flujo del repo: npm install).
* [x] Confirmar que `tools_local/` (y equivalentes) no está tracked ni entró al commit del release.
* [x] Working tree limpio (sin cambios locales).
* [x] Commit final del release creado antes de empaquetar.
  * Commit: `cbc2e1610687ae511ad6c39907d3c4825ac99ccf`

* Nota: Este commit, desde el cual se genearará el artefacto, será el que se utilice para el tag del release.

## 4. Packaging (generar artefacto final)

* [x] Generar el artefacto final (ZIP/installer) desde el estado freeze.
* [x] Registrar identificador del artefacto final:
  * Nombre exacto: `toT-0.1.6-win-x64.zip`
* [x] Sanity: ejecutar la app desde el artefacto empaquetado (modo “packaged”, no `npm start`).

## 5. Baseline de seguridad

* [x] `docs/security_baseline.md`: revisar/actualizar y asegurar que el **veredicto** quede consistente:
  * [x] Ship Gate: todo `[PASS]`.
  * [x] Post-packaging Gate: ejecutado sobre el artefacto final y todo `[PASS]`.
  * [x] Si queda `[PENDING]` o `[BLOCKER]`: no publicar.

## 6. Baseline legal (licencias/redistribución)

* [x] `docs/legal_baseline.md`: ejecutar el baseline sobre el artefacto final y asegurar veredicto consistente:
  * [x] Ship Gate: completado y en `PASS` (inventarios + documentos requeridos).
  * [x] Post-packaging Gate: ejecutado sobre el artefacto final y en `PASS` (contenido, deps runtime, docs, servicios).
  * [x] Si queda `PENDING` o `BLOCKER`: no publicar.

## 7. Manual test gate (sobre el build empaquetado)

* [x] Corre **Release smoke** desde `docs/test_suite.md` (SM-01 … SM-10) y registra resultados (Pass/Fail + notes + issue links).
* [x] Si hay cambios de alto riesgo, corre **Full regression** desde `docs/test_suite.md`.

## 8. Publicación (GitHub tag + release + cierre)

* [x] GitHub tag del release: `vX.Y.Z` (prefijo `v` obligatorio) apuntando al commit del freeze.
* [x] Publicar GitHub Release `vX.Y.Z` (Latest si corresponde) y adjuntar el artefacto final.
* [x] Release notes: usar el resumen de `CHANGELOG.md` (y/o link explícito a `docs/changelog_detailed.md`).
* [x] Cerrar el milestone `X.Y.Z` al publicar el release (y crear el siguiente si corresponde).

## 9. Documentación del release (commit/PR)

Guardar la documentación específica del release en `docs/releases/<X.Y.Z>/`.  
**No es gate de publicación** (puede mergearse antes o después del release).

* [x] Agregar:
  * [x] `docs/releases/<X.Y.Z>/release_checklist_<X_Y_Z>.md`
  * [x] `docs/releases/<X.Y.Z>/security_baseline_<X_Y_Z>.md`
  * [x] `docs/releases/<X.Y.Z>/legal_baseline_<X_Y_Z>.md`
* [x] En los 3 docs registrar: `tag vX.Y.Z`, `SHA commit freeze`, nombre del artefacto, `SHA256` del artefacto.

* [x] Commits en rama (no `main`) + PR + merge a `main`.
