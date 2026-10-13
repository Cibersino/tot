'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const {
  createTestTempDir,
} = require('../../helpers/test_temp_paths');

const {
  probeNativePdfSelectableText,
} = require('../../../electron/text_extraction_platform/native_pdf_selectable_text_probe');

const SELECTABLE_PDF_FIXTURE = path.resolve('test/fixtures/pdf/selectable_text_fixture_12_pages.pdf');
const SCANNED_PDF_FIXTURE = path.resolve('test/fixtures/pdf/image_only_fixture_12_pages.pdf');

const silentLog = {
  warn() {},
  warnOnce() {},
  error() {},
  errorOnce() {},
  debug() {},
  info() {},
};

async function createMixedPdfFixture(t) {
  const dir = createTestTempDir('native-pdf-probe-range');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const mixedPdf = await PDFDocument.create();
  const scannedPdf = await PDFDocument.load(fs.readFileSync(SCANNED_PDF_FIXTURE));
  const selectablePdf = await PDFDocument.load(fs.readFileSync(SELECTABLE_PDF_FIXTURE));
  const [scannedPage] = await mixedPdf.copyPages(scannedPdf, [0]);
  const [selectablePage] = await mixedPdf.copyPages(selectablePdf, [0]);
  mixedPdf.addPage(scannedPage);
  mixedPdf.addPage(selectablePage);

  const outputPath = path.join(dir, 'mixed_probe_fixture.pdf');
  fs.writeFileSync(outputPath, await mixedPdf.save());
  return outputPath;
}

test('probeNativePdfSelectableText respects the selected page range', async (t) => {
  const mixedPdfPath = await createMixedPdfFixture(t);

  const scannedOnly = await probeNativePdfSelectableText({
    filePath: mixedPdfPath,
    pageRange: {
      fromPage: 1,
      toPage: 1,
    },
    isAborted: () => false,
    log: silentLog,
  });
  assert.equal(scannedOnly.state, 'success');
  assert.equal(scannedOnly.selectableText, 'absent');
  assert.equal(scannedOnly.metadataSafeForLogs.probedFromPage, 1);
  assert.equal(scannedOnly.metadataSafeForLogs.probedToPage, 1);
  assert.equal(scannedOnly.metadataSafeForLogs.selectedPageCount, 1);

  const selectableOnly = await probeNativePdfSelectableText({
    filePath: mixedPdfPath,
    pageRange: {
      fromPage: 2,
      toPage: 2,
    },
    isAborted: () => false,
    log: silentLog,
  });
  assert.equal(selectableOnly.state, 'success');
  assert.equal(selectableOnly.selectableText, 'present');
  assert.equal(selectableOnly.metadataSafeForLogs.foundAtPage, 2);
  assert.equal(selectableOnly.metadataSafeForLogs.probedFromPage, 2);
  assert.equal(selectableOnly.metadataSafeForLogs.probedToPage, 2);
  assert.equal(selectableOnly.metadataSafeForLogs.selectedPageCount, 1);
});

test('probeNativePdfSelectableText preserves the preparation cancellation checkpoints', async () => {
  let cancellationChecks = 0;

  const result = await probeNativePdfSelectableText({
    filePath: SELECTABLE_PDF_FIXTURE,
    pageRange: {
      fromPage: 1,
      toPage: 1,
    },
    isAborted: () => {
      cancellationChecks += 1;
      return cancellationChecks > 1;
    },
    log: silentLog,
  });

  assert.equal(cancellationChecks, 2);
  assert.equal(result.state, 'failure');
  assert.equal(result.error.code, 'aborted_by_user');
  assert.equal(result.error.detailsSafeForLogs.stage, 'runtime');
});

test('probeNativePdfSelectableText preserves the local parser range safety result', async () => {
  const result = await probeNativePdfSelectableText({
    filePath: SELECTABLE_PDF_FIXTURE,
    pageRange: {
      fromPage: 13,
      toPage: 13,
    },
    isAborted: () => false,
    log: silentLog,
  });

  assert.equal(result.state, 'failure');
  assert.equal(result.error.code, 'pdf_page_selection_invalid');
  assert.equal(result.metadataSafeForLogs.totalPages, 12);
  assert.equal(result.metadataSafeForLogs.probedFromPage, 13);
  assert.equal(result.metadataSafeForLogs.probedToPage, 13);
});

test('probeNativePdfSelectableText translates corrupt PDF parser failures', async (t) => {
  const dir = createTestTempDir('native-pdf-probe-malformed-pdf');
  const filePath = path.join(dir, 'malformed.pdf');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(filePath, '%PDF-1.7\nnot a complete PDF', 'utf8');

  const result = await probeNativePdfSelectableText({
    filePath,
    isAborted: () => false,
    log: silentLog,
  });

  assert.equal(result.state, 'failure');
  assert.equal(result.selectableText, 'unknown');
  assert.equal(result.error.code, 'unreadable_or_corrupt');
  assert.equal(result.error.detailsSafeForLogs.stage, 'parse');
  assert.equal(result.error.detailsSafeForLogs.nativeFailureType, 'corrupt_or_unreadable');
  assert.equal(result.error.detailsSafeForLogs.sourceFileExt, 'pdf');
  assert.equal(typeof result.error.detailsSafeForLogs.errorName, 'string');
  assert.notEqual(result.error.detailsSafeForLogs.errorName, '');
  assert.match(result.error.detailsSafeForLogs.errorMessage, /invalid pdf/i);
});
