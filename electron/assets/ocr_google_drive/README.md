# Bundled Google OCR Credentials

Place the owner-provided production desktop OAuth `credentials.json` in this directory before packaging a production build:

- expected file name: `credentials.json`
- expected runtime contract:
  - desktop OAuth client
  - system browser
  - loopback callback
  - PKCE
  - `client_secret` included

Important rules:

- Do not commit the real `credentials.json` to git.
- `.gitignore` excludes `electron/assets/ocr_google_drive/credentials.json`.
- The app copies or repairs an app-managed runtime mirror under:
  - `app.getPath('userData')/config/ocr_google_drive/credentials.json`
- Ordinary end users must not be asked to obtain, browse for, or import this file.
