'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');

const {
  IMPORT_CONFLICT_STRATEGY,
  importSelectedFiles,
} = require('../../../electron/reading_test_pool_import');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tot-reading-test-import-'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

test('importSelectedFiles imports a valid json file, normalizes pool data, and preserves valid readingTest questions', async () => {
  const tempDir = makeTempDir();
  const sourcePath = path.join(tempDir, 'sample.json');
  const poolDir = path.join(tempDir, 'pool');
  fs.mkdirSync(poolDir, { recursive: true });

  writeJson(sourcePath, {
    text: 'Sample reading text.',
    tags: {
      language: 'EN',
      type: 'Non fiction',
      difficulty: 'HARD',
    },
    readingTest: {
      questions: [
        {
          id: 'q1',
          prompt: 'What happened?',
          correctOptionId: 'a',
          options: [
            { id: 'a', text: 'One thing' },
            { id: 'b', text: 'Another thing' },
          ],
        },
      ],
    },
    ignored: 'field',
  });

  const result = await importSelectedFiles({
    selectedPaths: [sourcePath],
    poolDir,
  });

  assert.equal(result.ok, true);
  assert.equal(result.canceled, false);
  assert.equal(result.imported, 1);
  assert.equal(result.skippedDuplicates, 0);
  assert.equal(result.failedValidation, 0);
  assert.equal(result.failedArchiveEntries, 0);
  assert.equal(result.failedWrites, 0);

  const importedPath = path.join(poolDir, 'sample.json');
  const imported = JSON.parse(fs.readFileSync(importedPath, 'utf8'));
  assert.equal(imported.text, 'Sample reading text.');
  assert.deepEqual(imported.tags, {
    language: 'en',
    type: 'non_fiction',
    difficulty: 'hard',
  });
  assert.deepEqual(imported.readingTest, {
    questions: [
      {
        id: 'q1',
        prompt: 'What happened?',
        correctOptionId: 'a',
        options: [
          { id: 'a', text: 'One thing' },
          { id: 'b', text: 'Another thing' },
        ],
      },
    ],
  });
  assert.equal(Object.prototype.hasOwnProperty.call(imported, 'ignored'), false);
});

test('importSelectedFiles rejects imported json that contains invalid readingTest questions', async () => {
  const tempDir = makeTempDir();
  const sourcePath = path.join(tempDir, 'invalid-reading-test.json');
  const poolDir = path.join(tempDir, 'pool');
  fs.mkdirSync(poolDir, { recursive: true });

  writeJson(sourcePath, {
    text: 'Invalid imported text.',
    tags: {
      language: 'en',
      type: 'fiction',
      difficulty: 'normal',
    },
    readingTest: {
      invalid: true,
    },
  });

  const result = await importSelectedFiles({
    selectedPaths: [sourcePath],
    poolDir,
  });

  assert.equal(result.ok, true);
  assert.equal(result.imported, 0);
  assert.equal(result.failedValidation, 1);
  assert.equal(fs.existsSync(path.join(poolDir, 'invalid-reading-test.json')), false);
});

test('importSelectedFiles imports valid zip entries and reports invalid json entries as failed validation', async () => {
  const tempDir = makeTempDir();
  const zipPath = path.join(tempDir, 'pack.zip');
  const poolDir = path.join(tempDir, 'pool');
  fs.mkdirSync(poolDir, { recursive: true });

  const zip = new AdmZip();
  zip.addFile('valid.json', Buffer.from(JSON.stringify({
    text: 'Zip reading text.',
    tags: {
      language: 'fr',
      type: 'fiction',
      difficulty: 'normal',
    },
  }, null, 2), 'utf8'));
  zip.addFile('invalid.json', Buffer.from('{invalid', 'utf8'));
  zip.addFile('notes.txt', Buffer.from('ignore me', 'utf8'));
  zip.writeZip(zipPath);

  const result = await importSelectedFiles({
    selectedPaths: [zipPath],
    poolDir,
  });

  assert.equal(result.ok, true);
  assert.equal(result.imported, 1);
  assert.equal(result.skippedDuplicates, 0);
  assert.equal(result.failedValidation, 1);
  assert.equal(result.failedArchiveEntries, 0);
  assert.equal(result.failedWrites, 0);

  const importedPath = path.join(poolDir, 'valid.json');
  assert.equal(fs.existsSync(importedPath), true);
});

