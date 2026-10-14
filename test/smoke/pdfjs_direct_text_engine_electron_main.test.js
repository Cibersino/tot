'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { spawn } = require('node:child_process');
const {
  createTestTempDir,
} = require('../helpers/test_temp_paths');

const electronBinary = require('electron');

test('direct PDF.js ESM loading and text extraction succeed in Electron main', async (t) => {
  const userDataDir = createTestTempDir('pdfjs-electron-main-smoke');
  t.after(() => fs.rmSync(userDataDir, { recursive: true, force: true }));

  const childEnv = {
    ...process.env,
    TOT_PDFJS_SMOKE_USER_DATA_DIR: userDataDir,
    TOT_LOG_LEVEL: 'silent',
  };
  delete childEnv.ELECTRON_RUN_AS_NODE;

  const child = spawn(
    electronBinary,
    ['test/helpers/pdfjs_direct_text_engine_electron_main_probe.js'],
    {
      cwd: path.resolve(__dirname, '..', '..'),
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  let stdout = '';
  let stderr = '';

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      reject(new Error(`Direct PDF.js Electron-main smoke test timed out.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
    }, 30000);

    child.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
    child.on('exit', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });

  assert.match(stdout, /TOT_PDFJS_ELECTRON_MAIN_READY/);
  assert.equal(result.signal, null, `Electron exited via signal.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.equal(result.code, 0, `Electron exited with non-zero code.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
});
