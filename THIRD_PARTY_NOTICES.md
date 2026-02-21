# Third-Party Notices

This file lists the primary third-party components redistributed with the app runtime.

## OCR sidecars (bundled outside `app.asar`)

### Tesseract OCR

* Component: `tesseract` executable and runtime libraries used for local OCR.
* Upstream project: https://github.com/tesseract-ocr/tesseract
* Source reference (Windows package used in current setup): https://github.com/tesseract-ocr/tesseract/releases/download/5.5.0/tesseract-ocr-w64-setup-5.5.0.20241111.exe
* Primary upstream license: Apache License 2.0.
* Local license text in this repository:
  * `third_party_licenses/tesseract/TESSERACT_INSTALLER_LICENSE.txt`

### Poppler (`pdftoppm`)

* Component: `pdftoppm` executable and runtime libraries used to rasterize scanned PDFs before OCR.
* Upstream project: https://gitlab.freedesktop.org/poppler/poppler
* Windows package used in this project: https://github.com/oschwartz10612/poppler-windows/releases/download/v25.12.0-0/Release-25.12.0-0.zip
* Packaging project for that Windows package: https://github.com/oschwartz10612/poppler-windows
* Package-chain references:
  * https://github.com/conda-forge/poppler-feedstock
  * https://anaconda.org/conda-forge/poppler
* Primary upstream/package license in that chain: GPL-2.0-only.
* Local license texts in this repository:
  * `third_party_licenses/poppler/POPPLER_COPYING.txt`
  * `third_party_licenses/poppler/POPPLER_COPYING_GPL-2.0.txt`
  * `third_party_licenses/poppler/POPPLER_COPYING_ADOBE.txt`
  * `third_party_licenses/poppler/POPPLER_WINDOWS_PACKAGING_MIT_LICENSE.txt`

### Tesseract language data (`tessdata`)

* Components: `eng.traineddata`, `spa.traineddata`, `fra.traineddata`, `deu.traineddata`, `ita.traineddata`, `por.traineddata`.
* Upstream project: https://github.com/tesseract-ocr/tessdata
* Source reference (Windows package used in current setup): https://github.com/tesseract-ocr/tesseract/releases/download/5.5.0/tesseract-ocr-w64-setup-5.5.0.20241111.exe (traineddata extracted from this package in current setup).
* Primary upstream license: Apache License 2.0.
* Local license text in this repository:
  * `third_party_licenses/tesseract/TESSERACT_INSTALLER_LICENSE.txt` (used because these traineddata files were extracted from the same Tesseract installer package source).

## GPL source-compliance path (Poppler sidecar)

This distribution includes Poppler-based sidecar binaries (`pdftoppm` + dependencies) in `resources/ocr/<platform>-<arch>/`.

For source-compliance requests tied to a specific release artifact, open:

* https://github.com/Cibersino/tot/issues

Include:

* app version
* artifact file name
* artifact SHA256

## Important note on transitive binary dependencies

Prebuilt sidecar bundles include additional dynamic libraries from multiple upstream projects.
Release packaging must keep source/license references for the exact sidecar bundles used in that release.
