import { apiRequest } from './shared-api.ts';
import type { GameShell } from './game-shell.ts';
export interface BestKey {
  game: 'gravity' | 'flappy' | 'tetris';
  level: number;
}
interface BestResponse {
  value: number | null;
  newBest?: boolean;
}

export class GameBest {
  private game: GameShell;
  private key!: BestKey;
  private version = 0;
  private round = 0;
  private disposed = false;
  private format: (value: number) => string;
  constructor(game: GameShell, key: BestKey, format: (value: number) => string = String) {
    this.game = game;
    this.format = format;
    this.select(key);
  }
  select(key: BestKey) {
    this.key = { ...key };
    this.round++;
    const version = ++this.version;
    this.game.best('--');
    void apiRequest<BestResponse>(`games/best/${key.game}/${key.level}`)
      .then((result) => {
        if (!this.disposed && version === this.version)
          this.game.best(
            result.value === null
              ? key.game === 'gravity'
                ? '--'
                : '0'
              : this.format(result.value),
          );
      })
      .catch(() => {});
  }
  begin() {
    this.select(this.key);
  }
  submit(value: number) {
    if (!Number.isSafeInteger(value) || value <= 0 || this.disposed) return;
    const key = { ...this.key },
      version = ++this.version,
      round = this.round;
    void apiRequest<BestResponse>('games/best', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...key, value }),
    })
      .then((result) => {
        if (this.disposed || version !== this.version) return;
        this.game.best(
          result.value === null ? (key.game === 'gravity' ? '--' : '0') : this.format(result.value),
        );
        if (result.newBest && round === this.round) this.game.newBest();
      })
      .catch(() => {});
  }
  dispose() {
    this.disposed = true;
    this.version++;
  }
}
