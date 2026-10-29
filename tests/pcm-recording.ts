import { startPcmRecording } from '../src/features/pcm-recorder.ts';
const result = document.querySelector<HTMLPreElement>('#result')!;
document.querySelector<HTMLButtonElement>('#run')!.onclick = async () => {
  const context = new AudioContext({ sampleRate: 48000 }),
    tone = context.createOscillator(),
    gain = context.createGain(),
    sink = context.createMediaStreamDestination();
  tone.frequency.value = 440;
  gain.gain.value = 0.02;
  tone.connect(gain);
  gain.connect(sink);
  tone.start();
  try {
    await context.resume();
    const recording = await startPcmRecording(sink.stream);
    await new Promise((resolve) => setTimeout(resolve, 400));
    recording.stop();
    const blob = await recording.result,
      bytes = await blob.arrayBuffer(),
      view = new DataView(bytes);
    const pcm = Array.from(
      { length: (bytes.byteLength - 44) / 2 },
      (_, i) => view.getInt16(44 + i * 2, true) / 32768,
    );
    const rms = Math.sqrt(pcm.reduce((sum, v) => sum + v * v, 0) / pcm.length);
    let passed =
      view.getUint32(24, true) === 11025 &&
      view.getUint16(34, true) === 16 &&
      view.getUint16(22, true) === 1 &&
      pcm.length > 2000 &&
      rms > 0.005 &&
      rms < 0.025;
    let flacCheck: Record<string, unknown> = {};
    if (new URLSearchParams(location.search).has('flac-check')) {
      const form = new FormData();
      form.set('name', 'SYNTHETIC FLAC CHECK');
      form.set('audio', blob, 'voice.wav');
      const response = await fetch('http://127.0.0.1:8082/api/shared/voices', {
        method: 'POST',
        body: form,
      });
      if (!response.ok) throw new Error(`Upload ${response.status}`);
      const note = await response.json(),
        audio = await fetch(`http://127.0.0.1:8082/api/shared/voices/${note.id}`),
        encoded = await audio.arrayBuffer();
      const decoded = await new OfflineAudioContext(1, 1, 11025).decodeAudioData(encoded.slice(0));
      let maxError = 0;
      for (let i = 0; i < pcm.length; i++)
        maxError = Math.max(maxError, Math.abs(pcm[i] - decoded.getChannelData(0)[i]));
      passed =
        passed &&
        note.mime === 'audio/flac' &&
        decoded.length === pcm.length &&
        maxError < 0.000001 &&
        encoded.byteLength < blob.size;
      flacCheck = {
        storedMime: note.mime,
        storedBytes: encoded.byteLength,
        pcmMaxError: maxError,
        decodedFrames: decoded.length,
      };
    }
    result.textContent = JSON.stringify(
      {
        passed,
        ...flacCheck,
        rate: view.getUint32(24, true),
        bits: view.getUint16(34, true),
        channels: view.getUint16(22, true),
        frames: pcm.length,
        rms,
        bytes: blob.size,
      },
      null,
      2,
    );
    result.dataset.result = passed ? 'PASS' : 'FAIL';
  } catch (error) {
    result.textContent = String(error);
    result.dataset.result = 'FAIL';
  } finally {
    tone.stop();
    sink.stream.getTracks().forEach((track) => track.stop());
    await context.close();
  }
};
