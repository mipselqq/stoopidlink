import { voiceWave, VOICE_MAX_SECONDS } from './pcm-wave.ts';

export const microphoneAudio: MediaTrackConstraints = {
  channelCount: { ideal: 1 },
  sampleSize: { ideal: 16 },
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};
export interface PcmRecording {
  result: Promise<Blob>;
  stop(): void;
  cancel(): void;
}

export async function startPcmRecording(stream: MediaStream): Promise<PcmRecording> {
  const nativeRate = stream.getAudioTracks()[0]?.getSettings().sampleRate;
  const context = new AudioContext(nativeRate ? { sampleRate: nativeRate } : undefined);
  let source: MediaStreamAudioSourceNode | undefined,
    node: AudioWorkletNode | undefined,
    mute: GainNode | undefined;
  const cleanup = () => {
    stream.getTracks().forEach((track) => track.stop());
    source?.disconnect();
    node?.disconnect();
    node?.port.close();
    mute?.disconnect();
    if (context.state !== 'closed') void context.close().catch(() => {});
  };
  try {
    await context.audioWorklet.addModule(new URL('./pcm-capture-worklet.js', import.meta.url).href);
    source = context.createMediaStreamSource(stream);
    node = new AudioWorkletNode(context, 'terminal-pcm-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: { maxFrames: Math.round(context.sampleRate * VOICE_MAX_SECONDS) },
    });
    mute = context.createGain();
    mute.gain.value = 0;
    source.connect(node);
    node.connect(mute);
    mute.connect(context.destination);
    const chunks: Float32Array[] = [];
    let frames = 0,
      finished = false,
      cancelled = false,
      stopping = false,
      timeout: ReturnType<typeof setTimeout> | undefined;
    let resolve!: (value: Blob) => void, reject!: (reason: unknown) => void;
    const result = new Promise<Blob>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    void result.catch(() => {});
    const finish = async () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      cleanup();
      try {
        const samples = new Float32Array(frames);
        let offset = 0;
        for (const chunk of chunks) {
          samples.set(chunk, offset);
          offset += chunk.length;
        }
        chunks.length = 0;
        const blob = await voiceWave(samples, context.sampleRate);
        if (!cancelled) resolve(blob);
      } catch (error) {
        reject(error);
      }
    };
    node.port.onmessage = (event) => {
      if (finished) return;
      if (event.data.type === 'samples') {
        const chunk = event.data.samples as Float32Array;
        chunks.push(chunk);
        frames += chunk.length;
      } else if (event.data.type === 'stopped') void finish();
    };
    node.onprocessorerror = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      cleanup();
      reject(new Error('PCM capture failed'));
    };
    await context.resume();
    return {
      result,
      stop() {
        if (finished || stopping) return;
        stopping = true;
        node!.port.postMessage('stop');
        timeout = setTimeout(() => {
          void finish();
        }, 2000);
      },
      cancel() {
        cancelled = true;
        finished = true;
        clearTimeout(timeout);
        chunks.length = 0;
        cleanup();
        reject(new DOMException('Recording cancelled', 'AbortError'));
      },
    };
  } catch (error) {
    cleanup();
    throw error;
  }
}
