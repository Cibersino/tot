'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('node:child_process');

const electronBinary = require('electron');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tot-electron-smoke-'));
}

function writeSmokeSettingsFile(userDataDir) {
  const configDir = path.join(userDataDir, 'config');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, 'user_settings.json'),
    JSON.stringify({
      language: 'en',
      presets_by_language: {},
      selected_preset_by_language: {},
      disabled_default_presets: {},
      numberFormatting: {},
      modeConteo: 'preciso',
    }, null, 2),
    'utf8'
  );
}

test('Electron app reaches READY state in isolated smoke mode and exits cleanly', async (t) => {
  const userDataDir = makeTempDir();
  writeSmokeSettingsFile(userDataDir);
  t.after(() => fs.rmSync(userDataDir, { recursive: true, force: true }));

  const childEnv = {
    ...process.env,
    TOT_SMOKE_TEST: '1',
    TOT_SMOKE_USER_DATA_DIR: userDataDir,
    TOT_LOG_LEVEL: 'silent',
  };
  delete childEnv.ELECTRON_RUN_AS_NODE;

  const child = spawn(
    electronBinary,
    ['.'],
    {
      cwd: path.resolve(__dirname, '..', '..'),
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  let stdout = '';
  let stderr = '';
  let readySeen = false;

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    if (stdout.includes('TOT_SMOKE_READY')) {
      readySeen = true;
    }
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  const result = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      try {
        child.kill();
      } catch {}
      reject(new Error(`Electron smoke test timed out.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
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

  assert.equal(readySeen, true, `Smoke ready marker not observed.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.equal(result.signal, null, `Electron exited via signal.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  assert.equal(result.code, 0, `Electron exited with non-zero code.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
});
