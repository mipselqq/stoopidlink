import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GameBest } from '../src/features/game-best.ts';
import type { GameShell } from '../src/features/game-shell.ts';
const settle = () => new Promise<void>((resolve) => setImmediate(resolve));
test('BEST displays the shared result and celebrates only a server-confirmed improvement', async (t) => {
  const labels: string[] = [],
    body: unknown[] = [];
  let popups = 0;
  t.mock.method(globalThis, 'fetch', async (_url: string, options: RequestInit) => {
    if (options.method === 'POST') {
      body.push(JSON.parse(options.body as string));
      return Response.json({ value: 9, newBest: body.length === 1 });
    }
    return Response.json({ value: 8 });
  });
  const game = {
    best: (text: string) => labels.push(text),
    newBest: () => popups++,
  } as unknown as GameShell;
  const best = new GameBest(game, { game: 'flappy', level: 0 });
  await settle();
  assert.equal(labels.at(-1), '8');
  best.submit(9);
  await settle();
  assert.equal(labels.at(-1), '9');
  assert.equal(popups, 1);
  assert.deepEqual(body[0], { game: 'flappy', level: 0, value: 9 });
  best.submit(9);
  await settle();
  assert.equal(popups, 1);
  best.dispose();
});
test('Gravity selection ignores a stale response from another level', async (t) => {
  const pending: ((value: Response) => void)[] = [],
    labels: string[] = [];
  t.mock.method(
    globalThis,
    'fetch',
    () => new Promise<Response>((resolve) => pending.push(resolve)),
  );
  const game = {
    best: (text: string) => labels.push(text),
    newBest: () => assert.fail('unexpected popup'),
  } as unknown as GameShell;
  const best = new GameBest(game, { game: 'gravity', level: 0 }, (n) => `${n / 1000} S`);
  best.select({ game: 'gravity', level: 1 });
  pending[1](Response.json({ value: 12000 }));
  await settle();
  pending[0](Response.json({ value: 3000 }));
  await settle();
  assert.equal(labels.at(-1), '12 S');
  best.dispose();
});
test('a late read cannot overwrite the newly confirmed best, and disposal suppresses popups', async (t) => {
  let read!: (response: Response) => void, submit!: (response: Response) => void;
  const labels: string[] = [];
  let popups = 0;
  t.mock.method(
    globalThis,
    'fetch',
    (_url: string, options: RequestInit) =>
      new Promise<Response>((resolve) => {
        if (options.method === 'POST') submit = resolve;
        else read = resolve;
      }),
  );
  const game = {
      best: (text: string) => labels.push(text),
      newBest: () => popups++,
    } as unknown as GameShell,
    best = new GameBest(game, { game: 'tetris', level: 0 });
  best.submit(100);
  submit(Response.json({ value: 100, newBest: true }));
  await settle();
  read(Response.json({ value: null }));
  await settle();
  assert.equal(labels.at(-1), '100');
  assert.equal(popups, 1);
  best.submit(200);
  best.dispose();
  submit(Response.json({ value: 200, newBest: true }));
  await settle();
  assert.equal(popups, 1);
});
