import { findBestMove } from './chess-engine.ts';
self.onmessage = (event: MessageEvent<{ fen: string; budget: number; id: number }>) => {
  try {
    self.postMessage({ id: event.data.id, move: findBestMove(event.data.fen, event.data.budget) });
  } catch {
    self.postMessage({ id: event.data.id, move: null });
  }
};
