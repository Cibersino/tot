'use strict';

const Module = require('node:module');
const path = require('node:path');

const actualElectron = require('electron');
const mainEntryPath = path.resolve(__dirname, '../../electron/main_entry.js');
const userDataDir = typeof process.env.TOT_MAIN_ENTRY_FAILURE_USER_DATA_DIR === 'string'
  ? process.env.TOT_MAIN_ENTRY_FAILURE_USER_DATA_DIR.trim()
  : '';
const scenario = process.env.TOT_MAIN_ENTRY_FAILURE_PROBE_SCENARIO;
const originalLoad = Module._load;

if (userDataDir) {
  actualElectron.app.setPath('userData', path.resolve(userDataDir));
}
actualElectron.app.setAppPath(path.resolve(__dirname, '../..'));

function emitMarker(name, detail = '') {
  process.stdout.write(`${name}${detail ? `:${detail}` : ''}\n`);
}

function throwSynchronousMainLoadFailure() {
  throw new Error('forced synchronous Main entry load failure');
}

Module._load = function patchedModuleLoad(request, parent, isMain) {
  if (request === 'electron' && parent && parent.filename === mainEntryPath) {
    return {
      ...actualElectron,
      dialog: {
        showErrorBox(title, message) {
          emitMarker('TOT_MAIN_ENTRY_FAILURE_NOTICE_ATTEMPT', JSON.stringify({ title, message }));
          if (scenario === 'notice-failure') {
            emitMarker('TOT_MAIN_ENTRY_FAILURE_NOTICE_FAILURE');
            throw new Error('forced main entry native notice failure');
          }
        },
      },
    };
  }

  if (request === './main' && parent && parent.filename === mainEntryPath) {
    return throwSynchronousMainLoadFailure();
  }

  return originalLoad.call(this, request, parent, isMain);
};

require(mainEntryPath);
