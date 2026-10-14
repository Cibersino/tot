'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('fs');
const path = require('path');

const ENGINE_MODULE_PATH = path.resolve(
  __dirname,
  '../../../electron/text_extraction_platform/pdfjs_direct_text_engine.js'
);
const SELECTABLE_PDF_FIXTURE = path.resolve('test/fixtures/pdf/selectable_text_fixture_12_pages.pdf');
const LIFECYCLE_PROBE_PATH = path.resolve(
  'test/helpers/pdfjs_direct_text_engine_lifecycle_probe.js'
);

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

function assertTerminalLifecycle(result, expectedPageNumbers) {
  assert.equal(result.loadingTaskDestroyCalls, 1);
  assert.equal(result.loadingTaskDestroySettled, 1);
  assert.equal(result.documentCleanupCalls, 0);
  assert.equal(result.documentDestroyCalls, 0);
  assert.equal(result.getDocumentCalls, 1);
  assert.deepEqual(result.getPageCalls, expectedPageNumbers);

  for (const pageNumber of expectedPageNumbers) {
    assert.equal(result.pageCleanupCalls[pageNumber], 1);
    assert.equal(result.cleanupAfterTextSettlement[pageNumber], true);
    assert.ok(
      result.events.indexOf(`page:${pageNumber}:cleanup`)
        < result.events.indexOf('loading-task:destroy:start')
    );
  }
}

function getWarningMessages(result) {
  return result.warnings.map(([message]) => message);
}

test('direct PDF.js adapter preserves its singular lifecycle and approved raw-text serialization', { concurrency: false }, () => {
  const child = spawnSync(process.execPath, [LIFECYCLE_PROBE_PATH], {
    cwd: path.resolve(__dirname, '..', '..', '..'),
    encoding: 'utf8',
    timeout: 10000,
  });

  assert.equal(child.error, undefined, child.error && child.error.message);
  assert.equal(
    child.status,
    0,
    `Lifecycle probe failed.\nSTDOUT:\n${child.stdout}\nSTDERR:\n${child.stderr}`
  );

  const results = JSON.parse(child.stdout);

  assertTerminalLifecycle(results.normal, [1, 2]);
  assert.equal(results.normal.outcome.numPages, 2);
  assert.equal(results.normal.outcome.text, 'gamma alpha \nbeta\n\n\tdelta\n');

  assertTerminalLifecycle(results.loadFailure, []);
  assert.equal(results.loadFailure.outcome.loadFailurePreserved, true);
  assert.deepEqual(getWarningMessages(results.loadFailure), [
    'PDF.js loading task destroy failed (ignored):',
  ]);

  assertTerminalLifecycle(results.textFailure, [1]);
  assert.equal(results.textFailure.outcome.textFailurePreserved, true);
  assert.deepEqual(getWarningMessages(results.textFailure), [
    'PDF.js page cleanup failed (ignored):',
    'PDF.js loading task destroy failed (ignored):',
  ]);

  assertTerminalLifecycle(results.earlyProbe, [1]);
  assert.equal(results.earlyProbe.outcome.selectableText, 'present');
  assert.equal(results.earlyProbe.outcome.foundAtPage, 1);

  assertTerminalLifecycle(results.secondaryFailureSuccess, [1]);
  assert.equal(results.secondaryFailureSuccess.outcome.numPages, 1);
  assert.deepEqual(getWarningMessages(results.secondaryFailureSuccess), [
    'PDF.js page cleanup failed (ignored):',
    'PDF.js loading task destroy failed (ignored):',
  ]);

  assertTerminalLifecycle(results.cancellation, [1]);
  assert.equal(results.cancellation.outcome.cancellationChecks, 3);
  assert.equal(results.cancellation.outcome.cancellationPreserved, true);
  assert.deepEqual(getWarningMessages(results.cancellation), [
    'PDF.js page cleanup failed (ignored):',
    'PDF.js loading task destroy failed (ignored):',
  ]);
});
