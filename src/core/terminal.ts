import { CONFIG } from './config.ts';
import type {
  TerminalAction,
  TerminalContent,
  TerminalEntry,
  TerminalState,
  SoundEvent,
} from './types.ts';

export class TerminalController extends EventTarget {
  readonly content: TerminalContent;
  state: TerminalState;
  onSound: (event: SoundEvent) => void = () => {};
  onAudio: (entry: TerminalEntry, playing: boolean) => void = () => {};
  onRecover: () => void = () => {};
  private maxScroll = 0;

  constructor(content: TerminalContent) {
    super();
    this.content = content;
    this.state = this.initial();
  }

  private initial(): TerminalState {
    return {
      phase: 'attract',
      level: 'entries',
      folderIndex: Math.min(1, this.content.folders.length - 1),
      entryIndex: 0,
      folderOffset: 0,
      entryOffset: 0,
      scroll: 0,
      strikes: 0,
      corrupted: false,
      bootStartedAt: 0,
      lastHitAt: 0,
      fallenAt: 0,
      audioPlaying: false,
      audioTime: 0,
      audioDuration: 0,
      transitionAt: 0,
    };
  }

  get folder() {
    return this.content.folders[this.state.folderIndex];
  }
  get entry() {
    return this.folder?.entries[this.state.entryIndex];
  }
  setScrollLimit(limit: number) {
    this.maxScroll = Math.max(0, limit);
    this.state.scroll = Math.min(this.state.scroll, this.maxScroll);
  }
  private changed() {
    this.dispatchEvent(new Event('change'));
  }
  private stopAudio() {
    if (this.state.audioPlaying && this.entry) this.onAudio(this.entry, false);
    this.state.audioPlaying = false;
  }
  private boot(now: number) {
    this.stopAudio();
    this.state.phase = 'boot';
    this.state.bootStartedAt = now;
    this.onSound('boot');
  }

  dispatch(action: TerminalAction, now = performance.now()) {
    const s = this.state;
    if (action.type === 'audio-progress') {
      s.audioTime = action.time;
      s.audioDuration = action.duration;
      s.audioPlaying = action.playing;
      this.changed();
      return;
    }
    if (action.type === 'fallen') {
      this.stopAudio();
      s.phase = 'fallen';
      s.fallenAt = now;
      this.changed();
      return;
    }
    if (action.type === 'hit') {
      if (s.phase === 'attract' || s.phase === 'fallen') return;
      s.strikes++;
      s.corrupted = s.strikes >= 3;
      s.lastHitAt = now;
      this.onSound('impact');
      this.boot(now);
      this.changed();
      return;
    }
    if (s.phase === 'attract') {
      if (action.type === 'start' || action.type === 'select') {
        this.boot(now);
        this.changed();
      }
      return;
    }
    if (s.phase !== 'ready') return;
    switch (action.type) {
      case 'folder':
        if (!this.content.folders[action.index]) return;
        this.changeFolder(action.index, now);
        s.level = 'entries';
        this.onSound('folderSelect');
        break;
      case 'entry':
        if (!this.folder?.entries[action.index]) return;
        this.stopAudio();
        s.entryIndex = action.index;
        s.scroll = 0;
        s.level = 'content';
        if (action.index < s.entryOffset) s.entryOffset = action.index;
        if (action.index >= s.entryOffset + 5) s.entryOffset = action.index - 4;
        s.transitionAt = now;
        this.onSound('entrySelect');
        break;
      case 'move': {
        if (s.level === 'folders') {
          const index = Math.max(
            0,
            Math.min(this.content.folders.length - 1, s.folderIndex + action.direction),
          );
          if (index !== s.folderIndex) {
            this.changeFolder(index, now);
            this.onSound('folderMove');
          }
        } else if (s.level === 'entries') {
          const index = Math.max(
            0,
            Math.min((this.folder?.entries.length ?? 1) - 1, s.entryIndex + action.direction),
          );
          if (index !== s.entryIndex) {
            this.stopAudio();
            s.entryIndex = index;
            s.scroll = 0;
            if (index < s.entryOffset) s.entryOffset = index;
            if (index >= s.entryOffset + 5) s.entryOffset = index - 4;
            s.transitionAt = now;
            this.onSound('entryMove');
          }
        } else {
          this.scrollBy(action.direction * 25);
        }
        break;
      }
      case 'select':
        if (s.level === 'folders') {
          s.level = 'entries';
          this.onSound('folderSelect');
        } else if (s.level === 'entries') {
          s.level = 'content';
          this.onSound('entrySelect');
        } else if (s.corrupted) this.onSound('error');
        else if (this.entry?.kind === 'audio') this.toggleAudio();
        else if (this.entry?.kind === 'utility') this.onSound('entrySelect');
        break;
      case 'back':
        this.stopAudio();
        if (s.level === 'content') s.level = 'entries';
        else if (s.level === 'entries') s.level = 'folders';
        else {
          s.phase = 'attract';
          this.onSound('shutdown');
        }
        break;
      case 'scroll':
        this.scrollBy(action.amount);
        break;
      case 'folder-scroll':
        s.folderOffset = Math.max(
          0,
          Math.min(
            Math.max(0, this.content.folders.length - 4),
            s.folderOffset + Math.sign(action.amount),
          ),
        );
        break;
      case 'entry-scroll':
        s.entryOffset = Math.max(
          0,
          Math.min(
            Math.max(0, (this.folder?.entries.length ?? 0) - 5),
            s.entryOffset + Math.trunc(action.amount),
          ),
        );
        break;
      case 'audio':
        if (!s.corrupted) this.toggleAudio();
        break;
    }
    this.changed();
  }

  private changeFolder(index: number, now: number) {
    this.stopAudio();
    const s = this.state;
    s.folderIndex = index;
    s.entryIndex = 0;
    s.entryOffset = 0;
    s.scroll = 0;
    s.transitionAt = now;
    s.folderOffset = Math.min(s.folderOffset, index);
    if (index >= s.folderOffset + 4) s.folderOffset = index - 3;
  }
  private scrollBy(amount: number) {
    const next = Math.max(0, Math.min(this.maxScroll, this.state.scroll + amount));
    if (next !== this.state.scroll) {
      this.state.scroll = next;
      this.onSound('scroll');
    }
  }
  private toggleAudio() {
    if (this.entry?.kind !== 'audio') return;
    this.state.audioPlaying = !this.state.audioPlaying;
    this.onAudio(this.entry, this.state.audioPlaying);
    this.onSound('entrySelect');
  }

  tick(now: number) {
    const s = this.state;
    if (
      (s.phase === 'fallen' && now - s.fallenAt >= CONFIG.timing.fallRecoveryMs) ||
      (s.corrupted &&
        s.phase !== 'fallen' &&
        now - s.lastHitAt >= CONFIG.timing.corruptionRecoveryMs)
    ) {
      this.stopAudio();
      this.state = this.initial();
      this.onRecover();
      this.boot(now);
      this.changed();
    } else if (s.phase === 'boot' && now - s.bootStartedAt >= CONFIG.timing.bootMs) {
      s.phase = 'ready';
      s.transitionAt = now;
      this.changed();
    }
  }
}
