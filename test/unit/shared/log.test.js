'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const LOGGER_SOURCE = fs.readFileSync(
  path.resolve(__dirname, '../../../public/js/log.js'),
  'utf8'
);

function createLoggerHarness({ storedLevel = null, windowLevel } = {}) {
  const calls = {
    debug: [],
    error: [],
    info: [],
    warn: [],
  };
  const storageWrites = [];
  const window = {};
  if (windowLevel !== undefined) window.TOT_LOG_LEVEL = windowLevel;

  const sandbox = {
    window,
    localStorage: {
      getItem(key) {
        assert.equal(key, 'tot.logLevel');
        return storedLevel;
      },
      setItem(...args) {
        storageWrites.push(args);
      },
    },
    console: {
      debug(...args) {
        calls.debug.push(args);
      },
      error(...args) {
        calls.error.push(args);
      },
      info(...args) {
        calls.info.push(args);
      },
      warn(...args) {
        calls.warn.push(args);
      },
    },
  };

  vm.createContext(sandbox);
  vm.runInContext(LOGGER_SOURCE, sandbox, { filename: 'public/js/log.js' });

  return { calls, storageWrites, window: sandbox.window };
}

test('renderer logger exposes scoped acquisition and the limited DevTools administration surface', () => {
  const harness = createLoggerHarness({ storedLevel: 'debug' });

  assert.equal(typeof harness.window.getLogger, 'function');
  assert.deepEqual(Object.keys(harness.window.Log).sort(), ['getLevel', 'setLevel']);

  const log = harness.window.getLogger('contract');
  assert.deepEqual(
    ['debug', 'info', 'warn', 'error', 'warnOnce', 'errorOnce'].map((method) => typeof log[method]),
    ['function', 'function', 'function', 'function', 'function', 'function']
  );

  log.info('ready');
  assert.deepEqual(harness.calls.info, [['[INFO][contract]', 'ready']]);
});

test('existing and newly acquired loggers share live level state and preserve persistence behavior', () => {
  const harness = createLoggerHarness({ storedLevel: 'warn' });
  const existingLog = harness.window.getLogger('existing');

  existingLog.debug('hidden');
  existingLog.warn('visible');
  assert.equal(harness.calls.debug.length, 0);
  assert.deepEqual(harness.calls.warn, [['[WARN][existing]', 'visible']]);

  harness.window.Log.setLevel('debug');
  assert.equal(harness.window.Log.getLevel(), 'debug');
  assert.deepEqual(harness.storageWrites, [['tot.logLevel', 'debug']]);

  existingLog.debug('existing logger');
  const newLog = harness.window.getLogger('new');
  newLog.debug('new logger');
  assert.deepEqual(harness.calls.debug, [
    ['[DEBUG][existing]', 'existing logger'],
    ['[DEBUG][new]', 'new logger'],
  ]);

  harness.window.Log.setLevel('error', { persist: false });
  assert.equal(harness.window.Log.getLevel(), 'error');
  assert.deepEqual(harness.storageWrites, [['tot.logLevel', 'debug']]);

  existingLog.warn('hidden after level change');
  newLog.error('still visible');
  assert.equal(harness.calls.warn.length, 1);
  assert.deepEqual(harness.calls.error, [['[ERROR][new]', 'still visible']]);
});

test('warnOnce and errorOnce deduplicate representative repeated diagnostics by scope and level', () => {
  const harness = createLoggerHarness({ storedLevel: 'warn' });
  const firstLog = harness.window.getLogger('first');
  const secondLog = harness.window.getLogger('second');

  firstLog.warnOnce('repeatable-warning', 'first warning');
  firstLog.warnOnce('repeatable-warning', 'second warning');
  firstLog.errorOnce('repeatable-error', 'first error');
  firstLog.errorOnce('repeatable-error', 'second error');
  secondLog.warnOnce('repeatable-warning', 'other scope');

  assert.deepEqual(harness.calls.warn, [
    ['[WARN][first]', 'first warning'],
    ['[WARN][second]', 'other scope'],
  ]);
  assert.deepEqual(harness.calls.error, [['[ERROR][first]', 'first error']]);
});

test('initial and live logging state remain isolated per renderer page', () => {
  const firstPage = createLoggerHarness({ storedLevel: 'error', windowLevel: 'info' });
  const secondPage = createLoggerHarness({ storedLevel: 'warn' });

  assert.equal(firstPage.window.Log.getLevel(), 'info');
  assert.equal(secondPage.window.Log.getLevel(), 'warn');

  firstPage.window.Log.setLevel('debug', { persist: false });
  assert.equal(firstPage.window.Log.getLevel(), 'debug');
  assert.equal(secondPage.window.Log.getLevel(), 'warn');
});
