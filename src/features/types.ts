import type { TerminalEntry } from '../core/types.ts';
export type Dispose = () => void;
export interface FeatureModule {
  mount(host: HTMLElement, entry: TerminalEntry): Dispose | Promise<Dispose>;
}
