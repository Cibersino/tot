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

// This runs the real Electron main-process bootstrap, but its required-main-startup BrowserWindow,
// menu, and native-dialog effects are simulated by the probe. It does not verify
// native Chromium window or dialog behavior.

function writeSettingsFile(userDataDir) {
  const configDir = path.join(userDataDir, 'config');
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(
    path.join(configDir, 'user_settings.json'),
    JSON.stringify({
      language: 'en',
      presetsByScope: {},
      selectedPresetByScope: {},
      disabledDefaultPresetsByScope: {},
      numberFormattingByScope: {},
      modeConteo: 'preciso',
      previewSpoilerEnabled: true,
    }, null, 2),
    'utf8'
  );
}

function runProbe(scenario, userDataDir, { logLevel = 'silent' } = {}) {
  const childEnv = {
    ...process.env,
    TOT_MAIN_STARTUP_FAILURE_PROBE_SCENARIO: scenario,
    TOT_SMOKE_TEST: '1',
    TOT_SMOKE_USER_DATA_DIR: userDataDir,
    TOT_LOG_LEVEL: logLevel,
  };
  delete childEnv.ELECTRON_RUN_AS_NODE;

  const child = spawn(
    electronBinary,
    ['test/helpers/main_startup_failure_probe.js'],
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
      reject(new Error(`Main startup ${scenario} probe timed out.\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
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

for (const {
  scenario,
  dialogFails = false,
  firstRunFallback = false,
  vetoedClose = false,
  closesMainWindow = false,
  deferredPostReadyClose = false,
  earlyStartupFailure = false,
  expectedDiagnostic = '',
} of [
  {
    scenario: 'storage-initialization',
    earlyStartupFailure: true,
    expectedDiagnostic: 'Storage init failed:',
  },
  {
    scenario: 'storage-initialization-dialog-failure',
    dialogFails: true,
    earlyStartupFailure: true,
    expectedDiagnostic: 'Storage init failed:',
  },
  {
    scenario: 'language-catalog',
    earlyStartupFailure: true,
    expectedDiagnostic: 'Required language catalog initialization failed:',
  },
  {
    scenario: 'default-main-translations',
    earlyStartupFailure: true,
    expectedDiagnostic: 'Required default main translations unavailable; startup terminated:',
  },
  { scenario: 'menu-installation' },
  { scenario: 'main-window-construction' },
  { scenario: 'main-document-load' },
  { scenario: 'main-document-load-after-vetoed-close', vetoedClose: true },
  { scenario: 'main-preload', closesMainWindow: true },
  { scenario: 'renderer-i18n-startup', closesMainWindow: true },
  { scenario: 'renderer-i18n-startup-api', closesMainWindow: true },
  { scenario: 'renderer-i18n-transition-restoration', deferredPostReadyClose: true },
  { scenario: 'first-run-fallback-menu-installation', firstRunFallback: true },
  { scenario: 'menu-installation-dialog-failure', dialogFails: true },
]) {
  const expectedLifecycle = deferredPostReadyClose
    ? 'defers close while post-READY processing is active, then persists and quits'
    : earlyStartupFailure
    ? 'terminates before current-text initialization'
    : dialogFails
    ? 'continues after native-dialog failure, settles initial processing, persists, and quits'
    : 'discloses, settles initial processing, persists, and quits';
  test(`main startup ${scenario} failure ${expectedLifecycle}`, async (t) => {
    const userDataDir = createTestTempDir(`main-startup-${scenario}`);
    t.after(() => fs.rmSync(userDataDir, { recursive: true, force: true }));
    if (!firstRunFallback) writeSettingsFile(userDataDir);

    const result = await runProbe(scenario, userDataDir, {
      logLevel: earlyStartupFailure ? 'error' : 'silent',
    });

    assert.equal(result.signal, null, `Electron exited via signal.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    assert.equal(result.code, 0, `Electron exited with non-zero code.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    if (earlyStartupFailure && dialogFails) {
      assert.doesNotMatch(result.stdout, /TOT_MAIN_EARLY_STARTUP_FAILURE_NOTICE:/);
    } else if (earlyStartupFailure) {
      assert.match(
        result.stdout,
        /TOT_MAIN_EARLY_STARTUP_FAILURE_NOTICE:\{"title":"toT no pudo iniciarse","message":"No se pudo iniciar toT\. La aplicación se cerrará\.","buttons":\["Aceptar"\]\}/
      );
    } else if (dialogFails) {
      assert.doesNotMatch(result.stdout, new RegExp(`TOT_MAIN_STARTUP_FAILURE_DIALOG:${scenario}`));
    } else {
      assert.match(result.stdout, new RegExp(`TOT_MAIN_STARTUP_FAILURE_DIALOG:${scenario}`));
    }
    const menuInstallationAttempts = result.stdout.match(/TOT_MAIN_STARTUP_MENU_INSTALL_ATTEMPT:/g) || [];
    assert.equal(
      menuInstallationAttempts.length,
      earlyStartupFailure ? 0 : 1,
      `Unexpected initial menu installation attempts.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`
    );
    if (earlyStartupFailure) {
      assert.match(result.stderr, new RegExp(expectedDiagnostic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.doesNotMatch(result.stdout, /TOT_SMOKE_READY/);
    }
    if (vetoedClose) {
      assert.match(result.stdout, new RegExp(`TOT_MAIN_STARTUP_FAILURE_CLOSE_VETOED:${scenario}`));
    }
    if (closesMainWindow) {
      assert.match(result.stdout, new RegExp(`TOT_MAIN_STARTUP_FAILURE_CLOSE_COMPLETED:${scenario}`));
      assert.doesNotMatch(result.stdout, new RegExp(`TOT_MAIN_STARTUP_FAILURE_CLOSE_VETOED:${scenario}`));
    }
    if (deferredPostReadyClose) {
      assert.match(result.stdout, new RegExp(`TOT_MAIN_STARTUP_FAILURE_CLOSE_VETOED:${scenario}`));
      assert.match(result.stdout, new RegExp(`TOT_MAIN_STARTUP_FAILURE_CLOSE_COMPLETED:${scenario}`));
      assert.match(result.stdout, /TOT_MAIN_STARTUP_FAILURE_PROCESSING_RESOLVE:\{"requestId":1,"ok":true\}/);
      assert.match(result.stdout, /TOT_MAIN_STARTUP_FAILURE_PROCESSING_RESOLVE:\{"requestId":2,"ok":true\}/);
      assert.doesNotMatch(result.stdout, /TOT_MAIN_STARTUP_FAILURE_PROCESSING_RESOLVE:\{"requestId":1,"ok":false\}/);
    } else if (!earlyStartupFailure) {
      assert.match(result.stdout, /TOT_MAIN_STARTUP_FAILURE_PROCESSING_RESOLVE:\{"requestId":1,"ok":false\}/);
    }
    if (earlyStartupFailure) {
      assert.doesNotMatch(result.stdout, /TOT_MAIN_STARTUP_FAILURE_PROCESSING_RESOLVE:/);
      assert.doesNotMatch(result.stdout, /TOT_MAIN_STARTUP_FAILURE_CURRENT_TEXT_PERSISTED/);
    } else {
      assert.match(result.stdout, /TOT_MAIN_STARTUP_FAILURE_CURRENT_TEXT_PERSISTED/);
    }
    assert.match(result.stdout, new RegExp(`TOT_MAIN_STARTUP_FAILURE_QUIT:${scenario}`));
  });
}
