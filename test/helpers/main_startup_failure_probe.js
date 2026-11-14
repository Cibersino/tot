'use strict';

const Module = require('node:module');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const scenario = process.env.TOT_MAIN_STARTUP_FAILURE_PROBE_SCENARIO;
const actualElectron = require('electron');
const actualApp = actualElectron.app;
const originalLoad = Module._load;
const originalQuit = actualApp.quit.bind(actualApp);
let mainWindowDouble = null;
let currentTextProcessingController = null;
const earlyStartupFailureScenarios = new Set([
  'storage-initialization',
  'storage-initialization-dialog-failure',
  'language-catalog',
  'default-main-translations',
]);
const settingsStartupFailureScenarios = new Set([
  'settings-admission',
  'settings-admission-dialog-failure',
  'settings-backup',
  'settings-initial-write',
  'settings-initialization',
  'config-dir-preparation-then-settings-write-failure',
]);
const snapshotTagStartupFailureScenarios = new Set([
  'snapshot-tags-admission',
  'snapshot-tags-admission-default-language',
  'snapshot-tags-admission-dialog-failure',
  'snapshot-tags-initial-write',
]);
const startupRegistrationFailureScenarios = new Set([
  'startup-registration-settings-publication',
  'startup-registration-editor-state',
  'startup-registration-reading-test-controller',
  'startup-registration-current-text',
  'startup-registration-current-text-processing',
  'startup-registration-current-text-processing-dialog-failure',
]);
const configDirectoryPreparationFailureScenarios = new Set([
  'config-dir-preparation-recovers',
  'config-dir-preparation-then-settings-write-failure',
]);

const smokeUserDataDir = typeof process.env.TOT_SMOKE_USER_DATA_DIR === 'string'
  ? process.env.TOT_SMOKE_USER_DATA_DIR.trim()
  : '';
const smokeConfigDir = smokeUserDataDir ? path.join(path.resolve(smokeUserDataDir), 'config') : '';
const smokeSettingsFile = smokeConfigDir ? path.join(smokeConfigDir, 'user_settings.json') : '';

if (configDirectoryPreparationFailureScenarios.has(scenario)) {
  const originalExistsSync = fs.existsSync;
  const originalMkdirSync = fs.mkdirSync;
  const originalWriteFileSync = fs.writeFileSync;
  let failInitialConfigPreparation = true;

  fs.existsSync = function injectedExistsSync(filePath, ...args) {
    if (failInitialConfigPreparation && path.resolve(String(filePath)) === smokeConfigDir) {
      return false;
    }
    return originalExistsSync.call(this, filePath, ...args);
  };
  fs.mkdirSync = function injectedMkdirSync(dirPath, ...args) {
    if (failInitialConfigPreparation && path.resolve(String(dirPath)) === smokeConfigDir) {
      failInitialConfigPreparation = false;
      const error = new Error('forced configuration directory preparation failure');
      error.code = 'EACCES';
      throw error;
    }
    return originalMkdirSync.call(this, dirPath, ...args);
  };
  if (scenario === 'config-dir-preparation-then-settings-write-failure') {
    fs.writeFileSync = function injectedWriteFileSync(filePath, ...args) {
      if (path.resolve(String(filePath)) === smokeSettingsFile) {
        const error = new Error('forced settings write after configuration preparation failure');
        error.code = 'EACCES';
        throw error;
      }
      return originalWriteFileSync.call(this, filePath, ...args);
    };
  }
}

actualApp.setAppPath(path.resolve(__dirname, '../..'));

function emitMarker(name, detail = '') {
  process.stdout.write(`${name}${detail ? `:${detail}` : ''}\n`);
}

function reportRendererI18nFailure(webContents, kind) {
  actualElectron.ipcMain.emit('renderer-i18n-failed', {
    sender: webContents,
  }, {
    kind,
  });
}

