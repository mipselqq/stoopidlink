import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SQUARE_FRAME_MS,
  SQUARE_FRAMES,
  squareLoaderFrame,
} from '../src/terminal/square-loader.ts';

test('desktop square frames keep the original artwork, coordinates and 24 fps cadence', () => {
  assert.equal(SQUARE_FRAME_MS, 2000 / 24);
  assert.deepEqual(
    SQUARE_FRAMES.map((frame) => frame.id),
    ['100', '102'],
  );
  for (const [id, y, height] of [
    ['100', 71, 607.9],
    ['102', 100, 578.9],
  ] as const) {
    assert.equal(
      squareLoaderFrame(id, 1280, 720, false, `${id}.svg`),
      `<svg class="square-loader" viewBox="0 0 960 720" preserveAspectRatio="none"><image href="${id}.svg" x="23" y="${y}" width="917.95" height="${height}"/></svg>`,
    );
  }
  assert.equal(squareLoaderFrame(undefined, 960, 720, false, ''), '');
});

test('mobile repeats unscaled original tiles across the viewport and drains them in place', () => {
  for (const [width, height] of [
    [300, 650],
    [650, 300],
    [390, 844],
  ]) {
    const full = squareLoaderFrame('100', width, height, true, '100.svg');
    const strips = squareLoaderFrame('102', width, height, true, '102.svg');
    for (const frame of [full, strips]) {
      assert.ok(frame.includes(`viewBox="0 0 ${width} ${height}"`));
      assert.match(frame, /width="55\.9" height="72" patternUnits="userSpaceOnUse"/);
      assert.match(frame, /<rect width="100%" height="100%"/);
      assert.match(frame, /<image[^>]+width="917\.95"/);
    }
    const fullY = Number(full.match(/<image[^>]+ y="([^"]+)"/)![1]);
    const stripY = Number(strips.match(/<image[^>]+ y="([^"]+)"/)![1]);
    assert.equal(fullY + 34, stripY + 5, 'strips stay at the bottom of the same tile');
  }
});
