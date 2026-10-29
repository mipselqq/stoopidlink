type SoundEvent =
  | 'boot'
  | 'shutdown'
  | 'folderMove'
  | 'folderSelect'
  | 'entryMove'
  | 'entrySelect'
  | 'scroll'
  | 'error'
  | 'impact';
const asset = (path: string) => `${import.meta.env?.BASE_URL ?? './'}assets/${path}`;

const files: Record<SoundEvent, string[]> = {
  boot: ['boot.ogg'],
  shutdown: ['shutdown.ogg'],
  folderMove: ['folder-move.ogg'],
  folderSelect: ['folder-select.ogg', 'folder-select-2.ogg'],
  entryMove: ['document-move.ogg'],
  entrySelect: [
    'document-select.ogg',
    'document-select-2.ogg',
    'document-select-3.ogg',
    'document-select-4.ogg',
  ],
  scroll: ['document-move.ogg'],
  error: ['light-flash.ogg'],
  impact: ['impact.ogg'],
};

export class TerminalAudio {
  private sounds = new Map<string, HTMLAudioElement[]>();
  private context?: AudioContext;
  private idle?: AudioBufferSourceNode;
  private idleGain?: GainNode;
  private idleLoad?: Promise<void>;
  private idleRequest = new AbortController();
  private disposed = false;
  private syncIdlePlayback = () => {
    if (!this.context || this.disposed) return;
    const change = document.hidden ? this.context.suspend() : this.context.resume();
    void change.catch(() => {});
  };
  constructor() {
    document.addEventListener('visibilitychange', this.syncIdlePlayback);
  }
  unlock() {
    if (this.disposed || typeof AudioContext === 'undefined') return;
    this.context ??= new AudioContext();
    this.syncIdlePlayback();
    if (!this.idle && !this.idleLoad) {
      this.idleLoad = this.loadIdle(this.context)
        .catch(() => {})
        .finally(() => {
          this.idleLoad = undefined;
        });
    }
  }
  private async loadIdle(context: AudioContext) {
    const response = await fetch(asset('audio/idle.ogg'), { signal: this.idleRequest.signal });
    if (!response.ok) throw new Error(`Idle audio: HTTP ${response.status}`);
    const buffer = await context.decodeAudioData(await response.arrayBuffer());
    if (this.disposed) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    // Loop the unchanged decoded samples on the audio clock, without media-element gaps.
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = buffer.duration;
    gain.gain.value = 0.24;
    source.connect(gain);
    gain.connect(context.destination);
    this.idle = source;
    this.idleGain = gain;
    source.start();
  }
  play(event: SoundEvent) {
    if (this.disposed) return;
    this.unlock();
    const choices = files[event];
    const file = choices[Math.floor(Math.random() * choices.length)];
    let pool = this.sounds.get(file);
    if (!pool) {
      pool = [new Audio(asset(`audio/${file}`))];
      this.sounds.set(file, pool);
    }
    const sound = pool.find((audio) => audio.paused || audio.ended) ?? pool[0];
    sound.currentTime = 0;
    sound.volume = event === 'impact' ? 0.8 : 0.42;
    void sound.play().catch(() => {});
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    document.removeEventListener('visibilitychange', this.syncIdlePlayback);
    this.idleRequest.abort();
    this.idle?.stop();
    this.idle?.disconnect();
    this.idleGain?.disconnect();
    void this.context?.close().catch(() => {});
    for (const pool of this.sounds.values()) for (const sound of pool) sound.pause();
  }
}
