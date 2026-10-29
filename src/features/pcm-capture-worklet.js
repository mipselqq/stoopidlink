// Runs on the audio thread. It only copies samples; its output stays silent.
class PcmCapture extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.chunk = new Float32Array(2048);
    this.used = 0;
    this.frames = 0;
    this.limit = options.processorOptions.maxFrames;
    this.stopped = false;
    this.port.onmessage = (event) => {
      if (event.data === 'stop') this.stop();
    };
  }
  flush() {
    if (!this.used) return;
    const samples = this.chunk.slice(0, this.used);
    this.port.postMessage({ type: 'samples', samples }, [samples.buffer]);
    this.used = 0;
  }
  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.flush();
    this.port.postMessage({ type: 'stopped' });
    this.port.close();
  }
  process(inputs) {
    if (this.stopped) return false;
    const channels = inputs[0];
    if (!channels?.length) return true;
    const frames = Math.min(channels[0].length, this.limit - this.frames);
    for (let i = 0; i < frames; i++) {
      let sample = 0;
      for (const channel of channels) sample += channel[i];
      this.chunk[this.used++] = sample / channels.length;
      if (this.used === this.chunk.length) this.flush();
    }
    this.frames += frames;
    if (this.frames >= this.limit) this.stop();
    return !this.stopped;
  }
}
registerProcessor('terminal-pcm-capture', PcmCapture);
