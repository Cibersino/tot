// electron/text_extraction_platform/ocr_google_drive_operation.js

// Coordinates Google OCR operations that mutate the stored token.
'use strict';

let active = false;

function begin() {
  if (active) return null;
  active = true;
  return () => { active = false; };
}

module.exports = { begin };
