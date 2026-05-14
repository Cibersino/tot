'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  OCR_PROVIDER_LIMIT_BYTES,
  buildHeavyPdfSplitPlan,
  bytesToMegabytes,
  isHeavyPdfBySourceSize,
} = require('../../../electron/text_extraction_platform/text_extraction_heavy_pdf_split_core');

test('buildHeavyPdfSplitPlan creates ordered generated inputs from source metadata only', () => {
  const result = buildHeavyPdfSplitPlan({
    fileInfo: {
      fileName: 'heavy.pdf',
      sourceFileKind: 'pdf',
    },
    sourceTotalPages: 10,
    sourceFileSizeBytes: 100 * 1024 * 1024,
  });

  assert.equal(result.ok, true);
  assert.equal(result.sourceTotalPages, 10);
  assert.equal(result.pagesPerGeneratedInput, 3);
  assert.equal(result.generatedInputs.length, 4);
  assert.deepEqual(
    result.generatedInputs.map((generatedInput) => ({
      fromPage: generatedInput.fromPage,
      toPage: generatedInput.toPage,
      processingInputFileName: generatedInput.processingInputFileName,
    })),
    [
      { fromPage: 1, toPage: 3, processingInputFileName: 'heavy_pages_01_03.pdf' },
      { fromPage: 4, toPage: 6, processingInputFileName: 'heavy_pages_04_06.pdf' },
      { fromPage: 7, toPage: 9, processingInputFileName: 'heavy_pages_07_09.pdf' },
      { fromPage: 10, toPage: 10, processingInputFileName: 'heavy_pages_10_10.pdf' },
    ]
  );
});

test('heavy-PDF helpers respect the provider size boundary', () => {
  assert.equal(bytesToMegabytes(25 * 1024 * 1024), 25);
  assert.equal(isHeavyPdfBySourceSize(OCR_PROVIDER_LIMIT_BYTES - 1), false);
  assert.equal(isHeavyPdfBySourceSize(OCR_PROVIDER_LIMIT_BYTES + 1), true);
});
