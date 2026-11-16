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

function writeSettingsFile(userDataDir, language = 'en') {
  const configDir = path.join(userDataDir, 'config');
  fs.mkdirSync(configDir, { recursive: true });
  const contents = JSON.stringify({
    language,
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
  firstRunLanguageChooser = false,
  firstRunFallbackPersistenceFailure = false,
  firstRunBootstrapFailure = false,
  firstRunDocumentLoadFailure = false,
  firstRunStructuralFailure = false,
  firstRunFallbackContinuation = false,
  rendererStartupFailure = false,
  successfulStartup = false,
  expectedMenuInstallationAttempts = 1,
  vetoedClose = false,
  closesMainWindow = false,
  deferredPostReadyClose = false,
  earlyStartupFailure = false,
  settingsStartupFailure = false,
  snapshotTagStartupFailure = false,
  registrationStartupFailure = false,
  settingsLanguage = 'en',
  normalStartup = false,
  expectedDiagnostic = '',
  expectedCause = '',
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
  {
    scenario: 'snapshot-tags-admission',
    snapshotTagStartupFailure: true,
    expectedDiagnostic: 'Initial snapshot-tag settings admission failed:',
  },
  {
    scenario: 'snapshot-tags-admission-default-language',
    snapshotTagStartupFailure: true,
    settingsLanguage: '',
    expectedDiagnostic: 'Initial snapshot-tag settings admission failed:',
  },
  {
    scenario: 'snapshot-tags-admission-dialog-failure',
    dialogFails: true,
    snapshotTagStartupFailure: true,
    expectedDiagnostic: 'Initial snapshot-tag settings admission failed:',
  },
  {
    scenario: 'snapshot-tags-initial-write',
    snapshotTagStartupFailure: true,
    expectedDiagnostic: 'Initial snapshot-tag settings persistence failed:',
  },
  {
    scenario: 'startup-registration-settings-publication',
    registrationStartupFailure: true,
    expectedDiagnostic: 'Startup structural setup (settings publication setup) failed:',
    expectedCause: 'forced settings publication setup failure',
  },
  {
    scenario: 'startup-registration-editor-state',
    registrationStartupFailure: true,
    expectedDiagnostic: 'Startup structural setup (Text Editor state IPC registration) failed:',
    expectedCause: 'forced Text Editor state IPC registration failure',
  },
  {
    scenario: 'startup-registration-reading-test-controller',
    registrationStartupFailure: true,
    expectedDiagnostic: 'Startup structural setup (Reading Test session controller setup) failed:',
    expectedCause: 'forced Reading Test session controller setup failure',
  },
  {
    scenario: 'startup-registration-current-text',
    registrationStartupFailure: true,
    expectedDiagnostic: 'Startup structural setup (current-text IPC registration) failed:',
    expectedCause: 'forced current-text IPC registration failure',
  },
  {
    scenario: 'startup-registration-current-text-processing',
    registrationStartupFailure: true,
    expectedDiagnostic: 'Startup structural setup (current-text processing-state IPC registration) failed:',
    expectedCause: 'forced current-text processing-state IPC registration failure',
  },
  {
    scenario: 'startup-registration-current-text-processing-dialog-failure',
    dialogFails: true,
    registrationStartupFailure: true,
    expectedDiagnostic: 'Startup structural setup (current-text processing-state IPC registration) failed:',
    expectedCause: 'forced current-text processing-state IPC registration failure',
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
  { scenario: 'first-run-fallback-menu-installation', firstRunLanguageChooser: true },
  {
    scenario: 'first-run-fallback-continuation',
    firstRunLanguageChooser: true,
    firstRunFallbackContinuation: true,
    successfulStartup: true,
  },
  {
    scenario: 'first-run-fallback-persistence-failure',
    firstRunLanguageChooser: true,
    firstRunFallbackPersistenceFailure: true,
    expectedMenuInstallationAttempts: 0,
    expectedDiagnostic: 'Initial fallback-language persistence failed:',
    expectedCause: 'forced fallback-language persistence failure',
  },
  {
    scenario: 'first-run-bootstrap-failure',
    firstRunLanguageChooser: true,
    firstRunBootstrapFailure: true,
    expectedDiagnostic: 'First-run Language Window reported a bootstrap failure; language selection is unavailable.',
  },
  {
    scenario: 'first-run-document-load-menu-installation',
    firstRunLanguageChooser: true,
    firstRunDocumentLoadFailure: true,
    expectedDiagnostic: 'Language chooser initial document load failed:',
  },
  {
    scenario: 'first-run-language-window-setup',
    firstRunLanguageChooser: true,
    firstRunStructuralFailure: true,
    expectedMenuInstallationAttempts: 0,
    expectedDiagnostic: 'Initial Language Window structural setup failed:',
    expectedCause: 'forced initial Language Window setup failure',
  },
  {
    scenario: 'renderer-required-initialization',
    rendererStartupFailure: true,
    closesMainWindow: true,
    expectedDiagnostic: 'Main renderer required startup failed:',
  },
  {
    scenario: 'renderer-core-ready-failure',
    rendererStartupFailure: true,
    closesMainWindow: true,
    expectedDiagnostic: 'Main renderer required startup failed:',
  },
  {
    scenario: 'startup-ready-send-failure',
    rendererStartupFailure: true,
    closesMainWindow: true,
    expectedDiagnostic: 'Main startup:ready emission failed:',
    expectedCause: 'forced startup:ready send failure',
  },
  {
    scenario: 'renderer-splash-failure-before-ack',
    rendererStartupFailure: true,
    closesMainWindow: true,
    expectedDiagnostic: 'Main renderer required startup failed:',
  },
  {
    scenario: 'renderer-splash-removal-failure-before-ack',
    rendererStartupFailure: true,
    closesMainWindow: true,
    expectedDiagnostic: 'Main renderer required startup failed:',
  },
  {
    scenario: 'renderer-splash-failure-after-unauthorized-ack',
    rendererStartupFailure: true,
    closesMainWindow: true,
    expectedDiagnostic: 'Main renderer required startup failed:',
  },
  { scenario: 'renderer-splash-failure-after-ack', successfulStartup: true },
  { scenario: 'renderer-startup-report-unauthorized', successfulStartup: true },
  { scenario: 'menu-installation-dialog-failure', dialogFails: true },
]) {
  const expectedLifecycle = firstRunFallbackContinuation
    ? 'persists the fallback language and reaches READY'
    : deferredPostReadyClose
    ? 'defers close while post-READY processing is active, then persists and quits'
    : earlyStartupFailure
    ? 'terminates before current-text initialization'
    : settingsStartupFailure || snapshotTagStartupFailure || registrationStartupFailure
    ? 'terminates before current-text initialization'
    : normalStartup
    ? 'continues after best-effort configuration-directory preparation fails'
    : successfulStartup
    ? 'continues after a non-terminal startup report is ignored'
    : dialogFails
    ? 'continues after native-dialog failure, settles initial processing, persists, and quits'
    : 'discloses, settles initial processing, persists, and quits';
  test(`main startup ${scenario} failure ${expectedLifecycle}`, async (t) => {
    const userDataDir = createTestTempDir(`main-startup-${scenario}`);
    t.after(() => fs.rmSync(userDataDir, { recursive: true, force: true }));
    const initialSettingsContents = firstRunLanguageChooser ? null : writeSettingsFile(userDataDir, settingsLanguage);

    const result = await runProbe(scenario, userDataDir, {
      logLevel: earlyStartupFailure || settingsStartupFailure || snapshotTagStartupFailure || registrationStartupFailure
        || normalStartup || firstRunFallbackPersistenceFailure || firstRunBootstrapFailure
        || firstRunDocumentLoadFailure || firstRunStructuralFailure || rendererStartupFailure
        ? 'error'
        : 'silent',
    });

    assert.equal(result.signal, null, `Electron exited via signal.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    assert.equal(result.code, 0, `Electron exited with non-zero code.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
    if ((settingsStartupFailure || snapshotTagStartupFailure || registrationStartupFailure) && dialogFails) {
      assert.match(result.stdout, new RegExp(`TOT_MAIN_STARTUP_FAILURE_DIALOG_ATTEMPT:${scenario}`));
      assert.match(result.stderr, /Startup failure native dialog failed:/);
    } else if (earlyStartupFailure && dialogFails) {
      assert.doesNotMatch(result.stdout, /TOT_MAIN_EARLY_STARTUP_FAILURE_NOTICE:/);
    } else if (earlyStartupFailure) {
      assert.match(
        result.stdout,
        /TOT_MAIN_EARLY_STARTUP_FAILURE_NOTICE:\{"title":"Problema de la aplicación","message":"No se pudo iniciar toT\. La aplicación se cerrará\.","buttons":\["Aceptar"\]\}/
      );
    } else if (settingsStartupFailure || snapshotTagStartupFailure || registrationStartupFailure) {
      assert.match(
        result.stdout,
        new RegExp(`TOT_MAIN_STARTUP_FAILURE_DIALOG:${scenario}:`)
      );
      const expectedButton = (snapshotTagStartupFailure || registrationStartupFailure) && settingsLanguage ? 'OK' : 'Aceptar';
      assert.match(result.stdout, new RegExp(`"buttons":\\["${expectedButton}"\\]`));
      const expectedTitle = (snapshotTagStartupFailure || registrationStartupFailure) && settingsLanguage
        ? 'Application problem'
        : 'Problema de la aplicación';
      assert.match(result.stdout, new RegExp(`"title":"${expectedTitle}"`));
      const expectedMessages = {
        'settings-admission': 'toT no puede iniciar porque no puede usar la configuración guardada sin modificarla. La aplicación se cerrará.',
        'settings-backup': 'toT no pudo crear el respaldo necesario antes de iniciar. La aplicación se cerrará.',
        'settings-initial-write': 'toT no pudo guardar la configuración necesaria para iniciar. La aplicación se cerrará.',
        'settings-initialization': 'toT no pudo completar la configuración necesaria para iniciar. La aplicación se cerrará.',
        'config-dir-preparation-then-settings-write-failure': 'toT no pudo guardar la configuración necesaria para iniciar. La aplicación se cerrará.',
        'snapshot-tags-admission': 'toT cannot safely recover the saved snapshot-tag preferences. The application will close without changing them.',
        'snapshot-tags-admission-default-language': 'toT no puede recuperar de forma segura las preferencias de etiquetas de snapshots guardadas. La aplicación se cerrará sin modificarlas.',
        'snapshot-tags-initial-write': 'toT could not save the snapshot-tag preferences needed to start. The application will close.',
        'startup-registration-settings-publication': 'toT could not complete the setup needed to start. The application will close.',
        'startup-registration-editor-state': 'toT could not complete the setup needed to start. The application will close.',
        'startup-registration-reading-test-controller': 'toT could not complete the setup needed to start. The application will close.',
        'startup-registration-current-text': 'toT could not complete the setup needed to start. The application will close.',
        'startup-registration-current-text-processing': 'toT could not complete the setup needed to start. The application will close.',
      };
      if (expectedMessages[scenario]) {
        assert.match(result.stdout, new RegExp(expectedMessages[scenario].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      }
    } else if (normalStartup || successfulStartup) {
      assert.doesNotMatch(result.stdout, /TOT_MAIN_STARTUP_FAILURE_DIALOG:/);
    } else if (dialogFails) {
      assert.doesNotMatch(result.stdout, new RegExp(`TOT_MAIN_STARTUP_FAILURE_DIALOG:${scenario}`));
    } else {
      assert.match(result.stdout, new RegExp(`TOT_MAIN_STARTUP_FAILURE_DIALOG:${scenario}`));
    }
    const menuInstallationAttempts = result.stdout.match(/TOT_MAIN_STARTUP_MENU_INSTALL_ATTEMPT:/g) || [];
    assert.equal(
      menuInstallationAttempts.length,
      (earlyStartupFailure || settingsStartupFailure || snapshotTagStartupFailure || registrationStartupFailure)
        ? 0
        : expectedMenuInstallationAttempts,
      `Unexpected initial menu installation attempts.\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`
    );
    if (earlyStartupFailure || settingsStartupFailure || snapshotTagStartupFailure || registrationStartupFailure) {
      assert.match(result.stderr, new RegExp(expectedDiagnostic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      if (expectedCause) {
        assert.match(result.stderr, new RegExp(expectedCause.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      }
      assert.doesNotMatch(result.stdout, /TOT_SMOKE_READY/);
    }
    if ((firstRunFallbackPersistenceFailure || firstRunBootstrapFailure
      || firstRunDocumentLoadFailure || firstRunStructuralFailure) && expectedDiagnostic) {
      assert.match(result.stderr, new RegExp(expectedDiagnostic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      if (expectedCause) {
        assert.match(result.stderr, new RegExp(expectedCause.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      }
      assert.doesNotMatch(result.stdout, /TOT_SMOKE_READY/);
    }
    if (rendererStartupFailure) {
      assert.match(result.stderr, new RegExp(expectedDiagnostic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      if (expectedCause) {
        assert.match(result.stderr, new RegExp(expectedCause.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      }
      assert.match(result.stdout, new RegExp(`TOT_MAIN_STARTUP_FAILURE_DIALOG:${scenario}:`));
      assert.match(result.stdout, /"title":"Application problem"/);
      assert.match(result.stdout, /"message":"toT could not complete the setup needed to start\. The application will close\."/);
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
    } else if (!earlyStartupFailure && !settingsStartupFailure && !snapshotTagStartupFailure && !registrationStartupFailure && !normalStartup && !successfulStartup) {
      assert.match(result.stdout, /TOT_MAIN_STARTUP_FAILURE_PROCESSING_RESOLVE:\{"requestId":1,"ok":false\}/);
    }
    if (earlyStartupFailure || settingsStartupFailure || snapshotTagStartupFailure || registrationStartupFailure) {
      assert.doesNotMatch(result.stdout, /TOT_MAIN_STARTUP_FAILURE_PROCESSING_RESOLVE:/);
      assert.doesNotMatch(result.stdout, /TOT_MAIN_STARTUP_FAILURE_CURRENT_TEXT_PERSISTED/);
      if (registrationStartupFailure) {
        assert.doesNotMatch(result.stdout, /TOT_MAIN_STARTUP_FAILURE_TEXT_INIT_UNEXPECTED/);
      }
    } else {
      assert.match(result.stdout, /TOT_MAIN_STARTUP_FAILURE_CURRENT_TEXT_PERSISTED/);
    }
    if (normalStartup) {
      assert.match(result.stderr, /ensureConfigDir failed:/);
      assert.match(result.stderr, /forced configuration directory preparation failure/);
      assert.match(result.stdout, /TOT_SMOKE_READY/);
      assert.match(result.stdout, /TOT_MAIN_STARTUP_FAILURE_PROCESSING_RESOLVE:\{"requestId":1,"ok":true\}/);
    }
    if (successfulStartup) {
      assert.match(result.stdout, /TOT_SMOKE_READY/);
      assert.doesNotMatch(result.stdout, /TOT_MAIN_STARTUP_FAILURE_PROCESSING_RESOLVE:\{"requestId":1,"ok":false\}/);
    }
    if (firstRunLanguageChooser) {
      const savedSettings = JSON.parse(fs.readFileSync(path.join(userDataDir, 'config', 'user_settings.json'), 'utf8'));
      if (firstRunFallbackPersistenceFailure || firstRunStructuralFailure) {
        assert.equal(savedSettings.language, '');
      } else {
        assert.equal(savedSettings.language, 'es');
      }
    }
    if (firstRunBootstrapFailure) {
      assert.match(result.stdout, /"title":"Problema con la selección de idioma"/);
      assert.match(result.stdout, /"message":"toT no pudo completar la selección de idioma\. Se intentará continuar con el idioma predeterminado\."/);
    }
    if (firstRunDocumentLoadFailure) {
      assert.match(result.stdout, /"title":"Problema con la selección de idioma"/);
      assert.match(result.stdout, /"message":"La ventana de idioma no pudo cargarse\. El inicio continuará con el idioma predeterminado\."/);
    }
    if (firstRunFallbackPersistenceFailure) {
      assert.match(result.stdout, /"title":"Problema de la aplicación"/);
      assert.match(result.stdout, /"message":"toT no pudo guardar el idioma predeterminado necesario para iniciar\. La aplicación se cerrará\."/);
    }
    if (firstRunStructuralFailure) {
      assert.match(result.stdout, /"title":"Problema de la aplicación"/);
      assert.match(result.stdout, /"message":"toT no pudo preparar la selección de idioma necesaria para iniciar\. La aplicación se cerrará\."/);
    }
    assert.match(result.stdout, new RegExp(`TOT_MAIN_STARTUP_FAILURE_QUIT:${scenario}`));
  });
}
