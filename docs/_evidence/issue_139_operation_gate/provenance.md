# Issue 139 - Win32 Preprocess Provenance Snapshot

Timestamp: 2026-03-06

## Acquisition Chain

- ImageMagick package source chain (Chocolatey package metadata):
  - package: `imagemagick.app` version `7.1.2.1500`
  - project URL: `https://www.imagemagick.org/`
  - x64 installer URL (from package verification):
    - `https://imagemagick.org/archive/binaries/ImageMagick-7.1.2-15-Q16-HDRI-x64-dll.exe`
- unpaper package source chain (Chocolatey package metadata):
  - package: `unpaper` version `6.1.0`
  - x64 archive URL (from package verification):
    - `https://github.com/rodrigost23/unpaper/releases/download/unpaper-6.1/unpaper-6.1-windows-x86_64.zip`

## Source Artifact Hash Verification

- ImageMagick x64 installer checksum declared by package verification:
  - `8755351DEAFF75A22C4437E3C78C79E6A5796F7B1481F3C21710CFB67A0DA420`
- ImageMagick x64 installer checksum computed from `imagemagick.app.nupkg` entry:
  - `8755351DEAFF75A22C4437E3C78C79E6A5796F7B1481F3C21710CFB67A0DA420`
- unpaper x64 zip checksum declared by package verification:
  - `A760FA1FB5A076C7DAD24C643AAEC5330473AB03FBF6EDE50E124978D840EE65`
- unpaper x64 zip checksum computed from local package tools:
  - `A760FA1FB5A076C7DAD24C643AAEC5330473AB03FBF6EDE50E124978D840EE65`

Supporting hash snapshot JSON:
- `docs/_evidence/issue_139_operation_gate/provenance_hash_snapshot.json`

## Local Packaging Step (this session)

Copied runtime artifacts into sidecar paths:
- from `C:\Program Files\ImageMagick-7.1.2-Q16-HDRI\*`
  to `ocr/win32-x64/preprocess/imagemagick/`
- from `C:\ProgramData\chocolatey\lib\unpaper\tools\{unpaper.exe,LIBBZ2-1.DLL,LIBWINPTHREAD-1.DLL,ZLIB1.DLL}`
  to `ocr/win32-x64/preprocess/unpaper/`

## Shipped Inventory + Hashes

- full file inventory + sha256 list:
  - `docs/_evidence/issue_139_operation_gate/win32_preprocess_inventory.tsv`
- key executable hashes:
  - `ocr/win32-x64/preprocess/imagemagick/magick.exe` -> `16CB13B2E3FB1A054B9126F7BFCFA8D5AA9A293DBE066358E46C83193FD2B8D7`
  - `ocr/win32-x64/preprocess/unpaper/unpaper.exe` -> `92820055FA775B4CFF7D46495CF5BAB15B95B4A251F712CB57F762BE4D9A9EED`

## Operation Compatibility Gate Artifact

- gate report JSON:
  - `docs/_evidence/issue_139_operation_gate/operation_gate_report.json`
