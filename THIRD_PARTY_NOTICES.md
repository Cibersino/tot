# Third-Party Notices

This file lists the primary third-party components redistributed with the app runtime.

## OCR sidecars (bundled outside `app.asar`)

### Tesseract OCR

* Component: `tesseract` executable and runtime libraries used for local OCR.
* Upstream project: https://github.com/tesseract-ocr/tesseract
* Source reference (Windows package used in current setup): https://github.com/tesseract-ocr/tesseract/releases/download/5.5.0/tesseract-ocr-w64-setup-5.5.0.20241111.exe
* Primary upstream license: Apache License 2.0 (see upstream repository/release materials).

### Poppler (`pdftoppm`)

* Component: `pdftoppm` executable and runtime libraries used to rasterize scanned PDFs before OCR.
* Upstream project: https://gitlab.freedesktop.org/poppler/poppler
* Source reference (Windows package used in current setup): https://github.com/oschwartz10612/poppler-windows/releases/download/v25.12.0-0/Release-25.12.0-0.zip
* Primary upstream license: GPL-2.0-or-later for Poppler core (see upstream repository/release materials).

### Tesseract language data (`tessdata`)

* Components: `eng.traineddata`, `spa.traineddata`.
* Upstream project: https://github.com/tesseract-ocr/tessdata
* Primary upstream license: Apache License 2.0 (see upstream repository/release materials).

## Important note on transitive binary dependencies

Prebuilt sidecar bundles include additional dynamic libraries from multiple upstream projects.
Release packaging must keep source/license references for the exact sidecar bundles used in that release.

