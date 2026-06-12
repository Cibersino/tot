'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const {
  createTestTempDir,
} = require('../../helpers/test_temp_paths');

const ROUTE_MODULE_PATH = path.resolve(
  __dirname,
  '../../../electron/text_extraction_platform/native_extraction_route.js'
);
const EPUB_MODULE_PATH = path.resolve(
  __dirname,
  '../../../electron/text_extraction_platform/epub_text_extraction.js'
);

function createMinimalEpub(t, xhtmlBody = '<p>Hello</p>') {
  const dir = createTestTempDir('native-extraction-route-epub');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const filePath = path.join(dir, 'fixture.epub');
  const zip = new AdmZip();
  zip.addFile('mimetype', Buffer.from('application/epub+zip'));
  zip.addFile('META-INF/container.xml', Buffer.from([
    '<?xml version="1.0"?>',
    '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">',
    '  <rootfiles>',
    '    <rootfile full-path="OPS/content.opf" media-type="application/oebps-package+xml"/>',
    '  </rootfiles>',
    '</container>',
  ].join(''), 'utf8'));
  zip.addFile('OPS/content.opf', Buffer.from([
    '<?xml version="1.0" encoding="utf-8"?>',
    '<package version="3.0" xmlns="http://www.idpf.org/2007/opf">',
    '  <manifest>',
    '    <item id="chapter-1" href="chapter1.xhtml" media-type="application/xhtml+xml"/>',
    '  </manifest>',
    '  <spine>',
    '    <itemref idref="chapter-1"/>',
    '  </spine>',
    '</package>',
  ].join('\n'), 'utf8'));
  zip.addFile('OPS/chapter1.xhtml', Buffer.from(
    `<html xmlns="http://www.w3.org/1999/xhtml"><body>${xhtmlBody}</body></html>`,
    'utf8'
  ));
  zip.writeZip(filePath);
  return filePath;
}

function loadNativeRouteWithEpubMock(mockExtractEpubText) {
  const originalRouteModule = require.cache[ROUTE_MODULE_PATH];
  const originalEpubModule = require.cache[EPUB_MODULE_PATH];

  require.cache[EPUB_MODULE_PATH] = {
    id: EPUB_MODULE_PATH,
    filename: EPUB_MODULE_PATH,
    loaded: true,
    exports: {
      extractEpubText: mockExtractEpubText,
    },
  };

  delete require.cache[ROUTE_MODULE_PATH];
  const routeModule = require(ROUTE_MODULE_PATH);

  function restore() {
    delete require.cache[ROUTE_MODULE_PATH];
    if (originalRouteModule) {
      require.cache[ROUTE_MODULE_PATH] = originalRouteModule;
    } else {
      delete require.cache[ROUTE_MODULE_PATH];
    }

    if (originalEpubModule) {
      require.cache[EPUB_MODULE_PATH] = originalEpubModule;
    } else {
      delete require.cache[EPUB_MODULE_PATH];
    }
  }

  return {
    routeModule,
    restore,
  };
}

test('runNativeExtractionRoute succeeds for EPUB inputs', async (t) => {
  const { runNativeExtractionRoute } = require('../../../electron/text_extraction_platform/native_extraction_route');
  const filePath = createMinimalEpub(t, '<h1>Heading</h1><p>Hello world</p>');

  const result = await runNativeExtractionRoute({ filePath });

  assert.equal(result.state, 'success');
  assert.equal(result.executedRoute, 'native');
  assert.equal(result.provenance.sourceFileExt, 'epub');
  assert.equal(result.provenance.metadataSafeForLogs.parserType, 'epub_text');
  assert.match(result.text, /Heading/);
  assert.match(result.text, /Hello world/);
});

test('runNativeExtractionRoute adds native_empty_text warning when EPUB extraction is empty', async (t) => {
  const dir = createTestTempDir('native-extraction-route-empty-epub');
  const filePath = path.join(dir, 'empty.epub');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(filePath, 'placeholder');

  const { routeModule, restore } = loadNativeRouteWithEpubMock(async () => ({
    text: '',
    warnings: [],
  }));
  t.after(restore);

  const result = await routeModule.runNativeExtractionRoute({ filePath });

  assert.equal(result.state, 'success');
  assert.deepEqual(result.warnings, ['native_empty_text']);
});

test('runNativeExtractionRoute maps EPUB structural failures to unreadable_or_corrupt', async (t) => {
  const dir = createTestTempDir('native-extraction-route-bad-epub');
  const filePath = path.join(dir, 'broken.epub');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(filePath, 'placeholder');

  const { routeModule, restore } = loadNativeRouteWithEpubMock(async () => {
    const err = new Error('broken epub');
    err.code = 'EPUB_INVALID_CONTAINER_XML';
    throw err;
  });
  t.after(restore);

  const result = await routeModule.runNativeExtractionRoute({ filePath });

  assert.equal(result.state, 'failure');
  assert.equal(result.error.code, 'unreadable_or_corrupt');
});

test('runNativeExtractionRoute maps unexpected EPUB exceptions to native_extraction_failed', async (t) => {
  const dir = createTestTempDir('native-extraction-route-runtime-epub');
  const filePath = path.join(dir, 'runtime.epub');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(filePath, 'placeholder');

  const { routeModule, restore } = loadNativeRouteWithEpubMock(async () => {
    throw new Error('unexpected runtime failure');
  });
  t.after(restore);

  const result = await routeModule.runNativeExtractionRoute({ filePath });

  assert.equal(result.state, 'failure');
  assert.equal(result.error.code, 'native_extraction_failed');
});
