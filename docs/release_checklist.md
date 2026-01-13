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
- [ ] La fecha `YYYY-MM-DD` del release debe ser consistente entre `CHANGELOG.md` y `docs/changelog_detailed.md`

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
- [x] `VERSION`: debe ser exactamente `X.Y.Z`.
- [x] `package.json`: `"version": "X.Y.Z"`.
- [x] `package-lock.json`: consistente con `package.json` (actualizar/regenerar según flujo del repo).

## 6) Legalidad (licencias/redistribución)
- [x] `LICENSE`: confirmar que va incluido en el **zip final**.
- [x] Licencias del runtime: confirmar que el **zip final** incluye: `LICENSE.electron.txt` y `LICENSES.chromium.html` (raíz del zip).
- [x] Assets redistribuidos (fuentes/logos): revisar los archivos efectivos a distribuir:
  - [x] `public/fonts/**` (fuentes incluidas): `Baskervville` (OFL).
  - [x] `public/assets/**` (logos/íconos incluidos): No hay licencias adicionales.
- [x] Dependencias runtime incluidas: revisar el zip final y confirmar que no se incluye material dev; si existe `resources/app.asar/node_modules/**` o `resources/app.asar.unpacked/node_modules/**`, verificar que sean solo deps necesarias de ejecución.
  - La app no tiene dependencias runtime.
- [x] Servicios externos / términos (incluye `GitHub`): revisar `electron/updater.js` (y cualquier otro módulo con URLs) y confirmar endpoints esperados, sin credenciales embebidas, y uso consistente con términos.
  - Servicios externos (runtime): solo electron/updater.js. Endpoints: raw.githubusercontent.com/.../VERSION (check de versión) y github.com/.../releases/latest (abre descarga).
- [ ] `public/info/acerca_de.html`: verificar/actualizar el texto visible en la app para “Licencias / Créditos” (dentro del artefacto queda en `resources/app.asar/public/info/acerca_de.html`).

## 7) Baseline de seguridad
- [x] `docs/security_baseline.md`: revisar/actualizar y asegurar que el **veredicto** quede consistente:
  - [x] Ship Gate: todo `[PASS]`.
  - [x] Post-packaging Gate: ejecutado sobre el artefacto final y todo `[PASS]`.
  - [x] Si queda `[PENDING]` o `[BLOCKER]`: no publicar.

## 8) Documentación pública
- [ ] `README.md`: verificar que no quede desactualizado (links, sección de descarga/uso y referencias a docs).
  - [ ] Debe quedar alineado con `public/info/readme.html`

## 9) Documentación de apoyo
- [ ] `docs/tree_folders_files.md`: actualizar si cambió estructura/archivos (entry points, módulos, i18n, persistencia).

## 10) Chequeo final de consistencia
La versión `X.Y.Z` debe coincidir idéntica en:
- [x] `VERSION`
- [x] `package.json`
- [x] `package-lock.json`
