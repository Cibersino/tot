# OCR Sidecar Layout

This folder is packaged outside `app.asar` via `electron-builder.extraResources`.

Runtime lookup order:

1. Development only: `TOT_OCR_SIDECAR_ROOT` (absolute or relative path).
2. Packaged app: `process.resourcesPath`.
3. Development fallback: app project root.

Expected per-target layout:

* `ocr/win32-x64/tesseract/tesseract.exe`
* `ocr/win32-x64/tesseract/tessdata/eng.traineddata`
* `ocr/win32-x64/tesseract/tessdata/spa.traineddata`
* `ocr/win32-x64/poppler/pdftoppm.exe`
* `ocr/win32-x64/preprocess/imagemagick/magick.exe`
* `ocr/win32-x64/preprocess/unpaper/unpaper.exe`

Equivalent target folders are expected for:

* `ocr/linux-x64/`
* `ocr/darwin-x64/`
* `ocr/darwin-arm64/`

Notes:

* The app does not use system `PATH` for OCR sidecars.
* On Windows, sidecar runtimes are isolated by tool (`tesseract/` and `poppler/`), and each process is launched with `cwd` set to its executable directory.
* Missing sidecars/language data produce explicit OCR errors (`OCR_BINARY_MISSING`).
* Preprocess binaries are also resolved from sidecar paths only (no `PATH` discovery).
* Sidecar source/license references are tracked in `THIRD_PARTY_NOTICES.md`.
