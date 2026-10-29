export const CONFIG = {
  screen: { width: 960, height: 720, fps: 24 },
  timing: { bootMs: 3708, corruptionRecoveryMs: 10000, fallRecoveryMs: 8000, transitionMs: 260 },
} as const;
export const asset = (path: string) => `${import.meta.env.BASE_URL}assets/${path}`;
export const displayScale = () => parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
