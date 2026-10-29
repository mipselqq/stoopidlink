import { Chess, type Move, type PieceSymbol } from 'chess.js';
const VALUE: Record<PieceSymbol, number> = { p: 100, n: 320, b: 335, r: 500, q: 900, k: 20000 };
export function evaluate(chess: Chess) {
  let value = 0;
  for (const row of chess.board())
    for (const piece of row) {
      if (!piece) continue;
      const file = piece.square.charCodeAt(0) - 97,
        rank = Number(piece.square[1]) - 1,
        advance = piece.color === 'w' ? rank : 7 - rank;
      const center = 7 - (Math.abs(file - 3.5) + Math.abs(rank - 3.5));
      let bonus =
        piece.type === 'p'
          ? advance * 7
          : piece.type === 'n'
            ? center * 10
            : piece.type === 'b'
              ? center * 6
              : 0;
      if (piece.type === 'k' && advance < 2) bonus = 12;
      value += (piece.color === 'w' ? 1 : -1) * (VALUE[piece.type] + bonus);
    }
  return value * (chess.turn() === 'w' ? 1 : -1);
}
const order = (moves: Move[]) =>
  moves.sort(
    (a, b) =>
      (b.captured ? VALUE[b.captured] * 10 - VALUE[b.piece] : 0) +
      (b.promotion ? 800 : 0) -
      ((a.captured ? VALUE[a.captured] * 10 - VALUE[a.piece] : 0) + (a.promotion ? 800 : 0)),
  );
export function findBestMove(fen: string, budgetMs = 650, maxDepth = 4) {
  const chess = new Chess(fen),
    deadline = performance.now() + budgetMs;
  let nodes = 0,
    best = chess.moves({ verbose: true })[0];
  const search = (depth: number, alpha: number, beta: number, ply: number): number => {
    if ((++nodes & 127) === 0 && performance.now() > deadline) throw new Error('timeout');
    if (chess.isCheckmate()) return -100000 + ply;
    if (chess.isDraw()) return 0;
    if (depth === 0) return evaluate(chess);
    let score = -Infinity;
    for (const move of order(chess.moves({ verbose: true }))) {
      chess.move(move);
      let next: number;
      try {
        next = -search(depth - 1, -beta, -alpha, ply + 1);
      } finally {
        chess.undo();
      }
      score = Math.max(score, next);
      alpha = Math.max(alpha, next);
      if (alpha >= beta) break;
    }
    return score;
  };
  for (let depth = 1; depth <= maxDepth; depth++) {
    let iterationBest = best,
      score = -Infinity,
      alpha = -Infinity;
    try {
      const moves = order(chess.moves({ verbose: true }));
      if (best) moves.sort((a, b) => Number(b.lan === best.lan) - Number(a.lan === best.lan));
      for (const move of moves) {
        chess.move(move);
        let next: number;
        try {
          next = -search(depth - 1, -Infinity, -alpha, 1);
        } finally {
          chess.undo();
        }
        if (next > score) {
          score = next;
          iterationBest = move;
        }
        alpha = Math.max(alpha, next);
      }
      best = iterationBest;
    } catch {
      break;
    }
  }
  return best ? { from: best.from, to: best.to, promotion: best.promotion } : null;
}
