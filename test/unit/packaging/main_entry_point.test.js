'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('packaged application uses the protected Main entry point', () => {
  const repositoryRoot = path.resolve(__dirname, '..', '..', '..');
  const packageJson = JSON.parse(fs.readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8'));

  assert.equal(packageJson.main, 'electron/main_entry.js');
  assert.equal(fs.existsSync(path.join(repositoryRoot, packageJson.main)), true);
  assert.ok(packageJson.build.files.includes('electron/**'));
});
