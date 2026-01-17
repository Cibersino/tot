# Release checklist

Checklist mecánico para preparar y publicar una nueva versión.

Fecha: `2026-01-16`  
Versión app: `0.1.1`

## 0. Regla de versión (SemVer)
- Desde `0.1.0` en adelante, usar SemVer estricto: `MAJOR.MINOR.PATCH`.
- No volver a usar `0.0.XYY` como contador de builds.
- Si aplica pre-release: `-alpha.N`, `-beta.N`, `-rc.N` (sobre base `MAJOR.MINOR.PATCH`).
- Tag de release obligatorio en GitHub: `vX.Y.Z` (p. ej. `v0.1.0`), o `vX.Y.Z-rc.N` si aplica.

## 1. Tracker (GitHub Issues), milestone y Roadmap
- [x] GitHub Issues: revisar el milestone `X.Y.Z`:
  - [x] Issues resueltos: cerrar (idealmente referenciando commit/PR si existe).
  - [x] Issues no resueltos: mover al próximo milestone (p. ej. `X.Y.(Z+1)` o `X.(Y+1).0`).
  - [x] Labels mínimos:
    - [x] Cada `bug` tiene `area:*` y severidad `S0–S3`.
    - [x] Quitar `status:needs-triage` si ya hay repro/confirmación y clasificación suficiente.
- [x] Roadmap (GitHub Project “toT Roadmap”):
  - [x] Vista por milestone: filtrar por `X.Y.Z` (o equivalente) y verificar consistencia con el milestone del repo.
  - [x] Para cada Issue del release:
    - [x] `Status`: dejar en estado final (p. ej. Done) si se cerró, o mover fuera del release si se postergó.
    - [x] Si el Issue cambió de milestone, reflejar el cambio también en el Project (mismo milestone/campo).
  - [x] No dejar Issues “fantasma”: todo Issue relevante del release debe estar en el Project (si no, agregarlo).
- Nota: `ToDo.md` es un stub fijo que apunta al Project; no se usa para mantener estado.

## 2. Documentación del release (antes del freeze)

### 2.1 Preparación del changelog
- [x] `docs/changelog_detailed.md`: reflejar el release `X.Y.Z` con detalle.
- [x] `CHANGELOG.md`: reflejar el release `X.Y.Z` con resumen.
- [x] La fecha `YYYY-MM-DD` del release debe ser consistente entre `CHANGELOG.md` y `docs/changelog_detailed.md`.

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
* [x] `public/info/instrucciones.html`: verificar que no quede desactualizado.
* [x] `docs/tree_folders_files.md`: actualizar si cambió estructura/archivos (entry points, módulos, i18n, persistencia).

## 3. Alinear la versión (freeze justo antes del empaquetado)

* [ ] Working tree limpio (sin cambios locales).
* [ ] `package.json`: `"version": "X.Y.Z"` (fuente de verdad; `app.getVersion()`).
* [ ] `package-lock.json`: consistente con `package.json` (actualizar/regenerar según flujo del repo).
* [x] Confirmar que `tools_local/` (y equivalentes) no está tracked ni entró al commit del release.
* [ ] Commit final del release creado antes de empaquetar.

## 4. Packaging (generar artefacto final)

* [ ] Generar el artefacto final (ZIP/installer) desde el estado freeze.
* [ ] Registrar identificador del artefacto final:
  * Nombre exacto: `<TBD>`
* [ ] Sanity: ejecutar la app desde el artefacto empaquetado (modo “packaged”, no `npm start`).

## 5. Baseline de seguridad

* [ ] `docs/security_baseline.md`: revisar/actualizar y asegurar que el **veredicto** quede consistente:
  * [ ] Ship Gate: todo `[PASS]`.
  * [ ] Post-packaging Gate: ejecutado sobre el artefacto final y todo `[PASS]`.
  * [ ] Si queda `[PENDING]` o `[BLOCKER]`: no publicar.

## 6. Baseline legal (licencias/redistribución)

* [ ] `docs/legal_baseline.md`: ejecutar el baseline sobre el artefacto final y asegurar veredicto consistente:
  * [ ] Ship Gate: completado y en `PASS` (inventarios + documentos requeridos).
  * [ ] Post-packaging Gate: ejecutado sobre el artefacto final y en `PASS` (contenido, deps runtime, docs, servicios).
  * [ ] Si queda `PENDING` o `BLOCKER`: no publicar.

## 7. Manual test gate (sobre el build empaquetado)

* [ ] Corre **Release smoke** desde `docs/test_suite.md` (SM-01 … SM-10) y registra resultados (Pass/Fail + notes + issue links).
* [ ] Si hay cambios de alto riesgo, corre **Full regression** desde `docs/test_suite.md`.

## 8. Publicación (GitHub tag + release + cierre)

* [ ] GitHub tag del release: `vX.Y.Z` (prefijo `v` obligatorio) apuntando al commit del freeze.
* [ ] Publicar GitHub Release `vX.Y.Z` (Latest si corresponde) y adjuntar el artefacto final.
* [ ] Release notes: usar el resumen de `CHANGELOG.md` (y/o link explícito a `docs/changelog_detailed.md`).
* [ ] Cerrar el milestone `X.Y.Z` al publicar el release (y crear el siguiente si corresponde).
