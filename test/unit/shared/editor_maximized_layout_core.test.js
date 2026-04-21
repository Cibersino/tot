'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const core = require('../../../public/js/lib/editor_maximized_layout_core');

test('clampPreferredTextWidthPx normalizes invalid and out-of-range values', () => {
  assert.equal(core.clampPreferredTextWidthPx(undefined), 960);
  assert.equal(core.clampPreferredTextWidthPx('bad'), 960);
  assert.equal(core.clampPreferredTextWidthPx(100), 480);
  assert.equal(core.clampPreferredTextWidthPx(5000), 1600);
  assert.equal(core.clampPreferredTextWidthPx(812.6), 813);
});

test('clampRenderedTextWidthPx respects the maximized stage width and minimum gutters', () => {
  assert.equal(
    core.clampRenderedTextWidthPx(1400, {
      stageWidthPx: 1100,
      minPx: 480,
      maxPx: 1600,
      defaultPx: 960,
      gutterMinPx: 40,
    }),
    1020
  );

  assert.equal(
    core.clampRenderedTextWidthPx(420, {
      stageWidthPx: 1400,
      minPx: 480,
      maxPx: 1600,
      defaultPx: 960,
      gutterMinPx: 40,
    }),
    480
  );
});

test('computeNextPreferredTextWidthPxFromDrag keeps left and right gutter drags symmetric', () => {
  const options = {
    stageWidthPx: 1600,
    minPx: 480,
    maxPx: 1600,
    defaultPx: 960,
    gutterMinPx: 40,
  };

  assert.equal(
    core.computeNextPreferredTextWidthPxFromDrag(
      { initialTextWidthPx: 960, pointerDeltaPx: 20, side: 'left' },
      options
    ),
    920
  );

  assert.equal(
    core.computeNextPreferredTextWidthPxFromDrag(
      { initialTextWidthPx: 960, pointerDeltaPx: -20, side: 'right' },
      options
    ),
    920
  );

  assert.equal(
    core.computeNextPreferredTextWidthPxFromDrag(
      { initialTextWidthPx: 960, pointerDeltaPx: 200, side: 'right' },
      {
        ...options,
        stageWidthPx: 1200,
      }
    ),
    1120
  );
});
