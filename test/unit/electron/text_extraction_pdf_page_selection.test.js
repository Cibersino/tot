'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  canonicalizeGeneratedPdfArtifactPolicy,
  canonicalizePdfPageSelection,
  inspectPdfFile,
  materializePdfPageSelectionInput,
  resolveProcessingInputFileName,
} = require('../../../electron/text_extraction_platform/text_extraction_pdf_page_selection');
const {
  getFileInfo,
} = require('../../../electron/text_extraction_platform/text_extraction_prepare_execute_core');

const SELECTABLE_PDF_FIXTURE = path.resolve('test/fixtures/pdf/selectable_text_fixture_12_pages.pdf');

test('canonicalizePdfPageSelection normalizes all-pages and contiguous ranges', () => {
  assert.deepEqual(
    canonicalizePdfPageSelection(null, { totalPages: 12 }),
    {
      ok: true,
      pdfPageSelection: {
        mode: 'all',
        fromPage: 1,
        toPage: 12,
        selectedPageCount: 12,
        totalPages: 12,
      },
    }
  );

  assert.deepEqual(
    canonicalizePdfPageSelection(
      {
        mode: 'range',
        fromPage: 3,
        toPage: 5,
      },
      { totalPages: 12 }
    ),
    {
      ok: true,
      pdfPageSelection: {
        mode: 'range',
        fromPage: 3,
        toPage: 5,
        selectedPageCount: 3,
        totalPages: 12,
      },
    }
  );

  assert.equal(
    canonicalizePdfPageSelection(
      {
        mode: 'range',
        fromPage: 5,
        toPage: 3,
      },
      { totalPages: 12 }
    ).ok,
    false
  );
});

test('canonicalizeGeneratedPdfArtifactPolicy defaults to delete and accepts keep', () => {
  assert.deepEqual(canonicalizeGeneratedPdfArtifactPolicy(null), { mode: 'delete' });
  assert.deepEqual(canonicalizeGeneratedPdfArtifactPolicy({ mode: 'keep' }), { mode: 'keep' });
});

test('inspectPdfFile returns page count for selectable fixture', async () => {
  const fileInfo = getFileInfo(SELECTABLE_PDF_FIXTURE);
  const inspection = await inspectPdfFile({ fileInfo });

  assert.equal(inspection.ok, true);
  assert.equal(inspection.isPdf, true);
  assert.equal(inspection.totalPages, 12);
  assert.equal(inspection.error, null);
});

test('materializePdfPageSelectionInput creates and cleans up a temporary subset PDF', async (t) => {
  const fileInfo = getFileInfo(SELECTABLE_PDF_FIXTURE);
  const selection = canonicalizePdfPageSelection(
    {
      mode: 'range',
      fromPage: 2,
      toPage: 3,
    },
    { totalPages: 12 }
  ).pdfPageSelection;

  const materialized = await materializePdfPageSelectionInput({
    fileInfo,
    pdfPageSelection: selection,
    generatedPdfArtifactPolicy: { mode: 'delete' },
  });
  assert.equal(materialized.ok, true);
  assert.equal(materialized.materialized, true);
  assert.equal(materialized.processingInputSource, 'generated_pdf_subset');
  assert.equal(materialized.processingInputFileName, 'selectable_text_fixture_12_pages_pages_2_3.pdf');
  assert.equal(fs.existsSync(materialized.effectiveFilePath), true);

  const subsetInspection = await inspectPdfFile({
    fileInfo: getFileInfo(materialized.effectiveFilePath),
  });
  assert.equal(subsetInspection.totalPages, 2);
  assert.equal(resolveProcessingInputFileName({ fileInfo, pdfPageSelection: selection }), materialized.processingInputFileName);

  const cleanupWarning = materialized.cleanupGeneratedArtifact();
  assert.equal(cleanupWarning, null);
  assert.equal(fs.existsSync(materialized.effectiveFilePath), false);

  t.after(() => {
    const runDir = path.dirname(materialized.effectiveFilePath);
    if (fs.existsSync(runDir)) {
      fs.rmSync(runDir, { recursive: true, force: true });
    }
  });
});

test('materializePdfPageSelectionInput retains subset PDFs under the caller-owned keep directory', async (t) => {
  const retainedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tot-generated-pdfs-keep-'));
  t.after(() => fs.rmSync(retainedDir, { recursive: true, force: true }));

  const fileInfo = getFileInfo(SELECTABLE_PDF_FIXTURE);
  const selection = canonicalizePdfPageSelection(
    {
      mode: 'range',
      fromPage: 4,
      toPage: 4,
    },
    { totalPages: 12 }
  ).pdfPageSelection;

  const materialized = await materializePdfPageSelectionInput({
    fileInfo,
    pdfPageSelection: selection,
    generatedPdfArtifactPolicy: { mode: 'keep' },
    retainedArtifactsDir: retainedDir,
  });

  assert.equal(materialized.ok, true);
  assert.equal(materialized.materialized, true);
  assert.equal(materialized.generatedPdfArtifact.retained, true);
  assert.equal(materialized.generatedPdfArtifact.policyMode, 'keep');
  assert.equal(materialized.generatedPdfArtifact.retainedArtifactPath, materialized.retainedArtifactPath);
  assert.equal(materialized.retainedArtifactPath.endsWith(path.join('', 'selectable_text_fixture_12_pages_pages_4_4.pdf')), true);
  assert.equal(fs.existsSync(materialized.retainedArtifactPath), true);
  assert.equal(materialized.cleanupGeneratedArtifact(), null);
});
