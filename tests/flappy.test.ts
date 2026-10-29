import test from 'node:test';
import assert from 'node:assert/strict';
import { HALF_GAP, nextGap } from '../src/features/flappy-course.ts';

test('Flappy openings vary substantially while staying inside the ducts', () => {
  let seed = 17,
    previous: number | undefined,
    lowest = Infinity,
    highest = -Infinity;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 2 ** 32;
  };
  for (let i = 0; i < 10000; i++) {
    const gap = nextGap(previous, random);
    assert.ok(
      gap - HALF_GAP > 12 && gap + HALF_GAP < 348,
      'opening stays clear of the ceiling and floor',
    );
    if (previous !== undefined)
      assert.ok(
        Math.abs(gap - previous) >= 60 - 1e-10,
        'consecutive openings require a height change',
      );
    lowest = Math.min(lowest, gap);
    highest = Math.max(highest, gap);
    previous = gap;
  }
  assert.ok(lowest < 65 && highest > 295, 'the full playable height is used');
  assert.ok(
    HALF_GAP * 2 < 80 && HALF_GAP * 2 > 40,
    'the narrower opening still has clearance for the drone',
  );
});