test('importSelectedFiles skips duplicate destination filenames when conflict strategy is skip', async () => {
  const tempDir = makeTempDir();
  const sourcePath = path.join(tempDir, 'duplicate.json');
  const poolDir = path.join(tempDir, 'pool');
  fs.mkdirSync(poolDir, { recursive: true });

  writeJson(path.join(poolDir, 'duplicate.json'), {
    text: 'Existing text.',
    tags: {
      language: 'es',
      type: 'fiction',
      difficulty: 'easy',
    },
  });
  writeJson(sourcePath, {
    text: 'Imported text.',
    tags: {
      language: 'en',
      type: 'fiction',
      difficulty: 'normal',
    },
  });

  const result = await importSelectedFiles({
    selectedPaths: [sourcePath],
    poolDir,
    resolveConflictStrategy: async () => IMPORT_CONFLICT_STRATEGY.SKIP,
  });

  assert.equal(result.ok, true);
  assert.equal(result.imported, 0);
  assert.equal(result.skippedDuplicates, 1);
  assert.equal(result.failedWrites, 0);

  const imported = JSON.parse(fs.readFileSync(path.join(poolDir, 'duplicate.json'), 'utf8'));
  assert.equal(imported.text, 'Existing text.');
});

test('importSelectedFiles replaces duplicate destination filenames when conflict strategy is replace', async () => {
  const tempDir = makeTempDir();
  const sourcePath = path.join(tempDir, 'duplicate.json');
  const poolDir = path.join(tempDir, 'pool');
  fs.mkdirSync(poolDir, { recursive: true });

  writeJson(path.join(poolDir, 'duplicate.json'), {
    text: 'Existing text.',
    tags: {
      language: 'es',
      type: 'fiction',
      difficulty: 'easy',
    },
  });
  writeJson(sourcePath, {
    text: 'Replacement text.',
    tags: {
      language: 'pt',
      type: 'non_fiction',
      difficulty: 'normal',
    },
  });

  const result = await importSelectedFiles({
    selectedPaths: [sourcePath],
    poolDir,
    resolveConflictStrategy: async () => IMPORT_CONFLICT_STRATEGY.REPLACE,
  });

  assert.equal(result.ok, true);
  assert.equal(result.imported, 1);
  assert.equal(result.skippedDuplicates, 0);
  assert.equal(result.failedWrites, 0);

  const imported = JSON.parse(fs.readFileSync(path.join(poolDir, 'duplicate.json'), 'utf8'));
  assert.equal(imported.text, 'Replacement text.');
  assert.equal(imported.tags.language, 'pt');
});

test('importSelectedFiles reports failed final writes explicitly', async () => {
  const tempDir = makeTempDir();
  const sourcePath = path.join(tempDir, 'blocked.json');
  const poolDir = path.join(tempDir, 'pool');
  fs.mkdirSync(poolDir, { recursive: true });

  writeJson(sourcePath, {
    text: 'Blocked replacement text.',
    tags: {
      language: 'en',
      type: 'fiction',
      difficulty: 'normal',
    },
  });

  const blockedDestinationPath = path.join(poolDir, 'blocked.json');
  fs.mkdirSync(blockedDestinationPath, { recursive: true });

  const result = await importSelectedFiles({
    selectedPaths: [sourcePath],
    poolDir,
    resolveConflictStrategy: async () => IMPORT_CONFLICT_STRATEGY.REPLACE,
  });

  assert.equal(result.ok, true);
  assert.equal(result.imported, 0);
  assert.equal(result.skippedDuplicates, 0);
  assert.equal(result.failedValidation, 0);
  assert.equal(result.failedArchiveEntries, 0);
  assert.equal(result.failedWrites, 1);
});

test('importSelectedFiles rejects imported json that contains unsupported tag keys', async () => {
  const tempDir = makeTempDir();
  const sourcePath = path.join(tempDir, 'invalid.json');
  const poolDir = path.join(tempDir, 'pool');
  fs.mkdirSync(poolDir, { recursive: true });

  writeJson(sourcePath, {
    text: 'Invalid imported text.',
    tags: {
      language: 'en',
      type: 'fiction',
      difficulty: 'normal',
      obsolete: false,
    },
  });

  const result = await importSelectedFiles({
    selectedPaths: [sourcePath],
    poolDir,
  });

  assert.equal(result.ok, true);
  assert.equal(result.imported, 0);
  assert.equal(result.failedValidation, 1);
  assert.equal(fs.existsSync(path.join(poolDir, 'invalid.json')), false);
});
