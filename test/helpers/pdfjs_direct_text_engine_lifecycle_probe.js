'use strict';

// =============================================================================
// Overview
// =============================================================================
// Child-process probe for the direct PDF.js adapter lifecycle contract. It
// intercepts only the adapter's ESM PDF.js import, allowing the public adapter
// API to be observed without introducing production test seams.

// =============================================================================
// Imports and module hook
// =============================================================================

const path = require('path');
const { registerHooks } = require('node:module');

const APP_ROOT = path.resolve(__dirname, '..', '..');
const ENGINE_MODULE_PATH = path.join(
  APP_ROOT,
  'electron/text_extraction_platform/pdfjs_direct_text_engine.js'
);
const LOG_MODULE_PATH = path.join(APP_ROOT, 'electron/log.js');
const SELECTABLE_PDF_FIXTURE = path.join(
  APP_ROOT,
  'test/fixtures/pdf/selectable_text_fixture_12_pages.pdf'
);

const PDFJS_MOCK_URL = `data:text/javascript,${encodeURIComponent([
  'export const VerbosityLevel = { WARNINGS: 1 };',
  'export function getDocument(options) {',
  '  return globalThis.__totPdfjsLifecycleScenario.getDocument(options);',
  '}',
].join('\n'))}`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'pdfjs-dist/legacy/build/pdf.mjs') {
      return {
        url: PDFJS_MOCK_URL,
        shortCircuit: true,
      };
    }

    return nextResolve(specifier, context);
  },
});

// =============================================================================
// Lifecycle doubles
// =============================================================================

function createError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function createScenario({
  numPages,
  pages = {},
  loadingError = null,
  destroyError = null,
} = {}) {
  const state = {
    cleanupAfterTextSettlement: {},
    documentCleanupCalls: 0,
    documentDestroyCalls: 0,
    events: [],
    getDocumentCalls: 0,
    getPageCalls: [],
    loadingTaskDestroyCalls: 0,
    loadingTaskDestroySettled: 0,
    pageCleanupCalls: {},
    warnings: [],
  };

  const documentHandle = {
    numPages,
    async getPage(pageNumber) {
      state.getPageCalls.push(pageNumber);
      const pageSpec = pages[pageNumber];

      if (!pageSpec) {
        throw createError('UNEXPECTED_PAGE', `Unexpected page ${pageNumber}.`);
      }

      if (pageSpec.getPageError) throw pageSpec.getPageError;

      return {
        async getTextContent() {
          state.events.push(`page:${pageNumber}:text:start`);
          await Promise.resolve();
          state.events.push(`page:${pageNumber}:text:settled`);

          if (pageSpec.textError) throw pageSpec.textError;
          return pageSpec.textContent || { items: [] };
        },
        cleanup() {
          const settledEvent = `page:${pageNumber}:text:settled`;
          state.cleanupAfterTextSettlement[pageNumber] = state.events.includes(settledEvent);
          state.pageCleanupCalls[pageNumber] = (state.pageCleanupCalls[pageNumber] || 0) + 1;
          state.events.push(`page:${pageNumber}:cleanup`);

          if (pageSpec.cleanupError) throw pageSpec.cleanupError;
        },
      };
    },
    cleanup() {
      state.documentCleanupCalls += 1;
    },
    destroy() {
      state.documentDestroyCalls += 1;
    },
  };

  let loadingTask = null;

  return {
    getDocument() {
      state.getDocumentCalls += 1;

      if (!loadingTask) {
        loadingTask = {
          promise: loadingError ? Promise.reject(loadingError) : Promise.resolve(documentHandle),
          async destroy() {
            state.loadingTaskDestroyCalls += 1;
            state.events.push('loading-task:destroy:start');
            await Promise.resolve();
            state.loadingTaskDestroySettled += 1;
            state.events.push('loading-task:destroy:settled');

            if (destroyError) throw destroyError;
          },
        };
      }

      return loadingTask;
    },
    state,
  };
}

function snapshot(state, outcome) {
  return {
    ...state,
    outcome,
  };
}

// =============================================================================
// Public-adapter scenarios
// =============================================================================

async function runScenario(engine, scenario, runOperation) {
  globalThis.__totPdfjsLifecycleScenario = scenario;
  return runOperation(engine, scenario.state);
}

