// electron/constants_main.js
'use strict';

const DEFAULT_LANG = 'es'; // Default language for the app. It must match 'public/js/constants.js'. This can be overridden by user settings.

const MAX_TEXT_CHARS = 10000000; // Maximum number of characters allowed in the current text. This is a hard limit to prevent performance issues and memory overflow in the main process. The renderer process can have a lower limit (see constants.js) for better user experience, but this is the absolute maximum.
const MAX_IPC_MULTIPLIER = 4;
const MAX_IPC_CHARS = MAX_TEXT_CHARS * MAX_IPC_MULTIPLIER; // Safety limit of characters that can be sent via IPC to prevent memory overflow.
const MAX_PRESET_STR_CHARS = 65536; // Safety limit for preset name and description strings to prevent memory overflow.
const MAX_META_STR_CHARS = 4096; // Safety limit for metadata strings (like title, author) to prevent memory overflow.
const TASK_ROW_TEXT_MAX_CHARS = 200; // Max chars for task row "text" (texto).
const TASK_ROW_TYPE_MAX_CHARS = 50; // Max chars for task row "type" (tipo).
const TASK_ROW_LINK_MAX_CHARS = 1000; // Max chars for task row "link" (enlace).

module.exports = {
  DEFAULT_LANG,
  MAX_TEXT_CHARS,
  MAX_IPC_MULTIPLIER,
  MAX_IPC_CHARS,
  MAX_PRESET_STR_CHARS,
  MAX_META_STR_CHARS,
  TASK_ROW_TEXT_MAX_CHARS,
  TASK_ROW_TYPE_MAX_CHARS,
  TASK_ROW_LINK_MAX_CHARS,
};
