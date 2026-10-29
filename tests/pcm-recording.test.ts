import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { encodePcm16, VOICE_SAMPLE_RATE } from '../src/features/pcm-wave.ts';
import { microphoneAudio } from '../src/features/pcm-recorder.ts';

test('voice WAV is mono 11025 Hz signed 16-bit little-endian PCM with no gain normalization', () => {
  const pcm = new Float32Array([-1, -0.5, -0.001, 0, 0.001, 0.5, 1, 2, NaN]);
  const bytes = encodePcm16(pcm),
    v = new DataView(bytes),
    text = (start: number, n: number) => String.fromCharCode(...new Uint8Array(bytes, start, n));
  assert.equal(text(0, 4), 'RIFF');
  assert.equal(text(8, 4), 'WAVE');
  assert.equal(text(12, 4), 'fmt ');
  assert.equal(text(36, 4), 'data');
  assert.equal(v.getUint32(4, true), bytes.byteLength - 8);
  assert.equal(v.getUint16(20, true), 1);
  assert.equal(v.getUint16(22, true), 1);
  assert.equal(v.getUint32(24, true), 11025);
  assert.equal(v.getUint32(28, true), 22050);
  assert.equal(v.getUint16(32, true), 2);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getUint32(40, true), pcm.length * 2);
  assert.deepEqual(
    Array.from({ length: pcm.length }, (_, i) => v.getInt16(44 + i * 2, true)),
    [-32768, -16384, -33, 0, 33, 16384, 32767, 32767, 0],
  );
  assert.equal(encodePcm16(new Float32Array(VOICE_SAMPLE_RATE)).byteLength, 22094);
});
test('microphone requests all browser voice processing disabled', () => {
  assert.equal(microphoneAudio.noiseSuppression, false);
  assert.equal(microphoneAudio.echoCancellation, false);
  assert.equal(microphoneAudio.autoGainControl, false);
});

function processor(limit: number) {
  let Processor: any;
  const messages: any[] = [];
  class Base {
    port = {
      onmessage: undefined as any,
      postMessage: (data: any) => messages.push(data),
      close() {},
    };
  }
  runInNewContext(
    readFileSync(new URL('../src/features/pcm-capture-worklet.js', import.meta.url), 'utf8'),
    {
      Float32Array,
      AudioWorkletProcessor: Base,
      registerProcessor: (_name: string, type: any) => {
        Processor = type;
      },
    },
  );
  return { node: new Processor({ processorOptions: { maxFrames: limit } }), messages };
}
test('audio thread copies quiet samples unchanged and flushes the final partial chunk on stop', () => {
  const { node, messages } = processor(48000 * 30),
    input = new Float32Array(2501);
  for (let i = 0; i < input.length; i++) input[i] = Math.sin(i * 0.2) * 0.0001;
  node.process([[input.subarray(0, 257)]]);
  node.process([[input.subarray(257, 2001)]]);
  node.process([[input.subarray(2001)]]);
  node.port.onmessage({ data: 'stop' });
  const actual = messages.filter((m) => m.type === 'samples').flatMap((m) => Array.from(m.samples));
  assert.deepEqual(actual, Array.from(input));
  assert.equal(messages.at(-1).type, 'stopped');
  assert.equal(node.process([[input]]), false);
});
test('audio thread enforces the duration at an exact sample boundary and downmixes channels', () => {
  const { node, messages } = processor(10);
  node.process([[new Float32Array(16).fill(0.5), new Float32Array(16).fill(-0.25)]]);
  assert.deepEqual(Array.from(messages[0].samples), Array(10).fill(0.125));
  assert.equal(messages[1].type, 'stopped');
});
