import { GameShell, COLORS } from './game-shell.ts';
import { GameBest } from './game-best.ts';
const SHAPES = [
  [[1, 1, 1, 1]],
  [
    [1, 0, 0],
    [1, 1, 1],
  ],
  [
    [0, 0, 1],
    [1, 1, 1],
  ],
  [
    [1, 1],
    [1, 1],
  ],
  [
    [0, 1, 1],
    [1, 1, 0],
  ],
  [
    [0, 1, 0],
    [1, 1, 1],
  ],
  [
    [1, 1, 0],
    [0, 1, 1],
  ],
];
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
  let board: number[][] = [],
    piece: number[][] = [],
    x = 3,
    y = 0,
    type = 0,
    next = 0,
    bag: number[] = [],
    lines = 0,
    score = 0,
    clock = 0,
    over = false;
  const take = () => {
    if (!bag.length) bag = [0, 1, 2, 3, 4, 5, 6].sort(() => Math.random() - 0.5);
    return bag.pop()!;
  };
  const collide = (m = piece, px = x, py = y) =>
    m.some((row, dy) =>
      row.some(
        (v, dx) =>
          v &&
          (px + dx < 0 ||
            px + dx >= 10 ||
            py + dy >= 20 ||
            (py + dy >= 0 && board[py + dy][px + dx])),
      ),
    );
  const spawn = () => {
    type = next;
    next = take();
    piece = SHAPES[type].map((r) => [...r]);
    x = Math.floor((10 - piece[0].length) / 2);
    y = 0;
    if (collide()) {
      over = true;
      game.setRunning(false);
      best.submit(score);
    }
  };
  const reset = () => {
    best.begin();
    board = Array.from({ length: 20 }, () => Array(10).fill(0));
    bag = [];
    lines = score = clock = 0;
    over = false;
    next = take();
    spawn();
  };
  const lock = () => {
    piece.forEach((row, dy) =>
      row.forEach((v, dx) => {
        if (v && y + dy >= 0) board[y + dy][x + dx] = type + 1;
      }),
    );
    let cleared = 0;
    board = board.filter((r) => {
      if (r.every(Boolean)) {
        cleared++;
        return false;
      }
      return true;
    });
    while (board.length < 20) board.unshift(Array(10).fill(0));
    lines += cleared;
    score += [0, 100, 300, 500, 800][cleared] * (1 + Math.floor(lines / 10));
    spawn();
  };
  const drop = () => {
    if (!game.running || over) return;
    if (!collide(piece, x, y + 1)) y++;
    else lock();
  };
  const move = (dx: number) => {
    if (game.running && !collide(piece, x + dx, y)) x += dx;
  };
  const rotate = () => {
    if (!game.running) return;
    const m = piece[0].map((_, i) => piece.map((r) => r[i]).reverse());
    for (const kick of [0, -1, 1, -2, 2])
      if (!collide(m, x + kick, y)) {
        piece = m;
        x += kick;
        return;
      }
  };
  const hard = () => {
    if (!game.running || over) return;
    while (!collide(piece, x, y + 1)) y++;
    lock();
  };
  game.keys((key, down, repeat) => {
    if (!down) return;
    if (key === 'arrowleft' || key === 'a') move(-1);
    if (key === 'arrowright' || key === 'd') move(1);
    if (key === 'arrowup' || key === 'w') rotate();
    if (key === 'arrowdown' || key === 's') drop();
    if (key === ' ' && !repeat) hard();
  });
  game.button('←', () => move(-1), undefined, true);
  game.button('↻', rotate, undefined, false, '↑');
  game.button('↓', drop, undefined, true);
  game.button('→', () => move(1), undefined, true);
  game.button('DROP', hard, undefined, false, '␣');
  game.onReset = reset;
  reset();
  game.loop(
    (dt) => {
      clock += dt;
      if (clock >= Math.max(0.08, 0.7 - Math.floor(lines / 10) * 0.06)) {
        clock = 0;
        drop();
      }
    },
    () => {
      game.clear();
      const c = game.ctx,
        cell = 16,
        ox = game.width / 2 - 100,
        oy = 20;
      c.strokeStyle = COLORS.dim;
      c.strokeRect(ox - 1, oy - 1, 162, 322);
      const block = (px: number, py: number, color: string) => {
        c.fillStyle = color;
        c.fillRect(ox + px * cell + 1, oy + py * cell + 1, 14, 14);
      };
      board.forEach((row, py) =>
        row.forEach((v, px) => {
          if (v) block(px, py, palette[v - 1]);
        }),
      );
      let ghost = y;
      while (!collide(piece, x, ghost + 1)) ghost++;
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
      SHAPES[next].forEach((row, py) =>
        row.forEach((v, px) => {
          if (v) {
            c.fillStyle = palette[next];
            c.fillRect(ox + 205 + px * 16, 90 + py * 16, 14, 14);
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