function createBrowserWindowDouble() {
  class BrowserWindowDouble extends EventEmitter {
    constructor() {
      super();
      if (scenario === 'main-window-construction') {
        throw new Error('forced main BrowserWindow construction failure');
      }
      this.destroyed = false;
      this.webContents = new EventEmitter();
      this.webContents.isDestroyed = () => this.destroyed;
      this.webContents.send = () => {};
      mainWindowDouble = this;
    }

    isDestroyed() {
      return this.destroyed;
    }

    loadFile(filePath) {
      if (scenario === 'main-document-load') {
        return Promise.reject(new Error('forced main document load failure'));
      }
      if (scenario === 'main-document-load-after-vetoed-close') {
        return new Promise((resolve, reject) => {
          queueMicrotask(() => {
            this.close();
            reject(new Error('forced main document load failure after vetoed close'));
          });
        });
      }
      if (scenario === 'main-preload' && path.basename(filePath) === 'index.html') {
        queueMicrotask(() => {
          this.webContents.emit(
            'preload-error',
            {},
            path.resolve(__dirname, '../../electron/preload.js'),
            new Error('forced main preload failure')
          );
        });
      }
      if ((scenario === 'renderer-i18n-startup' || scenario === 'renderer-i18n-startup-api')
        && path.basename(filePath) === 'index.html') {
        queueMicrotask(() => {
          reportRendererI18nFailure(
            this.webContents,
            scenario === 'renderer-i18n-startup-api' ? 'startup-api' : 'startup'
          );
        });
      }
      if (scenario === 'renderer-i18n-transition-restoration'
        && path.basename(filePath) === 'index.html') {
        queueMicrotask(() => {
          actualElectron.ipcMain.emit('startup:renderer-core-ready');
          const initialState = currentTextProcessingController.getState();
          currentTextProcessingController.resolve({
            requestId: initialState.requestId,
            ok: true,
          });
          const postReadyState = currentTextProcessingController.begin({
            source: 'smoke',
            action: 'post_ready_processing',
          });
          reportRendererI18nFailure(this.webContents, 'transition-restoration');
          queueMicrotask(() => {
            currentTextProcessingController.resolve({
              requestId: postReadyState.requestId,
              ok: true,
            });
          });
        });
      }
      if (scenario === 'config-dir-preparation-recovers' && path.basename(filePath) === 'index.html') {
        queueMicrotask(() => {
          actualElectron.ipcMain.emit('startup:renderer-core-ready');
          const initialState = currentTextProcessingController.getState();
          currentTextProcessingController.resolve({
            requestId: initialState.requestId,
            ok: true,
          });
          queueMicrotask(() => {
            actualElectron.ipcMain.emit('startup:splash-removed');
          });
        });
      }
      if (scenario === 'first-run-fallback-menu-installation') {
        queueMicrotask(() => {
          this.emit('closed');
        });
      }
      return Promise.resolve();
    }

    setMenu() {}

    close() {
      if (this.destroyed) return;
      const event = {
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
      };
      this.emit('close', event);
      if (event.defaultPrevented) {
        emitMarker('TOT_MAIN_STARTUP_FAILURE_CLOSE_VETOED', scenario);
        return;
      }
      this.destroyed = true;
      emitMarker('TOT_MAIN_STARTUP_FAILURE_CLOSE_COMPLETED', scenario);
      this.emit('closed');
    }

    static getAllWindows() {
      return [];
    }

    static getFocusedWindow() {
      return null;
    }

    static fromWebContents(contents) {
      return mainWindowDouble && mainWindowDouble.webContents === contents
        ? mainWindowDouble
        : null;
    }
  }

  return BrowserWindowDouble;
}

const BrowserWindowDouble = createBrowserWindowDouble();
const menuDouble = {
  buildFromTemplate() {
    return {};
  },
  setApplicationMenu() {
    emitMarker('TOT_MAIN_STARTUP_MENU_INSTALL_ATTEMPT', scenario);
    if (scenario.includes('menu-installation')) {
      throw new Error('forced initial menu installation failure');
    }
  },
};
const dialogDouble = {
  showMessageBoxSync(...args) {
    if (scenario === 'settings-admission-dialog-failure'
      || scenario === 'snapshot-tags-admission-dialog-failure'
      || scenario === 'startup-registration-current-text-processing-dialog-failure') {
      emitMarker('TOT_MAIN_STARTUP_FAILURE_DIALOG_ATTEMPT', scenario);
      throw new Error('forced startup native dialog failure');
    }
    if (scenario === 'menu-installation-dialog-failure'
      || scenario === 'storage-initialization-dialog-failure') {
      throw new Error('forced startup native dialog failure');
    }
    if (earlyStartupFailureScenarios.has(scenario)) {
      const options = args[args.length - 1];
      emitMarker('TOT_MAIN_EARLY_STARTUP_FAILURE_NOTICE', JSON.stringify({
        title: options.title,
        message: options.message,
        buttons: options.buttons,
      }));
      return 0;
    }
    if (settingsStartupFailureScenarios.has(scenario)
      || snapshotTagStartupFailureScenarios.has(scenario)
      || startupRegistrationFailureScenarios.has(scenario)) {
      const options = args[args.length - 1];
      emitMarker('TOT_MAIN_STARTUP_FAILURE_DIALOG', `${scenario}:${JSON.stringify({
        title: options.title,
        message: options.message,
        buttons: options.buttons,
      })}`);
      return 0;
    }
    emitMarker('TOT_MAIN_STARTUP_FAILURE_DIALOG', scenario);
    return 0;
  },
  showMessageBox() {
    return Promise.resolve({ response: 0 });
  },
};

