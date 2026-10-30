import { GameShell, COLORS } from './game-shell.ts';
import { GameBest } from './game-best.ts';
import { Tetris, SHAPES } from './tetris-engine.ts';
const palette = [
  COLORS.cyan,
  '#75aaff',
  '#ff9955',
  COLORS.amber,
  COLORS.green,
  '#d497ff',
  COLORS.red,
];
export function mount(host: HTMLElement) {
  const game = new GameShell(host);
  const best = new GameBest(game, { game: 'tetris', level: 0 });
  const state = new Tetris();
  let submitted = false;
  const finish = () => {
    if (!state.over || submitted) return;
    submitted = true;
    game.setRunning(false);
    best.submit(state.score);
  };
  const reset = () => {
    submitted = false;
    best.begin();
    state.reset();
  };
  const act = (action: () => void) => {
    if (!game.running || state.over) return;
    action();
    finish();
  };
  const move = (dx: number) => act(() => state.move(dx));
  const rotate = () => act(() => state.rotate());
  const drop = () => act(() => state.softDrop());
  const hard = () => act(() => state.hardDrop());
  game.keys((key, down, repeat) => {
    if (!down) return;
    if (key === 'arrowleft' || key === 'a') move(-1);
    if (key === 'arrowright' || key === 'd') move(1);
    if (key === 'arrowup' || key === 'w') rotate();
    if (key === 'arrowdown' || key === 's') drop();
    if (key === ' ' && !repeat) hard();
  });
  game.button('↻', rotate, undefined, false, '↑');
  game.button('←', () => move(-1), undefined, true);
  game.button('↓', drop, undefined, true);
  game.button('→', () => move(1), undefined, true);
  game.button('DROP', hard, undefined, false, '␣');
  game.onReset = reset;
  reset();
  game.loop(
    (dt) => {
      state.tick(dt);
      finish();
    },
    () => {
      game.clear();
      const { board, piece, x, y, type, next, lines, score, over } = state;
      const c = game.ctx,
        cell = 16,
        ox = game.width / 2 - 100,
        oy = 20;
      c.strokeStyle = COLORS.dim;
      c.strokeRect(ox - 1, oy - 1, 162, 322);
      const block = (px: number, py: number, color: string) => {
        if (py < 0) return;
        c.fillStyle = color;
        c.fillRect(ox + px * cell + 1, oy + py * cell + 1, 14, 14);
      };
      board.forEach((row, py) =>
        row.forEach((v, px) => {
          if (v) block(px, py, palette[v - 1]);
        }),
      );
      const ghost = state.ghostY;
      piece.forEach((row, dy) =>
        row.forEach((v, dx) => {
          if (v) {
            c.strokeStyle = COLORS.dim;
            c.strokeRect(ox + (x + dx) * cell + 2, oy + (ghost + dy) * cell + 2, 12, 12);
            block(x + dx, y + dy, palette[type]);
          }
        }),
      );
      game.text('SEEGSON', ox - 195, 45, COLORS.green, 22);
      game.text('CARGO STACK', ox - 195, 70);
      game.text('SCORE', ox - 195, 120, COLORS.cyan);
      game.text(String(score), ox - 195, 145);
      game.text('NEXT', ox + 205, 70, COLORS.cyan);
      const previewTop = SHAPES[next].findIndex((row) => row.some(Boolean));
      SHAPES[next].forEach((row, py) =>
        row.forEach((v, px) => {
          if (v) {
            c.fillStyle = palette[next];
            c.fillRect(ox + 205 + px * 16, 90 + (py - previewTop) * 16, 14, 14);
          }
        }),
      );
      if (over) game.text('STORAGE FULL', ox + 205, 210, COLORS.red);
      else if (!game.running) game.text('PAUSED', ox + 205, 210, COLORS.amber);
      game.message(`CARGO BAY / ${lines} ROWS CLEARED / LEVEL ${1 + Math.floor(lines / 10)}`);
    },
  );
  return () => {
    best.dispose();
    game.dispose();
  };
}
