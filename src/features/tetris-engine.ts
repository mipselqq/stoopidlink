export const LOCK_DELAY = 0.5;
export const MAX_LOCK_RESETS = 15;
export const SHAPES = [
  [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
  [
    [1, 1],
    [1, 1],
  ],
  [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
];
const turn = (matrix: number[][]) => matrix[0].map((_, x) => matrix.map((row) => row[x]).reverse());
const STATES = SHAPES.map((shape) => {
  const states = [shape];
  for (let i = 1; i < 4; i++) states.push(turn(states[i - 1]));
  return states;
});

type Kick = readonly [number, number];
// SRS offsets use positive Y upwards; the board uses positive Y downwards.
// https://tetris.wiki/Super_Rotation_System
const KICKS: Record<string, Kick[]> = {
  '0>1': [
    [0, 0],
    [-1, 0],
    [-1, 1],
    [0, -2],
    [-1, -2],
  ],
  '1>0': [
    [0, 0],
    [1, 0],
    [1, -1],
    [0, 2],
    [1, 2],
  ],
  '1>2': [
    [0, 0],
    [1, 0],
    [1, -1],
    [0, 2],
    [1, 2],
  ],
  '2>1': [
    [0, 0],
    [-1, 0],
    [-1, 1],
    [0, -2],
    [-1, -2],
  ],
  '2>3': [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, -2],
    [1, -2],
  ],
  '3>2': [
    [0, 0],
    [-1, 0],
    [-1, -1],
    [0, 2],
    [-1, 2],
  ],
  '3>0': [
    [0, 0],
    [-1, 0],
    [-1, -1],
    [0, 2],
    [-1, 2],
  ],
  '0>3': [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, -2],
    [1, -2],
  ],
};
const I_KICKS: Record<string, Kick[]> = {
  '0>1': [
    [0, 0],
    [-2, 0],
    [1, 0],
    [-2, -1],
    [1, 2],
  ],
  '1>0': [
    [0, 0],
    [2, 0],
    [-1, 0],
    [2, 1],
    [-1, -2],
  ],
  '1>2': [
    [0, 0],
    [-1, 0],
    [2, 0],
    [-1, 2],
    [2, -1],
  ],
  '2>1': [
    [0, 0],
    [1, 0],
    [-2, 0],
    [1, -2],
    [-2, 1],
  ],
  '2>3': [
    [0, 0],
    [2, 0],
    [-1, 0],
    [2, 1],
    [-1, -2],
  ],
  '3>2': [
    [0, 0],
    [-2, 0],
    [1, 0],
    [-2, -1],
    [1, 2],
  ],
  '3>0': [
    [0, 0],
    [1, 0],
    [-2, 0],
    [1, -2],
    [-2, 1],
  ],
  '0>3': [
    [0, 0],
    [-1, 0],
    [2, 0],
    [-1, 2],
    [2, -1],
  ],
};

export class SevenBag {
  private pieces: number[] = [];
  private random: () => number;
  constructor(random: () => number = Math.random) {
    this.random = random;
  }
  next() {
    if (!this.pieces.length) {
      this.pieces = [0, 1, 2, 3, 4, 5, 6];
      for (let i = this.pieces.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.pieces[i], this.pieces[j]] = [this.pieces[j], this.pieces[i]];
      }
    }
    return this.pieces.pop()!;
  }
}

export class Tetris {
  board: number[][] = [];
  type = 0;
  next = 0;
  rotation = 0;
  x = 3;
  y = -1;
  lines = 0;
  score = 0;
  over = false;
  lockResets = 0;
  private lockElapsed = 0;
  private gravityElapsed = 0;
  private bag!: SevenBag;

