import type { TerminalEntry } from '../core/types.ts';
import type { FeatureModule } from './types.ts';
const loaders: Record<NonNullable<TerminalEntry['module']>, () => Promise<FeatureModule>> = {
  pixels: () => import('./pixel-board.ts'),
  voices: () => import('./voice-notes.ts'),
  video: () => import('./video.ts'),
  gravity: () => import('./gravity.ts'),
  tetris: () => import('./tetris.ts'),
  flappy: () => import('./flappy.ts'),
  chess: () => import('./chess.ts'),
};
export async function mountFeature(entry: TerminalEntry, host: HTMLElement, active: () => boolean) {
  if (!entry.module) return;
  const feature = await loaders[entry.module]();
  if (active()) return feature.mount(host, entry);
}
