import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connect } from '../src/features/shared-api.ts';

test('Shared reconnects after a terminal HTTP error and cancels retries when closed', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const original = globalThis.EventSource,
    instances: FakeSource[] = [];
  class FakeSource extends EventTarget {
    onerror?: () => void;
    closed = false;
    url: string;
    constructor(url: string) {
      super();
      this.url = url;
      instances.push(this);
    }
    close() {
      this.closed = true;
    }
  }
  globalThis.EventSource = FakeSource as unknown as typeof EventSource;
  t.after(() => {
    globalThis.EventSource = original;
  });
  const states: boolean[] = [],
    boards: unknown[] = [];
  const dispose = connect(
    (b) => boards.push(b),
    () => {},
    () => {},
    (v) => states.push(v),
  );
  assert.equal(instances.length, 1);
  instances[0].onerror!();
  assert.equal(instances[0].closed, true);
  assert.deepEqual(states, [false]);
  t.mock.timers.tick(2499);
  assert.equal(instances.length, 1);
  t.mock.timers.tick(1);
  assert.equal(instances.length, 2);
  instances[1].dispatchEvent(
    new MessageEvent('canvas', { data: '{"width":256,"height":192,"pixels":[]}' }),
  );
  assert.deepEqual(states, [false, true]);
  assert.equal(boards.length, 1);
  instances[1].onerror!();
  dispose();
  t.mock.timers.tick(10000);
  assert.equal(instances.length, 2);
});

test('Shared preserves quota errors so the UI can keep the folder online', async (t) => {
  const { request, SharedApiError } = await import('../src/features/shared-api.ts');
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response('{"error":"DAILY VOICE LIMIT / 2 MESSAGES PER DAY"}', {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  await assert.rejects(
    request('voices', { method: 'POST' }),
    (error) =>
      error instanceof SharedApiError &&
      error.status === 429 &&
      error.message.includes('DAILY VOICE LIMIT'),
  );
});