async function runLifecycleProbe(engine) {
  const results = {};

  const normal = createScenario({
    numPages: 2,
    pages: {
      1: { textContent: { items: [{ str: 'One', hasEOL: true }] } },
      2: { textContent: { items: [{ str: 'Two' }] } },
    },
  });
  const normalResult = await runScenario(engine, normal, (adapter) => (
    adapter.extractPdfText({ filePath: SELECTABLE_PDF_FIXTURE })
  ));
  results.normal = snapshot(normal.state, {
    numPages: normalResult.numPages,
    text: normalResult.text,
  });

  const loadError = createError('LOAD_FAILED', 'Loading failed.');
  const loadDestroyError = createError('DESTROY_FAILED', 'Loading-task destroy failed.');
  const loadFailure = createScenario({
    numPages: 0,
    loadingError: loadError,
    destroyError: loadDestroyError,
  });
  let loadFailurePreserved = false;
  await runScenario(engine, loadFailure, async (adapter) => {
    try {
      await adapter.extractPdfText({ filePath: SELECTABLE_PDF_FIXTURE });
    } catch (err) {
      loadFailurePreserved = err === loadError;
    }
  });
  results.loadFailure = snapshot(loadFailure.state, { loadFailurePreserved });

  const textError = createError('TEXT_FAILED', 'Text extraction failed.');
  const textCleanupError = createError('CLEANUP_FAILED', 'Page cleanup failed.');
  const textDestroyError = createError('DESTROY_FAILED', 'Loading-task destroy failed.');
  const textFailure = createScenario({
    numPages: 1,
    destroyError: textDestroyError,
    pages: {
      1: {
        cleanupError: textCleanupError,
        textError,
      },
    },
  });
  let textFailurePreserved = false;
  await runScenario(engine, textFailure, async (adapter) => {
    try {
      await adapter.extractPdfText({ filePath: SELECTABLE_PDF_FIXTURE });
    } catch (err) {
      textFailurePreserved = err === textError;
    }
  });
  results.textFailure = snapshot(textFailure.state, { textFailurePreserved });

  const earlyProbe = createScenario({
    numPages: 2,
    pages: {
      1: { textContent: { items: [{ str: 'Visible text' }] } },
      2: { textContent: { items: [{ str: 'Must not be read' }] } },
    },
  });
  const earlyProbeResult = await runScenario(engine, earlyProbe, (adapter) => (
    adapter.probePdfSelectableText({
      filePath: SELECTABLE_PDF_FIXTURE,
      isAborted: () => false,
      pageRange: { fromPage: 1, toPage: 2 },
    })
  ));
  results.earlyProbe = snapshot(earlyProbe.state, {
    foundAtPage: earlyProbeResult.foundAtPage,
    selectableText: earlyProbeResult.selectableText,
  });

  const successCleanupError = createError('CLEANUP_FAILED', 'Page cleanup failed.');
  const successDestroyError = createError('DESTROY_FAILED', 'Loading-task destroy failed.');
  const secondaryFailureSuccess = createScenario({
    numPages: 1,
    destroyError: successDestroyError,
    pages: {
      1: {
        cleanupError: successCleanupError,
        textContent: { items: [{ str: 'Still succeeds' }] },
      },
    },
  });
  const secondaryFailureSuccessResult = await runScenario(
    engine,
    secondaryFailureSuccess,
    (adapter) => adapter.extractPdfText({ filePath: SELECTABLE_PDF_FIXTURE })
  );
  results.secondaryFailureSuccess = snapshot(secondaryFailureSuccess.state, {
    numPages: secondaryFailureSuccessResult.numPages,
    text: secondaryFailureSuccessResult.text,
  });

  const cancellationCleanupError = createError('CLEANUP_FAILED', 'Page cleanup failed.');
  const cancellationDestroyError = createError('DESTROY_FAILED', 'Loading-task destroy failed.');
  const cancellation = createScenario({
    numPages: 2,
    destroyError: cancellationDestroyError,
    pages: {
      1: {
        cleanupError: cancellationCleanupError,
        textContent: { items: [] },
      },
      2: { textContent: { items: [{ str: 'Must not be read' }] } },
    },
  });
  let cancellationChecks = 0;
  let cancellationPreserved = false;
  await runScenario(engine, cancellation, async (adapter) => {
    try {
      await adapter.probePdfSelectableText({
        filePath: SELECTABLE_PDF_FIXTURE,
        isAborted: () => {
          cancellationChecks += 1;
          return cancellationChecks >= 3;
        },
        pageRange: { fromPage: 1, toPage: 2 },
      });
    } catch (err) {
      cancellationPreserved = err && err.code === 'aborted_by_user';
    }
  });
  results.cancellation = snapshot(cancellation.state, {
    cancellationChecks,
    cancellationPreserved,
  });

  return results;
}

// =============================================================================
// Entrypoint
// =============================================================================

async function main() {
  require.cache[LOG_MODULE_PATH] = {
    id: LOG_MODULE_PATH,
    filename: LOG_MODULE_PATH,
    loaded: true,
    exports: {
      get() {
        return {
          warn(...args) {
            globalThis.__totPdfjsLifecycleScenario.state.warnings.push(args);
          },
        };
      },
    },
  };

  delete require.cache[ENGINE_MODULE_PATH];
  const engine = require(ENGINE_MODULE_PATH);
  const results = await runLifecycleProbe(engine);
  process.stdout.write(`${JSON.stringify(results)}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err && err.stack ? err.stack : String(err)}\n`);
  process.exitCode = 1;
});

