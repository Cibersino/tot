// electron/constants_main.js
'use strict';

const MAX_TEXT_CHARS = 10000000;
const MAX_IPC_MULTIPLIER = 4;
const MAX_IPC_CHARS = MAX_TEXT_CHARS * MAX_IPC_MULTIPLIER;
const DEFAULT_LANG = 'es';

module.exports = {
  MAX_TEXT_CHARS,
  MAX_IPC_MULTIPLIER,
  MAX_IPC_CHARS,
  DEFAULT_LANG,
};
