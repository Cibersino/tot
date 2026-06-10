'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const {
  createTestTempDir,
} = require('../../helpers/test_temp_paths');

const afterAllArtifactBuild = require('../../../build-resources/after-all-artifact-build.js').default;

function createArtifactZip(zipPath, entries) {
  const zip = new AdmZip();
  for (const entry of entries) {
    zip.addFile(entry.name, Buffer.from(entry.contents, 'utf8'));
  }
  zip.writeZip(zipPath);
}

function readZipEntryNames(zipPath) {
  return new AdmZip(zipPath)
    .getEntries()
    .map((entry) => entry.entryName)
    .sort();
}

function readZipFileEntryNames(zipPath) {
  return new AdmZip(zipPath)
    .getEntries()
    .filter((entry) => !entry.isDirectory)
    .map((entry) => entry.entryName)
    .sort();
}

function readZipText(zipPath, entryName) {
  const entry = new AdmZip(zipPath).getEntry(entryName);
  assert.ok(entry, `Missing zip entry: ${entryName}`);
  return entry.getData().toString('utf8');
}

test('afterAllArtifactBuild wraps Windows zip contents under toT-app and adds INSTALL.txt', async (t) => {
  const tempDir = createTestTempDir('after-all-artifact-build');
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const zipPath = path.join(tempDir, 'toT-9.9.9-win-x64.zip');
  createArtifactZip(zipPath, [
    { name: 'toT.exe', contents: 'exe' },
    { name: 'LICENSE.electron.txt', contents: 'license' },
    { name: 'resources/app.asar', contents: 'asar' },
  ]);

  await afterAllArtifactBuild({
    configuration: {
      productName: 'toT',
      extraMetadata: { version: '9.9.9' },
    },
    artifactPaths: [zipPath],
  });

  const entryNames = readZipEntryNames(zipPath);
  assert.deepEqual(readZipFileEntryNames(zipPath), [
    'toT-9.9.9/INSTALL.txt',
    'toT-9.9.9/toT-app/LICENSE.electron.txt',
    'toT-9.9.9/toT-app/resources/app.asar',
    'toT-9.9.9/toT-app/toT.exe',
  ]);
  assert.equal(entryNames.includes('toT-9.9.9/'), true);
  assert.equal(entryNames.includes('toT-9.9.9/toT-app/'), true);

  const installText = readZipText(zipPath, 'toT-9.9.9/INSTALL.txt');
  assert.match(installText, /toT-app/);
  assert.match(installText, /Applications/);
});

test('afterAllArtifactBuild keeps an already transformed Windows zip stable', async (t) => {
  const tempDir = createTestTempDir('after-all-artifact-build-idempotent');
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const zipPath = path.join(tempDir, 'toT-9.9.9-win-x64.zip');
  createArtifactZip(zipPath, [
    { name: 'toT-9.9.9/INSTALL.txt', contents: 'existing install note' },
    { name: 'toT-9.9.9/toT-app/toT.exe', contents: 'exe' },
    { name: 'toT-9.9.9/toT-app/resources/app.asar', contents: 'asar' },
  ]);

  await afterAllArtifactBuild({
    configuration: {
      productName: 'toT',
      extraMetadata: { version: '9.9.9' },
    },
    artifactPaths: [zipPath],
  });

  const entryNames = readZipEntryNames(zipPath);
  assert.deepEqual(readZipFileEntryNames(zipPath), [
    'toT-9.9.9/INSTALL.txt',
    'toT-9.9.9/toT-app/resources/app.asar',
    'toT-9.9.9/toT-app/toT.exe',
  ]);
  assert.equal(entryNames.some((name) => name.includes('/toT-app/toT-app/')), false);
  assert.equal(readZipText(zipPath, 'toT-9.9.9/INSTALL.txt'), 'existing install note');
});
