// electron/editor_find_shortcuts.js
'use strict';

// =============================================================================
// Overview
// =============================================================================
// Pure keyboard helpers for editor native find/search shortcuts.

// =============================================================================
// Shortcut predicates
// =============================================================================
function matchesLetterShortcut(input, letter) {
  if (!input) return false;

  const normalizedLetter = String(letter || '').toLowerCase();
  if (!normalizedLetter) return false;

  const key = String(input.key || '').toLowerCase();
  if (key === normalizedLetter) {
    return true;
  }

  const code = String(input.code || '');
  return code === `Key${normalizedLetter.toUpperCase()}`;
}

function isCmdOrCtrl(input) {
  return !!(input && (input.control || input.meta));
}

function isF3(input) {
  return !!(input && input.key === 'F3');
}

function isEscape(input) {
  return !!(input && input.key === 'Escape');
}

function isOpenFindShortcut(input) {
  if (!input || input.alt) return false;
  return isCmdOrCtrl(input) && matchesLetterShortcut(input, 'f');
}

function isOpenReplaceShortcut(input) {
  if (!input) return false;

  if (process.platform === 'darwin') {
    return !!(
      input.meta &&
      input.alt &&
      !input.control &&
      matchesLetterShortcut(input, 'f')
    );
  }

  return !!(
    input.control &&
    !input.meta &&
    !input.alt &&
    matchesLetterShortcut(input, 'h')
  );
}

function isIncreaseTextSizeShortcut(input) {
  if (!input || input.alt || !isCmdOrCtrl(input)) return false;
  const key = String(input.key || '');
  const code = String(input.code || '');
  return key === '+' || key === '=' || key === 'Add' || code === 'NumpadAdd';
}

function isDecreaseTextSizeShortcut(input) {
  if (!input || input.alt || !isCmdOrCtrl(input)) return false;
  const key = String(input.key || '');
  const code = String(input.code || '');
  return key === '-' || key === 'Subtract' || code === 'NumpadSubtract';
}

function isResetTextSizeShortcut(input) {
  if (!input || input.alt || !isCmdOrCtrl(input)) return false;
  const key = String(input.key || '');
  const code = String(input.code || '');
  return key === '0' || code === 'Digit0' || code === 'Numpad0';
}

// =============================================================================
// Exports
// =============================================================================
module.exports = {
  isDecreaseTextSizeShortcut,
  isEscape,
  isF3,
  isIncreaseTextSizeShortcut,
  isOpenFindShortcut,
  isOpenReplaceShortcut,
  isResetTextSizeShortcut,
};

// =============================================================================
// End of electron/editor_find_shortcuts.js
// =============================================================================
