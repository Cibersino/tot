'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

function loadFreshPreparedStore() {
  const modulePath = path.resolve(__dirname, '../../../electron/import_extract_platform/import_extract_prepared_store.js');
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tot-prepared-store-'));
}

test('createPreparedRecord and peekPreparedRecord expose active records', () => {
  const store = loadFreshPreparedStore();

  const record = store.createPreparedRecord({
    fileInfo: { sourceFileExt: 'txt' },
  });

  assert.match(record.prepareId, /^[0-9a-f-]{36}$/i);
  assert.equal(record.fileInfo.sourceFileExt, 'txt');
  assert.ok(record.expiresAtEpochMs > record.createdAtEpochMs);

  assert.deepEqual(
    store.peekPreparedRecord(record.prepareId),
    { ok: true, record }
  );
});

test('consumePreparedRecord marks records as reused on subsequent lookups', () => {
  const store = loadFreshPreparedStore();
  const record = store.createPreparedRecord({ value: 1 });

  assert.deepEqual(
    store.consumePreparedRecord(record.prepareId),
    { ok: true, record }
  );

  assert.deepEqual(
    store.peekPreparedRecord(record.prepareId),
    { ok: false, reason: 'reused' }
  );

  assert.deepEqual(
    store.consumePreparedRecord(record.prepareId),
    { ok: false, reason: 'reused' }
  );
});

test('records expire once their TTL window has passed', () => {
  const store = loadFreshPreparedStore();
  const originalNow = Date.now;
  let now = 10_000;

  Date.now = () => now;
  try {
    const record = store.createPreparedRecord({ value: 1 }, { ttlMs: 1 });
    now = record.expiresAtEpochMs + 1;

    assert.deepEqual(
      store.peekPreparedRecord(record.prepareId),
      { ok: false, reason: 'invalid_or_expired' }
    );
  } finally {
    Date.now = originalNow;
  }
});

test('shortPrepareId truncates safely and handles invalid input', () => {
  const store = loadFreshPreparedStore();

  assert.equal(store.shortPrepareId('1234567890abcdef'), '12345678');
  assert.equal(store.shortPrepareId('   abcd   '), 'abcd');
  assert.equal(store.shortPrepareId(''), '');
  assert.equal(store.shortPrepareId(null), '');
});

test('readSourceFileFingerprint returns resolved path, size, and floored mtime', (t) => {
  const store = loadFreshPreparedStore();
  const dir = makeTempDir();
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const filePath = path.join(dir, 'sample.txt');
  fs.writeFileSync(filePath, 'hello');

  const fingerprint = store.readSourceFileFingerprint(filePath);

  assert.equal(fingerprint.path, path.resolve(filePath));
  assert.equal(fingerprint.size, 5);
  assert.equal(Number.isInteger(fingerprint.mtimeMs), true);
  assert.ok(fingerprint.mtimeMs > 0);
});
