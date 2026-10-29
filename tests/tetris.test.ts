import test from 'node:test';
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
  `${stripTypeScriptTypes(source)}; return mount;`,
);

test('holding Space drops one piece and awards no points without cleared rows', () => {
  let game: Shell;
  class Shell {
    running = false;
    width = 640;
    blocks = 0;
    score = '';
    input = (_key: string, _down: boolean, _repeat: boolean) => {};
    draw = () => {};
    ctx = {
      strokeRect() {},
      fillRect: () => this.blocks++,
    };
    constructor() {
      game = this;
    }
    keys(input: Shell['input']) {
      this.input = input;
    }
    button() {}
    loop(_step: unknown, draw: () => void) {
      this.draw = draw;
    }
    clear() {
      this.blocks = 0;
    }
    text(value: string, _x: number, y: number) {
      if (y === 145) this.score = value;
    }
    message() {}
    setRunning(value: boolean) {
      this.running = value;
    }
  }
  class Best {
    begin() {}
    submit() {}
  }
  mount(Shell, {}, Best)({});
  game!.running = true;
  game!.input(' ', true, false);
  game!.draw();
  assert.equal(game!.score, '0');
  const blocks = game!.blocks;
  for (let i = 0; i < 100; i++) game!.input(' ', true, true);
  game!.draw();
  assert.equal(game!.blocks, blocks, 'auto-repeat must not drop the following pieces');
  assert.equal(game!.score, '0');
  game!.input(' ', false, false);
  game!.input(' ', true, false);
  game!.draw();
  assert.equal(game!.blocks, blocks + 4, 'a fresh press drops the next piece');
  assert.equal(game!.score, '0');
});
