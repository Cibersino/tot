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
  const contents = JSON.stringify({
    language: 'en',
    presetsByScope: {},
    selectedPresetByScope: {},
    disabledDefaultPresetsByScope: {},
    numberFormattingByScope: {},
    modeConteo: 'preciso',
    previewSpoilerEnabled: true,
  }, null, 2);
  fs.writeFileSync(path.join(configDir, 'user_settings.json'), contents, 'utf8');
  return contents;
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
  settingsStartupFailure = false,
  normalStartup = false,
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
  {
    scenario: 'settings-admission',
    settingsStartupFailure: true,
    expectedDiagnostic: 'Initial global settings admission failed:',
  },
  {
    scenario: 'settings-admission-dialog-failure',
    dialogFails: true,
    settingsStartupFailure: true,
    expectedDiagnostic: 'Initial global settings admission failed:',
  },
  {
    scenario: 'settings-backup',
    settingsStartupFailure: true,
    expectedDiagnostic: 'Initial global settings backup failed:',
  },
  {
    scenario: 'settings-initial-write',
    settingsStartupFailure: true,
    expectedDiagnostic: 'Initial global settings persistence failed:',
  },
  {
    scenario: 'settings-initialization',
    settingsStartupFailure: true,
    expectedDiagnostic: 'Initial global settings initialization failed:',
  },
  {
    scenario: 'config-dir-preparation-then-settings-write-failure',
    settingsStartupFailure: true,
    expectedDiagnostic: 'Initial global settings persistence failed:',
  },
  { scenario: 'config-dir-preparation-recovers', normalStartup: true },
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
    : settingsStartupFailure
    ? 'terminates before current-text initialization'
    : normalStartup
    ? 'continues after best-effort configuration-directory preparation fails'
    : dialogFails
    ? 'continues after native-dialog failure, settles initial processing, persists, and quits'
    : 'discloses, settles initial processing, persists, and quits';
  test(`main startup ${scenario} failure ${expectedLifecycle}`, async (t) => {
    const userDataDir = createTestTempDir(`main-startup-${scenario}`);
    t.after(() => fs.rmSync(userDataDir, { recursive: true, force: true }));
    const initialSettingsContents = firstRunFallback ? null : writeSettingsFile(userDataDir);

    const result = await runProbe(scenario, userDataDir, {
      logLevel: earlyStartupFailure || settingsStartupFailure || normalStartup ? 'error' : 'silent',
    });

    assert.equal(result.signal, null, `Electron exited via signal.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    assert.equal(result.code, 0, `Electron exited with non-zero code.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    if (settingsStartupFailure && dialogFails) {
      assert.match(result.stdout, new RegExp(`TOT_MAIN_STARTUP_FAILURE_DIALOG_ATTEMPT:${scenario}`));
      assert.match(result.stderr, /Startup failure native dialog failed:/);
    } else if (earlyStartupFailure && dialogFails) {
      assert.doesNotMatch(result.stdout, /TOT_MAIN_EARLY_STARTUP_FAILURE_NOTICE:/);
    } else if (earlyStartupFailure) {
      assert.match(
        result.stdout,
        /TOT_MAIN_EARLY_STARTUP_FAILURE_NOTICE:\{"title":"toT no pudo iniciarse","message":"No se pudo iniciar toT\. La aplicación se cerrará\.","buttons":\["Aceptar"\]\}/
      );
    } else if (settingsStartupFailure) {
      assert.match(
        result.stdout,
        new RegExp(`TOT_MAIN_STARTUP_FAILURE_DIALOG:${scenario}:`)
      );
      assert.match(result.stdout, /"buttons":\["Aceptar"\]/);
      const expectedTitles = {
        'settings-admission': 'No se pudo usar la configuración guardada',
        'settings-backup': 'No se pudo respaldar la configuración guardada',
        'settings-initial-write': 'No se pudo guardar la configuración inicial',
        'settings-initialization': 'No se pudo inicializar la configuración',
        'config-dir-preparation-then-settings-write-failure': 'No se pudo guardar la configuración inicial',
      };
      assert.match(result.stdout, new RegExp(expectedTitles[scenario]));
    } else if (normalStartup) {
      assert.doesNotMatch(result.stdout, /TOT_MAIN_STARTUP_FAILURE_DIALOG:/);
    } else if (dialogFails) {
      assert.doesNotMatch(result.stdout, new RegExp(`TOT_MAIN_STARTUP_FAILURE_DIALOG:${scenario}`));
    } else {
      assert.match(result.stdout, new RegExp(`TOT_MAIN_STARTUP_FAILURE_DIALOG:${scenario}`));
    }
    const menuInstallationAttempts = result.stdout.match(/TOT_MAIN_STARTUP_MENU_INSTALL_ATTEMPT:/g) || [];
    assert.equal(
      menuInstallationAttempts.length,
      (earlyStartupFailure || settingsStartupFailure) ? 0 : 1,
      `Unexpected initial menu installation attempts.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`
    );
    if (earlyStartupFailure || settingsStartupFailure) {
      assert.match(result.stderr, new RegExp(expectedDiagnostic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.doesNotMatch(result.stdout, /TOT_SMOKE_READY/);
    }
    if (scenario === 'settings-admission' || scenario === 'settings-admission-dialog-failure') {
      assert.equal(
        fs.readFileSync(path.join(userDataDir, 'config', 'user_settings.json'), 'utf8'),
        initialSettingsContents
      );
    }
    if (scenario === 'config-dir-preparation-then-settings-write-failure') {
      assert.match(result.stderr, /ensureConfigDir failed:/);
      assert.match(result.stderr, /forced configuration directory preparation failure/);
      assert.match(result.stderr, /forced settings write after configuration preparation failure/);
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
    } else if (!earlyStartupFailure && !settingsStartupFailure && !normalStartup) {
      assert.match(result.stdout, /TOT_MAIN_STARTUP_FAILURE_PROCESSING_RESOLVE:\{"requestId":1,"ok":false\}/);
    }
    if (earlyStartupFailure || settingsStartupFailure) {
      assert.doesNotMatch(result.stdout, /TOT_MAIN_STARTUP_FAILURE_PROCESSING_RESOLVE:/);
      assert.doesNotMatch(result.stdout, /TOT_MAIN_STARTUP_FAILURE_CURRENT_TEXT_PERSISTED/);
    } else {
      assert.match(result.stdout, /TOT_MAIN_STARTUP_FAILURE_CURRENT_TEXT_PERSISTED/);
    }
    if (normalStartup) {
      assert.match(result.stderr, /ensureConfigDir failed:/);
      assert.match(result.stderr, /forced configuration directory preparation failure/);
      assert.match(result.stdout, /TOT_SMOKE_READY/);
      assert.match(result.stdout, /TOT_MAIN_STARTUP_FAILURE_PROCESSING_RESOLVE:\{"requestId":1,"ok":true\}/);
    }
    assert.match(result.stdout, new RegExp(`TOT_MAIN_STARTUP_FAILURE_QUIT:${scenario}`));
  });
}
