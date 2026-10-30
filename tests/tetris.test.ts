import test from 'node:test';
import { Tetris, SevenBag, SHAPES } from '../src/features/tetris-engine.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

// Run the actual game with a headless shell, keeping input and scoring together.
const source = readFileSync(new URL('../src/features/tetris.ts', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '')
  .replace('export function mount', 'function mount');
const mount = new Function(
  'GameShell',
  'COLORS',
  'GameBest',
  'Tetris',
  'SHAPES',
  `${stripTypeScriptTypes(source)}; return mount;`,
);

test('holding Space awards one hard-drop bonus until the key is released', () => {
  let game: Shell;
  let model: Tetris;
  class Model extends Tetris {
    dropPoints = 0;
    hardDrop() {
      if (!this.over) this.dropPoints += (this.ghostY - this.y) * (1 + Math.floor(this.lines / 10));
      super.hardDrop();
    }
    constructor() {
      super(() => 0.5);
      model = this;
    }
  }
  const buttons: string[] = [];
  const filled = () => model.board.flat().filter(Boolean).length;
  class Shell {
    running = false;
    width = 640;
    canvas = { height: 360 };
    blocks = 0;
    score = '';
    previousText = '';
    input = (_key: string, _down: boolean, _repeat: boolean) => {};
    draw = () => {};
    ctx = {
      save() {},
      restore() {},
      beginPath() {},
      rect() {},
      clip() {},
      strokeRect() {},
      fillRect: () => this.blocks++,
    };
    constructor() {
      game = this;
    }
    keys(input: Shell['input']) {
      this.input = input;
    }
    button(label: string) {
      buttons.push(label);
    }
    loop(_step: unknown, draw: () => void) {
      this.draw = draw;
    }
    clear() {
      this.blocks = 0;
    }
    text(value: string, _x: number, y: number) {
      if (this.previousText === 'SCORE') this.score = value;
      this.previousText = value;
    }
    message() {}
    setRunning(value: boolean) {
      this.running = value;
    }
  }
  class Best {
    begin() {}
    submit(value: number) {
      submitted.push(value);
    }
  }
  const submitted: number[] = [];
  mount(Shell, {}, Best, Model, SHAPES)(new EventTarget());
  assert.deepEqual(buttons, ['↻', '←', '↓', '→', 'DROP']);
  game!.running = true;
  game!.input(' ', true, false);
  game!.draw();
  const firstScore = model!.score;
  assert.ok(firstScore > 0);
  assert.equal(game!.score, String(firstScore));
  const blocks = filled();
  for (let i = 0; i < 100; i++) {
    game!.input(' ', true, true);
    game!.input(' ', true, false);
  }
  game!.draw();
  assert.equal(filled(), blocks, 'auto-repeat must not drop the following pieces');
  assert.equal(game!.score, String(model!.dropPoints));
  game!.input(' ', false, false);
  game!.input(' ', true, false);
  game!.draw();
  assert.equal(filled(), blocks + 4, 'a fresh press drops the next piece');
  assert.equal(game!.score, String(model!.dropPoints));
  for (let i = 0; i < 200; i++) {
    game!.input(' ', false, false);
    game!.input(' ', true, false);
  }
  assert.equal(model!.over, true);
  game!.draw();
  assert.equal(game!.score, String(model!.dropPoints));
  assert.deepEqual(submitted, [model!.dropPoints], 'the final score is submitted exactly once');
  const finalBoard = structuredClone(model!.board);
  game!.running = true;
  for (let i = 0; i < 200; i++) {
    game!.input(' ', false, false);
    game!.input(' ', true, false);
  }
  assert.deepEqual(model!.board, finalBoard);
  assert.equal(model!.score, model!.dropPoints);
  assert.deepEqual(submitted, [model!.dropPoints]);
});

const grounded = () => {
  const game = new Tetris(() => 0.5);
  game.type = 3;
  game.rotation = 0;
  game.x = 4;
  game.y = 18;
  return game;
};

test('each seven-bag contains every piece exactly once', () => {
  let seed = 42;
  const bag = new SevenBag(() => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  });
  for (let i = 0; i < 100; i++) {
    const pieces = Array.from({ length: 7 }, () => bag.next());
    assert.deepEqual(pieces.sort(), [0, 1, 2, 3, 4, 5, 6]);
  }
});

test('four SRS turns preserve each piece and reverse turns undo rotation', () => {
  for (let type = 0; type < 7; type++) {
    const game = new Tetris();
    game.type = type;
    game.x = 3;
    game.y = 5;
    const piece = game.piece;
    for (let i = 0; i < 4; i++) game.rotate();
    assert.deepEqual(game.piece, piece);
    assert.equal(game.x, 3);
    assert.equal(game.y, 5);
    game.rotate();
    game.rotate(-1);
    assert.equal(game.rotation, 0);
  }
});

