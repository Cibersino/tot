// electron/log.js
'use strict';

const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };
const LEVEL_NAMES = Object.keys(LEVELS);

function normalizeLevelName(x) {
  const s = String(x || '').toLowerCase().trim();
  return LEVELS[s] !== undefined ? s : 'warn'; // default = WARN (mínimo ruido)
}

let currentLevelName = normalizeLevelName(process.env.TOT_LOG_LEVEL);
let currentLevel = LEVELS[currentLevelName];

// Dedupe global para warnOnce/errorOnce (por proceso)
const once = new Set();

function should(levelName) {
  return currentLevel >= LEVELS[levelName];
}

function prefix(levelName, scope) {
  return `[${levelName.toUpperCase()}][${scope}]`;
}

function keyFromArgs(scope, levelName, args) {
  // Si el primer arg es string, sirve como key natural
  const first = args[0];
  if (typeof first === 'string' && first.length <= 200) return `${levelName}:${scope}:${first}`;

  // Fallback: clave genérica estable
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
    info:  (...args) => { if (should('info'))  console.log(prefix('info', sc), ...args); },
    warn:  (...args) => { if (should('warn'))  console.warn(prefix('warn', sc), ...args); },
    error: (...args) => { if (should('error')) console.error(prefix('error', sc), ...args); },

    // Firma flexible:
    // - warnOnce(key, ...args)  -> si key y hay args, dedupe por key
    // - warnOnce(...args)       -> dedupe por args[0] string o JSON(args)
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

function setLevel(levelName) {
  const n = normalizeLevelName(levelName);
  currentLevelName = n;
  currentLevel = LEVELS[n];
}

function getLevel() {
  return currentLevelName;
}

module.exports = {
  get: makeLogger,
  setLevel,
  getLevel,
  LEVELS: LEVEL_NAMES,
};
