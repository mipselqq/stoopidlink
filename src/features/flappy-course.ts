export const HALF_GAP = 38;
const MIN_CENTER = 60,
  MAX_CENTER = 300,
  MIN_CHANGE = 60;

export function nextGap(previous?: number, random = Math.random) {
  if (previous === undefined) return MIN_CENTER + random() * (MAX_CENTER - MIN_CENTER);
  const left = Math.max(0, previous - MIN_CHANGE - MIN_CENTER);
  const rightStart = Math.min(MAX_CENTER, previous + MIN_CHANGE);
  const sample = random() * (left + MAX_CENTER - rightStart);
  return sample < left ? MIN_CENTER + sample : rightStart + sample - left;
}
