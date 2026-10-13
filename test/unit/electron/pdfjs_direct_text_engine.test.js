'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ENGINE_MODULE_PATH = path.resolve(
  __dirname,
  '../../../electron/text_extraction_platform/pdfjs_direct_text_engine.js'
);
const SELECTABLE_PDF_FIXTURE = path.resolve('test/fixtures/pdf/selectable_text_fixture_12_pages.pdf');

function loadPdfjsDirectTextEngineWithFs(fsOverrides = {}) {
  const fsModulePath = require.resolve('fs');
  const originalEngineModule = require.cache[ENGINE_MODULE_PATH];
  const originalFsModule = require.cache[fsModulePath];
  const realFs = require('fs');
  const mockFs = {
    ...realFs,
    ...fsOverrides,
    promises: {
      ...realFs.promises,
      ...(fsOverrides.promises || {}),
    },
  };

  require.cache[fsModulePath] = {
    id: fsModulePath,
    filename: fsModulePath,
    loaded: true,
    exports: mockFs,
  };
  delete require.cache[ENGINE_MODULE_PATH];
  const engine = require(ENGINE_MODULE_PATH);

  function restore() {
    delete require.cache[ENGINE_MODULE_PATH];
    if (originalEngineModule) {
      require.cache[ENGINE_MODULE_PATH] = originalEngineModule;
    } else {
      delete require.cache[ENGINE_MODULE_PATH];
    }
    if (originalFsModule) {
      require.cache[fsModulePath] = originalFsModule;
    } else {
      delete require.cache[fsModulePath];
    }
  }

  return {
    engine,
    restore,
  };
}

function createPartialReadFileHandle(data, readChunkSize) {
  let closed = false;
  let readCalls = 0;

  return {
    async stat() {
      return { size: data.length };
    },
    async read(target, targetOffset, length, position) {
      readCalls += 1;
      const bytesRead = Math.min(readChunkSize, length, data.length - position);
      data.copy(target, targetOffset, position, position + bytesRead);
      return { bytesRead, buffer: target };
    },
    async close() {
      closed = true;
    },
    getState() {
      return { closed, readCalls };
    },
  };
}

test('direct PDF.js input loading completes across positive partial FileHandle reads', { concurrency: false }, async (t) => {
  const fixtureBytes = fs.readFileSync(SELECTABLE_PDF_FIXTURE);
  const handle = createPartialReadFileHandle(fixtureBytes, 97);
  const { engine, restore } = loadPdfjsDirectTextEngineWithFs({
    promises: {
      async open() {
        return handle;
      },
    },
  });
  t.after(restore);

  const extraction = await engine.extractPdfText({ filePath: SELECTABLE_PDF_FIXTURE });

  assert.equal(extraction.numPages, 12);
  assert.ok(extraction.text.length > 0);
  assert.ok(handle.getState().readCalls > 1);
  assert.equal(handle.getState().closed, true);
});

test('direct PDF.js input loading rejects premature EOF and still closes the FileHandle', { concurrency: false }, async (t) => {
  let closed = false;
  const { engine, restore } = loadPdfjsDirectTextEngineWithFs({
    promises: {
      async open() {
        return {
          async stat() {
            return { size: 5 };
          },
          async read() {
            return { bytesRead: 0 };
          },
          async close() {
            closed = true;
          },
        };
      },
    },
  });
  t.after(restore);

  await assert.rejects(
    engine.extractPdfText({ filePath: SELECTABLE_PDF_FIXTURE }),
    (err) => err && err.code === 'PDFJS_PREMATURE_EOF'
  );
  assert.equal(closed, true);
});

test('direct PDF.js input loading propagates rejected reads and still closes the FileHandle', { concurrency: false }, async (t) => {
  let closed = false;
  const readError = Object.assign(new Error('fixture read failure'), { code: 'EIO' });
  const { engine, restore } = loadPdfjsDirectTextEngineWithFs({
    promises: {
      async open() {
        return {
          async stat() {
            return { size: 5 };
          },
          async read() {
            throw readError;
          },
          async close() {
            closed = true;
          },
        };
      },
    },
  });
  t.after(restore);

  await assert.rejects(
    engine.extractPdfText({ filePath: SELECTABLE_PDF_FIXTURE }),
    (err) => err === readError
  );
  assert.equal(closed, true);
});
