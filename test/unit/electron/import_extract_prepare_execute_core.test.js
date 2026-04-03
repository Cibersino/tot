'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  executePreparedImport,
  getFileInfo,
  prepareSelectedFile,
  resolveExecutePayload,
  resolvePreparePayload,
  resolvePreparedRoute,
} = require('../../../electron/import_extract_platform/import_extract_prepare_execute_core');

function createIdleController({ changed = true, active = false, state = 'idle' } = {}) {
  return {
    enterCalls: [],
    exitCalls: [],
    enter(payload) {
      this.enterCalls.push(payload);
      return { changed };
    },
    exit(payload) {
      this.exitCalls.push(payload);
    },
    isActive() {
      return active;
    },
    getState() {
      return state;
    },
  };
}

const silentLog = {
  warn() {},
  warnOnce() {},
  error() {},
  errorOnce() {},
  debug() {},
  info() {},
};

test('resolvePreparePayload trims supported fields and drops invalid values', () => {
  assert.deepEqual(
    resolvePreparePayload({
      filePath: '  C:\\temp\\sample.pdf  ',
      ocrLanguage: '  es  ',
      ignored: true,
    }),
    {
      filePath: 'C:\\temp\\sample.pdf',
      ocrLanguage: 'es',
    }
  );

  assert.deepEqual(
    resolvePreparePayload(null),
    {
      filePath: '',
      ocrLanguage: '',
    }
  );
});

test('resolveExecutePayload trims ids and only accepts native or ocr route preferences', () => {
  assert.deepEqual(
    resolveExecutePayload({
      prepareId: '  abc-123  ',
      routePreference: ' Native ',
    }),
    {
      prepareId: 'abc-123',
      routePreference: 'native',
    }
  );

  assert.deepEqual(
    resolveExecutePayload({
      prepareId: 123,
      routePreference: 'invalid',
    }),
    {
      prepareId: '',
      routePreference: '',
    }
  );
});

test('getFileInfo classifies text, image, and pdf inputs from extension', () => {
  const txtInfo = getFileInfo('  notes.md  ');
  assert.equal(txtInfo.fileName, 'notes.md');
  assert.equal(txtInfo.sourceFileExt, 'md');
  assert.equal(txtInfo.sourceFileKind, 'text_document');

  const imageInfo = getFileInfo('scan.TIFF');
  assert.equal(imageInfo.fileName, 'scan.TIFF');
  assert.equal(imageInfo.sourceFileExt, 'tiff');
  assert.equal(imageInfo.sourceFileKind, 'image');

  const pdfInfo = getFileInfo(path.join('docs', 'sample.pdf'));
  assert.equal(pdfInfo.fileName, 'sample.pdf');
  assert.equal(pdfInfo.sourceFileExt, 'pdf');
  assert.equal(pdfInfo.sourceFileKind, 'pdf');
});

test('resolvePreparedRoute prefers explicit chosenRoute and otherwise enforces route rules', () => {
  assert.deepEqual(
    resolvePreparedRoute(
      {
        routeMetadata: { chosenRoute: 'native' },
        routeChoiceOptions: ['native', 'ocr'],
      },
      'ocr'
    ),
    { ok: true, productRoute: 'native' }
  );

  assert.deepEqual(
    resolvePreparedRoute(
      {
        routeMetadata: { chosenRoute: null },
        routeChoiceOptions: ['native', 'ocr'],
      },
      'ocr'
    ),
    { ok: true, productRoute: 'ocr' }
  );

  assert.deepEqual(
    resolvePreparedRoute(
      {
        routeMetadata: { chosenRoute: null },
        routeChoiceOptions: ['native'],
      },
      'ocr'
    ),
    { ok: false, reason: 'requested_route_unavailable' }
  );

  assert.deepEqual(
    resolvePreparedRoute(
      {
        routeMetadata: { chosenRoute: null },
        routeChoiceOptions: ['native', 'ocr'],
        requiresRouteChoice: true,
      },
      ''
    ),
    { ok: false, reason: 'route_choice_required' }
  );

  assert.deepEqual(
    resolvePreparedRoute(
      {
        routeMetadata: { chosenRoute: null },
        routeChoiceOptions: [],
        requiresRouteChoice: false,
      },
      ''
    ),
    { ok: false, reason: 'route_resolution_failed' }
  );
});

test('prepareSelectedFile returns a native-ready result for plain text inputs', async () => {
  const result = await prepareSelectedFile({
    filePath: 'sample.txt',
    ocrLanguage: 'es',
    resolvePaths: () => {
      throw new Error('resolvePaths should not be used for native text preparation');
    },
    log: silentLog,
  });

  assert.equal(result.ok, true);
  assert.equal(result.prepareReady, true);
  assert.equal(result.executionKind, 'native');
  assert.equal(result.routeMetadata.fileKind, 'text_document');
  assert.deepEqual(result.routeMetadata.availableRoutes, ['native']);
  assert.equal(result.routeMetadata.chosenRoute, 'native');
  assert.equal(result.routeMetadata.pdfTriage, 'not_pdf');
});

test('prepareSelectedFile returns a structured unsupported-format failure when no route exists', async () => {
  const result = await prepareSelectedFile({
    filePath: 'archive.zip',
    ocrLanguage: 'es',
    resolvePaths: () => {
      throw new Error('resolvePaths should not be used for unsupported-format preparation');
    },
    log: silentLog,
  });

  assert.equal(result.ok, true);
  assert.equal(result.prepareFailed, true);
  assert.equal(result.executionKind, null);
  assert.equal(result.routeMetadata.triageReason, 'unsupported_format');
  assert.deepEqual(result.routeMetadata.availableRoutes, []);
  assert.equal(result.primaryAlertKey, 'renderer.alerts.import_extract_native_unsupported_format');
  assert.equal(result.error.code, 'unsupported_format');
});

test('executePreparedImport rejects unresolved route choice before starting work', async () => {
  const controller = createIdleController({ changed: true, active: false, state: 'idle' });

  const result = await executePreparedImport({
    preparedRecord: {
      fileInfo: { sourceFileKind: 'pdf', filePath: 'sample.pdf' },
      routeMetadata: { chosenRoute: null },
      requiresRouteChoice: true,
      routeChoiceOptions: ['native', 'ocr'],
      ocrLanguage: 'es',
    },
    routePreference: '',
    resolvePaths: () => ({}),
    controller,
    log: silentLog,
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'ROUTE_CHOICE_REQUIRED',
    primaryAlertKey: 'renderer.alerts.import_extract_route_choice_required',
  });
  assert.deepEqual(controller.enterCalls, []);
  assert.deepEqual(controller.exitCalls, []);
});

test('executePreparedImport returns ALREADY_ACTIVE when the controller stays active', async () => {
  const controller = createIdleController({ changed: false, active: true, state: 'processing' });

  const result = await executePreparedImport({
    preparedRecord: {
      fileInfo: { sourceFileKind: 'text_document', filePath: 'sample.txt' },
      routeMetadata: { chosenRoute: 'native' },
      requiresRouteChoice: false,
      routeChoiceOptions: [],
      ocrLanguage: 'es',
    },
    routePreference: '',
    resolvePaths: () => ({}),
    controller,
    log: silentLog,
  });

  assert.deepEqual(result, {
    ok: false,
    code: 'ALREADY_ACTIVE',
    state: 'processing',
  });
  assert.deepEqual(controller.enterCalls, [
    {
      source: 'import_extract_execution',
      reason: 'run_route',
    },
  ]);
  assert.deepEqual(controller.exitCalls, []);
});
