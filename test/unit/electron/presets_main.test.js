'use strict';

process.env.TOT_LOG_LEVEL = 'silent';

const test = require('node:test');
const assert = require('node:assert/strict');

const { sanitizePresetInput } = require('../../../electron/presets_main');

test('preset persistence enforces the shared name and description limits', () => {
  const valid = sanitizePresetInput({
    name: 'n'.repeat(20),
    description: 'd'.repeat(120),
    wpm: 200,
  });
  assert.equal(valid.ok, true);

  assert.deepEqual(
    sanitizePresetInput({ name: 'n'.repeat(21), description: '', wpm: 200 }),
    { ok: false, error: 'preset name too long', code: 'PRESET_NAME_TOO_LONG' }
  );
  assert.deepEqual(
    sanitizePresetInput({ name: 'Valid', description: 'd'.repeat(121), wpm: 200 }),
    { ok: false, error: 'preset description too long', code: 'PRESET_DESCRIPTION_TOO_LONG' }
  );
});
