// public/js/log.js
'use strict';

/**
 * LOGGING POLICY (toT - Reading Meter)
 *
 * Levels (lowest to highest): silent < error < warn < info < debug
 * Default: warn (minimize noise in normal operation).
 *
 * Intended usage across the repo:
 * - error: unexpected failures that break an intended action or invariant.
 *          Typical: exceptions caught in IPC handlers, failed critical I/O, failed window loads when not closing.
 * - warn: recoverable anomalies / degraded behavior / fallback paths.
 *         Typical: "using default position", "shortcut register failed", "could not apply optional behavior".
 * - info: high-level lifecycle/state transitions (low volume).
 * - debug: verbose diagnostics; may be noisy; safe to spam.
 *
 * Once-variants (deduplicated per process/page):
 * Use warnOnce/errorOnce only for high-frequency repeatable events where additional occurrences add no new diagnostic value; do not use once-variants when repetition is needed for reproduction during testing.
 * - warnOnce: use for expected transient failures that can repeat frequently and would spam logs.
 *             Canonical example: webContents.send() to a destroyed window during shutdown/races.
 * - errorOnce: like warnOnce but for repeated error-class events (should be rare).
 *
 * warnOnce/errorOnce signature:
 * - warnOnce(key, ...args): explicit stable dedupe key.
 * - warnOnce(...args): auto-key derived from args (args[0] string preferred, else JSON(args)).
 *
 * Configuration source:
 * - main: process.env.TOT_LOG_LEVEL
 * - renderer: window.TOT_LOG_LEVEL or localStorage('tot.logLevel')
 */

(() => {
  const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };
  const LEVEL_NAMES = Object.keys(LEVELS);

  function normalizeLevelName(x) {
    const s = String(x || '').toLowerCase().trim();
    return LEVELS[s] !== undefined ? s : 'warn'; // default = WARN
  }

  // Source of truth of level in renderer:
  // 1) window.TOT_LOG_LEVEL (temporary, useful in DevTools)
  // 2) localStorage 'tot.logLevel' (persistent)
  // 3) default 'warn'
  function readInitialLevel() {
    const fromWindow = normalizeLevelName(window.TOT_LOG_LEVEL);
    if (window.TOT_LOG_LEVEL) return fromWindow;
    const fromLS = normalizeLevelName(localStorage.getItem('tot.logLevel'));
    return fromLS || 'warn';
  }

  let currentLevelName = readInitialLevel();
  let currentLevel = LEVELS[currentLevelName];

  const once = new Set();

  function should(levelName) {
    return currentLevel >= LEVELS[levelName];
  }

  function prefix(levelName, scope) {
    return `[${levelName.toUpperCase()}][${scope}]`;
  }

  function keyFromArgs(scope, levelName, args) {
    const first = args[0];
    if (typeof first === 'string' && first.length <= 200) return `${levelName}:${scope}:${first}`;
    try {
      return `${levelName}:${scope}:${JSON.stringify(args)}`.slice(0, 500);
    } catch {
      return `${levelName}:${scope}:[unkeyable]`;
    }
  }

  function makeLogger(scope) {
    const sc = scope || 'app';

    return {
      debug: (...args) => { if (should('debug')) console.debug(prefix('debug', sc), ...args); },
      info:  (...args) => { if (should('info'))  console.info(prefix('info', sc), ...args); },
      warn:  (...args) => { if (should('warn'))  console.warn(prefix('warn', sc), ...args); },
      error: (...args) => { if (should('error')) console.error(prefix('error', sc), ...args); },

      warnOnce: (keyOrFirst, ...rest) => {
        if (!should('warn')) return;

        const hasExplicitKey = (typeof keyOrFirst === 'string' && rest.length > 0);
        const args = hasExplicitKey ? rest : [keyOrFirst, ...rest];
        const key = hasExplicitKey ? `warn:${sc}:${keyOrFirst}` : keyFromArgs(sc, 'warn', args);

        if (once.has(key)) return;
        once.add(key);
        console.warn(prefix('warn', sc), ...args);
      },

      errorOnce: (keyOrFirst, ...rest) => {
        if (!should('error')) return;

        const hasExplicitKey = (typeof keyOrFirst === 'string' && rest.length > 0);
        const args = hasExplicitKey ? rest : [keyOrFirst, ...rest];
        const key = hasExplicitKey ? `error:${sc}:${keyOrFirst}` : keyFromArgs(sc, 'error', args);

        if (once.has(key)) return;
        once.add(key);
        console.error(prefix('error', sc), ...args);
      },
    };
  }

  function setLevel(levelName, { persist = true } = {}) {
    const n = normalizeLevelName(levelName);
    currentLevelName = n;
    currentLevel = LEVELS[n];
    if (persist) localStorage.setItem('tot.logLevel', n);
  }

  function getLevel() {
    return currentLevelName;
  }

  function getLogger(scope) {
    if (window.Log && typeof window.Log.get === 'function') {
      return window.Log.get(scope);
    }
    return {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      warnOnce: () => {},
      errorOnce: () => {},
    };
  }

  window.Log = {
    get: makeLogger,
    setLevel,
    getLevel,
    LEVELS,
    LEVEL_NAMES,
  };
  window.getLogger = getLogger;
})();
