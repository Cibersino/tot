# Release checklist

Checklist mecánico para preparar y publicar una nueva versión.

Fecha: `2026-01-12`  
Versión app: `0.1.0`

## 1) Regla de versión (SemVer)
- Desde `0.1.0` en adelante, usar SemVer estricto: `MAJOR.MINOR.PATCH`.
- No volver a usar `0.0.XYY` como contador de builds.
- Si aplica pre-release: `-alpha.N`, `-beta.N`, `-rc.N` (sobre base `MAJOR.MINOR.PATCH`).
- Tag de release obligatorio en GitHub: `vX.Y.Z` (p. ej. `v0.1.0`), o `vX.Y.Z-rc.N` si aplica.

## 2) Preparación del changelog
- [x] `docs/changelog_detailed.md`: reflejar el release `X.Y.Z` con detalle.
- [x] `CHANGELOG.md`: reflejar el release `X.Y.Z` con resumen.
- [x] La fecha `YYYY-MM-DD` del release debe ser consistente entre `CHANGELOG.md` y `docs/changelog_detailed.md`

## 3) Tracker (GitHub Issues) y milestone
- [x] GitHub Issues: revisar el milestone `X.Y.Z`:
  - [x] Issues resueltos: cerrar (idealmente referenciando commit/PR si existe).
  - [x] Issues no resueltos: mover al próximo milestone (p. ej. `X.Y.(Z+1)` o `X.(Y+1).0`).
  - [x] Labels mínimos:
    - [x] Cada `bug` tiene `area:*` y severidad `S0–S3`.
    - [x] Quitar `status:needs-triage` si ya hay repro/confirmación y clasificación suficiente.
- [x] GitHub Milestone: cerrar el milestone `X.Y.Z` al publicar el release (y crear el siguiente si corresponde).

## 4) Roadmap (GitHub Project “toT Roadmap”)
- [x] Project: revisar el Project “toT Roadmap”:
  - [x] Vista por milestone: filtrar por `X.Y.Z` (o equivalente) y verificar consistencia con el milestone del repo.
  - [x] Para cada Issue del release:
    - [x] `Status`: dejar en estado final (p. ej. Done) si se cerró, o mover fuera del release si se postergó.
    - [x] Si el Issue cambió de milestone, reflejar el cambio también en el Project (mismo milestone/campo).
  - [x] No dejar Issues “fantasma”: todo Issue relevante del release debe estar en el Project (si no, agregarlo).
- Nota: `ToDo.md` es un stub fijo que apunta al Project; no se usa para mantener estado.

## 5) Alinear la versión (fuentes de verdad)
- [x] `package.json`: `"version": "X.Y.Z"` (fuente de verdad; `app.getVersion()`).
- [x] `package-lock.json`: consistente con `package.json` (actualizar/regenerar según flujo del repo).
- [x] GitHub tag del release: `vX.Y.Z` (prefijo `v` obligatorio).

## 6) Legalidad (licencias/redistribución)
- [x] `LICENSE`: confirmar que va incluido en el **zip final**.
- [x] Licencias del runtime: confirmar que el **zip final** incluye: `LICENSE.electron.txt` y `LICENSES.chromium.html` (raíz del zip).
- [x] Assets redistribuidos (fuentes/logos): revisar los archivos efectivos a distribuir:
  - [x] `public/fonts/**` (fuentes incluidas): licencia `Baskervville` guardada en `public/fonts/LICENSE_Baskervville_OFL.txt`.
  - [x] `public/assets/**` (logos/íconos incluidos): diseños propios; no hay licencias adicionales.
- [x] Dependencias runtime incluidas: no hay `node_modules` runtime (no deps de ejecución).
- [x] Servicios externos / términos (incluye `GitHub`): solo `electron/updater.js`.
  - Endpoints: `api.github.com/.../releases/latest` (check de versión vía `tag_name`) y `github.com/.../releases/latest` (abre descarga).
  - Sin credenciales embebidas.
- [x] `public/info/acerca_de.html`: verificar/actualizar el texto visible en la app para “Licencias / Créditos”.

## 7) Baseline de seguridad
- [x] `docs/security_baseline.md`: revisar/actualizar y asegurar que el **veredicto** quede consistente:
  - [x] Ship Gate: todo `[PASS]`.
  - [x] Post-packaging Gate: ejecutado sobre el artefacto final y todo `[PASS]`.
  - [x] Si queda `[PENDING]` o `[BLOCKER]`: no publicar.

## 8) Documentación pública
- [x] `README.md`: verificar que no quede desactualizado.
- [x] `public/info/instrucciones.html`: verificar que no quede desactualizado.
- [x] `public/info/*.html`: en el build empaquetado, verificar que los links abren fuera de la app (navegador/visor del sistema) y no navegan la ventana principal.

## 9) Documentación de apoyo
- [x] `docs/tree_folders_files.md`: actualizar si cambió estructura/archivos (entry points, módulos, i18n, persistencia).

## 10) Chequeo final de consistencia
La versión `X.Y.Z` debe coincidir idéntica en:
- [x] `package.json`
- [x] `package-lock.json`
- [x] tag de release en GitHub (después de `v`)