test('SRS uses distinct I and JLSTZ wall and floor kicks', () => {
  const game = new Tetris();
  game.type = 5;
  game.rotation = 1;
  game.x = -1;
  game.y = 5;
  assert.equal(game.rotate(), true);
  assert.equal(game.x, 0);
  game.type = 0;
  game.rotation = 1;
  game.x = -2;
  assert.equal(game.rotate(), true);
  assert.equal(game.x, 0);
  game.type = 5;
  game.rotation = 0;
  game.x = 3;
  game.y = 18;
  assert.equal(game.rotate(), true);
  assert.deepEqual([game.x, game.y], [2, 17]);
  game.type = 0;
  game.rotation = 0;
  game.x = 3;
  game.y = 18;
  assert.equal(game.rotate(), true);
  assert.deepEqual([game.x, game.y], [4, 16]);
});

test('lock waits 500ms after contact, while hard drop locks immediately with its distance bonus', () => {
  const game = grounded();
  game.tick(0.499);
  assert.equal(game.board.flat().filter(Boolean).length, 0);
  game.tick(0.001);
  assert.equal(game.board.flat().filter(Boolean).length, 4);
  assert.equal(game.score, 0);
  const distance = game.ghostY - game.y;
  game.hardDrop();
  assert.equal(game.board.flat().filter(Boolean).length, 8);
  assert.equal(game.score, distance);
});

test('time before ground contact does not count toward lock delay', () => {
  const game = grounded();
  game.y = 17;
  game.tick(0.8);
  game.tick(0.399);
  assert.equal(game.board.flat().filter(Boolean).length, 0);
  game.tick(0.001);
  assert.equal(game.board.flat().filter(Boolean).length, 4);
});

test('successful grounded moves reset lock delay at most 15 times', () => {
  const game = grounded();
  for (let i = 0; i < 15; i++) {
    game.tick(0.4);
    assert.equal(game.move(i % 2 ? -1 : 1), true);
  }
  assert.equal(game.lockResets, 15);
  game.tick(0.4);
  game.move(-1);
  game.tick(0.1);
  assert.equal(game.board.flat().filter(Boolean).length, 4);
});

test('blocked moves and soft drops do not extend lock delay', () => {
  const game = grounded();
  game.x = 0;
  game.tick(0.4);
  assert.equal(game.move(-1), false);
  assert.equal(game.softDrop(), false);
  assert.equal(game.rotate(), false);
  assert.equal(game.lockResets, 0);
  game.tick(0.1);
  assert.equal(game.board.flat().filter(Boolean).length, 4);
});

test('line clearing keeps existing scoring and reset clears game state', () => {
  const game = grounded();
  for (const y of [18, 19])
    game.board[y] = Array.from({ length: 10 }, (_, x) => (x === 4 || x === 5 ? 0 : 1));
  game.hardDrop();
  assert.equal(game.lines, 2);
  assert.equal(game.score, 300);
  assert.equal(game.board.flat().filter(Boolean).length, 0);
  game.reset();
  assert.equal(game.score, 0);
  assert.equal(game.lines, 0);
  assert.equal(game.over, false);
  assert.equal(game.lockResets, 0);
});

test('rapid hard drops award only actual distance and stop scoring after game over', () => {
  for (let seed = 1; seed <= 1000; seed++) {
    let random = seed;
    const game = new Tetris(() => {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      return random / 2 ** 32;
    });
    let expected = 0;
    for (let press = 0; press < 100; press++) {
      if (!game.over) expected += (game.ghostY - game.y) * (1 + Math.floor(game.lines / 10));
      game.hardDrop();
    }
    assert.equal(game.over, true);
    assert.equal(game.lines, 0);
    assert.equal(game.score, expected);
  }
});

test('hard drop multiplies distance by the level before any rows are cleared', () => {
  for (const lines of [0, 9, 10, 29]) {
    const game = grounded();
    game.lines = lines;
    game.y = 3;
    game.hardDrop();
    assert.equal(game.score, 15 * (1 + Math.floor(lines / 10)));
  }
});

test('grounded hard drop awards zero distance and adds row-clear points separately', () => {
  const game = grounded();
  game.hardDrop();
  assert.equal(game.score, 0);
  game.reset();
  game.type = 3;
  game.x = 4;
  game.y = 5;
  for (const y of [18, 19])
    game.board[y] = Array.from({ length: 10 }, (_, x) => (x === 4 || x === 5 ? 0 : 1));
  game.hardDrop();
  assert.equal(game.score, 13 + 300);
});
