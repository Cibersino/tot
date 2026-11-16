'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const {
  createTestTempDir,
} = require('../helpers/test_temp_paths');

const electronBinary = require('electron');

function runProbe(scenario, userDataDir) {
  const childEnv = {
    ...process.env,
    TOT_MAIN_ENTRY_FAILURE_PROBE_SCENARIO: scenario,
    TOT_MAIN_ENTRY_FAILURE_USER_DATA_DIR: userDataDir,
  };
  delete childEnv.ELECTRON_RUN_AS_NODE;

  const child = spawn(
    electronBinary,
    ['test/helpers/main_entry_failure_probe.js'],
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

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      reject(new Error(`Main entry ${scenario} probe timed out.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
    }, 30000);
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('exit', (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

for (const scenario of ['notice-success', 'notice-failure']) {
  test(`protected Main entry exits with an error when the native notice ${scenario}`, async (t) => {
    const userDataDir = createTestTempDir(`main-entry-${scenario}`);
    t.after(() => fs.rmSync(userDataDir, { recursive: true, force: true }));

    const result = await runProbe(scenario, userDataDir);

    assert.equal(result.signal, null, `Electron exited via signal.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    assert.equal(result.code, 1, `Electron did not exit with status 1.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    assert.match(result.stderr, /Fatal error while loading Main entry point:/);
    assert.match(result.stderr, /Error: forced synchronous Main entry load failure/);
    assert.match(result.stderr, /throwSynchronousMainLoadFailure/);

    const noticeAttempts = result.stdout.match(/TOT_MAIN_ENTRY_FAILURE_NOTICE_ATTEMPT:/g) || [];
    assert.equal(noticeAttempts.length, 1, `Unexpected native notice attempts.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    assert.match(
      result.stdout,
      /TOT_MAIN_ENTRY_FAILURE_NOTICE_ATTEMPT:\{"title":"Problema de la aplicación","message":"No se pudo iniciar toT\. La aplicación se cerrará\."\}/
    );

    if (scenario === 'notice-failure') {
      assert.match(result.stdout, /TOT_MAIN_ENTRY_FAILURE_NOTICE_FAILURE/);
      assert.match(result.stderr, /Main entry failure notice could not be displayed:/);
      assert.match(result.stderr, /Error: forced main entry native notice failure/);
    } else {
      assert.doesNotMatch(result.stdout, /TOT_MAIN_ENTRY_FAILURE_NOTICE_FAILURE/);
    }
  });
}
