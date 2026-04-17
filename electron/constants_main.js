// electron/constants_main.js
'use strict';

const DEFAULT_LANG = 'es'; // Default language for the app. It must match 'public/js/constants.js'. This can be overridden by user settings.

const MAX_TEXT_CHARS = 50_000_000; // Maximum number of characters allowed in the current text. This is a hard limit to prevent performance issues and memory overflow in the main process. The renderer process can have a lower limit (see constants.js) for better user experience, but this is the absolute maximum.
const MAX_IPC_MULTIPLIER = 4;
const MAX_IPC_CHARS = MAX_TEXT_CHARS * MAX_IPC_MULTIPLIER; // Safety limit of characters that can be sent via IPC to prevent memory overflow.
const MAX_PRESET_STR_CHARS = 65536; // Safety limit for preset name and description strings to prevent memory overflow.
const MAX_META_STR_CHARS = 4096; // Safety limit for metadata strings (like title, author) to prevent memory overflow.
const PRESET_WPM_MIN = 10; // Minimum WPM allowed when persisting presets.
const PRESET_WPM_MAX = 700; // Maximum WPM allowed when persisting presets.
const TASK_NAME_MAX_CHARS = 50; // Max chars for task list name.
const TASK_LIST_MAX_ROWS = 200; // Max rows allowed in a persisted task list payload.
const TASK_LIBRARY_MAX_ITEMS = 12000; // Max items allowed in the persisted task library.
const TASK_ROW_TEXT_MAX_CHARS = 200; // Max chars for task row "text" (texto).
const TASK_ROW_COMMENT_MAX_CHARS = 1200; // Max chars for task row "comment" (comentario).
const TASK_ROW_TYPE_MAX_CHARS = 50; // Max chars for task row "type" (tipo).
const TASK_ROW_LINK_MAX_CHARS = 1000; // Max chars for task row "link" (enlace).
const EDITOR_FONT_SIZE_MIN_PX = 12; // Minimum font size for the manual editor textarea.
const EDITOR_FONT_SIZE_MAX_PX = 36; // Maximum font size for the manual editor textarea.
const EDITOR_FONT_SIZE_DEFAULT_PX = 20; // Default font size for the manual editor textarea.
const EDITOR_FONT_SIZE_STEP_PX = 2; // Step used by editor text-size controls and shortcuts.
const EDITOR_FIND_INPUT_MAX_CHARS = 512; // Max chars for the editor find input. Must match public/js/constants.js.

module.exports = {
  DEFAULT_LANG,
  MAX_TEXT_CHARS,
  MAX_IPC_MULTIPLIER,
  MAX_IPC_CHARS,
  MAX_PRESET_STR_CHARS,
  MAX_META_STR_CHARS,
  PRESET_WPM_MIN,
  PRESET_WPM_MAX,
  TASK_NAME_MAX_CHARS,
  TASK_LIST_MAX_ROWS,
  TASK_LIBRARY_MAX_ITEMS,
  TASK_ROW_TEXT_MAX_CHARS,
  TASK_ROW_COMMENT_MAX_CHARS,
  TASK_ROW_TYPE_MAX_CHARS,
  TASK_ROW_LINK_MAX_CHARS,
  EDITOR_FONT_SIZE_MIN_PX,
  EDITOR_FONT_SIZE_MAX_PX,
  EDITOR_FONT_SIZE_DEFAULT_PX,
  EDITOR_FONT_SIZE_STEP_PX,
  EDITOR_FIND_INPUT_MAX_CHARS,
};
