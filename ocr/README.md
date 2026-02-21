# OCR Sidecar Layout

This folder is packaged outside `app.asar` via `electron-builder.extraResources`.

Runtime lookup order:

1. Development only: `TOT_OCR_SIDECAR_ROOT` (absolute or relative path).
2. Packaged app: `process.resourcesPath`.
3. Development fallback: app project root.

Expected per-target layout:

* `ocr/win32-x64/tesseract.exe`
* `ocr/win32-x64/pdftoppm.exe`
* `ocr/win32-x64/tessdata/eng.traineddata`
* `ocr/win32-x64/tessdata/spa.traineddata`

Equivalent target folders are expected for:

* `ocr/linux-x64/`
* `ocr/darwin-x64/`
* `ocr/darwin-arm64/`

Notes:

* The app does not use system `PATH` for OCR sidecars.
* Missing sidecars/language data produce explicit OCR errors (`OCR_BINARY_MISSING`).
* Sidecar source/license references are tracked in `THIRD_PARTY_NOTICES.md`.
