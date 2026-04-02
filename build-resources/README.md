# Build resources

This folder contains packaging-only resources used by `electron-builder`.

Rules:

* Keep runtime UI assets in `public/`.
* Keep packaging-only assets here.
* Do not store temporary packaging outputs here.
* Prefer one canonical branded PNG source plus the final platform-specific icon formats actually required by packaging.

Current packaging resources:

* `logo-cibersino.ico` — Windows packaging icon
* `logo-cibersino.png` — canonical raster source and Linux packaging icon
* `logo-cibersino.icns` — macOS packaging icon (generated on a Mac when needed)
