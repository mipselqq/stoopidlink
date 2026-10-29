import test from 'node:test';
import assert from 'node:assert/strict';
import { Chess } from 'chess.js';
import { findBestMove } from '../src/features/chess-engine.ts';
test('station chess bot chooses a legal move from the initial position', () => {
  const c = new Chess();
  const move = findBestMove(c.fen(), 150, 2);
  assert.ok(move);
  assert.doesNotThrow(() => c.move(move!));
});
test('station bot finishes mate in one', () => {
  const c = new Chess('7k/8/5KQ1/8/8/8/8/8 w - - 0 1');
  const move = findBestMove(c.fen(), 400, 3);
  assert.ok(move);
  c.move(move!);
  assert.equal(c.isCheckmate(), true);
});
test('station bot returns no move for a finished game', () =>
  assert.equal(findBestMove('7k/6Q1/5K2/8/8/8/8/8 b - - 0 1', 100, 2), null));
