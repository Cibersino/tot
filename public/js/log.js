// public/js/log.js
'use strict';

/* NOTE: Preload scripts run under sandbox constraints.
 * Preloads use minimal console-based logging (no ./log import) to allow sandbox:true.
 */

/**
 * LOGGING POLICY (toT - Reading Meter)
 *
 * Levels (lowest to highest): silent < error < warn < info < debug
 * Default: warn (minimize noise in normal operation).
 * Policy: All fallbacks must be noisy (no silent fallbacks). If a fallback can trigger frequently AND repetition adds no diagnostic value, use warnOnce/errorOnce with an explicit stable key.
 *
 * Intended usage across the repo:
 * - error: unexpected failures that break an intended action or invariant. Typical: exceptions caught in IPC handlers, failed critical I/O, failed window loads when not closing.
 * - warn: recoverable anomalies / degraded behavior / fallback paths. Typical: "using default position", "shortcut register failed", "could not apply optional behavior".
 * - info: high-level lifecycle/state transitions (low volume).
 * - debug: verbose diagnostics; may be noisy; high volume is acceptable.
 *
 * Call-site style:
 * - Call logger methods directly: log.warn/log.warnOnce/log.error/log.errorOnce (and debug/info as needed).
 * - Do NOT introduce local aliases/wrappers that re-export these methods under different names (e.g., warnOnceRenderer, warnRenderer).
 * - If a helper needs a logging capability, pass the method reference directly (e.g., { warnOnce: log.warnOnce }) or pass `log`; do not wrap.
 *
 * Bootstrap vs in-regime fallbacks (classification):
 * - BOOTSTRAP (pre-init): logs whose message or explicit dedupe key starts with "BOOTSTRAP:" indicate a transitory default used only before this context finishes initialization (authoritative state not yet available).
 *   Constraint: a BOOTSTRAP fallback MUST become unreachable after init; if it can occur after init, it is NOT bootstrap. If observed after init, treat as a bug and log accordingly (warn/error).
 * - In-regime (default): any fallback not marked as BOOTSTRAP is treated as runtime behavior (degradation/recoverable anomaly) under the normal policy.
 *
 * Once-variants (deduplicated per process/page; OUTPUT dedupe only):
 * warnOnce/errorOnce deduplicate log EMISSION only; they do NOT imply the underlying event should happen only once. A single app session may have multiple processes/pages, so the same warning can appear once per process/page.
 * Use warnOnce/errorOnce only for high-frequency repeatable events where additional occurrences add no new diagnostic value; do not use once-variants when repetition is needed for reproduction during testing.
 * - warnOnce: use for expected transient failures that can repeat frequently and where additional occurrences add no new diagnostic value. Canonical example: webContents.send() to a destroyed window during shutdown/races.
 * - errorOnce: like warnOnce but for repeated error-class events (should be rare).
 *
 * Key rule (explicit key mode):
 * - The explicit key defines the dedupe bucket.
 * - Allowed: a stable event id, optionally with a CONTROLLED variant suffix when “once per variant” is desired (e.g., lang/base/window).
 * - Forbidden: per-occurrence / unbounded data in the key (ids, timestamps, error messages/stacks, arbitrary user input, content-derived strings).
 *
 * warnOnce/errorOnce signature:
 * - warnOnce(key, ...args): explicit dedupe key. Must be a stable short string; may include a controlled variant suffix (see Key rule).
 * - warnOnce(...args): auto-key derived from args (args[0] string preferred, else JSON(args)); if args vary, dedupe may not trigger reliably.
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
