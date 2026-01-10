# Release checklist

Checklist mecánico para preparar y publicar una nueva versión.

## 1) Regla de versión (SemVer)
- Desde `0.1.0` en adelante, usar SemVer estricto: `MAJOR.MINOR.PATCH`.
- No volver a usar `0.0.XYY` como contador de builds.
- Si aplica pre-release: `-alpha.N`, `-beta.N`, `-rc.N` (sobre base `MAJOR.MINOR.PATCH`).

## 2) Preparación del changelog
- [ ] `docs/changelog_detailed.md`: mover entradas desde `## [Unreleased]` a `## [X.Y.Z] - YYYY-MM-DD`.
- [ ] `docs/changelog_detailed.md`: dejar `## [Unreleased]` vacío (o “sin entradas aún”).
- [ ] `CHANGELOG.md`: reflejar el release `X.Y.Z` con resumen (sin detalle técnico; puede linkear al detallado).

## 3) Tracker (GitHub Issues) y milestone
- [ ] GitHub Issues: revisar el milestone `X.Y.Z`:
  - [ ] Issues resueltos: cerrar (idealmente referenciando commit/PR si existe).
  - [ ] Issues no resueltos: mover al próximo milestone (p. ej. `X.Y.(Z+1)` o `X.(Y+1).0`).
  - [ ] Labels mínimos:
    - [ ] Cada `bug` tiene `area:*` y severidad `S0–S3`.
    - [ ] Quitar `status:needs-triage` si ya hay repro/confirmación y clasificación suficiente.
- [ ] GitHub Milestone: cerrar el milestone `X.Y.Z` al publicar el release (y crear el siguiente si corresponde).

## 4) Roadmap (GitHub Project “toT Roadmap”)
- [ ] Project: revisar el Project “toT Roadmap”:
  - [ ] Vista por milestone: filtrar por `X.Y.Z` (o equivalente) y verificar consistencia con el milestone del repo.
  - [ ] Para cada Issue del release:
    - [ ] `Status`: dejar en estado final (p. ej. Done) si se cerró, o mover fuera del release si se postergó.
    - [ ] Si el Issue cambió de milestone, reflejar el cambio también en el Project (mismo milestone/campo).
  - [ ] No dejar Issues “fantasma”: todo Issue relevante del release debe estar en el Project (si no, agregarlo).
- Nota: `ToDo.md` es un stub fijo que apunta al Project; no se usa para mantener estado.

## 5) Alinear la versión (fuentes de verdad)
- [ ] `VERSION`: debe ser exactamente `X.Y.Z`.
- [ ] `package.json`: `"version": "X.Y.Z"`.
- [ ] `package-lock.json`: consistente con `package.json` (actualizar/regenerar según flujo del repo).

## 6) Documentación pública
- [ ] `README.md`: verificar que no quede desactualizado (links, sección de descarga/uso y referencias a docs).

## 7) Documentación de apoyo
- [ ] `docs/tree_folders_files.md`: actualizar si cambió estructura/archivos (entry points, módulos, i18n, persistencia).
- [ ] Verificar que no existe un tracker duplicado de bugs en docs:
  - [ ] Bugs/requests viven en GitHub Issues + Milestones + Project (no duplicar en `docs/bugs.md`).

## 8) Chequeo final de consistencia
La versión `X.Y.Z` debe coincidir idéntica en:
- [ ] `VERSION`
- [ ] `package.json`
- [ ] `package-lock.json`
- [ ] `README.md` (si muestra versión)
- [ ] `CHANGELOG.md`
- [ ] `docs/changelog_detailed.md`

La fecha `YYYY-MM-DD` del release debe ser consistente entre:
- [ ] `CHANGELOG.md`
- [ ] `docs/changelog_detailed.md` (si ambos incluyen fecha)