  private random: () => number;
  constructor(random: () => number = Math.random) {
    this.random = random;
    this.reset();
  }
  get piece() {
    return STATES[this.type][this.rotation];
  }
  get grounded() {
    return this.collides(this.piece, this.x, this.y + 1);
  }
  get ghostY() {
    let y = this.y;
    if (!this.over) while (!this.collides(this.piece, this.x, y + 1)) y++;
    return y;
  }
  collides(piece = this.piece, x = this.x, y = this.y) {
    return piece.some((row, dy) =>
      row.some(
        (v, dx) =>
          v &&
          (x + dx < 0 ||
            x + dx >= 10 ||
            y + dy >= 20 ||
            (y + dy >= 0 && this.board[y + dy][x + dx])),
      ),
    );
  }
  reset() {
    this.board = Array.from({ length: 20 }, () => Array(10).fill(0));
    this.bag = new SevenBag(this.random);
    this.lines = this.score = 0;
    this.over = false;
    this.next = this.bag.next();
    this.spawn();
  }
  private spawn() {
    this.type = this.next;
    this.next = this.bag.next();
    this.rotation = 0;
    this.x = Math.floor((10 - this.piece[0].length) / 2);
    this.y = -1;
    this.gravityElapsed = this.lockElapsed = this.lockResets = 0;
    this.over = this.collides();
  }
  private resetLock(wasGrounded: boolean) {
    if (wasGrounded && this.lockResets < MAX_LOCK_RESETS) {
      this.lockElapsed = 0;
      this.lockResets++;
    }
  }
  move(dx: number) {
    if (this.over || this.collides(this.piece, this.x + dx, this.y)) return false;
    const grounded = this.grounded;
    this.x += dx;
    this.resetLock(grounded);
    return true;
  }
  rotate(direction: 1 | -1 = 1) {
    if (this.over || this.type === 3) return false;
    const rotation = (this.rotation + direction + 4) % 4;
    const piece = STATES[this.type][rotation];
    const kicks = (this.type === 0 ? I_KICKS : KICKS)[`${this.rotation}>${rotation}`];
    for (const [dx, dy] of kicks) {
      if (this.collides(piece, this.x + dx, this.y - dy)) continue;
      const grounded = this.grounded;
      this.x += dx;
      this.y -= dy;
      this.rotation = rotation;
      this.resetLock(grounded);
      return true;
    }
    return false;
  }
  softDrop() {
    if (this.over || this.grounded) return false;
    this.y++;
    this.gravityElapsed = 0;
    return true;
  }
  hardDrop() {
    if (this.over) return;
    const landingY = this.ghostY;
    this.score += (landingY - this.y) * (1 + Math.floor(this.lines / 10));
    this.y = landingY;
    this.lock();
  }
  private lock() {
    if (this.piece.some((row, dy) => row.some((v) => v && this.y + dy < 0))) {
      this.over = true;
      return;
    }
    this.piece.forEach((row, dy) =>
      row.forEach((v, dx) => {
        if (v) this.board[this.y + dy][this.x + dx] = this.type + 1;
      }),
    );
    const rows = this.board.filter((row) => !row.every(Boolean));
    const cleared = 20 - rows.length;
    while (rows.length < 20) rows.unshift(Array(10).fill(0));
    this.board = rows;
    this.lines += cleared;
    this.score += [0, 100, 300, 500, 800][cleared] * (1 + Math.floor(this.lines / 10));
    this.spawn();
  }
  tick(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const epsilon = 1e-9;
    while (dt > epsilon && !this.over) {
      const interval = Math.max(0.08, 0.7 - Math.floor(this.lines / 10) * 0.06);
      const grounded = this.grounded;
      const step = Math.min(
        dt,
        interval - this.gravityElapsed,
        grounded ? LOCK_DELAY - this.lockElapsed : Infinity,
      );
      this.gravityElapsed += step;
      if (grounded) this.lockElapsed += step;
      dt -= step;
      if (grounded && this.lockElapsed >= LOCK_DELAY - epsilon) this.lock();
      else if (this.gravityElapsed >= interval - epsilon) {
        this.gravityElapsed = 0;
        if (!grounded) this.y++;
      }
    }
  }
}
