'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getNativeParserForExt,
  getOcrSourceMimeTypeForExt,
  getSupportedNativeExtensions,
  getSupportedOcrSourceExtensions,
} = require('../../../electron/import_extract_platform/import_extract_supported_formats');

test('getNativeParserForExt normalizes case and leading dot', () => {
  assert.equal(getNativeParserForExt('txt'), 'plain_text');
  assert.equal(getNativeParserForExt('.MD'), 'markdown_text');
  assert.equal(getNativeParserForExt(' PDF '), 'pdf_text_layer');
});

test('getNativeParserForExt returns empty string for unsupported extensions', () => {
  assert.equal(getNativeParserForExt('rtf'), '');
  assert.equal(getNativeParserForExt(''), '');
  assert.equal(getNativeParserForExt(null), '');
});

test('getOcrSourceMimeTypeForExt normalizes case and leading dot', () => {
  assert.equal(getOcrSourceMimeTypeForExt('jpg'), 'image/jpeg');
  assert.equal(getOcrSourceMimeTypeForExt('.JPEG'), 'image/jpeg');
  assert.equal(getOcrSourceMimeTypeForExt(' odt '), 'application/vnd.oasis.opendocument.text');
  assert.equal(getOcrSourceMimeTypeForExt('.TIFF'), 'image/tiff');
  assert.equal(getOcrSourceMimeTypeForExt(' pdf '), 'application/pdf');
});

test('getOcrSourceMimeTypeForExt returns empty string for unsupported extensions', () => {
  assert.equal(getOcrSourceMimeTypeForExt('gif'), '');
  assert.equal(getOcrSourceMimeTypeForExt(''), '');
  assert.equal(getOcrSourceMimeTypeForExt(undefined), '');
});

test('supported extension lists stay aligned with the shared contract', () => {
  assert.deepEqual(
    getSupportedNativeExtensions().sort(),
    ['docx', 'htm', 'html', 'md', 'pdf', 'txt']
  );

  assert.deepEqual(
    getSupportedOcrSourceExtensions().sort(),
    ['bmp', 'jpeg', 'jpg', 'odt', 'pdf', 'png', 'rtf', 'tif', 'tiff', 'webp']
  );
});
