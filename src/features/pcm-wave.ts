export const VOICE_SAMPLE_RATE = 11025;
export const VOICE_MAX_SECONDS = 30;

// Signed, little-endian 16-bit mono PCM. No normalization, gate or compression.
export function encodePcm16(samples: Float32Array, sampleRate = VOICE_SAMPLE_RATE): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2),
    view = new DataView(buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, buffer.byteLength - 8, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, Number.isFinite(samples[i]) ? samples[i] : 0));
    view.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return buffer;
}

export async function voiceWave(
  samples: Float32Array<ArrayBuffer>,
  sourceRate: number,
): Promise<Blob> {
  if (!samples.length) return new Blob([], { type: 'audio/wav' });
  let pcm = samples;
  if (sourceRate !== VOICE_SAMPLE_RATE) {
    // Capture at the microphone's native rate (Firefox requires matching stream/context
    // rates), then use the browser's band-limited resampler before PCM quantization.
    const frames = Math.min(
      VOICE_SAMPLE_RATE * VOICE_MAX_SECONDS,
      Math.round((samples.length * VOICE_SAMPLE_RATE) / sourceRate),
    );
    const offline = new OfflineAudioContext(1, frames, VOICE_SAMPLE_RATE);
    const input = offline.createBuffer(1, samples.length, sourceRate);
    input.copyToChannel(samples, 0);
    const source = offline.createBufferSource();
    source.buffer = input;
    source.connect(offline.destination);
    source.start();
    pcm = (await offline.startRendering()).getChannelData(0);
  }
  return new Blob([encodePcm16(pcm.subarray(0, VOICE_SAMPLE_RATE * VOICE_MAX_SECONDS))], {
    type: 'audio/wav',
  });
}
