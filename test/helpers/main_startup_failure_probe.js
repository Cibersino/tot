'use strict';

const Module = require('node:module');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const scenario = process.env.TOT_MAIN_STARTUP_FAILURE_PROBE_SCENARIO;
const actualElectron = require('electron');
const actualApp = actualElectron.app;
const originalLoad = Module._load;
const originalQuit = actualApp.quit.bind(actualApp);

actualApp.setAppPath(path.resolve(__dirname, '../..'));

function emitMarker(name, detail = '') {
  process.stdout.write(`${name}${detail ? `:${detail}` : ''}\n`);
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
    }

    isDestroyed() {
      return this.destroyed;
    }

    loadFile() {
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
      this.emit('closed');
    }

    static getAllWindows() {
      return [];
    }

    static getFocusedWindow() {
      return null;
    }

    static fromWebContents() {
      return null;
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
  showMessageBoxSync() {
    if (scenario === 'menu-installation-dialog-failure') {
      throw new Error('forced startup native dialog failure');
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
  return originalQuit();
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
        const resolve = controller.resolve;
        controller.resolve = (context) => {
          emitMarker('TOT_MAIN_STARTUP_FAILURE_PROCESSING_RESOLVE', JSON.stringify(context));
          return resolve(context);
        };
        return controller;
      },
    };
  }

  if (request === './fs_storage'
    && parent
    && parent.filename === path.resolve(__dirname, '../../electron/main.js')) {
    const fsStorage = originalLoad.call(this, request, parent, isMain);
    return {
      ...fsStorage,
      saveJson(filePath, value) {
        const result = fsStorage.saveJson(filePath, value);
        if (path.basename(filePath) === 'current_text.json') {
          emitMarker('TOT_MAIN_STARTUP_FAILURE_CURRENT_TEXT_PERSISTED');
        }
        return result;
      },
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

require('../../electron/main.js');
