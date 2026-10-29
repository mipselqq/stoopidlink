export type EntryKind = 'document' | 'audio' | 'utility';
export interface TerminalEntry {
  id: string;
  title: string;
  kind: EntryKind;
  html?: string;
  audioSrc?: string;
  module?: 'video' | 'gravity' | 'tetris' | 'flappy' | 'chess' | 'pixels' | 'voices';
  videoSrc?: string;
  actions?: { id: string; label: string }[];
}
export interface TerminalFolder {
  id: string;
  label: string;
  entries: TerminalEntry[];
}
export interface TerminalContent {
  folders: TerminalFolder[];
}
export type TerminalPhase = 'attract' | 'boot' | 'ready' | 'fallen';
export type NavigationLevel = 'folders' | 'entries' | 'content';
export interface TerminalState {
  phase: TerminalPhase;
  level: NavigationLevel;
  folderIndex: number;
  entryIndex: number;
  folderOffset: number;
  entryOffset: number;
  scroll: number;
  strikes: number;
  corrupted: boolean;
  bootStartedAt: number;
  lastHitAt: number;
  fallenAt: number;
  audioPlaying: boolean;
  audioTime: number;
  audioDuration: number;
  transitionAt: number;
}
export type TerminalAction =
  | { type: 'start' }
  | { type: 'move'; direction: -1 | 1 }
  | { type: 'select' }
  | { type: 'back' }
  | { type: 'folder'; index: number }
  | { type: 'entry'; index: number }
  | { type: 'scroll'; amount: number }
  | { type: 'folder-scroll'; amount: number }
  | { type: 'entry-scroll'; amount: number }
  | { type: 'hit' }
  | { type: 'fallen' }
  | { type: 'audio' }
  | { type: 'audio-progress'; time: number; duration: number; playing: boolean };
export type SoundEvent =
  | 'boot'
  | 'shutdown'
  | 'folderMove'
  | 'folderSelect'
  | 'entryMove'
  | 'entrySelect'
  | 'scroll'
  | 'error'
  | 'impact';
