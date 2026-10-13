'use strict';

const path = require('path');
const { app } = require('electron');
const appRoot = process.env.TOT_PDFJS_SMOKE_APP_ROOT
  ? path.resolve(process.env.TOT_PDFJS_SMOKE_APP_ROOT)
  : path.resolve(__dirname, '..', '..');
const fixturePath = process.env.TOT_PDFJS_SMOKE_FIXTURE_PATH
  ? path.resolve(process.env.TOT_PDFJS_SMOKE_FIXTURE_PATH)
  : path.resolve(__dirname, '../fixtures/pdf/selectable_text_fixture_12_pages.pdf');
const {
  extractPdfText,
} = require(path.join(appRoot, 'electron/text_extraction_platform/pdfjs_direct_text_engine'));

const userDataDir = process.env.TOT_PDFJS_SMOKE_USER_DATA_DIR;

if (!userDataDir) {
  process.stderr.write('TOT_PDFJS_SMOKE_USER_DATA_DIR is required.\n');
  process.exit(1);
}

app.setPath('userData', path.resolve(userDataDir));

app.whenReady().then(async () => {
  const extraction = await extractPdfText({ filePath: fixturePath });

  if (extraction.numPages !== 12 || !extraction.text) {
    throw new Error('Direct PDF.js Electron-main smoke extraction returned an unexpected result.');
  }

  process.stdout.write('TOT_PDFJS_ELECTRON_MAIN_READY\n');
  app.exit(0);
}).catch((err) => {
  process.stderr.write(`${err && err.stack ? err.stack : String(err)}\n`);
  app.exit(1);
});
