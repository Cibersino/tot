'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { createStopwatchTimeUtils } = require('../../public/js/lib/stopwatch_time_core');

function loadRendererCrono(t) {
  const logs = [];
  const sandbox = {
    window: {
      getLogger() {
        return {
          debug(...args) { logs.push({ level: 'debug', args }); },
          warn(...args) { logs.push({ level: 'warn', args }); },
          warnOnce(...args) { logs.push({ level: 'warnOnce', args }); },
          error(...args) { logs.push({ level: 'error', args }); },
        };
      },
      RendererIcons: {
        applyIconToElement() {},
      },
      StopwatchTimeCore: {
        createStopwatchTimeUtils,
      },
    },
    console,
  };

  vm.createContext(sandbox);
  const source = fs.readFileSync(path.resolve(__dirname, '../../public/js/crono.js'), 'utf8');
  vm.runInContext(source, sandbox, { filename: 'public/js/crono.js' });
  t.after(() => {
    sandbox.window = null;
  });

  return { crono: sandbox.window.RendererCrono, logs };
}

module.exports = {
  loadRendererCrono,
};