actualApp.quit = () => {
  emitMarker('TOT_MAIN_STARTUP_FAILURE_QUIT', scenario);
  // Electron owns native-window closure during app.quit(). The double is not part
  // of Electron's native window registry, so model that one lifecycle effect for
  // managed terminal failures of the main window.
  if ((scenario === 'main-preload'
    || scenario === 'renderer-i18n-startup'
    || scenario === 'renderer-i18n-startup-api')
    && mainWindowDouble
    && !mainWindowDouble.isDestroyed()) {
    mainWindowDouble.close();
  }
  const result = originalQuit();
  if (scenario === 'renderer-i18n-transition-restoration') {
    // The double is outside Electron's native window registry. After the real
    // managed-quit path has fired before-quit persistence, ensure this isolated
    // probe does not remain alive solely because Electron never observed a native
    // window-all-closed event for the double.
    setTimeout(() => actualApp.exit(0), 0);
  }
  return result;
};

Module._load = function patchedModuleLoad(request, parent, isMain) {
  if (request === 'electron') {
    return {
      ...actualElectron,
      BrowserWindow: BrowserWindowDouble,
      Menu: menuDouble,
      dialog: dialogDouble,
    };
  }

  if (request === './current_text_processing_state_ipc'
    && parent
    && parent.filename === path.resolve(__dirname, '../../electron/main.js')) {
    const currentTextProcessingStateIpc = originalLoad.call(this, request, parent, isMain);
    return {
      ...currentTextProcessingStateIpc,
      createController(options) {
        const controller = currentTextProcessingStateIpc.createController(options);
        currentTextProcessingController = controller;
        const resolve = controller.resolve;
        controller.resolve = (context) => {
          emitMarker('TOT_MAIN_STARTUP_FAILURE_PROCESSING_RESOLVE', JSON.stringify(context));
          return resolve(context);
        };
        return controller;
      },
      registerIpc(...args) {
        if (scenario === 'startup-registration-current-text-processing'
          || scenario === 'startup-registration-current-text-processing-dialog-failure') {
          throw new Error('forced current-text processing-state IPC registration failure');
        }
        return currentTextProcessingStateIpc.registerIpc(...args);
      },
    };
  }

  if (request === './text_state'
    && parent
    && parent.filename === path.resolve(__dirname, '../../electron/main.js')) {
    const textState = originalLoad.call(this, request, parent, isMain);
    return {
      ...textState,
      init(...args) {
        if (startupRegistrationFailureScenarios.has(scenario)) {
          emitMarker('TOT_MAIN_STARTUP_FAILURE_TEXT_INIT_UNEXPECTED', scenario);
        }
        return textState.init(...args);
      },
      registerIpc(...args) {
        if (scenario === 'startup-registration-current-text') {
          throw new Error('forced current-text IPC registration failure');
        }
        return textState.registerIpc(...args);
      },
    };
  }

  if (request === './editor_state'
    && parent
    && parent.filename === path.resolve(__dirname, '../../electron/main.js')) {
    const editorState = originalLoad.call(this, request, parent, isMain);
    return {
      ...editorState,
      registerIpc(...args) {
        if (scenario === 'startup-registration-editor-state') {
          throw new Error('forced Text Editor state IPC registration failure');
        }
        return editorState.registerIpc(...args);
      },
    };
  }

  if (request === './reading_test_session'
    && parent
    && parent.filename === path.resolve(__dirname, '../../electron/main.js')) {
    const readingTestSession = originalLoad.call(this, request, parent, isMain);
    return {
      ...readingTestSession,
      createController(...args) {
        if (scenario === 'startup-registration-reading-test-controller') {
          throw new Error('forced Reading Test session controller setup failure');
        }
        return readingTestSession.createController(...args);
      },
    };
  }

  if (request === './fs_storage'
    && parent
    && parent.filename === path.resolve(__dirname, '../../electron/main.js')) {
    const fsStorage = originalLoad.call(this, request, parent, isMain);
    return {
      ...fsStorage,
      initStorage(app) {
        if (scenario === 'storage-initialization'
          || scenario === 'storage-initialization-dialog-failure') {
          throw new Error('forced storage initialization failure');
        }
        return fsStorage.initStorage(app);
      },
      loadJsonWithStatus(filePath, fallbackValue, options) {
        if (scenario === 'settings-admission' || scenario === 'settings-admission-dialog-failure') {
          return {
            status: 'failed',
            value: fallbackValue,
          };
        }
        if ((scenario === 'snapshot-tags-admission'
          || scenario === 'snapshot-tags-admission-default-language'
          || scenario === 'snapshot-tags-admission-dialog-failure')
          && path.basename(filePath) === 'snapshot_tags.json') {
          return {
            status: 'failed',
            value: fallbackValue,
          };
        }
        return fsStorage.loadJsonWithStatus(filePath, fallbackValue, options);
      },
      createSettingsStartupBackup(filePath, originalBytes) {
        if (scenario === 'settings-backup'
          && path.basename(filePath) === 'user_settings.json') {
          const error = new Error('forced initial settings backup failure');
          error.code = 'ENOSPC';
          throw error;
        }
        return fsStorage.createSettingsStartupBackup(filePath, originalBytes);
      },
      saveJsonStrict(filePath, value) {
        if (scenario === 'settings-initial-write'
          && path.basename(filePath) === 'user_settings.json') {
          const error = new Error('forced initial settings write failure');
          error.code = 'ENOSPC';
          throw error;
        }
        if (scenario === 'snapshot-tags-initial-write'
          && path.basename(filePath) === 'snapshot_tags.json') {
          const error = new Error('forced initial snapshot-tag settings write failure');
          error.code = 'ENOSPC';
          throw error;
        }
        return fsStorage.saveJsonStrict(filePath, value);
      },
      saveJson(filePath, value) {
        const result = fsStorage.saveJson(filePath, value);
        if (path.basename(filePath) === 'current_text.json') {
          emitMarker('TOT_MAIN_STARTUP_FAILURE_CURRENT_TEXT_PERSISTED');
        }
        return result;
      },
    };
  }

  if (request === './settings'
    && parent
    && parent.filename === path.resolve(__dirname, '../../electron/main.js')) {
    const settings = originalLoad.call(this, request, parent, isMain);
    return {
      ...settings,
      init(options) {
        if (scenario === 'settings-initialization') {
          throw new Error('forced unexpected initial settings initialization failure');
        }
        return settings.init(options);
      },
      configurePublication(...args) {
        if (scenario === 'startup-registration-settings-publication') {
          throw new Error('forced settings publication setup failure');
        }
        return settings.configurePublication(...args);
      },
    };
  }

  if (request === './language_resources'
    && parent
    && parent.filename === path.resolve(__dirname, '../../electron/main.js')) {
    const languageResources = originalLoad.call(this, request, parent, isMain);
    return {
      ...languageResources,
      initialize(options) {
        if (scenario === 'language-catalog') {
          throw new Error('forced required language catalog failure');
        }
        return languageResources.initialize(options);
      },
    };
  }

  if (request === './menu_builder'
    && parent
    && parent.filename === path.resolve(__dirname, '../../electron/main.js')) {
    const menuBuilder = originalLoad.call(this, request, parent, isMain);
    return {
      ...menuBuilder,
      initializeDefaultMainTranslations() {
        if (scenario === 'default-main-translations') {
          throw new Error('forced required default main translations failure');
        }
        return menuBuilder.initializeDefaultMainTranslations();
      },
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

require('../../electron/main_entry.js');
