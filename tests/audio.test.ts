import test from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { TerminalAudio } from '../src/terminal/audio.ts';

function fixture(t: any) {
  const document = new EventTarget() as EventTarget & { hidden: boolean };
  document.hidden = false;
  const buffer = { duration: 1.821 };
  const sources: any[] = [];
  const gains: any[] = [];
  const contexts: Context[] = [];
  let requests = 0;
  let decode = async () => buffer;
  class Context {
    destination = {};
    resumes = 0;
    suspends = 0;
    closed = false;
    constructor() {
      contexts.push(this);
    }
    async resume() {
      this.resumes++;
    }
    async suspend() {
      this.suspends++;
    }
    async close() {
      this.closed = true;
    }
    decodeAudioData() {
      return decode();
    }
    createBufferSource() {
      const source = {
        buffer: null,
        loop: false,
        loopStart: -1,
        loopEnd: -1,
        starts: 0,
        stops: 0,
        connect() {},
        disconnect() {},
        start() {
          this.starts++;
        },
        stop() {
          this.stops++;
        },
      };
      sources.push(source);
      return source;
    }
    createGain() {
      const gain = { gain: { value: 1 }, connect() {}, disconnect() {} };
      gains.push(gain);
      return gain;
    }
  }
  const replacements = {
    document,
    AudioContext: Context,
    fetch: async (_url: string, options: RequestInit) => {
      requests++;
      assert.equal(options.signal instanceof AbortSignal, true);
      return new Response(new Uint8Array([1]));
    },
  };
  const restore: (() => void)[] = [];
  for (const [key, value] of Object.entries(replacements)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    restore.push(() => {
      if (original) Object.defineProperty(globalThis, key, original);
      else Reflect.deleteProperty(globalThis, key);
    });
  }
  const audio = new TerminalAudio();
  t.after(() => {
    audio.dispose();
    for (const reset of restore) reset();
  });
  return {
    audio,
    document,
    buffer,
    sources,
    gains,
    contexts,
    requests: () => requests,
    setDecode: (fn: typeof decode) => {
      decode = fn;
    },
  };
}

test('ambient uses one unmodified, continuously looping buffer despite repeated unlocks', async (t) => {
  const f = fixture(t);
  for (let i = 0; i < 10; i++) f.audio.unlock();
  await setImmediate();
  f.audio.unlock();
  assert.equal(f.requests(), 1);
  assert.equal(f.contexts.length, 1);
  assert.equal(f.sources.length, 1);
  assert.equal(f.sources[0].buffer, f.buffer);
  assert.equal(f.sources[0].loop, true);
  assert.equal(f.sources[0].loopStart, 0);
  assert.equal(f.sources[0].loopEnd, f.buffer.duration);
  assert.equal(f.sources[0].starts, 1);
  assert.equal(f.gains[0].gain.value, 0.24);
});

test('hiding and restoring the page suspends the same source without restarting it', async (t) => {
  const f = fixture(t);
  f.audio.unlock();
  await setImmediate();
  f.document.hidden = true;
  f.document.dispatchEvent(new Event('visibilitychange'));
  f.document.hidden = false;
  f.document.dispatchEvent(new Event('visibilitychange'));
  assert.equal(f.contexts[0].suspends, 1);
  assert.equal(f.contexts[0].resumes, 2);
  assert.equal(f.sources.length, 1);
  assert.equal(f.sources[0].starts, 1);
  f.audio.dispose();
  f.audio.dispose();
  assert.equal(f.sources[0].stops, 1);
  assert.equal(f.contexts[0].closed, true);
  f.document.dispatchEvent(new Event('visibilitychange'));
  f.audio.unlock();
  assert.equal(f.contexts[0].resumes, 2);
});

test('a failed decode can retry on the next interaction', async (t) => {
  const f = fixture(t);
  f.setDecode(async () => {
    throw new Error('Decode failed');
  });
  f.audio.unlock();
  await setImmediate();
  assert.equal(f.sources.length, 0);
  f.setDecode(async () => f.buffer);
  f.audio.unlock();
  await setImmediate();
  assert.equal(f.requests(), 2);
  assert.equal(f.sources.length, 1);
});

test('disposing during decoding prevents late ambient playback', async (t) => {
  const f = fixture(t);
  let complete!: (value: typeof f.buffer) => void;
  f.setDecode(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  f.audio.unlock();
  await setImmediate();
  f.audio.dispose();
  complete(f.buffer);
  await setImmediate();
  assert.equal(f.sources.length, 0);
  assert.equal(f.contexts[0].closed, true);
});
