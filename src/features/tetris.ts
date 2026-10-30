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
  const game = new GameShell(host, { fitCanvas: true });
  const best = new GameBest(game, { game: 'tetris', level: 0 });
  const state = new Tetris();
  let submitted = false;
  let spaceHeld = false;
  const inputAbort = new AbortController();
  host.addEventListener(
    'focusout',
    () => {
      spaceHeld = false;
    },
    { signal: inputAbort.signal },
  );
  host.ownerDocument?.defaultView?.addEventListener(
    'blur',
    () => {
      spaceHeld = false;
    },
    { signal: inputAbort.signal },
  );
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
    if (key === ' ') {
      const freshPress = down && !repeat && !spaceHeld;
      spaceHeld = down;
      if (freshPress) hard();
      return;
    }
    if (!down) return;
    if (key === 'arrowleft' || key === 'a') move(-1);
    if (key === 'arrowright' || key === 'd') move(1);
    if (key === 'arrowup' || key === 'w') rotate();
    if (key === 'arrowdown' || key === 's') drop();
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
        height = game.canvas.height,
        sideWidth = Math.min(64, game.width * 0.1),
        cell = Math.min((game.width - sideWidth * 2 - 32) / 10, (height - 18) / 20),
        ox = (game.width - cell * 10) / 2,
        oy = (height - cell * 20) / 2,
        inset = Math.max(1, cell * 0.06);
      c.save();
      c.beginPath();
      c.rect(ox, oy, cell * 10, cell * 20);
      c.clip();
      c.strokeStyle = COLORS.dim;

      const block = (px: number, py: number, color: string) => {
        if (py < 0) return;
        c.fillStyle = color;
        c.fillRect(
          ox + px * cell + inset,
          oy + py * cell + inset,
          cell - 2 * inset,
          cell - 2 * inset,
        );
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
            c.strokeRect(
              ox + (x + dx) * cell + inset,
              oy + (ghost + dy) * cell + inset,
              cell - 2 * inset,
              cell - 2 * inset,
            );
            block(x + dx, y + dy, palette[type]);
          }
        }),
      );
      c.restore();
      c.strokeStyle = COLORS.dim;
      c.strokeRect(ox - 1, oy - 1, cell * 10 + 2, cell * 20 + 2);
      const labelSize = Math.min(16, sideWidth / 2.8),
        scoreX = ox - sideWidth - 8;
      game.text('SCORE', scoreX, oy + 20, COLORS.cyan, labelSize);
      game.text(
        String(score),
        scoreX,
        oy + 40,
        COLORS.white,
        Math.min(labelSize, sideWidth / (String(score).length * 0.6)),
      );
      const previewCell = Math.min(12, sideWidth / 4),
        previewX = ox + cell * 10 + 8;
      game.text('NEXT', previewX, oy + 20, COLORS.cyan, labelSize);
      const previewTop = SHAPES[next].findIndex((row) => row.some(Boolean));
      SHAPES[next].forEach((row, py) =>
        row.forEach((v, px) => {
          if (v) {
            c.fillStyle = palette[next];
            c.fillRect(
              previewX + px * previewCell,
              oy + 30 + (py - previewTop) * previewCell,
              previewCell - 1,
              previewCell - 1,
            );
          }
        }),
      );
      if (over || !game.running) {
        c.save();
        c.textAlign = 'center';
        const messageY = oy + cell * 10;
        c.fillStyle = COLORS.bg;
        c.fillRect(ox, messageY - 20, cell * 10, 36);
        game.text(
          over ? 'STORAGE FULL' : 'PAUSED',
          game.width / 2,
          messageY + 4,
          over ? COLORS.red : COLORS.amber,
        );
        c.restore();
      }
      game.message(`CARGO BAY / ${lines} ROWS CLEARED / LEVEL ${1 + Math.floor(lines / 10)}`);
    },
  );
  return () => {
    inputAbort.abort();
    best.dispose();
    game.dispose();
  };
}
